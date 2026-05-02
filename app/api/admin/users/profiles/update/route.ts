import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


export const runtime = 'nodejs';

/**
 * POST /api/admin/users/profiles/update
 * Actualizează profilul utilizatorului (inclusiv câmpuri firmă pentru cont business)
 */
export async function POST(request: NextRequest) {
  try {
    if (!supabaseAdmin) {
      return NextResponse.json(
        { success: false, error: 'Supabase not configured' },
        { status: 500 }
      );
    }

    const body = await request.json();
    const { userId, profile } = body;

    if (!userId || !profile || typeof profile !== 'object') {
      return NextResponse.json(
        { success: false, error: 'userId și profile sunt obligatorii' },
        { status: 400 }
      );
    }

    // user_profiles: username stocat în metadata (nu e coloană)
    const { data: existing } = await supabaseAdmin
      .from('user_profiles')
      .select('metadata')
      .eq('user_id', userId)
      .maybeSingle();
    const baseMetadata = (existing?.metadata as Record<string, unknown>) || {};

    // Normalizare telefon: doar format 07xx xxx xxx (10 cifre)
    let phoneValue: string | null = null;
    if (profile.phone !== undefined && profile.phone !== null) {
      const raw = String(profile.phone).trim();
      if (raw) {
        const digits = raw.replace(/\D/g, '').slice(0, 10);
        let rest = digits.startsWith('40') ? '0' + digits.slice(2) : digits.startsWith('0') ? digits : '0' + digits;
        if (rest.length > 4) phoneValue = `${rest.slice(0, 4)} ${rest.slice(4, 7)} ${rest.slice(7)}`.trim();
        else if (rest.length > 0) phoneValue = rest;
      }
    }

    const meta = (profile.metadata && typeof profile.metadata === 'object') ? (profile.metadata as Record<string, unknown>) : {};
    const usernameTop = profile.username !== undefined && profile.username !== null ? String(profile.username).trim() || null : null;
    const usernameFromMeta = meta.username;
    const username = usernameTop ?? (usernameFromMeta != null ? String(usernameFromMeta).trim() || null : null);
    const cityVal = profile.city ?? meta.city ?? null;
    const countryVal = profile.country ?? meta.country ?? null;

    const profileData: Record<string, unknown> = {
      user_id: userId,
      first_name: profile.first_name ?? null,
      last_name: profile.last_name ?? null,
      phone: phoneValue,
      avatar_url: profile.avatar_url ?? null,
      address: profile.address ?? null,
    };

    // Email: coloană dedicată
    const emailValue = profile.email ?? meta.email ?? null;
    if (emailValue !== undefined && emailValue !== null) {
      profileData.email = String(emailValue).trim() || null;
    }

    // Câmpuri firmă (pentru cont business)
    if (profile.company_name !== undefined) profileData.company_name = profile.company_name || null;
    if (profile.company_cui !== undefined) profileData.company_cui = profile.company_cui || null;
    if (profile.company_address !== undefined) profileData.company_address = profile.company_address || null;

    // Metadata: păstrăm username, city, country etc. și în jsonb ca backup / compat
    profileData.metadata = {
      ...baseMetadata,
      ...meta,
      ...(username != null && username !== '' ? { username } : {}),
      ...(cityVal != null && String(cityVal).trim() ? { city: String(cityVal).trim() } : {}),
      ...(countryVal != null && String(countryVal).trim() ? { country: String(countryVal).trim() } : {}),
    };

    const { data, error } = await supabaseAdmin
      .from('user_profiles')
      .upsert(profileData, { onConflict: 'user_id' })
      .select()
      .single();

    if (error) {
      console.error('[profiles/update] Upsert error:', error);
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, profile: data ?? profileData });
  } catch (e: any) {
    console.error('[profiles/update]', e);
    return NextResponse.json(
      { success: false, error: e?.message || 'Eroare la actualizarea profilului' },
      { status: 500 }
    );
  }
}
