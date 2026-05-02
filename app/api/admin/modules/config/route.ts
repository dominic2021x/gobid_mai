import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


export const runtime = 'nodejs';

/**
 * GET /api/admin/modules/config
 * Returnează lista de module configurate
 */
export async function GET(request: NextRequest) {
  try {
    if (!supabaseAdmin) {
      return NextResponse.json({
        success: false,
        error: 'Supabase not configured',
      }, { status: 500 });
    }

    // Încearcă să încarce modulele din Supabase
    const { data: modulesData, error } = await supabaseAdmin
      .from('admin_modules')
      .select('*')
      .order('module_name', { ascending: true });

    if (error) {
      console.error('Error loading modules:', error);
      return NextResponse.json({
        success: false,
        error: error.message || 'Failed to load modules',
      }, { status: 500 });
    }

    // Returnează modulele sau un array gol
    return NextResponse.json({
      success: true,
      modules: modulesData || [],
    });
  } catch (error: any) {
    console.error('Error in GET /api/admin/modules/config:', error);
    return NextResponse.json({
      success: false,
      error: error.message || 'Failed to load modules',
    }, { status: 500 });
  }
}

/**
 * POST /api/admin/modules/config
 * Salvează sau actualizează modulele
 */
export async function POST(request: NextRequest) {
  try {
    if (!supabaseAdmin) {
      return NextResponse.json({
        success: false,
        error: 'Supabase not configured',
      }, { status: 500 });
    }

    const body = await request.json();
    const { modules } = body;

    if (!Array.isArray(modules)) {
      return NextResponse.json({
        success: false,
        error: 'Modules must be an array',
      }, { status: 400 });
    }

    // Salvează fiecare modul în Supabase
    const upsertPromises = modules.map((module: any) =>
      supabaseAdmin!
        .from('admin_modules')
        .upsert({
          module_id: module.id,
          module_name: module.name,
          module_type: module.type,
          enabled: module.enabled || false,
          config: module.config || {},
          description: module.description || '',
          version: module.version || '1.0.0',
          updated_at: new Date().toISOString(),
        }, {
          onConflict: 'module_id',
        })
    );

    const results = await Promise.all(upsertPromises);
    const errors = results.filter(r => r.error);

    if (errors.length > 0) {
      const firstError = errors[0];
      const errMsg = firstError?.error?.message || JSON.stringify(firstError);
      console.error('Error saving modules:', errors);
      return NextResponse.json({
        success: false,
        error: `Failed to save modules: ${errMsg}`,
      }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: 'Modules saved successfully',
    });
  } catch (error: any) {
    console.error('Error in POST /api/admin/modules/config:', error);
    return NextResponse.json({
      success: false,
      error: error.message || 'Failed to save modules',
    }, { status: 500 });
  }
}

