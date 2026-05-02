/**
 * Normalization for seed suggestion extractors.
 * toNorm: lowercase, trim, collapse spaces, Romanian diacritics stripped, punctuation removed (keep hyphen).
 */

const DIACRITICS: Record<string, string> = {
  ă: "a", â: "a", î: "i", ș: "s", ş: "s", ț: "t", ţ: "t",
  Ă: "a", Â: "a", Î: "i", Ș: "s", Ş: "s", Ț: "t", Ţ: "t",
};

function replaceDiacritics(s: string): string {
  let out = s;
  for (const [from, to] of Object.entries(DIACRITICS)) {
    out = out.split(from).join(to);
  }
  return out;
}

/**
 * Normalize for matching: lowercase, trim, collapse spaces, strip diacritics,
 * remove punctuation (except hyphen inside words), multiple separators → space.
 */
export function toNorm(s: string): string {
  if (s == null || typeof s !== "string") return "";
  let t = s
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
  t = replaceDiacritics(t);
  t = t.replace(/[^\p{L}\p{N}\s\-]/gu, " ").replace(/\s+/g, " ").trim();
  return t;
}
