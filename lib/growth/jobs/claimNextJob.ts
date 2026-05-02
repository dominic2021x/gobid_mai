import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { GrowthJobRow } from "@/lib/growth/jobs";

export interface ClaimNextJobParams {
  instanceId: string;
}

/**
 * Atomically claim the next available growth job using Postgres RPC.
 * Respects: status=queued|stale-locked, run_after<=now(), quarantined=false,
 * per-type max concurrency from growth_settings key 'growth_job_type_limits'.
 * Returns the claimed job or null.
 */
export async function claimNextJob(
  supabase: SupabaseClient,
  params: ClaimNextJobParams
): Promise<GrowthJobRow | null> {
  const { data, error } = await supabase.rpc("growth_claim_next_job", {
    p_instance_id: params.instanceId,
  });

  if (error) throw new Error(error.message);
  if (data == null) return null;
  return data as GrowthJobRow;
}
