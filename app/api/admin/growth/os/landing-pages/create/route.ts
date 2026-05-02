import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";
import { growthJsonError } from "@/lib/growth/apiError";

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


const STATUS_DRAFT = "draft";

export async function POST(req: NextRequest) {
  try {
    await requireAdmin(req);
  } catch {
    return growthJsonError("Forbidden", "FORBIDDEN", 403);
  }
  let body: {
    slug?: string;
    title?: string;
    meta?: string;
    h1?: string;
    intro_md?: string;
    faq_json?: unknown;
    filters_json?: unknown;
    canonical_url?: string;
    noindex?: boolean;
  } = {};
  try {
    body = await req.json().catch(() => ({}));
  } catch {
    body = {};
  }
  const slug = typeof body.slug === "string" ? body.slug.trim().replace(/[^a-z0-9-]/gi, "-").replace(/-+/g, "-").replace(/^-|-$/g, "") : "";
  if (!slug) return growthJsonError("slug is required", "BAD_REQUEST", 400);

  const supabase = createAdminClient();
  const { data: existing } = await supabase.from("seo_landing_pages").select("slug").eq("slug", slug).maybeSingle();
  if (existing) return growthJsonError("Landing page slug already exists", "CONFLICT", 409);

  const row = {
    slug,
    status: STATUS_DRAFT,
    title: typeof body.title === "string" ? body.title.trim() : null,
    meta: typeof body.meta === "string" ? body.meta.trim() : null,
    h1: typeof body.h1 === "string" ? body.h1.trim() : null,
    intro_md: typeof body.intro_md === "string" ? body.intro_md.trim() : null,
    faq_json: Array.isArray(body.faq_json) ? body.faq_json : (typeof body.faq_json === "object" && body.faq_json != null ? body.faq_json : []),
    filters_json: typeof body.filters_json === "object" && body.filters_json != null ? body.filters_json : {},
    canonical_url: typeof body.canonical_url === "string" ? body.canonical_url.trim() : null,
    noindex: Boolean(body.noindex),
  };

  const { data: inserted, error } = await supabase.from("seo_landing_pages").insert(row).select("slug, status, created_at").single();
  if (error) return growthJsonError(error.message, "INTERNAL_ERROR", 500);

  await supabase.from("growth_events").insert({
    type: "seo_landing_page_created",
    meta: { slug: inserted.slug, status: inserted.status },
  });

  return NextResponse.json({ slug: inserted.slug, status: inserted.status, created_at: inserted.created_at });
}
