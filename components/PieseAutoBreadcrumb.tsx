"use client";

import Link from "next/link";

type Props = {
  current: string;
  isDarkMode?: boolean;
};

export default function PieseAutoBreadcrumb({ current, isDarkMode = false }: Props) {
  return (
    <div
      className={`mb-4 rounded-xl px-4 py-3 border ${
        isDarkMode ? "bg-amber-500/10 border-amber-400/20" : "bg-amber-50 border-amber-200"
      }`}
    >
      <nav className="flex items-center gap-1.5 text-sm">
        <Link
          href="/dashboard/piese-auto"
          className={`font-medium transition-colors ${
            isDarkMode ? "text-amber-400 hover:text-amber-300" : "text-amber-700 hover:text-amber-800"
          }`}
        >
          Piese Auto
        </Link>
        <span className={isDarkMode ? "text-gray-500" : "text-gray-400"}>/</span>
        <span className={isDarkMode ? "text-white font-medium" : "text-gray-900 font-medium"}>
          {current}
        </span>
      </nav>
    </div>
  );
}
