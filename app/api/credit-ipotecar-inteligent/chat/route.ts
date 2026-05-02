import { OPENAI_SDK_API_KEY } from "@/lib/ai/openaiSdkApiKey";
import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


const openai = new OpenAI({
  apiKey: OPENAI_SDK_API_KEY,
});

export const runtime = "nodejs";
export const maxDuration = 30;

interface ChatMessage {
  role: "user" | "assistant" | "system";
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
    const { message, conversationHistory = [], calculationData } = body;

    if (!message || typeof message !== "string") {
      return NextResponse.json(
        { error: "Message is required" },
        { status: 400 }
      );
    }

    const formatCurrency = (value: number): string => {
      return new Intl.NumberFormat("ro-RO", {
        style: "currency",
        currency: "RON",
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(value);
    };

    let contextInfo = "";
    if (calculationData) {
      contextInfo = `
Context despre calculul creditului ipotecar:
- Principal (suma rămasă): ${formatCurrency(calculationData.principal)}
- Dobândă anuală: ${calculationData.annualRate}%
- Perioada rămasă: ${calculationData.monthsRemaining} luni
- Luni de redus: ${calculationData.monthsToReduce} luni
- Suma extra necesară: ${formatCurrency(calculationData.result.extraPayment)}
- Rata normală lunară: ${formatCurrency(calculationData.result.monthlyPayment)}
- Dobânda economisită: ${formatCurrency(calculationData.result.interestSaved)}
- Luni reduse: ${calculationData.result.monthsReduced} luni
`;
    }

    const systemPrompt = `Ești un asistent AI expert în credite ipotecare și rambursări anticipate pentru platforma gobid.ro.

Sarcini tale:
1. Răspunzi în limba română, prietenos și profesional
2. Oferi informații utile despre credite ipotecare, rambursări anticipate, și optimizarea creditelor
3. Explici concepte financiare într-un mod simplu și accesibil
4. Sugerezi strategii pentru reducerea dobânzii și perioadei de credit
5. Răspunzi la întrebări despre calculul efectuat de utilizator

${contextInfo ? `\n${contextInfo}\n` : ""}

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
