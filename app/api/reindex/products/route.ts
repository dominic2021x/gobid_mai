import { OPENAI_SDK_API_KEY } from "@/lib/ai/openaiSdkApiKey";

/**
 * POST /api/reindex/products
 * Reindexes products in Pinecone for image search
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { visionToProductQuery } from '@/lib/image-search/vision';
import { buildSearchableText } from '@/lib/image-search/text-builder';
import { embedText } from '@/lib/image-search/search';
import { upsertVector, ensureIndex } from '@/lib/pinecone';
import OpenAI from 'openai';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


const openai = new OpenAI({
  apiKey: OPENAI_SDK_API_KEY,
});

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE || process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * Gets all products from database
 * TODO: This is a placeholder - adjust based on your actual product schema
 */
async function getAllProducts(): Promise<Array<{
  id: string;
  title: string;
  images: string[];
  brand?: string;
  category?: string;
  price?: number;
  [key: string]: any;
}>> {
  const { data, error } = await supabase
    .from('products')
    .select('id, title, description, images, category, subcategory, starting_price_ron, product_type, slug, url, custom_fields')
    .eq('status', 'active')
    .not('images', 'is', null);

  if (error) {
    console.error('[Reindex] Error fetching products:', error);
    throw new Error(`Failed to fetch products: ${error.message}`);
  }

  return (data || []).map(product => {
    // Extract brand from custom_fields if available
    const customFields = product.custom_fields || {};
    const brand = customFields.brand || customFields.marca || customFields.manufacturer || null;
    
    return {
      id: product.id,
      title: product.title || 'Fără titlu',
      images: Array.isArray(product.images) 
        ? product.images.filter((img: any) => typeof img === 'string')
        : (typeof product.images === 'string' ? [product.images] : []),
      brand: brand,
      category: product.category || product.subcategory || null,
      price: product.starting_price_ron || null,
      description: product.description || null,
      product_type: product.product_type || null,
      url: product.url || null,
    };
  });
}

/**
 * Extracts real Cloudinary URL from Next.js Image Optimization URL
 */
function extractRealImageUrl(url: string): string {
  // If it's a Next.js Image Optimization URL, extract the real URL
  if (url.includes('/_next/image?url=')) {
    try {
      const urlObj = new URL(url, 'http://localhost:3000');
      const imageUrl = urlObj.searchParams.get('url');
      if (imageUrl) {
        return decodeURIComponent(imageUrl);
      }
    } catch {
      // If parsing fails, return original
    }
  }
  return url;
}

/**
 * Generates description pack from product image using GPT-4o
 */
async function generateDescriptionPack(
  imageUrl: string,
  title: string
): Promise<{
  caption: string;
  attributes: {
    category: string | null;
    brand: string | null;
    color: string | null;
    material: string | null;
    pattern: string | null;
    gender: string | null;
    key_details: string[];
  };
}> {
  try {
    // Extract real URL if it's a Next.js optimized URL
    const realImageUrl = extractRealImageUrl(imageUrl);
    
    // Fetch image
    const imageResponse = await fetch(realImageUrl);
    if (!imageResponse.ok) {
      throw new Error(`Failed to fetch image: ${imageResponse.statusText}`);
    }

    const arrayBuffer = await imageResponse.arrayBuffer();
    const imageBuffer = Buffer.from(arrayBuffer);
    const contentType = imageResponse.headers.get('content-type') || 'image/jpeg';

    // Use vision API to extract structured data
    const query = await visionToProductQuery(imageBuffer, contentType);

    return {
      caption: query.caption,
      attributes: query.attributes,
    };
  } catch (error: any) {
    console.warn(`[Reindex] Error generating description from image, using title fallback:`, error.message);
    
    // Fallback: use title only
    return {
      caption: title,
      attributes: {
        category: null,
        brand: null,
        color: null,
        material: null,
        pattern: null,
        gender: null,
        key_details: [],
      },
    };
  }
}

/**
 * Basic exponential backoff retry
 */
