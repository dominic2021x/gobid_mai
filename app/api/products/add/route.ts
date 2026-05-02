/**
 * API Route - Adăugare Produs
 * POST /api/products/add
 */

import { NextRequest, NextResponse } from 'next/server';
import { addProduct } from '@/lib/db/products';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    // Validare minimă
    if (!body.titlu) {
      return NextResponse.json(
        { error: 'Titlul produsului este obligatoriu' },
        { status: 400 }
      );
    }

    const product = await addProduct(body);

    return NextResponse.json(
      { success: true, product },
      { status: 200 }
    );
  } catch (error: any) {
    console.error('Error in /api/products/add:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to add product' },
      { status: 500 }
    );
  }
}


