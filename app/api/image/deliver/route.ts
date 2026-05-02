import { NextRequest, NextResponse } from "next/server";

import {
  isAllowedDeliveryDpr,
  isAllowedDeliveryWidth,
} from "@/lib/image/delivery-constants";
import { DELIVERY_CDN_CACHE_CONTROL, DELIVERY_CACHE_CONTROL_BROWSER } from "@/lib/image/delivery-cache-headers";
import { validateDeliveryExp } from "@/lib/image/delivery-exp-validation";
import { resolveStrictDeliveryContentType } from "@/lib/image/delivery-mime";
import {
  emitImageDeliveryMetric,
  readUpstreamCfCacheStatus,
  type DeliverFallbackMetricReason,
} from "@/lib/image/delivery-metrics";
import { buildCanonicalDeliverUrl, isDeliverUrlCanonical } from "@/lib/image/delivery-query";
import { enforceImageDeliveryRateLimit } from "@/lib/image/delivery-rate-limit";
import { getCdnImageUrl } from "@/lib/image/cdn";
import { pickCdnOutputFormatFromAccept } from "@/lib/image/pick-cdn-output-format";
import { getDeliverySecret, verifyDeliverySignature } from "@/lib/image/delivery-token";
import type { DeliveryExt } from "@/lib/image/delivery-token";
import { buildR2PublicObjectUrl } from "@/lib/image/r2-public-url";
import { getClientIp, RateLimitError } from "@/lib/security/rateLimit";
import { buildGlobalMasterKey, type MasterImageExt } from "@/lib/upload/optimized-image-keys";

const UPSTREAM_TIMEOUT_MS = 7000;

export const runtime = "edge";

function normalizeExt(raw: string | null): DeliveryExt | null {
  const e = raw?.trim().toLowerCase();
  if (e === "avif" || e === "webp") return e;
  if (e === "jpeg" || e === "jpg") return "jpeg";
  return null;
}

function toMasterExt(d: DeliveryExt): MasterImageExt {
  return d;
}

type TransformFailure = "timeout" | "network" | { kind: "http"; status: number };

function classifyTransformFailure(e: unknown): TransformFailure {
  if (e instanceof Error && e.name === "AbortError") return "timeout";
  return "network";
}

function toFallbackMetricReason(f: TransformFailure): DeliverFallbackMetricReason {
  if (f === "timeout") return "transform-timeout";
  if (f === "network") return "transform-network";
  return `transform-http-${f.status}` as DeliverFallbackMetricReason;
}

