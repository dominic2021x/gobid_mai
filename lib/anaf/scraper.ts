/**
 * ANAF Scraper - Extrage automat anunțuri ANAF de pe site
 * 
 * Funcționalități:
 * - Extrage anunțuri noi de pe paginile ANAF
 * - Descarcă pozele disponibile
 * - Extrage informațiile despre licitații (titlu, descriere, preț, etc.)
 * - Integrează cu sistemul existent de import
 */

import * as cheerio from 'cheerio';

export interface ANAFAnnouncement {
  id: string; // ID-ul anunțului (din URL sau hash)
  title: string;
  description: string;
  url: string; // URL-ul complet către anunț
  images: string[]; // URL-uri către poze
  pdfUrl?: string; // URL către PDF (dacă există)
  price?: number;
  category?: string;
  location?: string;
  date?: string;
  extractedAt: string; // Timestamp când a fost extras
  rawData?: any; // Date brute pentru debugging
}

export interface ScrapeResult {
  success: boolean;
  announcements: ANAFAnnouncement[];
  totalFound: number;
  errors?: string[];
}

/**
 * Detectează link-urile către paginile următoare (paginare)
 */
function detectPaginationLinks($: ReturnType<typeof cheerio.load>, baseUrl: string): string[] {
  const paginationUrls: string[] = [];
  
  // Selectori comuni pentru paginare
  const paginationSelectors = [
    '.pagination a',
    '.pager a',
    '[class*="pagination"] a',
    '[class*="pager"] a',
    '.page-numbers a',
    'a[rel="next"]',
    'a[aria-label*="next"]',
    'a[aria-label*="Next"]',
    'a:contains("Următor")',
    'a:contains("Next")',
    'a:contains(">")',
  ];

  for (const selector of paginationSelectors) {
    try {
      const links = $(selector);
      if (links.length > 0) {
        links.each((_, element) => {
          const href = $(element).attr('href');
          const text = $(element).text().trim().toLowerCase();
          
          // Verifică dacă este link către pagină următoare
          if (href && (
            text.includes('următor') || 
            text.includes('next') || 
            text === '>' ||
            href.includes('page=') ||
            href.includes('pagina=') ||
            $(element).attr('rel') === 'next'
          )) {
            const fullUrl = href.startsWith('http') 
              ? href 
              : new URL(href, baseUrl).toString();
            
            if (!paginationUrls.includes(fullUrl)) {
              paginationUrls.push(fullUrl);
            }
          }
        });
        
        if (paginationUrls.length > 0) {
          break; // Folosim primul selector care găsește link-uri
        }
      }
    } catch (error) {
      // Continuă cu următorul selector
    }
  }

  // Dacă nu găsește link-uri specifice, încearcă să detecteze pattern-uri de paginare în URL
  // (ex: page=2, pagina=2, p=2, etc.)
  const urlPatterns = [
    /page=(\d+)/i,
    /pagina=(\d+)/i,
    /p=(\d+)/i,
    /\/page\/(\d+)/i,
    /\/pagina\/(\d+)/i,
  ];

  for (const pattern of urlPatterns) {
    const match = baseUrl.match(pattern);
    if (match) {
      const currentPage = parseInt(match[1], 10);
      const nextPage = currentPage + 1;
      const nextUrl = baseUrl.replace(pattern, `page=${nextPage}`);
      if (!paginationUrls.includes(nextUrl)) {
        paginationUrls.push(nextUrl);
      }
    }
  }

  return paginationUrls;
}

/**
 * Extrage anunțuri de pe o singură pagină ANAF (fără paginare)
 * @param pageUrl URL-ul paginii de listare ANAF
 * @returns Lista de anunțuri găsite pe această pagină
 */
