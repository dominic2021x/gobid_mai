import { supabaseAdmin } from '@/lib/supabase';

export type ApplyCreditTopupInput = {
  userId: string;
  transactionId: string;
  originalTransactionId: string | null;
  productId: string;
  productKind: 'credit';
  creditedAmount: number;
  environment: 'production' | 'sandbox';
  rawResponse: Record<string, unknown>;
};

export type ApplyCreditTopupResult =
  | { ok: true; applied: true; creditedAmount: number; transactionId: string }
  | { ok: true; applied: false; creditedAmount: 0; transactionId: string }
  | { ok: false; error: string };

export async function applyCreditTopup(input: ApplyCreditTopupInput): Promise<ApplyCreditTopupResult> {
  if (!supabaseAdmin) {
    return { ok: false, error: 'Supabase admin client not configured.' };
  }

  const { data, error } = await supabaseAdmin.rpc('apply_apple_credit_topup', {
    p_user_id: input.userId,
    p_transaction_id: input.transactionId,
    p_original_transaction_id: input.originalTransactionId,
    p_product_id: input.productId,
    p_product_kind: input.productKind,
    p_credited_amount: input.creditedAmount,
    p_environment: input.environment,
    p_raw_response: input.rawResponse,
  });

  if (error) {
    return { ok: false, error: error.message };
  }

  const row = Array.isArray(data) ? data[0] : null;
  if (!row) {
    return { ok: false, error: 'Empty RPC response.' };
  }

  const applied = Boolean((row as { applied?: boolean }).applied);
  const creditedAmount = Number((row as { credited_amount?: number }).credited_amount || 0);
  const transactionId = String((row as { transaction_id?: string }).transaction_id || input.transactionId);

  if (!applied) {
    return { ok: true, applied: false, creditedAmount: 0, transactionId };
  }

  return { ok: true, applied: true, creditedAmount, transactionId };
}
