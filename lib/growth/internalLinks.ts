import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { normalizePath } from "@/lib/urls/normalizePath";

export interface InternalLinkRow {
  target_url: string;
  anchor: string;
}

const MAX_LINKS = 10;

/** Server-only: fetch applied internal links for a source path (e.g. /ro/lp/autoturisme). */
export async function getAppliedInternalLinksForSource(sourcePath: string): Promise<InternalLinkRow[]> {
  const path = normalizePath(sourcePath);
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("seo_internal_links")
    .select("target_url, anchor")
    .eq("source_url", path)
    .eq("status", "applied")
    .limit(MAX_LINKS);
  if (error) return [];
  return (data ?? []) as InternalLinkRow[];
}
