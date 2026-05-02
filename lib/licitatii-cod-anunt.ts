/**
 * Cod anunț = primele 3 litere din categoria principală + ID anunț (source_external_id).
 * Folosit în admin (coloană Cod anunț) și la publicare (custom_fields.cod_anunt pe produs).
 */
const MAIN_CATEGORY_CODE: Record<string, string> = {
  Imobiliare: "IMO",
  "Execuții publice": "EXE",
  "Executări și Insolvență": "EXE",
  Autovehicule: "AUT",
  "Utilaje & Echipamente": "UTI",
  "Electronice & Tehnologie": "ELE",
  "Oferte grupate": "OFE",
  "Diverse / Speciale": "DIV",
};

export function getCodAnuntFromCategoryAndId(
  mainCategory: string | null | undefined,
  sourceExternalId: string | null | undefined
): string {
  const code =
    (mainCategory && MAIN_CATEGORY_CODE[mainCategory.trim()]) ||
    (mainCategory
      ? (mainCategory.replace(/\s*[&/].*$/g, "").slice(0, 3).toUpperCase().replace(/[^A-Za-z]/g, "") || "DIV")
          .slice(0, 3)
          .padEnd(3, "X")
      : "DIV");
  const id = (sourceExternalId && String(sourceExternalId).trim()) || "";
  return `${code}${id}`;
}

/**
 * Format pentru execuții publice / același ca la insolvență în UI:
 * primele 3 litere din categorie + 5 cifre random + E (ex: IMO73851E, EXE12345E).
 */
export function getCodAnuntFormat3Litere5CifreE(category: string | null | undefined): string {
  const code =
    (category && MAIN_CATEGORY_CODE[category.trim()]) ||
    (category
      ? (category
          .normalize("NFD")
          .replace(/\u0300-\u036f/g, "")
          .replace(/\s*[&/].*$/g, "")
          .replace(/[^A-Za-z]/g, "")
          .toUpperCase()
          .slice(0, 3) || "DIV")
          .padEnd(3, "X")
          .slice(0, 3)
      : "DIV");
  const five = Math.floor(10000 + Math.random() * 90000);
  return `${code}${five}E`;
}
