import { registerPlugin } from '@capacitor/core';
import { getIapAuthContext } from '@/lib/auth/getIapAuthContext';
import type { AppleCreditProductId } from '@/lib/payments/apple/product-map';

type StoreProduct = {
  productId: string;
};

type StorePurchase = {
  transactionId?: string;
  originalTransactionId?: string;
  productId?: string;
  transactionDate?: string;
  receipt?: string;
};

type StoreKitPlugin = {
  getProducts(options: { productIds: string[] }): Promise<{ products: StoreProduct[] }>;
  purchase(options: { productId: string }): Promise<{ purchase?: StorePurchase }>;
};

const StoreKit = registerPlugin<StoreKitPlugin>('StoreKit');

export type StartAppleCreditPurchaseResult =
  | { ok: true; creditedAmount: number; idempotent?: boolean }
  | { ok: false; message: string; cancelled?: boolean };

export async function startAppleCreditPurchase(
  productId: AppleCreditProductId,
  fallbackUserId?: string | null
): Promise<StartAppleCreditPurchaseResult> {
  try {
    const { accessToken, userId } = await getIapAuthContext(fallbackUserId);

    if (!accessToken && !userId) {
      return { ok: false, message: 'Sesiune invalidă. Reautentifică-te.' };
    }

    const { products } = await StoreKit.getProducts({ productIds: [productId] });
    if (!products?.some((p) => p.productId === productId)) {
      return { ok: false, message: 'Pachetul selectat nu este disponibil.' };
    }

    const { purchase } = await StoreKit.purchase({ productId });
    if (!purchase?.receipt) {
      return { ok: false, message: 'Achiziția nu a returnat chitanță.', cancelled: true };
    }

    const verifyRes = await fetch('/api/payments/apple/verify', {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...(userId ? { 'x-user-id': userId } : {}),
      },
      body: JSON.stringify({
        receipt: purchase.receipt,
        productId,
      }),
    });

    const payload = (await verifyRes.json().catch(() => ({}))) as {
      success?: boolean;
      error?: string;
      details?: string;
      creditedAmount?: number;
      idempotent?: boolean;
    };

    if (!verifyRes.ok || !payload.success) {
      return {
        ok: false,
        message: payload.error || payload.details || 'Verificarea plății a eșuat.',
      };
    }

    return {
      ok: true,
      creditedAmount: Number(payload.creditedAmount || 0),
      idempotent: Boolean(payload.idempotent),
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    const cancelled = /cancel|aborted|user/i.test(msg);
    return {
      ok: false,
      message: cancelled ? 'Achiziție anulată.' : 'Eroare la procesarea achiziției.',
      cancelled,
    };
  }
}
