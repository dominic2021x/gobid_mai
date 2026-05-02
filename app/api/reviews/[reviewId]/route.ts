/**
 * API Route - Un singur review după ID
 * GET /api/reviews/[reviewId] - Obține un review
 * PATCH /api/reviews/[reviewId] - Actualizează (doar author)
 * DELETE /api/reviews/[reviewId] - Șterge (doar author)
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


export const runtime = 'nodejs';

type RouteContext = { params: Promise<{ reviewId: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { reviewId } = await context.params;
    if (!reviewId) {
      return NextResponse.json({ error: 'reviewId is required' }, { status: 400 });
    }

    if (!supabaseAdmin) {
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }

    const { data: review, error } = await supabaseAdmin
      .from('user_reviews')
      .select('*')
      .eq('id', reviewId)
      .single();

    if (error || !review) {
      return NextResponse.json(
        { error: error?.message || 'Review not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, review });
  } catch (err) {
    console.error('[API] GET /api/reviews/[reviewId]:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const { reviewId } = await context.params;
    if (!reviewId) {
      return NextResponse.json({ error: 'reviewId is required' }, { status: 400 });
    }

    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!supabaseAdmin) {
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }

    const token = authHeader.substring(7);
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: existing } = await supabaseAdmin
      .from('user_reviews')
      .select('reviewer_user_id')
      .eq('id', reviewId)
      .single();

    if (!existing || existing.reviewer_user_id !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (typeof body.rating === 'number' && body.rating >= 1 && body.rating <= 5) {
      updates.rating = body.rating;
    }
    if (typeof body.review_text === 'string') {
      updates.review_text = body.review_text;
    }

    const { data: review, error } = await supabaseAdmin
      .from('user_reviews')
      .update(updates)
      .eq('id', reviewId)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ success: true, review });
  } catch (err) {
    console.error('[API] PATCH /api/reviews/[reviewId]:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const { reviewId } = await context.params;
    if (!reviewId) {
      return NextResponse.json({ error: 'reviewId is required' }, { status: 400 });
    }

    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!supabaseAdmin) {
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }

    const token = authHeader.substring(7);
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: existing } = await supabaseAdmin
      .from('user_reviews')
      .select('reviewer_user_id')
      .eq('id', reviewId)
      .single();

    if (!existing || existing.reviewer_user_id !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { error } = await supabaseAdmin.from('user_reviews').delete().eq('id', reviewId);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ success: true, message: 'Review șters.' });
  } catch (err) {
    console.error('[API] DELETE /api/reviews/[reviewId]:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
