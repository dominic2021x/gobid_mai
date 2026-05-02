/**
 * API Route - Restore Deleted Products
 * POST /api/admin/products/restore
 * 
 * Restaurează produse șterse (schimbă statusul în 'active' sau 'draft')
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { productIds, status = 'active' } = body;

    if (!productIds || !Array.isArray(productIds) || productIds.length === 0) {
      return NextResponse.json(
        { error: 'productIds este obligatoriu și trebuie să fie un array nevid' },
        { status: 400 }
      );
    }

    if (status !== 'active' && status !== 'draft') {
      return NextResponse.json(
        { error: 'status trebuie să fie "active" sau "draft"' },
        { status: 400 }
      );
    }

    if (!supabaseAdmin) {
      return NextResponse.json(
        { error: 'Supabase admin client not configured' },
        { status: 500 }
      );
    }

    console.log('[API] Restoring products:', productIds, 'to status:', status);

    // Verifică dacă produsele există și sunt șterse
    const { data: existingProducts, error: checkError } = await supabaseAdmin
      .from('products')
      .select('id, status')
      .in('id', productIds)
      .eq('status', 'deleted');

    if (checkError) {
      console.error('[API] Error checking products:', checkError);
      return NextResponse.json(
        { error: checkError.message || 'Failed to check products' },
        { status: 500 }
      );
    }

    if (!existingProducts || existingProducts.length === 0) {
      return NextResponse.json({
        success: false,
        restoredCount: 0,
        message: 'Nu s-au găsit produse șterse de restaurat',
      });
    }

    const existingIds = existingProducts.map(p => p.id);

    // Restaurează produsele (schimbă statusul)
    const { data, error } = await supabaseAdmin
      .from('products')
      .update({ 
        status: status,
        updated_at: new Date().toISOString()
      })
      .in('id', existingIds)
      .select();

    if (error) {
      console.error('[API] Error restoring products:', error);
      return NextResponse.json(
        { error: error.message || 'Failed to restore products' },
        { status: 500 }
      );
    }

    const restoredCount = data?.length || 0;
    console.log(`[API] Successfully restored ${restoredCount} product(s)`);

    return NextResponse.json({
      success: true,
      restoredCount,
      restoredIds: data?.map(p => p.id) || [],
      message: `${restoredCount} produs(e) au fost restaurate cu status "${status}"`,
    });
  } catch (error: any) {
    console.error('[API] Error in restore products route:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}






