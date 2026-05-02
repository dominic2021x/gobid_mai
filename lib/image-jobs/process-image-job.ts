/**
 * Procesează un singur image_job: fetch (timeout 5s) → SSRF → MIME → hash → R2 → products.images.
 */

import { createHash, randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import sharp from "sharp";

import { slugify } from "@/lib/slugify";
import { isAllowedImageMime, normalizeClientMime, UPLOAD_MAX_BYTES } from "@/lib/upload/image-rules";
import { isUrlHostedOnOurR2 } from "@/lib/upload/is-r2-public-url";
import {
  buildUserScopedUploadKey,
  getR2EnvConfig,
  isLegacyR2PresignedStylePublicUrl,
  publicUrlForKey,
  putObjectBuffer,
} from "@/lib/upload/r2-server";

import { IMAGE_JOB_FETCH_TIMEOUT_MS, IMAGE_JOB_MAX_ATTEMPTS } from "./constants";
import { tryDetectAndStoreFocalForUploadedImage } from "./detect-focal-point";
import { assertUrlSafeForFetch } from "./ssrf";
import type { ImageJobRow } from "./types";

function guessMimeFromMagic(buf: Buffer): string | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf.length >= 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return "image/png";
  if (buf.length >= 4 && buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x38) return "image/gif";
  if (buf.length >= 12 && buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46) return "image/webp";
  if (buf.length >= 100) {
    const head = buf.subarray(0, Math.min(200, buf.length)).toString("utf8").toLowerCase();
    if (head.includes("<svg") || head.trimStart().startsWith("<?xml")) return "image/svg+xml";
  }
  return null;
}

function extensionForMime(mime: string): string {
  const m = normalizeClientMime(mime);
  if (m === "image/png") return ".png";
  if (m === "image/webp") return ".webp";
  if (m === "image/gif") return ".gif";
  if (m === "image/svg+xml") return ".svg";
  return ".jpg";
}

async function toWebpIfEligible(
  input: Buffer,
  mime: string
): Promise<{ buffer: Buffer; mime: string }> {
  const normalized = normalizeClientMime(mime);
  // Preserve vector/animated formats; convert raster formats to WebP.
  if (normalized === "image/svg+xml" || normalized === "image/gif") {
    return { buffer: input, mime: normalized };
  }
  if (
    normalized === "image/jpeg" ||
    normalized === "image/png" ||
    normalized === "image/webp"
  ) {
    try {
      const out = await sharp(input)
        .webp({ quality: 78, effort: 6 })
        .toBuffer();
      return { buffer: out, mime: "image/webp" };
    } catch (e) {
      console.warn("[image-jobs] webp conversion failed, keeping original:", e);
      return { buffer: input, mime: normalized };
    }
  }
  return { buffer: input, mime: normalized };
}

/**
 * Nume fișier R2: slug titlu + cod anunț (SKU) + fragment job (unicitate între imagini).
 * Ex.: `bara-fata-mercedes-...-PIESE-059BF963DF3E-6D87A57502FA.webp`
 */
async function buildMirrorImageFilename(
  db: SupabaseClient,
  job: ImageJobRow,
  extWithDot: string
): Promise<string> {
  const ext = extWithDot.startsWith(".") ? extWithDot.slice(1) : extWithDot;
  let titleSlug = "listing";
  let skuPart = "anunt";
  if (job.product_id) {
    const { data, error } = await db
      .from("products")
      .select("slug,title,sku")
      .eq("id", job.product_id)
      .maybeSingle();
    if (!error && data) {
      const row = data as { slug?: string | null; title?: string | null; sku?: string | null };
      const slug = typeof row.slug === "string" && row.slug.trim() ? row.slug.trim() : "";
      const title = typeof row.title === "string" && row.title.trim() ? row.title.trim() : "";
      titleSlug = slug || slugify(title) || "listing";
      const sku = typeof row.sku === "string" && row.sku.trim() ? row.sku.trim() : "";
      skuPart =
        sku
          .replace(/[^a-zA-Z0-9-]+/g, "-")
          .replace(/^-+|-+$/g, "")
          .slice(0, 48)
          .toUpperCase() || "ANUNT";
    }
  }
  const jobFrag = job.id.replace(/-/g, "").slice(0, 12).toUpperCase();
  const stem = `${titleSlug}-${skuPart}-${jobFrag}`.replace(/-{2,}/g, "-");
  const maxStem = 160;
  const stemSafe = stem.length > maxStem ? stem.slice(0, maxStem).replace(/-+$/g, "") : stem;
  return `${stemSafe}.${ext}`;
}

