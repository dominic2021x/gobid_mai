import type { PatternProfile, VerticalSlug } from "../types";
import { getUniversalProfile } from "./universalProfile";
import { getAutoProfile } from "./autoProfile";
import { getRealEstateProfile } from "./realEstateProfile";
import { getExecutariProfile } from "./executariProfile";
import { getElectronicsProfile } from "./electronicsProfile";
import { getAgriIndustrialProfile } from "./agriIndustrialProfile";
import { getHomeGardenProfile } from "./homeGardenProfile";

const MAP: Record<VerticalSlug, () => PatternProfile> = {
  auto: getAutoProfile,
  real_estate: getRealEstateProfile,
  executari: getExecutariProfile,
  electronics: getElectronicsProfile,
  agri_industrial: getAgriIndustrialProfile,
  home_garden: getHomeGardenProfile,
  universal: getUniversalProfile,
};

/** Category slug from API/UI -> vertical slug. */
const CATEGORY_TO_VERTICAL: Record<string, VerticalSlug> = {
  imobiliare: "real_estate",
  autovehicule: "auto",
  executari_insolventa: "executari",
  executari: "executari",
  utilaje: "agri_industrial",
  electronice: "electronics",
  "casa-gradina": "home_garden",
  agricultura: "agri_industrial",
  industria: "agri_industrial",
  "piese-auto": "auto",
};

/**
 * Get pattern profile for a vertical. Falls back to universal when unknown.
 */
export function getProfileForVertical(
  verticalOrCategory: VerticalSlug | string | null | undefined
): PatternProfile {
  if (!verticalOrCategory) return getUniversalProfile();
  const slug = (verticalOrCategory as string).toLowerCase().trim();
  const vertical = (CATEGORY_TO_VERTICAL[slug] ?? slug) as VerticalSlug;
  const fn = MAP[vertical];
  return fn ? fn() : getUniversalProfile();
}
