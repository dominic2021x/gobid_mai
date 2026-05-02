import { OPENAI_SDK_API_KEY } from "@/lib/ai/openaiSdkApiKey";

/**
 * Avatar Script Generator - GPT-4o pentru scripturi video cu avatar
 * Generează scripturi conversaționale, naturale pentru avatar uman AI
 */

import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: OPENAI_SDK_API_KEY,
});

export interface AvatarScript {
  narration: string; // Textul pentru avatar să vorbească
  subtitles: Array<{
    text: string;
    startTime: number;
    endTime: number;
  }>;
  duration: number; // estimated duration in seconds
  hashtags: string[];
  callToAction: string;
  greeting?: string; // Salutare personalizată
}

export interface ProductData {
  title: string;
  description?: string;
  price?: number;
  category?: string;
  location?: string;
  features?: string[];
  images?: string[];
}

/**
 * Generează un script natural și conversațional pentru avatar video
 */
export async function generateAvatarScript(
  product: ProductData,
  platform: 'tiktok' | 'reels' | 'shorts' = 'tiktok',
  avatarName: string = 'Ana'
): Promise<AvatarScript> {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is not configured');
  }

  const platformContext = {
    tiktok: {
      maxWords: 50, // Reduced for short test video
      style: 'energetic, friendly, engaging, trending hooks',
      duration: '10-15 seconds', // Short test video
    },
    reels: {
      maxWords: 50, // Reduced for short test video
      style: 'warm, authentic, visual-first, aesthetic',
      duration: '10-15 seconds', // Short test video
    },
    shorts: {
      maxWords: 50, // Reduced for short test video
      style: 'informative, value-driven, educational, trustworthy',
      duration: '10-15 seconds', // Short test video
    },
  };

  const context = platformContext[platform];

  const prompt = `Ești ${avatarName}, un prezentator video prietenos și autentic pentru platforma de licitații gobid.ro.

PRODUS:
- Titlu: ${product.title}
- Descriere: ${product.description || 'N/A'}
- Preț: ${product.price ? `${product.price} Lei` : 'N/A'}
- Categorie: ${product.category || 'N/A'}
- Locație: ${product.location || 'N/A'}
- Caracteristici: ${product.features?.join(', ') || 'N/A'}

SARCINA TA:
1. Generează un script video FOARTE SCURT pentru TEST (${context.maxWords} cuvinte max, ${context.duration}) EXCLUSIV în limba română
2. Stil: ${context.style}
3. Începe cu: "Bună! Sunt ${avatarName} de la Gobid și azi îți prezint..."
4. Include un hook puternic în primele 2-3 secunde (ex: "Uite ce am găsit pentru tine!")
5. Menționează DOAR 1-2 caracteristici principale ale produsului (foarte scurt!)
6. Termină rapid cu: "Vizitează Gobid.ro!"
7. Adaugă 3-5 hashtag-uri relevante EXCLUSIV în română
8. IMPORTANT: Scriptul trebuie să fie FOARTE SCURT - maxim 10-15 secunde de vorbire!

IMPORTANT:
- Textul trebuie să fie EXCLUSIV în limba română, fără cuvinte în engleză
- Textul trebuie să fie foarte natural, ca o conversație reală între prieteni, nu robotic
- Folosește expresii naturale românești și coloqualisme (ex: "super", "uimitor", "fantastic")
- Include pauze naturale pentru a respira (marcate cu /)
- Subtitrările trebuie să fie scurte și clare (max 3-4 cuvinte pe linie) EXCLUSIV în română
- Tonul să fie prietenos, cald, entuziast, dar autentic și natural
- Evită jargonul tehnic, folosește cuvinte simple și accesibile

Răspunde ÎN FORMAT JSON cu următoarea structură:
{
  "narration": "textul complet pentru avatar să vorbească (cu pauze naturale marcate cu /)",
  "subtitles": [
    {"text": "Bună! Sunt Ana", "startTime": 0.0, "endTime": 2.0},
    {"text": "de la Gobid", "startTime": 2.0, "endTime": 3.5}
  ],
  "duration": 12,
  "hashtags": ["gobid", "licitatii", "apartamente", "imobiliare"],
  "callToAction": "Hai să vezi mai multe pe site!",
  "greeting": "Bună! Sunt ${avatarName} de la Gobid..."
}

IMPORTANT: Returnează DOAR JSON valid, fără markdown, fără explicații.`;

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: `Ești un expert în crearea de conținut video viral cu avatar-uri AI. Generezi scripturi naturale, conversaționale, care sună ca și cum ar fi vorbea o persoană reală. Tonul este prietenos, autentic și engaging.`,
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      temperature: 0.85,
      max_tokens: 1200,
      response_format: { type: 'json_object' },
    });

    const content = completion.choices[0]?.message?.content;
    if (!content) {
      throw new Error('No response from GPT-4o');
    }

    // Parse JSON response
    const scriptData = JSON.parse(content) as AvatarScript;

    // Validate and adjust timing
    if (scriptData.subtitles.length > 0) {
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

      // Update total duration (cap at 15 seconds for test video)
      const lastSubtitle = scriptData.subtitles[scriptData.subtitles.length - 1];
      scriptData.duration = Math.min(Math.max(scriptData.duration, lastSubtitle.endTime + 1), 15);
    }

    return scriptData;
  } catch (error: any) {
    console.error('Error generating avatar script:', error);
    throw new Error(`Failed to generate avatar script: ${error.message}`);
  }
}

