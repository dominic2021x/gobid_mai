/**
 * Cloudflare Image Resizing: `/cdn-cgi/image/<options>/<path>` — doar când `NEXT_PUBLIC_R2_PUBLIC_BASE_URL`
 * e un domeniu proxiat prin Cloudflare cu Image Resizing (nu `*.r2.dev`: acolo folosim URL direct la obiect).
 *
 * Pentru URL-uri de imagine folosite în UI: setează `NEXT_PUBLIC_R2_PUBLIC_BASE_URL` (aceeași valoare ca baza publică R2).
 *
 * Long cache at the edge: in Cloudflare Dashboard → Cache Rules → match URI Path contains `cdn-cgi/image`
 * → Edge TTL 1 year, Browser TTL 1 year. Version query (`v=`) keeps URLs immutable when the object changes.
 * See `CDN_IMAGE_RESPONSE_CACHE_CONTROL`.
 */

const CF_SEGMENT = "/cdn-cgi/image/";

/** Default when `keyOrUrl` is empty or unusable (no extra network hop). */
export const CDN_IMAGE_FALLBACK_SRC = "/no-image-placeholder.svg";

/**
 * Recommended `Cache-Control` for transformed responses (configure on Cloudflare for `cdn-cgi/image/*`, not on Next.js).
 * Next.js does not serve these bytes; the browser loads the R2/Cloudflare hostname directly.
 */
export const CDN_IMAGE_RESPONSE_CACHE_CONTROL = "public, max-age=31536000, immutable";

/** Responsive hint for listing/grid cards (aliniat cu `CDN_IMAGE_WIDTH.grid`). */
export const CDN_IMAGE_SIZES_GRID = "(max-width: 768px) 50vw, 320px";

export type CdnImageFormat = "auto" | "webp" | "avif" | "jpeg" | "png" | "json" | "origin";

export type CdnImageOptions = {
  width?: number;
  height?: number;
  quality?: number;
  format?: CdnImageFormat;
  fit?: "scale-down" | "contain" | "cover" | "crop" | "pad";
  /** Device pixel ratio (1–3). Default 2 for crisp retina. Pass `1` to omit upscaling. */
  dpr?: number;
  /** Sharpen 0–10; `1` is recommended for downscaled images. */
  sharpen?: number;
  /**
   * Normalized 0–1 focal center (from uploaded_images AI). With `fit=cover`/`crop`, maps to
   * Cloudflare `gravity=XxY`. If omitted, uses `gravity=auto`.
   */
  focal?: { x: number; y: number } | null;
  /** Bust CDN cache when the underlying object changes (query on our R2 / transform URLs only). */
  updatedAt?: string | number | Date | null;
};

export const CDN_IMAGE_WIDTH = {
  /** Listă RO / carduri (~h-40–52): ~320px cover e suficient; sub Cloudflare Image Resizing reduce bytes vs 400. */
  grid: 320,
  /** Product hero / main gallery */
  hero: 1200,
  /** Thumbnail strip */
  thumb: 150,
} as const;

const DEFAULT_DPR = 2;

/**
 * Origin R2 pentru transformări `/cdn-cgi/image/`.
 * Preferă `NEXT_PUBLIC_R2_PUBLIC_BASE_URL` (identic pe server și client când e în bundle).
 * Dacă lipsește din bundle-ul clientului (dev/build fără env), deducem origin din URL-ul absolut
 * pe host-uri publice R2 (`*.r2.dev`) ca să nu difere `src` la hidratare față de SSR.
 */
function getConfiguredOrigin(): string | null {
  const raw =
    (typeof process !== "undefined" && process.env?.NEXT_PUBLIC_R2_PUBLIC_BASE_URL) || "";
  const t = raw.trim().replace(/\/$/, "");
  return t.length > 0 ? t : null;
}

/** Hostname-ul endpoint-ului S3 R2 — nu servește `/cdn-cgi/image/`; GET anonim poate eșua (403). */
function isR2S3ApiHostname(hostname: string): boolean {
  return hostname.toLowerCase().endsWith(".r2.cloudflarestorage.com");
}

