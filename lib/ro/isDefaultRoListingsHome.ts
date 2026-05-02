import { normalizeRoListingsSearchParams } from "@/lib/ro/normalizedListingsQuery";

/**
 * `/ro` „acasă”: primul offset, fără cursor, fără filtre din `hasFilters`.
 * Folosit pentru rândul „pentru tine” și pentru a nu suprapune personalizarea peste căutări/filtre.
 */
export function isDefaultRoListingsHomeUrl(searchParams: URLSearchParams): boolean {
  const sp = new URLSearchParams(searchParams.toString());
  const from = Math.max(0, Number(sp.get("from") ?? 0) || 0);
  if (from > 0) return false;
  const page = Math.max(1, Number(sp.get("page") ?? 1) || 1);
  if (page > 1) return false;
  if (sp.get("cursor")?.trim()) return false;
  const normalized = normalizeRoListingsSearchParams(sp);
  return !normalized.hasFilters;
}
