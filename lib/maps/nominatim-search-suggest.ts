/**
 * Suggestions de localități în România prin Nominatim (OpenStreetMap).
 * Folosit pentru autocompletare / filtre; nu înlocuiește geocodarea cu Google.
 */

export type RomaniaLocalitySuggestion = {
  label: string;
  lat: number;
  lon: number;
};

function cleanCountyName(raw: string): string {
  if (!raw) return "";
  return raw
    .replace(/\s*County$/i, "")
    .replace(/\s*Jude[țt]ul?\s*/i, "")
    .replace(/^Jude[țt]\.?\s*/i, "")
    .trim();
}

/**
 * Oraș / comună / sat: preferă unitatea cea mai mică relevantă din adresa OSM.
 */
function buildLabelFromNominatimAddress(addr: Record<string, string | undefined> | null | undefined): string | null {
  if (!addr) return null;
  const a = addr;
  const locality = [a.village, a.hamlet, a.town, a.municipality, a.city]
    .map((x) => (typeof x === "string" ? x.trim() : ""))
    .find((x) => x.length > 0);
  const county = cleanCountyName((a.county || a.state || "").trim());
  if (locality && county) return `${locality}, ${county}`;
  if (locality) return locality;
  return null;
}

/**
 * Caută localități în RO; returnează etichete de forma „Craiova, Dolj” când e posibil.
 */
export async function searchRomaniaLocalitySuggestions(
  q: string,
  limit = 10
): Promise<RomaniaLocalitySuggestion[]> {
  const query = q.trim();
  if (query.length < 2) return [];
  if (query.length > 200) return [];

  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&q=${encodeURIComponent(`${query}, România`)}&limit=${encodeURIComponent(String(Math.min(15, Math.max(1, limit + 5))))}&addressdetails=1&accept-language=ro&countrycodes=ro`;

  try {
    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": "GoBid/1.0 (location search; +https://gobid.ro)",
      },
    });
    if (!response.ok) return [];
    const data: unknown = await response.json();
    if (!Array.isArray(data)) return [];
    const out: RomaniaLocalitySuggestion[] = [];
    const seen = new Set<string>();

    for (const item of data) {
      if (!item || typeof item !== "object") continue;
      const o = item as { lat?: string; lon?: string; address?: Record<string, string>; display_name?: string };
      const lat = Number(o.lat);
      const lon = Number(o.lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;

      const address = o.address && typeof o.address === "object" ? o.address : undefined;
      let label = buildLabelFromNominatimAddress(
        address as Record<string, string | undefined> | null | undefined,
      );
      if (!label && typeof o.display_name === "string") {
        const fallbackLabel = o.display_name
          .split(",")
          .map((p) => p.trim())
          .filter(Boolean)
          .slice(0, 2)
          .join(", ");
        label = fallbackLabel.length > 0 ? fallbackLabel : null;
      }
      if (!label) continue;
      const key = label
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ label, lat, lon: lon });
      if (out.length >= limit) break;
    }
    return out;
  } catch {
    return [];
  }
}
