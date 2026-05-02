import { NextRequest, NextResponse } from "next/server";
import { createHmac } from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { encryptTokens } from "@/lib/google/tokens";
import { SCOPES, type GoogleProduct } from "@/lib/google/scopes";

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


const STATE_COOKIE = "growth_oauth_state";

function verifyState(signed: string): boolean {
  const key = process.env.GROWTH_OAUTH_STATE_KEY;
  if (!key || key.length < 16) return false;
  const i = signed.lastIndexOf(".");
  if (i <= 0) return false;
  const state = signed.slice(0, i);
  const sig = signed.slice(i + 1);
  const expected = createHmac("sha256", key).update(state).digest("hex");
  return sig === expected;
}

function decodeState(signed: string): { products: GoogleProduct[] } | null {
  const i = signed.lastIndexOf(".");
  if (i <= 0) return null;
  const state = signed.slice(0, i);
  try {
    const json = Buffer.from(state, "base64url").toString("utf8");
    const parsed = JSON.parse(json) as { products?: string[] };
    const products = (parsed.products ?? []).filter((p): p is GoogleProduct =>
      ["search_console", "google_ads", "ga4", "tag_manager"].includes(p)
    );
    return products.length ? { products } : null;
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const cookieState = req.cookies.get(STATE_COOKIE)?.value;

  if (!code || !state || state !== cookieState || !verifyState(state)) {
    return NextResponse.redirect(
      new URL("/admin/growth/integrations?error=invalid_state", req.url)
    );
  }

  const decoded = decodeState(state);
  const products: GoogleProduct[] = decoded?.products ?? ["search_console"];

  const redirectUri = new URL("/api/admin/growth/google/oauth/callback", req.url).toString();
  const clientId = process.env.GROWTH_GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GROWTH_GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return NextResponse.redirect(
      new URL("/admin/growth/integrations?error=config", req.url)
    );
  }

  const body = new URLSearchParams({
    code,
    redirect_uri: redirectUri,
    grant_type: "authorization_code",
    client_id: clientId,
    client_secret: clientSecret,
  });

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!tokenRes.ok) {
    const errText = await tokenRes.text();
    return NextResponse.redirect(
      new URL(`/admin/growth/integrations?error=token&detail=${encodeURIComponent(errText.slice(0, 100))}`, req.url)
    );
  }

  const tokens = (await tokenRes.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
  };

  const expiryDate = Date.now() + (tokens.expires_in ?? 3600) * 1000;
  const encrypted = encryptTokens({
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token ?? "",
    expiryDate,
  });

  const supabase = createAdminClient();
  for (const product of products) {
    const scopes = SCOPES[product] ?? [];
    await supabase.from("growth_integrations").upsert(
      {
        provider: "google",
        product,
        scopes,
        token_encrypted: encrypted,
        meta: { updated_via: "oauth_callback" },
        updated_at: new Date().toISOString(),
      },
      { onConflict: "provider,product" }
    );
  }

  const res = NextResponse.redirect(new URL("/admin/growth/integrations", req.url));
  res.cookies.delete(STATE_COOKIE);
  return res;
}
