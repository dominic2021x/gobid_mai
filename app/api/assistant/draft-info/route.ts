import { NextRequest, NextResponse } from "next/server";
import { createServerUserClient } from "@/lib/supabase/serverUserClient";
import { getAssistantAuth } from "@/lib/assistant/auth";

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


/**
 * GET /api/assistant/draft-info?conversationId=...
 * Read-only, auth required. Returns draft metadata (title, status) for the current user's conversation.
 * Ownership: conversation must belong to user; draft_product_id from assistant_state must belong to user.
 */
export async function GET(request: NextRequest) {
  const auth = await getAssistantAuth(request);
  if (!auth) {
    return NextResponse.json({ error: "Necesită autentificare." }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const conversationId = searchParams.get("conversationId")?.trim() || null;
  if (!conversationId) {
    return NextResponse.json({ error: "Lipsește conversationId." }, { status: 400 });
  }

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

  const { data: stateRow, error: stateError } = await supabase
    .from("assistant_state")
    .select("draft_product_id")
    .eq("conversation_id", conversationId)
    .single();

  if (stateError || !stateRow?.draft_product_id) {
    return NextResponse.json({ draftId: null });
  }

  const draftProductId = stateRow.draft_product_id;

  const { data: product, error: productError } = await supabase
    .from("products")
    .select("id, title, status, updated_at")
    .eq("id", draftProductId)
    .eq("user_id", auth.userId)
    .single();

  if (productError || !product) {
    return NextResponse.json({ draftId: null });
  }

  const status = (product.status as string) ?? "draft";
  const title = product.title != null && String(product.title).trim() !== "" ? String(product.title).trim() : null;
  const updatedAt = product.updated_at != null ? new Date(product.updated_at).toISOString() : undefined;

  return NextResponse.json({
    draftId: product.id,
    title,
    status,
    ...(updatedAt != null && { updatedAt }),
  });
}
