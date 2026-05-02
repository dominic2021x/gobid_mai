/**
 * useExchangeRate Hook
 * 
 * Fetches and caches the BNR EUR/RON exchange rate.
 * Automatically updates the global currency converter.
 * 
 * Usage:
 * ```tsx
 * const { rate, rateDate, loading, error } = useExchangeRate();
 * 
 * // Convert prices
 * const eurPrice = ronToEur(ronAmount, rate);
 * ```
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import { setCachedRate, getRonEurRate } from '@/lib/currency';

export interface ExchangeRateState {
  rate: number;
  rateDate: string | null;
  source: string | null;
  loading: boolean;
  error: string | null;
  lastFetched: Date | null;
}

// Cache key for localStorage
const CACHE_KEY = 'gobid_exchange_rate';
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

interface CachedRateData {
  rate: number;
  rateDate: string;
  source: string;
  fetchedAt: number;
}

/**
 * Load rate from localStorage cache
 */
function loadCachedRate(): CachedRateData | null {
  if (typeof window === 'undefined') return null;
  
  try {
    const cached = localStorage.getItem(CACHE_KEY);
    if (!cached) return null;
    
    const data: CachedRateData = JSON.parse(cached);
    
    // Check if cache is still valid
    if (Date.now() - data.fetchedAt > CACHE_TTL) {
      return null; // Cache expired
    }
    
    return data;
  } catch {
    return null;
  }
}

/**
 * Save rate to localStorage cache
 */
function saveCachedRate(data: CachedRateData): void {
  if (typeof window === 'undefined') return;
  
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(data));
  } catch {
    // Ignore storage errors
  }
}

/**
 * Hook to fetch and manage exchange rate
 */
export function useExchangeRate(): ExchangeRateState & { refetch: () => Promise<void> } {
  const [state, setState] = useState<ExchangeRateState>({
    rate: getRonEurRate(),
    rateDate: null,
    source: null,
    loading: true,
    error: null,
    lastFetched: null,
  });

  const fetchRate = useCallback(async () => {
    try {
      setState(prev => ({ ...prev, loading: true, error: null }));

      // Check localStorage cache first
      const cached = loadCachedRate();
      if (cached) {
        setCachedRate(cached.rate, cached.rateDate);
        setState({
          rate: cached.rate,
          rateDate: cached.rateDate,
          source: cached.source,
          loading: false,
          error: null,
          lastFetched: new Date(cached.fetchedAt),
        });
        return;
      }

      // Fetch from API
      const response = await fetch('/api/exchange-rate', {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      const data = await response.json();

      if (!data.success || !data.rate) {
        throw new Error(data.error || 'Invalid response');
      }

      const now = Date.now();
      
      // Update global cached rate
      setCachedRate(data.rate, data.rateDate);

      // Save to localStorage
      saveCachedRate({
        rate: data.rate,
        rateDate: data.rateDate,
        source: data.source,
        fetchedAt: now,
      });

      setState({
        rate: data.rate,
        rateDate: data.rateDate,
        source: data.source,
        loading: false,
        error: null,
        lastFetched: new Date(now),
      });
    } catch (error: any) {
      console.error('[useExchangeRate] Error:', error);
      
      // Keep using the fallback rate
      setState(prev => ({
        ...prev,
        loading: false,
        error: error.message || 'Failed to fetch rate',
      }));
    }
  }, []);

  // Fetch on mount
  useEffect(() => {
    fetchRate();
  }, [fetchRate]);

  // Refetch periodically (every 5 minutes)
  useEffect(() => {
    const interval = setInterval(fetchRate, CACHE_TTL);
    return () => clearInterval(interval);
  }, [fetchRate]);

  return {
    ...state,
    refetch: fetchRate,
  };
}

export default useExchangeRate;
