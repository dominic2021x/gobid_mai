/**
 * Hard safety: whitelist + enum validation for orchestrator output.
 * Only keys and values accepted by /api/ro/listings are allowed.
 */

import { RO_CATEGORIES, RO_SUBCATEGORY_NAMES } from "@/lib/data/ro-categories";
import { buildListingsQueryString } from "@/lib/ai/searchOrchestrator/plan";

const toTrimmedString = (v: unknown): string | undefined => {
  if (typeof v !== "string") return undefined;
  const s = v.trim();
  return s.length ? s : undefined;
};

const toNumber = (v: unknown): number | undefined => {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return undefined;
};

export const ALLOWED_FILTER_KEYS = [
  "category",
  "subcategory",
  "county",
  "city",
  "location",
  "brand",
  "model",
  "color",
  "condition",
  "priceMin",
  "priceMax",
  "sort",
] as const;

export type AllowedFilterKey = (typeof ALLOWED_FILTER_KEYS)[number];

export const ALLOWED_SORT = new Set([
  "relevant",
  "newest",
  "timeleft",
  "priceLow",
  "priceHigh",
  "title",
  "price_asc",
  "price_desc",
  "date_asc",
  "date_desc",
]);

const VALID_CATEGORY_SLUGS = new Set(
  Object.keys(RO_CATEGORIES).filter((k) => k !== "all")
);

const VALID_SUBCATEGORY_SLUGS = new Set(Object.keys(RO_SUBCATEGORY_NAMES));

export type SanitizedFilters = Partial<{
  category: string;
  subcategory: string;
  county: string;
  city: string;
  location: string;
  brand: string;
  model: string;
  color: string;
  condition: string;
  priceMin: number;
  priceMax: number;
  sort: string;
}>;

export function sanitizeProposedFilters(raw: unknown): SanitizedFilters {
  const out: SanitizedFilters = {};
  if (!raw || typeof raw !== "object") return out;

  const obj = raw as Record<string, unknown>;

  const category = toTrimmedString(obj.category);
  if (category && VALID_CATEGORY_SLUGS.has(category)) out.category = category;

  const subcategory = toTrimmedString(obj.subcategory);
  if (subcategory && VALID_SUBCATEGORY_SLUGS.has(subcategory)) out.subcategory = subcategory;

  const sort = toTrimmedString(obj.sort);
  if (sort && ALLOWED_SORT.has(sort)) out.sort = sort;

  const priceMin = toNumber(obj.priceMin);
  if (typeof priceMin === "number") out.priceMin = priceMin;

  const priceMax = toNumber(obj.priceMax);
  if (typeof priceMax === "number") out.priceMax = priceMax;

  for (const k of ["county", "city", "location", "brand", "model", "color", "condition"] as const) {
    const v = toTrimmedString(obj[k]);
    if (v) (out as Record<string, string>)[k] = v;
  }

  if (typeof out.priceMin === "number" && typeof out.priceMax === "number") {
    if (out.priceMin > out.priceMax) {
      const tmp = out.priceMin;
      out.priceMin = out.priceMax;
      out.priceMax = tmp;
    }
  }

  return out;
}

export type ParsedListingsQuery = {
  q: string;
  from: number;
  limit: number;
  filters: SanitizedFilters;
};

const clampInt = (n: number, min: number, max: number): number => {
  const v = Math.floor(n);
  if (!Number.isFinite(v)) return min;
  return Math.max(min, Math.min(max, v));
};

export function parseListingsQueryString(qsOrUrl: string): ParsedListingsQuery {
  let url: URL;
  try {
    url = qsOrUrl.startsWith("http")
      ? new URL(qsOrUrl)
      : new URL(
          qsOrUrl.startsWith("/api")
            ? `https://local${qsOrUrl}`
            : `https://local/?${qsOrUrl.replace(/^\?/, "")}`
        );
  } catch {
    return { q: "", from: 0, limit: 18, filters: {} };
  }

  const sp = url.searchParams;

  const q = (sp.get("q") ?? "").trim();
  const from = clampInt(Number(sp.get("from") ?? "0"), 0, 10_000_000);
  const limit = clampInt(Number(sp.get("limit") ?? "18"), 1, 100);

  const rawFilters: Record<string, unknown> = {};
  for (const key of ALLOWED_FILTER_KEYS) {
    const val = sp.get(key);
    if (val !== null) rawFilters[key] = val;
  }

  const filters = sanitizeProposedFilters(rawFilters);

  return { q, from, limit, filters };
}

export function sanitizeStepListingsQuery(
  rawQuery: unknown,
  fallbackQ: string,
  fallbackLimit: number
): string {
  const raw = typeof rawQuery === "string" ? rawQuery : "";

  const parsed = parseListingsQueryString(raw);
  const safeQ = (parsed.q || fallbackQ || "").trim();
  const safeLimit = clampInt(parsed.limit || fallbackLimit, 1, 100);

  const safeFilters = sanitizeProposedFilters(parsed.filters);

  const qs = buildListingsQueryString({
    q: safeQ,
    filters: safeFilters,
    from: parsed.from ?? 0,
    limit: safeLimit,
  });

  return `/api/ro/listings?${qs}`;
}
