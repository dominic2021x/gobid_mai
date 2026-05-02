/**
 * POST /api/admin/recategorizare/bulk
 * Bulk update: category, subcategory, level3, attributes for selected IDs or "apply to all matching filters".
 * Cap 5000 for apply-to-all. Audit per row. Admin only.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";
import { supabaseAdmin } from "@/lib/supabase";
import { verifyTaxonomy } from "@/lib/categorization/verifyTaxonomy";
import { applyCategoryChange } from "@/lib/categorization/applyCategoryChange";
import { z } from "zod";
import { ATTRIBUTE_KEYS } from "@/lib/taxonomy/ro/attributes";
import { buildQueryFromParams } from "@/lib/listings/filters";
import { getAdminRecategorizareListings } from "@/lib/server/admin-recategorizare/listingsRepo";

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


export const runtime = "nodejs";
export const maxDuration = 60;

const BULK_CAP = 5000;

const bulkBodySchema = z.object({
  productIds: z.array(z.string().min(1)).optional(),
  applyToAllMatchingFilters: z.boolean().optional(),
  filterParams: z.record(z.string(), z.unknown()).optional(),
  stream: z.boolean().optional(),
  category: z.string().min(1),
  subcategory: z.string().min(1),
  level3: z.string().nullable().optional(),
  level4: z.string().nullable().optional(),
  listCategory: z.string().nullable().optional(),
  brand: z.string().nullable().optional(),
  model: z.string().nullable().optional(),
  size: z.string().nullable().optional(),
  color: z.string().nullable().optional(),
  condition: z.string().nullable().optional(),
  attributes: z.record(z.string(), z.string()).optional(),
  county: z.string().nullable().optional(),
  city: z.string().nullable().optional(),
});

export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (!auth.ok) return auth.response;
  if (!supabaseAdmin) {
    return NextResponse.json({ success: false, error: "Supabase not configured" }, { status: 503 });
  }
  const admin = supabaseAdmin;

  let body: z.infer<typeof bulkBodySchema>;
  try {
    const raw = await request.json();
    if (raw == null || typeof raw !== "object") {
      return NextResponse.json({ success: false, error: "Body trebuie să fie un obiect JSON." }, { status: 400 });
    }
    body = bulkBodySchema.parse(raw);
  } catch (err) {
    if (err instanceof z.ZodError) {
      const details = err.issues.map((e) => `${e.path.join(".")}: ${e.message}`).join("; ");
      return NextResponse.json({ success: false, error: `Date invalide: ${details}` }, { status: 400 });
    }
    if (err instanceof SyntaxError) {
      return NextResponse.json({ success: false, error: "JSON invalid." }, { status: 400 });
    }
    return NextResponse.json({ success: false, error: "Invalid body" }, { status: 400 });
  }

  const verification = verifyTaxonomy({
    categorySlug: body.category,
    subcategorySlug: body.subcategory,
    level3Slug: body.level3 ?? undefined,
    level4Slug: body.level4 ?? undefined,
  });
  if (!verification.valid) {
    return NextResponse.json({ success: false, error: verification.error }, { status: 400 });
  }

  let ids: string[] = [];
  if (body.applyToAllMatchingFilters) {
    const filterParams =
      body.filterParams && typeof body.filterParams === "object"
        ? (body.filterParams as Record<string, unknown>)
        : {};
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(filterParams)) {
      if (v != null && v !== "") params.set(k, String(v));
    }
    try {
      const { query } = buildQueryFromParams(params);
      const titleSearch = (filterParams.titleSearch as string)?.trim() || undefined;
      const titleSearchMode = (titleSearch
        ? ((filterParams.titleSearchMode as string) || "and")
        : undefined) as "and" | "or" | "exact" | undefined;
      const onlyNeverRecategorized = filterParams.neverRecategorized === "1" || filterParams.neverRecategorized === "true";
      let excludeProductIds: string[] | undefined;
      if (onlyNeverRecategorized) {
        const ids = new Set<string>();
        let from = 0;
        const pageSize = 2000;
        while (true) {
          const { data: rows } = await admin
            .from("admin_recategorization_audit")
            .select("product_id")
            .not("product_id", "is", null)
            .range(from, from + pageSize - 1)
            .order("id", { ascending: true });
          if (!rows?.length) break;
          for (const row of rows) {
            const pid = row.product_id as string;
            if (pid) ids.add(pid);
          }
          if (rows.length < pageSize) break;
          from += pageSize;
          if (ids.size >= 100000) break;
        }
        excludeProductIds = Array.from(ids);
      }
      const collected: string[] = [];
      let cursor: string | null = null;
      do {
        const result = await getAdminRecategorizareListings({
          ...query,
          titleSearch,
          titleSearchMode,
          ...(excludeProductIds !== undefined ? { excludeProductIds } : {}),
          cursor: cursor ?? undefined,
          pageSize: 100,
        });
        for (const item of result.items) {
          const id = (item as { id?: string }).id;
          if (id) collected.push(id);
        }
        if (collected.length >= BULK_CAP) break;
        cursor = result.nextCursor;
        if (!result.hasMore || !cursor) break;
      } while (true);
      ids = collected.slice(0, BULK_CAP);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return NextResponse.json({ success: false, error: `Eroare la filtrare: ${message}` }, { status: 500 });
    }
  } else if (body.productIds?.length) {
    ids = body.productIds.slice(0, BULK_CAP);
  } else {
    return NextResponse.json({ success: false, error: "Provide productIds or applyToAllMatchingFilters with filterParams" }, { status: 400 });
  }

  const requestId = request.headers.get("x-request-id") ?? undefined;
  const selectFields = "id, title, category, subcategory, category_level_3, category_level_4, attributes, brand, model, size, color, condition, county, city";

  if (body.stream) {
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          controller.enqueue(encoder.encode(JSON.stringify({ type: "start", total: ids.length }) + "\n"));
          let appliedCount = 0;
          let failedCount = 0;
          for (let i = 0; i < ids.length; i++) {
            const productId = ids[i];
            const { data: before } = await admin
              .from("products")
              .select(selectFields)
              .eq("id", productId)
              .single();
            const title = (before as { title?: string } | null)?.title ?? "";

            if (!before) {
              failedCount++;
              controller.enqueue(
                encoder.encode(
                  JSON.stringify({
                    type: "progress",
                    index: i + 1,
                    total: ids.length,
                    id: productId,
                    title: title || productId.slice(0, 8),
                    ok: false,
                    error: "Not found",
                  }) + "\n"
                )
              );
              continue;
            }

            const applyResult = await applyCategoryChange({
              productId,
              categorySlug: body.category,
              subcategorySlug: body.subcategory,
              level3Slug: body.level3 ?? undefined,
              level4Slug: body.level4 ?? undefined,
              listCategory: body.listCategory ?? undefined,
            });

            if (!applyResult.ok) {
              failedCount++;
              controller.enqueue(
                encoder.encode(
                  JSON.stringify({
                    type: "progress",
                    index: i + 1,
                    total: ids.length,
                    id: productId,
                    title: title || productId.slice(0, 8),
                    ok: false,
                    error: applyResult.error ?? "Apply failed",
                  }) + "\n"
                )
              );
              continue;
            }

            const attrsToSet: Record<string, string> = {};
            if (body.attributes) {
              for (const key of ATTRIBUTE_KEYS) {
                const v = body.attributes[key];
                if (v !== undefined && v !== null && String(v).trim() !== "") attrsToSet[key] = String(v).trim();
              }
            }
            const extraUpdate: Record<string, unknown> = { updated_at: new Date().toISOString() };
            if (body.attributes && Object.keys(attrsToSet).length > 0) {
              extraUpdate.attributes = { ...((before as any).attributes ?? {}), ...attrsToSet };
            }
            if (body.brand !== undefined) extraUpdate.brand = body.brand?.trim() || null;
            if (body.model !== undefined) extraUpdate.model = body.model?.trim() || null;
            if (body.size !== undefined) extraUpdate.size = body.size?.trim() || null;
            if (body.color !== undefined) extraUpdate.color = body.color?.trim() || null;
            if (body.condition !== undefined) extraUpdate.condition = body.condition?.trim() || null;
            if (body.county !== undefined) extraUpdate.county = body.county?.trim() || null;
            if (body.city !== undefined) extraUpdate.city = body.city?.trim() || null;
            if (Object.keys(extraUpdate).length > 1) {
              const { error: extraErr } = await admin.from("products").update(extraUpdate).eq("id", productId);
              if (extraErr) {
                failedCount++;
                controller.enqueue(
                  encoder.encode(
                    JSON.stringify({
                      type: "progress",
                      index: i + 1,
                      total: ids.length,
                      id: productId,
                      title: title || productId.slice(0, 8),
                      ok: false,
                      error: "Extra fields update failed",
                    }) + "\n"
                  )
                );
                continue;
              }
            }

            const { data: after } = await admin
              .from("products")
              .select(selectFields)
              .eq("id", productId)
              .single();
            await admin.from("admin_recategorization_audit").insert({
              admin_user_id: auth.user.id,
              product_id: productId,
              action_type: body.applyToAllMatchingFilters ? "apply_to_all" : "bulk",
              before_json: before,
              after_json: after ?? before,
              request_id: requestId,
            });
            appliedCount++;
            controller.enqueue(
              encoder.encode(
                JSON.stringify({
                  type: "progress",
                  index: i + 1,
                  total: ids.length,
                  id: productId,
                  title: title || productId.slice(0, 8),
                  ok: true,
                }) + "\n"
              )
            );
          }
          controller.enqueue(
            encoder.encode(JSON.stringify({ type: "done", applied: appliedCount, failed: failedCount }) + "\n")
          );
        } catch (err) {
          controller.enqueue(
            encoder.encode(
              JSON.stringify({
                type: "error",
                error: err instanceof Error ? err.message : String(err),
              }) + "\n"
            )
          );
        } finally {
          controller.close();
        }
      },
    });
    return new Response(stream, {
      headers: {
        "Content-Type": "application/x-ndjson",
        "Cache-Control": "no-store",
      },
    });
  }

  const applied: string[] = [];
  const failed: { id: string; error: string }[] = [];

  for (const productId of ids) {
    const { data: before } = await admin
      .from("products")
      .select(selectFields)
      .eq("id", productId)
      .single();

    if (!before) {
      failed.push({ id: productId, error: "Not found" });
      continue;
    }

    const applyResult = await applyCategoryChange({
      productId,
      categorySlug: body.category,
      subcategorySlug: body.subcategory,
      level3Slug: body.level3 ?? undefined,
      level4Slug: body.level4 ?? undefined,
      listCategory: body.listCategory ?? undefined,
    });

    if (!applyResult.ok) {
      failed.push({ id: productId, error: applyResult.error ?? "Apply failed" });
      continue;
    }

    const attrsToSet: Record<string, string> = {};
    if (body.attributes) {
      for (const key of ATTRIBUTE_KEYS) {
        const v = body.attributes[key];
        if (v !== undefined && v !== null && String(v).trim() !== "") attrsToSet[key] = String(v).trim();
      }
    }

    const extraUpdate: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (body.attributes && Object.keys(attrsToSet).length > 0) {
      extraUpdate.attributes = { ...((before as any).attributes ?? {}), ...attrsToSet };
    }
    if (body.brand !== undefined) extraUpdate.brand = body.brand?.trim() || null;
    if (body.model !== undefined) extraUpdate.model = body.model?.trim() || null;
    if (body.size !== undefined) extraUpdate.size = body.size?.trim() || null;
    if (body.color !== undefined) extraUpdate.color = body.color?.trim() || null;
    if (body.condition !== undefined) extraUpdate.condition = body.condition?.trim() || null;
    if (body.county !== undefined) extraUpdate.county = body.county?.trim() || null;
    if (body.city !== undefined) extraUpdate.city = body.city?.trim() || null;

    if (Object.keys(extraUpdate).length > 1) {
      const { error: extraErr } = await admin
        .from("products")
        .update(extraUpdate)
        .eq("id", productId);
      if (extraErr) {
        failed.push({ id: productId, error: "Extra fields update failed" });
        continue;
      }
    }

    const { data: after } = await admin
      .from("products")
      .select(selectFields)
      .eq("id", productId)
      .single();

    await admin.from("admin_recategorization_audit").insert({
      admin_user_id: auth.user.id,
      product_id: productId,
      action_type: body.applyToAllMatchingFilters ? "apply_to_all" : "bulk",
      before_json: before,
      after_json: after ?? before,
      request_id: requestId,
    });

    applied.push(productId);
  }

  return NextResponse.json({
    success: true,
    applied: applied.length,
    failed: failed.length,
    appliedIds: applied.slice(0, 100),
    errors: failed.slice(0, 50),
  });
}
