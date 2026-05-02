"use client";

import { useState } from "react";
import dynamic from "next/dynamic";

const HeroSearchBar = dynamic(
  () => import("@/app/components/HeroSearchBar").then((m) => m.default),
  { ssr: false, loading: () => <HomeSearchLauncherSkeleton /> }
);

function HomeSearchLauncherSkeleton() {
  return (
    <div className="w-full max-w-lg rounded-full border border-gray-300 dark:border-white/50 py-2.5 px-4 bg-gray-100/80 dark:bg-white/10 animate-pulse">
      <span className="text-sm text-gray-500 dark:text-gray-400">Căutare rapidă...</span>
    </div>
  );
}

export type HomeSearchLauncherClientProps = {
  isDarkMode?: boolean;
  /** When provided, personal suggestions will be used after launcher expands. */
  accessToken?: string | null;
};

/**
 * Minimal client: shows a search trigger. On click, loads full HeroSearchBar (dynamic) to reduce initial bundle.
 */
export default function HomeSearchLauncherClient({
  isDarkMode = false,
  accessToken = null,
}: HomeSearchLauncherClientProps) {
  const [expanded, setExpanded] = useState(false);

  if (expanded) {
    return (
      <div className="w-full max-w-lg">
        <HeroSearchBar
          isDarkMode={isDarkMode}
          variant="standalone"
          className="w-full max-w-lg"
          useRoSuggestions
          accessToken={accessToken}
        />
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setExpanded(true)}
      className={`w-full max-w-lg rounded-full border py-2.5 px-4 text-left text-sm font-medium transition-all ${
        isDarkMode
          ? "border-white/50 text-white/80 hover:bg-white/10 backdrop-blur-sm"
          : "border-gray-300 text-gray-700 hover:bg-gray-50 backdrop-blur-sm"
      }`}
      aria-label="Deschide căutarea"
    >
      Căutare rapidă...
    </button>
  );
}
