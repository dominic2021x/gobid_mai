import React from 'react';
import AuctionCardSkeleton from './AuctionCardSkeleton';

interface AuctionListSkeletonProps {
  count?: number;
  viewMode?: 'grid' | 'list';
  /** @deprecated Ignorat — tema urmează `html.dark` */
  isDarkMode?: boolean;
}

/**
 * Skeleton loader pentru listele de licitații
 * Afișează mai multe carduri skeleton pentru a replica layout-ul final
 */
const AuctionListSkeleton: React.FC<AuctionListSkeletonProps> = ({
  count = 6,
  viewMode = 'grid',
}) => {
  return (
    <div className={`${viewMode === 'grid' ? 'grid grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4 lg:gap-6' : 'space-y-6'}`}>
      {Array.from({ length: count }).map((_, index) => (
        <AuctionCardSkeleton key={`skeleton-${index}`} viewMode={viewMode} />
      ))}
    </div>
  );
};

export default AuctionListSkeleton;
