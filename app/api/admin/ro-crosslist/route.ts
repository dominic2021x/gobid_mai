import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";
import { getRoExecutariCrosslistEnabled, setRoExecutariCrosslistEnabled } from "@/lib/ro-crosslist-settings";

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (!auth.ok) return auth.response;

  try {
    const enabled = await getRoExecutariCrosslistEnabled(true);
    return NextResponse.json({ success: true, enabled });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (!auth.ok) return auth.response;

  try {
    const body = (await request.json().catch(() => ({}))) as { enabled?: unknown };
    const enabled = !!body.enabled;
    await setRoExecutariCrosslistEnabled(enabled);
    return NextResponse.json({ success: true, enabled });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
