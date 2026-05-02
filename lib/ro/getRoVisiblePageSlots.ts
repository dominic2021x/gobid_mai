/** Sloturi pentru UI paginare (numere + „…”) — pattern compact, lungime stabilă (nu listează toate paginile). */

export type RoPaginationSlot = number | "...";

/** Plafon pentru `delta` (vecini ±delta în jurul paginii curente). */
const MAX_PAGINATION_DELTA = 5;

export type GetRoVisiblePageSlotsOptions = {
  /**
   * La începutul listei (current ≤ delta + 1), extinde dreapta până la această pagină.
   * Implicit 7 (desktop); pe mobil folosiți 3 ca să nu umple rândul cu 6–7 pastile.
   */
  maxLeadingSpan?: number;
};

/**
 * Generează pattern „1 … fereastră … ultima”: include prima și ultima pagină în mulțime,
 * plus intervalul [current − delta, current + delta] (tăiat la 2..total−1).
 * La începutul navigării (current ≤ delta + 1), extinde dreapta ca să includă cel puțin paginile 2…min(maxLeadingSpan, total−1).
 */
export function getRoVisiblePageSlots(
  totalPages: number,
  currentPage: number,
  delta: number,
  options?: GetRoVisiblePageSlotsOptions,
): RoPaginationSlot[] {
  const safeTotal = Math.max(1, Math.floor(Number(totalPages) || 1));
  const current = Math.min(Math.max(1, Math.floor(Number(currentPage) || 1)), safeTotal);
  const raw = Math.floor(Number(delta) || 1);
  const siblings = Math.max(1, Math.min(MAX_PAGINATION_DELTA, Number.isFinite(raw) ? raw : 1));

  const maxLeadingSpan =
    typeof options?.maxLeadingSpan === "number" && Number.isFinite(options.maxLeadingSpan)
      ? Math.max(2, Math.min(7, Math.floor(options.maxLeadingSpan)))
      : 7;

  if (safeTotal <= 1) return [1];

  const pages = new Set<number>();
  pages.add(1);
  pages.add(safeTotal);

  let left = Math.max(2, current - siblings);
  let right = Math.min(safeTotal - 1, current + siblings);
  /** La începutul listei: arată cel puțin paginile 2…min(maxLeadingSpan, total−1) lângă 1 (înainte de „…”). */
  if (current <= siblings + 1) {
    right = Math.max(right, Math.min(maxLeadingSpan, safeTotal - 1));
  }
  for (let i = left; i <= right; i++) pages.add(i);

  const sorted = [...pages].sort((a, b) => a - b);
  const out: RoPaginationSlot[] = [];
  for (let i = 0; i < sorted.length; i++) {
    if (i > 0 && sorted[i] - sorted[i - 1] > 1) out.push("...");
    out.push(sorted[i]);
  }
  return out;
}
