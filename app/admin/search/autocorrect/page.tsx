"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Autocorrect analytics live in /admin/ai-search (tab Autocorrect).
 * Redirect so old links work.
 */
export default function AdminSearchAutocorrectPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/admin/ai-search?tab=autocorrect");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4 text-slate-600">
      Redirecționare către AI Search (Autocorrect)…
    </div>
  );
}
