/**
 * Preferințe consimțământ cookie (localStorage). Aliniat cu politica din /legal/politica-cookies.
 */

export const COOKIE_CONSENT_STORAGE_KEY = "gobid_consent_v1";

export type CookieConsent = {
  v: 1;
  /** Analitice: Vercel Analytics, Speed Insights */
  analytics: boolean;
  /** Marketing: Google Ads / gtag */
  marketing: boolean;
  updatedAt: string;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

export function parseConsent(raw: string | null): CookieConsent | null {
  if (!raw?.trim()) return null;
  try {
    const o = JSON.parse(raw) as unknown;
    if (!isRecord(o)) return null;
    if (o.v !== 1) return null;
    if (typeof o.analytics !== "boolean" || typeof o.marketing !== "boolean") return null;
    if (typeof o.updatedAt !== "string") return null;
    return {
      v: 1,
      analytics: o.analytics,
      marketing: o.marketing,
      updatedAt: o.updatedAt,
    };
  } catch {
    return null;
  }
}

export function readConsent(): CookieConsent | null {
  if (typeof window === "undefined") return null;
  try {
    return parseConsent(window.localStorage.getItem(COOKIE_CONSENT_STORAGE_KEY));
  } catch {
    return null;
  }
}

export function writeConsent(partial: Pick<CookieConsent, "analytics" | "marketing">): CookieConsent {
  const next: CookieConsent = {
    v: 1,
    analytics: partial.analytics,
    marketing: partial.marketing,
    updatedAt: new Date().toISOString(),
  };
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(COOKIE_CONSENT_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // ignore quota / private mode
    }
    try {
      window.dispatchEvent(new Event("gobid-consent-changed"));
    } catch {
      // ignore
    }
  }
  return next;
}

/** Utilizatorul a răspuns deja (inclusiv „doar esențiale”). */
export function hasConsentRecord(): boolean {
  return readConsent() !== null;
}
