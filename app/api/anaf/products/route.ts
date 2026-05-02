/**
 * API Route - ANAF Products Management
 * GET /api/anaf/products - Listă produsele ANAF cu status
 * DELETE /api/anaf/products - Șterge produse ANAF
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


export const runtime = 'nodejs';

/**
 * GET - Listă produsele ANAF cu status și informații despre licitație
 */
export async function GET(request: NextRequest) {
  try {
    if (!supabaseAdmin) {
      return NextResponse.json(
        { error: 'Supabase admin client not configured' },
        { status: 500 }
      );
    }

    const { searchParams } = new URL(request.url);
    const importId = searchParams.get('import_id');

    // Obține licitațiile ANAF cu produsele asociate
    let query = supabaseAdmin
      .from('anaf_licitatii')
      .select(`
        id,
        import_id,
        product_id,
        product_created,
        numar_licitatie,
        data_licitatie,
        created_at,
        products:product_id (
          id,
          title,
          status,
          created_at,
          updated_at
        )
      `)
      .order('created_at', { ascending: false });

    if (importId) {
      query = query.eq('import_id', importId);
    }

    const { data: licitatii, error } = await query;

    if (error) {
      console.error('Error fetching ANAF products:', error);
      return NextResponse.json(
        { error: `Failed to fetch products: ${error.message}` },
        { status: 500 }
      );
    }

    // Formatează datele pentru răspuns
    const products = (licitatii || []).map((licitatie: any) => {
      const product = licitatie.products;
      return {
        licitatie_id: licitatie.id,
        import_id: licitatie.import_id,
        product_id: licitatie.product_id,
        product_created: licitatie.product_created,
        numar_licitatie: licitatie.numar_licitatie,
        data_licitatie: licitatie.data_licitatie,
        product: product ? {
          id: product.id,
          title: product.title,
          status: product.status,
          created_at: product.created_at,
          updated_at: product.updated_at,
        } : null,
      };
    });

    return NextResponse.json({
      success: true,
      data: products,
      count: products.length,
    });
  } catch (error: any) {
    console.error('Error in GET /api/anaf/products:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * DELETE - Șterge produse ANAF
 */
export async function DELETE(request: NextRequest) {
  try {
    if (!supabaseAdmin) {
      return NextResponse.json(
        { error: 'Supabase admin client not configured' },
        { status: 500 }
      );
    }

    const body = await request.json();
    const { product_ids, licitatie_ids } = body;

    if (!product_ids && !licitatie_ids) {
      return NextResponse.json(
        { error: 'product_ids or licitatie_ids is required' },
        { status: 400 }
      );
    }

    const deletedProducts: string[] = [];
    const errors: string[] = [];

    // Șterge produsele din tabela products
    if (product_ids && Array.isArray(product_ids) && product_ids.length > 0) {
      const { data, error } = await supabaseAdmin
        .from('products')
        .delete()
        .in('id', product_ids)
        .select('id');

      if (error) {
        console.error('Error deleting products:', error);
        errors.push(`Failed to delete products: ${error.message}`);
      } else {
        deletedProducts.push(...(data?.map((p: any) => p.id) || []));
      }
    }

    // Șterge licitațiile din anaf_licitatii (dacă sunt specificate)
    if (licitatie_ids && Array.isArray(licitatie_ids) && licitatie_ids.length > 0) {
      // Obține product_id-urile asociate înainte de ștergere
      const { data: licitatii } = await supabaseAdmin
        .from('anaf_licitatii')
        .select('product_id')
        .in('id', licitatie_ids);

      const productIdsToDelete = (licitatii || [])
        .map((l: any) => l.product_id)
        .filter((id: string | null) => id !== null);

      // Șterge produsele asociate
      if (productIdsToDelete.length > 0) {
        const { error: deleteError } = await supabaseAdmin
          .from('products')
          .delete()
          .in('id', productIdsToDelete);

        if (deleteError) {
          console.error('Error deleting products from licitatii:', deleteError);
          errors.push(`Failed to delete products from licitatii: ${deleteError.message}`);
        } else {
          deletedProducts.push(...productIdsToDelete);
        }
      }

      // Șterge licitațiile
      const { error: licitatieError } = await supabaseAdmin
        .from('anaf_licitatii')
        .delete()
        .in('id', licitatie_ids);

      if (licitatieError) {
        console.error('Error deleting licitatii:', licitatieError);
        errors.push(`Failed to delete licitatii: ${licitatieError.message}`);
      }
    }

    return NextResponse.json({
      success: errors.length === 0,
      deleted_count: deletedProducts.length,
      deleted_product_ids: deletedProducts,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error: any) {
    console.error('Error in DELETE /api/anaf/products:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

