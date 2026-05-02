/**
 * Enterprise master encode: AVIF → WebP → **JPEG only if both fail** (last resort).
 * Panoramas: wide/tall strips use single-axis cap (1200px) instead of 1200×1200 box when aspect ≥ 2:1.
 */
import sharp from "sharp";

import type { MasterImageExt } from "@/lib/upload/optimized-image-keys";
import { UPLOAD_MAX_BYTES } from "@/lib/upload/image-rules";

export const OPT_FULL_MAX_WIDTH = 1200;

const LIMIT_INPUT_PIXELS = 4096 * 4096;

const AVIF_QUALITY_BASE = 55;
const AVIF_EFFORT = 4;

export const OPT_WEBP_QUALITY = 70;
const WEBP_EFFORT = 3;

/** JPEG: only used after AVIF and WebP encode both throw. */
const JPEG_QUALITY_FALLBACK = 82;

export type MasterEncodeResult = {
  buffer: Buffer;
  ext: MasterImageExt;
  contentType: string;
  skippedResize: boolean;
  encodeMs: number;
};

/** Panorama: prefer limiting the long edge only (readable thin dimension). */
function resizeOptionsForMeta(meta: sharp.Metadata): sharp.ResizeOptions | null {
  const w = meta.width ?? 0;
  const h = meta.height ?? 0;
  if (w <= 0 || h <= 0) return null;
  if (Math.max(w, h) <= OPT_FULL_MAX_WIDTH) return null;

  const ratio = w / h;
  if (ratio >= 2) {
    return { width: OPT_FULL_MAX_WIDTH, withoutEnlargement: true };
  }
  if (ratio <= 0.5) {
    return { height: OPT_FULL_MAX_WIDTH, withoutEnlargement: true };
  }
  return {
    width: OPT_FULL_MAX_WIDTH,
    height: OPT_FULL_MAX_WIDTH,
    fit: "inside",
    withoutEnlargement: true,
  };
}

function avifQualityForAspect(meta: sharp.Metadata): number {
  const w = meta.width ?? 1;
  const h = meta.height ?? 1;
  const ar = w / h;
  if (ar >= 3 || ar <= 1 / 3) {
    return Math.min(63, AVIF_QUALITY_BASE + 8);
  }
  return AVIF_QUALITY_BASE;
}

function buildPipeline(input: Buffer, meta: sharp.Metadata) {
  const s = sharp(input, {
    limitInputPixels: LIMIT_INPUT_PIXELS,
    sequentialRead: true,
  }).rotate();

  const resizeOpts = resizeOptionsForMeta(meta);
  if (!resizeOpts) {
    return s;
  }
  return s.resize(resizeOpts);
}

export async function buildOptimizedMaster(input: Buffer): Promise<MasterEncodeResult> {
  if (input.length === 0 || input.length > UPLOAD_MAX_BYTES) {
    throw new Error(`Dimensiune invalidă (max ${UPLOAD_MAX_BYTES / 1024 / 1024}MB).`);
  }

  const meta = await sharp(input, { limitInputPixels: LIMIT_INPUT_PIXELS }).metadata();

  if (meta.format === "svg") {
    throw new Error("SVG nu este acceptat pe acest endpoint (folosește raster).");
  }

  const resizeApplied = resizeOptionsForMeta(meta) !== null;
  const tEncode0 = performance.now();

  const makeP = () => buildPipeline(input, meta);
  const avifQ = avifQualityForAspect(meta);

  let buffer: Buffer;
  let ext: MasterImageExt;
  let contentType: string;

  try {
    buffer = await makeP()
      .avif({
        quality: avifQ,
        effort: AVIF_EFFORT,
      })
      .withMetadata({})
      .toBuffer();
    ext = "avif";
    contentType = "image/avif";
  } catch (e) {
    console.warn("[buildOptimizedMaster] AVIF failed", e);
    try {
      buffer = await makeP()
        .webp({
          quality: OPT_WEBP_QUALITY,
          effort: WEBP_EFFORT,
          smartSubsample: true,
        })
        .withMetadata({})
        .toBuffer();
      ext = "webp";
      contentType = "image/webp";
    } catch (e2) {
      console.warn("[buildOptimizedMaster] WebP failed — JPEG last resort only", e2);
      buffer = await makeP()
        .jpeg({
          quality: JPEG_QUALITY_FALLBACK,
          mozjpeg: true,
        })
        .withMetadata({})
        .toBuffer();
      ext = "jpeg";
      contentType = "image/jpeg";
    }
  }

  const encodeMs = Math.round(performance.now() - tEncode0);

  return {
    buffer,
    ext,
    contentType,
    skippedResize: !resizeApplied,
    encodeMs,
  };
}
