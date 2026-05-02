"use client";

import { useEffect, useState } from "react";
import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { readConsent } from "@/lib/cookie-consent";

/**
 * Loads Vercel Analytics and SpeedInsights only after analytics consent,
 * and after idle time to reduce TBT (when allowed).
 */
export default function DeferredAnalytics() {
  const [allowAnalytics, setAllowAnalytics] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const sync = () => {
      const c = readConsent();
      setAllowAnalytics(c?.analytics === true);
    };
    sync();
    const onChange = () => sync();
    window.addEventListener("gobid-consent-changed", onChange);
    window.addEventListener("storage", onChange);
    return () => {
      window.removeEventListener("gobid-consent-changed", onChange);
      window.removeEventListener("storage", onChange);
    };
  }, []);

  useEffect(() => {
    if (!allowAnalytics) return;
    const run = () => setMounted(true);
    if (typeof requestIdleCallback !== "undefined") {
      requestIdleCallback(run, { timeout: 3500 });
    } else {
      setTimeout(run, 2000);
    }
  }, [allowAnalytics]);

  if (!mounted || !allowAnalytics) return null;
  return (
    <>
      <Analytics />
      <SpeedInsights />
    </>
  );
}
