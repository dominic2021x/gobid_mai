/**
 * Product Creator pentru ANAF
 * Creează automat produse din licitații ANAF
 */

import { supabaseAdmin } from '@/lib/supabase';
import { ANAFLicitatieData, ANAFBun } from './gptParser';
import { slugify } from '@/lib/slugify';
import { enhanceProduct } from '@/lib/ai/ai-product-enhancer';
import { generateANAFImage } from './imageGenerator';
import { uploadStreetViewToCloudinary } from '@/lib/maps/uploadStreetView';
import { enqueueImageMirrorJobsForProduct } from '@/lib/image-jobs/enqueue';

/** Normalize brand/model for DB: trim, collapse whitespace. */
function normalizeBrandModel(v: string | null | undefined): string | null {
  if (v == null) return null;
  const s = String(v).trim().replace(/\s+/g, " ");
  return s === "" ? null : s;
}

/**
 * Generează URL-ul produsului bazat pe tipul produsului
 */
function generateProductUrl(productType: string, slug: string): string {
  // Mapează tipurile de produse la rutele corespunzătoare
  const productTypeRoutes: Record<string, string> = {
    'licitatii-publice': 'licitatii-publice',
    'live-bid': 'live_bid',
    'buy-now': 'produs',
  };

  const route = productTypeRoutes[productType] || 'produse';
  return `/${route}/${slug}`;
}

export interface ProductCreationResult {
  productId?: string;
  success: boolean;
  error?: string;
}

/**
 * Creează un produs automat dintr-un bun ANAF
 */
