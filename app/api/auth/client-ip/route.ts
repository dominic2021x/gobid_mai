import { NextRequest, NextResponse } from "next/server";
import { resolveClientIpAndLocation } from "@/lib/net/ipGeoLookup";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

/**
 * IP-ul clientului (IPv4 sau IPv6) + locație estimată (header-e Vercel sau ipwho.is).
 */
export async function GET(request: NextRequest) {
  const { ip, ipVersion, location, locationSource } = await resolveClientIpAndLocation(request);
  return NextResponse.json(
    {
      ip: ip ?? null,
      ipVersion: ipVersion ?? null,
      location: location
        ? {
            label: location.label,
            city: location.city ?? null,
            region: location.region ?? null,
            country: location.country ?? null,
            countryCode: location.countryCode ?? null,
          }
        : null,
      locationSource,
      /** Calea acestei rute — pagina de login o poate compara cu URL-ul din browser */
      path: request.nextUrl.pathname,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
