import { OPENAI_SDK_API_KEY } from "@/lib/ai/openaiSdkApiKey";

/**
 * POST /api/smart-mortgage/chat
 * Chat AI pentru Smart Mortgage – răspunsuri în contextul creditului ipotecar/rambursări.
 * Body: { message, conversationHistory?, calculationData? }
 */

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
    if (calculationData?.principal != null && calculationData?.result) {
      contextInfo = `
Context despre calculul creditului ipotecar (Smart Mortgage):
- Principal (suma rămasă): ${formatCurrency(Number(calculationData.principal))}
- Dobândă anuală: ${calculationData.annualRate ?? "?"}%
- Perioada rămasă: ${calculationData.monthsRemaining ?? "?"} luni
- Luni de redus: ${calculationData.monthsToReduce ?? "?"} luni
- Suma extra necesară: ${formatCurrency(Number(calculationData.result?.extraPayment ?? 0))}
- Rata normală lunară: ${formatCurrency(Number(calculationData.result?.monthlyPayment ?? 0))}
- Dobânda economisită: ${formatCurrency(Number(calculationData.result?.interestSaved ?? 0))}
- Luni reduse: ${calculationData.result?.monthsReduced ?? "?"} luni
`;
    }

    const systemPrompt = `Ești un asistent AI expert în credite ipotecare și rambursări anticipate (Smart Mortgage) pentru platforma gobid.ro.
Răspunzi în limba română, prietenos și profesional. Oferi informații despre credite ipotecare, rambursări anticipate și optimizarea creditelor.
Explici concepte financiare simplu și accesibil. Sugerezi strategii pentru reducerea dobânzii și perioadei.
${contextInfo ? `\n${contextInfo}\n` : ""}
Răspunde concis, util și prietenos.`;

    const history = Array.isArray(conversationHistory)
      ? conversationHistory
          .slice(-10)
          .filter(
            (m: unknown) =>
              m && typeof m === "object" && "role" in m && "content" in m
          )
          .map((m: { role: string; content: string }) => ({
            role: m.role as "user" | "assistant",
            content: String(m.content),
          }))
      : [];

    const messages: ChatMessage[] = [
      { role: "system", content: systemPrompt },
      ...history,
      { role: "user", content: message.trim() },
    ];

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages,
      temperature: 0.7,
      max_tokens: 500,
      stream: false,
    });

    const aiResponse =
      completion.choices[0]?.message?.content?.trim() ||
      "Nu pot răspunde momentan. Te rog încearcă din nou.";

    return NextResponse.json({ message: aiResponse });
  } catch (error: unknown) {
    console.error("Smart mortgage chat error:", error);
    return NextResponse.json(
      {
        error: "Failed to process chat message",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
