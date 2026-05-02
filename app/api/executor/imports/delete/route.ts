/**
 * DELETE /api/executor/imports/delete
 * Șterge înregistrări din executor_imports după id-uri
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json();
    const { ids } = body as { ids?: unknown };

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json(
        { success: false, error: 'ids array is required and must not be empty' },
        { status: 400 }
      );
    }

    if (!supabaseAdmin) {
      return NextResponse.json(
        { success: false, error: 'Server configuration error' },
        { status: 500 }
      );
    }

    const { error } = await supabaseAdmin
      .from('executor_imports')
      .delete()
      .in('id', ids);

    if (error) {
      console.error('Error deleting executor imports:', error);
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: `Șters cu succes ${ids.length} înregistrări`,
      deletedCount: ids.length,
    });
  } catch (err: unknown) {
    console.error('Error in executor imports delete:', err);
    return NextResponse.json(
      {
        success: false,
        error: err instanceof Error ? err.message : 'Internal server error',
      },
      { status: 500 }
    );
  }
}
