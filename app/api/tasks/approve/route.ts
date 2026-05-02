/**
 * API Route - Approve Task
 * Aprobă un task blocat și îl execută automat
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


export const runtime = 'nodejs';
export const maxDuration = 300; // 5 minute max

/**
 * Execută un task specific
 */
async function runTask(task: {
  type: string;
  payload: any;
  est_cost_usd?: number;
}): Promise<{ success: boolean; error?: string; cost?: number }> {
  try {
    const { type, payload } = task;
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL || 'http://localhost:3000';

    console.log(`🚀 Executing approved task: ${type}`, payload);

    let response;
    let actualCost = Number(task.est_cost_usd || 0);

    switch (type) {
      case 'seo':
        response = await fetch(`${siteUrl}/api/seo/generate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        break;

      case 'article':
        response = await fetch(`${siteUrl}/api/content/article`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        break;

      case 'video':
        response = await fetch(`${siteUrl}/api/avatar/generate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        actualCost = actualCost * 1.2; // Video costă mai mult
        break;

      case 'social':
        response = await fetch(`${siteUrl}/api/social/post`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        break;

      case 'email':
        response = await fetch(`${siteUrl}/api/email/send`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        break;

      default:
        return { success: false, error: `Unknown task type: ${type}` };
    }

    if (!response || !response.ok) {
      const errorText = await response?.text().catch(() => 'Unknown error');
      console.error(`❌ Task ${type} failed:`, errorText);
      return { success: false, error: errorText };
    }

    const result = await response.json().catch(() => ({}));

    console.log(`✅ Task ${type} completed successfully`);
    return { success: true, cost: actualCost };
  } catch (error: any) {
    console.error(`❌ Error executing task ${task.type}:`, error);
    return { success: false, error: error.message || 'Unknown error' };
  }
}

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

    // Obține task-ul
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

    if (task.status !== 'blocked') {
      return NextResponse.json(
        { error: 'Task-ul nu este blocat' },
        { status: 400 }
      );
    }

    // Marchează ca aprobat
    if (supabaseAdmin) {
      await supabaseAdmin
        .from('autopilot_tasks')
        .update({
          status: 'approved',
          updated_at: new Date().toISOString(),
        })
        .eq('id', id);
    }

    // Execută task-ul
    try {
      const result = await runTask({
        type: task.type,
        payload: task.payload,
        est_cost_usd: task.cost_usd,
      });

      if (result.success) {
        // Marchează ca done
        if (supabaseAdmin) {
          await supabaseAdmin
            .from('autopilot_tasks')
            .update({
              status: 'done',
              cost_usd: result.cost || task.cost_usd || 0,
              updated_at: new Date().toISOString(),
            })
            .eq('id', id);

          // Înregistrează cheltuiala (dacă există cost)
          if (result.cost && result.cost > 0) {
            const today = new Date().toISOString().slice(0, 10);
            await supabaseAdmin.from('spend_ledger').insert([
              {
                day: today,
                service: task.type === 'video' ? 'heygen' : task.type === 'email' ? 'resend' : 'openai',
                amount_usd: result.cost,
                note: `Approved task ${task.type}: ${JSON.stringify(task.payload).substring(0, 50)}`,
              },
            ]);
          }
        }

        return NextResponse.json({
          success: true,
          message: 'Task aprobat și executat cu succes',
        });
      } else {
        // Marchează ca failed
        if (supabaseAdmin) {
          await supabaseAdmin
            .from('autopilot_tasks')
            .update({
              status: 'failed',
              updated_at: new Date().toISOString(),
            })
            .eq('id', id);
        }

        return NextResponse.json(
          {
            success: false,
            error: result.error || 'Task execution failed',
          },
          { status: 500 }
        );
      }
    } catch (execError: any) {
      // Marchează ca failed
      if (supabaseAdmin) {
        await supabaseAdmin
          .from('autopilot_tasks')
          .update({
            status: 'failed',
            updated_at: new Date().toISOString(),
          })
          .eq('id', id);
      }

      console.error('Error executing approved task:', execError);
      return NextResponse.json(
        {
          success: false,
          error: execError.message || 'Task execution failed',
        },
        { status: 500 }
      );
    }
  } catch (error: any) {
    console.error('Error in /api/tasks/approve:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to approve task' },
      { status: 500 }
    );
  }
}


