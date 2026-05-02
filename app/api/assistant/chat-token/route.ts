import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { runChatHandler, type ChatAuth } from "@/app/api/assistant/chat/route";
import { getClientIp, rateLimitOrThrow, RateLimitError } from "@/lib/security/rateLimit";

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


export const runtime = "nodejs";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

function withCorrelationId<T>(body: T, init?: { status?: number }, cId?: string): NextResponse {
  const res = NextResponse.json(body, init);
  if (cId) res.headers.set("x-correlation-id", cId);
  return res;
}

export async function POST(request: NextRequest) {
  const correlationId = crypto.randomUUID();
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return withCorrelationId(
      { error: "Necesită autentificare.", code: "AUTH_REQUIRED" },
      { status: 401 },
      correlationId
    );
  }
  const token = authHeader.slice(7).trim();
  if (!token) {
    return withCorrelationId(
      { error: "Necesită autentificare.", code: "AUTH_REQUIRED" },
      { status: 401 },
      correlationId
    );
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser(token);

  if (userError || !user?.id) {
    return withCorrelationId(
      { error: "Necesită autentificare.", code: "AUTH_REQUIRED" },
      { status: 401 },
      correlationId
    );
  }

  const auth: ChatAuth = {
    userId: user.id,
    accessToken: token,
    email: user.email ?? null,
  };

  const ip = getClientIp(request);
  try {
    await rateLimitOrThrow({
      key: `chat:token:${auth.userId}:${ip}`,
      limit: 20,
      windowSeconds: 60,
    });
  } catch (e) {
    if (e instanceof RateLimitError) {
      return withCorrelationId(
        { error: e.message, code: "RATE_LIMIT_EXCEEDED" },
        { status: 429 },
        correlationId
      );
    }
    throw e;
  }

  return runChatHandler(request, auth, correlationId);
}
