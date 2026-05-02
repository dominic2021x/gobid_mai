/**
 * Strict WHERE builders for RO listings and count.
 * Same logic as the first (strict) step of /api/ro/listings – no progressive relax, no merge/append.
 * Used by listingsRepo (optional Prisma) și listingsCountRepo (Supabase/PostgREST count).
 * Channel + token gating: applied here so list and count stay in sync.
 */

import type { Prisma } from "@/lib/generated/prisma";
import type { AccessContext } from "@/lib/server/access/resolveAccess";
import { normalizeConditionForForm } from "@/lib/attributes";
import { getPieseAutoCategoryLevel3MatchVariants } from "@/lib/piese-auto/tip-piesa-level3";
import { getExecutariSubcategoryAliases } from "@/lib/listings/executari-canonical-subcategory";
import { qToDistinctSearchTokens } from "@/lib/listings/filters/qSearchTokens";

function appendCategoryLevel3Condition(
  conditions: Prisma.productsWhereInput[],
  sub: string,
  categoryLevel3Param: string | undefined,
  categoryLevel3List?: string[] | undefined
): void {
  const list = (categoryLevel3List ?? [])
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s && s !== "all");
  if (list.length > 0) {
    if (sub === "piese-auto") {
      const perSlug: Prisma.productsWhereInput[] = list.map((slug) => ({
        OR: getPieseAutoCategoryLevel3MatchVariants(slug).map((v) => ({
          category_level_3: { equals: v, mode: "insensitive" as const },
        })),
      }));
      conditions.push({ OR: perSlug });
    } else {
      conditions.push({
        OR: list.map((l3) => ({
          category_level_3: { equals: l3, mode: "insensitive" as const },
        })),
      });
    }
    return;
  }

  const l3 = (categoryLevel3Param ?? "").trim().toLowerCase();
  if (!l3 || l3 === "all") return;
  if (sub === "piese-auto") {
    const variants = getPieseAutoCategoryLevel3MatchVariants(l3);
    conditions.push({
      OR: variants.map((v) => ({
        category_level_3: { equals: v, mode: "insensitive" as const },
      })),
    });
    return;
  }
  conditions.push({ category_level_3: { equals: l3, mode: "insensitive" } });
}

/** Stare pe piese-auto: coloana `condition` aliniată la Nou / Second hand (nu slug-uri gen foarte-bun). */
function pushRoConditionClause(
  out: Prisma.productsWhereInput[],
  params: Pick<ProductQueryStrict, "subcategorie" | "subcategory" | "condition" | "conditions">
): void {
  const sub = (params.subcategorie ?? params.subcategory ?? "").trim().toLowerCase();
  const cond = params.condition ?? "";
  const conditionsList = params.conditions ?? [];
  const rawSelections =
    conditionsList.length > 0 ? conditionsList : cond && cond !== "all" ? [cond] : [];
  if (rawSelections.length === 0) return;

  if (sub === "piese-auto") {
    const normalized = new Set(rawSelections.map((r) => normalizeConditionForForm(r)));
    if (normalized.size >= 2) return;
    const only = [...normalized][0];
    if (only === "Nou") {
      out.push({
        OR: [
          { condition: { equals: "Nou", mode: "insensitive" } },
          { condition: { equals: "Nouă", mode: "insensitive" } },
        ],
      });
      return;
    }
    out.push({
      NOT: {
        OR: [
          { condition: { equals: "Nou", mode: "insensitive" } },
          { condition: { equals: "Nouă", mode: "insensitive" } },
        ],
      },
    });
    return;
  }

  if (conditionsList.length > 0) {
    out.push({ condition: { in: conditionsList } });
  } else if (cond && cond !== "all") {
    out.push({ condition: { equals: cond, mode: "insensitive" } });
  }
}

/** Allowed channel values: ro = main marketplace, executari_insolventa = token-gated. */
export type RoChannel = "ro" | "executari_insolventa";

/** Same shape as ProductQuery in listingsRepo – used for strict build only (from/limit/sort ignored). */
export type ListingsScope = "all" | "live_bid" | "executari";

