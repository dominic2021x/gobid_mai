/**
 * Database SEO - Operations pentru SEO
 * Funcții helper pentru gestionarea SEO-ului produselor în Supabase
 */

import { supabase } from '@/lib/supabase';

export interface SEO {
  id?: string;
  produs_id: string;
  titlu_seo?: string;
  descriere_seo?: string;
  cuvinte_cheie?: string;
  scor?: number;
  created_at?: string;
  updated_at?: string;
}

/**
 * Salvează date SEO pentru un produs
 */
export async function saveSeo(seo: SEO) {
  const { data, error } = await supabase
    .from('seo')
    .insert([seo])
    .select()
    .single();

  if (error) {
    console.error('Error saving SEO:', error);
    throw new Error(`Failed to save SEO: ${error.message}`);
  }

  return data;
}

/**
 * Obține SEO pentru un produs
 */
export async function getSeoByProductId(produsId: string) {
  const { data, error } = await supabase
    .from('seo')
    .select('*')
    .eq('produs_id', produsId)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (error && error.code !== 'PGRST116') { // PGRST116 = no rows returned
    console.error('Error getting SEO:', error);
    throw new Error(`Failed to get SEO: ${error.message}`);
  }

  return data || null;
}

/**
 * Actualizează SEO pentru un produs
 */
export async function updateSeo(produsId: string, updates: Partial<SEO>) {
  // Verifică dacă există SEO pentru acest produs
  const existing = await getSeoByProductId(produsId);

  if (existing) {
    // Actualizează existent
    const { data, error } = await supabase
      .from('seo')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', existing.id)
      .select()
      .single();

    if (error) {
      console.error('Error updating SEO:', error);
      throw new Error(`Failed to update SEO: ${error.message}`);
    }

    return data;
  } else {
    // Creează nou
    return await saveSeo({ ...updates, produs_id: produsId } as SEO);
  }
}

/**
 * Listă toate datele SEO
 */
export async function listAllSeo() {
  const { data, error } = await supabase
    .from('seo')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error listing SEO:', error);
    throw new Error(`Failed to list SEO: ${error.message}`);
  }

  return data || [];
}


