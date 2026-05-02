/**
 * API – Extrage date din URL produs auto (pieseauto.ro sau olx.ro)
 * POST /api/piese-auto/fetch-product
 * Body: { url: string, html?: string }
 * Logic lives in lib/piese-auto/fetch-product.ts (shared with import-csv).
 */

import { NextRequest, NextResponse } from "next/server";
import { fetchProductFromUrl, isAllowedProductUrl } from "@/lib/piese-auto/fetch-product";

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const url = typeof body?.url === "string" ? body.url.trim() : "";
    const pastedHtml = typeof body?.html === "string" ? body.html.trim() : "";

    if (!url) {
      return NextResponse.json({ success: false, error: "URL lipsește." }, { status: 400 });
    }
    if (!isAllowedProductUrl(url)) {
      return NextResponse.json(
        { success: false, error: "Folosește doar URL-uri de la pieseauto.ro sau olx.ro (produse auto)." },
        { status: 400 }
      );
    }

    const result = await fetchProductFromUrl(url, pastedHtml);
    if (!result.success) {
      const status = result.error?.includes("status ") ? 502 : result.error?.includes("HTML") ? 422 : 400;
      return NextResponse.json({ success: false, error: result.error ?? "Eroare la extragere." }, { status });
    }
    return NextResponse.json({ success: true, product: result.product });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Eroare la extragerea datelor.";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
