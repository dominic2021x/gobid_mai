/**
 * POST /api/ai/address-suggestions
 * Sugestii de adrese cu AI pentru autocomplete (query + județ/context)
 */

import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { query, county, context } = body as {
      query?: string;
      county?: string;
      context?: string;
    };

    if (!query || typeof query !== 'string' || !query.trim()) {
      return NextResponse.json({ suggestions: [] });
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ suggestions: [] });
    }

    const openai = new OpenAI({ apiKey });
    const systemContent =
      'Ești un asistent pentru completare adrese din România. Răspunzi DOAR cu un JSON array de string-uri, fără alt text. Exemplu: ["Strada X, Oraș","Strada Y, Oraș"]. Maximum 5 sugestii, adrese sau localități reale.';
    const userContent = [
      context && `Context: ${context}`,
      county && `Județ/zona: ${county}`,
      `Fragment introdus de utilizator: "${query.trim()}". Sugerează 3-5 adrese/localități relevante.`,
    ]
      .filter(Boolean)
      .join('\n');

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemContent },
        { role: 'user', content: userContent },
      ],
      temperature: 0.3,
      max_tokens: 300,
    });

    const raw = completion.choices[0]?.message?.content?.trim() || '[]';
    let suggestions: string[] = [];

    try {
      const parsed = JSON.parse(raw);
      suggestions = Array.isArray(parsed)
        ? parsed.filter((s: unknown) => typeof s === 'string').slice(0, 5)
        : [];
    } catch {
      // dacă răspunsul nu e JSON valid, returnăm listă goală
    }

    return NextResponse.json({ suggestions });
  } catch (err) {
    console.warn('[address-suggestions]', err);
    return NextResponse.json({ suggestions: [] });
  }
}
