/**
 * Location parsing for licitatii-insolventa.ro (Romania only).
 * Normalize ".middle .loc" text: remove "(Romania)", split " in " -> city + county.
 */

export interface NormalizedLocation {
  raw: string;
  city: string | null;
  county: string | null;
}

/**
 * Normalize location string.
 * - "City in County (Romania)" -> city + county
 * - "Romania, County, City" or "Romania, Județ, Oraș" -> county + city
 */
export function normalizeLocation(raw: string): NormalizedLocation {
  const trimmed = raw.replace(/\s+/g, " ").trim();
  if (!trimmed) return { raw: "", city: null, county: null };

  let city: string | null = null;
  let county: string | null = null;
  let withoutCountry = trimmed.replace(/\s*\(Romania\)\s*$/i, "").trim();

  // Format "Romania, Salaj, Criseni" or "Romania, Județ, Oraș"
  const commaParts = withoutCountry.split(",").map((p) => p.trim()).filter(Boolean);
  if (commaParts.length >= 3 && /^Romania$/i.test(commaParts[0])) {
    county = commaParts[1] || null;
    city = commaParts[2] || null;
    withoutCountry = commaParts.slice(1).join(", ");
    return { raw: withoutCountry, city, county };
  }
  if (commaParts.length >= 2 && /^Romania$/i.test(commaParts[0])) {
    county = commaParts[1] || null;
    city = commaParts[1] || null;
    withoutCountry = commaParts.slice(1).join(", ");
    return { raw: withoutCountry, city, county };
  }

  const inIndex = withoutCountry.indexOf(" in ");
  if (inIndex > -1) {
    city = withoutCountry.slice(0, inIndex).replace(/\s+/g, " ").trim() || null;
    county = withoutCountry
      .slice(inIndex + 4)
      .replace(/\s+/g, " ")
      .trim() || null;
  } else if (withoutCountry) {
    city = withoutCountry;
  }
  return {
    raw: withoutCountry,
    city: city || null,
    county: county || null,
  };
}
