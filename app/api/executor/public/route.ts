import { NextRequest, NextResponse } from "next/server";

/**
 * Compat: vechiul path — redirecționare către `/api/executor/licitator-public`
 * (segmentul `public` sub `app/api` poate cauza 404 în unele setup-uri Next).
 */
export async function GET(request: NextRequest) {
  const u = request.nextUrl.clone();
  u.pathname = "/api/executor/licitator-public";
  return NextResponse.redirect(u, 307);
}
