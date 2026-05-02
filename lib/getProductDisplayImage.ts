/**
 * Imagine implicită per categorie/subcategorie pentru anunțuri fără poză.
 * Subcategoriile au prioritate (ex: Piese Auto, Teren), apoi categoria principală (ex: Imobiliare, Mobilier).
 */

import { RO_CATEGORIES, RO_SUBCATEGORY_NAMES } from "@/lib/data/ro-categories";
import { MAIN_CATEGORY_DISPLAY_TO_SLUG } from "@/lib/data/ro-categories";
import { normalizeR2PublicObjectUrl } from "@/lib/image/cdn";
import { isPlausibleProductImageSource } from "@/lib/image/isPlausibleProductImageSource";

const BASE = "/images/category-defaults";

/** Cale către imaginea implicită per subcategorie (slug). Are prioritate față de categoria principală. */
const BY_SUBCATEGORY: Record<string, string> = {
  "piese-auto": `${BASE}/piese-auto.webp`,
  "terenuri-intravilane": `${BASE}/teren.webp`,
  "terenuri-extravilane": `${BASE}/teren.webp`,
  "terenuri-agricole": `${BASE}/teren.webp`,
  "apartamente": `${BASE}/imobiliare.webp`,
  "case-vile": `${BASE}/imobiliare.webp`,
  /** Spații comerciale: imagine dedicată (DE VÂNZARE / SPAȚIU COMERCIAL). */
  "spatii-comerciale": `${BASE}/spatii-comerciale.png`,
  "spatii comerciale": `${BASE}/spatii-comerciale.png`,
  "hale-industriale": `${BASE}/imobiliare.webp`,
  "proprietati-turistice": `${BASE}/imobiliare.webp`,
  "utilaje-echipamente": `${BASE}/utilaje.webp`,
  "exec-imobiliare": `${BASE}/imobiliare.webp`,
  /** Executări – Imobiliare – Teren extravilan: imagine dedicată (semne „DE VÂNZARE / TEREN / EXTRAVILAN”). */
  "exec-imobiliare-extravilan": `${BASE}/exec-teren-extravilan.webp`,
  /** Executări – Imobiliare – Teren intravilan: imagine dedicată (semne „DE VÂNZARE / TEREN / INTRAVILAN”). */
  "exec-imobiliare-intravilan": `${BASE}/exec-teren-intravilan.webp`,
  /** Executări – Autovehicule: imagine dedicată (DE VÂNZARE / AUTOMOBILE). */
  "exec-autovehicule": `${BASE}/automobile.png`,
  "exec-industrial": `${BASE}/utilaje.webp`,
  "exec-office": `${BASE}/electronice.webp`,
  "exec-afaceri": `${BASE}/diverse.webp`,
  "exec-altele": `${BASE}/diverse.webp`,
  "oferte-grupate": `${BASE}/diverse.webp`,
};

/** Cale către imaginea implicită per categorie principală (slug). */
const BY_CATEGORY: Record<string, string> = {
  imobiliare: `${BASE}/imobiliare.webp`,
  /** Automobile: imagine dedicată (DE VÂNZARE / AUTOMOBILE). */
  autovehicule: `${BASE}/automobile.png`,
  utilaje: `${BASE}/utilaje.webp`,
  executari: `${BASE}/utilaje.webp`,
  electronice: `${BASE}/electronice.webp`,
  diverse: `${BASE}/diverse.webp`,
  arta: `${BASE}/arta.webp`,
  casa: `${BASE}/mobilier.webp`,
  moda: `${BASE}/moda.webp`,
  "mama-copil": `${BASE}/mama-copil.webp`,
  agricultura: `${BASE}/agricultura.webp`,
  maritime: `${BASE}/maritime.webp`,
  business: `${BASE}/diverse.webp`,
  materiale: `${BASE}/materiale.webp`,
};

const PLACEHOLDER = "/no-image-placeholder.svg";

/** Exclude URL-uri Google Maps – nu sunt imagini, provoacă eroarea "This site can't load Google Maps correctly". */
function isGoogleMapsUrl(url: string | null | undefined): boolean {
  if (!url || typeof url !== "string") return false;
  const u = url.toLowerCase();
  return (u.includes("google") && u.includes("maps")) || u.includes("goo.gl/maps");
}

/** Nume display -> slug categorie (din RO_CATEGORIES). */
function getCategorySlug(displayNameOrSlug: string | null | undefined): string | null {
  const s = (displayNameOrSlug || "").trim();
  if (!s) return null;
  const lower = s.toLowerCase();
  if (BY_CATEGORY[lower]) return lower;
  if (MAIN_CATEGORY_DISPLAY_TO_SLUG[s]) return MAIN_CATEGORY_DISPLAY_TO_SLUG[s];
  for (const [slug, entry] of Object.entries(RO_CATEGORIES)) {
    if (slug === "all") continue;
    if (entry.name === s || entry.name.toLowerCase() === lower) return slug;
  }
  const slugLike = lower.replace(/\s+/g, "-").replace(/[ăâ]/g, "a").replace(/[î]/g, "i").replace(/[ș]/g, "s").replace(/[ț]/g, "t");
  if (BY_CATEGORY[slugLike]) return slugLike;
  return null;
}

