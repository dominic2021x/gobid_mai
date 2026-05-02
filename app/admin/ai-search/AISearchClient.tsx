"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import ModernDatePicker from "@/components/ModernDatePicker";

type Stats = {
  totalSearches: number;
  uniqueUsers: number;
  uniqueIps: number;
  topQueries: Array<{ q_norm: string; sample_phrase: string; count: number; last_at: string }>;
  range: string;
} | null;

type EventItem = {
  id: string;
  created_at: string;
  q: string;
  q_norm: string;
  user_id: string | null;
  ip_hash: string | null;
};

type ReplayItem = {
  phrase: string;
  kind: string;
  popularity: number;
  meta: Record<string, unknown>;
};

type InspectResult = {
  phrase: string;
  phrase_norm: string;
  suggestion_row: {
    kind: string;
    popularity: number;
    meta: unknown;
    updated_at: string;
    enriched_at?: string | null;
  } | null;
  events_count_30d: number;
  last_event_at: string | null;
  synonyms_in: Array<{ from_norm: string; to_phrase: string; to_norm: string; weight: number }>;
  synonyms_out: Array<{ from_norm: string; to_phrase: string; to_norm: string; weight: number }>;
  verdict: { source: "user-driven" | "enriched" | "seed/unknown" };
} | null;

type RegenerateResult = {
  ok: boolean;
  mode?: string;
  batches_run?: number;
  processed_listings?: number;
  extracted_candidates?: number;
  unique_phrases_sent_to_db?: number;
  deduplicated_in_batch?: number;
  distinct_upserted?: number;
  duplicates_skipped?: number;
  candidates_dropped_cap?: number;
  last_updated_at?: string | null;
  last_id?: string | null;
  elapsed_ms?: number;
  reason?: string;
  total_suggestions_in_db?: number;
  total_suggestions_after_seed?: number;
  entity_type_distribution?: Record<string, number>;
  product_suggestion_log?: Array<{
    listing_id: string;
    title: string;
    suggestions: Array<{ phrase: string; entity_type: string }>;
  }>;
  error?: string;
};

const ENTITY_TYPE_LABELS: Record<string, string> = {
  _empty: "Fără tip (bootstrap/track)",
  real_estate: "Imobiliare",
  auto: "Auto",
};

type RecomputeResult = {
  ok: boolean;
  aggregated_days?: number;
  updated_suggestions?: number;
  error?: string;
};

type DuplicatesRow = {
  phrase: string;
  source: string | null;
  entity_type: string | null;
  is_public: boolean;
  id: string;
  rank_score: number | null;
};
type DuplicatesResult = {
  ok: boolean;
  total_duplicate_phrase_norms?: number;
  explanation?: string;
  duplicates?: Array<{
    phrase_norm: string;
    kind: string;
    count: number;
    rows: DuplicatesRow[];
  }>;
};

const RANGE_OPTIONS = ["24h", "7d", "30d"] as const;
const EVENTS_PAGE_SIZE = 50;

function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);
  useEffect(() => {
    const t = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debouncedValue;
}

function shortId(id: string | null): string {
  if (!id) return "n/a";
  if (id.length <= 12) return id;
  return `${id.slice(0, 6)}…${id.slice(-4)}`;
}

/** Enterprise status: success (green), warning (yellow), error (red) */
type StatusVariant = "success" | "warning" | "error";

function getRegenerateStatus(r: RegenerateResult): StatusVariant {
  if (!r.ok || r.error) return "error";
  if (r.processed_listings === 0 && !r.reason) return "warning";
  if (r.reason === "all entity types capped" || (r.distinct_upserted === 0 && (r.processed_listings ?? 0) > 0))
    return "warning";
  return "success";
}

function getRecomputeStatus(r: RecomputeResult): StatusVariant {
  if (!r.ok || r.error) return "error";
  if ((r.updated_suggestions ?? 0) === 0) return "warning";
  return "success";
}

const statusStyles = {
  success: {
    card: "border-emerald-500/50 bg-emerald-50/60",
    badge: "bg-emerald-100 text-emerald-800 border-emerald-300",
    text: "text-emerald-800",
    label: "Foarte bine",
  },
  warning: {
    card: "border-amber-500/50 bg-amber-50/50",
    badge: "bg-amber-100 text-amber-800 border-amber-300",
    text: "text-amber-800",
    label: "Mai trebuie îmbunătățiri",
  },
  error: {
    card: "border-red-500/50 bg-red-50/50",
    badge: "bg-red-100 text-red-800 border-red-300",
    text: "text-red-800",
    label: "Rău – atenție",
  },
} as const;

type TabId = "dashboard" | "sugestii" | "pattern" | "intelligence" | "geo" | "autocorrect";

const REJECTION_REASONS: Record<string, string> = {
  phrase_too_short: "Fraza prea scurtă",
  blacklisted: "În blacklist",
  invalid_token: "Token invalid (ex: vanzare)",
  weak_last_token: "Cuvânt final slab (ex: km, an)",
  invalid_pattern: "Pattern invalid",
  low_pattern_score: "Scor pattern prea mic",
};

/** Score 0..1 → premium color (green / amber / red) and label */
function scoreColor(score: number): { bg: string; text: string; label: string } {
  if (score >= 0.7) return { bg: "bg-emerald-500", text: "text-emerald-700", label: "Foarte bine" };
  if (score >= 0.4) return { bg: "bg-amber-500", text: "text-amber-700", label: "Îmbunătățiri" };
  return { bg: "bg-red-500", text: "text-red-700", label: "Rău" };
}

function ScoreBar({ score, label }: { score: number; label?: string }) {
  const pct = Math.round(Math.min(1, Math.max(0, score)) * 100);
  const c = scoreColor(score);
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2.5 rounded-full bg-slate-200 overflow-hidden">
        <div className={`h-full rounded-full ${c.bg} transition-all duration-300`} style={{ width: `${pct}%` }} />
      </div>
      <span className={`text-sm font-semibold min-w-[2.5rem] ${c.text}`}>{pct}%</span>
      {label != null && <span className="text-xs text-slate-500">{label}</span>}
    </div>
  );
}

function PipelineStep({ step, title, children }: { step: number; title: string; children: ReactNode }) {
  return (
    <div className="flex gap-4">
      <div className="flex flex-col items-center">
        <div className="w-8 h-8 rounded-full bg-slate-800 text-white flex items-center justify-center text-sm font-bold">{step}</div>
        {step < 4 && <div className="w-0.5 flex-1 min-h-4 bg-slate-200" />}
      </div>
      <div className="flex-1 pb-6">
        <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wide mb-2">{title}</h3>
        {children}
      </div>
    </div>
  );
}

