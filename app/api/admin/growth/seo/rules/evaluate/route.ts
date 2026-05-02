import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { evaluateUrl } from "@/lib/growth/rules";
import { growthJsonError } from "@/lib/growth/apiError";

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


export async function GET(req: NextRequest) {
  try {
    await requireAdmin(req);
  } catch {
    return growthJsonError("Forbidden", "FORBIDDEN", 403);
  }

  const url = req.nextUrl.searchParams.get("url");
  if (!url || typeof url !== "string") {
    return growthJsonError("Missing url query parameter", "BAD_REQUEST", 400);
  }

  const result = evaluateUrl(url);
  return NextResponse.json({
    indexable: result.indexable,
    canonical: result.canonical,
    reasons: result.reasons,
    robotsDirectives: result.robotsDirectives,
  });
}
