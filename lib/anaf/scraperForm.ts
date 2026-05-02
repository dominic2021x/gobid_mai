/**
 * ANAF Form Scraper - Scrapează pagini ANAF cu formulare dinamice
 * Simulează interacțiunea cu formularul, deschide PDF-urile și extrage informațiile
 * Folosește Puppeteer pentru a gestiona JavaScript-ul dinamic
 */

import * as cheerio from 'cheerio';
import { ANAFAnnouncement, ScrapeResult } from './scraper';
import { extractTextFromPDFUrl } from './pdfExtractor';
import { parseANAFPDFWithGPT } from './gptParser';

// Import dinamic pentru Puppeteer (opțional - doar dacă este instalat)
let puppeteer: any = null;
try {
  puppeteer = require('puppeteer');
  console.log('[ANAF Form Scraper] ✅ Puppeteer loaded successfully');
} catch (e: any) {
  console.warn('[ANAF Form Scraper] ⚠️ Puppeteer not installed:', e.message);
  console.warn('[ANAF Form Scraper] Install with: npm install puppeteer');
}

/**
 * Scrapează pagina ANAF cu formular de căutare
 * Simulează selectarea opțiunilor și apăsarea butonului "Caută"
 */
export async function scrapeANAFFormPage(
  baseUrl: string,
  unitateFiscala: string = 'Toate județele',
  categorieBunuri: string = 'Toate categoriile',
  maxPages: number = 10000
): Promise<ScrapeResult> {
  const errors: string[] = [];
  const announcements: ANAFAnnouncement[] = [];

  try {
    console.log(`[ANAF Form Scraper] 🔄 Scraping form page: ${baseUrl}`);
    console.log(`[ANAF Form Scraper] Filters: Unitate=${unitateFiscala}, Categorie=${categorieBunuri}`);

    // Dacă Puppeteer este disponibil, folosește-l pentru a simula interacțiunea
    if (puppeteer) {
      console.log(`[ANAF Form Scraper] ✅ Using Puppeteer for form interaction`);
      return await scrapeWithPuppeteer(baseUrl, unitateFiscala, categorieBunuri, maxPages);
    }

    // Fallback: încearcă să construiască URL-ul direct
    console.log(`[ANAF Form Scraper] ⚠️ Puppeteer not available, using fallback method`);
    console.log(`[ANAF Form Scraper] ⚠️ Note: Fallback may not work for dynamic forms`);
    return await scrapeWithFallback(baseUrl, unitateFiscala, categorieBunuri, maxPages);
  } catch (error: any) {
    console.error(`[ANAF Form Scraper] ❌ Error:`, error);
    console.error(`[ANAF Form Scraper] Error stack:`, error.stack);
    return {
      success: false,
      announcements: [],
      totalFound: 0,
      errors: [
        error.message || 'Unknown error',
        error.stack ? `Stack: ${error.stack.substring(0, 500)}` : undefined,
      ].filter(Boolean) as string[],
    };
  }
}

/**
 * Scrapează folosind Puppeteer (simulează browser-ul)
 */
