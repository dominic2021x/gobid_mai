import { NextRequest, NextResponse } from "next/server";
import { createHmac } from "crypto";
import { requireAdmin } from "@/lib/adminAuth";
import { growthJsonError } from "@/lib/growth/apiError";
import { buildScopes, parseProductsQuery, type GoogleProduct } from "@/lib/google/scopes";

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


const STATE_COOKIE = "growth_oauth_state";
const COOKIE_MAX_AGE = 600; // 10 min

function signState(state: string): string | null {
  const key = process.env.GROWTH_OAUTH_STATE_KEY;
  if (!key || key.length < 16) return null;
  const sig = createHmac("sha256", key).update(state).digest("hex");
  return `${state}.${sig}`;
}

function encodeState(products: GoogleProduct[]): string {
  const payload = JSON.stringify({ nonce: crypto.randomUUID(), products });
  return Buffer.from(payload, "utf8").toString("base64url");
}

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.ok) {
    return growthJsonError("Forbidden", "FORBIDDEN", 403);
  }

  const productsParam = req.nextUrl.searchParams.get("products");
  const products = parseProductsQuery(productsParam);
  const scopes = buildScopes(products);
  const scopeStr = scopes.map((s) => encodeURIComponent(s)).join("%20");

  const statePayload = encodeState(products);
  const signed = signState(statePayload);
  if (!signed) {
    return growthJsonError(
      "GROWTH_OAUTH_STATE_KEY is missing or too short (min 16 chars). Set it in .env.",
      "INTERNAL_ERROR",
      500
    );
  }

  const redirectUri = new URL("/api/admin/growth/google/oauth/callback", req.url).toString();
  const clientId = process.env.GROWTH_GOOGLE_CLIENT_ID;
  if (!clientId) {
    return growthJsonError("GROWTH_GOOGLE_CLIENT_ID not configured", "INTERNAL_ERROR", 500);
  }
  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?response_type=code&client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${scopeStr}&access_type=offline&prompt=consent&include_granted_scopes=true&state=${encodeURIComponent(signed)}`;

  // Return JSON with redirectUrl so the client can redirect with the token; cookie is set so callback receives it
  const res = NextResponse.json({ redirectUrl: authUrl });
  res.cookies.set(STATE_COOKIE, signed, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: COOKIE_MAX_AGE,
    path: "/",
  });
  return res;
}
