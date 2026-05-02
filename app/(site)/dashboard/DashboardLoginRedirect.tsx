"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

const REDIRECT_DELAY_MS = 48;

type Props = {
  /** Full URL for router.replace (e.g. /auth?mode=login&redirect=...) */
  href: string;
  /** If set, written to localStorage authRedirect before navigation */
  returnPath?: string;
};

/**
 * Isolated redirect: no router calls from the main auth gate effect.
 * Single flight + short delay reduces flicker and fights with middleware cookie refresh.
 */
export function DashboardLoginRedirect({ href, returnPath }: Props) {
  const router = useRouter();
  const routerRef = useRef(router);
  routerRef.current = router;

  const didRedirectRef = useRef(false);

  useEffect(() => {
    if (didRedirectRef.current) return;
    didRedirectRef.current = true;

    if (returnPath && typeof window !== "undefined") {
      try {
        localStorage.setItem("authRedirect", returnPath);
      } catch {
        /* ignore quota / private mode */
      }
    }

    if (typeof window === "undefined") return;

    const id = window.setTimeout(() => {
      routerRef.current.replace(href);
    }, REDIRECT_DELAY_MS);

    return () => {
      window.clearTimeout(id);
    };
  }, [href, returnPath]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900">
      <div className="text-center">
        <div className="inline-block animate-spin rounded-full h-10 w-10 border-4 border-blue-500 border-t-transparent" />
        <p className="mt-4 text-gray-400">Redirecționare către autentificare…</p>
      </div>
    </div>
  );
}
