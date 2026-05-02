'use client';

import type { AppleCatalogItem } from '@/lib/payments/apple/catalog';
import type { AppleCreditProductId } from '@/lib/payments/apple/product-map';

type Props = {
  isDarkMode: boolean;
  bundles: AppleCatalogItem[];
  isLoading: boolean;
  loadingProductId: AppleCreditProductId | null;
  onPurchase: (bundle: AppleCatalogItem) => Promise<void> | void;
};

export default function AppleCreditBundles({
  isDarkMode,
  bundles,
  isLoading,
  loadingProductId,
  onPurchase,
}: Props) {
  return (
    <div>
      <label
        className={`block text-sm font-medium mb-3 transition-colors ${
          isDarkMode ? 'text-gray-300' : 'text-gray-700'
        }`}
      >
        Alege pachetul de credite
      </label>
      <div className="grid grid-cols-2 gap-3">
        {bundles.map((bundle) => {
          const isLoadingBundle = loadingProductId === bundle.productId;
          return (
            <button
              key={bundle.productId}
              type="button"
              onClick={() => void onPurchase(bundle)}
              disabled={isLoading}
              className={`p-4 rounded-xl border-2 transition-all text-left ${
                isDarkMode
                  ? 'border-2 border-gray-600 bg-gray-800 hover:border-gray-500 hover:shadow-lg'
                  : 'border-2 border-gray-300 bg-white hover:border-black/50 hover:shadow-md'
              } ${isLoading ? 'opacity-80 cursor-not-allowed' : ''}`}
            >
              <div
                className={`font-semibold text-lg transition-colors ${
                  isDarkMode ? 'text-white' : 'text-gray-900'
                }`}
              >
                {bundle.amount} credite
              </div>
              {isLoadingBundle && (
                <div
                  className={`text-sm mt-1 transition-colors ${
                    isDarkMode ? 'text-gray-300' : 'text-gray-600'
                  }`}
                >
                  Se proceseaza...
                </div>
              )}
              {bundle.popular && (
                <div className="text-xs text-yellow-500 font-semibold mt-1">Popular</div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
