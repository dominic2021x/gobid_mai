/**
 * Autopilot AI - Job zilnic care orchestrează producția automată
 * Decide ce să producă, respectă bugetul și execută task-urile
 */

import { NextRequest, NextResponse } from 'next/server';
import { decidePlanForToday } from '@/lib/autopilot/decisionEngine';
import { canSpend, recordSpend } from '@/lib/autopilot/costGuard';
import { runSafetyChecks, logRailResult } from '@/lib/autopilot/safetyRails';
import { calculateRiskScore, generateRiskExplanation } from '@/lib/autopilot/riskScoring';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


export const runtime = 'nodejs';
export const maxDuration = 300; // 5 minute max pentru job-ul complet

/**
 * Execută un task specific
 */
async function runTask(task: {
  type: string;
  payload: any;
  est_cost_usd: number;
}): Promise<{ success: boolean; error?: string; cost?: number }> {
  try {
    const { type, payload, est_cost_usd } = task;
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL || 'http://localhost:3000';

    console.log(`🚀 Executing task: ${type}`, payload);

    let response;
    let actualCost = est_cost_usd;

    switch (type) {
      case 'seo':
        // Optimizare SEO
        response = await fetch(`${siteUrl}/api/seo/generate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        break;

      case 'article':
        // Articol de blog
        response = await fetch(`${siteUrl}/api/content/article`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        break;

      case 'video':
        // Clip video cu avatar AI
        response = await fetch(`${siteUrl}/api/avatar/generate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        actualCost = est_cost_usd * 1.2; // Video costă mai mult
        break;

      case 'social':
        // Postare social media
        response = await fetch(`${siteUrl}/api/social/post`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        break;

      case 'email':
        // Email de promovare
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

    // Înregistrează cheltuiala reală
    if (actualCost > 0) {
      await recordSpend({
        service: type === 'video' ? 'heygen' : type === 'email' ? 'resend' : 'openai',
        amount: actualCost,
        note: `Autopilot ${type}: ${JSON.stringify(payload).substring(0, 50)}`,
      });
    }

    console.log(`✅ Task ${type} completed successfully`);
    return { success: true, cost: actualCost };
  } catch (error: any) {
    console.error(`❌ Error executing task ${task.type}:`, error);
    return { success: false, error: error.message || 'Unknown error' };
  }
}

/**
 * Handler principal pentru job-ul zilnic
 */
export async function GET(request: NextRequest) {
  try {
    // Verifică dacă Autopilot este activat
    if (process.env.AUTOPILOT_ENABLED !== 'true') {
      return NextResponse.json({
        success: true,
        message: 'Autopilot dezactivat',
        enabled: false,
      });
    }

    console.log('🤖 Autopilot AI: Starting daily job...');

    // 1. Generează planul pentru azi
    const tasks = await decidePlanForToday();

    if (tasks.length === 0) {
      console.log('⚠️ No tasks generated');
      return NextResponse.json({
        success: true,
        message: 'Nu s-au generat task-uri',
        executed: 0,
        tasks: [],
      });
    }

    console.log(`📋 Generated ${tasks.length} tasks`);

    // Verifică dacă Supabase este configurat
    if (!supabaseAdmin) {
      console.error('❌ Supabase admin not configured');
      return NextResponse.json({
        success: false,
        error: 'Database not configured',
      }, { status: 500 });
    }

    // 2. Execută task-urile respectând bugetul și Safety Rails
    const executedTasks: any[] = [];
    const failedTasks: any[] = [];
    const blockedTasks: any[] = [];

    for (const task of tasks) {
      const estCost = Number(task.est_cost_usd || 0);

      // 🎯 Risk Scoring: Calculează scorul de risc
      let riskScore = 0;
      let riskExplanation = '';
      try {
        const riskResult = await calculateRiskScore(task);
        riskScore = riskResult.score;
        
        // Generează explicația AI (doar dacă riscul este >0)
        if (riskScore > 0) {
          try {
            riskExplanation = await generateRiskExplanation(
              task,
              riskScore,
              riskResult.factorDescriptions
            );
          } catch (explanationError) {
            console.error(`🎯 Error generating risk explanation:`, explanationError);
            // Continuăm fără explicație dacă generarea eșuează
          }
        }
        
        console.log(`🎯 Risk Score for task ${task.type}: ${riskScore}/100`);
      } catch (riskError) {
        console.error(`🎯 Error calculating risk score:`, riskError);
        // Continui chiar dacă calculul riscului eșuează
      }

      // 🛡️ Safety Rails: Verifică toate protecțiile
      let safetyCheckPassed = false;
      let safetyCheckError = '';

      try {
        const safetyCheck = await runSafetyChecks(task);
        safetyCheckPassed = safetyCheck.passed;
        safetyCheckError = safetyCheck.error || '';
      } catch (safetyError: any) {
        console.error(`🛡️ Safety Rails error for task ${task.type}:`, safetyError);
        safetyCheckPassed = false;
        safetyCheckError = safetyError.message || 'Safety Rails check failed';
      }

      // Blochează task-ul dacă riscul este prea mare (>60) sau dacă Safety Rails blochează
      if (riskScore > 60 || !safetyCheckPassed) {
        const blockReason = riskScore > 60
          ? `Risc ridicat detectat (${riskScore}/100)`
          : safetyCheckError || 'Blocked by Safety Rails';

        console.log(`🛡️ Task ${task.type} blocked - ${blockReason}`);
        
        // Inserează task-ul ca blocat (pentru review panel)
        if (supabaseAdmin) {
          await supabaseAdmin
            .from('autopilot_tasks')
            .insert([
              {
                type: task.type,
                payload: {
                  ...task.payload,
                  safety_rail_message: blockReason,
                  safety_rail_status: 'blocked',
                },
                status: 'blocked',
                cost_usd: estCost,
                risk_score: riskScore,
                risk_explanation: riskExplanation || null,
              },
            ]);
        }

        blockedTasks.push({
          ...task,
          status: 'blocked',
          reason: blockReason,
          risk_score: riskScore,
        });
        continue;
      }

      // Inserează task-ul în coadă (dacă a trecut Safety Rails și riscul este acceptabil)
      if (!supabaseAdmin) {
        console.error('❌ Supabase admin not configured, skipping task');
        failedTasks.push({
          ...task,
          status: 'failed',
          reason: 'Database not configured',
        });
        continue;
      }

      const { data: insertedTask, error: insertError } = await supabaseAdmin
        .from('autopilot_tasks')
        .insert([
          {
            type: task.type,
            payload: task.payload,
            status: 'running',
            cost_usd: estCost,
            risk_score: riskScore,
            risk_explanation: riskExplanation || null,
          },
        ])
        .select()
        .single();

      if (insertError) {
        console.error('Error inserting task:', insertError);
        failedTasks.push({
          ...task,
          status: 'failed',
          reason: 'Insert failed',
        });
        continue;
      }

      // Execută task-ul
      try {
        const result = await runTask(task);

        if (result.success) {
          // Actualizează task-ul ca completat
          if (supabaseAdmin && insertedTask?.id) {
            await supabaseAdmin
              .from('autopilot_tasks')
              .update({
                status: 'done',
                cost_usd: result.cost || estCost,
              })
              .eq('id', insertedTask.id);
          }

          await logRailResult(task, 'done', 'Task executat în siguranță');

          executedTasks.push({
            ...task,
            task_id: insertedTask.id,
            status: 'done',
            cost: result.cost || estCost,
          });

          console.log(`✅ Task ${task.type} executed successfully`);
        } else {
          // Marchează task-ul ca eșuat
          if (supabaseAdmin && insertedTask?.id) {
            await supabaseAdmin
              .from('autopilot_tasks')
              .update({
                status: 'failed',
              })
              .eq('id', insertedTask.id);
          }

          failedTasks.push({
            ...task,
            task_id: insertedTask.id,
            status: 'failed',
            reason: result.error,
          });
        }
      } catch (error: any) {
        // Marchează task-ul ca eșuat
        if (supabaseAdmin && insertedTask?.id) {
          await supabaseAdmin
            .from('autopilot_tasks')
            .update({
              status: 'failed',
            })
            .eq('id', insertedTask.id);
        }

        failedTasks.push({
          ...task,
          task_id: insertedTask.id,
          status: 'failed',
          reason: error.message || 'Execution error',
        });
      }
    }

    const totalCost = executedTasks.reduce((sum, t) => sum + (t.cost || 0), 0);

    console.log(
      `🎉 Autopilot AI: Completed ${executedTasks.length} tasks, ${failedTasks.length} failed, ${blockedTasks.length} blocked by Safety Rails`
    );

    return NextResponse.json({
      success: true,
      executed: executedTasks.length,
      failed: failedTasks.length,
      blocked: blockedTasks.length,
      total_cost_usd: totalCost.toFixed(2),
      tasks: executedTasks,
      failed_tasks: failedTasks,
      blocked_tasks: blockedTasks,
      safety_rails_active: true,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('❌ Error in Autopilot AI job:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Unknown error',
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}

/**
 * POST handler pentru trigger manual
 */
export async function POST(request: NextRequest) {
  // Același handler ca GET
  return GET(request);
}

