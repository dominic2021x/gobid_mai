"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Pagina de listare licitații publice (Executări).
 * Redirecționează la /ro cu filtrare pe categoria Executări.
 */
export default function LicitatiiPublicePage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/ro?category=executari");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
      <div className="animate-pulse text-gray-500 dark:text-gray-400">
        Se încarcă licitațiile publice...
      </div>
    </div>
  );
}
