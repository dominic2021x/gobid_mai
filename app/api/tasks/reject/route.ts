/**
 * API Route - Reject Task
 * Respinge un task blocat (îl marchează ca rejected)
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    const { id } = await request.json();

    if (!id) {
      return NextResponse.json(
        { error: 'Lipsește ID-ul' },
        { status: 400 }
      );
    }

    // Verifică dacă Supabase este configurat
    if (!supabaseAdmin) {
      return NextResponse.json(
        { error: 'Database not configured' },
        { status: 500 }
      );
    }

    // Verifică dacă task-ul există
    const { data: task, error: fetchError } = await supabaseAdmin
      .from('autopilot_tasks')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError || !task) {
      return NextResponse.json(
        { error: 'Task inexistent' },
        { status: 404 }
      );
    }

    // Marchează ca rejected
    const { error: updateError } = await supabaseAdmin
      .from('autopilot_tasks')
      .update({
        status: 'rejected',
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);

    if (updateError) {
      console.error('Error rejecting task:', updateError);
      return NextResponse.json(
        { error: updateError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Task respins cu succes',
    });
  } catch (error: any) {
    console.error('Error in /api/tasks/reject:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to reject task' },
      { status: 500 }
    );
  }
}
