import { registerPlugin } from '@capacitor/core';
import { getIapAuthContext } from '@/lib/auth/getIapAuthContext';

export type ApplePremiumProductId =
  | 'gobid.premium.listing.7d'
  | 'gobid.premium.listing.30d'
  | 'ro.gobid.promovare1'
  | 'ro.gobid.promovare2';

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

export type StartApplePurchaseResult =
  | { ok: true; premiumUntil?: string | null; premiumDays?: number }
  | { ok: false; message: string; cancelled?: boolean };

export async function startApplePurchase(
  appleProductId: ApplePremiumProductId,
  productDbId: string
): Promise<StartApplePurchaseResult> {
  try {
    const { accessToken, userId } = await getIapAuthContext();

    if (!accessToken && !userId) {
      return { ok: false, message: 'Sesiune invalidă. Reautentifică-te.' };
    }

    const { products } = await StoreKit.getProducts({ productIds: [appleProductId] });
    if (!products?.some((p) => p.productId === appleProductId)) {
      return { ok: false, message: 'Produs Apple IAP indisponibil.' };
    }

    const { purchase } = await StoreKit.purchase({ productId: appleProductId });
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
        appleProductId,
        productDbId,
        receiptData: purchase.receipt,
        transactionPayload: {
          transactionId: purchase.transactionId,
          originalTransactionId: purchase.originalTransactionId,
          productId: purchase.productId,
          transactionDate: purchase.transactionDate,
        },
      }),
    });

    const payload = (await verifyRes.json().catch(() => ({}))) as {
      success?: boolean;
      error?: string;
      message?: string;
      premium?: { premiumUntil?: string; premiumDays?: number };
    };

    if (!verifyRes.ok || !payload.success) {
      return {
        ok: false,
        message: payload.error || payload.message || 'Verificarea Apple IAP a eșuat.',
      };
    }

    return {
      ok: true,
      premiumUntil: payload.premium?.premiumUntil ?? null,
      premiumDays: payload.premium?.premiumDays,
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    const cancelled = /cancel|aborted|user/i.test(msg);
    return {
      ok: false,
      message: cancelled ? 'Achiziție anulată.' : 'Eroare la Apple In-App Purchase.',
      cancelled,
    };
  }
}