type InsertUploadedImageResult =
  | { status: "inserted"; id: string }
  | { status: "duplicate_hash" }
  | { status: "error" };

async function insertUploadedImageRow(
  db: SupabaseClient,
  userId: string,
  storageKey: string,
  publicUrl: string,
  contentHash: string,
  byteSize: number,
): Promise<InsertUploadedImageResult> {
  const { data, error } = await db
    .from("uploaded_images")
    .insert({
      user_id: userId,
      storage_key: storageKey,
      public_url: publicUrl,
      content_hash: contentHash,
      byte_size: byteSize,
    })
    .select("id")
    .maybeSingle();

  if (error) {
    if ((error as { code?: string }).code === "23505") {
      return { status: "duplicate_hash" };
    }
    console.error("[image-jobs] insert uploaded_images", error);
    return { status: "error" };
  }
  const id = data && typeof (data as { id?: unknown }).id === "string" ? (data as { id: string }).id : null;
  if (id) return { status: "inserted", id };
  return { status: "error" };
}

async function replaceUrlInProduct(
  db: SupabaseClient,
  productId: string,
  oldUrl: string,
  newUrl: string
): Promise<void> {
  const { error } = await db.rpc("replace_product_image_url", {
    p_product_id: productId,
    p_old: oldUrl,
    p_new: newUrl,
  });
  if (error) {
    console.error("[image-jobs] replace_product_image_url rpc", error);
  }
}

async function readBodyWithHash(
  res: Response,
  maxBytes: number
): Promise<{ buffer: Buffer; hashHex: string }> {
  const hash = createHash("sha256");
  const chunks: Buffer[] = [];
  let total = 0;

  if (!res.body) {
    throw new Error("Răspuns fără corp.");
  }

  const reader = res.body.getReader();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value || value.byteLength === 0) continue;
      const buf = Buffer.from(value);
      total += buf.length;
      if (total > maxBytes) {
        throw new Error(`Fișier prea mare (max ${maxBytes} bytes).`);
      }
      hash.update(buf);
      chunks.push(buf);
    }
  } finally {
    reader.releaseLock();
  }

  return {
    buffer: chunks.length === 0 ? Buffer.alloc(0) : Buffer.concat(chunks),
    hashHex: hash.digest("hex"),
  };
}

