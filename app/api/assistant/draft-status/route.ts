import { NextRequest, NextResponse } from "next/server";
import { createServerUserClient } from "@/lib/supabase/serverUserClient";
import { getAssistantAuth } from "@/lib/assistant/auth";
import { validateDraft } from "@/lib/assistant/tools";
import type { AssistantContext } from "@/lib/assistant/tools";

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


/**
 * GET /api/assistant/draft-status?conversationId=...
 * Read-only, auth-protected. Returns draft state and validateDraft result for the current user's conversation.
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
    return NextResponse.json({
      hasDraft: false,
      draftProductId: null,
      status: null,
      imagesCount: 0,
      ready: false,
      missing: [],
    });
  }

  const draftProductId = stateRow.draft_product_id;

  const { data: product, error: productError } = await supabase
    .from("products")
    .select("status, images")
    .eq("id", draftProductId)
    .eq("user_id", auth.userId)
    .single();

  if (productError || !product) {
    return NextResponse.json({
      hasDraft: false,
      draftProductId: null,
      status: null,
      imagesCount: 0,
      ready: false,
      missing: [],
    });
  }

  const imagesCount = Array.isArray(product.images) ? product.images.length : 0;
  const status = (product.status as string) ?? "draft";

  let ready = false;
  let missing: string[] = [];
  try {
    const validation = await validateDraft(ctx, draftProductId);
    ready = validation.ready;
    missing = validation.missing;
  } catch {
    // Product may have been deleted or RLS; keep safe defaults
  }

  return NextResponse.json({
    hasDraft: true,
    draftProductId,
    status,
    imagesCount,
    ready,
    missing,
  });
}
