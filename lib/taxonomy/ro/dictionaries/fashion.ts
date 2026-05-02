/**
 * Fashion keywords -> department, apparel, footwear, accessory.
 * Normalize: lowercase, no diacritics.
 */
import type {
  FashionDepartment,
  FashionApparelType,
  FashionFootwearType,
  FashionAccessoryType,
} from "@/lib/taxonomy/ro/attributes";

/** Keys normalized (lowercase, no diacritics). */
export const FASHION_DEPARTMENT_SYNONYMS: Record<string, FashionDepartment> = {
  barbati: "barbati",
  male: "barbati",
  femei: "femei",
  female: "femei",
  copii: "copii",
  copil: "copii",
  kids: "copii",
};

export const FASHION_APPAREL_SYNONYMS: Record<string, FashionApparelType> = {
  pantaloni: "pantaloni",
  blugi: "pantaloni",
  geaca: "geaca",
  jacket: "geaca",
  rochie: "rochie",
  dress: "rochie",
  bluza: "bluza",
  tricou: "tricou",
  costum: "costum",
  suit: "costum",
};

export const FASHION_FOOTWEAR_SYNONYMS: Record<string, FashionFootwearType> = {
  tenisi: "tenisi",
  sneakers: "tenisi",
  ghete: "ghete",
  boots: "ghete",
  cizme: "cizme",
  sandale: "sandale",
  sandals: "sandale",
  pantofi: "pantofi",
  shoes: "pantofi",
};

export const FASHION_ACCESSORY_SYNONYMS: Record<string, FashionAccessoryType> = {
  geanta: "geanta",
  bag: "geanta",
  portofel: "portofel",
  wallet: "portofel",
  curea: "curea",
  belt: "curea",
  esarf: "esarf",
  scarf: "esarf",
};
