/**
 * Normalizare pentru comparat marci / tokeni în query (fără diacritice, doar alfanumeric).
 */
function normalizeBrandToken(s: string): string {
  return (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

function collectBrandTokenSet(brand: string | undefined, brands: string[] | undefined): Set<string> {
  const out = new Set<string>();
  const add = (raw: string) => {
    const full = normalizeBrandToken(raw);
    if (full.length >= 2) out.add(full);
    for (const part of raw.split(/[^a-z0-9]+/i)) {
      const p = normalizeBrandToken(part);
      if (p.length >= 2) out.add(p);
    }
  };
  if (brand && brand.trim() && brand.trim().toLowerCase() !== "all") add(brand.trim());
  for (const b of brands ?? []) {
    if (b?.trim()) add(b.trim());
  }
  return out;
}

/**
 * Doar apelat când există filtru `brand` / `brands` în URL.
 * Scoatem din `q` tokenii care repetă marca (ex: ?brand=bmw&q=baterie bmw → „baterie”).
 * Fără filtru de marcă nu se apelează — utilizatorul poate căuta „bmw” în text și se potrivește titlul/câmpul brand.
 */
export function stripBrandTokensFromSearchQuery(
  q: string | undefined,
  brand: string | undefined,
  brands: string[] | undefined
): string | undefined {
  const raw = q?.trim();
  if (!raw) return undefined;
  const brandTokens = collectBrandTokenSet(brand, brands);
  if (brandTokens.size === 0) return raw;

  const words = raw.split(/\s+/).filter(Boolean);
  const kept = words.filter((w) => {
    const nw = normalizeBrandToken(w);
    if (!nw) return true;
    // Doar egalitate exactă pe token normalizat. Potrivirea prin includes() ștergea cuvinte întregi
    // care conțineau fragmente din marcă (ex. „conducta” ↔ „uct”, „duc”, „con”).
    if (brandTokens.has(nw)) return false;
    return true;
  });
  const out = kept.join(" ").trim();
  return out || undefined;
}
