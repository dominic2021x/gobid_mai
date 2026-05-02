/**
 * POST /api/products/delete-bulk
 *
 * Șterge produsele selectate ale utilizatorului autentificat.
 * Verifică ownership (user_id). Șterge obiectele R2 pentru imagini, apoi soft delete în DB.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getRequestAuthUser } from '@/lib/auth/getRequestAuthUser';
import {
  deleteManyR2ObjectsWithRetry,
  getR2EnvConfig,
  resolveR2ObjectKeyFromProductImageUrl,
} from '@/lib/upload/r2-server';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

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

export async function POST(request: NextRequest) {
  try {
    const sessionUser = await getRequestAuthUser(request);
    if (!sessionUser?.id) {
      return NextResponse.json({ error: 'Autentificare necesară' }, { status: 401 });
    }

    if (!supabaseAdmin) {
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }

    const userId = sessionUser.id;

    const body = await request.json();
    const { productIds } = body;
    if (!productIds || !Array.isArray(productIds) || productIds.length === 0) {
      return NextResponse.json(
        { error: 'productIds este obligatoriu și trebuie să fie un array nevid' },
        { status: 400 }
      );
    }

    // Doar produsele care aparțin utilizatorului
    const { data: existingProducts, error: checkError } = await supabaseAdmin
      .from('products')
      .select('id, images, user_id')
      .in('id', productIds)
      .eq('user_id', userId);

    if (checkError) {
      console.error('[delete-bulk] Error checking products:', checkError);
      return NextResponse.json(
        { error: checkError.message || 'Eroare la verificare produse' },
        { status: 500 }
      );
    }

    if (!existingProducts || existingProducts.length === 0) {
      return NextResponse.json({
        success: true,
        deletedCount: 0,
        deletedIds: [],
        message: 'Nu s-au găsit produse de șters (sau nu îți aparțin).',
      });
    }

    const existingIds = existingProducts.map((p) => p.id);
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
      console.warn('[delete-bulk] R2 env incomplete; skipped bucket deletes.');
    }

    const uniqueImgIds = [...new Set(uploadedImageIds)];
    if (uniqueImgIds.length > 0) {
      const { error: uploadedImagesDeleteErr } = await supabaseAdmin
        .from('uploaded_images')
        .delete()
        .in('id', uniqueImgIds);
      if (uploadedImagesDeleteErr) {
        console.warn('[delete-bulk] Could not delete uploaded_images rows:', uploadedImagesDeleteErr);
      }
    }

    // Soft delete: status deleted + golim imaginile
    const { data, error } = await supabaseAdmin
      .from('products')
      .update({
        status: 'deleted',
        images: [],
        updated_at: new Date().toISOString(),
      })
      .in('id', existingIds)
      .eq('user_id', userId)
      .select();

    if (error) {
      console.error('[delete-bulk] Error updating products:', error);
      return NextResponse.json(
        { error: error.message || 'Eroare la ștergere' },
        { status: 500 }
      );
    }

    const deletedCount = data?.length ?? 0;
    return NextResponse.json({
      success: true,
      deletedCount,
      deletedIds: data?.map((p) => p.id) ?? [],
      message: `${deletedCount} produs(e) au fost șterse. Fișierele din stocare au fost eliminate unde e configurat R2.`,
    });
  } catch (err: unknown) {
    console.error('[delete-bulk] Error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Eroare internă' },
      { status: 500 }
    );
  }
}
