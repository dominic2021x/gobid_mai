import { NextRequest, NextResponse } from "next/server";
import { createServerUserClient } from "@/lib/supabase/serverUserClient";
import { getAssistantAuth } from "@/lib/assistant/auth";
import { attachPhoto } from "@/lib/assistant/tools";
import type { AssistantContext } from "@/lib/assistant/tools";

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


export async function POST(request: NextRequest) {
  try {
    const auth = await getAssistantAuth(request);
    if (!auth) {
      return NextResponse.json({ error: "Necesită autentificare." }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const conversationId = body.conversationId as string | undefined;
    const rawUrls = Array.isArray(body.urls) ? body.urls : [];
    const MAX_URLS_PER_REQUEST = 10;
    const urls = rawUrls.slice(0, MAX_URLS_PER_REQUEST);

    if (!conversationId || urls.length === 0) {
      return NextResponse.json(
        { error: "Lipsesc conversationId sau lista de URL-uri." },
        { status: 400 }
      );
    }
    if (rawUrls.length > MAX_URLS_PER_REQUEST) {
      return NextResponse.json(
        { error: `Maximum ${MAX_URLS_PER_REQUEST} imagini per cerere.` },
        { status: 400 }
      );
    }

    const supabase = createServerUserClient(auth.accessToken);
    const ctx: AssistantContext = { supabase, userId: auth.userId };

    const { data: conv, error: convError } = await supabase
      .from("assistant_conversations")
      .select("id")
      .eq("id", conversationId)
      .eq("user_id", auth.userId)
      .single();

    if (convError || !conv) {
      return NextResponse.json({ error: "Conversație negăsită." }, { status: 404 });
    }

    const { data: stateRow, error: stateError } = await supabase
      .from("assistant_state")
      .select("draft_product_id")
      .eq("conversation_id", conversationId)
      .single();

    if (stateError || !stateRow?.draft_product_id) {
      return NextResponse.json(
        { error: "Nu există un draft în această conversație. Creează mai întâi un anunț." },
        { status: 400 }
      );
    }

    const draftProductId = stateRow.draft_product_id;
    const attached: string[] = [];
    const errors: string[] = [];

    for (const raw of urls) {
      const url = typeof raw === "string" ? raw.trim() : "";
      if (!url) continue;
      try {
        await attachPhoto(ctx, draftProductId, url);
        attached.push(url);
      } catch (err) {
        errors.push(err instanceof Error ? err.message : String(err));
      }
    }

    return NextResponse.json({
      attached: attached.length,
      total: urls.length,
      errors: errors.length > 0 ? errors : undefined,
      message:
        attached.length > 0
          ? `Am atașat ${attached.length} poză(e) la draft.`
          : errors.length > 0
            ? "Nicio poză validă. Doar URL-uri de la Cloudinary sunt acceptate."
            : "Niciun URL valid.",
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Eroare.";
    if (process.env.NODE_ENV === "development") {
      console.error("[assistant/attach-photos]", err);
    } else {
      console.error("[assistant/attach-photos]", msg);
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Eroare." },
      { status: 500 }
    );
  }
}
