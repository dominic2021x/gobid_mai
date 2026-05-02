/**
 * Finalizare cumpărare tokeni după Netopia (callback GET sau IPN).
 * Idempotent: dacă plata e deja completed, nu adaugă din nou tokeni.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export function levelFromPackageName(packageName: string): { level: string; packageType: string } {
  switch (packageName) {
    case 'Basic':
      return { level: 'Basic', packageType: 'Basic' };
    case 'Standard':
      return { level: 'Standard', packageType: 'Standard' };
    case 'Pro':
      return { level: 'Pro', packageType: 'Pro' };
    case 'Enterprise':
      return { level: 'Enterprise', packageType: 'Enterprise' };
    default:
      return { level: 'Basic', packageType: 'Basic' };
  }
}

export type FulfillTokensResult =
  | { ok: true; tokensAdded?: number }
  | { ok: false; code: string };

export async function fulfillTokenPurchaseByIntentId(
  supabase: SupabaseClient,
  intentId: string
): Promise<FulfillTokensResult> {
  const { data: payment, error: paymentError } = await supabase
    .from('user_payments')
    .select('*')
    .eq('metadata->>payment_intent_id', intentId)
    .single();

  if (paymentError || !payment) {
    return { ok: false, code: 'payment_not_found' };
  }

  const meta = payment.metadata as Record<string, unknown>;
  if (meta.status === 'completed') {
    return { ok: true };
  }

  const packageName = String(meta.package_name || 'Basic');
  const tokensToAdd = Number(meta.tokens) || 0;
  const amountNum = Number(meta.amount) || 0;
  const userId = payment.user_id as string | undefined;

  if (!userId || tokensToAdd <= 0) {
    return { ok: false, code: 'invalid_payment_data' };
  }

  const { data: existing } = await supabase
    .from('user_tokens')
    .select('balance, total_earned, total_spent, level, package_type, user_email')
    .eq('user_id', userId)
    .maybeSingle();

  const currentBalance = Number(existing?.balance) || 0;
  const currentTotalEarned = Number(existing?.total_earned) || 0;
  const { level, packageType } = levelFromPackageName(packageName);

  let userEmail = (existing?.user_email as string) || '';
  if (!userEmail) {
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('email')
      .eq('user_id', userId)
      .maybeSingle();
    userEmail = (profile?.email as string) || '';
  }

  const { error: updateError } = await supabase
    .from('user_tokens')
    .upsert(
      {
        user_id: userId,
        user_email: userEmail || 'unknown@gobid.ro',
        balance: currentBalance + tokensToAdd,
        total_earned: currentTotalEarned + tokensToAdd,
        total_spent: existing?.total_spent ?? 0,
        level,
        package_type: packageType,
      },
      { onConflict: 'user_id' }
    )
    .select()
    .single();

  if (updateError) {
    console.error('[fulfillTokenPurchaseByIntentId] user_tokens upsert:', updateError);
    return { ok: false, code: 'update_failed' };
  }

  await supabase
    .from('user_payments')
    .update({
      amount: amountNum,
      metadata: {
        ...meta,
        status: 'completed',
        completed_at: new Date().toISOString(),
      },
    })
    .eq('id', payment.id);

  return { ok: true, tokensAdded: tokensToAdd };
}
