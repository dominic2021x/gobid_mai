/**
 * API Route - Analytics Overview
 * GET /api/analytics/overview
 * Returnează statistici generale de performanță
 */

import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


type AnalyticsEventRow = {
  type?: string | null;
  item_type?: string | null;
  item_id?: string | null;
};

type ProductRow = {
  id: string;
  titlu?: string | null;
  created_at?: string | null;
};

type VideoRow = {
  id: string;
  url?: string | null;
  produs_id?: string | null;
  views?: number | null;
  likes?: number | null;
  created_at?: string | null;
};

export async function GET() {
  try {
    // Get all analytics events
    const { data: analytics, error: analyticsError } = await supabase
      .from('analytics')
      .select('*')
      .order('created_at', { ascending: false });

    if (analyticsError) throw analyticsError;

    // Get all products
    const { data: products, error: productsError } = await supabase
      .from('produse')
      .select('id, titlu, created_at');

    if (productsError) throw productsError;

    // Get all videos
    const { data: videos, error: videosError } = await supabase
      .from('clipuri_video')
      .select('id, url, produs_id, views, likes, created_at');

    if (videosError) throw videosError;

    // Calculate total views
    const totalViews =
      analytics?.filter(
        (e: AnalyticsEventRow) =>
          e.type === 'produs_view' || e.type === 'clip_view' || e.type === 'page_view',
      ).length || 0;

    // Calculate total conversions
    const totalConversions =
      analytics?.filter((e: AnalyticsEventRow) => e.type === 'conversie').length || 0;

    // Calculate total engagement
    const totalEngagement =
      analytics?.filter((e: AnalyticsEventRow) => e.type === 'engagement').length || 0;

    // Calculate average engagement rate
    const avgEngagement = totalViews > 0 
      ? ((totalEngagement / totalViews) * 100).toFixed(1)
      : '0.0';

    // Get top 5 products by views
    const productViews =
      analytics?.filter(
        (e: AnalyticsEventRow) => e.type === 'produs_view' && e.item_type === 'produs',
      ) || [];
    const productViewCounts: Record<string, number> = {};
    
    productViews.forEach((event: AnalyticsEventRow) => {
      const id = event.item_id;
      if (!id) return;
      productViewCounts[id] = (productViewCounts[id] || 0) + 1;
    });

    const topProducts = Object.entries(productViewCounts)
      .map(([itemId, views]) => {
        const product = (products as ProductRow[] | null)?.find((p: ProductRow) => p.id === itemId);
        return {
          id: itemId,
          titlu: product?.titlu || 'Produs necunoscut',
          views,
        };
      })
      .sort((a: { views: number }, b: { views: number }) => b.views - a.views)
      .slice(0, 5);

    // Get top 3 videos by views (from analytics or from video table)
    const videoViews =
      analytics?.filter(
        (e: AnalyticsEventRow) => e.type === 'clip_view' && e.item_type === 'clip',
      ) || [];
    const videoViewCounts: Record<string, number> = {};
    
    videoViews.forEach((event: AnalyticsEventRow) => {
      const id = event.item_id;
      if (!id) return;
      videoViewCounts[id] = (videoViewCounts[id] || 0) + 1;
    });

    // Merge with views from video table if available
    (videos as VideoRow[] | null)?.forEach((video: VideoRow) => {
      if (video.views) {
        videoViewCounts[video.id] = (videoViewCounts[video.id] || 0) + (video.views || 0);
      }
    });

    const topVideos = Object.entries(videoViewCounts)
      .map(([videoId, views]) => {
        const video = (videos as VideoRow[] | null)?.find((v: VideoRow) => v.id === videoId);
        return {
          id: videoId,
          url: video?.url || '',
          views: views || 0,
          likes: video?.likes || 0,
        };
      })
      .sort((a: { views: number }, b: { views: number }) => b.views - a.views)
      .slice(0, 3);

    // Calculate total videos generated
    const totalVideos = videos?.length || 0;

    return NextResponse.json({
      totalViews,
      totalConversions,
      totalEngagement,
      avgEngagement: parseFloat(avgEngagement),
      totalVideos,
      topProducts,
      topVideos,
      analytics: analytics?.slice(0, 100) || [], // Last 100 events
    }, { status: 200 });

  } catch (error: any) {
    console.error('Error in /api/analytics/overview:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to get analytics overview' },
      { status: 500 }
    );
  }
}


