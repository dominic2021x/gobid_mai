/**
 * Clasificare erori AWS S3/R2: rețea vs autentificare vs altele (observabilitate).
 */

export type R2ErrorKind = "network" | "auth" | "other";

function httpStatus(e: unknown): number | undefined {
  if (!e || typeof e !== "object") return undefined;
  const meta = (e as { $metadata?: { httpStatusCode?: number } }).$metadata;
  return typeof meta?.httpStatusCode === "number" ? meta.httpStatusCode : undefined;
}

function errorName(e: unknown): string {
  if (!e || typeof e !== "object") return "";
  const n = (e as { name?: string }).name;
  return typeof n === "string" ? n : "";
}

function isAuthMessage(msg: string): boolean {
  const m = msg.toLowerCase();
  return (
    m.includes("access denied") ||
    m.includes("invalidaccesskey") ||
    m.includes("signature") ||
    m.includes("not authorized") ||
    m.includes("security token") ||
    m.includes("expiredtoken") ||
    m.includes("invalid token")
  );
}

function isNetworkMessage(msg: string): boolean {
  const m = msg.toLowerCase();
  return (
    m.includes("econnreset") ||
    m.includes("etimedout") ||
    m.includes("enotfound") ||
    m.includes("getaddrinfo") ||
    m.includes("socket hang up") ||
    m.includes("network") ||
    m.includes("fetch failed") ||
    m.includes("certificate") ||
    m.includes("tls") ||
    m.includes("eai_again")
  );
}

/**
 * Euristică pe mesaj + name + status HTTP (SDK v3). Returnează mereu un membru valid al {@link R2ErrorKind}.
 */
export function classifyR2DeleteError(e: unknown): R2ErrorKind {
  const status = httpStatus(e);
  if (status === 401 || status === 403) {
    return "auth";
  }

  const name = errorName(e);
  if (
    name === "NetworkingError" ||
    name === "TimeoutError" ||
    name === "ThrottlingException" ||
    name === "ServiceUnavailable" ||
    name === "RequestTimeout"
  ) {
    return "network";
  }

  const rawMsg = e instanceof Error ? e.message : String(e);
  const msg = rawMsg.toLowerCase();

  if (isNetworkMessage(msg)) {
    return "network";
  }

  if (isAuthMessage(msg)) {
    return "auth";
  }

  return "other";
}
