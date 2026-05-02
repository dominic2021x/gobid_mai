/**
 * Sortare listări /ro — aceleași chei ca `sortBy` în RoAuctionsViewClient și `?sort=` în URL.
 */

/** Canonical sort key (stare UI / parse URL). */
export function normalizeRoListingsSortKey(raw: string | null | undefined): string {
  const sortParam = (raw ?? "").trim() || "relevant";
  if (
    sortParam === "relevant" ||
    sortParam === "newest" ||
    sortParam === "oldest" ||
    sortParam === "timeLeft" ||
    sortParam === "timeleft" ||
    sortParam === "priceLow" ||
    sortParam === "priceHigh" ||
    sortParam === "title"
  ) {
    return sortParam === "timeleft" ? "timeLeft" : sortParam;
  }
  return "relevant";
}

/** Valoare pentru `?sort=` în API (`ALLOWED_SORT` în queryFromParams). */
export function sortKeyToApiParam(sortBy: string): string {
  if (sortBy === "timeLeft") return "timeleft";
  return sortBy;
}
