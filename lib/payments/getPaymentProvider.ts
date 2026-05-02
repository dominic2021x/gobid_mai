import { isNativeCapacitorIos } from '@/lib/platform/isIosApp';

export type PaymentProvider = 'apple_iap' | 'netopia';

export function getPaymentProvider(): PaymentProvider {
  return isNativeCapacitorIos() ? 'apple_iap' : 'netopia';
}

