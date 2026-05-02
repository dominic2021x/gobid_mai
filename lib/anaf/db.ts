/**
 * Database Helper pentru ANAF Imports
 * Funcții helper pentru gestionarea importurilor și licitațiilor ANAF în Supabase
 */

import { supabaseAdmin } from '@/lib/supabase';
import { ANAFLicitatieData } from './gptParser';

export interface ANAFImport {
  id: string;
  source_type: string;
  source_url: string;
  pdf_url: string | null;
  pdf_storage_path: string | null;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  error_message: string | null;
  extracted_data: any;
  metadata: any;
  created_at: string;
  updated_at: string;
  processed_at: string | null;
}

export interface ANAFLicitatie {
  id: string;
  import_id: string | null;
  product_id: string | null;
  numar_licitatie: string | null;
  data_licitatie: string | null;
  ora_licitatie: string | null;
  loc_licitatie: string | null;
  tip_bun: string | null;
  categoria_teren: string | null;
  suprafata_totala: number | null;
  unitate_suprafata: string | null;
  judet: string;
  localitate: string;
  adresa: string | null;
  coordinates: any | null;
  lat: number | null;
  lng: number | null;
  street_view_image_url: string | null;
  nume_contribuabil: string | null;
  pret_evaluare: number | null;
  tva_inclus: boolean;
  valoare_tva: number | null;
  moneda: string;
  conditii_suplimentare: any;
  detalii_relevante: string | null;
  pdf_url: string | null;
  pdf_storage_path: string | null;
  status: string;
  product_created: boolean;
  metadata: any;
  created_at: string;
  updated_at: string;
}


/**
 * Creează un import nou în baza de date sau returnează importul existent
 */
export async function createANAFImport(data: {
  source_type?: string;
  source_url: string;
  pdf_url?: string;
  metadata?: any;
  allowReimport?: boolean; // Dacă true, permite re-import chiar dacă există deja
}): Promise<ANAFImport> {
  if (!supabaseAdmin) {
    throw new Error('Supabase admin client not configured');
  }

  // Verifică dacă există deja un import cu același URL
  const { data: existingImport } = await supabaseAdmin
    .from('anaf_imports')
    .select('*')
    .eq('source_url', data.source_url)
    .single();

  if (existingImport) {
    // Dacă există deja și nu permitem re-import
    if (!data.allowReimport) {
      // Dacă importul anterior a eșuat, permitem re-import
      if (existingImport.status === 'failed') {
        console.log(`[ANAF Import] Found failed import, allowing re-import: ${existingImport.id}`);
        // Resetăm statusul pentru re-procesare
        await updateANAFImportStatus(existingImport.id, 'pending');
        return existingImport;
      }
      
      // Dacă importul a reușit, aruncă eroare
      if (existingImport.status === 'completed') {
        throw new Error(
          `Un import cu acest URL există deja (ID: ${existingImport.id}, Status: ${existingImport.status}). ` +
          `Dacă dorești să re-importezi, importul anterior trebuie să fie șters sau să aibă status 'failed'.`
        );
      }
      
      // Dacă este în procesare sau pending, returnează importul existent
      return existingImport;
    }
    
    // Dacă permitem re-import, resetăm statusul
    if (existingImport.status === 'failed' || existingImport.status === 'completed') {
      await updateANAFImportStatus(existingImport.id, 'pending');
      return existingImport;
    }
    
    return existingImport;
  }

  // Creează import nou
  const { data: importData, error } = await supabaseAdmin
    .from('anaf_imports')
    .insert([
      {
        source_type: data.source_type || 'anaf',
        source_url: data.source_url,
        pdf_url: data.pdf_url || data.source_url,
        metadata: data.metadata || {},
        status: 'pending',
      },
    ])
    .select()
    .single();

  if (error) {
    // Dacă eroarea este despre duplicate, verifică din nou
    if (error.code === '23505' || error.message.includes('duplicate')) {
      const { data: existing } = await supabaseAdmin
        .from('anaf_imports')
        .select('*')
        .eq('source_url', data.source_url)
        .single();
      
      if (existing) {
        if (existing.status === 'failed' && data.allowReimport) {
          await updateANAFImportStatus(existing.id, 'pending');
          return existing;
        }
        throw new Error(
          `Un import cu acest URL există deja (ID: ${existing.id}, Status: ${existing.status}). ` +
          `Dacă dorești să re-importezi, importul anterior trebuie să fie șters sau să aibă status 'failed'.`
        );
      }
    }
    
    console.error('Error creating ANAF import:', error);
    throw new Error(`Failed to create import: ${error.message}`);
  }

  return importData;
}

/**
 * Actualizează statusul unui import
 */
