import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { enqueueJob } from "@/lib/growth/jobs";
import { growthJsonError } from "@/lib/growth/apiError";

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


export async function POST(req: NextRequest) {
  try {
    await requireAdmin(req);
  } catch {
    return growthJsonError("Forbidden", "FORBIDDEN", 403);
  }

  let body: { sitemapUrl?: string };
  try {
    body = await req.json().catch(() => ({}));
  } catch {
    body = {};
  }

  const sitemapUrl = typeof body.sitemapUrl === "string" ? body.sitemapUrl : "https://gobid.ro/sitemap.xml";

  try {
    const { jobId } = await enqueueJob({
      type: "seo_sitemap_ping",
      payload: { sitemapUrl },
    });
    return NextResponse.json({ jobId, sitemapUrl });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return growthJsonError(msg, "INTERNAL_ERROR", 500);
  }
}
