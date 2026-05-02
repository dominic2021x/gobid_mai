/**
 * API Route - Scraping Automat ANAF
 * POST /api/anaf/scrape
 * 
 * Extrage automat anunțuri ANAF de pe site și le procesează
 */

import { NextRequest, NextResponse } from 'next/server';
import { scrapeANAFPage, scrapeMultipleANAFPages, ANAFAnnouncement } from '@/lib/anaf/scraper';
import { getANAFImports, createANAFImport } from '@/lib/anaf/db';
import { createProductFromANAFAnnouncement } from '@/lib/anaf/productCreatorFromAnnouncement';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


export const runtime = 'nodejs';
export const maxDuration = 300; // 5 minute

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
      console.error('[ANAF Scrape] Error fetching scrape configs:', error);
      // Fallback la variabile de mediu
      return process.env.ANAF_SCRAPE_URLS?.split(',').filter(Boolean) || [];
    }

    if (data && data.length > 0) {
      return data.map((config: any) => config.url);
    }

    // Fallback la variabile de mediu
    return process.env.ANAF_SCRAPE_URLS?.split(',').filter(Boolean) || [];
  } catch (error) {
    console.error('[ANAF Scrape] Error getting scrape URLs:', error);
    // Fallback la variabile de mediu
    return process.env.ANAF_SCRAPE_URLS?.split(',').filter(Boolean) || [];
  }
}

/**
 * POST - Scrapează anunțuri noi de pe site-ul ANAF
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const { urls, autoImport = false, maxPages = 10 } = body;

    // Folosește URL-urile din request sau din baza de date
    const scrapeUrls = urls && Array.isArray(urls) && urls.length > 0
      ? urls
      : await getScrapeUrls();

    if (scrapeUrls.length === 0) {
      return NextResponse.json(
        { 
          error: 'No URLs provided. Set ANAF_SCRAPE_URLS in .env or provide urls in request body',
          success: false 
        },
        { status: 400 }
      );
    }

    console.log(`[ANAF Scrape API] 🔄 Starting scrape for ${scrapeUrls.length} URLs (max ${maxPages} pages per URL)...`);

    // Scrapează paginile (cu suport pentru paginare)
    const scrapeResult = await scrapeMultipleANAFPages(scrapeUrls, maxPages);

    if (!scrapeResult.success || scrapeResult.announcements.length === 0) {
      return NextResponse.json({
        success: false,
        message: 'No announcements found',
        result: scrapeResult,
      });
    }

    console.log(`[ANAF Scrape API] ✅ Found ${scrapeResult.announcements.length} announcements`);

    // Verifică care anunțuri sunt noi (nu au fost procesate deja)
    const recentImports = await getANAFImports({
      source_type: 'anaf',
      limit: 1000,
    });

    const processedUrls = new Set(
      recentImports.data.map(imp => imp.source_url)
    );

    const newAnnouncements = scrapeResult.announcements.filter(
      ann => !processedUrls.has(ann.url)
    );

    console.log(`[ANAF Scrape API] 📊 New announcements: ${newAnnouncements.length} / ${scrapeResult.announcements.length}`);

    // Dacă autoImport este activat, procesează automat anunțurile noi
    let importResults: any[] = [];
    
    if (autoImport && newAnnouncements.length > 0) {
      console.log(`[ANAF Scrape API] 🔄 Auto-importing ${newAnnouncements.length} new announcements...`);
      
      for (const announcement of newAnnouncements) {
        try {
          // Creează import record
          const importRecord = await createANAFImport({
            source_type: 'anaf',
            source_url: announcement.url,
            pdf_url: announcement.pdfUrl || undefined,
          });

          // Procesează anunțul (creează produs dacă este posibil)
          const importResult = await createProductFromANAFAnnouncement(
            importRecord.id,
            announcement
          );

          importResults.push({
            announcementId: announcement.id,
            url: announcement.url,
            success: importResult.success,
            productId: importResult.productId,
            error: importResult.error,
          });

          // Rate limiting
          if (newAnnouncements.length > 1) {
            await new Promise(resolve => setTimeout(resolve, 2000));
          }
        } catch (error: any) {
          console.error(`[ANAF Scrape API] ❌ Error importing announcement ${announcement.id}:`, error);
          importResults.push({
            announcementId: announcement.id,
            url: announcement.url,
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
      announcements: newAnnouncements.map(ann => ({
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
    console.error('[ANAF Scrape API] ❌ Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Failed to scrape ANAF announcements',
      },
      { status: 500 }
    );
  }
}

/**
 * GET - Returnează status-ul scraping-ului și configurația
 */
export async function GET(request: NextRequest) {
  try {
    const recentImports = await getANAFImports({
      source_type: 'anaf',
      limit: 100,
    });

    const scrapeUrls = await getScrapeUrls();

    return NextResponse.json({
      success: true,
      config: {
        scrapeUrls: scrapeUrls.length,
        urlsConfigured: scrapeUrls.length > 0,
      },
      recentImports: {
        count: recentImports.data.length,
        lastImport: recentImports.data[0]?.created_at || null,
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Failed to get scrape status',
      },
      { status: 500 }
    );
  }
}

