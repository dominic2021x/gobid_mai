import {
  DeleteObjectCommand,
  DeleteObjectsCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  type ListObjectsV2CommandInput,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { randomUUID } from "crypto";

import { normalizeR2PublicObjectUrl } from "@/lib/image/cdn";
import { normalizeClientMime } from "@/lib/upload/image-rules";

let cachedClient: S3Client | null = null;
let cachedParams: string | null = null;

export type R2EnvConfig = {
  client: S3Client;
  bucket: string;
  publicBaseUrl: string;
};

/**
 * Lazy S3 client for Cloudflare R2 (S3-compatible).
 * Returns null if mandatory env vars are missing.
 */
export function getR2EnvConfig(): R2EnvConfig | null {
  const accountId = process.env.R2_ACCOUNT_ID ?? process.env.CLOUDFLARE_R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const bucket = process.env.R2_BUCKET_NAME;
  /** Aceeași bază ca în browser — multe `.env` au doar `NEXT_PUBLIC_R2_PUBLIC_BASE_URL`. */
  const publicBaseUrl =
    process.env.R2_PUBLIC_BASE_URL?.trim() ||
    process.env.NEXT_PUBLIC_R2_PUBLIC_BASE_URL?.trim();

  if (!accountId || !accessKeyId || !secretAccessKey || !bucket || !publicBaseUrl) {
    return null;
  }

  const sig = `${accountId}:${accessKeyId}:${bucket}`;
  if (!cachedClient || cachedParams !== sig) {
    cachedParams = sig;
    cachedClient = new S3Client({
      region: "auto",
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId, secretAccessKey },
      /**
       * Fără asta, SDK-ul (3.729+) poate include CRC32 în presign; PUT-ul din browser cu `fetch`
       * nu trimite același checksum → 403 la R2 și erori CORS în consolă.
       * @see https://docs.aws.amazon.com/sdk-for-javascript/v3/developer-guide/s3-checksums.html
       */
      requestChecksumCalculation: "WHEN_REQUIRED",
    });
  }

  return {
    client: cachedClient,
    bucket,
    publicBaseUrl: publicBaseUrl.replace(/\/$/, ""),
  };
}

/** Baze publice configurate (server + client env), pentru mapare URL → cheie obiect. */
export function listConfiguredR2PublicBaseUrls(): string[] {
  const out = new Set<string>();
  for (const raw of [
    process.env.R2_PUBLIC_BASE_URL,
    process.env.NEXT_PUBLIC_R2_PUBLIC_BASE_URL,
  ]) {
    const u = raw?.trim().replace(/\/$/, "");
    if (u) out.add(u);
  }
  return [...out];
}

