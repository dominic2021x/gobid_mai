import React from 'react';

interface AuctionDetailsSkeletonProps {
  /** @deprecated Theme follows `html.dark` via Tailwind `dark:` — prop ignored */
  isDarkMode?: boolean;
  /**
   * `true`: doar zona de conținut (grid), fără shell full-page și fără skeleton de header —
   * pentru pagini care afișează deja UniversalHeader deasupra (ex. /live_bid/[slug] la încărcare).
   */
  contentOnly?: boolean;
}

/**
 * Skeleton loader pentru pagina de detaliu licitație
 * Replică structura paginii de detaliu pentru a evita layout shift
 */
const AuctionDetailsSkeleton: React.FC<AuctionDetailsSkeletonProps> = ({ contentOnly = false }) => {
  const bar = 'relative overflow-hidden bg-gray-300 dark:bg-gray-600';
  const gridShellClass = contentOnly
    ? 'max-w-7xl mx-auto px-4 py-4 md:py-6 pb-24 md:pb-6'
    : 'container mx-auto px-4 py-6 md:py-8';
  const mainGrid = (
      <div className={gridShellClass}>
        <div className="grid grid-cols-1 gap-6 md:gap-8 lg:grid-cols-3">
          {/* Left Column - Images & Details */}
          <div className="space-y-6 lg:col-span-2">
            {/* Image Gallery Skeleton */}
            <div className="relative overflow-hidden rounded-2xl bg-gray-200 dark:bg-gray-700">
              <div className="aspect-square w-full"></div>
              <div className="absolute inset-0 skeleton-shimmer"></div>
            </div>

            {/* Thumbnail Images Skeleton */}
            <div className="grid grid-cols-4 gap-2">
              {Array.from({ length: 4 }).map((_, index) => (
                <div
                  key={`thumb-${index}`}
                  className="relative aspect-square overflow-hidden rounded-lg bg-gray-200 dark:bg-gray-700"
                >
                  <div className="absolute inset-0 skeleton-shimmer"></div>
                </div>
              ))}
            </div>

            {/* Description Section Skeleton */}
            <div className="rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
              <div className={`relative mb-4 h-8 w-1/3 overflow-hidden rounded ${bar}`}>
                <div className="absolute inset-0 skeleton-shimmer"></div>
              </div>
              <div className="space-y-3">
                {Array.from({ length: 6 }).map((_, index) => (
                  <div
                    key={`desc-${index}`}
                    className={`relative h-4 overflow-hidden rounded ${
                      index === 5 ? 'w-3/4' : 'w-full'
                    } ${bar}`}
                  >
                    <div className="absolute inset-0 skeleton-shimmer"></div>
                  </div>
                ))}
              </div>
            </div>

            {/* Details Section Skeleton */}
            <div className="rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
              <div className={`relative mb-4 h-8 w-1/4 overflow-hidden rounded ${bar}`}>
                <div className="absolute inset-0 skeleton-shimmer"></div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                {Array.from({ length: 6 }).map((_, index) => (
                  <div key={`detail-${index}`} className="space-y-2">
                    <div className={`relative h-3 w-20 overflow-hidden rounded ${bar}`}>
                      <div className="absolute inset-0 skeleton-shimmer"></div>
                    </div>
                    <div className={`relative h-4 w-32 overflow-hidden rounded ${bar}`}>
                      <div className="absolute inset-0 skeleton-shimmer"></div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Right Column - Bid Panel */}
          <div className="lg:col-span-1">
            <div className="sticky top-24 rounded-2xl border border-gray-200 bg-white p-6 shadow-xl dark:border-gray-700 dark:bg-gray-800">
              {/* Title Skeleton */}
              <div className={`relative mb-4 h-6 w-2/3 overflow-hidden rounded ${bar}`}>
                <div className="absolute inset-0 skeleton-shimmer"></div>
              </div>

              {/* Current Bid Skeleton */}
              <div className="mb-6">
                <div className={`relative mb-2 h-4 w-24 overflow-hidden rounded ${bar}`}>
                  <div className="absolute inset-0 skeleton-shimmer"></div>
                </div>
                <div className={`relative h-10 w-full overflow-hidden rounded ${bar}`}>
                  <div className="absolute inset-0 skeleton-shimmer"></div>
                </div>
              </div>

              {/* Time Left Skeleton */}
              <div className="mb-6">
                <div className={`relative mb-2 h-4 w-20 overflow-hidden rounded ${bar}`}>
                  <div className="absolute inset-0 skeleton-shimmer"></div>
                </div>
                <div className={`relative h-8 w-full overflow-hidden rounded ${bar}`}>
                  <div className="absolute inset-0 skeleton-shimmer"></div>
                </div>
              </div>

              {/* Bid Input Skeleton */}
              <div className="mb-6">
                <div className={`relative mb-2 h-4 w-28 overflow-hidden rounded ${bar}`}>
                  <div className="absolute inset-0 skeleton-shimmer"></div>
                </div>
                <div className={`relative h-12 w-full overflow-hidden rounded-lg ${bar}`}>
                  <div className="absolute inset-0 skeleton-shimmer"></div>
                </div>
              </div>

              {/* Bid Button Skeleton */}
              <div className={`relative mb-4 h-12 w-full overflow-hidden rounded-lg ${bar}`}>
                <div className="absolute inset-0 skeleton-shimmer"></div>
              </div>

              {/* Seller Info Skeleton */}
              <div className="border-t border-gray-200 pt-4 dark:border-gray-700">
                <div className="mb-3 flex items-center gap-3">
                  <div className={`relative h-12 w-12 overflow-hidden rounded-full ${bar}`}>
                    <div className="absolute inset-0 skeleton-shimmer"></div>
                  </div>
                  <div className="flex-1">
                    <div className={`relative mb-2 h-4 w-32 overflow-hidden rounded ${bar}`}>
                      <div className="absolute inset-0 skeleton-shimmer"></div>
                    </div>
                    <div className={`relative h-3 w-24 overflow-hidden rounded ${bar}`}>
                      <div className="absolute inset-0 skeleton-shimmer"></div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
  );

  if (contentOnly) {
    return <div className="min-h-[70vh]">{mainGrid}</div>;
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      {/* Header Skeleton */}
      <div className="sticky top-0 z-40 border-b border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className={`h-8 w-32 rounded ${bar}`}>
              <div className="absolute inset-0 skeleton-shimmer"></div>
            </div>
            <div className="flex items-center gap-2">
              <div className={`h-8 w-8 rounded-full ${bar}`}>
                <div className="absolute inset-0 skeleton-shimmer"></div>
              </div>
              <div className={`h-8 w-8 rounded-full ${bar}`}>
                <div className="absolute inset-0 skeleton-shimmer"></div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {mainGrid}
    </div>
  );
};

export default AuctionDetailsSkeleton;
