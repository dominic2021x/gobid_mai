/**
 * Atribute produse: size, brand, color, condition
 * Pentru toate categoriile, subcategoriile și Level 3
 */

import {
  SIZE_OPTIONS_CLOTHING,
  SIZE_OPTIONS_SHOES,
  SIZE_OPTIONS_KIDS_CM,
  SUBCATEGORY_DISPLAY_TO_KEY,
} from './categories';
import { CAR_BRANDS_FULL, PHONE_BRANDS_FULL } from './data/brand-models';

// ========== CULORI – universale ==========
export const COLOR_OPTIONS = [
  'Alb', 'Negru', 'Gri', 'Maro', 'Bej', 'Crem', 'Roșu', 'Roz', 'Portocaliu',
  'Galben', 'Verde', 'Albastru', 'Mov', 'Argintiu', 'Auriu', 'Multicoloret', 'Altele'
] as const;

// ========== STARE – universale (doar Nou / Second hand) ==========
export const CONDITION_OPTIONS = ['Nou', 'Second hand'] as const;

/** Mapare valori vechi sau goale → una dintre cele două opțiuni din formular */
export function normalizeConditionForForm(value: string | null | undefined): 'Nou' | 'Second hand' {
  const v = String(value ?? '').trim();
  if (!v) return 'Nou';
  const lower = v.toLowerCase();
  if (lower === 'nou' || lower === 'nouă' || lower === 'noua') return 'Nou';
  if (lower === 'second hand' || lower === 'second-hand' || lower === 'secondhand') return 'Second hand';
  return 'Second hand';
}

// ========== BRANDURI – pe categorii ==========
// Toate brandurile auto după autodata24 / mobile.ro (listă completă România)
const BRANDS_AUTO = [...CAR_BRANDS_FULL];
const BRANDS_MOTO = ['Honda', 'Yamaha', 'Kawasaki', 'Suzuki', 'KTM', 'Ducati', 'BMW', 'Harley-Davidson', 'Royal Enfield', 'Aprilia', 'MV Agusta', 'Triumph', 'Benelli', 'Piaggio', 'Vespa', 'Altele'];
const BRANDS_ELECTRONICS_PHONE = [...PHONE_BRANDS_FULL];
const BRANDS_ELECTRONICS_PC = ['Dell', 'HP', 'Lenovo', 'Asus', 'Acer', 'Apple', 'MSI', 'Gigabyte', 'Razer', 'Microsoft', 'Huawei', 'Samsung', 'Altele'];
const BRANDS_ELECTRONICS_TV = ['Samsung', 'LG', 'Sony', 'Philips', 'Panasonic', 'TCL', 'Xiaomi', 'Hisense', 'Apple', 'Altele'];
const BRANDS_ELECTRONICS_GAMING = ['Sony', 'PlayStation', 'Microsoft', 'Xbox', 'Nintendo', 'Steam', 'Valve', 'Altele'];
const BRANDS_ELECTRONICS_FOTO = ['Canon', 'Nikon', 'Sony', 'Fujifilm', 'Panasonic', 'Olympus', 'GoPro', 'DJI', 'Insta360', 'Altele'];
const BRANDS_UTILAJE = ['JCB', 'Caterpillar', 'CAT', 'Komatsu', 'Volvo', 'Hitachi', 'Liebherr', 'Case', 'New Holland', 'John Deere', 'Kubota', 'Bobcat', 'Doosan', 'Hyundai', 'Altele'];
const BRANDS_PIESE_AUTO = ['Bosch', 'Denso', 'Valeo', 'Continental', 'ZF', 'Sachs', 'Monroe', 'Bilstein', 'TRW', 'Febi', 'Hella', 'Osram', 'Philips', 'Altele'];
const BRANDS_FASHION = ['Gucci', 'Louis Vuitton', 'Chanel', 'Prada', 'Hermès', 'Dior', 'Burberry', 'Versace', 'Armani', 'Fendi', 'Balenciaga', 'Saint Laurent', 'Givenchy', 'Nike', 'Adidas', 'Puma', 'Zara', 'H&M', 'Mango', 'Massimo Dutti', 'Altele'];
const BRANDS_CEASURI = ['Rolex', 'Omega', 'Cartier', 'Patek Philippe', 'Audemars Piguet', 'Tag Heuer', 'Breitling', 'IWC', 'Panerai', 'Tudor', 'Longines', 'Tissot', 'Casio', 'Seiko', 'Citizen', 'Altele'];
const BRANDS_BIJUTERII = ['Cartier', 'Tiffany', 'Bulgari', 'Chopard', 'Van Cleef & Arpels', 'Harry Winston', 'Graff', 'David Yurman', 'Pandora', 'Swarovski', 'Altele'];
const BRANDS_ELECTROCASNICE = ['Samsung', 'LG', 'Bosch', 'Siemens', 'Whirlpool', 'Electrolux', 'Beko', 'Gorenje', 'Miele', 'Philips', 'Rowenta', 'DeLonghi', 'Krups', 'Tefal', 'Altele'];
const BRANDS_PARFUMURI = ['Chanel', 'Dior', 'Guerlain', 'Yves Saint Laurent', 'Tom Ford', 'Armani', 'Versace', 'Dolce&Gabbana', 'Hugo Boss', 'Calvin Klein', 'Lancôme', 'Estée Lauder', 'Altele'];
const BRANDS_MOBILIER = ['IKEA', 'Jysk', 'Mobexpert', 'Daewoo', 'Hoff', 'Scandinavian Design', 'Altele'];
const BRANDS_JUCARII = ['Lego', 'Mattel', 'Hasbro', 'Fisher-Price', 'Chicco', 'VTech', 'Playmobil', 'Hot Wheels', 'Barbie', 'Nerf', 'Altele'];
const BRANDS_CARUCIOARE = ['Chicco', 'Bugaboo', 'Stokke', 'Uppababy', 'Baby Jogger', 'Cybex', 'Maxi-Cosi', 'Graco', 'Britax', 'Peg Perego', 'Altele'];
const BRANDS_AGRICULTURA = ['John Deere', 'New Holland', 'Case IH', 'Claas', 'Fendt', 'Massey Ferguson', 'Valtra', 'Kubota', 'Deutz-Fahr', 'Same', 'Altele'];
const BRANDS_DRONE = ['DJI', 'Parrot', 'Autel', 'Yuneec', 'Skydio', 'Altele'];
const BRANDS_ECHIPAMENTE_ATELIER = ['BendPak', 'Rotary', 'Hunter', 'Corghi', 'Bosch', 'Snap-on', 'MAC Tools', 'Lincoln', 'Kärcher', 'Altele'];

