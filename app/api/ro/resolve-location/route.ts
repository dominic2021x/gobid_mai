import { NextRequest, NextResponse } from "next/server";
import { Redis } from "@upstash/redis";
import { geocodeAddress, reverseGeocodeLatLng } from "@/lib/maps/geocode";
import { supabaseAdmin } from "@/lib/supabase";

/** Global geocode cache (Upstash KV) — resolved labels and reverse-geocoded coords are stable for days. */
const KV_FWD_PREFIX = "ro:resolveloc:fwd:v1:";
const KV_REV_PREFIX = "ro:resolveloc:rev:v1:";
const KV_TTL_SEC = 7 * 24 * 60 * 60;

type ResolveLocationPayload = {
  ok: boolean;
  lat?: number;
  lng?: number;
  formattedAddress?: string;
  addressComponents?: Array<{ longName: string; shortName: string; types: string[] }>;
  error?: string;
};

function getKv(): Redis | null {
  try {
    if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) return null;
    return Redis.fromEnv();
  } catch {
    return null;
  }
}

function withPublicCache(payload: ResolveLocationPayload, status = 200) {
  const res = NextResponse.json(payload, { status });
  if (payload.ok) {
    res.headers.set("Cache-Control", "public, s-maxage=86400, stale-while-revalidate=604800");
  } else {
    res.headers.set("Cache-Control", "no-store");
  }
  return res;
}

const LOCAL_CITY_COORDS: Record<string, { city: string; county: string; lat: number; lng: number }> = {
  bucuresti: { city: "București", county: "București", lat: 44.4268, lng: 26.1025 },
  craiova: { city: "Craiova", county: "Dolj", lat: 44.3302, lng: 23.7949 },
  "cluj-napoca": { city: "Cluj-Napoca", county: "Cluj", lat: 46.7712, lng: 23.6236 },
  timisoara: { city: "Timișoara", county: "Timiș", lat: 45.7489, lng: 21.2087 },
  iasi: { city: "Iași", county: "Iași", lat: 47.1585, lng: 27.6014 },
  brasov: { city: "Brașov", county: "Brașov", lat: 45.6427, lng: 25.5887 },
  constanta: { city: "Constanța", county: "Constanța", lat: 44.1598, lng: 28.6348 },
  galati: { city: "Galați", county: "Galați", lat: 45.4353, lng: 28.008 },
  ploiesti: { city: "Ploiești", county: "Prahova", lat: 44.9367, lng: 26.0129 },
  pitesti: { city: "Pitești", county: "Argeș", lat: 44.8565, lng: 24.8692 },
  segarcea: { city: "Segarcea", county: "Dolj", lat: 44.0947, lng: 23.7469 },
};

