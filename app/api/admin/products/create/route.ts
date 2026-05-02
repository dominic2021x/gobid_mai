/**
 * API Route - Create Product
 * POST /api/admin/products/create
 * Creates a product using supabaseAdmin to bypass RLS
 */

import { NextRequest, NextResponse } from 'next/server';
import { revalidateTag } from 'next/cache';
import { supabaseAdmin } from '@/lib/supabase';
import { normalizeCategoryTag } from '@/lib/ro/getListingsCached';
import { enqueueImageMirrorJobsForProduct } from '@/lib/image-jobs/enqueue';
import { invalidateProductDerivedCaches } from '@/lib/server/products/invalidateDerivedCaches';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


export async function POST(request: NextRequest) {
  try {
    const insertPayload = await request.json();

    if (!insertPayload || typeof insertPayload !== 'object') {
      return NextResponse.json(
        { error: 'Invalid payload' },
        { status: 400 }
      );
    }

    if (!supabaseAdmin) {
      console.error('supabaseAdmin is not configured');
      return NextResponse.json(
        { error: 'Server configuration error' },
        { status: 500 }
      );
    }

    // Ensure images is always a valid array
    if (insertPayload.images !== undefined) {
      if (!Array.isArray(insertPayload.images)) {
        insertPayload.images = [];
      }
      insertPayload.images = insertPayload.images.filter((img: unknown) => {
        return typeof img === 'string' && (img as string).trim() !== '';
      });
    }

    // Ensure JSONB fields are valid
    if (insertPayload.custom_fields !== undefined && typeof insertPayload.custom_fields !== 'object') {
      insertPayload.custom_fields = {};
    }
    if (insertPayload.seo !== undefined && typeof insertPayload.seo !== 'object') {
      insertPayload.seo = { title: '', description: '', keywords: [] };
    }
    if (insertPayload.documents !== undefined && !Array.isArray(insertPayload.documents)) {
      insertPayload.documents = [];
    }

    // Remove undefined values
    Object.keys(insertPayload).forEach((key) => {
      if (insertPayload[key] === undefined) {
        delete insertPayload[key];
      }
    });

    const { data: createdProduct, error: createError } = await supabaseAdmin
      .from('products')
      .insert(insertPayload)
      .select()
      .maybeSingle();

    if (createError) {
      console.error('Create product error:', createError);
      return NextResponse.json(
        { error: createError.message, details: createError },
        { status: 500 }
      );
    }

    if (
      createdProduct?.id &&
      Array.isArray(insertPayload.images) &&
      insertPayload.images.length > 0
    ) {
      await enqueueImageMirrorJobsForProduct(supabaseAdmin, {
        productId: createdProduct.id,
        userId: typeof insertPayload.user_id === 'string' ? insertPayload.user_id : null,
        imageUrls: insertPayload.images as string[],
      });
    }

    revalidateTag('ro-listings', 'max');
    const catSlug = normalizeCategoryTag(createdProduct?.category);
    if (catSlug) revalidateTag(`ro-listings:category:${catSlug}`, 'max');
    await invalidateProductDerivedCaches('admin-products-create');
    return NextResponse.json(
      { success: true, data: createdProduct },
      { status: 200 }
    );
  } catch (error: unknown) {
    const err = error as Error;
    console.error('Error in /api/admin/products/create:', err);
    return NextResponse.json(
      { error: err.message || 'Failed to create product' },
      { status: 500 }
    );
  }
}
