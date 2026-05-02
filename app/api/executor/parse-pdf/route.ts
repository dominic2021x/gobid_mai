/**
 * POST /api/executor/parse-pdf
 * Extrage textul dintr-un PDF încărcat (FormData, key: file)
 */

import { NextRequest, NextResponse } from 'next/server';
import { extractTextFromPDFBuffer } from '@/lib/anaf/pdfExtractor';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


export const runtime = 'nodejs';
export const maxDuration = 120;

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file || file.size === 0) {
      return NextResponse.json(
        { success: false, error: 'Fișier PDF lipsă sau gol' },
        { status: 400 }
      );
    }

    if (file.type !== 'application/pdf') {
      return NextResponse.json(
        { success: false, error: 'Fișierul trebuie să fie PDF' },
        { status: 400 }
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const { text } = await extractTextFromPDFBuffer(buffer);

    return NextResponse.json({
      success: true,
      text: text || '',
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Eroare la parsarea PDF-ului';
    console.error('[executor/parse-pdf]', err);
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
