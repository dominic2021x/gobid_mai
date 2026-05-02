import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { extractEntitiesFromText, normalizeQuery, mapQueryToCategorySlug, detectCountySlug } from "@/lib/growth/graph/extract";
import {
  WEIGHT_LISTING_TITLE,
  WEIGHT_SEARCH_QUERY,
  WEIGHT_GSC_IMPRESSION,
  WEIGHT_GSC_CLICK,
} from "@/lib/growth/graph/score";
import { countProducts } from "@/lib/server/products/listingsCountRepo";

const CAP_LISTINGS = 10000;
const CAP_SEARCH_QUERIES = 50000;
const CAP_GSC_QUERIES = 2000;
const CAP_EMBEDDINGS_PER_RUN = 100;
const CAP_LINK_RECS = 100;
const MAX_LINKS_PER_SOURCE = 5;
const CAP_PAGES_SEED = 30;
const MIN_INVENTORY_SEED = 3;
const EMBEDDIM = 1536;
const LP_PREFIX = "/ro/lp/";

function getCountyNameMapSync(): Map<string, string> {
  try {
    const path = require("path") as typeof import("path");
    const fs = require("fs") as typeof import("fs");
    const p = path.join(process.cwd(), "judete.json");
    const raw = fs.readFileSync(p, "utf-8");
    const data = JSON.parse(raw) as { judete?: Array<{ nume?: string }> };
    const map = new Map<string, string>();
    for (const j of data.judete ?? []) {
      const name = (j.nume ?? "").trim();
      if (!name) continue;
      const slug = name
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");
      map.set(slug, name);
    }
    return map;
  } catch {
    return new Map<string, string>();
  }
}

