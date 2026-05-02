/**
 * Persistă ultimul query /ro pentru footer-ul mobil „Anunțuri” — revenire rapidă la aceleași filtre.
 * Valoarea este fără `?` (doar `category=…&…`).
 */

const STORAGE_KEY = "gobid_ro_footer_resume_query";

export function persistRoMarketplaceUrl(queryWithoutQuestionMark: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, queryWithoutQuestionMark);
  } catch {
    /* ignore */
  }
}

/** href pentru Link — `/ro` sau `/ro?…` după ultima vizită listări. */
export function getRoFooterResumeHref(): string {
  if (typeof window === "undefined") return "/ro";
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw != null && raw.length > 0) {
      return `/ro?${raw}`;
    }
  } catch {
    /* ignore */
  }
  return "/ro";
}

export function clearRoFooterPersistedQuery(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
