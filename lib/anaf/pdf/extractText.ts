/**
 * Pipeline complet ANAF PDF -> PNG (Poppler) -> OCR (OpenAI Vision) -> JSON + text
 * IMPORTANT: Folosește EXCLUSIV OCR (Vision) pentru extragere text
 * Nu folosește pdf-parse ca sursă principală - OCR este obligatoriu pentru toate tipurile de PDF-uri
 */
import { convertPdfToPngWithPoppler } from './popplerConverter';
import { ANAFPageStructuredData, ANAFVisionPageResult, ocrAnafPageWithVision } from './visionOCR';
import { extractPriceFromOCRText, extractPriceFromMultiplePages } from './extractPriceFromOCR';
import { logOCRText, logOCRPrice, logFinalPrice } from '../log';

export interface ANAFExtractionPage {
  pageNumber: number;
  raw_text: string;
  structured: ANAFPageStructuredData;
}

export interface ANAFExtractionResult {
  combinedText: string;
  combinedJson: ANAFPageStructuredData;
  pages: ANAFExtractionPage[];
}

/**
 * Încearcă să deducă prețul principal (în lei) din textul complet,
 * pentru cazurile în care modelul Vision nu populă câmpul `pret`.
 */
function inferPriceFromRawText(raw: string | null | undefined): string | null {
  if (!raw) return null;

  const text = raw.replace(/\s+/g, ' ');

  // Pattern 1: după "pret", "preț", "pretul", "prețul de evaluare/pornire"
  const priceContextRegex =
    /(pre[țt]ul?|pre[țt]\s+de)\s+(?:evaluare|pornire|licitatiei|licitației)[^0-9]{0,40}(\d[\d\.\s]{2,})/i;
  const contextMatch = text.match(priceContextRegex);
  if (contextMatch && contextMatch[2]) {
    const numeric = contextMatch[2].replace(/[^\d]/g, '');
    if (numeric.length >= 3) {
      return numeric;
    }
  }

  // Pattern 2: număr mare urmat de "lei" / "RON"
  const withCurrencyRegex = /(\d[\d\.\s]{2,})\s*(lei|ron)/i;
  const currencyMatch = text.match(withCurrencyRegex);
  if (currencyMatch && currencyMatch[1]) {
    const numeric = currencyMatch[1].replace(/[^\d]/g, '');
    if (numeric.length >= 3) {
      return numeric;
    }
  }

  // Pattern 3: orice număr mare (minim 5 cifre) – luăm primul dacă nu avem altceva
  const bigNumberRegex = /(\d[\d\.\s]{4,})/g;
  const bigMatch = bigNumberRegex.exec(text);
  if (bigMatch && bigMatch[1]) {
    const numeric = bigMatch[1].replace(/[^\d]/g, '');
    if (numeric.length >= 5) {
      return numeric;
    }
  }

  return null;
}

function mergeStructuredJson(pages: ANAFPageStructuredData[]): ANAFPageStructuredData {
  const base: ANAFPageStructuredData = {
    titlu: null,
    pret: null,
    data: null,
    oras: null,
    judet: null,
    descriere: null,
    alte_detalii: null,
    raw_text: '',
  };

  for (const p of pages) {
    base.titlu = base.titlu || p.titlu;
    base.pret = base.pret || p.pret;
    base.data = base.data || p.data;
    base.oras = base.oras || p.oras;
    base.judet = base.judet || p.judet;

    if (p.descriere) {
      base.descriere = base.descriere ? `${base.descriere}\n\n${p.descriere}` : p.descriere;
    }
    if (p.alte_detalii) {
      base.alte_detalii = base.alte_detalii
        ? `${base.alte_detalii}\n\n${p.alte_detalii}`
        : p.alte_detalii;
    }

    if (p.raw_text) {
      base.raw_text = base.raw_text ? `${base.raw_text}\n\n${p.raw_text}` : p.raw_text;
    }
  }

  return base;
}

/**
 * Pipeline principal: primește un buffer PDF ANAF și întoarce text + JSON structurat.
 *
 * IMPORTANT:
 *  - Folosește EXCLUSIV OCR (Vision) pentru extragere text
 *  - Aruncă eroare dacă OCR nu extrage text util (minim 50 caractere)
 *  - Nu folosește pdf-parse ca sursă principală
 */