async function scrapeWithPuppeteer(
  baseUrl: string,
  unitateFiscala: string,
  categorieBunuri: string,
  maxPages: number
): Promise<ScrapeResult> {
  const errors: string[] = [];
  const announcements: ANAFAnnouncement[] = [];
  let browser: any = null;

  try {
    console.log(`[ANAF Form Scraper] 🚀 Launching browser...`);
    
    if (!puppeteer) {
      throw new Error('Puppeteer is not installed. Please run: npm install puppeteer');
    }
    
    browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox', 
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--single-process',
      ],
      timeout: 60000,
    });
    
    console.log(`[ANAF Form Scraper] ✅ Browser launched`);

    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    console.log(`[ANAF Form Scraper] 🔄 Navigating to: ${baseUrl}`);
    await page.goto(baseUrl, { waitUntil: 'networkidle2', timeout: 60000 });

    // Așteaptă ca formularul să se încarce complet
    console.log(`[ANAF Form Scraper] ⏳ Waiting for form to load...`);
    try {
      await page.waitForSelector('select', { timeout: 15000 });
      console.log(`[ANAF Form Scraper] ✅ Form loaded`);
    } catch (error) {
      console.warn(`[ANAF Form Scraper] ⚠️ Select not found, trying alternative selectors...`);
      await page.waitForSelector('form, input, button', { timeout: 15000 });
    }

    // Așteaptă puțin pentru ca JavaScript-ul să se execute
    await new Promise(resolve => setTimeout(resolve, 2000));

    // PASUL 1: Selectează "Toate județele" în primul dropdown
    console.log(`[ANAF Form Scraper] 🔄 STEP 1: Selecting "Toate județele" in first dropdown...`);
    const select1Result = await page.evaluate(() => {
      const selects = Array.from(document.querySelectorAll('select'));
      console.log(`[Browser] Found ${selects.length} select elements`);
      
      if (selects.length === 0) {
        return { success: false, message: 'No select elements found' };
      }

      const firstSelect = selects[0] as HTMLSelectElement;
      console.log(`[Browser] First select has ${firstSelect.options.length} options`);
      
      // Listă toate opțiunile pentru debugging
      const options: string[] = [];
      for (let i = 0; i < firstSelect.options.length; i++) {
        const text = firstSelect.options[i].text.trim();
        options.push(text);
        console.log(`[Browser] Option ${i}: "${text}"`);
      }

      // Caută "Toate județele" sau variante
      let foundIndex = -1;
      for (let i = 0; i < firstSelect.options.length; i++) {
        const optionText = firstSelect.options[i].text.trim().toLowerCase();
        if (optionText.includes('toate județele') || 
            optionText.includes('toate judetele') ||
            optionText === 'toate județele' ||
            optionText === 'toate judetele' ||
            (optionText.includes('toate') && optionText.includes('județ')) ||
            (optionText.includes('toate') && optionText.includes('judet'))) {
          foundIndex = i;
          break;
        }
      }

      // Dacă nu găsește exact, caută prima opțiune care conține "toate"
      if (foundIndex === -1) {
        for (let i = 0; i < firstSelect.options.length; i++) {
          const optionText = firstSelect.options[i].text.trim().toLowerCase();
          if (optionText.includes('toate')) {
            foundIndex = i;
            break;
          }
        }
      }

      // Dacă încă nu găsește, folosește indexul 0 (prima opțiune)
      if (foundIndex === -1 && firstSelect.options.length > 0) {
        foundIndex = 0;
      }

      if (foundIndex >= 0) {
        firstSelect.selectedIndex = foundIndex;
        const selectedText = firstSelect.options[foundIndex].text.trim();
        console.log(`[Browser] Selected option ${foundIndex}: "${selectedText}"`);
        
        // Trimite evenimente pentru a declanșa JavaScript
        firstSelect.dispatchEvent(new Event('change', { bubbles: true }));
        firstSelect.dispatchEvent(new Event('input', { bubbles: true }));
        firstSelect.dispatchEvent(new MouseEvent('change', { bubbles: true }));
        
        return { 
          success: true, 
          selectedIndex: foundIndex, 
          selectedText,
          allOptions: options 
        };
      }

      return { success: false, message: 'Could not select option', allOptions: options };
    });

    console.log(`[ANAF Form Scraper] ${select1Result.success ? '✅' : '❌'} Select 1 result:`, select1Result);
    await new Promise(resolve => setTimeout(resolve, 2000)); // Așteaptă mai mult

    // PASUL 2: Selectează "Toate categoriile" în al doilea dropdown
    console.log(`[ANAF Form Scraper] 🔄 STEP 2: Selecting "Toate categoriile" in second dropdown...`);
    const select2Result = await page.evaluate(() => {
      const selects = Array.from(document.querySelectorAll('select'));
      
      if (selects.length < 2) {
        return { success: false, message: 'Second select not found' };
      }

      const secondSelect = selects[1] as HTMLSelectElement;
      console.log(`[Browser] Second select has ${secondSelect.options.length} options`);
      
      // Listă toate opțiunile
      const options: string[] = [];
      for (let i = 0; i < secondSelect.options.length; i++) {
        const text = secondSelect.options[i].text.trim();
        options.push(text);
        console.log(`[Browser] Option ${i}: "${text}"`);
      }

      // Caută "Toate categoriile" sau variante
      let foundIndex = -1;
      for (let i = 0; i < secondSelect.options.length; i++) {
        const optionText = secondSelect.options[i].text.trim().toLowerCase();
        if (optionText.includes('toate categoriile') || 
            optionText.includes('toate categoriile') ||
            optionText === 'toate categoriile' ||
            (optionText.includes('toate') && optionText.includes('categorii'))) {
          foundIndex = i;
          break;
        }
      }

      // Dacă nu găsește exact, caută prima opțiune care conține "toate"
      if (foundIndex === -1) {
        for (let i = 0; i < secondSelect.options.length; i++) {
          const optionText = secondSelect.options[i].text.trim().toLowerCase();
          if (optionText.includes('toate')) {
            foundIndex = i;
            break;
          }
        }
      }

      // Dacă încă nu găsește, folosește indexul 0
      if (foundIndex === -1 && secondSelect.options.length > 0) {
        foundIndex = 0;
      }

      if (foundIndex >= 0) {
        secondSelect.selectedIndex = foundIndex;
        const selectedText = secondSelect.options[foundIndex].text.trim();
        console.log(`[Browser] Selected option ${foundIndex}: "${selectedText}"`);
        
        // Trimite evenimente
        secondSelect.dispatchEvent(new Event('change', { bubbles: true }));
        secondSelect.dispatchEvent(new Event('input', { bubbles: true }));
        secondSelect.dispatchEvent(new MouseEvent('change', { bubbles: true }));
        
        return { 
          success: true, 
          selectedIndex: foundIndex, 
          selectedText,
          allOptions: options 
        };
      }

      return { success: false, message: 'Could not select option', allOptions: options };
    });

    console.log(`[ANAF Form Scraper] ${select2Result.success ? '✅' : '❌'} Select 2 result:`, select2Result);
    await new Promise(resolve => setTimeout(resolve, 2000)); // Așteaptă mai mult

    // PASUL 3: Apasă butonul "Caută"
    console.log(`[ANAF Form Scraper] 🔄 STEP 3: Clicking search button...`);
    const buttonResult = await page.evaluate(() => {
      // Caută butonul de căutare în mai multe moduri
      const buttons = Array.from(document.querySelectorAll('button, input[type="submit"], input[type="button"], input[value*="Caută"], input[value*="Cauta"]'));
      console.log(`[Browser] Found ${buttons.length} buttons/inputs`);
      
      // Listă toate butoanele pentru debugging
      buttons.forEach((btn: any, idx) => {
        const text = (btn.textContent || btn.value || btn.innerText || '').trim();
        console.log(`[Browser] Button ${idx}: "${text}" (type: ${btn.type || 'button'})`);
      });
      
      // Caută după text "Caută" sau "Cauta"
      let searchButton = buttons.find((btn: any) => {
        const text = (btn.textContent || btn.value || btn.innerText || '').toLowerCase().trim();
        return text.includes('caută') || 
               text.includes('cauta') || 
               text === 'caută' ||
               text === 'cauta';
      });
      
      if (searchButton) {
        const buttonText = (searchButton as any).textContent || (searchButton as any).value || (searchButton as any).innerText;
        console.log(`[Browser] Found search button by text: "${buttonText}"`);
        (searchButton as HTMLElement).click();
        return { success: true, buttonText, method: 'text_match' };
      }
      
      // Caută butonul de submit în formular
      const forms = document.querySelectorAll('form');
      if (forms.length > 0) {
        const submitButton = forms[0].querySelector('input[type="submit"], button[type="submit"], button');
        if (submitButton) {
          const buttonText = (submitButton as any).textContent || (submitButton as any).value || (submitButton as any).innerText;
          console.log(`[Browser] Found submit button in form: "${buttonText}"`);
          (submitButton as HTMLElement).click();
          return { success: true, buttonText, method: 'form_submit' };
        }
      }
      
      // Caută primul buton disponibil care nu este de navigare
      const nonNavButton = buttons.find((btn: any) => {
        const text = (btn.textContent || btn.value || btn.innerText || '').toLowerCase();
        return !text.includes('următor') && 
               !text.includes('anterior') && 
               !text.includes('next') && 
               !text.includes('prev') &&
               text.length > 0;
      });
      
      if (nonNavButton) {
        const buttonText = (nonNavButton as any).textContent || (nonNavButton as any).value || (nonNavButton as any).innerText;
        console.log(`[Browser] Clicking first non-navigation button: "${buttonText}"`);
        (nonNavButton as HTMLElement).click();
        return { success: true, buttonText, method: 'first_available' };
      }
      
      return { success: false, message: 'No button found' };
    });

    console.log(`[ANAF Form Scraper] ${buttonResult.success ? '✅' : '❌'} Button click result:`, buttonResult);

    // Așteaptă rezultatele - încearcă mai multe metode
    console.log(`[ANAF Form Scraper] ⏳ Waiting for results...`);
    
    try {
      // Așteaptă navigare sau schimbare de URL
      await Promise.race([
        page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }),
        page.waitForSelector('table, .result, [class*="anunt"], [class*="licitatie"]', { timeout: 30000 }),
        new Promise(resolve => setTimeout(resolve, 5000)) // Fallback timeout
      ]);
    } catch (error) {
      console.warn(`[ANAF Form Scraper] ⚠️ Navigation timeout, continuing anyway...`);
    }

    // Așteaptă puțin pentru ca rezultatele să se încarce complet
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Verifică dacă s-au încărcat rezultate
    const hasResults = await page.evaluate(() => {
      const tables = document.querySelectorAll('table');
      const links = document.querySelectorAll('a[href*="licitatie"], a[href*="anunt"], a[href*="pdf"]');
      return tables.length > 0 || links.length > 5;
    });
    
    console.log(`[ANAF Form Scraper] ${hasResults ? '✅' : '⚠️'} Results loaded: ${hasResults}`);

    // Extrage HTML-ul cu rezultatele
    const html = await page.content();
    const $ = cheerio.load(html);

    // Extrage doar URL-urile PDF-urilor (NU anunțurile directe)
    const pdfUrls = extractPDFUrlsFromResults($, baseUrl);
    
    console.log(`[ANAF Form Scraper] ✅ Found ${pdfUrls.length} PDF URLs on first page`);
    
    if (pdfUrls.length === 0) {
      console.warn(`[ANAF Form Scraper] ⚠️ No PDFs found! HTML length: ${html.length}`);
      console.log(`[ANAF Form Scraper] 🔍 HTML preview (first 2000 chars):`, html.substring(0, 2000));
    } else {
      console.log(`[ANAF Form Scraper] 📋 PDF URLs found (showing first 10):`);
      pdfUrls.slice(0, 10).forEach((pdfUrl, idx) => {
        console.log(`  ${idx + 1}. ${pdfUrl.substring(0, 100)}`);
      });
    }

    // Returnează doar URL-urile PDF-urilor
    // Procesarea se va face prin endpoint-ul /api/anaf/import (același flux ca importul manual)
    console.log(`[ANAF Form Scraper] ✅ Found ${pdfUrls.length} PDF URLs`);
    console.log(`[ANAF Form Scraper] ℹ️ PDF-urile vor fi procesate prin endpoint-ul /api/anaf/import (același flux ca importul manual)`);
    
    // Creează anunțuri simple cu doar URL-ul PDF (procesarea se face ulterior)
    for (const pdfUrl of pdfUrls) {
      const announcement: ANAFAnnouncement = {
        id: generateIdFromUrl(pdfUrl),
        title: `PDF ANAF - ${pdfUrl.substring(pdfUrl.lastIndexOf('/') + 1)}`,
        description: `PDF descoperit prin scraping automat`,
        url: pdfUrl,
        images: [],
        pdfUrl: pdfUrl,
        extractedAt: new Date().toISOString(),
      };
      
      announcements.push(announcement);
    }

    // Procesează paginile următoare automat
    let currentPage = 1;
    let hasNextPage = true;
    
    while (hasNextPage && currentPage < maxPages) {
      // Detectează link-ul către pagina următoare
      const nextPageUrl = await detectNextPageLink(page);
      
      if (!nextPageUrl) {
        console.log(`[ANAF Form Scraper] ✅ No more pages found. Stopping at page ${currentPage}`);
        hasNextPage = false;
        break;
      }
      
      currentPage++;
      console.log(`[ANAF Form Scraper] 🔄 Moving to page ${currentPage}: ${nextPageUrl}`);
      
      try {
        // Navighează la pagina următoare
        await page.goto(nextPageUrl, { waitUntil: 'networkidle2', timeout: 30000 });
        await new Promise(resolve => setTimeout(resolve, 3000)); // Așteaptă încărcarea
        
        // Verifică dacă s-au încărcat rezultate
        const hasResults = await page.evaluate(() => {
          const tables = document.querySelectorAll('table');
          const links = document.querySelectorAll('a[href*="licitatie"], a[href*="anunt"], a[href*="pdf"]');
          return tables.length > 0 || links.length > 5;
        });
        
        if (!hasResults) {
          console.log(`[ANAF Form Scraper] ⚠️ No results on page ${currentPage}, stopping...`);
          hasNextPage = false;
          break;
        }
        
        // Extrage HTML-ul cu rezultatele
        const pageHtml = await page.content();
        const $page = cheerio.load(pageHtml);
        const pagePdfUrls = extractPDFUrlsFromResults($page, baseUrl);
        
        console.log(`[ANAF Form Scraper] 📄 Page ${currentPage}: Found ${pagePdfUrls.length} PDF URLs`);
        
        if (pagePdfUrls.length === 0) {
          console.log(`[ANAF Form Scraper] ⚠️ No PDFs on page ${currentPage}, checking for next page...`);
          // Continuă să caute pagina următoare chiar dacă nu sunt PDF-uri pe această pagină
        } else {
          // Adaugă PDF-urile de pe această pagină (procesarea se face ulterior prin /api/anaf/import)
          for (let j = 0; j < pagePdfUrls.length; j++) {
            const pdfUrl = pagePdfUrls[j];
            
            // Verifică dacă nu am procesat deja acest PDF
            if (announcements.some(ann => ann.pdfUrl === pdfUrl)) {
              console.log(`[ANAF Form Scraper] ⏭️ Skipping duplicate PDF: ${pdfUrl.substring(0, 60)}...`);
              continue;
            }
            
            const announcement: ANAFAnnouncement = {
              id: generateIdFromUrl(pdfUrl),
              title: `PDF ANAF - ${pdfUrl.substring(pdfUrl.lastIndexOf('/') + 1)}`,
              description: `PDF descoperit prin scraping automat`,
              url: pdfUrl,
              images: [],
              pdfUrl: pdfUrl,
              extractedAt: new Date().toISOString(),
            };
            
            announcements.push(announcement);
          }
        }
        
        console.log(`[ANAF Form Scraper] ✅ Processed page ${currentPage}, total announcements: ${announcements.length}`);
        
        // Rate limiting între pagini
        await new Promise(resolve => setTimeout(resolve, 2000));
        
      } catch (error: any) {
        console.error(`[ANAF Form Scraper] ❌ Error on page ${currentPage}:`, error.message);
        errors.push(`Page ${currentPage}: ${error.message}`);
        hasNextPage = false; // Oprește dacă apare o eroare
        break;
      }
    }

    return {
      success: announcements.length > 0,
      announcements,
      totalFound: announcements.length,
      errors: errors.length > 0 ? errors : undefined,
    };
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

