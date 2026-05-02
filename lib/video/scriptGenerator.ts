import { OPENAI_SDK_API_KEY } from "@/lib/ai/openaiSdkApiKey";

/**
 * Script Generator - GPT-4o pentru generarea scripturilor video
 * Generează scripturi scurte și persuasive pentru TikTok/Reels/Shorts
 */

import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: OPENAI_SDK_API_KEY,
});

export interface VideoScript {
  narration: string; // Textul pentru narator
  subtitles: Array<{
    text: string;
    startTime: number; // in seconds
    endTime: number;
  }>;
  duration: number; // estimated duration in seconds
  hashtags: string[];
  callToAction: string;
}

export interface ProductData {
  title: string;
  description?: string;
  price?: number;
  category?: string;
  location?: string;
  features?: string[];
}

/**
 * Generează un script video scurt și persuasiv pentru produs
 */
export async function generateVideoScript(
  product: ProductData,
  platform: 'tiktok' | 'reels' | 'shorts' = 'tiktok'
): Promise<VideoScript> {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is not configured');
  }

  const platformContext = {
    tiktok: {
      maxWords: 120,
      style: 'energetic, fun, trending hooks',
      duration: '15-30 seconds',
    },
    reels: {
      maxWords: 150,
      style: 'engaging, visual-first, aesthetic',
      duration: '15-30 seconds',
    },
    shorts: {
      maxWords: 150,
      style: 'informative, value-driven, educational',
      duration: '30-60 seconds',
    },
  };

  const context = platformContext[platform];

  const prompt = `Ești un creator de conținut video pentru ${platform.toUpperCase()}, specializat în promovarea produselor și anunțurilor.

PRODUS:
- Titlu: ${product.title}
- Descriere: ${product.description || 'N/A'}
- Preț: ${product.price ? `${product.price} Lei` : 'N/A'}
- Categorie: ${product.category || 'N/A'}
- Locație: ${product.location || 'N/A'}
- Caracteristici: ${product.features?.join(', ') || 'N/A'}

SARCINA TA:
1. Generează un script video scurt (${context.maxWords} cuvinte max, ${context.duration}) în limba română
2. Stil: ${context.style}
3. Include un hook puternic în primele 3 secunde pentru a capta atenția
4. Menționează principalele caracteristici și beneficiile produsului
5. Include un call-to-action clar (ex: "Link în bio", "Licitează acum", "Descoperă mai multe")
6. Adaugă 5-8 hashtag-uri relevante în română

IMPORTANT:
- Textul trebuie să fie natural, conversațional, nu robotic
- Optimizat pentru voce feminină (ElevenLabs)
- Include pauze naturale pentru a respira
- Subtitrările trebuie să fie scurte și clare (max 3-4 cuvinte pe linie)

Răspunde ÎN FORMAT JSON cu următoarea structură:
{
  "narration": "textul complet de narat (cu pauze naturale marcate cu /)",
  "subtitles": [
    {"text": "prima linie", "startTime": 0.0, "endTime": 2.5},
    {"text": "a doua linie", "startTime": 2.5, "endTime": 5.0}
  ],
  "duration": 30,
  "hashtags": ["hashtag1", "hashtag2"],
  "callToAction": "Text CTA"
}

IMPORTANT: Returnează DOAR JSON valid, fără markdown, fără explicații.`;

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: 'Ești un expert în crearea de conținut video viral pentru social media. Generezi scripturi engaging, naturale și optimizate pentru conversie.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      temperature: 0.8,
      max_tokens: 1000,
      response_format: { type: 'json_object' },
    });

    const content = completion.choices[0]?.message?.content;
    if (!content) {
      throw new Error('No response from GPT-4o');
    }

    // Parse JSON response
    const scriptData = JSON.parse(content) as VideoScript;

    // Validate and adjust timing if needed
    if (scriptData.subtitles.length > 0) {
      // Ensure subtitles are sequential and don't overlap
      scriptData.subtitles = scriptData.subtitles.map((sub, index) => {
        if (index > 0) {
          const prevEnd = scriptData.subtitles[index - 1].endTime;
          if (sub.startTime < prevEnd) {
            sub.startTime = prevEnd + 0.1;
          }
        }
        // Ensure minimum duration of 1.5s per subtitle
        if (sub.endTime - sub.startTime < 1.5) {
          sub.endTime = sub.startTime + 1.5;
        }
        return sub;
      });

      // Update total duration based on last subtitle
      const lastSubtitle = scriptData.subtitles[scriptData.subtitles.length - 1];
      scriptData.duration = Math.max(scriptData.duration, lastSubtitle.endTime + 1);
    }

    return scriptData;
  } catch (error: any) {
    console.error('Error generating video script:', error);
    throw new Error(`Failed to generate video script: ${error.message}`);
  }
}


