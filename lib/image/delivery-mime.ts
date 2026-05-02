import type { DeliveryExt } from "@/lib/image/delivery-token";
import type { DeliveryOutputFormat } from "@/lib/image/pick-cdn-output-format";

const MIME_BY_OUTPUT: Record<DeliveryOutputFormat, string> = {
  avif: "image/avif",
  webp: "image/webp",
  jpeg: "image/jpeg",
};

const MIME_BY_STORAGE: Record<DeliveryExt, string> = {
  avif: "image/avif",
  webp: "image/webp",
  jpeg: "image/jpeg",
};

/** Strict MIME for negotiated transform output (never ambiguous). */
export function strictMimeForDeliveryOutput(format: DeliveryOutputFormat): string {
  return MIME_BY_OUTPUT[format];
}

/** Strict MIME for R2 master object bytes (storage extension). */
export function strictMimeForStorageExt(ext: DeliveryExt): string {
  return MIME_BY_STORAGE[ext];
}

function baseMime(header: string | null): string | null {
  if (!header) return null;
  return header.split(";")[0]?.trim().toLowerCase() ?? null;
}

/**
 * Always returns the deterministic MIME for the delivery mode.
 * If upstream disagrees, `upstreamMismatch` is true (emit metric / logs).
 */
export function resolveStrictDeliveryContentType(
  upstreamContentType: string | null,
  mode:
    | { kind: "transform"; format: DeliveryOutputFormat }
    | { kind: "r2"; storageExt: DeliveryExt }
): { contentType: string; upstreamMismatch: boolean } {
  const expected =
    mode.kind === "transform"
      ? strictMimeForDeliveryOutput(mode.format)
      : strictMimeForStorageExt(mode.storageExt);
  const up = baseMime(upstreamContentType);
  const upstreamMismatch = up !== null && up !== expected.toLowerCase();
  return { contentType: expected, upstreamMismatch };
}
