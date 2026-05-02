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
      extraPaymentMonthly,
      extraPayment,
      monthsReduced,
      currency = "RON",
    } = body;

    if (
      !principal ||
      !annualRate ||
      !monthsRemaining ||
      !extraPaymentMonthly ||
      !extraPayment ||
      !monthsReduced
    ) {
      return NextResponse.json(
        { error: "Missing required fields", received: Object.keys(body) },
        { status: 400 }
      );
    }

    // Formatare sume pentru mesaj
    const formatCurrency = (value: number): string => {
      return new Intl.NumberFormat("ro-RO", {
        style: "currency",
        currency: currency,
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(value);
    };

    const systemPrompt = `Ești un asistent AI care ajută clienții să scrie mesaje profesionale pentru bănci privind rambursarea anticipată a creditelor ipotecare.

Sarcina ta este să generezi un text scurt, clar și profesional în limba română pentru o solicitare de rambursare anticipată cu reducerea perioadei.

Textul trebuie să fie:
- Profesional și respectuos
- Concis (maximum 2-3 propoziții)
- Clar despre intenția de rambursare anticipată
- Specific despre direcționarea sumei către principal
- Formatat pentru a putea fi copiat direct într-un email sau cerere

Nu adăuga informații suplimentare despre calcul sau detalii tehnice. Doar textul pentru bancă.`;

    const userPrompt = `Generează un text profesional pentru bancă pentru următoarea situație:

- Principal (suma rămasă): ${formatCurrency(principal)}
- Dobândă anuală: ${annualRate}%
- Perioada rămasă: ${monthsRemaining} luni
- Plată extra lunară: ${formatCurrency(extraPaymentMonthly)}
- Luni reduse: ${monthsReduced} luni

Textul trebuie să conțină:
1. Solicitarea de rambursare anticipată cu reducerea perioadei
2. Specificarea că suma suplimentară lunară de ${formatCurrency(extraPaymentMonthly)} trebuie direcționată integral către principal

Generează DOAR textul pentru bancă, fără explicații suplimentare.`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.7,
      max_tokens: 200,
    });

    const generatedText =
      completion.choices[0]?.message?.content ||
      `Solicit rambursare anticipată cu reducerea perioadei. Vă rog ca suma suplimentară de ${formatCurrency(extraPayment)} să fie direcționată integral către principal.`;

    return NextResponse.json({ text: generatedText.trim() });
  } catch (error: any) {
    console.error("Error generating bank text:", error);
    return NextResponse.json(
      {
        error: "Failed to generate text",
        details: error.message || "Unknown error",
      },
      { status: 500 }
    );
  }
}
