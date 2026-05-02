"use client";

import React, { useState, useCallback, useEffect, useRef } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import supabase from "@/lib/supabase";
import type { RoFilterSchema } from "@/lib/filters";
import { TIP_TEREN_LABELS, EXEC_MAI_MULTE_DETALII_OPTIONS } from "@/lib/filters";
import { ROMANIAN_CITIES } from "@/lib/data/romanian-cities";
import WheelPagination, { WheelPaginationFooter } from "@/components/ui/wheel-pagination";

const PAGE_SIZE_OPTIONS = [50, 100, 250, 500, 1000] as const;
const PAGE_SIZE_ALL = "all";
const CUSTOM_CITY_VALUE = "__custom__";

/** Formatează updated_at ca timp relativ: "acum 2 minute", "acum 3 ore", "acum 1 zi" etc. */
function formatUpdatedAtRel(updatedAt: string | undefined): string {
  if (!updatedAt) return "—";
  const date = new Date(updatedAt);
  if (Number.isNaN(date.getTime())) return "—";
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffH = Math.floor(diffMin / 60);
  const diffDays = Math.floor(diffH / 24);
  if (diffSec < 60) return "acum o clipă";
  if (diffMin < 60) return `acum ${diffMin} ${diffMin === 1 ? "minut" : "minute"}`;
  if (diffH < 24) return `acum ${diffH} ${diffH === 1 ? "oră" : "ore"}`;
  if (diffDays === 1) return "ieri";
  if (diffDays < 7) return `acum ${diffDays} ${diffDays === 1 ? "zi" : "zile"}`;
  return date.toLocaleString("ro-RO", { dateStyle: "short", timeStyle: "short" });
}

type FilterMeta = RoFilterSchema;

type ListingRow = {
  id: string;
  title?: string;
  images?: unknown;
  category?: string;
  subcategory?: string;
  category_level_3?: string;
  category_level_4?: string;
  product_type?: string;
  sale_type?: string;
  status?: string;
  channel?: string;
  updated_at?: string;
  /** Când a fost reactualizată categoria (din admin_recategorization_audit). */
  recategorized_at?: string | null;
  custom_fields?: unknown;
  county?: string;
  city?: string;
  starting_price_ron?: number;
};

