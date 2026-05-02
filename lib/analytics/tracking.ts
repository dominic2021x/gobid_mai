/**
 * Analytics Tracking - Sistem de urmărire a performanței
 * Trackează vizualizări, engagement, conversii și alte metrici
 */

import { supabase } from '@/lib/supabase';

export type AnalyticsEventType = 
  | 'produs_view' 
  | 'clip_view' 
  | 'page_view' 
  | 'conversie' 
  | 'click' 
  | 'engagement'
  | 'search'
  | 'share';

export interface AnalyticsEvent {
  type: AnalyticsEventType;
  item_id: string; // ID-ul produsului, clipului, paginii, etc.
  item_type?: 'produs' | 'clip' | 'page' | 'auction';
  metadata?: Record<string, any>; // Date suplimentare (ex: durata, source, etc.)
  user_id?: string; // ID-ul utilizatorului (dacă este logat)
  session_id?: string; // ID-ul sesiunii
  timestamp?: string;
}

/** Rând din tabelul `analytics` la citire (clientul Supabase nu inferă schema aici). */
type AnalyticsDbRow = {
  type?: string | null;
  metadata?: { timeSpent?: number } | null;
};

/**
 * Trackează un eveniment de analytics
 */
export async function trackEvent(event: AnalyticsEvent): Promise<void> {
  try {
    if (typeof window === 'undefined') {
      // Server-side - salvează direct în Supabase
      await supabase.from('analytics').insert([
        {
          type: event.type,
          item_id: event.item_id,
          item_type: event.item_type || null,
          metadata: event.metadata || {},
          user_id: event.user_id || null,
          session_id: event.session_id || null,
          created_at: event.timestamp || new Date().toISOString(),
        },
      ]);
    } else {
      // Client-side - trimite la API
      await fetch('/api/analytics/track', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(event),
      });
    }
  } catch (error) {
    console.error('Error tracking event:', error);
    // Nu aruncăm eroarea pentru a nu afecta experiența utilizatorului
  }
}

/**
 * Trackează vizualizarea unui produs
 */
export async function trackProductView(productId: string, metadata?: Record<string, any>): Promise<void> {
  const sessionId = typeof window !== 'undefined' 
    ? localStorage.getItem('session_id') || generateSessionId()
    : undefined;

  await trackEvent({
    type: 'produs_view',
    item_id: productId,
    item_type: 'produs',
    metadata: {
      ...metadata,
      timestamp: new Date().toISOString(),
    },
    session_id: sessionId,
  });
}

/**
 * Trackează vizualizarea unui clip video
 */
export async function trackVideoView(videoId: string, metadata?: Record<string, any>): Promise<void> {
  const sessionId = typeof window !== 'undefined' 
    ? localStorage.getItem('session_id') || generateSessionId()
    : undefined;

  await trackEvent({
    type: 'clip_view',
    item_id: videoId,
    item_type: 'clip',
    metadata: {
      ...metadata,
      timestamp: new Date().toISOString(),
    },
    session_id: sessionId,
  });
}

/**
 * Trackează vizualizarea unei pagini
 */
export async function trackPageView(pagePath: string, metadata?: Record<string, any>): Promise<void> {
  const sessionId = typeof window !== 'undefined' 
    ? localStorage.getItem('session_id') || generateSessionId()
    : undefined;

  await trackEvent({
    type: 'page_view',
    item_id: pagePath,
    item_type: 'page',
    metadata: {
      ...metadata,
      timestamp: new Date().toISOString(),
    },
    session_id: sessionId,
  });
}

/**
 * Trackează o conversie (deblocare anunț, token consumat, etc.)
 */
export async function trackConversion(
  itemId: string,
  itemType: 'produs' | 'clip' | 'page',
  metadata?: Record<string, any>
): Promise<void> {
  const sessionId = typeof window !== 'undefined' 
    ? localStorage.getItem('session_id') || generateSessionId()
    : undefined;

  const userId = typeof window !== 'undefined'
    ? localStorage.getItem('userInfo') 
      ? JSON.parse(localStorage.getItem('userInfo') || '{}').id 
      : undefined
    : undefined;

  await trackEvent({
    type: 'conversie',
    item_id: itemId,
    item_type: itemType,
    metadata: {
      ...metadata,
      timestamp: new Date().toISOString(),
    },
    user_id: userId,
    session_id: sessionId,
  });
}

/**
 * Trackează engagement (like, share, comentariu)
 */
export async function trackEngagement(
  itemId: string,
  itemType: 'produs' | 'clip' | 'page',
  engagementType: 'like' | 'share' | 'comment' | 'save',
  metadata?: Record<string, any>
): Promise<void> {
  const sessionId = typeof window !== 'undefined' 
    ? localStorage.getItem('session_id') || generateSessionId()
    : undefined;

  await trackEvent({
    type: 'engagement',
    item_id: itemId,
    item_type: itemType,
    metadata: {
      engagement_type: engagementType,
      ...metadata,
      timestamp: new Date().toISOString(),
    },
    session_id: sessionId,
  });
}

/**
 * Generează un ID de sesiune unic
 */
function generateSessionId(): string {
  if (typeof window === 'undefined') return '';
  
  let sessionId = localStorage.getItem('session_id');
  if (!sessionId) {
    sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    localStorage.setItem('session_id', sessionId);
  }
  return sessionId;
}

/**
 * Obține statistici pentru un item
 */
export async function getItemStats(
  itemId: string,
  itemType: 'produs' | 'clip' | 'page'
): Promise<{
  views: number;
  conversions: number;
  engagement: number;
  avgTimeSpent?: number;
}> {
  try {
    const { data, error } = await supabase
      .from('analytics')
      .select('*')
      .eq('item_id', itemId)
      .eq('item_type', itemType);

    if (error) throw error;

    const rows = (data ?? []) as AnalyticsDbRow[];
    const views = rows.filter((e) => e.type === `${itemType}_view` || e.type === 'page_view').length;
    const conversions = rows.filter((e) => e.type === 'conversie').length;
    const engagement = rows.filter((e) => e.type === 'engagement').length;

    // Calculează timpul mediu petrecut (dacă există în metadata)
    const timeSpentData = rows
      .filter((e): e is AnalyticsDbRow & { metadata: { timeSpent: number } } =>
        typeof e.metadata?.timeSpent === 'number'
      )
      .map((e) => e.metadata.timeSpent);

    const avgTimeSpent =
      timeSpentData.length > 0
        ? timeSpentData.reduce((a, b) => a + b, 0) / timeSpentData.length
        : undefined;

    return {
      views,
      conversions,
      engagement,
      avgTimeSpent,
    };
  } catch (error) {
    console.error('Error getting item stats:', error);
    return {
      views: 0,
      conversions: 0,
      engagement: 0,
    };
  }
}


