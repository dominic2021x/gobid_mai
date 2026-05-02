import dns from "node:dns/promises";
import type { LookupAddress } from "node:dns";
import net from "node:net";

const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "127.0.0.1",
  "::1",
  "0.0.0.0",
  "metadata.google.internal",
  "metadata",
]);

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
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  return false;
}

function isPrivateIpv6(ip: string): boolean {
  const n = ip.toLowerCase();
  if (n === "::1") return true;
  if (n.startsWith("fc") || n.startsWith("fd")) return true; // ULA
  if (n.startsWith("fe80:")) return true; // link-local
  return false;
}

/**
 * Block SSRF: only http(s), no credentials in URL, hostname resolved IP must be public.
 */
export async function assertUrlSafeForFetch(rawUrl: string): Promise<void> {
  let u: URL;
  try {
    u = new URL(rawUrl);
  } catch {
    throw new Error("URL invalid.");
  }

  if (u.protocol !== "http:" && u.protocol !== "https:") {
    throw new Error("Doar http(s) este permis.");
  }

  if (u.username || u.password) {
    throw new Error("URL cu credențiale interzis.");
  }

  const host = u.hostname.toLowerCase();
  if (BLOCKED_HOSTNAMES.has(host)) {
    throw new Error("Hostname interzis.");
  }

  if (net.isIP(host)) {
    if (net.isIPv4(host) && isPrivateIpv4(host)) {
      throw new Error("IP privat interzis.");
    }
    if (net.isIPv6(host) && isPrivateIpv6(host)) {
      throw new Error("IP privat interzis.");
    }
    return;
  }

  let records: LookupAddress[];
  try {
    records = await dns.lookup(host, { all: true });
  } catch {
    throw new Error("DNS lookup eșuat.");
  }

  if (records.length === 0) {
    throw new Error("DNS fără rezultate.");
  }

  for (const r of records) {
    if (net.isIPv4(r.address) && isPrivateIpv4(r.address)) {
      throw new Error("Rezolvare DNS către IP privat — blocat (SSRF).");
    }
    if (net.isIPv6(r.address) && isPrivateIpv6(r.address)) {
      throw new Error("Rezolvare DNS către IP privat — blocat (SSRF).");
    }
  }
}
