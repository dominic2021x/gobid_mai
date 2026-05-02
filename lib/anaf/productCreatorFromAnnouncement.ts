/**
 * Product Creator pentru ANAF Announcements (scraped)
 * Creează automat produse din anunțuri ANAF extrase de pe site
 */

import { supabaseAdmin } from '@/lib/supabase';
import { ANAFAnnouncement } from './scraper';
import { slugify } from '@/lib/slugify';
import { enhanceProduct } from '@/lib/ai/ai-product-enhancer';
import { enqueueImageMirrorJobsForProduct } from '@/lib/image-jobs/enqueue';
import { generateANAFImage } from './imageGenerator';

export interface ProductCreationResult {
  productId?: string;
  success: boolean;
  error?: string;
}

/**
 * Creează un produs automat dintr-un anunț ANAF
 */
export async function createProductFromANAFAnnouncement(
  importId: string,
  announcement: ANAFAnnouncement
): Promise<ProductCreationResult> {
  if (!supabaseAdmin) {
    throw new Error('Supabase admin client not configured');
  }

  try {
    console.log(`[ANAF Announcement] 🔄 Creating product from announcement: ${announcement.title}`);

    const slug = slugify(announcement.title);

    const sourceUrls =
      announcement.images && announcement.images.length > 0
        ? announcement.images.slice(0, 10).filter((u): u is string => typeof u === 'string' && u.trim().length > 0)
        : [];

    let processedImages: string[] = [...sourceUrls];
    if (processedImages.length === 0) {
      console.log(`[ANAF Announcement] 📸 No images found, generating ANAF fallback image...`);
      const anafImageResult = await generateANAFImage({
        localitate: announcement.location || 'România',
        subcategory: 'licitatii-publice',
        imageText: announcement.title,
      });
      if (anafImageResult?.url) {
        processedImages = [anafImageResult.url];
      }
    }

    const category = announcement.category || 'alte';
    const subcategory = 'licitatii-publice';

    const customFields: Record<string, unknown> = {
      sursa: 'ANAF',
      url_anaf: announcement.url,
      data_extragere: announcement.extractedAt,
    };

    if (announcement.location) {
      customFields.locatie = announcement.location;
    }

    if (announcement.date) {
      customFields.data_licitatie = announcement.date;
    }

    if (announcement.pdfUrl) {
      customFields.pdf_url = announcement.pdfUrl;
    }

    const startingPrice = announcement.price || 0;

    let description = announcement.description || announcement.title;
    
    try {
      const enhanced = await enhanceProduct({
        titlu: announcement.title,
        descriere: description,
      });
      
      if (enhanced.newDescription) {
        description = enhanced.newDescription;
      }
    } catch (error: unknown) {
      console.warn(`[ANAF Announcement] ⚠️ Failed to enhance description:`, error instanceof Error ? error.message : error);
    }

    const { data: existingProduct } = await supabaseAdmin
      .from('products')
      .select('id')
      .eq('slug', slug)
      .eq('status', 'active')
      .single();

    if (existingProduct) {
      console.log(`[ANAF Announcement] ⚠️ Product with slug ${slug} already exists`);
      return {
        success: false,
        error: 'Product already exists',
        productId: existingProduct.id,
      };
    }

    const { data: product, error: productError } = await supabaseAdmin
      .from('products')
      .insert({
        title: announcement.title,
        description,
        category,
        subcategory,
        sku: `ANAF-${announcement.id}`,
        starting_price: startingPrice,
        currency: 'RON',
        product_type: 'licitatii-publice',
        status: startingPrice > 0 ? 'active' : 'draft',
        images: processedImages,
        custom_fields: customFields,
        slug,
        url: `/licitatii-publice/${slug}`,
        seo: {
          title: `${announcement.title} - Licitație Publică`,
          description: description.substring(0, 160),
          keywords: [category, 'licitatie', 'anaf', 'licitatie publica'],
        },
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (productError) {
      console.error(`[ANAF Announcement] ❌ Error creating product:`, productError);
      throw productError;
    }

    if (!product?.id) {
      return { success: false, error: "Produsul nu a fost creat." };
    }

    console.log(`[ANAF Announcement] ✅ Product created: ${product.id}`);

    if (processedImages.length > 0) {
      await enqueueImageMirrorJobsForProduct(supabaseAdmin, {
        productId: product.id,
        userId: null,
        imageUrls: processedImages,
      });
    }

    return {
      success: true,
      productId: product.id,
    };
  } catch (error: unknown) {
    console.error(`[ANAF Announcement] ❌ Error creating product from announcement:`, error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}
