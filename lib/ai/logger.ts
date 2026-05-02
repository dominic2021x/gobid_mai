/**
 * AI Logger - Sistem de logging pentru toate modulele AI
 * Salvează log-uri în Supabase pentru monitorizare și debug
 */

import { supabaseAdmin } from '@/lib/supabase';

export interface LogEntry {
  id?: string;
  timestamp: string;
  module: string;
  level: 'info' | 'warning' | 'error' | 'success';
  message: string;
  details?: any;
  duration?: number;
}

/**
 * Loghează o operațiune AI
 */
export async function logAIOperation(entry: Omit<LogEntry, 'id' | 'timestamp'>): Promise<void> {
  try {
    const logEntry: LogEntry = {
      ...entry,
      id: `log-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date().toISOString(),
    };

    // Încearcă să salveze în Supabase
    try {
      if (supabaseAdmin) {
        const { error } = await supabaseAdmin
          .from('ai_logs')
          .insert([logEntry]);

        if (error) {
          // Tabelul nu există, loghează doar în console
          console.log('[AI Logger]', logEntry);
        }
      } else {
        // Supabase nu este configurat, loghează doar în console
        console.log('[AI Logger]', logEntry);
      }
    } catch (error) {
      // Tabelul nu există, loghează doar în console
      console.log('[AI Logger]', logEntry);
    }
  } catch (error) {
    console.error('Error logging AI operation:', error);
  }
}

/**
 * Loghează începutul unei operații AI
 */
export async function logAIStart(module: string, message: string, details?: any): Promise<string> {
  const logId = `log-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  
  await logAIOperation({
    module,
    level: 'info',
    message: `[START] ${message}`,
    details,
  });

  return logId;
}

/**
 * Loghează sfârșitul unei operații AI
 */
export async function logAIEnd(
  logId: string,
  module: string,
  message: string,
  success: boolean,
  duration: number,
  details?: any
): Promise<void> {
  await logAIOperation({
    module,
    level: success ? 'success' : 'error',
    message: `[END] ${message} - ${success ? 'Success' : 'Failed'}`,
    details,
    duration,
  });
}

/**
 * Loghează o eroare AI
 */
export async function logAIError(module: string, message: string, error: any, details?: any): Promise<void> {
  await logAIOperation({
    module,
    level: 'error',
    message: `[ERROR] ${message}`,
    details: {
      ...details,
      error: error?.message || String(error),
      stack: error?.stack,
    },
  });
}

/**
 * Loghează un avertisment AI
 */
export async function logAIWarning(module: string, message: string, details?: any): Promise<void> {
  await logAIOperation({
    module,
    level: 'warning',
    message: `[WARNING] ${message}`,
    details,
  });
}

/**
 * Obține log-uri pentru un modul
 */
export async function getAILogs(
  module: string,
  limit: number = 100,
  level?: 'info' | 'warning' | 'error' | 'success'
): Promise<LogEntry[]> {
  try {
    if (!supabaseAdmin) {
      return [];
    }

    let query = supabaseAdmin
      .from('ai_logs')
      .select('*')
      .eq('module', module)
      .order('timestamp', { ascending: false })
      .limit(limit);

    if (level) {
      query = query.eq('level', level);
    }

    const { data, error } = await query;

    if (error) {
      console.warn('AI logs table does not exist');
      return [];
    }

    return data || [];
  } catch (error) {
    console.error('Error getting AI logs:', error);
    return [];
  }
}


