/**
 * Deterministic validation messages when slot-fill fails (user input does not match expected field).
 * Used only in the slot-fill branch; does not affect full extractor or OpenAI path.
 */

import { getSubcategoriesForCategory } from "./extractFields";
import { TITLE_MAX_LENGTH } from "./extractFields";

const TOP_5_CATEGORIES = [
  "Imobiliare",
  "Autovehicule",
  "Utilaje & Echipamente",
  "Artă & Antichități",
  "Electronice & Tehnologie",
];

const MAX_SUBCATEGORY_CHIPS = 8;

/**
 * Returns quick reply chips for category or subcategory selection (for deterministic draft flow).
 * - category: top 5 categories.
 * - subcategory: up to 8 subcategories for draft category (requires draftCategory).
 * - other fields: undefined (no chips).
 */
export function getQuickRepliesForField(
  field: string,
  draftCategory?: string
): string[] | undefined {
  if (field === "category") return [...TOP_5_CATEGORIES];
  if (field === "subcategory" && draftCategory) {
    const subs = getSubcategoriesForCategory(draftCategory);
    return subs.slice(0, MAX_SUBCATEGORY_CHIPS);
  }
  return undefined;
}

export type FieldValidationContext = {
  category?: string;
};

/**
 * Returns a deterministic validation message when the user's reply does not match the expected field.
 * Used when last_requested_field is set and extractForField returns no value.
 */
export function validationMessageForField(
  field: string,
  context?: FieldValidationContext
): string {
  switch (field) {
    case "category":
      return `⚠️ Categoria nu este validă. Alege una dintre: ${TOP_5_CATEGORIES.join(", ")}.`;
    case "subcategory": {
      const category = context?.category;
      if (!category) {
        return "⚠️ Alege mai întâi categoria, apoi subcategoria.";
      }
      const subs = getSubcategoriesForCategory(category);
      if (subs.length === 0) {
        return `⚠️ Subcategoria nu este validă pentru ${category}.`;
      }
      return `⚠️ Subcategoria nu este validă. Alege una dintre: ${subs.join(", ")}.`;
    }
    case "starting_price":
      return "⚠️ Introdu un preț numeric (ex: 5000 sau 5000 EUR).";
    case "currency":
      return "⚠️ Moneda trebuie să fie Lei sau EUR.";
    case "county":
      return "⚠️ Județ invalid. Exemplu: Cluj, București, Iași.";
    case "title":
      return `⚠️ Titlul trebuie să aibă între 1 și ${TITLE_MAX_LENGTH} caractere.`;
    case "description":
      return "⚠️ Introdu o descriere (text scurt sau lung).";
    case "city":
      return "⚠️ Introdu un oraș valid.";
    default:
      return "⚠️ Valoarea introdusă nu este validă. Încearcă din nou.";
  }
}
