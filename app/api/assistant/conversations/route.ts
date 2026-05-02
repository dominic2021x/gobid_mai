import { NextRequest, NextResponse } from "next/server";
import { createServerUserClient } from "@/lib/supabase/serverUserClient";
import { getAssistantAuth } from "@/lib/assistant/auth";

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


const SNIPPET_MAX_LEN = 80;

export async function GET(request: NextRequest) {
  try {
    const auth = await getAssistantAuth(request);
    if (!auth) {
      return NextResponse.json({ error: "Necesită autentificare." }, { status: 401 });
    }

    const supabase = createServerUserClient(auth.accessToken);

    const { data: conversations, error: convError } = await supabase
      .from("assistant_conversations")
      .select("id, title, created_at, updated_at")
      .eq("user_id", auth.userId)
      .order("updated_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false });

    if (convError) {
      return NextResponse.json({ error: convError.message }, { status: 500 });
    }

    const list = conversations ?? [];
    if (list.length === 0) {
      return NextResponse.json({
        conversations: [],
      });
    }

    const ids = list.map((c) => c.id);

    const { data: messages, error: msgError } = await supabase
      .from("assistant_messages")
      .select("conversation_id, content, created_at")
      .in("conversation_id", ids)
      .order("created_at", { ascending: false });

    if (msgError) {
      return NextResponse.json({ error: msgError.message }, { status: 500 });
    }

    const lastByConv = new Map<string, string>();
    for (const m of messages ?? []) {
      if (!lastByConv.has(m.conversation_id)) {
        const snippet =
          m.content.length > SNIPPET_MAX_LEN
            ? m.content.slice(0, SNIPPET_MAX_LEN) + "…"
            : m.content;
        lastByConv.set(m.conversation_id, snippet);
      }
    }

    const result = list.map((c) => ({
      id: c.id,
      title: c.title,
      created_at: c.created_at,
      updated_at: c.updated_at ?? c.created_at,
      last_message_snippet: lastByConv.get(c.id) ?? null,
    }));

    return NextResponse.json({ conversations: result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Eroare.";
    if (process.env.NODE_ENV === "development") {
      console.error("[assistant/conversations GET]", err);
    } else {
      console.error("[assistant/conversations GET]", msg);
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Eroare." },
      { status: 500 }
    );
  }
}
