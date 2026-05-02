/**
 * API Route - Delete ANAF Import Records
 * DELETE /api/anaf/import/delete
 * 
 * Șterge înregistrări din istoricul importurilor ANAF
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json();
    const { ids } = body;

    // Validare
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json(
        { error: 'IDs array is required and must not be empty' },
        { status: 400 }
      );
    }

    if (!supabaseAdmin) {
      return NextResponse.json(
        { error: 'Supabase admin client not configured' },
        { status: 500 }
      );
    }

    // Șterge înregistrările
    const { error } = await supabaseAdmin
      .from('anaf_imports')
      .delete()
      .in('id', ids);

    if (error) {
      console.error('Error deleting ANAF imports:', error);
      return NextResponse.json(
        { error: `Failed to delete imports: ${error.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { 
        success: true, 
        message: `Șters cu succes ${ids.length} înregistrări`,
        deletedCount: ids.length 
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error('Error in delete ANAF imports:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}






