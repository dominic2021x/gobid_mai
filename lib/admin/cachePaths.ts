/**
 * Enterprise cache paths config – single source of truth for admin cache panel
 * and revalidation. Covers all public-facing routes (no admin, no dashboard, no auth).
 */

/** Static public paths revalidated with revalidatePath(path). */
export const PUBLIC_PATHS: string[] = [
  "/",
  "/ro",
  "/live_bid",
  "/licitatii",
  "/licitatii-publice",
  "/search",
  "/search/image",
  "/rezultate",
  "/contact",
  "/categorii",
  "/despre-noi",
  "/termeni",
  "/termeni-conditii",
  "/legal",
  "/legal/date-identificare",
  "/legal/politica-ai",
  "/legal/politica-cookies",
  "/legal/politica-consumatori",
  "/legal/politica-confidentialitate",
  "/legal/politica-licitatii",
  "/legal/politica-moderare",
  "/legal/politica-plati",
  "/legal/termeni-si-conditii",
  "/politica-ai",
  "/politica-cookies",
  "/politica-consumatori",
  "/politica-confidentialitate",
  "/politica-licitatii",
  "/politica-moderare",
  "/politica-plati",
  "/credit-ipotecar-inteligent",
  "/smart-mortgage",
  "/price-evaluator",
];

/**
 * Segment roots: revalidated with revalidatePath(path, "layout")
 * so all dynamic pages under them (e.g. /produs/[slug]) are invalidated.
 */
export const LAYOUT_SEGMENTS: string[] = [
  "/produs",           // produs/[slug]
  "/licitatii-publice", // licitatii-publice + licitatii-publice/[slug]
  "/ro",               // ro + ro/lp/[slug]
  "/legal",            // legal + legal/*
  "/card-vizita",      // card-vizita/[slug]
  "/user",             // user/[userId]
];

/** Paths to preload on warmup (key landing + listing pages). */
export const WARMUP_PATHS: string[] = [
  "/",
  "/ro",
  "/live_bid",
  "/licitatii",
  "/licitatii-publice",
  "/search",
  "/rezultate",
  "/contact",
  "/categorii",
  "/despre-noi",
  "/ro?q=bmw",
  "/ro?q=apartament",
  "/ro?q=teren",
];

/** All paths that get revalidated on "revalidate_public_pages" / "revalidate_everything_public". */
export function getAllRevalidatePaths(): string[] {
  return [...PUBLIC_PATHS];
}