async function markJobDone(
  db: SupabaseClient,
  jobId: string,
  fields: {
    content_hash: string | null;
    result_public_url: string | null;
    storage_key: string | null;
  }
): Promise<void> {
  const { error } = await db
    .from("image_jobs")
    .update({
      status: "done",
      content_hash: fields.content_hash,
      result_public_url: fields.result_public_url,
      storage_key: fields.storage_key,
      error_message: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", jobId);
  if (error) {
    console.error("[image-jobs] markJobDone", error);
  }
}

/**
 * O încercare: poate arunca pentru retry (rețea, HTTP 5xx, timeout).
 */
export async function processOneImageJobAttempt(db: SupabaseClient, job: ImageJobRow): Promise<void> {
  const sourceUrl = job.source_url.trim();
  if (!sourceUrl) {
    throw new Error("URL gol.");
  }

  if (isUrlHostedOnOurR2(sourceUrl)) {
    await markJobDone(db, job.id, {
      content_hash: job.content_hash,
      result_public_url: sourceUrl,
      storage_key: null,
    });
    return;
  }

  if (!/^https?:\/\//i.test(sourceUrl)) {
    throw new Error("URL non-http(s).");
  }

  const cfg = getR2EnvConfig();
  if (!cfg) {
    throw new Error("R2 neconfigurat.");
  }

  await assertUrlSafeForFetch(sourceUrl);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), IMAGE_JOB_FETCH_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(sourceUrl, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "User-Agent": "GoBidImageJob/1.0 (+https://gobid.ro)",
        Accept: "image/*,*/*;q=0.8",
      },
    });
  } catch (e: unknown) {
    clearTimeout(timer);
    const msg = e instanceof Error ? e.message : "Fetch eșuat";
    throw new Error(msg);
  } finally {
    clearTimeout(timer);
  }

  const finalUrl = res.url || sourceUrl;
  if (finalUrl !== sourceUrl) {
    await assertUrlSafeForFetch(finalUrl);
  }

  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }

  let headerMime = res.headers.get("content-type")?.split(";")[0]?.trim() ?? "";
  headerMime = normalizeClientMime(headerMime || "application/octet-stream");

  const { buffer: buf, hashHex } = await readBodyWithHash(res, UPLOAD_MAX_BYTES);
  if (buf.length === 0) {
    throw new Error("Corp gol.");
  }

  const { data: existingByHash } = await db
    .from("uploaded_images")
    .select("public_url")
    .eq("content_hash", hashHex)
    .is("deleted_at", null)
    .maybeSingle();

  const dedupeUrlRaw = existingByHash?.public_url;
  const dedupeUrl =
    typeof dedupeUrlRaw === "string" && dedupeUrlRaw.trim() ? dedupeUrlRaw.trim() : null;
  /** Refolosim același fișier doar dacă nu e mirror cu URL canonic „presign vechi” (ex. uuid-job.jpg). */
  const reuseHashDedupe =
    !!dedupeUrl &&
    (!job.product_id || !isLegacyR2PresignedStylePublicUrl(dedupeUrl));

  let publicUrl: string;
  let storageKeyOut: string | null = null;

  if (reuseHashDedupe) {
    publicUrl = dedupeUrl as string;
  } else {
    let mime = headerMime;
    if (!isAllowedImageMime(mime)) {
      const guessed = guessMimeFromMagic(buf);
      if (guessed && isAllowedImageMime(normalizeClientMime(guessed))) {
        mime = normalizeClientMime(guessed);
      } else {
        throw new Error(`MIME neacceptat: ${headerMime}`);
      }
    } else {
      mime = normalizeClientMime(mime);
    }

    const converted = await toWebpIfEligible(buf, mime);
    const bufferToStore = converted.buffer;
    const mimeToStore = converted.mime;

    const filename = await buildMirrorImageFilename(db, job, extensionForMime(mimeToStore));
    const key = buildUserScopedUploadKey(job.user_id, filename);
    publicUrl = publicUrlForKey(cfg.publicBaseUrl, key);
    storageKeyOut = key;
    await putObjectBuffer(cfg, key, bufferToStore, mimeToStore);
    const ins = await insertUploadedImageRow(
      db,
      job.user_id,
      key,
      publicUrl,
      hashHex,
      bufferToStore.length
    );
    if (ins.status === "inserted") {
      void tryDetectAndStoreFocalForUploadedImage(db, ins.id, bufferToStore, mimeToStore).catch((e) =>
        console.error("[image-jobs] focal detection", e),
      );
    } else if (ins.status === "duplicate_hash" && storageKeyOut) {
      const { data: rowForHash } = await db
        .from("uploaded_images")
        .select("id, user_id, public_url")
        .eq("content_hash", hashHex)
        .is("deleted_at", null)
        .maybeSingle();
      if (rowForHash?.user_id === job.user_id) {
        const { error: hashDupErr } = await db
          .from("uploaded_images")
          .update({
            storage_key: storageKeyOut,
            public_url: publicUrl,
            byte_size: bufferToStore.length,
          })
          .eq("user_id", job.user_id)
          .eq("content_hash", hashHex);
        if (hashDupErr) {
          console.error("[image-jobs] uploaded_images update după conflict hash", hashDupErr);
        }
      } else if (rowForHash?.public_url) {
        publicUrl = String(rowForHash.public_url);
      }

      const { data: rowAfter } = await db
        .from("uploaded_images")
        .select("id")
        .eq("user_id", job.user_id)
        .eq("content_hash", hashHex)
        .maybeSingle();
      const fid =
        rowAfter && typeof (rowAfter as { id?: unknown }).id === "string"
          ? (rowAfter as { id: string }).id
          : null;
      if (fid) {
        void tryDetectAndStoreFocalForUploadedImage(db, fid, bufferToStore, mimeToStore).catch((e) =>
          console.error("[image-jobs] focal detection", e),
        );
      }
    }
  }

  if (job.product_id) {
    await replaceUrlInProduct(db, job.product_id, job.replace_source_url, publicUrl);
  }

  await markJobDone(db, job.id, {
    content_hash: hashHex,
    result_public_url: publicUrl,
    storage_key: storageKeyOut,
  });
}

