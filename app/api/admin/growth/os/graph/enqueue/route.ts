import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";
import { enqueueJob } from "@/lib/growth/jobs";
import { growthJsonError } from "@/lib/growth/apiError";

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


const ALLOWED_TYPES = new Set([
  "semantic_graph_refresh",
  "semantic_graph_embeddings_refresh",
  "semantic_graph_link_recs_refresh",
  "semantic_graph_pages_seed",
]);

export async function POST(req: NextRequest) {
  try {
    await requireAdmin(req);
  } catch {
    return growthJsonError("Forbidden", "FORBIDDEN", 403);
  }
  const body = await req.json().catch(() => ({}));
  const type = typeof body.type === "string" ? body.type.trim() : "";
  if (!ALLOWED_TYPES.has(type)) {
    return growthJsonError("Invalid type; use one of: semantic_graph_refresh, semantic_graph_embeddings_refresh, semantic_graph_link_recs_refresh, semantic_graph_pages_seed", "BAD_REQUEST", 400);
  }
  try {
    const supabase = createAdminClient();
    const { jobId } = await enqueueJob({ type, payload: {} }, supabase);
    return NextResponse.json({ jobId, type });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return growthJsonError(msg, "INTERNAL_ERROR", 500);
  }
}
