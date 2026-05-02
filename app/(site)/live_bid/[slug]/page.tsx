import { buildResolvedLiveBidImageUrls } from "@/lib/live-bid/resolve-live-bid-image-urls";
import { runPostgrestQuery } from "@/lib/server/supabase/postgrest";
import { createServerClient } from "@/lib/supabase/server";
import LiveBidSlugView from "./LiveBidSlugView";

/**
 * Prefetch produs pe server (HTML include date) ca primul paint să fie imediat;
 * clientul continuă cu sesiune, focal, vânzător, recomandări.
 */
export default async function LiveBidPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const supabase = await createServerClient();

  const [{ data: activeRow }, { data: authData }] = await Promise.all([
    runPostgrestQuery<Record<string, unknown>>(
      (signal) =>
        supabase
          .from("products")
          .select("*")
          .abortSignal(signal)
          .eq("slug", slug)
          .eq("product_type", "live-bid")
          .in("status", ["active", "reserved", "sold"])
          .maybeSingle(),
      { timeoutMs: 6500, maxRetries: 0, retryDelayMs: 250 }
    ),
    supabase.auth.getUser().catch(() => ({ data: { user: null } })),
  ]);

  let initialRow: Record<string, unknown> | null = activeRow
    ? (activeRow as unknown as Record<string, unknown>)
    : null;

  const userId = authData.user?.id;
  if (!initialRow && userId) {
    const { data: draftRow } = await runPostgrestQuery<Record<string, unknown>>(
      (signal) =>
        supabase
          .from("products")
          .select("*")
          .abortSignal(signal)
          .eq("slug", slug)
          .eq("product_type", "live-bid")
          .eq("status", "draft")
          .eq("user_id", userId)
          .maybeSingle(),
      { timeoutMs: 6500, maxRetries: 0, retryDelayMs: 250 }
    );
    if (draftRow) {
      initialRow = draftRow as unknown as Record<string, unknown>;
    }
  }

  const initialResolvedImageUrls = buildResolvedLiveBidImageUrls(initialRow);

  return (
    <LiveBidSlugView initialProductRow={initialRow} initialResolvedImageUrls={initialResolvedImageUrls} />
  );
}
