/**
 * POST /api/admin/ai-drive/settings
 * Saves AI Drive configuration to Supabase
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE || process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { config } = body;

    if (!config) {
      return NextResponse.json(
        { error: 'Config is required' },
        { status: 400 }
      );
    }

    // Try to save to Supabase settings table
    // If table doesn't exist, just return success (fallback to localStorage)
    try {
      const { error } = await supabase
        .from('settings')
        .upsert({
          key: 'ai_drive_config',
          value: config,
          updated_at: new Date().toISOString(),
        }, {
          onConflict: 'key'
        });

      if (error) {
        console.warn('[AI Drive Settings] Could not save to Supabase:', error.message);
        // Return success anyway - will use localStorage fallback
        return NextResponse.json({ success: true, saved: false });
      }

      return NextResponse.json({ success: true, saved: true });
    } catch (error: any) {
      console.warn('[AI Drive Settings] Supabase error:', error.message);
      // Return success anyway - will use localStorage fallback
      return NextResponse.json({ success: true, saved: false });
    }
  } catch (error: any) {
    console.error('[AI Drive Settings] Error:', error);
    // Return success anyway - will use localStorage fallback
    return NextResponse.json({ success: true, saved: false });
  }
}
