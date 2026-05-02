import { normalizeClientMime } from "@/lib/upload/image-rules";

const DEFAULT_MAX_EDGE = 1920;
const TARGET_MAX_BYTES = 900 * 1024;
/** Sub această mărime nu încercăm decodare (economie CPU); excepție: HEIC poate fi mare la dimensiuni mici. */
const SKIP_IF_UNDER_BYTES = 80 * 1024;

function canvasToBlob(
  canvas: HTMLCanvasElement,
  type: string,
  quality: number
): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob((b) => resolve(b), type, quality);
  });
}

async function canvasSupportsWebp(canvas: HTMLCanvasElement): Promise<boolean> {
  const b = await canvasToBlob(canvas, "image/webp", 0.5);
  return !!b && b.size > 0;
}

async function shrinkCanvasToTarget(
  canvas: HTMLCanvasElement
): Promise<{ blob: Blob; mime: string } | null> {
  const webpOk = await canvasSupportsWebp(canvas);
  const mimeOrder = webpOk
    ? (["image/webp", "image/jpeg"] as const)
    : (["image/jpeg"] as const);
  const qualitySteps = [0.85, 0.78, 0.7, 0.62, 0.55, 0.48, 0.4, 0.32, 0.26];

  for (const mime of mimeOrder) {
    for (const q of qualitySteps) {
      const blob = await canvasToBlob(canvas, mime, q);
      if (blob && blob.size > 0 && blob.size <= TARGET_MAX_BYTES) {
        return { blob, mime };
      }
    }
  }

  const last = await canvasToBlob(canvas, "image/jpeg", 0.22);
  if (!last || last.size <= 0) return null;
  return { blob: last, mime: "image/jpeg" };
}

/**
 * Redimensionează și comprimă poze mari înainte de R2 (JPEG/WebP).
 * SVG și fișiere foarte mici sunt lăsate neschimbate; HEIC/HEIF poate eșua — se revine la original.
 */
export async function compressImageForListing(
  file: File,
  options?: { maxEdge?: number }
): Promise<File> {
  const maxEdge = options?.maxEdge ?? DEFAULT_MAX_EDGE;
  const mime = normalizeClientMime(file.type || "");

  if (mime === "image/svg+xml") {
    return file;
  }

  if (
    file.size > 0 &&
    file.size < SKIP_IF_UNDER_BYTES &&
    !mime.includes("heic") &&
    !mime.includes("heif")
  ) {
    return file;
  }

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return file;
  }

  try {
    const w = bitmap.width;
    const h = bitmap.height;
    if (w <= 0 || h <= 0) {
      bitmap.close();
      return file;
    }

    let tw = w;
    let th = h;
    if (w > maxEdge || h > maxEdge) {
      if (w >= h) {
        tw = maxEdge;
        th = Math.max(1, Math.round((h * maxEdge) / w));
      } else {
        th = maxEdge;
        tw = Math.max(1, Math.round((w * maxEdge) / h));
      }
    }

    const canvas = document.createElement("canvas");
    canvas.width = tw;
    canvas.height = th;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      bitmap.close();
      return file;
    }
    if (mime === "image/png" || mime === "image/webp") {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, tw, th);
    }
    ctx.drawImage(bitmap, 0, 0, tw, th);
    bitmap.close();

    const encoded = await shrinkCanvasToTarget(canvas);
    if (!encoded) {
      return file;
    }

    if (encoded.blob.size >= file.size * 0.98 && file.size <= TARGET_MAX_BYTES && tw === w && th === h) {
      return file;
    }

    const ext = encoded.mime === "image/webp" ? ".webp" : ".jpg";
    const base = file.name.replace(/\.[^/.]+$/, "") || "image";
    return new File([encoded.blob], `${base}-listing${ext}`, {
      type: encoded.mime,
      lastModified: Date.now(),
    });
  } catch {
    try {
      bitmap.close();
    } catch {
      /* ignore */
    }
    return file;
  }
}
