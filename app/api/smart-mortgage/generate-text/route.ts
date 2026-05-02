import { OPENAI_SDK_API_KEY } from "@/lib/ai/openaiSdkApiKey";

/**
 * POST /api/smart-mortgage/generate-text
 * Generează text profesional pentru bancă (solicitare rambursare anticipată).
 * Body: { principal, annualRate, monthsRemaining, monthsToReduce, extraPayment, monthsReduced }
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

export async function POST(request: NextRequest) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: "OpenAI API key not configured" },
        { status: 500 }
      );
    }

    const body = await request.json();
    const {
      principal,
      annualRate,
      monthsRemaining,
      monthsToReduce,
      extraPayment,
      monthsReduced,
      currency = "RON",
    } = body;

    if (
      principal == null ||
      annualRate == null ||
      monthsRemaining == null ||
      extraPayment == null ||
      monthsReduced == null
    ) {
      return NextResponse.json(
        { error: "Missing required fields", received: Object.keys(body || {}) },
        { status: 400 }
      );
    }

    const formatCurrency = (value: number): string => {
      return new Intl.NumberFormat("ro-RO", {
        style: "currency",
        currency: String(currency),
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(Number(value));
    };

    const systemPrompt = `Ești un asistent care generează text scurt și profesional în limba română pentru solicitări de rambursare anticipată cu reducerea perioadei.
Textul trebuie să fie: profesional, concis (2-3 propoziții), clar despre rambursarea anticipată și direcționarea sumei către principal. Fără explicații suplimentare, doar textul pentru bancă.`;

    const userPrompt = `Generează un text profesional pentru bancă:
- Principal (suma rămasă): ${formatCurrency(Number(principal))}
- Dobândă anuală: ${annualRate}%
- Perioada rămasă: ${monthsRemaining} luni
- Luni de redus: ${monthsToReduce ?? "N/A"} luni
- Suma extra: ${formatCurrency(Number(extraPayment))}
- Luni reduse: ${monthsReduced} luni

Solicitare de rambursare anticipată cu reducerea perioadei; suma suplimentară să fie direcționată integral către principal. Generează DOAR textul pentru bancă.`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.7,
      max_tokens: 200,
    });

    const generatedText =
      completion.choices[0]?.message?.content?.trim() ||
      `Solicit rambursare anticipată cu reducerea perioadei. Vă rog ca suma suplimentară de ${formatCurrency(Number(extraPayment))} să fie direcționată integral către principal.`;

    return NextResponse.json({ text: generatedText });
  } catch (error: unknown) {
    console.error("Smart mortgage generate-text error:", error);
    return NextResponse.json(
      {
        error: "Failed to generate text",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
