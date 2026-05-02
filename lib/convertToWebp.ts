import sharp from 'sharp';

/**
 * Converts an image buffer to WebP format with optimization
 * @param inputBuffer - The input image buffer (JPG, PNG, etc.)
 * @param quality - WebP quality (0-100), default 80
 * @returns Optimized WebP buffer
 */
export async function convertToWebp(
  inputBuffer: Buffer,
  quality: number = 80
): Promise<Buffer> {
  try {
    return await sharp(inputBuffer)
      .webp({ quality, effort: 6 })
      .toBuffer();
  } catch (error) {
    console.error('Error converting to WebP:', error);
    throw error;
  }
}

/**
 * Converts an image buffer to AVIF format if possible, otherwise WebP
 * @param inputBuffer - The input image buffer
 * @param quality - Quality (0-100), default 80
 * @returns Optimized AVIF or WebP buffer
 */
export async function convertToModernFormat(
  inputBuffer: Buffer,
  quality: number = 80
): Promise<{ buffer: Buffer; format: 'avif' | 'webp' }> {
  try {
    // Try AVIF first (better compression but not all browsers support it)
    const avifBuffer = await sharp(inputBuffer)
      .avif({ quality, effort: 4 })
      .toBuffer();
    
    return { buffer: avifBuffer, format: 'avif' };
  } catch (error) {
    // Fallback to WebP if AVIF fails
    console.warn('AVIF conversion failed, using WebP:', error);
    const webpBuffer = await convertToWebp(inputBuffer, quality);
    return { buffer: webpBuffer, format: 'webp' };
  }
}

/**
 * Optimizes an image (resize if needed, convert format)
 * Note: SVG files should NOT be processed through this function - they should be saved as-is
 * @param inputBuffer - Input image buffer
 * @param maxWidth - Maximum width (optional)
 * @param maxHeight - Maximum height (optional)
 * @param quality - Quality (0-100)
 * @returns Optimized image buffer and metadata
 */
export async function optimizeImage(
  inputBuffer: Buffer,
  maxWidth?: number,
  maxHeight?: number,
  quality: number = 80
): Promise<{
  buffer: Buffer;
  format: 'webp' | 'avif';
  width: number;
  height: number;
  size: number;
}> {
  try {
    // Check if input is SVG (should not be processed)
    const svgPattern = /<svg[\s\S]*?<\/svg>/i;
    const bufferString = inputBuffer.toString('utf-8');
    if (svgPattern.test(bufferString)) {
      throw new Error('SVG files should not be processed through optimizeImage. Save them as-is.');
    }

    const image = sharp(inputBuffer);
    const metadata = await image.metadata();
    
    let processedImage = image;
    
    // Resize if needed
    if (maxWidth || maxHeight) {
      processedImage = processedImage.resize(maxWidth, maxHeight, {
        fit: 'inside',
        withoutEnlargement: true,
      });
    }
    
    // Get final metadata after resize
    const finalMetadata = await processedImage.metadata();
    
    // Convert to modern format
    const { buffer, format } = await convertToModernFormat(
      await processedImage.toBuffer(),
      quality
    );
    
    return {
      buffer,
      format,
      width: finalMetadata.width || metadata.width || 0,
      height: finalMetadata.height || metadata.height || 0,
      size: buffer.length,
    };
  } catch (error) {
    console.error('Error optimizing image:', error);
    throw error;
  }
}
