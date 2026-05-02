import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


export const runtime = 'nodejs';

/**
 * GET /api/admin/modules/config/[moduleId]
 * Returnează configurația unui modul specific
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ moduleId: string }> }
) {
  try {
    if (!supabaseAdmin) {
      return NextResponse.json({
        success: false,
        error: 'Supabase not configured',
      }, { status: 500 });
    }

    const { moduleId } = await params;

    const { data: moduleData, error } = await supabaseAdmin
      .from('admin_modules')
      .select('*')
      .eq('module_id', moduleId)
      .maybeSingle();

    if (error && error.code !== 'PGRST116') {
      console.error('Error loading module:', error);
      return NextResponse.json({
        success: false,
        error: error.message || 'Failed to load module',
      }, { status: 500 });
    }

    if (!moduleData) {
      return NextResponse.json({
        success: false,
        error: 'Module not found',
      }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      module: moduleData,
    });
  } catch (error: any) {
    console.error('Error in GET /api/admin/modules/config/[moduleId]:', error);
    return NextResponse.json({
      success: false,
      error: error.message || 'Failed to load module',
    }, { status: 500 });
  }
}

/**
 * PUT /api/admin/modules/config/[moduleId]
 * Actualizează configurația unui modul
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ moduleId: string }> }
) {
  try {
    if (!supabaseAdmin) {
      return NextResponse.json({
        success: false,
        error: 'Supabase not configured',
      }, { status: 500 });
    }

    const { moduleId } = await params;
    const body = await request.json();

    const { error } = await supabaseAdmin
      .from('admin_modules')
      .update({
        module_name: body.name,
        module_type: body.type,
        enabled: body.enabled,
        config: body.config || {},
        description: body.description || '',
        version: body.version || '1.0.0',
        updated_at: new Date().toISOString(),
      })
      .eq('module_id', moduleId);

    if (error) {
      console.error('Error updating module:', error);
      return NextResponse.json({
        success: false,
        error: error.message || 'Failed to update module',
      }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: 'Module updated successfully',
    });
  } catch (error: any) {
    console.error('Error in PUT /api/admin/modules/config/[moduleId]:', error);
    return NextResponse.json({
      success: false,
      error: error.message || 'Failed to update module',
    }, { status: 500 });
  }
}

/**
 * DELETE /api/admin/modules/config/[moduleId]
 * Șterge un modul
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ moduleId: string }> }
) {
  try {
    if (!supabaseAdmin) {
      return NextResponse.json({
        success: false,
        error: 'Supabase not configured',
      }, { status: 500 });
    }

    const { moduleId } = await params;

    const { error } = await supabaseAdmin
      .from('admin_modules')
      .delete()
      .eq('module_id', moduleId);

    if (error) {
      console.error('Error deleting module:', error);
      return NextResponse.json({
        success: false,
        error: error.message || 'Failed to delete module',
      }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: 'Module deleted successfully',
    });
  } catch (error: any) {
    console.error('Error in DELETE /api/admin/modules/config/[moduleId]:', error);
    return NextResponse.json({
      success: false,
      error: error.message || 'Failed to delete module',
    }, { status: 500 });
  }
}