export interface ProductQueryStrict {
  /** Channel: ro (default) or executari_insolventa. Drives which rows are allowed + gating. */
  channel?: RoChannel;
  /** Scope from /ro filters: live_bid = only ro, executari = only executari_insolventa, all = both. */
  scope?: ListingsScope;
  includeExecutariCrosslist?: boolean;
  q?: string;
  categorie?: string;
  categories?: string[];
  subcategorie?: string;
  subcategory?: string;
  subcategories?: string[];
  category_level_3?: string;
  /** Mai multe tipuri piesă (URL level3s=a,b) – în special piese-auto. */
  category_level_3s?: string[];
  list_category?: string;
  list_categories?: string[];
  county?: string;
  city?: string;
  location?: string;
  price_min?: number;
  price_max?: number;
  size?: string;
  sizes?: string[];
  brand?: string;
  brands?: string[];
  color?: string;
  colors?: string[];
  condition?: string;
  conditions?: string[];
  /** Filtru poze: with = are imagini, without = fără imagini. */
  images?: "with" | "without";
  model?: string;
  product_type?: string;
  sale_type?: string;
  status?: string | string[];
  /** Canonical attributes (products.attributes JSONB). */
  fuel?: string;
  bodyType?: string;
  partType?: string;
  department?: string;
  apparelType?: string;
  footwearType?: string;
  accessoryType?: string;
  /** Din URL `vanzator`; rezolvat server-side în `seller_user_ids` pentru query. */
  sellerKinds?: ("particular" | "companie")[];
  /** După resolveSellerUserIdsForQuery: produse cu user_id în listă. */
  seller_user_ids?: string[];
  /** True = „particular”: `user_id` NOT IN `seller_user_ids` sau `user_id` null (lista = vânzători companie). */
  seller_user_ids_exclude?: boolean;
  /** Doar produse gratuite — aliniat cu UI /ro (freeOnly în URL). */
  freeOnly?: boolean;
}

/** Same scope as /api/ro/listings; used by cron auto-categorize and count. */
export const DEFAULT_STATUS = ["active", "reserved", "sold", "in_progress"] as const;

/** When true, Prisma/Supabase use channel + access gating. Set after migration and prisma generate. */
export const USE_PRODUCTS_CHANNEL = process.env.USE_PRODUCTS_CHANNEL === "true";

/**
 * Build Prisma where clause for STRICT filtering only (no relax steps).
 * Matches the first step of getRoListings used by /api/ro/listings.
 * When USE_PRODUCTS_CHANNEL=true: applies channel + access gating (same logic as count endpoint).
 * When false/unset: skips channel so Prisma works without the column (e.g. before migration).
 */
