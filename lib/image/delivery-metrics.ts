/**
 * Structured metrics hooks for image delivery (Edge-safe). Aggregate in your log pipeline
 * (Datadog, Axiom, CloudWatch Logs Insights, etc.) via JSON field `s` = `image_delivery_v1`.
 *
 * Cache KPI: on successful transform paths, `upstreamCfCacheStatus` mirrors Cloudflare’s
 * `cf-cache-status` (e.g. HIT / MISS). Compute hit ratio as HIT / (HIT + MISS) for that field.
 */

export const IMAGE_DELIVERY_METRIC_MARKER = "image_delivery_v1";

export type DeliverFallbackMetricReason =
  | "transform-timeout"
  | "transform-network"
  | `transform-http-${number}`;

export type ImageDeliveryMetricEvent =
  | {
      kind: "signed_url_mint";
      ttlRequested: number;
      ttlApplied: number;
      ttlClamped: boolean;
    }
  | {
      kind: "deliver_response";
      layer: "edge";
      hashPrefix: string;
      usedFallback: boolean;
      /** Present when served from R2 master after transform failure */
      fallbackReason?: DeliverFallbackMetricReason;
      /** CF-Cache-Status from transform upstream (MISS/HIT/DYNAMIC/...) */
      upstreamCfCacheStatus?: string | null;
      upstreamMismatch?: boolean;
    }
  | {
      kind: "deliver_canonical_redirect";
      layer: "edge";
    };

function metricsEnabled(): boolean {
  return process.env.IMAGE_DELIVERY_METRICS !== "0" && process.env.IMAGE_DELIVERY_METRICS !== "false";
}

/** One-line JSON for log processors; noop when disabled. */
export function emitImageDeliveryMetric(event: ImageDeliveryMetricEvent): void {
  if (!metricsEnabled()) return;
  const payload = {
    s: IMAGE_DELIVERY_METRIC_MARKER,
    t: Date.now(),
    ...event,
  };
  console.log(JSON.stringify(payload));
}

/** Read CF cache status from a fetch Response (Cloudflare uses cf-cache-status). */
export function readUpstreamCfCacheStatus(res: Response): string | null {
  return res.headers.get("cf-cache-status") ?? res.headers.get("CF-Cache-Status");
}