export async function updateANAFImportStatus(
  importId: string,
  status: 'pending' | 'processing' | 'completed' | 'failed',
  errorMessage?: string,
  extractedData?: any
): Promise<void> {
  if (!supabaseAdmin) {
    throw new Error('Supabase admin client not configured');
  }

  const updateData: any = {
    status,
    updated_at: new Date().toISOString(),
  };

  if (errorMessage) {
    updateData.error_message = errorMessage;
  }

  if (extractedData) {
    updateData.extracted_data = extractedData;
  }

  if (status === 'completed' || status === 'failed') {
    updateData.processed_at = new Date().toISOString();
  }

  const { error } = await supabaseAdmin
    .from('anaf_imports')
    .update(updateData)
    .eq('id', importId);

  if (error) {
    console.error('Error updating ANAF import status:', error);
    throw new Error(`Failed to update import status: ${error.message}`);
  }
}

/**
 * Salvează o licitație ANAF în baza de date
 */
export async function saveANAFlicitatie(
  importId: string,
  licitatieData: ANAFLicitatieData,
  pdfUrl?: string,
  pdfStoragePath?: string,
  geocodeData?: { lat: number; lng: number; streetViewImageUrl: string | null }
) {
  if (!supabaseAdmin) {
    throw new Error('Supabase admin client not configured');
  }

  // Pipeline final de stabilire preț: GPT bun → GPT licitație → OCR → null
  // 1. Preț la nivel de licitație (din GPT)
  let pretEvaluare = licitatieData.pret_evaluare && licitatieData.pret_evaluare > 0 
    ? licitatieData.pret_evaluare 
    : null;

  // 2. Fallback: preț din primul bun (din GPT)
  if (!pretEvaluare) {
    const firstBunWithPrice = licitatieData.bunuri?.find(
      (b: any) => b.pret_evaluare && typeof b.pret_evaluare === 'number' && b.pret_evaluare > 0
    );
    if (firstBunWithPrice) {
      pretEvaluare = firstBunWithPrice.pret_evaluare;
      console.log(`[ANAF DB] Using pret_evaluare from first bun (GPT): ${pretEvaluare}`);
    }
  }

  // 3. Fallback: preț din OCR (va fi setat în extractText.ts și trimis prin metadata)
  // Notă: OCR price va fi deja procesat în extractText.ts și trimis în combinedJson.pret
  // Dacă nu avem preț din GPT, folosim null (nu 0) - OCR price va fi procesat în productCreator.ts

  console.log(`[ANAF DB] Final pret_evaluare: ${pretEvaluare || 'null (will use OCR fallback)'}`);

  // Dacă nu există monedă la nivel de licitație, folosește moneda primului bun
  let moneda = licitatieData.moneda || 'RON';
  if (!licitatieData.moneda && licitatieData.bunuri && licitatieData.bunuri.length > 0) {
    const firstBunWithMoneda = licitatieData.bunuri.find((b: any) => b.moneda);
    if (firstBunWithMoneda) {
      moneda = firstBunWithMoneda.moneda;
    }
  }

  console.log('[ANAF DB] Saving licitatie with geocode data:', {
    hasGeocodeData: !!geocodeData,
    hasLat: !!geocodeData?.lat,
    hasLng: !!geocodeData?.lng,
    hasStreetViewUrl: !!geocodeData?.streetViewImageUrl,
    streetViewUrl: geocodeData?.streetViewImageUrl ? `${geocodeData.streetViewImageUrl.substring(0, 100)}...` : null,
  });

  const { data, error } = await supabaseAdmin
    .from('anaf_licitatii')
    .insert([
      {
        import_id: importId,
        numar_licitatie: (licitatieData.numar_licitatie && licitatieData.numar_licitatie.trim()) ? licitatieData.numar_licitatie : null,
        data_licitatie: (licitatieData.data_licitatie && licitatieData.data_licitatie.trim()) ? licitatieData.data_licitatie : null,
        ora_licitatie: (licitatieData.ora_licitatie && licitatieData.ora_licitatie.trim()) ? licitatieData.ora_licitatie : null,
        loc_licitatie: licitatieData.loc_licitatie || null,
        tip_bun: licitatieData.tip_bun || null,
        categoria_teren: licitatieData.categoria_teren || null,
        suprafata_totala: licitatieData.suprafata_totala || null,
        unitate_suprafata: licitatieData.unitate_suprafata || 'mp',
        judet: licitatieData.judet || 'Necunoscut',
        localitate: licitatieData.localitate || 'Necunoscut',
        adresa: licitatieData.adresa || null,
        coordinates: geocodeData ? { lat: geocodeData.lat, lng: geocodeData.lng } : null,
        lat: geocodeData?.lat || null,
        lng: geocodeData?.lng || null,
        street_view_image_url: geocodeData?.streetViewImageUrl || null,
        nume_contribuabil: null, // Nu mai extragem numele contribuabilului
        pret_evaluare: pretEvaluare ?? null, // NU mai ștergem prețul - folosim valoarea finală sau null
        tva_inclus: licitatieData.tva_inclus || false,
        valoare_tva: licitatieData.valoare_tva || null,
        moneda: moneda,
        conditii_suplimentare: licitatieData.conditii_suplimentare || {},
        detalii_relevante: licitatieData.detalii_relevante || null,
        pdf_url: pdfUrl || null,
        pdf_storage_path: pdfStoragePath || null,
        status: 'active',
        product_created: false,
        metadata: {},
      },
    ])
    .select()
    .single();

  if (error) {
    console.error('[ANAF DB] Error saving ANAF licitatie:', error);
    throw new Error(`Failed to save licitatie: ${error.message}`);
  }

  console.log('[ANAF DB] ✅ Licitatie saved successfully:', {
    id: data?.id,
    hasStreetViewUrl: !!data?.street_view_image_url,
    streetViewUrl: data?.street_view_image_url ? `${data.street_view_image_url.substring(0, 100)}...` : null,
  });

  return data as ANAFLicitatie;
}

