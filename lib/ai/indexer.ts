/**
 * Indexer - Indexează produse și pagini statice în Supabase
 * NOTĂ: Acest fișier este pentru backwards compatibility
 * Produsele sunt deja stocate în Supabase, nu mai este nevoie de indexare separată
 */

import { supabaseAdmin } from '@/lib/supabase';

export interface IndexableContent {
  id: string;
  text: string;
  source: string;
  type: 'product' | 'page' | 'ticket';
  metadata?: Record<string, any>;
}

/**
 * Indexează un singur document
 * NOTĂ: Produsele sunt deja în Supabase, nu mai este nevoie de indexare separată
 */
export async function indexDocument(content: IndexableContent) {
  // Produsele sunt deja stocate în Supabase
  // Nu mai este nevoie de indexare separată în Qdrant
  console.log(`Document ${content.id} (${content.type}) is already in Supabase`);
  return;
}

/**
 * Indexează mai multe documente (batch)
 * NOTĂ: Produsele sunt deja în Supabase, nu mai este nevoie de indexare separată
 */
export async function indexDocuments(contents: IndexableContent[]) {
  // Produsele sunt deja stocate în Supabase
  // Nu mai este nevoie de indexare separată în Qdrant
  console.log(`${contents.length} documents are already in Supabase`);
  return;
}

/**
 * Indexează un produs în Supabase
 * NOTĂ: Produsele sunt deja stocate în Supabase, această funcție verifică doar existența
 */
export async function indexProduct(product: {
  id: string;
  title: string;
  description: string;
  category?: string;
  price?: number;
  image?: string;
}) {
  // Produsele sunt deja stocate în Supabase
  // Verifică doar dacă produsul există
  if (!supabaseAdmin) {
    console.warn('Supabase not available, skipping product check');
    return;
  }

  try {
    const { data, error } = await supabaseAdmin
      .from('produse')
      .select('id')
      .eq('id', product.id)
      .single();

    if (error && error.code !== 'PGRST116') { // PGRST116 = not found
      console.error(`Error checking product ${product.id}:`, error);
    } else if (!data) {
      console.log(`Product ${product.id} not found in Supabase (should be added via admin panel)`);
    } else {
      console.log(`Product ${product.id} already exists in Supabase`);
    }
  } catch (error) {
    console.error(`Error checking product ${product.id}:`, error);
  }
}

/**
 * Indexează o pagină statică
 * NOTĂ: Paginile statice pot fi stocate în Supabase dacă este necesar
 */
export async function indexPage(page: {
  id: string;
  title: string;
  content: string;
  url: string;
}) {
  // Paginile statice pot fi căutate direct în cod sau stocate în Supabase dacă este necesar
  console.log(`Page ${page.id} (${page.title}) - static content available`);
  return;
}

/**
 * Extrage brand din titlu (detectare din toate categoriile)
 */
function extractBrandFromTitle(title: string): string | null {
  const lowerTitle = title.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  
  // Liste complete de branduri din toate categoriile
  const brandKeywords = [
    // Auto
    'bmw', 'mercedes', 'audi', 'opel', 'volkswagen', 'vw', 'ford', 'renault',
    'peugeot', 'dacia', 'skoda', 'seat', 'fiat', 'toyota', 'honda', 'mazda',
    'nissan', 'volvo', 'hyundai', 'kia',
    // Electronice
    'samsung', 'apple', 'iphone', 'dell', 'hp', 'lenovo', 'asus', 'acer',
    'lg', 'sony', 'huawei', 'xiaomi', 'oneplus', 'oppo', 'vivo', 'microsoft', 'msi',
    // Îmbrăcăminte
    'levis', 'levi', 'diesel', 'wrangler', 'lee', 'calvin klein', 'ck', 
    'tommy hilfiger', 'hugo boss', 'nike', 'adidas', 'puma', 'reebok', 'zara', 'h&m', 'hm',
    // Bijuterii
    'tiffany', 'cartier', 'rolex', 'omega', 'swatch', 'casio', 'guess', 'fossil',
    // Mobilier
    'ikea', 'jysk', 'home ideea', 'bo concept',
    // Încălțăminte
    'converse', 'vans', 'new balance', 'nb'
  ];
  
  // Caută brand-ul în titlu (caută mai întâi brandurile mai lungi)
  const sortedBrands = brandKeywords.sort((a, b) => b.length - a.length);
  
  for (const brand of sortedBrands) {
    if (lowerTitle.includes(brand)) {
      // Capitalize first letter și păstrează formatul corect
      if (brand.includes(' ')) {
        // Pentru branduri cu mai multe cuvinte
        return brand.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
      }
      return brand.charAt(0).toUpperCase() + brand.slice(1);
    }
  }
  
  return null;
}

/**
 * Chunk-uri text în bucăți mai mici pentru embeddings mai bune
 */
export function chunkText(text: string, chunkSize: number = 500, overlap: number = 50): string[] {
  const chunks: string[] = [];
  let start = 0;

  while (start < text.length) {
    const end = Math.min(start + chunkSize, text.length);
    const chunk = text.substring(start, end);
    chunks.push(chunk.trim());
    start = end - overlap;
  }

  return chunks.filter(chunk => chunk.length > 0);
}

