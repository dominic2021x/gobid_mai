"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Search Intelligence is in /admin/ai-search (tab Intelligence).
 */
export default function SearchIntelligencePage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/admin/ai-search?tab=intelligence");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4 text-slate-600">
      Redirecționare către AI Search (Intelligence)…
    </div>
  );
}