async function scrapeSinglePage(pageUrl: string): Promise<{ announcements: ANAFAnnouncement[]; errors: string[]; $: ReturnType<typeof cheerio.load> }> {
  const errors: string[] = [];
  const announcements: ANAFAnnouncement[] = [];

  try {
    console.log(`[ANAF Scraper] 🔄 Scraping page: ${pageUrl}`);
    
    // Descarcă pagina
    const response = await fetch(pageUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'ro-RO,ro;q=0.9,en-US;q=0.8,en;q=0.7',
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const html = await response.text();
    const $ = cheerio.load(html);

    // Caută anunțurile în pagină
    // Structura poate varia - ajustează selectorii în funcție de structura reală a site-ului ANAF
    const announcementSelectors = [
      '.anunt-item',
      '.licitatie-item',
      '.announcement',
      '[class*="anunt"]',
      '[class*="licitatie"]',
      'article',
      '.card',
      '.item',
    ];

    let foundItems = false;

    for (const selector of announcementSelectors) {
      const items = $(selector);
      
      if (items.length > 0) {
        console.log(`[ANAF Scraper] ✅ Found ${items.length} items with selector: ${selector}`);
        foundItems = true;

        items.each((index, element) => {
          try {
            const $item = $(element);
            const announcement = extractAnnouncementFromElement($item, pageUrl, $);
            
            if (announcement) {
              announcements.push(announcement);
            }
          } catch (error: any) {
            errors.push(`Error extracting item ${index}: ${error.message}`);
            console.error(`[ANAF Scraper] ❌ Error extracting item ${index}:`, error);
          }
        });

        break; // Folosim primul selector care găsește elemente
      }
    }

    if (!foundItems) {
      // Încearcă să extragă link-uri directe către anunțuri
      console.log(`[ANAF Scraper] ⚠️ No items found with standard selectors, trying link extraction...`);
      
      const links = $('a[href*="licitatie"], a[href*="anunt"], a[href*="anaf"]');
      
      links.each((index, element) => {
        try {
          const $link = $(element);
          const href = $link.attr('href');
          const text = $link.text().trim();
          
          if (href && text && text.length > 10) {
            // Construiește URL complet
            const fullUrl = href.startsWith('http') 
              ? href 
              : new URL(href, pageUrl).toString();
            
            const announcement: ANAFAnnouncement = {
              id: generateIdFromUrl(fullUrl),
              title: text,
              description: text,
              url: fullUrl,
              images: [],
              extractedAt: new Date().toISOString(),
            };
            
            announcements.push(announcement);
          }
        } catch (error: any) {
          errors.push(`Error extracting link ${index}: ${error.message}`);
        }
      });
    }

    // Extrage pozele din pagină (dacă există)
    for (let index = 0; index < announcements.length; index++) {
      try {
        const images = await extractImagesFromPage($, announcements[index].url);
        announcements[index].images = images;
      } catch (error: any) {
        console.error(`[ANAF Scraper] ⚠️ Error extracting images for announcement ${index}:`, error.message);
      }
    }

    console.log(`[ANAF Scraper] ✅ Extracted ${announcements.length} announcements from ${pageUrl}`);

    return {
      announcements,
      errors,
      $,
    };
  } catch (error: any) {
    console.error(`[ANAF Scraper] ❌ Error scraping ${pageUrl}:`, error);
    return {
      announcements: [],
      errors: [error.message || 'Unknown error'],
      $: cheerio.load(''),
    };
  }
}

/**
 * Extrage anunțuri de pe o pagină ANAF cu suport pentru paginare
 * @param pageUrl URL-ul paginii de listare ANAF
 * @param maxPages Numărul maxim de pagini de parcurs (default: 10)
 * @returns Lista de anunțuri găsite
 */
export async function scrapeANAFPage(pageUrl: string, maxPages: number = 10): Promise<ScrapeResult> {
  const allAnnouncements: ANAFAnnouncement[] = [];
  const allErrors: string[] = [];
  const visitedUrls = new Set<string>([pageUrl]);

  try {
    // Scrapează prima pagină
    console.log(`[ANAF Scraper] 🔄 Scraping page 1: ${pageUrl}`);
    const firstPageResult = await scrapeSinglePage(pageUrl);
    
    allAnnouncements.push(...firstPageResult.announcements);
    allErrors.push(...firstPageResult.errors);

    // Detectează paginare
    const paginationUrls = detectPaginationLinks(firstPageResult.$, pageUrl);
    
    if (paginationUrls.length > 0 && maxPages > 1) {
      console.log(`[ANAF Scraper] 📄 Found ${paginationUrls.length} pagination links, scraping next pages (max ${maxPages - 1} more)...`);
      
      // Parcurge paginile următoare
      for (let i = 0; i < Math.min(paginationUrls.length, maxPages - 1); i++) {
        const nextPageUrl = paginationUrls[i];
        
        // Evită duplicatele și loop-urile
        if (visitedUrls.has(nextPageUrl)) {
          console.log(`[ANAF Scraper] ⚠️ Skipping already visited URL: ${nextPageUrl}`);
          continue;
        }
        
        visitedUrls.add(nextPageUrl);
        
        try {
          console.log(`[ANAF Scraper] 🔄 Scraping page ${i + 2}: ${nextPageUrl}`);
          
          // Rate limiting între pagini
          await new Promise(resolve => setTimeout(resolve, 1000));
          
          const nextPageResult = await scrapeSinglePage(nextPageUrl);
          
          if (nextPageResult.announcements.length > 0) {
            // Elimină duplicatele (după URL)
            const newAnnouncements = nextPageResult.announcements.filter(
              ann => !allAnnouncements.some(existing => existing.url === ann.url)
            );
            
            allAnnouncements.push(...newAnnouncements);
            console.log(`[ANAF Scraper] ✅ Added ${newAnnouncements.length} new announcements from page ${i + 2} (total: ${allAnnouncements.length})`);
          }
          
          if (nextPageResult.errors.length > 0) {
            allErrors.push(...nextPageResult.errors);
          }

          // Detectează paginare și pe pagina curentă (pentru paginare dinamică)
          const nextPaginationUrls = detectPaginationLinks(nextPageResult.$, nextPageUrl);
          if (nextPaginationUrls.length > 0 && i < paginationUrls.length - 1) {
            // Adaugă link-urile noi la coadă (dacă nu sunt deja acolo)
            nextPaginationUrls.forEach(url => {
              if (!visitedUrls.has(url) && !paginationUrls.includes(url)) {
                paginationUrls.push(url);
              }
            });
          }
        } catch (error: any) {
          allErrors.push(`Error scraping page ${i + 2} (${nextPageUrl}): ${error.message}`);
          console.error(`[ANAF Scraper] ❌ Error scraping page ${i + 2}:`, error);
        }
      }
    }

    console.log(`[ANAF Scraper] ✅ Total extracted: ${allAnnouncements.length} unique announcements from ${visitedUrls.size} pages`);

    return {
      success: allAnnouncements.length > 0,
      announcements: allAnnouncements,
      totalFound: allAnnouncements.length,
      errors: allErrors.length > 0 ? allErrors : undefined,
    };
  } catch (error: any) {
    console.error(`[ANAF Scraper] ❌ Error scraping ${pageUrl}:`, error);
    return {
      success: false,
      announcements: allAnnouncements,
      totalFound: allAnnouncements.length,
      errors: [...allErrors, error.message || 'Unknown error'],
    };
  }
}

/**
 * Extrage informații dintr-un element HTML de anunț
 */
function extractAnnouncementFromElement($item: any, baseUrl: string, $: ReturnType<typeof cheerio.load>): ANAFAnnouncement | null {
  try {
    // Extrage titlul
    const title = $item.find('h1, h2, h3, .title, [class*="title"]').first().text().trim() ||
                  $item.find('a').first().text().trim() ||
                  $item.text().trim().substring(0, 100);

    if (!title || title.length < 5) {
      return null;
    }

    // Extrage link-ul
    const link = $item.find('a').first().attr('href');
    const url = link 
      ? (link.startsWith('http') ? link : new URL(link, baseUrl).toString())
      : baseUrl;

    // Extrage descrierea
    const description = $item.find('.description, [class*="desc"], p').first().text().trim() ||
                        $item.text().trim().substring(0, 500);

    // Extrage prețul
    const priceText = $item.find('.price, [class*="pret"], [class*="price"]').first().text().trim();
    const price = extractPriceFromText(priceText);

    // Extrage categoria
    const category = $item.find('.category, [class*="categ"]').first().text().trim();

    // Extrage locația
    const location = $item.find('.location, [class*="locat"]').first().text().trim();

    // Extrage data
    const dateText = $item.find('.date, [class*="data"], time').first().text().trim() ||
                     $item.find('time').attr('datetime') || undefined;

    // Extrage link-ul către PDF
    const pdfLink = $item.find('a[href*=".pdf"]').first().attr('href');
    const pdfUrl = pdfLink 
      ? (pdfLink.startsWith('http') ? pdfLink : new URL(pdfLink, baseUrl).toString())
      : undefined;

    // Extrage pozele
    const images: string[] = [];
    $item.find('img').each((_: number, img: cheerio.Element) => {
      const $imgElement = $(img);
      const src = $imgElement.attr('src') || $imgElement.attr('data-src');
      if (src) {
        const imageUrl = src.startsWith('http') ? src : new URL(src, baseUrl).toString();
        images.push(imageUrl);
      }
    });

    return {
      id: generateIdFromUrl(url),
      title,
      description,
      url,
      images,
      pdfUrl,
      price,
      category,
      location,
      date: dateText || undefined,
      extractedAt: new Date().toISOString(),
    };
  } catch (error: any) {
    console.error('[ANAF Scraper] Error extracting announcement:', error);
    return null;
  }
}

/**
 * Extrage pozele dintr-o pagină de anunț
 */
async function extractImagesFromPage($: ReturnType<typeof cheerio.load>, pageUrl: string): Promise<string[]> {
  const images: string[] = [];

  try {
    // Descarcă pagina anunțului pentru a extrage pozele
    const response = await fetch(pageUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });

    if (response.ok) {
      const html = await response.text();
      const $page = cheerio.load(html);

      $page('img').each((_, img) => {
        const src = $page(img).attr('src') || $page(img).attr('data-src');
        if (src && !src.includes('logo') && !src.includes('icon')) {
          const imageUrl = src.startsWith('http') 
            ? src 
            : new URL(src, pageUrl).toString();
          images.push(imageUrl);
        }
      });
    }
  } catch (error: any) {
    console.error(`[ANAF Scraper] Error extracting images from ${pageUrl}:`, error.message);
  }

  return images;
}

