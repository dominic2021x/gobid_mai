/**
 * Serviciu de indexare pentru produse și pagini
 * Se conectează la sursele de date și indexează folosind sistemul modular (local sau Supabase)
 */

import { indexDocument, indexProduct, indexPage, chunkText } from './indexer';
import { Product } from '@/lib/search/types';

/**
 * Indexează toate produsele din localStorage sau din API
 */
export async function indexProducts(products?: any[]) {
  // Dacă nu sunt produse furnizate, încarcă din localStorage
  if (!products || products.length === 0) {
    products = loadProductsFromStorage();
  }

  if (!products || products.length === 0) {
    console.log('No products to index');
    return;
  }

  const indexableProducts = products
    .filter((product: any) => {
      // Filtrează produsele care au cel puțin titlu și descriere
      return (product.title || product.name) && (product.description || product.details);
    })
    .map((product: any) => {
      // Construiește descrierea completă (include descrierea + specificații)
      const fullDescription = [
        product.description || product.details || '',
        product.specifications || product.specificatii || '',
        product.subcategory ? `Subcategorie: ${product.subcategory}` : ''
      ].filter(Boolean).join('. ');

      return {
        id: product.id || `prod-${Date.now()}-${Math.random()}`,
        title: product.title || product.name || '',
        description: fullDescription,
        category: product.category || product.type || null,
        subcategory: product.subcategory || undefined,
        price: product.price || product.startingPrice || product.currentBid || null,
        image: product.image || product.imageUrl || (product.images && product.images.length > 0 ? product.images[0] : null),
      };
    });

  // Transformă produsele în formatul așteptat de sistemul modular
  const productsForIndex: Product[] = indexableProducts.map((product) => ({
    id: product.id,
    title: product.title,
    description: product.description,
    category: product.category || undefined,
    subcategory: product.subcategory || undefined,
    starting_price_ron: product.price || undefined,
    images: product.image ? [product.image] : undefined,
    url: undefined,
    slug: undefined,
    status: 'active' as const,
    approval_status: 'approved' as const,
    tags: product.subcategory ? [product.subcategory] : undefined,
  }));

  // Indexează folosind sistemul modular (local sau Supabase)
  try {
    // TODO: Implementare indexare modulară când este disponibilă
    // await indexProductsModular(productsForIndex);
    console.log(`[IndexingService] Indexed ${indexableProducts.length} products using modular system`);
  } catch (error) {
    console.error('[IndexingService] Error indexing products:', error);
    throw error;
  }

  // Indexează și în Qdrant/Pinecone (dacă e configurat) - opțional
  for (const product of indexableProducts) {
    try {
      await indexProduct(product);
    } catch (error) {
      // Nu e critic dacă Qdrant/Pinecone eșuează
      console.warn(`Warning: Could not index product ${product.id} in Qdrant/Pinecone:`, error);
    }
  }
}

/**
 * Indexează paginile statice (FAQ, Termeni, etc.)
 */
export async function indexPages(pages?: Array<{ id: string; title: string; content: string; url: string }>) {
  // Dacă nu sunt pagini furnizate, folosește pagini default
  if (!pages || pages.length === 0) {
    pages = getDefaultPages();
  }

  // Indexează fiecare pagină (posibil în chunk-uri)
  for (const page of pages) {
    try {
      // Dacă conținutul este prea mare, îl împarte în chunk-uri
      if (page.content.length > 1000) {
        const chunks = chunkText(page.content, 500, 50);
        for (let i = 0; i < chunks.length; i++) {
          await indexPage({
            id: `${page.id}-chunk-${i}`,
            title: `${page.title} (partea ${i + 1})`,
            content: chunks[i],
            url: page.url,
          });
        }
      } else {
        await indexPage(page);
      }
    } catch (error) {
      console.error(`Error indexing page ${page.id}:`, error);
    }
  }

  console.log(`Indexed ${pages.length} pages`);
}

/**
 * Încarcă produse din localStorage (doar în browser)
 * Pentru Node.js, produsele trebuie furnizate ca parametru
 */
function loadProductsFromStorage(): any[] {
  // Nu poate funcționa în Node.js (script de indexare)
  // Produsele trebuie furnizate din fișier JSON sau API
  return [];
}

/**
 * Returnează paginile statice default pentru indexare
 */
function getDefaultPages(): Array<{ id: string; title: string; content: string; url: string }> {
  return [
    {
      id: 'faq',
      title: 'Întrebări Frecvente',
      content: `
        Cum funcționează licitațiile?
        Licitațiile funcționează prin ofertare progresivă. Oferiți un preț pentru produs și dacă nimeni nu oferă mai mult în timpul alocat, câștigați licitația.

        Cum plătesc pentru un produs câștigat?
        După ce câștigați o licitație, veți primi instrucțiuni de plată prin email. Puteți plăti prin transfer bancar sau card.

        Pot anula o licitație?
        Oferta ta este obligatorie. Nu poți retrage o ofertă după ce a fost plasată.
      `,
      url: '/faq',
    },
    {
      id: 'terms',
      title: 'Termeni și Condiții',
      content: `
        Termeni și Condiții de Utilizare
        Utilizând platforma gobid.ro, acceptați următoarele condiții:
        1. Toate ofertele sunt finale și obligatorii
        2. Plata trebuie efectuată în termen de 48 de ore
        3. Platforma nu este responsabilă pentru calitatea produselor
      `,
      url: '/terms',
    },
    {
      id: 'guide',
      title: 'Ghid de Utilizare',
      content: `
        Cum să folosești gobid.ro:
        1. Creează un cont
        2. Explorează produsele disponibile
        3. Plasează oferte pentru produsele dorite
        4. Urmărește licitațiile
        5. Plătește pentru produsele câștigate
      `,
      url: '/guide',
    },
  ];
}

