/**
 * API Route - Update Product
 * PUT /api/admin/products/update
 * Updates a product using supabaseAdmin to bypass RLS
 */

import { NextRequest, NextResponse } from 'next/server';
import { revalidateTag } from 'next/cache';
import { supabaseAdmin } from '@/lib/supabase';
import { normalizeCategoryTag } from '@/lib/ro/getListingsCached';
import { enqueueImageMirrorJobsForProduct } from '@/lib/image-jobs/enqueue';
import { invalidateProductDerivedCaches } from '@/lib/server/products/invalidateDerivedCaches';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, ...updateData } = body;

    if (!id) {
      return NextResponse.json(
        { error: 'Product ID is required' },
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
    if (updateData.images !== undefined) {
      if (!Array.isArray(updateData.images)) {
        updateData.images = [];
      }
      // Filter out invalid images
      updateData.images = updateData.images.filter((img: any) => {
        return typeof img === 'string' && img.trim() !== '';
      });
    }

    // Ensure JSONB fields are valid
    if (updateData.custom_fields !== undefined && typeof updateData.custom_fields !== 'object') {
      updateData.custom_fields = {};
    }
    if (updateData.seo !== undefined && typeof updateData.seo !== 'object') {
      updateData.seo = { title: '', description: '', keywords: [] };
    }
    if (updateData.documents !== undefined && !Array.isArray(updateData.documents)) {
      updateData.documents = [];
    }

    console.log('🔧 API Update - Product ID:', id);
    console.log('🔧 API Update - Images:', updateData.images);
    console.log('🔧 API Update - Images count:', updateData.images?.length);

    const { data: currentProduct } = await supabaseAdmin
      .from('products')
      .select('category, user_id')
      .eq('id', id)
      .maybeSingle();

    const uid = (currentProduct as { user_id?: string } | null)?.user_id;

    const { data: updatedProduct, error: updateError } = await supabaseAdmin
      .from('products')
      .update(updateData)
      .eq('id', id)
      .select()
      .maybeSingle();

    if (updateError) {
      console.error('❌ API Update error:', updateError);
      return NextResponse.json(
        { error: updateError.message, details: updateError },
        { status: 500 }
      );
    }

    if (
      uid &&
      updatedProduct?.id &&
      Array.isArray(updateData.images) &&
      updateData.images.length > 0
    ) {
      await enqueueImageMirrorJobsForProduct(supabaseAdmin, {
        productId: id,
        userId: uid,
        imageUrls: updateData.images as string[],
      });
    }

    revalidateTag('ro-listings', 'max');
    const oldSlug = normalizeCategoryTag(currentProduct?.category);
    const newSlug = normalizeCategoryTag(updatedProduct?.category ?? updateData.category);
    if (oldSlug !== newSlug) {
      if (oldSlug) revalidateTag(`ro-listings:category:${oldSlug}`, 'max');
      if (newSlug) revalidateTag(`ro-listings:category:${newSlug}`, 'max');
    } else if (newSlug) {
      revalidateTag(`ro-listings:category:${newSlug}`, 'max');
    }
    await invalidateProductDerivedCaches('admin-products-update');
    console.log('✅ API Update success:', updatedProduct);
    console.log('📸 API Update - Images in response:', updatedProduct?.images);

    return NextResponse.json(
      { success: true, data: updatedProduct },
      { status: 200 }
    );
  } catch (error: any) {
    console.error('Error in /api/admin/products/update:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to update product' },
      { status: 500 }
    );
  }
}







