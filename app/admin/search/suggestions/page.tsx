"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Controlls for suggestion regeneration and ranking are integrated in /admin/ai-search.
 * This page redirects there so old links keep working.
 */
export default function AdminSearchSuggestionsPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/admin/ai-search");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-4 flex items-center justify-center text-slate-600 dark:text-slate-400">
      Redirecționare către AI Search…
    </div>
  );
}
