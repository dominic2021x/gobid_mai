import { OPENAI_SDK_API_KEY } from "@/lib/ai/openaiSdkApiKey";

/**
 * Decision Engine - Motor de decizie AI pentru Autopilot
 * Analizează performanța și decide ce task-uri să producă
 */

import OpenAI from 'openai';
import { supabaseAdmin } from '@/lib/supabase';

const openai = new OpenAI({
  apiKey: OPENAI_SDK_API_KEY,
});

export interface AutopilotTask {
  type: 'seo' | 'article' | 'video' | 'social' | 'email';
  item_id?: string;
  impact: number; // 1-5
  est_cost_usd: number;
  payload: Record<string, any>;
  score?: number; // Calculat: impact / cost
}

export interface DecisionPlan {
  tasks: AutopilotTask[];
  reasoning?: string;
  total_est_cost?: number;
}

/**
 * Decide planul de acțiune pentru ziua de azi
 */
export async function decidePlanForToday(): Promise<AutopilotTask[]> {
  try {
    console.log('🧠 Decision Engine: Starting analysis...');

    // 1. Citește date agregate din Supabase
    const analytics = await getAnalyticsData();
    const products = await getProductsData();
    const videos = await getVideosData();

    // 2. Calculează produsele populare
    const topProducts = calculateTopProducts(analytics, products);

    // 3. Calculează clipurile populare
    const topVideos = calculateTopVideos(videos);

    // 4. Citește politici din autopilot_policies
    const policies = await getPolicies();

    // 5. Generează plan cu GPT-4o
    const plan = await generatePlanWithAI({
      topProducts,
      topVideos,
      analytics,
      policies,
    });

    // 6. Sortează task-urile după impact/cost (bang-for-buck)
    const tasks = plan.tasks
      .map((task) => ({
        ...task,
        score: (task.impact || 1) / Math.max(0.5, Number(task.est_cost_usd || 1)),
      }))
      .sort((a, b) => (b.score || 0) - (a.score || 0));

    console.log(`✅ Decision Engine: Generated ${tasks.length} tasks`);

    // 7. Limitează numărul de task-uri bazat pe politici
    const maxTasks = policies.daily_task_limit?.value || 5;
    return tasks.slice(0, maxTasks);
  } catch (error) {
    console.error('Error in decidePlanForToday:', error);
    return [];
  }
}

/**
 * Obține date de analytics
 */
async function getAnalyticsData(): Promise<any[]> {
  try {
    if (!supabaseAdmin) {
      return [];
    }

    const { data, error } = await supabaseAdmin
      .from('analytics')
      .select('*')
      .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()); // Ultimele 7 zile

    if (error) {
      console.error('Error fetching analytics:', error);
      return [];
    }

    return data || [];
  } catch (error) {
    console.error('Error in getAnalyticsData:', error);
    return [];
  }
}

/**
 * Obține date despre produse
 */
async function getProductsData(): Promise<any[]> {
  try {
    if (!supabaseAdmin) {
      return [];
    }

    const { data, error } = await supabaseAdmin
      .from('produse')
      .select('id, titlu, descriere, pret, imagini, status')
      .eq('status', 'active')
      .limit(100);

    if (error) {
      console.error('Error fetching products:', error);
      return [];
    }

    return data || [];
  } catch (error) {
    console.error('Error in getProductsData:', error);
    return [];
  }
}

/**
 * Obține date despre clipuri video
 */
async function getVideosData(): Promise<any[]> {
  try {
    if (!supabaseAdmin) {
      return [];
    }

    const { data, error } = await supabaseAdmin
      .from('clipuri_video')
      .select('id, produs_id, url, views, likes, engagement_rate, created_at')
      .order('views', { ascending: false })
      .limit(50);

    if (error) {
      console.error('Error fetching videos:', error);
      return [];
    }

    return data || [];
  } catch (error) {
    console.error('Error in getVideosData:', error);
    return [];
  }
}

/**
 * Calculează produsele cele mai populare
 */
function calculateTopProducts(analytics: any[], products: any[]): any[] {
  const productCounts: Record<string, number> = {};

  analytics
    .filter((r) => r.type === 'produs_view' || r.item_type === 'produs')
    .forEach((r) => {
      const itemId = r.item_id;
      productCounts[itemId] = (productCounts[itemId] || 0) + 1;
    });

  const top = Object.entries(productCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([id, views]) => {
      const product = products.find((p) => p.id === id);
      return {
        id,
        views,
        titlu: product?.titlu || 'Necunoscut',
        pret: product?.pret || 0,
        imagini: product?.imagini || [],
      };
    });

  return top;
}

/**
 * Calculează clipurile cele mai populare
 */
function calculateTopVideos(videos: any[]): any[] {
  return videos
    .sort((a, b) => (b.views || 0) - (a.views || 0))
    .slice(0, 10)
    .map((video) => ({
      id: video.id,
      views: video.views || 0,
      likes: video.likes || 0,
      engagement_rate: video.engagement_rate || 0,
      produs_id: video.produs_id,
    }));
}

/**
 * Obține politici din autopilot_policies
 */
