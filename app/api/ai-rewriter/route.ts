/**
 * API Route pentru re-scrierea textelor produselor cu AI
 */

import { NextRequest, NextResponse } from 'next/server';
import { rewriteProductText, checkChatGPTForRewrite } from '@/lib/ai/ai-rewriter';

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

    // Generează versiune rescrisă
    const result = await rewriteProductText({
      titlu: titlu.trim(),
      descriere: descriere.trim(),
      specificatii: specificatii?.trim() || undefined
    });

    return NextResponse.json({
      success: true,
      data: result,
      openaiAvailable: checkChatGPTForRewrite()
    });
  } catch (error: any) {
    console.error('Error rewriting product text:', error);
    return NextResponse.json(
      { 
        error: 'Eroare la re-scrierea textului',
        message: error.message 
      },
      { status: 500 }
    );
  }
}

// Endpoint pentru verificare disponibilitate ChatGPT
export async function GET(request: NextRequest) {
  try {
    const available = checkChatGPTForRewrite();
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

















