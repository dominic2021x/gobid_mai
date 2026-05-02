import { NextRequest, NextResponse } from 'next/server';
import { getBearerOrCookieAuthUser, getRequestAuthUser } from '@/lib/auth/getRequestAuthUser';
import { createServerClient } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase';

/** Ensure JSON-serializable jsonb (strip functions, symbols, undefined). */
function toJsonbProps(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  try {
    return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
  } catch {
    return {};
  }
}

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

// GET - Obține activity logs pentru user-ul curent
export async function GET(request: NextRequest) {
  try {
    if (!supabaseAdmin) {
      return NextResponse.json({ error: 'Supabase admin client not configured' }, { status: 500 });
    }

    // Assign to const so TypeScript knows it's not null
    const admin = supabaseAdmin;

    const authUser = await getRequestAuthUser(request);
    if (!authUser?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = authUser.id;
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '100');

    const { data: activities, error: activitiesError } = await admin
      .from('user_activity_logs')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (activitiesError) {
      console.error('Failed to fetch activity logs:', activitiesError);
      return NextResponse.json({ error: 'Cannot read activity logs' }, { status: 500 });
    }

    return NextResponse.json(activities || []);
  } catch (error) {
    console.error('Unexpected error fetching activity logs:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

// POST - Adaugă activity log
export async function POST(request: NextRequest) {
  try {
    const admin = supabaseAdmin;

    // PageTracker sends Authorization: Bearer — prefer Bearer + cookie (same as dashboard APIs).
    const authUser = await getBearerOrCookieAuthUser(request);
    if (!authUser?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = authUser.id;
    let userEmail = (authUser.email ?? "").trim();
    if (!userEmail && admin) {
      try {
        const { data: fullUser, error: fullErr } = await admin.auth.admin.getUserById(userId);
        if (!fullErr && fullUser?.user?.email) {
          userEmail = fullUser.user.email.trim();
        }
      } catch {
        /* keep empty */
      }
    }
    let body: { event?: string; properties?: Record<string, unknown> };
    try {
      body = (await request.json()) as typeof body;
    } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }
    const { event, properties: rawProps } = body;
    const properties = toJsonbProps(rawProps);

    if (!event) {
      return NextResponse.json({ error: 'Missing event' }, { status: 400 });
    }

    // Get client IP address
    const ipAddress = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
                      request.headers.get('x-real-ip') ||
                      request.headers.get('cf-connecting-ip') ||
                      'unknown';

    const geo: { city?: string; regionName?: string; country?: string } = {};
    if (ipAddress && ipAddress !== 'unknown' && !/^127\.|^10\.|^172\.(1[6-9]|2\d|3[01])\.|^192\.168\./i.test(ipAddress)) {
      try {
        const ac = new AbortController();
        const tid = setTimeout(() => ac.abort(), 3000);
        try {
          const res = await fetch(`http://ip-api.com/json/${encodeURIComponent(ipAddress)}?fields=status,city,regionName,country`, {
            cache: 'no-store',
            signal: ac.signal,
          });
          const data = await res.json();
          if (data?.status === 'success') {
            if (data.city) geo.city = data.city;
            if (data.regionName) geo.regionName = data.regionName;
            if (data.country) geo.country = data.country;
          }
        } finally {
          clearTimeout(tid);
        }
      } catch {
        // ignore geo errors
      }
    }

    // Schema (20251112_user_data): user_id, event, properties — no top-level user_email; email lives in properties.
    const mergedProps = {
      ...properties,
      ...(userEmail ? { user_email: userEmail } : {}),
      ip: ipAddress,
      ...geo,
    };

    // DB schema (legacy scripts): user_email is NOT NULL — JWT may omit email (OAuth/phone).
    const row = {
      user_id: userId,
      user_email: userEmail,
      event,
      properties: mergedProps,
    };

    // 1) Session client + RLS (migration 20260418120000_user_activity_logs_insert_policy.sql).
    // 2) Service role fallback (no RLS). POST must not require admin — local dev often has no service key.
    let insertError: { message: string; code?: string; hint?: string } | null = null;

    try {
      const supabaseUser = await createServerClient();
      ({ error: insertError } = await supabaseUser
        .from('user_activity_logs')
        .insert(row));
    } catch (e) {
      console.error('user_activity POST: createServerClient or insert threw:', e);
      insertError = { message: e instanceof Error ? e.message : String(e) };
    }

    if (insertError && admin) {
      ({ error: insertError } = await admin
        .from('user_activity_logs')
        .insert(row));
    }

    if (insertError) {
      console.error('Failed to add activity log:', insertError);
      const dev = process.env.NODE_ENV === 'development';
      // Fire-and-forget tracking: avoid red 500 in Network when DB/policy isn’t ready locally.
      return NextResponse.json(
        {
          ok: false,
          skipped: true,
          ...(dev ? { details: insertError.message, code: insertError.code, hint: insertError.hint } : {}),
        },
        { status: 200 },
      );
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Unexpected error adding activity log:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}



