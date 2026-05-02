/**
 * API Route - Delete Products
 * DELETE /api/admin/products/delete
 *
 * Șterge unul sau mai multe produse (folosește supabaseAdmin pentru a bypass RLS).
 * Obiectele din R2 legate de imagini sunt șterse din bucket; apoi soft delete în DB.
 */

import { NextRequest, NextResponse } from 'next/server';
import { revalidateTag } from 'next/cache';
import { supabaseAdmin } from '@/lib/supabase';
import { normalizeCategoryTag } from '@/lib/ro/getListingsCached';
import { invalidateProductDerivedCaches } from '@/lib/server/products/invalidateDerivedCaches';
import {
  deleteManyR2ObjectsWithRetry,
  getR2EnvConfig,
  resolveR2ObjectKeyFromProductImageUrl,
} from '@/lib/upload/r2-server';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

/** Extrage URL-urile string din products.images */
function collectImageUrls(products: { images?: unknown[] }[]): string[] {
  const out = new Set<string>();
  for (const p of products) {
    const imgs = Array.isArray(p.images) ? p.images : [];
    for (const img of imgs) {
      const url =
        typeof img === 'string'
          ? img
          : img && typeof img === 'object' && 'url' in img
            ? (img as { url?: string }).url
            : null;
      if (typeof url === 'string' && url.trim()) {
        out.add(url.trim());
      }
    }
  }
  return Array.from(out);
}

export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json();
    const { productIds } = body;

    if (!productIds || !Array.isArray(productIds) || productIds.length === 0) {
      return NextResponse.json(
        { error: 'productIds este obligatoriu și trebuie să fie un array nevid' },
        { status: 400 }
      );
    }

    if (!supabaseAdmin) {
      return NextResponse.json(
        { error: 'Supabase admin client not configured' },
        { status: 500 }
      );
    }

    console.log('[API] Deleting products:', productIds);

    // Obține produsele cu imaginile lor (și category pentru revalidare tag-uri)
    const { data: existingProducts, error: checkError } = await supabaseAdmin
      .from('products')
      .select('id, images, category')
      .in('id', productIds);

    if (checkError) {
      console.error('[API] Error checking products:', checkError);
      return NextResponse.json(
        { error: checkError.message || 'Failed to check products' },
        { status: 500 }
      );
    }

    if (!existingProducts || existingProducts.length === 0) {
      return NextResponse.json({
        success: true,
        deletedCount: 0,
        deletedIds: [],
        message: 'Nu s-au găsit produse de șters',
      });
    }

    const existingIds = existingProducts.map(p => p.id);
    console.log('[API] Found products to delete:', existingIds);
    const imageUrls = collectImageUrls(existingProducts);

    const bucketName = process.env.R2_BUCKET_NAME ?? '';
    const keysToDeleteR2 = new Set<string>();

    const { data: pimRows } = await supabaseAdmin
      .from('product_images')
      .select('image_id, uploaded_images(storage_key, variant_urls)')
      .in('product_id', existingIds);

    type UiRow = { storage_key?: string | null; variant_urls?: Record<string, string> | null };
    const uploadedImageIds: string[] = [];

    for (const row of pimRows ?? []) {
      if (row.image_id) uploadedImageIds.push(String(row.image_id));
      const meta = row.uploaded_images as UiRow | null;
      if (meta?.storage_key) keysToDeleteR2.add(meta.storage_key);
      const v = meta?.variant_urls;
      if (v && typeof v === 'object') {
        for (const val of Object.values(v)) {
          if (typeof val !== 'string' || !val.trim()) continue;
          const vk = resolveR2ObjectKeyFromProductImageUrl(val, bucketName);
          if (vk) keysToDeleteR2.add(vk);
        }
      }
    }

    for (const url of imageUrls) {
      const k = resolveR2ObjectKeyFromProductImageUrl(url, bucketName);
      if (k) keysToDeleteR2.add(k);
    }

    const r2Cfg = getR2EnvConfig();
    if (r2Cfg && keysToDeleteR2.size > 0) {
      await deleteManyR2ObjectsWithRetry(r2Cfg, keysToDeleteR2);
    } else if (!r2Cfg && keysToDeleteR2.size > 0) {
      console.warn(
        '[API] R2 nu e configurat complet (R2_ACCOUNT_ID, keys, bucket, public base URL); nu s-au șters obiectele din bucket.'
      );
    }

    // Șterge rândurile uploaded_images legate de aceste produse (metadata + variante)
    const uniqueImgIds = [...new Set(uploadedImageIds)];
    if (uniqueImgIds.length > 0) {
      const { error: uploadedImagesDeleteErr } = await supabaseAdmin
        .from('uploaded_images')
        .delete()
        .in('id', uniqueImgIds);
      if (uploadedImagesDeleteErr) {
        console.warn('[API] Could not delete uploaded_images rows:', uploadedImagesDeleteErr);
      }
    }

    // Soft delete: marchează produsele ca șterse (status: 'deleted') și golește imaginile în DB
    const { data, error } = await supabaseAdmin
      .from('products')
      .update({ 
        status: 'deleted',
        images: [],
        updated_at: new Date().toISOString()
      })
      .in('id', existingIds)
      .select();

    if (error) {
      console.error('[API] Error deleting products:', error);
      console.error('[API] Error details:', JSON.stringify(error, null, 2));
      return NextResponse.json(
        { error: error.message || 'Failed to delete products', details: error },
        { status: 500 }
      );
    }

    const deletedCount = data?.length || 0;
    console.log('[API] Deleted products:', data);

    revalidateTag('ro-listings', 'max');
    const categories = new Set(
      (existingProducts ?? [])
        .map((p: { category?: string | null }) => normalizeCategoryTag(p.category))
        .filter(Boolean)
    );
    categories.forEach((cat) => revalidateTag(`ro-listings:category:${cat}`, 'max'));
    await invalidateProductDerivedCaches('admin-products-soft-delete');
    console.log(`[API] Successfully deleted ${deletedCount} product(s)`);

    return NextResponse.json({
      success: true,
      deletedCount,
      deletedIds: data?.map(p => p.id) || [],
      message: `${deletedCount} produs(e) au fost marcate ca șterse (soft delete). Poți le poți restaura din pagina "Produse Sterse".`,
    });
  } catch (error: any) {
    console.error('[API] Error in delete products route:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

