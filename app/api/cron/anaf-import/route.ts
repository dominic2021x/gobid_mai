/**
 * CRON Job - Import Automat ANAF
 * GET /api/cron/anaf-import
 * 
 * Rulează automat importul de licitații ANAF o dată la 6 ore
 * Poate fi configurat în Vercel Cron Jobs sau alte servicii de scheduling
 */

import { NextRequest, NextResponse } from 'next/server';
import { getANAFImports, createANAFImport } from '@/lib/anaf/db';
import { extractTextFromPDFUrl } from '@/lib/anaf/pdfExtractor';
import { parseANAFPDFWithGPT } from '@/lib/anaf/gptParser';
import {
  updateANAFImportStatus,
  saveANAFlicitatie,
} from '@/lib/anaf/db';
import { createProductFromANAFBun } from '@/lib/anaf/productCreator';
import { scrapeMultipleANAFPages } from '@/lib/anaf/scraper';
import { createProductFromANAFAnnouncement } from '@/lib/anaf/productCreatorFromAnnouncement';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


export const maxDuration = 300; // 5 minutes pentru procesare în batch

/**
 * Obține URL-urile configurate din baza de date
 */
async function getScrapeUrls(): Promise<string[]> {
  try {
    const { supabaseAdmin } = await import('@/lib/supabase');
    
    if (!supabaseAdmin) {
      // Fallback la variabile de mediu
      return process.env.ANAF_SCRAPE_URLS?.split(',').filter(Boolean) || [];
    }

    const { data, error } = await supabaseAdmin
      .from('anaf_scrape_config')
      .select('url, max_pages')
      .eq('enabled', true);

    if (error) {
      console.error('[ANAF Cron] Error fetching scrape configs:', error);
      // Fallback la variabile de mediu
      return process.env.ANAF_SCRAPE_URLS?.split(',').filter(Boolean) || [];
    }

    if (data && data.length > 0) {
      return data.map((config: any) => config.url);
    }

    // Fallback la variabile de mediu
    return process.env.ANAF_SCRAPE_URLS?.split(',').filter(Boolean) || [];
  } catch (error) {
    console.error('[ANAF Cron] Error getting scrape URLs:', error);
    // Fallback la variabile de mediu
    return process.env.ANAF_SCRAPE_URLS?.split(',').filter(Boolean) || [];
  }
}

/**
 * Funcție helper pentru a extrage URL-uri PDF dintr-o pagină HTML
 */
