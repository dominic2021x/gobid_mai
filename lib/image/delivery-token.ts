/**
 * HMAC-signed delivery tokens (Web Crypto — Node 18+ and Edge).
 * v2: includes DPR. v1: legacy (dpr implicitly 1) — still verified for old links.
 */
const ENC = new TextEncoder();

export type DeliveryExt = "avif" | "webp" | "jpeg";

function toBase64Url(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]!);
  const b64 = btoa(s);
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(s: string): ArrayBuffer | null {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  const norm = s.replace(/-/g, "+").replace(/_/g, "/") + pad;
  try {
    const bin = atob(norm);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out.buffer;
  } catch {
    return null;
  }
}

async function importHmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    ENC.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

export type DeliverySignInput = {
  hash: string;
  w: number;
  dpr: number;
  exp: number;
  ext: DeliveryExt;
};

export function buildDeliveryPayloadV2(p: DeliverySignInput): string {
  return `v2|${p.hash.toLowerCase()}|${p.w}|${p.dpr}|${p.exp}|${p.ext}`;
}

export function buildDeliveryPayloadV1(p: { hash: string; w: number; exp: number; ext: DeliveryExt }): string {
  return `v1|${p.hash.toLowerCase()}|${p.w}|${p.exp}|${p.ext}`;
}

export async function signDeliveryPayloadV2(secret: string, p: DeliverySignInput): Promise<string> {
  const key = await importHmacKey(secret);
  const payload = buildDeliveryPayloadV2(p);
  const sigBuf = await crypto.subtle.sign("HMAC", key, ENC.encode(payload));
  return toBase64Url(sigBuf);
}

export async function verifyDeliverySignature(
  secret: string,
  p: DeliverySignInput,
  sigBase64Url: string
): Promise<boolean> {
  const key = await importHmacKey(secret);
  const sigBuf = fromBase64Url(sigBase64Url);
  if (!sigBuf) return false;

  const v2 = buildDeliveryPayloadV2(p);
  const ok2 = await crypto.subtle.verify("HMAC", key, sigBuf, ENC.encode(v2));
  if (ok2) return true;

  if (p.dpr === 1) {
    const v1 = buildDeliveryPayloadV1({
      hash: p.hash,
      w: p.w,
      exp: p.exp,
      ext: p.ext,
    });
    return crypto.subtle.verify("HMAC", key, sigBuf, ENC.encode(v1));
  }

  return false;
}

export function getDeliverySecret(): string | null {
  const s = process.env.IMAGE_DELIVERY_SECRET?.trim();
  return s && s.length >= 16 ? s : null;
}
