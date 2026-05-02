"use client";

/**
 * Modul Import – EXECUTARI-PUBLICE (prod.executori.ro/repes)
 * Sincronizare + statistici + listă produse sincronizate – identic cu licitații publice.
 */

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import WheelPagination from "@/components/ui/wheel-pagination";
import { formatPriceTextForDisplayEuropean } from "@/lib/licitatii-price";
import { FILTER_TOP_CATEGORY_EXECUTARI, EXECUTARI_CAT_PRINCIPALA, getExecutariSubcategoriiForFilter } from "@/lib/data/ro-categories";

const REPES_BASE = "https://prod.executori.ro/repes";

interface Stats {
  total: number;
  active: number;
  deleted: number;
  withPdf: number;
  withDescription: number;
  unpublished: number;
  listed?: number;
  byCounty: { county: string; count: number }[];
  byMainCategory?: { mainCategory: string; count: number }[];
}

interface ListingRow {
  id: string;
  source_external_id: string;
  source_url: string;
  title: string | null;
  price_text: string | null;
  location_county: string | null;
  location_city: string | null;
  location_raw: string | null;
  last_seen_at: string;
  deleted_at: string | null;
  reactivated_at: string | null;
  auction_date: string | null;
  auction_time: string | null;
  seller_name: string | null;
  seller_email: string | null;
  seller_phone: string | null;
  seller_address: string | null;
  description_html: string | null;
  pdf_url: string | null;
  pdf_urls?: string[] | null;
  meta_fields: Record<string, string> | null;
  published_at: string | null;
  created_at: string;
  updated_at: string;
  product_id: string | null;
  product_slug: string | null;
  /** Cod anunț din produsul publicat (custom_fields.cod_anunt) */
  product_cod_anunt: string | null;
  images_count?: number;
  main_category?: string | null;
  category?: string | null;
}

/** Detaliu complet (listing + imagini) pentru panoul expandat */
interface RepesListingDetail extends ListingRow {
  images?: { id: string; url: string; sort_order: number }[];
}

