/**
 * Cost Guard - Gestionează limita de cost lunară pentru Autopilot AI
 * Previne cheltuieli peste bugetul setat
 */

import { supabaseAdmin } from '@/lib/supabase';

/**
 * Calculează cheltuiala totală pentru luna curentă
 */
export async function getMonthSpend(): Promise<number> {
  try {
    if (!supabaseAdmin) {
      return 0;
    }

    const start = new Date();
    start.setDate(1); // Primul zi al lunii
    start.setHours(0, 0, 0, 0);

    const { data, error } = await supabaseAdmin
      .from('spend_ledger')
      .select('amount_usd')
      .gte('day', start.toISOString().slice(0, 10));

    if (error) {
      console.error('Error getting month spend:', error);
      return 0;
    }

    return (data || []).reduce((sum, record) => sum + Number(record.amount_usd || 0), 0);
  } catch (error) {
    console.error('Error in getMonthSpend:', error);
    return 0;
  }
}

/**
 * Verifică dacă poate cheltui suma cerută (respectă limita)
 */
export async function canSpend(requestUsd: number): Promise<boolean> {
  try {
    const cap = Number(process.env.AUTOPILOT_COST_LIMIT_USD || 150);
    const spent = await getMonthSpend();
    const canAfford = (spent + requestUsd) <= cap;

    console.log(`💰 Cost Guard: Spent: $${spent.toFixed(2)}, Request: $${requestUsd.toFixed(2)}, Cap: $${cap}, Can afford: ${canAfford}`);

    return canAfford;
  } catch (error) {
    console.error('Error in canSpend:', error);
    return false;
  }
}

/**
 * Înregistrează o cheltuială în ledger
 */
export async function recordSpend(params: {
  service: string;
  amount: number;
  note?: string;
}): Promise<void> {
  try {
    if (!supabaseAdmin) {
      return;
    }

    const { service, amount, note } = params;
    const today = new Date().toISOString().slice(0, 10);

    const { error } = await supabaseAdmin.from('spend_ledger').insert([
      {
        day: today,
        service,
        amount_usd: amount,
        note: note || `Autopilot ${service}`,
      },
    ]);

    if (error) {
      console.error('Error recording spend:', error);
    } else {
      console.log(`✅ Recorded spend: $${amount.toFixed(2)} for ${service}`);
    }
  } catch (error) {
    console.error('Error in recordSpend:', error);
  }
}

/**
 * Obține cheltuiala pentru o zi specifică
 */
export async function getDaySpend(day: string): Promise<number> {
  try {
    if (!supabaseAdmin) {
      return 0;
    }

    const { data, error } = await supabaseAdmin
      .from('spend_ledger')
      .select('amount_usd')
      .eq('day', day);

    if (error) {
      console.error('Error getting day spend:', error);
      return 0;
    }

    return (data || []).reduce((sum, record) => sum + Number(record.amount_usd || 0), 0);
  } catch (error) {
    console.error('Error in getDaySpend:', error);
    return 0;
  }
}

/**
 * Obține statistici de cheltuială
 */
export async function getSpendStats(): Promise<{
  monthSpend: number;
  monthLimit: number;
  remaining: number;
  dailySpend: { day: string; amount: number }[];
}> {
  try {
    const monthSpend = await getMonthSpend();
    const monthLimit = Number(process.env.AUTOPILOT_COST_LIMIT_USD || 150);
    const remaining = Math.max(0, monthLimit - monthSpend);

    // Obține cheltuiala zilnică pentru ultimele 7 zile
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    sevenDaysAgo.setHours(0, 0, 0, 0);

    if (!supabaseAdmin) {
      return {
        monthSpend,
        monthLimit,
        remaining,
        dailySpend: [],
      };
    }

    const { data, error } = await supabaseAdmin
      .from('spend_ledger')
      .select('day, amount_usd')
      .gte('day', sevenDaysAgo.toISOString().slice(0, 10));

    const dailySpend: { day: string; amount: number }[] = [];
    if (data && !error) {
      const dailyMap: Record<string, number> = {};
      data.forEach((record) => {
        const day = record.day;
        dailyMap[day] = (dailyMap[day] || 0) + Number(record.amount_usd || 0);
      });
      Object.entries(dailyMap).forEach(([day, amount]) => {
        dailySpend.push({ day, amount });
      });
      dailySpend.sort((a, b) => a.day.localeCompare(b.day));
    }

    return {
      monthSpend,
      monthLimit,
      remaining,
      dailySpend,
    };
  } catch (error) {
    console.error('Error in getSpendStats:', error);
    return {
      monthSpend: 0,
      monthLimit: Number(process.env.AUTOPILOT_COST_LIMIT_USD || 150),
      remaining: Number(process.env.AUTOPILOT_COST_LIMIT_USD || 150),
      dailySpend: [],
    };
  }
}


