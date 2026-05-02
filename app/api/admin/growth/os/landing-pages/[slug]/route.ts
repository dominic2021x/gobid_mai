import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";
import { evaluateUrl } from "@/lib/growth/rules";
import { growthJsonError } from "@/lib/growth/apiError";

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


const BASE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ||
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "https://www.gobid.ro");
const LP_PATH = "/ro/lp";

const ALLOWED_STATUS = new Set(["draft", "review", "published", "archived"]);

interface RouteParams {
  params: Promise<{ slug: string }>;
}

export async function GET(_req: NextRequest, { params }: RouteParams) {
  try {
    await requireAdmin(_req);
  } catch {
    return growthJsonError("Forbidden", "FORBIDDEN", 403);
  }
  const { slug } = await params;
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("seo_landing_pages")
    .select("*")
    .eq("slug", slug)
    .maybeSingle();
  if (error) return growthJsonError(error.message, "INTERNAL_ERROR", 500);
  if (!data) return growthJsonError("Not found", "NOT_FOUND", 404);
  return NextResponse.json(data);
}

export async function PATCH(req: NextRequest, { params }: RouteParams) {
  try {
    await requireAdmin(req);
  } catch {
    return growthJsonError("Forbidden", "FORBIDDEN", 403);
  }
  const { slug } = await params;
  let body: {
    title?: string;
    meta?: string;
    h1?: string;
    intro_md?: string;
    faq_json?: unknown;
    filters_json?: unknown;
    canonical_url?: string;
    noindex?: boolean;
    status?: string;
  } = {};
  try {
    body = await req.json().catch(() => ({}));
  } catch {
    body = {};
  }

  const supabase = createAdminClient();
  const { data: existing, error: fetchErr } = await supabase
    .from("seo_landing_pages")
    .select("status, noindex")
    .eq("slug", slug)
    .maybeSingle();
  if (fetchErr || !existing) return growthJsonError("Not found", "NOT_FOUND", 404);

  const newStatus = typeof body.status === "string" ? body.status.trim() : undefined;
  if (newStatus === "published") {
    const noindex = body.noindex !== undefined ? Boolean(body.noindex) : Boolean(existing.noindex);
    if (!noindex) {
      const lpUrl = `${BASE_URL}${LP_PATH}/${encodeURIComponent(slug)}`;
      const evaluation = evaluateUrl(lpUrl);
      if (!evaluation.indexable) {
        return NextResponse.json(
          {
            error: "Publish blocked: URL is not indexable. Set noindex to true or fix issues.",
            code: "PUBLISH_BLOCKED",
            reasons: evaluation.reasons,
          },
          { status: 422 }
        );
      }
    }
  }

  const updates: Record<string, unknown> = {};
  if (typeof body.title === "string") updates.title = body.title.trim();
  if (typeof body.meta === "string") updates.meta = body.meta.trim();
  if (typeof body.h1 === "string") updates.h1 = body.h1.trim();
  if (typeof body.intro_md === "string") updates.intro_md = body.intro_md;
  if (body.faq_json !== undefined) updates.faq_json = Array.isArray(body.faq_json) ? body.faq_json : (typeof body.faq_json === "object" && body.faq_json != null ? body.faq_json : []);
  if (body.filters_json !== undefined) updates.filters_json = typeof body.filters_json === "object" && body.filters_json != null ? body.filters_json : {};
  if (typeof body.canonical_url === "string") updates.canonical_url = body.canonical_url.trim() || null;
  if (typeof body.noindex === "boolean") updates.noindex = body.noindex;
  if (newStatus && ALLOWED_STATUS.has(newStatus)) updates.status = newStatus;

  if (Object.keys(updates).length === 0) return growthJsonError("No valid fields to update", "BAD_REQUEST", 400);

  const { data: updated, error } = await supabase
    .from("seo_landing_pages")
    .update(updates)
    .eq("slug", slug)
    .select()
    .single();
  if (error) return growthJsonError(error.message, "INTERNAL_ERROR", 500);

  if (newStatus === "published") {
    await supabase.from("growth_events").insert({
      type: "seo_landing_page_published",
      meta: { slug, title: updated?.title },
    });
  } else if (newStatus === "archived") {
    await supabase.from("growth_events").insert({
      type: "seo_landing_page_archived",
      meta: { slug },
    });
  } else {
    await supabase.from("growth_events").insert({
      type: "seo_landing_page_updated",
      meta: { slug, updated: Object.keys(updates) },
    });
  }

  return NextResponse.json(updated);
}
