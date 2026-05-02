/**
 * GET/POST /api/admin/autopilot/settings
 * Citește/scrie setări autopilot din Supabase
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE || process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const SETTINGS_KEY = 'autopilot_config';

export async function GET() {
  try {
    const { data, error } = await supabase
      .from('settings')
      .select('value')
      .eq('key', SETTINGS_KEY)
      .maybeSingle();

    if (error) {
      console.warn('[Autopilot Settings] GET error:', error.message);
      return NextResponse.json({ config: null });
    }

    return NextResponse.json({
      config: data?.value ?? null,
    });
  } catch (err: unknown) {
    console.warn('[Autopilot Settings] GET error:', err);
    return NextResponse.json({ config: null });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { config } = body;

    if (config === undefined) {
      return NextResponse.json(
        { error: 'config is required' },
        { status: 400 }
      );
    }

    const { error } = await supabase
      .from('settings')
      .upsert(
        {
          key: SETTINGS_KEY,
          value: config,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'key' }
      );

    if (error) {
      console.warn('[Autopilot Settings] POST error:', error.message);
      return NextResponse.json({ success: true, saved: false });
    }

    return NextResponse.json({ success: true, saved: true });
  } catch (err: unknown) {
    console.warn('[Autopilot Settings] POST error:', err);
    return NextResponse.json({ success: true, saved: false });
  }
}
