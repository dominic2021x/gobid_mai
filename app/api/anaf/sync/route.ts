/**
 * API Route - ANAF Sync
 * POST /api/anaf/sync
 * Sincronizează produsele ANAF cu PDF-urile originale
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { extractTextFromPDFUrl } from '@/lib/anaf/pdfExtractor';
import { parseANAFPDFWithGPT } from '@/lib/anaf/gptParser';
import { saveANAFlicitatie } from '@/lib/anaf/db';
import { createProductFromANAFBun } from '@/lib/anaf/productCreator';
import { geocodeFullAddress } from '@/lib/maps/geocode';
import { getStreetViewImage } from '@/lib/maps/streetview';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


export const runtime = 'nodejs';
export const maxDuration = 300; // 5 minute

/**
 * POST - Sincronizează un produs ANAF cu PDF-ul original
 */
export async function POST(request: NextRequest) {
  try {
    if (!supabaseAdmin) {
      return NextResponse.json(
        { error: 'Supabase admin client not configured' },
        { status: 500 }
      );
    }

    const body = await request.json();
    const { licitatie_id, product_id, pdf_url } = body;

    if (!licitatie_id && !product_id) {
      return NextResponse.json(
        { error: 'licitatie_id or product_id is required' },
        { status: 400 }
      );
    }

    // Obține licitația și produsul asociat
    let licitatie: any = null;
    let product: any = null;

    if (licitatie_id) {
      const { data: licitatieData, error: licitatieError } = await supabaseAdmin
        .from('anaf_licitatii')
        .select('*, products:product_id (*)')
        .eq('id', licitatie_id)
        .single();

      if (licitatieError) {
        return NextResponse.json(
          { error: `Failed to fetch licitatie: ${licitatieError.message}` },
          { status: 500 }
        );
      }

      licitatie = licitatieData;
      product = licitatie?.products;
    } else if (product_id) {
      const { data: productData, error: productError } = await supabaseAdmin
        .from('products')
        .select('*, anaf_licitatii!product_id (*)')
        .eq('id', product_id)
        .single();

      if (productError) {
        return NextResponse.json(
          { error: `Failed to fetch product: ${productError.message}` },
          { status: 500 }
        );
      }

      product = productData;
      licitatie = product?.anaf_licitatii?.[0];
    }

    if (!licitatie) {
      return NextResponse.json(
        { error: 'Licitatie not found' },
        { status: 404 }
      );
    }

    // Obține PDF URL-ul
    const pdfUrl = pdf_url || licitatie.pdf_url;
    if (!pdfUrl) {
      return NextResponse.json(
        { error: 'PDF URL not found' },
        { status: 400 }
      );
    }

    console.log(`[ANAF Sync] Syncing licitatie ${licitatie.id} with PDF: ${pdfUrl}`);

    // Pasul 1: Extrage textul din PDF
    let pdfExtraction;
    try {
      pdfExtraction = await extractTextFromPDFUrl(pdfUrl);
      if (!pdfExtraction?.text || pdfExtraction.text.trim().length === 0) {
        return NextResponse.json(
          { error: 'Failed to extract text from PDF or PDF is empty' },
          { status: 400 }
        );
      }
    } catch (err: any) {
      console.error('[ANAF Sync] PDF extraction failed:', err);
      return NextResponse.json(
        { error: `PDF extraction failed: ${err.message}` },
        { status: 500 }
      );
    }

    // Extrage prețul din metadata OCR
    const ocrPrice = pdfExtraction.metadata?.anafStructured?.pret 
      ? parseInt(pdfExtraction.metadata.anafStructured.pret.replace(/[^0-9]/g, ''), 10) 
      : null;

    // Pasul 2: Parsează cu GPT
    let licitatieData;
    try {
      licitatieData = await parseANAFPDFWithGPT(pdfExtraction.text);
      if (!licitatieData || !licitatieData.bunuri || licitatieData.bunuri.length === 0) {
        return NextResponse.json(
          { error: 'Failed to parse PDF or no goods found' },
          { status: 400 }
        );
      }
    } catch (err: any) {
      console.error('[ANAF Sync] GPT parsing failed:', err);
      return NextResponse.json(
        { error: `GPT parsing failed: ${err.message}` },
        { status: 500 }
      );
    }

    // Pasul 3: Geocodare (dacă nu există deja)
    let geocodeData = null;
    if (licitatieData.adresa && licitatieData.judet && licitatieData.localitate && (!licitatie.lat || !licitatie.lng)) {
      try {
        const geocodeResult = await geocodeFullAddress(
          licitatieData.judet,
          licitatieData.localitate,
          licitatieData.adresa
        );
        if (geocodeResult) {
          const streetViewResult = await getStreetViewImage(
            geocodeResult.lat,
            geocodeResult.lng,
            '800x600'
          );
          geocodeData = {
            lat: geocodeResult.lat,
            lng: geocodeResult.lng,
            streetViewImageUrl: streetViewResult.imageUrl || null
          };
        }
      } catch (err: any) {
        console.warn('[ANAF Sync] Geocoding failed:', err);
        // Continuă fără geocodare
      }
    }

    // Pasul 4: Actualizează licitația în baza de date
    const updatedLicitatie = await saveANAFlicitatie(
      licitatie.import_id,
      licitatieData,
      pdfUrl,
      undefined, // pdfStoragePath
      geocodeData || undefined
    );

    // Pasul 5: Actualizează sau creează produsele
    const updatedProducts: string[] = [];
    const createdProducts: string[] = [];

    for (let i = 0; i < licitatieData.bunuri.length; i++) {
      const bun = licitatieData.bunuri[i];
      
      // Verifică dacă există deja un produs pentru acest bun
      // (poți folosi un identificator unic sau compara după caracteristici)
      const existingProductId = licitatie.product_id;

      try {
        if (existingProductId && i === 0) {
          // Actualizează produsul existent (primul bun)
          // TODO: Implementează actualizarea produsului existent
          // Pentru moment, recreăm produsul
          const newProduct = await createProductFromANAFBun(
            updatedLicitatie.id,
            bun,
            licitatieData,
            pdfUrl,
            i,
            licitatieData.bunuri.length,
            ocrPrice
          );

          // Șterge produsul vechi
          if (existingProductId) {
            await supabaseAdmin
              .from('products')
              .delete()
              .eq('id', existingProductId);
          }

          // Actualizează licitația cu noul product_id
          if (newProduct.productId) {
            await supabaseAdmin
              .from('anaf_licitatii')
              .update({ product_id: newProduct.productId })
              .eq('id', updatedLicitatie.id);

            updatedProducts.push(newProduct.productId);
          }
        } else {
          // Creează produs nou
          const newProduct = await createProductFromANAFBun(
            updatedLicitatie.id,
            bun,
            licitatieData,
            pdfUrl,
            i,
            licitatieData.bunuri.length,
            ocrPrice
          );

          if (newProduct.productId) {
            createdProducts.push(newProduct.productId);
          }
        }
      } catch (err: any) {
        console.error(`[ANAF Sync] Failed to create/update product for bun ${i}:`, err);
        // Continuă cu următorul bun
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Sync completed',
      licitatie_id: updatedLicitatie.id,
      updated_products: updatedProducts,
      created_products: createdProducts,
      total_products: updatedProducts.length + createdProducts.length,
    });
  } catch (error: any) {
    console.error('Error in POST /api/anaf/sync:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