export default function AISearchClient() {
  const searchParams = useSearchParams();
  const [token, setToken] = useState<string>("");
  const [range, setRange] = useState<"24h" | "7d" | "30d">("7d");
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [stats, setStats] = useState<Stats>(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [events, setEvents] = useState<EventItem[]>([]);
  const [eventsLoading, setEventsLoading] = useState(true);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [eventsError, setEventsError] = useState<string>("");

  const [qFilter, setQFilter] = useState("");
  const [userIdFilter, setUserIdFilter] = useState("");
  const [fromFilter, setFromFilter] = useState("");
  const [toFilter, setToFilter] = useState("");

  const [replayQ, setReplayQ] = useState("");
  const [replayCategory, setReplayCategory] = useState("");
  const [replaySubcategory, setReplaySubcategory] = useState("");
  const [replayCounty, setReplayCounty] = useState("");
  const [replayCity, setReplayCity] = useState("");
  const [replayResult, setReplayResult] = useState<{
    q: string;
    qNorm: string;
    items: ReplayItem[];
    debug: { usedContext: boolean };
  } | null>(null);
  const [replayLoading, setReplayLoading] = useState(false);
  const [replayError, setReplayError] = useState<string>("");
  const [bootstrapLoading, setBootstrapLoading] = useState(false);
  const [bootstrapDone, setBootstrapDone] = useState<string | null>(null);

  const [inspectPhrase, setInspectPhrase] = useState("");
  const [inspectResult, setInspectResult] = useState<InspectResult | null>(null);
  const [inspectLoading, setInspectLoading] = useState(false);
  const [inspectNotFound, setInspectNotFound] = useState(false);

  const [suggestionsAction, setSuggestionsAction] = useState<string | null>(null);
  const [suggestionsError, setSuggestionsError] = useState<string | null>(null);
  const [regenerateResult, setRegenerateResult] = useState<RegenerateResult | null>(null);
  const [recomputeResult, setRecomputeResult] = useState<RecomputeResult | null>(null);
  const [suggestionsListingId, setSuggestionsListingId] = useState("");
  const [suggestionsRecentLimit, setSuggestionsRecentLimit] = useState(100);
  const [suggestionsFullBatches, setSuggestionsFullBatches] = useState(1);
  const [duplicatesResult, setDuplicatesResult] = useState<DuplicatesResult | null>(null);
  const [duplicatesLoading, setDuplicatesLoading] = useState(false);
  const [cleanupAutoResult, setCleanupAutoResult] = useState<{ ok: boolean; deleted?: number } | null>(null);
  const [cleanupAutoLoading, setCleanupAutoLoading] = useState(false);
  const [suggestionLogFilter, setSuggestionLogFilter] = useState("");

  const [activeTab, setActiveTab] = useState<TabId>("dashboard");

  const [patternPhrase, setPatternPhrase] = useState("");
  const [patternCategory, setPatternCategory] = useState("");
  const [patternSubcategory, setPatternSubcategory] = useState("");
  const [patternLoading, setPatternLoading] = useState(false);
  const [patternActionLoading, setPatternActionLoading] = useState<string | null>(null);
  const [patternInspectResult, setPatternInspectResult] = useState<{
    phrase_norm: string;
    inspect: { keep: boolean; reason?: string; patternType: string; confidence: number; invalid: boolean; segments: Record<string, unknown>; vertical: string | null; patternQualityScore: number; resolved_subcategory?: string | null };
    profile: { vertical: string; minPatternScore: number; validPatternTypes: string[]; preferredPatternTypes: string[] };
  } | null>(null);
  const [patternError, setPatternError] = useState<string | null>(null);
  const [weakReport, setWeakReport] = useState<{ query_norm?: string; weakSuggestions: Array<{ id: string; phrase: string; phrase_norm: string; impressions: number; clicks: number; ctr: number; reason: "zero_clicks" | "low_ctr" }>; blacklistRecent: Array<{ phrase_norm: string; reason: string | null; created_at: string }>; summary: { totalZeroClick: number; totalLowCtr: number; days: number; minImpressions: number; lowCtrThreshold: number } } | null>(null);
  const [weakLoading, setWeakLoading] = useState(false);
  const [weakQuery, setWeakQuery] = useState("");
  const [suppressed, setSuppressed] = useState<Array<{ id: string; phrase: string; phrase_norm: string; auto_suppressed_at: string | null; suppression_reason: string | null; is_active: boolean }> | null>(null);
  const [suppressedLoading, setSuppressedLoading] = useState(false);
  const [affinityQuery, setAffinityQuery] = useState("");
  const [affinity, setAffinity] = useState<Array<{ suggestion_id: string; phrase: string; phrase_norm: string; impressions: number; clicks: number; ctr: number }> | null>(null);
  const [affinityLoading, setAffinityLoading] = useState(false);
  const [suppressApplying, setSuppressApplying] = useState(false);
  const [suppressResult, setSuppressResult] = useState<{ updated: number; details?: unknown[] } | null>(null);

  const [intelligenceQ, setIntelligenceQ] = useState("");
  const [intelligenceLoading, setIntelligenceLoading] = useState(false);
  const [intelligenceData, setIntelligenceData] = useState<{ intent?: Record<string, unknown>; profile?: Record<string, unknown>; geoPlan?: { hasGeoIntent: boolean; tiers: Array<{ tier: string; label: string; order: number }> } | null; suggestionsPreview?: Array<{ phrase: string; kind: string; final_score: number; features: Record<string, number> }>; listingsPreview?: unknown } | null>(null);
  const [intelligenceError, setIntelligenceError] = useState<string | null>(null);

  const [geoLabQuery, setGeoLabQuery] = useState("teren intravilan Dolj");
  const [geoLabLoading, setGeoLabLoading] = useState(false);
  const [geoLabResult, setGeoLabResult] = useState<Record<string, unknown> | null>(null);
  const [geoLabError, setGeoLabError] = useState<string | null>(null);

  type AutocorrectRow = {
    original_query_norm: string;
    suggested_query_norm: string;
    page_context: string;
    shown_count: number;
    accepted_count: number;
    ignored_count: number;
    reformulated_count: number;
    acceptance_rate: number | null;
    ignore_rate: number | null;
    total_actions: number;
  };
  type AutocorrectData = {
    ok: boolean;
    range_days: number;
    since: string;
    summary: {
      total_shown: number;
      total_accepted: number;
      total_ignored: number;
      total_reformulated: number;
      acceptance_rate: number | null;
      ignore_rate: number | null;
    };
    top_by_shown: AutocorrectRow[];
    top_by_acceptance_rate: AutocorrectRow[];
    weak_corrections: AutocorrectRow[];
    all_entries_count: number;
  };
  const [autocorrectData, setAutocorrectData] = useState<AutocorrectData | null>(null);
  const [autocorrectLoading, setAutocorrectLoading] = useState(false);
  const [autocorrectDays, setAutocorrectDays] = useState(14);

  const debouncedQ = useDebounce(qFilter, 250);

  const fetchToken = useCallback(async (): Promise<string> => {
    const { data } = await supabase.auth.getSession();
    const t = data?.session?.access_token ?? "";
    setToken(t);
    return t;
  }, []);

  const loadStats = useCallback(async () => {
    const t = token || (await fetchToken());
    if (!t) return;
    setStatsLoading(true);
    try {
      const res = await fetch(
        `/api/admin/ai-search/stats?range=${range}`,
        { headers: {}, cache: "no-store" }
      );
      const json = await res.json();
      if (json?.ok) setStats(json);
      else setStats(null);
    } catch {
      setStats(null);
    } finally {
      setStatsLoading(false);
    }
  }, [token, range, fetchToken]);

  const loadEvents = useCallback(
    async (cursor?: string | null, append = false) => {
      const t = token || (await fetchToken());
      if (!t) return;
      if (!append) setEventsLoading(true);
      setEventsError("");
      try {
        const params = new URLSearchParams();
        params.set("limit", String(EVENTS_PAGE_SIZE));
        const fromIso = fromFilter ? `${fromFilter}T00:00:00.000Z` : new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        const toIso = toFilter ? `${toFilter}T23:59:59.999Z` : new Date().toISOString();
        params.set("from", fromIso);
        params.set("to", toIso);
        if (debouncedQ) params.set("q", debouncedQ);
        if (userIdFilter) params.set("userId", userIdFilter);
        if (cursor) params.set("cursor", cursor);
        const res = await fetch(`/api/admin/ai-search/events?${params}`, {
          cache: "no-store",
        });
        const json = await res.json();
        if (!json?.ok) {
          setEventsError(json?.error ?? "Eroare la încărcare");
          if (!append) setEvents([]);
          return;
        }
        const list = (json.items ?? []) as EventItem[];
        if (append) setEvents((prev) => [...prev, ...list]);
        else setEvents(list);
        setNextCursor(json.nextCursor ?? null);
      } catch (e) {
        setEventsError(e instanceof Error ? e.message : "Eroare");
        if (!append) setEvents([]);
      } finally {
        setEventsLoading(false);
      }
    },
    [token, debouncedQ, userIdFilter, fromFilter, toFilter, fetchToken]
  );

  useEffect(() => {
    void fetchToken();
  }, [fetchToken]);

  useEffect(() => {
    const tab = searchParams.get("tab");
    if (tab === "pattern" || tab === "sugestii" || tab === "intelligence" || tab === "geo" || tab === "dashboard" || tab === "autocorrect") {
      setActiveTab(tab);
    }
  }, [searchParams]);

  useEffect(() => {
    if (token) {
      void loadStats();
      void loadEvents(null, false);
    }
  }, [token, range, loadStats, loadEvents]);

  useEffect(() => {
    if (!token || !autoRefresh) return;
    const interval = setInterval(() => {
      void loadStats();
      void loadEvents(null, false);
    }, 10000);
    return () => clearInterval(interval);
  }, [token, autoRefresh, loadStats, loadEvents]);

  const onReplay = useCallback(async () => {
    const q = replayQ.trim();
    if (!q) return;
    const t = token || (await fetchToken());
    if (!t) return;
    setReplayLoading(true);
    setReplayResult(null);
    setReplayError("");
    try {
      const params = new URLSearchParams({ q, limit: "10" });
      if (replayCategory) params.set("category", replayCategory);
      if (replaySubcategory) params.set("subcategory", replaySubcategory);
      if (replayCounty) params.set("county", replayCounty);
      if (replayCity) params.set("city", replayCity);
      const res = await fetch(`/api/admin/ai-search/replay?${params}`, {
        cache: "no-store",
      });
      const json = await res.json();
      if (json?.ok) {
        setReplayResult({ q: json.q, qNorm: json.qNorm, items: json.items ?? [], debug: json.debug ?? { usedContext: false } });
      } else {
        setReplayResult(null);
        setReplayError(json?.error ?? `Eroare ${res.status}`);
      }
    } catch (e) {
      setReplayResult(null);
      setReplayError(e instanceof Error ? e.message : "Eroare la cerere");
    } finally {
      setReplayLoading(false);
    }
  }, [token, replayQ, replayCategory, replaySubcategory, replayCounty, replayCity, fetchToken]);

  const onBootstrap = useCallback(async () => {
    const t = token || (await fetchToken());
    if (!t) return;
    setBootstrapLoading(true);
    setBootstrapDone(null);
    try {
      const res = await fetch("/api/admin/search/suggestions/bootstrap", {
        method: "POST",
        cache: "no-store",
      });
      const json = await res.json();
      if (res.ok && json?.ok) {
        setBootstrapDone("Bootstrap reușit. Încearcă din nou Replay (ex: ap, apartament, imobiliare).");
      } else {
        setBootstrapDone(`Eroare: ${json?.error ?? res.status}`);
      }
    } catch (e) {
      setBootstrapDone(e instanceof Error ? e.message : "Eroare la bootstrap");
    } finally {
      setBootstrapLoading(false);
    }
  }, [token, fetchToken]);

  const onInspect = useCallback(async () => {
    const phrase = inspectPhrase.trim();
    if (!phrase) return;
    const t = token || (await fetchToken());
    if (!t) return;
    setInspectLoading(true);
    setInspectNotFound(false);
    setInspectResult(null);
    try {
      const res = await fetch(
        `/api/admin/ai-search/inspect?phrase=${encodeURIComponent(phrase)}`,
        { headers: {}, cache: "no-store" }
      );
      const json = await res.json();
      if (json?.ok) {
        setInspectResult(json);
        setInspectNotFound(false);
      } else {
        setInspectResult(null);
        setInspectNotFound(true);
      }
    } catch {
      setInspectResult(null);
      setInspectNotFound(true);
    } finally {
      setInspectLoading(false);
    }
  }, [token, inspectPhrase, fetchToken]);

  const fillInspect = useCallback((phrase: string) => {
    setInspectPhrase(phrase);
  }, []);

  const runSuggestionsAction = useCallback(
    async (action: string, url: string, body?: Record<string, unknown>) => {
      const t = token || (await fetchToken());
      if (!t) {
        setSuggestionsError("Missing access token");
        return;
      }
      setSuggestionsAction(action);
      setSuggestionsError(null);
      setRegenerateResult(null);
      setRecomputeResult(null);
      try {
        const res = await fetch(url, {
          method: body ? "POST" : "GET",
          headers: {
            ...(body ? { "Content-Type": "application/json" } : {}),
          },
          body: body ? JSON.stringify(body) : undefined,
          cache: "no-store",
        });
        const data = await res.json();
        if (!res.ok) {
          const err =
            typeof data?.error === "string"
              ? data.error
              : data?.error?.message ?? (data?.error ? JSON.stringify(data.error) : null) ?? `HTTP ${res.status}`;
          setSuggestionsError(err);
          return;
        }
        if (url.includes("recompute-ranking")) {
          setRecomputeResult(data as RecomputeResult);
        } else {
          setRegenerateResult(data as RegenerateResult);
        }
      } catch (e) {
        setSuggestionsError(e instanceof Error ? e.message : "Network error");
      } finally {
        setSuggestionsAction(null);
      }
    },
    [token, fetchToken]
  );

  const checkDuplicates = useCallback(async () => {
    const t = token || (await fetchToken());
    if (!t) return;
    setDuplicatesLoading(true);
    setDuplicatesResult(null);
    try {
      const res = await fetch("/api/admin/search/suggestions/duplicates", {
        cache: "no-store",
      });
      const data = await res.json();
      if (res.ok && data?.ok) setDuplicatesResult(data as DuplicatesResult);
      else setDuplicatesResult({ ok: false });
    } catch {
      setDuplicatesResult({ ok: false });
    } finally {
      setDuplicatesLoading(false);
    }
  }, [token, fetchToken]);

  const runCleanupAutoJunk = useCallback(async () => {
    const t = token || (await fetchToken());
    if (!t) return;
    setCleanupAutoLoading(true);
    setCleanupAutoResult(null);
    try {
      const res = await fetch("/api/admin/search/suggestions/cleanup-auto-junk", {
        method: "POST",
        cache: "no-store",
      });
      const data = await res.json();
      if (res.ok && data?.ok) setCleanupAutoResult({ ok: true, deleted: data.deleted });
      else setCleanupAutoResult({ ok: false });
    } catch {
      setCleanupAutoResult({ ok: false });
    } finally {
      setCleanupAutoLoading(false);
    }
  }, [token, fetchToken]);

  const getAuthHeaders = useCallback(async (): Promise<Record<string, string>> => {
    const t = token || (await fetchToken());
    return t ? {} : {};
  }, [token, fetchToken]);

  const onPatternInspect = useCallback(async () => {
    if (!patternPhrase.trim()) return;
    const headers = await getAuthHeaders();
    if (!headers.Authorization) {
      setPatternError("Missing access token");
      return;
    }
    setPatternLoading(true);
    setPatternError(null);
    setPatternInspectResult(null);
    try {
      const params = new URLSearchParams({ q: patternPhrase.trim() });
      if (patternCategory.trim()) params.set("category", patternCategory.trim());
      if (patternSubcategory.trim()) params.set("subcategory", patternSubcategory.trim());
      const res = await fetch(`/api/admin/search/patterns?${params}`, { headers, cache: "no-store" });
      const text = await res.text();
      let json: Record<string, unknown> = {};
      try {
        json = text ? JSON.parse(text) : {};
      } catch {
        setPatternError("Răspuns invalid de la server");
        return;
      }
      if (!res.ok || !json.ok) {
        setPatternError((json.error as string) ?? "Request failed");
        return;
      }
      setPatternInspectResult(json as typeof patternInspectResult);
    } catch (e) {
      setPatternError(e instanceof Error ? e.message : "Network error");
    } finally {
      setPatternLoading(false);
    }
  }, [patternPhrase, patternCategory, patternSubcategory, getAuthHeaders]);

  const loadWeakReport = useCallback(async () => {
    const headers = await getAuthHeaders();
    if (!headers.Authorization) {
      setPatternError("Missing access token");
      return;
    }
    setWeakLoading(true);
    setPatternError(null);
    setWeakReport(null);
    try {
      const url = weakQuery.trim() ? `/api/admin/search/patterns/weak?q=${encodeURIComponent(weakQuery.trim())}` : "/api/admin/search/patterns/weak";
      const res = await fetch(url, { headers, cache: "no-store" });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setPatternError(json.error ?? "Request failed");
        return;
      }
      setWeakReport(json);
    } catch (e) {
      setPatternError(e instanceof Error ? e.message : "Network error");
    } finally {
      setWeakLoading(false);
    }
  }, [weakQuery, getAuthHeaders]);

  const loadSuppressed = useCallback(async () => {
    const headers = await getAuthHeaders();
    if (!headers.Authorization) {
      setPatternError("Missing access token");
      return;
    }
    setSuppressedLoading(true);
    setPatternError(null);
    setSuppressed(null);
    setSuppressResult(null);
    try {
      const res = await fetch("/api/admin/search/patterns/suppressed", { headers, cache: "no-store" });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setPatternError(json.error ?? "Request failed");
        return;
      }
      setSuppressed(json.suppressed ?? []);
    } catch (e) {
      setPatternError(e instanceof Error ? e.message : "Network error");
    } finally {
      setSuppressedLoading(false);
    }
  }, [getAuthHeaders]);

  const runSuppression = useCallback(async () => {
    const headers = await getAuthHeaders();
    if (!headers.Authorization) {
      setPatternError("Missing access token");
      return;
    }
    setSuppressApplying(true);
    setPatternError(null);
    setSuppressResult(null);
    try {
      const res = await fetch("/api/admin/search/patterns/suppressed", { method: "POST", headers: { ...headers, "Content-Type": "application/json" }, cache: "no-store" });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setPatternError(json.error ?? "Request failed");
        return;
      }
      setSuppressResult({ updated: json.updated ?? 0, details: json.details });
      if ((json.updated ?? 0) > 0) void loadSuppressed();
    } catch (e) {
      setPatternError(e instanceof Error ? e.message : "Network error");
    } finally {
      setSuppressApplying(false);
    }
  }, [loadSuppressed, getAuthHeaders]);

  const loadAffinity = useCallback(async () => {
    if (!affinityQuery.trim()) return;
    const headers = await getAuthHeaders();
    if (!headers.Authorization) {
      setPatternError("Missing access token");
      return;
    }
    setAffinityLoading(true);
    setPatternError(null);
    setAffinity(null);
    try {
      const res = await fetch(`/api/admin/search/patterns/affinity?q=${encodeURIComponent(affinityQuery.trim())}`, { headers, cache: "no-store" });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setPatternError(json.error ?? "Request failed");
        return;
      }
      setAffinity(json.affinity ?? []);
    } catch (e) {
      setPatternError(e instanceof Error ? e.message : "Network error");
    } finally {
      setAffinityLoading(false);
    }
  }, [affinityQuery, getAuthHeaders]);

  const doPatternAction = useCallback(async (action: "blacklist" | "whitelist") => {
    const phraseNorm = patternInspectResult?.phrase_norm ?? patternPhrase.trim();
    if (!phraseNorm) return;
    const headers = await getAuthHeaders();
    if (!headers.Authorization) {
      setPatternError("Missing access token");
      return;
    }
    setPatternActionLoading(action);
    setPatternError(null);
    try {
      const res = await fetch("/api/admin/search/patterns", {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ action, phrase_norm: phraseNorm, reason: `Admin ${action} from AI Search panel` }),
        cache: "no-store",
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setPatternError(json.error ?? "Request failed");
        return;
      }
      if (patternInspectResult) {
        setPatternInspectResult({
          ...patternInspectResult,
          inspect: {
            ...patternInspectResult.inspect,
            keep: action === "whitelist",
            reason: action === "blacklist" ? "blacklisted" : "whitelisted",
          },
        });
      }
    } catch (e) {
      setPatternError(e instanceof Error ? e.message : "Network error");
    } finally {
      setPatternActionLoading(null);
    }
  }, [patternInspectResult, patternPhrase, getAuthHeaders]);

  const onIntelligenceInspect = useCallback(async () => {
    if (!intelligenceQ.trim()) return;
    const t = token || (await fetchToken());
    if (!t) {
      setIntelligenceError("Missing access token");
      return;
    }
    setIntelligenceLoading(true);
    setIntelligenceError(null);
    setIntelligenceData(null);
    try {
      const res = await fetch(`/api/admin/search/intelligence?q=${encodeURIComponent(intelligenceQ.trim())}&limit=8`, {
        cache: "no-store",
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setIntelligenceError(json.error ?? "Request failed");
        return;
      }
      setIntelligenceData(json);
    } catch (e) {
      setIntelligenceError(e instanceof Error ? e.message : "Network error");
    } finally {
      setIntelligenceLoading(false);
    }
  }, [intelligenceQ, token, fetchToken]);

  const onGeoLabInspect = useCallback(async () => {
    if (!geoLabQuery.trim()) return;
    const t = token || (await fetchToken());
    if (!t) {
      setGeoLabError("Missing access token");
      return;
    }
    setGeoLabLoading(true);
    setGeoLabError(null);
    setGeoLabResult(null);
    try {
      const res = await fetch(`/api/admin/search/geo-lab?q=${encodeURIComponent(geoLabQuery.trim())}`, {
        cache: "no-store",
      });
      const text = await res.text();
      if (!text?.trim()) {
        setGeoLabError(res.ok ? "Răspuns gol" : `Eroare ${res.status}`);
        return;
      }
      const json = JSON.parse(text);
      if (!json.ok) {
        setGeoLabError(json.error ?? "Request failed");
        return;
      }
      setGeoLabResult(json);
    } catch (e) {
      setGeoLabError(e instanceof Error ? e.message : "Network error");
    } finally {
      setGeoLabLoading(false);
    }
  }, [geoLabQuery, token, fetchToken]);

  const refreshLogs = useCallback(() => {
    void loadEvents(null, false);
  }, [loadEvents]);

  const loadMoreEvents = useCallback(() => {
    if (nextCursor && !eventsLoading) void loadEvents(nextCursor, true);
  }, [nextCursor, eventsLoading, loadEvents]);

  const topQuery = useMemo(
    () => (stats?.topQueries?.[0] ? stats.topQueries[0].sample_phrase : "—"),
    [stats]
  );

  const statsStatus: StatusVariant =
    !statsLoading && stats === null
      ? "error"
      : stats && (stats.totalSearches ?? 0) > 0
        ? "success"
        : !statsLoading && stats
          ? "warning"
          : "success";

  const loadAutocorrect = useCallback(async () => {
    const headers = await getAuthHeaders();
    setAutocorrectLoading(true);
    try {
      const res = await fetch(`/api/admin/search/autocorrect?days=${autocorrectDays}`, { headers, cache: "no-store" });
      const json = await res.json();
      if (json?.ok) setAutocorrectData(json as AutocorrectData);
      else setAutocorrectData(null);
    } catch {
      setAutocorrectData(null);
    } finally {
      setAutocorrectLoading(false);
    }
  }, [autocorrectDays, getAuthHeaders]);

  useEffect(() => {
    if (activeTab === "autocorrect") void loadAutocorrect();
  }, [activeTab, loadAutocorrect]);

  const tabs: { id: TabId; label: string }[] = [
    { id: "dashboard", label: "Dashboard" },
    { id: "sugestii", label: "Sugestii & seed" },
    { id: "pattern", label: "Pattern Engine" },
    { id: "intelligence", label: "Intelligence" },
    { id: "geo", label: "Geo Lab" },
    { id: "autocorrect", label: "Autocorrect" },
  ];

  return (
    <div className="min-h-screen bg-slate-100/80 p-4 md:p-6 text-slate-900">
      <div className="mx-auto max-w-[1600px] space-y-6">
        {/* Header – enterprise */}
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="h-9 w-1 rounded-full bg-emerald-500" />
            <h1 className="text-xl font-bold tracking-tight text-slate-900">
              AI Search · Panou control
            </h1>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {RANGE_OPTIONS.map((r) => (
              <button
                key={r}
                onClick={() => setRange(r)}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                  range === r
                    ? "bg-emerald-600 text-white shadow-sm"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                {r === "24h" ? "24h" : r === "7d" ? "7 zile" : "30 zile"}
              </button>
            ))}
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
                className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
              />
              Auto-refresh 10s
            </label>
          </div>
        </div>

        {/* Tabs – enterprise */}
        <div className="flex flex-wrap gap-1 rounded-xl border border-slate-200 bg-white p-1.5 shadow-sm">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                activeTab === tab.id
                  ? "bg-emerald-600 text-white shadow-sm"
                  : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Dashboard: Stats + Replay + Inspect + Logs */}
        {activeTab === "dashboard" && (
          <>
        {/* Stats cards – enterprise cu indicator de stare */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            {
              label: "Total căutări",
              value: statsLoading ? "…" : stats?.totalSearches ?? "—",
              status: statsLoading ? "success" : stats === null ? "error" : (stats.totalSearches ?? 0) > 0 ? "success" : "warning",
            },
            {
              label: "Utilizatori unici",
              value: statsLoading ? "…" : stats?.uniqueUsers ?? "—",
              status: statsLoading ? "success" : stats === null ? "error" : (stats?.uniqueUsers ?? 0) > 0 ? "success" : "warning",
            },
            {
              label: "IP-uri unice (hash)",
              value: statsLoading ? "…" : stats?.uniqueIps ?? "—",
              status: statsLoading ? "success" : stats === null ? "error" : "success",
            },
            {
              label: `Top query (${range})`,
              value: statsLoading ? "…" : topQuery,
              status: statsStatus,
              truncate: true,
            },
          ].map((item, i) => (
            <div
              key={i}
              className={`rounded-xl border-l-4 bg-white p-5 shadow-sm border border-slate-200 ${
                item.status === "success"
                  ? "border-l-emerald-500"
                  : item.status === "warning"
                    ? "border-l-amber-500"
                    : "border-l-red-500"
              }`}
            >
              <p className="text-sm font-medium text-slate-500">{item.label}</p>
              <p
                className={`mt-1 text-2xl font-bold text-slate-900 ${item.truncate ? "truncate" : ""}`}
                title={item.truncate ? String(item.value) : undefined}
              >
                {item.value}
              </p>
            </div>
          ))}
        </div>

        {/* Top row: Replay (left) + Inspect (right) – enterprise cards */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Search Replay */}
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900 mb-4">
              Search Replay
            </h2>
            <div className="space-y-3">
              <input
                type="text"
                value={replayQ}
                onChange={(e) => setReplayQ(e.target.value)}
                placeholder="Query (ex: ap 2 cam)"
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 placeholder-slate-500"
                maxLength={200}
              />
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="text"
                  value={replayCategory}
                  onChange={(e) => setReplayCategory(e.target.value)}
                  placeholder="Category"
                  className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
                />
                <input
                  type="text"
                  value={replaySubcategory}
                  onChange={(e) => setReplaySubcategory(e.target.value)}
                  placeholder="Subcategory"
                  className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
                />
                <input
                  type="text"
                  value={replayCounty}
                  onChange={(e) => setReplayCounty(e.target.value)}
                  placeholder="County"
                  className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
                />
                <input
                  type="text"
                  value={replayCity}
                  onChange={(e) => setReplayCity(e.target.value)}
                  placeholder="City"
                  className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
                />
              </div>
              <button
                onClick={() => void onReplay()}
                disabled={!replayQ.trim() || replayLoading}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {replayLoading ? "Se încarcă…" : "Replay"}
              </button>
            </div>
            {replayError && (
              <div className="mt-4 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                <span className="inline-block h-2 w-2 rounded-full bg-red-500" />
                {replayError}
              </div>
            )}
            {replayResult && (
              <div className="mt-4 border-t border-slate-200 pt-4">
                <p className="text-xs text-slate-500 mb-2">
                  qNorm: {replayResult.qNorm} {replayResult.debug?.usedContext && "(context)"}
                </p>
                {replayResult.items.length === 0 ? (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-800">
                    Nicio sugestie pentru „{replayResult.q}”. Tabelul{" "}
                    <code className="bg-amber-100/80 px-1 rounded">search_suggestions</code> e probabil gol. Rulează{" "}
                    <button
                      type="button"
                      onClick={() => void onBootstrap()}
                      disabled={bootstrapLoading}
                      className="font-medium text-amber-700 underline hover:no-underline disabled:opacity-50"
                    >
                      Bootstrap sugestii
                    </button>{" "}
                    apoi încearcă din nou (ex: ap, apartament, imobiliare).
                  </div>
                ) : (
                  <ul className="space-y-1.5 max-h-48 overflow-y-auto">
                    {replayResult.items.map((it, i) => (
                      <li
                        key={`${it.phrase}-${i}`}
                        className="flex items-center justify-between rounded-lg bg-emerald-50/70 border border-emerald-100 px-3 py-2 text-sm cursor-pointer hover:bg-emerald-50"
                        onClick={() => fillInspect(it.phrase)}
                      >
                        <span className="font-medium text-slate-900">{it.phrase}</span>
                        <span className="text-slate-500 text-xs">{it.kind} · pop {it.popularity}</span>
                      </li>
                    ))}
                  </ul>
                )}
                {bootstrapDone && (
                  <p
                    className={`mt-2 text-sm ${
                      bootstrapDone.startsWith("Eroare")
                        ? "text-red-700 bg-red-50 border border-red-200 rounded-lg px-2 py-1"
                        : "text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-2 py-1"
                    }`}
                  >
                    {bootstrapDone}
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Inspect */}
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900 mb-4">
              Inspect
            </h2>
            <div className="flex gap-2">
              <input
                type="text"
                value={inspectPhrase}
                onChange={(e) => setInspectPhrase(e.target.value)}
                placeholder="Phrase to inspect"
                className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900"
                maxLength={200}
              />
              <button
                onClick={() => void onInspect()}
                disabled={!inspectPhrase.trim() || inspectLoading}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {inspectLoading ? "…" : "Inspect"}
              </button>
            </div>
            {inspectNotFound && !inspectResult && (
              <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                Not found / eroare. Poți verifica events_count mai jos.
              </div>
            )}
            {inspectResult && (
              <div className="mt-4 space-y-3 text-sm border-t border-slate-200 pt-4">
                <p>
                  <span className="font-medium text-slate-500">Source: </span>
                  <span
                    className={
                      inspectResult.verdict.source === "user-driven"
                        ? "text-emerald-600 font-medium"
                        : inspectResult.verdict.source === "enriched"
                          ? "text-amber-600"
                          : "text-slate-600"
                    }
                  >
                    {inspectResult.verdict.source}
                  </span>
                </p>
                {inspectResult.suggestion_row && (
                  <p>
                    <span className="font-medium text-slate-500">Popularity: </span>
                    {inspectResult.suggestion_row.popularity} · updated{" "}
                    {inspectResult.suggestion_row.updated_at
                      ? new Date(inspectResult.suggestion_row.updated_at).toLocaleString("ro-RO")
                      : "—"}
                  </p>
                )}
                <p>
                  <span className="font-medium text-slate-500">Events 30d: </span>
                  {inspectResult.events_count_30d} · last{" "}
                  {inspectResult.last_event_at
                    ? new Date(inspectResult.last_event_at).toLocaleString("ro-RO")
                    : "—"}
                </p>
                {inspectResult.synonyms_in.length > 0 && (
                  <div>
                    <p className="font-medium text-slate-500">Synonyms in (top 20):</p>
                    <ul className="mt-1 list-disc list-inside text-slate-600">
                      {inspectResult.synonyms_in.slice(0, 5).map((s, i) => (
                        <li key={i}>{s.from_norm} → {s.to_phrase}</li>
                      ))}
                      {inspectResult.synonyms_in.length > 5 && (
                        <li>+{inspectResult.synonyms_in.length - 5} more</li>
                      )}
                    </ul>
                  </div>
                )}
                {inspectResult.synonyms_out.length > 0 && (
                  <div>
                    <p className="font-medium text-slate-500">Synonyms out (top 20):</p>
                    <ul className="mt-1 list-disc list-inside text-slate-600">
                      {inspectResult.synonyms_out.slice(0, 5).map((s, i) => (
                        <li key={i}>{s.from_norm} → {s.to_phrase}</li>
                      ))}
                      {inspectResult.synonyms_out.length > 5 && (
                        <li>+{inspectResult.synonyms_out.length - 5} more</li>
                      )}
                    </ul>
                  </div>
                )}
                {inspectResult.suggestion_row?.meta != null &&
                  typeof inspectResult.suggestion_row.meta === "object" && (
                    <details className="mt-2">
                      <summary className="cursor-pointer text-slate-500 text-sm font-medium">
                        Meta (detalii)
                      </summary>
                      <div className="mt-2 rounded-xl border border-slate-200 bg-slate-50/80 p-3 space-y-1.5 max-h-40 overflow-y-auto">
                        {Object.entries(inspectResult.suggestion_row.meta as Record<string, unknown>).map(([k, v]) => (
                          <div key={k} className="flex items-center gap-2 text-sm">
                            <span className="font-medium text-slate-600 min-w-[100px]">{k}</span>
                            <span className="rounded-md bg-white border border-slate-200 px-2 py-0.5 text-slate-800">{String(v)}</span>
                          </div>
                        ))}
                      </div>
                    </details>
                  )}
              </div>
            )}
          </div>
        </div>

        {/* Live Logs – dashboard */}
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
            <h2 className="text-lg font-semibold text-slate-900">
              Live Logs
            </h2>
            <button
              onClick={refreshLogs}
              disabled={eventsLoading}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              Refresh
            </button>
          </div>
          {eventsError && (
            <div className="mb-4 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
              <span className="inline-block h-2 w-2 rounded-full bg-red-500" />
              {eventsError}
            </div>
          )}
          <div className="flex flex-wrap gap-2 mb-4">
            <input
              type="text"
              value={qFilter}
              onChange={(e) => setQFilter(e.target.value)}
              placeholder="q (prefix)"
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm w-40 text-slate-900"
            />
            <input
              type="text"
              value={userIdFilter}
              onChange={(e) => setUserIdFilter(e.target.value)}
              placeholder="user_id (UUID)"
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm w-48 text-slate-900"
            />
            <div className="min-w-[180px]">
              <ModernDatePicker
                value={fromFilter}
                onChange={(date) => setFromFilter(date)}
                placeholder="De la"
                isDarkMode={false}
              />
            </div>
            <div className="min-w-[180px]">
              <ModernDatePicker
                value={toFilter}
                onChange={(date) => setToFilter(date)}
                placeholder="Până la"
                isDarkMode={false}
              />
            </div>
          </div>
          <div className="overflow-x-auto rounded-lg border border-slate-200">
            {eventsLoading && events.length === 0 ? (
              <div className="py-12 text-center text-slate-500">
                Se încarcă…
              </div>
            ) : events.length === 0 ? (
              <div className="py-12 text-center text-slate-500">
                Nicio căutare în intervalul selectat.
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50">
                    <th className="text-left py-2 px-3 font-medium text-slate-600">Time</th>
                    <th className="text-left py-2 px-3 font-medium text-slate-600">q</th>
                    <th className="text-left py-2 px-3 font-medium text-slate-600">q_norm</th>
                    <th className="text-left py-2 px-3 font-medium text-slate-600">user_id</th>
                    <th className="text-left py-2 px-3 font-medium text-slate-600">ip_hash</th>
                  </tr>
                </thead>
                <tbody>
                  {events.map((ev) => (
                    <tr
                      key={ev.id}
                      className="border-b border-slate-100 hover:bg-slate-50"
                    >
                      <td className="py-2 px-3 text-slate-600 whitespace-nowrap">
                        {new Date(ev.created_at).toLocaleString("ro-RO")}
                      </td>
                      <td className="py-2 px-3 text-slate-900 max-w-[200px] truncate" title={ev.q}>
                        {ev.q}
                      </td>
                      <td className="py-2 px-3 text-slate-600 max-w-[180px] truncate" title={ev.q_norm}>
                        {ev.q_norm}
                      </td>
                      <td className="py-2 px-3 text-slate-600 font-mono text-xs">
                        {ev.user_id == null ? "anon" : shortId(ev.user_id)}
                      </td>
                      <td className="py-2 px-3 text-slate-500 font-mono text-xs">
                        {ev.ip_hash == null ? "n/a" : shortId(ev.ip_hash)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          {nextCursor && events.length > 0 && (
            <div className="mt-4 flex justify-center">
              <button
                onClick={loadMoreEvents}
                disabled={eventsLoading}
                className="rounded-lg bg-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-300 disabled:opacity-50"
              >
                Load more
              </button>
            </div>
          )}
        </div>
          </>
        )}

        {/* Tab: Sugestii & seed */}
        {activeTab === "sugestii" && (
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900 mb-2">
            Regenerare sugestii (seed from titles)
          </h2>
          <p className="text-sm text-slate-500 mb-4">
            Operațiunile sunt limitate la un batch per request (safe serverless).
          </p>
          {suggestionsError && (
            <div className="mb-4 flex items-center gap-2 rounded-lg border-2 border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800">
              <span className="inline-block h-3 w-3 rounded-full bg-red-500 flex-shrink-0" />
              <span className="font-medium">Atenție – probleme:</span> {suggestionsError}
            </div>
          )}
          <div className="flex flex-wrap items-center gap-3 mb-4">
            <div className="flex items-center gap-2">
              <label className="text-sm text-slate-600">Batch-uri:</label>
              <input
                type="number"
                min={1}
                value={suggestionsFullBatches}
                onChange={(e) => {
                  const v = parseInt(e.target.value, 10);
                  if (Number.isFinite(v) && v >= 1) setSuggestionsFullBatches(v);
                }}
                className="w-16 rounded border border-slate-300 bg-white px-2 py-1 text-sm text-slate-900"
              />
            </div>
            <button
              type="button"
              onClick={() =>
                runSuggestionsAction("full", "/api/admin/search/suggestions/regenerate", {
                  mode: "full",
                  batches: suggestionsFullBatches,
                })
              }
              disabled={!!suggestionsAction}
              className="rounded-lg bg-amber-500 hover:bg-amber-600 px-4 py-2 text-white disabled:opacity-50 text-sm font-medium"
            >
              {suggestionsAction === "full"
                ? "Se rulează…"
                : `Regenerare completă (${suggestionsFullBatches} batch${suggestionsFullBatches === 1 ? "" : "-uri"})`}
            </button>
            <button
              type="button"
              onClick={() =>
                runSuggestionsAction("next", "/api/admin/search/suggestions/regenerate", {
                  mode: "next",
                })
              }
              disabled={!!suggestionsAction}
              className="rounded-lg bg-slate-600 hover:bg-slate-700 px-4 py-2 text-white disabled:opacity-50 text-sm font-medium"
              title="Un batch de 500 anunțuri de la cursor, fără reset"
            >
              {suggestionsAction === "next" ? "Se rulează…" : "Următorul batch"}
            </button>
            <button
              type="button"
              onClick={() =>
                runSuggestionsAction("recent", "/api/admin/search/suggestions/regenerate", {
                  mode: "recent",
                  limit: suggestionsRecentLimit,
                })
              }
              disabled={!!suggestionsAction}
              className="rounded-lg bg-slate-600 hover:bg-slate-700 px-4 py-2 text-white disabled:opacity-50 text-sm font-medium"
            >
              {suggestionsAction === "recent" ? "Se rulează…" : "Regenerare recente"}
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-2 mb-4">
            <label className="text-sm text-slate-600">Limit recent:</label>
            <input
              type="number"
              min={1}
              max={500}
              value={suggestionsRecentLimit}
              onChange={(e) =>
                setSuggestionsRecentLimit(
                  Math.min(500, Math.max(1, parseInt(e.target.value, 10) || 100))
                )
              }
              className="w-20 rounded border border-slate-300 bg-white px-2 py-1 text-sm text-slate-900"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2 mb-4">
            <label className="text-sm text-slate-600">Listing ID (single):</label>
            <input
              type="text"
              value={suggestionsListingId}
              onChange={(e) => setSuggestionsListingId(e.target.value)}
              placeholder="UUID"
              className="flex-1 min-w-[200px] rounded border border-slate-300 bg-white px-2 py-1.5 text-sm font-mono text-slate-900"
            />
            <button
              type="button"
              onClick={() =>
                runSuggestionsAction("single", "/api/admin/search/suggestions/regenerate", {
                  mode: "single",
                  listingId: suggestionsListingId.trim() || undefined,
                })
              }
              disabled={!!suggestionsAction || !suggestionsListingId.trim()}
              className="rounded-lg bg-slate-600 hover:bg-slate-700 px-4 py-2 text-white disabled:opacity-50 text-sm font-medium"
            >
              {suggestionsAction === "single" ? "Se rulează…" : "Regenerare un listing"}
            </button>
          </div>

          <h2 className="text-lg font-semibold text-slate-900 mt-6 mb-2">
            Recomputare ranking
          </h2>
          <p className="text-sm text-slate-500 mb-4">
            Recalculează quality_score și rank_score din daily_stats (fără re-seed).
          </p>
          <button
            type="button"
            onClick={() =>
              runSuggestionsAction("recompute", "/api/admin/search/suggestions/recompute-ranking", {})
            }
            disabled={!!suggestionsAction}
            className="rounded-lg bg-emerald-600 hover:bg-emerald-700 px-4 py-2 text-white disabled:opacity-50 text-sm font-medium"
          >
            {suggestionsAction === "recompute" ? "Se rulează…" : "Recomputare ranking"}
          </button>
          <button
            type="button"
            onClick={() => checkDuplicates()}
            disabled={duplicatesLoading}
            className="rounded-lg bg-slate-600 hover:bg-slate-700 px-4 py-2 text-white disabled:opacity-50 text-sm font-medium"
            title="Verifică phrase_norm cu mai multe rânduri (surse/entity_type diferite)"
          >
            {duplicatesLoading ? "Se încarcă…" : "Verifică duplicate (sugestii din mai multe părți)"}
          </button>
          <button
            type="button"
            onClick={() => runCleanupAutoJunk()}
            disabled={cleanupAutoLoading}
            className="rounded-lg bg-amber-600 hover:bg-amber-700 px-4 py-2 text-white disabled:opacity-50 text-sm font-medium"
            title="Șterge sugestii auto cu junk (3996 cmc, suv-ul lux, care etc.)"
          >
            {cleanupAutoLoading ? "Se rulează…" : "Curăță sugestii auto (junk)"}
          </button>
          {cleanupAutoResult && (
            <span className="text-sm text-slate-600">
              {cleanupAutoResult.ok && cleanupAutoResult.deleted !== undefined
                ? `Șterse: ${cleanupAutoResult.deleted} rânduri.`
                : "Eroare la curățare (rulează migrația 20260418 dacă RPC lipsește)."}
            </span>
          )}

          {duplicatesResult && (duplicatesResult.ok && duplicatesResult.total_duplicate_phrase_norms !== undefined ? (
            <div className="mt-6 rounded-xl border-2 border-slate-200 bg-white p-4">
              <h3 className="text-sm font-bold text-slate-800 mb-2">Sugestii duplicate (același phrase_norm, mai multe rânduri)</h3>
              <p className="text-sm text-slate-600 mb-3">
                {duplicatesResult.total_duplicate_phrase_norms} phrase_norm au mai mult de un rând (surse/entity_type diferite).
                {duplicatesResult.explanation && (
                  <span className="block mt-1 text-slate-500">{duplicatesResult.explanation}</span>
                )}
              </p>
              {(duplicatesResult.duplicates?.length ?? 0) > 0 && (
                <ul className="space-y-2 max-h-64 overflow-y-auto text-sm">
                  {(duplicatesResult.duplicates ?? []).slice(0, 20).map((d, i) => (
                    <li key={`${d.phrase_norm}-${i}`} className="rounded border border-slate-200 bg-slate-50 p-2">
                      <span className="font-mono font-medium text-slate-800">{d.phrase_norm}</span>
                      <span className="text-slate-500 ml-2">({d.count} rânduri, kind={d.kind})</span>
                      <ul className="mt-1 ml-2 text-slate-600">
                        {d.rows.slice(0, 5).map((r, j) => (
                          <li key={j}>
                            source={r.source ?? "—"} entity_type={r.entity_type ?? "—"} is_public={String(r.is_public)}
                          </li>
                        ))}
                        {d.rows.length > 5 && <li>…+{d.rows.length - 5} rânduri</li>}
                      </ul>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : duplicatesResult && !duplicatesResult.ok ? (
            <div className="mt-6 rounded-xl border-2 border-red-200 bg-red-50 p-4 text-sm text-red-800">
              Verificare duplicate eșuată sau răspuns invalid.
            </div>
          ) : null)}

          {regenerateResult && (() => {
            const status = getRegenerateStatus(regenerateResult);
            const style = statusStyles[status];
            const r = regenerateResult;
            const dist = r.entity_type_distribution ?? {};
            const totalDist = Object.values(dist).reduce((a, b) => a + b, 0);
            return (
              <div className={`mt-6 rounded-xl border-2 p-4 ${style.card}`}>
                <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
                  <h3 className="text-sm font-bold text-slate-800">Rezultat regenerare</h3>
                  <span className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${style.badge}`}>
                    {style.label}
                  </span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 mb-4">
                  {(r.batches_run ?? 0) > 0 && (
                    <div className="rounded-lg bg-white/90 border border-slate-200 p-3">
                      <p className="text-xs font-medium text-slate-500">Batch-uri rulate</p>
                      <p className="text-xl font-bold text-slate-900">{r.batches_run ?? 1}</p>
                    </div>
                  )}
                  <div className="rounded-lg bg-white/90 border border-slate-200 p-3">
                    <p className="text-xs font-medium text-slate-500">Listinguri procesate</p>
                    <p className="text-xl font-bold text-slate-900">{r.processed_listings ?? 0}</p>
                  </div>
                  <div className="rounded-lg bg-white/90 border border-slate-200 p-3">
                    <p className="text-xs font-medium text-slate-500">Candidați extrași (din titluri)</p>
                    <p className="text-xl font-bold text-slate-900">{r.extracted_candidates ?? 0}</p>
                  </div>
                  <div className="rounded-lg bg-white/90 border border-slate-200 p-3">
                    <p className="text-xs font-medium text-slate-500">Fraze unice la DB (insert/update)</p>
                    <p className="text-xl font-bold text-emerald-700">{r.distinct_upserted ?? 0}</p>
                    <p className="text-[10px] text-slate-400 mt-0.5">1 rând RPC = 1 frază după deduplicare</p>
                  </div>
                  <div className="rounded-lg bg-white/90 border border-slate-200 p-3">
                    <p className="text-xs font-medium text-slate-500">Consolidate în batch (aceeași frază)</p>
                    <p className="text-xl font-bold text-slate-700">
                      {r.deduplicated_in_batch ?? r.duplicates_skipped ?? 0}
                    </p>
                  </div>
                  {(r.candidates_dropped_cap ?? 0) > 0 && (
                    <div className="rounded-lg bg-amber-50 border border-amber-200 p-3">
                      <p className="text-xs font-medium text-amber-800">Oprite (cap per tip)</p>
                      <p className="text-xl font-bold text-amber-900">{r.candidates_dropped_cap}</p>
                    </div>
                  )}
                  <div className="rounded-lg bg-white/90 border border-slate-200 p-3">
                    <p className="text-xs font-medium text-slate-500">Timp (ms)</p>
                    <p className="text-xl font-bold text-slate-900">{r.elapsed_ms ?? "—"}</p>
                  </div>
                  <div className="rounded-lg bg-white/90 border border-slate-200 p-3">
                    <p className="text-xs font-medium text-slate-500">Total sugestii în DB (publice)</p>
                    <p className="text-xl font-bold text-slate-900">{r.total_suggestions_in_db ?? "—"}</p>
                  </div>
                  <div className="rounded-lg bg-white/90 border border-slate-200 p-3">
                    <p className="text-xs font-medium text-slate-500">Doar seed din titluri</p>
                    <p className="text-xl font-bold text-slate-900">{r.total_suggestions_after_seed ?? "—"}</p>
                  </div>
                </div>
                {totalDist > 0 && (
                  <div className="rounded-lg bg-white/90 border border-slate-200 p-3">
                    <p className="text-xs font-medium text-slate-500 mb-1">
                      Distribuție seed_titles după entity_type
                    </p>
                    <p className="text-[11px] text-slate-400 mb-2">
                      Numără doar rândurile cu source = seed_titles (nu include sugestiile din căutări /
                      bootstrap).
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {Object.entries(dist).map(([key, count]) => (
                        <div
                          key={key}
                          className="flex items-center gap-2 rounded-lg bg-slate-100 px-3 py-1.5"
                        >
                          <span className="text-sm font-medium text-slate-700">
                            {ENTITY_TYPE_LABELS[key] ?? key.replace(/_/g, " ")}
                          </span>
                          <span className="text-sm font-bold text-slate-900">{count}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {r.reason && (
                  <p className="mt-3 text-xs text-amber-700 bg-amber-100/80 rounded-lg px-2 py-1.5">
                    {r.reason}
                  </p>
                )}
                {r.mode && (
                  <p className="mt-2 text-xs text-slate-500">Mod: {r.mode}</p>
                )}
                {r.product_suggestion_log && r.product_suggestion_log.length > 0 && (
                  <div className="mt-4 rounded-xl border-2 border-slate-200 bg-slate-50 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                      <h4 className="text-sm font-bold text-slate-800">
                        Jurnal live: titlu anunț → sugestii generate ({r.product_suggestion_log.length}{" "}
                        produse)
                      </h4>
                      <input
                        type="search"
                        placeholder="Filtrează după titlu sau ID…"
                        value={suggestionLogFilter}
                        onChange={(e) => setSuggestionLogFilter(e.target.value)}
                        className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900 min-w-[200px]"
                      />
                    </div>
                    <p className="text-xs text-slate-500 mb-2">
                      Fiecare rând = un produs din batch; sugestiile sunt exact ce extragem din titlu
                      (imobiliare + auto). Fără sugestii = titlul nu a produs candidați valizi.
                    </p>
                    <div className="max-h-[min(70vh,520px)] overflow-y-auto rounded-lg border border-slate-200 bg-white">
                      <table className="w-full text-left text-sm">
                        <thead className="sticky top-0 bg-slate-100 text-xs font-semibold text-slate-600 z-10">
                          <tr>
                            <th className="px-2 py-2 w-[100px]">Listing ID</th>
                            <th className="px-2 py-2 min-w-[180px]">Titlu anunț</th>
                            <th className="px-2 py-2">Sugestii generate</th>
                          </tr>
                        </thead>
                        <tbody>
                          {r.product_suggestion_log
                            .filter((row) => {
                              if (!suggestionLogFilter.trim()) return true;
                              const f = suggestionLogFilter.toLowerCase();
                              return (
                                row.listing_id.toLowerCase().includes(f) ||
                                row.title.toLowerCase().includes(f)
                              );
                            })
                            .map((row) => (
                              <tr
                                key={row.listing_id}
                                className="border-t border-slate-100 align-top hover:bg-slate-50/80"
                              >
                                <td className="px-2 py-2 font-mono text-[11px] text-slate-500 break-all">
                                  {row.listing_id.length > 10
                                    ? `${row.listing_id.slice(0, 8)}…`
                                    : row.listing_id}
                                </td>
                                <td className="px-2 py-2 text-slate-800 max-w-[320px]">
                                  {row.title || (
                                    <span className="text-slate-400 italic">(fără titlu)</span>
                                  )}
                                </td>
                                <td className="px-2 py-2">
                                  {row.suggestions.length === 0 ? (
                                    <span className="text-slate-400 text-xs">— nicio sugestie</span>
                                  ) : (
                                    <div className="flex flex-wrap gap-1">
                                      {row.suggestions.map((s, i) => (
                                        <span
                                          key={`${s.phrase}-${i}`}
                                          className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-emerald-50/80 px-2 py-0.5 text-xs text-slate-800"
                                          title={s.entity_type}
                                        >
                                          <span>{s.phrase}</span>
                                          <span className="text-[10px] uppercase text-slate-500">
                                            {s.entity_type === "real_estate"
                                              ? "imob"
                                              : s.entity_type === "auto"
                                                ? "auto"
                                                : s.entity_type}
                                          </span>
                                        </span>
                                      ))}
                                    </div>
                                  )}
                                </td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            );
          })()}
          {recomputeResult && (() => {
            const status = getRecomputeStatus(recomputeResult);
            const style = statusStyles[status];
            const r = recomputeResult;
            return (
              <div className={`mt-6 rounded-xl border-2 p-4 ${style.card}`}>
                <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
                  <h3 className="text-sm font-bold text-slate-800">Rezultat recomputare</h3>
                  <span className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${style.badge}`}>
                    {style.label}
                  </span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  <div className="rounded-lg bg-white/90 border border-slate-200 p-3">
                    <p className="text-xs font-medium text-slate-500">Zile agregate</p>
                    <p className="text-xl font-bold text-slate-900">{r.aggregated_days ?? 0}</p>
                  </div>
                  <div className="rounded-lg bg-white/90 border border-slate-200 p-3">
                    <p className="text-xs font-medium text-slate-500">Sugestii actualizate</p>
                    <p className="text-xl font-bold text-emerald-700">{r.updated_suggestions ?? 0}</p>
                  </div>
                </div>
              </div>
            );
          })()}
        </div>
        )}

        {/* Tab: Pattern Engine */}
        {activeTab === "pattern" && (
          <div className="space-y-6">
            {patternError && (
              <div className="rounded-xl border-2 border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800 flex items-center gap-2">
                <span className="inline-block h-3 w-3 rounded-full bg-red-500 flex-shrink-0" />
                {patternError}
              </div>
            )}
            <div className="rounded-xl border-2 border-emerald-200 bg-white p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-slate-900 mb-2 flex items-center gap-2">
                <span className="w-2 h-5 rounded bg-emerald-500" />
                Verifică frază (pattern)
              </h2>
              <p className="text-sm text-slate-600 mb-4">De ce e acceptată sau respinsă o sugestie. Calificativ: <span className="font-medium text-emerald-700">Foarte bine</span> / <span className="font-medium text-amber-700">Îmbunătățiri</span> / <span className="font-medium text-red-700">Rău</span>.</p>
              <div className="flex flex-wrap gap-2 mb-4">
                <input type="text" value={patternPhrase} onChange={(e) => setPatternPhrase(e.target.value)} onKeyDown={(e) => e.key === "Enter" && onPatternInspect()} placeholder="ex: bmw x5, apartament 2 camere" className="flex-1 min-w-[200px] rounded-lg border border-slate-300 bg-white px-4 py-2 text-slate-900 placeholder-slate-400" />
                <input type="text" value={patternCategory} onChange={(e) => setPatternCategory(e.target.value)} placeholder="Categorie" className="w-32 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900" />
                <input type="text" value={patternSubcategory} onChange={(e) => setPatternSubcategory(e.target.value)} placeholder="Subcategorie" className="w-32 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900" />
                <button type="button" onClick={() => void onPatternInspect()} disabled={patternLoading} className="rounded-lg bg-emerald-600 hover:bg-emerald-700 px-4 py-2 text-white disabled:opacity-50 text-sm font-medium">{patternLoading ? "Se încarcă…" : "Verifică"}</button>
              </div>
              {patternInspectResult && (
                <div className={`rounded-xl border-2 p-4 ${patternInspectResult.inspect.keep ? "border-emerald-300 bg-emerald-50/60" : "border-red-300 bg-red-50/60"}`}>
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                    <span className="font-mono text-slate-800">{patternInspectResult.phrase_norm}</span>
                    <span className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${patternInspectResult.inspect.keep ? "bg-emerald-100 text-emerald-800 border-emerald-300" : "bg-red-100 text-red-800 border-red-300"}`}>
                      {patternInspectResult.inspect.keep ? "Foarte bine – acceptat" : "Rău – respins"}
                    </span>
                  </div>
                  <div className="space-y-3 text-sm">
                    <div>
                      <p className="font-medium text-slate-500 mb-1">Pattern: <span className="text-slate-800 font-mono">{patternInspectResult.inspect.patternType}</span></p>
                      <ScoreBar score={patternInspectResult.inspect.confidence} label="confidence" />
                    </div>
                    <div>
                      <p className="font-medium text-slate-500 mb-1">Calitate pattern</p>
                      <ScoreBar score={patternInspectResult.inspect.patternQualityScore} />
                    </div>
                    {patternInspectResult.inspect.reason && <p className="text-amber-800 font-medium">Motiv: {REJECTION_REASONS[patternInspectResult.inspect.reason] ?? patternInspectResult.inspect.reason}</p>}
                    {patternInspectResult.inspect.resolved_subcategory != null && <p><span className="font-medium text-slate-500">Subcategorie:</span> <span className="rounded-md bg-white/80 px-2 py-0.5 font-mono text-slate-800">{patternInspectResult.inspect.resolved_subcategory}</span></p>}
                  </div>
                  <div className="flex gap-2 mt-3 pt-3 border-t border-slate-200">
                    <button type="button" onClick={() => doPatternAction("blacklist")} disabled={patternActionLoading !== null} className="rounded-lg border border-red-300 bg-red-50 hover:bg-red-100 px-3 py-1.5 text-sm text-red-800 disabled:opacity-50">Blacklist</button>
                    <button type="button" onClick={() => doPatternAction("whitelist")} disabled={patternActionLoading !== null} className="rounded-lg border border-emerald-300 bg-emerald-50 hover:bg-emerald-100 px-3 py-1.5 text-sm text-emerald-800 disabled:opacity-50">Whitelist</button>
                  </div>
                </div>
              )}
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-slate-800 mb-2">Raport sugestii slabe</h2>
              <div className="flex flex-wrap gap-2 mb-3">
                <input type="text" value={weakQuery} onChange={(e) => setWeakQuery(e.target.value)} placeholder="Query (opțional)" className="w-48 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm" />
                <button type="button" onClick={() => void loadWeakReport()} disabled={weakLoading} className="rounded-lg bg-amber-500 hover:bg-amber-600 px-4 py-2 text-white disabled:opacity-50 text-sm font-medium">{weakLoading ? "Se încarcă…" : "Încarcă raport"}</button>
              </div>
              {weakReport && (
                <>
                  {weakReport.query_norm && <p className="text-sm text-slate-600 mb-2">Filtru: <code className="bg-slate-100 px-1 rounded">{weakReport.query_norm}</code></p>}
                  <p className="text-sm text-slate-600 mb-2">Zero clicks: <strong className="text-red-700">{weakReport.summary.totalZeroClick}</strong> · CTR mic: <strong className="text-amber-700">{weakReport.summary.totalLowCtr}</strong></p>
                  {weakReport.weakSuggestions.length > 0 && (
                    <div className="overflow-x-auto rounded-lg border border-slate-200 max-h-64 overflow-y-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-slate-100 sticky top-0"><tr><th className="text-left p-2">Fraza</th><th className="text-right p-2">Impresii</th><th className="text-right p-2">Click-uri</th><th className="text-right p-2">CTR</th><th className="text-left p-2">Stare</th></tr></thead>
                        <tbody>
                          {weakReport.weakSuggestions.slice(0, 50).map((row) => (
                            <tr key={row.id} className="border-t border-slate-200">
                              <td className="p-2 font-mono text-xs">{row.phrase_norm}</td>
                              <td className="p-2 text-right">{row.impressions}</td>
                              <td className="p-2 text-right">{row.clicks}</td>
                              <td className="p-2 text-right">{(row.ctr * 100).toFixed(2)}%</td>
                              <td className="p-2"><span className={row.reason === "zero_clicks" ? "text-red-600 font-medium" : "text-amber-600"}>{row.reason === "zero_clicks" ? "Rău" : "Îmbunătățiri"}</span></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </>
              )}
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-slate-800 mb-2">Auto-suppression (lifecycle)</h2>
              <div className="flex flex-wrap gap-2 mb-3">
                <button type="button" onClick={() => void loadSuppressed()} disabled={suppressedLoading} className="rounded-lg bg-slate-700 hover:bg-slate-800 px-4 py-2 text-white disabled:opacity-50 text-sm font-medium">Listează suppressate</button>
                <button type="button" onClick={() => void runSuppression()} disabled={suppressApplying} className="rounded-lg bg-amber-600 hover:bg-amber-700 px-4 py-2 text-white disabled:opacity-50 text-sm font-medium">Rulează suppression</button>
              </div>
              {suppressResult != null && <p className="text-sm text-slate-600 mb-2">Ultima rulare: <strong>{suppressResult.updated}</strong> dezactivate.</p>}
              {suppressed && suppressed.length > 0 && (
                <div className="overflow-x-auto rounded-lg border border-slate-200 max-h-48 overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-100"><tr><th className="text-left p-2">Fraza</th><th className="text-left p-2">Motiv</th><th className="text-left p-2">Data</th></tr></thead>
                    <tbody>
                      {suppressed.slice(0, 30).map((row) => (
                        <tr key={row.id} className="border-t border-slate-200">
                          <td className="p-2 font-mono text-xs">{row.phrase_norm}</td>
                          <td className="p-2 text-red-600">{row.suppression_reason ?? "—"}</td>
                          <td className="p-2 text-slate-600">{row.auto_suppressed_at ? new Date(row.auto_suppressed_at).toLocaleDateString() : "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-slate-800 mb-2">Query-to-suggestion affinity</h2>
              <div className="flex flex-wrap gap-2 mb-3">
                <input type="text" value={affinityQuery} onChange={(e) => setAffinityQuery(e.target.value)} onKeyDown={(e) => e.key === "Enter" && loadAffinity()} placeholder="ex: apartament" className="rounded-lg border border-slate-300 bg-white px-3 py-2 w-48 text-slate-900" />
                <button type="button" onClick={() => void loadAffinity()} disabled={affinityLoading || !affinityQuery.trim()} className="rounded-lg bg-emerald-600 hover:bg-emerald-700 px-4 py-2 text-white disabled:opacity-50 text-sm font-medium">Încarcă affinity</button>
              </div>
              {affinity && affinity.length > 0 && (
                <div className="overflow-x-auto rounded-lg border border-slate-200">
                  <table className="w-full text-sm">
                    <thead className="bg-emerald-50"><tr><th className="text-left p-2">Sugestie</th><th className="text-right p-2">Impresii</th><th className="text-right p-2">Click-uri</th><th className="text-right p-2">CTR</th></tr></thead>
                    <tbody>
                      {affinity.slice(0, 30).map((row) => (
                        <tr key={row.suggestion_id} className="border-t border-slate-200"><td className="p-2 font-mono text-xs">{row.phrase_norm}</td><td className="p-2 text-right">{row.impressions}</td><td className="p-2 text-right">{row.clicks}</td><td className="p-2 text-right text-emerald-700 font-medium">{(row.ctr * 100).toFixed(2)}%</td></tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <h3 className="text-sm font-medium text-slate-700 mb-2">Motive respingere pattern</h3>
              <ul className="text-xs text-slate-600 space-y-1">
                {Object.entries(REJECTION_REASONS).map(([code, label]) => (
                  <li key={code}><code className="bg-white px-1 rounded border border-slate-200">{code}</code>: {label}</li>
                ))}
              </ul>
            </div>
          </div>
        )}

        {/* Tab: Intelligence – pipeline vizual, fără JSON */}
        {activeTab === "intelligence" && (
          <div className="rounded-xl border-2 border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900 mb-1 flex items-center gap-2">
              <span className="w-2 h-5 rounded bg-amber-500" />
              Search Intelligence
            </h2>
            <p className="text-sm text-slate-500 mb-4">Pipeline-ul AI: query → intent → sugestii. Punctaj pe culori (verde / galben / roșu).</p>
            <div className="flex gap-2 mb-6">
              <input type="text" value={intelligenceQ} onChange={(e) => setIntelligenceQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && onIntelligenceInspect()} placeholder="ex: apartament 2 camere bucuresti" className="flex-1 rounded-lg border border-slate-300 bg-white px-4 py-2 text-slate-900" />
              <button type="button" onClick={() => void onIntelligenceInspect()} disabled={intelligenceLoading} className="rounded-lg bg-amber-500 hover:bg-amber-600 px-4 py-2 text-white disabled:opacity-50 text-sm font-medium">{intelligenceLoading ? "Se încarcă…" : "Inspect"}</button>
            </div>
            {intelligenceError && <div className="rounded-lg border-2 border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800 mb-4 flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-red-500" />{intelligenceError}</div>}
            {intelligenceData && (
              <div className="space-y-0">
                <PipelineStep step={1} title="Query">
                  <div className="rounded-xl border border-slate-200 bg-slate-50/80 px-4 py-3">
                    <p className="font-mono text-slate-800">
                      {typeof intelligenceData.intent?.queryNorm === "string" ? intelligenceData.intent.queryNorm : intelligenceQ}
                    </p>
                  </div>
                </PipelineStep>
                <PipelineStep step={2} title="Intent (structura AI)">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                      <p className="text-xs font-medium text-slate-500 uppercase">Categorie</p>
                      <p className="font-semibold text-slate-800">
                        {typeof intelligenceData.intent?.categorySlug === "string" ? intelligenceData.intent.categorySlug : "—"}
                      </p>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                      <p className="text-xs font-medium text-slate-500 uppercase">Subcategorie</p>
                      <p className="font-semibold text-slate-800">
                        {typeof intelligenceData.intent?.subcategorySlug === "string" ? intelligenceData.intent.subcategorySlug : "—"}
                      </p>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                      <p className="text-xs font-medium text-slate-500 uppercase">Vertical</p>
                      <p className="font-semibold text-slate-800">
                        {typeof intelligenceData.intent?.vertical === "string" ? intelligenceData.intent.vertical : "—"}
                      </p>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                      <p className="text-xs font-medium text-slate-500 uppercase">Geo intent</p>
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${
                          intelligenceData.intent?.hasGeoIntent === true ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-600"
                        }`}
                      >
                        {intelligenceData.intent?.hasGeoIntent === true ? "Da" : "Nu"}
                      </span>
                    </div>
                  </div>
                  {(() => {
                    const loc = intelligenceData.intent?.location as { matchedTokens?: string[] } | undefined;
                    const matchedTokens = loc?.matchedTokens;
                    if (!matchedTokens?.length) return null;
                    return (
                    <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50/50 px-4 py-2">
                      <p className="text-xs font-medium text-slate-500 mb-1">Tokenuri locație</p>
                      <div className="flex flex-wrap gap-1">
                        {matchedTokens.map((t, i) => (
                          <span key={i} className="rounded-md bg-slate-200 px-2 py-0.5 text-xs font-medium text-slate-700">{t}</span>
                        ))}
                      </div>
                    </div>
                    );
                  })()}
                </PipelineStep>
                <PipelineStep step={3} title="Sugestii (preview – punctaj)">
                  {intelligenceData.suggestionsPreview && intelligenceData.suggestionsPreview.length > 0 ? (
                    <div className="space-y-3">
                      {intelligenceData.suggestionsPreview.map((s, i) => {
                        const score = typeof s.final_score === "number" ? s.final_score : 0;
                        const norm = Math.min(1, Math.max(0, score / 1.5));
                        const c = scoreColor(norm);
                        return (
                          <div key={i} className={`rounded-xl border-2 p-3 ${c.bg === "bg-emerald-500" ? "border-emerald-200 bg-emerald-50/50" : c.bg === "bg-amber-500" ? "border-amber-200 bg-amber-50/50" : "border-red-200 bg-red-50/50"}`}>
                            <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                              <span className="font-medium text-slate-800">{s.phrase}</span>
                              <span className={`text-xs font-bold ${c.text}`}>{c.label} · {(norm * 100).toFixed(0)}%</span>
                            </div>
                            <ScoreBar score={norm} />
                            <p className="text-xs text-slate-500 mt-1">{s.kind}</p>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-500 text-sm">Nicio sugestie pentru acest query.</div>
                  )}
                </PipelineStep>
              </div>
            )}
          </div>
        )}

        {/* Tab: Geo Lab – pipeline vizual, fără JSON */}
        {activeTab === "geo" && (
          <div className="rounded-xl border-2 border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900 mb-1 flex items-center gap-2">
              <span className="w-2 h-5 rounded bg-red-500" />
              Geo Lab
            </h2>
            <p className="text-sm text-slate-500 mb-4">Pipeline-ul AI: query → intent → locație → plan geo. Rezultate pe structură, fără JSON.</p>
            <div className="flex gap-2 mb-6">
              <input type="text" value={geoLabQuery} onChange={(e) => setGeoLabQuery(e.target.value)} onKeyDown={(e) => e.key === "Enter" && onGeoLabInspect()} placeholder="ex: teren intravilan Dolj" className="flex-1 rounded-lg border border-slate-300 bg-white px-4 py-2 text-slate-900" />
              <button type="button" onClick={() => void onGeoLabInspect()} disabled={geoLabLoading} className="rounded-lg bg-red-500 hover:bg-red-600 px-4 py-2 text-white disabled:opacity-50 text-sm font-medium">{geoLabLoading ? "Se încarcă…" : "Inspect"}</button>
            </div>
            {geoLabError && <div className="rounded-lg border-2 border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800 mb-4 flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-red-500" />{geoLabError}</div>}
            {geoLabResult && typeof geoLabResult === "object" && (geoLabResult as { ok?: boolean }).ok && (
              (() => {
                const r = geoLabResult as { query?: string; intent?: { categorySlug?: string; vertical?: string; isNavigational?: boolean; location?: { placeNameNorm?: string; matchedTokens?: string[]; countyCode?: string; countyId?: string; placeId?: string } }; geoPlan?: { hasGeoIntent?: boolean; tiers?: Array<{ tier: string; label: string; order: number }> }; progressiveTiers?: unknown };
                const intent = r.intent ?? {};
                const loc = intent.location ?? {};
                const geoPlan = r.geoPlan ?? {};
                const tiers = (geoPlan.tiers ?? []) as Array<{ tier: string; label: string; order: number }>;
                return (
                  <div className="space-y-0">
                    <PipelineStep step={1} title="Query">
                      <div className="rounded-xl border border-slate-200 bg-slate-50/80 px-4 py-3">
                        <p className="font-mono text-slate-800">{r.query ?? geoLabQuery}</p>
                      </div>
                    </PipelineStep>
                    <PipelineStep step={2} title="Intent">
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                        <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                          <p className="text-xs font-medium text-slate-500 uppercase">Categorie</p>
                          <p className="font-semibold text-slate-800">{intent.categorySlug ?? "—"}</p>
                        </div>
                        <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                          <p className="text-xs font-medium text-slate-500 uppercase">Vertical</p>
                          <p className="font-semibold text-slate-800">{intent.vertical ?? "—"}</p>
                        </div>
                        <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                          <p className="text-xs font-medium text-slate-500 uppercase">Navigațional</p>
                          <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${intent.isNavigational ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-600"}`}>
                            {intent.isNavigational ? "Da" : "Nu"}
                          </span>
                        </div>
                      </div>
                    </PipelineStep>
                    <PipelineStep step={3} title="Locație (tokenuri & rezolvare)">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {(loc.matchedTokens?.length ?? 0) > 0 && (
                          <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-3">
                            <p className="text-xs font-medium text-slate-500 uppercase mb-2">Tokenuri match</p>
                            <div className="flex flex-wrap gap-1">
                              {(loc.matchedTokens ?? []).map((t, i) => (
                                <span key={i} className="rounded-md bg-emerald-100 text-emerald-800 px-2 py-0.5 text-xs font-semibold">{t}</span>
                              ))}
                            </div>
                          </div>
                        )}
                        <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                          <p className="text-xs font-medium text-slate-500 uppercase mb-1">Județ / loc</p>
                          <p className="text-sm text-slate-800">{loc.countyCode ?? loc.placeNameNorm ?? "—"}</p>
                          {geoPlan.hasGeoIntent != null && (
                            <span className={`inline-flex mt-2 rounded-full px-2 py-0.5 text-xs font-semibold ${geoPlan.hasGeoIntent ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-600"}`}>
                              Geo intent: {geoPlan.hasGeoIntent ? "Da" : "Nu"}
                            </span>
                          )}
                        </div>
                      </div>
                    </PipelineStep>
                    <PipelineStep step={4} title="Plan geo (tiers)">
                      {tiers.length > 0 ? (
                        <div className="space-y-2">
                          {tiers.sort((a, b) => a.order - b.order).map((t, i) => (
                            <div key={i} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-2 shadow-sm">
                              <span className="w-6 h-6 rounded-full bg-slate-700 text-white flex items-center justify-center text-xs font-bold">{t.order + 1}</span>
                              <span className="font-medium text-slate-700">{t.label}</span>
                              <span className="text-xs text-slate-500">{t.tier}</span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-500 text-sm">Niciun tier geo pentru acest query.</div>
                      )}
                    </PipelineStep>
                  </div>
                );
              })()
            )}
          </div>
        )}

        {activeTab === "autocorrect" && (
          <div className="space-y-6">
            <div className="rounded-xl border-2 border-emerald-200 bg-white p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-slate-900 mb-1 flex items-center gap-2">
                <span className="w-2 h-5 rounded bg-emerald-500" />
                Autocorrect – calitate și utilitate
              </h2>
              <p className="text-sm text-slate-500 mb-4">
                Agregat din search_autocorrect_events. Rate de acceptare/ignorare pentru tuning.
              </p>
              <div className="flex flex-wrap gap-2 items-center">
                <label className="text-sm text-slate-600">Zile:</label>
                <select
                  value={autocorrectDays}
                  onChange={(e) => setAutocorrectDays(Number(e.target.value))}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900"
                >
                  {[7, 14, 30].map((d) => (
                    <option key={d} value={d}>{d} zile</option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => void loadAutocorrect()}
                  disabled={autocorrectLoading}
                  className="rounded-lg bg-emerald-600 hover:bg-emerald-700 px-4 py-2 text-white disabled:opacity-50 text-sm font-medium"
                >
                  {autocorrectLoading ? "Se încarcă…" : "Încarcă raport"}
                </button>
              </div>
            </div>
            {autocorrectData && (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <div className="rounded-xl border-l-4 border-emerald-500 bg-white p-4 shadow border border-slate-200">
                    <p className="text-xs font-medium text-slate-500 uppercase">Afișări (shown)</p>
                    <p className="text-2xl font-bold text-slate-900">{autocorrectData.summary.total_shown}</p>
                  </div>
                  <div className="rounded-xl border-l-4 border-emerald-500 bg-white p-4 shadow border border-slate-200">
                    <p className="text-xs font-medium text-slate-500 uppercase">Acceptate</p>
                    <p className="text-2xl font-bold text-emerald-700">{autocorrectData.summary.total_accepted}</p>
                  </div>
                  <div className="rounded-xl border-l-4 border-amber-500 bg-white p-4 shadow border border-slate-200">
                    <p className="text-xs font-medium text-slate-500 uppercase">Ignorate</p>
                    <p className="text-2xl font-bold text-amber-700">{autocorrectData.summary.total_ignored}</p>
                  </div>
                  <div className="rounded-xl border-l-4 border-slate-400 bg-white p-4 shadow border border-slate-200">
                    <p className="text-xs font-medium text-slate-500 uppercase">Reformulate</p>
                    <p className="text-2xl font-bold text-slate-700">{autocorrectData.summary.total_reformulated}</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="rounded-xl border border-slate-200 bg-white p-4">
                    <p className="text-xs font-medium text-slate-500 uppercase">Rate acceptare (global)</p>
                    <p className="text-xl font-bold text-emerald-700">
                      {autocorrectData.summary.acceptance_rate != null
                        ? `${(autocorrectData.summary.acceptance_rate * 100).toFixed(1)}%`
                        : "—"}
                    </p>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-white p-4">
                    <p className="text-xs font-medium text-slate-500 uppercase">Rate ignorare (global)</p>
                    <p className="text-xl font-bold text-amber-700">
                      {autocorrectData.summary.ignore_rate != null
                        ? `${(autocorrectData.summary.ignore_rate * 100).toFixed(1)}%`
                        : "—"}
                    </p>
                  </div>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
                  <h3 className="text-sm font-semibold text-slate-800 mb-3">Top corecții (după afișări)</h3>
                  <div className="overflow-x-auto max-h-64 overflow-y-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-100 sticky top-0">
                        <tr>
                          <th className="text-left p-2">Original</th>
                          <th className="text-left p-2">Sugerat</th>
                          <th className="text-right p-2">Shown</th>
                          <th className="text-right p-2">Accept</th>
                          <th className="text-right p-2">Ignore</th>
                          <th className="text-right p-2">Rate accept</th>
                        </tr>
                      </thead>
                      <tbody>
                        {autocorrectData.top_by_shown.slice(0, 30).map((row, i) => (
                          <tr key={i} className="border-t border-slate-100">
                            <td className="p-2 font-mono text-xs text-slate-800">{row.original_query_norm}</td>
                            <td className="p-2 font-mono text-xs text-slate-600">{row.suggested_query_norm || "—"}</td>
                            <td className="p-2 text-right">{row.shown_count}</td>
                            <td className="p-2 text-right text-emerald-700">{row.accepted_count}</td>
                            <td className="p-2 text-right text-amber-700">{row.ignored_count}</td>
                            <td className="p-2 text-right font-medium">{row.acceptance_rate != null ? `${(row.acceptance_rate * 100).toFixed(0)}%` : "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
                  <h3 className="text-sm font-semibold text-slate-800 mb-3">Corecții slabe (afișări ≥ 5, rate acceptare ≤ 20%)</h3>
                  <div className="overflow-x-auto max-h-48 overflow-y-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-amber-50 sticky top-0">
                        <tr>
                          <th className="text-left p-2">Original</th>
                          <th className="text-left p-2">Sugerat</th>
                          <th className="text-right p-2">Shown</th>
                          <th className="text-right p-2">Accept rate</th>
                        </tr>
                      </thead>
                      <tbody>
                        {autocorrectData.weak_corrections.slice(0, 25).map((row, i) => (
                          <tr key={i} className="border-t border-slate-100">
                            <td className="p-2 font-mono text-xs text-slate-800">{row.original_query_norm}</td>
                            <td className="p-2 font-mono text-xs text-slate-600">{row.suggested_query_norm || "—"}</td>
                            <td className="p-2 text-right">{row.shown_count}</td>
                            <td className="p-2 text-right text-amber-700 font-medium">{row.acceptance_rate != null ? `${(row.acceptance_rate * 100).toFixed(0)}%` : "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {autocorrectData.weak_corrections.length === 0 && (
                    <p className="text-sm text-slate-500 py-2">Nicio corecție slabă în perioada selectată.</p>
                  )}
                </div>
                <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
                  <h3 className="text-sm font-semibold text-slate-800 mb-3">Cele mai utile (rate acceptare)</h3>
                  <div className="overflow-x-auto max-h-48 overflow-y-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-emerald-50 sticky top-0">
                        <tr>
                          <th className="text-left p-2">Original</th>
                          <th className="text-left p-2">Sugerat</th>
                          <th className="text-right p-2">Shown</th>
                          <th className="text-right p-2">Accept rate</th>
                        </tr>
                      </thead>
                      <tbody>
                        {autocorrectData.top_by_acceptance_rate.slice(0, 25).map((row, i) => (
                          <tr key={i} className="border-t border-slate-100">
                            <td className="p-2 font-mono text-xs text-slate-800">{row.original_query_norm}</td>
                            <td className="p-2 font-mono text-xs text-slate-600">{row.suggested_query_norm || "—"}</td>
                            <td className="p-2 text-right">{row.shown_count}</td>
                            <td className="p-2 text-right text-emerald-700 font-medium">{row.acceptance_rate != null ? `${(row.acceptance_rate * 100).toFixed(0)}%` : "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
