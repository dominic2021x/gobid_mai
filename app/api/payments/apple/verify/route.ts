import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { supabaseAdmin } from '@/lib/supabase';
import { getRequestAuthUser } from '@/lib/auth/getRequestAuthUser';
import { APPLE_PRODUCT_MAP, type AppleProductId } from '@/lib/payments/apple/product-map';
import { applyCreditTopup } from '@/lib/payments/credit/applyCreditTopup';
import { applyAppleTokenTopup } from '@/lib/payments/tokens/applyAppleTokenTopup';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';
export const revalidate = 0;

const LEGACY_PREMIUM_PRODUCT_IDS = [
  'gobid.premium.listing.7d',
  'gobid.premium.listing.30d',
  'ro.gobid.promovare1',
  'ro.gobid.promovare2',
] as const;

const verifySchema = z.object({
  receipt: z.string().min(10),
  productId: z.string().min(1),
});

const legacyVerifySchema = z.object({
  appleProductId: z.enum(LEGACY_PREMIUM_PRODUCT_IDS),
  productDbId: z.string().uuid(),
  receiptData: z.string().min(10),
  transactionPayload: z
    .object({
      transactionId: z.string().optional(),
      originalTransactionId: z.string().optional(),
      productId: z.string().optional(),
      transactionDate: z.string().optional(),
    })
    .optional(),
});

type AppleReceiptLine = {
  product_id?: string;
  transaction_id?: string;
  original_transaction_id?: string;
  purchase_date_ms?: string;
};

type AppleVerifyPayload = {
  status?: number;
  environment?: string;
  latest_receipt_info?: AppleReceiptLine[];
  receipt?: {
    in_app?: AppleReceiptLine[];
  };
};

type VerifyApiError =
  | 'invalid_payload'
  | 'unauthorized'
  | 'invalid_product'
  | 'apple_verify_failed'
  | 'transaction_already_processed'
  | 'credit_apply_failed'
  | 'token_apply_failed';

function jsonError(error: VerifyApiError, status: number, details?: string) {
  return NextResponse.json(
    {
      success: false,
      error,
      ...(details ? { details } : {}),
    },
    { status }
  );
}

function getSupabaseAdmin() {
  if (!supabaseAdmin) {
    throw new Error('Supabase admin client not configured.');
  }
  return supabaseAdmin;
}

async function getAuthenticatedUserId(request: NextRequest): Promise<string | null> {
  const user = await getRequestAuthUser(request);
  return user?.id ?? null;
}

async function appleVerifyRequest(url: string, payload: Record<string, unknown>) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
      cache: 'no-store',
    });
    return (await response.json().catch(() => ({}))) as AppleVerifyPayload;
  } finally {
    clearTimeout(timeout);
  }
}

async function verifyWithApple(
  receipt: string
): Promise<{ payload: AppleVerifyPayload; environment: 'production' | 'sandbox' }> {
  const password = process.env.APPLE_IAP_SHARED_SECRET;
  if (!password) {
    throw new Error('APPLE_IAP_SHARED_SECRET is not configured');
  }

  const requestPayload = {
    'receipt-data': receipt,
    password,
    'exclude-old-transactions': false,
  };

  const production = await appleVerifyRequest('https://buy.itunes.apple.com/verifyReceipt', requestPayload);
  if (production.status === 21007) {
    const sandbox = await appleVerifyRequest('https://sandbox.itunes.apple.com/verifyReceipt', requestPayload);
    return { payload: sandbox, environment: 'sandbox' };
  }

  return { payload: production, environment: 'production' };
}

function resolveTransactionFromReceipt(
  payload: AppleVerifyPayload,
  requestedProductId: string
): AppleReceiptLine | null {
  const lines = [...(payload.latest_receipt_info ?? []), ...(payload.receipt?.in_app ?? [])];
  if (lines.length === 0) return null;

  for (let i = lines.length - 1; i >= 0; i -= 1) {
    if (lines[i]?.product_id === requestedProductId) {
      return lines[i] ?? null;
    }
  }
  return null;
}

function premiumDaysForProduct(productId: string): number | null {
  if (productId === 'gobid.premium.listing.7d' || productId === 'ro.gobid.promovare1') return 7;
  if (productId === 'gobid.premium.listing.30d' || productId === 'ro.gobid.promovare2') return 30;
  return null;
}