function buildImportMirrorFilename(filenameStem: string, hashHex: string, mime: string): string {
  const extWithDot = extensionForMime(mime);
  const ext = extWithDot.startsWith(".") ? extWithDot.slice(1) : extWithDot;
  const base = slugify(filenameStem).slice(0, 80) || "listing";
  const frag = hashHex.slice(0, 12);
  const rand = randomUUID().replace(/-/g, "").slice(0, 10);
  let stem = `${base}-${frag}-${rand}`.replace(/-{2,}/g, "-");
  stem = stem.length > 140 ? stem.slice(0, 140).replace(/-+$/g, "") : stem;
  return `${stem}.${ext}`;
}

/**
 * Import masiv (produs încă inexistent): același flux ca image_job dar fără `image_jobs` și fără patch pe produs.
 * Returnează URL public R2 (sau URL deja pe R2-ul nostru nemodificat).
 */
export async function mirrorExternalUrlToR2ForImportUser(
  db: SupabaseClient,
  userId: string,
  sourceUrl: string,
  filenameStem: string
): Promise<string> {
  const trimmed = sourceUrl.trim();
  if (!trimmed) throw new Error("URL gol.");
  if (isUrlHostedOnOurR2(trimmed)) return trimmed;
  if (!/^https?:\/\//i.test(trimmed)) throw new Error("URL non-http(s).");

  const cfg = getR2EnvConfig();
  if (!cfg) throw new Error("R2 neconfigurat.");

  await assertUrlSafeForFetch(trimmed);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), IMAGE_JOB_FETCH_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(trimmed, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "User-Agent": "GoBidImageJob/1.0 (+https://gobid.ro)",
        Accept: "image/*,*/*;q=0.8",
      },
    });
  } catch (e: unknown) {
    clearTimeout(timer);
    const msg = e instanceof Error ? e.message : "Fetch eșuat";
    throw new Error(msg);
  } finally {
    clearTimeout(timer);
  }

  const finalUrl = res.url || trimmed;
  if (finalUrl !== trimmed) {
    await assertUrlSafeForFetch(finalUrl);
  }

  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }

  let headerMime = res.headers.get("content-type")?.split(";")[0]?.trim() ?? "";
  headerMime = normalizeClientMime(headerMime || "application/octet-stream");

  const { buffer: buf, hashHex } = await readBodyWithHash(res, UPLOAD_MAX_BYTES);
  if (buf.length === 0) {
    throw new Error("Corp gol.");
  }

  const { data: existingByHash } = await db
    .from("uploaded_images")
    .select("public_url")
    .eq("content_hash", hashHex)
    .is("deleted_at", null)
    .maybeSingle();

  const dedupeUrlRaw = existingByHash?.public_url;
  const dedupeUrl =
    typeof dedupeUrlRaw === "string" && dedupeUrlRaw.trim() ? dedupeUrlRaw.trim() : null;
  const reuseHashDedupe = !!dedupeUrl;

  let publicUrl: string;
  let storageKeyOut: string | null = null;

  if (reuseHashDedupe) {
    publicUrl = dedupeUrl as string;
  } else {
    let mime = headerMime;
    if (!isAllowedImageMime(mime)) {
      const guessed = guessMimeFromMagic(buf);
      if (guessed && isAllowedImageMime(normalizeClientMime(guessed))) {
        mime = normalizeClientMime(guessed);
      } else {
        throw new Error(`MIME neacceptat: ${headerMime}`);
      }
    } else {
      mime = normalizeClientMime(mime);
    }

    const converted = await toWebpIfEligible(buf, mime);
    const bufferToStore = converted.buffer;
    const mimeToStore = converted.mime;

    const filename = buildImportMirrorFilename(filenameStem, hashHex, mimeToStore);
    const key = buildUserScopedUploadKey(userId, filename);
    publicUrl = publicUrlForKey(cfg.publicBaseUrl, key);
    storageKeyOut = key;
    await putObjectBuffer(cfg, key, bufferToStore, mimeToStore);
    const ins = await insertUploadedImageRow(
      db,
      userId,
      key,
      publicUrl,
      hashHex,
      bufferToStore.length
    );
    if (ins.status === "inserted") {
      void tryDetectAndStoreFocalForUploadedImage(db, ins.id, bufferToStore, mimeToStore).catch((e) =>
        console.error("[image-jobs] focal detection", e)
      );
    } else if (ins.status === "duplicate_hash" && storageKeyOut) {
      const { data: rowForHash } = await db
        .from("uploaded_images")
        .select("id, user_id, public_url")
        .eq("content_hash", hashHex)
        .is("deleted_at", null)
        .maybeSingle();
      if (rowForHash?.user_id === userId) {
        const { error: hashDupErr } = await db
          .from("uploaded_images")
          .update({
            storage_key: storageKeyOut,
            public_url: publicUrl,
            byte_size: bufferToStore.length,
          })
          .eq("user_id", userId)
          .eq("content_hash", hashHex);
        if (hashDupErr) {
          console.error("[image-jobs] uploaded_images update după conflict hash", hashDupErr);
        }
      } else if (rowForHash?.public_url) {
        publicUrl = String(rowForHash.public_url);
      }

      const { data: rowAfter } = await db
        .from("uploaded_images")
        .select("id")
        .eq("user_id", userId)
        .eq("content_hash", hashHex)
        .maybeSingle();
      const fid =
        rowAfter && typeof (rowAfter as { id?: unknown }).id === "string"
          ? (rowAfter as { id: string }).id
          : null;
      if (fid) {
        void tryDetectAndStoreFocalForUploadedImage(db, fid, bufferToStore, mimeToStore).catch((e) =>
          console.error("[image-jobs] focal detection", e)
        );
      }
    }
  }

  return publicUrl;
}

