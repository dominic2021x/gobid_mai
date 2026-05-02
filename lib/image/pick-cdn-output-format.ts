/** Output format for signed delivery / explicit CF `format=` (never `png` here). */
export type DeliveryOutputFormat = "avif" | "webp" | "jpeg";

type ParsedPart = { mime: string; q: number };

/**
 * Normalize Accept for stable negotiation: trim, collapse whitespace, strip empty parts.
 * Does not alter `q=` semantics beyond what `parseImageAcceptParts` already applies.
 */
export function normalizeAcceptHeader(accept: string | null | undefined): string | null {
  if (accept == null) return null;
  const parts = accept
    .split(",")
    .map((p) => p.trim().replace(/\s+/g, " "))
    .filter(Boolean);
  if (parts.length === 0) return null;
  return parts.join(", ");
}

/**
 * RFC 7231–style parsing: split by comma, extract image/* tokens and `q=` weights.
 */
function parseImageAcceptParts(accept: string): ParsedPart[] {
  const out: ParsedPart[] = [];
  for (const rawPart of accept.split(",")) {
    const part = rawPart.trim();
    if (!part) continue;
    const semi = part.indexOf(";");
    const mimePart = (semi === -1 ? part : part.slice(0, semi)).trim().toLowerCase();
    if (!mimePart.startsWith("image/") && mimePart !== "*/*") continue;

    let q = 1;
    if (semi !== -1) {
      const rest = part.slice(semi + 1);
      const qMatch = /(?:^|;)\s*q=\s*([0-9.]+)/i.exec(`;${rest}`);
      if (qMatch) {
        const n = parseFloat(qMatch[1]!);
        if (Number.isFinite(n)) q = Math.min(1, Math.max(0, n));
      }
    }
    out.push({ mime: mimePart, q });
  }
  out.sort((a, b) => b.q - a.q);
  return out;
}

/**
 * Single CF `format=` from normalized Accept (no `auto` → no `Vary: Accept` on our response).
 * Preference order when q &gt; 0: AVIF → WebP → JPEG.
 */
export function pickCdnOutputFormatFromAccept(accept: string | null): DeliveryOutputFormat {
  const a = normalizeAcceptHeader(accept);
  if (!a) return "jpeg";

  const parts = parseImageAcceptParts(a);

  const wants = (predicate: (mime: string) => boolean): boolean => {
    for (const p of parts) {
      if (p.q <= 0) continue;
      if (predicate(p.mime)) return true;
    }
    return false;
  };

  if (wants((m) => m === "image/avif" || m === "image/avif-sequence")) {
    return "avif";
  }
  if (wants((m) => m === "image/webp")) {
    return "webp";
  }
  if (wants((m) => m === "image/jpeg" || m === "image/jpg" || m === "image/pjpeg")) {
    return "jpeg";
  }
  if (wants((m) => m === "image/*" || m === "*/*")) {
    return "webp";
  }

  return "jpeg";
}