/** Normalizează subcategorie: slug sau nume afișat -> slug. */
function getSubcategorySlug(sub: string | null | undefined): string | null {
  const raw = (sub || "").trim();
  if (!raw) return null;
  const s = raw.toLowerCase();
  if (BY_SUBCATEGORY[s]) return s;
  const slugLike = s.replace(/\s+/g, "-").replace(/[ăâ]/g, "a").replace(/[î]/g, "i").replace(/[ș]/g, "s").replace(/[ț]/g, "t");
  if (BY_SUBCATEGORY[slugLike]) return slugLike;
  for (const [slug, name] of Object.entries(RO_SUBCATEGORY_NAMES)) {
    if (name.toLowerCase() === s || name === raw) return slug;
  }
  return null;
}

export interface ProductLike {
  images?: (string | { url?: string })[] | null;
  image?: string | null;
  category?: string | null;
  subcategory?: string | null;
  category_level_3?: string | null;
  category_level_4?: string | null;
  main_category?: string | null;
  product_type?: string | null;
  sale_type?: string | null;
  custom_fields?: Record<string, unknown> | null;
}

/**
 * Returnează URL-ul imaginii de afișat pentru un produs:
 * - dacă are cel puțin o imagine, returnează prima;
 * - altfel, dacă are categorie/subcategorie, returnează imaginea implicită a categoriei;
 * - altfel returnează placeholder-ul generic.
 */
export function getProductDisplayImage(product: ProductLike | null | undefined): string {
  if (!product) return PLACEHOLDER;

  const normalize = (value: string | null | undefined): string =>
    (value || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .trim();

  const isCategoryDefaultImage = (url: string | null | undefined): boolean =>
    !!url && String(url).includes("/images/category-defaults/");

  const isLicitatiiPubliceProduct = (p: ProductLike): boolean => {
    const productType = normalize(String(p.product_type || ""));
    const saleType = normalize(String(p.sale_type || ""));
    return productType === "licitatii-publice" || saleType === "licitatie-publica" || saleType === "licitatii-insolventa";
  };

  const customFields = product.custom_fields && typeof product.custom_fields === "object"
    ? product.custom_fields
    : {};
  const listingCategory = String(
    (customFields as Record<string, unknown>)?.listing_category ??
      (product as Record<string, unknown>).list_category ??
      ""
  ).trim();
  const listCatNorm = listingCategory.toLowerCase().replace(/\s+/g, " ").trim();
  const subSlugRaw = (product.subcategory || "").trim().toLowerCase();
  const level3 = String(product.category_level_3 ?? (product as Record<string, unknown>).categoryLevel3 ?? "").trim().toLowerCase();
  const level4 = String(product.category_level_4 ?? (product as Record<string, unknown>).categoryLevel4 ?? "").trim().toLowerCase();
  const isExecImobiliareIntravilan =
    subSlugRaw === "exec-imobiliare" &&
    (level3 === "terenuri-intravilane" || level4 === "intravilan");
  const isExecImobiliareExtravilan =
    subSlugRaw === "exec-imobiliare" &&
    (level3 === "terenuri-extravilane" ||
      level4 === "extravilan" ||
      listCatNorm === "terenuri");
  const isExecImobiliareWithListCat =
    subSlugRaw === "exec-imobiliare" && listingCategory.length > 0;
  const expectedDefault = isExecImobiliareIntravilan
    ? BY_SUBCATEGORY["exec-imobiliare-intravilan"]
    : isExecImobiliareExtravilan
      ? BY_SUBCATEGORY["exec-imobiliare-extravilan"]
      : isExecImobiliareWithListCat
        ? getCategoryDefaultImageUrl(null, listingCategory)
        : isLicitatiiPubliceProduct(product)
          ? getCategoryDefaultImageUrl(null, listingCategory || product.subcategory)
          : getCategoryDefaultImageUrl(product.main_category || product.category, product.subcategory);

  const isRealImageUrl = (url: string | null | undefined): boolean => {
    if (!url) return false;
    const s = String(url).trim();
    if (!s) return false;
    if (isGoogleMapsUrl(s)) return false;
    if (isPlaceholderImage(s)) return false;
    if (isCategoryDefaultImage(s)) return false;
    if (!isPlausibleProductImageSource(s)) return false;
    return true;
  };

  const images = product.images;
  if (images && Array.isArray(images) && images.length > 0) {
    const firstReal = images
      .map((img) => (typeof img === "string" ? img : (img && typeof img === "object" && "url" in img ? (img as { url?: string }).url : null)))
      .find((u) => isRealImageUrl(u));
    if (firstReal) return normalizeR2PublicObjectUrl(String(firstReal));
    return expectedDefault;
  }
  if (product.image && typeof product.image === "string" && isRealImageUrl(product.image)) {
    return normalizeR2PublicObjectUrl(product.image);
  }

  return expectedDefault || PLACEHOLDER;
}

/**
 * Returnează URL-ul imaginii implicite pentru o categorie/subcategorie (pentru anunțuri fără poze).
 * Folosit la publicare executări publice etc. ca să aibă o poză din categoria personalizată.
 */
export function getCategoryDefaultImageUrl(
  categoryDisplay?: string | null,
  subcategoryDisplay?: string | null
): string {
  const subSlug = getSubcategorySlug(subcategoryDisplay);
  const categorySlug = getCategorySlug(categoryDisplay);
  if (subSlug && BY_SUBCATEGORY[subSlug]) return BY_SUBCATEGORY[subSlug];
  if (categorySlug && BY_CATEGORY[categorySlug]) return BY_CATEGORY[categorySlug];
  return PLACEHOLDER;
}

/** Verifică dacă URL-ul este placeholder-ul generic (fără imagine). */
export function isPlaceholderImage(url: string | null | undefined): boolean {
  if (!url) return true;
  return url === PLACEHOLDER || url.includes("no-image-placeholder") || url.includes("placeholder");
}
