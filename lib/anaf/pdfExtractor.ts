/**
 * PDF Extractor pentru ANAF
 * Nou motor: Poppler (pdftoppm) + OpenAI Vision (gpt-4o / gpt-4o-mini)
 *
 * Toată extragerea se face prin:
 *  - convertPdfToPngWithPoppler (pdftoppm)
 *  - ocrAnafPageWithVision (OpenAI Vision)
 */

import { extractAnafTextAndJsonFromPdf } from './pdf/extractText';

export interface PDFExtractionResult {
  text: string;
  numPages: number;
  info?: any;
  metadata?: any;
}

/**
 * Descarcă un PDF de la un URL și extrage textul folosind Poppler + Vision
 */
export async function extractTextFromPDFUrl(pdfUrl: string): Promise<PDFExtractionResult> {
  try {
    console.log(`[PDF Extractor] Downloading PDF from: ${pdfUrl}`);
    
    // Păstrăm URL-ul pentru a-l folosi în OCR Cloud dacă este necesar
    let pdfUrlForOCR = pdfUrl;
    
    const response = await fetch(pdfUrl, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Accept: 'application/pdf,application/octet-stream,*/*',
        'Accept-Language': 'ro-RO,ro;q=0.9,en;q=0.8',
        Referer: 'https://static.anaf.ro/',
      },
    });
    
    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      console.error(`[PDF Extractor] HTTP Error ${response.status}:`, errorText.substring(0, 200));
      throw new Error(`Failed to download PDF: ${response.status} ${response.statusText}`);
    }

    const contentType = response.headers.get('content-type') || '';
    console.log(`[PDF Extractor] Content-Type: ${contentType}`);
    
    if (
      contentType &&
      !contentType.includes('application/pdf') &&
      !contentType.includes('application/octet-stream')
    ) {
      console.warn(
        `[PDF Extractor] Unexpected content type: ${contentType}, continuing anyway...`
      );
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    console.log(`[PDF Extractor] Downloaded ${buffer.length} bytes`);

    if (buffer.length === 0) {
      throw new Error('Downloaded PDF is empty');
    }

    const pdfHeader = buffer.toString('ascii', 0, 4);
    if (pdfHeader !== '%PDF') {
      console.error(`[PDF Extractor] Invalid PDF header: ${pdfHeader}`);
      throw new Error('File does not appear to be a valid PDF');
    }

    console.log('[PDF Extractor] Running ANAF OCR pipeline (OCR Cloud / Poppler + OpenAI Vision)...');
    const ocrResult = await extractAnafTextAndJsonFromPdf(buffer);

    const text = (ocrResult.combinedText || '').trim();
    const numPages = ocrResult.pages.length;

    console.log(
      `[PDF Extractor] OCR pipeline finished. Text length=${text.length}, pages=${numPages}`
    );

    return {
      text,
      numPages,
      info: null,
      metadata: {
        extractedWithOCR: true,
        anafStructured: ocrResult.combinedJson,
        anafPages: ocrResult.pages,
      },
    };
  } catch (error: any) {
    console.error('[PDF Extractor] Error extracting text from PDF:', error);
    console.error('[PDF Extractor] Error stack:', error.stack);
    throw new Error(`PDF extraction failed: ${error.message}`);
  }
}

/**
 * Extrage textul dintr-un buffer PDF folosind Poppler + Vision
 */
export async function extractTextFromPDFBuffer(pdfBuffer: Buffer): Promise<PDFExtractionResult> {
  try {
    const ocrResult = await extractAnafTextAndJsonFromPdf(pdfBuffer);
    const text = (ocrResult.combinedText || '').trim();
    const numPages = ocrResult.pages.length;

    return {
      text,
      numPages,
      info: null,
      metadata: {
        extractedWithOCR: true,
        anafStructured: ocrResult.combinedJson,
        anafPages: ocrResult.pages,
      },
    };
  } catch (error: any) {
    console.error('Error extracting text from PDF buffer:', error);
    throw new Error(`PDF extraction failed: ${error.message}`);
  }
}

