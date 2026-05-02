'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { trackPageAccess, formatPageName } from '../utils/pageTracker';
import supabase from '@/lib/supabase';

const ACTIVITY_TRACK_INTERVAL_MS = 120_000;
const ACTIVITY_TRACK_THROTTLE_MS = 90_000;

function shouldSkipRecentActivity(pathname: string): boolean {
  try {
    const key = `gobid:last-activity:${pathname}`;
    const now = Date.now();
    const last = Number(window.localStorage.getItem(key) || "0");
    if (Number.isFinite(last) && now - last < ACTIVITY_TRACK_THROTTLE_MS) {
      return true;
    }
    window.localStorage.setItem(key, String(now));
    return false;
  } catch {
    return false;
  }
}

// Componentă pentru tracking automat al paginilor
export default function PageTracker() {
  const pathname = usePathname();
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!pathname || typeof window === 'undefined') return;

    const pageName = formatPageName(pathname);
    trackPageAccess(pageName, pathname);

    // Track activity in Supabase for authenticated users
    const trackActivity = async () => {
      try {
        if (shouldSkipRecentActivity(pathname)) return;

        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user) return;

        const accessToken = session.access_token;
        if (!accessToken) return;

        // Track activity via API
        await fetch('/api/user/activity', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`
          },
          body: JSON.stringify({
            event: 'page_view',
            properties: {
              path: pathname,
              page: pageName,
              timestamp: new Date().toISOString()
            }
          })
        }).catch(err => console.error('Error tracking activity:', err));
      } catch (error) {
        console.error('Error in trackActivity:', error);
      }
    };

    // Track activity on mount and when pathname changes
    trackActivity();

    // Keep presence reasonably fresh without creating a high-volume activity log stream.
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }
    intervalRef.current = setInterval(trackActivity, ACTIVITY_TRACK_INTERVAL_MS);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [pathname]);

  return null; // Componentă invizibilă
}

















