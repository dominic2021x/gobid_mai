"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Geo Lab is in /admin/ai-search (tab Geo Lab).
 */
export default function AdminSearchGeoLabPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/admin/ai-search?tab=geo");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4 text-slate-600">
      Redirecționare către AI Search (Geo Lab)…
    </div>
  );
}
