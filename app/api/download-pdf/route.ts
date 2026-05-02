/**
 * GET /api/download-pdf?url=...&filename=...
 * Proxiază un PDF extern și îl servește cu Content-Disposition: attachment
 * astfel încât browserul să îl descarce în loc să deschidă URL-ul.
 */
import { NextRequest, NextResponse } from "next/server";

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


const ALLOWED_HOSTS = [
  "licitatii-insolventa.ro",
  "www.licitatii-insolventa.ro",
  "anaf.ro",
  "www.anaf.ro",
  "static.anaf.ro",
  "repes.ro",
  "www.repes.ro",
  "localhost",
  "127.0.0.1",
];

function isPrivateOrLocalHost(host: string): boolean {
  const h = (host || "").toLowerCase().trim();
  if (!h) return true;
  if (h === "localhost" || h === "127.0.0.1" || h === "::1") return true;
  if (h.endsWith(".local")) return true;

  // RFC1918 + link-local + loopback IPv4
  if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(h)) return true;
  if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(h)) return true;
  if (/^172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}$/.test(h)) return true;
  if (/^169\.254\.\d{1,3}\.\d{1,3}$/.test(h)) return true;
  if (/^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(h)) return true;

  return false;
}

function isUrlAllowed(urlStr: string, requestHost?: string | null): boolean {
  try {
    const u = new URL(urlStr);
    const protocol = u.protocol.toLowerCase();
    const host = u.hostname.toLowerCase();
    const reqHost = (requestHost || "").toLowerCase();

    // Acceptăm strict doar http/https.
    if (protocol !== "http:" && protocol !== "https:") return false;

    // În development permitem toate host-urile (inclusiv domenii noi din surse externe).
    if (process.env.NODE_ENV !== "production") return true;

    // În dezvoltare locală permitem orice URL http/https ca să nu blocheze importurile PDF.
    if (reqHost === "localhost" || reqHost === "127.0.0.1") return true;

    if (ALLOWED_HOSTS.some((h) => host === h || host.endsWith("." + h))) return true;
    if (reqHost && host === reqHost) return true;

    // În producție permitem host-uri publice (de ex. storage/cdn externe),
    // dar blocăm explicit host-uri locale/private ca protecție SSRF.
    if (isPrivateOrLocalHost(host)) return false;
    return true;
  } catch {
    return false;
  }
}

export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get("url");
  const filename = request.nextUrl.searchParams.get("filename") || "document.pdf";
  const mode = request.nextUrl.searchParams.get("mode") === "view" ? "view" : "download";

  if (!url || !url.startsWith("http")) {
    return NextResponse.json({ error: "Missing or invalid url" }, { status: 400 });
  }

  const requestHost = request.headers.get("host")?.split(":")[0] ?? null;
  if (!isUrlAllowed(url, requestHost)) {
    return NextResponse.json({ error: "URL not allowed" }, { status: 403 });
  }

  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; LicitatiiBot/1.0)",
      },
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: `Upstream returned ${res.status}` },
        { status: res.status === 404 ? 404 : 502 }
      );
    }

    const contentType = res.headers.get("content-type") || "application/pdf";
    const buffer = await res.arrayBuffer();

    const safeFilename = filename.replace(/[^\w\s.-]/gi, "_").trim() || "document.pdf";
    const encodedFilename = encodeURIComponent(safeFilename.endsWith(".pdf") ? safeFilename : safeFilename + ".pdf");

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Disposition":
          mode === "view"
            ? `inline; filename="${safeFilename.replace(/"/g, '\\"')}"; filename*=UTF-8''${encodedFilename}`
            : `attachment; filename="${safeFilename.replace(/"/g, '\\"')}"; filename*=UTF-8''${encodedFilename}`,
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch (e) {
    console.warn("[download-pdf] fetch failed:", e);
    return NextResponse.json({ error: "Failed to fetch PDF" }, { status: 502 });
  }
}
