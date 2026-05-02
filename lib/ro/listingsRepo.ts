/**
 * RO listings repo – re-exports from server products layer for /ro page and cached fetcher.
 */

export {
  getRoListings,
  getRoListingsSupabase,
  getRoListingsPrisma,
  listingMatchesQuery,
  type ProductQuery,
  type RoListingsResult,
  type ListingsScope,
} from "@/lib/server/products/listingsRepo";