export function buildPrismaWhereStrict(
  params: ProductQueryStrict,
  access?: AccessContext
): Prisma.productsWhereInput {
  const conditions: Prisma.productsWhereInput[] = [];

  const categories = (params.categories ?? [])
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s && s !== "all");
  const cat = categories.length === 1 ? categories[0] : (params.categorie ?? "").trim().toLowerCase();
  const categoryFilters = categories.length > 0 ? categories : (cat && cat !== "all" ? [cat] : []);
  const includeExecutariCrosslist =
    params.includeExecutariCrosslist === true ||
    params.scope === "executari" ||
    categoryFilters.includes("executari") ||
    params.channel === "executari_insolventa";
  const scope = params.scope ?? "all";
  if (USE_PRODUCTS_CHANNEL) {
    const channel: RoChannel = (params.channel ?? "ro") as RoChannel;
    if (scope === "live_bid") {
      conditions.push({ channel: "ro" });
    } else if (scope === "executari") {
      if (!access?.hasExecutariAccess) {
        return { id: { in: [] } };
      }
      conditions.push({ channel: "executari_insolventa" });
    } else if (channel === "executari_insolventa") {
      if (!access?.hasExecutariAccess) {
        return { id: { in: [] } };
      }
      conditions.push({ channel: "executari_insolventa" });
    } else if (categoryFilters.includes("executari")) {
      conditions.push({
        OR: access?.hasExecutariAccess
          ? [{ channel: "ro" }, { channel: "executari_insolventa" }]
          : [{ channel: "ro" }],
      });
    } else if (!includeExecutariCrosslist) {
      conditions.push({ channel: "ro" });
    } else {
      conditions.push({
        OR: [{ channel: "ro" }, { channel: "executari_insolventa" }],
      });
    }
  }

  const statusFilter = params.status;
  if (Array.isArray(statusFilter) && statusFilter.length > 0) {
    conditions.push({ status: { in: statusFilter } });
  } else {
    conditions.push({ status: { in: [...DEFAULT_STATUS] } });
  }

  const q = (params.q ?? "").trim();
  if (q) {
    const words = qToDistinctSearchTokens(q);
    const hasBrandFilter =
      (params.brand && params.brand.trim() && params.brand.toLowerCase() !== "all") ||
      ((params.brands?.length ?? 0) > 0);
    const searchFields = hasBrandFilter
      ? (["title"] as const)
      : (["title", "category", "subcategory", "category_level_3", "brand", "model", "slug"] as const);
    for (const word of words) {
      conditions.push({
        OR: searchFields.map((field) => ({
          [field]: { contains: word, mode: "insensitive" as const },
        })),
      });
    }
  }

  const modelVal = (params.model ?? "").trim();
  if (modelVal && modelVal !== "all") {
    conditions.push({ model: { contains: modelVal, mode: "insensitive" } });
  }

  // NOTE: image filters are applied in listingsRepo row-level checks because
  // placeholders (/no-image-placeholder.svg, /images/category-defaults/*) must
  // count as "without images", not as real photos.

  if (categoryFilters.length > 0) {
    const execMap: Record<string, string[]> = {
      "imobiliare": ["exec-imobiliare"],
      "autovehicule": ["exec-autovehicule", "piese-auto"],
      "business": ["exec-afaceri", "exec-office"],
      "utilaje": ["exec-industrial"],
    };
    const categoryOr: Prisma.productsWhereInput[] = [];
    for (const category of categoryFilters) {
      if (category === "executari") {
        categoryOr.push(
          { category: { contains: "executari", mode: "insensitive" } },
          { product_type: { equals: "licitatii-publice", mode: "insensitive" } },
          { sale_type: { in: ["licitatie-publica", "licitatii-insolventa", "licitatii-anaf", "licitatii-executori"] } }
        );
      } else {
        const extraSubs = includeExecutariCrosslist ? (execMap[category] || []) : [];
        categoryOr.push(
          { category: { equals: category, mode: "insensitive" } },
          ...extraSubs.map(s => ({ subcategory: { equals: s, mode: "insensitive" as const } }))
        );
      }
    }
    conditions.push({ OR: categoryOr });
  }

  const subcategories = (params.subcategories ?? [])
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s && s !== "all");
  const sub = subcategories.length === 1
    ? subcategories[0]
    : (params.subcategorie ?? params.subcategory ?? "").trim().toLowerCase();
  const subcategoryFilters = subcategories.length > 0 ? subcategories : (sub && sub !== "all" ? [sub] : []);
  if (subcategoryFilters.length > 0) {
    // Determine target exec-subcategories
    const execSubMap: Record<string, string[]> = {
      // Auto
      "autoturisme": ["exec-autovehicule", "piese-auto"],
      "suv-4x4": ["exec-autovehicule", "piese-auto"],
      "motociclete": ["exec-autovehicule", "piese-auto"],
      "camioane": ["exec-autovehicule", "piese-auto"],
      "remorci": ["exec-autovehicule", "piese-auto"],
      "vehicule-electrice": ["exec-autovehicule", "piese-auto"],
      /** Doar anunțuri piese (fără exec-autovehicule încrucișate). */
      "piese-auto": [],
      // Utilaje
      "utilaje-constructii": ["exec-industrial"],
      "utilaje-agricole": ["exec-industrial"],
      "echipamente-forestiere": ["exec-industrial"],
      // Business
      "echipamente-birou": ["exec-office", "exec-afaceri"],
      "mobilier-comercial": ["exec-afaceri"]
    };

    const expandedSubs = new Set<string>();
    for (const subFilter of subcategoryFilters) {
      const extraExecSubs = execSubMap[subFilter] || [];
      if (subFilter === "terenuri") {
        ["terenuri", "terenuri-intravilane", "terenuri-extravilane", "terenuri-agricole", ...extraExecSubs]
          .forEach((s) => expandedSubs.add(s));
      } else {
        [subFilter, ...extraExecSubs].forEach((s) => expandedSubs.add(s));
      }
      // Pentru subcategoriile canonice executari (ex: exec-afaceri), incluem și
      // valorile brute rămase în DB (ex: lichidari-firme) ca filtrul să se potrivească
      // cu ce afișăm în sidebar la "Executări și Insolvență".
      for (const alias of getExecutariSubcategoryAliases(subFilter)) {
        expandedSubs.add(alias);
      }
    }
    conditions.push({
      OR: [...expandedSubs].flatMap((s) => [
        { subcategory: { equals: s, mode: "insensitive" as const } },
        { category_level_3: { equals: s, mode: "insensitive" as const } },
      ]),
    });
  }

  appendCategoryLevel3Condition(conditions, sub, params.category_level_3, params.category_level_3s);

  const listCat = params.list_category?.trim();
  const listCats = params.list_categories?.filter((s) => s?.trim());
  if (listCats && listCats.length > 0) {
    conditions.push({
      OR: listCats.map((val) => ({
        custom_fields: { path: ["listing_category"], equals: val } as Prisma.JsonFilter,
      })),
    });
  } else if (listCat) {
    conditions.push({
      custom_fields: { path: ["listing_category"], equals: listCat } as Prisma.JsonFilter,
    });
  }

  const county = (params.county ?? "").trim();
  if (county) {
    conditions.push({ county: { contains: county, mode: "insensitive" } });
  }

  const city = (params.city ?? "").trim();
  if (city) {
    conditions.push({ city: { contains: city, mode: "insensitive" } });
  }

  const loc = (params.location ?? "").trim();
  if (loc) {
    conditions.push({
      OR: [
        { county: { contains: loc, mode: "insensitive" } },
        { city: { contains: loc, mode: "insensitive" } },
      ],
    });
  }

  if (params.freeOnly === true) {
    conditions.push({
      OR: [
        { custom_fields: { path: ["is_free_listing"], equals: true } as Prisma.JsonFilter },
        { custom_fields: { path: ["isFreeListing"], equals: true } as Prisma.JsonFilter },
      ],
    });
  } else {
    const priceMin = params.price_min;
    const priceMax = params.price_max;
    if (priceMin != null && !isNaN(priceMin)) {
      conditions.push({ starting_price_ron: { gte: priceMin } });
    }
    if (priceMax != null && !isNaN(priceMax)) {
      conditions.push({ starting_price_ron: { lte: priceMax } });
    }
  }

  const size = params.size ?? "";
  const sizes = params.sizes ?? [];
  if (sizes.length > 0) {
    conditions.push({ size: { in: sizes } });
  } else if (size && size !== "all") {
    conditions.push({ size: { equals: size, mode: "insensitive" } });
  }

  const brand = params.brand ?? "";
  const brands = params.brands ?? [];
  if (brands.length > 0) {
    conditions.push({
      OR: brands.map((b) => ({
        OR: [
          { brand: { contains: b, mode: "insensitive" as const } },
          { title: { contains: b, mode: "insensitive" as const } },
        ],
      })),
    });
  } else if (brand && brand !== "all") {
    conditions.push({
      OR: [
        { brand: { contains: brand, mode: "insensitive" as const } },
        { title: { contains: brand, mode: "insensitive" as const } },
      ],
    });
  }

  const color = params.color ?? "";
  const colors = params.colors ?? [];
  if (colors.length > 0) {
    conditions.push({ color: { in: colors } });
  } else if (color && color !== "all") {
    conditions.push({ color: { equals: color, mode: "insensitive" } });
  }

  pushRoConditionClause(conditions, params);

  const pt = (params.product_type ?? "").trim();
  if (pt) {
    conditions.push({ product_type: { equals: pt, mode: "insensitive" } });
  }
  const st = (params.sale_type ?? "").trim();
  if (st) {
    conditions.push({ sale_type: { equals: st, mode: "insensitive" } });
  }

  const attrKeys = ["fuel", "bodyType", "partType", "department", "apparelType", "footwearType", "accessoryType"] as const;
  for (const key of attrKeys) {
    const val = (params[key] ?? "").trim().toLowerCase();
    if (val && val !== "all") {
      conditions.push({
        attributes: { path: [key], equals: val } as Prisma.JsonFilter,
      });
    }
  }

  const su = params.seller_user_ids;
  const exclude = params.seller_user_ids_exclude === true;
  if (su != null) {
    if (exclude) {
      if (su.length > 0) {
        conditions.push({
          OR: [{ user_id: null }, { user_id: { notIn: su } }],
        });
      }
    } else if (su.length === 0) {
      conditions.push({ id: { in: [] } });
    } else {
      conditions.push({ user_id: { in: su } });
    }
  }

  return conditions.length > 0 ? { AND: conditions } : {};
}

