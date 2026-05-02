/**
 * Acceptă POST (form) cu url + html de pe pagina de produs (bookmarklet).
 * Parsează produsul și returnează HTML care salvează în sessionStorage și redirecționează la Produsele mele.
 */

import { NextRequest, NextResponse } from "next/server";
import { parsePieseAutoProductPage } from "@/lib/scraper/pieseauto";
import { parseOlxProductPage } from "@/lib/scraper/olx";

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


export const runtime = "nodejs";

const ALLOWED_ORIGINS = [
  "https://www.pieseauto.ro",
  "https://pieseauto.ro",
  "https://www.olx.ro",
  "https://olx.ro",
];

function isAllowedUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return ALLOWED_ORIGINS.includes(u.origin) && u.pathname.length > 1;
  } catch {
    return false;
  }
}

function getOriginHost(url: string): "pieseauto" | "olx" | null {
  try {
    const host = new URL(url).hostname.toLowerCase();
    if (host.includes("pieseauto.ro")) return "pieseauto";
    if (host.includes("olx.ro")) return "olx";
    return null;
  } catch {
    return null;
  }
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const urlVal = formData.get("url");
    const htmlVal = formData.get("html");
    const url = typeof urlVal === "string" ? urlVal.trim() : "";
    const html = typeof htmlVal === "string" ? htmlVal.trim() : "";

    if (!url || !html || html.length < 500) {
      return htmlResponse(
        "URL sau HTML lipsă. Folosește bookmarklet-ul de pe pagina de produs pieseauto.ro sau olx.ro.",
        false
      );
    }
    if (!isAllowedUrl(url)) {
      return htmlResponse("Doar URL-uri de la pieseauto.ro sau olx.ro (produse auto).", false);
    }

    const host = getOriginHost(url);
    let product: { title: string; price: number | null; currency: string; imageUrls: string[]; description: string; specifications: Record<string, string>; livrareSiPlata: string; url: string; externalId: string | null };

    if (host === "pieseauto") {
      product = parsePieseAutoProductPage(html, url);
    } else if (host === "olx") {
      const p = parseOlxProductPage(html, url);
      const hasContent =
        (p.title && p.title !== "Produs auto OLX") ||
        p.price != null ||
        p.description.length > 20 ||
        p.imageUrls.length > 0;
      if (!hasContent) {
        return htmlResponse("Din sursa paginii nu s-au putut extrage date de produs. Verifică că e pagina unui produs OLX.", false);
      }
      product = p;
    } else {
      return htmlResponse("URL neacceptat.", false);
    }

    const payload = {
      url: product.url || url,
      title: product.title || "Produs",
      price: product.price ?? null,
      currency: product.currency || "RON",
      imageUrls: Array.isArray(product.imageUrls) ? product.imageUrls : [],
      description: product.description || "",
      specifications: product.specifications || {},
      livrareSiPlata: product.livrareSiPlata || "",
    };

    return htmlResponse(null, true, payload);
  } catch (e) {
    return htmlResponse("Eroare la parsare. Încearcă din nou.", false);
  }
}

function htmlResponse(
  errorMessage: string | null,
  success: boolean,
  product?: { url: string; title: string; price: number | null; currency: string; imageUrls: string[]; description: string; specifications: Record<string, string>; livrareSiPlata: string }
): NextResponse {
  const storageKey = "gobid_pieseauto_import";
  const redirectPath = "/dashboard/piese-auto/my-products?tab=import";
  const html = success && product
    ? `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Import</title></head><body><p>Se redirecționează...</p><script>
try {
  var data = ${JSON.stringify([product])};
  sessionStorage.setItem("${storageKey}", JSON.stringify(data));
} catch (e) {}
location.replace("${redirectPath}");
</script></body></html>`
    : `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Eroare import</title></head><body><p>${(errorMessage || "Eroare").replace(/</g, "&lt;")}</p><script>setTimeout(function(){ location.replace("${redirectPath}"); }, 3000);</script><p><a href="${redirectPath}">Mergi la Produsele mele</a></p></body></html>`;

  return new NextResponse(html, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