export default function ExecutariPubliceImportPage() {
  const router = useRouter();
  const [message, setMessage] = useState<{ type: "success" | "error" | "info"; text: string } | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [isCheckingNew, setIsCheckingNew] = useState(false);
  const [isSyncingNewOnly, setIsSyncingNewOnly] = useState(false);
  const [isVerifyingStatus, setIsVerifyingStatus] = useState(false);
  const [checkNewResult, setCheckNewResult] = useState<{ totalOnPage: number; existingCount: number; newCount: number; pagesScanned?: number; lastPageOnSite?: number } | null>(null);
  const [checkNewLogs, setCheckNewLogs] = useState<string[]>([]);
  const [lastSummary, setLastSummary] = useState<{
    pagesCrawled?: number;
    itemsFound?: number;
    inserted?: number;
    updated?: number;
    softDeleted?: number;
    detailsFetched?: number;
    errors?: string[];
  } | null>(null);
  const [syncLogs, setSyncLogs] = useState<string[]>([]);

  const [stats, setStats] = useState<Stats | null>(null);
  const [listings, setListings] = useState<ListingRow[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const [limit] = useState(50);
  const [statusFilter, setStatusFilter] = useState<"active" | "deleted" | "all" | "unpublished" | "listed">("active");
  const [countyFilter, setCountyFilter] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [mainCategoryFilter, setMainCategoryFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [loadingList, setLoadingList] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [publishingIds, setPublishingIds] = useState<Set<string>>(new Set());
  const [publishLog, setPublishLog] = useState<Array<{ listingId: string; success: boolean; error?: string; url?: string }>>([]);
  const [isExtractingOne, setIsExtractingOne] = useState(false);
  const [extractOneResult, setExtractOneResult] = useState<{
    success: boolean;
    message?: string;
    error?: string;
    extractedFromList?: Record<string, unknown>;
    extractedFromDetail?: Record<string, unknown>;
    listing?: Record<string, unknown> | null;
  } | null>(null);

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [detailCache, setDetailCache] = useState<Record<string, RepesListingDetail>>({});
  const [loadingDetail, setLoadingDetail] = useState<string | null>(null);
  const [regeneratingListingId, setRegeneratingListingId] = useState<string | null>(null);
  const [updatingDisplayListingId, setUpdatingDisplayListingId] = useState<string | null>(null);
  const [deletingListingId, setDeletingListingId] = useState<string | null>(null);
  const [deletingSelected, setDeletingSelected] = useState(false);
  const [extractingPdfListingId, setExtractingPdfListingId] = useState<string | null>(null);
  const [recreatingListingId, setRecreatingListingId] = useState<string | null>(null);
  const [savingCategoriesId, setSavingCategoriesId] = useState<string | null>(null);
  const [completingCategories, setCompletingCategories] = useState(false);
  const [inferringCategoriesId, setInferringCategoriesId] = useState<string | null>(null);
  const [savingEditListingId, setSavingEditListingId] = useState<string | null>(null);

  const [autoConfig, setAutoConfig] = useState<{
    interval_hours: number;
    sync_new: boolean;
    verify_status: boolean;
    auto_publish: boolean;
    last_run_at: string | null;
    updated_at?: string;
  } | null>(null);
  const [loadingAutoConfig, setLoadingAutoConfig] = useState(false);
  const [savingAutoConfig, setSavingAutoConfig] = useState(false);
  const [verifyLogs, setVerifyLogs] = useState<string[]>([]);
  const [syncNewLogs, setSyncNewLogs] = useState<string[]>([]);
  const [runningVerifyWithLog, setRunningVerifyWithLog] = useState(false);
  const [runningSyncNewWithLog, setRunningSyncNewWithLog] = useState(false);
  const [runningRunAuto, setRunningRunAuto] = useState(false);
  const [publishLogs, setPublishLogs] = useState<string[]>([]);
  const [runningPublishWithLog, setRunningPublishWithLog] = useState(false);

  const handleInferOneCategories = useCallback(async (listingId: string) => {
    setInferringCategoriesId(listingId);
    setMessage(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        setMessage({ type: "error", text: "Sesiune invalidă." });
        return;
      }
      const res = await fetch("/api/admin/executari-publice/infer-one-categories", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ listingId }),
      });
      const data = await res.json();
      if (data.success) {
        setMessage({ type: "success", text: data.message ?? "Categoriile au fost generate." });
        setListings((prev) => prev.map((l) => l.id === listingId ? { ...l, main_category: data.main_category ?? null, category: data.category ?? null } : l));
        setDetailCache((prev) => {
          const d = prev[listingId];
          if (!d) return prev;
          return { ...prev, [listingId]: { ...d, main_category: data.main_category ?? null, category: data.category ?? null } };
        });
      } else {
        setMessage({ type: "error", text: data.error ?? "Eroare la generare categorii." });
      }
    } catch {
      setMessage({ type: "error", text: "Eroare de conexiune." });
    } finally {
      setInferringCategoriesId(null);
    }
  }, []);

  const saveListingCategories = useCallback(async (listingId: string, main_category: string | null, category: string | null) => {
    setSavingCategoriesId(listingId);
    setMessage(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        setMessage({ type: "error", text: "Sesiune invalidă." });
        return;
      }
      const res = await fetch(`/api/admin/sync-repes/listings/${listingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ main_category: main_category || null, category: category || null }),
      });
      const data = await res.json();
      if (data.success && data.listing) {
        setListings((prev) => prev.map((l) => l.id === listingId ? { ...l, main_category: data.listing.main_category ?? null, category: data.listing.category ?? null } : l));
        setDetailCache((prev) => {
          const d = prev[listingId];
          if (!d) return prev;
          return { ...prev, [listingId]: { ...d, main_category: data.listing.main_category ?? null, category: data.listing.category ?? null } };
        });
        setMessage({ type: "success", text: "Categoriile au fost salvate." });
      } else {
        setMessage({ type: "error", text: data.error || "Eroare la salvare categorii." });
      }
    } catch {
      setMessage({ type: "error", text: "Eroare de conexiune." });
    } finally {
      setSavingCategoriesId(null);
    }
  }, []);

  const fetchStats = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;
      const res = await fetch("/api/admin/sync-repes/listings?statsOnly=1", {
      });
      const data = await res.json();
      if (data.success && data.stats) setStats(data.stats);
    } catch {
      // ignore
    }
  }, []);

  const fetchListings = useCallback(async () => {
    setLoadingList(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;
      const params = new URLSearchParams({ page: String(page), limit: String(limit), status: statusFilter });
      if (countyFilter) params.set("county", countyFilter);
      if (mainCategoryFilter) params.set("mainCategory", mainCategoryFilter);
      if (categoryFilter) params.set("category", categoryFilter);
      if (searchQuery.trim()) params.set("search", searchQuery.trim());
      const res = await fetch(`/api/admin/sync-repes/listings?${params}`, {
      });
      const data = await res.json();
      if (data.success) {
        setListings(data.listings || []);
        setTotalCount(data.totalCount ?? 0);
      }
    } catch {
      setListings([]);
    } finally {
      setLoadingList(false);
    }
  }, [page, limit, statusFilter, countyFilter, mainCategoryFilter, categoryFilter, searchQuery]);

  const handleCompleteCategories = useCallback(async () => {
    setCompletingCategories(true);
    setMessage(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        setMessage({ type: "error", text: "Sesiune invalidă." });
        return;
      }
      const res = await fetch("/api/admin/executari-publice/complete-categories", {
        method: "POST",
      });
      const data = await res.json();
      if (data.success) {
        setMessage({ type: "success", text: data.message ?? `Completate categorii pentru ${data.updated ?? 0} anunțuri.` });
        fetchStats();
        fetchListings();
      } else {
        setMessage({ type: "error", text: data.error ?? "Eroare la completare categorii." });
      }
    } catch {
      setMessage({ type: "error", text: "Eroare de conexiune." });
    } finally {
      setCompletingCategories(false);
    }
  }, [fetchListings, fetchStats]);

  const fetchDetail = useCallback(async (id: string) => {
    setLoadingDetail(id);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;
      const res = await fetch(`/api/admin/sync-repes/listings/${id}`, {
      });
      const data = await res.json();
      if (data.success && data.listing) {
        setDetailCache((prev) => ({ ...prev, [id]: data.listing as RepesListingDetail }));
      }
    } catch {
      // ignore
    } finally {
      setLoadingDetail(null);
    }
  }, []);

  const toggleDetail = useCallback((id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
    if (!detailCache[id]) fetchDetail(id);
  }, [detailCache, fetchDetail]);

  const handleRecreateProduct = useCallback(async (listingId: string) => {
    setRecreatingListingId(listingId);
    setMessage(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        setMessage({ type: "error", text: "Sesiune invalidă." });
        return;
      }
      const res = await fetch("/api/admin/executari-publice/recreate-product", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ listingId }),
      });
      const data = await res.json();
      if (data.success) {
        setMessage({ type: "success", text: "Anunțul vechi a fost șters; anunț nou creat cu titlu și descriere din PDF." });
        await fetchDetail(listingId);
        fetchListings();
      } else {
        setMessage({ type: "error", text: data.error || "Eroare la regenerare." });
      }
    } catch {
      setMessage({ type: "error", text: "Eroare de conexiune la API." });
    } finally {
      setRecreatingListingId(null);
    }
  }, [fetchDetail, fetchListings]);

  const handleExtractFromPdf = useCallback(async (listingId: string) => {
    setExtractingPdfListingId(listingId);
    setMessage(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        setMessage({ type: "error", text: "Sesiune invalidă." });
        return;
      }
      const res = await fetch("/api/admin/executari-publice/extract-pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ listingId }),
      });
      const data = await res.json();
      if (data.success) {
        setMessage({ type: "success", text: "Datele au fost citite din PDF și anunțul a fost actualizat (descriere, titlu, locație, preț, detalii)." });
        await fetchDetail(listingId);
        fetchListings();
      } else {
        setMessage({ type: "error", text: data.error || "Eroare la citirea din PDF." });
      }
    } catch {
      setMessage({ type: "error", text: "Eroare de conexiune la API." });
    } finally {
      setExtractingPdfListingId(null);
    }
  }, [fetchDetail, fetchListings]);

  const handleRegenerateProduct = useCallback(async (listingId: string) => {
    setRegeneratingListingId(listingId);
    setMessage(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        setMessage({ type: "error", text: "Sesiune invalidă." });
        return;
      }
      const res = await fetch("/api/admin/executari-publice/regenerate-product", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ listingId }),
      });
      const data = await res.json();
      if (data.success) {
        setMessage({ type: "success", text: "Produs resincronizat (titlu, descriere, slug actualizate)." });
        fetchListings();
        setDetailCache((prev) => {
          const next = { ...prev };
          delete next[listingId];
          return next;
        });
      } else {
        setMessage({ type: "error", text: data.error || "Eroare la resincronizare." });
      }
    } catch (e) {
      setMessage({ type: "error", text: e instanceof Error ? e.message : "Eroare la resincronizare." });
    } finally {
      setRegeneratingListingId(null);
    }
  }, [fetchListings]);

  const handleSaveEditListingAndProduct = useCallback(async (listingId: string, payload: Record<string, unknown>) => {
    setSavingEditListingId(listingId);
    setMessage(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        setMessage({ type: "error", text: "Sesiune invalidă." });
        return;
      }
      const res = await fetch("/api/admin/executari-publice/update-listing-and-product", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ listingId, ...payload }),
      });
      const data = await res.json();
      if (data.success) {
        setMessage({ type: "success", text: "Modificările au fost salvate pe site." });
        setDetailCache((prev) => {
          const next = { ...prev };
          delete next[listingId];
          return next;
        });
        fetchListings();
        fetchDetail(listingId);
      } else {
        setMessage({ type: "error", text: data.error ?? "Eroare la salvare." });
      }
    } catch {
      setMessage({ type: "error", text: "Eroare de conexiune." });
    } finally {
      setSavingEditListingId(null);
    }
  }, [fetchListings, fetchDetail]);

  const handleUpdateProductDisplay = useCallback(async (listingId: string) => {
    setUpdatingDisplayListingId(listingId);
    setMessage(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        setMessage({ type: "error", text: "Sesiune invalidă." });
        return;
      }
      const res = await fetch("/api/admin/executari-publice/update-product-display", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ listingId }),
      });
      const data = await res.json();
      if (data.success) {
        setMessage({ type: "success", text: "Anunț actualizat pe site (titlu, descriere, preț, imagini). Câmpurile sincronizate au rămas neschimbate." });
        fetchListings();
        setDetailCache((prev) => {
          const next = { ...prev };
          delete next[listingId];
          return next;
        });
      } else {
        setMessage({ type: "error", text: data.error || "Eroare la actualizare." });
      }
    } catch (e) {
      setMessage({ type: "error", text: e instanceof Error ? e.message : "Eroare la actualizare." });
    } finally {
      setUpdatingDisplayListingId(null);
    }
  }, [fetchListings]);

  const handleDeleteListing = useCallback(async (listingId: string) => {
    if (!confirm("Ștergi acest anunț? Va dispărea din listă și, dacă e publicat, va fi șters și de pe site.")) return;
    setDeletingListingId(listingId);
    setMessage(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        setMessage({ type: "error", text: "Sesiune invalidă." });
        return;
      }
      const res = await fetch("/api/admin/executari-publice/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ listingId }),
      });
      const data = await res.json();
      if (data.success) {
        setMessage({ type: "success", text: `Anunț șters.${data.deletedProducts ? " Produsul a fost șters și de pe site." : ""}` });
        fetchStats();
        fetchListings();
        setDetailCache((prev) => {
          const next = { ...prev };
          delete next[listingId];
          return next;
        });
      } else {
        setMessage({ type: "error", text: data.error || "Eroare la ștergere." });
      }
    } catch (e) {
      setMessage({ type: "error", text: e instanceof Error ? e.message : "Eroare la ștergere." });
    } finally {
      setDeletingListingId(null);
    }
  }, [fetchListings, fetchStats]);

  const handleDeleteSelected = useCallback(async (listingIds: string[]) => {
    if (!listingIds.length) return;
    setDeletingSelected(true);
    setMessage(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        setMessage({ type: "error", text: "Sesiune invalidă." });
        return;
      }
      const res = await fetch("/api/admin/executari-publice/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ listingIds }),
      });
      const data = await res.json();
      if (data.success) {
        setMessage({ type: "success", text: `${data.deletedListings} anunțuri șterse.${data.deletedProducts ? ` ${data.deletedProducts} produs(e) șters(e) de pe site.` : ""}` });
        setSelectedIds(new Set());
        fetchStats();
        fetchListings();
        setDetailCache({});
      } else {
        setMessage({ type: "error", text: data.error || "Eroare la ștergere." });
      }
    } catch (e) {
      setMessage({ type: "error", text: e instanceof Error ? e.message : "Eroare la ștergere." });
    } finally {
      setDeletingSelected(false);
    }
  }, [fetchListings, fetchStats]);

  const fetchAutoConfig = useCallback(async () => {
    setLoadingAutoConfig(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;
      const res = await fetch("/api/admin/sync-repes/auto-config", { headers: {} });
      const data = await res.json();
      if (data.success && data.config) setAutoConfig(data.config);
    } catch {
      // ignore
    } finally {
      setLoadingAutoConfig(false);
    }
  }, []);

  useEffect(() => { fetchStats(); }, [fetchStats]);
  useEffect(() => { fetchListings(); }, [fetchListings]);
  useEffect(() => { fetchAutoConfig(); }, [fetchAutoConfig]);

  const handleTest = async () => {
    setIsTesting(true);
    setMessage(null);
    setExtractOneResult(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) { setMessage({ type: "error", text: "Sesiune invalidă." }); return; }
      const res = await fetch("/api/admin/sync-repes/test", { headers: {} });
      const data = await res.json();
      setMessage({ type: data.success ? "success" : "error", text: data.message || data.error || "Eroare" });
    } catch (e) {
      setMessage({ type: "error", text: e instanceof Error ? e.message : "Eroare la test." });
    } finally {
      setIsTesting(false);
    }
  };

  const handleExtractOne = async () => {
    setIsExtractingOne(true);
    setMessage(null);
    setExtractOneResult(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) { setMessage({ type: "error", text: "Sesiune invalidă." }); return; }
      const res = await fetch("/api/admin/sync-repes/extract-one", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
      });
      const data = await res.json();
      setExtractOneResult({
        success: data.success,
        message: data.message,
        error: data.error,
        extractedFromList: data.extractedFromList ?? null,
        extractedFromDetail: data.extractedFromDetail ?? null,
        listing: data.listing ?? null,
      });
      if (data.success) {
        setMessage({ type: "success", text: data.message || "1 produs extras. Vezi detaliile mai jos." });
        fetchStats();
        fetchListings();
      } else {
        setMessage({ type: "error", text: data.error || "Eroare la extragere." });
      }
    } catch (e) {
      setMessage({ type: "error", text: e instanceof Error ? e.message : "Eroare la extragere." });
      setExtractOneResult({ success: false, error: e instanceof Error ? e.message : "Eroare" });
    } finally {
      setIsExtractingOne(false);
    }
  };

  const handleSync = async () => {
    setIsSyncing(true);
    setMessage(null);
    setLastSummary(null);
    setSyncLogs([]);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) { setMessage({ type: "error", text: "Sesiune invalidă." }); return; }
      const res = await fetch("/api/admin/sync-repes", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}`, "x-sync-stream": "1" },
      });
      if (!res.ok) throw new Error(res.statusText);
      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let summary: typeof lastSummary = null;
      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";
          for (const line of lines) {
            if (!line.trim()) continue;
            try {
              const obj = JSON.parse(line);
              if (obj.type === "log" && obj.msg) {
                setSyncLogs((prev) => [...prev, obj.msg]);
              } else if (obj.type === "done") {
                if (obj.success && obj.summary) summary = obj.summary;
                else setMessage({ type: "error", text: obj.error || "Eroare" });
              }
            } catch {
              // ignore
            }
          }
        }
        if (buffer.trim()) {
          try {
            const obj = JSON.parse(buffer);
            if (obj.type === "log" && obj.msg) setSyncLogs((prev) => [...prev, obj.msg]);
            else if (obj.type === "done" && obj.success && obj.summary) summary = obj.summary;
          } catch {
            // ignore
          }
        }
      }
      if (summary) setLastSummary(summary);
      if (summary) setMessage({ type: "success", text: `Sync: ${summary.inserted ?? 0} noi, ${summary.updated ?? 0} actualizate, ${summary.softDeleted ?? 0} dezactivate.` });
      fetchStats();
      fetchListings();
    } catch (e) {
      setMessage({ type: "error", text: e instanceof Error ? e.message : "Eroare la sincronizare." });
    } finally {
      setIsSyncing(false);
    }
  };

  const handleCheckNew = async () => {
    setIsCheckingNew(true);
    setCheckNewResult(null);
    setCheckNewLogs([]);
    setMessage(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        setMessage({ type: "error", text: "Sesiune invalidă." });
        return;
      }
      const res = await fetch("/api/admin/sync-repes/check-new?stream=1", { headers: {} });
      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}));
        setMessage({ type: "error", text: data.error || data.message || "Eroare la verificare." });
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const payload = JSON.parse(line.slice(6));
            if (payload.t === "log" && payload.msg) {
              setCheckNewLogs((prev) => [...prev, payload.msg]);
            } else if (payload.t === "result") {
              if (payload.success) {
                setCheckNewResult({
                  totalOnPage: payload.totalOnPage ?? 0,
                  existingCount: payload.existingCount ?? 0,
                  newCount: payload.newCount ?? 0,
                  pagesScanned: payload.pagesScanned,
                  lastPageOnSite: payload.lastPageOnSite,
                });
                if (payload.message) setMessage({ type: "success", text: payload.message });
              } else {
                setMessage({ type: "error", text: payload.message || payload.error || "Eroare la verificare." });
              }
            }
          } catch (_) {}
        }
      }
      if (buffer.startsWith("data: ")) {
        try {
          const payload = JSON.parse(buffer.slice(6));
          if (payload.t === "result" && payload.success) {
            setCheckNewResult({
              totalOnPage: payload.totalOnPage ?? 0,
              existingCount: payload.existingCount ?? 0,
              newCount: payload.newCount ?? 0,
              pagesScanned: payload.pagesScanned,
              lastPageOnSite: payload.lastPageOnSite,
            });
            if (payload.message) setMessage({ type: "success", text: payload.message });
          }
        } catch (_) {}
      }
    } catch (e) {
      setMessage({ type: "error", text: e instanceof Error ? e.message : "Eroare la verificare." });
    } finally {
      setIsCheckingNew(false);
    }
  };

  const handleSyncNewOnly = async () => {
    setIsSyncingNewOnly(true);
    setMessage(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;
      const res = await fetch("/api/admin/sync-repes/sync-new-only", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
      });
      const data = await res.json();
      if (data.success) {
        setMessage({ type: "success", text: data.message || `Inserate ${data.inserted ?? 0} anunțuri noi.` });
        fetchStats();
        fetchListings();
      } else setMessage({ type: "error", text: data.error || data.message || "Eroare" });
    } catch (e) {
      setMessage({ type: "error", text: e instanceof Error ? e.message : "Eroare" });
    } finally {
      setIsSyncingNewOnly(false);
    }
  };

  const handleVerifyStatus = async () => {
    setIsVerifyingStatus(true);
    setMessage(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;
      const body = selectedIds.size > 0 ? { listingIds: Array.from(selectedIds) } : {};
      const res = await fetch("/api/admin/sync-repes/verify-status", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.success && data.summary) {
        setMessage({ type: "success", text: `Stare: ${data.summary.softDeleted ?? 0} dezactivate, ${data.summary.reactivated ?? 0} reactivate.${selectedIds.size > 0 ? ` (pentru ${selectedIds.size} selectate)` : ""}` });
        fetchStats();
        fetchListings();
        if (selectedIds.size > 0) setSelectedIds(new Set());
      } else setMessage({ type: "error", text: data.error || "Eroare" });
    } catch (e) {
      setMessage({ type: "error", text: e instanceof Error ? e.message : "Eroare" });
    } finally {
      setIsVerifyingStatus(false);
    }
  };

  const handleSaveAutoConfig = async (overrides?: { interval_hours?: number; sync_new?: boolean; verify_status?: boolean; auto_publish?: boolean }) => {
    setSavingAutoConfig(true);
    setMessage(null);
    const c = autoConfig ?? { interval_hours: 6, sync_new: true, verify_status: true, auto_publish: false, last_run_at: null };
    const payload = {
      interval_hours: overrides?.interval_hours ?? c.interval_hours,
      sync_new: overrides?.sync_new ?? c.sync_new,
      verify_status: overrides?.verify_status ?? c.verify_status,
      auto_publish: overrides?.auto_publish ?? c.auto_publish,
    };
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) { setMessage({ type: "error", text: "Sesiune invalidă." }); return; }
      const res = await fetch("/api/admin/sync-repes/auto-config", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (data.success) {
        setAutoConfig(data.config ?? { ...c, ...payload });
        setMessage({ type: "success", text: "Configurare salvată." });
      } else setMessage({ type: "error", text: data.error || "Eroare la salvare" });
    } catch (e) {
      setMessage({ type: "error", text: e instanceof Error ? e.message : "Eroare" });
    } finally {
      setSavingAutoConfig(false);
    }
  };

  const runRunAutoNow = async () => {
    setRunningRunAuto(true);
    setMessage(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        setMessage({ type: "error", text: "Sesiune invalidă." });
        return;
      }
      const res = await fetch("/api/admin/sync-repes/run-auto", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}`, "x-force-run": "1" },
        body: "{}",
      });
      const data = await res.json().catch(() => ({}));
      if (data.skipped) {
        setMessage({ type: "info", text: `Nu s-a rulat: ${data.reason ?? "interval nu a expirat"}.` });
      } else if (data.success && Array.isArray(data.results)) {
        const parts = data.results.map((r: { step: string; success?: boolean; published?: number; failed?: number; total?: number; error?: string }) => {
          if (r.step === "auto_publish" && typeof r.published === "number") {
            return `Publicare: ${r.published} publicate${r.failed ? `, ${r.failed} eșec` : ""}`;
          }
          return `${r.step}: ${r.success ? "ok" : r.error ?? "eroare"}`;
        });
        setMessage({ type: "success", text: "Rulat: " + parts.join("; ") });
        fetchAutoConfig();
        fetchStats();
        fetchListings();
      } else {
        setMessage({ type: "error", text: data.error || "Eroare la rulare." });
      }
    } catch (e) {
      setMessage({ type: "error", text: e instanceof Error ? e.message : "Eroare" });
    } finally {
      setRunningRunAuto(false);
    }
  };

  const runRunAutoPublishOnly = async () => {
    setRunningPublishWithLog(true);
    setPublishLogs([]);
    setMessage(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        setMessage({ type: "error", text: "Sesiune invalidă." });
        return;
      }
      const res = await fetch("/api/admin/sync-repes/publish-unpublished", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}`, "x-publish-stream": "1" },
        body: "{}",
      });
      if (!res.ok || !res.body) {
        setMessage({ type: "error", text: "Eroare la publicare." });
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const obj = JSON.parse(line);
            if (obj.type === "log" && obj.msg) setPublishLogs((prev) => [...prev, obj.msg]);
            if (obj.type === "done") {
              setMessage({
                type: obj.success ? "success" : "error",
                text: `Publicare: ${obj.published ?? 0} publicate${(obj.failed ?? 0) > 0 ? `, ${obj.failed} eșec` : ""}.`,
              });
              fetchStats();
              fetchListings();
            }
          } catch {
            // ignore
          }
        }
      }
      if (buffer.trim()) {
        try {
          const obj = JSON.parse(buffer);
          if (obj.type === "log" && obj.msg) setPublishLogs((prev) => [...prev, obj.msg]);
          if (obj.type === "done") {
            setMessage({
              type: obj.success ? "success" : "error",
              text: `Publicare: ${obj.published ?? 0} publicate${(obj.failed ?? 0) > 0 ? `, ${obj.failed} eșec` : ""}.`,
            });
            fetchStats();
            fetchListings();
          }
        } catch {
          // ignore
        }
      }
    } catch (e) {
      setMessage({ type: "error", text: e instanceof Error ? e.message : "Eroare" });
    } finally {
      setRunningPublishWithLog(false);
    }
  };

  const runVerifyWithLog = async () => {
    setRunningVerifyWithLog(true);
    setVerifyLogs([]);
    setMessage(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) { setMessage({ type: "error", text: "Sesiune invalidă." }); return; }
      const res = await fetch("/api/admin/sync-repes/verify-status", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}`, "x-verify-stream": "1" },
        body: "{}",
      });
      if (!res.ok || !res.body) {
        setMessage({ type: "error", text: "Eroare la verificare stare." });
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const obj = JSON.parse(line);
            if (obj.type === "log" && obj.msg) setVerifyLogs((prev) => [...prev, obj.msg]);
            if (obj.type === "done" && obj.success && obj.summary) {
              setMessage({ type: "success", text: `Stare: ${obj.summary.softDeleted ?? 0} dezactivate, ${obj.summary.reactivated ?? 0} reactivate.` });
              fetchStats();
              fetchListings();
            } else if (obj.type === "done" && !obj.success) setMessage({ type: "error", text: obj.error || "Eroare" });
          } catch {
            // ignore
          }
        }
      }
      if (buffer.trim()) {
        try {
          const obj = JSON.parse(buffer);
          if (obj.type === "log" && obj.msg) setVerifyLogs((prev) => [...prev, obj.msg]);
          if (obj.type === "done" && obj.success && obj.summary) {
            setMessage({ type: "success", text: `Stare: ${obj.summary.softDeleted ?? 0} dezactivate, ${obj.summary.reactivated ?? 0} reactivate.` });
            fetchStats();
            fetchListings();
          }
        } catch {
          // ignore
        }
      }
    } catch (e) {
      setMessage({ type: "error", text: e instanceof Error ? e.message : "Eroare" });
    } finally {
      setRunningVerifyWithLog(false);
    }
  };

  const runSyncNewWithLog = async () => {
    setRunningSyncNewWithLog(true);
    setSyncNewLogs([]);
    setMessage(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) { setMessage({ type: "error", text: "Sesiune invalidă." }); return; }
      const res = await fetch("/api/admin/sync-repes/sync-new-only", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}`, "x-sync-stream": "1" },
        body: "{}",
      });
      if (!res.ok || !res.body) {
        setMessage({ type: "error", text: "Eroare la import anunțuri noi." });
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const obj = JSON.parse(line);
            if (obj.type === "log" && obj.msg) setSyncNewLogs((prev) => [...prev, obj.msg]);
            if (obj.type === "done" && obj.success) {
              setMessage({ type: "success", text: obj.message || `Inserate ${obj.inserted ?? 0} anunțuri noi.` });
              fetchStats();
              fetchListings();
            } else if (obj.type === "done" && !obj.success) setMessage({ type: "error", text: obj.error || "Eroare" });
          } catch {
            // ignore
          }
        }
      }
      if (buffer.trim()) {
        try {
          const obj = JSON.parse(buffer);
          if (obj.type === "log" && obj.msg) setSyncNewLogs((prev) => [...prev, obj.msg]);
          if (obj.type === "done" && obj.success) {
            setMessage({ type: "success", text: obj.message || `Inserate ${obj.inserted ?? 0} anunțuri noi.` });
            fetchStats();
            fetchListings();
          }
        } catch {
          // ignore
        }
      }
    } catch (e) {
      setMessage({ type: "error", text: e instanceof Error ? e.message : "Eroare" });
    } finally {
      setRunningSyncNewWithLog(false);
    }
  };

  const handlePublish = useCallback(async (listingIds: string[]) => {
    if (listingIds.length === 0) return;
    setPublishingIds((prev) => new Set([...prev, ...listingIds]));
    setPublishLog([]);
    setMessage(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) { setMessage({ type: "error", text: "Sesiune invalidă." }); return; }
      const res = await fetch("/api/admin/executari-publice/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ listingIds }),
      });
      const data = await res.json();
      const results = data.results || [];
      setPublishLog(results.map((r: { listingId: string; success: boolean; error?: string; url?: string }) => ({
        listingId: r.listingId,
        success: r.success,
        error: r.error,
        url: r.url,
      })));
      const ok = results.filter((r: { success: boolean }) => r.success).length;
      const fail = results.filter((r: { success: boolean }) => !r.success).length;
      const firstError = (results.find((r: { success?: boolean; error?: string }) => !r.success && r.error) as { error?: string } | undefined)?.error;
      setMessage({
        type: fail === 0 ? "success" : "error",
        text: fail === 0 ? `Publicate: ${ok}, eșecuri: ${fail}.` : `Publicate: ${ok}, eșecuri: ${fail}.${firstError ? ` Eroare: ${firstError}` : ""}`,
      });
      setSelectedIds(new Set());
      fetchStats();
      fetchListings();
    } catch (e) {
      setMessage({ type: "error", text: e instanceof Error ? e.message : "Eroare la publicare." });
    } finally {
      setPublishingIds((prev) => {
        const next = new Set(prev);
        listingIds.forEach((id) => next.delete(id));
        return next;
      });
    }
  }, []);

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const totalPages = Math.max(1, Math.ceil(totalCount / limit));

  const cleanLocationDisplay = (s: string | null | undefined) => {
    if (!s || !String(s).trim()) return s ?? null;
    return String(s).replace(/^\s*(location_on|place|my_location|pin_drop)\s*/gi, "").trim() || null;
  };

  /** Format identic REPES (prod.executori.ro/repes): zi.lună.an = DD.MM.YYYY. */
  const formatDateRepes = (s: string | null | undefined): string | null => {
    if (!s || !String(s).trim()) return null;
    const raw = String(s).trim();
    const pad = (n: number) => String(n).padStart(2, "0");
    const isoMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (isoMatch) {
      const y = isoMatch[1];
      const m = isoMatch[2];
      const d = isoMatch[3];
      return `${d}.${m}.${y}`;
    }
    const dmyMatch = raw.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})/);
    if (dmyMatch) {
      return `${pad(parseInt(dmyMatch[1], 10))}.${pad(parseInt(dmyMatch[2], 10))}.${dmyMatch[3]}`;
    }
    return null;
  };
  const parseDateRo = (s: string | null | undefined): Date | null => {
    if (!s || !String(s).trim()) return null;
    const raw = String(s).trim();
    const isoMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (isoMatch) {
      const d = new Date(+isoMatch[1], +isoMatch[2] - 1, +isoMatch[3]);
      return isNaN(d.getTime()) ? null : d;
    }
    const dmyMatch = raw.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})/);
    if (dmyMatch) {
      const day = parseInt(dmyMatch[1], 10);
      const month = parseInt(dmyMatch[2], 10) - 1;
      const year = parseInt(dmyMatch[3], 10);
      if (month < 0 || month > 11 || day < 1 || day > 31 || year < 1900 || year > 2100) return null;
      const d = new Date(year, month, day);
      return isNaN(d.getTime()) ? null : d;
    }
    const d = new Date(raw);
    return isNaN(d.getTime()) ? null : d;
  };
  const formatDate = (s: string | null | undefined) => {
    const d = parseDateRo(s);
    if (!d) return "—";
    return d.toLocaleString("ro-RO", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
  };
  /** Data licitației: format identic REPES (DD.MM.YYYY = zi.lună.an). */
  const formatDateOnly = (s: string | null | undefined): string | null => formatDateRepes(s) ?? (parseDateRo(s) ? parseDateRo(s)!.toLocaleDateString("ro-RO", { day: "2-digit", month: "2-digit", year: "numeric" }) : null);
  const formatRelativeTimeRo = (s: string | null | undefined) => {
    const d = parseDateRo(s);
    if (!d) return "—";
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    if (diff < 60000) return "acum";
    if (diff < 3600000) return `acum ${Math.floor(diff / 60000)} min`;
    if (diff < 86400000) return `acum ${Math.floor(diff / 3600000)} h`;
    if (diff < 604800000) return `acum ${Math.floor(diff / 86400000)} zile`;
    return formatDate(s);
  };

  const DetailRow = ({ label, value, missing }: { label: string; value: React.ReactNode; missing?: boolean }) => (
    <div className="py-1.5 border-b border-gray-100 last:border-0">
      <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</span>
      <div className={`mt-0.5 text-sm ${missing ? "text-amber-600 italic" : "text-gray-900"}`}>
        {value ?? "—"}
      </div>
    </div>
  );

  function RepesDetailPanel({
    detail,
    onExtractFromPdf,
    extractingPdfListingId,
    onSaveCategories,
    savingCategoriesId,
    onInferCategories,
    inferringCategoriesId,
    onSaveEdit,
    savingEditListingId,
  }: {
    detail: RepesListingDetail;
    onExtractFromPdf?: (listingId: string) => void;
    extractingPdfListingId?: string | null;
    onSaveCategories?: (listingId: string, main_category: string | null, category: string | null) => void;
    savingCategoriesId?: string | null;
    onInferCategories?: (listingId: string) => void;
    inferringCategoriesId?: string | null;
    onSaveEdit?: (listingId: string, payload: Record<string, unknown>) => void;
    savingEditListingId?: string | null;
  }) {
    const has = (v: string | null | undefined) => v != null && String(v).trim() !== "";
    const pdfUrlsFromDetail = (): string[] => {
      const u = detail.pdf_urls;
      const single = detail.pdf_url;
      if (Array.isArray(u) && u.length > 0) return u;
      return single ? [single] : [];
    };
    const imagesFromDetail = (): string[] => {
      if (detail.images?.length) return detail.images.map((i) => i.url);
      return [];
    };
    const [editTitle, setEditTitle] = React.useState("");
    const [editDescriptionHtml, setEditDescriptionHtml] = React.useState("");
    const [editPriceText, setEditPriceText] = React.useState("");
    const [editLocationCounty, setEditLocationCounty] = React.useState("");
    const [editLocationCity, setEditLocationCity] = React.useState("");
    const [editLocationRaw, setEditLocationRaw] = React.useState("");
    const [editAuctionDate, setEditAuctionDate] = React.useState("");
    const [editAuctionTime, setEditAuctionTime] = React.useState("");
    const [editPdfUrls, setEditPdfUrls] = React.useState<string[]>([]);
    const [editImages, setEditImages] = React.useState<string[]>([]);
    React.useEffect(() => {
      setEditTitle(detail.title ?? "");
      setEditDescriptionHtml(detail.description_html ?? "");
      setEditPriceText(detail.price_text ?? "");
      setEditLocationCounty(detail.location_county ?? "");
      setEditLocationCity(detail.location_city ?? "");
      setEditLocationRaw(detail.location_raw ?? "");
      setEditAuctionDate(detail.auction_date ? String(detail.auction_date).slice(0, 10) : "");
      setEditAuctionTime(detail.auction_time ?? "");
      setEditPdfUrls(pdfUrlsFromDetail());
      setEditImages(imagesFromDetail());
    }, [detail]);
    const hasPdf = has(detail.pdf_url) || (Array.isArray(detail.pdf_urls) && detail.pdf_urls.length > 0);
    const rawMeta = (detail as { meta_fields?: Record<string, string>; metaFields?: Record<string, string> }).meta_fields
      ?? (detail as { metaFields?: Record<string, string> }).metaFields;
    const meta = rawMeta && typeof rawMeta === "object" ? (rawMeta as Record<string, string>) : {};
    const fromMeta = (exactKeys: string[]) => {
      const v = exactKeys.map((k) => meta[k]).find((val) => val != null && String(val).trim() !== "");
      if (v !== undefined) return String(v).trim();
      return undefined;
    };
    const fromMetaByLabel = (...labelVariants: string[]) => {
      const normalize = (s: string) => s.toLowerCase().trim().replace(/\s*\([^)]*\)/g, "").replace(/\s+/g, " ").trim();
      const norms = labelVariants.map(normalize).filter(Boolean);
      for (const [key, val] of Object.entries(meta)) {
        if (!val || String(val).trim() === "") continue;
        const k = normalize(String(key));
        if (norms.some((n) => k === n || k.startsWith(n) || n.startsWith(k) || k.includes(n) || n.includes(k))) return String(val).trim();
      }
      return undefined;
    };
    const licitator = detail.seller_name ?? fromMeta(["Licitator", "Licitator name"]) ?? fromMetaByLabel("licitator", "Licitator");
    const email = detail.seller_email ?? fromMeta(["Email", "E-mail"]) ?? fromMetaByLabel("email", "Email");
    const telefon = detail.seller_phone ?? fromMeta(["Telefon", "Telefon (Phone)"]) ?? fromMetaByLabel("telefon", "Telefon");
    const adresa = detail.seller_address ?? fromMeta(["Adresă", "Adresă (Address)"]) ?? fromMetaByLabel("adresă", "adresa", "Adresă");
    return (
      <div className="p-6">
        <div className="mb-4 border-b border-gray-200 pb-2 flex flex-wrap items-center justify-between gap-2">
          <h4 className="text-sm font-semibold text-gray-800">Detalii anunț (REPES #{detail.source_external_id})</h4>
          {hasPdf && onExtractFromPdf && (
            <button
              type="button"
              onClick={() => onExtractFromPdf(detail.id)}
              disabled={extractingPdfListingId === detail.id}
              className="px-3 py-1.5 rounded-lg border border-blue-300 bg-blue-50 text-blue-800 text-sm font-medium hover:bg-blue-100 disabled:opacity-60 flex items-center gap-1.5"
              title="Citește textul din PDF și actualizează descrierea, titlul, locația, prețul și detaliile anunțului"
            >
              {extractingPdfListingId === detail.id ? <i className="ri-loader-4-line animate-spin" /> : <i className="ri-file-text-line" />}
              Citește date din PDF
            </button>
          )}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <div className="space-y-0">
            <DetailRow label="Titlu" value={detail.title} missing={!has(detail.title)} />
            <DetailRow label="Preț" value={formatPriceTextForDisplayEuropean(detail.price_text)} missing={!has(detail.price_text)} />
            <DetailRow label="Locație bun" value={cleanLocationDisplay(detail.location_raw)} missing={!has(detail.location_raw)} />
            <DetailRow label="Județ" value={detail.location_county} missing={!has(detail.location_county)} />
            <DetailRow label="Oraș" value={detail.location_city} missing={!has(detail.location_city)} />
            <DetailRow label="Data încărcării" value={formatDateOnly(detail.published_at)} missing={!has(detail.published_at)} />
            <DetailRow label="Data licitației" value={detail.auction_date ? formatDateOnly(detail.auction_date) : null} missing={!detail.auction_date} />
            <DetailRow label="Ora licitației" value={detail.auction_time} missing={!has(detail.auction_time)} />
            {/* Cele 3 câmpuri de categorii – ca la filtre; editabile + Generează */}
            <div className="py-3 px-3 mt-2 rounded-lg bg-gray-50 border border-gray-200 space-y-3">
              <div>
                <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide block mb-0.5">CATEGORIE</span>
                <div className="text-sm text-gray-900 font-medium">{FILTER_TOP_CATEGORY_EXECUTARI}</div>
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide block mb-0.5">CAT. PRINCIPALĂ</label>
                <select
                  value={String((detail as { main_category?: string | null }).main_category ?? "")}
                  onChange={(e) => onSaveCategories?.(detail.id, e.target.value || null, null)}
                  disabled={savingCategoriesId === detail.id}
                  className="w-full rounded border border-gray-300 bg-white text-gray-900 px-2 py-1.5 text-sm min-h-[32px]"
                >
                  <option value="">—</option>
                  {EXECUTARI_CAT_PRINCIPALA.map((mc) => (
                    <option key={mc} value={mc}>{mc}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide block mb-0.5">SUBCATEGORIE</label>
                {(() => {
                  const mainCat = (detail as { main_category?: string | null }).main_category ?? "";
                  const subcats = mainCat ? getExecutariSubcategoriiForFilter(mainCat) : [];
                  if (subcats.length === 0) {
                    return <div className="text-sm text-gray-500 italic py-1">Alege mai întâi Cat. principală</div>;
                  }
                  return (
                    <select
                      value={String((detail as { category?: string | null }).category ?? "")}
                      onChange={(e) => onSaveCategories?.(detail.id, mainCat || null, e.target.value || null)}
                      disabled={savingCategoriesId === detail.id}
                      className="w-full rounded border border-gray-300 bg-white text-gray-900 px-2 py-1.5 text-sm min-h-[32px]"
                    >
                      {subcats.map((s) => (
                        <option key={s.value !== "" ? s.value : "toate"} value={s.value}>{s.label}</option>
                      ))}
                    </select>
                  );
                })()}
              </div>
              {onInferCategories && (
                <button
                  type="button"
                  onClick={() => onInferCategories(detail.id)}
                  disabled={inferringCategoriesId === detail.id}
                  className="px-3 py-1.5 rounded-lg border border-orange-300 bg-orange-50 text-orange-800 text-sm font-medium hover:bg-orange-100 disabled:opacity-60 flex items-center gap-1.5"
                  title="Generează Cat. principală și Subcategorie din titlu și descriere"
                >
                  {inferringCategoriesId === detail.id ? <i className="ri-loader-4-line animate-spin" /> : <i className="ri-magic-line" />}
                  Generează categorii
                </button>
              )}
            </div>
          </div>
          <div className="space-y-0">
            <DetailRow label="Licitator" value={licitator} missing={!has(licitator)} />
            <DetailRow label="Email" value={email} missing={!has(email)} />
            <DetailRow label="Telefon" value={telefon} missing={!has(telefon)} />
            <DetailRow label="Adresă" value={adresa} missing={!has(adresa)} />
            <DetailRow
              label={(() => {
                const fromUrls = Array.isArray(detail.pdf_urls) && detail.pdf_urls.length > 0 ? detail.pdf_urls : [];
                const withSingle = detail.pdf_url && !fromUrls.includes(detail.pdf_url) ? [...fromUrls, detail.pdf_url] : fromUrls;
                const n = withSingle.length || (detail.pdf_url ? 1 : 0);
                return n > 0 ? `PDF${n > 1 ? ` (${n})` : ""}` : "PDF";
              })()}
              value={
                (() => {
                  const fromUrls = Array.isArray(detail.pdf_urls) && detail.pdf_urls.length > 0 ? detail.pdf_urls : [];
                  const withSingle = detail.pdf_url && !fromUrls.includes(detail.pdf_url) ? [...fromUrls, detail.pdf_url] : fromUrls;
                  const urls = withSingle.length > 0 ? withSingle : (detail.pdf_url ? [detail.pdf_url] : []);
                  if (urls.length === 0) return null;
                  return (
                    <div className="flex flex-col gap-0.5">
                      {urls.map((url, i) => (
                        <a key={i} href={url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                          PDF {i + 1}
                        </a>
                      ))}
                    </div>
                  );
                })()
              }
              missing={!has(detail.pdf_url) && !(detail.pdf_urls?.length)}
            />
            <DetailRow label="Sursă anunț" value={<a href={detail.source_url} target="_blank" rel="noopener noreferrer" className="text-emerald-600 hover:underline">Deschide pe REPES</a>} />
            <DetailRow label="Cod anunț" value={detail.product_cod_anunt ?? undefined} missing={!detail.product_cod_anunt} />
            <DetailRow label="Imagini" value={detail.images?.length ?? detail.images_count ?? 0} missing={!(detail.images?.length ?? detail.images_count)} />
          </div>
          <div className="space-y-0">
            <DetailRow label="Ultima vedere" value={formatDate(detail.last_seen_at)} />
            <DetailRow label="Creat la" value={<span title={formatDate(detail.created_at)}>{formatRelativeTimeRo(detail.created_at)} <span className="text-gray-400 text-xs">({formatDate(detail.created_at)})</span></span>} />
            <DetailRow label="Actualizat la" value={formatDate(detail.updated_at)} />
            <DetailRow
              label="Status"
              value={
                <span>
                  {detail.deleted_at
                    ? <span className="text-red-600">Dezactivat</span>
                    : detail.reactivated_at
                      ? <span className="text-orange-600 font-medium">Reactivat</span>
                      : <span className="text-emerald-600">Activ</span>}
                  <span className="ml-1 text-gray-400 text-xs font-normal" title="Sincronizat de la prod.executori.ro/repes">(REPES)</span>
                </span>
              }
            />
          </div>
        </div>

        {detail.product_id && onSaveEdit && (
          <div className="mt-6 pt-6 border-t-2 border-emerald-200 bg-emerald-50/50 rounded-xl p-4">
            <h5 className="text-sm font-semibold text-emerald-900 mb-3 flex items-center gap-2">
              <i className="ri-edit-line" />
              Editare anunț publicat pe site
            </h5>
            <p className="text-xs text-emerald-800/80 mb-4">Modificările se salvează instant pe site. Toate câmpurile sunt editabile.</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-0.5">Titlu</label>
                <input
                  type="text"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
                  placeholder="Titlu anunț"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-0.5">Preț (text afișat)</label>
                <input
                  type="text"
                  value={editPriceText}
                  onChange={(e) => setEditPriceText(e.target.value)}
                  className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
                  placeholder="ex: 10.000,00 Lei"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-0.5">Județ</label>
                <input
                  type="text"
                  value={editLocationCounty}
                  onChange={(e) => setEditLocationCounty(e.target.value)}
                  className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-0.5">Oraș</label>
                <input
                  type="text"
                  value={editLocationCity}
                  onChange={(e) => setEditLocationCity(e.target.value)}
                  className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-xs font-medium text-gray-600 mb-0.5">Locație bun (adresă / descriere loc)</label>
                <input
                  type="text"
                  value={editLocationRaw}
                  onChange={(e) => setEditLocationRaw(e.target.value)}
                  className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-0.5">Data licitației</label>
                <input
                  type="date"
                  value={editAuctionDate}
                  onChange={(e) => setEditAuctionDate(e.target.value)}
                  className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-0.5">Ora licitației</label>
                <input
                  type="text"
                  value={editAuctionTime}
                  onChange={(e) => setEditAuctionTime(e.target.value)}
                  className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
                  placeholder="ex: 10:00"
                />
              </div>
            </div>
            <div className="mt-4">
              <label className="block text-xs font-medium text-gray-600 mb-1">Descriere (HTML)</label>
              <textarea
                value={editDescriptionHtml}
                onChange={(e) => setEditDescriptionHtml(e.target.value)}
                rows={6}
                className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm font-mono"
                placeholder="Descriere HTML"
              />
            </div>
            <div className="mt-4">
              <label className="block text-xs font-medium text-gray-600 mb-1">URL-uri PDF (unul per linie / câmp)</label>
              <div className="space-y-1">
                {editPdfUrls.map((url, i) => (
                  <div key={i} className="flex gap-1">
                    <input
                      type="url"
                      value={url}
                      onChange={(e) => setEditPdfUrls((prev) => prev.map((u, j) => (j === i ? e.target.value : u)))}
                      className="flex-1 rounded border border-gray-300 px-2 py-1 text-sm"
                    />
                    <button type="button" onClick={() => setEditPdfUrls((prev) => prev.filter((_, j) => j !== i))} className="px-2 py-1 text-red-600 hover:bg-red-50 rounded" title="Șterge">×</button>
                  </div>
                ))}
                <button type="button" onClick={() => setEditPdfUrls((prev) => [...prev, ""])} className="text-xs text-emerald-700 hover:underline">+ Adaugă PDF</button>
              </div>
            </div>
            <div className="mt-4">
              <label className="block text-xs font-medium text-gray-600 mb-1">URL-uri imagini (ordinea = galeria)</label>
              <div className="space-y-1">
                {editImages.map((url, i) => (
                  <div key={i} className="flex gap-1">
                    <input
                      type="url"
                      value={url}
                      onChange={(e) => setEditImages((prev) => prev.map((u, j) => (j === i ? e.target.value : u)))}
                      className="flex-1 rounded border border-gray-300 px-2 py-1 text-sm"
                    />
                    <button type="button" onClick={() => setEditImages((prev) => prev.filter((_, j) => j !== i))} className="px-2 py-1 text-red-600 hover:bg-red-50 rounded" title="Șterge">×</button>
                  </div>
                ))}
                <button type="button" onClick={() => setEditImages((prev) => [...prev, ""])} className="text-xs text-emerald-700 hover:underline">+ Adaugă imagine</button>
              </div>
            </div>
            <div className="mt-4 flex items-center gap-3">
              <button
                type="button"
                disabled={savingEditListingId === detail.id}
                onClick={() => onSaveEdit(detail.id, {
                  title: editTitle || null,
                  description_html: editDescriptionHtml || null,
                  price_text: editPriceText || null,
                  location_county: editLocationCounty || null,
                  location_city: editLocationCity || null,
                  location_raw: editLocationRaw || null,
                  auction_date: editAuctionDate || null,
                  auction_time: editAuctionTime || null,
                  pdf_urls: editPdfUrls.filter((u) => u.trim() !== ""),
                  images: editImages.filter((u) => u.trim() !== ""),
                  main_category: (detail as { main_category?: string | null }).main_category ?? null,
                  category: (detail as { category?: string | null }).category ?? null,
                })}
                className="px-4 py-2 bg-emerald-600 text-white rounded-lg font-medium hover:bg-emerald-700 disabled:opacity-60 flex items-center gap-2"
              >
                {savingEditListingId === detail.id ? <i className="ri-loader-4-line animate-spin" /> : <i className="ri-save-line" />}
                Salvează modificările pe site
              </button>
              {detail.product_slug && (
                <a
                  href={`/licitatii-publice/${detail.product_slug}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-emerald-700 hover:underline"
                >
                  Deschide anunțul pe site →
                </a>
              )}
            </div>
          </div>
        )}

        {Object.keys(meta).length > 0 && (
          <div className="mt-4 pt-4 border-t border-gray-200">
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Detalii din anunț (tabel site)</span>
            <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-1 text-sm">
              {Object.entries(meta).map(([label, value]) => (
                <div key={label} className="py-1 border-b border-gray-100">
                  <span className="text-gray-500 font-medium">{label}</span>
                  <div className="text-gray-900 mt-0.5">{String(value)}</div>
                </div>
              ))}
            </div>
          </div>
        )}
        {(() => {
          const galleryImages = (detail.images ?? []).filter(
            (img) => !/google\.com.*maps|maps\.google/i.test(img.url)
          );
          return galleryImages.length > 0 ? (
            <div className="mt-4 pt-4 border-t border-gray-200">
              <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Imagini (galerie)</span>
              <div className="mt-2 flex flex-wrap gap-2">
                {galleryImages.map((img) => (
                  <a key={img.id} href={img.url} target="_blank" rel="noopener noreferrer" className="block">
                    <img src={img.url} alt="" className="h-20 w-20 object-cover rounded border border-gray-200" />
                  </a>
                ))}
              </div>
            </div>
          ) : null;
        })()}
        <div className="mt-4 pt-4 border-t border-gray-200">
          <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Descriere</span>
          <div className={`mt-2 text-sm rounded border p-3 max-h-48 overflow-auto bg-white ${has(detail.description_html) ? "text-gray-900 border-gray-200" : "text-amber-600 italic border-amber-200"}`}>
            {has(detail.description_html) ? <div dangerouslySetInnerHTML={{ __html: detail.description_html || "" }} /> : "— (lipsă)"}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <button
        onClick={() => router.push("/admin/importuri")}
        className="mb-4 flex items-center gap-2 text-gray-600 hover:text-gray-900"
      >
        <i className="ri-arrow-left-line" />
        Înapoi la Importuri
      </button>

      <div className="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden mb-6">
        <div className="p-6 border-b border-gray-200">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">EXECUTARI-PUBLICE</h1>
              <p className="text-gray-600 text-sm mt-1 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-green-500 shrink-0" />
                Sincronizare cu <strong>{REPES_BASE}</strong>
              </p>
              <div className="mt-3 flex items-center gap-3">
                <Link
                  href="/admin/importuri/executari-publice/panel"
                  className="px-3 py-1.5 rounded-lg border border-gray-300 bg-white text-gray-800 text-sm font-medium hover:bg-gray-50 flex items-center gap-1.5"
                >
                  <i className="ri-dashboard-3-line" />
                  Panel
                </Link>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3 mb-3">
              <span className="text-sm text-gray-600">Interval scanare automată:</span>
              <select
                value={autoConfig?.interval_hours ?? 6}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  setAutoConfig((c) => ({ ...(c ?? { interval_hours: 6, sync_new: true, verify_status: true, auto_publish: false, last_run_at: null }), interval_hours: v }));
                  handleSaveAutoConfig({ interval_hours: v });
                }}
                className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-800"
              >
                {[1, 3, 6, 12, 24].map((h) => (
                  <option key={h} value={h}>{h} {h === 1 ? "oră" : "ore"}</option>
                ))}
              </select>
              <span className="text-xs text-gray-500">(cron apelează run-auto la acest interval)</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 flex flex-col">
                <p className="text-xs text-gray-500 uppercase">Active</p>
                <p className="text-xl font-bold text-emerald-600">{stats?.active ?? "—"}</p>
                <div className="mt-2 flex items-center gap-2 flex-wrap">
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={autoConfig?.verify_status ?? true}
                      onChange={(e) => {
                        const v = e.target.checked;
                        setAutoConfig((c) => ({ ...(c ?? { interval_hours: 6, sync_new: true, verify_status: true, auto_publish: false, last_run_at: null }), verify_status: v }));
                        handleSaveAutoConfig({ verify_status: v });
                      }}
                      className="sr-only peer"
                    />
                    <span className={`w-9 h-5 rounded-full block transition-colors ${autoConfig?.verify_status !== false ? "bg-emerald-500" : "bg-gray-300"}`} />
                    <span className={`absolute left-0.5 top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${autoConfig?.verify_status !== false ? "translate-x-4" : "translate-x-0"}`} style={{ top: "2px" }} />
                  </label>
                  <span className="text-xs text-gray-600">{(autoConfig?.verify_status !== false) ? "On" : "Off"}</span>
                  <button
                    type="button"
                    onClick={runVerifyWithLog}
                    disabled={runningVerifyWithLog || isVerifyingStatus}
                    className="px-2 py-1 text-xs font-medium rounded border border-emerald-500 text-emerald-700 bg-emerald-50 hover:bg-emerald-100 disabled:opacity-50"
                  >
                    {runningVerifyWithLog ? "..." : "Rulează acum"}
                  </button>
                </div>
                {(verifyLogs.length > 0 || runningVerifyWithLog) && (
                  <div className="mt-2 p-2 rounded bg-slate-900 border border-slate-600">
                    <pre className="text-xs text-green-300 font-mono overflow-auto max-h-32 whitespace-pre-wrap break-words">
                      {runningVerifyWithLog && verifyLogs.length === 0 ? "Pornire..." : verifyLogs.join("\n")}
                    </pre>
                  </div>
                )}
              </div>
              <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 flex flex-col">
                <p className="text-xs text-gray-500 uppercase">Dezactivate</p>
                <p className="text-xl font-bold text-gray-600">{stats?.deleted ?? "—"}</p>
                <div className="mt-2 flex items-center gap-2 flex-wrap">
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={autoConfig?.verify_status ?? true}
                      onChange={(e) => {
                        const v = e.target.checked;
                        setAutoConfig((c) => ({ ...(c ?? { interval_hours: 6, sync_new: true, verify_status: true, auto_publish: false, last_run_at: null }), verify_status: v }));
                        handleSaveAutoConfig({ verify_status: v });
                      }}
                      className="sr-only peer"
                    />
                    <span className={`w-9 h-5 rounded-full block transition-colors ${autoConfig?.verify_status !== false ? "bg-emerald-500" : "bg-gray-300"}`} />
                    <span className={`absolute left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${autoConfig?.verify_status !== false ? "translate-x-4" : "translate-x-0"}`} style={{ top: "2px" }} />
                  </label>
                  <span className="text-xs text-gray-600">{(autoConfig?.verify_status !== false) ? "On" : "Off"}</span>
                  <button
                    type="button"
                    onClick={runVerifyWithLog}
                    disabled={runningVerifyWithLog || isVerifyingStatus}
                    className="px-2 py-1 text-xs font-medium rounded border border-gray-500 text-gray-700 bg-gray-100 hover:bg-gray-200 disabled:opacity-50"
                  >
                    {runningVerifyWithLog ? "..." : "Rulează acum"}
                  </button>
                </div>
                <p className="text-xs text-gray-500 mt-1">Verificare stare (același ca Active)</p>
              </div>
              <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 flex flex-col">
                <p className="text-xs text-gray-500 uppercase">Nepublicate</p>
                <p className="text-xl font-bold text-sky-600">{stats?.unpublished ?? "—"}</p>
                <div className="mt-2 flex items-center gap-2 flex-wrap">
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={autoConfig?.sync_new ?? true}
                      onChange={(e) => {
                        const v = e.target.checked;
                        setAutoConfig((c) => ({ ...(c ?? { interval_hours: 6, sync_new: true, verify_status: true, auto_publish: false, last_run_at: null }), sync_new: v }));
                        handleSaveAutoConfig({ sync_new: v });
                      }}
                      className="sr-only peer"
                    />
                    <span className={`w-9 h-5 rounded-full block transition-colors ${autoConfig?.sync_new !== false ? "bg-sky-500" : "bg-gray-300"}`} />
                    <span className={`absolute left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${autoConfig?.sync_new !== false ? "translate-x-4" : "translate-x-0"}`} style={{ top: "2px" }} />
                  </label>
                  <span className="text-xs text-gray-600">{(autoConfig?.sync_new !== false) ? "On" : "Off"}</span>
                  <button
                    type="button"
                    onClick={runSyncNewWithLog}
                    disabled={runningSyncNewWithLog || isSyncingNewOnly}
                    className="px-2 py-1 text-xs font-medium rounded border border-sky-500 text-sky-700 bg-sky-50 hover:bg-sky-100 disabled:opacity-50"
                  >
                    {runningSyncNewWithLog ? "..." : "Rulează acum"}
                  </button>
                </div>
                {(syncNewLogs.length > 0 || runningSyncNewWithLog) && (
                  <div className="mt-2 p-2 rounded bg-slate-900 border border-slate-600">
                    <pre className="text-xs text-green-300 font-mono overflow-auto max-h-32 whitespace-pre-wrap break-words">
                      {runningSyncNewWithLog && syncNewLogs.length === 0 ? "Pornire..." : syncNewLogs.join("\n")}
                    </pre>
                  </div>
                )}
              </div>
            </div>
            <div className="mt-4 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 flex flex-wrap items-center gap-3">
              <span className="text-sm text-gray-700">Publicare automată:</span>
              <span className="text-xs text-gray-500">un anunț la 5 secunde (unul câte unul, nu toate odată) la fiecare rulare auto</span>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoConfig?.auto_publish ?? false}
                  onChange={(e) => {
                    const v = e.target.checked;
                    setAutoConfig((c) => ({ ...(c ?? { interval_hours: 6, sync_new: true, verify_status: true, auto_publish: false, last_run_at: null }), auto_publish: v }));
                    handleSaveAutoConfig({ auto_publish: v });
                  }}
                  className="sr-only peer"
                />
                <span className={`w-9 h-5 rounded-full block transition-colors ${autoConfig?.auto_publish ? "bg-blue-500" : "bg-gray-300"}`} />
                <span className={`absolute left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${autoConfig?.auto_publish ? "translate-x-4" : "translate-x-0"}`} style={{ top: "2px" }} />
              </label>
              <span className="text-xs text-gray-600">{(autoConfig?.auto_publish) ? "On" : "Off"}</span>
              <button
                type="button"
                onClick={runRunAutoNow}
                disabled={runningRunAuto}
                className="ml-2 px-3 py-1.5 text-xs font-medium rounded border border-blue-500 text-blue-700 bg-blue-50 hover:bg-blue-100 disabled:opacity-50"
              >
                {runningRunAuto ? "Se rulează…" : "Rulează acum (import + verificare + publicare)"}
              </button>
              <button
                type="button"
                onClick={runRunAutoPublishOnly}
                disabled={runningPublishWithLog || runningRunAuto}
                className="ml-2 px-3 py-1.5 text-xs font-medium rounded border border-blue-600 text-blue-800 bg-blue-100 hover:bg-blue-200 disabled:opacity-50"
              >
                {runningPublishWithLog ? "Se publică…" : "Rulează doar publicare"}
              </button>
                {(publishLogs.length > 0 || runningPublishWithLog) && (
                  <div className="w-full mt-2 p-2 rounded bg-slate-900 border border-slate-600">
                    <pre className="text-xs text-green-300 font-mono overflow-auto max-h-40 whitespace-pre-wrap break-words">
                      {runningPublishWithLog && publishLogs.length === 0 ? "Pornire…" : publishLogs.join("\n")}
                    </pre>
                  </div>
                )}
            </div>
          </div>

          {message && (
            <div className={`mt-4 px-4 py-2 rounded-lg ${message.type === "success" ? "bg-green-50 text-green-800" : message.type === "info" ? "bg-sky-50 text-sky-800" : "bg-red-50 text-red-800"}`}>
              {message.text}
            </div>
          )}

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={handleTest}
              disabled={isTesting || isSyncing}
              className="px-4 py-2 border border-gray-500 text-gray-700 rounded-lg font-medium hover:bg-gray-50 disabled:opacity-60 flex items-center gap-2"
            >
              {isTesting ? <i className="ri-loader-4-line animate-spin" /> : <i className="ri-link" />}
              Test conexiune
            </button>
            <button
              type="button"
              onClick={handleExtractOne}
              disabled={isExtractingOne || isSyncing}
              className="hidden px-4 py-2 border border-amber-500 text-amber-700 rounded-lg font-medium hover:bg-amber-50 disabled:opacity-60 flex items-center gap-2"
              title="Extrage doar primul anunț de pe prima pagină REPES și afișează ce s-a extras"
            >
              {isExtractingOne ? <i className="ri-loader-4-line animate-spin" /> : <i className="ri-file-search-line" />}
              Extrage 1 produs (test)
            </button>
            <button
              type="button"
              onClick={handleCheckNew}
              disabled={isCheckingNew || isSyncing}
              className="px-4 py-2 border border-slate-500 text-slate-700 rounded-lg font-medium hover:bg-slate-50 disabled:opacity-60 flex items-center gap-2"
            >
              {isCheckingNew ? <i className="ri-loader-4-line animate-spin" /> : <i className="ri-refresh-line" />}
              Verifică anunțuri noi
            </button>
            <button
              type="button"
              onClick={handleSyncNewOnly}
              disabled={isSyncingNewOnly || isSyncing}
              className="px-4 py-2 border border-sky-500 text-sky-700 rounded-lg font-medium hover:bg-sky-50 disabled:opacity-60 flex items-center gap-2"
            >
              {isSyncingNewOnly ? <i className="ri-loader-4-line animate-spin" /> : <i className="ri-download-cloud-line" />}
              Sincronizează doar cele noi
            </button>
            <button
              type="button"
              onClick={handleSync}
              disabled={isSyncing}
              className="hidden px-4 py-2 bg-emerald-600 text-white rounded-lg font-medium hover:bg-emerald-700 disabled:opacity-60 flex items-center gap-2"
            >
              {isSyncing ? <i className="ri-loader-4-line animate-spin" /> : <i className="ri-download-cloud-2-line" />}
              Sincronizare completă
            </button>
            <button
              type="button"
              onClick={handleVerifyStatus}
              disabled={isVerifyingStatus || isSyncing}
              className="hidden px-4 py-2 border border-amber-500 text-amber-700 rounded-lg font-medium hover:bg-amber-50 disabled:opacity-60 flex items-center gap-2"
              title={selectedIds.size > 0 ? `Verifică starea (Activ/Dezactivat) doar pentru cele ${selectedIds.size} anunțuri selectate.` : "Parcurge prod.executori.ro/repes și actualizează Activ/Dezactivat în funcție de prezența anunțului pe site."}
            >
              {isVerifyingStatus ? <i className="ri-loader-4-line animate-spin" /> : <i className="ri-checkbox-circle-line" />}
              {selectedIds.size > 0 ? `Verificare stare (${selectedIds.size} selectate)` : "Verificare stare (REPES)"}
            </button>
          </div>

          {(syncLogs.length > 0 || isSyncing) && (
            <div className="mt-3 p-3 rounded-lg bg-slate-900 border border-slate-600">
              <p className="text-xs font-medium text-slate-300 mb-2">
                Log live Sincronizare completă (crawl → upsert → detalii)
              </p>
              <pre className="text-xs text-green-300 font-mono overflow-auto max-h-80 min-h-24 p-3 rounded bg-black/40 whitespace-pre-wrap break-words">
                {syncLogs.length === 0 && isSyncing ? "Se pornește sync-ul..." : syncLogs.join("\n")}
              </pre>
            </div>
          )}

          {(checkNewLogs.length > 0 || isCheckingNew) && (
            <div className="mt-3 p-3 rounded-lg bg-slate-900 border border-slate-600">
              <p className="text-xs font-medium text-slate-300 mb-2">
                Log live scanare (fiecare pagină + anunțuri extrase după fiecare pagină)
              </p>
              <pre className="text-xs text-green-300 font-mono overflow-auto max-h-64 min-h-24 p-3 rounded bg-black/40 whitespace-pre-wrap break-words">
                {checkNewLogs.length === 0 && isCheckingNew ? "Se pornește browserul..." : checkNewLogs.join("\n")}
              </pre>
            </div>
          )}

          {checkNewResult != null && (
            <div className="mt-3 p-3 rounded-lg bg-slate-50 border border-slate-200">
              <p className="text-sm font-medium text-slate-800">
                Pe primele <strong>{checkNewResult.pagesScanned ?? 1}</strong> pagini REPES: <strong>{checkNewResult.totalOnPage}</strong> anunțuri, <strong>{checkNewResult.newCount}</strong> noi (nu sunt în baza de date), <strong>{checkNewResult.existingCount}</strong> deja existente.
                {checkNewResult.lastPageOnSite != null && checkNewResult.lastPageOnSite > 1 && (
                  <span className="text-slate-600"> (site: {checkNewResult.lastPageOnSite} pagini)</span>
                )}
              </p>
              <p className="text-xs text-slate-500 mt-1">Apasă „Sincronizează doar cele noi” pentru a introduce anunțurile noi în listă.</p>
            </div>
          )}

          {extractOneResult != null && (
            <div className="mt-4 p-4 rounded-xl border border-gray-200 bg-gray-50">
              <h3 className="text-sm font-semibold text-gray-800 mb-3 flex items-center gap-2">
                <i className="ri-file-list-3-line" />
                Rezultat extragere 1 produs (test)
              </h3>
              {(extractOneResult.extractedFromList?.detailUrl as string | undefined) || (extractOneResult.listing?.source_url as string | undefined) ? (
                <a
                  href={(extractOneResult.extractedFromList?.detailUrl as string) || (extractOneResult.listing?.source_url as string)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 mb-3 px-3 py-2 rounded-lg bg-amber-500/20 text-amber-800 border border-amber-400/40 hover:bg-amber-500/30 font-medium text-sm"
                >
                  <i className="ri-external-link-line" />
                  Deschide anunțul pe REPES
                </a>
              ) : null}
              {extractOneResult.error && (
                <p className="text-sm text-red-600 mb-3">{extractOneResult.error}</p>
              )}
              {extractOneResult.extractedFromList && (
                <div className="mb-3">
                  <p className="text-xs font-medium text-gray-500 uppercase mb-1">Din listă (prima pagină)</p>
                  <pre className="text-xs bg-white p-3 rounded-lg overflow-auto max-h-32 border border-gray-200">
                    {JSON.stringify(extractOneResult.extractedFromList, null, 2)}
                  </pre>
                </div>
              )}
              {extractOneResult.extractedFromDetail && (
                <div className="mb-3">
                  <p className="text-xs font-medium text-gray-500 uppercase mb-1">Din pagina de detaliu</p>
                  <pre className="text-xs bg-white p-3 rounded-lg overflow-auto max-h-48 border border-gray-200">
                    {JSON.stringify(extractOneResult.extractedFromDetail, null, 2)}
                  </pre>
                </div>
              )}
              {extractOneResult.listing && (
                <div>
                  <p className="text-xs font-medium text-gray-500 uppercase mb-1">Înregistrare salvată (repes_listings)</p>
                  <pre className="text-xs bg-white p-3 rounded-lg overflow-auto max-h-40 border border-gray-200">
                    {JSON.stringify(extractOneResult.listing, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="p-4 border-t border-gray-200 flex flex-wrap gap-4">
          <select
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value as "active" | "deleted" | "all" | "unpublished" | "listed"); setPage(1); }}
            className="rounded-lg border border-gray-300 bg-white text-gray-800 px-3 py-2"
          >
            <option value="active">Active ({stats?.active ?? 0})</option>
            <option value="deleted">Dezactivate ({stats?.deleted ?? 0})</option>
            <option value="unpublished">Nelistate ({stats?.unpublished ?? 0})</option>
            <option value="listed">Listate ({stats?.listed ?? 0})</option>
            <option value="all">Toate ({stats?.total ?? 0})</option>
          </select>
          <select
            value={countyFilter}
            onChange={(e) => { setCountyFilter(e.target.value); setPage(1); }}
            className="rounded-lg border border-gray-300 bg-white text-gray-800 px-3 py-2"
          >
            <option value="">Toate județele</option>
            {(stats?.byCounty || []).map((c) => (
              <option key={c.county} value={c.county}>{c.county} ({c.count})</option>
            ))}
          </select>
            {/* Filtre 3 niveluri: identic cu admin Licitații publice */}
            {stats && (
              <>
                <span className="text-sm text-gray-500 self-center">CATEGORIE</span>
                <select
                  value={FILTER_TOP_CATEGORY_EXECUTARI}
                  disabled
                  className="rounded-lg border border-gray-300 bg-gray-50 text-gray-900 px-3 py-2 text-sm max-w-[220px] cursor-default"
                  title="Categoria pentru această pagină"
                >
                  <option value={FILTER_TOP_CATEGORY_EXECUTARI}>{FILTER_TOP_CATEGORY_EXECUTARI}</option>
                </select>
              </>
            )}
            {stats && (
              <>
                <span className="text-sm text-gray-500 self-center">CAT. PRINCIPALĂ</span>
                <select
                  value={mainCategoryFilter}
                  onChange={(e) => { setMainCategoryFilter(e.target.value); setCategoryFilter(""); setPage(1); }}
                  className="rounded-lg border border-gray-300 bg-white text-gray-800 px-3 py-2 text-sm max-w-[200px]"
                >
                  <option value="">Toate</option>
                  {(stats?.byMainCategory ?? []).map((mc) => (
                    <option key={mc.mainCategory} value={mc.mainCategory}>{mc.mainCategory} ({mc.count})</option>
                  ))}
                </select>
              </>
            )}
            {mainCategoryFilter && (() => {
              const subcats = getExecutariSubcategoriiForFilter(mainCategoryFilter);
              if (subcats.length === 0) return null;
              return (
                <>
                  <span className="text-sm text-gray-500 self-center">Subcategorie:</span>
                  <select
                    value={categoryFilter}
                    onChange={(e) => { setCategoryFilter(e.target.value); setPage(1); }}
                    className="rounded-lg border border-gray-300 bg-white text-gray-800 px-3 py-2 text-sm max-w-[200px]"
                  >
                    {subcats.map((s) => (
                      <option key={s.value || "toate"} value={s.value}>{s.label}</option>
                    ))}
                  </select>
                </>
              );
            })()}
          <input
            type="text"
            placeholder="Caută titlu, vânzător, ID..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && (setPage(1), fetchListings())}
            className="rounded-lg border border-gray-300 bg-white text-gray-800 px-3 py-2 min-w-[200px]"
          />
          <button
            type="button"
            onClick={() => { setPage(1); fetchListings(); }}
            className="px-4 py-2 bg-gray-200 text-gray-800 rounded-lg font-medium hover:bg-gray-300"
          >
            Actualizează listă
          </button>
          <button
            type="button"
            disabled={completingCategories}
            onClick={handleCompleteCategories}
            className="hidden px-4 py-2 bg-blue-100 text-blue-800 rounded-lg font-medium hover:bg-blue-200 disabled:opacity-60 flex items-center gap-1.5"
            title="Completează automat Cat. principală și Subcategorie pentru anunțurile fără categorii (din titlu și descriere)"
          >
            {completingCategories ? <i className="ri-loader-4-line animate-spin" /> : <i className="ri-price-tag-3-line" />}
            Completează categorii automat
          </button>
        </div>

        {selectedIds.size > 0 && (
          <div className="px-4 py-3 border-b border-amber-200 bg-amber-50 flex flex-wrap items-center gap-3">
            <span className="text-sm font-medium text-amber-900">{selectedIds.size} selectate</span>
            <button
              type="button"
              disabled={!listings.some((r) => !r.product_id && selectedIds.has(r.id))}
              onClick={() => handlePublish(listings.filter((r) => !r.product_id && selectedIds.has(r.id)).map((r) => r.id))}
              className="hidden px-4 py-2 bg-emerald-600 text-white rounded-lg font-medium hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              <i className="ri-upload-cloud-line" />
              Publică selectate ({listings.filter((r) => !r.product_id && selectedIds.has(r.id)).length} nepublicate)
            </button>
            <button
              type="button"
              disabled={deletingSelected}
              onClick={() => {
                if (!confirm(`Ștergi ${selectedIds.size} anunț(e)?`)) return;
                handleDeleteSelected(Array.from(selectedIds));
              }}
              className="px-4 py-2 border border-red-400 bg-red-500 text-white rounded-lg font-medium hover:bg-red-600 disabled:opacity-50"
            >
              {deletingSelected ? <i className="ri-loader-4-line animate-spin" /> : <i className="ri-delete-bin-line" />}
              Șterge selectate
            </button>
            <button type="button" onClick={() => setSelectedIds(new Set())} className="text-sm text-amber-800 hover:underline">
              Anulează selecția
            </button>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-gray-100 text-gray-700 sticky top-0">
              <tr>
                <th className="w-10 px-2 py-2 text-center">
                  <input
                    type="checkbox"
                    checked={listings.length > 0 && listings.every((r) => selectedIds.has(r.id))}
                    onChange={() => {
                      if (listings.every((r) => selectedIds.has(r.id))) {
                        setSelectedIds((prev) => { const n = new Set(prev); listings.forEach((r) => n.delete(r.id)); return n; });
                      } else {
                        setSelectedIds((prev) => { const n = new Set(prev); listings.forEach((r) => n.add(r.id)); return n; });
                      }
                    }}
                  />
                </th>
                <th className="px-2 py-2 font-medium">ID</th>
                <th className="px-2 py-2 font-medium">Cod anunț</th>
                <th className="px-2 py-2 font-medium">Titlu</th>
                <th className="px-2 py-2 font-medium">Preț</th>
                <th className="px-2 py-2 font-medium">Județ / Oraș</th>
                <th className="px-2 py-2 font-medium">Cat. principală</th>
                <th className="px-2 py-2 font-medium">Subcategorie</th>
                <th className="px-2 py-2 font-medium">Data licitației</th>
                <th className="px-2 py-2 font-medium">PDF</th>
                <th className="px-2 py-2 font-medium">Imagini</th>
                <th className="px-2 py-2 font-medium">Adăugat</th>
                <th className="px-2 py-2 font-medium">Ultima vedere</th>
                <th className="px-2 py-2 font-medium" title="Activ = prezent pe prod.executori.ro/repes; Dezactivat = absent de pe site">Status</th>
                <th className="px-2 py-2 font-medium">Pe site</th>
                <th className="px-2 py-2 font-medium">Link</th>
                <th className="px-2 py-2 font-medium w-20">Detalii</th>
                <th className="px-2 py-2 font-medium">Acțiuni</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {loadingList ? (
                <tr><td colSpan={17} className="px-4 py-8 text-center text-gray-500">Se încarcă...</td></tr>
              ) : listings.length === 0 ? (
                <tr><td colSpan={17} className="px-4 py-8 text-center text-gray-500">Niciun anunț.</td></tr>
              ) : (
                listings.map((row) => (
                  <React.Fragment key={row.id}>
                    <tr className="bg-white hover:bg-gray-50">
                      <td className="w-10 px-2 py-2 text-center">
                        <input
                          type="checkbox"
                          checked={selectedIds.has(row.id)}
                          onChange={() => toggleSelect(row.id)}
                        />
                      </td>
                      <td className="px-2 py-2 text-gray-600 font-mono text-xs" title={row.source_external_id}>{String(row.source_external_id).slice(0, 12)}{(row.source_external_id?.length ?? 0) > 12 ? "…" : ""}</td>
                      <td className="px-2 py-2 font-mono text-xs font-semibold text-gray-700">{row.product_cod_anunt ?? "—"}</td>
                      <td className="px-2 py-2 font-medium text-gray-900 max-w-[220px]">
                        <span className="line-clamp-2" title={row.title || ""}>{row.title || "—"}</span>
                      </td>
                      <td className="px-2 py-2 text-gray-600">{formatPriceTextForDisplayEuropean(row.price_text)}</td>
                      <td className="px-2 py-2 text-gray-600">
                        {row.location_county || "—"}
                        {row.location_city ? <span className="text-gray-500"> / {row.location_city}</span> : null}
                      </td>
                      <td className="px-2 py-2">
                        <select
                          value={row.main_category ?? ""}
                          onChange={(e) => {
                            const v = e.target.value || null;
                            saveListingCategories(row.id, v, null);
                          }}
                          disabled={savingCategoriesId === row.id}
                          className="rounded border border-gray-300 bg-white text-gray-900 px-1.5 py-1 text-xs max-w-[140px] w-full"
                          title="Cat. principală – salvat la schimbare"
                        >
                          <option value="">—</option>
                          {EXECUTARI_CAT_PRINCIPALA.map((mc) => (
                            <option key={mc} value={mc}>{mc}</option>
                          ))}
                        </select>
                        {savingCategoriesId === row.id ? <span className="ml-0.5 text-gray-400"><i className="ri-loader-4-line animate-spin" /></span> : null}
                      </td>
                      <td className="px-2 py-2">
                        {row.main_category ? (
                          <select
                            value={row.category ?? ""}
                            onChange={(e) => {
                              const v = e.target.value || null;
                              saveListingCategories(row.id, row.main_category ?? null, v);
                            }}
                            disabled={savingCategoriesId === row.id}
                            className="rounded border border-gray-300 bg-white text-gray-900 px-1.5 py-1 text-xs max-w-[160px] w-full"
                            title="Subcategorie – salvat la schimbare"
                          >
                            {getExecutariSubcategoriiForFilter(row.main_category).map((s) => (
                              <option key={s.value || "toate"} value={s.value}>{s.label}</option>
                            ))}
                          </select>
                        ) : (
                          <span className="text-gray-400 text-xs">—</span>
                        )}
                      </td>
                      <td className="px-2 py-2 text-gray-600 whitespace-nowrap">
                        {row.auction_date ? formatDateOnly(row.auction_date) : "—"}
                      </td>
                      <td className="px-2 py-2">
                        {(() => {
                          const fromUrls = Array.isArray(row.pdf_urls) && row.pdf_urls.length > 0 ? row.pdf_urls : [];
                          const withSingle = row.pdf_url && !fromUrls.includes(row.pdf_url) ? [...fromUrls, row.pdf_url] : fromUrls;
                          const urls = withSingle.length > 0 ? withSingle : (row.pdf_url ? [row.pdf_url] : []);
                          if (urls.length === 0) return "—";
                          return (
                            <span className="inline-flex flex-col gap-0.5">
                              {urls.map((url, i) => (
                                <a key={i} href={url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 text-blue-600 hover:underline text-xs w-fit">
                                  <i className="ri-file-pdf-line" />
                                  PDF {i + 1}
                                </a>
                              ))}
                            </span>
                          );
                        })()}
                      </td>
                      <td className="px-2 py-2 text-gray-600">{row.images_count != null ? row.images_count : "—"}</td>
                      <td className="px-2 py-2 text-gray-600 whitespace-nowrap" title={formatDate(row.created_at)}>{formatRelativeTimeRo(row.created_at)}</td>
                      <td className="px-2 py-2 text-gray-500 whitespace-nowrap">{formatDate(row.last_seen_at)}</td>
                      <td className="px-2 py-2">
                        {row.deleted_at ? <span className="text-red-600 text-xs">Dezactivat</span> : row.reactivated_at ? <span className="text-orange-600 text-xs font-medium">Reactivat</span> : <span className="text-emerald-600 text-xs">Activ</span>}
                      </td>
                      <td className="px-2 py-2">
                        {row.product_id && row.product_slug ? (
                          <div className="flex flex-col gap-1.5">
                            <div className="flex flex-wrap items-center gap-2">
                              <a href={`/licitatii-publice/${row.product_slug}`} target="_blank" rel="noopener noreferrer" className="text-emerald-600 hover:underline text-xs">
                                Vizualizează <i className="ri-external-link-line" />
                              </a>
                              <button
                                type="button"
                                disabled={regeneratingListingId === row.id}
                                onClick={() => handleRegenerateProduct(row.id)}
                                className="inline-flex items-center justify-center gap-1 px-2 py-1 rounded text-xs font-medium border border-red-400 bg-red-500 text-white hover:bg-red-600 disabled:opacity-60"
                                title="Resincronizează din REPES apoi actualizează titlu, descriere, preț, imagini pe site. Nu modifică câmpurile sincronizate (executor, Detalii anunț)."
                              >
                                {regeneratingListingId === row.id ? <i className="ri-loader-4-line animate-spin" /> : <i className="ri-refresh-line" />}
                                <span>{regeneratingListingId === row.id ? "…" : "Resincronizează"}</span>
                              </button>
                              <button
                                type="button"
                                disabled={recreatingListingId === row.id}
                                onClick={() => handleRecreateProduct(row.id)}
                                className="inline-flex items-center justify-center gap-1 px-2 py-1 rounded text-xs font-medium border border-amber-500 bg-amber-500 text-white hover:bg-amber-600 disabled:opacity-60"
                                title="Șterge anunțul vechi de pe site și creează unul nou cu titlu și descriere din PDF."
                              >
                                {recreatingListingId === row.id ? <i className="ri-loader-4-line animate-spin" /> : <i className="ri-file-add-line" />}
                                <span>{recreatingListingId === row.id ? "…" : "Regenerare anunț site"}</span>
                              </button>
                            </div>
                            <button
                              type="button"
                              disabled={updatingDisplayListingId === row.id}
                              onClick={() => handleUpdateProductDisplay(row.id)}
                              className="inline-flex items-center justify-center gap-1 px-2 py-1 rounded text-xs font-medium border border-gray-300 bg-gray-50 text-gray-700 hover:bg-gray-100 disabled:opacity-60 w-fit"
                              title="Actualizează doar titlul, descrierea, prețul, imaginile pe site din datele din DB. Nu apelează REPES. Nu șterge câmpurile sincronizate."
                            >
                              {updatingDisplayListingId === row.id ? <i className="ri-loader-4-line animate-spin" /> : <i className="ri-file-edit-line" />}
                              <span>{updatingDisplayListingId === row.id ? "…" : "Actualizează anunț pe site"}</span>
                            </button>
                          </div>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                      <td className="px-2 py-2">
                        <a href={row.source_url} target="_blank" rel="noopener noreferrer" className="text-emerald-600 hover:underline" title="Deschide pe REPES"><i className="ri-external-link-line" /></a>
                      </td>
                      <td className="px-2 py-2">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => toggleDetail(row.id)}
                            className={`px-2 py-1 rounded text-xs font-medium ${expandedId === row.id ? "bg-emerald-500 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"}`}
                          >
                            {expandedId === row.id ? "Ascunde" : "Detalii"}
                          </button>
                          <button
                            type="button"
                            disabled={deletingListingId === row.id}
                            onClick={() => handleDeleteListing(row.id)}
                            className="px-2 py-1 rounded text-xs font-medium border border-red-300 bg-red-50 text-red-700 hover:bg-red-100 disabled:opacity-60"
                            title="Șterge anunțul din listă; dacă e publicat, șterge și produsul de pe site."
                          >
                            {deletingListingId === row.id ? <i className="ri-loader-4-line animate-spin" /> : <i className="ri-delete-bin-line" />}
                            <span className="ml-0.5">{deletingListingId === row.id ? "…" : "Șterge"}</span>
                          </button>
                        </div>
                      </td>
                      <td className="px-2 py-2">
                        {!row.product_id && (
                          <button
                            type="button"
                            disabled={publishingIds.has(row.id)}
                            onClick={() => handlePublish([row.id])}
                            className="px-2 py-1 bg-emerald-600 text-white text-xs rounded hover:bg-emerald-700 disabled:opacity-50"
                          >
                            {publishingIds.has(row.id) ? "..." : "Publică"}
                          </button>
                        )}
                      </td>
                    </tr>
                    {expandedId === row.id && (
                      <tr>
                        <td colSpan={15} className="p-0 border-b border-gray-200 bg-gray-50">
                          {loadingDetail === row.id ? (
                            <div className="p-6 text-center text-gray-500"><i className="ri-loader-4-line animate-spin text-2xl" /></div>
                          ) : detailCache[row.id] ? (
                            <RepesDetailPanel
                              detail={detailCache[row.id]}
                              onExtractFromPdf={handleExtractFromPdf}
                              extractingPdfListingId={extractingPdfListingId}
                              onSaveCategories={saveListingCategories}
                              savingCategoriesId={savingCategoriesId}
                              onInferCategories={handleInferOneCategories}
                              inferringCategoriesId={inferringCategoriesId}
                              onSaveEdit={handleSaveEditListingAndProduct}
                              savingEditListingId={savingEditListingId}
                            />
                          ) : (
                            <div className="p-6 text-center text-gray-500">Eroare la încărcare</div>
                          )}
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="p-4 border-t border-gray-200 flex items-center justify-between flex-wrap gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={selectedIds.size === 0 || !listings.some((r) => !r.product_id && selectedIds.has(r.id))}
              onClick={() => handlePublish(listings.filter((r) => !r.product_id && selectedIds.has(r.id)).map((r) => r.id))}
              className="px-4 py-2 bg-emerald-600 text-white rounded-lg font-medium hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Publică pe site ({listings.filter((r) => !r.product_id && selectedIds.has(r.id)).length} nepublicate)
            </button>
            <button
              type="button"
              disabled={selectedIds.size === 0 || deletingSelected}
              onClick={() => {
                if (!confirm(`Ștergi ${selectedIds.size} anunț(e)? Vor dispărea din listă; cele publicate vor fi șterse și de pe site.`)) return;
                handleDeleteSelected(Array.from(selectedIds));
              }}
              className="px-4 py-2 border border-red-400 bg-red-500 text-white rounded-lg font-medium hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {deletingSelected ? <i className="ri-loader-4-line animate-spin" /> : null}
              Șterge selectate ({selectedIds.size})
            </button>
          </div>
          <div className="flex shrink-0 items-center">
            <WheelPagination
              totalPages={totalPages}
              currentPage={page}
              onPageChange={(p) => setPage(p)}
              canGoNext={page < totalPages}
              isDarkMode={false}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
