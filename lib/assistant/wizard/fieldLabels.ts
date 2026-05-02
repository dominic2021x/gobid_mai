/**
 * Romanian labels for draft fields (used in confirmation receipt after batch update).
 */

export const DRAFT_FIELD_LABELS_RO: Record<string, string> = {
  title: "titlu",
  description: "descriere",
  category: "categorie",
  subcategory: "subcategorie",
  starting_price: "preț",
  starting_price_ron: "preț",
  starting_price_eur: "preț",
  currency: "monedă",
  county: "județ",
  city: "oraș",
  images: "poze",
};

/** Price-related keys shown as a single "preț" in the receipt. */
const PRICE_KEYS = new Set(["starting_price", "starting_price_ron", "starting_price_eur"]);

/**
 * Returns a short comma-separated list of Romanian labels for the given field names.
 * Price-related fields are collapsed to one "preț". Order preserved; duplicates removed.
 */
export function formatFilledFieldsReceipt(fieldNames: string[]): string {
  const seen = new Set<string>();
  const labels: string[] = [];
  let addedPrice = false;
  for (const key of fieldNames) {
    if (PRICE_KEYS.has(key)) {
      if (!addedPrice) {
        labels.push("preț");
        addedPrice = true;
      }
      continue;
    }
    const label = DRAFT_FIELD_LABELS_RO[key] ?? key;
    if (!seen.has(label)) {
      seen.add(label);
      labels.push(label);
    }
  }
  return labels.join(", ");
}