/**
 * Fallback method - încearcă să construiască URL-ul direct
 */
async function scrapeWithFallback(
  baseUrl: string,
  unitateFiscala: string,
  categorieBunuri: string,
  maxPages: number
): Promise<ScrapeResult> {
  const errors: string[] = [];
  const announcements: ANAFAnnouncement[] = [];

  // Construiește URL-ul cu parametrii
  const searchUrl = buildSearchUrl(baseUrl, unitateFiscala, categorieBunuri);

  console.log(`[ANAF Form Scraper] 🔄 Fetching results from: ${searchUrl}`);

  const searchResponse = await fetch(searchUrl, {
    method: 'GET',
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Referer': baseUrl,
    },
  });

  if (!searchResponse.ok) {
    throw new Error(`HTTP ${searchResponse.status}: ${searchResponse.statusText}`);
  }

  const searchHtml = await searchResponse.text();
  const $search = cheerio.load(searchHtml);

  // Extrage doar URL-urile PDF-urilor
  const pdfUrls = extractPDFUrlsFromResults($search, baseUrl);
  
  console.log(`[ANAF Form Scraper] ✅ Found ${pdfUrls.length} PDF URLs`);
  
  // Procesează fiecare PDF
  for (let i = 0; i < pdfUrls.length; i++) {
    const pdfUrl = pdfUrls[i];
    try {
      console.log(`[ANAF Form Scraper] 📄 Processing PDF ${i + 1}/${pdfUrls.length}: ${pdfUrl.substring(0, 80)}...`);
      
      const pdfExtraction = await extractTextFromPDFUrl(pdfUrl);
      
      if (!pdfExtraction.text || pdfExtraction.text.trim().length === 0) {
        console.warn(`[ANAF Form Scraper] ⚠️ PDF ${i + 1} returned empty text, skipping...`);
        continue;
      }

      const licitatieData = await parseANAFPDFWithGPT(pdfExtraction.text);
      
      if (licitatieData && licitatieData.bunuri && licitatieData.bunuri.length > 0) {
        for (const bun of licitatieData.bunuri) {
          const announcement: ANAFAnnouncement = {
            id: generateIdFromUrl(pdfUrl + '_' + bun.tip_bun),
            title: generateTitleFromBun(bun, licitatieData),
            description: generateDescriptionFromBun(bun, licitatieData),
            url: pdfUrl,
            images: [],
            pdfUrl: pdfUrl,
            price: bun.pret_evaluare || licitatieData.pret_evaluare || undefined,
            category: bun.tip_bun || licitatieData.tip_bun || undefined,
            location: licitatieData.localitate || licitatieData.judet || undefined,
            date: licitatieData.data_licitatie || undefined,
            extractedAt: new Date().toISOString(),
          };
          
          announcements.push(announcement);
        }
      }
      
      // Rate limiting
      if (i < pdfUrls.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 3000));
      }
    } catch (error: any) {
      console.error(`[ANAF Form Scraper] ❌ Error processing PDF ${i + 1}:`, error.message);
      errors.push(`PDF ${i + 1}: ${error.message}`);
    }
  }

  console.log(`[ANAF Form Scraper] ✅ Created ${announcements.length} announcements from ${pdfUrls.length} PDFs`);

  return {
    success: announcements.length > 0,
    announcements,
    totalFound: announcements.length,
    errors: errors.length > 0 ? errors : undefined,
  };
}

