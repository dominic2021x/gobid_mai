/**
 * Cloudflare Worker — primary image delivery layer (recommended for production).
 * Parity with `app/api/image/deliver/route.ts` (Next.js Edge fallback).
 *
 * - HMAC v2 (v1 fallback when dpr===1)
 * - Explicit `format=` from Accept (no `Vary: Accept` on response); `*/*` handled
 * - Canonical query order (308) for CDN cache key stability
 * - Same Cache-Control + CDN-Cache-Control + Cache-Tag
 * - Optional Upstash Redis rate limit
 * - Transform timeout + R2 master fallback with structured headers + JSON metrics
 *
 * Set `NEXT_PUBLIC_IMAGE_DELIVERY_URL` in the Next app to this Worker URL so signed links
 * minted by `/api/upload/image` point here first.
 *
 * Secrets / vars: IMAGE_DELIVERY_SECRET, R2_PUBLIC_BASE_URL (or NEXT_PUBLIC_R2_PUBLIC_BASE_URL),
 * UPSTASH_* optional, IMAGE_DELIVERY_METRICS=0 to silence logs.
 */

const ALLOWED_W = new Set([300, 600, 1200]);
const ALLOWED_DPR = new Set([1, 2]);
const UPSTREAM_TIMEOUT_MS = 7000;
const CLOCK_SKEW_SEC = 120;
const MAX_FUTURE_SEC = 400 * 24 * 60 * 60;
const RL_MAX = 180;
const RL_WINDOW_SEC = 60;

const DELIVERY_CACHE_CONTROL_BROWSER =
  "public, max-age=86400, stale-while-revalidate=604800, stale-if-error=86400";
const DELIVERY_CDN_CACHE_CONTROL = "public, max-age=31536000, immutable";

const METRIC_MARKER = "image_delivery_v1";

const MIME = { avif: "image/avif", webp: "image/webp", jpeg: "image/jpeg" };

const DELIVER_QUERY_KEYS = ["dpr", "exp", "ext", "hash", "sig", "w"];

function buildCanonicalDeliverUrl(incoming) {
  const out = new URL(incoming.href);
  const ordered = new URLSearchParams();
  for (const k of DELIVER_QUERY_KEYS) {
    const v = incoming.searchParams.get(k);
    if (v !== null) ordered.set(k, v);
  }
  out.search = ordered.toString();
  return out;
}

function isDeliverUrlCanonical(incoming) {
  const c = buildCanonicalDeliverUrl(incoming);
  return incoming.origin === c.origin && incoming.pathname === c.pathname && incoming.search === c.search;
}

function emitMetric(env, obj) {
  if (env.IMAGE_DELIVERY_METRICS === "0" || env.IMAGE_DELIVERY_METRICS === "false") return;
  console.log(JSON.stringify({ s: METRIC_MARKER, t: Date.now(), ...obj }));
}

function strictContentType(upstreamCt, mode) {
  const expected =
    mode.kind === "transform" ? MIME[mode.format] : MIME[mode.storageExt];
  const up = upstreamCt?.split(";")[0]?.trim().toLowerCase() ?? null;
  const upstreamMismatch = up !== null && up !== expected.toLowerCase();
  return { contentType: expected, upstreamMismatch };
}

function readCfCacheStatus(res) {
  return res.headers.get("cf-cache-status") ?? res.headers.get("CF-Cache-Status");
}

function b64ToBuf(s) {
  s = s.replace(/-/g, "+").replace(/_/g, "/");
  const pad = s.length % 4 ? "=".repeat(4 - (s.length % 4)) : "";
  const bin = atob(s + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out.buffer;
}

async function verifyHmac(secret, payload, sigB64Url) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"]
  );
  const sig = b64ToBuf(sigB64Url);
  const data = new TextEncoder().encode(payload);
  return crypto.subtle.verify("HMAC", key, sig, data);
}

function buildV2(hash, w, dpr, exp, ext) {
  return `v2|${hash}|${w}|${dpr}|${exp}|${ext}`;
}

function buildV1(hash, w, exp, ext) {
  return `v1|${hash}|${w}|${exp}|${ext}`;
}

function validateExp(exp, nowSec) {
  if (!Number.isFinite(exp)) return { ok: false, reason: "invalid" };
  if (exp < nowSec - CLOCK_SKEW_SEC) return { ok: false, reason: "expired" };
  if (exp > nowSec + MAX_FUTURE_SEC) return { ok: false, reason: "too_far_future" };
  return { ok: true };
}

function normalizeAcceptHeader(accept) {
  if (accept == null) return null;
  const parts = accept
    .split(",")
    .map((p) => p.trim().replace(/\s+/g, " "))
    .filter(Boolean);
  if (parts.length === 0) return null;
  return parts.join(", ");
}

function pickCdnOutputFormatFromAccept(accept) {
  const a = normalizeAcceptHeader(accept);
  if (!a) return "jpeg";

  const parts = [];
  for (const rawPart of a.split(",")) {
    const part = rawPart.trim();
    if (!part) continue;
    const semi = part.indexOf(";");
    const mimePart = (semi === -1 ? part : part.slice(0, semi)).trim().toLowerCase();
    if (!mimePart.startsWith("image/") && mimePart !== "*/*") continue;

    let q = 1;
    if (semi !== -1) {
      const rest = part.slice(semi + 1);
      const qMatch = /(?:^|;)\s*q=\s*([0-9.]+)/i.exec(`;${rest}`);
      if (qMatch) {
        const n = parseFloat(qMatch[1]);
        if (Number.isFinite(n)) q = Math.min(1, Math.max(0, n));
      }
    }
    parts.push({ mime: mimePart, q });
  }
  parts.sort((a, b) => b.q - a.q);

  const wants = (pred) => {
    for (const p of parts) {
      if (p.q <= 0) continue;
      if (pred(p.mime)) return true;
    }
    return false;
  };

  if (wants((m) => m === "image/avif" || m === "image/avif-sequence")) return "avif";
  if (wants((m) => m === "image/webp")) return "webp";
  if (wants((m) => m === "image/jpeg" || m === "image/jpg" || m === "image/pjpeg")) return "jpeg";
  if (wants((m) => m === "image/*" || m === "*/*")) return "webp";
  return "jpeg";
}

function buildR2PublicObjectUrl(base, storageKey) {
  const path = storageKey
    .split("/")
    .filter(Boolean)
    .map((s) => encodeURIComponent(s))
    .join("/");
  return `${base.replace(/\/$/, "")}/${path}`;
}

function cdnTransformUrl(originBase, storageKey, w, dpr, outputFormat, sharpen) {
  const opts = [
    `width=${w}`,
    "fit=scale-down",
    "quality=82",
    `format=${outputFormat}`,
    `dpr=${dpr}`,
    sharpen ? "sharpen=1" : "",
  ]
    .filter(Boolean)
    .join(",");
  const path = storageKey
    .split("/")
    .map((s) => encodeURIComponent(s))
    .join("/");
  return `${originBase.replace(/\/$/, "")}/cdn-cgi/image/${opts}/${path}`;
}

async function enforceRateLimit(env, ip) {
  const url = env.UPSTASH_REDIS_REST_URL;
  const token = env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return;

  const key = `img:deliver:${ip}`;
  const base = url.replace(/\/$/, "");

  const r1 = await fetch(base, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(["INCR", key]),
  });
  if (!r1.ok) return;
  const j1 = await r1.json();
  const n = Number(j1.result);
  if (n === 1) {
    await fetch(base, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(["EXPIRE", key, RL_WINDOW_SEC]),
    });
  }
  if (n > RL_MAX) {
    const err = new Error("rl");
    err.code = "RL";
    throw err;
  }
}

function clientIp(request) {
  return (
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "0.0.0.0"
  );
}

function classifyTransformError(e) {
  if (e instanceof Error && e.name === "AbortError") return "timeout";
  return "network";
}

function toFallbackMetricReason(f) {
  if (f === "timeout") return "transform-timeout";
  if (f === "network") return "transform-network";
  if (f && typeof f === "object" && f.kind === "http") return `transform-http-${f.status}`;
  return "transform-network";
}

export default {
  async fetch(request, env) {
    const secret = env.IMAGE_DELIVERY_SECRET;
    const originBase = env.R2_PUBLIC_BASE_URL || env.NEXT_PUBLIC_R2_PUBLIC_BASE_URL;
    if (!secret || !originBase) {
      return new Response("Misconfigured worker", { status: 503 });
    }

    const url = new URL(request.url);
    if (!isDeliverUrlCanonical(url)) {
      emitMetric(env, { kind: "deliver_canonical_redirect", layer: "worker" });
      return Response.redirect(buildCanonicalDeliverUrl(url).toString(), 308);
    }

    const ip = clientIp(request);
    try {
      await enforceRateLimit(env, ip);
    } catch (e) {
      if (e && e.code === "RL") {
        return new Response("Too many requests", { status: 429 });
      }
    }

    const hash = url.searchParams.get("hash")?.trim().toLowerCase();
    const w = parseInt(url.searchParams.get("w") || "", 10);
    const dpr = parseInt(url.searchParams.get("dpr") || "1", 10);
    const exp = parseInt(url.searchParams.get("exp") || "", 10);
    let ext = url.searchParams.get("ext")?.trim().toLowerCase();
    if (ext === "jpg") ext = "jpeg";
    const sig = url.searchParams.get("sig")?.trim();

    const nowSec = Math.floor(Date.now() / 1000);

    if (!hash || !/^[a-f0-9]{64}$/.test(hash)) {
      return new Response("Bad hash", { status: 400 });
    }
    if (!ALLOWED_W.has(w) || !ALLOWED_DPR.has(dpr)) {
      return new Response("Bad w or dpr", { status: 400 });
    }
    if (!["avif", "webp", "jpeg"].includes(ext || "")) {
      return new Response("Bad ext", { status: 400 });
    }
    if (!sig || !Number.isFinite(exp)) {
      return new Response("Bad request", { status: 400 });
    }

    const expCheck = validateExp(exp, nowSec);
    if (!expCheck.ok) {
      const status = expCheck.reason === "too_far_future" ? 400 : 401;
      return new Response(expCheck.reason === "expired" ? "Expired" : "Bad exp", { status });
    }

    const v2 = buildV2(hash, w, dpr, exp, ext);
    let ok = await verifyHmac(secret, v2, sig);
    if (!ok && dpr === 1) {
      ok = await verifyHmac(secret, buildV1(hash, w, exp, ext), sig);
    }
    if (!ok) {
      return new Response("Forbidden", { status: 403 });
    }

    const suffix = ext === "jpeg" ? "jpg" : ext;
    const storageKey = `uploads/v2/${hash}/full.${suffix}`;
    const outputFormat = pickCdnOutputFormatFromAccept(request.headers.get("Accept"));
    const logicalPixels = w * dpr;
    const cdn = cdnTransformUrl(
      originBase,
      storageKey,
      w,
      dpr,
      outputFormat,
      logicalPixels <= 600
    );
    const directOriginUrl = buildR2PublicObjectUrl(originBase, storageKey);

    const ac = new AbortController();
    const tid = setTimeout(() => ac.abort(), UPSTREAM_TIMEOUT_MS);

    let transformRes = null;
    let transformFailure = null;

    try {
      transformRes = await fetch(cdn, {
        method: "GET",
        headers: { Accept: "*/*" },
        signal: ac.signal,
      });
      if (!transformRes.ok || !transformRes.body) {
        transformFailure = { kind: "http", status: transformRes.status };
      }
    } catch (e) {
      console.warn("[image-delivery-worker] transform fetch failed", e);
      transformFailure = classifyTransformError(e);
    } finally {
      clearTimeout(tid);
    }

    const transformCfCache = transformRes ? readCfCacheStatus(transformRes) : null;

    let upstream =
      transformRes && transformRes.ok && transformRes.body ? transformRes : null;
    let usedFallback = false;

    if (!upstream) {
      const ac2 = new AbortController();
      const t2 = setTimeout(() => ac2.abort(), UPSTREAM_TIMEOUT_MS);
      try {
        const direct = await fetch(directOriginUrl, {
          method: "GET",
          headers: { Accept: "*/*" },
          signal: ac2.signal,
        });
        if (direct.ok && direct.body) {
          upstream = direct;
          usedFallback = true;
        }
      } catch (e2) {
        console.error("[image-delivery-worker] direct origin failed", e2);
      } finally {
        clearTimeout(t2);
      }
    }

    if (!upstream || !upstream.ok || !upstream.body) {
      return new Response("Bad gateway", { status: 502 });
    }

    const mime = strictContentType(upstream.headers.get("Content-Type"), {
      kind: usedFallback ? "r2" : "transform",
      ...(usedFallback ? { storageExt: ext } : { format: outputFormat }),
    });

    const fr = usedFallback ? toFallbackMetricReason(transformFailure ?? "network") : undefined;

    emitMetric(env, {
      kind: "deliver_response",
      layer: "worker",
      hashPrefix: hash.slice(0, 16),
      usedFallback,
      fallbackReason: fr,
      upstreamCfCacheStatus: usedFallback ? transformCfCache : readCfCacheStatus(upstream),
      upstreamMismatch: mime.upstreamMismatch,
    });

    const cacheTag = `img:${hash.slice(0, 16)}`;

    const fallbackHeaders = {};
    if (usedFallback && transformFailure !== null) {
      fallbackHeaders["X-Image-Delivery-Fallback"] = "r2";
      if (transformFailure === "timeout") {
        fallbackHeaders["X-Image-Delivery-Fallback-Reason"] = "timeout";
      } else if (transformFailure === "network") {
        fallbackHeaders["X-Image-Delivery-Fallback-Reason"] = "error";
      } else {
        fallbackHeaders["X-Image-Delivery-Fallback-Reason"] = "error";
        fallbackHeaders["X-Image-Delivery-Fallback-Http-Status"] = String(transformFailure.status);
      }
    }

    return new Response(upstream.body, {
      status: 200,
      headers: {
        "Content-Type": mime.contentType,
        "Cache-Control": DELIVERY_CACHE_CONTROL_BROWSER,
        "CDN-Cache-Control": DELIVERY_CDN_CACHE_CONTROL,
        "Cache-Tag": cacheTag,
        "X-Content-Type-Options": "nosniff",
        ...fallbackHeaders,
      },
    });
  },
};
