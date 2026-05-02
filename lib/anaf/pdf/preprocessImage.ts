/**
 * Preprocesare imagine pentru OCR robust
 * Aplică transformări pentru a îmbunătăți calitatea imaginii înainte de OCR
 */

import sharp from 'sharp';

export interface PreprocessOptions {
  dpi?: number; // DPI țintă (default: 600)
  deskew?: boolean; // Îndreptare (default: true)
  denoise?: boolean; // Denoise (default: true)
  sharpen?: boolean; // Sharpening (default: true)
  binarize?: boolean; // Binarizare (default: true)
}

/**
 * Preprocesează o imagine pentru OCR
 * @param imageBuffer Buffer-ul imaginii originale
 * @param options Opțiuni de preprocesare
 * @returns Buffer-ul imaginii preprocesate
 */
export async function preprocessImageForOCR(
  imageBuffer: Buffer,
  options: PreprocessOptions = {}
): Promise<Buffer> {
  const {
    dpi = 600,
    deskew = true,
    denoise = true,
    sharpen = true,
    binarize = true,
  } = options;

  let pipeline = sharp(imageBuffer);

  // 1. Grayscale (conversie la tonuri de gri)
  pipeline = pipeline.greyscale();

  // 2. Mărire DPI (300 → 600 pentru rezoluție mai bună)
  // Sharp nu are direct DPI, dar putem scala imaginea
  // Vom mări cu factor 2x pentru a obține rezoluție mai bună
  const metadata = await sharp(imageBuffer).metadata();
  const scaleFactor = dpi / 300; // Dacă originalul e 300 DPI, mărim la 600
  if (scaleFactor > 1 && metadata.width && metadata.height) {
    pipeline = pipeline.resize(
      Math.round(metadata.width * scaleFactor),
      Math.round(metadata.height * scaleFactor),
      {
        kernel: sharp.kernel.lanczos3, // Lanczos pentru calitate superioară
      }
    );
  }

  // 3. Denoise (Gaussian blur light pentru eliminare zgomot)
  if (denoise) {
    pipeline = pipeline.blur(0.5); // Blur foarte ușor pentru denoise
  }

  // 4. Sharpen edges (pentru claritate caractere)
  if (sharpen) {
    pipeline = pipeline.sharpen(1, 1, 2); // sigma, flat, jagged
  }

  // 5. Binarization (adaptive threshold - convertim la alb-negru)
  if (binarize) {
    // Sharp nu are adaptive threshold direct, dar putem folosi threshold
    // Vom folosi o combinație de normalizare și threshold
    pipeline = pipeline
      .normalise() // Normalizează contrastul
      .threshold(128, { grayscale: true }); // Threshold la 128 (50% gri)
  }

  // 6. Morphological closing (pentru caractere rupte)
  // Sharp nu are morphological operations direct, dar putem folosi blur + threshold
  // pentru a uni caracterele apropiate
  if (binarize) {
    // Aplicăm un blur foarte ușor pentru a uni caracterele apropiate
    pipeline = pipeline.blur(0.3).threshold(128, { grayscale: true });
  }

  // 7. Deskew (îndreptare) - Sharp nu are deskew direct
  // Pentru deskew real, ar trebui folosită o bibliotecă specializată
  // Vom omite pentru moment, dar putem adăuga mai târziu dacă e necesar

  const processedBuffer = await pipeline.png().toBuffer();

  console.log('[Preprocess] Image preprocessed:', {
    originalSize: imageBuffer.length,
    processedSize: processedBuffer.length,
    dpi,
    operations: {
      grayscale: true,
      denoise,
      sharpen,
      binarize,
    },
  });

  return processedBuffer;
}

/**
 * Preprocesează o imagine PNG pentru Tesseract OCR
 * Versiune optimizată pentru Tesseract
 */
export async function preprocessForTesseract(imageBuffer: Buffer): Promise<Buffer> {
  return preprocessImageForOCR(imageBuffer, {
    dpi: 600,
    deskew: true,
    denoise: true,
    sharpen: true,
    binarize: true,
  });
}


