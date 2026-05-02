import { NextRequest, NextResponse } from "next/server";
import { createServerUserClient } from "@/lib/supabase/serverUserClient";
import { getAssistantAuth } from "@/lib/assistant/auth";

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


const DEFAULT_LIMIT = 30;
const MAX_LIMIT = 50;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await getAssistantAuth(request);
    if (!auth) {
      return NextResponse.json({ error: "Necesită autentificare." }, { status: 401 });
    }

    const { id: conversationId } = await params;
    if (!conversationId) {
      return NextResponse.json({ error: "Lipsește id conversație." }, { status: 400 });
    }

    const { searchParams } = new URL(request.url);
    const limit = Math.min(
      Math.max(1, parseInt(searchParams.get("limit") ?? String(DEFAULT_LIMIT), 10) || DEFAULT_LIMIT),
      MAX_LIMIT
    );
    const cursor = searchParams.get("cursor")?.trim() || null;

    const supabase = createServerUserClient(auth.accessToken);

    const { data: conv, error: convError } = await supabase
      .from("assistant_conversations")
      .select("id")
      .eq("id", conversationId)
      .eq("user_id", auth.userId)
      .single();

    if (convError || !conv) {
      return NextResponse.json({ error: "Conversație negăsită." }, { status: 404 });
    }

    let query = supabase
      .from("assistant_messages")
      .select("id, role, content, created_at")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true });

    if (cursor) {
      const { data: cursorRow } = await supabase
        .from("assistant_messages")
        .select("created_at")
        .eq("id", cursor)
        .eq("conversation_id", conversationId)
        .single();
      if (cursorRow?.created_at) {
        query = query.gt("created_at", cursorRow.created_at);
      }
    }

    const { data: rows, error } = await query.range(0, limit);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const raw = rows ?? [];
    const hasMore = raw.length > limit;
    const list = hasMore ? raw.slice(0, limit) : raw;
    const nextCursor = hasMore && list.length > 0 ? list[list.length - 1]?.id ?? null : null;

    return NextResponse.json({
      messages: list.map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        created_at: m.created_at,
      })),
      nextCursor,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Eroare.";
    if (process.env.NODE_ENV === "development") {
      console.error("[assistant/conversations/[id] GET]", err);
    } else {
      console.error("[assistant/conversations/[id] GET]", msg);
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Eroare." },
      { status: 500 }
    );
  }
}
