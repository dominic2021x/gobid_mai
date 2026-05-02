/**
 * API Route - Risk Evaluate
 * Evaluează riscul pentru toate task-urile blocate sau în coadă
 */

import { NextRequest, NextResponse } from 'next/server';
import { calculateRiskScore, generateRiskExplanation } from '@/lib/autopilot/riskScoring';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


export const runtime = 'nodejs';
export const maxDuration = 300; // 5 minute max

export async function GET(request: NextRequest) {
  try {
    // Verifică dacă Supabase este configurat
    if (!supabaseAdmin) {
      return NextResponse.json(
        { error: 'Database not configured' },
        { status: 500 }
      );
    }

    // Obține toate task-urile blocate sau în coadă
    const { data: tasks, error: fetchError } = await supabaseAdmin
      .from('autopilot_tasks')
      .select('*')
      .in('status', ['blocked', 'queued', 'running'])
      .order('created_at', { ascending: false });

    if (fetchError) {
      console.error('Error fetching tasks:', fetchError);
      return NextResponse.json(
        { error: fetchError.message },
        { status: 500 }
      );
    }

    if (!tasks || tasks.length === 0) {
      return NextResponse.json({
        success: true,
        evaluated: 0,
        message: 'Nu există task-uri de evaluat',
      });
    }

    // Evaluează riscul pentru fiecare task
    const evaluatedTasks: any[] = [];
    const errors: any[] = [];

    for (const task of tasks) {
      try {
        const { score, factors, factorDescriptions } = await calculateRiskScore({
          type: task.type,
          payload: task.payload,
          est_cost_usd: task.cost_usd,
        });

        // Generează explicația AI
        let explanation = '';
        try {
          explanation = await generateRiskExplanation(
            {
              type: task.type,
              payload: task.payload,
              est_cost_usd: task.cost_usd,
            },
            score,
            factorDescriptions
          );
        } catch (explanationError) {
          console.error(`Error generating explanation for task ${task.id}:`, explanationError);
          // Continuăm fără explicație dacă generarea eșuează
        }

        // Actualizează task-ul cu scorul de risc și explicația
        const { error: updateError } = await supabaseAdmin
          .from('autopilot_tasks')
          .update({
            risk_score: score,
            risk_explanation: explanation || null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', task.id);

        if (updateError) {
          console.error(`Error updating risk score for task ${task.id}:`, updateError);
          errors.push({ taskId: task.id, error: updateError.message });
        } else {
          evaluatedTasks.push({
            id: task.id,
            type: task.type,
            risk_score: score,
            risk_explanation: explanation,
            factors,
          });
        }
      } catch (taskError: any) {
        console.error(`Error evaluating risk for task ${task.id}:`, taskError);
        errors.push({ taskId: task.id, error: taskError.message });
      }
    }

    return NextResponse.json({
      success: true,
      evaluated: evaluatedTasks.length,
      errors: errors.length,
      tasks: evaluatedTasks,
      errors_detail: errors,
    });
  } catch (error: any) {
    console.error('Error in /api/tasks/risk-evaluate:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to evaluate risk' },
      { status: 500 }
    );
  }
}

/**
 * POST handler pentru evaluare risc pentru un task specific
 */
export async function POST(request: NextRequest) {
  try {
    const { taskId } = await request.json();

    if (!taskId) {
      return NextResponse.json(
        { error: 'Lipsește taskId' },
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
      .eq('id', taskId)
      .single();

    if (fetchError || !task) {
      return NextResponse.json(
        { error: 'Task inexistent' },
        { status: 404 }
      );
    }

    // Calculează scorul de risc
    const { score, factors, factorDescriptions } = await calculateRiskScore({
      type: task.type,
      payload: task.payload,
      est_cost_usd: task.cost_usd,
    });

    // Generează explicația AI
    let explanation = '';
    try {
      explanation = await generateRiskExplanation(
        {
          type: task.type,
          payload: task.payload,
          est_cost_usd: task.cost_usd,
        },
        score,
        factorDescriptions
      );
    } catch (explanationError) {
      console.error(`Error generating explanation for task ${taskId}:`, explanationError);
      // Continuăm fără explicație dacă generarea eșuează
    }

    // Actualizează task-ul
    const { error: updateError } = await supabaseAdmin
      .from('autopilot_tasks')
      .update({
        risk_score: score,
        risk_explanation: explanation || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', taskId);

    if (updateError) {
      return NextResponse.json(
        { error: updateError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      taskId,
      risk_score: score,
      risk_explanation: explanation,
      factors,
    });
  } catch (error: any) {
    console.error('Error in /api/tasks/risk-evaluate POST:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to evaluate risk' },
      { status: 500 }
    );
  }
}

