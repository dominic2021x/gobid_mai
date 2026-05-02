/**
 * Shared filter schema for /ro and admin recategorizare.
 * Single source of truth for query params; validate with zod where needed.
 */

import { z } from "zod";

const listParam = z
  .string()
  .optional()
  .transform((v) => {
    if (!v?.trim()) return [] as string[];
    return v.split(",").map((s) => s.trim()).filter(Boolean);
  });

const numberParam = z
  .string()
  .optional()
  .transform((v) => {
    if (v == null || v === "") return undefined;
    const n = Number(v);
    return Number.isNaN(n) ? undefined : n;
  });

export const ALLOWED_SORT = [
  "relevant",
  "newest",
  "oldest",
  "timeleft",
  "priceLow",
  "priceHigh",
  "title",
  "price_asc",
  "price_desc",
  "date_asc",
  "date_desc",
] as const;
export const ALLOWED_STATUS = ["active", "reserved", "sold", "in_progress", "deleted"] as const;

export const filtersQuerySchema = z.object({
  from: numberParam.pipe(z.number().int().min(0).optional()),
  limit: numberParam.pipe(z.number().int().min(1).max(100).optional()),
  page: numberParam.pipe(z.number().int().min(1).optional()),
  pageSize: numberParam.pipe(z.number().int().min(1).max(100).optional()),
  channel: z.enum(["ro", "executari_insolventa"]).optional(),
  q: z.string().trim().optional(),
  category: z.string().trim().optional(),
  categorie: z.string().trim().optional(),
  subcategory: z.string().trim().optional(),
  subcategorie: z.string().trim().optional(),
  level3: z.string().trim().optional(),
  category_level_3: z.string().trim().optional(),
  county: z.string().trim().optional(),
  city: z.string().trim().optional(),
  location: z.string().trim().optional(),
  radiusKm: numberParam.optional(),
  nearLat: numberParam.optional(),
  nearLng: numberParam.optional(),
  priceMin: numberParam.optional(),
  price_max: numberParam.optional(),
  priceMax: numberParam.optional(),
  price_min: numberParam.optional(),
  size: z.string().trim().optional(),
  sizes: listParam.optional(),
  brand: z.string().trim().optional(),
  brands: listParam.optional(),
  color: z.string().trim().optional(),
  colors: listParam.optional(),
  condition: z.string().trim().optional(),
  conditions: listParam.optional(),
  model: z.string().trim().optional(),
  product_type: z.string().trim().optional(),
  productType: z.string().trim().optional(),
  sale_type: z.string().trim().optional(),
  saleType: z.string().trim().optional(),
  sort: z.enum(["relevant", "newest", "oldest", "timeleft", "priceLow", "priceHigh", "title", "price_asc", "price_desc", "date_asc", "date_desc"]).optional(),
  status: z.string().optional().transform((v) => {
    if (!v?.trim()) return undefined;
    const list = v.split(",").map((s) => s.trim()).filter((s) => (ALLOWED_STATUS as readonly string[]).includes(s));
    return list.length ? list : undefined;
  }),
  fuel: z.string().trim().optional(),
  bodyType: z.string().trim().optional(),
  partType: z.string().trim().optional(),
  department: z.string().trim().optional(),
  apparelType: z.string().trim().optional(),
  footwearType: z.string().trim().optional(),
  accessoryType: z.string().trim().optional(),
});

/** Admin recategorizare: extra params for title search and cursor */
export const adminListingsQuerySchema = filtersQuerySchema.extend({
  titleSearch: z.string().trim().optional(),
  titleSearchMode: z.enum(["and", "or", "exact"]).optional(),
  cursor: z.string().trim().optional(),
  pageSize: numberParam.pipe(z.number().int().min(1).max(50).optional()),
});

export type FiltersQueryParsed = z.infer<typeof filtersQuerySchema>;
export type AdminListingsQueryParsed = z.infer<typeof adminListingsQuerySchema>;
