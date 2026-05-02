/**
 * API Route - Import ANAF
 * POST /api/anaf/import
 *
 * Importează automat o licitație ANAF dintr-un URL PDF
 */

import { NextRequest, NextResponse } from 'next/server';
import { extractTextFromPDFUrl } from '@/lib/anaf/pdfExtractor';
import { parseANAFPDFWithGPT } from '@/lib/anaf/gptParser';
import {
  createANAFImport,
  updateANAFImportStatus,
  saveANAFlicitatie,
  getANAFImport,
} from '@/lib/anaf/db';
import { createProductFromANAFBun } from '@/lib/anaf/productCreator';
import { geocodeFullAddress } from '@/lib/maps/geocode';
import { getStreetViewImage } from '@/lib/maps/streetview';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


// Folosim runtime-ul Node.js (nu Edge), pentru că pdf-parse și OCR au nevoie de API-urile Node (Buffer, fs etc.)
export const runtime = 'nodejs';
export const maxDuration = 300; // 5 minute pentru procesare PDF + OCR + GPT

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    let { pdfUrl, sourceType = 'anaf' } = body;

    // Validare
    if (!pdfUrl || typeof pdfUrl !== 'string') {
      return NextResponse.json(
        { error: 'PDF URL is required' },
        { status: 400 }
      );
    }

    // Trimite URL-ul pentru a elimina spații
    let trimmedUrl = pdfUrl.trim();
    
    // Verifică dacă URL-ul este valid
    let isValidUrl = false;
    try {
      const url = new URL(trimmedUrl);
      isValidUrl = true;
      pdfUrl = url.href; // Folosim URL-ul normalizat
      console.log(`[ANAF Import] Valid URL parsed: ${pdfUrl}`);
    } catch (urlError: any) {
      console.error(`[ANAF Import] URL validation failed for: "${trimmedUrl}"`);
      console.error(`[ANAF Import] URL error:`, urlError?.message);
      
      // Încearcă să repare URL-ul dacă lipsește protocolul
      if (!trimmedUrl.startsWith('http://') && !trimmedUrl.startsWith('https://')) {
        const httpsUrl = `https://${trimmedUrl}`;
        try {
          const url = new URL(httpsUrl);
          isValidUrl = true;
          pdfUrl = url.href; // Folosim URL-ul corectat și normalizat
          console.log(`[ANAF Import] Fixed URL (added https://): ${pdfUrl}`);
        } catch (fixError: any) {
          console.error(`[ANAF Import] Failed to fix URL:`, fixError?.message);
          // Continuă cu eroarea originală
        }
      }
      
      if (!isValidUrl) {
        return NextResponse.json(
          { 
            error: `Invalid PDF URL format: ${urlError?.message || 'Invalid URL'}. ` +
                   'URL-ul trebuie să fie un URL HTTP/HTTPS valid (ex: https://static.anaf.ro/static/...pdf). ' +
                   `URL primit: "${trimmedUrl}"`
          },
          { status: 400 }
        );
      }
    }

    // Creează import în baza de date (permite re-import dacă importul anterior a eșuat)
    console.log('🟦 [ANAF Import] Incoming request body:', body);

    const importRecord = await createANAFImport({
      source_type: sourceType,
      source_url: pdfUrl,
      pdf_url: pdfUrl,
      allowReimport: true, // Permite re-import pentru importuri eșuate
    });

    const importId = importRecord.id;

    try {
      // Actualizează statusul la processing
      await updateANAFImportStatus(importId, 'processing');

      // Pasul 1: Descarcă și extrage textul din PDF (cu timeout)
      console.log(`🟦 [ANAF Import] STEP 1 - Download & extract PDF from: ${pdfUrl}`);
      
      let pdfExtraction;
      let extractionFailed = false;
      let extractionError: any = null;
      
      try {
        // Timeout pentru extragere PDF (3 minute - OCR poate dura)
        const extractionPromise = extractTextFromPDFUrl(pdfUrl);
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('PDF extraction timeout (3 minutes)')), 3 * 60 * 1000)
        );
        
        pdfExtraction = (await Promise.race([extractionPromise, timeoutPromise])) as any;
        console.log('🟦 [ANAF Import] PDF extraction raw result:', {
          hasResult: !!pdfExtraction,
          textLength: pdfExtraction?.text?.length,
          numPages: pdfExtraction?.numPages,
        });
      } catch (err: any) {
        extractionFailed = true;
        extractionError = err;
        console.error('🟥 [ANAF Import] PDF extraction failed:', err?.message || err);
        if (err?.stack) {
          console.error('🟥 [ANAF Import] PDF extraction stack:', err.stack);
        }
        
        // Dacă eroarea este despre Poppler lipsă, aruncăm eroarea pentru a fi afișată utilizatorului
        if (err?.message && (
          err.message.includes('Poppler') || 
          err.message.includes('pdftoppm') ||
          err.message.includes('nu este instalat') ||
          err.message.includes('not found') ||
          err.message.includes('ENOENT')
        )) {
          throw new Error(
            'PDF-ul este scanat și necesită Poppler pentru extragere OCR. ' +
            'Poppler nu este instalat sau nu este disponibil. ' +
            '\n\nInstalează Poppler:\n' +
            '• macOS: `brew install poppler` (necesită Homebrew)\n' +
            '• Linux: `sudo apt-get install poppler-utils`\n' +
            '• Windows: Descarcă de la https://poppler.freedesktop.org/ și adaugă în PATH\n\n' +
            'După instalare, repornește serverul Next.js.\n\n' +
            'Detalii tehnice: ' + err.message
          );
        }
        
        // Dacă OCR eșuează din alte motive (nu Poppler), continuăm cu licitație incompletă
        // Dacă e timeout sau alte erori OCR, creăm licitație pentru completare manuală
      }

      // Dacă extragerea a eșuat sau textul este gol, creăm o licitație incompletă
      if (extractionFailed || !pdfExtraction?.text || pdfExtraction.text.trim().length === 0) {
        console.log(
          '🟨 [ANAF Import] Extraction failed or empty text. extractionFailed=',
          extractionFailed,
          ' textLength=',
          pdfExtraction?.text ? pdfExtraction.text.length : 0,
          ' extractionError=',
          extractionError?.message || extractionError
        );
        
        // Creează o licitație incompletă cu doar URL-ul PDF
        const incompleteLicitatieData: any = {
          judet: 'Necunoscut',
          localitate: 'Necunoscut',
          adresa: '',
          nume_contribuabil: '',
          tip_bun: '',
          pret_evaluare: 0, // Folosim 0 în loc de null pentru a respecta tipul
          tva_inclus: false,
          moneda: 'RON' as const,
          numar_licitatie: '', // String gol în loc de null
          data_licitatie: '', // String gol în loc de null
          ora_licitatie: '', // String gol în loc de null
          loc_licitatie: '',
          conditii_suplimentare: {},
          detalii_relevante: extractionError?.message 
            ? `PDF scanat sau fără text selectabil. ${extractionError.message}` 
            : 'PDF scanat sau fără text selectabil. Necesită completare manuală.',
        };

        const         licitatie = await saveANAFlicitatie(
          importId,
          incompleteLicitatieData,
          pdfUrl,
          undefined,
          undefined // Nu geocodăm pentru date incomplete
        );

        // Încearcă să creeze produsul chiar dacă datele sunt incomplete
        let productId = null;
        try {
          console.log(`[ANAF Import] Attempting to create product with incomplete data...`);
          // Creează un bun default din datele incomplete
          const incompleteBun = {
            tip_bun: incompleteLicitatieData.tip_bun || 'alte',
            pret_evaluare: incompleteLicitatieData.pret_evaluare || 0,
            tva_inclus: incompleteLicitatieData.tva_inclus || false,
            moneda: incompleteLicitatieData.moneda || 'RON',
          };
          const productResult = await createProductFromANAFBun(
            licitatie.id,
            incompleteBun,
            incompleteLicitatieData,
            pdfUrl,
            1,
            1,
            null // Nu avem preț OCR pentru date incomplete
          );
          if (productResult.success) {
            productId = productResult.productId;
            console.log(`[ANAF Import] Product created with incomplete data: ${productId}`);
          }
        } catch (productError: any) {
          console.error(`[ANAF Import] Failed to create product with incomplete data:`, productError.message);
          // Continuăm fără produs - poate fi creat manual mai târziu
        }

        // Marchează importul ca "needs_manual_input"
        await updateANAFImportStatus(
          importId,
          'completed',
          'PDF scanat - necesită completare manuală a datelor',
          { needsManualInput: true, extractionError: extractionError?.message }
        );

        return NextResponse.json({
          success: true,
          importId,
          licitatieId: licitatie.id,
          productId: productId,
          data: incompleteLicitatieData,
          warning: true,
          message: 'PDF-ul a fost salvat, dar extragerea automată a textului a eșuat. ' +
            'Licitația a fost creată cu status "incomplet" și poate fi completată manual. ' +
            (productId ? `Produsul a fost creat (ID: ${productId}) dar necesită completare manuală. ` : '') +
            'PDF-ul este disponibil pentru descărcare.',
          needsManualInput: true,
        });
      }

      console.log(
        `🟦 [ANAF Import] Extracted ${pdfExtraction.text.length} characters from ${pdfExtraction.numPages} pages`
      );

      // Pasul 2: Parsează textul cu GPT-4o (cu timeout)
      console.log('🟦 [ANAF Import] STEP 2 - Parsing with GPT-4o...');
      
      let licitatieData;
      let gptParsingFailed = false;
      try {
        // Timeout pentru GPT parsing (1 minut)
        const parsingPromise = parseANAFPDFWithGPT(pdfExtraction.text);
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('GPT parsing timeout (1 minute)')), 60 * 1000)
        );
        
        licitatieData = await Promise.race([parsingPromise, timeoutPromise]) as any;
      } catch (err: any) {
        console.error('🟥 [ANAF Import] GPT parsing failed:', err?.message || err);
        gptParsingFailed = true;
        
        // Creează date incomplete pentru a permite crearea produsului
        licitatieData = {
          judet: 'Necunoscut',
          localitate: 'Necunoscut',
          adresa: '',
          nume_contribuabil: '',
          tip_bun: '',
          pret_evaluare: 0,
          tva_inclus: false,
          moneda: 'RON' as const,
          numar_licitatie: '',
          data_licitatie: '',
          ora_licitatie: '',
          loc_licitatie: '',
          conditii_suplimentare: {},
          detalii_relevante: `Parsarea cu GPT-4o a eșuat: ${err.message}. Datele au fost completate cu valori default.`,
        };
        
        console.log(`[ANAF Import] Using fallback data due to GPT parsing failure`);
      }

      // Pipeline final preț: GPT bun → GPT licitație → OCR → null
      // Extrage prețul OCR din metadata (dacă există)
      const ocrPrice = pdfExtraction.metadata?.anafStructured?.pret 
        ? parseInt(pdfExtraction.metadata.anafStructured.pret.replace(/[^0-9]/g, ''), 10)
        : null;
      
      // Dacă GPT nu a găsit preț, folosim prețul OCR
      if ((!licitatieData.pret_evaluare || licitatieData.pret_evaluare === 0) && ocrPrice) {
        licitatieData.pret_evaluare = ocrPrice;
        console.log(`[ANAF Import] Using OCR price as fallback: ${ocrPrice}`);
      }

      // Dacă niciun bun nu are preț, dar avem preț OCR, îl aplicăm primului bun
      if (licitatieData.bunuri && licitatieData.bunuri.length > 0) {
        const hasAnyPrice = licitatieData.bunuri.some(
          (b: any) => b.pret_evaluare && b.pret_evaluare > 0
        );
        if (!hasAnyPrice && ocrPrice) {
          licitatieData.bunuri[0].pret_evaluare = ocrPrice;
          console.log(`[ANAF Import] Applied OCR price to first bun: ${ocrPrice}`);
        }
      }

      console.log('🟦 [ANAF Import] Parsed data summary:', {
        judet: licitatieData.judet,
        localitate: licitatieData.localitate,
        numar_bunuri: licitatieData.bunuri?.length || 0,
        pret_evaluare: licitatieData.pret_evaluare,
        ocrPrice,
      });

      // Pasul 3: Geocodează adresa și generează Street View
      console.log('🟦 [ANAF Import] STEP 3 - Geocoding address and generating Street View...');
      console.log('[ANAF Import] Checking API Key availability...');
      console.log('[ANAF Import] GOOGLE_MAPS_API_KEY:', process.env.GOOGLE_MAPS_API_KEY ? `SET (${process.env.GOOGLE_MAPS_API_KEY.substring(0, 10)}...)` : 'NOT SET');
      console.log('[ANAF Import] NEXT_PUBLIC_GOOGLE_MAPS_API_KEY:', process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ? `SET (${process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY.substring(0, 10)}...)` : 'NOT SET');
      
      let geocodeData: { lat: number; lng: number; streetViewImageUrl: string | null } | undefined;
      
      if (licitatieData.adresa && licitatieData.judet && licitatieData.localitate) {
        try {
          console.log(`[ANAF Import] Attempting to geocode: ${licitatieData.adresa}, ${licitatieData.localitate}, ${licitatieData.judet}`);
          // Geocodează adresa completă
          const geocodeResult = await geocodeFullAddress(
            licitatieData.judet,
            licitatieData.localitate,
            licitatieData.adresa
          );

          if (geocodeResult.success) {
            console.log(`[ANAF Import] ✅ Geocoded address: (${geocodeResult.lat}, ${geocodeResult.lng})`);
            
            // Generează Street View
            console.log(`[ANAF Import] 🔄 Generating Street View for coordinates (${geocodeResult.lat}, ${geocodeResult.lng})...`);
            console.log(`[ANAF Import] API Key check:`, {
              GOOGLE_MAPS_API_KEY: process.env.GOOGLE_MAPS_API_KEY ? `SET (${process.env.GOOGLE_MAPS_API_KEY.substring(0, 10)}...)` : 'NOT SET',
              NEXT_PUBLIC_GOOGLE_MAPS_API_KEY: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ? `SET (${process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY.substring(0, 10)}...)` : 'NOT SET',
            });
            
            const streetViewResult = await getStreetViewImage(
              geocodeResult.lat,
              geocodeResult.lng,
              '800x600',
              false // DEZACTIVAT verificarea disponibilității - generăm URL-ul întotdeauna
            );

            console.log(`[ANAF Import] Street View result:`, {
              success: streetViewResult.success,
              hasImageUrl: !!streetViewResult.imageUrl,
              imageUrl: streetViewResult.imageUrl ? `${streetViewResult.imageUrl.substring(0, 100)}...` : null,
              error: streetViewResult.error,
            });

            geocodeData = {
              lat: geocodeResult.lat,
              lng: geocodeResult.lng,
              streetViewImageUrl: streetViewResult.success ? streetViewResult.imageUrl : null,
            };

            if (streetViewResult.success && streetViewResult.imageUrl) {
              console.log(`[ANAF Import] ✅ Generated Street View URL: ${streetViewResult.imageUrl}`);
              console.log(`[ANAF Import] Full Street View URL length: ${streetViewResult.imageUrl.length}`);
            } else {
              console.log(`[ANAF Import] ⚠️ Street View not available for this location: ${streetViewResult.error}`);
            }
          } else {
            console.warn(`[ANAF Import] ❌ Geocoding failed: ${geocodeResult.error}`);
          }
        } catch (geocodeError: any) {
          console.error('[ANAF Import] ❌ Error during geocoding:', geocodeError.message);
          console.error('[ANAF Import] Stack:', geocodeError.stack);
          // Continuăm fără geocoding dacă eșuează
        }
      } else {
        console.log('[ANAF Import] ⚠️ Skipping geocoding - missing address, judet, or localitate');
        console.log('[ANAF Import] Address data:', {
          adresa: licitatieData.adresa,
          judet: licitatieData.judet,
          localitate: licitatieData.localitate
        });
      }

      // Pasul 4: Salvează licitația în baza de date
      console.log('🟦 [ANAF Import] STEP 4 - Saving licitatie to database...');
      console.log('[ANAF Import] Geocode data to save:', {
        hasLat: !!geocodeData?.lat,
        hasLng: !!geocodeData?.lng,
        hasStreetViewUrl: !!geocodeData?.streetViewImageUrl,
        streetViewUrl: geocodeData?.streetViewImageUrl ? `${geocodeData.streetViewImageUrl.substring(0, 80)}...` : null,
      });
      let licitatie;
      try {
        licitatie = await saveANAFlicitatie(
          importId,
          licitatieData,
          pdfUrl,
          undefined,
          geocodeData
        );
        console.log('[ANAF Import] ✅ Licitatie saved with ID:', licitatie.id);
        console.log('[ANAF Import] Saved Street View URL:', licitatie.street_view_image_url);
      } catch (saveError: any) {
        console.error('🟥 [ANAF Import] Failed to save licitatie:', saveError?.message || saveError);
        throw new Error(`Failed to save licitatie: ${saveError.message}`);
      }

      // Pasul 5: Creează produse automat pentru fiecare bun (IMPORTANT: se creează întotdeauna)
      const bunuri = licitatieData.bunuri || [];
      console.log(
        `🟦 [ANAF Import] STEP 4 - Creating ${bunuri.length} product(s) from ${bunuri.length} bun(uri)...`
      );
      
      const productResults: Array<{ success: boolean; productId?: string; error?: string }> = [];
      
      for (let i = 0; i < bunuri.length; i++) {
        const bun = bunuri[i];
        console.log(`[ANAF Import] Creating product ${i + 1}/${bunuri.length} for bun: ${bun.denumire || bun.tip_bun}`);
        
        try {
          const productResult = await createProductFromANAFBun(
            licitatie.id,
            bun,
            licitatieData,
            pdfUrl,
            i + 1, // Index pentru SKU unic
            bunuri.length, // Total bunuri pentru context
            ocrPrice // Preț OCR ca fallback
          );
          
          productResults.push(productResult);
          
          if (productResult.success) {
            console.log(`[ANAF Import] Product ${i + 1} created successfully: ${productResult.productId}`);
          } else {
            console.error(`[ANAF Import] Failed to create product ${i + 1}: ${productResult.error}`);
          }
        } catch (productError: any) {
          console.error(`[ANAF Import] Error creating product ${i + 1}:`, productError.message);
          productResults.push({
            success: false,
            error: productError.message,
          });
        }
      }
      
      const successfulProducts = productResults.filter(r => r.success);
      const failedProducts = productResults.filter(r => !r.success);

      // Actualizează statusul la completed
      await updateANAFImportStatus(
        importId,
        'completed',
        gptParsingFailed ? 'Parsarea GPT a eșuat, dar produsul a fost creat cu date incomplete' : undefined,
        licitatieData
      );

      return NextResponse.json({
        success: true,
        importId,
        licitatieId: licitatie.id,
        productIds: successfulProducts.map(p => p.productId).filter(Boolean),
        productsCreated: successfulProducts.length,
        productsFailed: failedProducts.length,
        totalBunuri: bunuri.length,
        data: licitatieData,
        warning: gptParsingFailed || failedProducts.length > 0,
        needsManualInput: gptParsingFailed || failedProducts.length > 0,
        message: gptParsingFailed 
          ? `Import completat, dar parsarea GPT a eșuat. ${successfulProducts.length} produs(e) creat(e) cu date incomplete și pot fi completate manual.`
          : successfulProducts.length === bunuri.length
          ? `Import completat cu succes! ${successfulProducts.length} produs(e) creat(e) automat.`
          : `Import parțial: ${successfulProducts.length} din ${bunuri.length} produs(e) creat(e) cu succes. ${failedProducts.length} produs(e) au eșuat.`,
      });
    } catch (error: any) {
      console.error('[ANAF Import] Error during processing:', error);

      // Actualizează statusul la failed
      await updateANAFImportStatus(
        importId,
        'failed',
        error.message || 'Unknown error during processing'
      );

      return NextResponse.json(
        {
          success: false,
          importId,
          error: error.message || 'Failed to process ANAF import',
        },
        { status: 500 }
      );
    }
  } catch (error: any) {
    console.error('[ANAF Import] Fatal error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Failed to start ANAF import',
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/anaf/import
 * Obține statusul unui import sau lista de importuri
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const importId = searchParams.get('importId');
    const sourceType = searchParams.get('sourceType');
    const status = searchParams.get('status');
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');

    if (importId) {
      // Returnează un import specific
      const { getANAFImport } = await import('@/lib/anaf/db');
      const importRecord = await getANAFImport(importId);

      if (!importRecord) {
        return NextResponse.json(
          { error: 'Import not found' },
          { status: 404 }
        );
      }

      return NextResponse.json({
        success: true,
        data: importRecord,
      });
    }

    // Returnează lista de importuri
    const { getANAFImports } = await import('@/lib/anaf/db');
    const result = await getANAFImports({
      source_type: sourceType || undefined,
      status: status || undefined,
      limit,
      offset,
    });

    return NextResponse.json({
      success: true,
      data: result.data,
      count: result.count,
    });
  } catch (error: any) {
    console.error('[ANAF Import] Error fetching imports:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Failed to fetch imports',
      },
      { status: 500 }
    );
  }
}

