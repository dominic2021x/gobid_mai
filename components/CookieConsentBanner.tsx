"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { hasConsentRecord, writeConsent } from "@/lib/cookie-consent";

/**
 * Banner prima vizită: înregistrează preferințe înainte de încărcarea scripturilor analitice / marketing.
 */
export default function CookieConsentBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    setVisible(!hasConsentRecord());
  }, []);

  if (!visible) return null;

  return (
    <div
      role="dialog"
      aria-modal="false"
      aria-labelledby="cookie-consent-title"
      className="fixed inset-x-0 bottom-0 z-[110] border-t border-slate-200/80 bg-white/95 px-4 py-4 shadow-[0_-8px_30px_rgba(15,23,42,0.12)] backdrop-blur-md supports-[backdrop-filter]:bg-white/90 dark:border-white/10 dark:bg-slate-900/95 dark:supports-[backdrop-filter]:bg-slate-900/90"
      style={{ paddingBottom: "calc(1rem + env(safe-area-inset-bottom, 0px))" }}
    >
      <div className="mx-auto flex max-w-4xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
        <div className="min-w-0 flex-1 text-sm text-slate-700 dark:text-slate-200">
          <p id="cookie-consent-title" className="font-semibold text-slate-900 dark:text-white">
            Cookie-uri și confidențialitate
          </p>
          <p className="mt-1 leading-relaxed text-slate-600 dark:text-slate-300">
            Folosim tehnologii necesare pentru funcționarea site-ului. Cu acordul dvs. putem activa și
            măsurători de trafic (Vercel Analytics) și, separat, instrumente de publicitate (Google).{" "}
            <Link
              href="/legal/politica-cookies"
              className="font-medium text-blue-600 underline decoration-blue-600/30 underline-offset-2 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
            >
              Politica cookie-uri
            </Link>
            .
          </p>
        </div>
        <div className="flex shrink-0 flex-col gap-2 sm:flex-row sm:items-center">
          <button
            type="button"
            className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 shadow-sm transition hover:bg-slate-50 dark:border-white/20 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
            onClick={() => {
              writeConsent({ analytics: false, marketing: false });
              setVisible(false);
            }}
          >
            Doar esențiale
          </button>
          <button
            type="button"
            className="rounded-xl bg-gradient-to-b from-blue-600 to-blue-700 px-4 py-2.5 text-sm font-semibold text-white shadow-md shadow-blue-600/25 transition hover:from-blue-700 hover:to-blue-800"
            onClick={() => {
              writeConsent({ analytics: true, marketing: true });
              setVisible(false);
            }}
          >
            Acceptă tot
          </button>
        </div>
      </div>
    </div>
  );
}
