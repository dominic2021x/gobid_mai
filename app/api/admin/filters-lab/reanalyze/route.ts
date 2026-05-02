import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";
import { supabaseAdmin } from "@/lib/supabase";
import { inferIntentCategoriesFromQuery } from "@/lib/search/categoryRules";
import { getOpenAIClient } from "@/lib/ai/openai";
import { RO_CATEGORIES } from "@/lib/data/ro-categories";

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


const CATEGORY_SLUGS = Object.keys(RO_CATEGORIES).filter((k) => k !== "all");
const SUBCATEGORY_SLUGS = Object.entries(RO_CATEGORIES)
  .flatMap(([cat, val]) => (cat === "all" ? [] : val.subcategories))
  .filter(Boolean);

function inferByRules(title: string, description?: string): { categorySlug: string; subcategorySlug: string; confidence: number } {
  const query = `${title || ""} ${description || ""}`.trim();
  const q = query
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

  // Executări - oferte grupate / loturi (high priority)
  if (
    /\b(licitatie|licitatie publica|insolventa|executare|pret de pornire|pornire|lot|loturi|oferta grupata|oferte grupate|cantina|bauturi)\b/.test(
      q
    ) &&
    /\b(lot|loturi|oferta grupata|oferte grupate|cantina|bauturi)\b/.test(q)
  ) {
    return { categorySlug: "executari", subcategorySlug: "oferte-grupate", confidence: 0.9 };
  }

  // Keep behavior aligned with scan route.
  if (/\b(licitatie|licitatie publica|insolventa|executare|lichidare|faliment|administrator judiciar|tva|pret)\b/.test(q)) {
    if (/\b(echipament|utilaj|masina industriala|linie|industrial|productie|laser|cnc)\b/.test(q)) {
      return { categorySlug: "utilaje", subcategorySlug: "utilaje-constructii", confidence: 0.86 };
    }
    return { categorySlug: "business", subcategorySlug: "lichidari-firme", confidence: 0.84 };
  }

  if (/\b(echipament|utilaj|tractor|excavator|generator|compresor|industrial|productie|laser|cnc)\b/.test(q)) {
    return { categorySlug: "utilaje", subcategorySlug: "utilaje-constructii", confidence: 0.82 };
  }

  if (/\b(afacere|firma|societate|stoc|lichidare|office|birou|comercial)\b/.test(q)) {
    return { categorySlug: "business", subcategorySlug: "lichidari-firme", confidence: 0.8 };
  }

  const intents = inferIntentCategoriesFromQuery(query);
  const first = intents[0];
  if (!first || first.categorySlug === "all") {
    return { categorySlug: "diverse", subcategorySlug: "colectii-private", confidence: 0.45 };
  }
  const fallbackSub = RO_CATEGORIES[first.categorySlug]?.subcategories?.[0] || "colectii-private";
  return {
    categorySlug: first.categorySlug,
    subcategorySlug: first.subcategorySlug && first.subcategorySlug !== "all" ? first.subcategorySlug : fallbackSub,
    confidence: 0.72,
  };
}

