export type SearchCategoryKey = "apartament" | "casa" | "teren" | "piese-auto" | "autoturism";

export type CategoryConfig = {
  priority: number;
  baseTerms: string[];
  partialPrefixes?: string[];
  suggestionPrefix?: string;
  attributes: string[];
  requiredForLocationPhase: boolean;
  locationRequiredAttributes?: string[];
};

export const CATEGORY_CONFIG: Record<SearchCategoryKey, CategoryConfig> = {
  apartament: {
    priority: 1,
    baseTerms: ["apartament", "garsoniera", "imobiliare"],
    partialPrefixes: ["apa", "apar", "apart"],
    attributes: ["1 camera", "2 camera", "3 camera", "4 camera"],
    requiredForLocationPhase: true,
    locationRequiredAttributes: ["camera"],
  },
  casa: {
    priority: 2,
    baseTerms: ["casa", "vila"],
    attributes: ["3 camera", "4 camera", "cu teren"],
    requiredForLocationPhase: true,
    locationRequiredAttributes: ["camera"],
  },
  teren: {
    priority: 3,
    baseTerms: ["teren", "intravilan", "extravilan", "agricol"],
    attributes: ["intravilan", "extravilan", "agricol"],
    requiredForLocationPhase: true,
    locationRequiredAttributes: [],
  },
  "piese-auto": {
    priority: 4,
    baseTerms: ["piesa", "piese", "piese-auto", "piesa-auto", "accesoriu", "accesorii"],
    partialPrefixes: ["pie", "pies"],
    suggestionPrefix: "piese auto",
    attributes: ["motor", "cutie viteza", "frana", "suspensie"],
    requiredForLocationPhase: false,
    locationRequiredAttributes: [],
  },
  autoturism: {
    priority: 5,
    baseTerms: ["autoturism", "masina", "auto"],
    attributes: ["diesel", "benzina", "automat"],
    requiredForLocationPhase: false,
    locationRequiredAttributes: [],
  },
};

