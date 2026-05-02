/**
 * API Route - Listare Importuri pentru Executori
 * GET /api/executor/imports
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');

    let query = supabase
      .from('executor_imports')
      .select('*')
      .order('created_at', { ascending: false });

    if (status && status !== 'all') {
      query = query.eq('status', status);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error loading imports:', error);
      
      // Check if table doesn't exist
      if (error.message?.includes('does not exist') || error.message?.includes('schema cache')) {
        return NextResponse.json(
          { 
            success: false, 
            error: 'Tabelul executor_imports nu există. Te rog rulează migrația: supabase/migrations/20250131_executor_imports.sql în Supabase SQL Editor.',
            tableMissing: true
          },
          { status: 500 }
        );
      }
      
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: data || [],
    });
  } catch (error: any) {
    console.error('Error in GET imports:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Eroare necunoscută',
      },
      { status: 500 }
    );
  }
}