/**
 * Construiește URL-ul de căutare cu parametrii
 */
function buildSearchUrl(
  baseUrl: string,
  unitateFiscala: string,
  categorieBunuri: string
): string {
  // ANAF folosește de obicei parametri în URL
  // Structura poate varia - ajustează în funcție de structura reală
  
  const url = new URL(baseUrl);
  
  // Adaugă parametrii de căutare
  // Ajustează numele parametrilor în funcție de structura reală a formularului ANAF
  if (unitateFiscala && unitateFiscala !== 'Toate județele') {
    url.searchParams.set('unitate', encodeURIComponent(unitateFiscala));
  }
  
  if (categorieBunuri && categorieBunuri !== 'Toate categoriile') {
    url.searchParams.set('categorie', encodeURIComponent(categorieBunuri));
  }
  
  // Adaugă parametru pentru a forța căutarea
  url.searchParams.set('cauta', '1');
  
  return url.toString();
}

/**
 * Extrage URL-urile PDF-urilor din rezultatele căutării
 */
function extractPDFUrlsFromResults(
  $: ReturnType<typeof cheerio.load>,
  baseUrl: string
): string[] {
  const pdfUrls: string[] = [];
  const seenUrls = new Set<string>();

  console.log(`[ANAF Form Scraper] 🔍 Extracting PDF URLs from results...`);

  // Strategie 1: Caută toate link-urile către PDF-uri
  const pdfLinks = $('a[href*=".pdf"], a[href*="pdf"]');
  console.log(`[ANAF Form Scraper] Found ${pdfLinks.length} PDF links`);

  // Extrage toate URL-urile PDF-urilor
  pdfLinks.each((index, element) => {
    try {
      const $link = $(element);
      const href = $link.attr('href');
      if (!href || href.includes('#') || href.includes('javascript:')) return;

      const fullUrl = href.startsWith('http') 
        ? href 
        : new URL(href, baseUrl).toString();

      if (seenUrls.has(fullUrl)) return;
      seenUrls.add(fullUrl);
      pdfUrls.push(fullUrl);
    } catch (error: any) {
      console.error(`[ANAF Form Scraper] Error extracting PDF URL ${index}:`, error);
    }
  });

  console.log(`[ANAF Form Scraper] ✅ Extracted ${pdfUrls.length} PDF URLs`);

  return pdfUrls;
}

