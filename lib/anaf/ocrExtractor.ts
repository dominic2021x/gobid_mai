/**
 * OCR Extractor pentru PDF-uri scanate (adapter pentru noul pipeline Poppler + Vision)
 *
 * Păstrăm semnătura pentru compatibilitate, dar delegăm către
 * `extractAnafTextAndJsonFromPdf` din `lib/anaf/pdf/extractText`.
 */

import { extractAnafTextAndJsonFromPdf } from './pdf/extractText';

export interface OCRResult {
  text: string;
  confidence: number;
  pages: number;
}

export async function extractTextFromScannedPDF(
  pdfBuffer: Buffer,
  _options?: {
    language?: string;
    maxPages?: number;
  }
): Promise<OCRResult> {
  const result = await extractAnafTextAndJsonFromPdf(pdfBuffer);
  const text = (result.combinedText || '').trim();

  return {
    text,
    confidence: 90,
    pages: result.pages.length || 1,
  };
}

export async function isPDFScanned(_pdfBuffer: Buffer): Promise<boolean> {
  // În noul model tratăm toate PDF-urile ca potențial scanate;
  // decizia este gestionată de Poppler + Vision.
  return true;
}