/**
 * Obține toate licitațiile ANAF cu filtre opționale
 * Folosește supabaseAdmin pentru a bypass RLS dacă este necesar
 */
export async function getANAFlicitatii(filters?: {
  judet?: string;
  tip_bun?: string;
  data_licitatie_from?: string;
  data_licitatie_to?: string;
  status?: string;
  limit?: number;
  offset?: number;
}): Promise<{ data: ANAFLicitatie[]; count: number }> {
  // Folosește admin client pentru a bypass RLS în API routes
  // RLS permite tuturor să vadă licitațiile, dar folosim admin pentru consistență
  if (!supabaseAdmin) {
    throw new Error('Supabase admin client not configured');
  }

  let query = supabaseAdmin
    .from('anaf_licitatii')
    .select('*', { count: 'exact' });

  if (filters?.judet) {
    query = query.eq('judet', filters.judet);
  }

  if (filters?.tip_bun) {
    query = query.eq('tip_bun', filters.tip_bun);
  }

  if (filters?.data_licitatie_from) {
    query = query.gte('data_licitatie', filters.data_licitatie_from);
  }

  if (filters?.data_licitatie_to) {
    query = query.lte('data_licitatie', filters.data_licitatie_to);
  }

  if (filters?.status) {
    query = query.eq('status', filters.status);
  }

  // Ordonează după data_licitatie (nulls last) sau created_at
  query = query.order('data_licitatie', { ascending: false, nullsFirst: false })
                .order('created_at', { ascending: false });

  if (filters?.limit) {
    query = query.limit(filters.limit);
  }

  if (filters?.offset) {
    query = query.range(filters.offset, filters.offset + (filters.limit || 50) - 1);
  }

  const { data, error, count } = await query;

  if (error) {
    console.error('Error fetching ANAF licitatii:', error);
    throw new Error(`Failed to fetch licitatii: ${error.message}`);
  }

  return {
    data: data || [],
    count: count || 0,
  };
}

/**
 * Obține un import după ID
 */
export async function getANAFImport(importId: string): Promise<ANAFImport | null> {
  if (!supabaseAdmin) {
    throw new Error('Supabase admin client not configured');
  }

  const { data, error } = await supabaseAdmin
    .from('anaf_imports')
    .select('*')
    .eq('id', importId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      return null; // Not found
    }
    console.error('Error fetching ANAF import:', error);
    throw new Error(`Failed to fetch import: ${error.message}`);
  }

  return data;
}

/**
 * Obține toate importurile cu filtre opționale
 */
export async function getANAFImports(filters?: {
  source_type?: string;
  status?: string;
  limit?: number;
  offset?: number;
}): Promise<{ data: ANAFImport[]; count: number }> {
  if (!supabaseAdmin) {
    throw new Error('Supabase admin client not configured');
  }

  let query = supabaseAdmin
    .from('anaf_imports')
    .select('*', { count: 'exact' });

  if (filters?.source_type) {
    query = query.eq('source_type', filters.source_type);
  }

  if (filters?.status) {
    query = query.eq('status', filters.status);
  }

  query = query.order('created_at', { ascending: false });

  if (filters?.limit) {
    query = query.limit(filters.limit);
  }

  if (filters?.offset) {
    query = query.range(filters.offset, filters.offset + (filters.limit || 50) - 1);
  }

  const { data, error, count } = await query;

  if (error) {
    console.error('Error fetching ANAF imports:', error);
    throw new Error(`Failed to fetch imports: ${error.message}`);
  }

  return {
    data: data || [],
    count: count || 0,
  };
}