export async function handleSemanticGraphRefresh(
  _payload: Record<string, unknown>,
  correlationId: string,
  supabase: SupabaseClient
): Promise<{ ok: boolean; meta?: Record<string, unknown>; error?: string }> {
  try {
    const nodeKey = (kind: string, slug: string) => `${kind}:${slug}`;
    const nodeAggr = new Map<string, { label: string; aliases: string[]; delta: number }>();
    const edgeAggr = new Map<string, { weight: number; evidence: Record<string, unknown> }>();

    const sevenDaysAgo = new Date(Date.now() - 7 * 86400 * 1000).toISOString();

    const [listingsRes, searchRes, gscSnapRes, existingNodesRes] = await Promise.all([
      supabase.from("products").select("id, title, category, subcategory, county, brand, model").not("title", "is", null).order("updated_at", { ascending: false }).limit(CAP_LISTINGS),
      supabase.from("search_queries").select("q_norm").gte("created_at", sevenDaysAgo).limit(CAP_SEARCH_QUERIES),
      supabase.from("growth_google_snapshots").select("result").eq("product", "search_console").eq("kind", "performance_overview").order("created_at", { ascending: false }).limit(1).maybeSingle(),
      supabase.from("graph_nodes").select("id, kind, slug, label, aliases, popularity"),
    ]);

    const existingNodes = (existingNodesRes.data ?? []) as Array<{ id: string; kind: string; slug: string; label: string; aliases: string[]; popularity: number }>;
    const nodeIdByKey = new Map<string, string>();
    for (const n of existingNodes) {
      nodeIdByKey.set(nodeKey(n.kind, n.slug), n.id);
    }

    function addNode(kind: string, slug: string, label: string, aliases: string[], delta: number) {
      const key = nodeKey(kind, slug);
      const cur = nodeAggr.get(key);
      if (cur) {
        cur.delta += delta;
        return;
      }
      nodeAggr.set(key, { label, aliases, delta });
    }

    function addEdge(fromKind: string, fromSlug: string, toKind: string, toSlug: string, rel: string, weight: number, evidence: Record<string, unknown>) {
      const key = `${fromKind}:${fromSlug}|${toKind}:${toSlug}|${rel}`;
      const cur = edgeAggr.get(key);
      if (cur) {
        cur.weight += weight;
        return;
      }
      edgeAggr.set(key, { weight, evidence });
    }

    for (const row of listingsRes.data ?? []) {
      const r = row as { title?: string; category?: string; subcategory?: string; county?: string; brand?: string; model?: string };
      const parts = [r.title, r.category, r.subcategory, r.county, r.brand, r.model].filter(Boolean).map(String);
      const text = parts.join(" ");
      if (!text.trim()) continue;
      const { nodes, edgeCandidates } = extractEntitiesFromText(text);
      for (const n of nodes) {
        addNode(n.kind, n.slug, n.label, n.aliases ?? [], WEIGHT_LISTING_TITLE);
      }
      for (const e of edgeCandidates) {
        addEdge(e.from.kind, e.from.slug, e.to.kind, e.to.slug, e.rel, WEIGHT_LISTING_TITLE, { source: "listings" });
      }
    }

    const byNormSearch = new Map<string, number>();
    for (const row of searchRes.data ?? []) {
      const n = (row as { q_norm: string }).q_norm?.trim();
      if (!n) continue;
      byNormSearch.set(n, (byNormSearch.get(n) ?? 0) + 1);
    }
    for (const [qNorm, count] of byNormSearch) {
      const { nodes, edgeCandidates } = extractEntitiesFromText(qNorm);
      const w = WEIGHT_SEARCH_QUERY * Math.min(count, 10);
      for (const n of nodes) addNode(n.kind, n.slug, n.label, n.aliases ?? [], w);
      for (const e of edgeCandidates) addEdge(e.from.kind, e.from.slug, e.to.kind, e.to.slug, e.rel, w, { source: "search" });
    }

    const gscResult = gscSnapRes.data?.result as { rows?: Array<{ keys?: string[]; impressions?: number; clicks?: number }> } | null;
    const gscRows = Array.isArray(gscResult?.rows) ? gscResult.rows : [];
    for (const row of gscRows.slice(0, CAP_GSC_QUERIES)) {
      const keys = row.keys ?? [];
      const query = keys.length >= 1 ? String(keys[0] ?? "").trim() : "";
      if (!query) continue;
      const imp = Number(row.impressions) || 0;
      const clk = Number(row.clicks) || 0;
      const w = imp * WEIGHT_GSC_IMPRESSION + clk * WEIGHT_GSC_CLICK;
      if (w <= 0) continue;
      const { nodes, edgeCandidates } = extractEntitiesFromText(query);
      for (const n of nodes) addNode(n.kind, n.slug, n.label, n.aliases ?? [], w);
      for (const e of edgeCandidates) addEdge(e.from.kind, e.from.slug, e.to.kind, e.to.slug, e.rel, w, { source: "gsc" });
    }

    for (const [key, { label, aliases, delta }] of nodeAggr) {
      const [kind, slug] = key.split(":");
      if (!kind || !slug) continue;
      const existing = existingNodes.find((n) => n.kind === kind && n.slug === slug);
      if (existing) {
        await supabase.from("graph_nodes").update({ popularity: (existing.popularity ?? 0) + delta, label, aliases: aliases.length ? aliases : existing.aliases }).eq("id", existing.id);
        nodeIdByKey.set(key, existing.id);
      } else {
        const { data: ins } = await supabase.from("graph_nodes").insert({ kind, slug, label, aliases, popularity: delta }).select("id").single();
        if (ins?.id) nodeIdByKey.set(key, (ins as { id: string }).id);
      }
    }

    const queryScoreByNorm = new Map<string, number>();
    for (const [qNorm, count] of byNormSearch) {
      queryScoreByNorm.set(qNorm, Math.max(queryScoreByNorm.get(qNorm) ?? 0, WEIGHT_SEARCH_QUERY * Math.min(count, 10)));
    }
    for (const row of gscRows.slice(0, CAP_GSC_QUERIES)) {
      const keys = row.keys ?? [];
      const query = keys.length >= 1 ? String(keys[0] ?? "").trim() : "";
      if (!query) continue;
      const qNorm = normalizeQuery(query);
      if (!qNorm) continue;
      const imp = Number(row.impressions) || 0;
      const clk = Number(row.clicks) || 0;
      const w = imp * WEIGHT_GSC_IMPRESSION + clk * WEIGHT_GSC_CLICK;
      queryScoreByNorm.set(qNorm, (queryScoreByNorm.get(qNorm) ?? 0) + w);
    }
    const CAP_QUERIES = 2000;
    const queryNorms = Array.from(queryScoreByNorm.entries()).sort((a, b) => b[1] - a[1]).slice(0, CAP_QUERIES);
    for (const [qNorm, score] of queryNorms) {
      const { nodes } = extractEntitiesFromText(qNorm);
      const bestNodeId = nodes.length > 0 ? nodeIdByKey.get(`${nodes[0].kind}:${nodes[0].slug}`) : null;
      const categorySlug = mapQueryToCategorySlug(qNorm);
      const countySlug = detectCountySlug(qNorm);
      await supabase.from("graph_queries").upsert(
        { q_norm: qNorm, best_node_id: bestNodeId ?? null, intent: categorySlug ? "commercial" : null, county_slug: countySlug, category_slug: categorySlug, score, updated_at: new Date().toISOString() },
        { onConflict: "q_norm" }
      );
    }

    const existingEdges = (await supabase.from("graph_edges").select("id, src_node_id, dst_node_id, rel, weight, evidence")).data ?? [];
    for (const [key, { weight, evidence }] of edgeAggr) {
      const [fromPart, toPart, rel] = key.split("|");
      if (!fromPart || !toPart || !rel) continue;
      const [fromKind, fromSlug] = fromPart.split(":");
      const [toKind, toSlug] = toPart.split(":");
      const srcId = nodeIdByKey.get(`${fromKind}:${fromSlug}`);
      const dstId = nodeIdByKey.get(`${toKind}:${toSlug}`);
      if (!srcId || !dstId) continue;
      const existing = existingEdges.find((e: { src_node_id: string; dst_node_id: string; rel: string }) => e.src_node_id === srcId && e.dst_node_id === dstId && e.rel === rel) as { id: string; weight: number; evidence: Record<string, unknown> } | undefined;
      if (existing) {
        await supabase.from("graph_edges").update({ weight: (existing.weight ?? 0) + weight, evidence: { ...(existing.evidence ?? {}), ...evidence } }).eq("id", existing.id);
      } else {
        await supabase.from("graph_edges").insert({ src_node_id: srcId, dst_node_id: dstId, rel, weight, evidence });
      }
    }

    const nodeCount = (await supabase.from("graph_nodes").select("id", { count: "exact", head: true })).count ?? 0;
    const edgeCount = (await supabase.from("graph_edges").select("id", { count: "exact", head: true })).count ?? 0;
    await supabase.from("growth_google_snapshots").insert({
      product: "graph",
      kind: "summary",
      scope_ref: "default",
      result: { nodes: nodeCount, edges: edgeCount, generatedAt: new Date().toISOString() } as unknown as Record<string, unknown>,
    });
    await supabase.from("growth_events").insert({ type: "semantic_graph_refresh", meta: { correlationId, nodeCount, edgeCount } });
    return { ok: true, meta: { nodeCount, edgeCount } };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await supabase.from("growth_events").insert({ type: "semantic_graph_refresh_failed", meta: { correlationId, error: msg } });
    return { ok: false, error: msg };
  }
}

