import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { getGrowthSetting } from "@/lib/growth/settings";
import { chatCompletion } from "@/lib/growth/llm";

const GSC_SITE_KEY = "gsc_site_url";
const MAX_CLUSTERS = 25;
const MAX_QUERIES_PER_CLUSTER = 50;
const BASE_PATH = "https://gobid.ro/ro";

const clusterSchema = z.object({
  label: z.string(),
  intent: z.string(),
  keywords: z.array(z.string()).max(100),
  mappedUrl: z.string(),
  confidence: z.number().min(0).max(1),
});

const clustersSnapshotSchema = z.object({
  clusters: z.array(clusterSchema).max(50),
});

export type KeywordCluster = z.infer<typeof clusterSchema>;

const DEFAULT_TAXONOMY: { slug: string; labels: string[] }[] = [
  { slug: "autoturisme", labels: ["masini", "autoturisme", "auto", "masina", "automobil"] },
  { slug: "imobiliare", labels: ["apartament", "casa", "teren", "imobiliare", "inchirieri"] },
  { slug: "electronice", labels: ["telefon", "laptop", "electronice", "gadget"] },
  { slug: "servicii", labels: ["servicii", "oferte", "profesionisti"] },
  { slug: "fashion", labels: ["imbracaminte", "incaltaminte", "moda"] },
  { slug: "sport", labels: ["sport", "echipament", "bicicleta"] },
  { slug: "altele", labels: ["altele", "diverse"] },
];

function str(v: unknown): string {
  if (v == null) return "";
  return String(v).trim().toLowerCase();
}

function num(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (v == null) return 0;
  return Number(String(v).replace(/\D/g, "")) || 0;
}

function deterministicCluster(
  rows: Array<{ query: string; impressions: number }>,
  taxonomy: { slug: string; labels: string[] }[]
): Map<string, string[]> {
  const byCluster = new Map<string, string[]>();
  const other: string[] = [];
  for (const row of rows) {
    const q = str(row.query);
    if (!q) continue;
    let assigned = false;
    for (const cat of taxonomy) {
      if (cat.labels.some((label) => q.includes(label) || label.includes(q.split(" ")[0] ?? ""))) {
        const key = cat.slug;
        if (!byCluster.has(key)) byCluster.set(key, []);
        byCluster.get(key)!.push(row.query);
        assigned = true;
        break;
      }
    }
    if (!assigned) other.push(row.query);
  }
  if (other.length > 0) byCluster.set("other", other.slice(0, MAX_QUERIES_PER_CLUSTER));
  return byCluster;
}

export async function handleKeywordDiscoveryRefresh(
  _payload: Record<string, unknown>,
  correlationId: string,
  supabase: SupabaseClient
): Promise<{ ok: boolean; meta?: Record<string, unknown>; error?: string }> {
  const siteUrl = await getGrowthSetting(GSC_SITE_KEY);
  if (!siteUrl?.trim()) {
    return { ok: false, error: "gsc_site_url not set in growth_settings" };
  }
  const scope = siteUrl.trim();

  try {
    const { data: snap } = await supabase
      .from("growth_google_snapshots")
      .select("result")
      .eq("product", "search_console")
      .eq("kind", "performance_overview")
      .eq("scope_ref", scope)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const result = snap?.result as { rows?: Array<{ keys?: string[]; impressions?: number }> } | null;
    const rows = result?.rows ?? [];
    const queryImpressions = new Map<string, number>();
    for (const row of rows) {
      const keys = row.keys ?? [];
      if (keys.length >= 1) {
        const q = str(keys[0]);
        if (q) queryImpressions.set(q, (queryImpressions.get(q) ?? 0) + num(row.impressions));
      }
    }
    const sortedQueries = Array.from(queryImpressions.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 500)
      .map(([query, impressions]) => ({ query, impressions }));

    const taxonomy = DEFAULT_TAXONOMY;
    const byCluster = deterministicCluster(sortedQueries, taxonomy);

    const clusters: z.infer<typeof clusterSchema>[] = [];
    const clusterKeys = Array.from(byCluster.keys()).slice(0, MAX_CLUSTERS);
    if (clusterKeys.length > 0) {
      const prompt = `You are labeling keyword clusters for a Romanian marketplace. For each cluster key, return a short label (2-4 words) and intent (one word: informational, commercial, transactional). Return ONLY valid JSON: [{"key":"...","label":"...","intent":"..."}] in the same order as keys.\nKeys: ${clusterKeys.join(", ")}`;
      let labelsIntents: Array<{ key: string; label: string; intent: string }> = [];
      try {
        const raw = await chatCompletion(
          [{ role: "user", content: prompt }],
          { temperature: 0.2, max_tokens: 800 }
        );
        const cleaned = raw.replace(/^[\s\S]*?(\[[\s\S]*\])[\s\S]*$/m, "$1").trim();
        labelsIntents = z.array(z.object({ key: z.string(), label: z.string(), intent: z.string() })).parse(JSON.parse(cleaned));
      } catch {
        clusterKeys.forEach((k) => labelsIntents.push({ key: k, label: k, intent: "commercial" }));
      }
      const labelByKey = new Map(labelsIntents.map((l) => [l.key, l]));
      for (const key of clusterKeys) {
        const keywords = byCluster.get(key) ?? [];
        const meta = labelByKey.get(key) ?? { label: key, intent: "commercial" };
        const slug = key === "other" ? "cautare" : key;
        clusters.push({
          label: meta.label,
          intent: meta.intent,
          keywords: keywords.slice(0, MAX_QUERIES_PER_CLUSTER),
          mappedUrl: `${BASE_PATH}/${slug}`,
          confidence: keywords.length > 2 ? 0.8 : 0.5,
        });
      }
    }

    const validated = clustersSnapshotSchema.parse({ clusters });
    const generatedAt = new Date().toISOString();
    await supabase.from("growth_google_snapshots").insert({
      product: "keywords",
      kind: "clusters",
      scope_ref: scope,
      result: { ...validated, generatedAt } as unknown as Record<string, unknown>,
    });
    await supabase.from("growth_events").insert({
      type: "keyword_discovery_refresh",
      meta: { scopeRef: scope, correlationId, generatedAt, clusterCount: clusters.length },
    });
    return { ok: true, meta: { generatedAt, clusterCount: clusters.length } };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await supabase.from("growth_events").insert({
      type: "keyword_discovery_refresh_failed",
      meta: { scopeRef: scope, correlationId, error: msg },
    });
    return { ok: false, error: msg };
  }
}
