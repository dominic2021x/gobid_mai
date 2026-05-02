import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { refreshAccessTokenIfNeeded } from "@/lib/google/tokens";
import type { GoogleProduct } from "@/lib/google/scopes";

const PROVIDER = "google";

export interface GoogleIntegrationRow {
  id: string;
  provider: string;
  product: string;
  token_encrypted: string;
  meta: Record<string, unknown>;
}

/**
 * Fetch integration row for provider='google' and product. Returns null if not found.
 */
export async function getGoogleIntegrationRow(
  product: GoogleProduct
): Promise<GoogleIntegrationRow | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("growth_integrations")
    .select("id, provider, product, token_encrypted, meta")
    .eq("provider", PROVIDER)
    .eq("product", product)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return null;
  return data as GoogleIntegrationRow;
}

/**
 * Get a valid access token for the given product. Uses stored tokens and refreshes if expired.
 * Throws if integration not found or token invalid. Never logs tokens.
 */
export async function getGoogleAccessToken(product: GoogleProduct): Promise<string> {
  const row = await getGoogleIntegrationRow(product);
  if (!row) throw new Error(`Google integration not found: ${product}`);
  return refreshAccessTokenIfNeeded(row);
}
