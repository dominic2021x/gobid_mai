import { supabaseAdmin } from '@/lib/supabase';
import { levelFromPackageName } from '@/lib/tokens-payment-fulfill';

export type ApplyAppleTokenTopupInput = {
  userId: string;
  transactionId: string;
  originalTransactionId: string | null;
  productId: string;
  tokensAmount: number;
  packageName: string;
  environment: 'production' | 'sandbox';
  rawResponse: Record<string, unknown>;
};

export type ApplyAppleTokenTopupResult =
  | { ok: true; applied: true; tokensAdded: number; transactionId: string }
  | { ok: true; applied: false; tokensAdded: 0; transactionId: string }
  | { ok: false; error: string };

export async function applyAppleTokenTopup(input: ApplyAppleTokenTopupInput): Promise<ApplyAppleTokenTopupResult> {
  if (!supabaseAdmin) {
    return { ok: false, error: 'Supabase admin client not configured.' };
  }

  if (!input.tokensAmount || input.tokensAmount <= 0) {
    return { ok: false, error: 'tokensAmount must be > 0' };
  }

  const { error: txError } = await supabaseAdmin.from('apple_transactions').insert({
    user_id: input.userId,
    transaction_id: input.transactionId,
    original_transaction_id: input.originalTransactionId,
    product_id: input.productId,
    product_kind: 'token',
    credited_amount: input.tokensAmount,
    environment: input.environment,
    raw_response: input.rawResponse,
  });

  if (txError) {
    if (txError.code === '23505') {
      return { ok: true, applied: false, tokensAdded: 0, transactionId: input.transactionId };
    }
    return { ok: false, error: txError.message };
  }

  const { data: existing } = await supabaseAdmin
    .from('user_tokens')
    .select('balance, total_earned, total_spent, level, package_type, user_email')
    .eq('user_id', input.userId)
    .maybeSingle();

  const currentBalance = Number(existing?.balance) || 0;
  const currentTotalEarned = Number(existing?.total_earned) || 0;
  const { level, packageType } = levelFromPackageName(input.packageName);

  let userEmail = (existing?.user_email as string) || '';
  if (!userEmail) {
    const { data: profile } = await supabaseAdmin
      .from('user_profiles')
      .select('email')
      .eq('user_id', input.userId)
      .maybeSingle();
    userEmail = (profile?.email as string) || '';
  }

  const { error: updateError } = await supabaseAdmin
    .from('user_tokens')
    .upsert(
      {
        user_id: input.userId,
        user_email: userEmail || 'unknown@gobid.ro',
        balance: currentBalance + input.tokensAmount,
        total_earned: currentTotalEarned + input.tokensAmount,
        total_spent: existing?.total_spent ?? 0,
        level,
        package_type: packageType,
      },
      { onConflict: 'user_id' }
    );

  if (updateError) {
    return { ok: false, error: updateError.message };
  }

  await supabaseAdmin.from('user_payments').insert({
    user_id: input.userId,
    amount: 0,
    currency: 'RON',
    payment_type: 'tokens_purchase',
    description: `Apple IAP — ${input.tokensAmount} tokeni (${input.productId})`,
    metadata: {
      payment_method: 'apple_iap',
      product_id: input.productId,
      transaction_id: input.transactionId,
      original_transaction_id: input.originalTransactionId,
      environment: input.environment,
      tokens: input.tokensAmount,
      package_name: input.packageName,
    },
  });

  const today = new Date().toISOString().split('T')[0];
  await supabaseAdmin.from('token_transactions').insert({
    user_id: input.userId,
    user_email: userEmail || 'unknown@gobid.ro',
    transaction_id: `IAP-${input.transactionId}`,
    type: 'purchase',
    amount: 0,
    status: 'completed',
    date: today,
    description: `Cumpărare tokens — Apple IAP (${input.tokensAmount} tokeni)`,
    payment_method: 'Apple IAP',
    tokens_received: input.tokensAmount,
  });

  return {
    ok: true,
    applied: true,
    tokensAdded: input.tokensAmount,
    transactionId: input.transactionId,
  };
}