async function handleLegacyPremiumFlow(userId: string, payload: z.infer<typeof legacyVerifySchema>) {
  const supabase = getSupabaseAdmin();
  const { appleProductId, productDbId, receiptData, transactionPayload } = payload;
  const premiumDays = premiumDaysForProduct(appleProductId);
  if (!premiumDays) return jsonError('invalid_product', 400);

  const verified = await verifyWithApple(receiptData);
  if (!verified.payload || verified.payload.status !== 0) {
    return jsonError('apple_verify_failed', 400, `status=${String(verified.payload?.status ?? 'unknown')}`);
  }

  const matching = resolveTransactionFromReceipt(verified.payload, appleProductId);
  if (!matching) return jsonError('apple_verify_failed', 400, 'No matching premium transaction');

  const transactionId = matching.transaction_id || transactionPayload?.transactionId || null;
  if (!transactionId) return jsonError('apple_verify_failed', 400, 'Missing transaction_id');

  const { data: listing, error: listingError } = await supabase
    .from('products')
    .select('id, user_id, is_premium, premium_until')
    .eq('id', productDbId)
    .eq('user_id', userId)
    .single();

  if (listingError || !listing) {
    return NextResponse.json({ error: 'Listing-ul nu există sau nu aparține utilizatorului' }, { status: 403 });
  }

  const { data: existingTx } = await supabase
    .from('apple_iap_receipts')
    .select('id')
    .eq('transaction_id', transactionId)
    .maybeSingle();

  if (existingTx) {
    return NextResponse.json({ success: true, idempotent: true }, { status: 200 });
  }

  const now = new Date();
  const existingEnd = listing.premium_until ? new Date(String(listing.premium_until)) : null;
  const startsAt = existingEnd && existingEnd.getTime() > now.getTime() ? existingEnd : now;
  const endsAt = new Date(startsAt.getTime() + premiumDays * 24 * 60 * 60 * 1000);

  const { error: receiptInsertError } = await supabase.from('apple_iap_receipts').insert({
    user_id: userId,
    listing_id: productDbId,
    transaction_id: transactionId,
    original_transaction_id: matching.original_transaction_id || transactionPayload?.originalTransactionId || null,
    product_id: appleProductId,
    raw_response: verified.payload,
    source: 'apple_ios',
  });

  if (receiptInsertError && receiptInsertError.code !== '23505') {
    return NextResponse.json({ error: 'Nu s-a putut salva chitanța' }, { status: 500 });
  }

  await supabase
    .from('products')
    .update({
      is_premium: true,
      premium_until: endsAt.toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', productDbId)
    .eq('user_id', userId);

  await supabase.from('listing_premium_events').insert({
    listing_id: productDbId,
    user_id: userId,
    source: 'apple_iap',
    source_transaction_id: transactionId,
    premium_days: premiumDays,
    starts_at: startsAt.toISOString(),
    ends_at: endsAt.toISOString(),
  });

  return NextResponse.json(
    {
      success: true,
      premium: {
        listingId: productDbId,
        premiumUntil: endsAt.toISOString(),
        premiumDays,
      },
    },
    { status: 200 }
  );
}

export async function POST(request: NextRequest) {
  try {
    const userId = await getAuthenticatedUserId(request);
    if (!userId) {
      return jsonError('unauthorized', 401);
    }

    const rawBody = await request.json().catch(() => null);
    if (!rawBody) return jsonError('invalid_payload', 400);

    const legacyParsed = legacyVerifySchema.safeParse(rawBody);
    if (legacyParsed.success) {
      return handleLegacyPremiumFlow(userId, legacyParsed.data);
    }

    const parsed = verifySchema.safeParse(rawBody);
    if (!parsed.success) {
      return jsonError('invalid_payload', 400);
    }

    const { receipt, productId } = parsed.data;
    const internalProduct = APPLE_PRODUCT_MAP[productId as AppleProductId];
    if (!internalProduct) {
      return jsonError('invalid_product', 400);
    }

    const verified = await verifyWithApple(receipt);
    if (!verified.payload || verified.payload.status !== 0) {
      return jsonError('apple_verify_failed', 400, `status=${String(verified.payload?.status ?? 'unknown')}`);
    }

    const receiptTx = resolveTransactionFromReceipt(verified.payload, productId);
    if (!receiptTx?.transaction_id || !receiptTx.product_id) {
      return jsonError('apple_verify_failed', 400, 'Missing transaction data in Apple receipt');
    }

    if (receiptTx.product_id !== productId) {
      return jsonError('invalid_product', 400, 'Receipt product mismatch');
    }

    if (internalProduct.kind === 'token') {
      const applied = await applyAppleTokenTopup({
        userId,
        transactionId: receiptTx.transaction_id,
        originalTransactionId: receiptTx.original_transaction_id ?? null,
        productId,
        tokensAmount: internalProduct.amount,
        packageName: internalProduct.packageName,
        environment: verified.environment,
        rawResponse: verified.payload as unknown as Record<string, unknown>,
      });

      if (!applied.ok) {
        return jsonError('token_apply_failed', 500, applied.error);
      }

      if (!applied.applied) {
        return NextResponse.json(
          {
            success: true,
            idempotent: true,
            error: 'transaction_already_processed',
            code: 'transaction_already_processed',
            productId,
            tokensAdded: internalProduct.amount,
          },
          { status: 200 }
        );
      }

      return NextResponse.json(
        {
          success: true,
          idempotent: false,
          productId,
          tokensAdded: applied.tokensAdded,
          transactionId: applied.transactionId,
          environment: verified.environment,
        },
        { status: 200 }
      );
    }

    const applied = await applyCreditTopup({
      userId,
      transactionId: receiptTx.transaction_id,
      originalTransactionId: receiptTx.original_transaction_id ?? null,
      productId,
      productKind: 'credit',
      creditedAmount: internalProduct.amount,
      environment: verified.environment,
      rawResponse: verified.payload as unknown as Record<string, unknown>,
    });

    if (!applied.ok) {
      return jsonError('credit_apply_failed', 500, applied.error);
    }

    if (!applied.applied) {
      return NextResponse.json(
        {
          success: true,
          idempotent: true,
          error: 'transaction_already_processed',
          code: 'transaction_already_processed',
          productId,
          creditedAmount: internalProduct.amount,
        },
        { status: 200 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        idempotent: false,
        productId,
        creditedAmount: applied.creditedAmount,
        transactionId: applied.transactionId,
        environment: verified.environment,
      },
      { status: 200 }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown verify error';
    return jsonError('apple_verify_failed', 500, message);
  }
}
