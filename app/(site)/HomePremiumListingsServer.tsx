import Image from "next/image";
import Link from "next/link";
import { getHomePremiumListings } from "@/lib/server/home/getHomePremiumListings";
import { CDN_IMAGE_SIZES_GRID } from "@/lib/image/cdn";
import { PieseAutoMarcaInlineSpan } from "@/components/piese-auto/PieseAutoMarcaBadges";

/**
 * Server Component: premium listings block for homepage.
 * Fetches and caches 4 premium items; renders static cards (no client interactivity).
 * Favorite toggle can be added later via a lazy client overlay if needed.
 */
export default async function HomePremiumListingsServer() {
  const items = await getHomePremiumListings();
  if (items.length === 0) return null;

  return (
    <section className="pt-0 sm:pt-1 md:pt-2 pb-8 sm:pb-12 md:pb-16 bg-gray-50/50 dark:bg-transparent">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
        <div className="text-left mb-4 sm:mb-8 md:mb-12">
          <h2 className="text-xl sm:text-2xl md:text-4xl font-bold bg-gradient-to-r from-gray-900 via-gray-800 to-gray-900 dark:from-white dark:via-gray-100 dark:to-gray-200 bg-clip-text text-transparent">
            Licitații Premium
          </h2>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 px-1 md:px-0 md:gap-2 lg:gap-3">
          {items.slice(0, 4).map((auction) => (
            <Link
              key={auction.id}
              href={auction.url}
              className="group backdrop-blur-lg rounded-xl shadow-xl overflow-hidden transition-all duration-300 border hover:shadow-2xl bg-white dark:bg-white/10 border-gray-200 dark:border-white/20"
            >
              <div className="relative h-48 md:h-64 border border-white dark:border-gray-600">
                <Image
                  src={auction.image}
                  alt=""
                  fill
                  unoptimized
                  sizes={CDN_IMAGE_SIZES_GRID}
                  className="object-cover object-center"
                  loading="lazy"
                />
                <div className="absolute top-1 left-1 md:top-2 md:left-2 flex flex-col gap-1">
                  <PieseAutoMarcaInlineSpan listing={auction} />
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-extrabold tracking-wide text-white shadow-lg border border-yellow-300/50 bg-gradient-to-r from-yellow-500 via-amber-500 to-orange-500">
                    PREMIUM
                  </span>
                </div>
              </div>
              <div className="p-2 sm:p-3">
                <h3 className="text-xs sm:text-sm md:text-base font-semibold line-clamp-2 text-black dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400">
                  {auction.title}
                </h3>
                <p className="mt-0.5 sm:mt-1 text-[10px] sm:text-xs text-gray-600 dark:text-gray-400 truncate">
                  {auction.location}
                </p>
                <p className="mt-0.5 sm:mt-1 text-[10px] sm:text-xs md:text-sm font-semibold text-gray-900 dark:text-white">
                  {auction.price}
                </p>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
