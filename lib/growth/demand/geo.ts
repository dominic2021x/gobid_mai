import "server-only";
import fs from "fs";
import path from "path";

let cached: Array<{ slug: string; name: string; nameNorm: string }> | null = null;

function slugFromName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "judet";
}

export function loadCounties(): Array<{ slug: string; name: string; nameNorm: string }> {
  if (cached) return cached;
  try {
    const p = path.join(process.cwd(), "judete.json");
    const raw = fs.readFileSync(p, "utf-8");
    const data = JSON.parse(raw) as { judete?: Array<{ nume?: string; auto?: string }> };
    const judete = data.judete ?? [];
    cached = judete
      .map((j) => {
        const name = (j.nume ?? "").trim();
        if (!name) return null;
        const slug = slugFromName(name);
        const nameNorm = name
          .toLowerCase()
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .replace(/\s+/g, " ");
        return { slug, name, nameNorm };
      })
      .filter((c): c is { slug: string; name: string; nameNorm: string } => c != null);
    return cached;
  } catch {
    cached = [];
    return [];
  }
}

/** Aliases: common spellings or abbreviations -> county slug */
const ALIASES: Record<string, string> = {
  bucuresti: "bucuresti",
  bucurești: "bucuresti",
  b: "bucuresti",
  cluj: "cluj",
  timis: "timis",
  timiș: "timis",
  constanta: "constanta",
  constanța: "constanta",
  brasov: "brasov",
  brașov: "brasov",
  iasi: "iasi",
  iași: "iasi",
  sibiu: "sibiu",
  prahova: "prahova",
  dolj: "dolj",
  galati: "galati",
  galați: "galati",
};

/**
 * Detect county slug from query text (e.g. "masini cluj" -> "cluj").
 * Returns first matching county slug or null.
 */
export function detectCountySlug(queryNorm: string): string | null {
  const counties = loadCounties();
  const tokens = queryNorm.split(/\s+/).filter(Boolean);
  for (const token of tokens) {
    const alias = ALIASES[token];
    if (alias) return alias;
    const match = counties.find(
      (c) => c.slug === token || c.nameNorm === token || c.nameNorm.includes(token) || token.includes(c.slug)
    );
    if (match) return match.slug;
  }
  for (const c of counties) {
    if (queryNorm.includes(c.slug) || queryNorm.includes(c.nameNorm)) return c.slug;
  }
  return null;
}
