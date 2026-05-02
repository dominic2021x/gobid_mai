import { compressImageForListing } from "@/lib/upload/client-image-compress";
import {
  guessImageMimeFromFilename,
  isAllowedImageMime,
  isAllowedR2UploadMime,
  normalizeClientMime,
  UPLOAD_MAX_BYTES,
  UPLOAD_ZIP_MIME,
} from "@/lib/upload/image-rules";

/** Referință pentru mesaje: încărcările mici preferă proxy (fără CORS la R2); la eșec se încearcă PUT direct. */
const PROXY_MAX_BYTES = 4 * 1024 * 1024;

export type ClientImageUploadResult =
  | {
      success: true;
      url: string;
      duplicate?: boolean;
      storageKey?: string;
    }
  | { success: false; error: string };

export type ClientImageUploadFetch = (
  input: RequestInfo | URL,
  init?: RequestInit
) => Promise<Response>;

async function sha256HexFromBlob(blob: Blob): Promise<string> {
  const buf = await blob.arrayBuffer();
  const hash = await crypto.subtle.digest("SHA-256", buf);
  const bytes = new Uint8Array(hash);
  let hex = "";
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i]!.toString(16).padStart(2, "0");
  }
  return hex;
}

async function putToR2WithRetries(
  uploadUrl: string,
  body: Blob,
  contentType: string,
  retries: number
): Promise<void> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(uploadUrl, {
        method: "PUT",
        body,
        headers: {
          "Content-Type": normalizeClientMime(contentType),
        },
      });
      if (res.ok) return;
      lastErr = new Error(`R2 PUT a returnat ${res.status}`);
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("Eroare la încărcare în stocare.");
}

/** Când PUT la R2 e blocat (CORS / NetworkError), același fișier urcă prin API (same-origin). */
async function putViaServerProxy(
  file: File,
  key: string,
  sha256: string,
  mime: string,
  fetchImpl: ClientImageUploadFetch
): Promise<{ url: string; key: string }> {
  const fd = new FormData();
  fd.append("intent", "proxyPut");
  fd.append("key", key);
  fd.append("sha256", sha256);
  fd.append("mimeType", mime);
  fd.append("byteSize", String(file.size));
  fd.append("file", file, file.name || "image.jpg");

  const res = await fetchImpl("/api/upload", {
    method: "POST",
    body: fd,
  });

  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const msg = typeof json.error === "string" ? json.error : `Proxy upload (${res.status})`;
    throw new Error(msg);
  }
  if (typeof json.url !== "string") {
    throw new Error("Răspuns invalid de la server (proxy).");
  }
  return {
    url: json.url,
    key: typeof json.key === "string" ? json.key : key,
  };
}

async function uploadBlobToR2(
  file: File,
  mime: string,
  fetchImpl: ClientImageUploadFetch,
  maxBytes: number
): Promise<ClientImageUploadResult> {
  const normalizedMime = normalizeClientMime(mime);
  if (!isAllowedR2UploadMime(normalizedMime)) {
    return {
      success: false,
      error: "Tip de fișier neacceptat pentru încărcare.",
    };
  }
  if (file.size <= 0 || file.size > maxBytes) {
    return { success: false, error: `Dimensiune invalidă (max ${maxBytes / 1024 / 1024}MB).` };
  }

  let sha256: string;
  try {
    sha256 = await sha256HexFromBlob(file);
  } catch {
    return { success: false, error: "Nu s-a putut calcula hash-ul fișierului." };
  }

  const presignRes = await fetchImpl("/api/upload", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      intent: "presign",
      sha256,
      mimeType: normalizedMime,
      byteSize: file.size,
      filename: file.name || "upload.bin",
    }),
  });

  const presignJson = (await presignRes.json().catch(() => ({}))) as Record<string, unknown>;

  if (!presignRes.ok) {
    const err =
      typeof presignJson.error === "string"
        ? presignJson.error
        : `Presign eșuat (${presignRes.status})`;
    return { success: false, error: err };
  }

  if (presignJson.duplicate === true && typeof presignJson.url === "string") {
    return { success: true, url: presignJson.url, duplicate: true };
  }

  const uploadUrl = presignJson.uploadUrl;
  const key = presignJson.key;
  const publicUrl = presignJson.publicUrl;

  if (typeof uploadUrl !== "string" || typeof key !== "string" || typeof publicUrl !== "string") {
    return { success: false, error: "Răspuns invalid de la server (presign)." };
  }

  try {
    const proxied = await putViaServerProxy(file, key, sha256, normalizedMime, fetchImpl);
    return {
      success: true,
      url: proxied.url,
      storageKey: proxied.key,
    };
  } catch (proxyErr) {
    const pmsg = proxyErr instanceof Error ? proxyErr.message : "Încărcare proxy eșuată";

    try {
      await putToR2WithRetries(uploadUrl, file, normalizedMime, 2);
    } catch (putErr) {
      const putMsg = putErr instanceof Error ? putErr.message : "PUT R2 eșuat";
      const corsHint =
        file.size > PROXY_MAX_BYTES
          ? ` Pentru fișiere mari, configurează CORS pe bucketul R2 (PUT din domeniul site-ului) sau comprimă fișierul sub ${PROXY_MAX_BYTES / 1024 / 1024}MB.`
          : " Dacă persistă, verifică CORS pe bucketul R2 pentru PUT din browser sau reîncearcă.";
      return {
        success: false,
        error: `${pmsg} · ${putMsg}${corsHint}`,
      };
    }

    const completeRes = await fetchImpl("/api/upload", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        intent: "complete",
        key,
        sha256,
        byteSize: file.size,
      }),
    });

    const completeJson = (await completeRes.json().catch(() => ({}))) as Record<string, unknown>;

    if (!completeRes.ok) {
      const err =
        typeof completeJson.error === "string"
          ? completeJson.error
          : `Finalizare eșuată (${completeRes.status})`;
      return { success: false, error: err };
    }

    const finalUrl = typeof completeJson.url === "string" ? completeJson.url : publicUrl;

    return {
      success: true,
      url: finalUrl,
      storageKey: typeof completeJson.key === "string" ? completeJson.key : key,
    };
  }
}

