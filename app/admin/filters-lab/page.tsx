"use client";

import { useEffect, useMemo, useState } from "react";
import supabase from "@/lib/supabase";
import { RO_CATEGORIES, RO_SUBCATEGORY_NAMES } from "@/lib/data/ro-categories";

type ScanMode = "rules" | "chatgpt" | "claude" | "ollama";
type ListingScope = "all" | "live-bid" | "licitatii-publice";

type ScanRow = {
  productId: string;
  slug?: string;
  announcementUrl: string;
  announcementCode: string;
  title: string;
  isLicitatiiPublice: boolean;
  currentCategory: string;
  currentSubcategory: string;
  currentListCategory: string;
  suggestedCategory: string;
  suggestedSubcategory: string;
  suggestedListCategory: string;
  confidence: number;
  engine: ScanMode;
  mismatch: boolean;
  city: string;
  inferredLocation: string;
  locationSource: "existing" | "description" | "none";
  locationConfidence: number;
};

type FilterSuggestionGroup = {
  categorySlug: string;
  categoryLabel: string;
  subcategorySlug: string;
  subcategoryLabel: string;
  suggestions: Array<{ value: string; count: number }>;
};

type NewCategoryCandidate = {
  proposedType: "category" | "subcategory";
  name: string;
  parentCategorySlug?: string;
  parentCategoryLabel?: string;
  hits: number;
  evidence: string[];
  reason: string;
};

type OptimizationIdea = {
  priority: "high" | "medium" | "low";
  title: string;
  details: string;
};

type RowQuality = "green" | "orange" | "red";
const LEGACY_SAVED_APPLIED_STORAGE_KEY = "filters_lab_saved_applied_products";
type SingleSelectionInsight = {
  productId: string;
  current: { category: string; subcategory: string };
  suggested: { category: string; subcategory: string; confidence: number; engine: string };
  analyzedFrom: { title: boolean; shortTitle: boolean; description: boolean; image: boolean };
  imageUrl: string | null;
  improvementSuggestion: string;
  needsChange: boolean;
};

function toDisplayCategory(slug: string): string {
  return RO_CATEGORIES[slug]?.name || slug || "-";
}

function toDisplaySubcategory(slug: string): string {
  return RO_SUBCATEGORY_NAMES[slug] || slug || "-";
}

async function getAuthHeader(): Promise<Record<string, string>> {
  const session = await supabase.auth.getSession();
  const token = session.data.session?.access_token;
  if (!token) throw new Error("Sesiune admin lipsă.");
  return {};
}

