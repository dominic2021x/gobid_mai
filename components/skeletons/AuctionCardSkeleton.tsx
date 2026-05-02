import React from "react";

interface AuctionCardSkeletonProps {
  viewMode?: "grid" | "list";
  /** @deprecated ignorat — tema din `globals.css` + html.dark */
  isDarkMode?: boolean;
}

/**
 * Skeleton pentru carduri /ro. Culori pe `html.dark` în CSS (nu Tailwind `dark:` pe noduri)
 * ca să nu apară erori de hidratare când <html> diferă între SSR și client.
 */
const AuctionCardSkeleton: React.FC<AuctionCardSkeletonProps> = ({ viewMode = "grid" }) => {
  const c = "auction-card-skeleton-chip";
  return (
    <div
      className={`auction-card-skeleton-root ${
        viewMode === "list" ? "flex flex-col md:flex-row" : ""
      }`}
    >
      <div
        className={`auction-card-skeleton-image ${
          viewMode === "list" ? "h-32 flex-shrink-0 md:h-48 md:w-64" : "h-32 md:h-48"
        }`}
      >
        <div className="skeleton-shimmer absolute inset-0" />
        <div className="absolute left-2 top-2 z-10 md:left-4 md:top-4">
          <div className={`${c} relative h-5 w-16 rounded md:h-6 md:w-20`}>
            <div className="skeleton-shimmer absolute inset-0" />
          </div>
        </div>

        <div className="absolute right-2 top-2 z-10 flex space-x-1 md:right-4 md:top-4 md:space-x-2">
          <div className={`${c} relative h-8 w-8 rounded-full md:h-10 md:w-10`}>
            <div className="skeleton-shimmer absolute inset-0" />
          </div>
          <div className={`${c} relative h-8 w-8 rounded-lg md:h-10 md:w-10`}>
            <div className="skeleton-shimmer absolute inset-0" />
          </div>
        </div>

        <div className="absolute bottom-2 left-2 z-10 md:bottom-4 md:left-4">
          <div className={`${c} relative mb-1 h-4 w-20 rounded md:h-5 md:w-24`}>
            <div className="skeleton-shimmer absolute inset-0" />
          </div>
          <div className={`${c} relative h-5 w-24 rounded md:h-6 md:w-32`}>
            <div className="skeleton-shimmer absolute inset-0" />
          </div>
        </div>
      </div>

      <div className={viewMode === "list" ? "flex-1 p-4 md:p-6" : "p-3 md:p-6"}>
        <div className="mb-1 md:mb-2">
          <div className={`${c} relative mb-2 h-5 w-3/4 rounded md:h-6`}>
            <div className="skeleton-shimmer absolute inset-0" />
          </div>
          <div className={`${c} relative h-4 w-1/2 rounded`}>
            <div className="skeleton-shimmer absolute inset-0" />
          </div>
        </div>

        <div
          className={`${
            viewMode === "list"
              ? "mb-2 flex flex-col space-y-1 md:mb-4 md:flex-row md:items-start md:justify-between md:space-x-6 md:space-y-2"
              : "mb-2 space-y-1 md:mb-4 md:space-y-2"
          } hidden md:block`}
        >
          <div className={`${c} relative h-4 w-32 rounded`}>
            <div className="skeleton-shimmer absolute inset-0" />
          </div>
          <div className={`${c} relative h-4 w-28 rounded`}>
            <div className="skeleton-shimmer absolute inset-0" />
          </div>
        </div>

        <div className="auction-card-skeleton-price">
          <div className="flex flex-col space-y-2 md:flex-row md:items-center md:justify-between md:space-y-0">
            <div className={`${c} relative h-4 w-24 rounded`}>
              <div className="skeleton-shimmer absolute inset-0" />
            </div>
            <div className="flex items-center gap-2 md:gap-3">
              <div className={`${c} relative h-6 w-12 rounded md:h-7 md:w-14`}>
                <div className="skeleton-shimmer absolute inset-0" />
              </div>
              <div className={`${c} relative h-6 w-12 rounded-full md:h-7 md:w-14`}>
                <div className="skeleton-shimmer absolute inset-0" />
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <div className="space-y-2">
            <div className={`${c} relative h-3 w-full rounded`}>
              <div className="skeleton-shimmer absolute inset-0" />
            </div>
            <div className={`${c} relative h-3 w-5/6 rounded`}>
              <div className="skeleton-shimmer absolute inset-0" />
            </div>
            <div className={`${c} relative h-3 w-4/6 rounded`}>
              <div className="skeleton-shimmer absolute inset-0" />
            </div>
          </div>

          <div className="space-y-1 text-xs md:text-sm">
            <div className={`${c} relative h-3 w-full rounded`}>
              <div className="skeleton-shimmer absolute inset-0" />
            </div>
            <div className={`${c} relative h-3 w-3/4 rounded`}>
              <div className="skeleton-shimmer absolute inset-0" />
            </div>
          </div>

          <div className="pt-2">
            <div className={`${c} relative h-10 w-full rounded-lg md:h-12`}>
              <div className="skeleton-shimmer absolute inset-0" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AuctionCardSkeleton;
