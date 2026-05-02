/**
 * API Route - Debug Product
 * GET /api/debug/product?id=UUID sau slug
 * Verifică dacă un produs există în baza de date
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const productId = searchParams.get('id');

    if (!productId) {
      return NextResponse.json(
        { error: 'ID-ul produsului este obligatoriu. Folosește ?id=UUID sau ?id=slug' },
        { status: 400 }
      );
    }

    if (!supabaseAdmin) {
      return NextResponse.json(
        { error: 'supabaseAdmin nu este configurat' },
        { status: 500 }
      );
    }

    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    let product: any = null;
    let searchMethod = '';

    if (uuidRegex.test(productId)) {
      // Caută după UUID
      searchMethod = 'UUID';
      const { data, error } = await supabaseAdmin
        .from('products')
        .select('*')
        .eq('id', productId)
        .maybeSingle();
      
      product = data;
      
      return NextResponse.json({
        success: true,
        searchMethod,
        productId,
        found: !!product,
        product: product ? {
          id: product.id,
          slug: product.slug,
          title: product.title,
          product_type: product.product_type,
          status: product.status,
          user_id: product.user_id,
          starting_price_ron: product.starting_price_ron,
          starting_price_eur: product.starting_price_eur,
          created_at: product.created_at,
          updated_at: product.updated_at
        } : null,
        error: error ? {
          code: error.code,
          message: error.message,
          details: error.details,
          hint: error.hint
        } : null
      });
    } else {
      // Caută după slug
      searchMethod = 'slug';
      const { data, error } = await supabaseAdmin
        .from('products')
        .select('*')
        .eq('slug', productId)
        .maybeSingle();
      
      product = data;
      
      return NextResponse.json({
        success: true,
        searchMethod,
        productId,
        found: !!product,
        product: product ? {
          id: product.id,
          slug: product.slug,
          title: product.title,
          product_type: product.product_type,
          status: product.status,
          user_id: product.user_id,
          starting_price_ron: product.starting_price_ron,
          starting_price_eur: product.starting_price_eur,
          created_at: product.created_at,
          updated_at: product.updated_at
        } : null,
        error: error ? {
          code: error.code,
          message: error.message,
          details: error.details,
          hint: error.hint
        } : null
      });
    }
  } catch (error: any) {
    console.error('[Debug Product] Error:', error);
    return NextResponse.json(
      { 
        success: false,
        error: error.message || 'Eroare la verificarea produsului',
        stack: error.stack
      },
      { status: 500 }
    );
  }
}








































