import net from "node:net";
import type { NextRequest } from "next/server";
import {
  getClientIpFromRequest,
  isNonPublicClientIp,
  unwrapIpv4MappedIpv6,
} from "@/lib/net/client-ip-public";

export type IpLocationInfo = {
  city?: string;
  region?: string;
  country?: string;
  countryCode?: string;
  /** Text scurt pentru UI */
  label: string;
};

function decodeMaybeEncoded(value: string | null): string | undefined {
  if (!value?.trim()) return undefined;
  const t = value.trim();
  try {
    return decodeURIComponent(t);
  } catch {
    return t;
  }
}

/** IPv6 cu zone (ex. fe80::1%en0) — lookup doar fără sufix. */
export function ipForExternalLookup(ip: string): string {
  const i = ip.indexOf("%");
  return i === -1 ? ip : ip.slice(0, i);
}

export function clientIpVersion(ip: string): "ipv4" | "ipv6" {
  const forNet = ipForExternalLookup(ip);
  if (net.isIPv6(forNet)) return "ipv6";
  return "ipv4";
}

function buildLabel(parts: {
  city?: string;
  region?: string;
  country?: string;
  countryCode?: string;
}): string {
  const out: string[] = [];
  if (parts.city) out.push(parts.city);
  if (parts.region && parts.region !== parts.city) out.push(parts.region);
  if (parts.country) out.push(parts.country);
  else if (parts.countryCode) out.push(parts.countryCode);
  return out.join(", ") || "—";
}

/**
 * Geo din header-e Vercel (fără apel extern).
 */
export function getGeoFromVercelHeaders(request: NextRequest): IpLocationInfo | null {
  const countryCode = request.headers.get("x-vercel-ip-country")?.trim();
  const city = decodeMaybeEncoded(request.headers.get("x-vercel-ip-city"));
  const region = decodeMaybeEncoded(request.headers.get("x-vercel-ip-country-region"));
  if (!countryCode && !city && !region) return null;
  const label = buildLabel({
    city,
    region,
    country: undefined,
    countryCode: countryCode || undefined,
  });
  return {
    city,
    region,
    country: countryCode,
    countryCode: countryCode || undefined,
    label: label !== "—" ? label : countryCode || "—",
  };
}

type IpWhoPayload = {
  success?: boolean;
  city?: string;
  region?: string;
  country?: string;
  country_code?: string;
};

/**
 * Fallback public: ipwho.is (HTTPS, fără cheie pentru uz de bază).
 */
export async function fetchGeoFromIpWho(ip: string): Promise<IpLocationInfo | null> {
  const lookupIp = ipForExternalLookup(ip);
  if (!lookupIp || isNonPublicClientIp(lookupIp)) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4500);
  try {
    const res = await fetch(`https://ipwho.is/${encodeURIComponent(lookupIp)}`, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    if (!res.ok) return null;
    const data = (await res.json()) as IpWhoPayload;
    if (!data.success) return null;
    const city = data.city?.trim();
    const region = data.region?.trim();
    const country = data.country?.trim();
    const countryCode = data.country_code?.trim();
    const label = buildLabel({ city, region, country, countryCode });
    return {
      city,
      region,
      country: country ?? countryCode,
      countryCode,
      label: label !== "—" ? label : country ?? "—",
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export function normalizeRawClientIp(raw: string | null): string | null {
  if (!raw?.trim()) return null;
  let s = raw.trim();
  if (s.startsWith("[") && s.includes("]")) {
    s = s.slice(1, s.indexOf("]"));
  }
  s = unwrapIpv4MappedIpv6(s);
  return s || null;
}

/**
 * Rezolvă IP + locație pentru afișare login: întâi Vercel, apoi ipwho.
 */
export async function resolveClientIpAndLocation(request: NextRequest): Promise<{
  ip: string | null;
  ipVersion: "ipv4" | "ipv6" | null;
  location: IpLocationInfo | null;
  locationSource: "vercel" | "ipwho" | "none";
}> {
  const raw = getClientIpFromRequest(request);
  const ip = normalizeRawClientIp(raw);
  if (!ip) {
    return { ip: null, ipVersion: null, location: null, locationSource: "none" };
  }
  const ipVersion = clientIpVersion(ip);

  const vercel = getGeoFromVercelHeaders(request);
  if (vercel && vercel.label && vercel.label !== "—") {
    return { ip, ipVersion, location: vercel, locationSource: "vercel" };
  }

  /** După Vercel: localhost / RFC1918 — fără GeoIP public util */
  if (isNonPublicClientIp(ip)) {
    const isLoopback =
      ip === "127.0.0.1" ||
      ip === "::1" ||
      ip.toLowerCase().startsWith("127.") ||
      ip.toLowerCase() === "localhost";
    const label = isLoopback
      ? "Localhost — locația nu poate fi estimată (dezvoltare)"
      : "Rețea privată / locală — GeoIP indisponibil pentru acest IP";
    return {
      ip,
      ipVersion,
      location: { label, country: label },
      locationSource: "none",
    };
  }

  const fromIpWho = await fetchGeoFromIpWho(ip);
  if (fromIpWho) {
    return { ip, ipVersion, location: fromIpWho, locationSource: "ipwho" };
  }

  return {
    ip,
    ipVersion,
    location: {
      label: "Locație indisponibilă momentan (serviciu GeoIP)",
      country: "—",
    },
    locationSource: "none",
  };
}
