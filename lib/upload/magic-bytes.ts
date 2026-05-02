/**
 * Magic-byte sniffing for images (defense in depth alongside Content-Type).
 */
export type DetectedImageFamily = "jpeg" | "png" | "gif" | "webp" | "avif" | "heif" | "unknown";

export function detectImageFamilyFromBuffer(buf: Buffer): DetectedImageFamily {
  if (buf.length < 12) return "unknown";

  // JPEG
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return "jpeg";
  }

  // PNG
  if (
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47 &&
    buf[4] === 0x0d &&
    buf[5] === 0x0a &&
    buf[6] === 0x1a &&
    buf[7] === 0x0a
  ) {
    return "png";
  }

  // GIF
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x38) {
    return "gif";
  }

  // WebP (RIFF....WEBP)
  if (
    buf[0] === 0x52 &&
    buf[1] === 0x49 &&
    buf[2] === 0x46 &&
    buf[3] === 0x46 &&
    buf.length >= 12 &&
    buf[8] === 0x57 &&
    buf[9] === 0x45 &&
    buf[10] === 0x42 &&
    buf[11] === 0x50
  ) {
    return "webp";
  }

  // AVIF / HEIF (ISO BMFF: ....ftyp)
  if (buf.length >= 12 && buf[4] === 0x66 && buf[5] === 0x74 && buf[6] === 0x79 && buf[7] === 0x70) {
    const brand = buf.subarray(8, 12).toString("ascii");
    if (brand === "avif" || brand === "avis") return "avif";
    if (brand === "heic" || brand === "heix" || brand === "mif1" || brand === "msf1") return "heif";
  }

  return "unknown";
}

export function bufferLooksLikeRasterImage(buf: Buffer): boolean {
  const f = detectImageFamilyFromBuffer(buf);
  return f !== "unknown";
}
