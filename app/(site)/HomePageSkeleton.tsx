import React from "react";

/**
 * Skeleton for home page streaming (Suspense fallback).
 * Hero is server-rendered (HomeHero), so we only show below-the-fold placeholders.
 */
export default function HomePageSkeleton() {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Section title */}
        <div className="h-6 w-48 bg-gray-200 dark:bg-gray-700 rounded-lg animate-pulse mb-6" />
        {/* Premium grid placeholder */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="rounded-xl overflow-hidden bg-gray-200/80 dark:bg-gray-700/80 animate-pulse aspect-[3/4]"
            />
          ))}
        </div>
        <div className="h-6 w-40 bg-gray-200 dark:bg-gray-700 rounded-lg animate-pulse mt-10 mb-6" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="rounded-xl overflow-hidden bg-gray-200/80 dark:bg-gray-700/80 animate-pulse aspect-[3/4]"
            />
          ))}
        </div>
      </div>
    </div>
  );
}