// ========== CONFIGURARE ATRIBUTE PE SUBCATEGORIE ==========
export type AttrConfig = {
  size?: 'clothing' | 'shoes' | 'kids' | 'universal';
  brand?: readonly string[];
  color?: boolean;
  condition?: boolean;
};

export const ATTRIBUTES_BY_SUBCATEGORY: Record<string, AttrConfig> = {
  // IMOBILIARE – fără Culoare (nu are sens pentru imobiliare)
  'apartamente': { condition: true },
  'case-vile': { condition: true },
  'terenuri-intravilane': {},
  'terenuri-agricole': {},
  'spatii-comerciale': { condition: true },
  'hale-industriale': { condition: true },
  'proprietati-turistice': { condition: true },

  // EXECUTĂRI (categorii comune)
  'exec-imobiliare': { condition: true },
  'exec-autovehicule': { brand: BRANDS_AUTO, color: true, condition: true },
  'exec-industrial': { condition: true },
  'exec-afaceri': {},
  'exec-office': {},
  'exec-altele': { condition: true },

  // AUTOVEHICULE
  'autoturisme': { brand: BRANDS_AUTO, color: true, condition: true },
  'suv-4x4': { brand: BRANDS_AUTO, color: true, condition: true },
  'motociclete': { brand: BRANDS_MOTO, color: true, condition: true },
  'camioane': { brand: BRANDS_AUTO, color: true, condition: true },
  'remorci': { color: true, condition: true },
  'autorulote': { color: true, condition: true },
  'vehicule-electrice': { brand: BRANDS_AUTO, color: true, condition: true },
  // Piese auto: brand = brandul MAȘINII (VW, BMW), nu al piesei; model din brand, capacitate cilindrică, an obligatorii
  'piese-auto': { brand: BRANDS_AUTO, color: false, condition: true },

  // UTILAJE & ECHIPAMENTE – fără Culoare (nu are sens pentru utilaje)
  'utilaje-constructii': { brand: BRANDS_UTILAJE, condition: true },
  'utilaje-agricole': { brand: BRANDS_AGRICULTURA, condition: true },
  'echipamente-forestiere': { brand: BRANDS_UTILAJE, condition: true },
  'generatoare': { condition: true },
  'scule-profesionale': { brand: ['Bosch', 'Makita', 'DeWalt', 'Metabo', 'Hilti', 'Festool', 'Einhell', 'Black+Decker', 'Ryobi', 'Altele'], condition: true },
  'echipamente-ateliere': { brand: BRANDS_ECHIPAMENTE_ATELIER, condition: true },
  'echipamente-electrice': { brand: ['Bosch', 'Fronius', 'Lincoln', 'ESAB', 'Miller', 'Altele'], condition: true },

  // ARTĂ & ANTICHITĂȚI – fără Culoare (nu are sens pentru artă/antichități)
  'picturi': { condition: true },
  'sculpturi': { condition: true },
  'bijuterii': { brand: BRANDS_BIJUTERII, condition: true },
  'obiecte-colectie': { condition: true },
  'mobilier-epoca': { condition: true },
  'carti-rare': { condition: true },
  'fotografie-artistica': { condition: true },
  'licitatii-caritabile': { condition: true },

  // ELECTRONICE
  'laptopuri-pc': { brand: BRANDS_ELECTRONICS_PC, color: true, condition: true },
  'telefoane': { brand: BRANDS_ELECTRONICS_PHONE, color: true, condition: true },
  'tablete': { brand: BRANDS_ELECTRONICS_PHONE, color: true, condition: true },
  'tv-audio': { brand: BRANDS_ELECTRONICS_TV, color: true, condition: true },
  'console-jocuri': { brand: BRANDS_ELECTRONICS_GAMING, color: true, condition: true },
  'drone-gadgeturi': { brand: BRANDS_DRONE, color: true, condition: true },
  'echipamente-foto': { brand: BRANDS_ELECTRONICS_FOTO, color: true, condition: true },

  // CASA
  'mobilier-interior': { brand: BRANDS_MOBILIER, color: true, condition: true },
  'mobilier-exterior': { brand: BRANDS_MOBILIER, color: true, condition: true },
  'echipamente-gradinarit': { brand: ['Stihl', 'Husqvarna', 'Bosch', 'Makita', 'Gardena', 'Wolf-Garten', 'Altele'], color: true, condition: true },
  'decoratiuni': { color: true, condition: true },
  'electrocasnice': { brand: BRANDS_ELECTROCASNICE, color: true, condition: true },

  // MODĂ
  'haine-designer': { size: 'clothing', brand: BRANDS_FASHION, color: true, condition: true },
  'incaltaminte': { size: 'shoes', brand: BRANDS_FASHION, color: true, condition: true },
  'genti-accesorii': { size: 'clothing', brand: BRANDS_FASHION, color: true, condition: true },
  'parfumuri-cosmetice': { brand: BRANDS_PARFUMURI, color: true, condition: true },
  'ceasuri-lux': { brand: BRANDS_CEASURI, color: true, condition: true },

  // MAMA ȘI COPILUL
  'haine-copil': { size: 'kids', brand: ['Chicco', 'Zara Kids', 'H&M Kids', 'C&A', 'Mothercare', 'Altele'], color: true, condition: true },
  'incaltaminte-copil': { size: 'kids', color: true, condition: true },
  'jucarii': { brand: BRANDS_JUCARII, color: true, condition: true },
  'mobilier-copil': { brand: ['Chicco', 'IKEA', 'Baby Relax', 'Stokke', 'Altele'], color: true, condition: true },
  'cosul-copilului': { brand: BRANDS_CARUCIOARE, color: true, condition: true },
  'ingrijire-bebelusi': { brand: ['Chicco', 'Philips Avent', 'Tommee Tippee', 'NUK', 'MAM', 'Altele'], color: true, condition: true },
  'scaune-auto-copil': { brand: BRANDS_CARUCIOARE, color: true, condition: true },
  'carucioare': { brand: BRANDS_CARUCIOARE, color: true, condition: true },
  'hranire-copil': { brand: ['Philips Avent', 'Tommee Tippee', 'MAM', 'NUK', 'Dr. Brown', 'Altele'], color: true, condition: true },

  // AGRICULTURĂ & ZOOTEHNIE – fără Culoare
  'tractoare-combine': { brand: BRANDS_AGRICULTURA, condition: true },
  'remorci-agricole': { brand: BRANDS_AGRICULTURA, condition: true },
  'echipamente-irigatii': { condition: true },
  'animale': { condition: true },
  'seminte-furaje': { condition: true },

  // MARITIME & AERONAUTICE – fără Culoare
  'barci-iahturi': { condition: true },
  'motoare-marine': { brand: ['Yamaha', 'Mercury', 'Suzuki', 'Honda', 'Evinrude', 'Altele'], condition: true },
  'avioane': { condition: true },
  'drone-industriale': { brand: BRANDS_DRONE, condition: true },

  // BUSINESS
  'echipamente-birou': { brand: BRANDS_ELECTRONICS_PC, color: true, condition: true },
  'mobilier-comercial': { brand: BRANDS_MOBILIER, color: true, condition: true },
  'calculatoare-second': { brand: BRANDS_ELECTRONICS_PC, color: true, condition: true },
  'lichidari-firme': { condition: true },
  'loturi-stocuri': { condition: true },

  // MATERIALE CONSTRUCȚII – fără Culoare
  'ciment-caramida': { condition: true },
  'materiale-izolatie': { condition: true },
  'feronerie-unelte': { brand: ['Bosch', 'Makita', 'DeWalt', 'Hilti', 'Altele'], condition: true },
  'usi-ferestre': { condition: true },

  // DIVERSE
  'caritabile': { condition: true },
  'militare-istorice': { color: true, condition: true },
  'nft-arta-digitala': {},
  'colectii-private': { color: true, condition: true },
  'bunuri-confiscate': { condition: true },
};

