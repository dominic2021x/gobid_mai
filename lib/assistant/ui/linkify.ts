/**
 * Splits text into segments for internal path linkification.
 * Only whitelisted prefixes (/dashboard, /ro, /auth) become links.
 * Used for assistant message text only; copy still uses raw content.
 */

export type LinkifySegment =
  | { type: "text"; value: string }
  | { type: "link"; value: string; href: string };

const WHITELISTED_PREFIXES = /^\/(?:dashboard|ro|auth)(?:\/|$|\?)/;
/** Matches internal path: /prefix, /prefix/rest, /prefix?query. Stops at whitespace or .,;:!)] */
const PATH_RE = /\/(?:dashboard|ro|auth)(?:\/[^\s.,;:!?)]*)?(?:\?[^\s.,;:!?)]*)?/g;

export function linkifyInternalPaths(text: string): LinkifySegment[] {
  const segments: LinkifySegment[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  PATH_RE.lastIndex = 0;
  while ((match = PATH_RE.exec(text)) !== null) {
    const path = match[0];
    if (!WHITELISTED_PREFIXES.test(path)) continue;
    segments.push({ type: "text", value: text.slice(lastIndex, match.index) });
    segments.push({ type: "link", value: path, href: path });
    lastIndex = match.index + path.length;
  }
  if (lastIndex < text.length) {
    segments.push({ type: "text", value: text.slice(lastIndex) });
  }
  return segments.length > 0 ? segments : [{ type: "text", value: text }];
}