async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 1000
): Promise<T> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      if (attempt === maxRetries - 1) throw error;
      
      const delay = baseDelay * Math.pow(2, attempt);
      console.warn(`[Reindex] Retry ${attempt + 1}/${maxRetries} after ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  throw new Error('Max retries exceeded');
}

export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    if (!process.env.OPENAI_API_KEY) {
      console.error('[Reindex] OPENAI_API_KEY is not configured');
      return NextResponse.json(
        { error: 'OPENAI_API_KEY is not configured', message: 'OPENAI_API_KEY is not configured' },
        { status: 500 }
      );
    }

    if (!process.env.PINECONE_API_KEY) {
      console.error('[Reindex] PINECONE_API_KEY is not configured');
      return NextResponse.json(
        { error: 'PINECONE_API_KEY is not configured', message: 'PINECONE_API_KEY is not configured' },
        { status: 500 }
      );
    }

    // Check Supabase connection
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || (!process.env.SUPABASE_SERVICE_ROLE && !process.env.SUPABASE_SERVICE_ROLE_KEY)) {
      console.error('[Reindex] Supabase credentials are not configured');
      return NextResponse.json(
        { error: 'Supabase credentials are not configured', message: 'NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE is missing' },
        { status: 500 }
      );
    }

    // Ensure index exists - use 1536 for compatibility with existing index
    console.log('[Reindex] Ensuring Pinecone index exists...');
    try {
      await ensureIndex(1536); // text-embedding-3-small dimension (compatible with existing index)
      console.log('[Reindex] Pinecone index ready');
    } catch (error: any) {
      console.error('[Reindex] Error ensuring index:', error);
      return NextResponse.json(
        { error: 'Failed to ensure Pinecone index', message: error.message },
        { status: 500 }
      );
    }

    // Get all products
    console.log('[Reindex] Fetching products from database...');
    const products = await getAllProducts();
    console.log(`[Reindex] Found ${products.length} products to index`);

    const results = {
      success: 0,
      errors: 0,
      skipped: 0,
    };

    // Process in batches
    const batchSize = 10;
    for (let i = 0; i < products.length; i += batchSize) {
      const batch = products.slice(i, i + batchSize);
      
      await Promise.all(
        batch.map(async (product) => {
          try {
            // Skip if no images
            if (!product.images || product.images.length === 0) {
              results.skipped++;
              return;
            }

            // Use first image as primary
            let primaryImage = product.images[0];
            if (!primaryImage || typeof primaryImage !== 'string') {
              results.skipped++;
              return;
            }

            // Extract real Cloudinary URL if it's a Next.js Image Optimization URL
            primaryImage = extractRealImageUrl(primaryImage);
            console.log(`[Reindex] Processing product ${product.id} with image: ${primaryImage.substring(0, 100)}...`);

            // Generate description pack from image
            let descriptionPack;
            try {
              descriptionPack = await generateDescriptionPack(primaryImage, product.title);
            } catch (error: any) {
              console.error(`[Reindex] Error generating description for product ${product.id}:`, error.message);
              // Skip this product if we can't generate description
              results.skipped++;
              return;
            }

            // Build searchable text
            const searchableText = buildSearchableText({
              caption: descriptionPack.caption,
              attributes: descriptionPack.attributes,
              identifiers: {
                model_code: null,
                sku_text: null,
                visible_text: null,
              },
              confidence: {
                category: 0.8,
                brand: 0.8,
                overall: 0.8,
              },
            });

            // Create embedding with 1536 dimensions (text-embedding-3-small)
            let embedding;
            try {
              embedding = await embedText(searchableText, 1536);
            } catch (error: any) {
              console.error(`[Reindex] Error creating embedding for product ${product.id}:`, error.message);
              results.errors++;
              return;
            }

            // Prepare metadata - store original image URL (not Next.js optimized)
            const metadata = {
              productId: product.id,
              title: product.title,
              brand: product.brand || null,
              category: product.category || null,
              price: product.price || null,
              image: primaryImage, // Store real Cloudinary URL
              url: product.url || null,
            };

            // Upsert to Pinecone with retry
            try {
              await retryWithBackoff(async () => {
                await upsertVector(`product:${product.id}`, embedding, metadata);
              });
            } catch (error: any) {
              console.error(`[Reindex] Error upserting to Pinecone for product ${product.id}:`, error.message);
              results.errors++;
              return;
            }

            results.success++;

            if (results.success % 50 === 0) {
              console.log(`[Reindex] Progress: ${results.success}/${products.length} indexed...`);
            }
          } catch (error: any) {
            console.error(`[Reindex] Error indexing product ${product.id}:`, error.message);
            results.errors++;
          }
        })
      );

      // Rate limiting between batches
      if (i + batchSize < products.length) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

    const totalTime = Date.now() - startTime;
    console.log(`[Reindex] Complete in ${totalTime}ms: ${results.success} success, ${results.errors} errors, ${results.skipped} skipped`);

    return NextResponse.json({
      success: true,
      total: products.length,
      indexed: results.success,
      errors: results.errors,
      skipped: results.skipped,
      duration: totalTime,
    });
  } catch (error: any) {
    console.error('[Reindex] Fatal error:', error);
    return NextResponse.json(
      {
        error: 'Failed to reindex products',
        message: error.message,
      },
      { status: 500 }
    );
  }
}