// ========== HELPERE ==========

function getSizeOptionsByType(type: 'clothing' | 'shoes' | 'kids' | 'universal'): readonly string[] {
  switch (type) {
    case 'clothing': return SIZE_OPTIONS_CLOTHING;
    case 'shoes': return SIZE_OPTIONS_SHOES;
    case 'kids': return [...SIZE_OPTIONS_KIDS_CM, ...SIZE_OPTIONS_CLOTHING];
    case 'universal': return [...SIZE_OPTIONS_CLOTHING, ...SIZE_OPTIONS_SHOES, 'Unica'];
    default: return [];
  }
}

/** Obține config atribute pentru o subcategorie (key sau nume afișat) */
export function getAttributesForSubcategory(subcategoryKeyOrName: string): AttrConfig {
  const key = SUBCATEGORY_DISPLAY_TO_KEY[subcategoryKeyOrName]
    || subcategoryKeyOrName
    || subcategoryKeyOrName.toLowerCase().replace(/\s+/g, '-').replace(/[àâä]/g, 'a').replace(/[èéêë]/g, 'e').replace(/[îï]/g, 'i');
  return ATTRIBUTES_BY_SUBCATEGORY[key] ?? ATTRIBUTES_BY_SUBCATEGORY[subcategoryKeyOrName] ?? {};
}