export default function AdminFiltersLabPage() {
  const [mode, setMode] = useState<ScanMode>("rules");
  const [listingScope, setListingScope] = useState<ListingScope>("all");
  const [batchSize, setBatchSize] = useState(60);
  const [offset, setOffset] = useState(0);
  const [onlyMismatched, setOnlyMismatched] = useState(true);
  const [isScanning, setIsScanning] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [scanLogs, setScanLogs] = useState<string[]>([]);
  const [rows, setRows] = useState<ScanRow[]>([]);
  const [selectedIds, setSelectedIds] = useState<Record<string, boolean>>({});
  const [filterSuggestions, setFilterSuggestions] = useState<FilterSuggestionGroup[]>([]);
  const [summary, setSummary] = useState<{
    mismatchedCount: number;
    matchedCount: number;
    mismatchRate: number;
    locationInferredCount?: number;
  } | null>(null);
  const [newCategoryCandidates, setNewCategoryCandidates] = useState<NewCategoryCandidate[]>([]);
  const [optimizationIdeas, setOptimizationIdeas] = useState<OptimizationIdea[]>([]);
  const [scanMessage, setScanMessage] = useState("");
  const [hasMore, setHasMore] = useState(false);
  const [sourceTotals, setSourceTotals] = useState<{ liveBid: number; licitatiiPublice: number }>({
    liveBid: 0,
    licitatiiPublice: 0,
  });
  const [qualityFilters, setQualityFilters] = useState<Record<RowQuality, boolean>>({
    green: true,
    orange: true,
    red: true,
  });
  const [singleInsight, setSingleInsight] = useState<SingleSelectionInsight | null>(null);
  const [isInsightLoading, setIsInsightLoading] = useState(false);
  const [rowReorganizeLoading, setRowReorganizeLoading] = useState<Record<string, boolean>>({});
  const [appliedSavedMap, setAppliedSavedMap] = useState<Record<string, number>>({});
  const [hideAppliedRows, setHideAppliedRows] = useState(false);
  const [applyNotice, setApplyNotice] = useState<{
    type: "success" | "error" | "info";
    title: string;
    details: string;
  } | null>(null);
  const [savedCountFromDb, setSavedCountFromDb] = useState(0);
  const [rowSearchQuery, setRowSearchQuery] = useState("");
  const [showBulkScanModal, setShowBulkScanModal] = useState(false);
  const [isBulkScanning, setIsBulkScanning] = useState(false);
  const [bulkScanRowsNeedChange, setBulkScanRowsNeedChange] = useState<ScanRow[]>([]);
  const [bulkScanRowsNoChange, setBulkScanRowsNoChange] = useState<ScanRow[]>([]);
  const [bulkScanProgress, setBulkScanProgress] = useState<{ batches: number; scanned: number }>({
    batches: 0,
    scanned: 0,
  });
  const [bulkScanSearchQuery, setBulkScanSearchQuery] = useState("");
  const [editingRows, setEditingRows] = useState<Record<string, boolean>>({});
  const [executariCrosslistEnabled, setExecutariCrosslistEnabled] = useState(true);
  const [isCrosslistLoading, setIsCrosslistLoading] = useState(false);
  const persistSavedMapToDb = async (map: Record<string, number>) => {
    try {
      const headers = await getAuthHeader();
      await fetch("/api/admin/filters-lab/state", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify({ savedMap: map }),
      });
      setSavedCountFromDb(Object.keys(map).length);
    } catch {
      // ignore write errors
    }
  };

  const loadSavedMapFromDb = async () => {
    try {
      const headers = await getAuthHeader();
      const res = await fetch("/api/admin/filters-lab/state", { headers });
      const data = await res.json();
      if (res.ok && data?.success && data?.savedMap && typeof data.savedMap === "object") {
        const dbMap = data.savedMap as Record<string, number>;
        const dbCount = Object.keys(dbMap).length;
        if (dbCount > 0) {
          setAppliedSavedMap(dbMap);
          setSavedCountFromDb(dbCount);
          return;
        }
        // One-time migration from legacy localStorage (old implementation), if DB is empty.
        if (typeof window !== "undefined") {
          try {
            const legacyRaw = localStorage.getItem(LEGACY_SAVED_APPLIED_STORAGE_KEY);
            if (legacyRaw) {
              const legacyParsed = JSON.parse(legacyRaw);
              if (legacyParsed && typeof legacyParsed === "object" && !Array.isArray(legacyParsed)) {
                const migrated: Record<string, number> = {};
                Object.entries(legacyParsed as Record<string, unknown>).forEach(([k, v]) => {
                  const id = String(k || "").trim();
                  if (!id) return;
                  const ts = Number(v || 0);
                  migrated[id] = Number.isFinite(ts) && ts > 0 ? ts : Date.now();
                });
                if (Object.keys(migrated).length > 0) {
                  setAppliedSavedMap(migrated);
                  setSavedCountFromDb(Object.keys(migrated).length);
                  await persistSavedMapToDb(migrated);
                  return;
                }
              }
            }
          } catch {
            // ignore migration errors
          }
        }
        // Keep previous in-memory map if it already has values; avoid reset to 0 from transient empty response.
        setSavedCountFromDb((prev) => (prev > 0 ? prev : 0));
      }
    } catch {
      // ignore read errors
    }
  };

  const loadExecutariCrosslistSetting = async () => {
    try {
      const headers = await getAuthHeader();
      const res = await fetch("/api/admin/ro-crosslist", { headers });
      const data = await res.json();
      if (res.ok && data?.success) {
        setExecutariCrosslistEnabled(!!data.enabled);
      }
    } catch {
      // ignore read errors
    }
  };

  const toggleExecutariCrosslist = async () => {
    const nextValue = !executariCrosslistEnabled;
    setIsCrosslistLoading(true);
    try {
      const headers = await getAuthHeader();
      const res = await fetch("/api/admin/ro-crosslist", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify({ enabled: nextValue }),
      });
      const data = await res.json();
      if (!res.ok || !data?.success) {
        throw new Error(data?.error || "Nu am putut salva setarea.");
      }
      setExecutariCrosslistEnabled(!!data.enabled);
      setApplyNotice({
        type: "success",
        title: "Setare actualizată",
        details: `Cross-list Executări în categoriile principale este acum ${data.enabled ? "ON" : "OFF"}.`,
      });
    } catch (e: unknown) {
      const details = e instanceof Error ? e.message : "Încearcă din nou.";
      setApplyNotice({
        type: "error",
        title: "Nu am putut salva setarea",
        details,
      });
    } finally {
      setIsCrosslistLoading(false);
    }
  };


  const getRowQuality = (row: ScanRow): RowQuality => {
    const hasStrongLocation = row.locationSource !== "none" || row.locationConfidence >= 0.75;
    if ((row.confidence >= 0.88 && row.mismatch && hasStrongLocation) || (!row.mismatch && row.confidence >= 0.9)) {
      return "green";
    }
    if (row.confidence >= 0.65 && !(row.mismatch && row.locationSource === "none" && row.locationConfidence < 0.4)) {
      return "orange";
    }
    return "red";
  };

  const getRowAnnouncementUrl = (row: ScanRow): string => {
    const raw = String(row.announcementUrl || "").trim();
    if (raw && !/^\/ro(?:$|\?)/i.test(raw)) return raw;
    const identifier = String(row.slug || row.productId || "").trim();
    return identifier ? `/produs/${identifier}` : "/";
  };

  const qualityUi = (quality: RowQuality) => {
    if (quality === "green") {
      return {
        label: "Excelent - salvează",
        badge: "bg-emerald-100 text-emerald-700",
        row: "bg-emerald-50/50",
      };
    }
    if (quality === "orange") {
      return {
        label: "Review necesar",
        badge: "bg-amber-100 text-amber-700",
        row: "bg-amber-50/60",
      };
    }
    return {
      label: "Modifică / completează",
      badge: "bg-red-100 text-red-700",
      row: "bg-red-50/60",
    };
  };

  const visibleRows = useMemo(() => {
    const q = rowSearchQuery.trim().toLowerCase();
    return rows.filter((row) => {
      if (!qualityFilters[getRowQuality(row)]) return false;
      if (hideAppliedRows && appliedSavedMap[row.productId]) return false;
      if (q) {
        const haystack = [
          row.announcementCode,
          row.productId,
          row.slug,
          row.title,
          row.currentCategory,
          row.currentSubcategory,
          row.currentListCategory,
          row.suggestedCategory,
          row.suggestedSubcategory,
          row.suggestedListCategory,
        ]
          .map((v) => String(v || "").toLowerCase())
          .join(" ");
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [rows, qualityFilters, hideAppliedRows, appliedSavedMap, rowSearchQuery]);

  const qualityCounts = useMemo(() => {
    return rows.reduce(
      (acc, row) => {
        const q = getRowQuality(row);
        acc[q] += 1;
        return acc;
      },
      { green: 0, orange: 0, red: 0 }
    );
  }, [rows]);

  const selectedChanges = useMemo(
    () =>
      rows
        .filter((r) => selectedIds[r.productId] && r.mismatch)
        .map((r) => ({
          productId: r.productId,
          categorySlug: r.suggestedCategory,
          subcategorySlug: r.suggestedSubcategory,
          listCategory: r.suggestedListCategory || undefined,
        })),
    [rows, selectedIds]
  );

  const filteredBulkNeedChangeRows = useMemo(() => {
    const q = bulkScanSearchQuery.trim().toLowerCase();
    if (!q) return bulkScanRowsNeedChange;
    return bulkScanRowsNeedChange.filter((row) => {
      const haystack = [
        row.announcementCode,
        row.title,
        row.slug,
        row.productId,
        row.currentCategory,
        row.currentSubcategory,
        row.currentListCategory,
        row.suggestedCategory,
        row.suggestedSubcategory,
        row.suggestedListCategory,
      ]
        .map((v) => String(v || "").toLowerCase())
        .join(" ");
      return haystack.includes(q);
    });
  }, [bulkScanRowsNeedChange, bulkScanSearchQuery]);

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const updateRowSuggestion = (productId: string, patch: Partial<Pick<ScanRow, "suggestedCategory" | "suggestedSubcategory" | "suggestedListCategory">>) => {
    setRows((prev) =>
      prev.map((row) => {
        if (row.productId !== productId) return row;
        const nextCategory = patch.suggestedCategory ?? row.suggestedCategory;
        const categoryEntry = RO_CATEGORIES[nextCategory as keyof typeof RO_CATEGORIES];
        const nextSubcategoryCandidate = patch.suggestedSubcategory ?? row.suggestedSubcategory;
        const nextSubcategory = categoryEntry?.subcategories?.includes(nextSubcategoryCandidate)
          ? nextSubcategoryCandidate
          : (categoryEntry?.subcategories?.[0] || nextSubcategoryCandidate);
        return {
          ...row,
          suggestedCategory: nextCategory,
          suggestedSubcategory: nextSubcategory,
          suggestedListCategory:
            typeof patch.suggestedListCategory === "string" ? patch.suggestedListCategory : row.suggestedListCategory,
          mismatch:
            row.currentCategory !== nextCategory ||
            row.currentSubcategory !== nextSubcategory ||
            (row.currentListCategory || "") !==
              (typeof patch.suggestedListCategory === "string" ? patch.suggestedListCategory : row.suggestedListCategory || ""),
        };
      })
    );
  };

  const selectedSingleId = useMemo(() => {
    const ids = Object.entries(selectedIds)
      .filter(([, val]) => Boolean(val))
      .map(([id]) => id);
    return ids.length === 1 ? ids[0] : null;
  }, [selectedIds]);

  useEffect(() => {
    if (!selectedSingleId) setSingleInsight(null);
  }, [selectedSingleId]);

  // Încarcă lista de produse deja salvate din Supabase (nu localStorage).
  useEffect(() => {
    loadSavedMapFromDb();
  }, []);

  useEffect(() => {
    const loadTotals = async () => {
      try {
        const headers = await getAuthHeader();
        const res = await fetch("/api/admin/filters-lab/totals", { headers });
        const data = await res.json();
        if (!res.ok || !data?.success) return;
        setSourceTotals({
          liveBid: Number(data?.totals?.liveBid || 0),
          licitatiiPublice: Number(data?.totals?.licitatiiPublice || 0),
        });
      } catch {
        // keep defaults
      }
    };
    loadTotals();
  }, []);

  useEffect(() => {
    setOffset(0);
    setRows([]);
    setSelectedIds({});
    setScanLogs([]);
    setScanMessage(
      listingScope === "all"
        ? "Scope: toate sursele. Rulează scan."
        : listingScope === "live-bid"
        ? "Scope: LIVE BID. Rulează scan."
        : "Scope: LICITAȚII PUBLICE. Rulează scan."
    );
  }, [listingScope]);

  const selectHighConfidence = () => {
    const next: Record<string, boolean> = {};
    rows.forEach((r) => {
      if (r.mismatch && r.confidence >= 0.8) next[r.productId] = true;
    });
    setSelectedIds(next);
  };

  const selectByQuality = (quality: RowQuality) => {
    const next: Record<string, boolean> = {};
    rows.forEach((r) => {
      if (r.mismatch && getRowQuality(r) === quality) next[r.productId] = true;
    });
    setSelectedIds(next);
  };

  const clearSelection = () => setSelectedIds({});

  const handleAnalyzeSingleSelection = async () => {
    if (!selectedSingleId) {
      setScanMessage("Selectează exact un produs pentru sugestie de îmbunătățire.");
      return;
    }
    setIsInsightLoading(true);
    try {
      const headers = await getAuthHeader();
      const res = await fetch("/api/admin/filters-lab/reanalyze", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify({ productId: selectedSingleId }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data?.error || "Reanalyze failed");
      }
      setSingleInsight(data as SingleSelectionInsight);
      setScanMessage("Analiză completă gata (titlu + descriere + imagine).");
    } catch (e: any) {
      setScanMessage(`Eroare analiză: ${e?.message || "unknown"}`);
    } finally {
      setIsInsightLoading(false);
    }
  };

  const handleReorganizeRow = async (productId: string) => {
    setRowReorganizeLoading((prev) => ({ ...prev, [productId]: true }));
    try {
      const headers = await getAuthHeader();
      const currentRow = rows.find((r) => r.productId === productId);
      if (!currentRow) {
        throw new Error("Produsul nu a fost găsit în lista curentă.");
      }
      // Reorganizare = promovează direct "Sugerat" în "Curent"
      const nextCategory = currentRow.suggestedCategory;
      const nextSubcategory = currentRow.suggestedSubcategory;
      const nextListCategory = currentRow.suggestedListCategory || undefined;
      const nextConfidence = Number(currentRow.confidence || 0);
      const nextEngine = (currentRow.engine || "rules") as ScanMode;

      if (!nextCategory || !nextSubcategory) {
        throw new Error("Reorganizare fără categorie/subcategorie validă.");
      }

      // Reorganizare = recalculează + aplică imediat în DB pe produsul curent
      const applyRes = await fetch("/api/admin/filters-lab/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify({
          changes: [{ productId, categorySlug: nextCategory, subcategorySlug: nextSubcategory, listCategory: nextListCategory }],
        }),
      });
      const applyData = await applyRes.json();
      if (!applyRes.ok || !applyData.success || Number(applyData.updated || 0) < 1) {
        throw new Error(applyData?.error || "Nu s-a putut salva reorganizarea în baza de date.");
      }

      const now = Date.now();
      const nextMap = { ...appliedSavedMap, [productId]: now };
      setAppliedSavedMap(nextMap);
      await persistSavedMapToDb(nextMap);

      setRows((prev) =>
        prev.map((row) => {
          if (row.productId !== productId) return row;
          return {
            ...row,
            // după reorganizare, curent devine sugerat (persistat în DB)
            currentCategory: nextCategory,
            currentSubcategory: nextSubcategory,
            currentListCategory: nextListCategory || row.currentListCategory,
            suggestedCategory: nextCategory,
            suggestedSubcategory: nextSubcategory,
            suggestedListCategory: nextListCategory || row.suggestedListCategory,
            confidence: Number(nextConfidence),
            engine: nextEngine,
            mismatch: false,
          };
        })
      );

      setScanMessage(`Reorganizare salvată în DB pentru produsul selectat.`);
      setApplyNotice({
        type: "success",
        title: "Reorganizare aplicată",
        details: `Categoria curentă a fost înlocuită cu sugeratul: ${nextCategory} / ${nextSubcategory}${nextListCategory ? ` / ${nextListCategory}` : ""}.`,
      });
    } catch (e: any) {
      setScanMessage(`Eroare reorganizare: ${e?.message || "unknown"}`);
      setApplyNotice({
        type: "error",
        title: "Reorganizare eșuată",
        details: e?.message || "Nu am putut reorganiza produsul selectat.",
      });
    } finally {
      setRowReorganizeLoading((prev) => ({ ...prev, [productId]: false }));
    }
  };

  const scanOnce = async (targetOffset = offset, append = false) => {
    const headers = await getAuthHeader();
    const res = await fetch("/api/admin/filters-lab/scan", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify({
        offset: targetOffset,
        limit: batchSize,
        mode,
        onlyMismatched,
        listingScope,
      }),
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data?.error || "Scan failed");
    }
    const nextRows = (data.rows || []) as ScanRow[];
    const nextLogs = (data.logs || []) as string[];
    setRows((prev) => (append ? [...prev, ...nextRows] : nextRows));
    setScanLogs((prev) => (append ? [...prev, ...nextLogs] : nextLogs));
    setFilterSuggestions(data.filterSuggestions || []);
    setNewCategoryCandidates(data.newCategoryCandidates || []);
    setOptimizationIdeas(data.optimizationIdeas || []);
    setSummary(data.summary || null);
    setHasMore(Boolean(data.meta?.hasMore));
    setOffset(Number(data.meta?.nextOffset ?? targetOffset + batchSize));
    if (data.totals) {
      setSourceTotals({
        liveBid: Number(data.totals.liveBid || 0),
        licitatiiPublice: Number(data.totals.licitatiiPublice || 0),
      });
    }
    setScanMessage(
      `Scan finalizat: ${data.meta?.scanned ?? nextRows.length} produse (offset ${targetOffset}) · mismatch ${data.summary?.mismatchRate ?? 0}%`
    );
  };

  const handleStartLiveScan = async () => {
    setIsScanning(true);
    setScanMessage("Scan live pornit...");
    setRows([]);
    setScanLogs([]);
    setSelectedIds({});
    setOffset(0);
    try {
      let localOffset = 0;
      for (let step = 0; step < 5; step++) {
        setScanMessage(`Scanez batch ${step + 1}/5...`);
        // eslint-disable-next-line no-await-in-loop
        await scanOnce(localOffset, step > 0);
        localOffset += batchSize;
      }
      setScanMessage("Scan live complet (primele 5 batch-uri).");
    } catch (e: any) {
      setScanMessage(`Eroare scan: ${e?.message || "unknown"}`);
    } finally {
      setIsScanning(false);
    }
  };

  const handleScanNextBatch = async () => {
    setIsScanning(true);
    setScanMessage("Scanez următorul batch...");
    try {
      await scanOnce(offset, true);
    } catch (e: any) {
      setScanMessage(`Eroare scan: ${e?.message || "unknown"}`);
    } finally {
      setIsScanning(false);
    }
  };

  const handleApplySelected = async () => {
    if (selectedChanges.length === 0) {
      setScanMessage("Nu ai selectat schimbări.");
      setApplyNotice({
        type: "info",
        title: "Nimic de salvat",
        details: "Bifează cel puțin un produs înainte de aplicare.",
      });
      return;
    }
    setIsApplying(true);
    setScanMessage("Aplic schimbările selectate...");
    try {
      const headers = await getAuthHeader();
      const res = await fetch("/api/admin/filters-lab/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify({ changes: selectedChanges }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data?.error || "Apply failed");
      }
      const failedIds = new Set<string>((data.errors || []).map((e: any) => String(e.productId || "")));
      const selectedIdsNow = selectedChanges.map((c) => c.productId);
      const savedIds = selectedIdsNow.filter((id) => id && !failedIds.has(id));

      if (savedIds.length > 0) {
        const now = Date.now();
        const nextMap = (() => {
          const updated = { ...appliedSavedMap };
          savedIds.forEach((id) => {
            updated[id] = now;
          });
          return updated;
        })();
        setAppliedSavedMap(nextMap);
        await persistSavedMapToDb(nextMap);
        setRows((prev) =>
          prev.map((row) =>
            savedIds.includes(row.productId)
              ? {
                  ...row,
                  currentCategory: row.suggestedCategory,
                  currentSubcategory: row.suggestedSubcategory,
                  currentListCategory: row.suggestedListCategory || row.currentListCategory,
                  mismatch: false,
                }
              : row
          )
        );
      }

      const attempted = selectedChanges.length;
      const updated = Number(data.updated || 0);
      const failed = Number(data.failed || 0);
      setScanMessage(`Salvate în DB: ${updated}/${attempted} · eșuate: ${failed}.`);
      setApplyNotice({
        type: failed > 0 ? "info" : "success",
        title: failed > 0 ? "Salvare parțială finalizată" : "Salvare finalizată",
        details:
          failed > 0
            ? `Au fost salvate ${updated} din ${attempted} produse. ${failed} au eșuat și trebuie revizuite. ${Array.isArray(data?.errors) && data.errors[0]?.error ? `Primul motiv: ${data.errors[0].error}` : ""}`
            : `Au fost salvate cu succes ${updated} produse în baza de date.`,
      });
      clearSelection();
    } catch (e: any) {
      setScanMessage(`Eroare apply: ${e?.message || "unknown"}`);
      setApplyNotice({
        type: "error",
        title: "Eroare la salvare",
        details: e?.message || "A apărut o eroare neașteptată la aplicarea selecției.",
      });
    } finally {
      setIsApplying(false);
    }
  };

  const runBulkFastScan = async () => {
    setIsBulkScanning(true);
    setBulkScanRowsNeedChange([]);
    setBulkScanRowsNoChange([]);
    setBulkScanProgress({ batches: 0, scanned: 0 });
    try {
      const headers = await getAuthHeader();
      let nextOffset = 0;
      const pageSize = 200;
      let hasMoreLocal = true;
      let batches = 0;
      let scanned = 0;
      const need: ScanRow[] = [];
      const ok: ScanRow[] = [];

      // Scan complet, rapid: engine selectat + batch mare.
      while (hasMoreLocal && batches < 60) {
        // eslint-disable-next-line no-await-in-loop
        const res = await fetch("/api/admin/filters-lab/scan", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...headers },
          body: JSON.stringify({
            offset: nextOffset,
            limit: pageSize,
            mode,
            onlyMismatched: false,
            listingScope,
          }),
        });
        // eslint-disable-next-line no-await-in-loop
        const data = await res.json();
        if (!res.ok || !data?.success) {
          throw new Error(data?.error || "Scan rapid eșuat");
        }

        const rowsBatch = (data.rows || []) as ScanRow[];
        rowsBatch.forEach((row) => {
          if (row.mismatch) need.push(row);
          else ok.push(row);
        });

        batches += 1;
        scanned += Number(data?.meta?.scanned || rowsBatch.length || 0);
        setBulkScanProgress({ batches, scanned });
        setBulkScanRowsNeedChange([...need]);
        setBulkScanRowsNoChange([...ok]);

        hasMoreLocal = Boolean(data?.meta?.hasMore);
        nextOffset = Number(data?.meta?.nextOffset ?? nextOffset + pageSize);
      }

      setScanMessage(
        `Scanare rapidă finalizată: ${scanned} produse · necesită schimbare ${need.length} · fără schimbare ${ok.length}.`
      );
    } catch (e: any) {
      setScanMessage(`Eroare scanare rapidă: ${e?.message || "unknown"}`);
    } finally {
      setIsBulkScanning(false);
    }
  };

  const syncSavedCountLive = async () => {
    await loadSavedMapFromDb();
  };

  useEffect(() => {
    const interval = setInterval(() => {
      syncSavedCountLive();
    }, 10000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    loadExecutariCrosslistSetting();
  }, []);

  const mismatchCount = summary?.mismatchedCount ?? rows.filter((r) => r.mismatch).length;
  const selectedCount = selectedChanges.length;
  const savedCount = savedCountFromDb || Object.keys(appliedSavedMap).length;

  return (
    <div className="p-6 space-y-6">
      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">AI Filters Control Center</h1>
            <p className="text-sm text-gray-600">
              Dashboard modern pentru scan live din titluri, recategorizare și sugestii de filtre noi.
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <div className="inline-flex items-center gap-2 rounded-xl bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              Live Scanner
            </div>
            <button
              type="button"
              onClick={() => setListingScope((prev) => (prev === "live-bid" ? "all" : "live-bid"))}
              className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition ${
                listingScope === "live-bid" ? "bg-emerald-600 text-white" : "bg-gray-100 text-gray-700"
              }`}
              title="Afișează doar produse LIVE BID"
            >
              LIVE BID {listingScope === "live-bid" ? "ON" : "OFF"} · total {sourceTotals.liveBid}
            </button>
            <button
              type="button"
              onClick={() => setListingScope((prev) => (prev === "licitatii-publice" ? "all" : "licitatii-publice"))}
              className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition ${
                listingScope === "licitatii-publice" ? "bg-amber-500 text-white" : "bg-gray-100 text-gray-700"
              }`}
              title="Afișează doar produse LICITAȚII PUBLICE"
            >
              LICITAȚII PUBLICE {listingScope === "licitatii-publice" ? "ON" : "OFF"} · total {sourceTotals.licitatiiPublice}
            </button>
            <button
              type="button"
              onClick={toggleExecutariCrosslist}
              disabled={isCrosslistLoading}
              className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 ${
                executariCrosslistEnabled ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-700"
              }`}
              title="Când este ON, anunțurile din Executări se distribuie și în categoriile principale (/ro)."
            >
              Cross-list Executări {executariCrosslistEnabled ? "ON" : "OFF"}
            </button>
          </div>
        </div>
      </div>

      {applyNotice && (
        <div
          className={`rounded-xl border px-4 py-3 ${
            applyNotice.type === "success"
              ? "border-emerald-200 bg-emerald-50"
              : applyNotice.type === "error"
              ? "border-red-200 bg-red-50"
              : "border-amber-200 bg-amber-50"
          }`}
        >
          <div className="flex items-start justify-between gap-2">
            <div>
              <p
                className={`text-sm font-semibold ${
                  applyNotice.type === "success"
                    ? "text-emerald-800"
                    : applyNotice.type === "error"
                    ? "text-red-800"
                    : "text-amber-800"
                }`}
              >
                {applyNotice.title}
              </p>
              <p
                className={`mt-1 text-xs ${
                  applyNotice.type === "success"
                    ? "text-emerald-700"
                    : applyNotice.type === "error"
                    ? "text-red-700"
                    : "text-amber-700"
                }`}
              >
                {applyNotice.details}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setApplyNotice(null)}
              className="rounded bg-white/80 px-2 py-1 text-xs text-gray-600 hover:bg-white"
            >
              Închide
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-4">
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Engine</p>
          <select
            value={mode}
            onChange={(e) => setMode(e.target.value as ScanMode)}
            className="mt-2 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
          >
            <option value="rules">Rules Engine</option>
            <option value="chatgpt">ChatGPT + Rules fallback</option>
            <option value="claude">Claude + Rules fallback</option>
            <option value="ollama">Ollama + Rules fallback</option>
          </select>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Batch size</p>
          <input
            type="number"
            min={10}
            max={200}
            value={batchSize}
            onChange={(e) => setBatchSize(Math.max(10, Math.min(200, Number(e.target.value || 60))))}
            className="mt-2 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
          />
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Mismatched</p>
          <label className="mt-3 flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={onlyMismatched}
              onChange={(e) => setOnlyMismatched(e.target.checked)}
              className="accent-orange-500"
            />
            Doar produse cu mismatch
          </label>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Status</p>
          <p className="mt-2 text-sm text-gray-700">{scanMessage || "Pregătit pentru scan."}</p>
        </div>
      </div>

      <div className="rounded-xl border border-blue-200 bg-blue-50/40 p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">Structură Licitații publice</p>
        <p className="mt-1 text-sm text-blue-900">
          Categorie principală: <b>Executări și Insolvență</b> {"->"} Subcategorie: <b>exec-*</b> {"->"} Mai multe detalii:{" "}
          <b>listing_category</b>.
        </p>
        <p className="mt-1 text-xs text-blue-700">
          La salvare, sistemul forțează automat `category=executari` pentru produsele din Licitații Publice și persistă detaliile fine în `custom_fields.listing_category`.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={handleStartLiveScan}
          disabled={isScanning}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
        >
          {isScanning ? "Se scanează..." : "Start live scan (5 batch-uri)"}
        </button>
        <button
          type="button"
          onClick={handleScanNextBatch}
          disabled={isScanning || !hasMore}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
        >
          Scan next batch
        </button>
        <button
          type="button"
          onClick={selectHighConfidence}
          className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-600"
        >
          Selectează confidence ≥ 0.8
        </button>
        <button
          type="button"
          onClick={clearSelection}
          className="rounded-lg bg-gray-700 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-800"
        >
          Clear selecție
        </button>
        <button
          type="button"
          onClick={() => selectByQuality("green")}
          className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
        >
          Selectează verzi
        </button>
        <button
          type="button"
          onClick={() => selectByQuality("orange")}
          className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-600"
        >
          Selectează portocalii
        </button>
        <button
          type="button"
          onClick={() => selectByQuality("red")}
          className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700"
        >
          Selectează roșii
        </button>
        <button
          type="button"
          onClick={handleApplySelected}
          disabled={isApplying || selectedCount === 0}
          className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
        >
          {isApplying ? "Aplic..." : `Aplică selecția (${selectedCount})`}
        </button>
        <button
          type="button"
          onClick={() => setShowBulkScanModal(true)}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
        >
          Scanare rapidă toate produsele
        </button>
        <button
          type="button"
          onClick={handleAnalyzeSingleSelection}
          disabled={isInsightLoading || !selectedSingleId}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
        >
          {isInsightLoading ? "Analizez..." : "Analizează complet selecția (1)"}
        </button>
      </div>

      {showBulkScanModal && (
        <div className="fixed inset-0 z-[1100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => !isBulkScanning && setShowBulkScanModal(false)} />
          <div className="relative z-10 w-full max-w-5xl rounded-2xl border border-gray-200 bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Scanare rapidă globală</h3>
                <p className="text-xs text-gray-600">
                  Scope: {listingScope === "all" ? "toate sursele" : listingScope} · engine rapid: {mode}
                </p>
              </div>
              <button
                type="button"
                onClick={() => !isBulkScanning && setShowBulkScanModal(false)}
                className="rounded-lg bg-gray-100 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-200 disabled:opacity-50"
                disabled={isBulkScanning}
              >
                Închide
              </button>
            </div>
            <div className="space-y-4 p-5">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={runBulkFastScan}
                  disabled={isBulkScanning}
                  className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
                >
                  {isBulkScanning ? "Scanez..." : "Start scanare rapidă"}
                </button>
                <span className="text-xs text-gray-600">
                  batch-uri: {bulkScanProgress.batches} · produse scanate: {bulkScanProgress.scanned}
                </span>
                <input
                  type="text"
                  value={bulkScanSearchQuery}
                  onChange={(e) => setBulkScanSearchQuery(e.target.value)}
                  placeholder="Caută produs anume (cod, titlu, slug)..."
                  className="ml-auto w-80 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-200"
                />
              </div>

              <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">Necesită schimbare</p>
                  <p className="mt-1 text-2xl font-bold text-amber-800">{bulkScanRowsNeedChange.length}</p>
                  {bulkScanSearchQuery.trim() ? (
                    <p className="mt-1 text-xs text-amber-700">Afișate după căutare: {filteredBulkNeedChangeRows.length}</p>
                  ) : null}
                </div>
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Nu necesită schimbare</p>
                  <p className="mt-1 text-2xl font-bold text-emerald-800">{bulkScanRowsNoChange.length}</p>
                </div>
              </div>

              <div className="rounded-xl border border-gray-200">
                <div className="border-b border-gray-200 px-4 py-2">
                  <p className="text-sm font-semibold text-gray-900">Produse care necesită schimbare</p>
                </div>
                <div className="max-h-[45vh] overflow-auto">
                  <table className="min-w-full text-sm">
                    <thead className="sticky top-0 bg-gray-50">
                      <tr className="text-left text-xs uppercase tracking-wide text-gray-500">
                        <th className="px-3 py-2">Cod anunț</th>
                        <th className="px-3 py-2">Titlu</th>
                        <th className="px-3 py-2">Curent</th>
                        <th className="px-3 py-2">Recomandat</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredBulkNeedChangeRows.slice(0, 600).map((row) => (
                        <tr key={`bulk-${row.productId}`} className="border-t border-gray-100">
                          <td className="px-3 py-2 text-xs font-semibold text-gray-800">{row.announcementCode || "—"}</td>
                          <td className="px-3 py-2 text-gray-800">
                            <a
                              href={getRowAnnouncementUrl(row)}
                              target="_blank"
                              rel="noreferrer"
                              className="underline decoration-dotted underline-offset-2 hover:text-blue-700"
                            >
                              {row.title}
                            </a>
                          </td>
                          <td className="px-3 py-2 text-xs text-gray-700">
                            {toDisplayCategory(row.currentCategory)} / {toDisplaySubcategory(row.currentSubcategory)} / {row.currentListCategory || "-"}
                          </td>
                          <td className="px-3 py-2 text-xs font-semibold text-emerald-700">
                            {toDisplayCategory(row.suggestedCategory)} / {toDisplaySubcategory(row.suggestedSubcategory)} / {row.suggestedListCategory || "-"}
                          </td>
                        </tr>
                      ))}
                      {filteredBulkNeedChangeRows.length === 0 && !isBulkScanning && (
                        <tr>
                          <td colSpan={4} className="px-3 py-8 text-center text-sm text-gray-500">
                            Nu există produse marcate pentru schimbare în scanarea curentă.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {selectedSingleId && singleInsight && (
        <div className="rounded-xl border border-blue-200 bg-blue-50/40 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="text-base font-semibold text-blue-900">Sugestie îmbunătățire (selecție unică)</h3>
              <p className="text-xs text-blue-700">
                Analiză pe titlu + titlu scurt + descriere + imagine ({singleInsight.suggested.engine})
              </p>
            </div>
            <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-semibold text-blue-800">
              confidence {Math.round((singleInsight.suggested.confidence || 0) * 100)}%
            </span>
          </div>
          <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-3">
            <div className="rounded-lg border border-blue-100 bg-white p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Curent</p>
              <p className="mt-1 text-sm text-gray-800">
                {singleInsight.current.category || "-"} / {singleInsight.current.subcategory || "-"}
              </p>
            </div>
            <div className="rounded-lg border border-blue-100 bg-white p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Sugerat</p>
              <p className="mt-1 text-sm font-semibold text-gray-900">
                {singleInsight.suggested.category || "-"} / {singleInsight.suggested.subcategory || "-"}
              </p>
            </div>
            <div className="rounded-lg border border-blue-100 bg-white p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Surse folosite</p>
              <p className="mt-1 text-xs text-gray-700">
                titlu: {singleInsight.analyzedFrom.title ? "da" : "nu"} · titlu scurt: {singleInsight.analyzedFrom.shortTitle ? "da" : "nu"} ·
                descriere: {singleInsight.analyzedFrom.description ? "da" : "nu"} · imagine: {singleInsight.analyzedFrom.image ? "da" : "nu"}
              </p>
            </div>
          </div>
          <div className="mt-3 rounded-lg border border-blue-100 bg-white p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Sugestie de îmbunătățire</p>
            <p className="mt-1 text-sm text-gray-800">{singleInsight.improvementSuggestion}</p>
            {singleInsight.imageUrl && (
              <a
                href={singleInsight.imageUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-2 inline-block text-xs font-medium text-blue-700 underline"
              >
                Vezi imaginea analizată
              </a>
            )}
          </div>
        </div>
      )}

      <div className="rounded-xl border border-gray-200 bg-white p-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">Filtru status</span>
          {(
            [
              { key: "green", label: `Verde (${qualityCounts.green})`, active: qualityFilters.green, cls: "bg-emerald-100 text-emerald-800" },
              { key: "orange", label: `Portocaliu (${qualityCounts.orange})`, active: qualityFilters.orange, cls: "bg-amber-100 text-amber-800" },
              { key: "red", label: `Roșu (${qualityCounts.red})`, active: qualityFilters.red, cls: "bg-red-100 text-red-800" },
            ] as const
          ).map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() =>
                setQualityFilters((prev) => ({
                  ...prev,
                  [item.key]: !prev[item.key],
                }))
              }
              className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                item.active ? item.cls : "bg-gray-100 text-gray-500"
              }`}
            >
              {item.label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setQualityFilters({ green: true, orange: true, red: true })}
            className="ml-auto rounded-full bg-blue-100 px-3 py-1 text-xs font-semibold text-blue-700"
          >
            Reset filtre status
          </button>
          <label className="flex items-center gap-2 rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-700">
            <input
              type="checkbox"
              checked={hideAppliedRows}
              onChange={(e) => setHideAppliedRows(e.target.checked)}
              className="accent-emerald-600"
            />
            Ascunde deja salvate ({savedCount})
          </label>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Produse analizate</p>
          <p className="mt-1 text-2xl font-bold text-gray-900">{rows.length}</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Mismatch</p>
          <p className="mt-1 text-2xl font-bold text-red-600">{mismatchCount}</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Rată mismatch</p>
          <p className="mt-1 text-2xl font-bold text-blue-600">{summary?.mismatchRate ?? 0}%</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Locație extrasă din descriere</p>
          <p className="mt-1 text-2xl font-bold text-emerald-600">{summary?.locationInferredCount ?? 0}</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Salvate în DB</p>
          <p className="mt-1 text-2xl font-bold text-emerald-700">{savedCount}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="xl:col-span-2 rounded-xl border border-gray-200 bg-white p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-gray-900">Recategorizare recomandată</h2>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={rowSearchQuery}
                onChange={(e) => setRowSearchQuery(e.target.value)}
                placeholder="Caută după cod, titlu, slug..."
                className="w-72 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-200"
              />
              {rowSearchQuery.trim() ? (
                <button
                  type="button"
                  onClick={() => setRowSearchQuery("")}
                  className="rounded-lg bg-gray-100 px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-200"
                >
                  Reset
                </button>
              ) : null}
              <p className="text-xs text-gray-500">Bifat = va fi aplicat în DB</p>
            </div>
          </div>
          <div className="max-h-[520px] overflow-auto rounded-lg border border-gray-100">
            <table className="min-w-full text-sm">
              <thead className="sticky top-0 bg-gray-50">
                <tr className="text-left text-xs uppercase tracking-wide text-gray-500">
                  <th className="px-3 py-2">Apply</th>
                  <th className="px-3 py-2">Cod anunț</th>
                  <th className="px-3 py-2">Titlu</th>
                  <th className="px-3 py-2">Executări și Insolvență</th>
                  <th className="px-3 py-2">Subcategorie</th>
                  <th className="px-3 py-2">Mai multe detalii</th>
                  <th className="px-3 py-2">Edit</th>
                  <th className="px-3 py-2">Status DB</th>
                  <th className="px-3 py-2">Reorganizare</th>
                  <th className="px-3 py-2">Locație detectată</th>
                  <th className="px-3 py-2">Engine</th>
                  <th className="px-3 py-2">Conf.</th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((row) => {
                  const quality = getRowQuality(row);
                  const qualityMeta = qualityUi(quality);
                  const isEditing = Boolean(editingRows[row.productId]);
                  const categoryOptions = Object.keys(RO_CATEGORIES).filter((k) => k !== "all");
                  const subcategoryOptions = RO_CATEGORIES[row.suggestedCategory as keyof typeof RO_CATEGORIES]?.subcategories || [];
                  return (
                  <tr key={row.productId} className={`border-t ${qualityMeta.row}`}>
                    <td className="px-3 py-2 align-top">
                      <input
                        type="checkbox"
                        checked={Boolean(selectedIds[row.productId])}
                        onChange={() => toggleSelect(row.productId)}
                        className="accent-orange-500"
                      />
                    </td>
                    <td className="px-3 py-2 align-top text-xs text-gray-700">
                      <div className="font-semibold text-gray-900">{row.announcementCode || "—"}</div>
                    </td>
                    <td className="px-3 py-2 align-top text-gray-900">
                      <a
                        href={getRowAnnouncementUrl(row)}
                        target="_blank"
                        rel="noreferrer"
                        className="text-left font-medium underline decoration-dotted underline-offset-2 hover:text-blue-700"
                        title="Deschide anunțul"
                      >
                        {row.title}
                      </a>
                    </td>
                    <td className="px-3 py-2 align-top text-gray-700">
                      {isEditing && !row.isLicitatiiPublice ? (
                        <select
                          value={row.suggestedCategory}
                          onChange={(e) => updateRowSuggestion(row.productId, { suggestedCategory: e.target.value })}
                          className="w-full rounded-lg border border-gray-300 bg-white px-2 py-1 text-xs"
                        >
                          {categoryOptions.map((cat) => (
                            <option key={`${row.productId}-cat-${cat}`} value={cat}>
                              {toDisplayCategory(cat)}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <div className="text-xs">
                          <div>
                            curent:{" "}
                            <span className="font-semibold text-gray-900">
                              {row.isLicitatiiPublice ? "Executări și Insolvență" : toDisplayCategory(row.currentCategory)}
                            </span>
                          </div>
                          <div className="mt-0.5 text-emerald-700">
                            recomandat:{" "}
                            <span className="font-semibold">
                              {row.isLicitatiiPublice ? "Executări și Insolvență" : toDisplayCategory(row.suggestedCategory)}
                            </span>
                          </div>
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2 align-top text-gray-700">
                      {isEditing ? (
                        <select
                          value={row.suggestedSubcategory}
                          onChange={(e) => updateRowSuggestion(row.productId, { suggestedSubcategory: e.target.value })}
                          className="w-full rounded-lg border border-gray-300 bg-white px-2 py-1 text-xs"
                        >
                          {subcategoryOptions.map((sub) => (
                            <option key={`${row.productId}-sub-${sub}`} value={sub}>
                              {toDisplaySubcategory(sub)}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <div className="text-xs">
                          <div>
                            curent:{" "}
                            <span className="font-semibold text-gray-900">{toDisplaySubcategory(row.currentSubcategory)}</span>
                          </div>
                          <div className="mt-0.5 text-emerald-700">
                            recomandat:{" "}
                            <span className="font-semibold">{toDisplaySubcategory(row.suggestedSubcategory)}</span>
                          </div>
                        </div>
                      )}
                      <div className="mt-1">
                        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${qualityMeta.badge}`}>
                          {qualityMeta.label}
                        </span>
                      </div>
                    </td>
                    <td className="px-3 py-2 align-top text-gray-700">
                      {isEditing ? (
                        <input
                          type="text"
                          value={row.suggestedListCategory || ""}
                          onChange={(e) => updateRowSuggestion(row.productId, { suggestedListCategory: e.target.value })}
                          placeholder="Mai multe detalii..."
                          className="w-full rounded-lg border border-gray-300 bg-white px-2 py-1 text-xs"
                        />
                      ) : (
                        <div className="text-xs">
                          <div>
                            curent:{" "}
                            <span className="font-semibold text-gray-900">{row.currentListCategory || "-"}</span>
                          </div>
                          <div className="mt-0.5 text-emerald-700">
                            recomandat:{" "}
                            <span className="font-semibold">{row.suggestedListCategory || "-"}</span>
                          </div>
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2 align-top">
                      <button
                        type="button"
                        onClick={() => setEditingRows((prev) => ({ ...prev, [row.productId]: !prev[row.productId] }))}
                        className={`rounded-lg px-3 py-1.5 text-xs font-semibold text-white ${
                          isEditing ? "bg-emerald-600 hover:bg-emerald-700" : "bg-slate-600 hover:bg-slate-700"
                        }`}
                      >
                        {isEditing ? "Save edit" : "Edit"}
                      </button>
                    </td>
                    <td className="px-3 py-2 align-top">
                      {appliedSavedMap[row.productId] ? (
                        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                          Salvat în DB
                        </span>
                      ) : (
                        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-600">
                          Nesalvat
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 align-top">
                      <button
                        type="button"
                        onClick={() => handleReorganizeRow(row.productId)}
                        disabled={Boolean(rowReorganizeLoading[row.productId])}
                        className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
                      >
                        {rowReorganizeLoading[row.productId] ? "Analizez..." : "Reorganizare"}
                      </button>
                    </td>
                    <td className="px-3 py-2 align-top text-gray-700">
                      {row.inferredLocation || "-"}
                      <div className="mt-0.5 text-xs text-gray-500">
                        {row.locationSource} · {Math.round((row.locationConfidence || 0) * 100)}%
                      </div>
                    </td>
                    <td className="px-3 py-2 align-top">
                      <span className="rounded bg-blue-100 px-2 py-0.5 text-xs font-semibold text-blue-700">{row.engine}</span>
                    </td>
                    <td className="px-3 py-2 align-top">{Math.round(row.confidence * 100)}%</td>
                  </tr>
                )})}
                {visibleRows.length === 0 && (
                  <tr>
                    <td colSpan={12} className="px-3 py-8 text-center text-sm text-gray-500">
                      Nu există rezultate pentru filtrele de status selectate.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <h2 className="text-lg font-semibold text-gray-900">Live scan log</h2>
            <div className="mt-3 h-[220px] overflow-auto rounded-lg bg-gray-950 p-3 font-mono text-xs text-green-300">
              {scanLogs.length === 0 ? (
                <p className="text-gray-400">No logs yet...</p>
              ) : (
                scanLogs.slice(-140).map((line, idx) => <div key={`${idx}-${line.slice(0, 30)}`}>{line}</div>)
              )}
            </div>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <h2 className="text-lg font-semibold text-gray-900">Sugestii filtre noi (din titluri)</h2>
            <div className="mt-3 max-h-[280px] space-y-3 overflow-auto">
              {filterSuggestions.slice(0, 10).map((group) => (
                <div key={`${group.categorySlug}-${group.subcategorySlug}`} className="rounded-lg border border-gray-100 p-3">
                  <p className="text-sm font-semibold text-gray-900">
                    {group.categoryLabel} / {group.subcategoryLabel}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {group.suggestions.slice(0, 8).map((s) => (
                      <span key={s.value} className="rounded-full bg-orange-100 px-2 py-0.5 text-xs font-medium text-orange-800">
                        {s.value} ({s.count})
                      </span>
                    ))}
                  </div>
                </div>
              ))}
              {filterSuggestions.length === 0 && <p className="text-sm text-gray-500">Rulează scan-ul pentru sugestii.</p>}
            </div>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <h2 className="text-lg font-semibold text-gray-900">Propuneri categorii/subcategorii noi</h2>
            <div className="mt-3 max-h-[260px] space-y-3 overflow-auto">
              {newCategoryCandidates.slice(0, 10).map((c, idx) => (
                <div key={`${c.name}-${idx}`} className="rounded-lg border border-gray-100 p-3">
                  <p className="text-sm font-semibold text-gray-900">
                    {c.proposedType === "category" ? "Categorie nouă" : "Subcategorie nouă"}: {c.name}
                  </p>
                  {c.parentCategoryLabel && (
                    <p className="text-xs text-gray-600">Parent: {c.parentCategoryLabel}</p>
                  )}
                  <p className="mt-1 text-xs text-gray-500">{c.reason}</p>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {c.evidence.slice(0, 5).map((ev) => (
                      <span key={ev} className="rounded-full bg-blue-100 px-2 py-0.5 text-xs text-blue-700">
                        {ev}
                      </span>
                    ))}
                    <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-700">hits {c.hits}</span>
                  </div>
                </div>
              ))}
              {newCategoryCandidates.length === 0 && (
                <p className="text-sm text-gray-500">Nu sunt propuneri noi în batch-ul curent.</p>
              )}
            </div>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <h2 className="text-lg font-semibold text-gray-900">Idei automate de optimizare</h2>
            <div className="mt-3 space-y-2">
              {optimizationIdeas.map((idea, idx) => (
                <div key={`${idea.title}-${idx}`} className="rounded-lg border border-gray-100 p-3">
                  <div className="flex items-center gap-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                        idea.priority === "high"
                          ? "bg-red-100 text-red-700"
                          : idea.priority === "medium"
                          ? "bg-amber-100 text-amber-700"
                          : "bg-gray-100 text-gray-700"
                      }`}
                    >
                      {idea.priority}
                    </span>
                    <p className="text-sm font-semibold text-gray-900">{idea.title}</p>
                  </div>
                  <p className="mt-1 text-xs text-gray-600">{idea.details}</p>
                </div>
              ))}
              {optimizationIdeas.length === 0 && <p className="text-sm text-gray-500">Rulează scan-ul pentru recomandări.</p>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
