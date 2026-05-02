/**
 * API Route - Permanently Delete Products
 * POST /api/admin/products/permanent-delete
 *
 * Șterge permanent produsele (hard delete). Legăturile `product_images` se șterg în cascadă.
 * Obiectele R2 / rândurile `uploaded_images` nu sunt curățate aici — se pot folosi cron-ul
 * de cleanup sau fluxul de soft delete care șterge din bucket înainte de hard delete.
 * Uses POST because request bodies are not reliably forwarded for DELETE in many proxies/CDNs.
 */

import { NextRequest, NextResponse } from 'next/server';
import { revalidateTag } from 'next/cache';
import { supabaseAdmin } from '@/lib/supabase';
import { invalidateProductDerivedCaches } from '@/lib/server/products/invalidateDerivedCaches';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

async function handlePermanentDelete(request: NextRequest) {
  try {
    let body: { productIds?: unknown };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: 'Corp invalid (JSON lipsă sau invalid)' },
        { status: 400 }
      );
    }
    const raw = body?.productIds;
    const productIds = Array.isArray(raw)
      ? raw.map((id) => (typeof id === 'string' ? id : String(id))).filter(Boolean)
      : [];

    if (productIds.length === 0) {
      return NextResponse.json(
        { error: 'productIds este obligatoriu și trebuie să fie un array nevid de stringuri' },
        { status: 400 }
      );
    }

    if (!supabaseAdmin) {
      return NextResponse.json(
        { error: 'Supabase admin client not configured' },
        { status: 500 }
      );
    }

    console.log('[API] Permanently deleting products:', productIds);

    const { data: existingProducts, error: checkError } = await supabaseAdmin
      .from('products')
      .select('id')
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

    // Șterge referințele din anaf_licitatii (dacă există)
    await supabaseAdmin
      .from('anaf_licitatii')
      .update({ product_id: null, product_created: false })
      .in('product_id', existingIds);

    // Șterge permanent produsele (hard delete)
    const { data, error } = await supabaseAdmin
      .from('products')
      .delete()
      .in('id', existingIds)
      .select();

    if (error) {
      console.error('[API] Error permanently deleting products:', error);
      return NextResponse.json(
        { error: error.message || 'Failed to permanently delete products' },
        { status: 500 }
      );
    }

    const deletedCount = data?.length || 0;
    revalidateTag('ro-listings', 'max');
    await invalidateProductDerivedCaches('admin-products-permanent-delete');
    console.log(`[API] Successfully permanently deleted ${deletedCount} product(s)`);

    return NextResponse.json({
      success: true,
      deletedCount,
      deletedIds: data?.map(p => p.id) || [],
      message: `${deletedCount} produs(e) au fost șterse permanent. Această acțiune nu poate fi anulată.`,
    });
  } catch (error: any) {
    console.error('[API] Error in permanent delete products route:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  return handlePermanentDelete(request);
}






