/**
 * API Route - AI Insights
 * GET /api/analytics/insights
 * Generează insight-uri AI bazate pe performanță
 */

import { NextResponse } from 'next/server';
import { getContentRecommendations, generateAIInsights } from '@/lib/analytics/ai-insights';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


type AnalyticsEventRow = {
  item_id?: string | null;
  type?: string | null;
};

type ProductRow = {
  id: string;
  titlu?: string | null;
  category?: string | null;
  location?: string | null;
};

type VideoRow = {
  id: string;
  url?: string | null;
  views?: number | null;
  likes?: number | null;
  engagement_rate?: number | null;
  platforme?: unknown;
};

type ProductStat = {
  productId: string;
  category: string;
  location?: string;
  views: number;
  conversions: number;
  engagement: number;
};

type VideoStat = {
  videoId: string;
  platform: string;
  views: number;
  likes: number;
  engagementRate: number;
};

export async function GET() {
  try {
    // Get performance data
    const { data: analytics } = await supabase
      .from('analytics')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(1000);

    const { data: products } = await supabase
      .from('produse')
      .select('id, titlu, category, location');

    const { data: videos } = await supabase
      .from('clipuri_video')
      .select('id, url, views, likes, engagement_rate, platforme');

    // Calculate product stats
    const productStats: ProductStat[] = (products as ProductRow[] | null)?.map((product: ProductRow) => {
      const views =
        analytics?.filter(
          (e: AnalyticsEventRow) => e.item_id === product.id && e.type === 'produs_view',
        ).length || 0;
      const conversions =
        analytics?.filter(
          (e: AnalyticsEventRow) => e.item_id === product.id && e.type === 'conversie',
        ).length || 0;
      const engagement =
        analytics?.filter(
          (e: AnalyticsEventRow) => e.item_id === product.id && e.type === 'engagement',
        ).length || 0;

      return {
        productId: product.id,
        category: product.category || 'N/A',
        location: product.location || undefined,
        views,
        conversions,
        engagement,
      };
    }) || [];

    // Calculate video stats
    const videoStats: VideoStat[] = (videos as VideoRow[] | null)?.map((video: VideoRow) => {
      const platforms = Array.isArray(video.platforme) 
        ? video.platforme 
        : typeof video.platforme === 'string' 
          ? JSON.parse(video.platforme) 
          : [];

      return {
        videoId: video.id,
        platform: platforms[0] || 'unknown',
        views: video.views || 0,
        likes: video.likes || 0,
        engagementRate: video.engagement_rate || 0,
      };
    }) || [];

    // Get top products and videos
    const topProducts = productStats
      .sort((a: ProductStat, b: ProductStat) => b.views - a.views)
      .slice(0, 5)
      .map((s: ProductStat) => ({
        id: s.productId,
        titlu:
          (products as ProductRow[] | null)?.find((p: ProductRow) => p.id === s.productId)?.titlu ||
          'N/A',
        views: s.views,
      }));

    const topVideos = videoStats
      .sort((a: VideoStat, b: VideoStat) => b.views - a.views)
      .slice(0, 3)
      .map((s: VideoStat) => ({
        id: s.videoId,
        url: (videos as VideoRow[] | null)?.find((v: VideoRow) => v.id === s.videoId)?.url || '',
        views: s.views,
        likes: s.likes || 0,
      }));

    // Calculate totals
    const totalViews =
      analytics?.filter(
        (e: AnalyticsEventRow) =>
          e.type === 'produs_view' || e.type === 'clip_view' || e.type === 'page_view',
      ).length || 0;

    const totalConversions =
      analytics?.filter((e: AnalyticsEventRow) => e.type === 'conversie').length || 0;
    const totalEngagement =
      analytics?.filter((e: AnalyticsEventRow) => e.type === 'engagement').length || 0;
    const avgEngagement = totalViews > 0 ? (totalEngagement / totalViews) * 100 : 0;

    // Generate insights
    const performanceData = {
      totalViews,
      totalConversions,
      totalEngagement,
      avgEngagement,
      topProducts,
      topVideos,
      productStats,
      videoStats,
    };

    const insights = await generateAIInsights(performanceData);

    return NextResponse.json(insights, { status: 200 });
  } catch (error: any) {
    console.error('Error in /api/analytics/insights:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to generate insights' },
      { status: 500 }
    );
  }
}