function normalizeLocation(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** „Zona Metropolitană X, Județ” → „X, Județ” pentru ro_localities / geocode. */
function stripRoMetropolitanZonePrefix(raw: string): string {
  const t = raw.trim();
  const stripped = t.replace(/^\s*Zona\s+Metropolitan[ăa]\s+/i, "").trim();
  return stripped.length >= 2 ? stripped : t;
}

function addressComponents(city: string, county: string) {
  return [
    { longName: county, shortName: county, types: ["administrative_area_level_1"] },
    { longName: city, shortName: city, types: ["locality"] },
  ];
}

async function resolveRomanianLocalityFast(q: string) {
  const parts = q.split(",").map((part) => part.trim()).filter(Boolean);
  const cityQuery = parts[0] || q;
  const countyQuery = parts[1] || "";
  const cityNorm = normalizeLocation(cityQuery);
  const countyNorm = normalizeLocation(countyQuery);

  if (supabaseAdmin && cityNorm.length >= 2) {
    const { data } = await supabaseAdmin
      .from("ro_localities")
      .select("city_name, county_name, latitude, longitude")
      .eq("city_norm", cityNorm)
      .limit(10);
    const rows = (data ?? []).filter((row) => {
      if (!countyNorm) return true;
      return normalizeLocation(String(row.county_name ?? "")).includes(countyNorm);
    });
    const row = rows[0] ?? data?.[0];
    const lat = Number(row?.latitude);
    const lng = Number(row?.longitude);
    if (row && Number.isFinite(lat) && Number.isFinite(lng)) {
      const city = String(row.city_name ?? cityQuery).trim();
      const county = String(row.county_name ?? countyQuery).trim();
      return {
        ok: true,
        lat,
        lng,
        formattedAddress: [city, county, "România"].filter(Boolean).join(", "),
        addressComponents: addressComponents(city, county),
      };
    }
  }

  const local = LOCAL_CITY_COORDS[cityNorm] ?? LOCAL_CITY_COORDS[cityNorm.replace(/\s+/g, "-")];
  if (local) {
    return {
      ok: true,
      lat: local.lat,
      lng: local.lng,
      formattedAddress: `${local.city}, ${local.county}, România`,
      addressComponents: addressComponents(local.city, local.county),
    };
  }

  return null;
}

/**
 * Geocodează un oraș / adresă scurtă în RO pentru filtrele /ro (centru rază km).
 * GET ?q=Cluj-Napoca
 * Sau reverse: GET ?lat=…&lng=… (poziția browserului)
 */
export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const latRaw = sp.get("lat");
  const lngRaw = sp.get("lng");
  const kv = getKv();

  if (latRaw != null && lngRaw != null && latRaw.length > 0 && lngRaw.length > 0) {
    const lat = parseFloat(latRaw);
    const lng = parseFloat(lngRaw);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
      return NextResponse.json({ ok: false, error: "Coordonate invalide." }, { status: 400 });
    }
    /** Round to 4 decimals so nearby points share the same cache slot (~11m). */
    const kvKey = `${KV_REV_PREFIX}${lat.toFixed(4)},${lng.toFixed(4)}`;
    if (kv) {
      try {
        const hit = await kv.get<ResolveLocationPayload>(kvKey);
        if (hit && hit.ok) return withPublicCache(hit);
      } catch {
        // ignore
      }
    }
    const result = await reverseGeocodeLatLng(lat, lng);
    if (result.success) {
      const payload: ResolveLocationPayload = {
        ok: true,
        lat: result.lat,
        lng: result.lng,
        formattedAddress: result.formattedAddress,
        addressComponents: result.addressComponents ?? [],
      };
      if (kv) {
        try {
          await kv.set(kvKey, payload, { ex: KV_TTL_SEC });
        } catch {
          // ignore
        }
      }
      return withPublicCache(payload);
    }
    return withPublicCache({ ok: false, error: result.error ?? "Reverse geocoding eșuat" });
  }

  const qRaw = sp.get("q")?.trim() ?? "";
  if (qRaw.length < 2) {
    return NextResponse.json({ ok: false, error: "Parametrul q este prea scurt." }, { status: 400 });
  }
  const q = stripRoMetropolitanZonePrefix(qRaw);
  const kvKey = `${KV_FWD_PREFIX}${normalizeLocation(q)}`;
  if (kv) {
    try {
      const hit = await kv.get<ResolveLocationPayload>(kvKey);
      if (hit && hit.ok) return withPublicCache(hit);
    } catch {
      // ignore
    }
  }

  const fastResult = await resolveRomanianLocalityFast(q);
  if (fastResult) {
    if (kv) {
      try {
        await kv.set(kvKey, fastResult as ResolveLocationPayload, { ex: KV_TTL_SEC });
      } catch {
        // ignore
      }
    }
    return withPublicCache(fastResult as ResolveLocationPayload);
  }
  const address = q.includes("România") || q.includes("Romania") ? q : `${q}, România`;
  const result = await geocodeAddress(address, false);
  if (!result.success) {
    return withPublicCache({ ok: false, error: result.error ?? "Geocoding eșuat" });
  }
  const payload: ResolveLocationPayload = {
    ok: true,
    lat: result.lat,
    lng: result.lng,
    formattedAddress: result.formattedAddress,
    addressComponents: result.addressComponents ?? [],
  };
  if (kv) {
    try {
      await kv.set(kvKey, payload, { ex: KV_TTL_SEC });
    } catch {
      // ignore
    }
  }
  return withPublicCache(payload);
}
