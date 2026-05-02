"use client";

import Script from "next/script";
import { useEffect, useState } from "react";
import { readConsent } from "@/lib/cookie-consent";

function getAdsId(): string | null {
  const legacy = process.env.NEXT_PUBLIC_GOOGLE_ADS_ID;
  if (legacy) return legacy;
  const sendTo =
    process.env.NEXT_PUBLIC_GADS_SENDTO_SIGNUP ||
    process.env.NEXT_PUBLIC_GADS_SENDTO_LISTING ||
    process.env.NEXT_PUBLIC_GADS_SENDTO_BID;
  return sendTo?.split("/")[0] ?? null;
}

const ADS_ID = getAdsId();

/**
 * Loads gtag for public routes only după consimțământ marketing.
 * Mount only in app/(site)/layout.tsx (excludes /admin/*).
 */
export default function GoogleAdsScript() {
  const [allowMarketing, setAllowMarketing] = useState(false);

  useEffect(() => {
    const sync = () => {
      const c = readConsent();
      setAllowMarketing(c?.marketing === true);
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

  if (!ADS_ID || !allowMarketing) return null;

  return (
    <>
      <Script id="gtag-init" strategy="afterInteractive">
        {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          gtag('js', new Date());
          gtag('config', '${ADS_ID}');
        `}
      </Script>
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${ADS_ID}`}
        strategy="afterInteractive"
      />
    </>
  );
}