export function stripImageUrlQueryAndHash(url: string): string {
  const t = url.trim();
  const i = t.search(/[?#]/);
  return i === -1 ? t : t.slice(0, i);
}

function extractKeyUnderPublicBase(fullUrl: string, baseUrl: string): string | null {
  const base = baseUrl.replace(/\/$/, "");
  if (!fullUrl.startsWith(base + "/")) return null;
  const encodedKey = fullUrl.slice(base.length + 1);
  if (!encodedKey) return null;
  return encodedKey
    .split("/")
    .map((part) => decodeURIComponent(part))
    .join("/");
}

/** Endpoint S3 R2: `/{bucket}/uploads/...` */
function extractKeyFromR2S3ApiUrl(url: string, bucketName: string): string | null {
  try {
    const u = new URL(url.trim());
    if (!u.hostname.toLowerCase().endsWith(".r2.cloudflarestorage.com")) return null;
    const parts = u.pathname.split("/").filter(Boolean);
    if (parts.length >= 2 && parts[0] === bucketName) {
      return parts.slice(1).map((p) => decodeURIComponent(p)).join("/");
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Deduce cheia din bucket pentru ștergere DeleteObject — acoperă:
 * bază din `R2_PUBLIC_BASE_URL` sau `NEXT_PUBLIC_R2_PUBLIC_BASE_URL`, URL cu `?v=`,
 * hostname API S3 (`*.r2.cloudflarestorage.com`).
 */
export function resolveR2ObjectKeyFromProductImageUrl(
  rawUrl: string,
  bucketName: string
): string | null {
  let u = stripImageUrlQueryAndHash(rawUrl);
  try {
    u = normalizeR2PublicObjectUrl(u);
  } catch {
    /* ignore */
  }
  for (const base of listConfiguredR2PublicBaseUrls()) {
    const key = extractKeyUnderPublicBase(u, base);
    if (key) return key;
  }
  return extractKeyFromR2S3ApiUrl(u, bucketName);
}

export function buildObjectKey(userId: string, originalFilename: string): string {
  const safe = sanitizeFilename(originalFilename);
  return `uploads/${userId}/${randomUUID()}-${safe}`;
}

/**
 * Cheie R2 fără prefix UUID: `uploads/{userId}/{filename}`.
 * Folosit când numele fișierului este deja unic (ex. slug + cod anunț + fragment job).
 */
export function buildUserScopedUploadKey(userId: string, filename: string): string {
  const safe = sanitizeFilename(filename);
  return `uploads/${userId}/${safe}`;
}

/**
 * URL-uri R2 create cu `buildObjectKey` (prefix UUID + nume client, ex. `…-job.jpg`).
 * La mirror pe `product_id`, nu refolosim dedupe-ul după hash dacă punctul canonic încă e în acest format,
 * ca să putem regenera nume din titlu/SKU + WebP.
 */
export function isLegacyR2PresignedStylePublicUrl(publicUrl: string): boolean {
  try {
    const path = new URL(publicUrl.trim()).pathname;
    const seg = path.split("/").filter(Boolean).pop() ?? "";
    if (/job\.(jpe?g|png|webp|gif)$/i.test(seg)) return true;
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-/i.test(seg);
  } catch {
    return false;
  }
}

export function publicUrlForKey(publicBaseUrl: string, key: string): string {
  const segments = key.split("/").map((s) => encodeURIComponent(s));
  return `${publicBaseUrl.replace(/\/$/, "")}/${segments.join("/")}`;
}

function sanitizeFilename(name: string): string {
  const base = name.split(/[/\\]/).pop() ?? "image";
  const cleaned = base.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 180);
  return cleaned.length > 0 ? cleaned : "image.bin";
}

const UUID_LOOSE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Ensures key is `uploads/{userId}/{uuid}-{filename}` and belongs to the authenticated user.
 */
export function assertUserScopedObjectKey(key: string, userId: string): void {
  const prefix = `uploads/${userId}/`;
  if (!key.startsWith(prefix)) {
    throw new Error("Cheie de obiect invalidă.");
  }
  const rest = key.slice(prefix.length);
  if (rest.length < 38) {
    throw new Error("Cheie de obiect invalidă.");
  }
  if (rest[36] !== "-") {
    throw new Error("Cheie de obiect invalidă.");
  }
  const maybeUuid = rest.slice(0, 36);
  if (!UUID_LOOSE.test(maybeUuid)) {
    throw new Error("Cheie de obiect invalidă.");
  }
}

export async function presignPutObject(
  cfg: R2EnvConfig,
  key: string,
  contentType: string,
  expiresInSeconds: number
): Promise<string> {
  const ct = normalizeClientMime(contentType);
  const command = new PutObjectCommand({
    Bucket: cfg.bucket,
    Key: key,
    ContentType: ct,
  });
  return getSignedUrl(cfg.client, command, { expiresIn: expiresInSeconds });
}

export async function headObjectMeta(
  cfg: R2EnvConfig,
  key: string
): Promise<{ contentLength: number | undefined; contentType: string | undefined }> {
  const out = await cfg.client.send(
    new HeadObjectCommand({
      Bucket: cfg.bucket,
      Key: key,
    })
  );
  return {
    contentLength: out.ContentLength,
    contentType: out.ContentType,
  };
}

/** Upload binar din server (importuri / oglinzi URL), fără procesare pixeli. */
export async function putObjectBuffer(
  cfg: R2EnvConfig,
  key: string,
  body: Buffer,
  contentType: string,
  options?: { cacheControl?: string }
): Promise<void> {
  await cfg.client.send(
    new PutObjectCommand({
      Bucket: cfg.bucket,
      Key: key,
      Body: body,
      ContentType: normalizeClientMime(contentType),
      ...(options?.cacheControl ? { CacheControl: options.cacheControl } : {}),
    })
  );
}

/** Șterge obiectul din bucket; idempotent (S3/R2 acceptă chei inexistente). */
export async function deleteObjectByKey(cfg: R2EnvConfig, key: string): Promise<void> {
  await cfg.client.send(
    new DeleteObjectCommand({
      Bucket: cfg.bucket,
      Key: key,
    })
  );
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export type DeleteObjectRetryOptions = {
  /** Număr de încercări (minim 1). Implicit 5. */
  maxAttempts?: number;
  /** Pauză după eșec între încercări (ms). Implicit 150, 300, 600, 1200. */
  backoffMs?: readonly number[];
};

const DEFAULT_DELETE_BACKOFF_MS: readonly number[] = [150, 300, 600, 1200];

/**
 * Ștergere R2 cu retry și backoff explicit (150 → 300 → 600 → 1200 ms între încercări).
 * Implicit 5 încercări. Cron-safe: await async (setTimeout), fără busy-loop.
 */
export async function deleteObjectByKeyWithRetry(
  cfg: R2EnvConfig,
  key: string,
  opts?: DeleteObjectRetryOptions
): Promise<void> {
  const maxAttempts = Math.max(1, opts?.maxAttempts ?? 5);
  const backoffMs = opts?.backoffMs?.length ? opts.backoffMs : DEFAULT_DELETE_BACKOFF_MS;
  let lastErr: unknown;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      await deleteObjectByKey(cfg, key);
      return;
    } catch (e) {
      lastErr = e;
      if (attempt < maxAttempts - 1) {
        const waitMs = backoffMs[attempt] ?? backoffMs[backoffMs.length - 1] ?? 150;
        await delay(waitMs);
      }
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

/** S3 permite până la 1000 de chei per DeleteObjects; folosim marjă sigură pentru R2. */
const R2_DELETE_OBJECTS_CHUNK = 500;

/**
 * Șterge mai multe obiecte din R2 într-un singur request S3 DeleteObjects (mult mai rapid decât DeleteObject în buclă).
 * Chei duplicate sunt ignorate. La eșec parțial sau total pe lot, fallback la `deleteObjectByKeyWithRetry` per cheie.
 */
export async function deleteManyR2ObjectsWithRetry(
  cfg: R2EnvConfig,
  keys: Iterable<string>,
  opts?: DeleteObjectRetryOptions
): Promise<void> {
  const unique = [...new Set([...keys].filter((k): k is string => typeof k === "string" && k.length > 0))];
  if (unique.length === 0) return;

  for (let i = 0; i < unique.length; i += R2_DELETE_OBJECTS_CHUNK) {
    const chunk = unique.slice(i, i + R2_DELETE_OBJECTS_CHUNK);
    try {
      const out = await cfg.client.send(
        new DeleteObjectsCommand({
          Bucket: cfg.bucket,
          Delete: {
            Objects: chunk.map((Key) => ({ Key })),
            Quiet: true,
          },
        })
      );
      const errors = out.Errors ?? [];
      for (const e of errors) {
        const key = e.Key;
        if (!key) continue;
        try {
          await deleteObjectByKeyWithRetry(cfg, key, opts);
        } catch (err) {
          console.warn("[R2] deleteMany fallback failed for key:", key, err);
        }
      }
    } catch (batchErr) {
      console.warn("[R2] DeleteObjects batch failed, falling back per key:", batchErr);
      for (const key of chunk) {
        try {
          await deleteObjectByKeyWithRetry(cfg, key, opts);
        } catch (err) {
          console.warn("[R2] single delete failed:", key, err);
        }
      }
    }
  }
}

export type ListUploadsPageResult = {
  keys: string[];
  nextContinuationToken?: string;
};

/** Listare paginată (prefix R2). Folosit la job opțional orphan-check. */
export async function listObjectKeysPage(
  cfg: R2EnvConfig,
  options: {
    prefix: string;
    maxKeys?: number;
    continuationToken?: string;
  }
): Promise<ListUploadsPageResult> {
  const maxKeys = Math.max(1, Math.min(options.maxKeys ?? 500, 1000));
  const input: ListObjectsV2CommandInput = {
    Bucket: cfg.bucket,
    Prefix: options.prefix,
    MaxKeys: maxKeys,
  };
  const ct = options.continuationToken?.trim();
  if (ct) {
    input.ContinuationToken = ct;
  }
  const out = await cfg.client.send(new ListObjectsV2Command(input));
  const keys = (out.Contents ?? [])
    .map((c) => c.Key)
    .filter((k): k is string => typeof k === "string" && k.length > 0);
  return {
    keys,
    nextContinuationToken: out.NextContinuationToken,
  };
}
