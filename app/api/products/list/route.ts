/**
 * API Route - Listare Produse
 * GET /api/products/list
 */

import { NextResponse } from 'next/server';
import { listProducts } from '@/lib/db/products';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


export async function GET() {
  try {
    const products = await listProducts();

    return NextResponse.json(products, { status: 200 });
  } catch (error: any) {
    console.error('Error in /api/products/list:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to list products' },
      { status: 500 }
    );
  }
}


