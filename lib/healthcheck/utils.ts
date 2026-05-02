/**
 * Format current time in Europe/Bucharest as "YYYY-MM-DD HH:mm:ss" (24h).
 * Safe for Postgres timestamptz/text - no "p.m." or locale-dependent strings.
 */
const TZ = "Europe/Bucharest";

function pad2(s: string): string {
  return s.length >= 2 ? s : s.padStart(2, "0");
}

export function nowBucharestISO(): string {
  const now = new Date();
  const f = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const parts = f.formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "0";
  return `${get("year")}-${pad2(get("month"))}-${pad2(get("day"))} ${pad2(get("hour"))}:${pad2(get("minute"))}:${pad2(get("second"))}`;
}

export function runDateBucharest(): string {
  const now = new Date();
  const f = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = f.formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "0";
  return `${get("year")}-${pad2(get("month"))}-${pad2(get("day"))}`;
}