async function extractPDFUrlsFromPage(pageUrl: string): Promise<string[]> {
  try {
    const response = await fetch(pageUrl);
    const html = await response.text();
    
    // Regex pentru a găsi link-uri către PDF-uri
    const pdfRegex = /https?:\/\/[^\s"<>]+\.pdf/gi;
    const matches = html.match(pdfRegex);
    
    return matches ? [...new Set(matches)] : [];
  } catch (error) {
    console.error(`Error extracting PDF URLs from ${pageUrl}:`, error);
    return [];
  }
}

/**
 * Procesează un import ANAF
 */
async function processANAFImport(pdfUrl: string): Promise<{
  success: boolean;
  licitatieId?: string;
  productId?: string;
  error?: string;
}> {
  try {
    // Creează import
    const importRecord = await createANAFImport({
      source_type: 'anaf',
      source_url: pdfUrl,
      pdf_url: pdfUrl,
    });

    const importId = importRecord.id;

    try {
      await updateANAFImportStatus(importId, 'processing');

      // Extrage text din PDF
      const pdfExtraction = await extractTextFromPDFUrl(pdfUrl);

      if (!pdfExtraction.text || pdfExtraction.text.trim().length === 0) {
        throw new Error('PDF extraction returned empty text');
      }

      // Parsează cu GPT
      const licitatieData = await parseANAFPDFWithGPT(pdfExtraction.text);

      // Salvează licitația
      const licitatie = await saveANAFlicitatie(
        importId,
        licitatieData,
        pdfUrl
      );

      // Creează produse pentru fiecare bun
      const bunuri = licitatieData.bunuri || [];
      const productIds: string[] = [];
      
      for (let i = 0; i < bunuri.length; i++) {
        const bun = bunuri[i];
        const productResult = await createProductFromANAFBun(
          licitatie.id,
          bun,
          licitatieData,
          pdfUrl,
          i + 1,
          bunuri.length
        );
        
        if (productResult.success && productResult.productId) {
          productIds.push(productResult.productId);
        }
      }

      await updateANAFImportStatus(importId, 'completed', undefined, licitatieData);

      return {
        success: true,
        licitatieId: licitatie.id,
        productId: productIds[0] || undefined, // Pentru backwards compatibility
      };
    } catch (error: any) {
      await updateANAFImportStatus(
        importId,
        'failed',
        error.message || 'Unknown error during processing'
      );

      return {
        success: false,
        error: error.message,
      };
    }
  } catch (error: any) {
    return {
      success: false,
      error: error.message,
    };
  }
}

export async function GET(request: NextRequest) {
  try {
    // Verifică dacă este un request valid de la CRON (opțional: adaugă autentificare)
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;

    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    console.log('[ANAF Cron] Starting automatic import...');

    // Obține TOATE importurile pentru a evita duplicatele (nu doar cele recente)
    // Verifică atât source_url cât și pdf_url pentru a evita duplicatele
    const allImports = await getANAFImports({
      source_type: 'anaf',
      limit: 10000, // Verifică până la 10000 importuri pentru a evita duplicatele
    });

    // Creează un Set cu toate URL-urile procesate (atât source_url cât și pdf_url)
    const processedUrls = new Set<string>();
    for (const imp of allImports.data) {
      if (imp.source_url) {
        processedUrls.add(imp.source_url);
      }
      if (imp.pdf_url) {
        processedUrls.add(imp.pdf_url);
      }
    }
    
    console.log(`[ANAF Cron] 📊 Checking against ${allImports.data.length} existing imports to avoid duplicates`);

    const results = {
      total: 0,
      success: 0,
      failed: 0,
      errors: [] as string[],
      scraped: 0,
      pdfs: 0,
    };

    // PASUL 1: Scrapează anunțuri noi folosind scraping automat (form scraper + auto import)
    const { supabaseAdmin } = await import('@/lib/supabase');
    const { scrapeANAFFormPage } = await import('@/lib/anaf/scraperForm');
    
    if (!supabaseAdmin) {
      console.error('[ANAF Cron] ❌ Supabase admin not configured');
      return NextResponse.json(
        { error: 'Database not configured' },
        { status: 500 }
      );
    }

    // Obține configurările de scraping
    const { data: configs, error: configError } = await supabaseAdmin
      .from('anaf_scrape_config')
      .select('*')
      .eq('enabled', true);

    if (configError) {
      console.error('[ANAF Cron] Error fetching scrape configs:', configError);
    }

    if (configs && configs.length > 0) {
      console.log(`[ANAF Cron] 🔄 Step 1: Scraping ${configs.length} ANAF URLs with form scraper...`);
      
      for (const config of configs) {
        try {
          const maxPages = config.max_pages || 10000; // Scanează toate paginile
          
          console.log(`[ANAF Cron] 🔄 Scraping URL: ${config.url} (max ${maxPages} pages)...`);
          
          // Verifică dacă este URL de formular
          const isFormUrl = config.url.includes('valorif_licitati_bunuri_sechestrate') || 
                           config.url.includes('anunturi_anaf') ||
                           config.url.includes('valorificare');
          
          let scrapeResult: any;
          
          if (isFormUrl) {
            // Folosește form scraper
            scrapeResult = await scrapeANAFFormPage(
              config.url,
              'Toate județele',
              'Toate categoriile',
              maxPages
            );
          } else {
            // Folosește scraper normal
            const { scrapeMultipleANAFPages } = await import('@/lib/anaf/scraper');
            scrapeResult = await scrapeMultipleANAFPages([config.url], maxPages);
          }
          
          if (scrapeResult.success && scrapeResult.announcements.length > 0) {
            console.log(`[ANAF Cron] ✅ Found ${scrapeResult.announcements.length} announcements from ${config.url}`);
            
            // Filtrează anunțurile noi (doar cele cu PDF-uri)
            const newPdfAnnouncements = scrapeResult.announcements.filter(
              (ann: any) => ann.pdfUrl && !processedUrls.has(ann.pdfUrl)
            );
            
            console.log(`[ANAF Cron] 📊 New PDF announcements: ${newPdfAnnouncements.length}`);
            results.scraped += newPdfAnnouncements.length;

            // Importează automat fiecare PDF prin /api/anaf/import (același flux ca importul manual)
            const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL 
              ? `https://${process.env.VERCEL_URL}` 
              : 'http://localhost:3000';
            
            for (let i = 0; i < newPdfAnnouncements.length; i++) {
              const announcement = newPdfAnnouncements[i];
              const pdfUrl = announcement.pdfUrl!;
              
              try {
                console.log(`[ANAF Cron] 📄 Importing PDF ${i + 1}/${newPdfAnnouncements.length}: ${pdfUrl.substring(0, 80)}...`);
                
                // Apelează endpoint-ul de import (același flux ca importul manual)
                const importResponse = await fetch(`${baseUrl}/api/anaf/import`, {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                  },
                  body: JSON.stringify({
                    pdfUrl: pdfUrl,
                    sourceType: 'anaf',
                  }),
                });

                if (!importResponse.ok) {
                  const errorText = await importResponse.text().catch(() => 'Unknown error');
                  throw new Error(`HTTP ${importResponse.status}: ${errorText.substring(0, 200)}`);
                }

                const importResult = await importResponse.json();

                if (importResult.success !== false) {
                  results.success++;
                  processedUrls.add(pdfUrl); // Marchează ca procesat
                  console.log(`[ANAF Cron] ✅ Successfully imported PDF ${i + 1}/${newPdfAnnouncements.length}`);
                } else {
                  results.failed++;
                  results.errors.push(`${pdfUrl}: ${importResult.error || 'Import failed'}`);
                  console.error(`[ANAF Cron] ❌ Failed to import ${pdfUrl}: ${importResult.error}`);
                }

                // Rate limiting între importuri
                if (i < newPdfAnnouncements.length - 1) {
                  await new Promise(resolve => setTimeout(resolve, 3000));
                }
              } catch (error: any) {
                results.failed++;
                results.errors.push(`${pdfUrl}: ${error.message}`);
                console.error(`[ANAF Cron] ❌ Error importing PDF ${i + 1}:`, error.message);
              }
            }
            
            // Actualizează last_scraped_at
            await supabaseAdmin
              .from('anaf_scrape_config')
              .update({
                last_scraped_at: new Date().toISOString(),
                last_scraped_count: scrapeResult.announcements.length,
              })
              .eq('id', config.id);
          } else {
            console.log(`[ANAF Cron] ⚠️ No announcements found for ${config.url}`);
          }
        } catch (error: any) {
          console.error(`[ANAF Cron] ❌ Error scraping ${config.url}:`, error.message);
          results.errors.push(`Scraping ${config.url}: ${error.message}`);
        }
      }
    } else {
      console.log('[ANAF Cron] ⚠️ No enabled scrape URLs configured');
    }

    // PASUL 2: Colectează URL-uri PDF noi din variabile de mediu (pentru backwards compatibility)
    // Doar dacă nu există configs în baza de date
    const envUrls = process.env.ANAF_SCRAPE_URLS?.split(',').filter(Boolean) || [];
    
    if (envUrls.length > 0 && (!configs || configs.length === 0)) {
      console.log(`[ANAF Cron] 🔄 Step 2: Extracting PDF URLs from env URLs (backwards compatibility)...`);
      const newPdfUrls: string[] = [];

      for (const monitorUrl of envUrls) {
        try {
          const pdfUrls = await extractPDFUrlsFromPage(monitorUrl);
          for (const pdfUrl of pdfUrls) {
            if (!processedUrls.has(pdfUrl)) {
              newPdfUrls.push(pdfUrl);
            }
          }
        } catch (error: any) {
          console.error(`[ANAF Cron] ⚠️ Error extracting PDFs from ${monitorUrl}:`, error.message);
        }
      }

      console.log(`[ANAF Cron] Found ${newPdfUrls.length} new PDFs to process from env URLs`);
      results.pdfs = newPdfUrls.length;

      // Procesează fiecare PDF prin /api/anaf/import
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL 
        ? `https://${process.env.VERCEL_URL}` 
        : 'http://localhost:3000';

      for (let i = 0; i < newPdfUrls.length; i++) {
        const pdfUrl = newPdfUrls[i];
        
        try {
          const importResponse = await fetch(`${baseUrl}/api/anaf/import`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              pdfUrl: pdfUrl,
              sourceType: 'anaf',
            }),
          });

          if (!importResponse.ok) {
            const errorText = await importResponse.text().catch(() => 'Unknown error');
            throw new Error(`HTTP ${importResponse.status}: ${errorText.substring(0, 200)}`);
          }

          const importResult = await importResponse.json();

          if (importResult.success !== false) {
            results.success++;
            processedUrls.add(pdfUrl);
            console.log(`[ANAF Cron] ✅ Successfully imported: ${pdfUrl}`);
          } else {
            results.failed++;
            results.errors.push(`${pdfUrl}: ${importResult.error || 'Import failed'}`);
            console.error(`[ANAF Cron] Failed to import ${pdfUrl}: ${importResult.error}`);
          }

          // Rate limiting
          if (i < newPdfUrls.length - 1) {
            await new Promise((resolve) => setTimeout(resolve, 3000));
          }
        } catch (error: any) {
          results.failed++;
          results.errors.push(`${pdfUrl}: ${error.message}`);
          console.error(`[ANAF Cron] ❌ Error importing ${pdfUrl}:`, error.message);
        }
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Cron job completed',
      results,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('[ANAF Cron] Fatal error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Failed to run cron job',
      },
      { status: 500 }
    );
  }
}

