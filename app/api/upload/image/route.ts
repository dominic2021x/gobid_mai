import { createHash } from "crypto";
import { NextRequest, NextResponse } from "next/server";

import { buildSignedDeliveryUrls, getImageDeliveryEndpointBase, getSiteOrigin } from "@/lib/image/delivery-urls";
import { resolveAuthenticatedApiUser } from "@/lib/auth/resolveAuthenticatedApiUser";
import { RateLimitError } from "@/lib/security/rateLimit";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabase";
import {
  guessImageMimeFromFilename,
  isAllowedImageMime,
  normalizeClientMime,
  UPLOAD_MAX_BYTES,
} from "@/lib/upload/image-rules";
import { bufferLooksLikeRasterImage } from "@/lib/upload/magic-bytes";
import { buildGlobalMasterKey } from "@/lib/upload/optimized-image-keys";
import { getR2EnvConfig, publicUrlForKey, putObjectBuffer } from "@/lib/upload/r2-server";
import { buildOptimizedMaster } from "@/lib/upload/server-optimized-image";
import { enforceUploadRateLimit } from "@/lib/upload/upload-rate-limit";

/**
 * Enterprise image upload: single AVIF/WebP/JPEG master (≤1200px), global SHA-256 dedupe,
 * signed delivery URLs + Cloudflare Image Resizing for thumb/card/full.
 *
 * Cold vs warm: JSON includes `encodeMs` (Sharp only) and `processingMs` (total). Cold starts
 * add 50–300ms+ not broken out here.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const maxDuration = 60;

const R2_CACHE_CONTROL = "public, max-age=31536000, immutable";

/** Signed links default TTL (immutable pixels — safe to extend). */
const DELIVERY_TTL_SECONDS = 365 * 24 * 60 * 60;

type VariantUrls = {
  thumb: string;
  card: string;
  full: string;
  thumb2x?: string;
  card2x?: string;
  full2x?: string;
};

function hashBufferSha256(buf: Buffer): string {
  return createHash("sha256").update(buf).digest("hex");
}

function coerceVariantUrls(row: {
  public_url: string;
  variant_urls: unknown;
}): VariantUrls | null {
  const v = row.variant_urls;
  if (
    v &&
    typeof v === "object" &&
    "thumb" in v &&
    "card" in v &&
    "full" in v &&
    typeof (v as VariantUrls).thumb === "string" &&
    typeof (v as VariantUrls).card === "string" &&
    typeof (v as VariantUrls).full === "string"
  ) {
    return v as VariantUrls;
  }
  const u = row.public_url;
  if (typeof u === "string" && u.length > 0) {
    return { thumb: u, card: u, full: u };
  }
  return null;
}

async function findExistingByHashGlobal(
  db: SupabaseClient,
  contentHash: string
): Promise<{ variant_urls: VariantUrls; duplicate: true } | null> {
  const { data, error } = await db
    .from("uploaded_images")
    .select("public_url, variant_urls, storage_key")
    .eq("content_hash", contentHash)
    .is("deleted_at", null)
    .maybeSingle();

  if (error || !data) return null;
  const urls = coerceVariantUrls(data as { public_url: string; variant_urls: unknown });
  if (!urls) return null;
  return { variant_urls: urls, duplicate: true };
}

