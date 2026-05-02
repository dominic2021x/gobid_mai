/**
 * Deterministic R2 keys — content-addressed (global dedupe).
 * v2: single master only; variants via Cloudflare Image Resizing.
 */
export type MasterImageExt = "avif" | "webp" | "jpeg";

/** One blob per content hash. JPEG uses `.jpg` on disk. */
export function buildGlobalMasterKey(contentHashSha256Hex: string, ext: MasterImageExt): string {
  const h = contentHashSha256Hex.toLowerCase();
  const suffix = ext === "jpeg" ? "jpg" : ext;
  return `uploads/v2/${h}/full.${suffix}`;
}

/** @deprecated Multi-variant WebP keys (legacy); kept for backwards compatibility readers. */
export function buildDeterministicVariantKeys(
  userId: string,
  contentHashSha256Hex: string
): { thumb: string; card: string; full: string } {
  const h = contentHashSha256Hex.toLowerCase();
  const base = `uploads/${userId}/v1/w/${h}`;
  return {
    thumb: `${base}/thumb.webp`,
    card: `${base}/card.webp`,
    full: `${base}/full.webp`,
  };
}
