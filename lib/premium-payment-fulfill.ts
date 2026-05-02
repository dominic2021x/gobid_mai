/**
 * Finalizare plată premium după Netopia (callback GET sau IPN).
 * Idempotent dacă metadata.status === 'completed'.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export type FulfillPremiumResult = { ok: true } | { ok: false; code: string };

export async function fulfillPremiumByIntentId(
  supabase: SupabaseClient,
  intentId: string
): Promise<FulfillPremiumResult> {
  const { data: payment, error: paymentError } = await supabase
    .from('user_payments')
    .select('*')
    .eq('metadata->>payment_intent_id', intentId)
    .single();

  if (paymentError || !payment) {
    return { ok: false, code: 'payment_not_found' };
  }

  const metadata = payment.metadata as Record<string, unknown>;
  if (metadata.status === 'completed') {
    return { ok: true };
  }

  const productId = metadata.product_id as string | undefined;
  const weeks = Number(metadata.weeks);

  if (!productId || !weeks) {
    return { ok: false, code: 'invalid_payment_data' };
  }

  const now = new Date();
  const premiumUntil = new Date(now.getTime() + weeks * 7 * 24 * 60 * 60 * 1000);

  const { error: updateError } = await supabase
    .from('products')
    .update({
      premium_until: premiumUntil.toISOString(),
      is_premium: true,
      updated_at: new Date().toISOString(),
    })
    .eq('id', productId);

  if (updateError) {
    console.error('[fulfillPremiumByIntentId] products update:', updateError);
    return { ok: false, code: 'update_failed' };
  }

  await supabase
    .from('user_payments')
    .update({
      metadata: {
        ...metadata,
        premium_until: premiumUntil.toISOString(),
        completed_at: new Date().toISOString(),
        status: 'completed',
      },
    })
    .eq('id', payment.id);

  return { ok: true };
}
