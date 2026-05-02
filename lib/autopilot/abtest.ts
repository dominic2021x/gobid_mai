/**
 * A/B Testing Helpers - Gestionează experimentele A/B pentru Autopilot AI
 * Testează variante diferite de SEO, thumbnail-uri, caption-uri, etc.
 */

import { supabaseAdmin } from '@/lib/supabase';

export interface Experiment {
  id?: string;
  scope: 'seo' | 'thumbnail' | 'caption' | 'title' | 'description';
  item_id: string;
  variant: 'A' | 'B';
  metrics?: {
    ctr?: number;
    views?: number;
    likes?: number;
    engagement?: number;
    conversions?: number;
  };
  started_at?: string;
  finished_at?: string | null;
}

/**
 * Începe un experiment A/B (creează variantele A și B)
 */
export async function startExperiment(params: {
  scope: Experiment['scope'];
  item_id: string;
}): Promise<Experiment[]> {
  try {
    const { scope, item_id } = params;

    // Verifică dacă Supabase este configurat
    if (!supabaseAdmin) {
      throw new Error('Database not configured');
    }

    // Creează variantele A și B
    const { data, error } = await supabaseAdmin
      .from('experiments')
      .insert([
        {
          scope,
          item_id,
          variant: 'A',
          metrics: {},
        },
        {
          scope,
          item_id,
          variant: 'B',
          metrics: {},
        },
      ])
      .select();

    if (error) {
      console.error('Error starting experiment:', error);
      throw error;
    }

    console.log(`✅ Started A/B experiment: ${scope} for item ${item_id}`);
    return data || [];
  } catch (error) {
    console.error('Error in startExperiment:', error);
    throw error;
  }
}

/**
 * Finalizează un experiment cu metrici
 */
export async function finishExperiment(
  id: string,
  metrics: Experiment['metrics']
): Promise<void> {
  try {
    if (!supabaseAdmin) {
      throw new Error('Database not configured');
    }

    const { error } = await supabaseAdmin
      .from('experiments')
      .update({
        metrics,
        finished_at: new Date().toISOString(),
      })
      .eq('id', id);

    if (error) {
      console.error('Error finishing experiment:', error);
      throw error;
    }

    console.log(`✅ Finished experiment ${id} with metrics:`, metrics);
  } catch (error) {
    console.error('Error in finishExperiment:', error);
    throw error;
  }
}

/**
 * Obține experimentele active pentru un item
 */
export async function getActiveExperiments(item_id: string): Promise<Experiment[]> {
  try {
    if (!supabaseAdmin) {
      return [];
    }

    const { data, error } = await supabaseAdmin
      .from('experiments')
      .select('*')
      .eq('item_id', item_id)
      .is('finished_at', null)
      .order('started_at', { ascending: false });

    if (error) {
      console.error('Error getting active experiments:', error);
      return [];
    }

    return data || [];
  } catch (error) {
    console.error('Error in getActiveExperiments:', error);
    return [];
  }
}

/**
 * Obține rezultatele experimentelor finalizate
 */
export async function getExperimentResults(
  item_id: string,
  scope?: Experiment['scope']
): Promise<Experiment[]> {
  try {
    if (!supabaseAdmin) {
      return [];
    }

    let query = supabaseAdmin
      .from('experiments')
      .select('*')
      .eq('item_id', item_id)
      .not('finished_at', 'is', null)
      .order('finished_at', { ascending: false });

    if (scope) {
      query = query.eq('scope', scope);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error getting experiment results:', error);
      return [];
    }

    return data || [];
  } catch (error) {
    console.error('Error in getExperimentResults:', error);
    return [];
  }
}

/**
 * Determină varianta câștigătoare (cea cu metrici mai bune)
 */
export function getWinnerVariant(experiments: Experiment[]): 'A' | 'B' | null {
  if (experiments.length < 2) return null;

  const variantA = experiments.find((e) => e.variant === 'A');
  const variantB = experiments.find((e) => e.variant === 'B');

  if (!variantA || !variantB || !variantA.metrics || !variantB.metrics) {
    return null;
  }

  // Calculează scorul pentru fiecare variantă
  const scoreA =
    (variantA.metrics.ctr || 0) * 0.4 +
    (variantA.metrics.engagement || 0) * 0.3 +
    (variantA.metrics.conversions || 0) * 0.3;

  const scoreB =
    (variantB.metrics.ctr || 0) * 0.4 +
    (variantB.metrics.engagement || 0) * 0.3 +
    (variantB.metrics.conversions || 0) * 0.3;

  return scoreA > scoreB ? 'A' : 'B';
}

/**
 * Actualizează metricile unui experiment în timp real
 */
export async function updateExperimentMetrics(
  id: string,
  metrics: Partial<Experiment['metrics']>
): Promise<void> {
  try {
    if (!supabaseAdmin) {
      return;
    }

    // Obține experimentul curent
    const { data: experiment, error: fetchError } = await supabaseAdmin
      .from('experiments')
      .select('metrics')
      .eq('id', id)
      .single();

    if (fetchError || !experiment) {
      console.error('Error fetching experiment:', fetchError);
      return;
    }

    // Mergează metricile existente cu cele noi
    const currentMetrics = (experiment.metrics as Experiment['metrics']) || {};
    const updatedMetrics = {
      ...currentMetrics,
      ...metrics,
    };

    // Actualizează experimentul
    const { error: updateError } = await supabaseAdmin
      .from('experiments')
      .update({
        metrics: updatedMetrics,
      })
      .eq('id', id);

    if (updateError) {
      console.error('Error updating experiment metrics:', updateError);
    }
  } catch (error) {
    console.error('Error in updateExperimentMetrics:', error);
  }
}


