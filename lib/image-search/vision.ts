import { OPENAI_SDK_API_KEY } from "@/lib/ai/openaiSdkApiKey";

/**
 * Vision utilities - Convert images to structured product queries using GPT-4o
 */

import OpenAI from 'openai';
import { VisionProductQuery } from './types';

const openai = new OpenAI({
  apiKey: OPENAI_SDK_API_KEY,
});

/**
 * Extracts the real image URL from Next.js Image Optimization URL
 */
function extractRealImageUrl(url: string): string {
  // If it's a Next.js Image Optimization URL, extract the real URL
  if (url.includes('/_next/image?url=')) {
    try {
      const urlObj = new URL(url, 'http://localhost:3000');
      const imageUrl = urlObj.searchParams.get('url');
      if (imageUrl) {
        return decodeURIComponent(imageUrl);
      }
    } catch {
      // If parsing fails, return original
    }
  }
  return url;
}

/**
 * Converts an image buffer to base64 data URL
 */
function imageBufferToBase64(buffer: Buffer, mimeType: string): string {
  const base64 = buffer.toString('base64');
  return `data:${mimeType};base64,${base64}`;
}

/**
 * Calls GPT-4o Vision to extract structured product information from an image
 */
export async function visionToProductQuery(imageBuffer: Buffer, mimeType: string): Promise<VisionProductQuery> {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is not configured');
  }

  const base64Image = imageBufferToBase64(imageBuffer, mimeType);

  const systemPrompt = `Ești un expert în analiza produselor din imagini. Analizează imaginea și extrage informații structurate despre produs.

Răspunde STRICT în format JSON cu următoarea structură:
{
  "caption": "Descriere scurtă și precisă a produsului",
  "attributes": {
    "category": "categoria produsului (ex: electronice, autovehicule, imobiliare, etc.) sau null",
    "brand": "marca produsului dacă este vizibilă sau null",
    "color": "culoarea principală sau null",
    "material": "materialul principal sau null",
    "pattern": "pattern-ul sau design-ul sau null",
    "gender": "genul pentru produse vestimentare sau null",
    "key_details": ["detaliu1", "detaliu2", ...]
  },
  "identifiers": {
    "model_code": "codul modelului dacă este vizibil (ex: iPhone 16 Pro Max, BMW X5) sau null",
    "sku_text": "SKU sau cod produs dacă este vizibil sau null",
    "visible_text": "orice text vizibil important din imagine sau null"
  },
  "confidence": {
    "category": 0.0-1.0,
    "brand": 0.0-1.0,
    "overall": 0.0-1.0
  }
}

IMPORTANT: Răspunde DOAR cu JSON valid, fără markdown, fără explicații.`;

  const userPrompt = `Analizează această imagine și extrage informațiile despre produs în format JSON conform structurii specificate.`;

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: [
            { type: 'text', text: userPrompt },
            {
              type: 'image_url',
              image_url: { url: base64Image },
            },
          ],
        },
      ],
      response_format: { type: 'json_object' },
      max_tokens: 1000,
      temperature: 0.1,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('No response from GPT-4o Vision');
    }

    // Parse JSON response
    let parsed: VisionProductQuery;
    try {
      parsed = JSON.parse(content);
    } catch (parseError) {
      // Retry with fix JSON prompt
      console.warn('[Vision] Invalid JSON, retrying with fix prompt...');
      const fixResponse = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: systemPrompt + '\n\nRăspunde DOAR cu JSON valid, fără markdown code blocks.' },
          {
            role: 'user',
            content: [
              { type: 'text', text: 'Corectează și returnează JSON valid pentru această imagine:' },
              {
                type: 'image_url',
                image_url: { url: base64Image },
              },
            ],
          },
        ],
        response_format: { type: 'json_object' },
        max_tokens: 1000,
        temperature: 0,
      });

      const fixContent = fixResponse.choices[0]?.message?.content;
      if (!fixContent) {
        throw new Error('No response from retry');
      }

      parsed = JSON.parse(fixContent);
    }

    // Validate structure
    if (!parsed.caption || !parsed.attributes || !parsed.identifiers || !parsed.confidence) {
      throw new Error('Invalid response structure from GPT-4o Vision');
    }

    return parsed;
  } catch (error: any) {
    console.error('[Vision] Error calling GPT-4o Vision:', error);
    throw new Error(`Failed to extract product query from image: ${error.message}`);
  }
}
