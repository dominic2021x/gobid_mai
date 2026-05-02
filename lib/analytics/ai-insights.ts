import { OPENAI_SDK_API_KEY } from "@/lib/ai/openaiSdkApiKey";

/**
 * AI Insights - Analiză și recomandări AI bazate pe performanță
 * Folosește GPT-4o pentru a analiza datele și a genera recomandări
 */

import OpenAI from 'openai';
import { supabase } from '@/lib/supabase';

const openai = new OpenAI({
  apiKey: OPENAI_SDK_API_KEY,
});

export interface PerformanceData {
  totalViews: number;
  totalConversions: number;
  totalEngagement: number;
  avgEngagement: number;
  topProducts: Array<{
    id: string;
    titlu: string;
    views: number;
  }>;
  topVideos: Array<{
    id: string;
    url: string;
    views: number;
    likes: number;
  }>;
  productStats: Array<{
    productId: string;
    category: string;
    location?: string;
    views: number;
    conversions: number;
    engagement: number;
  }>;
  videoStats: Array<{
    videoId: string;
    platform: string;
    views: number;
    likes: number;
    engagementRate: number;
  }>;
}

export interface AIInsight {
  summary: string;
  recommendations: string[];
  topPerformingContent: {
    type: 'produs' | 'clip';
    items: string[];
  };
  areasToImprove: string[];
  nextSteps: string[];
  predictedTrends: string[];
}

/** Rând minimal din `analytics` folosit în agregări (clientul Supabase nu inferă schema aici). */
type AnalyticsEventRow = {
  item_id?: string | null;
  type?: string | null;
};

type ProduseInsightRow = {
  id: string;
  titlu: string | null;
  category: string | null;
  location: string | null;
};

type ClipVideoInsightRow = {
  id: string;
  views: number | null;
  likes: number | null;
  engagement_rate: number | null;
  platforme: unknown;
  url: string | null;
};

/**
 * Analizează datele de performanță și generează insight-uri AI
 */
export async function generateAIInsights(data: PerformanceData): Promise<AIInsight> {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is not configured');
  }

  const prompt = `Ești un expert în analiză de performanță și marketing digital pentru platforme de licitații online.

Analizează următoarele date de performanță și oferă insight-uri și recomandări concrete:

**Metrici generale:**
- Vizualizări totale: ${data.totalViews}
- Conversii totale: ${data.totalConversions}
- Engagement total: ${data.totalEngagement}
- Engagement mediu: ${data.avgEngagement.toFixed(2)}%

**Top 5 produse populare:**
${data.topProducts.map((p, i) => `${i + 1}. ${p.titlu} - ${p.views} vizualizări`).join('\n')}

**Top 3 clipuri video:**
${data.topVideos.map((v, i) => `${i + 1}. ${v.url} - ${v.views} vizualizări, ${v.likes} like-uri`).join('\n')}

**Statistici pe produse:**
${data.productStats.map((s) => 
  `- ${s.productId} (${s.category}${s.location ? `, ${s.location}` : ''}): ${s.views} views, ${s.conversions} conversii, ${s.engagement} engagement`
).join('\n')}

**Statistici pe clipuri video:**
${data.videoStats.map((s) => 
  `- ${s.videoId} (${s.platform}): ${s.views} views, ${s.likes} likes, ${s.engagementRate.toFixed(2)}% engagement`
).join('\n')}

**SARCINA TA:**
Generează un raport complet în limba română cu:
1. Un rezumat executiv al performanței (2-3 propoziții)
2. 5-7 recomandări concrete și acțiunabile pentru îmbunătățire
3. Identificarea tipurilor de conținut care funcționează cel mai bine
4. Zone care necesită îmbunătățiri
5. Pașii următori recomandați
6. Tendințe prezise pe baza datelor actuale

Răspunde ÎN FORMAT JSON cu următoarea structură:
{
  "summary": "rezumat executiv...",
  "recommendations": ["recomandare 1", "recomandare 2", ...],
  "topPerformingContent": {
    "type": "produs",
    "items": ["tip de conținut 1", "tip de conținut 2"]
  },
  "areasToImprove": ["zona 1", "zona 2", ...],
  "nextSteps": ["pas 1", "pas 2", ...],
  "predictedTrends": ["tendință 1", "tendință 2", ...]
}

IMPORTANT: Returnează DOAR JSON valid, fără markdown, fără explicații.`;

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'Ești un expert în analiză de performanță și marketing digital. Generezi insight-uri clare, acțiunabile și bazate pe date concrete.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      temperature: 0.7,
      max_tokens: 2000,
      response_format: { type: 'json_object' },
    });

    const content = completion.choices[0]?.message?.content;
    if (!content) {
      throw new Error('No response from GPT-4o');
    }

    const insights = JSON.parse(content) as AIInsight;
    return insights;
  } catch (error: any) {
    console.error('Error generating AI insights:', error);
    throw new Error(`Failed to generate AI insights: ${error.message}`);
  }
}

/**
 * Obține recomandări AI pentru conținutul următor
 */
export async function getContentRecommendations(): Promise<string[]> {
  try {
    // Get performance data
    const { data: analyticsData } = await supabase
      .from('analytics')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(1000);

    const { data: productsData } = await supabase
      .from('produse')
      .select('id, titlu, category, location');

    const { data: videosData } = await supabase
      .from('clipuri_video')
      .select('id, views, likes, engagement_rate, platforme, url');

    const analytics: AnalyticsEventRow[] = (analyticsData ?? []) as AnalyticsEventRow[];
    const products: ProduseInsightRow[] = (productsData ?? []) as ProduseInsightRow[];
    const videos: ClipVideoInsightRow[] = (videosData ?? []) as ClipVideoInsightRow[];

    // Calculate product stats
    const productStats = products.map((product) => {
      const views = analytics.filter((e) => e.item_id === product.id && e.type === 'produs_view').length;
      const conversions = analytics.filter((e) => e.item_id === product.id && e.type === 'conversie').length;
      const engagement = analytics.filter((e) => e.item_id === product.id && e.type === 'engagement').length;

      return {
        productId: product.id,
        category: product.category || 'N/A',
        location: product.location || undefined,
        views,
        conversions,
        engagement,
      };
    });

    // Calculate video stats
    const videoStats = videos.map((video) => {
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
    });

    // Get top products and videos
    const topProducts = productStats
      .sort((a, b) => b.views - a.views)
      .slice(0, 5)
      .map((s) => ({
        id: s.productId,
        titlu: products.find((p) => p.id === s.productId)?.titlu || 'N/A',
        views: s.views,
      }));

    const topVideos = videoStats
      .sort((a, b) => b.views - a.views)
      .slice(0, 3)
      .map((s) => ({
        id: s.videoId,
        url: videos.find((v) => v.id === s.videoId)?.url || '',
        views: s.views,
        likes: s.likes || 0,
      }));

    // Calculate totals
    const totalViews = analytics.filter(
      (e) => e.type === 'produs_view' || e.type === 'clip_view' || e.type === 'page_view'
    ).length;

    const totalConversions = analytics.filter((e) => e.type === 'conversie').length;
    const totalEngagement = analytics.filter((e) => e.type === 'engagement').length;
    const avgEngagement = totalViews > 0 ? (totalEngagement / totalViews) * 100 : 0;

    // Generate insights
    const performanceData: PerformanceData = {
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
    return insights.recommendations;
  } catch (error: any) {
    console.error('Error getting content recommendations:', error);
    return [];
  }
}


