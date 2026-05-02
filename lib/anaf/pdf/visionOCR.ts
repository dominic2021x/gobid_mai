import { OPENAI_SDK_API_KEY } from "@/lib/ai/openaiSdkApiKey";

/**
 * OCR cu OpenAI Vision (gpt-4o / gpt-4o-mini) pentru imagini generate din PDF-uri ANAF
 */

import OpenAI from 'openai';
import { safeJsonParse } from '../utils';

const openai = new OpenAI({
  apiKey: OPENAI_SDK_API_KEY,
});

export interface ANAFPageStructuredData {
  titlu: string | null;
  pret: string | null;
  data: string | null;
  oras: string | null;
  judet: string | null;
  descriere: string | null;
  alte_detalii: string | null;
  raw_text: string; // textul complet extras de pe pagină
}

export interface ANAFVisionPageResult {
  pageNumber: number;
  data: ANAFPageStructuredData;
}


/**
 * Rulează OCR cu OpenAI Vision pe o singură imagine PNG
 */
export async function ocrAnafPageWithVision(
  imageBase64: string,
  pageNumber: number
): Promise<ANAFVisionPageResult> {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY nu este configurat pentru OCR cu OpenAI Vision.');
  }

  const model = process.env.OPENAI_VISION_MODEL || 'gpt-4o-mini';

  const response = await openai.chat.completions.create({
    model,
    messages: [
      {
        role: 'system',
        content:
          'Ești un OCR specializat pentru anunțuri de licitații ANAF. ' +
          'Primești o imagine a unui anunț ANAF și trebuie să extragi informațiile într-un JSON strict. ' +
          'IMPORTANT: Dacă imaginea conține tabele cu bunuri mobile, extrage TOATE informațiile din fiecare rând al tabelului.',
      },
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text:
              'Extrage toate informațiile importante din această pagină de anunț ANAF și întoarce-le STRICT ' +
              'într-un obiect JSON cu următoarea structură:\n\n' +
              '{\n' +
              '  "titlu": string | null,\n' +
              '  "pret": string | null,\n' +
              '  "data": string | null,\n' +
              '  "oras": string | null,\n' +
              '  "judet": string | null,\n' +
              '  "descriere": string | null,\n' +
              '  "alte_detalii": string | null,\n' +
              '  "raw_text": string // TOT textul citit de pe pagină, inclusiv din tabele, într-un singur string. ' +
              'IMPORTANT: Dacă există un tabel cu bunuri mobile, extrage TOATE informațiile din fiecare rând al tabelului. ' +
              'Include în raw_text denumirea bunului, descrierea sumară, prețul de evaluare și cota TVA pentru fiecare bun. ' +
              'Dacă există mai multe bunuri în tabel, separă-le clar în raw_text.\n' +
              '}\n\n' +
              'Nu adăuga niciun text în afara JSON-ului. Nu comenta, nu explica, doar JSON.',
          },
          {
            type: 'image_url',
            image_url: {
              url: `data:image/png;base64,${imageBase64}`,
            },
          },
        ],
      },
    ],
    max_tokens: 8000, // Mărit pentru a permite extragerea completă a textului din tabele
  });

  const messageContent = response.choices[0]?.message?.content;

  // Normalizează content-ul într-un string simplu
  let contentString: string;
  if (typeof messageContent === 'string') {
    contentString = messageContent;
  } else if (Array.isArray(messageContent)) {
    contentString = (messageContent as any[])
      .map((part: any) => (typeof part?.text === 'string' ? part.text : ''))
      .join('\n');
  } else {
    contentString = String(messageContent ?? '');
  }

  const parsed = safeJsonParse(contentString);

  const data: ANAFPageStructuredData = {
    titlu: parsed?.titlu ?? null,
    pret: parsed?.pret ?? null,
    data: parsed?.data ?? null,
    oras: parsed?.oras ?? null,
    judet: parsed?.judet ?? null,
    descriere: parsed?.descriere ?? null,
    alte_detalii: parsed?.alte_detalii ?? null,
    // Dacă modelul nu a pus explicit raw_text în JSON, folosim tot contentul ca fallback
    raw_text: parsed?.raw_text ?? contentString,
  };

  return {
    pageNumber,
    data,
  };
}


