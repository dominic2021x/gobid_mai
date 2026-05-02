/**
 * API Route - ANAF Scrape Configuration
 * GET /api/anaf/scrape-config - Listă URL-uri configurate
 * POST /api/anaf/scrape-config - Adaugă URL nou
 * PUT /api/anaf/scrape-config - Actualizează URL
 * DELETE /api/anaf/scrape-config - Șterge URL
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


export const runtime = 'nodejs';

export interface ANAFScrapeConfig {
  id: string;
  url: string;
  enabled: boolean;
  max_pages: number;
  last_scraped_at: string | null;
  last_scraped_count: number;
  created_at: string;
  updated_at: string;
}

/**
 * GET - Listă toate URL-urile configurate
 */
export async function GET(request: NextRequest) {
  try {
    if (!supabaseAdmin) {
      return NextResponse.json(
        { error: 'Supabase admin client not configured' },
        { status: 500 }
      );
    }

    const { data, error } = await supabaseAdmin
      .from('anaf_scrape_config')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[ANAF Scrape Config] Error fetching configs:', error);
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: data || [],
    });
  } catch (error: any) {
    console.error('[ANAF Scrape Config] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch scrape configs' },
      { status: 500 }
    );
  }
}

/**
 * POST - Adaugă URL nou
 */
export async function POST(request: NextRequest) {
  try {
    if (!supabaseAdmin) {
      return NextResponse.json(
        { error: 'Supabase admin client not configured' },
        { status: 500 }
      );
    }

    const body = await request.json();
    const { url, max_pages = 10, enabled = true } = body;

    if (!url || typeof url !== 'string') {
      return NextResponse.json(
        { error: 'URL is required' },
        { status: 400 }
      );
    }

    // Validează URL
    try {
      new URL(url);
    } catch {
      return NextResponse.json(
        { error: 'Invalid URL format' },
        { status: 400 }
      );
    }

    const { data, error } = await supabaseAdmin
      .from('anaf_scrape_config')
      .insert({
        url: url.trim(),
        enabled,
        max_pages: max_pages || 10,
      })
      .select()
      .single();

    if (error) {
      if (error.code === '23505') { // Unique constraint violation
        return NextResponse.json(
          { error: 'URL already exists' },
          { status: 409 }
        );
      }
      console.error('[ANAF Scrape Config] Error creating config:', error);
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data,
    });
  } catch (error: any) {
    console.error('[ANAF Scrape Config] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to create scrape config' },
      { status: 500 }
    );
  }
}

/**
 * PUT - Actualizează URL
 */
export async function PUT(request: NextRequest) {
  try {
    if (!supabaseAdmin) {
      return NextResponse.json(
        { error: 'Supabase admin client not configured' },
        { status: 500 }
      );
    }

    const body = await request.json();
    const { id, url, enabled, max_pages } = body;

    if (!id) {
      return NextResponse.json(
        { error: 'ID is required' },
        { status: 400 }
      );
    }

    const updateData: any = {
      updated_at: new Date().toISOString(),
    };

    if (url !== undefined) {
      try {
        new URL(url);
        updateData.url = url.trim();
      } catch {
        return NextResponse.json(
          { error: 'Invalid URL format' },
          { status: 400 }
        );
      }
    }

    if (enabled !== undefined) {
      updateData.enabled = enabled;
    }

    if (max_pages !== undefined) {
      updateData.max_pages = max_pages;
    }

    const { data, error } = await supabaseAdmin
      .from('anaf_scrape_config')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('[ANAF Scrape Config] Error updating config:', error);
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data,
    });
  } catch (error: any) {
    console.error('[ANAF Scrape Config] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to update scrape config' },
      { status: 500 }
    );
  }
}

/**
 * DELETE - Șterge URL
 */
export async function DELETE(request: NextRequest) {
  try {
    if (!supabaseAdmin) {
      return NextResponse.json(
        { error: 'Supabase admin client not configured' },
        { status: 500 }
      );
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json(
        { error: 'ID is required' },
        { status: 400 }
      );
    }

    const { error } = await supabaseAdmin
      .from('anaf_scrape_config')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('[ANAF Scrape Config] Error deleting config:', error);
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Config deleted successfully',
    });
  } catch (error: any) {
    console.error('[ANAF Scrape Config] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to delete scrape config' },
      { status: 500 }
    );
  }
}