export async function handleSemanticGraphEmbeddingsRefresh(
  _payload: Record<string, unknown>,
  correlationId: string,
  supabase: SupabaseClient
): Promise<{ ok: boolean; meta?: Record<string, unknown>; error?: string }> {
  try {
    const [embRes, nodesRes] = await Promise.all([
      supabase.from("graph_embeddings").select("node_id, updated_at"),
      supabase.from("graph_nodes").select("id, label, aliases, updated_at").order("popularity", { ascending: false }).limit(500),
    ]);
    const embByNode = new Map((embRes.data ?? []).map((r: { node_id: string; updated_at: string }) => [r.node_id, r.updated_at]));
    const allNodes = (nodesRes.data ?? []) as Array<{ id: string; label: string; aliases: string[]; updated_at: string }>;
    const toEmbed = allNodes.filter((n) => {
      const embAt = embByNode.get(n.id);
      return !embAt || (n.updated_at && embAt && n.updated_at > embAt);
    }).slice(0, CAP_EMBEDDINGS_PER_RUN);

    const { generateEmbedding } = await import("@/utils/embeddings");
    let done = 0;
    for (const n of toEmbed) {
      const text = [n.label, ...(n.aliases ?? [])].filter(Boolean).join(" ").slice(0, 8000);
      if (!text) continue;
      const embedding = await generateEmbedding(text, EMBEDDIM);
      await supabase.from("graph_embeddings").upsert(
        { node_id: n.id, embedding, model: "text-embedding-3-small", updated_at: new Date().toISOString() },
        { onConflict: "node_id" }
      );
      done++;
    }

    await supabase.from("growth_events").insert({ type: "semantic_graph_embeddings_refresh", meta: { correlationId, embedded: done } });
    return { ok: true, meta: { embedded: done } };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await supabase.from("growth_events").insert({ type: "semantic_graph_embeddings_refresh_failed", meta: { correlationId, error: msg } });
    return { ok: false, error: msg };
  }
}

