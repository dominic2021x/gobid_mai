import { createHash } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { resolveAuthenticatedApiUser } from "@/lib/auth/resolveAuthenticatedApiUser";
import { RateLimitError } from "@/lib/security/rateLimit";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabase";
import {
  isAllowedR2UploadMime,
  normalizeClientMime,
  UPLOAD_MAX_BYTES,
} from "@/lib/upload/image-rules";
import {
  assertUserScopedObjectKey,
  buildObjectKey,
  getR2EnvConfig,
  headObjectMeta,
  presignPutObject,
  publicUrlForKey,
  putObjectBuffer,
} from "@/lib/upload/r2-server";
import { enforceUploadRateLimit } from "@/lib/upload/upload-rate-limit";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const runtime = "nodejs";
/** Încărcare proxy (multipart) — fișiere mai mari pot depinde de limita hostului (ex. Vercel ~4.5MB). */
export const maxDuration = 60;

const PRESIGN_EXPIRES_SECONDS = 60;

const presignSchema = z
  .object({
    intent: z.literal("presign"),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
    mimeType: z.string().min(1),
    byteSize: z.number().int().positive().max(UPLOAD_MAX_BYTES),
    filename: z.string().min(1).max(512),
  })
  .superRefine((data, ctx) => {
    const mime = normalizeClientMime(data.mimeType);
    if (!isAllowedR2UploadMime(mime)) {
      ctx.addIssue({
        code: "custom",
        message: "Tip MIME neacceptat.",
        path: ["mimeType"],
      });
    }
  });

const completeSchema = z.object({
  intent: z.literal("complete"),
  key: z.string().min(1).max(1024),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  byteSize: z.number().int().positive().max(UPLOAD_MAX_BYTES),
});

