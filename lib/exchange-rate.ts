/**
 * BNR Exchange Rate System
 * Fetches official EUR/RON rate from National Bank of Romania
 * https://www.bnr.ro/nbrfxrates.xml
 */

import { createClient } from '@supabase/supabase-js';

// Types
export interface ExchangeRateData {
  rateDate: string;      // YYYY-MM-DD from BNR
  eurRon: number;        // EUR → Lei rate
  fetchedAt: string;     // ISO timestamp
  source: 'BNR';
}

export interface ExchangeRateResponse {
  success: boolean;
  data?: ExchangeRateData;
  error?: string;
  cached?: boolean;
}

// Fallback rate if everything fails
const FALLBACK_RATE: ExchangeRateData = {
  rateDate: '2024-01-01',
  eurRon: 4.97,
  fetchedAt: new Date().toISOString(),
  source: 'BNR',
};

// Supabase client for server-side operations
function getSupabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  
  if (!supabaseUrl || !supabaseServiceKey) {
    console.warn('[ExchangeRate] Missing Supabase credentials, using fallback');
    return null;
  }
  
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: { persistSession: false }
  });
}

/**
 * Parse BNR XML and extract EUR rate
 * XML structure:
 * <DataSet>
 *   <Body>
 *     <Cube date="2024-01-15">
 *       <Rate currency="EUR">4.9700</Rate>
 *       <Rate currency="USD" multiplier="1">4.5600</Rate>
 *     </Cube>
 *   </Body>
 * </DataSet>
 */
function parseBnrXml(xmlText: string): { rateDate: string; eurRon: number } | null {
  try {
    // Extract Cube date using regex (more reliable than DOMParser in Node)
    const cubeMatch = xmlText.match(/<Cube\s+date="([^"]+)">/);
    if (!cubeMatch) {
      console.error('[ExchangeRate] Could not find Cube element in XML');
      return null;
    }
    const rateDate = cubeMatch[1];

    // Extract EUR rate - handle optional multiplier
    // Pattern: <Rate currency="EUR">value</Rate> or <Rate currency="EUR" multiplier="N">value</Rate>
    const eurMatch = xmlText.match(/<Rate\s+currency="EUR"(?:\s+multiplier="(\d+)")?[^>]*>([^<]+)<\/Rate>/);
    if (!eurMatch) {
      console.error('[ExchangeRate] Could not find EUR rate in XML');
      return null;
    }

    const multiplier = eurMatch[1] ? parseInt(eurMatch[1], 10) : 1;
    const rateValue = parseFloat(eurMatch[2].trim());

    if (isNaN(rateValue) || rateValue <= 0) {
      console.error('[ExchangeRate] Invalid EUR rate value:', eurMatch[2]);
      return null;
    }

    // Apply multiplier (e.g., if multiplier=100, divide by 100)
    const eurRon = rateValue / multiplier;

    // Sanity check: EUR/RON should be between 3 and 7
    if (eurRon < 3 || eurRon > 7) {
      console.error('[ExchangeRate] EUR/RON rate outside expected range:', eurRon);
      return null;
    }

    return { rateDate, eurRon };
  } catch (error) {
    console.error('[ExchangeRate] XML parsing error:', error);
    return null;
  }
}

/**
 * Fetch fresh rate from BNR
 */
