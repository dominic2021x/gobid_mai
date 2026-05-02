/**
 * Istoric căutări în localStorage (client-safe). Nu stochează PII; doar query string.
 */

const KEY = "gobid_search_history_v1";
const MAX_ITEMS = 10;

export function readSearchHistory(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((x): x is string => typeof x === "string")
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, MAX_ITEMS);
  } catch {
    return [];
  }
}

export function writeSearchHistory(q: string): void {
  if (typeof window === "undefined") return;
  const trimmed = (q ?? "").trim();
  if (!trimmed) return;
  const prev = readSearchHistory();
  const lower = trimmed.toLowerCase();
  const rest = prev.filter((x) => x.toLowerCase() !== lower);
  const next = [trimmed, ...rest].slice(0, MAX_ITEMS);
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // quota or disabled
  }
}
