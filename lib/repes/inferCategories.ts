/**
 * Inferență automată main_category + category pentru anunțuri REPES din titlu și descriere.
 * Folosit la sync, la extragere PDF și la refresh detaliu.
 */

import { EXECUTARI_CAT_PRINCIPALA } from "@/lib/data/ro-categories";

function normalize(t: string | null | undefined): string {
  if (t == null || typeof t !== "string") return "";
  return t
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function stripHtml(html: string | null | undefined): string {
  if (!html) return "";
  return String(html).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

export interface InferCategoriesResult {
  main_category: string;
  category: string | null;
}

/**
 * Inferă Cat. principală și Subcategorie din titlu și description_html.
 * Când main_category nu e Imobiliare, category rămâne null (folosim "Toate" în UI).
 */
export function inferRepesCategories(
  title: string | null | undefined,
  descriptionHtml: string | null | undefined
): InferCategoriesResult {
  const raw = `${normalize(title)} ${normalize(stripHtml(descriptionHtml))}`;
  if (!raw) {
    return { main_category: EXECUTARI_CAT_PRINCIPALA[EXECUTARI_CAT_PRINCIPALA.length - 1], category: null };
  }

  // Ordinea contează: reguli mai specifice înainte
  // Utilaje & Echipamente
  if (
    /\b(utilaj|utilaje|echipament|tractor|combina|excavator|incarcator|buldozer|generator|scule|macara|stivuitor|compresor|pompa|bormasina|flex)\b/.test(
      raw
    )
  ) {
    return { main_category: "Utilaje & Echipamente", category: null };
  }

  // Autovehicule
  if (
    /\b(autoturism|masina|automobil|vehicul|camion|remorca|rulota|motocicleta|scuter|dacia|bmw|mercedes|audi|volkswagen|ford|opel|kilometraj|km\s*\d|capacitate\s*cilindrica|combustibil|an\s*fabricatie|an\s*\d{4})\b/.test(
      raw
    )
  ) {
    return { main_category: "Autovehicule", category: null };
  }

  // Imobiliare + subcategorie
  if (
    /\b(apartament|case|casa|teren|intravilan|extravilan|imobil|spatiu\s*comercial|birouri|birou|cladire|hotel|pensiune|proiect\s*imobiliar|proprietate\s*industriala|hala|magazin|locuinta|camere|etaj|suprafata|mp\s*\d|hectar)\b/.test(
      raw
    )
  ) {
    const main = "Imobiliare";
    // Subcategorie
    if (/\b(apartament|casa|case|camere)\b/.test(raw) && !/\b(spatiu\s*comercial|magazin|birou|teren)\b/.test(raw)) {
      return { main_category: main, category: "Apartamente si case" };
    }
    if (/\b(teren\s*(intravilan|extravilan|agricol)?|extravilan|intravilan)\b/.test(raw)) {
      if (/\b(cladire|constructie|imobil\s+cu)\b/.test(raw)) return { main_category: main, category: "Teren cu cladire" };
      return { main_category: main, category: "Terenuri" };
    }
    if (/\b(spatiu\s*comercial|magazin|comercial)\b/.test(raw)) return { main_category: main, category: "Spatii comerciale" };
    if (/\b(birouri|birou|office)\b/.test(raw)) return { main_category: main, category: "Spatii de birouri" };
    if (/\bhotel\b/.test(raw)) return { main_category: main, category: "Hoteluri" };
    if (/\bpensiune\b/.test(raw)) return { main_category: main, category: "Pensiuni" };
    if (/\b(cladire|hala)\b/.test(raw)) {
      if (/\b(industrial|productie)\b/.test(raw)) return { main_category: main, category: "Proprietati industriale" };
      return { main_category: main, category: "Cladiri" };
    }
    if (/\bproiect\s*imobiliar\b/.test(raw)) return { main_category: main, category: "Proiecte imobiliare" };
    if (/\b(proprietate\s*industriala|industrial)\b/.test(raw)) return { main_category: main, category: "Proprietati industriale" };
    if (/\bstocuri\b/.test(raw)) return { main_category: main, category: "Stocuri" };
    if (/\bactive\s*functionale\b/.test(raw)) return { main_category: main, category: "Active functionale" };
    if (/\b(marci|trademark|inregistrata)\b/.test(raw)) return { main_category: main, category: "Marci inregistrate" };
    if (/\bit\b/.test(raw) && raw.length < 500) return { main_category: main, category: "IT" };
    if (/\bvehicul\s*utilitar\b/.test(raw)) return { main_category: main, category: "Vehicule Utilitare" };
    return { main_category: main, category: "Altele" };
  }

  // Industrial (non-real-estate)
  if (/\b(industrial|fabrica|productie)\b/.test(raw)) {
    return { main_category: "Industrial", category: null };
  }

  // Afaceri
  if (/\b(afaceri|firma|societate|lichidare)\b/.test(raw)) {
    return { main_category: "Afaceri", category: null };
  }

  // Office (non-real-estate context)
  if (/\boffice\b/.test(raw)) {
    return { main_category: "Office", category: null };
  }

  // Oferte grupate
  if (/\b(lot\s*de|grup\s*de|oferta\s*grupata|mai\s*multe\s*bunuri)\b/.test(raw)) {
    return { main_category: "Oferte grupate", category: null };
  }

  return { main_category: "Altele", category: null };
}