/**
 * Generează titlul anunțului din datele bunului
 */
function generateTitleFromBun(bun: any, licitatieData: any): string {
  if (bun.marca && bun.model && bun.an_fabricatie) {
    return `${bun.marca} ${bun.model} ${bun.an_fabricatie}`;
  }
  if (bun.tip_bun) {
    return `Licitație ${bun.tip_bun}`;
  }
  return `Licitație ANAF ${licitatieData.numar_licitatie || ''}`;
}

/**
 * Generează descrierea anunțului din datele bunului
 */
function generateDescriptionFromBun(bun: any, licitatieData: any): string {
  const parts: string[] = [];
  
  if (bun.tip_bun) parts.push(`Tip: ${bun.tip_bun}`);
  if (bun.marca) parts.push(`Brand: ${bun.marca}`);
  if (bun.model) parts.push(`Model: ${bun.model}`);
  if (bun.an_fabricatie) parts.push(`An: ${bun.an_fabricatie}`);
  if (bun.pret_evaluare) parts.push(`Preț evaluare: ${bun.pret_evaluare} Lei`);
  if (licitatieData.data_licitatie) parts.push(`Data licitație: ${licitatieData.data_licitatie}`);
  if (licitatieData.loc_licitatie) parts.push(`Loc: ${licitatieData.loc_licitatie}`);
  
  return parts.join('. ') || 'Licitație publică ANAF';
}