export default function RecategorizareTable({ filterMeta: filterMetaProp }: { filterMeta?: FilterMeta | null }) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const pageSizeParam = searchParams?.get("pageSize") || "50";
  const currentPage = Math.max(1, parseInt(searchParams?.get("page") || "1", 10) || 1);
  const [items, setItems] = useState<ListingRow[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [totalCount, setTotalCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [drawerId, setDrawerId] = useState<string | null>(null);
  const [bulkApplying, setBulkApplying] = useState(false);
  const [bulkCategory, setBulkCategory] = useState<string>("");
  const [bulkSubcategory, setBulkSubcategory] = useState<string>("");
  const [bulkLevel3, setBulkLevel3] = useState<string>("");
  const [bulkListCategory, setBulkListCategory] = useState<string>("");
  const [bulkBrand, setBulkBrand] = useState<string>("");
  const [bulkModel, setBulkModel] = useState<string>("");
  const [bulkSize, setBulkSize] = useState<string>("");
  const [bulkColor, setBulkColor] = useState<string>("");
  const [bulkCondition, setBulkCondition] = useState<string>("");
  const [bulkAttributes, setBulkAttributes] = useState<Record<string, string>>({});
  const [bulkShowMore, setBulkShowMore] = useState(false);
  const [drawerSaving, setDrawerSaving] = useState(false);
  const [drawerDeleting, setDrawerDeleting] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [drawerCategory, setDrawerCategory] = useState<string>("");
  const [drawerSubcategory, setDrawerSubcategory] = useState<string>("");
  const [drawerLevel3, setDrawerLevel3] = useState<string>("");
  const [drawerListCategory, setDrawerListCategory] = useState<string>("");
  const [drawerCounty, setDrawerCounty] = useState<string>("");
  const [drawerCity, setDrawerCity] = useState<string>("");
  const [bulkCounty, setBulkCounty] = useState<string>("");
  const [bulkCity, setBulkCity] = useState<string>("");
  const [bulkCustomCityMode, setBulkCustomCityMode] = useState(false);
  const [drawerCustomCityMode, setDrawerCustomCityMode] = useState(false);
  /** Progress modal for bulk (streaming) */
  const [bulkProgressOpen, setBulkProgressOpen] = useState(false);
  const [bulkProgressTotal, setBulkProgressTotal] = useState(0);
  const [bulkProgressApplied, setBulkProgressApplied] = useState(0);
  const [bulkProgressFailed, setBulkProgressFailed] = useState(0);
  const [bulkProgressLog, setBulkProgressLog] = useState<{ index: number; total: number; id: string; title: string; ok: boolean; error?: string }[]>([]);
  const [bulkProgressError, setBulkProgressError] = useState<string | null>(null);
  const [bulkProgressDone, setBulkProgressDone] = useState(false);
  const bulkProgressLogEndRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (bulkProgressOpen && bulkProgressLog.length) {
      bulkProgressLogEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    }
  }, [bulkProgressOpen, bulkProgressLog.length]);
  /** Single source: filter meta comes only from page (canonical lib/filters). */
  const filterMeta = filterMetaProp;
  const categories = filterMeta?.categories ?? [];
  const catEntry = categories.find((c) => c.slug === bulkCategory);
  const subcategories = catEntry?.subcategories ?? [];
  const subcategoryNames = filterMeta?.subcategoryNames ?? {};
  const level3BySubcategory = filterMeta?.level3BySubcategory ?? {};
  const level3Options = bulkSubcategory ? (level3BySubcategory[bulkSubcategory] ?? []) : [];
  const needsLevel3 = level3Options.length > 0;
  const needsMaiMulteDetalii = bulkCategory === "executari" && bulkSubcategory === "exec-imobiliare";
  /** "Tip teren" doar pentru terenuri / exec-imobiliare; pentru piese-auto, autoturisme etc. folosim "Tip (level 3)". */
  const isTipTerenContext = bulkSubcategory === "terenuri" || bulkSubcategory === "exec-imobiliare";
  const level3Label = isTipTerenContext ? "Tip teren" : "Tip (level 3)";
  const level3Placeholder = isTipTerenContext ? "— Tip teren —" : "— Tip —";
  /** Level3 mereu opțional: Salvează / bulk se activează cu categorie + subcategorie; level3 doar dacă vrei. */
  const level3OptionLabel = (slug: string) => TIP_TEREN_LABELS[slug] ?? subcategoryNames[slug] ?? slug;
  /** Etichete pentru afișare în tabel: Categorie / Subcategorie / Level3 (ca înainte). */
  const rowCategoryLabel = (row: ListingRow) => categories.find((c) => c.slug === row.category)?.name ?? row.category ?? "—";
  const rowSubcategoryLabel = (row: ListingRow) => (row.subcategory ? (subcategoryNames[row.subcategory] ?? row.subcategory) : "—");
  const rowLevel3Label = (row: ListingRow) => (row.category_level_3 ? level3OptionLabel(row.category_level_3) : "");
  const attributeOptions = filterMeta?.attributeOptions ?? {};
  const ATTRIBUTE_LABELS: Record<string, string> = {
    fuel: "Combustibil",
    bodyType: "Tip caroserie",
    partType: "Tip piesă",
    department: "Departament",
    apparelType: "Tip îmbrăcăminte",
    footwearType: "Tip încălțăminte",
    accessoryType: "Tip accesoriu",
  };
  const PRODUCT_FIELD_LABELS: Record<string, string> = {
    brand: "Marca",
    model: "Model",
    size: "Mărime",
    color: "Culoare",
    condition: "Stare",
    county: "Județ",
    city: "Oraș",
  };
  const fieldsBySub = filterMeta?.fieldsBySubcategory ?? {};
  const visibleForSub = bulkSubcategory ? fieldsBySub[bulkSubcategory] : null;
  const visibleProductFields = [...(visibleForSub?.productFields ?? ["brand", "model", "size", "color", "condition"]), "county", "city"];
  const visibleAttributeKeys = visibleForSub?.attributeKeys ?? Object.keys(attributeOptions);

  const drawerRow = drawerId ? items.find((r) => r.id === drawerId) : null;
  const drawerCatEntry = categories.find((c) => c.slug === drawerCategory);
  const drawerSubcategories = drawerCatEntry?.subcategories ?? [];
  const drawerLevel3Options = drawerSubcategory ? (level3BySubcategory[drawerSubcategory] ?? []) : [];
  const drawerNeedsLevel3 = drawerLevel3Options.length > 0;
  const drawerNeedsMaiMulteDetalii = drawerCategory === "executari" && drawerSubcategory === "exec-imobiliare";
  const drawerIsTipTeren = drawerSubcategory === "terenuri" || drawerSubcategory === "exec-imobiliare";
  const drawerLevel3Label = drawerIsTipTeren ? "Tip teren" : "Tip (level 3)";

  const openDrawer = useCallback((id: string) => {
    const row = items.find((r) => r.id === id);
    const cf = row?.custom_fields as Record<string, unknown> | undefined;
    setDrawerId(id);
    setDrawerCategory(row?.category?.trim() ?? "");
    setDrawerSubcategory(row?.subcategory?.trim() ?? "");
    setDrawerLevel3(row?.category_level_3?.trim() ?? "");
    setDrawerListCategory((cf?.listing_category as string)?.trim() ?? "");
    setDrawerCounty(row?.county?.trim() ?? "");
    const cityVal = row?.city?.trim() ?? "";
    setDrawerCity(cityVal);
    setDrawerCustomCityMode(!!(cityVal && !ROMANIAN_CITIES.includes(cityVal)));
  }, [items]);
  const closeDrawer = useCallback(() => {
    setDrawerId(null);
    setDrawerSaving(false);
    setDrawerDeleting(false);
  }, []);

  const callPermanentDelete = useCallback(async (productIds: string[]) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) {
      alert("Nu ești autentificat.");
      return { ok: false };
    }
    const res = await fetch("/api/admin/products/permanent-delete", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ productIds }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      alert(data.error ?? "Eroare la ștergere");
      return { ok: false };
    }
    return { ok: true, deletedCount: data.deletedCount ?? 0 };
  }, []);

  const handleDrawerDelete = useCallback(async () => {
    if (!drawerId || !window.confirm("Ștergi permanent acest produs? Această acțiune nu poate fi anulată.")) return;
    setDrawerDeleting(true);
    try {
      const result = await callPermanentDelete([drawerId]);
      if (result.ok) {
        closeDrawer();
        setSelected((prev) => {
          const next = new Set(prev);
          next.delete(drawerId);
          return next;
        });
        setItems((prev) => prev.filter((r) => r.id !== drawerId));
        if (totalCount != null) setTotalCount((c) => Math.max(0, (c ?? 0) - 1));
      }
    } finally {
      setDrawerDeleting(false);
    }
  }, [drawerId, closeDrawer, callPermanentDelete, totalCount]);

  const handleBulkDelete = useCallback(async () => {
    if (selected.size === 0 || !window.confirm(`Ștergi permanent ${selected.size} produs(e) selectate? Această acțiune nu poate fi anulată.`)) return;
    const ids = Array.from(selected);
    setBulkDeleting(true);
    try {
      const result = await callPermanentDelete(ids);
      if (result.ok) {
        setSelected(new Set());
        setItems((prev) => prev.filter((r) => !ids.includes(r.id)));
        if (totalCount != null) setTotalCount((c) => Math.max(0, (c ?? 0) - (result.deletedCount ?? ids.length)));
        fetchListings();
      }
    } finally {
      setBulkDeleting(false);
    }
  }, [selected, callPermanentDelete, totalCount]);

  const handleDrawerSave = useCallback(async () => {
    if (!drawerId || !drawerCategory.trim() || !drawerSubcategory.trim()) return;
    setDrawerSaving(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        alert("Nu ești autentificat.");
        return;
      }
      const res = await fetch("/api/admin/recategorizare/update", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          productId: drawerId,
          category: drawerCategory.trim(),
          subcategory: drawerSubcategory.trim(),
          level3: drawerLevel3.trim() || null,
          listCategory: drawerNeedsMaiMulteDetalii ? (drawerListCategory.trim() || null) : undefined,
          county: drawerCounty.trim() || null,
          city: drawerCity.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        alert(data.error ?? "Eroare la salvare");
        return;
      }
      const nowIso = new Date().toISOString();
      setItems((prev) =>
        prev.map((r) => {
          if (r.id !== drawerId) return r;
          const next: typeof r = {
            ...r,
            category: drawerCategory.trim(),
            subcategory: drawerSubcategory.trim(),
            category_level_3: drawerLevel3.trim() || undefined,
            county: drawerCounty.trim() || undefined,
            city: drawerCity.trim() || undefined,
            recategorized_at: nowIso,
          };
          if (drawerNeedsMaiMulteDetalii && (drawerListCategory.trim() || "")) {
            next.custom_fields = { ...(r.custom_fields as Record<string, unknown>), listing_category: drawerListCategory.trim() };
          }
          return next;
        })
      );
      closeDrawer();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Eroare la salvare");
    } finally {
      setDrawerSaving(false);
    }
  }, [drawerId, drawerCategory, drawerSubcategory, drawerLevel3, drawerNeedsMaiMulteDetalii, drawerListCategory, drawerCounty, drawerCity, closeDrawer]);

  const fetchListings = useCallback(
    async () => {
      setLoading(true);
      setError(null);
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.access_token) {
          setError("Nu ești autentificat.");
          return;
        }
        const params = new URLSearchParams(searchParams?.toString() ?? "");
        params.set("page", String(currentPage));
        params.set("pageSize", pageSizeParam);
        params.delete("cursor");
        if (currentPage === 1) params.set("count", "1");
        if (searchParams?.get("neverRecategorized") === "1") params.set("neverRecategorized", "1");
        const res = await fetch(`/api/admin/recategorizare/listings?${params.toString()}`, {
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setError(data.error ?? `Eroare ${res.status}`);
          setItems([]);
          return;
        }
        setItems(data.items ?? []);
        setHasMore(data.hasMore ?? false);
        setTotalCount(data.totalCount ?? null);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Eroare la încărcare");
        setItems([]);
        setTotalCount(null);
      } finally {
        setLoading(false);
      }
    },
    [searchParams, pageSizeParam, currentPage]
  );

  useEffect(() => {
    fetchListings();
  }, [fetchListings]);

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selected.size >= items.length) setSelected(new Set());
    else setSelected(new Set(items.map((r) => r.id)));
  };

  const goToPage = (p: number) => {
    if (p < 1 || loading) return;
    const params = new URLSearchParams(searchParams?.toString() ?? "");
    params.set("page", String(p));
    params.delete("cursor");
    router.replace(`${pathname}?${params.toString()}`);
  };

  const maxPage = currentPage + (hasMore ? 1 : 0);

  const buildFilterParams = useCallback(() => {
    const params: Record<string, string> = {};
    searchParams?.forEach((v, k) => {
      if (k !== "page" && k !== "cursor" && k !== "pageSize") params[k] = v;
    });
    return params;
  }, [searchParams]);

  const buildBulkPayload = useCallback(
    (base: { productIds?: string[]; applyToAllMatchingFilters?: boolean; filterParams?: Record<string, string> }) => {
      const payload: Record<string, unknown> = {
        ...base,
        category: bulkCategory.trim(),
        subcategory: bulkSubcategory.trim(),
        level3: needsLevel3 ? bulkLevel3.trim() || null : null,
        listCategory: needsMaiMulteDetalii ? (bulkListCategory.trim() || null) : undefined,
      };
      if (bulkBrand.trim()) payload.brand = bulkBrand.trim();
      if (bulkModel.trim()) payload.model = bulkModel.trim();
      if (bulkSize.trim()) payload.size = bulkSize.trim();
      if (bulkColor.trim()) payload.color = bulkColor.trim();
      if (bulkCondition.trim()) payload.condition = bulkCondition.trim();
      if (bulkCounty.trim()) payload.county = bulkCounty.trim();
      if (bulkCity.trim()) payload.city = bulkCity.trim();
      const attrs: Record<string, string> = {};
      for (const [k, v] of Object.entries(bulkAttributes)) if (v?.trim()) attrs[k] = v.trim();
      if (Object.keys(attrs).length > 0) payload.attributes = attrs;
      return payload;
    },
    [bulkCategory, bulkSubcategory, bulkLevel3, bulkListCategory, needsLevel3, needsMaiMulteDetalii, bulkBrand, bulkModel, bulkSize, bulkColor, bulkCondition, bulkCounty, bulkCity, bulkAttributes]
  );

  const clearBulkExtra = useCallback(() => {
    setBulkBrand("");
    setBulkModel("");
    setBulkSize("");
    setBulkColor("");
    setBulkCondition("");
    setBulkCounty("");
    setBulkCity("");
    setBulkAttributes({});
  }, []);

  const runBulkWithStream = useCallback(
    async (payload: Record<string, unknown>) => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        alert("Nu ești autentificat.");
        return;
      }
      setBulkProgressOpen(true);
      setBulkProgressTotal(0);
      setBulkProgressApplied(0);
      setBulkProgressFailed(0);
      setBulkProgressLog([]);
      setBulkProgressError(null);
      setBulkProgressDone(false);
      setBulkApplying(true);
      const body = { ...payload, stream: true };
      try {
        const res = await fetch("/api/admin/recategorizare/bulk", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
        });
        if (!res.ok || !res.body) {
          const t = await res.text();
          let errMsg = t;
          try {
            const j = JSON.parse(t);
            if (j.error) errMsg = j.error;
          } catch {}
          setBulkProgressError(errMsg);
          setBulkProgressDone(true);
          return;
        }
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let applied = 0;
        let failed = 0;
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;
            try {
              const event = JSON.parse(trimmed) as {
                type?: string;
                total?: number;
                applied?: number;
                failed?: number;
                index?: number;
                id?: string;
                title?: string;
                ok?: boolean;
                error?: string;
              };
              if (event.type === "start" && event.total != null) {
                setBulkProgressTotal(event.total);
              } else if (event.type === "progress") {
                setBulkProgressLog((prev) =>
                  prev.concat({
                    index: event.index ?? 0,
                    total: event.total ?? 0,
                    id: event.id ?? "",
                    title: event.title ?? event.id ?? "",
                    ok: event.ok ?? false,
                    error: event.error,
                  })
                );
                if (event.ok) applied++;
                else failed++;
                setBulkProgressApplied((a) => a + (event.ok ? 1 : 0));
                setBulkProgressFailed((f) => f + (event.ok ? 0 : 1));
              } else if (event.type === "done") {
                setBulkProgressApplied(event.applied ?? applied);
                setBulkProgressFailed(event.failed ?? failed);
                setBulkProgressDone(true);
                setSelected(new Set());
                setBulkCategory("");
                setBulkSubcategory("");
                setBulkLevel3("");
                setBulkListCategory("");
                clearBulkExtra();
                fetchListings();
              } else if (event.type === "error") {
                setBulkProgressError(event.error ?? "Eroare");
                setBulkProgressDone(true);
              }
            } catch (_) {}
          }
        }
        if (buffer.trim()) {
          try {
            const event = JSON.parse(buffer.trim());
            if (event.type === "done") {
              setBulkProgressApplied(event.applied ?? applied);
              setBulkProgressFailed(event.failed ?? failed);
              setBulkProgressDone(true);
              setSelected(new Set());
              setBulkCategory("");
              setBulkSubcategory("");
              setBulkLevel3("");
              setBulkListCategory("");
              clearBulkExtra();
              fetchListings();
            } else if (event.type === "error") {
              setBulkProgressError(event.error ?? "Eroare");
              setBulkProgressDone(true);
            }
          } catch (_) {}
        }
      } catch (e) {
        setBulkProgressError(e instanceof Error ? e.message : "Eroare de rețea");
        setBulkProgressDone(true);
      } finally {
        setBulkApplying(false);
      }
    },
    [buildBulkPayload, clearBulkExtra, fetchListings]
  );

  const handleBulkApply = async () => {
    if (selected.size === 0 || !bulkCategory.trim() || !bulkSubcategory.trim()) return;
    await runBulkWithStream(buildBulkPayload({ productIds: Array.from(selected) }));
  };

  const handleBulkApplyToAll = async () => {
    if (!bulkCategory.trim() || !bulkSubcategory.trim()) return;
    const count = totalCount ?? 0;
    if (count === 0) return;
    const cap = 5000;
    if (!confirm(`Aplici noua categorie la toate cele ${count > cap ? `primele ${cap} (max)` : count} rezultate care respectă filtrele curente?`)) return;
    await runBulkWithStream(
      buildBulkPayload({
        applyToAllMatchingFilters: true,
        filterParams: buildFilterParams() ?? {},
      })
    );
  };

  const closeBulkProgressModal = useCallback(() => {
    setBulkProgressOpen(false);
    setBulkProgressDone(false);
    setBulkProgressLog([]);
  }, []);

  const thumb = (row: ListingRow) => {
    const imgs = Array.isArray(row.images) ? row.images : [];
    const first = imgs[0];
    const url = typeof first === "string" ? first : (first as { url?: string })?.url;
    return url ? (
      <img src={url} alt="" className="h-10 w-10 rounded object-cover" />
    ) : (
      <div className="flex h-10 w-10 items-center justify-center rounded bg-gray-200 text-xs text-gray-500">—</div>
    );
  };

  const bulkCitySelectValue = bulkCustomCityMode || (bulkCity && !ROMANIAN_CITIES.includes(bulkCity))
    ? CUSTOM_CITY_VALUE
    : (bulkCity && ROMANIAN_CITIES.includes(bulkCity) ? bulkCity : "");
  const drawerCitySelectValue = drawerCustomCityMode || (drawerCity && !ROMANIAN_CITIES.includes(drawerCity))
    ? CUSTOM_CITY_VALUE
    : (drawerCity && ROMANIAN_CITIES.includes(drawerCity) ? drawerCity : "");

  return (
    <>
      {/* Premium bulk progress modal — live stream log */}
      {bulkProgressOpen && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4"
          style={{
            background: "linear-gradient(135deg, rgba(15,23,42,0.92) 0%, rgba(30,64,175,0.88) 40%, rgba(29,78,216,0.85) 100%)",
            backdropFilter: "blur(12px)",
          }}
        >
          <div
            className="relative flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl shadow-2xl"
            style={{
              background: "linear-gradient(160deg, rgba(255,255,255,0.12) 0%, rgba(255,255,255,0.06) 100%)",
              border: "1px solid rgba(255,255,255,0.18)",
              boxShadow: "0 25px 50px -12px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.05)",
            }}
          >
            <div className="flex items-center justify-between border-b border-white/10 px-6 py-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10">
                  <svg className="h-5 w-5 animate-spin text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-white">Actualizare în curs</h3>
                  <p className="text-sm text-white/70">Recategorizare produse în timp real</p>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div className="text-right">
                  <div className="text-2xl font-bold tabular-nums text-white">
                    {bulkProgressApplied + bulkProgressFailed}
                    <span className="text-lg font-medium text-white/60"> / {bulkProgressTotal || "—"}</span>
                  </div>
                  <div className="flex gap-3 text-xs">
                    <span className="text-emerald-400">{bulkProgressApplied} reușite</span>
                    <span className="text-red-400">{bulkProgressFailed} erori</span>
                  </div>
                </div>
                {bulkProgressDone && (
                  <button
                    type="button"
                    onClick={closeBulkProgressModal}
                    className="rounded-xl bg-white/20 px-4 py-2 text-sm font-medium text-white hover:bg-white/30"
                  >
                    Închide
                  </button>
                )}
              </div>
            </div>
            {bulkProgressError && (
              <div className="mx-6 mt-3 rounded-xl bg-red-500/20 px-4 py-2 text-sm text-red-200">
                {bulkProgressError}
              </div>
            )}
            <div className="flex-1 overflow-y-auto px-6 py-4">
              <div className="space-y-1 font-mono text-sm">
                {bulkProgressLog.map((entry, i) => (
                  <div
                    key={`${entry.id}-${i}`}
                    className="flex items-center gap-3 rounded-lg px-3 py-2 transition-colors"
                    style={{
                      background: entry.ok ? "rgba(16,185,129,0.08)" : "rgba(239,68,68,0.08)",
                      borderLeft: `3px solid ${entry.ok ? "rgb(16,185,129)" : "rgb(239,68,68)"}`,
                    }}
                  >
                    {entry.ok ? (
                      <span className="text-emerald-400">✓</span>
                    ) : (
                      <span className="text-red-400">✗</span>
                    )}
                    <span className="flex-1 truncate text-white/90" title={entry.title}>
                      {entry.title || entry.id}
                    </span>
                    {!entry.ok && entry.error && (
                      <span className="shrink-0 text-xs text-red-300">{entry.error}</span>
                    )}
                    <span className="shrink-0 text-white/50">
                      {entry.index}/{entry.total}
                    </span>
                  </div>
                ))}
                {!bulkProgressDone && bulkProgressLog.length === 0 && bulkProgressTotal > 0 && (
                  <div className="py-4 text-center text-white/50">Se procesează primul produs…</div>
                )}
                {!bulkProgressDone && bulkProgressTotal === 0 && (
                  <div className="py-4 text-center text-white/50">Se încarcă lista…</div>
                )}
                <div ref={bulkProgressLogEndRef} />
              </div>
            </div>
            {bulkProgressDone && (
              <div className="border-t border-white/10 px-6 py-3 text-center text-sm text-white/70">
                Finalizat — {bulkProgressApplied} actualizate, {bulkProgressFailed} erori.
              </div>
            )}
          </div>
        </div>
      )}

      <div className="flex flex-col rounded-xl border border-gray-200 bg-white shadow-sm">
      {selected.size > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 bg-blue-50 px-4 py-3 text-sm">
          <span className="font-medium text-blue-800">{selected.size} selectate</span>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setSelected(new Set())}
              className="rounded px-2 py-1 text-gray-600 hover:bg-blue-100"
            >
              Deselectează
            </button>
            {categories.length > 0 ? (
              <>
                <label className="sr-only" htmlFor="bulk-category">Categorie</label>
                <select
                  id="bulk-category"
                  value={bulkCategory}
                  onChange={(e) => {
                    setBulkCategory(e.target.value);
                    setBulkSubcategory("");
                    setBulkLevel3("");
                    setBulkListCategory("");
                  }}
                  className="rounded border border-gray-300 bg-white px-2 py-1.5 text-gray-800"
                >
                  <option value="">— Categorie —</option>
                  {categories.filter((c) => c.slug !== "all").map((c) => (
                    <option key={c.slug} value={c.slug}>
                      {c.name}
                    </option>
                  ))}
                </select>
                <label className="sr-only" htmlFor="bulk-subcategory">Subcategorie</label>
                <select
                  id="bulk-subcategory"
                  value={bulkSubcategory}
                  onChange={(e) => {
                    setBulkSubcategory(e.target.value);
                    setBulkLevel3("");
                    setBulkListCategory("");
                  }}
                  className="rounded border border-gray-300 bg-white px-2 py-1.5 text-gray-800"
                  disabled={!bulkCategory || subcategories.length === 0}
                >
                  <option value="">— Subcategorie —</option>
                  {subcategories.map((sub) => (
                    <option key={sub} value={sub}>
                      {subcategoryNames[sub] ?? sub}
                    </option>
                  ))}
                </select>
                {needsMaiMulteDetalii && (
                  <>
                    <label className="sr-only" htmlFor="bulk-list-category">Mai multe detalii</label>
                    <select
                      id="bulk-list-category"
                      value={bulkListCategory}
                      onChange={(e) => setBulkListCategory(e.target.value)}
                      className="rounded border border-gray-300 bg-white px-2 py-1.5 text-gray-800"
                    >
                      <option value="">— Mai multe detalii —</option>
                      {EXEC_MAI_MULTE_DETALII_OPTIONS.map((opt) => (
                        <option key={opt} value={opt}>
                          {opt}
                        </option>
                      ))}
                    </select>
                  </>
                )}
                {needsLevel3 && (
                  <>
                    <label className="sr-only" htmlFor="bulk-level3">{level3Label}</label>
                    <select
                      id="bulk-level3"
                      value={bulkLevel3}
                      onChange={(e) => setBulkLevel3(e.target.value)}
                      className="rounded border border-gray-300 bg-white px-2 py-1.5 text-gray-800"
                    >
                      <option value="">{level3Placeholder}</option>
                      {level3Options.map((slug) => (
                        <option key={slug} value={slug}>
                          {level3OptionLabel(slug)}
                        </option>
                      ))}
                    </select>
                  </>
                )}
                <button
                  type="button"
                  onClick={() => setBulkShowMore((v) => !v)}
                  className="rounded border border-gray-300 bg-gray-100 px-2 py-1.5 text-sm text-gray-700 hover:bg-gray-200"
                >
                  {bulkShowMore ? "Ascunde câmpuri" : "Mai multe câmpuri"}
                </button>
                {bulkShowMore && (
                  <div className="flex flex-wrap items-center gap-2 w-full mt-2 pl-0">
                    {visibleProductFields.map((field) => (
                      field === "city" ? (
                        <span key={field} className="flex items-center gap-1 flex-wrap">
                          <label className="text-xs text-gray-600 whitespace-nowrap">{PRODUCT_FIELD_LABELS[field]}:</label>
                          <select
                            value={bulkCitySelectValue}
                            onChange={(e) => {
                              const v = e.target.value;
                              setBulkCustomCityMode(v === CUSTOM_CITY_VALUE);
                              setBulkCity(v === "" || v === CUSTOM_CITY_VALUE ? "" : v);
                            }}
                            className="rounded border border-gray-300 bg-white px-2 py-1 text-sm min-w-[120px]"
                          >
                            <option value="">— Oraș —</option>
                            {ROMANIAN_CITIES.map((c) => (
                              <option key={c} value={c}>{c}</option>
                            ))}
                            <option value={CUSTOM_CITY_VALUE}>Altă localitate…</option>
                          </select>
                          {bulkCitySelectValue === CUSTOM_CITY_VALUE && (
                            <input
                              type="text"
                              placeholder="Oraș / localitate"
                              value={bulkCity}
                              onChange={(e) => {
                                const v = e.target.value;
                                setBulkCity(v);
                                if (!v) setBulkCustomCityMode(false);
                              }}
                              className="rounded border border-gray-300 bg-white px-2 py-1 text-sm w-32"
                            />
                          )}
                        </span>
                      ) : (
                        <input
                          key={field}
                          type="text"
                          placeholder={PRODUCT_FIELD_LABELS[field] ?? field}
                          value={
                            field === "brand" ? bulkBrand
                              : field === "model" ? bulkModel
                              : field === "size" ? bulkSize
                              : field === "color" ? bulkColor
                              : field === "county" ? bulkCounty
                              : bulkCondition
                          }
                          onChange={(e) => {
                            const v = e.target.value;
                            if (field === "brand") setBulkBrand(v);
                            else if (field === "model") setBulkModel(v);
                            else if (field === "size") setBulkSize(v);
                            else if (field === "color") setBulkColor(v);
                            else if (field === "county") setBulkCounty(v);
                            else setBulkCondition(v);
                          }}
                          className="rounded border border-gray-300 bg-white px-2 py-1 text-sm w-28"
                        />
                      )
                    ))}
                    {visibleAttributeKeys.map((key) => {
                      const options = attributeOptions[key];
                      if (!options?.length) return null;
                      return (
                        <span key={key} className="flex items-center gap-1">
                          <label className="text-xs text-gray-600 whitespace-nowrap">{ATTRIBUTE_LABELS[key] ?? key}:</label>
                          <select
                            value={bulkAttributes[key] ?? ""}
                            onChange={(e) => setBulkAttributes((prev) => ({ ...prev, [key]: e.target.value }))}
                            className="rounded border border-gray-300 bg-white px-2 py-1 text-sm min-w-[100px]"
                          >
                            <option value="">—</option>
                            {options.map((opt) => (
                              <option key={opt} value={opt}>{opt}</option>
                            ))}
                          </select>
                        </span>
                      );
                    })}
                  </div>
                )}
                <button
                  type="button"
                  disabled={bulkApplying || !bulkCategory || !bulkSubcategory}
                  onClick={handleBulkApply}
                  className="rounded bg-blue-600 px-3 py-1.5 text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {bulkApplying ? "Se aplică..." : "Schimbă categoria la selectate"}
                </button>
                <button
                  type="button"
                  disabled={bulkDeleting}
                  onClick={handleBulkDelete}
                  className="rounded bg-red-600 px-3 py-1.5 text-white hover:bg-red-700 disabled:opacity-50"
                >
                  {bulkDeleting ? "Se șterg..." : "Șterge selectate"}
                </button>
              </>
            ) : (
              <span className="text-gray-500">Se încarcă categoriile…</span>
            )}
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-200 px-4 py-2">
        <div className="flex items-center gap-3">
          {totalCount !== null && (
            <span className="text-sm font-medium text-gray-700">
              {totalCount === 0
                ? "Niciun rezultat"
                : totalCount === 1
                  ? "1 rezultat"
                  : `${totalCount.toLocaleString("ro-RO")} rezultate`}
            </span>
          )}
          <span className="text-sm text-gray-600">Pe pagină:</span>
        </div>
        <select
          value={pageSizeParam}
          onChange={(e) => {
            const next = e.target.value;
            const params = new URLSearchParams(searchParams?.toString() ?? "");
            params.set("pageSize", next);
            params.set("page", "1");
            params.delete("cursor");
            router.replace(`${pathname}?${params.toString()}`);
          }}
          className="rounded border border-gray-300 bg-white px-2 py-1 text-sm text-gray-800"
        >
          {PAGE_SIZE_OPTIONS.map((n) => (
            <option key={n} value={String(n)}>
              {n}
            </option>
          ))}
          <option value={PAGE_SIZE_ALL}>Toate (max. 5000)</option>
        </select>
      </div>

      {totalCount != null && totalCount > 0 && categories.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 border-b border-gray-200 bg-amber-50/60 px-4 py-2 text-sm">
          <span className="font-medium text-amber-900">Selectează toate și schimbă categoria:</span>
          <select
            value={bulkCategory}
            onChange={(e) => {
                    setBulkCategory(e.target.value);
                    setBulkSubcategory("");
                    setBulkLevel3("");
                    setBulkListCategory("");
                  }}
                  className="rounded border border-gray-300 bg-white px-2 py-1.5 text-gray-800"
                >
                  <option value="">— Categorie —</option>
                  {categories.filter((c) => c.slug !== "all").map((c) => (
              <option key={c.slug} value={c.slug}>
                {c.name}
              </option>
            ))}
          </select>
          <select
            value={bulkSubcategory}
            onChange={(e) => {
              setBulkSubcategory(e.target.value);
              setBulkLevel3("");
              setBulkListCategory("");
            }}
            className="rounded border border-gray-300 bg-white px-2 py-1.5 text-gray-800"
            disabled={!bulkCategory || subcategories.length === 0}
          >
            <option value="">— Subcategorie —</option>
            {subcategories.map((sub) => (
              <option key={sub} value={sub}>
                {subcategoryNames[sub] ?? sub}
              </option>
            ))}
          </select>
          {needsMaiMulteDetalii && (
            <select
              value={bulkListCategory}
              onChange={(e) => setBulkListCategory(e.target.value)}
              className="rounded border border-gray-300 bg-white px-2 py-1.5 text-gray-800"
              title="Mai multe detalii"
            >
              <option value="">— Mai multe detalii —</option>
              {EXEC_MAI_MULTE_DETALII_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          )}
          {needsLevel3 && (
            <select
              value={bulkLevel3}
              onChange={(e) => setBulkLevel3(e.target.value)}
              className="rounded border border-gray-300 bg-white px-2 py-1.5 text-gray-800"
              title={level3Label}
            >
              <option value="">{level3Placeholder}</option>
              {level3Options.map((slug) => (
                <option key={slug} value={slug}>
                  {level3OptionLabel(slug)}
                </option>
              ))}
            </select>
          )}
          <button
            type="button"
            onClick={() => setBulkShowMore((v) => !v)}
            className="rounded border border-amber-300 bg-amber-100 px-2 py-1.5 text-sm text-amber-900 hover:bg-amber-200"
          >
            {bulkShowMore ? "Ascunde câmpuri" : "Mai multe câmpuri"}
          </button>
          {bulkShowMore && (
            <div className="flex flex-wrap items-center gap-2 w-full mt-2 pl-0">
              {              visibleProductFields.map((field) => (
                field === "city" ? (
                  <span key={field} className="flex items-center gap-1 flex-wrap">
                    <label className="text-xs text-amber-800 whitespace-nowrap">{PRODUCT_FIELD_LABELS[field]}:</label>
                    <select
                      value={bulkCitySelectValue}
                      onChange={(e) => {
                        const v = e.target.value;
                        setBulkCustomCityMode(v === CUSTOM_CITY_VALUE);
                        setBulkCity(v === "" || v === CUSTOM_CITY_VALUE ? "" : v);
                      }}
                      className="rounded border border-gray-300 bg-white px-2 py-1 text-sm min-w-[120px]"
                    >
                      <option value="">— Oraș —</option>
                      {ROMANIAN_CITIES.map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                      <option value={CUSTOM_CITY_VALUE}>Altă localitate…</option>
                    </select>
                    {bulkCitySelectValue === CUSTOM_CITY_VALUE && (
                      <input
                        type="text"
                        placeholder="Oraș / localitate"
                        value={bulkCity}
                        onChange={(e) => {
                          const v = e.target.value;
                          setBulkCity(v);
                          if (!v) setBulkCustomCityMode(false);
                        }}
                        className="rounded border border-gray-300 bg-white px-2 py-1 text-sm w-32"
                      />
                    )}
                  </span>
                ) : (
                  <input
                    key={field}
                    type="text"
                    placeholder={PRODUCT_FIELD_LABELS[field] ?? field}
                    value={
                      field === "brand" ? bulkBrand
                        : field === "model" ? bulkModel
                        : field === "size" ? bulkSize
                        : field === "color" ? bulkColor
                        : field === "county" ? bulkCounty
                        : bulkCondition
                    }
                    onChange={(e) => {
                      const v = e.target.value;
                      if (field === "brand") setBulkBrand(v);
                      else if (field === "model") setBulkModel(v);
                      else if (field === "size") setBulkSize(v);
                      else if (field === "color") setBulkColor(v);
                      else if (field === "county") setBulkCounty(v);
                      else setBulkCondition(v);
                    }}
                    className="rounded border border-gray-300 bg-white px-2 py-1 text-sm w-28"
                  />
                )
              ))}
              {visibleAttributeKeys.map((key) => {
                const options = attributeOptions[key];
                if (!options?.length) return null;
                return (
                  <span key={key} className="flex items-center gap-1">
                    <label className="text-xs text-amber-800 whitespace-nowrap">{ATTRIBUTE_LABELS[key] ?? key}:</label>
                    <select
                      value={bulkAttributes[key] ?? ""}
                      onChange={(e) => setBulkAttributes((prev) => ({ ...prev, [key]: e.target.value }))}
                      className="rounded border border-gray-300 bg-white px-2 py-1 text-sm min-w-[100px]"
                    >
                      <option value="">—</option>
                      {options.map((opt) => (
                        <option key={opt} value={opt}>{opt}</option>
                      ))}
                    </select>
                  </span>
                );
              })}
            </div>
          )}
          <button
            type="button"
            disabled={bulkApplying || !bulkCategory || !bulkSubcategory}
            onClick={handleBulkApplyToAll}
            className="rounded bg-amber-600 px-3 py-1.5 text-white hover:bg-amber-700 disabled:opacity-50"
          >
            {bulkApplying ? "Se aplică..." : `Aplică la toate (max. ${Math.min(totalCount ?? 0, 5000).toLocaleString("ro-RO")})`}
          </button>
        </div>
      )}

      <div className="overflow-x-auto">
        {loading && items.length === 0 ? (
          <div className="flex items-center justify-center py-12">
            <i className="ri-loader-4-line animate-spin text-2xl text-gray-400" />
          </div>
        ) : error ? (
          <div className="py-8 text-center text-red-600">{error}</div>
        ) : items.length === 0 ? (
          <div className="py-8 text-center text-gray-500">
            {searchParams?.get("neverRecategorized") === "1"
              ? "Niciun produs neactualizat cu aceste filtre. Toate au fost deja recategorizate sau nu există rezultate."
              : "Niciun rezultat. Modifică filtrele."}
          </div>
        ) : (
          <>
            {searchParams?.get("neverRecategorized") === "1" && (
              <div className="mb-3 flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800 ring-1 ring-amber-200/80">
                <span className="font-medium">Doar neactualizate:</span>
                <span>Se afișează doar produsele care nu au fost recategorizate niciodată.</span>
              </div>
            )}
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50 text-left text-gray-600">
                <th className="w-10 p-2">
                  <input
                    type="checkbox"
                    checked={items.length > 0 && selected.size >= items.length}
                    onChange={toggleSelectAll}
                  />
                </th>
                <th className="p-2">Imagine</th>
                <th className="p-2">Titlu</th>
                <th className="p-2">Categorie / Subcategorie</th>
                <th className="p-2">Oraș</th>
                <th className="p-2">Sursă</th>
                <th className="p-2">Channel</th>
                <th className="p-2">Categoria actualizată</th>
                <th className="p-2">Acțiuni</th>
              </tr>
            </thead>
            <tbody>
              {items.map((row) => (
                <tr
                  key={row.id}
                  className="border-b border-gray-100 hover:bg-gray-50"
                  onClick={() => openDrawer(row.id)}
                >
                  <td className="p-2" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={selected.has(row.id)}
                      onChange={() => toggleSelect(row.id)}
                    />
                  </td>
                  <td className="p-2">{thumb(row)}</td>
                  <td className="max-w-[200px] truncate p-2" title={row.title}>
                    {row.title ?? "—"}
                  </td>
                  <td className={`p-2 ${row.recategorized_at ? "bg-emerald-50/80" : ""}`}>
                    <span className={row.recategorized_at ? "font-medium text-emerald-800" : ""}>
                      {rowCategoryLabel(row)} / {rowSubcategoryLabel(row)}
                      {rowLevel3Label(row) ? ` / ${rowLevel3Label(row)}` : ""}
                    </span>
                    {row.recategorized_at && (
                      <span className="ml-1.5 inline-block rounded bg-emerald-100 px-1.5 py-0.5 text-xs font-medium text-emerald-700" title="Categoria a fost actualizată">
                        Actualizat
                      </span>
                    )}
                  </td>
                  <td className="p-2 text-gray-600">{row.city ?? row.county ?? "—"}</td>
                  <td className="p-2 text-gray-500">
                    {[row.product_type, row.sale_type].filter(Boolean).join(" · ") || "—"}
                  </td>
                  <td className="p-2">{row.channel ?? "—"}</td>
                  <td className="p-2 text-gray-500" title={row.recategorized_at ? new Date(row.recategorized_at).toLocaleString("ro-RO", { dateStyle: "medium", timeStyle: "short" }) : undefined}>
                    {formatUpdatedAtRel(row.recategorized_at ?? undefined)}
                  </td>
                  <td className="p-2">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        openDrawer(row.id);
                      }}
                      className="text-blue-600 hover:underline"
                    >
                      Detalii
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </>
        )}
      </div>

      {!error && items.length > 0 && (
        <WheelPaginationFooter isDarkMode={false} className="mt-0 px-4 pb-4 pt-6 sm:pb-6">
          <div className={`flex justify-center ${loading ? "opacity-50 pointer-events-none" : ""}`}>
            <WheelPagination
              totalPages={Math.max(1, maxPage)}
              currentPage={currentPage}
              onPageChange={goToPage}
              canGoNext={hasMore}
              isDarkMode={false}
            />
          </div>
        </WheelPaginationFooter>
      )}

      {drawerId && (
        <>
          <div
            className="fixed inset-0 z-50 bg-black/40"
            onClick={closeDrawer}
            role="presentation"
          />
          <div className="fixed right-0 top-0 z-50 h-full w-full max-w-md overflow-y-auto border-l border-gray-200 bg-white shadow-xl">
            <div className="sticky top-0 flex items-center justify-between border-b border-gray-200 bg-white p-4">
              <h3 className="font-semibold">Editare categorie / subcategorie</h3>
              <button type="button" onClick={closeDrawer} className="p-2 hover:bg-gray-100">
                <i className="ri-close-line text-xl" />
              </button>
            </div>
            <div className="p-4 space-y-4">
              {drawerRow && (
                <p className="text-sm text-gray-600 truncate" title={drawerRow.title}>
                  {drawerRow.title ?? "—"}
                </p>
              )}
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-gray-500">Categorie</label>
                <select
                  value={drawerCategory}
                  onChange={(e) => {
                    setDrawerCategory(e.target.value);
                    setDrawerSubcategory("");
                    setDrawerLevel3("");
                    setDrawerListCategory("");
                  }}
                  className="w-full rounded border border-gray-300 bg-white px-3 py-2 text-gray-800"
                >
                  <option value="">— Categorie —</option>
                  {categories.filter((c) => c.slug !== "all").map((c) => (
                    <option key={c.slug} value={c.slug}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-gray-500">Subcategorie</label>
                <select
                  value={drawerSubcategory}
                  onChange={(e) => {
                    setDrawerSubcategory(e.target.value);
                    setDrawerLevel3("");
                    setDrawerListCategory("");
                  }}
                  disabled={!drawerCategory || drawerSubcategories.length === 0}
                  className="w-full rounded border border-gray-300 bg-white px-3 py-2 text-gray-800 disabled:opacity-50"
                >
                  <option value="">— Subcategorie —</option>
                  {drawerSubcategories.map((sub) => (
                    <option key={sub} value={sub}>
                      {subcategoryNames[sub] ?? sub}
                    </option>
                  ))}
                </select>
              </div>
              {drawerNeedsLevel3 && (
                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-gray-500">{drawerLevel3Label}</label>
                  <select
                    value={drawerLevel3}
                    onChange={(e) => setDrawerLevel3(e.target.value)}
                    className="w-full rounded border border-gray-300 bg-white px-3 py-2 text-gray-800"
                  >
                    <option value="">— {drawerIsTipTeren ? "Tip teren" : "Tip"} —</option>
                    {drawerLevel3Options.map((slug) => (
                      <option key={slug} value={slug}>
                        {level3OptionLabel(slug)}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              {drawerNeedsMaiMulteDetalii && (
                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-gray-500">Mai multe detalii</label>
                  <select
                    value={drawerListCategory}
                    onChange={(e) => setDrawerListCategory(e.target.value)}
                    className="w-full rounded border border-gray-300 bg-white px-3 py-2 text-gray-800"
                  >
                    <option value="">— Mai multe detalii —</option>
                    {EXEC_MAI_MULTE_DETALII_OPTIONS.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-gray-500">Județ</label>
                <input
                  type="text"
                  value={drawerCounty}
                  onChange={(e) => setDrawerCounty(e.target.value)}
                  placeholder="Județ"
                  className="w-full rounded border border-gray-300 bg-white px-3 py-2 text-gray-800"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-gray-500">Oraș</label>
                <select
                  value={drawerCitySelectValue}
                  onChange={(e) => {
                    const v = e.target.value;
                    setDrawerCustomCityMode(v === CUSTOM_CITY_VALUE);
                    setDrawerCity(v === "" || v === CUSTOM_CITY_VALUE ? "" : v);
                  }}
                  className="w-full rounded border border-gray-300 bg-white px-3 py-2 text-gray-800"
                >
                  <option value="">— Selectează orașul —</option>
                  {ROMANIAN_CITIES.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                  <option value={CUSTOM_CITY_VALUE}>Altă localitate…</option>
                </select>
                {drawerCitySelectValue === CUSTOM_CITY_VALUE && (
                  <input
                    type="text"
                    placeholder="Oraș / localitate"
                    value={drawerCity}
                    onChange={(e) => {
                      const v = e.target.value;
                      setDrawerCity(v);
                      if (!v) setDrawerCustomCityMode(false);
                    }}
                    className="mt-2 w-full rounded border border-gray-300 bg-white px-3 py-2 text-gray-800"
                  />
                )}
              </div>
              <div className="flex flex-wrap gap-2 pt-2">
                <button
                  type="button"
                  disabled={drawerSaving || !drawerCategory.trim() || !drawerSubcategory.trim()}
                  onClick={handleDrawerSave}
                  className="rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {drawerSaving ? "Se salvează..." : "Salvează"}
                </button>
                <a
                  href={`/admin/products?highlight=${drawerId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded border border-gray-300 bg-white px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                >
                  Deschide în admin produse →
                </a>
                <button
                  type="button"
                  disabled={drawerDeleting}
                  onClick={handleDrawerDelete}
                  className="rounded bg-red-600 px-4 py-2 text-white hover:bg-red-700 disabled:opacity-50 ml-auto"
                >
                  {drawerDeleting ? "Se șterge..." : "Șterge produs"}
                </button>
              </div>
            </div>
          </div>
        </>
      )}
      </div>
    </>
  );
}