/** Obține opțiunile de mărime pentru subcategorie */
export function getSizeOptionsForSubcategory(subcategoryKeyOrName: string): readonly string[] {
  const config = getAttributesForSubcategory(subcategoryKeyOrName);
  if (!config.size) return [];
  return getSizeOptionsByType(config.size);
}

/** Obține brandurile pentru subcategorie */
export function getBrandOptionsForSubcategory(subcategoryKeyOrName: string): readonly string[] {
  const config = getAttributesForSubcategory(subcategoryKeyOrName);
  return config.brand ?? [];
}

/** Verifică dacă subcategoria are atributul */
export function hasAttribute(subcategoryKeyOrName: string, attr: 'size' | 'brand' | 'color' | 'condition'): boolean {
  const config = getAttributesForSubcategory(subcategoryKeyOrName);
  if (attr === 'size') return !!config.size;
  if (attr === 'brand') return !!(config.brand && config.brand.length > 0);
  if (attr === 'color') return !!config.color;
  if (attr === 'condition') return !!config.condition;
  return false;
}

/** Lista atributelor active pentru subcategorie */
export function getActiveAttributes(subcategoryKeyOrName: string): ('size' | 'brand' | 'color' | 'condition')[] {
  const config = getAttributesForSubcategory(subcategoryKeyOrName);
  const out: ('size' | 'brand' | 'color' | 'condition')[] = [];
  if (config.size) out.push('size');
  if (config.brand?.length) out.push('brand');
  if (config.color) out.push('color');
  if (config.condition) out.push('condition');
  return out;
}
