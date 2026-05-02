/**
 * Public R2 object URL (same host as CF Image Resizing origin). Edge-safe (env only).
 */
export function buildR2PublicObjectUrl(storageKey: string): string | null {
  const base = process.env.NEXT_PUBLIC_R2_PUBLIC_BASE_URL?.trim().replace(/\/$/, "");
  if (!base) return null;
  const path = storageKey
    .split("/")
    .filter(Boolean)
    .map((s) => encodeURIComponent(s))
    .join("/");
  return `${base}/${path}`;
}