export async function extractAnafTextAndJsonFromPdf(pdfBuffer: Buffer): Promise<ANAFExtractionResult> {
  try {
    // IMPORTANT: Folosim EXCLUSIV OCR (Vision) pentru extragere text
    // Nu folosim pdf-parse ca sursă principală - OCR este obligatoriu pentru toate tipurile de PDF-uri
    
    // 1) Convertim PDF-ul în imagini cu Poppler (necesar pentru OCR)
    console.log('[ANAF OCR] Converting PDF to PNG images with Poppler for OCR...');
    let images;
    try {
      images = await convertPdfToPngWithPoppler(pdfBuffer);
    } catch (popplerError: any) {
      const errorMsg = popplerError?.message || 'Unknown error';
      console.error('[ANAF OCR] Poppler conversion failed:', errorMsg);
      
      // Dacă Poppler nu este instalat, aruncăm o eroare clară
      if (errorMsg.includes('ENOENT') || errorMsg.includes('not found') || errorMsg.includes('Nu s-a putut rula')) {
        throw new Error(
          'Poppler nu este instalat sau nu este disponibil. ' +
          'Pentru PDF-uri scanate, Poppler este necesar pentru conversie în imagini. ' +
          'Instalează Poppler: macOS: `brew install poppler`, Linux: `sudo apt-get install poppler-utils`. ' +
          'După instalare, repornește serverul Next.js.'
        );
      }
      
      // Altfel, aruncăm eroarea originală
      throw new Error(`Poppler conversion failed: ${errorMsg}`);
    }

    if (images.length === 0) {
      throw new Error('Poppler returned 0 pages. PDF-ul poate fi corupt sau gol.');
    }

    const pageResults: ANAFExtractionPage[] = [];

    for (const img of images) {
      try {
        const base64 = img.buffer.toString('base64');
        const visionResult: ANAFVisionPageResult = await ocrAnafPageWithVision(
          base64,
          img.pageNumber
        );

        pageResults.push({
          pageNumber: img.pageNumber,
          raw_text: visionResult.data.raw_text || '',
          structured: visionResult.data,
        });
      } catch (err: any) {
        console.error(
          `[ANAF OCR] Vision OCR failed for page ${img.pageNumber}:`,
          err?.message || err
        );
        // Continuăm cu paginile următoare; pentru pagina aceasta folosim placeholder gol
        pageResults.push({
          pageNumber: img.pageNumber,
          raw_text: '',
          structured: {
            titlu: null,
            pret: null,
            data: null,
            oras: null,
            judet: null,
            descriere: null,
            alte_detalii: null,
            raw_text: '',
          },
        });
      }
    }

    const structuredPages = pageResults.map((p) => p.structured);
    const combinedJson = mergeStructuredJson(structuredPages);
    
    // IMPORTANT: Folosim EXCLUSIV textul din OCR (Vision)
    // Eliminăm orice fallback la pdf-parse sau alte surse
    const ocrText = pageResults
      .map(p => p.raw_text)
      .filter(Boolean)
      .join('\n')
      .trim();

    if (!ocrText || ocrText.length < 50) {
      const errorMsg = `OCR failed: no usable text extracted. Extracted text length: ${ocrText?.length || 0}. ` +
        `Pages processed: ${pageResults.length}, Pages with text: ${pageResults.filter(p => p.raw_text && p.raw_text.trim().length > 0).length}`;
      console.error('[ANAF OCR]', errorMsg);
      throw new Error(errorMsg);
    }

    const combinedText = ocrText;

    // 2) Pipeline de extragere preț: OCR → GPT → fallback
    // Loghează textul OCR brut
    logOCRText(combinedText);

    // Extrage preț din OCR text (folosind normalizare fuzzy)
    const ocrPages = pageResults.map((p) => p.raw_text).filter(Boolean);
    const ocrPrice = extractPriceFromMultiplePages(ocrPages);
    logOCRPrice(ocrPrice);

    // Dacă modelul Vision nu a setat prețul, folosim prețul extras din OCR
    if (!combinedJson.pret) {
      if (ocrPrice !== null) {
        combinedJson.pret = ocrPrice.toString();
        console.log('[ANAF OCR] Using OCR-extracted price:', ocrPrice);
      } else {
        // Fallback: încearcă să deducă din textul OCR
        let inferred = inferPriceFromRawText(combinedText);

        if (inferred) {
          combinedJson.pret = inferred;
          console.log('[ANAF OCR] Inferred price from OCR text:', inferred);
        } else {
          console.log('[ANAF OCR] Could not extract price from OCR text.');
        }
      }
    } else {
      // Dacă Vision a extras un preț, loghează-l
      const visionPrice = combinedJson.pret ? parseInt(combinedJson.pret.replace(/[^0-9]/g, ''), 10) : null;
      if (visionPrice && !isNaN(visionPrice)) {
        console.log('[ANAF OCR] Vision extracted price:', visionPrice);
      }
    }

    // Loghează prețul final
    const finalPrice = combinedJson.pret ? parseInt(combinedJson.pret.replace(/[^0-9]/g, ''), 10) : null;
    logFinalPrice(finalPrice);

    return {
      combinedText,
      combinedJson,
      pages: pageResults,
    };
  } catch (err: any) {
    console.error('[ANAF OCR] Global extraction pipeline failed:', err?.message || err);
    
    // IMPORTANT: Aruncăm eroarea mai departe pentru a permite gestionarea corectă a erorilor
    // Erorile OCR trebuie să fie propagate pentru a fi gestionate de apelator
    throw err;
  }
}


