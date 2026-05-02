import net from "node:net";

/**
 * `::ffff:127.0.0.1` etc. — formă uzuală pe Node pentru IPv4; o reducem la IPv4 pentru clasificare și afișare.
 */
export function unwrapIpv4MappedIpv6(ip: string): string {
  const t = ip.trim();
  const lower = t.toLowerCase();
  if (lower.startsWith("::ffff:")) {
    const v4 = t.slice(7).trim();
    if (net.isIPv4(v4)) return v4;
  }
  return t;
}

/** IPv4 privat / rezervat (aceeași idee ca SSRF guard). */
function isPrivateIpv4(ip: string): boolean {
  const parts = ip.split(".").map((x) => parseInt(x, 10));
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return true;
  const [a, b] = parts;
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  return false;
}

function isPrivateIpv6(ip: string): boolean {
  const n = ip.toLowerCase();
  if (n === "::1") return true;
  if (n.startsWith("fc") || n.startsWith("fd")) return true;
  if (n.startsWith("fe80:")) return true;
  return false;
}

/**
 * True dacă IP-ul clientului pare loopback / RFC1918 / ULA — refuzat pentru reconcile
 * dacă nu e setat R2_RECONCILE_ALLOW_PRIVATE_IP=true.
 */
export function isNonPublicClientIp(ip: string): boolean {
  const trimmed = unwrapIpv4MappedIpv6(ip).trim();
  if (!trimmed) return true;
  if (net.isIPv4(trimmed)) {
    return isPrivateIpv4(trimmed);
  }
  if (net.isIPv6(trimmed)) {
    return isPrivateIpv6(trimmed);
  }
  return true;
}

/**
 * Prima adresă din X-Forwarded-For sau fallback.
 */
export function getClientIpFromRequest(request: { headers: Headers }): string | null {
  const xff = request.headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  const real = request.headers.get("x-real-ip")?.trim();
  if (real) return real;
  return null;
}

function firstIpv4InCommaList(header: string | null): string | null {
  if (!header?.trim()) return null;
  for (const part of header.split(",")) {
    const ip = part.trim();
    if (net.isIPv4(ip)) return ip;
  }
  return null;
}

/**
 * Prima adresă **IPv4** din X-Forwarded-For (stânga→dreapta) sau X-Real-IP.
 * IPv6 este ignorat — potrivit pentru afișare UI unde vrei doar IPv4.
 */
export function getClientIpv4FromRequest(request: { headers: Headers }): string | null {
  const fromXff = firstIpv4InCommaList(request.headers.get("x-forwarded-for"));
  if (fromXff) return fromXff;
  const real = request.headers.get("x-real-ip")?.trim();
  if (real && net.isIPv4(real)) return real;
  return null;
}
