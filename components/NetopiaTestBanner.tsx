"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Afișează banner „Mod Test” când Netopia e în mod Sandbox.
 * Se afișează peste tot pe site când e modul de test.
 */
export default function NetopiaTestBanner() {
  const [testMode, setTestMode] = useState<boolean | null>(null);
  const hasFreshModeRef = useRef(false);
  const staleRetryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadMode = useCallback(() => {
    fetch("/api/netopia/mode")
      .then((res) => res.json())
      .then((data) => {
        const nextTestMode = data?.testMode === true;
        const isStale = data?.stale === true;

        if (!isStale) {
          hasFreshModeRef.current = true;
          setTestMode(nextTestMode);
          return;
        }

        if (!hasFreshModeRef.current) {
          setTestMode(nextTestMode);
        }

        if (!staleRetryTimerRef.current) {
          staleRetryTimerRef.current = setTimeout(() => {
            staleRetryTimerRef.current = null;
            void loadMode();
          }, 2500);
        }
      })
      .catch(() => setTestMode(false));
  }, []);

  useEffect(() => {
    void loadMode();
    return () => {
      if (staleRetryTimerRef.current) {
        clearTimeout(staleRetryTimerRef.current);
      }
    };
  }, [loadMode]);

  if (testMode !== true) return null;

  return (
    <div className="sticky top-0 z-[100] flex items-center justify-center gap-2 py-2 px-4 bg-amber-500 text-amber-950 text-sm font-semibold shadow-lg">
      <span className="w-2.5 h-2.5 rounded-full bg-amber-900 animate-pulse" />
      MOD TEST NETOPIA – Plățile sunt simulate (Sandbox). Nu se procesează plăți reale.
    </div>
  );
}