/** Retry-uri la fel ca la worker (`IMAGE_JOB_MAX_ATTEMPTS`). */
export async function mirrorExternalUrlToR2ForImportUserWithRetries(
  db: SupabaseClient,
  userId: string,
  sourceUrl: string,
  filenameStem: string
): Promise<string> {
  let lastErr: Error | null = null;
  for (let attempt = 1; attempt <= IMAGE_JOB_MAX_ATTEMPTS; attempt++) {
    try {
      return await mirrorExternalUrlToR2ForImportUser(db, userId, sourceUrl, filenameStem);
    } catch (e: unknown) {
      lastErr = e instanceof Error ? e : new Error(String(e));
    }
  }
  throw lastErr ?? new Error("Mirror eșuat.");
}

export async function runImageJobWithRetries(db: SupabaseClient, job: ImageJobRow): Promise<void> {
  let lastErr: Error | null = null;
  for (let attempt = 1; attempt <= IMAGE_JOB_MAX_ATTEMPTS; attempt++) {
    try {
      await processOneImageJobAttempt(db, job);
      await db
        .from("image_jobs")
        .update({
          attempts: (job.attempts ?? 0) + attempt,
          updated_at: new Date().toISOString(),
        })
        .eq("id", job.id);
      return;
    } catch (e: unknown) {
      lastErr = e instanceof Error ? e : new Error(String(e));
    }
  }

  await db
    .from("image_jobs")
    .update({
      status: "failed",
      error_message: (lastErr?.message ?? "Eroare necunoscută").slice(0, 2000),
      attempts: (job.attempts ?? 0) + IMAGE_JOB_MAX_ATTEMPTS,
      updated_at: new Date().toISOString(),
    })
    .eq("id", job.id);
}
