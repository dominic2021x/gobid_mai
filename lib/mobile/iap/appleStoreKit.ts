import { registerPlugin } from '@capacitor/core';
import { getIapAuthContext } from '@/lib/auth/getIapAuthContext';

export interface AppleProduct {
  productId: string;
  price: string;
  localizedPrice: string;
  localizedTitle: string;
  localizedDescription: string;
}

export interface ApplePurchase {
  transactionId: string;
  productId: string;
  transactionDate: string;
  receipt: string;
  originalTransactionId?: string;
}

export interface VerifyReceiptResponse {
  success: boolean;
  tokensAdded?: number;
  premiumActivated?: boolean;
  message?: string;
}

export interface StoreKitPlugin {
  getProducts(options: { productIds: string[] }): Promise<{ products: AppleProduct[] }>;
  purchase(options: { productId: string }): Promise<{ purchase?: ApplePurchase }>;
  restorePurchases(): Promise<{ purchases: ApplePurchase[] }>;
}

export const StoreKit = registerPlugin<StoreKitPlugin>('StoreKit');

export function isNativeIos(): boolean {
  if (typeof window === 'undefined') return false;
  const cap = (window as unknown as { Capacitor?: { getPlatform?: () => string } }).Capacitor;
  const platform = cap?.getPlatform?.();
  return platform === 'ios';
}

export async function verifyAppleReceiptOnServer(
  receipt: string,
  productId: string,
  extra?: { intentId?: string; productDbId?: string; platform?: string }
): Promise<VerifyReceiptResponse> {
  try {
    const { accessToken, userId } = await getIapAuthContext();
    const res = await fetch('/api/payments/apple/verify', {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...(userId ? { 'x-user-id': userId } : {}),
      },
      body: JSON.stringify({
        receipt,
        productId,
        intentId: extra?.intentId,
        productDbId: extra?.productDbId,
        platform: extra?.platform ?? 'ios',
      }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      return {
        success: false,
        message: text || 'Eroare la verificarea plății cu Apple.',
      };
    }

    return (await res.json()) as VerifyReceiptResponse;
  } catch (error) {
    console.error('[Apple IAP] verifyAppleReceiptOnServer error:', error);
    return {
      success: false,
      message: 'Eroare de rețea la verificarea plății cu Apple.',
    };
  }
}

