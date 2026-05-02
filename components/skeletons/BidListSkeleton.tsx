import React from 'react';

interface BidListSkeletonProps {
  count?: number;
  /** @deprecated Culorile urmează `html.dark` */
  isDarkMode?: boolean;
}

const chip = 'bg-gray-300 dark:bg-gray-600';

/**
 * Skeleton loader pentru lista de oferte — aliniat la dark mode prin Tailwind `dark:`
 */
const BidListSkeleton: React.FC<BidListSkeletonProps> = ({ count = 5 }) => {
  return (
    <div className="space-y-3 sm:space-y-4">
      {Array.from({ length: count }).map((_, index) => (
        <div
          key={`bid-skeleton-${index}`}
          className="p-4 sm:p-5 rounded-xl border-2 border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800/50"
        >
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 sm:gap-4">
            <div className="flex-1 space-y-2">
              <div className={`h-6 w-32 rounded relative overflow-hidden ${chip}`}>
                <div className="absolute inset-0 skeleton-shimmer"></div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <div className={`h-5 w-20 rounded-full relative overflow-hidden ${chip}`}>
                  <div className="absolute inset-0 skeleton-shimmer"></div>
                </div>
                <div className={`h-4 w-24 rounded relative overflow-hidden ${chip}`}>
                  <div className="absolute inset-0 skeleton-shimmer"></div>
                </div>
                <div className={`h-4 w-20 rounded relative overflow-hidden ${chip}`}>
                  <div className="absolute inset-0 skeleton-shimmer"></div>
                </div>
              </div>
            </div>

            <div className="flex-shrink-0">
              <div className={`h-6 w-24 rounded-md relative overflow-hidden ${chip}`}>
                <div className="absolute inset-0 skeleton-shimmer"></div>
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

export default BidListSkeleton;
