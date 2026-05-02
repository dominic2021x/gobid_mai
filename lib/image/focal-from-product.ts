import type { ImageFocalEntry } from "@/lib/image/focal-types";

/** Resolve focal for a display URL from server-enriched `image_focal_by_url` (listings / PDP). */
export function getFocalForImageUrl(
  product: { image_focal_by_url?: Record<string, ImageFocalEntry> } | null | undefined,
  url: string,
): ImageFocalEntry | undefined {
  const m = product?.image_focal_by_url;
  if (!m || !url) return undefined;
  return m[url];
}

/** Product `images` array → absolute URLs we can look up in `uploaded_images`. */
export function collectHttpProductImageUrls(images: unknown): string[] {
  if (!Array.isArray(images)) return [];
  const out: string[] = [];
  for (const u of images) {
    if (typeof u === "string" && u.startsWith("http")) out.push(u);
  }
  return out;
}

/** Client-only: batch focal metadata for PDP (server cannot be imported in these pages). */
export async function fetchImageFocalByUrls(urls: string[]): Promise<Record<string, ImageFocalEntry>> {
  if (urls.length === 0) return {};
  try {
    const res = await fetch("/api/images/focal-by-urls", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ urls }),
    });
    if (!res.ok) return {};
    const data = (await res.json()) as { focalByUrl?: Record<string, ImageFocalEntry> };
    return data.focalByUrl ?? {};
  } catch {
    return {};
  }
}
