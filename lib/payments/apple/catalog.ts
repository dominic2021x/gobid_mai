import {
  APPLE_PRODUCT_IDS,
  APPLE_PRODUCT_MAP,
  type AppleCreditProductId,
  type AppleProductId,
} from '@/lib/payments/apple/product-map';

export type AppleCatalogItem = {
  productId: AppleCreditProductId;
  kind: 'credit';
  amount: number;
  label: string;
  popular: boolean;
  sortOrder: number;
};

const POPULAR_PRODUCT_ID: AppleCreditProductId = 'ro.gobid.credit100';

function isAppleCreditProductId(id: AppleProductId): id is AppleCreditProductId {
  return APPLE_PRODUCT_MAP[id].kind === 'credit';
}

export function getAppleCatalog(): AppleCatalogItem[] {
  return APPLE_PRODUCT_IDS
    .filter(isAppleCreditProductId)
    .map((productId): AppleCatalogItem => {
      const product = APPLE_PRODUCT_MAP[productId];
      return {
        productId,
        kind: 'credit',
        amount: product.amount,
        label: `${product.amount} credite`,
        popular: productId === POPULAR_PRODUCT_ID,
        sortOrder: product.amount,
      };
    })
    .sort((a, b) => a.sortOrder - b.sortOrder);
}
