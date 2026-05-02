/**
 * Upload Street View Image to Cloudinary
 * Descarcă imaginea Street View de la Google și o salvează în Cloudinary
 */

import * as cloudinary from 'cloudinary';

export interface UploadStreetViewResult {
  url: string | null;
  success: boolean;
  error?: string;
}

/**
 * Descarcă și salvează o imagine Street View în Cloudinary
 * @param streetViewUrl URL-ul imaginii Street View de la Google
 * @returns URL-ul imaginii în Cloudinary sau null dacă eșuează
 */
export async function uploadStreetViewToCloudinary(
  streetViewUrl: string
): Promise<UploadStreetViewResult> {
  // Verifică configurarea Cloudinary
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;

  if (!cloudName || !apiKey || !apiSecret) {
    console.error('[Street View Upload] Cloudinary not configured');
    return {
      url: null,
      success: false,
      error: 'Cloudinary not configured',
    };
  }

  if (!streetViewUrl || streetViewUrl.trim().length === 0) {
    return {
      url: null,
      success: false,
      error: 'Empty Street View URL',
    };
  }

  try {
    // Configure Cloudinary
    cloudinary.v2.config({
      cloud_name: cloudName,
      api_key: apiKey,
      api_secret: apiSecret,
    });

    console.log(`[Street View Upload] Downloading image from: ${streetViewUrl}`);
    console.log(`[Street View Upload] URL length: ${streetViewUrl.length}`);
    console.log(`[Street View Upload] URL preview: ${streetViewUrl.substring(0, 150)}...`);

    // Descarcă imaginea de la Google Street View
    const imageResponse = await fetch(streetViewUrl, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });
    
    console.log(`[Street View Upload] Response status: ${imageResponse.status} ${imageResponse.statusText}`);
    console.log(`[Street View Upload] Response headers:`, {
      contentType: imageResponse.headers.get('content-type'),
      contentLength: imageResponse.headers.get('content-length'),
    });
    
    if (!imageResponse.ok) {
      const errorText = await imageResponse.text().catch(() => '');
      console.error(`[Street View Upload] Failed to download image: ${imageResponse.status} ${imageResponse.statusText}`);
      console.error(`[Street View Upload] Error response: ${errorText.substring(0, 500)}`);
      return {
        url: null,
        success: false,
        error: `Failed to download image: ${imageResponse.status} ${imageResponse.statusText}`,
      };
    }

    // Convertește răspunsul în buffer
    const arrayBuffer = await imageResponse.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Verifică dimensiunea (max 10MB pentru Cloudinary free tier)
    const MAX_SIZE = 10 * 1024 * 1024;
    if (buffer.length > MAX_SIZE) {
      console.error(`[Street View Upload] Image too large: ${buffer.length} bytes`);
      return {
        url: null,
        success: false,
        error: 'Image too large',
      };
    }

    // Convertește buffer în base64 data URI
    const base64String = buffer.toString('base64');
    const mimeType = imageResponse.headers.get('content-type') || 'image/jpeg';
    const dataUri = `data:${mimeType};base64,${base64String}`;

    // Generează public_id unic
    const timestamp = Date.now();
    const randomString = Math.random().toString(36).substring(2, 15);
    const publicId = `products/streetview/${timestamp}_${randomString}`;

    console.log(`[Street View Upload] Uploading to Cloudinary with public_id: ${publicId}`);

    // Upload la Cloudinary
    const uploadResult = await cloudinary.v2.uploader.upload(dataUri, {
      folder: 'products/streetview',
      public_id: publicId,
      resource_type: 'image',
      overwrite: false,
      invalidate: true,
      transformation: [
        {
          quality: 'auto:good',
          fetch_format: 'auto',
        }
      ]
    });

    console.log(`[Street View Upload] Successfully uploaded to Cloudinary: ${uploadResult.secure_url}`);

    return {
      url: uploadResult.secure_url,
      success: true,
    };
  } catch (error: any) {
    console.error('[Street View Upload] Error uploading Street View image:', error.message);
    return {
      url: null,
      success: false,
      error: error.message || 'Unknown error',
    };
  }
}

