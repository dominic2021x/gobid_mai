import { NextResponse } from "next/server";
import { z } from "zod";
import { anthropicMessages } from "@/lib/ai/anthropic/client";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


export const runtime = "nodejs";
export const maxDuration = 30;

const DEFAULT_MODEL = "claude-3-5-sonnet-latest";
const DEFAULT_MAX_TOKENS = 1024;
const DEFAULT_TEMPERATURE = 0.2;
const SYSTEM_PROMPT =
  "You are a helpful assistant. Reply concisely and in the language of the user.";

const bodySchema = z.object({
  prompt: z.string().min(1, "prompt is required").max(20000),
  model: z.string().optional(),
  maxTokens: z
    .number()
    .int()
    .min(64)
    .max(4096)
    .optional(),
  temperature: z.number().min(0).max(1).optional(),
});

type SuccessPayload = {
  ok: true;
  model: string;
  text: string;
  usage: { input_tokens: number; output_tokens: number } | null;
};
type ErrorPayload = { ok: false; error: string };

/**
 * Example usage (client-side, with auth):
 *   fetch("/api/ai/claude/messages", {
 *     method: "POST",
 *     headers: { "content-type": "application/json", "Authorization": "Bearer <access_token>" },
 *     body: JSON.stringify({ prompt: "Salut" }),
 *   })
 */
export async function POST(req: Request): Promise<NextResponse<SuccessPayload | ErrorPayload>> {
  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json(
        { ok: false, error: "Missing or invalid authorization" },
        { status: 401 }
      );
    }
    const token = authHeader.slice(7).trim();
    if (!supabaseAdmin) {
      return NextResponse.json(
        { ok: false, error: "Server misconfiguration" },
        { status: 500 }
      );
    }
    const { data: authUser, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !authUser?.user) {
      return NextResponse.json(
        { ok: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    const raw = await req.json();
    const parseResult = bodySchema.safeParse(raw);
    if (!parseResult.success) {
      const message =
        parseResult.error.issues.map((e) => e.message).join("; ") || "Validation failed";
      return NextResponse.json({ ok: false, error: message }, { status: 400 });
    }

    const body = parseResult.data;
    const model = body.model ?? DEFAULT_MODEL;
    const max_tokens = body.maxTokens ?? DEFAULT_MAX_TOKENS;
    const temperature = body.temperature ?? DEFAULT_TEMPERATURE;

    const out = await anthropicMessages({
      model,
      max_tokens,
      temperature,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: [{ type: "text", text: body.prompt }],
        },
      ],
    });

    const text =
      (out.content ?? [])
        .filter((b): b is { type: string; text: string } => b?.type === "text" && typeof b.text === "string")
        .map((b) => b.text)
        .join("") ?? "";

    return NextResponse.json({
      ok: true,
      model: out.model,
      text,
      usage: out.usage ?? null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