function normalizeText(input: string): string {
  return (input || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function applySpecialCategoryOverrides(
  title: string,
  description: string,
  suggestion: { categorySlug: string; subcategorySlug: string; confidence: number }
): { categorySlug: string; subcategorySlug: string; confidence: number } {
  const q = normalizeText(`${title || ""} ${description || ""}`);
  if (
    /\b(licitatie|licitatie publica|insolventa|executare|pret de pornire|pornire|lot|loturi|oferta grupata|oferte grupate|cantina|bauturi)\b/.test(
      q
    ) &&
    /\b(lot|loturi|oferta grupata|oferte grupate|cantina|bauturi)\b/.test(q)
  ) {
    return {
      categorySlug: "executari",
      subcategorySlug: "oferte-grupate",
      confidence: Math.max(suggestion.confidence, 0.9),
    };
  }
  return suggestion;
}

function extractPrimaryImage(images: any): string | null {
  if (!images) return null;
  if (typeof images === "string") {
    if (/^https?:\/\//i.test(images)) return images;
    try {
      const parsed = JSON.parse(images);
      return extractPrimaryImage(parsed);
    } catch {
      return null;
    }
  }
  if (Array.isArray(images)) {
    const first = images[0];
    if (!first) return null;
    if (typeof first === "string") return first;
    if (typeof first?.url === "string") return first.url;
    return null;
  }
  if (typeof images?.url === "string") return images.url;
  return null;
}

async function inferByChatgpt(input: {
  title: string;
  shortTitle?: string;
  description?: string;
  imageUrl?: string | null;
}): Promise<{ categorySlug?: string; subcategorySlug?: string; confidence: number; suggestion: string }> {
  try {
    const openai = getOpenAIClient();
    const prompt = `Clasifică anunțul și dă o scurtă sugestie de îmbunătățire.

Taxonomy categorii (slug): ${CATEGORY_SLUGS.join(", ")}
Taxonomy subcategorii (slug): ${SUBCATEGORY_SLUGS.join(", ")}

Titlu: "${input.title || ""}"
Titlu scurt: "${input.shortTitle || ""}"
Descriere: "${(input.description || "").slice(0, 1200)}"
Imagine principală URL: "${input.imageUrl || "N/A"}"

Răspunde DOAR JSON valid:
{
  "categorySlug":"...",
  "subcategorySlug":"...",
  "confidence":0.0,
  "improvementSuggestion":"..."
}

Reguli:
- categorySlug trebuie să existe în lista de categorii.
- subcategorySlug trebuie să existe și să aparțină categoriei.
- improvementSuggestion trebuie să fie concret (ex: ce câmp să completeze, ce denumire să ajusteze).`;

    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      temperature: 0.1,
      max_tokens: 220,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: "Ești un clasificator strict de produse. Răspunzi exclusiv JSON." },
        { role: "user", content: prompt },
      ],
    });

    const raw = completion.choices?.[0]?.message?.content?.trim() || "{}";
    const parsed = JSON.parse(raw) as {
      categorySlug?: string;
      subcategorySlug?: string;
      confidence?: number;
      improvementSuggestion?: string;
    };
    const categorySlug = String(parsed.categorySlug || "").trim();
    const subcategorySlug = String(parsed.subcategorySlug || "").trim();
    const confidence = typeof parsed.confidence === "number" ? Math.max(0, Math.min(1, parsed.confidence)) : 0.7;
    const suggestion = String(parsed.improvementSuggestion || "").trim();

    const validCategory = CATEGORY_SLUGS.includes(categorySlug);
    const validSub = SUBCATEGORY_SLUGS.includes(subcategorySlug);
    const consistent = validCategory && validSub && RO_CATEGORIES[categorySlug]?.subcategories?.includes(subcategorySlug);
    if (!consistent) {
      return {
        confidence: 0.25,
        suggestion: suggestion || "Revede categoria/subcategoria și completează descrierea cu detalii clare (stare, model, localizare).",
      };
    }
    return {
      categorySlug,
      subcategorySlug,
      confidence,
      suggestion: suggestion || "Structură bună. Poți îmbunătăți titlul cu model exact și starea produsului.",
    };
  } catch {
    return {
      confidence: 0.2,
      suggestion: "Analiza AI nu a putut rula. Verifică manual titlul, descrierea și imaginea principală.",
    };
  }
}

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (!auth.ok) return auth.response;

  if (!supabaseAdmin) {
    return NextResponse.json({ success: false, error: "Supabase admin client not configured." }, { status: 503 });
  }

  try {
    const body = (await request.json().catch(() => ({}))) as { productId?: string };
    const productId = String(body.productId || "").trim();
    if (!productId) {
      return NextResponse.json({ success: false, error: "Lipsește productId." }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from("products")
      .select("id,title,short_title,description,images,image,category,subcategory,city,product_location")
      .eq("id", productId)
      .maybeSingle();

    if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    if (!data) return NextResponse.json({ success: false, error: "Produsul nu există." }, { status: 404 });

    const title = String((data as any).title || "").trim();
    const shortTitle = String((data as any).short_title || "").trim();
    const description = String((data as any).description || "").trim();
    const imageUrl = extractPrimaryImage((data as any).images) || extractPrimaryImage((data as any).image);

    const rules = inferByRules(title, description);
    const llm = await inferByChatgpt({ title, shortTitle, description, imageUrl });
    const useLlm = Boolean(llm.categorySlug && llm.subcategorySlug && llm.confidence >= 0.5);

    const rawSuggestion = {
      categorySlug: useLlm ? llm.categorySlug! : rules.categorySlug,
      subcategorySlug: useLlm ? llm.subcategorySlug! : rules.subcategorySlug,
      confidence: useLlm ? llm.confidence : rules.confidence,
    };
    const finalSuggestion = applySpecialCategoryOverrides(title, description, rawSuggestion);
    const finalCategory = finalSuggestion.categorySlug;
    const finalSubcategory = finalSuggestion.subcategorySlug;
    const finalConfidence = finalSuggestion.confidence;

    const currentCategory = String((data as any).category || "").trim();
    const currentSubcategory = String((data as any).subcategory || "").trim();

    const improvementSuggestion =
      llm.suggestion ||
      "Adaugă în descriere: stare produs, specificații principale, localitate exactă și condiții de predare.";

    const needsChange =
      currentCategory.toLowerCase() !== finalCategory.toLowerCase() ||
      currentSubcategory.toLowerCase() !== finalSubcategory.toLowerCase();

    return NextResponse.json({
      success: true,
      productId,
      current: {
        category: currentCategory,
        subcategory: currentSubcategory,
      },
      suggested: {
        category: finalCategory,
        subcategory: finalSubcategory,
        confidence: Number(finalConfidence.toFixed(2)),
        engine: useLlm ? "chatgpt" : "rules",
      },
      analyzedFrom: {
        title: Boolean(title),
        shortTitle: Boolean(shortTitle),
        description: Boolean(description),
        image: Boolean(imageUrl),
      },
      imageUrl: imageUrl || null,
      improvementSuggestion,
      needsChange,
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error?.message || "Unexpected error" }, { status: 500 });
  }
}

