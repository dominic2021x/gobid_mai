import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";
import { supabaseAdmin } from "@/lib/supabase";
import { sendUserPushNotification } from "@/lib/push/sendUserPushNotification";

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (!auth.ok) return auth.response;
  if (!supabaseAdmin) {
    return NextResponse.json({ error: "Supabase admin client not configured" }, { status: 500 });
  }

  const status = String(new URL(request.url).searchParams.get("status") || "all").toLowerCase();
  let query = supabaseAdmin
    .from("token_refund_requests")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(500);

  if (status !== "all") {
    query = query.eq("status", status);
  }

  const { data, error } = await query;
  if (error) {
    console.error("GET admin token refund requests failed:", error);
    return NextResponse.json({ error: "Cannot load token support requests" }, { status: 500 });
  }
  return NextResponse.json(data || []);
}

export async function PATCH(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (!auth.ok) return auth.response;
  if (!supabaseAdmin) {
    return NextResponse.json({ error: "Supabase admin client not configured" }, { status: 500 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const id = String(body?.id || "").trim();
    const status = String(body?.status || "").trim().toLowerCase();
    const adminNote = String(body?.adminNote || "").trim();
    const allowedStatuses = new Set(["pending", "approved", "rejected", "refunded"]);

    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
    if (!allowedStatuses.has(status)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }

    const { data: existingRequest, error: existingError } = await supabaseAdmin
      .from("token_refund_requests")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (existingError || !existingRequest) {
      return NextResponse.json({ error: "Request not found" }, { status: 404 });
    }

    const previousStatus = String(existingRequest.status || "").toLowerCase();

    const { data, error } = await supabaseAdmin
      .from("token_refund_requests")
      .update({
        status,
        admin_note: adminNote || null,
        reviewed_at: new Date().toISOString(),
        reviewed_by_user_id: auth.user.id,
      })
      .eq("id", id)
      .select("*")
      .single();

    if (error) {
      console.error("PATCH admin token refund request failed:", error);
      return NextResponse.json({ error: "Cannot update request" }, { status: 500 });
    }

    let tokenGranted = false;

    // Grant exactly 1 token when request is approved the first time.
    if (status === "approved" && previousStatus !== "approved" && previousStatus !== "refunded") {
      const userId = String(existingRequest.user_id || "");
      const userEmail = String(existingRequest.user_email || "");
      const productId = String(existingRequest.product_id || "").trim();
      if (userId) {
        // Re-lock announcement by removing unlock marker (user must unlock again).
        if (productId) {
          const { error: relockError } = await supabaseAdmin
            .from("user_unlocked_products")
            .delete()
            .eq("user_id", userId)
            .eq("product_id", productId);
          if (relockError) {
            console.error("Failed to relock product on refund approval:", relockError);
          }
        }

        const { data: tokensRow, error: tokensError } = await supabaseAdmin
          .from("user_tokens")
          .select("*")
          .eq("user_id", userId)
          .maybeSingle();

        if (tokensError) {
          console.error("Failed to read user_tokens for refund approval:", tokensError);
        } else {
          if (!tokensRow) {
            const { error: insertTokensError } = await supabaseAdmin
              .from("user_tokens")
              .insert({
                user_id: userId,
                user_email: userEmail,
                balance: 1,
                total_earned: 1,
                total_spent: 0,
                level: "Basic",
                package_type: "Basic",
              });
            if (insertTokensError) {
              console.error("Failed to create user_tokens row on refund approval:", insertTokensError);
            } else {
              tokenGranted = true;
            }
          } else {
            const { error: updateTokensError } = await supabaseAdmin
              .from("user_tokens")
              .update({
                balance: Number(tokensRow.balance || 0) + 1,
                total_earned: Number(tokensRow.total_earned || 0) + 1,
              })
              .eq("user_id", userId);

            if (updateTokensError) {
              console.error("Failed to increment token on refund approval:", updateTokensError);
            } else {
              tokenGranted = true;
            }
          }

          if (tokenGranted) {
            const transactionId = `TKN-REFUND-${id}`;
            const { data: existingTx } = await supabaseAdmin
              .from("token_transactions")
              .select("id")
              .eq("transaction_id", transactionId)
              .maybeSingle();

            if (!existingTx) {
              await supabaseAdmin
                .from("token_transactions")
                .insert({
                  user_id: userId,
                  user_email: userEmail || "unknown@gobid.ro",
                  transaction_id: transactionId,
                  type: "earned",
                  amount: 1,
                  status: "completed",
                  date: new Date().toISOString().split("T")[0],
                  description: `Returnare token aprobată pentru anunț ${existingRequest.product_title || "anunț"}`.trim(),
                  payment_method: "Token Support",
                  tokens_received: 1,
                });
            }
          }
        }
      }
    }

    const userId = String(existingRequest.user_id || "");
    const productTitle = String(existingRequest.product_title || "anunț").trim();

    try {
      if (status === "approved") {
        const msg = tokenGranted
          ? `Cererea de returnare token pentru anunțul "${productTitle}" a fost aprobată. Ai primit 1 token înapoi.`
          : `Cererea de returnare token pentru anunțul "${productTitle}" a fost aprobată.`;

        await supabaseAdmin.from("user_notifications").insert({
          user_id: userId,
          title: "Token Support",
          message: msg,
          type: "success",
          metadata: {
            type: "token_refund_approved",
            refund_request_id: id,
            token_granted: tokenGranted,
            product_code: existingRequest.product_code || null,
            sender_name: "Token Support",
            target_url: "/dashboard/exclusiv",
          },
        });

        await sendUserPushNotification({
          userId,
          title: "Token Support",
          body: msg,
          data: { type: "token_refund_approved" },
        });
      } else if (status === "rejected") {
        const msg = `Cererea de returnare token pentru anunțul "${productTitle}" nu a fost aprobată.`;

        await supabaseAdmin.from("user_notifications").insert({
          user_id: userId,
          title: "Token Support",
          message: msg,
          type: "warning",
          metadata: {
            type: "token_refund_rejected",
            refund_request_id: id,
            product_code: existingRequest.product_code || null,
            sender_name: "Token Support",
            target_url: "/dashboard/exclusiv",
          },
        });

        await sendUserPushNotification({
          userId,
          title: "Token Support",
          body: msg,
          data: { type: "token_refund_rejected" },
        });
      }
    } catch (notificationError) {
      console.error("Failed to send token refund notification:", notificationError);
    }

    return NextResponse.json({ success: true, request: data, tokenGranted });
  } catch (error) {
    console.error("PATCH /api/admin/tokens/refund-requests failed:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

