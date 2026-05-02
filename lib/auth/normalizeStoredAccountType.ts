/**
 * Valori permise în `user_profiles.account_type` / `user_metadata.account_type`.
 * Orice altceva (inclusiv gol, text arbitrar, „particular”) se persistă ca `private`
 * — adică utilizator neînregistrat ca firmă/entitate profesionistă în sensul platformei.
 */
const ALLOWED_ACCOUNT_TYPES = new Set([
  "private",
  "company",
  "business",
  "executor",
  "liquidator",
  "piese_auto",
]);

/**
 * Normalizează tipul de cont la scriere în DB / metadata.
 * „Particular” în UI = `private` în stocare.
 */
export function normalizeStoredAccountType(raw: unknown): string {
  const t = String(raw ?? "")
    .trim()
    .toLowerCase();
  if (!t) return "private";
  // Aliasuri românești / alternative → particular
  if (t === "particular" || t === "persoana_fizica" || t === "persoană-fizică" || t === "pf") {
    return "private";
  }
  if (ALLOWED_ACCOUNT_TYPES.has(t)) {
    return t;
  }
  return "private";
}