export async function POST(request: NextRequest) {
  const t0 = performance.now();

  try {
    const user = await resolveAuthenticatedApiUser(request);
    if (!user?.id) {
      return NextResponse.json({ error: "Autentificare necesară." }, { status: 401 });
    }

    const db = supabaseAdmin;
    if (!db) {
      return NextResponse.json({ error: "Configurație server incompletă." }, { status: 500 });
    }

    const cfg = getR2EnvConfig();
    if (!cfg) {
      return NextResponse.json(
        { error: "Stocare obiecte (R2) nu este configurată pe server." },
        { status: 503 }
      );
    }

    const ct = request.headers.get("content-type") ?? "";
    if (!ct.includes("multipart/form-data")) {
      return NextResponse.json(
        { error: "Content-Type trebuie să fie multipart/form-data (câmpul file)." },
        { status: 415 }
      );
    }

    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      return NextResponse.json({ error: "Body multipart invalid." }, { status: 400 });
    }

    const raw = form.get("file");
    if (!(raw instanceof Blob)) {
      return NextResponse.json({ error: "Lipsește câmpul file." }, { status: 400 });
    }

    const ab = await raw.arrayBuffer();
    const buffer = Buffer.from(ab);

    if (buffer.length === 0) {
      return NextResponse.json({ error: "Fișier gol." }, { status: 400 });
    }
    if (buffer.length > UPLOAD_MAX_BYTES) {
      return NextResponse.json(
        { error: `Fișier prea mare (max ${UPLOAD_MAX_BYTES / 1024 / 1024}MB).` },
        { status: 400 }
      );
    }

    if (!bufferLooksLikeRasterImage(buffer)) {
      return NextResponse.json(
        { error: "Conținutul nu arată ca o imagine raster (magic bytes)." },
        { status: 415 }
      );
    }

    const file = raw as File;
    let mime = normalizeClientMime(file.type || "application/octet-stream");
    if (!isAllowedImageMime(mime)) {
      const guessed = guessImageMimeFromFilename(file.name || "image.jpg");
      if (guessed && isAllowedImageMime(normalizeClientMime(guessed))) {
        mime = normalizeClientMime(guessed);
      }
    }
    if (!isAllowedImageMime(mime)) {
      return NextResponse.json(
        { error: "Tip MIME neacceptat." },
        { status: 415 }
      );
    }

    await enforceUploadRateLimit(user.id);

    const contentHash = hashBufferSha256(buffer);

    const existing = await findExistingByHashGlobal(db, contentHash);
    if (existing) {
      const processingMs = Math.round(performance.now() - t0);
      return NextResponse.json({
        success: true,
        duplicate: true,
        contentHash,
        urls: existing.variant_urls,
        delivery: null,
        processingMs,
        encodeMs: 0,
        skippedResize: null,
      });
    }

    let master: Awaited<ReturnType<typeof buildOptimizedMaster>>;
    try {
      master = await buildOptimizedMaster(buffer);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Procesare imagine eșuată.";
      return NextResponse.json({ error: msg }, { status: 400 });
    }

    const storageKey = buildGlobalMasterKey(contentHash, master.ext);
    const legacyPublicUrl = publicUrlForKey(cfg.publicBaseUrl, storageKey);

    await putObjectBuffer(cfg, storageKey, master.buffer, master.contentType, {
      cacheControl: R2_CACHE_CONTROL,
    });

    const signed = await buildSignedDeliveryUrls(contentHash, master.ext, DELIVERY_TTL_SECONDS);
    const variant_urls: VariantUrls = signed
      ? signed.urls
      : {
          thumb: legacyPublicUrl,
          card: legacyPublicUrl,
          full: legacyPublicUrl,
        };

    const { error: insErr } = await db.from("uploaded_images").insert({
      user_id: user.id,
      storage_key: storageKey,
      public_url: variant_urls.full,
      content_hash: contentHash,
      byte_size: master.buffer.length,
      variant_urls,
    });

    if (insErr) {
      const code = (insErr as { code?: string }).code;
      if (code === "23505") {
        const again = await findExistingByHashGlobal(db, contentHash);
        if (again) {
          const processingMs = Math.round(performance.now() - t0);
          return NextResponse.json({
            success: true,
            duplicate: true,
            contentHash,
            urls: again.variant_urls,
            delivery: null,
            processingMs,
            encodeMs: master.encodeMs,
            skippedResize: master.skippedResize,
          });
        }
      }
      console.error("[upload/image] insert uploaded_images", insErr);
      return NextResponse.json({ error: "Nu s-a putut salva metadata imaginii." }, { status: 500 });
    }

    const processingMs = Math.round(performance.now() - t0);

    return NextResponse.json({
      success: true,
      duplicate: false,
      contentHash,
      storageKey,
      masterFormat: master.ext,
      urls: variant_urls,
      delivery: signed
        ? {
            expiresAt: signed.exp,
            ttlSeconds: signed.ttlSecondsApplied,
            siteOrigin: getSiteOrigin(),
            deliveryBaseUrl: getImageDeliveryEndpointBase().href,
          }
        : null,
      bytes: {
        master: master.buffer.length,
      },
      encodeMs: master.encodeMs,
      processingMs,
      skippedResize: master.skippedResize,
      benchmarks: {
        note:
          "encodeMs = Sharp only; processingMs includes hashing, R2 PUT, DB. Cold start adds extra latency not itemized.",
      },
    });
  } catch (e: unknown) {
    if (e instanceof RateLimitError) {
      return NextResponse.json({ error: e.message }, { status: 429 });
    }
    const msg = e instanceof Error ? e.message : "Eroare la încărcare.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    endpoint: "POST /api/upload/image",
    runtime: "nodejs",
    maxInputBytes: UPLOAD_MAX_BYTES,
    master: "single AVIF (fallback WebP), max 1200px bounding box",
    dedupe: "SHA-256 global (unique per active row)",
    delivery: "GET /api/image/deliver (edge) → Cloudflare Image Resizing, format=auto",
    signing: "IMAGE_DELIVERY_SECRET required for signed URLs",
    migration: "20260419180000_uploaded_images_global_content_hash.sql",
  });
}
