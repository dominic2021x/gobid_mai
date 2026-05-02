import "server-only";

export type AuditQuery = { q: string };

export type AuditResult = {
  query: string;
  topk: Array<{ id: string; title?: string; channel?: string; category?: string }>;
  metrics: { latency_ms: number; null_result: boolean; leakage_detected: boolean };
};

export async function runSearchAudit(params: {
  baseUrl: string;
  queries: AuditQuery[];
  k?: number;
  executariToken?: string | null;
}): Promise<{ results: AuditResult[]; summary: any }> {
  const k = params.k ?? 10;

  const results: AuditResult[] = [];
  let leakageCount = 0;
  let nullCount = 0;
  let totalLatency = 0;

  for (const item of params.queries) {
    const t0 = Date.now();

    const url = new URL("/api/ro/listings", params.baseUrl);
    url.searchParams.set("q", item.q);
    url.searchParams.set("limit", String(k));

    const headers: Record<string, string> = {};
    if (params.executariToken) headers["x-exec-token"] = params.executariToken;

    const res = await fetch(url.toString(), { headers, cache: "no-store" });
    const json = await res.json().catch(() => ({}));

    const latency = Date.now() - t0;
    totalLatency += latency;

    const items = (json?.items ?? json?.data ?? []) as any[];
    const topk = items.slice(0, k).map((x: any) => ({
      id: String(x.id),
      title: x.title ?? x.name,
      channel: x.channel,
      category: x.category ?? x.categorie,
    }));

    const null_result = topk.length === 0;
    if (null_result) nullCount++;

    const leakage_detected = !params.executariToken && topk.some((x) => x.channel === "executari_insolventa");
    if (leakage_detected) leakageCount++;

    results.push({ query: item.q, topk, metrics: { latency_ms: latency, null_result, leakage_detected } });
  }

  const summary = {
    queries: results.length,
    avg_latency_ms: results.length ? Math.round(totalLatency / results.length) : 0,
    null_rate: results.length ? nullCount / results.length : 0,
    leakage_count: leakageCount,
  };

  return { results, summary };
}