/**
 * Funcție veche - NU SE MAI FOLOSEȘTE
 * Păstrată doar pentru compatibilitate
 */
function extractAnnouncementsFromResults(
  $: ReturnType<typeof cheerio.load>,
  baseUrl: string
): ANAFAnnouncement[] {
  const announcements: ANAFAnnouncement[] = [];
  const seenUrls = new Set<string>();
  
  // Strategie 1: Caută link-uri directe
  const links = $('a[href]');
  links.each((index, element) => {
    try {
      const $link = $(element);
      const href = $link.attr('href');
      if (!href || href.includes('#') || href.includes('javascript:')) return;

      const fullUrl = href.startsWith('http') 
        ? href 
        : new URL(href, baseUrl).toString();

      if (!seenUrls.has(fullUrl)) {
        seenUrls.add(fullUrl);
        announcements.push({
          id: generateIdFromUrl(fullUrl),
          title: $link.text().trim() || 'Anunț ANAF',
          description: '',
          url: fullUrl,
          images: [],
          pdfUrl: href.includes('.pdf') ? fullUrl : undefined,
          extractedAt: new Date().toISOString(),
        });
      }
    } catch (error: any) {
      console.error(`[ANAF Form Scraper] Error extracting link ${index}:`, error);
    }
  });

  // Strategie 2: Dacă nu găsește link-uri, caută în tabele
  if (announcements.length === 0) {
    console.log(`[ANAF Form Scraper] No links found, trying table extraction...`);
    
    const tableRows = $('table tbody tr, table tr');
    console.log(`[ANAF Form Scraper] Found ${tableRows.length} table rows`);

    tableRows.each((index, element) => {
      try {
        const $row = $(element);
        const rowText = $row.text().trim();
        
        // Skip header rows și rânduri goale
        if (rowText.length < 30 || 
            rowText.toLowerCase().includes('unitate') || 
            rowText.toLowerCase().includes('categorie') ||
            rowText.toLowerCase().includes('județ') ||
            rowText.toLowerCase().includes('data') && rowText.toLowerCase().includes('preț')) {
          return;
        }

        // Caută link-uri în rând
        const rowLinks = $row.find('a[href]');
        
        if (rowLinks.length > 0) {
          rowLinks.each((_, linkEl) => {
            const $link = $(linkEl);
            const href = $link.attr('href');
            if (!href || href.includes('#') || href.includes('javascript:')) return;

            const fullUrl = href.startsWith('http') 
              ? href 
              : new URL(href, baseUrl).toString();

            if (!seenUrls.has(fullUrl)) {
              seenUrls.add(fullUrl);
              
              const priceMatch = rowText.match(/(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2})?)\s*(?:RON|lei|EUR)/i);
              let price: number | undefined;
              if (priceMatch) {
                const priceStr = priceMatch[1].replace(/[.,]/g, '');
                price = parseInt(priceStr, 10);
              }

              announcements.push({
                id: generateIdFromUrl(fullUrl),
                title: $link.text().trim() || rowText.substring(0, 100),
                description: rowText.substring(0, 500),
                url: fullUrl,
                images: [],
                pdfUrl: href.includes('.pdf') ? fullUrl : undefined,
                price,
                extractedAt: new Date().toISOString(),
              });
            }
          });
        } else if (rowText.length > 50) {
          // Dacă nu are link-uri dar are text, creează anunț din text
          const announcement: ANAFAnnouncement = {
            id: generateIdFromUrl(baseUrl + '_' + index),
            title: rowText.substring(0, 100),
            description: rowText,
            url: baseUrl + '#row_' + index,
            images: [],
            extractedAt: new Date().toISOString(),
          };
          
          const priceMatch = rowText.match(/(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2})?)\s*(?:RON|lei|EUR)/i);
          if (priceMatch) {
            const priceStr = priceMatch[1].replace(/[.,]/g, '');
            announcement.price = parseInt(priceStr, 10);
          }
          
          announcements.push(announcement);
        }
      } catch (error: any) {
        console.error(`[ANAF Form Scraper] Error extracting row ${index}:`, error);
      }
    });
  }

  // Strategie 3: Caută în div-uri și alte containere
  if (announcements.length < 5) {
    console.log(`[ANAF Form Scraper] Only ${announcements.length} found, trying div extraction...`);
    
    const containers = $('[class*="anunt"], [class*="licitatie"], [class*="result"], [class*="item"]');
    console.log(`[ANAF Form Scraper] Found ${containers.length} potential containers`);

    containers.each((index, element) => {
      try {
        const $container = $(element);
        const text = $container.text().trim();
        
        if (text.length < 30) return;

        const links = $container.find('a[href]');
        if (links.length > 0) {
          links.each((_, linkEl) => {
            const $link = $(linkEl);
            const href = $link.attr('href');
            if (!href || href.includes('#') || href.includes('javascript:')) return;

            const fullUrl = href.startsWith('http') 
              ? href 
              : new URL(href, baseUrl).toString();

            if (!seenUrls.has(fullUrl)) {
              seenUrls.add(fullUrl);
              announcements.push({
                id: generateIdFromUrl(fullUrl),
                title: $link.text().trim() || text.substring(0, 100),
                description: text.substring(0, 500),
                url: fullUrl,
                images: [],
                extractedAt: new Date().toISOString(),
              });
            }
          });
        }
      } catch (error: any) {
        console.error(`[ANAF Form Scraper] Error extracting container ${index}:`, error);
      }
    });
  }

  console.log(`[ANAF Form Scraper] ✅ Extracted ${announcements.length} total announcements`);
  return announcements;
}

