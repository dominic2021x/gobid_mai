import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";
import { getGrowthSetting } from "@/lib/growth/settings";
import { enqueueJob } from "@/lib/growth/jobs";
import { growthJsonError } from "@/lib/growth/apiError";

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


const CUSTOMER_KEY = "google_ads_customer_id";

export async function POST(req: NextRequest) {
  try {
    await requireAdmin(req);
  } catch {
    return growthJsonError("Forbidden", "FORBIDDEN", 403);
  }

  let body: { budgetResourceName?: string; amountMicros?: number };
  try {
    body = await req.json().catch(() => ({}));
  } catch {
    body = {};
  }
  const budgetResourceName = body.budgetResourceName;
  const amountMicros = body.amountMicros;
  if (!budgetResourceName || typeof budgetResourceName !== "string" || !budgetResourceName.trim()) {
    return growthJsonError("Missing budgetResourceName", "BAD_REQUEST", 400);
  }
  if (amountMicros == null || typeof amountMicros !== "number" || !Number.isFinite(amountMicros) || amountMicros < 0) {
    return growthJsonError("Missing or invalid amountMicros (non-negative number)", "BAD_REQUEST", 400);
  }

  const customerId = await getGrowthSetting(CUSTOMER_KEY);
  if (!customerId?.trim()) {
    return growthJsonError("google_ads_customer_id not set in growth_settings", "BAD_REQUEST", 400);
  }

  const supabase = createAdminClient();
  try {
    const { jobId } = await enqueueJob(
      {
        type: "google_ads_campaign_budget",
        payload: {
          customerId: customerId.trim(),
          budgetResourceName: budgetResourceName.trim(),
          amountMicros,
        },
      },
      supabase
    );
    return NextResponse.json({ jobId });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return growthJsonError(msg, "INTERNAL_ERROR", 500);
  }
}