/**
 * Extrage prețul dintr-un text
 */
function extractPriceFromText(text: string): number | undefined {
  if (!text) return undefined;

  // Caută pattern-uri de preț (ex: "10.000 Lei", "10000 lei", etc.)
  const priceRegex = /(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2})?)\s*(?:RON|lei|EUR|euro)/i;
  const match = text.match(priceRegex);
  
  if (match) {
    const priceStr = match[1].replace(/[.,]/g, '');
    const price = parseInt(priceStr, 10);
    return isNaN(price) ? undefined : price;
  }

  return undefined;
}

/**
 * Generează un ID unic dintr-un URL
 */
function generateIdFromUrl(url: string): string {
  // Folosește hash-ul URL-ului ca ID
  const hash = url.split('').reduce((acc, char) => {
    acc = ((acc << 5) - acc) + char.charCodeAt(0);
    return acc & acc;
  }, 0);
  
  return `anaf_${Math.abs(hash).toString(36)}`;
}

/**
 * Scrapează multiple pagini ANAF
 * @param urls Lista de URL-uri de bază
 * @param maxPagesPerUrl Numărul maxim de pagini de parcurs per URL (default: 10)
 */
export async function scrapeMultipleANAFPages(
  urls: string[], 
  maxPagesPerUrl: number = 10
): Promise<ScrapeResult> {
  const allAnnouncements: ANAFAnnouncement[] = [];
  const allErrors: string[] = [];

  for (const url of urls) {
    try {
      console.log(`[ANAF Scraper] 🔄 Scraping base URL: ${url} (max ${maxPagesPerUrl} pages)`);
      const result = await scrapeANAFPage(url, maxPagesPerUrl);
      
      if (result.success) {
        allAnnouncements.push(...result.announcements);
        console.log(`[ANAF Scraper] ✅ Found ${result.announcements.length} total announcements from ${url}`);
      }
      
      if (result.errors) {
        allErrors.push(...result.errors);
      }

      // Rate limiting - așteaptă 1 secundă între URL-uri de bază
      if (urls.length > 1) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    } catch (error: any) {
      allErrors.push(`Error scraping ${url}: ${error.message}`);
      console.error(`[ANAF Scraper] ❌ Error scraping ${url}:`, error);
    }
  }

  // Elimină duplicatele (după URL)
  const uniqueAnnouncements = Array.from(
    new Map(allAnnouncements.map(a => [a.url, a])).values()
  );

  console.log(`[ANAF Scraper] 📊 Total unique announcements: ${uniqueAnnouncements.length} (from ${allAnnouncements.length} found)`);

  return {
    success: uniqueAnnouncements.length > 0,
    announcements: uniqueAnnouncements,
    totalFound: uniqueAnnouncements.length,
    errors: allErrors.length > 0 ? allErrors : undefined,
  };
}

