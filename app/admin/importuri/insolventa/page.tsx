"use client";

/**
 * Redirect: Insolvență -> Licitatii publice
 * Modulul de import din proceduri de insolvență (licitatii-insolventa.ro) este la /admin/importuri/licitatii-publice
 */

import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function InsolventaImportPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/admin/importuri/licitatii-publice");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
      <p className="text-gray-500 dark:text-gray-400">Redirecționare către Licitatii publice...</p>
    </div>
  );
}
