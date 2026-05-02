"use client";

import Image from "next/image";
import { HOME_CATEGORY_ITEMS, type HomeCategoryItem } from "@/lib/data/home-categories";

export interface HomeCategoriesSectionProps {
  isDarkMode: boolean;
}

function CategoryCard({
  category,
  index,
  isDarkMode,
  isMobile,
}: {
  category: HomeCategoryItem;
  index: number;
  isDarkMode: boolean;
  isMobile: boolean;
}) {
  const isDisabled = category.href === null;
  const content = (
    <div className={`relative flex flex-col items-center text-center transition-transform duration-200 group-hover:scale-105 ${isMobile ? "gap-1 sm:gap-1.5" : "gap-1.5"}`}>
      <div
        className={`relative overflow-hidden rounded-full shadow-md ${
          isMobile ? "h-12 w-12 sm:h-14 sm:w-14" : "h-14 w-14 xl:h-16 xl:w-16"
        } ${isDisabled ? "cursor-not-allowed opacity-70 grayscale" : ""}`}
      >
        {category.image ? (
          <Image
            src={category.image}
            alt={category.name}
            fill
            sizes={isMobile ? "(max-width: 640px) 56px, 64px" : "(min-width: 1024px) 64px, 72px"}
            className="object-cover"
            priority={index < 8}
          />
        ) : (
          <div
            className={`flex h-full w-full items-center justify-center bg-gradient-to-br text-lg sm:text-xl text-white ${
              category.gradient ?? "from-blue-500 via-blue-500 to-blue-500"
            }`}
          >
            <span>{category.fallbackEmoji ?? "✨"}</span>
          </div>
        )}
        {isDisabled && <div className="absolute inset-0 rounded-full bg-black/45 backdrop-blur-sm" />}
      </div>
      <h3
        className={`font-semibold leading-tight line-clamp-2 transition-colors ${
          isMobile ? "text-[0.6rem] sm:text-[0.65rem]" : "text-[0.65rem] xl:text-xs"
        } ${isDarkMode ? "text-white group-hover:text-blue-200" : "text-gray-800 group-hover:text-blue-600"} ${isDisabled ? "opacity-75" : ""}`}
      >
        {category.name}
      </h3>
    </div>
  );
  if (isDisabled) {
    return (
      <div key={`${category.name}-${isMobile ? "mobile" : "desktop"}`} className="group flex flex-col items-center">
        {content}
      </div>
    );
  }
  return (
    <a key={`${category.name}-${isMobile ? "mobile" : "desktop"}`} href={category.href!} className="group flex flex-col items-center">
      {content}
    </a>
  );
}

/**
 * Lazy-loaded categories block. Receives only theme; category data from shared lib.
 * Intentionally lazy: below-the-fold, reduces initial JS; no SEO content that must be in first paint.
 */
export function HomeCategoriesSection({ isDarkMode }: HomeCategoriesSectionProps) {
  return (
    <section
      className={`pt-4 sm:pt-5 pb-6 transition-all duration-300 ${isDarkMode ? "" : "bg-white/50"}`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-left mb-4">
          <h2
            className={`text-xl sm:text-2xl md:text-3xl font-bold transition-colors duration-300 ${
              isDarkMode
                ? "bg-gradient-to-r from-white via-gray-100 to-gray-200 bg-clip-text text-transparent"
                : "bg-gradient-to-r from-gray-900 via-gray-800 to-gray-900 bg-clip-text text-transparent"
            }`}
          >
            Categorii Populare
          </h2>
        </div>
        <div className="grid grid-cols-4 sm:grid-cols-5 gap-2 sm:gap-3 lg:hidden">
          {HOME_CATEGORY_ITEMS.map((category, index) => (
            <CategoryCard
              key={`m-${category.name}`}
              category={category}
              index={index}
              isDarkMode={isDarkMode}
              isMobile
            />
          ))}
        </div>
        <div className="hidden lg:grid lg:grid-cols-8 xl:grid-cols-8 gap-3 xl:gap-4 justify-items-center">
          {HOME_CATEGORY_ITEMS.map((category, index) => (
            <CategoryCard
              key={`d-${category.name}`}
              category={category}
              index={index}
              isDarkMode={isDarkMode}
              isMobile={false}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