async function getPolicies(): Promise<Record<string, any>> {
  try {
    if (!supabaseAdmin) {
      return {};
    }

    const { data, error } = await supabaseAdmin.from('autopilot_policies').select('key, value');

    if (error) {
      console.error('Error fetching policies:', error);
      return {};
    }

    const policies: Record<string, any> = {};
    (data || []).forEach((policy) => {
      policies[policy.key] = policy.value;
    });

    return policies;
  } catch (error) {
    console.error('Error in getPolicies:', error);
    return {};
  }
}

/**
 * Generează plan cu GPT-4o
 */
async function generatePlanWithAI(params: {
  topProducts: any[];
  topVideos: any[];
  analytics: any[];
  policies: Record<string, any>;
}): Promise<DecisionPlan> {
  try {
    const { topProducts, topVideos, analytics, policies } = params;

    const prompt = `
Ești un sistem AI de marketing automat pentru platforma gobid.ro (licitații online).

DATE DISPONIBILE:
- Produse populare (ultimele 7 zile):
${JSON.stringify(topProducts.slice(0, 5), null, 2)}

- Clipuri video populare:
${JSON.stringify(topVideos.slice(0, 3), null, 2)}

- Total view-uri (ultimele 7 zile): ${analytics.length}

- Politici configurate:
${JSON.stringify(policies, null, 2)}

OBIECTIV: Creștere engagement cu 10% săptămânal prin:
1. SEO optimizat pentru produse populare
2. Articole de blog relevante
3. Clipuri video cu avatar AI pentru produse top
4. Postări sociale (TikTok, Instagram Reels, YouTube Shorts)
5. Email-uri de promovare pentru utilizatori interesați

PROPUNE un plan de acțiune pentru AZI (max 5 task-uri) din următoarele tipuri:
- "seo": Optimizare SEO pentru un produs (necesită: item_id, titlu, descriere)
- "article": Articol de blog (necesită: topic, target_product_id)
- "video": Clip video cu avatar AI (necesită: produs_id, script)
- "social": Postare social media (necesită: platform, content, media_url)
- "email": Email de promovare (necesită: subject, content, target_audience)

Fiecare task trebuie să aibă:
- type: string (seo|article|video|social|email)
- item_id: string (optional, ID-ul produsului/clipului)
- impact: number (1-5, cât de mare este impactul așteptat)
- est_cost_usd: number (cost estimat în USD)
- payload: object (date specifice pentru task)

Răspunde STRICT în format JSON:
{
  "tasks": [
    {
      "type": "seo",
      "item_id": "prod-123",
      "impact": 4,
      "est_cost_usd": 0.05,
      "payload": {
        "titlu": "Apartament 3 camere București",
        "descriere": "Descriere optimizată..."
      }
    },
    ...
  ],
  "reasoning": "Explicație scurtă a deciziei"
}

IMPORTANT: 
- Prioritizează task-urile cu impact mare și cost mic
- Respectă limitele din policies (daily_video_quota, max_email_per_day)
- Costul total estimat nu trebuie să depășească $10 pe zi
`;

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content:
            'Ești un expert în marketing automat și optimizare. Răspunzi STRICT în format JSON, fără text suplimentar.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      temperature: 0.3,
      response_format: { type: 'json_object' },
    });

    const content = completion.choices[0]?.message?.content || '{}';
    let plan: DecisionPlan;

    try {
      plan = JSON.parse(content);
    } catch (error) {
      console.error('Error parsing AI response:', error);
      plan = { tasks: [] };
    }

    // Validează și normalizează task-urile
    plan.tasks = (plan.tasks || []).map((task: any) => ({
      type: task.type || 'seo',
      item_id: task.item_id || undefined,
      impact: Math.min(5, Math.max(1, Number(task.impact || 3))),
      est_cost_usd: Math.max(0.01, Number(task.est_cost_usd || 0.1)),
      payload: task.payload || {},
    }));

    console.log('🤖 AI Decision:', plan.reasoning || 'No reasoning provided');
    console.log(`📊 Generated ${plan.tasks.length} tasks`);

    return plan;
  } catch (error) {
    console.error('Error in generatePlanWithAI:', error);
    return { tasks: [] };
  }
}

/**
 * Obține statistici pentru dashboard
 */
export async function getDecisionStats(): Promise<{
  topProducts: any[];
  topVideos: any[];
  totalViews: number;
  avgEngagement: number;
}> {
  try {
    const analytics = await getAnalyticsData();
    const products = await getProductsData();
    const videos = await getVideosData();

    const topProducts = calculateTopProducts(analytics, products);
    const topVideos = calculateTopVideos(videos);

    const totalViews = analytics.length;
    const avgEngagement =
      videos.length > 0
        ? videos.reduce((sum, v) => sum + (v.engagement_rate || 0), 0) / videos.length
        : 0;

    return {
      topProducts,
      topVideos,
      totalViews,
      avgEngagement,
    };
  } catch (error) {
    console.error('Error in getDecisionStats:', error);
    return {
      topProducts: [],
      topVideos: [],
      totalViews: 0,
      avgEngagement: 0,
    };
  }
}