export async function fetchBnrRate(): Promise<ExchangeRateData | null> {
  const BNR_URL = 'https://www.bnr.ro/nbrfxrates.xml';
  
  try {
    console.log('[ExchangeRate] Fetching from BNR...');
    
    const response = await fetch(BNR_URL, {
      headers: {
        'Accept': 'application/xml, text/xml, */*',
        'User-Agent': 'gobid.ro/1.0 (Exchange Rate Fetcher)',
      },
      next: { revalidate: 0 }, // No caching
    });

    if (!response.ok) {
      console.error('[ExchangeRate] BNR request failed:', response.status, response.statusText);
      return null;
    }

    const xmlText = await response.text();
    const parsed = parseBnrXml(xmlText);

    if (!parsed) {
      return null;
    }

    const rateData: ExchangeRateData = {
      rateDate: parsed.rateDate,
      eurRon: Math.round(parsed.eurRon * 10000) / 10000, // 4 decimal places
      fetchedAt: new Date().toISOString(),
      source: 'BNR',
    };

    console.log('[ExchangeRate] Successfully fetched rate:', rateData);
    return rateData;
  } catch (error) {
    console.error('[ExchangeRate] Fetch error:', error);
    return null;
  }
}

/**
 * Store rate in Supabase
 */
export async function storeRate(rate: ExchangeRateData): Promise<boolean> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return false;

  try {
    // Upsert: update if exists (by id=1), insert otherwise
    const { error } = await supabase
      .from('exchange_rates')
      .upsert({
        id: 1, // Single row for current rate
        rate_date: rate.rateDate,
        eur_ron: rate.eurRon,
        fetched_at: rate.fetchedAt,
        source: rate.source,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'id' });

    if (error) {
      console.error('[ExchangeRate] Store error:', error);
      return false;
    }

    console.log('[ExchangeRate] Rate stored successfully');
    return true;
  } catch (error) {
    console.error('[ExchangeRate] Store exception:', error);
    return false;
  }
}

/**
 * Get cached rate from Supabase
 */
export async function getCachedRate(): Promise<ExchangeRateData | null> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;

  try {
    const { data, error } = await supabase
      .from('exchange_rates')
      .select('rate_date, eur_ron, fetched_at, source')
      .eq('id', 1)
      .single();

    if (error || !data) {
      console.log('[ExchangeRate] No cached rate found');
      return null;
    }

    return {
      rateDate: data.rate_date,
      eurRon: data.eur_ron,
      fetchedAt: data.fetched_at,
      source: data.source as 'BNR',
    };
  } catch (error) {
    console.error('[ExchangeRate] Get cached error:', error);
    return null;
  }
}

/**
 * Get the best available rate (cached → fetch → fallback)
 * This is the main function to use
 */
export async function getExchangeRate(): Promise<ExchangeRateResponse> {
  // 1. Try cached rate first
  const cached = await getCachedRate();
  if (cached) {
    return { success: true, data: cached, cached: true };
  }

  // 2. Try fetching fresh rate
  const fresh = await fetchBnrRate();
  if (fresh) {
    await storeRate(fresh); // Store for next time
    return { success: true, data: fresh, cached: false };
  }

  // 3. Return fallback
  console.warn('[ExchangeRate] Using fallback rate');
  return { success: true, data: FALLBACK_RATE, cached: false };
}

/**
 * Update rate (for cron job)
 * Returns the new rate or keeps the old one if fetch fails
 */
export async function updateExchangeRate(): Promise<ExchangeRateResponse> {
  // Fetch fresh rate
  const fresh = await fetchBnrRate();
  
  if (fresh) {
    const stored = await storeRate(fresh);
    if (stored) {
      return { success: true, data: fresh, cached: false };
    }
  }

  // If fetch failed, try to return cached rate
  const cached = await getCachedRate();
  if (cached) {
    console.log('[ExchangeRate] Update failed, keeping cached rate');
    return { success: true, data: cached, cached: true, error: 'Fetch failed, using cached rate' };
  }

  // Last resort: fallback
  return { 
    success: false, 
    data: FALLBACK_RATE, 
    error: 'Could not fetch or find cached rate' 
  };
}

/**
 * Check if rate is stale (older than 24 hours)
 */
export function isRateStale(rate: ExchangeRateData): boolean {
  const fetchedAt = new Date(rate.fetchedAt).getTime();
  const now = Date.now();
  const twentyFourHours = 24 * 60 * 60 * 1000;
  return (now - fetchedAt) > twentyFourHours;
}
