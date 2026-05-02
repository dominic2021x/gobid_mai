/**
 * API Route pentru generare SEO automată
 */

import { NextRequest, NextResponse } from 'next/server';
import { generateSEO, checkChatGPTAvailable } from '@/lib/ai/seo-generator';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { titlu, descriere, specificatii } = body;

    // Validare input
    if (!titlu || !descriere) {
      return NextResponse.json(
        { error: 'Titlu și descriere sunt obligatorii' },
        { status: 400 }
      );
    }

    // Generează SEO
    const result = await generateSEO({
      titlu: titlu.trim(),
      descriere: descriere.trim(),
      specificatii: specificatii?.trim() || undefined
    });

    return NextResponse.json({
      success: true,
      data: result,
      openaiAvailable: await checkChatGPTAvailable()
    });
  } catch (error: any) {
    console.error('Error generating SEO:', error);
    return NextResponse.json(
      { 
        error: 'Eroare la generarea SEO',
        message: error.message 
      },
      { status: 500 }
    );
  }
}

// Endpoint pentru verificare disponibilitate ChatGPT
export async function GET(request: NextRequest) {
  try {
    const available = await checkChatGPTAvailable();
    return NextResponse.json({
      openaiAvailable: available
    });
  } catch (error: any) {
    return NextResponse.json(
      { openaiAvailable: false },
      { status: 200 }
    );
  }
}

















