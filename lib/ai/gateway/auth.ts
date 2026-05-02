import { NextRequest, NextResponse } from "next/server";

/**
 * Dacă AI_GATEWAY_API_KEY e setat, cere Bearer sau x-api-key identic.
 * Dacă lipsește env-ul, autentificarea gateway e dezactivată (dev / legacy).
 */
export function verifyAiGatewayAuth(req: NextRequest): NextResponse | null {
  const secret = process.env.AI_GATEWAY_API_KEY?.trim();
  if (!secret) return null;

  const bearer = req.headers.get("authorization");
  const bearerOk =
    typeof bearer === "string" && bearer.trim() === `Bearer ${secret}`;

  const key = req.headers.get("x-api-key");
  const keyOk = typeof key === "string" && key.trim() === secret;

  if (bearerOk || keyOk) return null;

  return NextResponse.json(
    { error: "unauthorized", message: "Setează Authorization: Bearer sau x-api-key" },
    { status: 401 }
  );
}