/**
 * Detectează link-ul către pagina următoare folosind Puppeteer
 */
async function detectNextPageLink(page: any): Promise<string | null> {
  try {
    const nextPageInfo = await page.evaluate(() => {
      // Caută link-uri de paginare în mai multe moduri
      const selectors = [
        'a:contains("Pagina următoare")',
        'a:contains("Pagina urmatoare")',
        'a:contains("Următor")',
        'a:contains("Urmator")',
        'a:contains("Next")',
        'a:contains(">>")',
        'a[href*="page="]',
        'a[href*="pagina="]',
        '.pagination a',
        '.pager a',
        '[class*="pagination"] a',
      ];
      
      // Caută în toate link-urile
      const allLinks = Array.from(document.querySelectorAll('a[href]'));
      
      for (const link of allLinks) {
        const text = (link.textContent || '').trim().toLowerCase();
        const href = (link as HTMLAnchorElement).href;
        
        // Verifică dacă este link-ul către pagina următoare
        if (
          text.includes('pagina următoare') ||
          text.includes('pagina urmatoare') ||
          text.includes('următor') ||
          text.includes('urmator') ||
          text.includes('next') ||
          text === '>>' ||
          text === '>' ||
          (text.includes('următor') && !text.includes('anterior')) ||
          (text.includes('next') && !text.includes('prev'))
        ) {
          return {
            found: true,
            href: href,
            text: text,
          };
        }
      }
      
      // Dacă nu găsește după text, caută după href (page=2, pagina=2, etc.)
      for (const link of allLinks) {
        const href = (link as HTMLAnchorElement).href;
        if (href && (href.includes('page=') || href.includes('pagina='))) {
          // Verifică dacă este o pagină următoare (nu anterioară)
          const text = (link.textContent || '').trim().toLowerCase();
          if (!text.includes('anterior') && !text.includes('prev') && !text.includes('<<')) {
            return {
              found: true,
              href: href,
              text: text,
            };
          }
        }
      }
      
      return { found: false, href: null, text: null };
    });
    
    if (nextPageInfo.found && nextPageInfo.href) {
      console.log(`[ANAF Form Scraper] 🔗 Found next page link: "${nextPageInfo.text}" -> ${nextPageInfo.href.substring(0, 100)}`);
      return nextPageInfo.href;
    }
    
    return null;
  } catch (error: any) {
    console.error(`[ANAF Form Scraper] ❌ Error detecting next page:`, error.message);
    return null;
  }
}

