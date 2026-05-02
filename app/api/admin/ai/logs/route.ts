/**
 * API Route - AI Logs
 * GET /api/admin/ai/logs
 * Returnează log-uri pentru un modul AI specific
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const moduleId = searchParams.get('module');
    const limit = parseInt(searchParams.get('limit') || '100');
    const level = searchParams.get('level'); // 'info' | 'warning' | 'error' | 'success'

    if (!moduleId) {
      return NextResponse.json(
        { error: 'Module ID is required' },
        { status: 400 }
      );
    }

    // Verifică dacă există tabelul ai_logs
    let logs: any[] = [];

    try {
      if (!supabaseAdmin) {
        // Supabase nu este configurat, returnează log-uri mock
        logs = await getMockLogs(moduleId, limit);
      } else {
        let query = supabaseAdmin
          .from('ai_logs')
          .select('*')
          .eq('module', moduleId)
          .order('timestamp', { ascending: false })
          .limit(limit);

        if (level) {
          query = query.eq('level', level);
        }

        const { data, error } = await query;

        if (error) {
          // Tabelul nu există, returnează log-uri mock sau din alte surse
          console.warn('AI logs table does not exist, returning mock logs');
          logs = await getMockLogs(moduleId, limit);
        } else {
          logs = data || [];
        }
      }
    } catch (error) {
      // Tabelul nu există, returnează log-uri mock
      console.warn('AI logs table does not exist, returning mock logs');
      logs = await getMockLogs(moduleId, limit);
    }

    // Dacă modulul este Autopilot, adaugă log-uri din autopilot_tasks
    if (moduleId === 'autopilot') {
      const autopilotLogs = await getAutopilotLogs(limit);
      logs = [...autopilotLogs, ...logs].slice(0, limit);
    }

    // Dacă modulul este Chat, adaugă log-uri din conversații recente
    if (moduleId === 'chat') {
      const chatLogs = await getChatLogs(limit);
      logs = [...chatLogs, ...logs].slice(0, limit);
    }

    return NextResponse.json({
      success: true,
      logs,
      count: logs.length,
    });
  } catch (error: any) {
    console.error('Error in /api/admin/ai/logs:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to load logs' },
      { status: 500 }
    );
  }
}

async function getMockLogs(moduleId: string, limit: number): Promise<any[]> {
  // Returnează log-uri mock pentru modulele care nu au încă log-uri reale
  const baseLogs = [
    {
      id: `log-${Date.now()}-1`,
      timestamp: new Date().toISOString(),
      module: moduleId,
      level: 'info' as const,
      message: `Module ${moduleId} initialized`,
      details: { moduleId },
    },
    {
      id: `log-${Date.now()}-2`,
      timestamp: new Date(Date.now() - 60000).toISOString(),
      module: moduleId,
      level: 'success' as const,
      message: `Module ${moduleId} ready`,
      details: { moduleId, status: 'ready' },
    },
  ];

  return baseLogs.slice(0, limit);
}

async function getAutopilotLogs(limit: number): Promise<any[]> {
  try {
    if (!supabaseAdmin) {
      return [];
    }

    const { data, error } = await supabaseAdmin
      .from('autopilot_tasks')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error || !data) {
      return [];
    }

    return data.map((task: any) => ({
      id: task.id,
      timestamp: task.created_at,
      module: 'autopilot',
      level: task.status === 'failed' ? 'error' : task.status === 'completed' ? 'success' : 'info',
      message: `Task ${task.type} - ${task.status}`,
      details: {
        type: task.type,
        status: task.status,
        cost: task.cost_usd,
        riskScore: task.risk_score,
        payload: task.payload,
      },
      duration: task.updated_at && task.created_at 
        ? new Date(task.updated_at).getTime() - new Date(task.created_at).getTime()
        : null,
    }));
  } catch (error) {
    return [];
  }
}

async function getChatLogs(limit: number): Promise<any[]> {
  try {
    // Încearcă să obțină log-uri din conversații recente
    // Pentru moment, returnează log-uri mock
    return [
      {
        id: `chat-log-${Date.now()}`,
        timestamp: new Date().toISOString(),
        module: 'chat',
        level: 'info' as const,
        message: 'Chat API ready',
        details: { apiKey: process.env.OPENAI_API_KEY ? '✅ Configured' : '❌ Not configured' },
      },
    ];
  } catch (error) {
    return [];
  }
}


