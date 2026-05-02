/**
 * Shared validation for image uploads (R2 presigned flow).
 * No server-side image decoding — MIME and size only.
 */

export const UPLOAD_MAX_BYTES = 10 * 1024 * 1024; // 10MB

export const UPLOAD_ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/svg+xml",
  /** iPhone / Photos (uneori fără `file.type` în browser) */
  "image/heic",
  "image/heif",
] as const;

export type UploadAllowedMime = (typeof UPLOAD_ALLOWED_MIME_TYPES)[number];

/** Arhive mici pentru anunțuri (aceeași rută R2 ca imaginile). */
export const UPLOAD_ZIP_MIME = "application/zip" as const;

const MIME_SET = new Set<string>(UPLOAD_ALLOWED_MIME_TYPES);

export function isAllowedImageMime(mime: string): mime is UploadAllowedMime {
  return MIME_SET.has(mime);
}

/** Imagini + ZIP pentru presign/proxy `/api/upload` (metadata în `uploaded_images`). */
export function isAllowedR2UploadMime(mime: string): boolean {
  const m = normalizeClientMime(mime);
  return isAllowedImageMime(m) || m === UPLOAD_ZIP_MIME;
}

export function normalizeClientMime(mime: string): string {
  if (mime === "image/jpg") return "image/jpeg";
  return mime;
}

/**
 * Pe iOS / unele browsere, `File.type` poate fi gol; deducem din extensie pentru presign R2.
 */
export function guessImageMimeFromFilename(filename: string): string | null {
  const base = filename.trim().toLowerCase();
  const dot = base.lastIndexOf(".");
  if (dot === -1) return null;
  const ext = base.slice(dot);
  switch (ext) {
    case ".jpg":
    case ".jpeg":
    case ".jpe":
      return "image/jpeg";
    case ".png":
      return "image/png";
    case ".webp":
      return "image/webp";
    case ".gif":
      return "image/gif";
    case ".svg":
    case ".svgz":
      return "image/svg+xml";
    case ".heic":
      return "image/heic";
    case ".heif":
      return "image/heif";
    default:
      return null;
  }
}

/** Pentru input file: unele browsere lasă `type` gol pe iOS — folosim și extensia. */
export function isLikelyImageFile(file: Pick<File, "type" | "name">): boolean {
  if (file.type && file.type.startsWith("image/")) return true;
  return guessImageMimeFromFilename(file.name) != null;
}
