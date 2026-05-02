import { buildCanonicalDeliverUrl } from "@/lib/image/delivery-query";
import { emitImageDeliveryMetric } from "@/lib/image/delivery-metrics";
import { clampDeliveryTtlSeconds, wasDeliveryTtlClamped } from "@/lib/image/delivery-ttl";
import { getDeliverySecret, signDeliveryPayloadV2 } from "@/lib/image/delivery-token";
import type { MasterImageExt } from "@/lib/upload/optimized-image-keys";

const WIDTH_PRESETS = {
  thumb: 300,
  card: 600,
  full: 1200,
} as const;

/** Site origin for absolute delivery URLs (signing is host-agnostic). */
export function getSiteOrigin(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/$/, "");
  if (explicit) return explicit;
  const vercel = process.env.VERCEL_URL?.trim();
  if (vercel) return `https://${vercel.replace(/^https?:\/\//, "")}`;
  return "http://localhost:3000";
}

/**
 * Base URL for signed image delivery (Worker-first in production).
 * Set `NEXT_PUBLIC_IMAGE_DELIVERY_URL` to the full delivery entry (e.g. `https://img.example.com/api/image/deliver`).
 * If only origin is given, path defaults to `/api/image/deliver`.
 */
export function getImageDeliveryEndpointBase(): URL {
  const explicit = process.env.NEXT_PUBLIC_IMAGE_DELIVERY_URL?.trim();
  if (explicit) {
    const u = new URL(explicit);
    if (u.pathname === "" || u.pathname === "/") {
      u.pathname = "/api/image/deliver";
    }
    return u;
  }
  return new URL("/api/image/deliver", getSiteOrigin());
}

export type SignedDeliverySet = {
  thumb: string;
  card: string;
  full: string;
  /** Optional retina (dpr=2) — same logical widths, 2× pixels for sharp displays. */
  thumb2x?: string;
  card2x?: string;
  full2x?: string;
};

async function buildOne(
  signingSecret: string,
  hash: string,
  w: number,
  dpr: number,
  exp: number,
  masterExt: MasterImageExt
): Promise<string> {
  const sig = await signDeliveryPayloadV2(signingSecret, { hash, w, dpr, exp, ext: masterExt });
  const u = getImageDeliveryEndpointBase();
  u.searchParams.set("hash", hash);
  u.searchParams.set("w", String(w));
  u.searchParams.set("dpr", String(dpr));
  u.searchParams.set("exp", String(exp));
  u.searchParams.set("ext", masterExt);
  u.searchParams.set("sig", sig);
  return buildCanonicalDeliverUrl(u).toString();
}

/**
 * HMAC-signed URLs to `/api/image/deliver` (v2: includes DPR).
 * Proxies image bytes on your domain (no 302 to R2 for clients).
 */
export async function buildSignedDeliveryUrls(
  contentHash: string,
  masterExt: MasterImageExt,
  ttlSeconds: number
): Promise<{ urls: SignedDeliverySet; exp: number; ttlSecondsApplied: number } | null> {
  const secret = getDeliverySecret();
  if (!secret) return null;
  const signingSecret: string = secret;

  const ttl = clampDeliveryTtlSeconds(ttlSeconds);
  emitImageDeliveryMetric({
    kind: "signed_url_mint",
    ttlRequested: ttlSeconds,
    ttlApplied: ttl,
    ttlClamped: wasDeliveryTtlClamped(ttlSeconds, ttl),
  });
  const exp = Math.floor(Date.now() / 1000) + ttl;
  const hash = contentHash.toLowerCase();

  const [thumb, card, full, thumb2x, card2x, full2x] = await Promise.all([
    buildOne(signingSecret, hash, WIDTH_PRESETS.thumb, 1, exp, masterExt),
    buildOne(signingSecret, hash, WIDTH_PRESETS.card, 1, exp, masterExt),
    buildOne(signingSecret, hash, WIDTH_PRESETS.full, 1, exp, masterExt),
    buildOne(signingSecret, hash, WIDTH_PRESETS.thumb, 2, exp, masterExt),
    buildOne(signingSecret, hash, WIDTH_PRESETS.card, 2, exp, masterExt),
    buildOne(signingSecret, hash, WIDTH_PRESETS.full, 2, exp, masterExt),
  ]);

  return {
    urls: {
      thumb,
      card,
      full,
      thumb2x,
      card2x,
      full2x,
    },
    exp,
    ttlSecondsApplied: ttl,
  };
}

export { WIDTH_PRESETS };