/**
 * Detectează link-urile către paginile următoare (funcție veche - păstrată pentru compatibilitate)
 */
function detectPaginationFromForm($: ReturnType<typeof cheerio.load>, currentUrl: string): string[] {
  const paginationUrls: string[] = [];

  // Caută link-uri de paginare
  const paginationSelectors = [
    '.pagination a',
    '.pager a',
    '[class*="pagination"] a',
    'a[href*="page="]',
    'a[href*="pagina="]',
  ];

  for (const selector of paginationSelectors) {
    try {
      const links = $(selector);
      links.each((_, element) => {
        const $link = $(element);
        const href = $link.attr('href');
        const text = $link.text().trim().toLowerCase();
        
        if (href && (
          text.includes('următor') || 
          text.includes('next') || 
          text === '>>' ||
          text === '>' ||
          href.includes('page=') ||
          href.includes('pagina=')
        )) {
          const fullUrl = href.startsWith('http') 
            ? href 
            : new URL(href, currentUrl).toString();
          
          if (!paginationUrls.includes(fullUrl)) {
            paginationUrls.push(fullUrl);
          }
        }
      });
      
      if (paginationUrls.length > 0) {
        break;
      }
    } catch (error) {
      // Continuă
    }
  }

  return paginationUrls;
}

/**
 * Generează ID din URL
 */
function generateIdFromUrl(url: string): string {
  const hash = url.split('').reduce((acc, char) => {
    acc = ((acc << 5) - acc) + char.charCodeAt(0);
    return acc & acc;
  }, 0);
  
  return `anaf_form_${Math.abs(hash).toString(36)}`;
}

