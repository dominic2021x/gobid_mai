import { NextRequest, NextResponse } from "next/server";
import { revalidatePath, revalidateTag } from "next/cache";
import { requireAdmin } from "@/lib/adminAuth";
import {
  PUBLIC_PATHS,
  LAYOUT_SEGMENTS,
  WARMUP_PATHS,
} from "@/lib/admin/cachePaths";
import { normalizeCategoryTag } from "@/lib/ro/getListingsCached";
import { logCacheEvent } from "@/lib/admin/cacheEvents";
import { supabaseAdmin } from "@/lib/supabase";
import { invalidateProductDerivedCaches } from "@/lib/server/products/invalidateDerivedCaches";

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


const FLUSH_RATE_LIMIT_SEC = 60;
/** Max product slugs to revalidate per user (public produs / live_bid / card-vizita). */
const MAX_USER_PRODUCT_PATHS = 2000;

/** Supabase-style UUID (case-insensitive). */
function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value.trim());
}
const METRICS_WINDOW_HOURS = 24;
const SETTINGS_KEY_CACHE_ENABLED = "cache_system_enabled";

async function isCacheEnabled(): Promise<boolean> {
  if (!supabaseAdmin) return false;
  const { data } = await supabaseAdmin
    .from("settings")
    .select("value")
    .eq("key", SETTINGS_KEY_CACHE_ENABLED)
    .maybeSingle();
  const value = data?.value as { enabled?: boolean } | null;
  return value?.enabled === true;
}