/**
 * Browser: hash → presign → încărcare prin proxy (preferat, fără CORS la R2).
 * Dacă proxy-ul eșuează, urmează PUT direct la URL-ul presignat + `complete`.
 * Imaginile sunt redimensionate/comprimate automat înainte de upload.
 */
export async function uploadImageFile(
  file: File,
  options?: { fetchImpl?: ClientImageUploadFetch; maxBytes?: number; skipCompress?: boolean }
): Promise<ClientImageUploadResult> {
  const maxBytes = options?.maxBytes ?? UPLOAD_MAX_BYTES;
  const fetchImpl = options?.fetchImpl ?? ((input: RequestInfo | URL, init?: RequestInit) =>
    fetch(input, { ...init, credentials: "include" }));

  let mime = normalizeClientMime(file.type || "application/octet-stream");
  if (!isAllowedImageMime(mime)) {
    const guessed = guessImageMimeFromFilename(file.name);
    if (guessed && isAllowedImageMime(normalizeClientMime(guessed))) {
      mime = normalizeClientMime(guessed);
    }
  }
  if (!isAllowedImageMime(mime)) {
    return {
      success: false,
      error:
        "Format imagine neacceptat sau necunoscut. Folosește JPEG, PNG, WebP, GIF sau HEIC (max " +
        `${maxBytes / 1024 / 1024}MB).`,
    };
  }

  let toUpload = file;
  if (!options?.skipCompress) {
    toUpload = await compressImageForListing(file);
  }

  mime = normalizeClientMime(toUpload.type || mime);
  if (!isAllowedImageMime(mime)) {
    const guessed = guessImageMimeFromFilename(toUpload.name);
    if (guessed && isAllowedImageMime(normalizeClientMime(guessed))) {
      mime = normalizeClientMime(guessed);
    }
  }
  if (!isAllowedImageMime(mime)) {
    return {
      success: false,
      error:
        "Format imagine neacceptat după procesare. Folosește JPEG, PNG, WebP, GIF sau HEIC (max " +
        `${maxBytes / 1024 / 1024}MB).`,
    };
  }

  return uploadBlobToR2(toUpload, mime, fetchImpl, maxBytes);
}

/** Fișier .zip pentru anunț (aceeași rută R2; fără compresie). */
export async function uploadZipListingFile(
  file: File,
  options?: { fetchImpl?: ClientImageUploadFetch; maxBytes?: number }
): Promise<ClientImageUploadResult> {
  const maxBytes = options?.maxBytes ?? UPLOAD_MAX_BYTES;
  const fetchImpl = options?.fetchImpl ?? ((input: RequestInfo | URL, init?: RequestInit) =>
    fetch(input, { ...init, credentials: "include" }));

  const lower = file.name.trim().toLowerCase();
  if (!lower.endsWith(".zip")) {
    return { success: false, error: "Se acceptă doar fișiere .zip." };
  }

  let mime = normalizeClientMime(file.type || "");
  if (mime !== UPLOAD_ZIP_MIME && mime !== "application/x-zip-compressed") {
    mime = UPLOAD_ZIP_MIME;
  }

  return uploadBlobToR2(file, mime, fetchImpl, maxBytes);
}