export async function POST(request: NextRequest) {
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

    const contentType = request.headers.get("content-type") ?? "";
    if (contentType.includes("multipart/form-data")) {
      return await handleProxyPutMultipart(user.id, cfg, db, request);
    }

    if (!contentType.includes("application/json")) {
      return NextResponse.json(
        {
          error:
            "Content-Type trebuie să fie application/json (presign | complete) sau multipart/form-data (proxyPut).",
        },
        { status: 415 }
      );
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "JSON invalid." }, { status: 400 });
    }

    const intent = (body as { intent?: string })?.intent;
    if (intent === "presign") {
      return await handlePresign(user.id, cfg, body, db);
    }
    if (intent === "complete") {
      return await handleComplete(user.id, cfg, body, db);
    }

    return NextResponse.json({ error: "intent lipsă sau necunoscut (presign | complete)." }, { status: 400 });
  } catch (e: unknown) {
    if (
      e instanceof RateLimitError ||
      (e instanceof Error && e.name === "RateLimitError")
    ) {
      const message = e instanceof Error ? e.message : "Prea multe cereri.";
      return NextResponse.json({ error: message }, { status: 429 });
    }
    const msg = e instanceof Error ? e.message : "Eroare la încărcare.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

async function handlePresign(
  userId: string,
  cfg: NonNullable<ReturnType<typeof getR2EnvConfig>>,
  body: unknown,
  db: SupabaseClient
) {
  const parsed = presignSchema.safeParse(body);
  if (!parsed.success) {
    const first = parsed.error.flatten().fieldErrors;
    const msg =
      Object.values(first).flat()[0] ??
      parsed.error.flatten().formErrors[0] ??
      "Date invalide.";
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  const { sha256, byteSize, filename } = parsed.data;
  const mimeType = normalizeClientMime(parsed.data.mimeType);

  /** Fără rate limit aici: fiecare flux presign+proxy numără deja o încărcare la proxy (vezi handleProxyPutMultipart). */

  const { data: dup, error: dupErr } = await db
    .from("uploaded_images")
    .select("public_url")
    .eq("content_hash", sha256)
    .is("deleted_at", null)
    .maybeSingle();

  if (dupErr) {
    console.error("[upload] duplicate lookup", dupErr);
    return NextResponse.json({ error: "Eroare la verificarea duplicatelor." }, { status: 500 });
  }

  if (dup?.public_url) {
    return NextResponse.json({
      duplicate: true,
      url: dup.public_url as string,
    });
  }

  const key = buildObjectKey(userId, filename);
  const uploadUrl = await presignPutObject(cfg, key, mimeType, PRESIGN_EXPIRES_SECONDS);
  const publicUrl = publicUrlForKey(cfg.publicBaseUrl, key);

  return NextResponse.json({
    duplicate: false,
    uploadUrl,
    key,
    publicUrl,
    expiresIn: PRESIGN_EXPIRES_SECONDS,
    byteSize,
    mimeType,
  });
}

async function handleComplete(
  userId: string,
  cfg: NonNullable<ReturnType<typeof getR2EnvConfig>>,
  body: unknown,
  db: SupabaseClient
) {
  const parsed = completeSchema.safeParse(body);
  if (!parsed.success) {
    const msg =
      parsed.error.flatten().formErrors[0] ??
      Object.values(parsed.error.flatten().fieldErrors).flat()[0] ??
      "Date invalide.";
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  const { key, sha256, byteSize } = parsed.data;

  try {
    assertUserScopedObjectKey(key, userId);
  } catch {
    return NextResponse.json({ error: "Cheie de obiect invalidă." }, { status: 400 });
  }

  let meta: { contentLength: number | undefined; contentType: string | undefined };
  try {
    meta = await headObjectMeta(cfg, key);
  } catch (e) {
    console.error("[upload] head object", e);
    return NextResponse.json(
      { error: "Fișierul nu a fost găsit în stocare sau încă nu e disponibil." },
      { status: 400 }
    );
  }

  if (meta.contentLength != null && meta.contentLength !== byteSize) {
    return NextResponse.json({ error: "Dimensiunea fișierului nu se potrivește." }, { status: 400 });
  }

  const publicUrl = publicUrlForKey(cfg.publicBaseUrl, key);

  const { data: inserted, error: insErr } = await db
    .from("uploaded_images")
    .insert({
      user_id: userId,
      storage_key: key,
      public_url: publicUrl,
      content_hash: sha256,
      byte_size: byteSize,
    })
    .select("public_url")
    .maybeSingle();

  if (insErr) {
    const code = (insErr as { code?: string }).code;
    if (code === "23505") {
      const { data: byKey } = await db
        .from("uploaded_images")
        .select("public_url, storage_key")
        .eq("storage_key", key)
        .maybeSingle();
      if (byKey?.public_url) {
        return NextResponse.json({
          success: true,
          duplicate: true,
          url: byKey.public_url as string,
          key: byKey.storage_key as string,
        });
      }
      const { data: byHash } = await db
        .from("uploaded_images")
        .select("public_url, storage_key")
        .eq("content_hash", sha256)
        .is("deleted_at", null)
        .maybeSingle();
      if (byHash?.public_url) {
        return NextResponse.json({
          success: true,
          duplicate: true,
          url: byHash.public_url as string,
          key: byHash.storage_key as string,
        });
      }
    }
    console.error("[upload] insert metadata", insErr);
    return NextResponse.json({ error: "Nu s-a putut salva metadata." }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    url: (inserted?.public_url as string) ?? publicUrl,
    key,
  });
}

async function putObjectBufferWithRetry(
  cfg: NonNullable<ReturnType<typeof getR2EnvConfig>>,
  key: string,
  buf: Buffer,
  mimeType: string
): Promise<void> {
  let last: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await putObjectBuffer(cfg, key, buf, mimeType);
      return;
    } catch (e) {
      last = e;
      if (attempt < 2) {
        await new Promise<void>((resolve) => setTimeout(resolve, 200 * (attempt + 1)));
      }
    }
  }
  throw last instanceof Error ? last : new Error(String(last));
}

/**
 * Fallback când PUT direct la URL-ul presignat R2 eșuează în browser (NetworkError / CORS).
 * Încărcare same-origin → server face PutObject către R2.
 */
async function handleProxyPutMultipart(
  userId: string,
  cfg: NonNullable<ReturnType<typeof getR2EnvConfig>>,
  db: SupabaseClient,
  request: NextRequest
) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Formular multipart invalid." }, { status: 400 });
  }

  if (form.get("intent") !== "proxyPut") {
    return NextResponse.json({ error: "intent trebuie să fie proxyPut." }, { status: 400 });
  }

  const key = String(form.get("key") ?? "").trim();
  const sha256Hex = String(form.get("sha256") ?? "").trim().toLowerCase();
  const mimeRaw = String(form.get("mimeType") ?? "");
  const byteSizeRaw = form.get("byteSize");
  const fileField = form.get("file");

  if (!key || !/^[a-f0-9]{64}$/.test(sha256Hex)) {
    return NextResponse.json({ error: "Cheie sau hash SHA-256 invalid." }, { status: 400 });
  }

  const mimeType = normalizeClientMime(mimeRaw);
  if (!isAllowedR2UploadMime(mimeType)) {
    return NextResponse.json({ error: "Tip MIME neacceptat." }, { status: 400 });
  }

  const byteSize =
    typeof byteSizeRaw === "string"
      ? parseInt(byteSizeRaw, 10)
      : typeof byteSizeRaw === "number"
        ? byteSizeRaw
        : NaN;
  if (!Number.isFinite(byteSize) || byteSize <= 0 || byteSize > UPLOAD_MAX_BYTES) {
    return NextResponse.json({ error: "Dimensiune invalidă." }, { status: 400 });
  }

  try {
    assertUserScopedObjectKey(key, userId);
  } catch {
    return NextResponse.json({ error: "Cheie de obiect invalidă." }, { status: 400 });
  }

  if (!(fileField instanceof Blob)) {
    return NextResponse.json({ error: "Câmpul file lipsește sau nu este valid." }, { status: 400 });
  }

  await enforceUploadRateLimit(userId);

  const { data: dupByHash, error: dupErr } = await db
    .from("uploaded_images")
    .select("public_url")
    .eq("content_hash", sha256Hex)
    .is("deleted_at", null)
    .maybeSingle();

  if (dupErr) {
    console.error("[upload] proxy duplicate lookup", dupErr);
    return NextResponse.json({ error: "Eroare la verificarea duplicatelor." }, { status: 500 });
  }

  if (dupByHash?.public_url) {
    return NextResponse.json({
      success: true,
      url: dupByHash.public_url as string,
      duplicate: true,
      key,
    });
  }

  const buf = Buffer.from(await fileField.arrayBuffer());
  if (buf.length !== byteSize) {
    return NextResponse.json({ error: "Dimensiunea fișierului nu se potrivește cu byteSize." }, { status: 400 });
  }

  const digest = createHash("sha256").update(buf).digest("hex");
  if (digest !== sha256Hex) {
    return NextResponse.json({ error: "Hash-ul fișierului nu corespunde." }, { status: 400 });
  }

  try {
    await putObjectBufferWithRetry(cfg, key, buf, mimeType);
  } catch (e) {
    console.error("[upload] proxy putObjectBuffer", e);
    return NextResponse.json({ error: "Nu s-a putut salva fișierul în stocare." }, { status: 500 });
  }

  const publicUrl = publicUrlForKey(cfg.publicBaseUrl, key);

  const { data: inserted, error: insErr } = await db
    .from("uploaded_images")
    .insert({
      user_id: userId,
      storage_key: key,
      public_url: publicUrl,
      content_hash: sha256Hex,
      byte_size: byteSize,
    })
    .select("public_url")
    .maybeSingle();

  if (insErr) {
    const code = (insErr as { code?: string }).code;
    if (code === "23505") {
      const { data: byKey } = await db
        .from("uploaded_images")
        .select("public_url, storage_key")
        .eq("storage_key", key)
        .maybeSingle();
      if (byKey?.public_url) {
        return NextResponse.json({
          success: true,
          duplicate: true,
          url: byKey.public_url as string,
          key: byKey.storage_key as string,
        });
      }
      const { data: byHash } = await db
        .from("uploaded_images")
        .select("public_url, storage_key")
        .eq("content_hash", sha256Hex)
        .is("deleted_at", null)
        .maybeSingle();
      if (byHash?.public_url) {
        return NextResponse.json({
          success: true,
          duplicate: true,
          url: byHash.public_url as string,
          key: byHash.storage_key as string,
        });
      }
    }
    console.error("[upload] proxy insert metadata", insErr);
    return NextResponse.json({ error: "Nu s-a putut salva metadata." }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    url: (inserted?.public_url as string) ?? publicUrl,
    key,
  });
}

export async function GET() {
  const cfg = getR2EnvConfig();
  return NextResponse.json({
    message: "Image upload API — Cloudflare R2 (presigned PUT)",
    maxSizeBytes: UPLOAD_MAX_BYTES,
    presignExpiresSeconds: PRESIGN_EXPIRES_SECONDS,
    storageConfigured: !!cfg,
    allowedMimeTypes: [
      "image/jpeg",
      "image/png",
      "image/webp",
      "image/gif",
      "image/svg+xml",
      "image/heic",
      "image/heif",
      "application/zip",
    ],
    flow: [
      "POST presign JSON",
      "PUT file to uploadUrl (sau fallback POST multipart proxyPut către /api/upload dacă PUT eșuează)",
      "POST complete JSON (după PUT reușit; proxyPut salvează deja metadata)",
    ],
  });
}
