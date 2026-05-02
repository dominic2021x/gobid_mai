/**
 * Product IDs must match exactly App Store Connect (In-App Purchases).
 * Credits: ro.gobid.credit10 … credit500
 * Tokens: ro.gobid.token50, token100, token250
 * Premium listing duration uses the legacy verify payload (see apple/verify): ro.gobid.promovare1 (weekly), promovare2 (monthly).
 */
export const APPLE_PRODUCT_MAP = {
  'ro.gobid.credit10': {
    productId: 'ro.gobid.credit10',
    kind: 'credit',
    amount: 10,
    platform: 'ios',
  },
  'ro.gobid.credit25': {
    productId: 'ro.gobid.credit25',
    kind: 'credit',
    amount: 25,
    platform: 'ios',
  },
  'ro.gobid.credit50': {
    productId: 'ro.gobid.credit50',
    kind: 'credit',
    amount: 50,
    platform: 'ios',
  },
  'ro.gobid.credit100': {
    productId: 'ro.gobid.credit100',
    kind: 'credit',
    amount: 100,
    platform: 'ios',
  },
  'ro.gobid.credit200': {
    productId: 'ro.gobid.credit200',
    kind: 'credit',
    amount: 200,
    platform: 'ios',
  },
  'ro.gobid.credit500': {
    productId: 'ro.gobid.credit500',
    kind: 'credit',
    amount: 500,
    platform: 'ios',
  },
  'ro.gobid.token50': {
    productId: 'ro.gobid.token50',
    kind: 'token',
    amount: 50,
    platform: 'ios',
    packageName: 'Standard',
  },
  'ro.gobid.token100': {
    productId: 'ro.gobid.token100',
    kind: 'token',
    amount: 100,
    platform: 'ios',
    packageName: 'Pro',
  },
  'ro.gobid.token250': {
    productId: 'ro.gobid.token250',
    kind: 'token',
    amount: 250,
    platform: 'ios',
    packageName: 'Enterprise',
  },
} as const;

export type AppleProductId = keyof typeof APPLE_PRODUCT_MAP;
export type AppleProductMeta = (typeof APPLE_PRODUCT_MAP)[AppleProductId];

export const APPLE_PRODUCT_IDS = Object.keys(APPLE_PRODUCT_MAP) as AppleProductId[];

export type AppleCreditProductId = {
  [K in AppleProductId]: (typeof APPLE_PRODUCT_MAP)[K]['kind'] extends 'credit' ? K : never;
}[AppleProductId];

export type AppleTokenProductId = {
  [K in AppleProductId]: (typeof APPLE_PRODUCT_MAP)[K]['kind'] extends 'token' ? K : never;
}[AppleProductId];

export function appleTokenProductIdForTokenCount(count: number): AppleTokenProductId | null {
  if (count === 50) return 'ro.gobid.token50';
  if (count === 100) return 'ro.gobid.token100';
  if (count === 250) return 'ro.gobid.token250';
  return null;
}
