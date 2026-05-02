import { OPENAI_SDK_API_KEY } from "@/lib/ai/openaiSdkApiKey";
import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


const openai = new OpenAI({
  apiKey: OPENAI_SDK_API_KEY,
});

interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export async function POST(request: NextRequest) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: "OpenAI API key not configured" },
        { status: 500 }
      );
    }

    const body = await request.json();
    const { message, conversationHistory = [] } = body;

    if (!message || typeof message !== "string") {
      return NextResponse.json(
        { error: "Message is required" },
        { status: 400 }
      );
    }

    const systemPrompt = `Ești un asistent AI expert în suport pentru clienți pentru platforma gobid.ro.

Sarcini tale:
1. Răspunzi în limba română, prietenos și profesional
2. Oferi informații utile despre platforma gobid.ro, licitații, produse, și servicii
3. Ajuti utilizatorii cu întrebări despre:
   - Cum să creezi un cont
   - Cum să plasezi o licitație
   - Cum să gestionezi produsele
   - Probleme tehnice
   - Facturare și plăți
   - Setări cont
   - Orice alte întrebări despre platformă
4. Dacă nu știi răspunsul sau problema este complexă, sugerezi să creeze un ticket de suport
5. Explici concepte într-un mod simplu și accesibil
6. Răspunzi concis, util și prietenos

Răspunde concis, util și prietenos.`;

    const messages: ChatMessage[] = [
      { role: "system", content: systemPrompt },
      ...conversationHistory.slice(-10), // Ultimele 10 mesaje pentru context
      { role: "user", content: message },
    ];

    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: messages as any,
      temperature: 0.7,
      max_tokens: 500,
      stream: false,
    });

    const aiResponse =
      completion.choices[0]?.message?.content ||
      "Nu pot răspunde momentan. Te rog încearcă din nou.";

    return NextResponse.json({ message: aiResponse });
  } catch (error: any) {
    console.error("AI chat error:", error);
    return NextResponse.json(
      {
        error: "Failed to process chat message",
        details: error.message || "Unknown error",
      },
      { status: 500 }
    );
  }
}