/**
 * Same as buildPrismaWhereStrict but WITHOUT channel/access gating.
 * Used by admin recategorizare so admin sees all products regardless of channel.
 */
export function buildPrismaWhereStrictAdmin(
  params: ProductQueryStrict
): Prisma.productsWhereInput {
  const conditions: Prisma.productsWhereInput[] = [];

  const statusFilter = params.status;
  if (Array.isArray(statusFilter) && statusFilter.length > 0) {
    conditions.push({ status: { in: statusFilter } });
  } else {
    conditions.push({ status: { in: [...DEFAULT_STATUS] } });
  }

  const q = (params.q ?? "").trim();
  if (q) {
    const words = qToDistinctSearchTokens(q);
    const hasBrandFilter =
      (params.brand && params.brand.trim() && params.brand.toLowerCase() !== "all") ||
      ((params.brands?.length ?? 0) > 0);
    /** Cu marcă selectată, restul query-ului se caută doar în titlu (mai rapid, aliniat la UI). */
    const searchFields = hasBrandFilter
      ? (["title"] as const)
      : (["title", "category", "subcategory", "category_level_3", "brand", "model", "slug"] as const);
    for (const word of words) {
      conditions.push({
        OR: searchFields.map((field) => ({
          [field]: { contains: word, mode: "insensitive" as const },
        })),
      });
    }
  }

  const modelVal = (params.model ?? "").trim();
  if (modelVal && modelVal !== "all") {
    conditions.push({ model: { contains: modelVal, mode: "insensitive" } });
  }

  const cat = (params.categorie ?? "").trim().toLowerCase();
  if (cat && cat !== "all") {
    if (cat === "executari") {
      conditions.push({
        OR: [
          { category: { contains: "executari", mode: "insensitive" } },
          { product_type: { equals: "licitatii-publice", mode: "insensitive" } },
          { sale_type: { in: ["licitatie-publica", "licitatii-insolventa", "licitatii-anaf", "licitatii-executori"] } }
        ]
      });
    } else {
      const execMap: Record<string, string[]> = {
        "imobiliare": ["exec-imobiliare"],
        "autovehicule": ["exec-autovehicule", "piese-auto"],
        "business": ["exec-afaceri", "exec-office"],
        "utilaje": ["exec-industrial"],
      };
      const extraSubs = execMap[cat.toLowerCase()] || [];
      if (extraSubs.length > 0) {
        conditions.push({
          OR: [
            { category: { equals: cat, mode: "insensitive" } },
            ...extraSubs.map(s => ({ subcategory: { equals: s, mode: "insensitive" as const } }))
          ]
        });
      } else {
        conditions.push({ category: { equals: cat, mode: "insensitive" } });
      }
    }
  }

  const sub = (params.subcategorie ?? params.subcategory ?? "").trim().toLowerCase();
  if (sub && sub !== "all") {
    // Determine target exec-subcategories
    const execSubMap: Record<string, string[]> = {
      // Imobiliare
      "apartamente": ["exec-imobiliare"],
      "case-vile": ["exec-imobiliare"],
      "terenuri": ["exec-imobiliare"],
      "terenuri-intravilane": ["exec-imobiliare"],
      "terenuri-extravilane": ["exec-imobiliare"],
      "terenuri-agricole": ["exec-imobiliare"],
      "spatii-comerciale": ["exec-imobiliare"],
      // Auto
      "autoturisme": ["exec-autovehicule"],
      "suv-4x4": ["exec-autovehicule"],
      "motociclete": ["exec-autovehicule"],
      "camioane": ["exec-autovehicule"],
      "remorci": ["exec-autovehicule"],
      "vehicule-electrice": ["exec-autovehicule"],
      "piese-auto": [],
      // Utilaje
      "utilaje-constructii": ["exec-industrial"],
      "utilaje-agricole": ["exec-industrial"],
      "echipamente-forestiere": ["exec-industrial"],
      // Business
      "echipamente-birou": ["exec-office", "exec-afaceri"],
      "mobilier-comercial": ["exec-afaceri"]
    };

    const extraExecSubs = execSubMap[sub] || [];
    const execAliases = getExecutariSubcategoryAliases(sub);

    if (sub === "terenuri") {
      const all = new Set<string>([
        "terenuri",
        "terenuri-intravilane",
        "terenuri-extravilane",
        "terenuri-agricole",
        ...extraExecSubs,
        ...execAliases,
      ]);
      conditions.push({
        OR: [...all].map(
          (s) => ({ subcategory: { equals: s, mode: "insensitive" as const } })
        ),
      });
    } else {
      const all = new Set<string>([sub, ...extraExecSubs, ...execAliases]);
      if (all.size > 1) {
        conditions.push({
          OR: [...all].map((s) => ({ subcategory: { equals: s, mode: "insensitive" as const } })),
        });
      } else {
        conditions.push({ subcategory: { equals: sub, mode: "insensitive" } });
      }
    }
  }

  appendCategoryLevel3Condition(conditions, sub, params.category_level_3, params.category_level_3s);

  const listCat = params.list_category?.trim();
  const listCats = params.list_categories?.filter((s) => s?.trim());
  if (listCats && listCats.length > 0) {
    conditions.push({
      OR: listCats.map((val) => ({
        custom_fields: { path: ["listing_category"], equals: val } as Prisma.JsonFilter,
      })),
    });
  } else if (listCat) {
    conditions.push({
      custom_fields: { path: ["listing_category"], equals: listCat } as Prisma.JsonFilter,
    });
  }

  const county = (params.county ?? "").trim();
  if (county) {
    conditions.push({ county: { contains: county, mode: "insensitive" } });
  }

  const city = (params.city ?? "").trim();
  if (city) {
    conditions.push({ city: { contains: city, mode: "insensitive" } });
  }

  const loc = (params.location ?? "").trim();
  if (loc) {
    conditions.push({
      OR: [
        { county: { contains: loc, mode: "insensitive" } },
        { city: { contains: loc, mode: "insensitive" } },
      ],
    });
  }

  if (params.freeOnly === true) {
    conditions.push({
      OR: [
        { custom_fields: { path: ["is_free_listing"], equals: true } as Prisma.JsonFilter },
        { custom_fields: { path: ["isFreeListing"], equals: true } as Prisma.JsonFilter },
      ],
    });
  } else {
    const priceMin = params.price_min;
    const priceMax = params.price_max;
    if (priceMin != null && !isNaN(priceMin)) {
      conditions.push({ starting_price_ron: { gte: priceMin } });
    }
    if (priceMax != null && !isNaN(priceMax)) {
      conditions.push({ starting_price_ron: { lte: priceMax } });
    }
  }

  const size = params.size ?? "";
  const sizes = params.sizes ?? [];
  if (sizes.length > 0) {
    conditions.push({ size: { in: sizes } });
  } else if (size && size !== "all") {
    conditions.push({ size: { equals: size, mode: "insensitive" } });
  }

  const brand = params.brand ?? "";
  const brands = params.brands ?? [];
  if (brands.length > 0) {
    conditions.push({
      OR: brands.map((b) => ({
        OR: [
          { brand: { contains: b, mode: "insensitive" as const } },
          { title: { contains: b, mode: "insensitive" as const } },
        ],
      })),
    });
  } else if (brand && brand !== "all") {
    conditions.push({
      OR: [
        { brand: { contains: brand, mode: "insensitive" as const } },
        { title: { contains: brand, mode: "insensitive" as const } },
      ],
    });
  }

  const color = params.color ?? "";
  const colors = params.colors ?? [];
  if (colors.length > 0) {
    conditions.push({ color: { in: colors } });
  } else if (color && color !== "all") {
    conditions.push({ color: { equals: color, mode: "insensitive" } });
  }

  pushRoConditionClause(conditions, params);

  const pt = (params.product_type ?? "").trim();
  if (pt) {
    conditions.push({ product_type: { equals: pt, mode: "insensitive" } });
  }
  const st = (params.sale_type ?? "").trim();
  if (st) {
    conditions.push({ sale_type: { equals: st, mode: "insensitive" } });
  }

  const attrKeys = ["fuel", "bodyType", "partType", "department", "apparelType", "footwearType", "accessoryType"] as const;
  for (const key of attrKeys) {
    const val = (params[key] ?? "").trim().toLowerCase();
    if (val && val !== "all") {
      conditions.push({
        attributes: { path: [key], equals: val } as Prisma.JsonFilter,
      });
    }
  }

  const su = params.seller_user_ids;
  const exclude = params.seller_user_ids_exclude === true;
  if (su != null) {
    if (exclude) {
      if (su.length > 0) {
        conditions.push({
          OR: [{ user_id: null }, { user_id: { notIn: su } }],
        });
      }
    } else if (su.length === 0) {
      conditions.push({ id: { in: [] } });
    } else {
      conditions.push({ user_id: { in: su } });
    }
  }

  return conditions.length > 0 ? { AND: conditions } : {};
}
