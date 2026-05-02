import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


/**
 * API endpoint pentru sincronizarea datelor executorului din user_profiles în custom_fields ale produselor
 * Acest endpoint copiază datele executorului în custom_fields pentru a fi accesibile public (fără autentificare)
 */
export async function POST(request: NextRequest) {
  try {
    if (!supabaseAdmin) {
      return NextResponse.json(
        { error: 'Supabase admin client not configured' },
        { status: 500 }
      );
    }

    // Obține toate produsele care au user_id dar nu au date executor în custom_fields
    const { data: products, error: productsError } = await supabaseAdmin
      .from('products')
      .select('id, user_id, custom_fields')
      .not('user_id', 'is', null)
      .neq('status', 'deleted');

    if (productsError) {
      console.error('Error fetching products:', productsError);
      return NextResponse.json(
        { error: 'Failed to fetch products', details: productsError },
        { status: 500 }
      );
    }

    if (!products || products.length === 0) {
      return NextResponse.json({
        message: 'No products found',
        synced: 0,
      });
    }

    let syncedCount = 0;
    let skippedCount = 0;
    const errors: Array<{ productId: string; error: string }> = [];

    // Pentru fiecare produs, verifică dacă are date executor în custom_fields
    for (const product of products) {
      const customFields = product.custom_fields || {};
      
      // Verifică dacă există deja date executor în custom_fields
      const hasExecutorData = 
        customFields.licitator_name ||
        customFields.licitatorName ||
        customFields.Licitator_name ||
        customFields['Licitator name'] ||
        customFields.licitator_email ||
        customFields.licitatorEmail ||
        customFields.licitator_phone ||
        customFields.licitatorPhone;

      if (hasExecutorData) {
        skippedCount++;
        continue;
      }

      // Obține datele executorului din user_profiles
      const { data: executorProfile, error: executorError } = await supabaseAdmin
        .from('user_profiles')
        .select('licitator_name, licitator_address, licitator_fiscal_code, licitator_consignment_account, licitator_email, licitator_phone, licitator_fax, licitator_competence, avatar_url')
        .eq('user_id', product.user_id)
        .maybeSingle();

      if (executorError) {
        console.error(`Error fetching executor profile for product ${product.id}:`, executorError);
        errors.push({
          productId: product.id,
          error: executorError.message || 'Unknown error',
        });
        continue;
      }

      if (!executorProfile) {
        skippedCount++;
        continue;
      }

      // Verifică dacă există cel puțin o valoare în profil
      const hasProfileData = Object.values(executorProfile).some(
        val => val !== undefined && val !== null && val !== ''
      );

      if (!hasProfileData) {
        skippedCount++;
        continue;
      }

      // Actualizează custom_fields cu datele executorului
      const updatedCustomFields = {
        ...customFields,
        licitator_name: executorProfile.licitator_name || customFields.licitator_name,
        licitator_address: executorProfile.licitator_address || customFields.licitator_address,
        licitator_fiscal_code: executorProfile.licitator_fiscal_code || customFields.licitator_fiscal_code,
        licitator_consignment_account: executorProfile.licitator_consignment_account || customFields.licitator_consignment_account,
        licitator_email: executorProfile.licitator_email || customFields.licitator_email,
        licitator_phone: executorProfile.licitator_phone || customFields.licitator_phone,
        licitator_fax: executorProfile.licitator_fax || customFields.licitator_fax,
        licitator_competence: executorProfile.licitator_competence || customFields.licitator_competence,
        avatar_url: executorProfile.avatar_url || customFields.avatar_url,
        executor_data_synced_at: new Date().toISOString(),
      };

      const { error: updateError } = await supabaseAdmin
        .from('products')
        .update({ custom_fields: updatedCustomFields })
        .eq('id', product.id);

      if (updateError) {
        console.error(`Error updating product ${product.id}:`, updateError);
        errors.push({
          productId: product.id,
          error: updateError.message || 'Unknown error',
        });
      } else {
        syncedCount++;
      }
    }

    return NextResponse.json({
      message: 'Sync completed',
      total: products.length,
      synced: syncedCount,
      skipped: skippedCount,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error: any) {
    console.error('Error in sync-executor-data:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    );
  }
}





















































