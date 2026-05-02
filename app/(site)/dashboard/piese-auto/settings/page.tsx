"use client";

import { useLayoutEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { usePieseAutoTheme } from "../PieseAutoThemeContext";

export default function PieseAutoSettingsPage() {
  const router = useRouter();
  const { isDarkMode } = usePieseAutoTheme();

  useLayoutEffect(() => {
    router.replace("/dashboard/settings?context=piese-auto");
  }, [router]);

  return (
    <div className={`rounded-xl p-6 ${isDarkMode ? "bg-gray-800/80 border border-gray-700" : "bg-white border border-gray-200"}`}>
      <p className={`text-sm ${isDarkMode ? "text-gray-300" : "text-gray-600"}`}>
        Se redirecționează la Setări…
      </p>
      <Link
        href="/dashboard/settings?context=piese-auto"
        className={`mt-3 inline-block text-sm font-medium ${isDarkMode ? "text-amber-400 hover:text-amber-300" : "text-amber-600 hover:text-amber-700"}`}
      >
        Mergi la Setări
      </Link>
    </div>
  );
}
