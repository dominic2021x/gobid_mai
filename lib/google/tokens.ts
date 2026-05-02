import "server-only";
import { createHmac, randomBytes, createCipheriv, createDecipheriv } from "crypto";

const ALG = "aes-256-gcm";
const IV_LEN = 12;
const AUTH_TAG_LEN = 16;
const KEY_LEN_BYTES = 32;

export interface TokenSet {
  accessToken: string;
  refreshToken: string;
  expiryDate: number;
}

function getKeyBuffer(): Buffer {
  const raw = process.env.GROWTH_TOKENS_KEY;
  if (!raw || typeof raw !== "string") {
    throw new Error("GROWTH_TOKENS_KEY is not set");
  }
  const trimmed = raw.trim();
  let key: Buffer;
  if (/^[0-9a-fA-F]+$/.test(trimmed) && trimmed.length === KEY_LEN_BYTES * 2) {
    key = Buffer.from(trimmed, "hex");
  } else if (/^[A-Za-z0-9+/]+=*$/.test(trimmed)) {
    key = Buffer.from(trimmed, "base64");
  } else {
    throw new Error("GROWTH_TOKENS_KEY must be 32 bytes as hex (64 chars) or base64");
  }
  if (key.length !== KEY_LEN_BYTES) {
    throw new Error(`GROWTH_TOKENS_KEY must be exactly ${KEY_LEN_BYTES} bytes (got ${key.length})`);
  }
  return key;
}

/**
 * Encrypt token set with AES-256-GCM. Returns a single blob string (iv:authTag:ciphertext in base64).
 */
export function encryptTokens(tokens: TokenSet): string {
  const key = getKeyBuffer();
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALG, key, iv, { authTagLength: AUTH_TAG_LEN });
  const payload = JSON.stringify({
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    expiryDate: tokens.expiryDate,
  });
  const encrypted = Buffer.concat([
    cipher.update(payload, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  const blob = Buffer.concat([iv, authTag, encrypted]);
  return blob.toString("base64");
}

/**
 * Decrypt blob from encryptTokens. Never log the returned object.
 */
export function decryptTokens(blob: string): TokenSet {
  const key = getKeyBuffer();
  const buf = Buffer.from(blob, "base64");
  if (buf.length < IV_LEN + AUTH_TAG_LEN + 1) {
    throw new Error("Invalid token blob");
  }
  const iv = buf.subarray(0, IV_LEN);
  const authTag = buf.subarray(IV_LEN, IV_LEN + AUTH_TAG_LEN);
  const ciphertext = buf.subarray(IV_LEN + AUTH_TAG_LEN);
  const decipher = createDecipheriv(ALG, key, iv, { authTagLength: AUTH_TAG_LEN });
  decipher.setAuthTag(authTag);
  const json = decipher.update(ciphertext) + decipher.final("utf8");
  const parsed = JSON.parse(json) as TokenSet;
  if (
    typeof parsed.accessToken !== "string" ||
    typeof parsed.refreshToken !== "string" ||
    typeof parsed.expiryDate !== "number"
  ) {
    throw new Error("Invalid decrypted token structure");
  }
  return parsed;
}

export interface GrowthIntegrationRow {
  id: string;
  provider: string;
  product?: string;
  token_encrypted: string;
  meta: Record<string, unknown>;
}

/**
 * Refresh access token if expired. Returns valid access token.
 * Calls Google OAuth2 refresh endpoint and updates all rows for the same provider (e.g. all google products).
 * Never logs tokens.
 */
export async function refreshAccessTokenIfNeeded(
  integrationRow: GrowthIntegrationRow
): Promise<string> {
  const tokens = decryptTokens(integrationRow.token_encrypted);
  const now = Date.now();
  const bufferMs = 5 * 60 * 1000; // 5 min buffer
  if (tokens.expiryDate > now + bufferMs) {
    return tokens.accessToken;
  }
  if (!tokens.refreshToken) {
    throw new Error("Refresh token missing");
  }
  const clientId = process.env.GROWTH_GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GROWTH_GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("GROWTH_GOOGLE_CLIENT_ID or GROWTH_GOOGLE_CLIENT_SECRET not set");
  }
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: tokens.refreshToken,
    grant_type: "refresh_token",
  });
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Token refresh failed: ${res.status} ${errText.slice(0, 200)}`);
  }
  const data = (await res.json()) as { access_token: string; expires_in?: number };
  const newExpiry = Date.now() + (data.expires_in ?? 3600) * 1000;
  const newTokens: TokenSet = {
    accessToken: data.access_token,
    refreshToken: tokens.refreshToken,
    expiryDate: newExpiry,
  };
  const encrypted = encryptTokens(newTokens);
  const { createAdminClient } = await import("@/lib/supabase/admin");
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("growth_integrations")
    .update({ token_encrypted: encrypted, updated_at: new Date().toISOString() })
    .eq("provider", integrationRow.provider);
  if (error) throw new Error(error.message);
  return newTokens.accessToken;
}
