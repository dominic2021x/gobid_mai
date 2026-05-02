/**
 * GET  /api/setup/user-custom-buttons - citește butoanele custom ale userului
 * POST /api/setup/user-custom-buttons - salvează butoanele custom (body: { button_config })
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!supabaseAdmin) {
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }

    const token = authHeader.substring(7);
    const { data: authData, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !authData?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data, error } = await supabaseAdmin
      .from('user_custom_buttons')
      .select('button_config')
      .eq('user_id', authData.user.id)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ buttons: [] });
    }

    const buttons = Array.isArray(data?.button_config) ? data.button_config : [];
    return NextResponse.json({ buttons });
  } catch (err) {
    console.warn('[setup/user-custom-buttons] GET', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!supabaseAdmin) {
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }

    const token = authHeader.substring(7);
    const { data: authData, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !authData?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const buttonConfig = body?.button_config;
    if (!Array.isArray(buttonConfig)) {
      return NextResponse.json(
        { error: 'button_config must be an array' },
        { status: 400 }
      );
    }

    const { error } = await supabaseAdmin
      .from('user_custom_buttons')
      .upsert(
        {
          user_id: authData.user.id,
          button_config: buttonConfig,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' }
      );

    if (error) {
      console.warn('[setup/user-custom-buttons] POST', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.warn('[setup/user-custom-buttons] POST', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