/**
 * URL public R2 (`pub-…r2.dev`) — obiectele sunt servite direct; **nu** există Image Resizing (`/cdn-cgi/image/`)
 * pe acest host (spre deosebire de un domeniu custom proxiat prin Cloudflare cu Image Resizing activat).
 */
function isR2PublicDevHostname(hostname: string): boolean {
  return hostname.toLowerCase().endsWith(".r2.dev");
}

/**
 * În DB, `public_url` poate fi pe host-ul API S3; browserul trebuie să încarce de pe **baza publică**
 * (`NEXT_PUBLIC_R2_PUBLIC_BASE_URL`: `*.r2.dev` sau domeniu custom) — același path la obiect.
 * Exportat pentru `getProductDisplayImage` și `<img src>` care nu trec prin `getCdnImageUrl`.
 */
export function normalizeR2PublicObjectUrl(url: string): string {
  return rewriteR2S3ApiUrlToPublicIfConfigured(url);
}

function stripQueryAndHashForStableSrc(url: string): string {
  const i = url.search(/[?#]/);
  return i === -1 ? url : url.slice(0, i);
}

/**
 * URL stabil pentru același pixel la SSR și la primul paint după hidratare (fără `/cdn-cgi/image/`).
 * Folosit pentru `<img src>` ca să nu difere față de HTML-ul serverului.
 */
export function stablePublicImageSrcForHydration(raw: string): string {
  const s = raw.trim();
  if (!s) return CDN_IMAGE_FALLBACK_SRC;
  if (s.startsWith("/") && !s.startsWith("//")) return s;
  const noQuery = stripQueryAndHashForStableSrc(normalizeR2PublicObjectUrl(s));
  if (!/^https?:\/\//i.test(noQuery)) return noQuery;
  try {
    const u = new URL(noQuery);
    // Același serializat pe server și client (encoding/host/path), evită mismatch la next/image.
    return `${u.origin}${u.pathname}`;
  } catch {
    return noQuery;
  }
}

function rewriteR2S3ApiUrlToPublicIfConfigured(url: string): string {
  const trimmed = url.trim();
  if (!/^https?:\/\//i.test(trimmed)) return trimmed;
  try {
    const u = new URL(trimmed);
    if (!isR2S3ApiHostname(u.hostname)) return trimmed;
    const configured = getConfiguredOrigin();
    if (!configured) return trimmed;
    const pub = new URL(configured.includes("://") ? configured : `https://${configured}`);
    if (isR2S3ApiHostname(pub.hostname)) return trimmed;
    return `${pub.origin}${u.pathname}${u.search}`;
  } catch {
    return trimmed;
  }
}

/** Când env lipsește pe client, deducem același origin ca pe server pentru URL-uri R2 publice. */
function inferOriginFromAbsoluteUrl(raw: string): string | null {
  if (!/^https?:\/\//i.test(raw)) return null;
  try {
    const u = new URL(raw);
    const host = u.hostname.toLowerCase();
    if (host.endsWith(".r2.dev")) return u.origin;
    if (isR2S3ApiHostname(host)) return u.origin;
    const path = u.pathname;
    if (path.includes("/uploads/") || path.startsWith("/uploads")) return u.origin;
    return null;
  } catch {
    return null;
  }
}

/**
 * Origine normalizată (`https://host`) — obligatoriu pentru comparații și `extractObjectPath`;
 * fără protocol, `new URL(configured)` eșuează și reveneam la string brut → `startsWith(origin)` fals
 * pentru URL-uri `https://…`, deci același `getCdnImageUrl` putea ieși pe ramuri diferite (SSR vs client).
 */
function toAbsoluteOrigin(configuredOrInferred: string): string | null {
  const t = configuredOrInferred.trim().replace(/\/$/, "");
  if (!t) return null;
  try {
    return new URL(t.includes("://") ? t : `https://${t}`).origin;
  } catch {
    return null;
  }
}

function getEffectiveOrigin(keyOrUrl: string): string | null {
  const configured = getConfiguredOrigin();
  const trimmed = keyOrUrl.trim();
  const inferred = inferOriginFromAbsoluteUrl(trimmed);

  /** Dacă env indică alt host decât URL-ul real al obiectului, preferă origin-ul din URL (ex. public_url pe API S3 vs NEXT_PUBLIC pe r2.dev). */
  if (configured && inferred) {
    const c = toAbsoluteOrigin(configured);
    const i = toAbsoluteOrigin(inferred);
    if (c && i && c !== i) return i;
  }

  if (configured) {
    const n = toAbsoluteOrigin(configured);
    if (n) return n;
  }
  if (inferred) {
    const n = toAbsoluteOrigin(inferred);
    if (n) return n;
  }
  return null;
}

function stripQueryAndHash(url: string): string {
  const i = url.search(/[?#]/);
  return i === -1 ? url : url.slice(0, i);
}

function normalizeVersionToken(updatedAt: string | number | Date): string {
  if (typeof updatedAt === "number" && Number.isFinite(updatedAt)) {
    return String(Math.floor(updatedAt));
  }
  if (updatedAt instanceof Date) {
    const t = updatedAt.getTime();
    return Number.isNaN(t) ? "0" : String(t);
  }
  const s = String(updatedAt).trim();
  if (!s) return "";
  const parsed = Date.parse(s);
  if (!Number.isNaN(parsed)) return String(parsed);
  return encodeURIComponent(s).slice(0, 120);
}

/** Stable 8-char hex prefix from path + time (pure JS — safe in browser + server bundles). */
function hashPrefixForVersion(pathOrKey: string, versionPart: string): string {
  const payload = `${pathOrKey}|${versionPart}`;
  let h = 0x811c9dc5;
  for (let i = 0; i < payload.length; i++) {
    h ^= payload.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0").slice(0, 8);
}

function buildVersionQueryValue(pathForHash: string, updatedAt: string | number | Date | null | undefined): string | null {
  const t =
    updatedAt != null && updatedAt !== ""
      ? normalizeVersionToken(
          typeof updatedAt === "string" || typeof updatedAt === "number" || updatedAt instanceof Date
            ? updatedAt
            : String(updatedAt),
        )
      : "";
  if (!t && !pathForHash) return null;
  const prefix = hashPrefixForVersion(pathForHash || "asset", t || "0");
  return t ? `${prefix}_${t}` : prefix;
}

function appendVersionForOurAssets(
  url: string,
  origin: string | null,
  pathForHash: string,
  updatedAt: string | number | Date | null | undefined,
): string {
  const v = buildVersionQueryValue(pathForHash, updatedAt);
  if (!v) return url;
  const onOur =
    (origin != null && url.startsWith(origin)) ||
    url.includes(`${CF_SEGMENT}`);
  if (!onOur) return url;
  const sep = url.includes("?") ? "&" : "?";
  if (/[?&]v=/.test(url)) {
    return url.replace(/([?&])v=[^&]*/, `$1v=${encodeURIComponent(v)}`);
  }
  return `${url}${sep}v=${encodeURIComponent(v)}`;
}

/**
 * External / absolute URL on another host → do not pass through Cloudflare transform on our zone.
 */
export function isExternalImageUrlForCdn(keyOrUrl: string): boolean {
  const raw = keyOrUrl.trim();
  if (!raw || raw.startsWith("/") || raw.startsWith("data:") || raw.startsWith("blob:")) return false;
  if (!/^https?:\/\//i.test(raw)) return false;
  const origin = getEffectiveOrigin(raw);
  if (!origin) return true;
  try {
    const u = new URL(raw);
    const o = new URL(origin);
    return u.hostname !== o.hostname || u.protocol !== o.protocol;
  } catch {
    return true;
  }
}

function extractObjectPath(keyOrUrl: string, origin: string): string | null {
  const trimmed = keyOrUrl.trim();
  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed)) {
    if (!trimmed.startsWith(origin)) return null;
    try {
      const u = new URL(trimmed);
      return u.pathname.replace(/^\/+/, "");
    } catch {
      return null;
    }
  }
  return trimmed.replace(/^\/+/, "");
}

/** Path after /cdn-cgi/image/.../ — one encode per segment (same idea as R2 public URLs). */
function encodeObjectPathForTransform(path: string): string {
  return path
    .split("/")
    .filter(Boolean)
    .map((s) => encodeURIComponent(s))
    .join("/");
}

function formatGravityCoord(n: number): string {
  const c = Math.min(1, Math.max(0, n));
  return String(Math.round(c * 10000) / 10000);
}

function appendGravityForFit(parts: string[], options: CdnImageOptions): void {
  const fit = options.fit;
  if (fit !== "cover" && fit !== "crop") return;
  const f = options.focal;
  if (f && Number.isFinite(f.x) && Number.isFinite(f.y)) {
    parts.push(`gravity=${formatGravityCoord(f.x)}x${formatGravityCoord(f.y)}`);
  } else {
    parts.push("gravity=auto");
  }
}

function buildOptionsSegment(options: CdnImageOptions): string {
  const format = options.format ?? "auto";
  const parts: string[] = [];
  if (options.width != null) parts.push(`width=${Math.max(1, Math.round(options.width))}`);
  if (options.height != null) parts.push(`height=${Math.max(1, Math.round(options.height))}`);
  if (options.fit) parts.push(`fit=${options.fit}`);
  appendGravityForFit(parts, options);
  const dpr = options.dpr !== undefined ? options.dpr : DEFAULT_DPR;
  if (dpr >= 1 && dpr <= 3) parts.push(`dpr=${Math.round(dpr)}`);
  if (options.quality != null) {
    const q = Math.min(100, Math.max(1, Math.round(options.quality)));
    parts.push(`quality=${q}`);
  }
  if (options.sharpen != null && options.sharpen >= 0 && options.sharpen <= 10) {
    parts.push(`sharpen=${options.sharpen}`);
  }
  parts.push(`format=${format}`);
  return parts.join(",");
}

/**
 * Returns a Cloudflare resized URL for objects on `R2_PUBLIC_BASE_URL`, or the original string
 * when the asset is not on that origin (placeholders, category SVGs, third-party URLs).
 *
 * @param keyOrUrl — R2 public URL or object key (`uploads/...`).
 */
export function getCdnImageUrl(keyOrUrl: string, options: CdnImageOptions = {}): string {
  let raw = keyOrUrl.trim();
  if (!raw) return CDN_IMAGE_FALLBACK_SRC;

  if (raw.startsWith("data:") || raw.startsWith("blob:")) return raw;

  /** Obiecte salvate cu URL pe API S3 → același path pe originea publică R2 (din env). */
  raw = normalizeR2PublicObjectUrl(raw);

  /**
   * Încă pe API S3 (fără `NEXT_PUBLIC_R2_PUBLIC_BASE_URL`): nu există `/cdn-cgi/image/` aici; încercare GET directă.
   */
  if (/^https?:\/\//i.test(raw)) {
    try {
      const h = new URL(raw).hostname;
      if (isR2S3ApiHostname(h)) {
        return stripQueryAndHash(raw);
      }
    } catch {
      /* ignore */
    }
  }

  const origin = getEffectiveOrigin(raw);

  /** App-local static assets — never send through /cdn-cgi/. */
  if (raw.startsWith("/") && !raw.startsWith("//")) {
    return raw;
  }

  /** Explicit bypass: third-party or wrong origin — return untransformed URL. */
  if (isExternalImageUrlForCdn(raw)) {
    return stripQueryAndHash(raw);
  }

  /** No origin configured: cannot build transform; pass through absolute URL or key-only fallback. */
  if (!origin) {
    if (/^https?:\/\//i.test(raw)) return stripQueryAndHash(raw);
    return CDN_IMAGE_FALLBACK_SRC;
  }

  const path = extractObjectPath(raw, origin);
  if (!path) {
    return appendVersionForOurAssets(stripQueryAndHash(raw), origin, raw, options.updatedAt);
  }

  /**
   * `*.r2.dev` = bucket public R2; **nu** există `/cdn-cgi/image/` pe acest host → livrăm **fișierul original**
   * (poate fi foarte mare). Pentru thumbs rapide, folosește un domeniu proxiat prin Cloudflare cu Image Resizing
   * în `NEXT_PUBLIC_R2_PUBLIC_BASE_URL` (vezi comentariul din header-ul acestui fișier).
   */
  try {
    if (isR2PublicDevHostname(new URL(origin).hostname)) {
      const direct = `${origin}/${encodeObjectPathForTransform(path)}`;
      return appendVersionForOurAssets(direct, origin, path, options.updatedAt);
    }
  } catch {
    /* fall through to Cloudflare transform */
  }

  const opts = buildOptionsSegment(options);
  const transformed = `${origin}${CF_SEGMENT}${opts}/${encodeObjectPathForTransform(path)}`;
  return appendVersionForOurAssets(transformed, origin, path, options.updatedAt);
}

/** Carduri listă: dpr=1; quality moderată — sub CF resize ține fișierele mici vs originalul din R2. */
const GRID: CdnImageOptions = {
  width: CDN_IMAGE_WIDTH.grid,
  height: CDN_IMAGE_WIDTH.grid,
  fit: "cover",
  quality: 72,
  format: "auto",
  dpr: 1,
  sharpen: 1,
};

/** Shared options for listing cards (grid×grid cover, dpr=1, sharpen). */
export function listingGridTransformOptions(
  updatedAt: string | number | Date | null | undefined,
  focal?: { focal_x: number; focal_y: number } | null,
): CdnImageOptions {
  const o: CdnImageOptions = { ...GRID, updatedAt: updatedAt ?? null };
  if (focal != null && Number.isFinite(focal.focal_x) && Number.isFinite(focal.focal_y)) {
    o.focal = { x: focal.focal_x, y: focal.focal_y };
  }
  return o;
}

/** Product hero: square cover at CDN so focal/gravity applies (UI still uses object-cover). */
export function heroTransformOptions(
  updatedAt: string | number | Date | null | undefined,
  focal?: { focal_x: number; focal_y: number } | null,
): CdnImageOptions {
  const o: CdnImageOptions = {
    width: CDN_IMAGE_WIDTH.hero,
    height: CDN_IMAGE_WIDTH.hero,
    fit: "cover",
    quality: 82,
    format: "auto",
    dpr: DEFAULT_DPR,
    updatedAt: updatedAt ?? null,
  };
  if (focal != null && Number.isFinite(focal.focal_x) && Number.isFinite(focal.focal_y)) {
    o.focal = { x: focal.focal_x, y: focal.focal_y };
  }
  return o;
}

/** Tiny WebP for progressive / LQIP-style placeholders (Cloudflare CDN only). */
export function blurPlaceholderTransformOptions(
  updatedAt: string | number | Date | null | undefined,
  focal?: { focal_x: number; focal_y: number } | null,
): CdnImageOptions {
  const o: CdnImageOptions = {
    width: 32,
    height: 32,
    fit: "cover",
    quality: 30,
    format: "webp",
    dpr: 1,
    updatedAt: updatedAt ?? null,
  };
  if (focal != null && Number.isFinite(focal.focal_x) && Number.isFinite(focal.focal_y)) {
    o.focal = { x: focal.focal_x, y: focal.focal_y };
  }
  return o;
}

/** Presets for product/listing UI (widths align with design breakpoints). */
export function productImageCdn(updatedAt: string | number | Date | null | undefined) {
  const v = updatedAt ?? null;
  return {
    grid: (src: string) => getCdnImageUrl(src, { ...GRID, updatedAt: v }),
    hero: (src: string) => getCdnImageUrl(src, heroTransformOptions(v)),
    thumb: (src: string) =>
      getCdnImageUrl(src, {
        width: CDN_IMAGE_WIDTH.thumb,
        height: CDN_IMAGE_WIDTH.thumb,
        fit: "cover",
        quality: 78,
        format: "auto",
        dpr: DEFAULT_DPR,
        updatedAt: v,
      }),
  };
}