export async function GET(request: NextRequest) {
  if (!isDeliverUrlCanonical(request.nextUrl)) {
    emitImageDeliveryMetric({ kind: "deliver_canonical_redirect", layer: "edge" });
    return NextResponse.redirect(buildCanonicalDeliverUrl(request.nextUrl), 308);
  }

  const ip = getClientIp(request);
  try {
    await enforceImageDeliveryRateLimit(ip);
  } catch (e) {
    if (e instanceof RateLimitError) {
      return NextResponse.json({ error: e.message }, { status: 429 });
    }
    throw e;
  }

  const secret = getDeliverySecret();
  if (!secret) {
    return NextResponse.json(
      { error: "IMAGE_DELIVERY_SECRET nu este configurat." },
      { status: 503 }
    );
  }

  const sp = request.nextUrl.searchParams;
  const hash = sp.get("hash")?.trim().toLowerCase();
  const wRaw = sp.get("w");
  const dprRaw = sp.get("dpr");
  const expRaw = sp.get("exp");
  const extRaw = sp.get("ext");
  const sig = sp.get("sig")?.trim();

  if (!hash || !/^[a-f0-9]{64}$/.test(hash)) {
    return NextResponse.json({ error: "Parametru hash invalid." }, { status: 400 });
  }

  const w = wRaw ? parseInt(wRaw, 10) : NaN;
  if (!Number.isFinite(w) || !isAllowedDeliveryWidth(w)) {
    return NextResponse.json(
      { error: "Lățime permisă: 300, 600 sau 1200 (px logici)." },
      { status: 400 }
    );
  }

  const dpr = dprRaw ? parseInt(dprRaw, 10) : 1;
  if (!Number.isFinite(dpr) || !isAllowedDeliveryDpr(dpr)) {
    return NextResponse.json({ error: "DPR permis: 1 sau 2." }, { status: 400 });
  }

  const exp = expRaw ? parseInt(expRaw, 10) : NaN;
  if (!Number.isFinite(exp)) {
    return NextResponse.json({ error: "exp invalid." }, { status: 400 });
  }

  const expCheck = validateDeliveryExp(exp);
  if (!expCheck.ok) {
    const status = expCheck.reason === "too_far_future" ? 400 : 401;
    const msg =
      expCheck.reason === "expired"
        ? "Link expirat."
        : expCheck.reason === "too_far_future"
          ? "Parametru exp invalid (prea departe în viitor)."
          : "exp invalid.";
    return NextResponse.json({ error: msg }, { status });
  }

  const ext = normalizeExt(extRaw);
  if (!ext) {
    return NextResponse.json({ error: "ext trebuie să fie avif, webp sau jpeg." }, { status: 400 });
  }

  if (!sig) {
    return NextResponse.json({ error: "Lipsește semnătura." }, { status: 400 });
  }

  const ok = await verifyDeliverySignature(secret, { hash, w, dpr, exp, ext }, sig);
  if (!ok) {
    return NextResponse.json({ error: "Semnătură invalidă." }, { status: 403 });
  }

  const masterExt = toMasterExt(ext);
  const storageKey = buildGlobalMasterKey(hash, masterExt);
  const directOriginUrl = buildR2PublicObjectUrl(storageKey);

  const outputFormat = pickCdnOutputFormatFromAccept(request.headers.get("Accept"));
  const logicalPixels = w * dpr;

  const cdn = getCdnImageUrl(storageKey, {
    width: w,
    fit: "scale-down",
    quality: 82,
    format: outputFormat,
    dpr,
    sharpen: logicalPixels <= 600 ? 1 : 0,
  });

  const ac = new AbortController();
  const timeoutId = setTimeout(() => ac.abort(), UPSTREAM_TIMEOUT_MS);

  let transformRes: Response | null = null;
  let transformFailure: TransformFailure | null = null;

  try {
    transformRes = await fetch(cdn, {
      method: "GET",
      headers: { Accept: "*/*" },
      signal: ac.signal,
      cache: "default",
    });
    if (!transformRes.ok || !transformRes.body) {
      transformFailure = { kind: "http", status: transformRes.status };
    }
  } catch (e) {
    console.warn("[image/deliver] transform fetch failed, trying direct origin", e);
    transformFailure = classifyTransformFailure(e);
  } finally {
    clearTimeout(timeoutId);
  }

  const transformCfCache = transformRes ? readUpstreamCfCacheStatus(transformRes) : null;

  let upstream: Response | null =
    transformRes && transformRes.ok && transformRes.body ? transformRes : null;
  let usedFallback = false;

  if (!upstream) {
    if (directOriginUrl) {
      const ac2 = new AbortController();
      const t2 = setTimeout(() => ac2.abort(), UPSTREAM_TIMEOUT_MS);
      try {
        const direct = await fetch(directOriginUrl, {
          method: "GET",
          headers: { Accept: "*/*" },
          cache: "default",
          signal: ac2.signal,
        });
        if (direct.ok && direct.body) {
          upstream = direct;
          usedFallback = true;
        }
      } catch (e2) {
        console.error("[image/deliver] direct origin fetch failed", e2);
      } finally {
        clearTimeout(t2);
      }
    }
  }

  if (!upstream || !upstream.ok || !upstream.body) {
    return NextResponse.json(
      { error: "Imagine indisponibilă (transform și origine)." },
      { status: 502 }
    );
  }

  const fr: DeliverFallbackMetricReason | undefined = usedFallback
    ? toFallbackMetricReason(transformFailure ?? "network")
    : undefined;

  const mime = usedFallback
    ? resolveStrictDeliveryContentType(upstream.headers.get("Content-Type"), {
        kind: "r2",
        storageExt: ext,
      })
    : resolveStrictDeliveryContentType(upstream.headers.get("Content-Type"), {
        kind: "transform",
        format: outputFormat,
      });

  emitImageDeliveryMetric({
    kind: "deliver_response",
    layer: "edge",
    hashPrefix: hash.slice(0, 16),
    usedFallback,
    fallbackReason: fr,
    upstreamCfCacheStatus: usedFallback ? transformCfCache : readUpstreamCfCacheStatus(upstream),
    upstreamMismatch: mime.upstreamMismatch,
  });

  const cacheTag = `img:${hash.slice(0, 16)}`;

  const fallbackHeaders: Record<string, string> = {};
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

  const res = new NextResponse(upstream.body, {
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

  return res;
}
