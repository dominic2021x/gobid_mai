/**
 * GET /api/assistant/weather?city=...
 * Returns a short weather summary for the given city. Cached 12 minutes.
 * Uses Open-Meteo (no API key). For assistant CHAT mode context.
 */

import { NextRequest, NextResponse } from "next/server";

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


const CACHE_TTL_MS = 12 * 60 * 1000; // 12 min
const cache = new Map<string, { summary: string; cachedAt: number }>();

function cacheKey(city: string): string {
  return city.trim().toLowerCase().replace(/\s+/g, " ");
}

async function geocode(city: string): Promise<{ lat: number; lon: number; name: string } | null> {
  const res = await fetch(
    `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=ro`,
    { signal: AbortSignal.timeout(5000) }
  );
  if (!res.ok) return null;
  const data = (await res.json()) as { results?: { latitude: number; longitude: number; name: string }[] };
  const first = data.results?.[0];
  if (!first) return null;
  return { lat: first.latitude, lon: first.longitude, name: first.name };
}

async function fetchWeather(lat: number, lon: number): Promise<string> {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code,precipitation&timezone=Europe/Bucharest`;
  const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
  if (!res.ok) return "Vremea nu e disponibilă momentan.";
  const data = (await res.json()) as {
    current?: { temperature_2m?: number; weather_code?: number; precipitation?: number };
  };
  const cur = data.current;
  if (!cur || typeof cur.temperature_2m !== "number") return "Vremea nu e disponibilă momentan.";
  const temp = Math.round(cur.temperature_2m);
  const code = cur.weather_code ?? 0;
  let desc = "senin";
  if (code >= 1 && code <= 3) desc = "parțial noros";
  else if (code >= 45 && code <= 48) desc = "ceață";
  else if (code >= 51 && code <= 67) desc = "ploaie";
  else if (code >= 71 && code <= 77) desc = "zăpadă";
  else if (code >= 80 && code <= 82) desc = "averse";
  else if (code >= 95) desc = "furtună";
  const prec = typeof cur.precipitation === "number" && cur.precipitation > 0 ? `, precipitații ${cur.precipitation} mm` : "";
  return `${temp}°C, ${desc}${prec}. (Sursă: Open-Meteo)`;
}

export async function GET(request: NextRequest) {
  const city = request.nextUrl.searchParams.get("city")?.trim();
  if (!city || city.length > 100) {
    return NextResponse.json({ error: "Parametrul city este obligatoriu (max 100 caractere)." }, { status: 400 });
  }

  const key = cacheKey(city);
  const cached = cache.get(key);
  if (cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) {
    return NextResponse.json({ summary: cached.summary, cached: true });
  }

  try {
    const geo = await geocode(city);
    if (!geo) {
      return NextResponse.json(
        { error: "Oraș negăsit.", summary: null },
        { status: 404 }
      );
    }
    const summary = await fetchWeather(geo.lat, geo.lon);
    cache.set(key, { summary, cachedAt: Date.now() });
    return NextResponse.json({ summary, city: geo.name, cached: false });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (process.env.NODE_ENV === "development") {
      console.error("[assistant/weather]", msg);
    }
    return NextResponse.json(
      { error: "Vremea nu a putut fi obținută.", summary: null },
      { status: 502 }
    );
  }
}
