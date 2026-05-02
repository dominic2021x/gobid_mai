"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Pattern Engine tools are in /admin/ai-search (tab Pattern Engine).
 * Redirect so old links work.
 */
export default function AdminSearchPatternsPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/admin/ai-search?tab=pattern");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4 text-slate-600">
      Redirecționare către AI Search (Pattern Engine)…
    </div>
  );
}