async function getCacheMetrics(): Promise<{
  totalInvalidations: number;
  avgWarmupTimeMs: number | null;
  operationsLast24h: number;
  lastCleanup: { at: string; deletedRows?: number } | null;
} | null> {
  if (!supabaseAdmin) return null;
  const since = new Date(Date.now() - METRICS_WINDOW_HOURS * 60 * 60 * 1000).toISOString();

  const invalidationTypes = ["clear_cache", "revalidate_path", "revalidate_tag"];
  const [invRes, warmupRes, totalRes, lastCleanupRes] = await Promise.all([
    supabaseAdmin
      .from("cache_events")
      .select("id", { count: "exact", head: true })
      .in("type", invalidationTypes)
      .gte("created_at", since),
    supabaseAdmin
      .from("cache_events")
      .select("duration_ms")
      .eq("type", "warmup")
      .eq("status", "ok")
      .not("duration_ms", "is", null)
      .gte("created_at", since),
    supabaseAdmin
      .from("cache_events")
      .select("id", { count: "exact", head: true })
      .gte("created_at", since),
    supabaseAdmin
      .from("cache_events")
      .select("created_at, meta")
      .eq("type", "cleanup")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const totalInvalidations = invRes.count ?? 0;
  const operationsLast24h = totalRes.count ?? 0;
  let lastCleanup: { at: string; deletedRows?: number } | null = null;
  if (lastCleanupRes.data) {
    const meta = lastCleanupRes.data.meta as { deletedRows?: number } | null;
    lastCleanup = {
      at: lastCleanupRes.data.created_at,
      deletedRows: meta?.deletedRows,
    };
  }

  let avgWarmupTimeMs: number | null = null;
  if (warmupRes.data && warmupRes.data.length > 0) {
    const valid = warmupRes.data.filter((r) => (r.duration_ms ?? 0) < 60000);
    if (valid.length > 0) {
      const sum = valid.reduce((a, r) => a + (r.duration_ms ?? 0), 0);
      avgWarmupTimeMs = Math.round(sum / valid.length);
    }
  }

  return { totalInvalidations, avgWarmupTimeMs, operationsLast24h, lastCleanup };
}

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (!auth.ok) return auth.response;

  const [metrics, cacheEnabled] = await Promise.all([getCacheMetrics(), isCacheEnabled()]);

  return NextResponse.json({
    success: true,
    cacheEnabled,
    cache: {
      roRouteRevalidateSeconds: 60,
      roListingsTag: "ro-listings",
      roListingsHttpCache: "public, s-maxage=30, stale-while-revalidate=300",
      publicPaths: PUBLIC_PATHS,
      layoutSegments: LAYOUT_SEGMENTS,
    },
    cronSecretConfigured: !!process.env.CRON_SECRET,
    cronSchedule: "Daily at 03:00 UTC",
    metrics: metrics ?? { totalInvalidations: 0, avgWarmupTimeMs: null, operationsLast24h: 0, lastCleanup: null },
    actions: [
      "revalidate_ro_page",
      "revalidate_public_pages",
      "revalidate_ro_listings",
      "revalidate_ro_listings_tag",
      "revalidate_category",
      "revalidate_user_public",
      "revalidate_everything_public",
      "warmup_cache",
      "warm_ro_listings_fresh",
    ],
    serverTime: new Date().toISOString(),
  });
}

async function lastFlushWithinLimit(): Promise<boolean> {
  if (!supabaseAdmin) return false;
  const since = new Date(Date.now() - FLUSH_RATE_LIMIT_SEC * 1000).toISOString();
  const { data } = await supabaseAdmin
    .from("cache_events")
    .select("id")
    .eq("type", "clear_cache")
    .gte("created_at", since)
    .limit(1)
    .maybeSingle();
  return !!data;
}

export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (!auth.ok) return auth.response;

  try {
    const body = await request.json().catch(() => ({}));
    const action = String(body?.action || "");
    const category = typeof body?.category === "string" ? body.category.trim() : "";
    const userIdRaw = typeof body?.userId === "string" ? body.userId.trim() : "";

    if (!action) {
      return NextResponse.json({ success: false, error: "Missing action" }, { status: 400 });
    }

    if (action === "set_cache_enabled") {
      const enabled = body?.enabled === true;
      if (!supabaseAdmin) {
        return NextResponse.json({ success: false, error: "Supabase not configured" }, { status: 500 });
      }
      const { error } = await supabaseAdmin
        .from("settings")
        .upsert(
          { key: SETTINGS_KEY_CACHE_ENABLED, value: { enabled }, updated_at: new Date().toISOString() },
          { onConflict: "key" }
        );
      if (error) {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
      }
      return NextResponse.json({
        success: true,
        action,
        cacheEnabled: enabled,
        message: enabled ? "Sistem cache pornit." : "Sistem cache oprit.",
      });
    }

    const cacheEnabled = await isCacheEnabled();
    if (!cacheEnabled) {
      return NextResponse.json({
        success: true,
        action,
        message: "Sistem cache este oprit. Acțiune ignorată. Pornește cache-ul pentru a executa revalidări.",
      });
    }

    const origin = new URL(request.url).origin;
    const start = Date.now();

    switch (action) {
      case "revalidate_ro_page": {
        revalidatePath("/ro");
        const duration_ms = Date.now() - start;
        await logCacheEvent({
          type: "revalidate_path",
          target: "/ro",
          status: "ok",
          duration_ms,
        });
        return NextResponse.json({ success: true, action, message: "Revalidated /ro page cache." });
      }
      case "revalidate_public_pages": {
        for (const p of PUBLIC_PATHS) revalidatePath(p);
        for (const seg of LAYOUT_SEGMENTS) revalidatePath(seg, "layout");
        const duration_ms = Date.now() - start;
        await logCacheEvent({
          type: "revalidate_path",
          target: "layout:public_pages",
          status: "ok",
          duration_ms,
        });
        return NextResponse.json({ success: true, action, message: "Revalidated public pages and layout segments." });
      }
      case "revalidate_ro_listings":
      case "revalidate_ro_listings_tag": {
        revalidateTag("ro-listings", "max");
        await invalidateProductDerivedCaches(`admin-cache:${action}`);
        const duration_ms = Date.now() - start;
        await logCacheEvent({
          type: "revalidate_tag",
          target: "ro-listings",
          status: "ok",
          duration_ms,
        });
        return NextResponse.json({ success: true, action, message: "Revalidated ro-listings tag cache." });
      }
      case "revalidate_category": {
        const slug = normalizeCategoryTag(category || undefined);
        if (!slug) {
          return NextResponse.json({ success: false, error: "Missing or invalid category" }, { status: 400 });
        }
        const tag = `ro-listings:category:${slug}`;
        revalidateTag(tag, "max");
        await invalidateProductDerivedCaches(`admin-cache:${action}:${slug}`);
        const duration_ms = Date.now() - start;
        await logCacheEvent({
          type: "revalidate_tag",
          target: tag,
          status: "ok",
          duration_ms,
        });
        return NextResponse.json({ success: true, action, message: `Revalidated category tag: ${tag}` });
      }
      case "revalidate_user_public": {
        if (!userIdRaw) {
          return NextResponse.json({ success: false, error: "Lipsește userId (UUID)." }, { status: 400 });
        }
        if (!isUuid(userIdRaw)) {
          return NextResponse.json({ success: false, error: "userId trebuie să fie un UUID valid." }, { status: 400 });
        }

        const userPath = `/user/${userIdRaw}`;
        revalidatePath(userPath);

        // Tot arborele /dashboard (Next nu are cache per-user pe aceeași rută — revalidarea layout e pentru shell RSC).
        revalidatePath("/dashboard", "layout");

        let slugCount = 0;
        let slugTruncated = false;
        if (supabaseAdmin) {
          const { data: productRows, error: productsError } = await supabaseAdmin
            .from("products")
            .select("slug")
            .eq("user_id", userIdRaw)
            .not("slug", "is", null)
            .limit(MAX_USER_PRODUCT_PATHS + 1);

          if (!productsError && productRows?.length) {
            if (productRows.length > MAX_USER_PRODUCT_PATHS) {
              slugTruncated = true;
            }
            const slugs = [
              ...new Set(
                productRows
                  .slice(0, MAX_USER_PRODUCT_PATHS)
                  .map((r: { slug?: string | null }) => (typeof r.slug === "string" ? r.slug.trim() : ""))
                  .filter((s: string) => s.length > 0)
              ),
            ];
            slugCount = slugs.length;
            for (const slug of slugs) {
              revalidatePath(`/produs/${slug}`);
              revalidatePath(`/live_bid/${slug}`);
              revalidatePath(`/card-vizita/${slug}`);
            }
          }
        }

        // Listări publice unde pot apărea produsele userului (fără ștergere date, doar invalidare cache date).
        revalidateTag("ro-listings", "max");

        const duration_ms = Date.now() - start;
        await logCacheEvent({
          type: "revalidate_path",
          target: `user-scope:${userIdRaw}`,
          status: "ok",
          duration_ms,
          meta: {
            userId: userIdRaw,
            userPublicPath: userPath,
            dashboardLayout: true,
            productSlugsRevalidated: slugCount,
            productSlugsTruncated: slugTruncated,
            roListingsTag: true,
          },
        });

        return NextResponse.json({
          success: true,
          action,
          message: `Cache revalidat pentru utilizator: profil public, dashboard (layout), ${slugCount} rute produs/live_bid/card-vizita, tag ro-listings.`,
          details: {
            userPath,
            dashboardLayoutRevalidated: true,
            productSlugsRevalidated: slugCount,
            productSlugsTruncated: slugTruncated,
            roListingsTagRevalidated: true,
          },
        });
      }
      case "revalidate_everything_public": {
        const withinLimit = await lastFlushWithinLimit();
        if (withinLimit) {
          return NextResponse.json(
            { success: false, error: `Flush rate limited. Try again after ${FLUSH_RATE_LIMIT_SEC}s.` },
            { status: 429 }
          );
        }
        for (const p of PUBLIC_PATHS) revalidatePath(p);
        for (const seg of LAYOUT_SEGMENTS) revalidatePath(seg, "layout");
        revalidateTag("ro-listings", "max");
        const duration_ms = Date.now() - start;
        await logCacheEvent({
          type: "clear_cache",
          target: "everything_public",
          status: "ok",
          duration_ms,
        });
        return NextResponse.json({
          success: true,
          action,
          message: "Revalidated all public paths, layout segments and ro-listings tag.",
        });
      }
      case "warmup_cache": {
        const results: { path: string; status: number }[] = [];
        for (const path of WARMUP_PATHS) {
          const res = await fetch(`${origin}${path}`, { cache: "no-store" });
          results.push({ path, status: res.status });
        }
        const total_urls = results.length;
        const ok_urls = results.filter((r) => r.status >= 200 && r.status < 300).length;
        const failed_urls = total_urls - ok_urls;
        const status = failed_urls === 0 ? "ok" : ok_urls === 0 ? "error" : "partial";
        const duration_ms = Date.now() - start;
        await logCacheEvent({
          type: "warmup",
          target: "warmup_paths",
          status,
          duration_ms,
          meta: {
            total_urls,
            ok_urls,
            failed_urls,
            ...(status === "error" ? { error: "All warmup URLs failed" } : {}),
          },
        });
        return NextResponse.json({
          success: true,
          action,
          message: "Warmup completed.",
          results,
        });
      }
      case "warm_ro_listings_fresh": {
        const warmUrl = `${origin}/api/ro/listings?from=0&limit=30&fresh=1`;
        const accessToken = request.headers.get("authorization") || "";
        const warmRes = await fetch(warmUrl, {
          headers: accessToken ? { Authorization: accessToken } : {},
          cache: "no-store",
        });
        const warmJson = await warmRes.json().catch(() => ({}));
        const duration_ms = Date.now() - start;
        await logCacheEvent({
          type: "warmup",
          target: "/api/ro/listings",
          status: warmRes.ok ? "ok" : "error",
          duration_ms,
          meta: {
            total_urls: 1,
            ok_urls: warmRes.ok ? 1 : 0,
            failed_urls: warmRes.ok ? 0 : 1,
            ...(warmRes.ok ? {} : { error: warmRes.statusText || `HTTP ${warmRes.status}` }),
          },
        });
        return NextResponse.json({
          success: warmRes.ok,
          action,
          warmStatus: warmRes.status,
          warm: warmJson,
          message: warmRes.ok ? "Warmed /api/ro/listings with fresh=1." : "Warm failed.",
        });
      }
      default:
        return NextResponse.json({ success: false, error: `Unknown action: ${action}` }, { status: 400 });
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
