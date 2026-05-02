import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { getRequestAuthUser } from '@/lib/auth/getRequestAuthUser';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';
/**
 * GET /api/user/profile
 * Returnează profilul utilizatorului autentificat (din sesiunea Supabase / cookie).
 * Folosit de Setări pentru a încărca datele din DB când utilizatorul are sesiune.
 */
export async function GET(request: NextRequest) {
  try {
    const user = await getRequestAuthUser(request);
    if (!user?.id) {
      return NextResponse.json({ error: 'Necesită autentificare' }, { status: 401 });
    }

    const supabase = await createServerClient();

    const { data: profile, error: profileError } = await supabase
      .from('user_profiles')
      .select('first_name,last_name,phone,avatar_url,address,email,metadata,company_name,company_cui,company_address,city,country,postal_code')
      .eq('user_id', user.id)
      .maybeSingle();

    if (profileError) {
      console.error('[user/profile]', profileError);
      return NextResponse.json({ error: profileError.message }, { status: 500 });
    }

    const metadata = (profile?.metadata as Record<string, unknown>) || {};
    return NextResponse.json({
      firstName: profile?.first_name ?? '',
      lastName: profile?.last_name ?? '',
      username: (metadata.username as string) ?? '',
      email: (profile as { email?: string } | null)?.email ?? user.email ?? '',
      phone: profile?.phone ?? '',
      avatar: profile?.avatar_url ?? '',
      address: profile?.address ?? '',
      city: (profile as { city?: string } | null)?.city ?? (metadata.city as string) ?? '',
      country: (profile as { country?: string } | null)?.country ?? (metadata.country as string) ?? '',
      postalCode: (profile as { postal_code?: string } | null)?.postal_code ?? (metadata.postal_code as string) ?? '',
      companyName: profile?.company_name ?? '',
      cui: profile?.company_cui ?? '',
      companyAddress: profile?.company_address ?? '',
      registration_number: metadata.registration_number,
      county: metadata.county,
      contact_person: metadata.contact_person,
      ...metadata,
    });
  } catch (e) {
    console.error('[user/profile]', e);
    return NextResponse.json({ error: 'Eroare la încărcarea profilului' }, { status: 500 });
  }
}

/**
 * PATCH /api/user/profile
 * Actualizează profilul din sesiunea server (cookie) — fără a depinde de getSession() în browser.
 */
export async function PATCH(request: NextRequest) {
  try {
    const user = await getRequestAuthUser(request);
    if (!user?.id) {
      return NextResponse.json({ error: 'Necesită autentificare' }, { status: 401 });
    }

    const supabase = await createServerClient();

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const firstName = typeof body.firstName === 'string' ? body.firstName.trim() : undefined;
    const lastName = typeof body.lastName === 'string' ? body.lastName.trim() : undefined;
    const phone = typeof body.phone === 'string' ? body.phone.trim() : undefined;
    const metadataPatch =
      body.metadataPatch && typeof body.metadataPatch === 'object' && !Array.isArray(body.metadataPatch)
        ? (body.metadataPatch as Record<string, unknown>)
        : {};

    const { data: existing, error: readErr } = await supabase
      .from('user_profiles')
      .select('metadata')
      .eq('user_id', user.id)
      .maybeSingle();

    if (readErr) {
      console.error('[user/profile PATCH] read', readErr);
      return NextResponse.json({ error: readErr.message }, { status: 500 });
    }

    const prevMeta = (existing?.metadata as Record<string, unknown>) || {};
    const metadata = { ...prevMeta, ...metadataPatch };

    const row: Record<string, unknown> = {
      user_id: user.id,
      metadata,
    };

    if (firstName !== undefined) row.first_name = firstName.length ? firstName : null;
    if (lastName !== undefined) row.last_name = lastName.length ? lastName : null;
    if (phone !== undefined) row.phone = phone.length ? phone : null;

    const { error: upsertErr } = await supabase.from('user_profiles').upsert(row, {
      onConflict: 'user_id',
    });

    if (upsertErr) {
      console.error('[user/profile PATCH] upsert', upsertErr);
      return NextResponse.json({ error: upsertErr.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error('[user/profile PATCH]', e);
    return NextResponse.json({ error: 'Eroare la salvarea profilului' }, { status: 500 });
  }
}