export async function createProductFromANAFBun(
  licitatieId: string,
  bun: ANAFBun,
  licitatieData: ANAFLicitatieData,
  pdfUrl?: string,
  bunIndex: number = 1,
  totalBunuri: number = 1,
  ocrPrice?: number | null // Preț extras din OCR (fallback)
): Promise<ProductCreationResult> {
  if (!supabaseAdmin) {
    throw new Error('Supabase admin client not configured');
  }

  try {
    // Generează titlul produsului din bun (temporar, va fi optimizat de ChatGPT)
    const initialTitle = generateProductTitleFromBun(bun, licitatieData, bunIndex, totalBunuri);
    
    // Generează descrierea produsului din bun (temporar, va fi optimizată de ChatGPT)
    const initialDescription = generateProductDescriptionFromBun(bun, licitatieData);
    
    // Pregătește specificațiile pentru ChatGPT (din custom_fields)
    const customFields = buildCustomFieldsFromBun(bun, licitatieData, 
      mapTipBunToCategory(bun.tip_bun, bun.categoria_teren) || 'Diverse / Speciale',
      mapTipBunToSubcategory(bun.tip_bun, bun.categoria_teren) || 'Alte'
    );
    const specificatii = Object.entries(customFields)
      .filter(([key]) => !['numar_licitatie', 'ora_licitatie', 'nume_contribuabil', 'nr_inmatriculare', 'tva_inclus', 'valoare_tva', 'cota_tva', 'conditii_suplimentare', 'detalii_relevante', 'source'].includes(key))
      .map(([key, value]) => `${key}: ${value}`)
      .join(', ');
    
    // OPTIMIZARE AUTOMATĂ CU CHATGPT: Rescrie titlul, descrierea și generează SEO
    console.log('[Product Creator] Optimizing product with ChatGPT...');
    let enhancedTitle = initialTitle;
    let enhancedDescription = initialDescription;
    let enhancedSEO = {
      title: `${initialTitle} - Licitație Publică ${licitatieData.judet}`,
      description: initialDescription.substring(0, 160),
      keywords: generateKeywords(licitatieData),
    };
    
    try {
      const enhanced = await enhanceProduct({
        titlu: initialTitle,
        descriere: initialDescription,
        specificatii: specificatii || undefined
      });
      
      enhancedTitle = enhanced.newTitle;
      enhancedDescription = enhanced.newDescription;
      enhancedSEO = {
        title: enhanced.seoTitle,
        description: enhanced.seoDescription,
        keywords: enhanced.seoKeywords.split(',').map((k: string) => k.trim()),
      };
      
      console.log('[Product Creator] Product optimized successfully with ChatGPT');
    } catch (enhanceError: any) {
      console.warn('[Product Creator] Failed to optimize with ChatGPT, using original text:', enhanceError.message);
      // Continuă cu textele originale dacă optimizarea eșuează
    }
    
    // Generează slug-ul din titlul optimizat
    const baseSlug = slugify(enhancedTitle);
    
    // Verifică dacă slug-ul există deja
    const { data: existingProducts } = await supabaseAdmin
      .from('products')
      .select('id')
      .eq('slug', baseSlug)
      .limit(1);

    let slug = baseSlug;
    if (existingProducts && existingProducts.length > 0) {
      slug = `${baseSlug}-${Date.now()}-${bunIndex}`;
    }

    // Generează SKU din bun
    const sku = generateSKUFromBun(bun, bunIndex);

    // Mapează categoria și subcategoria din tip_bun
    const category = mapTipBunToCategory(bun.tip_bun, bun.categoria_teren) || 'Diverse / Speciale';
    const subcategory = mapTipBunToSubcategory(bun.tip_bun, bun.categoria_teren) || 'Alte';

    // Obține Street View URL-ul din licitație (dacă există)
    let streetViewCloudinaryUrl: string | null = null;
    try {
      console.log(`[Product Creator] Fetching licitatie ${licitatieId} for Street View URL...`);
      const { data: licitatie, error: licitatieError } = await supabaseAdmin
        .from('anaf_licitatii')
        .select('street_view_image_url, lat, lng')
        .eq('id', licitatieId)
        .single();

      if (licitatieError) {
        console.error('[Product Creator] Error fetching licitatie:', licitatieError);
      } else {
        console.log('[Product Creator] Licitatie data:', {
          hasStreetViewUrl: !!licitatie?.street_view_image_url,
          streetViewUrl: licitatie?.street_view_image_url ? `${licitatie.street_view_image_url.substring(0, 50)}...` : null,
          lat: licitatie?.lat,
          lng: licitatie?.lng,
        });
      }

      if (licitatie?.street_view_image_url) {
        console.log('[Product Creator] Found Street View URL in licitatie, uploading to Cloudinary...');
        console.log('[Product Creator] Street View URL:', licitatie.street_view_image_url);
        console.log('[Product Creator] Street View URL length:', licitatie.street_view_image_url.length);
        console.log('[Product Creator] Street View URL preview:', licitatie.street_view_image_url.substring(0, 150));
        
        const uploadResult = await uploadStreetViewToCloudinary(licitatie.street_view_image_url);
        
        console.log('[Product Creator] Upload result:', {
          success: uploadResult.success,
          hasUrl: !!uploadResult.url,
          url: uploadResult.url ? `${uploadResult.url.substring(0, 100)}...` : null,
          error: uploadResult.error,
        });
        
        if (uploadResult.success && uploadResult.url) {
          streetViewCloudinaryUrl = uploadResult.url;
          console.log('[Product Creator] ✅ Street View image uploaded to Cloudinary:', streetViewCloudinaryUrl);
        } else {
          console.warn('[Product Creator] ❌ Failed to upload Street View to Cloudinary:', uploadResult.error);
          console.warn('[Product Creator] Will continue without Street View image');
        }
      } else {
        console.log('[Product Creator] ⚠️ No Street View URL found in licitatie (ID:', licitatieId, ')');
        console.log('[Product Creator] Licitatie data:', {
          hasStreetViewUrl: !!licitatie?.street_view_image_url,
          hasLat: !!licitatie?.lat,
          hasLng: !!licitatie?.lng,
        });
      }
    } catch (streetViewError: any) {
      console.error('[Product Creator] ❌ Error processing Street View:', streetViewError.message);
      console.error('[Product Creator] Stack:', streetViewError.stack);
      // Continuă fără Street View dacă eșuează
    }

    // Generează imaginea ANAF automat (întotdeauna, ca a doua imagine sau fallback)
    // Pentru autoturisme, folosește marca și anul în loc de "ANAF"
    let anafImageUrl: string | null = null;
    try {
      console.log('[Product Creator] Generating ANAF image...');
      let imageText = 'ANAF';
      if (bun.tip_bun === 'autoturism' || bun.tip_bun === 'auto') {
        // Pentru autoturisme, folosește marca și anul
        const marcaAnParts: string[] = [];
        if (bun.marca) marcaAnParts.push(bun.marca);
        if (bun.an_fabricatie) marcaAnParts.push(String(bun.an_fabricatie));
        if (marcaAnParts.length > 0) {
          imageText = marcaAnParts.join(' ');
        }
      }
      const imageResult = await generateANAFImage({
        localitate: licitatieData.localitate || 'Necunoscut',
        subcategory: subcategory,
        imageText: imageText, // Text personalizat pentru imagine
      });
      anafImageUrl = imageResult.url;
      console.log('[Product Creator] ANAF image generated:', anafImageUrl);
    } catch (imageError: any) {
      console.warn('[Product Creator] Failed to generate ANAF image:', imageError.message);
      // Continuă fără imagine dacă generarea eșuează
    }

    // Calculează auction_date (combină data și ora)
    const dateStr = licitatieData.data_licitatie;
    const timeStr = licitatieData.ora_licitatie;
    let auctionDate: string | null = null;
    
    if (dateStr) {
      const formattedDate = formatDateForDB(dateStr);
      if (formattedDate) {
        if (timeStr) {
          const formattedTime = formatTimeForDB(timeStr);
          if (formattedTime) {
            auctionDate = `${formattedDate}T${formattedTime}`;
            console.log('[Product Creator] Combined auction_date:', auctionDate, 'from date:', dateStr, 'time:', timeStr);
          } else {
            console.log('[Product Creator] Failed to format time:', timeStr, 'using date only');
            auctionDate = formattedDate;
          }
        } else {
          console.log('[Product Creator] No auction time provided, using date only:', formattedDate);
          auctionDate = formattedDate;
        }
      } else {
        console.log('[Product Creator] Failed to format date:', dateStr);
      }
    } else {
      console.log('[Product Creator] No auction date provided');
    }

    // Pipeline final preț: GPT bun → GPT licitație → OCR → null
    // Folosim prețul din bun, apoi din licitație, apoi OCR, apoi null
    let finalPrice = bun.pret_evaluare && bun.pret_evaluare > 0 
      ? bun.pret_evaluare 
      : (licitatieData.pret_evaluare && licitatieData.pret_evaluare > 0 
        ? licitatieData.pret_evaluare 
        : (ocrPrice && ocrPrice > 0 ? ocrPrice : null));

    // Determină dacă avem un preț valid (pentru a decide statusul inițial)
    const hasValidPrice = finalPrice !== null && finalPrice > 0;

    console.log('[Product Creator] Price pipeline:', {
      bunPrice: bun.pret_evaluare,
      licitatiePrice: licitatieData.pret_evaluare,
      ocrPrice,
      finalPrice,
    });

    // Construiește obiectul produs
    // IMPORTANT: productType și saleType trebuie să fie exact așa cum sunt definite în formular
    const productData: any = {
      title: enhancedTitle || 'Licitație Publică',
      description: enhancedDescription || 'Licitație publică',
      slug,
      sku,
      category,
      subcategory,
      // Prețuri (folosim snake_case pentru Supabase)
      starting_price: finalPrice || 0,
      starting_price_ron: bun.moneda === 'RON' ? (finalPrice || 0) : undefined,
      starting_price_eur: bun.moneda === 'EUR' ? (finalPrice || 0) : undefined,
      currency: (bun.moneda || 'RON') as 'RON' | 'EUR',
      // Tip Produs: Licitații publice (valoare exactă din formular)
      product_type: 'licitatii-publice' as const,
      // Tip de Vânzare: Licitații ANAF (valoare exactă din formular)
      sale_type: 'licitatii-anaf' as const,
      // Dacă nu avem preț extras, lăsăm produsul în draft pentru verificare manuală
      status: (hasValidPrice ? 'active' : 'draft') as 'active' | 'draft',
      
      // Informații despre locație (folosim snake_case pentru Supabase)
      county: licitatieData.judet,
      city: licitatieData.localitate,
      address: licitatieData.adresa,
      product_location: licitatieData.adresa ? `${licitatieData.adresa}, ${licitatieData.localitate}, ${licitatieData.judet}` : `${licitatieData.localitate}, ${licitatieData.judet}`,
      
      // Informații despre licitație (folosim snake_case pentru Supabase)
      // Combină data și ora pentru auction_date (format: YYYY-MM-DDTHH:MM)
      auction_date: auctionDate,
      auction_registration_date: licitatieData.data_licitatie ? formatDateForDB(licitatieData.data_licitatie) : null,
      // Salvează data de publicare în customFields pentru a o putea afișa în admin
      // Data de publicare este de obicei data_licitatie sau data când a fost publicat anunțul
      auction_location: licitatieData.loc_licitatie || null,
      
      // Brand + model first-class columns (pentru filtre /ro și căutare)
      brand: normalizeBrandModel(bun.marca) ?? undefined,
      model: normalizeBrandModel(bun.model) ?? undefined,
      // Câmpuri custom (folosim snake_case pentru Supabase) - COMPLETATE AUTOMAT ÎN FUNCȚIE DE CATEGORIE/SUBCATEGORIE
      custom_fields: customFields,
      
      // SEO (optimizat de ChatGPT)
      seo: enhancedSEO,
      
      // Documente PDF
      documents: pdfUrl ? [
        {
          name: `Licitație ANAF ${licitatieData.numar_licitatie || ''}`,
          url: pdfUrl,
          type: 'pdf',
        },
      ] : [],
      
      // Folosește Street View ca imagine principală, apoi ANAF image ca fallback
      images: streetViewCloudinaryUrl 
        ? [streetViewCloudinaryUrl, ...(anafImageUrl ? [anafImageUrl] : [])]
        : (anafImageUrl ? [anafImageUrl] : []),
      url: generateProductUrl('licitatii-publice', slug), // URL-ul produsului bazat pe tip
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    console.log(`[Product Creator] Creating product with data:`, {
      title: productData.title,
      category: productData.category,
      subcategory: productData.subcategory,
      product_type: productData.product_type,
      sale_type: productData.sale_type,
      starting_price: productData.starting_price,
      currency: productData.currency,
      county: productData.county,
      city: productData.city,
      address: productData.address,
      auction_date: productData.auction_date,
      auction_location: productData.auction_location,
      images: productData.images,
      hasStreetView: !!streetViewCloudinaryUrl,
      hasAnafImage: !!anafImageUrl,
    });

    // Inserează produsul
    const { data: product, error } = await supabaseAdmin
      .from('products')
      .insert([productData])
      .select()
      .single();

    if (error) {
      console.error('[Product Creator] Error creating product:', error);
      console.error('[Product Creator] Product data that failed:', JSON.stringify(productData, null, 2));
      throw new Error(`Failed to create product: ${error.message}`);
    }

    console.log(`[Product Creator] Product created successfully with ID: ${product.id}`);

    if (
      supabaseAdmin &&
      Array.isArray(productData.images) &&
      productData.images.length > 0
    ) {
      await enqueueImageMirrorJobsForProduct(supabaseAdmin, {
        productId: product.id,
        userId: productData.user_id ?? null,
        imageUrls: productData.images as string[],
      });
    }

    // Actualizează licitația cu ID-ul produsului
    await supabaseAdmin
      .from('anaf_licitatii')
      .update({ 
        product_id: product.id,
        product_created: true,
      })
      .eq('id', licitatieId);

    return {
      productId: product.id,
      success: true,
    };
  } catch (error: any) {
    console.error('Error creating product from ANAF licitatie:', error);
    return {
      productId: '',
      success: false,
      error: error.message,
    };
  }
}

/**
 * Generează titlul produsului din bun
 */
function generateProductTitleFromBun(bun: ANAFBun, licitatieData: ANAFLicitatieData, bunIndex: number, totalBunuri: number): string {
  const parts: string[] = [];
  
  // Pentru autoturisme: Marca Model An
  if (bun.tip_bun === 'autoturism' || bun.tip_bun === 'auto') {
    if (bun.marca) parts.push(bun.marca);
    if (bun.model) parts.push(bun.model);
    if (bun.an_fabricatie) parts.push(String(bun.an_fabricatie));
    if (bun.culoare) parts.push(bun.culoare);
    if (bun.caroserie) parts.push(`(${bun.caroserie})`);
  } else if (bun.denumire) {
    // Folosește denumirea bunului
    parts.push(bun.denumire);
  } else if (bun.tip_bun) {
    parts.push(bun.tip_bun);
  }
  
  // Adaugă informații despre licitație (fără ANAF)
  if (licitatieData.numar_licitatie) {
    parts.push(`Licitația ${licitatieData.numar_licitatie}`);
  }
  
  // Dacă sunt mai multe bunuri, adaugă index
  if (totalBunuri > 1) {
    parts.push(`Lot ${bunIndex}`);
  }
  
  if (parts.length === 0) {
    return `Licitație Publică - ${licitatieData.judet || 'Necunoscut'}`;
  }
  
  return parts.join(' ');
}

/**
 * Generează descrierea produsului din bun
 */
function generateProductDescriptionFromBun(bun: ANAFBun, licitatieData: ANAFLicitatieData): string {
  const parts: string[] = [];
  
  parts.push(`Licitație publică ANAF ${licitatieData.numar_licitatie || ''}.`);
  
  if (bun.denumire) {
    parts.push(`Bun: ${bun.denumire}.`);
  }
  
  if (bun.descriere_sumara) {
    parts.push(`Descriere: ${bun.descriere_sumara}.`);
  }
  
  // Detalii specifice pentru autoturisme
  if (bun.tip_bun === 'autoturism' || bun.tip_bun === 'auto') {
    if (bun.marca && bun.model) {
      parts.push(`Autoturism ${bun.marca} ${bun.model}.`);
    }
    if (bun.an_fabricatie) parts.push(`An fabricație: ${bun.an_fabricatie}.`);
    if (bun.rulaj) parts.push(`Kilometraj: ${bun.rulaj} KM.`);
    if (bun.combustibil) parts.push(`Combustibil: ${bun.combustibil}.`);
    if (bun.putere) parts.push(`Putere: ${bun.putere} ${bun.putere_unitate || 'KW'}.`);
    if (bun.capacitate_cilindrica) parts.push(`Capacitate cilindrică: ${bun.capacitate_cilindrica} cm³.`);
    if (bun.transmisie) parts.push(`Transmisie: ${bun.transmisie}.`);
    if (bun.clasa_emisii) parts.push(`Clasă emisii: ${bun.clasa_emisii}.`);
    if (bun.stare_uzura) parts.push(`Stare: ${bun.stare_uzura}.`);
    // nr_inmatriculare eliminat - nu este necesar
  }
  
  // Detalii pentru terenuri
  if (bun.tip_bun === 'teren') {
    if (bun.categoria_teren) parts.push(`Categorie teren: ${bun.categoria_teren}.`);
    if (bun.suprafata_totala) parts.push(`Suprafață: ${bun.suprafata_totala} ${bun.unitate_suprafata || 'mp'}.`);
    if (bun.destinatie) parts.push(`Destinație: ${bun.destinatie}.`);
  }
  
  // Detalii pentru construcții
  if (bun.tip_bun === 'constructie' || bun.tip_bun === 'imobil') {
    if (bun.numar_camere) parts.push(`Număr camere: ${bun.numar_camere}.`);
    if (bun.suprafata_totala) parts.push(`Suprafață: ${bun.suprafata_totala} mp.`);
    if (bun.an_constructie) parts.push(`An construcție: ${bun.an_constructie}.`);
  }
  
  if (licitatieData.localitate && licitatieData.judet) {
    parts.push(`Locație: ${licitatieData.localitate}, Județ ${licitatieData.judet}.`);
  }
  
  if (bun.pret_evaluare) {
    parts.push(`Preț evaluare: ${bun.pret_evaluare} ${bun.moneda || 'RON'}${bun.tva_inclus ? ' (TVA inclus)' : ' (fără TVA)'}.`);
    if (bun.cota_tva) parts.push(`Cota TVA: ${bun.cota_tva}.`);
  }
  
  if (licitatieData.data_licitatie) {
    parts.push(`Data licitației: ${formatDate(licitatieData.data_licitatie)}.`);
  }
  
  if (licitatieData.ora_licitatie) {
    parts.push(`Ora licitației: ${licitatieData.ora_licitatie}.`);
  }
  
  if (licitatieData.loc_licitatie) {
    parts.push(`Loc desfășurare: ${licitatieData.loc_licitatie}.`);
  }
  
  if (licitatieData.nume_contribuabil) {
    parts.push(`Contribuabil: ${licitatieData.nume_contribuabil}.`);
  }
  
  // drepturi_reale eliminat - nu trebuie afișat (conține date personale - este ilegal)
  
  return parts.join(' ');
}

/**
 * Generează SKU din bun
 */
function generateSKUFromBun(bun: ANAFBun, bunIndex: number): string {
  const prefix = 'ANAF';
  const timestamp = Date.now().toString(36).toUpperCase().slice(-4);
  const index = bunIndex.toString().padStart(2, '0');
  
  // Adaugă o parte din tip_bun sau marca dacă există
  let suffix = '';
  if (bun.marca) {
    suffix = bun.marca.substring(0, 2).toUpperCase();
  } else if (bun.tip_bun) {
    suffix = bun.tip_bun.substring(0, 2).toUpperCase();
  } else {
    suffix = 'XX';
  }
  
  return `${prefix}${timestamp}${index}${suffix}`.substring(0, 20);
}

/**
 * Construiește câmpurile custom în funcție de categorie și subcategorie
 */
function buildCustomFieldsFromBun(bun: ANAFBun, licitatieData: ANAFLicitatieData, category: string, subcategory: string): any {
  const customFields: any = {
    // Detalii licitație (comune pentru toate)
    numar_licitatie: licitatieData.numar_licitatie || null,
    ora_licitatie: licitatieData.ora_licitatie || null,
    nume_contribuabil: licitatieData.nume_contribuabil || null,
    tva_inclus: bun.tva_inclus || false,
    valoare_tva: bun.valoare_tva || null,
    cota_tva: bun.cota_tva || null,
    conditii_suplimentare: licitatieData.conditii_suplimentare || {},
    detalii_relevante: licitatieData.detalii_relevante || null,
    source: 'anaf',
  };
  
  // Câmpuri specifice pentru AUTOVEHICULE -> AUTOTURISME
  if (category === 'Autovehicule' && subcategory === 'Autoturisme') {
    if (bun.marca) customFields.marca = bun.marca;
    if (bun.model) customFields.model = bun.model;
    if (bun.culoare) customFields.culoare = bun.culoare;
    // Tip Caroserie (ex: Berlina, Break, SUV)
    if (bun.caroserie) customFields.caroserie = bun.caroserie;
    // Normalizează an_fabricatie - elimină puncte și convertește în număr întreg
    if (bun.an_fabricatie !== undefined && bun.an_fabricatie !== null) {
      const anValue: any = bun.an_fabricatie;
      if (typeof anValue === 'string') {
        const cleaned = anValue.replace(/[.\s]/g, '');
        const normalizedYear = parseInt(cleaned, 10);
        if (!isNaN(normalizedYear) && normalizedYear >= 1900 && normalizedYear <= new Date().getFullYear() + 1) {
          customFields.an = normalizedYear;
        } else {
          console.warn(`[Product Creator] Invalid an_fabricatie: ${anValue}, skipping`);
        }
      } else if (typeof anValue === 'number') {
        customFields.an = Math.round(anValue);
      }
    }
    if (bun.rulaj) customFields.kilometraj = bun.rulaj;
    // Normalizează combustibil la valorile acceptate în formular
    if (bun.combustibil) {
      customFields.combustibil = normalizeCombustibil(bun.combustibil);
    }
    // Putere în KW (convertim din CP dacă este necesar)
    if (bun.putere) {
      // Dacă puterea este în CP, convertim la KW (1 CP ≈ 0.736 KW)
      if (bun.putere_unitate === 'CP') {
        customFields.putere = Math.round(bun.putere * 0.736 * 100) / 100; // Rotunjit la 2 zecimale
      } else {
        // Păstrăm valoarea exactă (poate fi cu zecimale, ex: 154.5)
        customFields.putere = bun.putere;
      }
    }
    // Normalizează capacitate_cilindrica - elimină puncte și convertește în număr întreg
    if (bun.capacitate_cilindrica !== undefined && bun.capacitate_cilindrica !== null) {
      const capValue: any = bun.capacitate_cilindrica;
      if (typeof capValue === 'string') {
        const cleaned = capValue.replace(/[.\s]/g, '').replace(/[^0-9]/g, '');
        const normalizedCapacity = parseInt(cleaned, 10);
        if (!isNaN(normalizedCapacity) && normalizedCapacity > 0) {
          customFields.capacitateCilindrica = normalizedCapacity;
        } else {
          console.warn(`[Product Creator] Invalid capacitate_cilindrica: ${capValue}, skipping`);
        }
      } else if (typeof capValue === 'number') {
        customFields.capacitateCilindrica = Math.round(capValue);
      }
    }
    // Serie Șasiu
    if (bun.serie_sasiu) customFields.serie_sasiu = bun.serie_sasiu;
    if (bun.serie_motor) customFields.serie_motor = bun.serie_motor;
    // nr_inmatriculare eliminat - nu este necesar
    // Normalizează transmisie la valorile acceptate în formular
    if (bun.transmisie) {
      customFields.transmisie = normalizeTransmisie(bun.transmisie);
    }
    // Clasa Emisii
    if (bun.clasa_emisii) customFields.clasa_emisii = bun.clasa_emisii;
    // Stare (normalizează stare_uzura la valorile acceptate în formular)
    if (bun.stare_uzura) {
      customFields.stare = normalizeStare(bun.stare_uzura);
    }
    if (bun.semne_particulare) customFields.semne_particulare = bun.semne_particulare;
  }
  
  // Câmpuri specifice pentru IMOBILIARE
  if (category === 'Imobiliare') {
    if (bun.numar_camere) customFields.numarCamere = bun.numar_camere;
    if (bun.numar_dormitoare) customFields.numarDormitoare = bun.numar_dormitoare;
    if (bun.numar_bai) customFields.numarBai = bun.numar_bai;
    if (bun.etaj) customFields.etaj = bun.etaj;
    if (bun.an_constructie) customFields.anConstructie = bun.an_constructie;
    if (bun.suprafata_totala) customFields.suprafata = bun.suprafata_totala;
    if (bun.compartimentare) customFields.compartimentare = bun.compartimentare;
    if (bun.destinatie) customFields.destinatie = bun.destinatie;
    if (bun.acces) customFields.acces = bun.acces;
    if (bun.utilitati) customFields.utilitati = bun.utilitati;
  }
  
  // Câmpuri specifice pentru TERENURI
  if (bun.tip_bun === 'teren') {
    if (bun.categoria_teren) customFields.categoria_teren = bun.categoria_teren;
    if (bun.suprafata_totala) customFields.suprafata_totala = bun.suprafata_totala;
    if (bun.unitate_suprafata) customFields.unitate_suprafata = bun.unitate_suprafata;
    if (bun.destinatie) customFields.destinatie = bun.destinatie;
    if (bun.acces) customFields.acces = bun.acces;
  }
  
  // Câmpuri generale
  if (bun.tip_bun) customFields.tip_bun = bun.tip_bun;
  if (bun.denumire) customFields.denumire = bun.denumire;
  if (bun.descriere_sumara) customFields.descriere_sumara = bun.descriere_sumara;
  // drepturi_reale eliminat - nu trebuie salvat (conține date personale - este ilegal)
  
  return customFields;
}

/**
 * Generează titlul produsului (backwards compatibility)
 */
function generateProductTitle(data: ANAFLicitatieData): string {
  const parts: string[] = [];
  
  if (data.tip_bun) {
    parts.push(data.tip_bun);
  }
  
  if (data.categoria_teren) {
    parts.push(data.categoria_teren);
  }
  
  if (data.localitate) {
    parts.push(data.localitate);
  }
  
  if (data.judet) {
    parts.push(`Județ ${data.judet}`);
  }
  
  if (data.suprafata_totala) {
    parts.push(`${data.suprafata_totala} ${data.unitate_suprafata || 'mp'}`);
  }
  
  if (parts.length === 0) {
    return `Licitație ANAF - ${data.judet || 'Necunoscut'}`;
  }
  
  return parts.join(' - ');
}

/**
 * Generează descrierea produsului
 */
function generateProductDescription(data: ANAFLicitatieData): string {
  const parts: string[] = [];
  
  parts.push(`Licitație publică ANAF ${data.numar_licitatie || ''}.`);
  
  if (data.tip_bun) {
    parts.push(`Tip bun: ${data.tip_bun}.`);
  }
  
  if (data.categoria_teren) {
    parts.push(`Categorie teren: ${data.categoria_teren}.`);
  }
  
  if (data.localitate && data.judet) {
    parts.push(`Locație: ${data.localitate}, Județ ${data.judet}.`);
  }
  
  if (data.adresa) {
    parts.push(`Adresă: ${data.adresa}.`);
  }
  
  if (data.suprafata_totala) {
    parts.push(`Suprafață: ${data.suprafata_totala} ${data.unitate_suprafata || 'mp'}.`);
  }
  
  if (data.pret_evaluare) {
    parts.push(`Preț evaluare: ${data.pret_evaluare} ${data.moneda || 'RON'}${data.tva_inclus ? ' (TVA inclus)' : ' (fără TVA)'}.`);
  }
  
  if (data.data_licitatie) {
    parts.push(`Data licitației: ${formatDate(data.data_licitatie)}.`);
  }
  
  if (data.ora_licitatie) {
    parts.push(`Ora licitației: ${data.ora_licitatie}.`);
  }
  
  if (data.loc_licitatie) {
    parts.push(`Loc desfășurare: ${data.loc_licitatie}.`);
  }
  
  if (data.nume_contribuabil) {
    parts.push(`Contribuabil: ${data.nume_contribuabil}.`);
  }
  
  if (data.conditii_suplimentare?.garantie) {
    parts.push(`Garantie: ${data.conditii_suplimentare.garantie}.`);
  }
  
  if (data.conditii_suplimentare?.cont_bancar) {
    parts.push(`Cont bancar: ${data.conditii_suplimentare.cont_bancar}.`);
  }
  
  if (data.detalii_relevante) {
    parts.push(`Detalii: ${data.detalii_relevante}.`);
  }
  
  return parts.join(' ');
}

/**
 * Formatează data pentru baza de date (YYYY-MM-DD)
 */
function formatDateForDB(dateStr: string): string | null {
  if (!dateStr) return null;
  
  // Dacă este deja în format YYYY-MM-DD
  if (dateStr.match(/^\d{4}-\d{2}-\d{2}$/)) {
    return dateStr;
  }
  
  // Dacă este în format YYYY-MM-DDTHH:MM, extrage doar data
  const dateMatch = dateStr.match(/^(\d{4}-\d{2}-\d{2})/);
  if (dateMatch) {
    return dateMatch[1];
  }
  
  // Încearcă să parseze data
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) {
    return null;
  }
  
  // Returnează în format YYYY-MM-DD
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Formatează ora pentru baza de date (HH:MM)
 */
function formatTimeForDB(timeStr: string | null | undefined): string | null {
  if (!timeStr) return null;
  
  // Elimină spații
  const cleaned = timeStr.trim();
  if (!cleaned) return null;
  
  // Dacă este deja în format HH:MM
  if (cleaned.match(/^\d{2}:\d{2}$/)) {
    return cleaned;
  }
  
  // Dacă este în format HH:MM:SS, extrage doar HH:MM
  const fullTimeMatch = cleaned.match(/^(\d{2}):(\d{2}):(\d{2})$/);
  if (fullTimeMatch) {
    return `${fullTimeMatch[1]}:${fullTimeMatch[2]}`;
  }
  
  // Dacă este în format HH.MM sau HH:MM sau H.MM sau H:MM, normalizează
  const timeMatch = cleaned.match(/(\d{1,2})[.:](\d{2})/);
  if (timeMatch) {
    const hours = String(parseInt(timeMatch[1], 10)).padStart(2, '0');
    const minutes = timeMatch[2];
    
    // Validează că orele și minutele sunt valide
    const hoursNum = parseInt(hours, 10);
    const minutesNum = parseInt(minutes, 10);
    if (hoursNum >= 0 && hoursNum <= 23 && minutesNum >= 0 && minutesNum <= 59) {
      return `${hours}:${minutes}`;
    }
  }
  
  // Dacă este doar un număr (ex: "930" pentru 09:30 sau "9" pentru 09:00)
  const numberMatch = cleaned.match(/^(\d{1,4})$/);
  if (numberMatch) {
    const num = numberMatch[1];
    if (num.length === 1 || num.length === 2) {
      // "9" sau "09" -> "09:00"
      const hours = num.padStart(2, '0');
      return `${hours}:00`;
    } else if (num.length === 3) {
      // "930" -> "09:30"
      const hours = num.substring(0, 1).padStart(2, '0');
      const minutes = num.substring(1, 3);
      const hoursNum = parseInt(hours, 10);
      const minutesNum = parseInt(minutes, 10);
      if (hoursNum >= 0 && hoursNum <= 23 && minutesNum >= 0 && minutesNum <= 59) {
        return `${hours}:${minutes}`;
      }
    } else if (num.length === 4) {
      // "0930" -> "09:30"
      const hours = num.substring(0, 2);
      const minutes = num.substring(2, 4);
      const hoursNum = parseInt(hours, 10);
      const minutesNum = parseInt(minutes, 10);
      if (hoursNum >= 0 && hoursNum <= 23 && minutesNum >= 0 && minutesNum <= 59) {
        return `${hours}:${minutes}`;
      }
    }
  }
  
  console.warn('[Product Creator] Could not parse time format:', timeStr);
  return null;
}

/**
 * Normalizează combustibilul la valorile acceptate în formular
 * Opțiuni formular: 'Benzină', 'Motorină', 'GPL', 'Electric', 'Hibrid'
 */
function normalizeCombustibil(combustibil: string): string {
  if (!combustibil) return '';
  
  const normalized = combustibil.trim().toLowerCase();
  
  // Mapează variantele comune
  if (normalized.includes('benzina') || normalized.includes('benzină') || normalized.includes('petrol') || normalized.includes('gasoline')) {
    return 'Benzină';
  }
  if (normalized.includes('diesel') || normalized.includes('motorina') || normalized.includes('motorină')) {
    return 'Motorină';
  }
  if (normalized.includes('gpl') || normalized.includes('lpg')) {
    return 'GPL';
  }
  if (normalized.includes('electric') || normalized.includes('electrică')) {
    return 'Electric';
  }
  if (normalized.includes('hibrid') || normalized.includes('hybrid')) {
    return 'Hibrid';
  }
  
  // Dacă nu se potrivește, returnează prima literă mare
  return combustibil.charAt(0).toUpperCase() + combustibil.slice(1).toLowerCase();
}

/**
 * Normalizează transmisia la valorile acceptate în formular
 * Opțiuni formular: 'Manuală', 'Automată', 'CVT'
 */
function normalizeTransmisie(transmisie: string): string {
  if (!transmisie) return '';
  
  const normalized = transmisie.trim().toLowerCase();
  
  // Mapează variantele comune
  if (normalized.includes('manual') || normalized.includes('manuala') || normalized.includes('manuală')) {
    return 'Manuală';
  }
  if (normalized.includes('automat') || normalized.includes('automata') || normalized.includes('automată')) {
    return 'Automată';
  }
  if (normalized.includes('cvt')) {
    return 'CVT';
  }
  
  // Mapează "Fata" și "Integrala" la "Manuală" sau "Automată" (nu sunt tipuri de transmisie, ci tracțiune)
  // Dar dacă apare în PDF, probabil se referă la transmisie manuală
  if (normalized.includes('fata') || normalized.includes('față') || normalized.includes('front')) {
    return 'Manuală'; // Presupunem manuală dacă nu este specificat altfel
  }
  if (normalized.includes('integral') || normalized.includes('all-wheel') || normalized.includes('awd') || normalized.includes('4x4')) {
    return 'Automată'; // De obicei 4x4 are transmisie automată
  }
  
  // Dacă nu se potrivește, returnează prima literă mare
  return transmisie.charAt(0).toUpperCase() + transmisie.slice(1).toLowerCase();
}

/**
 * Normalizează starea la valorile acceptate în formular
 * Opțiuni formular: 'Nou', 'Foarte bună', 'Bună', 'Folosit', 'Uzată'
 */
function normalizeStare(stare: string): string {
  if (!stare) return '';
  
  const normalized = stare.trim().toLowerCase();
  
  // Mapează variantele comune
  if (normalized.includes('nou') || normalized.includes('new') || normalized.includes('neutilizat')) {
    return 'Nou';
  }
  if (normalized.includes('foarte buna') || normalized.includes('foarte bună') || normalized.includes('excellent') || normalized.includes('excelent')) {
    return 'Foarte bună';
  }
  if (normalized.includes('buna') || normalized.includes('bună') || normalized.includes('good') || normalized.includes('bun')) {
    return 'Bună';
  }
  if (normalized.includes('folosit') || normalized.includes('used') || normalized.includes('utilizat')) {
    return 'Folosit';
  }
  if (normalized.includes('uzata') || normalized.includes('uzată') || normalized.includes('worn') || normalized.includes('uzat')) {
    return 'Uzată';
  }
  
  // Dacă nu se potrivește, returnează prima literă mare
  return stare.charAt(0).toUpperCase() + stare.slice(1).toLowerCase();
}

/**
 * Mapează tipul bunului la categoria produsului (valorile exacte din formular)
 */
function mapTipBunToCategory(tipBun?: string, categoriaTeren?: string): string {
  if (!tipBun) return 'Diverse / Speciale';
  
  const lower = tipBun.toLowerCase();
  const categoriaLower = categoriaTeren?.toLowerCase() || '';
  
  // Imobiliare
  if (lower.includes('teren') || lower.includes('lot') || 
      lower.includes('constructie') || lower.includes('clădire') || lower.includes('cladire') || 
      lower.includes('imobil') || lower.includes('apartament') || lower.includes('casă') || lower.includes('casa') ||
      lower.includes('vila') || lower.includes('spațiu comercial') || lower.includes('spatiu comercial') ||
      lower.includes('hală') || lower.includes('hala') || categoriaLower.includes('intravilan') || 
      categoriaLower.includes('extravilan')) {
    return 'Imobiliare';
  }
  
  // Autovehicule
  if (lower.includes('auto') || lower.includes('autoturism') || lower.includes('mașină') || lower.includes('masina') ||
      lower.includes('vehicul') || lower.includes('camion') || lower.includes('motocicletă') || 
      lower.includes('motocicleta') || lower.includes('remorcă') || lower.includes('remorca')) {
    return 'Autovehicule';
  }
  
  // Utilaje & Echipamente
  if (lower.includes('utilaj') || lower.includes('echipament') || lower.includes('mașină') || 
      lower.includes('masina') || lower.includes('sculă') || lower.includes('scula') ||
      lower.includes('generator') || lower.includes('compresor')) {
    return 'Utilaje & Echipamente';
  }
  
  // Artă & Antichități
  if (lower.includes('artă') || lower.includes('arta') || lower.includes('antichitate') ||
      lower.includes('pictură') || lower.includes('pictura') || lower.includes('sculptură') ||
      lower.includes('sculptura') || lower.includes('bijuterie') || lower.includes('ceas')) {
    return 'Artă & Antichități';
  }
  
  // Electronice & Tehnologie
  if (lower.includes('electron') || lower.includes('tehnologie') || lower.includes('laptop') ||
      lower.includes('computer') || lower.includes('telefon') || lower.includes('tabletă') ||
      lower.includes('tableta') || lower.includes('tv') || lower.includes('televizor')) {
    return 'Electronice & Tehnologie';
  }
  
  // Casă & Grădină
  if (lower.includes('mobilier') || lower.includes('casă') || lower.includes('casa') ||
      lower.includes('grădină') || lower.includes('gradina') || lower.includes('electrocasnic')) {
    return 'Casă & Grădină';
  }
  
  // Modă & Lifestyle
  if (lower.includes('modă') || lower.includes('moda') || lower.includes('haină') || lower.includes('haina') ||
      lower.includes('încălțăminte') || lower.includes('incaltaminte') || lower.includes('gent') ||
      lower.includes('parfum') || lower.includes('cosmetic')) {
    return 'Modă & Lifestyle';
  }
  
  // Agricultură & Zootehnie
  if (lower.includes('agricol') || lower.includes('tractor') || lower.includes('combine') ||
      lower.includes('animal') || lower.includes('zootehnie') || categoriaLower.includes('arabil') ||
      categoriaLower.includes('fâneață') || categoriaLower.includes('faneata') || categoriaLower.includes('livadă') ||
      categoriaLower.includes('livada')) {
    return 'Agricultură & Zootehnie';
  }
  
  // Maritime & Aeronautice
  if (lower.includes('barcă') || lower.includes('barca') || lower.includes('iaht') ||
      lower.includes('avion') || lower.includes('aeronautic') || lower.includes('maritim')) {
    return 'Maritime & Aeronautice';
  }
  
  // Business & Licitații
  if (lower.includes('birou') || lower.includes('comercial') || lower.includes('business') ||
      lower.includes('licitație') || lower.includes('licitatie')) {
    return 'Business & Licitații';
  }
  
  // Materiale Construcții
  if (lower.includes('material') || lower.includes('construcție') || lower.includes('constructie') ||
      lower.includes('ciment') || lower.includes('cărămidă') || lower.includes('caramida') ||
      lower.includes('oțel') || lower.includes('otel') || lower.includes('izolație') ||
      lower.includes('izolatie')) {
    return 'Materiale Construcții';
  }
  
  return 'Diverse / Speciale';
}

/**
 * Mapează tipul bunului și categoria terenului la subcategoria produsului
 */
function mapTipBunToSubcategory(tipBun?: string, categoriaTeren?: string): string {
  if (!tipBun) return 'Alte';
  
  const lower = tipBun.toLowerCase();
  const categoriaLower = categoriaTeren?.toLowerCase() || '';
  
  // Subcategorii pentru Imobiliare
  if (lower.includes('apartament')) {
    return 'Apartamente';
  }
  if (lower.includes('casă') || lower.includes('casa') || lower.includes('vilă') || lower.includes('vila')) {
    return 'Case și Vile';
  }
  if (lower.includes('teren') && (categoriaLower.includes('intravilan') || lower.includes('intravilan'))) {
    return 'Terenuri Intravilane';
  }
  if (lower.includes('teren') && (categoriaLower.includes('extravilan') || categoriaLower.includes('arabil') ||
      categoriaLower.includes('fâneață') || categoriaLower.includes('faneata') || categoriaLower.includes('livadă') ||
      categoriaLower.includes('livada'))) {
    return 'Terenuri Agricole';
  }
  if (lower.includes('spațiu comercial') || lower.includes('spatiu comercial') || lower.includes('magazin') ||
      lower.includes('showroom') || lower.includes('depozit')) {
    return 'Spații Comerciale';
  }
  if (lower.includes('hală') || lower.includes('hala') || lower.includes('industrial')) {
    return 'Hale Industriale';
  }
  if (lower.includes('turist') || lower.includes('pensiune') || lower.includes('hotel')) {
    return 'Proprietăți Turistice';
  }
  
  // Subcategorii pentru Autovehicule
  if (lower.includes('autoturism') || (lower.includes('auto') && !lower.includes('autobuz'))) {
    return 'Autoturisme';
  }
  if (lower.includes('suv') || lower.includes('4x4') || lower.includes('off-road')) {
    return 'SUV / 4x4';
  }
  if (lower.includes('motocicletă') || lower.includes('motocicleta') || lower.includes('scuter')) {
    return 'Motociclete și Scutere';
  }
  if (lower.includes('camion') || lower.includes('tir')) {
    return 'Camioane';
  }
  if (lower.includes('remorcă') || lower.includes('remorca') || lower.includes('semiremorcă')) {
    return 'Remorci și Semiremorci';
  }
  if (lower.includes('rulotă') || lower.includes('rulota') || lower.includes('autorulotă')) {
    return 'Autorulote / Rulote';
  }
  if (lower.includes('electric') || lower.includes('hibrid')) {
    return 'Vehicule Electrice';
  }
  
  // Subcategorii pentru Utilaje
  if (lower.includes('utilaj construcție') || lower.includes('utilaj constructie') ||
      lower.includes('excavator') || lower.includes('buldozer')) {
    return 'Utilaje Construcții';
  }
  if (lower.includes('utilaj agricol') || lower.includes('tractor') || lower.includes('combine')) {
    return 'Utilaje Agricole';
  }
  if (lower.includes('forestier') || lower.includes('tăietor') || lower.includes('taietor')) {
    return 'Echipamente Forestiere';
  }
  if (lower.includes('generator') || lower.includes('compresor')) {
    return 'Generatoare și Compresoare';
  }
  if (lower.includes('sculă') || lower.includes('scula') || lower.includes('uneltă')) {
    return 'Scule Profesionale';
  }
  if (lower.includes('atelier auto') || lower.includes('elevator auto')) {
    return 'Echipamente Ateliere Auto';
  }
  if (lower.includes('sudură') || lower.includes('sudura') || lower.includes('electric')) {
    return 'Echipamente Electrice / Sudură';
  }
  
  // Dacă nu găsim o subcategorie specifică, folosim tip_bun sau categoria_teren
  if (categoriaTeren) {
    // Capitalizează prima literă
    return categoriaTeren.charAt(0).toUpperCase() + categoriaTeren.slice(1);
  }
  
  if (tipBun) {
    // Capitalizează prima literă
    return tipBun.charAt(0).toUpperCase() + tipBun.slice(1);
  }
  
  return 'Alte';
}

/**
 * Generează SKU pentru produs
 */
function generateSKU(data: ANAFLicitatieData): string {
  const prefix = 'ANAF';
  const timestamp = Date.now().toString(36).toUpperCase().slice(-6);
  const judetCode = data.judet?.substring(0, 2).toUpperCase() || 'XX';
  return `${prefix}${judetCode}${timestamp}`;
}

/**
 * Generează cuvinte cheie pentru SEO
 */
function generateKeywords(data: ANAFLicitatieData): string[] {
  const keywords: string[] = [];
  
  keywords.push('licitație', 'anaf', 'licitație publică');
  
  if (data.judet) {
    keywords.push(data.judet.toLowerCase());
  }
  
  if (data.localitate) {
    keywords.push(data.localitate.toLowerCase());
  }
  
  if (data.tip_bun) {
    keywords.push(data.tip_bun.toLowerCase());
  }
  
  if (data.categoria_teren) {
    keywords.push(data.categoria_teren.toLowerCase());
  }
  
  return [...new Set(keywords)]; // Remove duplicates
}

/**
 * Formatează data pentru afișare
 */
function formatDate(dateString: string): string {
  try {
    const date = new Date(dateString);
    return date.toLocaleDateString('ro-RO', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  } catch {
    return dateString;
  }
}