export async function handleSemanticGraphLinkRecsRefresh(
  _payload: Record<string, unknown>,
  correlationId: string,
  supabase: SupabaseClient
): Promise<{ ok: boolean; meta?: Record<string, unknown>; error?: string }> {
  try {
    const { data: lps } = await supabase.from("seo_landing_pages").select("slug").in("status", ["published", "review"]).limit(100);
    const { data: hubs } = await supabase.from("seo_hub_pages").select("slug").eq("status", "published").limit(20);
    const sources: string[] = ["/ro"];
    for (const r of lps ?? []) sources.push(`${LP_PREFIX}${(r as { slug: string }).slug}`);
    for (const r of hubs ?? []) sources.push(`/ro/hub/${(r as { slug: string }).slug}`);
    const normalizedSources = [...new Set(sources)].slice(0, 50);

    const { data: edges } = await supabase.from("graph_edges").select("dst_node_id, weight").order("weight", { ascending: false }).limit(300);
    const dstIds = [...new Set((edges ?? []).map((e: { dst_node_id: string }) => e.dst_node_id))].slice(0, 100);
    const { data: nodeRows } = await supabase.from("graph_nodes").select("id, kind, slug, label").in("id", dstIds);
    const nodesById = new Map((nodeRows ?? []).map((n: { id: string; kind: string; slug: string; label: string }) => [n.id, n]));
    const slugToPath = (kind: string, slug: string) => (kind === "category" ? `/ro/${slug}` : kind === "county" ? `${LP_PREFIX}judet-${slug}` : `${LP_PREFIX}${kind}-${slug}`);

    const targetRecs: Array<{ target_path: string; anchor: string; score: number }> = [];
    const seenPath = new Set<string>();
    for (const e of edges ?? []) {
      const edge = e as { dst_node_id: string; weight: number };
      const dst = nodesById.get(edge.dst_node_id);
      if (!dst) continue;
      const targetPath = slugToPath(dst.kind, dst.slug);
      if (seenPath.has(targetPath)) continue;
      seenPath.add(targetPath);
      targetRecs.push({ target_path: targetPath, anchor: dst.label, score: edge.weight });
    }

    let created = 0;
    const existingRecs = (await supabase.from("graph_link_recommendations").select("source_path, target_path")).data ?? [];
    const existingSet = new Set(existingRecs.map((r: { source_path: string; target_path: string }) => `${r.source_path}\t${r.target_path}`));
    for (const sourcePath of normalizedSources) {
      if (created >= CAP_LINK_RECS) break;
      let perSource = 0;
      for (const rec of targetRecs) {
        if (perSource >= MAX_LINKS_PER_SOURCE || created >= CAP_LINK_RECS) break;
        if (existingSet.has(`${sourcePath}\t${rec.target_path}`)) continue;
        await supabase.from("graph_link_recommendations").insert({
          source_path: sourcePath,
          target_path: rec.target_path,
          anchor: rec.anchor.slice(0, 100),
          score: rec.score,
          status: "draft",
        });
        existingSet.add(`${sourcePath}\t${rec.target_path}`);
        perSource++;
        created++;
      }
    }

    await supabase.from("growth_events").insert({ type: "semantic_graph_link_recs_refresh", meta: { correlationId, created } });
    return { ok: true, meta: { created } };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await supabase.from("growth_events").insert({ type: "semantic_graph_link_recs_refresh_failed", meta: { correlationId, error: msg } });
    return { ok: false, error: msg };
  }
}

export async function handleSemanticGraphPagesSeed(
  _payload: Record<string, unknown>,
  correlationId: string,
  supabase: SupabaseClient
): Promise<{ ok: boolean; meta?: Record<string, unknown>; error?: string }> {
  try {
    const { data: topNodes } = await supabase.from("graph_nodes").select("id, kind, slug, label, popularity").order("popularity", { ascending: false }).limit(200);
    const countyNameMap = getCountyNameMapSync();
    const { data: existingLps } = await supabase.from("seo_landing_pages").select("slug");
    const existingSet = new Set((existingLps ?? []).map((r: { slug: string }) => r.slug));
    let seeded = 0;
    for (const n of topNodes ?? []) {
      if (seeded >= CAP_PAGES_SEED) break;
      const node = n as { id: string; kind: string; slug: string; label: string; popularity: number };
      let filters: Record<string, unknown> = {};
      if (node.kind === "category") filters = { categorie: node.slug };
      else if (node.kind === "county") {
        const name = countyNameMap.get(node.slug) ?? node.label;
        filters = { county: name, judet: node.slug };
      } else if (node.kind === "brand") filters = { brand: node.slug };
      else continue;
      const slug = node.kind === "category" ? node.slug : `${node.kind}-${node.slug}`;
      if (existingSet.has(slug)) continue;
      const inventory = await countProducts(filters as { categorie?: string; county?: string; brand?: string }, undefined);
      if (inventory < MIN_INVENTORY_SEED) continue;
      await supabase.from("seo_landing_pages").insert({
        slug,
        status: "draft",
        index_stage: "staged",
        noindex: true,
        title: node.label,
        h1: node.label,
        filters_json: filters,
        intro_md: null,
        faq_json: [],
      });
      existingSet.add(slug);
      seeded++;
    }
    await supabase.from("growth_events").insert({ type: "semantic_graph_pages_seed", meta: { correlationId, seeded } });
    return { ok: true, meta: { seeded } };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await supabase.from("growth_events").insert({ type: "semantic_graph_pages_seed_failed", meta: { correlationId, error: msg } });
    return { ok: false, error: msg };
  }
}
