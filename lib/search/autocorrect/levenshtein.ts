/**
 * Bounded Levenshtein distance for typo correction.
 * Only compute up to maxDistance for performance.
 */

/**
 * Levenshtein distance between two strings, capped at maxDistance+1.
 */
export function levenshteinDistance(a: string, b: string, maxDistance: number = 2): number {
  const na = a.length;
  const nb = b.length;
  if (na === 0) return nb;
  if (nb === 0) return na;
  if (Math.abs(na - nb) > maxDistance) return maxDistance + 1;

  const row = new Array<number>(nb + 1);
  for (let j = 0; j <= nb; j++) row[j] = j;

  for (let i = 1; i <= na; i++) {
    let prev = row[0];
    row[0] = i;
    let minInRow = i;
    for (let j = 1; j <= nb; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      const val = Math.min(row[j] + 1, row[j - 1] + 1, prev + cost);
      prev = row[j];
      row[j] = val;
      if (val < minInRow) minInRow = val;
    }
    if (minInRow > maxDistance) return maxDistance + 1;
  }
  return row[nb];
}

/**
 * Return true if b is within maxDistance of a.
 */
export function withinEditDistance(a: string, b: string, maxDistance: number): boolean {
  return levenshteinDistance(a, b, maxDistance) <= maxDistance;
}
