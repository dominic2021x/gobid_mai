/**
 * API Route - Run ANAF Scrape
 * POST /api/anaf/scrape-run
 * Rulează scraping-ul pentru URL-uri configurate
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { scrapeMultipleANAFPages, ANAFAnnouncement } from '@/lib/anaf/scraper';
import { scrapeANAFFormPage } from '@/lib/anaf/scraperForm';
import { getANAFImports, createANAFImport } from '@/lib/anaf/db';
import { createProductFromANAFAnnouncement } from '@/lib/anaf/productCreatorFromAnnouncement';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


export const runtime = 'nodejs';
export const maxDuration = 300; // 5 minute

/**
 * POST - Rulează scraping-ul pentru URL-uri configurate
 */
export async function POST(request: NextRequest) {
  try {
    if (!supabaseAdmin) {
      return NextResponse.json(
        { error: 'Supabase admin client not configured' },
        { status: 500 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const { configId, autoImport = true } = body;

    // Obține URL-urile configurate
    let query = supabaseAdmin
      .from('anaf_scrape_config')
      .select('*')
      .eq('enabled', true);

    if (configId) {
      query = query.eq('id', configId);
    }

    const { data: configs, error: configError } = await query;

    if (configError) {
      console.error('[ANAF Scrape Run] Error fetching configs:', configError);
      return NextResponse.json(
        { error: configError.message },
        { status: 500 }
      );
    }

    if (!configs || configs.length === 0) {
      return NextResponse.json(
        { error: 'No enabled scrape URLs configured' },
        { status: 400 }
      );
    }

    const urls = configs.map((config: any) => config.url);
    // Folosește maxPages din body sau din config, dar default 10000 pentru a scana toate paginile
    const maxPages = body.maxPages || configs[0]?.max_pages || 10000;

    console.log(`[ANAF Scrape Run] 🔄 Starting scrape for ${urls.length} URLs...`);

    // Verifică dacă este URL de formular ANAF
    const isFormUrl = (url: string) => 
      url.includes('valorif_licitati_bunuri_sechestrate') || 
      url.includes('anunturi_anaf') ||
      url.includes('valorificare');

    let scrapeResult: any;

    // Dacă este URL de formular, folosește scraper-ul de formular
    if (urls.some(isFormUrl)) {
      console.log(`[ANAF Scrape Run] 🔄 Detected form URL, using form scraper...`);
      const formUrl = urls.find(isFormUrl) || urls[0];
      
      try {
        scrapeResult = await scrapeANAFFormPage(
          formUrl,
          'Toate județele',
          'Toate categoriile',
          maxPages
        );
        console.log(`[ANAF Scrape Run] ✅ Form scraper completed: ${scrapeResult.announcements?.length || 0} announcements`);
      } catch (formError: any) {
        console.error('[ANAF Scrape Run] ❌ Form scraper error:', formError);
        console.error('[ANAF Scrape Run] Form scraper stack:', formError.stack);
        throw new Error(`Form scraper failed: ${formError.message}`);
      }
    } else {
      // Altfel, folosește scraper-ul normal
      console.log(`[ANAF Scrape Run] 🔄 Using normal scraper...`);
      try {
        scrapeResult = await scrapeMultipleANAFPages(urls, maxPages);
        console.log(`[ANAF Scrape Run] ✅ Normal scraper completed: ${scrapeResult?.announcements?.length || 0} announcements`);
      } catch (normalError: any) {
        console.error('[ANAF Scrape Run] ❌ Normal scraper error:', normalError);
        console.error('[ANAF Scrape Run] Normal scraper stack:', normalError.stack);
        throw new Error(`Normal scraper failed: ${normalError.message}`);
      }
    }

    // Verifică dacă scraping-ul a reușit
    if (!scrapeResult) {
      console.error('[ANAF Scrape Run] ❌ Scrape result is null or undefined');
      return NextResponse.json({
        success: false,
        error: 'Scrape result is null or undefined',
        message: 'Scraping failed - no result returned',
      }, { status: 500 });
    }

    console.log(`[ANAF Scrape Run] 📊 Scrape result:`, {
      success: scrapeResult.success,
      announcementsCount: scrapeResult.announcements?.length || 0,
      errors: scrapeResult.errors?.length || 0,
    });

    if (!scrapeResult.success) {
      console.error('[ANAF Scrape Run] ❌ Scraping failed:', scrapeResult.errors);
      return NextResponse.json({
        success: false,
        error: scrapeResult.errors?.join(', ') || 'Scraping failed',
        message: 'No announcements found or scraping failed',
        result: scrapeResult,
      });
    }

    if (!scrapeResult.announcements || scrapeResult.announcements.length === 0) {
      console.warn('[ANAF Scrape Run] ⚠️ No announcements found in result');
      return NextResponse.json({
        success: false,
        message: 'No announcements found',
        result: scrapeResult,
        errors: scrapeResult.errors,
      });
    }

    console.log(`[ANAF Scrape Run] ✅ Found ${scrapeResult.announcements.length} announcements`);

    // Verifică care anunțuri sunt noi - verifică TOATE importurile pentru a evita duplicatele
    const allImports = await getANAFImports({
      source_type: 'anaf',
      limit: 10000, // Verifică până la 10000 importuri
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
    
    console.log(`[ANAF Scrape Run] 📊 Checking against ${allImports.data.length} existing imports to avoid duplicates`);

    // Filtrează anunțurile noi - verifică atât URL-ul anunțului cât și PDF-ul
    const newAnnouncements = scrapeResult.announcements.filter(
      (ann: ANAFAnnouncement) => {
        // Verifică dacă URL-ul anunțului sau PDF-ul nu au fost deja procesate
        const isNew = !processedUrls.has(ann.url) && 
                      (!ann.pdfUrl || !processedUrls.has(ann.pdfUrl));
        if (!isNew) {
          console.log(`[ANAF Scrape Run] ⏭️ Skipping already processed: ${ann.url} or ${ann.pdfUrl}`);
        }
        return isNew;
      }
    );

    console.log(`[ANAF Scrape Run] 📊 New announcements: ${newAnnouncements.length} / ${scrapeResult.announcements.length}`);

    // Actualizează last_scraped_at pentru configs
    for (const config of configs) {
      await supabaseAdmin
        .from('anaf_scrape_config')
        .update({
          last_scraped_at: new Date().toISOString(),
          last_scraped_count: scrapeResult.announcements.length,
        })
        .eq('id', config.id);
    }

    // Dacă autoImport este activat, procesează automat PDF-urile prin /api/anaf/import (același flux ca importul manual)
    let importResults: any[] = [];
    
    if (autoImport && newAnnouncements.length > 0) {
      console.log(`[ANAF Scrape Run] 🔄 Auto-importing ${newAnnouncements.length} PDFs through /api/anaf/import (same flow as manual import)...`);
      
      // Filtrează doar anunțurile cu PDF-uri
      const pdfAnnouncements = newAnnouncements.filter((ann: ANAFAnnouncement) => ann.pdfUrl);
      console.log(`[ANAF Scrape Run] 📄 Found ${pdfAnnouncements.length} PDFs to import`);
      
      for (let i = 0; i < pdfAnnouncements.length; i++) {
        const announcement = pdfAnnouncements[i];
        const pdfUrl = announcement.pdfUrl!;
        
        try {
          console.log(`[ANAF Scrape Run] 📄 Importing PDF ${i + 1}/${pdfAnnouncements.length}: ${pdfUrl.substring(0, 80)}...`);
          
          // Apelează endpoint-ul de import (același flux ca importul manual)
          const importResponse = await fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/anaf/import`, {
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

          importResults.push({
            announcementId: announcement.id,
            url: pdfUrl,
            success: importResult.success !== false,
            importId: importResult.importId,
            productId: importResult.productId,
            error: importResult.error,
          });

          console.log(`[ANAF Scrape Run] ✅ Imported PDF ${i + 1}/${pdfAnnouncements.length}`);

          // Rate limiting între importuri
          if (i < pdfAnnouncements.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 3000));
          }
        } catch (error: any) {
          console.error(`[ANAF Scrape Run] ❌ Error importing PDF ${i + 1}:`, error.message);
          importResults.push({
            announcementId: announcement.id,
            url: pdfUrl,
            success: false,
            error: error.message,
          });
        }
      }
    }

    return NextResponse.json({
      success: true,
      message: `Found ${scrapeResult.announcements.length} announcements, ${newAnnouncements.length} new`,
      scrapeResult: {
        totalFound: scrapeResult.announcements.length,
        newCount: newAnnouncements.length,
        alreadyProcessed: scrapeResult.announcements.length - newAnnouncements.length,
      },
      announcements: newAnnouncements.map((ann: ANAFAnnouncement) => ({
        id: ann.id,
        title: ann.title,
        url: ann.url,
        imagesCount: ann.images.length,
        hasPdf: !!ann.pdfUrl,
        price: ann.price,
        category: ann.category,
        location: ann.location,
      })),
      importResults: autoImport ? importResults : undefined,
      errors: scrapeResult.errors,
    });
  } catch (error: any) {
    console.error('[ANAF Scrape Run] ❌ Error:', error);
    console.error('[ANAF Scrape Run] Error stack:', error.stack);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Failed to run scrape',
        details: process.env.NODE_ENV === 'development' ? error.stack : undefined,
      },
      { status: 500 }
    );
  }
}

