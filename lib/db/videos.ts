/**
 * Database Videos - Operations pentru Clipuri Video
 * Funcții helper pentru gestionarea clipurilor video generate de AI în Supabase
 */

import { supabase } from '@/lib/supabase';

export interface Video {
  id?: string;
  produs_id: string;
  url: string;
  durata?: number; // în secunde
  platforme?: string[] | any; // ['youtube', 'tiktok', 'instagram', etc.]
  titlu?: string;
  descriere?: string;
  created_at?: string;
}

/**
 * Salvează un clip video generat de AI
 */
export async function saveVideo(video: Video) {
  const { data, error } = await supabase
    .from('clipuri_video')
    .insert([video])
    .select()
    .single();

  if (error) {
    console.error('Error saving video:', error);
    throw new Error(`Failed to save video: ${error.message}`);
  }

  return data;
}

/**
 * Obține toate clipurile video pentru un produs
 */
export async function getVideosByProductId(produsId: string) {
  const { data, error } = await supabase
    .from('clipuri_video')
    .select('*')
    .eq('produs_id', produsId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error getting videos:', error);
    throw new Error(`Failed to get videos: ${error.message}`);
  }

  return data || [];
}

/**
 * Obține un clip video după ID
 */
export async function getVideoById(id: string) {
  const { data, error } = await supabase
    .from('clipuri_video')
    .select('*')
    .eq('id', id)
    .single();

  if (error) {
    console.error('Error getting video:', error);
    throw new Error(`Failed to get video: ${error.message}`);
  }

  return data;
}

/**
 * Listă toate clipurile video
 */
export async function listAllVideos() {
  const { data, error } = await supabase
    .from('clipuri_video')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error listing videos:', error);
    throw new Error(`Failed to list videos: ${error.message}`);
  }

  return data || [];
}

/**
 * Șterge un clip video
 */
export async function deleteVideo(id: string) {
  const { error } = await supabase
    .from('clipuri_video')
    .delete()
    .eq('id', id);

  if (error) {
    console.error('Error deleting video:', error);
    throw new Error(`Failed to delete video: ${error.message}`);
  }

  return { success: true };
}


