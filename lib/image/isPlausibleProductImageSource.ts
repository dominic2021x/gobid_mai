/** Aliniat cu `isPlaceholderImage` din getProductDisplayImage (fără import — evită ciclu). */
function isPlaceholderLike(url: string): boolean {
  const l = url.trim();
  if (!l) return true;
  const lower = l.toLowerCase();
  return lower.includes("no-image-placeholder") || lower.includes("placeholder");
}

/** Exclude URL-uri Google Maps – nu sunt imagini produs. */
function isGoogleMapsUrl(url: string): boolean {
  const u = url.toLowerCase();
  return (u.includes("google") && u.includes("maps")) || u.includes("goo.gl/maps");
}

/**
 * True dacă stringul pare o sursă reală de imagine (URL / cale statică / cheie obiect),
 * nu titlu sau text scris din greșeală în câmpul `images`.
 */
export function isPlausibleProductImageSource(s: string | null | undefined): boolean {
  if (s == null || typeof s !== "string") return false;
  const t = s.trim();
  if (!t) return false;
  if (isPlaceholderLike(t)) return false;
  if (isGoogleMapsUrl(t)) return false;

  if (t.startsWith("data:image/")) return true;
  if (t.startsWith("blob:")) return true;

  // Titluri / descrieri puse greșit în `images` au aproape mereu spații necodificate.
  if (/\s/.test(t)) return false;

  if (/^https?:\/\//i.test(t)) return true;
  if (t.startsWith("//")) return true;
  if (t.startsWith("/")) return true;
  if (/^(uploads|images)\//i.test(t)) return true;

  return false;
}
