/**
 * API Route - Produs Individual
 * GET /api/products/[id] - Obține produs
 * PUT /api/products/[id] - Actualizează produs
 * DELETE /api/products/[id] - Șterge produs
 */

import { NextRequest, NextResponse } from 'next/server';
import { getProductById, updateProduct, deleteProduct } from '@/lib/db/products';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const product = await getProductById(id);
    return NextResponse.json(product, { status: 200 });
  } catch (error: any) {
    console.error('Error in /api/products/[id] GET:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to get product' },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const product = await updateProduct(id, body);
    return NextResponse.json({ success: true, product }, { status: 200 });
  } catch (error: any) {
    console.error('Error in /api/products/[id] PUT:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to update product' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await deleteProduct(id);
    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error: any) {
    console.error('Error in /api/products/[id] DELETE:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to delete product' },
      { status: 500 }
    );
  }
}

