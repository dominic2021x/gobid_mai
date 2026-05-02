"use client";

/**
 * Modul Import – Licitatii publice (licitatii-insolventa.ro)
 * Panou complet: sincronizare + statistici + listă produse sincronizate
 */

import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import WheelPagination, { WheelPaginationFooter } from "@/components/ui/wheel-pagination";
import { formatPriceTextForDisplay } from "@/lib/licitatii-price";
import { getCodAnuntFromCategoryAndId } from "@/lib/licitatii-cod-anunt";
import { effectiveMainCategoryForFilter, FILTER_TOP_CATEGORY_EXECUTARI, EXECUTARI_CAT_PRINCIPALA, getExecutariSubcategoriiForFilter } from "@/lib/data/ro-categories";

/** Paletă culori pentru grupuri vânzător – același vânzător primește mereu aceeași culoare */
const VENDOR_PALETTE = [
  { border: "border-l-4 border-blue-400", bg: "bg-blue-50/60", header: "bg-blue-100/80 border-blue-200" },
  { border: "border-l-4 border-emerald-400", bg: "bg-emerald-50/60", header: "bg-emerald-100/80 border-emerald-200" },
  { border: "border-l-4 border-amber-400", bg: "bg-amber-50/60", header: "bg-amber-100/80 border-amber-200" },
  { border: "border-l-4 border-blue-400", bg: "bg-blue-50/60", header: "bg-blue-100/80 border-blue-200" },
  { border: "border-l-4 border-rose-400", bg: "bg-rose-50/60", header: "bg-rose-100/80 border-rose-200" },
  { border: "border-l-4 border-teal-400", bg: "bg-teal-50/60", header: "bg-teal-100/80 border-teal-200" },
  { border: "border-l-4 border-orange-400", bg: "bg-orange-50/60", header: "bg-orange-100/80 border-orange-200" },
  { border: "border-l-4 border-blue-400", bg: "bg-blue-50/60", header: "bg-blue-100/80 border-blue-200" },
  { border: "border-l-4 border-cyan-400", bg: "bg-cyan-50/60", header: "bg-cyan-100/80 border-cyan-200" },
  { border: "border-l-4 border-lime-400", bg: "bg-lime-50/60", header: "bg-lime-100/80 border-lime-200" },
] as const;

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/** Data licitației este în trecut (inclusiv sfârșitul zilei) */
function isAuctionDateInPast(row: ListingRow): boolean {
  if (!row.auction_date) return false;
  const d = new Date(row.auction_date);
  if (isNaN(d.getTime())) return false;
  d.setHours(23, 59, 59, 999);
  return d.getTime() <= Date.now();
}

/** Publicat pe /ro (are product_id) ȘI fără dată/oră sau cu data expirată sau dezactivat – pentru filtru și evidențiere roșie */
function isPublishedMissingOrExpiredDate(row: ListingRow): boolean {
  if (!row.product_id) return false;
  if (row.deleted_at) return true;
  if (!row.auction_date) return true;
  return isAuctionDateInPast(row);
}

function getCodAnunt(row: ListingRow): string {
  return getCodAnuntFromCategoryAndId(row.main_category, row.source_external_id);
}

const AUTO_VERIFY_KEY = "licitatii_auto_verify";
const AUTO_VERIFY_HOURS_KEY = "licitatii_auto_verify_hours";
const AUTO_ADD_NEW_KEY = "licitatii_auto_add_new";
const AUTO_VERIFY_STATUS_KEY = "licitatii_auto_verify_status";
const AUTO_VERIFY_STATUS_HOURS_KEY = "licitatii_auto_verify_status_hours";

/** Toate județele din România (alfabetic) – pentru filtre, indiferent de datele din DB */
const ROMANIAN_COUNTIES = [
  "Alba", "Arad", "Argeș", "Bacău", "Bihor", "Bistrița-Năsăud", "Botoșani",
  "Brașov", "Brăila", "București", "Buzău", "Caraș-Severin", "Călărași", "Cluj", "Constanța",
  "Covasna", "Dâmbovița", "Dolj", "Galați", "Giurgiu", "Gorj", "Harghita",
  "Hunedoara", "Ialomița", "Iași", "Ilfov", "Maramureș", "Mehedinți", "Mureș",
  "Neamț", "Olt", "Prahova", "Sălaj", "Satu Mare", "Sibiu", "Suceava",
  "Teleorman", "Timiș", "Tulcea", "Vâlcea", "Vaslui", "Vrancea",
];

interface SyncSummary {
  pagesCrawled: number;
  itemsFound: number;
  inserted: number;
  updated: number;
  softDeleted: number;
  detailsFetched: number;
  errors: string[];
}

interface VerifyStatusSummary {
  pagesCrawled: number;
  itemsFound: number;
  softDeleted: number;
  reactivated: number;
  errors: string[];
}

interface Stats {
  total: number;
  active: number;
  deleted: number;
  activeToday?: number;
  deletedToday?: number;
  reactivated?: number;
  reactivatedToday?: number;
  unpublished?: number;
  withPdf: number;
  withDescription: number;
  withoutDescription: number;
  withoutAuctionDate: number;
  withoutTitle: number;
  withoutCounty: number;
  withoutSellerDetails?: number;
  byCounty: { county: string; count: number }[];
  byCategory: { category: string; count: number }[];
  byMainCategory?: { mainCategory: string; count: number }[];
}

interface ListingRow {
  id: string;
  source_external_id: string;
  source_url: string;
  title: string | null;
  price_text: string | null;
  category: string | null;
  main_category: string | null;
  location_city: string | null;
  location_county: string | null;
  location_raw: string | null;
  pdf_url: string | null;
  pdf_urls: string[] | null;
  last_seen_at: string;
  deleted_at: string | null;
  reactivated_at: string | null;
  created_at: string;
  updated_at: string;
  seller_name: string | null;
  auction_date: string | null;
  sale_type: string | null;
  images_count: number;
  product_id?: string | null;
  product_slug?: string | null;
}

interface ListingDetail extends ListingRow {
  description_html: string | null;
  seller_profile_url: string | null;
  seller_email: string | null;
  seller_phone: string | null;
  seller_address: string | null;
  published_at: string | null;
  auction_time: string | null;
  meta_fields: Record<string, string> | null;
  info_marca: string | null;
  info_km: string | null;
  info_combustibil: string | null;
  info_an_fabricatie: string | null;
  info_capacitate_cilindrica: string | null;
  info_suprafata: string | null;
  info_tip_imobil: string | null;
  info_camere: string | null;
  info_an_constructie: string | null;
  images: { id: string; url: string; sort_order: number }[];
}

export default function LicitatiiPubliceImportPage() {
  const router = useRouter();
  const [isSyncing, setIsSyncing] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [isCheckingNew, setIsCheckingNew] = useState(false);
  const [isSyncingNewOnly, setIsSyncingNewOnly] = useState(false);
  const [checkNewResult, setCheckNewResult] = useState<{ totalOnPage: number; existingCount: number; newCount: number } | null>(null);
  const [checkNewLog, setCheckNewLog] = useState<string[]>([]);
  const [autoVerifyOn, setAutoVerifyOn] = useState(false);
  const [autoVerifyIntervalHours, setAutoVerifyIntervalHours] = useState(1);
  const [autoAddNewOn, setAutoAddNewOn] = useState(false);
  const [autoVerifyStatusOn, setAutoVerifyStatusOn] = useState(false);
  const [autoVerifyStatusIntervalHours, setAutoVerifyStatusIntervalHours] = useState(1);
  const autoVerifyIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoVerifyStatusIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoAddNewOnRef = useRef(autoAddNewOn);
  const fetchStatsRef = useRef<(() => Promise<void>) | null>(null);
  const fetchListingsRef = useRef<(() => Promise<void>) | null>(null);
  const checkNewLogScrollRef = useRef<HTMLUListElement | null>(null);
  const syncNewOnlyLogScrollRef = useRef<HTMLUListElement | null>(null);
  const verifyStatusLogScrollRef = useRef<HTMLUListElement | null>(null);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [lastSummary, setLastSummary] = useState<SyncSummary | null>(null);
  const [syncNewOnlyLog, setSyncNewOnlyLog] = useState<string[]>([]);
  const [isVerifyingStatus, setIsVerifyingStatus] = useState(false);
  const [verifyStatusLog, setVerifyStatusLog] = useState<string[]>([]);
  const [verifyStatusProgress, setVerifyStatusProgress] = useState<{
    phase?: string;
    message?: string;
    pagesCrawled?: number;
    itemsFound?: number;
    softDeleted?: number;
    reactivated?: number;
  } | null>(null);
  const [showConfirmSyncModal, setShowConfirmSyncModal] = useState(false);
  const [showConfirmDeleteDeactivatedModal, setShowConfirmDeleteDeactivatedModal] = useState(false);
  const [isDeletingDeactivated, setIsDeletingDeactivated] = useState(false);
  const [showConfirmSyncCountiesModal, setShowConfirmSyncCountiesModal] = useState(false);
  const [showConfirmSyncDetailsModal, setShowConfirmSyncDetailsModal] = useState(false);
  const [showActionButtons, setShowActionButtons] = useState(false);
  const [publishingIds, setPublishingIds] = useState<Set<string>>(new Set());
  const [publishLiveLog, setPublishLiveLog] = useState<Array<{
    index: number;
    total: number;
    listingId: string;
    source_external_id: string;
    success: boolean;
    error?: string;
    slug?: string;
    url?: string;
  }>>([]);
  const [lastPublishResult, setLastPublishResult] = useState<{
    total: number;
    published: number;
    failed: number;
    results: { index?: number; listingId: string; source_external_id: string; success: boolean; error?: string; slug?: string; url?: string }[];
  } | null>(null);
  const [publishingProgress, setPublishingProgress] = useState<{ total: number; batchIndex: number; totalBatches: number } | null>(null);
  const [regeneratingProductId, setRegeneratingProductId] = useState<string | null>(null);
  const [isRegeneratingBulk, setIsRegeneratingBulk] = useState(false);
  const [regeneratingProductIds, setRegeneratingProductIds] = useState<Set<string>>(new Set());
  const [regenerateLiveLog, setRegenerateLiveLog] = useState<Array<{
    total: number;
    productId: string;
    success: boolean;
    error?: string;
    title?: string;
  }>>([]);
  const [lastRegenerateResult, setLastRegenerateResult] = useState<{
    total: number;
    regenerated: number;
    failed: number;
    results: Array<{ productId: string; success: boolean; error?: string; title?: string }>;
  } | null>(null);

  useEffect(() => {
    autoAddNewOnRef.current = autoAddNewOn;
  }, [autoAddNewOn]);

  useEffect(() => {
    const el = checkNewLogScrollRef.current;
    if (el) requestAnimationFrame(() => { el.scrollTop = el.scrollHeight; });
  }, [checkNewLog.length]);

  useEffect(() => {
    const el = syncNewOnlyLogScrollRef.current;
    if (el) requestAnimationFrame(() => { el.scrollTop = el.scrollHeight; });
  }, [syncNewOnlyLog.length]);

  useEffect(() => {
    const el = verifyStatusLogScrollRef.current;
    if (el) requestAnimationFrame(() => { el.scrollTop = el.scrollHeight; });
  }, [verifyStatusLog.length]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      setAutoVerifyOn(localStorage.getItem(AUTO_VERIFY_KEY) === "1");
      const h = parseInt(localStorage.getItem(AUTO_VERIFY_HOURS_KEY) || "1", 10);
      setAutoVerifyIntervalHours(Math.min(24, Math.max(1, h)));
      setAutoAddNewOn(localStorage.getItem(AUTO_ADD_NEW_KEY) === "1");
      setAutoVerifyStatusOn(localStorage.getItem(AUTO_VERIFY_STATUS_KEY) === "1");
      const sh = parseInt(localStorage.getItem(AUTO_VERIFY_STATUS_HOURS_KEY) || "1", 10);
      setAutoVerifyStatusIntervalHours(Math.min(24, Math.max(1, sh)));
    } catch {
      // ignore
    }
  }, []);

  const runAutoCheck = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;
      const res = await fetch("/api/admin/sync-licitatii/check-new", {
      });
      const data = await res.json();
      if (!data.success) return;
      setCheckNewResult({
        totalOnPage: data.totalOnPage ?? 0,
        existingCount: data.existingCount ?? 0,
        newCount: data.newCount ?? 0,
      });
      const newCount = data.newCount ?? 0;
      if (newCount > 0 && autoAddNewOnRef.current) {
        const syncRes = await fetch("/api/admin/sync-licitatii/sync-new-only", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        });
        const syncData = await syncRes.json();
        if (syncData.success && (syncData.inserted ?? 0) > 0) {
          setMessage({ type: "success", text: `Verificare automată: ${syncData.inserted} anunțuri noi adăugate.` });
          fetchStatsRef.current?.();
          fetchListingsRef.current?.();
        }
      }
    } catch {
      // ignore errors in background
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      localStorage.setItem(AUTO_VERIFY_KEY, autoVerifyOn ? "1" : "0");
      localStorage.setItem(AUTO_VERIFY_HOURS_KEY, String(autoVerifyIntervalHours));
      localStorage.setItem(AUTO_ADD_NEW_KEY, autoAddNewOn ? "1" : "0");
      localStorage.setItem(AUTO_VERIFY_STATUS_KEY, autoVerifyStatusOn ? "1" : "0");
      localStorage.setItem(AUTO_VERIFY_STATUS_HOURS_KEY, String(autoVerifyStatusIntervalHours));
    } catch {
      // ignore
    }
  }, [autoVerifyOn, autoVerifyIntervalHours, autoAddNewOn, autoVerifyStatusOn, autoVerifyStatusIntervalHours]);

  useEffect(() => {
    if (!autoVerifyOn) {
      if (autoVerifyIntervalRef.current) {
        clearInterval(autoVerifyIntervalRef.current);
        autoVerifyIntervalRef.current = null;
      }
      return;
    }
    const run = () => runAutoCheck();
    const intervalMs = autoVerifyIntervalHours * 60 * 60 * 1000;
    const firstRun = window.setTimeout(run, 8000);
    autoVerifyIntervalRef.current = setInterval(run, intervalMs);
    return () => {
      window.clearTimeout(firstRun);
      if (autoVerifyIntervalRef.current) {
        clearInterval(autoVerifyIntervalRef.current);
        autoVerifyIntervalRef.current = null;
      }
    };
  }, [autoVerifyOn, autoVerifyIntervalHours, runAutoCheck]);

  const runVerifyStatusBackground = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;
      const res = await fetch("/api/admin/sync-licitatii/verify-status", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
      });
      const data = await res.json();
      if (data.success && data.summary) {
        const s = data.summary as VerifyStatusSummary;
        setMessage({
          type: "success",
          text: `Verificare automată stare: ${s.softDeleted ?? 0} dezactivate, ${s.reactivated ?? 0} reactivate.`,
        });
        fetchStatsRef.current?.();
        fetchListingsRef.current?.();
      }
    } catch {
      // ignore errors in background
    }
  }, []);

  useEffect(() => {
    if (!autoVerifyStatusOn) {
      if (autoVerifyStatusIntervalRef.current) {
        clearInterval(autoVerifyStatusIntervalRef.current);
        autoVerifyStatusIntervalRef.current = null;
      }
      return;
    }
    const run = () => runVerifyStatusBackground();
    const intervalMs = autoVerifyStatusIntervalHours * 60 * 60 * 1000;
    const firstRun = window.setTimeout(run, 8000);
    autoVerifyStatusIntervalRef.current = setInterval(run, intervalMs);
    return () => {
      window.clearTimeout(firstRun);
      if (autoVerifyStatusIntervalRef.current) {
        clearInterval(autoVerifyStatusIntervalRef.current);
        autoVerifyStatusIntervalRef.current = null;
      }
    };
  }, [autoVerifyStatusOn, autoVerifyStatusIntervalHours, runVerifyStatusBackground]);

  const [liveProgress, setLiveProgress] = useState<{
    phase?: string;
    message?: string;
    pagesCrawled?: number;
    itemsFound?: number;
    inserted?: number;
    updated?: number;
    softDeleted?: number;
    detailsFetched?: number;
  } | null>(null);

  const [stats, setStats] = useState<Stats | null>(null);
  const [listings, setListings] = useState<ListingRow[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const [limit] = useState(50);
  const [statusFilter, setStatusFilter] = useState<"active" | "deleted" | "all" | "reactivated">("active");
  const [countyFilter, setCountyFilter] = useState<string>("");
  const [categoryFilter, setCategoryFilter] = useState<string>("");
  const [mainCategoryFilter, setMainCategoryFilter] = useState<string>("");
  const [subcategoryFilter, setSubcategoryFilter] = useState<string>("");
  const [timeFilter, setTimeFilter] = useState<string>("all"); // all | 7d | 30d | 90d
  const [sortOrder, setSortOrder] = useState<string>("newest"); // newest | oldest | price_asc | price_desc
  const [searchQuery, setSearchQuery] = useState("");
  const [searchDebounced, setSearchDebounced] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setSearchDebounced(searchQuery.trim()), 300);
    return () => clearTimeout(t);
  }, [searchQuery]);
  const [withPdfFilter, setWithPdfFilter] = useState(false);
  const [withDescriptionFilter, setWithDescriptionFilter] = useState(false);
  const [withoutDescriptionFilter, setWithoutDescriptionFilter] = useState(false);
  const [withoutAuctionDateFilter, setWithoutAuctionDateFilter] = useState(false);
  const [withoutTitleFilter, setWithoutTitleFilter] = useState(false);
  const [withoutCountyFilter, setWithoutCountyFilter] = useState(false);
  const [withoutSellerDetailsFilter, setWithoutSellerDetailsFilter] = useState(false);
  const [showOnlyEndedOrFoldedFilter, setShowOnlyEndedOrFoldedFilter] = useState(false);
  const [onSiteFilter, setOnSiteFilter] = useState(false);
  const [publishedFilter, setPublishedFilter] = useState<"all" | "published" | "unpublished">("all");
  const [loadingList, setLoadingList] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [detailCache, setDetailCache] = useState<Record<string, ListingDetail>>({});
  const [loadingDetail, setLoadingDetail] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkActionLoading, setBulkActionLoading] = useState(false);
  const [refreshingDescId, setRefreshingDescId] = useState<string | null>(null);
  const [refreshingDetailId, setRefreshingDetailId] = useState<string | null>(null);
  const [refreshingDetailGroup, setRefreshingDetailGroup] = useState<string | null>(null);
  const [isSyncingDescriptions, setIsSyncingDescriptions] = useState(false);
  const [lastDescSyncResult, setLastDescSyncResult] = useState<{
    total: number;
    updated: number;
    failed: number;
    results: { index: number; id: string; source_external_id: string; success: boolean; error?: string; length?: number }[];
  } | null>(null);
  const [isSyncingPdfs, setIsSyncingPdfs] = useState(false);
  const [lastPdfSyncResult, setLastPdfSyncResult] = useState<{
    total: number;
    updated: number;
    failed: number;
    results: { index: number; id: string; source_external_id: string; success: boolean; error?: string; pdfCount?: number }[];
  } | null>(null);
  const [isSyncingAllDetails, setIsSyncingAllDetails] = useState(false);
  const [isSyncingTitles, setIsSyncingTitles] = useState(false);
  const [lastTitleSyncResult, setLastTitleSyncResult] = useState<{
    total: number;
    updated: number;
    failed: number;
    results: { index: number; id: string; source_external_id: string; success: boolean; error?: string; title?: string }[];
  } | null>(null);
  const [titlesLiveLog, setTitlesLiveLog] = useState<Array<{
    index: number;
    total: number;
    source_external_id: string;
    success: boolean;
    error?: string;
    title?: string;
    updated?: number;
    failed?: number;
  }>>([]);
  const [isRefreshingPrices, setIsRefreshingPrices] = useState(false);
  const [lastPriceRefreshResult, setLastPriceRefreshResult] = useState<{
    total: number;
    updated: number;
    failed: number;
    results: { index: number; product_id: string; source_external_id: string; success: boolean; error?: string; price_text_display?: string }[];
  } | null>(null);
  const [pricesLiveLog, setPricesLiveLog] = useState<Array<{
    index: number;
    total: number;
    source_external_id: string;
    success: boolean;
    error?: string;
    price_text_display?: string;
    updated?: number;
    failed?: number;
  }>>([]);
  const [isSyncingSeller, setIsSyncingSeller] = useState(false);
  const [lastSellerSyncResult, setLastSellerSyncResult] = useState<{
    total: number;
    updated: number;
    failed: number;
    results: { index: number; id: string; source_external_id: string; success: boolean; error?: string }[];
  } | null>(null);
  const [sellerLiveLog, setSellerLiveLog] = useState<Array<{
    index: number;
    total: number;
    source_external_id: string;
    success: boolean;
    error?: string;
    updated?: number;
    failed?: number;
  }>>([]);
  const [isSyncingDataOra2, setIsSyncingDataOra2] = useState(false);
  const [missingDataOra2Count, setMissingDataOra2Count] = useState<number | null>(null);
  const [lastDataOra2SyncResult, setLastDataOra2SyncResult] = useState<{
    total: number;
    updated: number;
    failed: number;
    results: { index: number; id: string; source_external_id: string; success: boolean; error?: string }[];
  } | null>(null);
  const [dataOra2LiveLog, setDataOra2LiveLog] = useState<Array<{
    index: number;
    total: number;
    source_external_id: string;
    success: boolean;
    error?: string;
    updated?: number;
    failed?: number;
  }>>([]);
  const [isSyncingCounties, setIsSyncingCounties] = useState(false);
  const [lastCountySyncResult, setLastCountySyncResult] = useState<{
    total: number;
    updated: number;
    failed: number;
    results: { index: number; id: string; source_external_id: string; success: boolean; error?: string; location_county?: string | null; location_city?: string | null }[];
  } | null>(null);
  const [countiesLiveLog, setCountiesLiveLog] = useState<Array<{
    index: number;
    total: number;
    source_external_id: string;
    success: boolean;
    error?: string;
    location_county?: string | null;
    location_city?: string | null;
    updated?: number;
    failed?: number;
  }>>([]);
  const [lastDetailsSyncResult, setLastDetailsSyncResult] = useState<{
    total: number;
    updated: number;
    failed: number;
    results: { index: number; id: string; source_external_id: string; success: boolean; error?: string }[];
  } | null>(null);
  const [detailsLiveLog, setDetailsLiveLog] = useState<Array<{
    index: number;
    total: number;
    source_external_id: string;
    success: boolean;
    error?: string;
    modifiedFields?: string[];
    imagesUpdated?: boolean;
    updated?: number;
    failed?: number;
  }>>([]);

  const fetchStats = useCallback(async (noCache?: boolean) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;
      const url = noCache
        ? `/api/admin/sync-licitatii/listings?statsOnly=1&_=${Date.now()}`
        : "/api/admin/sync-licitatii/listings?statsOnly=1";
      const res = await fetch(url, {
        cache: noCache ? "no-store" : "default",
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
      // Când filtrezi după Publicate/Nepublicate, arătăm doar active (fără dezactivate)
      const effectiveStatus = publishedFilter !== "all" ? "active" : statusFilter;
      const params = new URLSearchParams({ page: String(page), limit: String(limit), status: effectiveStatus });
      if (countyFilter) params.set("county", countyFilter);
      if (categoryFilter) params.set("category", categoryFilter);
      const effectiveMain = subcategoryFilter
        ? effectiveMainCategoryForFilter(mainCategoryFilter, subcategoryFilter)
        : mainCategoryFilter;
      if (effectiveMain) params.set("mainCategory", effectiveMain);
      if (timeFilter && timeFilter !== "all") params.set("time", timeFilter);
      if (withPdfFilter) params.set("withPdf", "1");
      if (withDescriptionFilter) params.set("withDescription", "1");
      if (withoutDescriptionFilter) params.set("withoutDescription", "1");
      if (withoutAuctionDateFilter) params.set("withoutAuctionDate", "1");
      if (withoutTitleFilter) params.set("withoutTitle", "1");
      if (withoutCountyFilter) params.set("withoutCounty", "1");
      if (withoutSellerDetailsFilter) params.set("withoutSellerDetails", "1");
      if (publishedFilter === "published") params.set("published", "published");
      else if (publishedFilter === "unpublished") params.set("published", "unpublished");
      if (onSiteFilter && publishedFilter === "all") params.set("onSite", "1");
      if (sortOrder && sortOrder !== "newest") params.set("order", sortOrder);
      if (searchDebounced) params.set("search", searchDebounced);
      const res = await fetch(`/api/admin/sync-licitatii/listings?${params}`, {
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
  }, [page, limit, statusFilter, countyFilter, categoryFilter, mainCategoryFilter, subcategoryFilter, timeFilter, sortOrder, searchDebounced, withPdfFilter, withDescriptionFilter, withoutDescriptionFilter, withoutAuctionDateFilter, withoutTitleFilter, withoutCountyFilter, withoutSellerDetailsFilter, onSiteFilter, publishedFilter]);

  /** Selectează toate anunțurile care respectă filtrele curente (nu doar cele 50 de pe pagină), max 10000 */
  const selectAllMatchingFilters = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;
      const effectiveStatus = publishedFilter !== "all" ? "active" : statusFilter;
      const params = new URLSearchParams({ idsOnly: "1", status: effectiveStatus });
      if (countyFilter) params.set("county", countyFilter);
      if (categoryFilter) params.set("category", categoryFilter);
      const effectiveMain = subcategoryFilter
        ? effectiveMainCategoryForFilter(mainCategoryFilter, subcategoryFilter)
        : mainCategoryFilter;
      if (effectiveMain) params.set("mainCategory", effectiveMain);
      if (timeFilter && timeFilter !== "all") params.set("time", timeFilter);
      if (withPdfFilter) params.set("withPdf", "1");
      if (withDescriptionFilter) params.set("withDescription", "1");
      if (withoutDescriptionFilter) params.set("withoutDescription", "1");
      if (withoutAuctionDateFilter) params.set("withoutAuctionDate", "1");
      if (withoutTitleFilter) params.set("withoutTitle", "1");
      if (withoutCountyFilter) params.set("withoutCounty", "1");
      if (withoutSellerDetailsFilter) params.set("withoutSellerDetails", "1");
      if (publishedFilter === "published") params.set("published", "published");
      else if (publishedFilter === "unpublished") params.set("published", "unpublished");
      if (onSiteFilter && publishedFilter === "all") params.set("onSite", "1");
      if (searchDebounced) params.set("search", searchDebounced);
      const res = await fetch(`/api/admin/sync-licitatii/listings?${params}`, {
      });
      const data = await res.json();
      if (data.success && Array.isArray(data.ids)) {
        setSelectedIds(new Set(data.ids));
        setMessage({ type: "success", text: `Selectate ${data.ids.length} anunțuri (toate care respectă filtrele curente).` });
      } else {
        setMessage({ type: "error", text: data.error || "Nu s-au putut încărca ID-urile." });
      }
    } catch {
      setMessage({ type: "error", text: "Nu s-au putut încărca anunțurile." });
    }
  }, [statusFilter, countyFilter, categoryFilter, mainCategoryFilter, subcategoryFilter, timeFilter, searchDebounced, withPdfFilter, withDescriptionFilter, withoutDescriptionFilter, withoutAuctionDateFilter, withoutTitleFilter, withoutCountyFilter, withoutSellerDetailsFilter, onSiteFilter, publishedFilter]);

  const fetchMissingDataOra2Count = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;
      const res = await fetch("/api/admin/sync-licitatii/listings/count-missing-data-ora-2", {
      });
      const data = await res.json().catch(() => ({}));
      const count = typeof data?.count === "number" ? data.count : (res.ok ? 0 : null);
      setMissingDataOra2Count(count);
    } catch {
      setMissingDataOra2Count(0);
    }
  }, []);

  useEffect(() => {
    fetchStatsRef.current = fetchStats;
    fetchListingsRef.current = fetchListings;
  }, [fetchStats, fetchListings]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  useEffect(() => {
    fetchListings().then(() => fetchMissingDataOra2Count());
  }, [fetchListings, fetchMissingDataOra2Count]);

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const PUBLISH_BATCH_SIZE = 50;
  const PUBLISH_PARALLEL = 5;

  const handlePublishToSite = useCallback(async (listingIds: string[]) => {
    if (listingIds.length === 0) return;
    setPublishingIds((prev) => new Set([...prev, ...listingIds]));
    setPublishLiveLog([]);
    setLastPublishResult(null);
    setMessage(null);
    const total = listingIds.length;
    const chunks: string[][] = [];
    for (let i = 0; i < listingIds.length; i += PUBLISH_BATCH_SIZE) {
      chunks.push(listingIds.slice(i, i + PUBLISH_BATCH_SIZE));
    }
    setPublishingProgress({ total, batchIndex: 0, totalBatches: chunks.length });
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        setMessage({ type: "error", text: "Sesiune invalidă." });
        return;
      }
      const results: { listingId: string; source_external_id: string; success: boolean; error?: string; slug?: string; url?: string }[] = [];
      const token = session.access_token;

      for (let waveStart = 0; waveStart < chunks.length; waveStart += PUBLISH_PARALLEL) {
        const wave = chunks.slice(waveStart, waveStart + PUBLISH_PARALLEL);
        const responses = await Promise.all(
          wave.map((chunk) =>
            fetch("/api/admin/licitatii-insolventa/publish", {
              method: "POST",
              headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
              body: JSON.stringify({ listingIds: chunk }),
            })
          )
        );

        const allBatchEntries: Array<{ index: number; total: number; listingId: string; source_external_id: string; success: boolean; error?: string; slug?: string; url?: string }> = [];
        for (let w = 0; w < wave.length; w++) {
          const c = waveStart + w;
          const chunk = wave[w];
          const res = responses[w];
          try {
            if (!res.ok) throw new Error(res.statusText);
            const data = await res.json();
            const apiResults: Array<{ listingId: string; success: boolean; error?: string; slug?: string; url?: string }> = data.results ?? [];
            for (let i = 0; i < apiResults.length; i++) {
              const r = apiResults[i];
              const listingId = r.listingId ?? chunk[i];
              const source_external_id = listings.find((row) => row.id === listingId)?.source_external_id ?? listingId.slice(0, 8);
              const entry = {
                index: c * PUBLISH_BATCH_SIZE + i + 1,
                total,
                listingId,
                source_external_id,
                success: !!r.success,
                error: r.error,
                slug: r.slug,
                url: r.url,
              };
              allBatchEntries.push(entry);
              results.push(entry);
            }
          } catch (e) {
            for (let i = 0; i < chunk.length; i++) {
              const listingId = chunk[i];
              const source_external_id = listings.find((r) => r.id === listingId)?.source_external_id ?? listingId.slice(0, 8);
              const entry = {
                index: c * PUBLISH_BATCH_SIZE + i + 1,
                total,
                listingId,
                source_external_id,
                success: false,
                error: e instanceof Error ? e.message : "Eroare la publicare",
              };
              allBatchEntries.push(entry);
              results.push(entry);
            }
          }
        }
        setPublishLiveLog((prev) => [...prev, ...allBatchEntries]);
        setPublishingProgress((prev) => prev ? { ...prev, batchIndex: Math.min(waveStart + wave.length, chunks.length) } : null);
        await new Promise((r) => setTimeout(r, 0));
      }

      const published = results.filter((r) => r.success).length;
      const failed = total - published;
      setLastPublishResult({ total, published, failed, results });
      if (published > 0) {
        setMessage({ type: "success", text: `${published} anunț(uri) publicat(e) pe site.${failed > 0 ? ` ${failed} eșecuri.` : ""}` });
        await fetchListings();
        await fetchStats();
      }
      if (failed > 0 && published === 0) {
        setMessage({ type: "error", text: `Toate au eșuat: ${results.filter((r) => !r.success).map((r) => r.error || "Eroare").join(", ")}` });
      }
    } catch (e) {
      setMessage({ type: "error", text: "Eroare la publicare." });
    } finally {
      setPublishingProgress(null);
      setPublishingIds((prev) => {
        const next = new Set(prev);
        listingIds.forEach((id) => next.delete(id));
        return next;
      });
    }
  }, [fetchListings, fetchStats, listings]);

  const handleRegenerateProduct = useCallback(async (productId: string) => {
    setRegeneratingProductId(productId);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        setMessage({ type: "error", text: "Sesiune invalidă." });
        return;
      }
      const res = await fetch("/api/admin/licitatii-insolventa/regenerate-product", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ productId }),
      });
      const data = await res.json();
      if (data.success) {
        setMessage({ type: "success", text: data.title ? `Anunț regenerat: ${data.title}` : "Anunț regenerat." });
        const scrollY = typeof window !== "undefined" ? window.scrollY : 0;
        await fetchListings();
        if (typeof window !== "undefined") requestAnimationFrame(() => { window.scrollTo(0, scrollY); });
      } else {
        setMessage({ type: "error", text: data.error || "Eroare la regenerare." });
      }
    } catch (e) {
      setMessage({ type: "error", text: "Eroare la regenerare." });
    } finally {
      setRegeneratingProductId(null);
    }
  }, [fetchListings]);

  const BULK_REGENERATE_CONCURRENCY = 50;

  const handleBulkRegenerate = useCallback(async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    setIsRegeneratingBulk(true);
    setRegenerateLiveLog([]);
    setLastRegenerateResult(null);
    setMessage(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        setMessage({ type: "error", text: "Sesiune invalidă." });
        return;
      }
      const listRes = await fetch("/api/admin/licitatii-insolventa/regenerate-products", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ listingIds: ids, productIdsOnly: true }),
      });
      const listData = await listRes.json();
      if (!listData.success || !Array.isArray(listData.productIds) || listData.productIds.length === 0) {
        setMessage({ type: "success", text: listData.message || "Niciun anunț selectat nu are produs publicat pe site." });
        return;
      }
      const productIds = listData.productIds as string[];
      const total = productIds.length;
      const results: Array<{ productId: string; success: boolean; error?: string; title?: string }> = [];
      for (let i = 0; i < productIds.length; i += BULK_REGENERATE_CONCURRENCY) {
        const chunk = productIds.slice(i, i + BULK_REGENERATE_CONCURRENCY);
        setRegeneratingProductIds((prev) => new Set([...prev, ...chunk]));
        await Promise.all(
          chunk.map(async (productId) => {
            try {
              const res = await fetch("/api/admin/licitatii-insolventa/regenerate-product", {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
                body: JSON.stringify({ productId }),
              });
              const data = await res.json().catch(() => ({}));
              const success = !!data.success;
              const entry = { total, productId, success, error: data.error, title: data.title };
              setRegenerateLiveLog((prev) => [...prev, entry]);
              results.push({ productId, success, error: data.error, title: data.title });
              return entry;
            } catch (e) {
              const errMsg = e instanceof Error ? e.message : "Eroare";
              const entry = { total, productId, success: false, error: errMsg };
              setRegenerateLiveLog((prev) => [...prev, entry]);
              results.push({ productId, success: false, error: errMsg });
              return entry;
            }
          })
        );
        setRegeneratingProductIds((prev) => {
          const next = new Set(prev);
          chunk.forEach((id) => next.delete(id));
          return next;
        });
      }
      const regenerated = results.filter((r) => r.success).length;
      const failed = results.filter((r) => !r.success).length;
      setLastRegenerateResult({ total, regenerated, failed, results });
      setMessage({
        type: failed > 0 && regenerated === 0 ? "error" : "success",
        text: `Regenerate: ${regenerated} reușite${failed > 0 ? `, ${failed} eșecuri` : ""} (total ${total}).`,
      });
      if (regenerated > 0) {
        setSelectedIds(new Set());
        await fetchListings();
      }
    } catch (e) {
      setMessage({ type: "error", text: e instanceof Error ? e.message : "Eroare la regenerare." });
    } finally {
      setIsRegeneratingBulk(false);
      setRegeneratingProductIds(new Set());
    }
  }, [selectedIds, fetchListings]);

  /** Listă afișată: toate sau doar cele publicate pe /ro fără dată/oră sau cu data expirată (evidențiate cu roșu) */
  const displayedListings = useMemo(() => {
    if (!showOnlyEndedOrFoldedFilter) return listings;
    return listings.filter(isPublishedMissingOrExpiredDate);
  }, [listings, showOnlyEndedOrFoldedFilter]);

  /** Grupuri vânzător: același vânzător = același chenar colorat */
  const vendorGroups = useMemo(() => {
    const map = new Map<string, ListingRow[]>();
    for (const row of displayedListings) {
      const key = (row.seller_name || "").trim() || "— Fără vânzător";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(row);
    }
    return Array.from(map.entries())
      .map(([vendorName, rows]) => ({
        vendorKey: vendorName,
        vendorName,
        rows,
        colorIndex: hashString(vendorName) % VENDOR_PALETTE.length,
      }))
      .sort((a, b) => a.vendorName.localeCompare(b.vendorName, "ro"));
  }, [displayedListings]);

  const selectAllWithoutDescription = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;
      const res = await fetch(
        `/api/admin/sync-licitatii/listings?idsOnly=1&withoutDescription=1&status=active`,
        { headers: {} }
      );
      const data = await res.json();
      if (data.success && Array.isArray(data.ids)) {
        setSelectedIds(new Set(data.ids));
        setMessage({ type: "success", text: `Selectate ${data.ids.length} anunțuri fără descriere. Poți rula „Sincronizează descrierile”.` });
      }
    } catch {
      setMessage({ type: "error", text: "Nu s-au putut încărca ID-urile." });
    }
  }, []);

  const selectAllWithoutAuctionDate = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;
      const res = await fetch(
        `/api/admin/sync-licitatii/listings?idsOnly=1&withoutAuctionDate=1&status=active`,
        { headers: {} }
      );
      const data = await res.json();
      if (data.success && Array.isArray(data.ids)) {
        setSelectedIds(new Set(data.ids));
        setMessage({ type: "success", text: `Selectate ${data.ids.length} anunțuri fără data licitației (câmpuri incomplete). Poți rula „Toate câmpurile”.` });
      }
    } catch {
      setMessage({ type: "error", text: "Nu s-au putut încărca ID-urile." });
    }
  }, []);

  /** Fără selecție: selectează automat anunțurile fără câmpuri complete și pornește sincronizarea. Cu selecție: doar sincronizează. */
  const handleSyncDetailsWithIncomplete = async () => {
    if (selectedIds.size > 0) {
      handleSyncAllDetails();
      return;
    }
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        setMessage({ type: "error", text: "Nu ești autentificat" });
        return;
      }
      const res = await fetch(
        `/api/admin/sync-licitatii/listings?idsOnly=1&withoutAuctionDate=1&status=active`,
        { headers: {} }
      );
      const data = await res.json();
      if (!data.success || !Array.isArray(data.ids)) {
        setMessage({ type: "error", text: "Nu s-au putut încărca anunțurile fără câmpuri complete." });
        return;
      }
      const ids = data.ids as string[];
      setSelectedIds(new Set(ids));
      if (ids.length === 0) {
        setMessage({ type: "success", text: "Nu există anunțuri fără câmpuri complete." });
        return;
      }
      await handleSyncAllDetails(ids);
    } catch {
      setMessage({ type: "error", text: "Nu s-au putut încărca anunțurile fără câmpuri complete." });
    }
  };

  const selectAllWithoutTitle = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;
      const res = await fetch(
        `/api/admin/sync-licitatii/listings?idsOnly=1&withoutTitle=1&status=active`,
        { headers: {} }
      );
      const data = await res.json();
      if (data.success && Array.isArray(data.ids)) {
        setSelectedIds(new Set(data.ids));
        setMessage({ type: "success", text: `Selectate ${data.ids.length} anunțuri fără titlu. Poți rula „Sincronizează titlurile”.` });
      }
    } catch {
      setMessage({ type: "error", text: "Nu s-au putut încărca ID-urile." });
    }
  }, []);

  const selectAllWithoutSellerDetails = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;
      const res = await fetch(
        `/api/admin/sync-licitatii/listings?idsOnly=1&withoutSellerDetails=1&status=active`,
        { headers: {} }
      );
      const data = await res.json();
      if (data.success && Array.isArray(data.ids)) {
        setSelectedIds(new Set(data.ids));
        setMessage({ type: "success", text: `Selectate ${data.ids.length} anunțuri fără detalii vânzător. Poți rula „Actualizare detalii vânzător”.` });
      }
    } catch {
      setMessage({ type: "error", text: "Nu s-au putut încărca ID-urile." });
    }
  }, []);

  /** Selectează automat toate fără județ și pornește sincronizarea județelor (un singur buton). */
  const handleSyncCountiesWithoutCounty = async () => {
    if (selectedIds.size > 0) {
      handleSyncAllCounties();
      return;
    }
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        setMessage({ type: "error", text: "Nu ești autentificat" });
        return;
      }
      const res = await fetch(
        `/api/admin/sync-licitatii/listings?idsOnly=1&withoutCounty=1&status=active`,
        { headers: {} }
      );
      const data = await res.json();
      if (!data.success || !Array.isArray(data.ids)) {
        setMessage({ type: "error", text: "Nu s-au putut încărca anunțurile fără județ." });
        return;
      }
      const ids = data.ids as string[];
      setSelectedIds(new Set(ids));
      if (ids.length === 0) {
        setMessage({ type: "success", text: "Nu există anunțuri fără județ." });
        return;
      }
      await handleSyncAllCounties(ids);
    } catch {
      setMessage({ type: "error", text: "Nu s-au putut încărca anunțurile fără județ." });
    }
  };

  const selectAllOnPage = () => {
    const ids = displayedListings.map((r) => r.id);
    const allSelected = ids.length > 0 && ids.every((id) => selectedIds.has(id));
    if (allSelected) setSelectedIds((prev) => { const n = new Set(prev); ids.forEach((id) => n.delete(id)); return n; });
    else setSelectedIds((prev) => { const n = new Set(prev); ids.forEach((id) => n.add(id)); return n; });
  };
  const bulkSetDeleted = async (deleted: boolean) => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    setBulkActionLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;
      const res = await fetch("/api/admin/sync-licitatii/listings/bulk-status", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ ids, deleted }),
      });
      const data = await res.json();
      if (data.success) {
        setSelectedIds(new Set());
        setMessage({ type: "success", text: deleted ? `Maricate ca șterse: ${data.updated}` : `Reactivate: ${data.updated}` });
        fetchStats();
        fetchListings();
      } else setMessage({ type: "error", text: data.error || "Eroare" });
    } catch (e) {
      setMessage({ type: "error", text: e instanceof Error ? e.message : "Eroare la acțiune" });
    } finally {
      setBulkActionLoading(false);
    }
  };

  const handleDeleteDeactivated = async () => {
    setIsDeletingDeactivated(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;
      const res = await fetch("/api/admin/sync-licitatii/listings/delete-deactivated", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
      });
      const data = await res.json();
      if (data.success) {
        setShowConfirmDeleteDeactivatedModal(false);
        setMessage({ type: "success", text: `Șterse definitiv: ${data.deletedCount ?? 0} anunțuri dezactivate.` });
        setStatusFilter("active");
        setPage(1);
        fetchStats();
        fetchListings();
      } else {
        setMessage({ type: "error", text: data.error || "Eroare la ștergere" });
      }
    } catch (e) {
      setMessage({ type: "error", text: e instanceof Error ? e.message : "Eroare la ștergere" });
    } finally {
      setIsDeletingDeactivated(false);
    }
  };

  const fetchDetail = useCallback(async (id: string) => {
    setLoadingDetail(id);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;
      const res = await fetch(`/api/admin/sync-licitatii/listings/${id}`, {
      });
      const data = await res.json();
      if (data.success && data.listing) {
        setDetailCache((prev) => ({ ...prev, [id]: data.listing }));
      }
    } finally {
      setLoadingDetail(null);
    }
  }, []);

  const toggleDetail = (id: string) => {
    if (expandedId === id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(id);
    fetchDetail(id);
  };

  type DetailUpdateGroup = "description" | "auto" | "imobiliare" | "pdf" | "seller" | "all";

  const refreshDescription = useCallback(async (id: string) => {
    setRefreshingDescId(id);
    setMessage(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        setMessage({ type: "error", text: "Nu ești autentificat" });
        return;
      }
      const res = await fetch(`/api/admin/sync-licitatii/listings/${id}/refresh-description`, {
        method: "POST",
      });
      const data = await res.json();
      if (data.success) {
        setDetailCache((prev) => {
          const current = prev[id];
          if (!current) return prev;
          return { ...prev, [id]: { ...current, description_html: data.description_html ?? null } };
        });
        setMessage({ type: "success", text: data.message || (data.length != null ? `Descriere actualizată: ${data.length} caractere` : "Descriere actualizată") });
      } else {
        setMessage({ type: "error", text: data.error || "Eroare la actualizarea descrierii" });
      }
    } catch (e) {
      setMessage({ type: "error", text: e instanceof Error ? e.message : String(e) });
    } finally {
      setRefreshingDescId(null);
    }
  }, []);

  const refreshDetail = useCallback(async (id: string, only: DetailUpdateGroup) => {
    setRefreshingDetailId(id);
    setRefreshingDetailGroup(only);
    setMessage(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        setMessage({ type: "error", text: "Nu ești autentificat" });
        return;
      }
      const res = await fetch(`/api/admin/sync-licitatii/listings/${id}/refresh-detail`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ only }),
      });
      const data = await res.json();
      if (data.success) {
        setMessage({ type: "success", text: data.message || "Actualizat" });
        await fetchDetail(id);
      } else {
        setMessage({ type: "error", text: data.error || "Eroare la actualizare" });
      }
    } catch (e) {
      setMessage({ type: "error", text: e instanceof Error ? e.message : String(e) });
    } finally {
      setRefreshingDetailId(null);
      setRefreshingDetailGroup(null);
    }
  }, [fetchDetail]);

  const handleTestConnection = async () => {
    setIsTesting(true);
    setMessage(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const headers: HeadersInit = {};
      if (session?.access_token) headers["Authorization"] = `Bearer ${session.access_token}`;
      const response = await fetch("/api/admin/sync-licitatii/test", { headers });
      const result = await response.json();
      if (result.ok) {
        setMessage({ type: "success", text: result.message || "Conectare reușită la licitatii-insolventa.ro" });
      } else {
        setMessage({ type: "error", text: result.error || result.message || "Conectare eșuată" });
      }
    } catch (e) {
      setMessage({ type: "error", text: e instanceof Error ? e.message : String(e) });
    } finally {
      setIsTesting(false);
    }
  };

  const handleSyncAllDescriptions = async () => {
    setIsSyncingDescriptions(true);
    setMessage(null);
    setLastDescSyncResult(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        setMessage({ type: "error", text: "Nu ești autentificat" });
        return;
      }
      const body = selectedIds.size > 0
        ? { ids: Array.from(selectedIds) }
        : { onlyMissing: false };
      const res = await fetch("/api/admin/sync-licitatii/listings/sync-all-descriptions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.success !== false && !data.error) {
        setMessage({ type: "success", text: data.message || `Procesate ${data.total ?? 0}, actualizate ${data.updated ?? 0}, eșecuri ${data.failed ?? 0}.` });
        setLastDescSyncResult({
          total: data.total ?? 0,
          updated: data.updated ?? 0,
          failed: data.failed ?? 0,
          results: data.results ?? [],
        });
        fetchStats();
        fetchListings();
      } else {
        setMessage({ type: "error", text: data.error || "Eroare la sincronizarea descrierilor" });
      }
    } catch (e) {
      setMessage({ type: "error", text: e instanceof Error ? e.message : String(e) });
    } finally {
      setIsSyncingDescriptions(false);
    }
  };

  const handleSyncAllPdfs = async () => {
    setIsSyncingPdfs(true);
    setMessage(null);
    setLastPdfSyncResult(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        setMessage({ type: "error", text: "Nu ești autentificat" });
        return;
      }
      const body = selectedIds.size > 0
        ? { ids: Array.from(selectedIds) }
        : {};
      const res = await fetch("/api/admin/sync-licitatii/listings/sync-all-pdfs", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.success !== false && !data.error) {
        setMessage({ type: "success", text: data.message || `Procesate ${data.total ?? 0}, actualizate ${data.updated ?? 0} (PDF-uri), eșecuri ${data.failed ?? 0}.` });
        setLastPdfSyncResult({
          total: data.total ?? 0,
          updated: data.updated ?? 0,
          failed: data.failed ?? 0,
          results: data.results ?? [],
        });
        fetchStats();
        fetchListings();
      } else {
        setMessage({ type: "error", text: data.error || "Eroare la sincronizarea PDF-urilor" });
      }
    } catch (e) {
      setMessage({ type: "error", text: e instanceof Error ? e.message : String(e) });
    } finally {
      setIsSyncingPdfs(false);
    }
  };

  const handleSyncAllTitles = async () => {
    setIsSyncingTitles(true);
    setMessage(null);
    setLastTitleSyncResult(null);
    setTitlesLiveLog([]);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        setMessage({ type: "error", text: "Nu ești autentificat" });
        return;
      }
      const body = selectedIds.size > 0
        ? { ids: Array.from(selectedIds) }
        : { onlyMissing: true };
      const res = await fetch("/api/admin/sync-licitatii/listings/sync-all-titles", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-titles-stream": "1",
        },
        body: JSON.stringify(body),
      });

      const contentType = res.headers.get("Content-Type") || "";
      if (contentType.includes("ndjson") && res.body) {
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        try {
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
                const data = JSON.parse(trimmed);
                if (data.type === "log") {
                  setTitlesLiveLog((prev) => [
                    ...prev,
                    {
                      index: data.index,
                      total: data.total,
                      source_external_id: data.source_external_id,
                      success: data.success === true,
                      error: data.error,
                      title: data.title,
                      updated: data.updated,
                      failed: data.failed,
                    },
                  ]);
                } else if (data.type === "done") {
                  setLastTitleSyncResult({
                    total: data.total ?? 0,
                    updated: data.updated ?? 0,
                    failed: data.failed ?? 0,
                    results: data.results ?? [],
                  });
                  setMessage({
                    type: "success",
                    text: data.total != null
                      ? `Procesate ${data.total}, actualizate ${data.updated ?? 0} titluri, eșecuri ${data.failed ?? 0}.`
                      : "Sincronizare titluri finalizată.",
                  });
                  fetchStats();
                  fetchListings();
                }
              } catch {
                // ignore invalid JSON lines
              }
            }
          }
          if (buffer.trim()) {
            try {
              const data = JSON.parse(buffer.trim());
              if (data.type === "done") {
                setLastTitleSyncResult({
                  total: data.total ?? 0,
                  updated: data.updated ?? 0,
                  failed: data.failed ?? 0,
                  results: data.results ?? [],
                });
                setMessage({
                  type: "success",
                  text: data.total != null
                    ? `Procesate ${data.total}, actualizate ${data.updated ?? 0} titluri, eșecuri ${data.failed ?? 0}.`
                    : "Sincronizare titluri finalizată.",
                });
                fetchStats();
                fetchListings();
              }
            } catch {
              // ignore
            }
          }
        } catch (streamErr) {
          const msg = streamErr instanceof Error ? streamErr.message : String(streamErr);
          setMessage({ type: "error", text: msg });
        }
        return;
      }

      const data = await res.json();
      if (data.success !== false && !data.error) {
        setMessage({ type: "success", text: data.message || `Procesate ${data.total ?? 0}, actualizate ${data.updated ?? 0} (titluri), eșecuri ${data.failed ?? 0}.` });
        setLastTitleSyncResult({
          total: data.total ?? 0,
          updated: data.updated ?? 0,
          failed: data.failed ?? 0,
          results: data.results ?? [],
        });
        fetchStats();
        fetchListings();
      } else {
        setMessage({ type: "error", text: data.error || "Eroare la sincronizarea titlurilor" });
      }
    } catch (e) {
      setMessage({ type: "error", text: e instanceof Error ? e.message : String(e) });
    } finally {
      setIsSyncingTitles(false);
    }
  };

  const handleRefreshPrices = async () => {
    setIsRefreshingPrices(true);
    setMessage(null);
    setLastPriceRefreshResult(null);
    setPricesLiveLog([]);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        setMessage({ type: "error", text: "Nu ești autentificat" });
        return;
      }
      const body = selectedIds.size > 0
        ? { ids: Array.from(selectedIds) }
        : {};
      const res = await fetch("/api/admin/licitatii-insolventa/refresh-prices", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-prices-stream": "1",
        },
        body: JSON.stringify(body),
      });

      const contentType = res.headers.get("Content-Type") || "";
      if (contentType.includes("ndjson") && res.body) {
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        try {
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
                const data = JSON.parse(trimmed);
                if (data.type === "log") {
                  setPricesLiveLog((prev) => [
                    ...prev,
                    {
                      index: data.index,
                      total: data.total,
                      source_external_id: data.source_external_id,
                      success: data.success === true,
                      error: data.error,
                      price_text_display: data.price_text_display,
                      updated: data.updated,
                      failed: data.failed,
                    },
                  ]);
                } else if (data.type === "done") {
                  setLastPriceRefreshResult({
                    total: data.total ?? 0,
                    updated: data.updated ?? 0,
                    failed: data.failed ?? 0,
                    results: data.results ?? [],
                  });
                  const total = data.total ?? 0;
                  setMessage({
                    type: "success",
                    text: (data.total != null
                      ? `Reactualizare prețuri: ${data.total} procesate, ${data.updated ?? 0} actualizate, ${data.failed ?? 0} eșecuri.`
                      : "Reactualizare prețuri finalizată.")
                      + (total > 0 ? " La fel ca la titluri: fără legătură cu anunțurile publicate." : ""),
                  });
                  fetchStats();
                  fetchListings();
                }
              } catch {
                // ignore invalid JSON lines
              }
            }
          }
          if (buffer.trim()) {
            try {
              const data = JSON.parse(buffer.trim());
              if (data.type === "done") {
                setLastPriceRefreshResult({
                  total: data.total ?? 0,
                  updated: data.updated ?? 0,
                  failed: data.failed ?? 0,
                  results: data.results ?? [],
                });
                const t = data.total ?? 0;
                setMessage({
                  type: "success",
                  text: `Reactualizare prețuri: ${data.total ?? 0} procesate, ${data.updated ?? 0} actualizate, ${data.failed ?? 0} eșecuri.`
                    + (t > 0 ? " La fel ca la titluri: fără legătură cu anunțurile publicate." : ""),
                });
                fetchStats();
                fetchListings();
              }
            } catch {
              // ignore
            }
          }
        } catch (streamErr) {
          const msg = streamErr instanceof Error ? streamErr.message : String(streamErr);
          setMessage({ type: "error", text: msg });
        }
        return;
      }

      const data = await res.json();
      if (data.success !== false && !data.error) {
        setMessage({ type: "success", text: data.message || `Reactualizare prețuri: ${data.updated ?? 0} actualizate.` });
        setLastPriceRefreshResult({
          total: data.total ?? 0,
          updated: data.updated ?? 0,
          failed: data.failed ?? 0,
          results: data.results ?? [],
        });
        fetchStats();
        fetchListings();
      } else {
        setMessage({ type: "error", text: data.error || "Eroare la reactualizarea prețurilor" });
      }
    } catch (e) {
      setMessage({ type: "error", text: e instanceof Error ? e.message : String(e) });
    } finally {
      setIsRefreshingPrices(false);
    }
  };

  const handleSyncAllSeller = async () => {
    setIsSyncingSeller(true);
    setMessage(null);
    setLastSellerSyncResult(null);
    setSellerLiveLog([]);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        setMessage({ type: "error", text: "Nu ești autentificat" });
        return;
      }
      const body = selectedIds.size > 0 ? { ids: Array.from(selectedIds) } : { onlyMissing: true };
      const res = await fetch("/api/admin/sync-licitatii/listings/sync-all-seller", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-seller-stream": "1",
        },
        body: JSON.stringify(body),
      });

      const contentType = res.headers.get("Content-Type") || "";
      if (contentType.includes("ndjson") && res.body) {
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        try {
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
                const data = JSON.parse(trimmed);
                if (data.type === "log") {
                  setSellerLiveLog((prev) => [
                    ...prev,
                    {
                      index: data.index,
                      total: data.total,
                      source_external_id: data.source_external_id,
                      success: data.success === true,
                      error: data.error,
                      updated: data.updated,
                      failed: data.failed,
                    },
                  ]);
                } else if (data.type === "done") {
                  setLastSellerSyncResult({
                    total: data.total ?? 0,
                    updated: data.updated ?? 0,
                    failed: data.failed ?? 0,
                    results: data.results ?? [],
                  });
                  setMessage({
                    type: "success",
                    text: data.total != null
                      ? `Detalii vânzător: ${data.total} procesate, ${data.updated ?? 0} actualizate, ${data.failed ?? 0} eșecuri.`
                      : "Actualizare detalii vânzător finalizată.",
                  });
                  fetchStats();
                  fetchListings();
                }
              } catch {
                // ignore invalid JSON lines
              }
            }
          }
          if (buffer.trim()) {
            try {
              const data = JSON.parse(buffer.trim());
              if (data.type === "done") {
                setLastSellerSyncResult({
                  total: data.total ?? 0,
                  updated: data.updated ?? 0,
                  failed: data.failed ?? 0,
                  results: data.results ?? [],
                });
                setMessage({
                  type: "success",
                  text: data.total != null
                    ? `Detalii vânzător: ${data.total} procesate, ${data.updated ?? 0} actualizate, ${data.failed ?? 0} eșecuri.`
                    : "Actualizare detalii vânzător finalizată.",
                });
                fetchStats();
                fetchListings();
              }
            } catch {
              // ignore
            }
          }
        } catch (streamErr) {
          const msg = streamErr instanceof Error ? streamErr.message : String(streamErr);
          setMessage({ type: "error", text: msg });
        }
        return;
      }

      const data = await res.json();
      if (data.success !== false && !data.error) {
        setMessage({ type: "success", text: data.message || `Detalii vânzător: ${data.updated ?? 0} actualizate.` });
        setLastSellerSyncResult({
          total: data.total ?? 0,
          updated: data.updated ?? 0,
          failed: data.failed ?? 0,
          results: data.results ?? [],
        });
        fetchStats();
        fetchListings();
      } else {
        setMessage({ type: "error", text: data.error || "Eroare la actualizarea detalii vânzător" });
      }
    } catch (e) {
      setMessage({ type: "error", text: e instanceof Error ? e.message : String(e) });
    } finally {
      setIsSyncingSeller(false);
    }
  };

  const handleSyncAllDataOra2 = async () => {
    setIsSyncingDataOra2(true);
    setMessage(null);
    setLastDataOra2SyncResult(null);
    setDataOra2LiveLog([]);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        setMessage({ type: "error", text: "Nu ești autentificat" });
        return;
      }
      const body = selectedIds.size > 0 ? { ids: Array.from(selectedIds) } : { onlyMissing: true };
      const res = await fetch("/api/admin/sync-licitatii/listings/sync-all-data-ora-2", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-data-ora-2-stream": "1",
        },
        body: JSON.stringify(body),
      });
      const contentType = res.headers.get("Content-Type") || "";
      if (contentType.includes("ndjson") && res.body) {
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        try {
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
                const data = JSON.parse(trimmed);
                if (data.type === "log") {
                  setDataOra2LiveLog((prev) => [
                    ...prev,
                    {
                      index: data.index,
                      total: data.total,
                      source_external_id: data.source_external_id,
                      success: data.success === true,
                      error: data.error,
                      updated: data.updated,
                      failed: data.failed,
                    },
                  ]);
                } else if (data.type === "done") {
                  setLastDataOra2SyncResult({
                    total: data.total ?? 0,
                    updated: data.updated ?? 0,
                    failed: data.failed ?? 0,
                    results: data.results ?? [],
                  });
                  setMessage({
                    type: "success",
                    text: data.total != null
                      ? `Data și ora 2: ${data.total} procesate, ${data.updated ?? 0} actualizate, ${data.failed ?? 0} eșecuri.`
                      : "Sincronizare data/ora 2 finalizată.",
                  });
                  fetchStats();
                  fetchListings();
                  fetchMissingDataOra2Count();
                }
              } catch {
                // ignore invalid JSON lines
              }
            }
          }
          if (buffer.trim()) {
            try {
              const data = JSON.parse(buffer.trim());
              if (data.type === "done") {
                setLastDataOra2SyncResult({
                  total: data.total ?? 0,
                  updated: data.updated ?? 0,
                  failed: data.failed ?? 0,
                  results: data.results ?? [],
                });
                setMessage({
                  type: "success",
                  text: data.total != null
                    ? `Data și ora 2: ${data.total} procesate, ${data.updated ?? 0} actualizate, ${data.failed ?? 0} eșecuri.`
                    : "Sincronizare data/ora 2 finalizată.",
                });
                fetchStats();
                fetchListings();
                fetchMissingDataOra2Count();
              }
            } catch {
              // ignore
            }
          }
        } finally {
          reader.releaseLock();
        }
      } else {
        const data = await res.json();
        if (data.success !== false && !data.error) {
          setMessage({ type: "success", text: data.message || `Data și ora 2: ${data.total ?? 0} procesate, ${data.updated ?? 0} actualizate.` });
          setLastDataOra2SyncResult({
            total: data.total ?? 0,
            updated: data.updated ?? 0,
            failed: data.failed ?? 0,
            results: data.results ?? [],
          });
          fetchStats();
          fetchListings();
          fetchMissingDataOra2Count();
        } else {
          setMessage({ type: "error", text: data.error || "Eroare la sincronizarea data/ora 2" });
        }
      }
    } catch (e) {
      setMessage({ type: "error", text: e instanceof Error ? e.message : String(e) });
    } finally {
      setIsSyncingDataOra2(false);
    }
  };

  const handleSyncAllCounties = async (idsOverride?: string[]) => {
    setIsSyncingCounties(true);
    setMessage(null);
    setLastCountySyncResult(null);
    setCountiesLiveLog([]);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        setMessage({ type: "error", text: "Nu ești autentificat" });
        return;
      }
      const idsToSync = idsOverride ?? (selectedIds.size > 0 ? Array.from(selectedIds) : null);
      if (idsToSync !== null && idsToSync.length === 0) {
        setMessage({ type: "success", text: "Nu există anunțuri fără județ." });
        return;
      }
      const body = idsToSync && idsToSync.length > 0 ? { ids: idsToSync } : { onlyMissing: true };
      const res = await fetch("/api/admin/sync-licitatii/listings/sync-all-counties", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-counties-stream": "1",
        },
        body: JSON.stringify(body),
      });

      const contentType = res.headers.get("Content-Type") || "";
      if (contentType.includes("ndjson") && res.body) {
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        try {
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
                const data = JSON.parse(trimmed);
                if (data.type === "log") {
                  setCountiesLiveLog((prev) => [
                    ...prev,
                    {
                      index: data.index,
                      total: data.total,
                      source_external_id: data.source_external_id,
                      success: data.success === true,
                      error: data.error,
                      location_county: data.location_county,
                      location_city: data.location_city,
                      updated: data.updated,
                      failed: data.failed,
                    },
                  ]);
                } else if (data.type === "done") {
                  setLastCountySyncResult({
                    total: data.total ?? 0,
                    updated: data.updated ?? 0,
                    failed: data.failed ?? 0,
                    results: data.results ?? [],
                  });
                  setMessage({
                    type: "success",
                    text: data.total != null
                      ? `Procesate ${data.total}, actualizate ${data.updated ?? 0} județe, eșecuri ${data.failed ?? 0}.`
                      : "Sincronizare județe finalizată.",
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
              const data = JSON.parse(buffer.trim());
              if (data.type === "done") {
                setLastCountySyncResult({
                  total: data.total ?? 0,
                  updated: data.updated ?? 0,
                  failed: data.failed ?? 0,
                  results: data.results ?? [],
                });
                setMessage({
                  type: "success",
                  text: data.total != null
                    ? `Procesate ${data.total}, actualizate ${data.updated ?? 0} județe, eșecuri ${data.failed ?? 0}.`
                    : "Sincronizare județe finalizată.",
                });
                fetchStats();
                fetchListings();
              }
            } catch {
              // ignore
            }
          }
        } catch (streamErr) {
          const msg = streamErr instanceof Error ? streamErr.message : String(streamErr);
          setMessage({ type: "error", text: msg });
        }
        return;
      }

      const data = await res.json();
      if (data.success !== false && !data.error) {
        setMessage({ type: "success", text: data.message || `Procesate ${data.total ?? 0}, actualizate ${data.updated ?? 0} (județe), eșecuri ${data.failed ?? 0}.` });
        setLastCountySyncResult({
          total: data.total ?? 0,
          updated: data.updated ?? 0,
          failed: data.failed ?? 0,
          results: data.results ?? [],
        });
        fetchStats();
        fetchListings();
      } else {
        setMessage({ type: "error", text: data.error || "Eroare la sincronizarea județelor" });
      }
    } catch (e) {
      setMessage({ type: "error", text: e instanceof Error ? e.message : String(e) });
    } finally {
      setIsSyncingCounties(false);
    }
  };

  const handleSyncAllDetails = async (idsOverride?: string[]) => {
    setIsSyncingAllDetails(true);
    setMessage(null);
    setLastDetailsSyncResult(null);
    setDetailsLiveLog([]);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        setMessage({ type: "error", text: "Nu ești autentificat" });
        return;
      }
      const idsToSync = idsOverride ?? (selectedIds.size > 0 ? Array.from(selectedIds) : null);
      if (idsToSync !== null && idsToSync.length === 0) {
        setMessage({ type: "success", text: "Nu există anunțuri fără câmpuri complete." });
        return;
      }
      const body = idsToSync && idsToSync.length > 0 ? { ids: idsToSync } : {};
      const res = await fetch("/api/admin/sync-licitatii/listings/sync-all-details", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-details-stream": "1",
        },
        body: JSON.stringify(body),
      });

      const contentType = res.headers.get("Content-Type") || "";
      if (contentType.includes("ndjson") && res.body) {
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        try {
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
                const data = JSON.parse(trimmed);
                if (data.type === "log") {
                  setDetailsLiveLog((prev) => [
                    ...prev,
                    {
                      index: data.index,
                      total: data.total,
                      source_external_id: data.source_external_id,
                      success: data.success === true,
                      error: data.error,
                      modifiedFields: data.modifiedFields,
                      imagesUpdated: data.imagesUpdated,
                      updated: data.updated,
                      failed: data.failed,
                    },
                  ]);
                } else if (data.type === "done") {
                  setLastDetailsSyncResult({
                    total: data.total ?? 0,
                    updated: data.updated ?? 0,
                    failed: data.failed ?? 0,
                    results: data.results ?? [],
                  });
                  setMessage({
                    type: "success",
                    text: data.total != null
                      ? `Procesate ${data.total} (max 3000), actualizate ${data.updated ?? 0}, eșecuri ${data.failed ?? 0}.`
                      : "Sincronizare toate câmpurile finalizată.",
                  });
                  fetchStats();
                  fetchListings();
                }
              } catch {
                // ignore invalid JSON lines
              }
            }
          }
          if (buffer.trim()) {
            try {
              const data = JSON.parse(buffer.trim());
              if (data.type === "done") {
                setLastDetailsSyncResult({
                  total: data.total ?? 0,
                  updated: data.updated ?? 0,
                  failed: data.failed ?? 0,
                  results: data.results ?? [],
                });
                setMessage({
                  type: "success",
                  text: data.total != null
                    ? `Procesate ${data.total} (max 3000), actualizate ${data.updated ?? 0}, eșecuri ${data.failed ?? 0}.`
                    : "Sincronizare toate câmpurile finalizată.",
                });
                fetchStats();
                fetchListings();
              }
            } catch {
              // ignore
            }
          }
        } catch (streamErr) {
          const msg = streamErr instanceof Error ? streamErr.message : String(streamErr);
          setMessage({ type: "error", text: msg });
        }
        return;
      }

      const data = await res.json();
      if (data.success !== false && !data.error) {
        setMessage({ type: "success", text: data.message || `Procesate ${data.total ?? 0}, actualizate ${data.updated ?? 0} (toate câmpurile), eșecuri ${data.failed ?? 0}. Max 3000 anunțuri.` });
        setLastDetailsSyncResult({
          total: data.total ?? 0,
          updated: data.updated ?? 0,
          failed: data.failed ?? 0,
          results: data.results ?? [],
        });
        fetchStats();
        fetchListings();
      } else {
        setMessage({ type: "error", text: data.error || "Eroare la actualizarea câmpurilor" });
      }
    } catch (e) {
      setMessage({ type: "error", text: e instanceof Error ? e.message : String(e) });
    } finally {
      setIsSyncingAllDetails(false);
    }
  };

  const handleCheckNew = async () => {
    setIsCheckingNew(true);
    setMessage(null);
    setCheckNewLog([]);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        setMessage({ type: "error", text: "Nu ești autentificat" });
        return;
      }
      const res = await fetch("/api/admin/sync-licitatii/check-new", {
        headers: { Authorization: `Bearer ${session.access_token}`, "x-check-stream": "1" },
      });
      const contentType = res.headers.get("Content-Type") || "";
      if (contentType.includes("ndjson") && res.body) {
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        try {
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
                const data = JSON.parse(trimmed);
                if (data.type === "log" && data.message) {
                  setCheckNewLog((prev) => [...prev, data.message]);
                } else if (data.type === "done") {
                  if (data.success) {
                    setCheckNewResult({
                      totalOnPage: data.totalOnPage ?? 0,
                      existingCount: data.existingCount ?? 0,
                      newCount: data.newCount ?? 0,
                    });
                    if (data.message) {
                      setCheckNewLog((prev) => [...prev, data.message]);
                      setMessage({ type: "success", text: data.message });
                    }
                  } else {
                    setMessage({ type: "error", text: data.error || data.message || "Eroare la verificare" });
                  }
                }
              } catch {
                // ignore
              }
            }
          }
          if (buffer.trim()) {
            try {
              const data = JSON.parse(buffer.trim());
              if (data.type === "done") {
                if (data.success) {
                  setCheckNewResult({
                    totalOnPage: data.totalOnPage ?? 0,
                    existingCount: data.existingCount ?? 0,
                    newCount: data.newCount ?? 0,
                  });
                  if (data.message) {
                    setCheckNewLog((prev) => [...prev, data.message]);
                    setMessage({ type: "success", text: data.message });
                  }
                } else {
                  setMessage({ type: "error", text: data.error || data.message || "Eroare la verificare" });
                }
              }
            } catch {
              // ignore
            }
          }
        } catch (streamErr) {
          setMessage({ type: "error", text: streamErr instanceof Error ? streamErr.message : String(streamErr) });
        }
        return;
      }
      const data = await res.json();
      if (data.success) {
        setCheckNewResult({
          totalOnPage: data.totalOnPage ?? 0,
          existingCount: data.existingCount ?? 0,
          newCount: data.newCount ?? 0,
        });
        if (data.message) setMessage({ type: "success", text: data.message });
      } else {
        setMessage({ type: "error", text: data.error || data.message || "Eroare la verificare" });
      }
    } catch (e) {
      setMessage({ type: "error", text: e instanceof Error ? e.message : String(e) });
    } finally {
      setIsCheckingNew(false);
    }
  };

  const handleSyncNewOnly = async () => {
    setIsSyncingNewOnly(true);
    setMessage(null);
    setSyncNewOnlyLog([]);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        setMessage({ type: "error", text: "Nu ești autentificat" });
        return;
      }
      const res = await fetch("/api/admin/sync-licitatii/sync-new-only", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}`, "x-sync-new-stream": "1" },
      });
      const contentType = res.headers.get("Content-Type") || "";
      if (contentType.includes("ndjson") && res.body) {
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        try {
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
                const data = JSON.parse(trimmed);
                if (data.type === "log" && data.message) {
                  setSyncNewOnlyLog((prev) => [...prev, data.message]);
                } else if (data.type === "done") {
                  if (data.success !== false && !data.error) {
                    setMessage({
                      type: "success",
                      text: data.message || `Sincronizate doar cele noi: ${data.inserted ?? 0} inserate, ${data.failed ?? 0} eșecuri.`,
                    });
                    if ((data.inserted ?? 0) > 0) {
                      fetchStatsRef.current?.();
                      fetchListingsRef.current?.();
                    }
                  } else {
                    setMessage({ type: "error", text: data.error || "Eroare la sincronizarea celor noi" });
                  }
                }
              } catch {
                // ignore
              }
            }
          }
          if (buffer.trim()) {
            try {
              const data = JSON.parse(buffer.trim());
              if (data.type === "done") {
                if (data.success !== false && !data.error) {
                  setMessage({
                    type: "success",
                    text: data.message || `Sincronizate doar cele noi: ${data.inserted ?? 0} inserate, ${data.failed ?? 0} eșecuri.`,
                  });
                  if ((data.inserted ?? 0) > 0) {
                    fetchStatsRef.current?.();
                    fetchListingsRef.current?.();
                  }
                } else {
                  setMessage({ type: "error", text: data.error || "Eroare la sincronizarea celor noi" });
                }
              }
            } catch {
              // ignore
            }
          }
        } catch (streamErr) {
          setMessage({ type: "error", text: streamErr instanceof Error ? streamErr.message : String(streamErr) });
        }
        return;
      }
      const data = await res.json();
      if (data.success !== false && !data.error) {
        setMessage({
          type: "success",
          text: data.message || `Sincronizate doar cele noi: ${data.inserted ?? 0} inserate, ${data.failed ?? 0} eșecuri.`,
        });
        if ((data.inserted ?? 0) > 0) {
          fetchStats();
          fetchListings();
        }
      } else {
        setMessage({ type: "error", text: data.error || "Eroare la sincronizarea celor noi" });
      }
    } catch (e) {
      setMessage({ type: "error", text: e instanceof Error ? e.message : String(e) });
    } finally {
      setIsSyncingNewOnly(false);
    }
  };

  const handleRunSync = async () => {
    setIsSyncing(true);
    setMessage(null);
    setLastSummary(null);
    setLiveProgress({ phase: "start", message: "Pornire sincronizare..." });
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const headers: HeadersInit = {
        "Content-Type": "application/json",
        "x-sync-stream": "1",
      };
      if (session?.access_token) headers["Authorization"] = `Bearer ${session.access_token}`;
      const response = await fetch("/api/admin/sync-licitatii", {
        method: "POST",
        headers,
      });
      if (!response.ok || !response.body) {
        const result = await response.json().catch(() => ({}));
        throw new Error(result.error || `HTTP ${response.status}`);
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      try {
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
              const data = JSON.parse(trimmed);
              if (data.type === "progress") {
                setLiveProgress({
                  phase: data.phase,
                  message: data.message,
                  pagesCrawled: data.pagesCrawled,
                  itemsFound: data.itemsFound,
                  inserted: data.inserted,
                  updated: data.updated,
                  softDeleted: data.softDeleted,
                  detailsFetched: data.detailsFetched,
                });
              } else if (data.type === "done") {
                setLiveProgress(null);
                if (data.success && data.summary) {
                  setLastSummary(data.summary);
                  const s = data.summary as SyncSummary;
                  setMessage({
                    type: s.itemsFound > 0 ? "success" : "error",
                    text: s.itemsFound > 0
                      ? `Sincronizare finalizată: ${s.itemsFound} anunțuri, ${s.inserted} noi, ${s.updated} actualizate, ${s.softDeleted} dezactivate${s.errors?.length ? ` (${s.errors.length} erori)` : ""}.`
                      : `Niciun anunț găsit.${s.errors?.length ? " " + s.errors.join(" ") : ""}`,
                  });
                  fetchStats();
                  fetchListings();
                } else {
                  setMessage({ type: "error", text: data.error || "Eroare necunoscută" });
                }
                break;
              }
            } catch {
              // ignore invalid JSON lines
            }
          }
        }
        if (buffer.trim()) {
          try {
            const data = JSON.parse(buffer.trim());
            if (data.type === "done") {
              setLiveProgress(null);
              if (data.success && data.summary) {
                setLastSummary(data.summary);
                const s = data.summary as SyncSummary;
                setMessage({
                  type: s.itemsFound > 0 ? "success" : "error",
                  text: s.itemsFound > 0
                    ? `Sincronizare finalizată: ${s.itemsFound} anunțuri, ${s.inserted} noi, ${s.updated} actualizate.`
                    : `Niciun anunț găsit.`,
                });
                fetchStats();
                fetchListings();
              } else {
                setMessage({ type: "error", text: data.error || "Eroare" });
              }
            }
          } catch {
            // ignore
          }
        }
      } catch (streamErr) {
        const streamMsg = streamErr instanceof Error ? streamErr.message : String(streamErr);
        setLiveProgress(null);
        setMessage({
          type: "error",
          text: streamMsg.includes("input stream") || streamMsg.includes("fetch")
            ? "Conexiunea s-a întrerupt (timeout sau server). Sincronizarea durează mult – poți încerca din nou sau folosi „Sincronizează descrierile” / „Sincronizează PDF-urile” pe loturi mai mici."
            : streamMsg,
        });
      }
    } catch (e) {
      setLiveProgress(null);
      const text = e instanceof Error ? e.message : String(e);
      setMessage({ type: "error", text });
    } finally {
      setIsSyncing(false);
    }
  };

  const handleVerifyStatus = async () => {
    setIsVerifyingStatus(true);
    setMessage(null);
    setVerifyStatusLog([]);
    setVerifyStatusProgress({ phase: "start", message: "Pornire verificare stare..." });
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const headers: HeadersInit = { "Content-Type": "application/json", "x-verify-stream": "1" };
      if (session?.access_token) headers["Authorization"] = `Bearer ${session.access_token}`;
      const response = await fetch("/api/admin/sync-licitatii/verify-status", { method: "POST", headers });
      if (!response.ok || !response.body) {
        const result = await response.json().catch(() => ({}));
        throw new Error(result.error || `HTTP ${response.status}`);
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      try {
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
              const data = JSON.parse(trimmed);
              if (data.type === "progress") {
                if (data.message) setVerifyStatusLog((prev) => [...prev, data.message]);
                setVerifyStatusProgress({
                  phase: data.phase,
                  message: data.message,
                  pagesCrawled: data.pagesCrawled,
                  itemsFound: data.itemsFound,
                  softDeleted: data.softDeleted,
                  reactivated: data.reactivated,
                });
              } else if (data.type === "done") {
                setVerifyStatusProgress(null);
                if (data.success && data.summary) {
                  const s = data.summary as VerifyStatusSummary;
                  setMessage({
                    type: "success",
                    text: `Verificare stare finalizată: ${s.pagesCrawled} pagini, ${s.itemsFound} anunțuri pe site. Dezactivate: ${s.softDeleted}, Reactivate: ${s.reactivated}.${s.errors?.length ? ` (${s.errors.length} erori)` : ""}`,
                  });
                  fetchStatsRef.current?.();
                  fetchListingsRef.current?.();
                } else {
                  setMessage({ type: "error", text: data.error || "Eroare necunoscută" });
                }
                break;
              }
            } catch {
              // ignore invalid JSON lines
            }
          }
        }
        if (buffer.trim()) {
          try {
            const data = JSON.parse(buffer.trim());
            if (data.type === "done") {
              setVerifyStatusProgress(null);
              if (data.success && data.summary) {
                const s = data.summary as VerifyStatusSummary;
                setMessage({
                  type: "success",
                  text: `Verificare stare: ${s.softDeleted} dezactivate, ${s.reactivated} reactivate.`,
                });
                fetchStatsRef.current?.();
                fetchListingsRef.current?.();
              } else {
                setMessage({ type: "error", text: data.error || "Eroare" });
              }
            }
          } catch {
            // ignore
          }
        }
      } catch (streamErr) {
        const streamMsg = streamErr instanceof Error ? streamErr.message : String(streamErr);
        setVerifyStatusProgress(null);
        setMessage({ type: "error", text: streamMsg });
      }
    } catch (e) {
      setVerifyStatusProgress(null);
      setMessage({ type: "error", text: e instanceof Error ? e.message : String(e) });
    } finally {
      setIsVerifyingStatus(false);
    }
  };

  const totalPages = Math.ceil(totalCount / limit);
  const formatDate = (s: string | null) => (s ? new Date(s).toLocaleString("ro-RO", { dateStyle: "short", timeStyle: "short" }) : "—");
  const formatDateOnly = (s: string | null) => (s ? new Date(s).toLocaleDateString("ro-RO") : "—");

  /** Timp relativ în română: "acum 5 minute", "acum 1 oră", "1 zi și 1 oră", etc. */
  const formatRelativeTimeRo = (s: string | null): string => {
    if (!s) return "—";
    const now = new Date();
    const date = new Date(s);
    const diffMs = now.getTime() - date.getTime();
    if (diffMs < 0) return formatDate(s);
    const sec = Math.floor(diffMs / 1000);
    const min = Math.floor(sec / 60);
    const hours = Math.floor(min / 60);
    const days = Math.floor(hours / 24);
    if (sec < 60) return "acum";
    if (min < 60) return min === 1 ? "acum 1 minut" : `acum ${min} minute`;
    if (hours < 24) return hours === 1 ? "acum 1 oră" : `acum ${hours} ore`;
    if (days < 2) {
      const restHours = hours % 24;
      if (restHours === 0) return "1 zi";
      return restHours === 1 ? "1 zi și 1 oră" : `1 zi și ${restHours} ore`;
    }
    const restHours = hours % 24;
    if (restHours === 0) return `${days} zile`;
    return restHours === 1 ? `${days} zile și 1 oră` : `${days} zile și ${restHours} ore`;
  };

  /** Elimină din HTML-ul descrierii orice conținut legat de QR (imagini, linkuri, blocuri). */
  const stripQrFromDescriptionHtml = (html: string): string => {
    if (!html) return "";
    let s = html;
    s = s.replace(/<img[^>]*\b(src|alt)=["'][^"']*qr[^"']*["'][^>]*>/gi, "");
    s = s.replace(/<img[^>]*qr[^>]*>/gi, "");
    s = s.replace(/<a[^>]*\bhref=["'][^"']*qr[^"']*["'][^>]*>[\s\S]*?<\/a>/gi, "");
    s = s.replace(/<[^>]*\b(class|id)=["'][^"']*qr[^"']*["'][^>]*>[\s\S]*?<\/\w+>/gi, "");
    return s.trim();
  };

  const DetailRow = ({ label, value, missing }: { label: string; value: React.ReactNode; missing?: boolean }) => (
    <div className="py-1.5 border-b border-gray-100 last:border-0">
      <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</span>
      <div className={`mt-0.5 text-sm ${missing ? "text-amber-600 italic" : "text-gray-900"}`}>
        {value ?? "—"}
      </div>
    </div>
  );

  function DetailPanel({
    detail,
    formatDate,
    formatDateOnly,
    formatRelativeTimeRo,
    DetailRow: Row,
    onRefreshDescription,
    isRefreshingDescription,
    onRefreshDetail,
    isRefreshingDetail,
  }: {
    detail: ListingDetail;
    formatDate: (s: string | null) => string;
    formatDateOnly: (s: string | null) => string;
    formatRelativeTimeRo: (s: string | null) => string;
    DetailRow: typeof DetailRow;
    onRefreshDescription?: (id: string) => void;
    isRefreshingDescription?: (id: string) => boolean;
    onRefreshDetail?: (id: string, only: DetailUpdateGroup) => void;
    isRefreshingDetail?: (id: string, only: string) => boolean;
  }) {
    const has = (v: string | null | undefined) => v != null && String(v).trim() !== "";
    const isAutoCategory =
      detail.category != null &&
      /^(Autoturisme|Camioane|Vehicule\s+Utilitare|Vehicule\s+Transport\s+Persoane)$/i.test(
        String(detail.category).trim()
      );
    const hasAnyAutoField =
      has(detail.info_marca) ||
      has(detail.info_km) ||
      has(detail.info_combustibil) ||
      has(detail.info_an_fabricatie) ||
      has(detail.info_capacitate_cilindrica);
    const isImobiliareCategory =
      detail.category != null &&
      /^(Apartamente\s*si\s*case|Cladiri|Terenuri|Teren\s+cu\s+cladire|Proiecte\s*imobiliare|Proprietati\s*industriale|Spatii\s*de\s*birouri|Spatii\s*comerciale|Pensiuni|Hoteluri)$/i.test(
        String(detail.category).trim()
      );
    const hasAnyImobiliareField =
      has(detail.info_suprafata) ||
      has(detail.info_tip_imobil) ||
      has(detail.info_camere) ||
      has(detail.info_an_constructie);
    const refreshBtn = (label: string, only: DetailUpdateGroup) => {
      if (!onRefreshDetail) return null;
      const loading = isRefreshingDetail?.(detail.id, only);
      return (
        <button
          type="button"
          onClick={() => onRefreshDetail(detail.id, only)}
          disabled={loading}
          className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded bg-emerald-100 text-emerald-800 hover:bg-emerald-200 disabled:opacity-50 disabled:pointer-events-none"
        >
          {loading ? <i className="ri-loader-4-line animate-spin" /> : <i className="ri-refresh-line" />}
          {label}
        </button>
      );
    };

    return (
      <div className="p-6">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-4 border-b border-gray-200 pb-2">
          <h4 className="text-sm font-semibold text-gray-800">Detalii salvate (anunț #{detail.source_external_id})</h4>
          {onRefreshDetail && (
            <div className="flex flex-wrap items-center gap-1.5">
              {refreshBtn("Toate câmpurile", "all")}
              {refreshBtn("Descriere", "description")}
              {refreshBtn("PDF-uri", "pdf")}
              {refreshBtn("Vânzător", "seller")}
              {refreshBtn("Sincronizează data și ora 2", "all")}
            </div>
          )}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <div className="space-y-0">
            <Row label="Titlu" value={detail.title} missing={!has(detail.title)} />
            <Row label="Preț (text)" value={formatPriceTextForDisplay(detail.price_text)} missing={!has(detail.price_text)} />
            <Row label="Categorie" value={detail.category} missing={!has(detail.category)} />
            <Row label="Tip vânzare" value={detail.sale_type} missing={!has(detail.sale_type)} />
            {(isAutoCategory || hasAnyAutoField) && (
              <>
                <Row label="Marca" value={detail.info_marca} missing={!has(detail.info_marca)} />
                <Row label="KM" value={detail.info_km} missing={!has(detail.info_km)} />
                <Row label="Combustibil" value={detail.info_combustibil} missing={!has(detail.info_combustibil)} />
                <Row label="An fabricație" value={detail.info_an_fabricatie} missing={!has(detail.info_an_fabricatie)} />
                <Row label="Capacitate cilindrică" value={detail.info_capacitate_cilindrica} missing={!has(detail.info_capacitate_cilindrica)} />
              </>
            )}
            {(isImobiliareCategory || hasAnyImobiliareField) && (
              <>
                <Row label="Suprafață" value={detail.info_suprafata} missing={!has(detail.info_suprafata)} />
                <Row label="Tip imobil / teren" value={detail.info_tip_imobil} missing={!has(detail.info_tip_imobil)} />
                <Row label="Camere" value={detail.info_camere} missing={!has(detail.info_camere)} />
                <Row label="An construcție" value={detail.info_an_constructie} missing={!has(detail.info_an_constructie)} />
              </>
            )}
            <Row label="Locație (raw)" value={detail.location_raw} missing={!has(detail.location_raw)} />
            <Row label="Județ" value={detail.location_county} missing={!has(detail.location_county)} />
            <Row label="Oraș" value={detail.location_city} missing={!has(detail.location_city)} />
          </div>
          <div className="space-y-0">
            <Row label="Vânzător" value={detail.seller_name} missing={!has(detail.seller_name)} />
            <Row label="Profil vânzător" value={detail.seller_profile_url ? <a href={detail.seller_profile_url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">Link</a> : null} missing={!has(detail.seller_profile_url)} />
            <Row label="Email vânzător" value={detail.seller_email} missing={!has(detail.seller_email)} />
            <Row label="Telefon vânzător" value={detail.seller_phone} missing={!has(detail.seller_phone)} />
            <Row label="Adresă vânzător" value={detail.seller_address} missing={!has(detail.seller_address)} />
            <Row label="Data publicării" value={formatDateOnly(detail.published_at)} missing={!has(detail.published_at)} />
            <Row label="Data licitației" value={detail.auction_date ? formatDateOnly(detail.auction_date) : null} missing={!has(detail.auction_date)} />
            <Row label="Ora licitației" value={detail.auction_time} missing={!has(detail.auction_time)} />
            <Row
              label="Data licitației 2"
              value={
                (detail.meta_fields && (detail.meta_fields["Data licitatie 2"] ?? detail.meta_fields["data_licitatie_2"]))
                  ? String(detail.meta_fields["Data licitatie 2"] ?? detail.meta_fields["data_licitatie_2"]).trim()
                  : null
              }
              missing={!detail.meta_fields?.["Data licitatie 2"] && !detail.meta_fields?.["data_licitatie_2"]}
            />
            <Row
              label="Ora licitației 2"
              value={(detail.meta_fields && (detail.meta_fields["Ora licitatie 2"] ?? detail.meta_fields["ora_licitatie_2"])) || null}
              missing={!detail.meta_fields?.["Ora licitatie 2"] && !detail.meta_fields?.["ora_licitatie_2"]}
            />
            <Row
              label="PDF"
              value={
                (detail.pdf_urls && detail.pdf_urls.length > 0)
                  ? (() => {
                      const urls = detail.pdf_urls ?? [];
                      return (
                        <div className="flex flex-col gap-1">
                          {urls.map((url, i) => (
                            <a key={i} href={url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline truncate max-w-xs" title={url}>
                              PDF {urls.length > 1 ? `${i + 1}/${urls.length}` : ""} {url.split("/").pop() || "Deschide"}
                            </a>
                          ))}
                        </div>
                      );
                    })()
                  : detail.pdf_url
                    ? <a href={detail.pdf_url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">Deschide PDF</a>
                    : null
              }
              missing={!has(detail.pdf_url) && (!detail.pdf_urls || detail.pdf_urls.length === 0)}
            />
            <Row label="Sursă" value={<a href={detail.source_url} target="_blank" rel="noopener noreferrer" className="text-emerald-600 hover:underline">Deschide anunț</a>} />
          </div>
          <div className="space-y-0">
            <Row label="Ultima vedere" value={formatDate(detail.last_seen_at)} />
            <Row
              label="Creat la"
              value={
                <span title={formatDate(detail.created_at)}>
                  {formatRelativeTimeRo(detail.created_at)}
                  <span className="text-gray-400 font-normal ml-1">({formatDate(detail.created_at)})</span>
                </span>
              }
            />
            <Row label="Actualizat la" value={formatDate(detail.updated_at)} />
            <Row
              label="Status"
              value={
                detail.deleted_at ? (
                  <span className="text-red-600">Dezactivat</span>
                ) : detail.reactivated_at ? (
                  <span className="text-orange-700 font-medium">Reactivat</span>
                ) : (
                  <span className="text-emerald-600">Activ</span>
                )
              }
            />
            <Row label="Imagini (nr)" value={detail.images?.length ?? 0} missing={!(detail.images?.length) || detail.images?.length === 0} />
          </div>
        </div>
        {detail.meta_fields && Object.keys(detail.meta_fields).length > 0 && (
          <div className="mt-4 pt-4 border-t border-gray-200">
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Informații adiționale</span>
            <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-1 text-sm">
              {Object.entries(detail.meta_fields).map(([label, value]) => (
                <div key={label} className="py-1 border-b border-gray-100">
                  <span className="text-gray-500 font-medium">{label}</span>
                  <div className="text-gray-900 mt-0.5">{value}</div>
                </div>
              ))}
            </div>
          </div>
        )}
        {detail.images && detail.images.length > 0 && (
          <div className="mt-4 pt-4 border-t border-gray-200">
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Imagini</span>
            <div className="mt-2 flex flex-wrap gap-2">
              {detail.images.map((img) => (
                <a key={img.id} href={img.url} target="_blank" rel="noopener noreferrer" className="block">
                  <img src={img.url} alt="" className="h-20 w-20 object-cover rounded border border-gray-200" />
                </a>
              ))}
            </div>
          </div>
        )}
        <div className="mt-4 pt-4 border-t border-gray-200">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Descriere (HTML)</span>
            {onRefreshDescription && (
              <button
                type="button"
                onClick={() => onRefreshDescription(detail.id)}
                disabled={isRefreshingDescription?.(detail.id)}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md bg-emerald-100 text-emerald-800 hover:bg-emerald-200 disabled:opacity-50 disabled:pointer-events-none"
              >
                {isRefreshingDescription?.(detail.id) ? (
                  <>
                    <i className="ri-loader-4-line animate-spin" />
                    Se extrage…
                  </>
                ) : (
                  <>
                    <i className="ri-refresh-line" />
                    Actualizează doar descrierea
                  </>
                )}
              </button>
            )}
          </div>
          <div className={`mt-2 text-sm rounded border p-3 max-h-48 overflow-auto bg-white ${has(detail.description_html) ? "text-gray-900 border-gray-200" : "text-amber-600 italic border-amber-200"}`}>
            {has(detail.description_html) ? (
              <div dangerouslySetInnerHTML={{ __html: stripQrFromDescriptionHtml(detail.description_html || "") }} />
            ) : (
              "— (lipsă)"
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 p-6">
      {showConfirmSyncModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowConfirmSyncModal(false)}>
          <div className="bg-white rounded-xl shadow-xl border border-gray-200 p-6 max-w-sm w-full mx-4" onClick={(e) => e.stopPropagation()}>
            <p className="text-gray-800 font-medium mb-4">Ești sigur că vrei să rulezi sincronizarea forțată?</p>
            <div className="flex gap-3 justify-end">
              <button
                type="button"
                onClick={() => setShowConfirmSyncModal(false)}
                className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50"
              >
                Nu
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowConfirmSyncModal(false);
                  handleRunSync();
                }}
                className="px-4 py-2 bg-red-500 text-white rounded-lg font-medium hover:bg-red-600"
              >
                Da
              </button>
            </div>
          </div>
        </div>
      )}
      {showConfirmDeleteDeactivatedModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => !isDeletingDeactivated && setShowConfirmDeleteDeactivatedModal(false)}>
          <div className="bg-white rounded-xl shadow-xl border border-gray-200 p-6 max-w-md w-full mx-4" onClick={(e) => e.stopPropagation()}>
            <p className="text-gray-800 font-medium mb-2">Ești sigur că vrei să ștergi definitiv toate anunțurile dezactivate?</p>
            <p className="text-gray-600 text-sm mb-4">Această acțiune nu poate fi anulată.</p>
            <div className="flex gap-3 justify-end">
              <button
                type="button"
                onClick={() => !isDeletingDeactivated && setShowConfirmDeleteDeactivatedModal(false)}
                disabled={isDeletingDeactivated}
                className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50 disabled:opacity-50"
              >
                Nu
              </button>
              <button
                type="button"
                onClick={handleDeleteDeactivated}
                disabled={isDeletingDeactivated}
                className="px-4 py-2 bg-red-500 text-white rounded-lg font-medium hover:bg-red-600 disabled:opacity-50"
              >
                {isDeletingDeactivated ? "Se șterg…" : "Da"}
              </button>
            </div>
          </div>
        </div>
      )}
      {showConfirmSyncCountiesModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => !isSyncingCounties && setShowConfirmSyncCountiesModal(false)}>
          <div className="bg-white rounded-xl shadow-xl border border-gray-200 p-6 max-w-md w-full mx-4" onClick={(e) => e.stopPropagation()}>
            <p className="text-gray-800 font-medium mb-2">
              {selectedIds.size > 0
                ? `Ești sigur că vrei să sincronizezi județele pentru cele ${selectedIds.size} anunțuri selectate?`
                : "Ești sigur că vrei să sincronizezi județele? Se vor selecta automat anunțurile fără județ și se va rula sincronizarea."}
            </p>
            <div className="flex gap-3 justify-end mt-4">
              <button
                type="button"
                onClick={() => !isSyncingCounties && setShowConfirmSyncCountiesModal(false)}
                disabled={isSyncingCounties}
                className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50 disabled:opacity-50"
              >
                Nu
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowConfirmSyncCountiesModal(false);
                  handleSyncCountiesWithoutCounty();
                }}
                disabled={isSyncingCounties}
                className="px-4 py-2 bg-lime-500 text-white rounded-lg font-medium hover:bg-lime-600 disabled:opacity-50"
              >
                Da
              </button>
            </div>
          </div>
        </div>
      )}
      {showConfirmSyncDetailsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => !isSyncingAllDetails && setShowConfirmSyncDetailsModal(false)}>
          <div className="bg-white rounded-xl shadow-xl border border-gray-200 p-6 max-w-md w-full mx-4" onClick={(e) => e.stopPropagation()}>
            <p className="text-gray-800 font-medium mb-2">
              {selectedIds.size > 0
                ? `Ești sigur că vrei să sincronizezi toate câmpurile (descriere, PDF, etc.) pentru cele ${selectedIds.size} anunțuri selectate?`
                : "Ești sigur? Se selectează automat anunțurile fără data licitației și se rulează sincronizarea toate câmpurile."}
            </p>
            <div className="flex gap-3 justify-end mt-4">
              <button
                type="button"
                onClick={() => !isSyncingAllDetails && setShowConfirmSyncDetailsModal(false)}
                disabled={isSyncingAllDetails}
                className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50 disabled:opacity-50"
              >
                Nu
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowConfirmSyncDetailsModal(false);
                  handleSyncDetailsWithIncomplete();
                }}
                disabled={isSyncingAllDetails}
                className="px-4 py-2 bg-blue-500 text-white rounded-lg font-medium hover:bg-blue-600 disabled:opacity-50"
              >
                Da
              </button>
            </div>
          </div>
        </div>
      )}
      <div className="max-w-7xl mx-auto">
        <button
          onClick={() => router.push("/admin/importuri")}
          className="mb-4 flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors"
        >
          <i className="ri-arrow-left-line" />
          <span>Înapoi la Importuri</span>
        </button>

        <div className="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden mb-6">
          <div className="p-6 border-b border-gray-200">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 rounded-xl flex items-center justify-center shadow-lg bg-white border border-gray-200 overflow-hidden">
                  <img src="/images/logo-unpir.png" alt="UNPIR" className="w-full h-full object-contain" />
                </div>
                <div>
                  <h1 className="text-2xl font-bold text-gray-900">Licitatii insolventa</h1>
                  <p className="text-gray-600 text-sm mt-1 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-green-500 shrink-0 animate-pulse" title="Online" />
                    Sincronizare cu <strong>licitatii-insolventa.ro</strong>
                  </p>
                  <div className="mt-3 flex items-center gap-3">
                    <img src="/favicon.ico" alt="gobid" className="w-6 h-6 rounded object-contain" />
                    <Link
                      href="/admin/importuri/licitatii-publice/panel"
                      className="px-3 py-1.5 rounded-lg border border-gray-300 bg-white text-gray-800 text-sm font-medium hover:bg-gray-50 shadow-sm flex items-center gap-1.5"
                    >
                      <i className="ri-dashboard-3-line" />
                      Panel
                    </Link>
                    <button
                      type="button"
                      onClick={() => setShowActionButtons((v) => !v)}
                      className="px-3 py-1.5 rounded-lg border border-gray-400 bg-white text-gray-700 text-sm font-medium hover:bg-gray-50 shadow-sm flex items-center gap-1.5"
                      title={showActionButtons ? "Ascunde butoanele de acțiune" : "Afișează butoanele de acțiune"}
                    >
                      {showActionButtons ? <i className="ri-eye-line" /> : <i className="ri-eye-off-line" />}
                      <span>{showActionButtons ? "Ascunde" : "Afișează"} butoane</span>
                    </button>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 flex flex-wrap items-center gap-6 shadow-sm">
                  <div className="text-center">
                    <p className="text-xs text-gray-500 uppercase tracking-wide">Active</p>
                    <p className="text-xl font-bold text-emerald-600">{stats?.active ?? "—"}</p>
                    {(stats?.activeToday ?? 0) > 0 && (
                      <p className="text-xs text-emerald-600 mt-0.5">AZI: {stats?.activeToday} noi</p>
                    )}
                  </div>
                  <div className="w-px h-10 bg-gray-200" />
                  <div className="relative text-center min-w-[5rem]">
                    <button
                      type="button"
                      onClick={handleVerifyStatus}
                      disabled={isVerifyingStatus || isSyncing}
                      className="absolute top-0 right-0 p-1 rounded text-red-500 hover:text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      title="Reverificare anunțuri dezactivate"
                    >
                      <i className={isVerifyingStatus ? "ri-loader-4-line animate-spin text-base text-red-500" : "ri-refresh-line text-base"} />
                    </button>
                    <p className="text-xs text-gray-500 uppercase tracking-wide">Dezactivate</p>
                    <p className="text-xl font-bold text-gray-600">{stats?.deleted ?? "—"}</p>
                    {(stats?.deletedToday ?? 0) > 0 && (
                      <p className="text-xs text-gray-600 mt-0.5">AZI: {stats?.deletedToday}</p>
                    )}
                  </div>
                  <div className="w-px h-10 bg-gray-200" />
                  <div className="text-center">
                    <p className="text-xs text-gray-500 uppercase tracking-wide">Reactivate</p>
                    <p className="text-xl font-bold text-orange-700">{stats?.reactivated ?? 0}</p>
                    <p className="text-xs text-orange-600 mt-0.5">AZI: {stats?.reactivatedToday ?? 0}</p>
                  </div>
                  <div className="w-px h-10 bg-gray-200" />
                  <div className="text-center">
                    <p className="text-xs text-gray-500 uppercase tracking-wide">Noi (pe prima pagină)</p>
                    <p className="text-xl font-bold text-sky-600">
                      {checkNewResult?.newCount ?? 0}
                    </p>
                  </div>
                </div>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap items-center justify-end gap-3">
              <button
                type="button"
                onClick={handleCheckNew}
                disabled={isCheckingNew || isSyncing || isVerifyingStatus}
                className="px-4 py-2 border border-slate-500 text-slate-700 rounded-lg font-medium hover:bg-slate-50 transition-all disabled:opacity-60 flex items-center gap-2"
                title="Verifică doar prima pagină – câte anunțuri noi există (fără a rula sincronizarea completă)"
              >
                {isCheckingNew ? <i className="ri-loader-4-line animate-spin" /> : <i className="ri-refresh-line" />}
                <span>Verifică anunțuri noi</span>
              </button>
              <button
                type="button"
                onClick={handleSyncNewOnly}
                disabled={isSyncingNewOnly || isSyncing || isVerifyingStatus}
                className="px-4 py-2 border border-sky-500 text-sky-700 rounded-lg font-medium hover:bg-sky-50 transition-all disabled:opacity-60 flex items-center gap-2"
                title="Sincronizează doar anunțurile noi (primele pagini) – inserează în DB fără a actualiza sau dezactiva existente"
              >
                {isSyncingNewOnly ? <i className="ri-loader-4-line animate-spin" /> : <i className="ri-download-cloud-line" />}
                <span>Sincronizează doar cele noi</span>
              </button>
              <button
                type="button"
                onClick={handleVerifyStatus}
                disabled={isVerifyingStatus || isSyncing}
                className="px-4 py-2 border border-amber-500 text-amber-700 rounded-lg font-medium hover:bg-amber-50 transition-all disabled:opacity-60 flex items-center gap-2"
                title="Parcurge toate paginile și actualizează doar starea (active/dezactivate) – nu inserează anunțuri noi"
              >
                {isVerifyingStatus ? <i className="ri-loader-4-line animate-spin" /> : <i className="ri-checkbox-circle-line" />}
                <span>Verificare stare anunțuri existente</span>
              </button>
            </div>
            {/* Verificare automată + Adăugare automată produse noi – sus dreapta */}
            <div className="mt-4 pt-4 border-t border-gray-200 flex flex-wrap items-center justify-end gap-6">
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 cursor-pointer select-none" title="Verifică periodic anunțuri noi pe prima pagină">
                  <span className="text-sm font-medium text-gray-700">Verificare automată</span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={autoVerifyOn}
                    onClick={() => setAutoVerifyOn((v) => !v)}
                    className={`relative inline-flex h-6 w-11 shrink-0 rounded-full border transition-colors focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-1 ${
                      autoVerifyOn ? "border-sky-500 bg-sky-500" : "border-gray-300 bg-gray-200"
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow ring-0 transition-transform ${
                        autoVerifyOn ? "translate-x-5" : "translate-x-0.5"
                      }`}
                      style={{ marginTop: 2 }}
                    />
                  </button>
                </label>
                {autoVerifyOn && (
                  <label className="flex items-center gap-2">
                    <span className="text-sm text-gray-600">la</span>
                    <select
                      value={autoVerifyIntervalHours}
                      onChange={(e) => setAutoVerifyIntervalHours(Number(e.target.value))}
                      className="rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-800 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                    >
                      {Array.from({ length: 24 }, (_, i) => i + 1).map((h) => (
                        <option key={h} value={h}>
                          {h} {h === 1 ? "oră" : "ore"}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
              </div>
              <div className="flex items-center gap-2">
                <label className="flex items-center gap-2 cursor-pointer select-none" title="Împreună cu verificarea automată – adaugă și sincronizează produsele noi găsite">
                  <span className="text-sm font-medium text-gray-700">Adăugare automată produse noi</span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={autoAddNewOn}
                    onClick={() => setAutoAddNewOn((v) => !v)}
                    disabled={!autoVerifyOn}
                    className={`relative inline-flex h-6 w-11 shrink-0 rounded-full border transition-colors focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-1 disabled:opacity-50 disabled:cursor-not-allowed ${
                      autoAddNewOn ? "border-emerald-500 bg-emerald-500" : "border-gray-300 bg-gray-200"
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow ring-0 transition-transform ${
                        autoAddNewOn ? "translate-x-5" : "translate-x-0.5"
                      }`}
                      style={{ marginTop: 2 }}
                    />
                  </button>
                </label>
              </div>
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 cursor-pointer select-none" title="Verifică periodic starea anunțurilor existente (active/dezactivate)">
                  <span className="text-sm font-medium text-gray-700">Verificare automată stare anunțuri</span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={autoVerifyStatusOn}
                    onClick={() => setAutoVerifyStatusOn((v) => !v)}
                    className={`relative inline-flex h-6 w-11 shrink-0 rounded-full border transition-colors focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-1 ${
                      autoVerifyStatusOn ? "border-amber-500 bg-amber-500" : "border-gray-300 bg-gray-200"
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow ring-0 transition-transform ${
                        autoVerifyStatusOn ? "translate-x-5" : "translate-x-0.5"
                      }`}
                      style={{ marginTop: 2 }}
                    />
                  </button>
                </label>
                {autoVerifyStatusOn && (
                  <label className="flex items-center gap-2">
                    <span className="text-sm text-gray-600">la</span>
                    <select
                      value={autoVerifyStatusIntervalHours}
                      onChange={(e) => setAutoVerifyStatusIntervalHours(Number(e.target.value))}
                      className="rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-800 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
                    >
                      {Array.from({ length: 24 }, (_, i) => i + 1).map((h) => (
                        <option key={h} value={h}>
                          {h} {h === 1 ? "oră" : "ore"}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
              </div>
            </div>
          </div>

          <div className="p-6 space-y-6">
            {message && (
              <div
                className={`rounded-lg p-4 ${
                  message.type === "success"
                    ? "bg-green-50 border border-green-200 text-green-800"
                    : "bg-red-50 border border-red-200 text-red-800"
                }`}
              >
                <p className="mb-0">{message.text}</p>
                {message.type === "success" && (checkNewResult?.newCount ?? 0) > 0 && (
                  <div className="mt-3">
                    <button
                      type="button"
                      onClick={handleSyncNewOnly}
                      disabled={isSyncingNewOnly || isSyncing || isVerifyingStatus}
                      className="px-4 py-2 border border-sky-500 bg-sky-500 text-white rounded-lg font-medium hover:bg-sky-600 transition-all disabled:opacity-60 flex items-center gap-2 inline-flex"
                      title="Sincronizează doar anunțurile noi (primele pagini)"
                    >
                      {isSyncingNewOnly ? <i className="ri-loader-4-line animate-spin" /> : <i className="ri-download-cloud-line" />}
                      <span>Sincronizează doar cele noi</span>
                    </button>
                  </div>
                )}
              </div>
            )}

            {(isCheckingNew || checkNewLog.length > 0) && (
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 relative">
                {!isCheckingNew && (
                  <button
                    type="button"
                    onClick={() => setCheckNewLog([])}
                    className="absolute top-3 right-3 w-7 h-7 flex items-center justify-center rounded text-slate-500 hover:text-slate-700 hover:bg-slate-200 transition-colors"
                    title="Închide log"
                  >
                    <i className="ri-close-line text-lg" />
                  </button>
                )}
                <p className="text-sm font-medium text-slate-800 mb-2 flex items-center gap-2 pr-8">
                  {isCheckingNew ? <i className="ri-loader-4-line animate-spin text-slate-600" /> : null}
                  Verificare anunțuri noi – log live
                </p>
                <ul ref={checkNewLogScrollRef} className="text-sm text-slate-700 space-y-1 font-mono max-h-48 overflow-y-auto">
                  {checkNewLog.map((line, i) => (
                    <li key={i}>{line}</li>
                  ))}
                  {isCheckingNew && checkNewLog.length === 0 && (
                    <li className="text-slate-500">Se pornește verificarea...</li>
                  )}
                </ul>
              </div>
            )}

            {(isSyncingNewOnly || syncNewOnlyLog.length > 0) && (
              <div className="rounded-lg border border-sky-200 bg-sky-50/80 p-4 relative">
                {!isSyncingNewOnly && (
                  <button
                    type="button"
                    onClick={() => setSyncNewOnlyLog([])}
                    className="absolute top-3 right-3 w-7 h-7 flex items-center justify-center rounded text-sky-500 hover:text-sky-700 hover:bg-sky-200 transition-colors"
                    title="Închide log"
                  >
                    <i className="ri-close-line text-lg" />
                  </button>
                )}
                <p className="text-sm font-medium text-sky-800 mb-2 flex items-center gap-2 pr-8">
                  {isSyncingNewOnly ? <i className="ri-loader-4-line animate-spin text-sky-600" /> : null}
                  Sincronizează doar cele noi – log live
                </p>
                <ul ref={syncNewOnlyLogScrollRef} className="text-sm text-sky-700 space-y-1 font-mono max-h-48 overflow-y-auto">
                  {syncNewOnlyLog.map((line, i) => (
                    <li key={i}>{line}</li>
                  ))}
                  {isSyncingNewOnly && syncNewOnlyLog.length === 0 && (
                    <li className="text-sky-500">Se pornește sincronizarea...</li>
                  )}
                </ul>
              </div>
            )}

            {isSyncing && liveProgress && (
              <div className="rounded-lg border-2 border-emerald-200 bg-emerald-50 p-4">
                <div className="flex items-center gap-2 mb-3">
                  <i className="ri-loader-4-line animate-spin text-emerald-600 text-xl" />
                  <span className="font-semibold text-emerald-800">Sincronizare în curs</span>
                </div>
                <p className="text-sm text-emerald-700 mb-3">
                  {liveProgress.message || liveProgress.phase || "Se procesează..."}
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2 text-sm">
                  <div className="bg-white/80 rounded px-2 py-1.5 border border-emerald-100">
                    <span className="text-emerald-600">Pagini</span>
                    <span className="ml-1 font-mono font-semibold text-gray-900">{liveProgress.pagesCrawled ?? 0}</span>
                  </div>
                  <div className="bg-white/80 rounded px-2 py-1.5 border border-emerald-100">
                    <span className="text-emerald-600">Anunțuri</span>
                    <span className="ml-1 font-mono font-semibold text-gray-900">{liveProgress.itemsFound ?? 0}</span>
                  </div>
                  <div className="bg-white/80 rounded px-2 py-1.5 border border-emerald-100">
                    <span className="text-emerald-600">Noi</span>
                    <span className="ml-1 font-mono font-semibold text-gray-900">{liveProgress.inserted ?? 0}</span>
                  </div>
                  <div className="bg-white/80 rounded px-2 py-1.5 border border-emerald-100">
                    <span className="text-emerald-600">Actualizate</span>
                    <span className="ml-1 font-mono font-semibold text-gray-900">{liveProgress.updated ?? 0}</span>
                  </div>
                  <div className="bg-white/80 rounded px-2 py-1.5 border border-emerald-100">
                    <span className="text-emerald-600">Dezactivate</span>
                    <span className="ml-1 font-mono font-semibold text-gray-900">{liveProgress.softDeleted ?? 0}</span>
                  </div>
                  <div className="bg-white/80 rounded px-2 py-1.5 border border-emerald-100">
                    <span className="text-emerald-600">Detalii</span>
                    <span className="ml-1 font-mono font-semibold text-gray-900">{liveProgress.detailsFetched ?? 0}</span>
                  </div>
                </div>
              </div>
            )}

            {(isVerifyingStatus || verifyStatusLog.length > 0) && (
              <div className="rounded-lg border-2 border-amber-200 bg-amber-50 p-4 relative">
                {!isVerifyingStatus && (
                  <button
                    type="button"
                    onClick={() => { setVerifyStatusLog([]); setVerifyStatusProgress(null); }}
                    className="absolute top-3 right-3 w-7 h-7 flex items-center justify-center rounded text-amber-600 hover:text-amber-800 hover:bg-amber-100 transition-colors"
                    title="Închide log"
                  >
                    <i className="ri-close-line text-lg" />
                  </button>
                )}
                <div className="flex items-center gap-2 mb-3 pr-8">
                  {isVerifyingStatus ? <i className="ri-loader-4-line animate-spin text-amber-600 text-xl" /> : null}
                  <span className="font-semibold text-amber-800">Verificare stare anunțuri existente</span>
                </div>
                {(verifyStatusProgress?.pagesCrawled != null || verifyStatusProgress?.itemsFound != null) && (
                  <>
                    <p className="text-sm text-amber-700 mb-2">
                      {verifyStatusProgress?.message || verifyStatusProgress?.phase || "Se parcurg paginile..."}
                    </p>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm mb-3">
                      <div className="bg-white/80 rounded px-2 py-1.5 border border-amber-100">
                        <span className="text-amber-600">Pagini</span>
                        <span className="ml-1 font-mono font-semibold text-gray-900">{verifyStatusProgress?.pagesCrawled ?? 0}</span>
                      </div>
                      <div className="bg-white/80 rounded px-2 py-1.5 border border-amber-100">
                        <span className="text-amber-600">Anunțuri pe site</span>
                        <span className="ml-1 font-mono font-semibold text-gray-900">{verifyStatusProgress?.itemsFound ?? 0}</span>
                      </div>
                      <div className="bg-white/80 rounded px-2 py-1.5 border border-amber-100">
                        <span className="text-amber-600">Dezactivate</span>
                        <span className="ml-1 font-mono font-semibold text-gray-900">{verifyStatusProgress?.softDeleted ?? 0}</span>
                      </div>
                      <div className="bg-white/80 rounded px-2 py-1.5 border border-amber-100">
                        <span className="text-amber-600">Reactivate</span>
                        <span className="ml-1 font-mono font-semibold text-gray-900">{verifyStatusProgress?.reactivated ?? 0}</span>
                      </div>
                    </div>
                  </>
                )}
                <p className="text-xs font-medium text-amber-700 uppercase tracking-wide mb-1">Log live</p>
                <ul ref={verifyStatusLogScrollRef} className="text-sm text-amber-800 space-y-1 font-mono max-h-40 overflow-y-auto bg-white/60 rounded p-2">
                  {verifyStatusLog.map((line, i) => (
                    <li key={i}>{line}</li>
                  ))}
                  {isVerifyingStatus && verifyStatusLog.length === 0 && (
                    <li className="text-amber-600">Se pornește verificarea...</li>
                  )}
                </ul>
              </div>
            )}

            {lastSummary && (
              <div className="rounded-lg border border-gray-200 p-4 bg-gray-50">
                <h3 className="font-semibold text-gray-900 mb-2">Rezumat ultimă sincronizare</h3>
                <ul className="text-sm text-gray-700 space-y-1">
                  <li>Pagini parcurse: <strong>{lastSummary.pagesCrawled}</strong></li>
                  <li>Anunțuri găsite: <strong>{lastSummary.itemsFound}</strong></li>
                  <li>Inserate: <strong>{lastSummary.inserted}</strong></li>
                  <li>Actualizate: <strong>{lastSummary.updated}</strong></li>
                  <li>Dezactivate: <strong>{lastSummary.softDeleted}</strong></li>
                  <li>Detalii descărcate: <strong>{lastSummary.detailsFetched}</strong></li>
                  {lastSummary.errors?.length > 0 && (
                    <li className="text-amber-700">
                      Erori: {lastSummary.errors.length}
                      <pre className="mt-1 text-xs overflow-auto max-h-32 bg-gray-100 p-2 rounded border border-gray-200">
                        {lastSummary.errors.slice(0, 10).join("\n")}
                      </pre>
                    </li>
                  )}
                </ul>
              </div>
            )}

            {showActionButtons && (
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={handleTestConnection}
                disabled={isTesting || isSyncing || isVerifyingStatus}
                className="px-4 py-2 border border-emerald-500 text-emerald-600 rounded-lg font-medium hover:bg-emerald-50 transition-all disabled:opacity-60 flex items-center gap-2"
              >
                {isTesting ? <i className="ri-loader-4-line animate-spin" /> : <i className="ri-wifi-line" />}
                <span>Testează conectare</span>
              </button>
              <button
                type="button"
                onClick={() => setShowConfirmSyncModal(true)}
                disabled={isSyncing || isVerifyingStatus}
                className="px-6 py-3 bg-gradient-to-r from-red-500 to-red-600 text-white font-semibold rounded-lg shadow hover:shadow-lg hover:from-red-600 hover:to-red-700 transition-all disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {isSyncing ? <i className="ri-loader-4-line animate-spin text-xl" /> : <i className="ri-refresh-line" />}
                <span>Sincronizare forțată (doar urgență)</span>
              </button>
              <button
                type="button"
                onClick={handleSyncAllDescriptions}
                disabled={isSyncing || isSyncingDescriptions}
                className="hidden px-4 py-2 border border-teal-500 text-teal-700 rounded-lg font-medium hover:bg-teal-50 transition-all disabled:opacity-60 flex items-center gap-2"
              >
                {isSyncingDescriptions ? <i className="ri-loader-4-line animate-spin" /> : <i className="ri-file-text-line" />}
                <span>
                  {selectedIds.size > 0
                    ? `Sincronizează descrierile (${selectedIds.size} selectate)`
                    : "Sincronizează toate descrierile"}
                </span>
              </button>
              <button
                type="button"
                onClick={handleSyncAllPdfs}
                disabled={isSyncing || isSyncingPdfs}
                className="hidden px-4 py-2 border border-amber-500 text-amber-700 rounded-lg font-medium hover:bg-amber-50 transition-all disabled:opacity-60 flex items-center gap-2"
              >
                {isSyncingPdfs ? <i className="ri-loader-4-line animate-spin" /> : <i className="ri-file-pdf-line" />}
                <span>
                  {selectedIds.size > 0
                    ? `Sincronizează PDF-urile (${selectedIds.size} selectate)`
                    : "Sincronizează toate PDF-urile"}
                </span>
              </button>
              <button
                type="button"
                onClick={handleSyncAllTitles}
                disabled={isSyncing || isSyncingTitles}
                className="px-4 py-2 border border-sky-500 text-sky-700 rounded-lg font-medium hover:bg-sky-50 transition-all disabled:opacity-60 flex items-center gap-2"
              >
                {isSyncingTitles ? <i className="ri-loader-4-line animate-spin" /> : <i className="ri-text" />}
                <span>
                  {selectedIds.size > 0
                    ? `Sincronizează titlurile (${selectedIds.size} selectate)`
                    : "Sincronizează titlurile (fără titlu)"}
                </span>
              </button>
              <button
                type="button"
                onClick={handleRefreshPrices}
                disabled={isSyncing || isRefreshingPrices}
                className="px-4 py-2 border border-amber-500 text-amber-700 rounded-lg font-medium hover:bg-amber-50 transition-all disabled:opacity-60 flex items-center gap-2"
              >
                {isRefreshingPrices ? <i className="ri-loader-4-line animate-spin" /> : <i className="ri-money-euro-circle-line" />}
                <span>
                  {selectedIds.size > 0
                    ? `Reactualizare prețuri (${selectedIds.size} selectate)`
                    : "Reactualizare prețuri (toate)"}
                </span>
              </button>
              <button
                type="button"
                onClick={handleSyncAllSeller}
                disabled={isSyncing || isSyncingSeller}
                className="px-4 py-2 border border-teal-500 text-teal-700 rounded-lg font-medium hover:bg-teal-50 transition-all disabled:opacity-60 flex items-center gap-2"
              >
                {isSyncingSeller ? <i className="ri-loader-4-line animate-spin" /> : <i className="ri-user-line" />}
                <span>
                  {selectedIds.size > 0
                    ? `Actualizare detalii vânzător (${selectedIds.size} selectate)`
                    : "Actualizare detalii vânzător (fără completare)"}
                </span>
              </button>
              <button
                type="button"
                onClick={handleSyncAllDataOra2}
                disabled={isSyncing || isSyncingDataOra2}
                className="px-4 py-2 border border-blue-500 text-blue-700 rounded-lg font-medium hover:bg-blue-50 transition-all disabled:opacity-60 flex items-center gap-2"
              >
                {isSyncingDataOra2 ? <i className="ri-loader-4-line animate-spin" /> : <i className="ri-calendar-event-line" />}
                <span>
                  {selectedIds.size > 0
                    ? `Sincronizează data și ora 2 (${selectedIds.size} selectate)`
                    : `Sincronizează data și ora 2 (${missingDataOra2Count !== null ? `${missingDataOra2Count} rămase` : "…"})`}
                </span>
              </button>
              <button
                type="button"
                onClick={() => setShowConfirmSyncCountiesModal(true)}
                disabled={isSyncing || isSyncingCounties}
                className="px-4 py-2 border border-lime-500 text-lime-700 rounded-lg font-medium hover:bg-lime-50 transition-all disabled:opacity-60 flex items-center gap-2"
              >
                {isSyncingCounties ? <i className="ri-loader-4-line animate-spin" /> : <i className="ri-map-pin-line" />}
                <span>
                  {selectedIds.size > 0
                    ? `Sincronizează județele (${selectedIds.size} selectate)`
                    : "Sincronizează județele (fără județ)"}
                </span>
              </button>
              <button
                type="button"
                onClick={() => setShowConfirmSyncDetailsModal(true)}
                disabled={isSyncing || isSyncingAllDetails}
                className="px-4 py-2 border border-blue-500 text-blue-700 rounded-lg font-medium hover:bg-blue-50 transition-all disabled:opacity-60 flex items-center gap-2"
              >
                {isSyncingAllDetails ? <i className="ri-loader-4-line animate-spin" /> : <i className="ri-refresh-line" />}
                <span>
                  {selectedIds.size > 0
                    ? `Toate câmpurile (${selectedIds.size} selectate)`
                    : "Toate câmpurile (toate anunțurile)"}
                </span>
              </button>
              <button
                type="button"
                onClick={async () => {
                  const { data: { session } } = await supabase.auth.getSession();
                  if (!session?.access_token) return;
                  const res = await fetch("/api/admin/sync-licitatii/listings?idsOnly=1&unpublishedOnly=1", {
                  });
                  const data = await res.json().catch(() => ({}));
                  if (data.success && Array.isArray(data.ids)) {
                    setSelectedIds(new Set(data.ids));
                    setMessage({ type: "success", text: `Selectate ${data.ids.length} anunțuri nepublicate.` });
                  }
                }}
                disabled={listings.length === 0 || (stats?.unpublished ?? 0) === 0}
                className="px-4 py-2 border border-slate-400 text-slate-700 rounded-lg font-medium hover:bg-slate-50 transition-all disabled:opacity-60 flex items-center gap-2"
              >
                <i className="ri-checkbox-multiple-line" />
                <span>
                  Selectează toate nepublicate{stats?.unpublished != null ? ` (${stats?.unpublished})` : ""}
                </span>
              </button>
              <button
                type="button"
                onClick={async () => {
                  let toPublish: string[];
                  if (selectedIds.size > 0) {
                    toPublish = Array.from(selectedIds);
                  } else {
                    const { data: { session } } = await supabase.auth.getSession();
                    if (!session?.access_token) {
                      setMessage({ type: "error", text: "Sesiune invalidă." });
                      return;
                    }
                    const res = await fetch("/api/admin/sync-licitatii/listings?idsOnly=1&unpublishedOnly=1", {
                    });
                    const data = await res.json().catch(() => ({}));
                    if (!data.success || !Array.isArray(data.ids)) {
                      setMessage({ type: "error", text: "Nu s-au putut încărca ID-urile anunțurilor nepublicate." });
                      return;
                    }
                    toPublish = data.ids;
                  }
                  if (toPublish.length === 0) {
                    setMessage({ type: "error", text: "Nicio anunț de publicat (selectează anunțuri fără „Pe site” sau fără dezactivare)." });
                    return;
                  }
                  handlePublishToSite(toPublish);
                }}
                disabled={listings.length === 0 || publishingIds.size > 0}
                className="px-4 py-2 border border-blue-500 text-blue-700 rounded-lg font-medium hover:bg-blue-50 transition-all disabled:opacity-60 flex items-center gap-2"
              >
                {publishingIds.size > 0 ? <i className="ri-loader-4-line animate-spin" /> : <i className="ri-global-line" />}
                <span>
                  {selectedIds.size > 0
                    ? `Publică pe site (${selectedIds.size} selectate)`
                    : stats?.unpublished != null
                      ? `Publică pe site (${stats?.unpublished} nepublicate)`
                      : "Publică pe site (toate nepublicate)"}
                </span>
              </button>
            </div>
            )}
            <p className="text-sm text-gray-500 mt-1">
              Selectează anunțurile din tabel (checkbox) pentru a actualiza doar pe cele alese, sau lasă neselectat pentru toate (max 3000 anunțuri). „Toate câmpurile” completează descriere, PDF-uri, Auto, Imobiliare și restul pentru fiecare anunț; logul live arată ce câmpuri s-au actualizat la fiecare anunț. <strong>Reactualizare prețuri</strong> la fel ca la Sincronizează titlurile: preia prețurile de pe licitatii-insolventa.ro pentru anunțurile selectate sau (dacă nu selectezi) pentru toate (max 3000); nu depinde de anunțurile publicate pe site. <strong>Actualizare detalii vânzător</strong> preia numele, emailul, telefonul și adresa vânzătorului din anunțul sursă; fără selecție actualizează doar anunțurile care nu au aceste câmpuri complete (ca la Sincronizează titlurile / județele).
            </p>

            {lastDescSyncResult && lastDescSyncResult.results.length > 0 && (
              <div className="rounded-lg border border-gray-200 bg-gray-50 overflow-hidden mt-4">
                <div className="px-4 py-3 border-b border-gray-200 flex flex-wrap items-center gap-4">
                  <span className="font-semibold text-gray-800">Rezultat sincronizare descrieri</span>
                  <span className="text-sm text-emerald-600">Actualizate: <strong>{lastDescSyncResult.updated}</strong></span>
                  <span className="text-sm text-red-600">Eșecuri: <strong>{lastDescSyncResult.failed}</strong></span>
                  <span className="text-sm text-gray-600">Total: <strong>{lastDescSyncResult.total}</strong></span>
                </div>
                <div className="max-h-80 overflow-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-100 sticky top-0">
                      <tr>
                        <th className="text-left py-2 px-3 font-medium text-gray-700 w-14">#</th>
                        <th className="text-left py-2 px-3 font-medium text-gray-700">ID anunț</th>
                        <th className="text-left py-2 px-3 font-medium text-gray-700 w-24">Status</th>
                        <th className="text-left py-2 px-3 font-medium text-gray-700">Detalii</th>
                      </tr>
                    </thead>
                    <tbody>
                      {lastDescSyncResult.results.map((r) => (
                        <tr key={r.id} className={`border-t border-gray-100 ${r.success ? "bg-white" : "bg-red-50"}`}>
                          <td className="py-1.5 px-3 font-mono text-gray-600">{r.index}</td>
                          <td className="py-1.5 px-3 font-mono text-gray-800">#{r.source_external_id}</td>
                          <td className="py-1.5 px-3">
                            {r.success ? (
                              <span className="text-emerald-600 font-medium">OK</span>
                            ) : (
                              <span className="text-red-600 font-medium">Eroare</span>
                            )}
                          </td>
                          <td className="py-1.5 px-3 text-gray-700">
                            {r.success
                              ? (r.length != null ? `${r.length} caractere` : "—")
                              : (r.error || "—")}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {lastPdfSyncResult && lastPdfSyncResult.results.length > 0 && (
              <div className="rounded-lg border border-gray-200 bg-gray-50 overflow-hidden mt-4">
                <div className="px-4 py-3 border-b border-gray-200 flex flex-wrap items-center gap-4">
                  <span className="font-semibold text-gray-800">Rezultat sincronizare PDF-uri</span>
                  <span className="text-sm text-emerald-600">Actualizate: <strong>{lastPdfSyncResult.updated}</strong></span>
                  <span className="text-sm text-red-600">Eșecuri: <strong>{lastPdfSyncResult.failed}</strong></span>
                  <span className="text-sm text-gray-600">Total: <strong>{lastPdfSyncResult.total}</strong></span>
                </div>
                <div className="max-h-80 overflow-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-100 sticky top-0">
                      <tr>
                        <th className="text-left py-2 px-3 font-medium text-gray-700 w-14">#</th>
                        <th className="text-left py-2 px-3 font-medium text-gray-700">ID anunț</th>
                        <th className="text-left py-2 px-3 font-medium text-gray-700 w-24">Status</th>
                        <th className="text-left py-2 px-3 font-medium text-gray-700">Detalii</th>
                      </tr>
                    </thead>
                    <tbody>
                      {lastPdfSyncResult.results.map((r) => (
                        <tr key={r.id} className={`border-t border-gray-100 ${r.success ? "bg-white" : "bg-red-50"}`}>
                          <td className="py-1.5 px-3 font-mono text-gray-600">{r.index}</td>
                          <td className="py-1.5 px-3 font-mono text-gray-800">#{r.source_external_id}</td>
                          <td className="py-1.5 px-3">
                            {r.success ? (
                              <span className="text-emerald-600 font-medium">OK</span>
                            ) : (
                              <span className="text-red-600 font-medium">Eroare</span>
                            )}
                          </td>
                          <td className="py-1.5 px-3 text-gray-700">
                            {r.success
                              ? (r.pdfCount != null ? `${r.pdfCount} PDF-uri` : "—")
                              : (r.error || "—")}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {(titlesLiveLog.length > 0 || (lastTitleSyncResult && lastTitleSyncResult.results.length > 0)) && (
              <div className="rounded-lg border border-gray-200 bg-gray-50 overflow-hidden mt-4">
                <div className="px-4 py-3 border-b border-gray-200 flex flex-wrap items-center gap-4">
                  <span className="font-semibold text-gray-800">Sincronizare titluri {titlesLiveLog.length > 0 && !lastTitleSyncResult ? "(log live)" : ""}</span>
                  {lastTitleSyncResult && (
                    <>
                      <span className="text-sm text-emerald-600">Actualizate: <strong>{lastTitleSyncResult.updated}</strong></span>
                      <span className="text-sm text-red-600">Eșecuri: <strong>{lastTitleSyncResult.failed}</strong></span>
                      <span className="text-sm text-gray-600">Total: <strong>{lastTitleSyncResult.total}</strong></span>
                    </>
                  )}
                  {titlesLiveLog.length > 0 && !lastTitleSyncResult && (
                    <span className="text-sm text-gray-600">Procesate: <strong>{titlesLiveLog.length}</strong>…</span>
                  )}
                </div>
                <div className="max-h-80 overflow-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-100 sticky top-0">
                      <tr>
                        <th className="text-left py-2 px-3 font-medium text-gray-700 w-14">#</th>
                        <th className="text-left py-2 px-3 font-medium text-gray-700">ID anunț</th>
                        <th className="text-left py-2 px-3 font-medium text-gray-700 w-24">Status</th>
                        <th className="text-left py-2 px-3 font-medium text-gray-700">Titlu</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(titlesLiveLog.length > 0 ? titlesLiveLog : lastTitleSyncResult!.results).map((r, idx) => (
                        <tr key={"id" in r && r.id ? r.id : `${r.source_external_id}-${r.index ?? idx}`} className={`border-t border-gray-100 ${r.success ? "bg-white" : "bg-red-50"}`}>
                          <td className="py-1.5 px-3 font-mono text-gray-600">{r.index ?? idx + 1}</td>
                          <td className="py-1.5 px-3 font-mono text-gray-800">#{r.source_external_id}</td>
                          <td className="py-1.5 px-3">
                            {r.success ? (
                              <span className="text-emerald-600 font-medium">OK</span>
                            ) : (
                              <span className="text-red-600 font-medium">Eroare</span>
                            )}
                          </td>
                          <td className="py-1.5 px-3 text-gray-700 max-w-md truncate" title={r.title}>
                            {r.success ? (r.title || "—") : (r.error || "—")}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {(pricesLiveLog.length > 0 || (lastPriceRefreshResult && lastPriceRefreshResult.results.length > 0)) && (
              <div className="rounded-lg border border-gray-200 bg-amber-50/50 overflow-hidden mt-4">
                <div className="px-4 py-3 border-b border-gray-200 flex flex-wrap items-center gap-4">
                  <span className="font-semibold text-gray-800">Reactualizare prețuri {pricesLiveLog.length > 0 && !lastPriceRefreshResult ? "(log live)" : ""}</span>
                  {lastPriceRefreshResult && (
                    <>
                      <span className="text-sm text-emerald-600">Actualizate: <strong>{lastPriceRefreshResult.updated}</strong></span>
                      <span className="text-sm text-red-600">Eșecuri: <strong>{lastPriceRefreshResult.failed}</strong></span>
                      <span className="text-sm text-gray-600">Total: <strong>{lastPriceRefreshResult.total}</strong></span>
                    </>
                  )}
                  {pricesLiveLog.length > 0 && !lastPriceRefreshResult && (
                    <span className="text-sm text-gray-600">Procesate: <strong>{pricesLiveLog.length}</strong>…</span>
                  )}
                </div>
                <div className="max-h-80 overflow-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-100 sticky top-0">
                      <tr>
                        <th className="text-left py-2 px-3 font-medium text-gray-700 w-14">#</th>
                        <th className="text-left py-2 px-3 font-medium text-gray-700">ID anunț</th>
                        <th className="text-left py-2 px-3 font-medium text-gray-700 w-24">Status</th>
                        <th className="text-left py-2 px-3 font-medium text-gray-700">Preț (afișat)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(pricesLiveLog.length > 0 ? pricesLiveLog : lastPriceRefreshResult!.results).map((r, idx) => (
                        <tr key={(r as any).product_id ? (r as any).product_id : `${(r as any).source_external_id}-${(r as any).index ?? idx}`} className={`border-t border-gray-100 ${r.success ? "bg-white" : "bg-red-50"}`}>
                          <td className="py-1.5 px-3 font-mono text-gray-600">{r.index ?? idx + 1}</td>
                          <td className="py-1.5 px-3 font-mono text-gray-800">#{r.source_external_id}</td>
                          <td className="py-1.5 px-3">
                            {r.success ? (
                              <span className="text-emerald-600 font-medium">OK</span>
                            ) : (
                              <span className="text-red-600 font-medium">Eroare</span>
                            )}
                          </td>
                          <td className="py-1.5 px-3 text-gray-700 font-medium" title={r.price_text_display}>
                            {r.success ? (r.price_text_display || "—") : (r.error || "—")}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {(sellerLiveLog.length > 0 || (lastSellerSyncResult && lastSellerSyncResult.results.length > 0)) && (
              <div className="rounded-lg border border-gray-200 bg-teal-50/50 overflow-hidden mt-4">
                <div className="px-4 py-3 border-b border-gray-200 flex flex-wrap items-center gap-4">
                  <span className="font-semibold text-gray-800">Actualizare detalii vânzător {sellerLiveLog.length > 0 && !lastSellerSyncResult ? "(log live)" : ""}</span>
                  {lastSellerSyncResult && (
                    <>
                      <span className="text-sm text-emerald-600">Actualizate: <strong>{lastSellerSyncResult.updated}</strong></span>
                      <span className="text-sm text-red-600">Eșecuri: <strong>{lastSellerSyncResult.failed}</strong></span>
                      <span className="text-sm text-gray-600">Total: <strong>{lastSellerSyncResult.total}</strong></span>
                    </>
                  )}
                  {sellerLiveLog.length > 0 && !lastSellerSyncResult && (
                    <span className="text-sm text-gray-600">Procesate: <strong>{sellerLiveLog.length}</strong>…</span>
                  )}
                </div>
                <div className="max-h-80 overflow-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-100 sticky top-0">
                      <tr>
                        <th className="text-left py-2 px-3 font-medium text-gray-700 w-14">#</th>
                        <th className="text-left py-2 px-3 font-medium text-gray-700">ID anunț</th>
                        <th className="text-left py-2 px-3 font-medium text-gray-700 w-24">Status</th>
                        <th className="text-left py-2 px-3 font-medium text-gray-700">Detalii</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(sellerLiveLog.length > 0 ? sellerLiveLog : lastSellerSyncResult!.results).map((r, idx) => (
                        <tr key={"id" in r && r.id ? r.id : `${r.source_external_id}-${r.index ?? idx}`} className={`border-t border-gray-100 ${r.success ? "bg-white" : "bg-red-50"}`}>
                          <td className="py-1.5 px-3 font-mono text-gray-600">{r.index ?? idx + 1}</td>
                          <td className="py-1.5 px-3 font-mono text-gray-800">#{r.source_external_id}</td>
                          <td className="py-1.5 px-3">
                            {r.success ? (
                              <span className="text-emerald-600 font-medium">OK</span>
                            ) : (
                              <span className="text-red-600 font-medium">Eroare</span>
                            )}
                          </td>
                          <td className="py-1.5 px-3 text-gray-700 max-w-md truncate" title={r.error}>
                            {r.success ? "—" : (r.error || "—")}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {(dataOra2LiveLog.length > 0 || (lastDataOra2SyncResult && lastDataOra2SyncResult.results.length > 0)) && (
              <div className="rounded-lg border border-gray-200 bg-blue-50/50 overflow-hidden mt-4">
                <div className="px-4 py-3 border-b border-gray-200 flex flex-wrap items-center gap-4">
                  <span className="font-semibold text-gray-800">Sincronizare data și ora 2 {dataOra2LiveLog.length > 0 && !lastDataOra2SyncResult ? "(log live)" : ""}</span>
                  {lastDataOra2SyncResult && (
                    <>
                      <span className="text-sm text-emerald-600">Actualizate: <strong>{lastDataOra2SyncResult.updated}</strong></span>
                      <span className="text-sm text-red-600">Eșecuri: <strong>{lastDataOra2SyncResult.failed}</strong></span>
                      <span className="text-sm text-gray-600">Total: <strong>{lastDataOra2SyncResult.total}</strong></span>
                    </>
                  )}
                  {dataOra2LiveLog.length > 0 && !lastDataOra2SyncResult && (
                    <span className="text-sm text-gray-600">Procesate: <strong>{dataOra2LiveLog.length}</strong>…</span>
                  )}
                </div>
                <div className="max-h-80 overflow-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-100 sticky top-0">
                      <tr>
                        <th className="text-left py-2 px-3 font-medium text-gray-700 w-14">#</th>
                        <th className="text-left py-2 px-3 font-medium text-gray-700">ID anunț</th>
                        <th className="text-left py-2 px-3 font-medium text-gray-700 w-24">Status</th>
                        <th className="text-left py-2 px-3 font-medium text-gray-700">Detalii</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(dataOra2LiveLog.length > 0 ? dataOra2LiveLog : lastDataOra2SyncResult!.results).map((r, idx) => (
                        <tr key={"id" in r && r.id ? r.id : `${r.source_external_id}-${r.index ?? idx}`} className={`border-t border-gray-100 ${r.success ? "bg-white" : "bg-red-50"}`}>
                          <td className="py-1.5 px-3 font-mono text-gray-600">{r.index ?? idx + 1}</td>
                          <td className="py-1.5 px-3 font-mono text-gray-800">#{r.source_external_id}</td>
                          <td className="py-1.5 px-3">
                            {r.success ? (
                              <span className="text-emerald-600 font-medium">OK</span>
                            ) : (
                              <span className="text-red-600 font-medium">Eroare</span>
                            )}
                          </td>
                          <td className="py-1.5 px-3 text-gray-700 max-w-md truncate" title={r.error}>
                            {r.success ? "—" : (r.error || "—")}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {(publishingIds.size > 0 || publishLiveLog.length > 0 || (lastPublishResult && lastPublishResult.results.length > 0)) && (
              <div className="rounded-lg border border-gray-200 bg-blue-50/50 overflow-hidden mt-4">
                <div className="px-4 py-3 border-b border-gray-200 flex flex-wrap items-center gap-4">
                  <span className="font-semibold text-gray-800">Publicare pe site {publishLiveLog.length > 0 && !lastPublishResult ? "(log live)" : ""}</span>
                  {publishingProgress && (
                    <>
                      <span className="inline-flex items-center gap-2 text-sm text-blue-700">
                        <span className="inline-block h-4 w-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" aria-hidden />
                        <span>Se publică lotul <strong>{publishingProgress.batchIndex || 1}</strong> din <strong>{publishingProgress.totalBatches}</strong></span>
                        <span className="text-gray-600">(<strong>{publishLiveLog.length}</strong> / {publishingProgress.total} procesate)</span>
                      </span>
                    </>
                  )}
                  {lastPublishResult && (
                    <>
                      <span className="text-sm text-emerald-600">Publicate: <strong>{lastPublishResult.published}</strong></span>
                      <span className="text-sm text-red-600">Eșecuri: <strong>{lastPublishResult.failed}</strong></span>
                      <span className="text-sm text-gray-600">Total: <strong>{lastPublishResult.total}</strong></span>
                    </>
                  )}
                  {publishLiveLog.length > 0 && !lastPublishResult && !publishingProgress && (
                    <span className="text-sm text-gray-600">Procesate: <strong>{publishLiveLog.length}</strong>…</span>
                  )}
                </div>
                <div className="max-h-80 overflow-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-100 sticky top-0">
                      <tr>
                        <th className="text-left py-2 px-3 font-medium text-gray-700 w-14">#</th>
                        <th className="text-left py-2 px-3 font-medium text-gray-700">ID anunț</th>
                        <th className="text-left py-2 px-3 font-medium text-gray-700 w-24">Status</th>
                        <th className="text-left py-2 px-3 font-medium text-gray-700">Detalii</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(publishLiveLog.length > 0 ? publishLiveLog : (lastPublishResult?.results ?? [])).map((r, idx) => (
                        <tr key={`${r.listingId}-${r.index ?? idx}`} className={`border-t border-gray-100 ${r.success ? "bg-white" : "bg-red-50"}`}>
                          <td className="py-1.5 px-3 font-mono text-gray-600">{r.index ?? idx + 1}</td>
                          <td className="py-1.5 px-3 font-mono text-gray-800">#{r.source_external_id}</td>
                          <td className="py-1.5 px-3">
                            {r.success ? (
                              <span className="text-emerald-600 font-medium">OK</span>
                            ) : (
                              <span className="text-red-600 font-medium">Eroare</span>
                            )}
                          </td>
                          <td className="py-1.5 px-3 text-gray-700 max-w-md truncate" title={r.error}>
                            {r.success ? (r.url ? <a href={r.url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline truncate block">{r.slug || r.url}</a> : "—") : (r.error || "—")}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {(countiesLiveLog.length > 0 || (lastCountySyncResult && lastCountySyncResult.results.length > 0)) && (
              <div className="rounded-lg border border-gray-200 bg-gray-50 overflow-hidden mt-4">
                <div className="px-4 py-3 border-b border-gray-200 flex flex-wrap items-center gap-4">
                  <span className="font-semibold text-gray-800">Sincronizare județe {countiesLiveLog.length > 0 && !lastCountySyncResult ? "(log live)" : ""}</span>
                  {lastCountySyncResult && (
                    <>
                      <span className="text-sm text-emerald-600">Actualizate: <strong>{lastCountySyncResult.updated}</strong></span>
                      <span className="text-sm text-red-600">Eșecuri: <strong>{lastCountySyncResult.failed}</strong></span>
                      <span className="text-sm text-gray-600">Total: <strong>{lastCountySyncResult.total}</strong></span>
                    </>
                  )}
                  {countiesLiveLog.length > 0 && !lastCountySyncResult && (
                    <span className="text-sm text-gray-600">Procesate: <strong>{countiesLiveLog.length}</strong>…</span>
                  )}
                </div>
                <div className="max-h-80 overflow-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-100 sticky top-0">
                      <tr>
                        <th className="text-left py-2 px-3 font-medium text-gray-700 w-14">#</th>
                        <th className="text-left py-2 px-3 font-medium text-gray-700">ID anunț</th>
                        <th className="text-left py-2 px-3 font-medium text-gray-700 w-24">Status</th>
                        <th className="text-left py-2 px-3 font-medium text-gray-700">Județ / Oraș</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(countiesLiveLog.length > 0 ? countiesLiveLog : lastCountySyncResult!.results).map((r, idx) => (
                        <tr key={"id" in r && r.id ? r.id : `${r.source_external_id}-${r.index ?? idx}`} className={`border-t border-gray-100 ${r.success ? "bg-white" : "bg-red-50"}`}>
                          <td className="py-1.5 px-3 font-mono text-gray-600">{r.index ?? idx + 1}</td>
                          <td className="py-1.5 px-3 font-mono text-gray-800">#{r.source_external_id}</td>
                          <td className="py-1.5 px-3">
                            {r.success ? (
                              <span className="text-emerald-600 font-medium">OK</span>
                            ) : (
                              <span className="text-red-600 font-medium">Eroare</span>
                            )}
                          </td>
                          <td className="py-1.5 px-3 text-gray-700">
                            {r.success
                              ? [r.location_county, r.location_city].filter(Boolean).join(" / ") || "—"
                              : (r.error || "—")}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {(detailsLiveLog.length > 0 || (lastDetailsSyncResult && lastDetailsSyncResult.results.length > 0)) && (
              <div className="rounded-lg border border-gray-200 bg-gray-50 overflow-hidden mt-4">
                <div className="px-4 py-3 border-b border-gray-200 flex flex-wrap items-center gap-4">
                  <span className="font-semibold text-gray-800">Rezultat: Toate câmpurile (max 3000 anunțuri)</span>
                  {lastDetailsSyncResult && (
                    <>
                      <span className="text-sm text-emerald-600">Actualizate: <strong>{lastDetailsSyncResult.updated}</strong></span>
                      <span className="text-sm text-red-600">Eșecuri: <strong>{lastDetailsSyncResult.failed}</strong></span>
                      <span className="text-sm text-gray-600">Total: <strong>{lastDetailsSyncResult.total}</strong></span>
                    </>
                  )}
                  {detailsLiveLog.length > 0 && !lastDetailsSyncResult && (
                    <span className="text-sm text-gray-600">Log live: <strong>{detailsLiveLog.length}</strong> anunțuri procesate…</span>
                  )}
                </div>
                <div className="max-h-80 overflow-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-100 sticky top-0">
                      <tr>
                        <th className="text-left py-2 px-3 font-medium text-gray-700 w-14">#</th>
                        <th className="text-left py-2 px-3 font-medium text-gray-700">ID anunț</th>
                        <th className="text-left py-2 px-3 font-medium text-gray-700 w-24">Status</th>
                        <th className="text-left py-2 px-3 font-medium text-gray-700">Câmpuri modificate</th>
                        <th className="text-left py-2 px-3 font-medium text-gray-700">Detalii</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(detailsLiveLog.length > 0 ? detailsLiveLog : lastDetailsSyncResult!.results.map((r) => ({ ...r, modifiedFields: undefined, imagesUpdated: undefined }))).map((r, idx) => (
                        <tr key={"id" in r && r.id ? r.id : `${r.source_external_id}-${r.index ?? idx}`} className={`border-t border-gray-100 ${r.success ? "bg-white" : "bg-red-50"}`}>
                          <td className="py-1.5 px-3 font-mono text-gray-600">{r.index ?? idx + 1}</td>
                          <td className="py-1.5 px-3 font-mono text-gray-800">#{r.source_external_id}</td>
                          <td className="py-1.5 px-3">
                            {r.success ? <span className="text-emerald-600 font-medium">OK</span> : <span className="text-red-600 font-medium">Eroare</span>}
                          </td>
                          <td className="py-1.5 px-3 text-gray-700 max-w-xs">
                            {r.success && "modifiedFields" in r && Array.isArray((r as { modifiedFields?: string[] }).modifiedFields)
                              ? (
                                  <>
                                    {(r as { modifiedFields?: string[]; imagesUpdated?: boolean }).modifiedFields!.join(", ")}
                                    {(r as { imagesUpdated?: boolean }).imagesUpdated && " • Imagini"}
                                  </>
                                )
                              : "—"}
                          </td>
                          <td className="py-1.5 px-3 text-gray-700">{"error" in r && r.error ? r.error : "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {(regenerateLiveLog.length > 0 || lastRegenerateResult) && (
              <div className="rounded-lg border border-amber-200 bg-amber-50/50 overflow-hidden mt-4">
                <div className="px-4 py-3 border-b border-amber-200 flex flex-wrap items-center gap-4">
                  <span className="font-semibold text-gray-800">Regenerează produse {regenerateLiveLog.length > 0 && !lastRegenerateResult ? "(log live)" : ""}</span>
                  {lastRegenerateResult && (
                    <>
                      <span className="text-sm text-emerald-600">Reușite: <strong>{lastRegenerateResult.regenerated}</strong></span>
                      <span className="text-sm text-red-600">Eșecuri: <strong>{lastRegenerateResult.failed}</strong></span>
                      <span className="text-sm text-gray-600">Total: <strong>{lastRegenerateResult.total}</strong></span>
                    </>
                  )}
                  {regenerateLiveLog.length > 0 && !lastRegenerateResult && (
                    <span className="text-sm text-gray-600">Procesate: <strong>{regenerateLiveLog.length}</strong>… (50 în paralel)</span>
                  )}
                </div>
                <div className="max-h-80 overflow-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-amber-100/80 sticky top-0">
                      <tr>
                        <th className="text-left py-2 px-3 font-medium text-gray-700 w-14">#</th>
                        <th className="text-left py-2 px-3 font-medium text-gray-700">ID produs</th>
                        <th className="text-left py-2 px-3 font-medium text-gray-700 w-24">Status</th>
                        <th className="text-left py-2 px-3 font-medium text-gray-700">Titlu / Eroare</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(regenerateLiveLog.length > 0 ? regenerateLiveLog : lastRegenerateResult!.results).map((r, idx) => (
                        <tr key={r.productId + "-" + idx} className={`border-t border-gray-100 ${r.success ? "bg-white" : "bg-red-50"}`}>
                          <td className="py-1.5 px-3 font-mono text-gray-600">{idx + 1}</td>
                          <td className="py-1.5 px-3 font-mono text-gray-800">{r.productId.slice(0, 8)}…</td>
                          <td className="py-1.5 px-3">
                            {r.success ? (
                              <span className="text-emerald-600 font-medium">OK</span>
                            ) : (
                              <span className="text-red-600 font-medium">Eroare</span>
                            )}
                          </td>
                          <td className="py-1.5 px-3 text-gray-700 max-w-md truncate" title={r.success ? r.title : r.error}>
                            {r.success ? (r.title || "—") : (r.error || "—")}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Statistici – carduri clickabile ca filtre */}
        {stats && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
            <button
              type="button"
              onClick={() => {
                setStatusFilter("all");
                setCountyFilter("");
                setCategoryFilter("");
                setMainCategoryFilter("");
                setSubcategoryFilter("");
                setTimeFilter("all");
                setWithPdfFilter(false);
                setWithDescriptionFilter(false);
                setWithoutDescriptionFilter(false);
                setWithoutAuctionDateFilter(false);
                setWithoutTitleFilter(false);
                setWithoutCountyFilter(false);
                setPage(1);
              }}
              className={`rounded-lg border shadow-sm p-4 text-left transition-all hover:shadow-md focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-emerald-500 ${
                statusFilter === "all" && !countyFilter && !categoryFilter && !mainCategoryFilter && !subcategoryFilter && timeFilter === "all" && !withPdfFilter && !withDescriptionFilter && !withoutDescriptionFilter && !withoutAuctionDateFilter && !withoutTitleFilter && !withoutCountyFilter && !withoutSellerDetailsFilter
                  ? "border-emerald-400 bg-emerald-50 ring-1 ring-emerald-200"
                  : "bg-white border-gray-200 hover:border-gray-300"
              }`}
            >
              <p className="text-xs text-gray-500 uppercase tracking-wide">Total</p>
              <p className="text-2xl font-bold text-gray-900">{stats.total}</p>
            </button>
            <button
              type="button"
              onClick={() => {
                setStatusFilter("active");
                setWithPdfFilter(false);
                setWithDescriptionFilter(false);
                setWithoutDescriptionFilter(false);
                setWithoutAuctionDateFilter(false);
                setWithoutTitleFilter(false);
                setWithoutCountyFilter(false);
                setPage(1);
              }}
              className={`rounded-lg border shadow-sm p-4 text-left transition-all hover:shadow-md focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-emerald-500 ${
                statusFilter === "active" && !withPdfFilter && !withDescriptionFilter && !withoutDescriptionFilter && !withoutAuctionDateFilter && !withoutTitleFilter && !withoutCountyFilter && !withoutSellerDetailsFilter && !categoryFilter && timeFilter === "all"
                  ? "border-emerald-400 bg-emerald-50 ring-1 ring-emerald-200"
                  : "bg-white border-gray-200 hover:border-gray-300"
              }`}
            >
              <p className="text-xs text-gray-500 uppercase tracking-wide">Active</p>
              <p className="text-2xl font-bold text-emerald-600">{stats.active}</p>
              {(stats.activeToday ?? 0) > 0 && (
                <p className="text-xs text-emerald-600 mt-0.5">AZI: {stats?.activeToday} noi</p>
              )}
            </button>
            <button
              type="button"
              onClick={() => {
                setStatusFilter("deleted");
                setWithPdfFilter(false);
                setWithDescriptionFilter(false);
                setPage(1);
              }}
              className={`rounded-lg border shadow-sm p-4 text-left transition-all hover:shadow-md focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-gray-400 ${
                statusFilter === "deleted"
                  ? "border-gray-400 bg-gray-100 ring-1 ring-gray-300"
                  : "bg-white border-gray-200 hover:border-gray-300"
              }`}
            >
              <p className="text-xs text-gray-500 uppercase tracking-wide">Dezactivate</p>
              <p className="text-2xl font-bold text-gray-500">{stats.deleted}</p>
              {(stats.deletedToday ?? 0) > 0 && (
                <p className="text-xs text-gray-600 mt-0.5">AZI: {stats?.deletedToday}</p>
              )}
            </button>
            <button
              type="button"
              onClick={() => {
                setStatusFilter("reactivated");
                setWithPdfFilter(false);
                setWithDescriptionFilter(false);
                setWithoutDescriptionFilter(false);
                setWithoutAuctionDateFilter(false);
                setWithoutTitleFilter(false);
                setWithoutCountyFilter(false);
                setPage(1);
              }}
              className={`rounded-lg border shadow-sm p-4 text-left transition-all hover:shadow-md focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-orange-500 ${
                statusFilter === "reactivated"
                  ? "border-orange-400 bg-orange-50 ring-1 ring-orange-200"
                  : "bg-white border-gray-200 hover:border-orange-200"
              }`}
            >
              <p className="text-xs text-gray-500 uppercase tracking-wide">Reactivate</p>
              <p className="text-2xl font-bold text-orange-700">{stats.reactivated ?? 0}</p>
              <p className="text-xs text-orange-600 mt-0.5">AZI: {stats.reactivatedToday ?? 0}</p>
            </button>
            <button
              type="button"
              onClick={() => {
                setWithPdfFilter((v) => !v);
                setPage(1);
              }}
              className={`rounded-lg border shadow-sm p-4 text-left transition-all hover:shadow-md focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-blue-400 ${
                withPdfFilter ? "border-blue-400 bg-blue-50 ring-1 ring-blue-200" : "bg-white border-gray-200 hover:border-gray-300"
              }`}
            >
              <p className="text-xs text-gray-500 uppercase tracking-wide">Cu PDF</p>
              <p className="text-2xl font-bold text-blue-600">{stats?.withPdf}</p>
            </button>
            <button
              type="button"
              onClick={() => {
                setWithDescriptionFilter((v) => !v);
                setWithoutDescriptionFilter(false);
                setPage(1);
              }}
              className={`rounded-lg border shadow-sm p-4 text-left transition-all hover:shadow-md focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-teal-400 ${
                withDescriptionFilter ? "border-teal-400 bg-teal-50 ring-1 ring-teal-200" : "bg-white border-gray-200 hover:border-gray-300"
              }`}
            >
              <p className="text-xs text-gray-500 uppercase tracking-wide">Cu descriere</p>
              <p className="text-2xl font-bold text-teal-600">{stats?.withDescription}</p>
            </button>
            <button
              type="button"
              onClick={() => {
                setWithoutDescriptionFilter((v) => !v);
                setWithDescriptionFilter(false);
                setPage(1);
              }}
              className={`rounded-lg border shadow-sm p-4 text-left transition-all hover:shadow-md focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-amber-400 ${
                withoutDescriptionFilter ? "border-amber-400 bg-amber-50 ring-1 ring-amber-200" : "bg-white border-gray-200 hover:border-gray-300"
              }`}
            >
              <p className="text-xs text-gray-500 uppercase tracking-wide">Fără descriere</p>
              <p className="text-2xl font-bold text-amber-600">{stats.withoutDescription ?? 0}</p>
            </button>
            <button
              type="button"
              onClick={() => {
                setWithoutAuctionDateFilter((v) => !v);
                setWithDescriptionFilter(false);
                setWithoutDescriptionFilter(false);
                setPage(1);
              }}
              className={`rounded-lg border shadow-sm p-4 text-left transition-all hover:shadow-md focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-blue-400 ${
                withoutAuctionDateFilter ? "border-blue-400 bg-blue-50 ring-1 ring-blue-200" : "bg-white border-gray-200 hover:border-gray-300"
              }`}
              title="Fără data licitației – de obicei au și alte câmpuri necompletate"
            >
              <p className="text-xs text-gray-500 uppercase tracking-wide">Fără data licitației</p>
              <p className="text-2xl font-bold text-blue-600">{stats.withoutAuctionDate ?? 0}</p>
            </button>
            <button
              type="button"
              onClick={() => {
                setWithoutTitleFilter((v) => !v);
                setWithDescriptionFilter(false);
                setWithoutDescriptionFilter(false);
                setPage(1);
              }}
              className={`rounded-lg border shadow-sm p-4 text-left transition-all hover:shadow-md focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-sky-400 ${
                withoutTitleFilter ? "border-sky-400 bg-sky-50 ring-1 ring-sky-200" : "bg-white border-gray-200 hover:border-gray-300"
              }`}
              title="Fără titlu – selectează și sincronizează titlurile"
            >
              <p className="text-xs text-gray-500 uppercase tracking-wide">Fără titlu</p>
              <p className="text-2xl font-bold text-sky-600">{stats.withoutTitle ?? 0}</p>
            </button>
            <button
              type="button"
              onClick={() => {
                setWithoutCountyFilter((v) => !v);
                setWithDescriptionFilter(false);
                setWithoutDescriptionFilter(false);
                setPage(1);
              }}
              className={`rounded-lg border shadow-sm p-4 text-left transition-all hover:shadow-md focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-lime-400 ${
                withoutCountyFilter ? "border-lime-400 bg-lime-50 ring-1 ring-lime-200" : "bg-white border-gray-200 hover:border-gray-300"
              }`}
              title="Fără județ – selectează și sincronizează județele"
            >
              <p className="text-xs text-gray-500 uppercase tracking-wide">Fără județ</p>
              <p className="text-2xl font-bold text-lime-600">{stats.withoutCounty ?? 0}</p>
            </button>
            <button
              type="button"
              onClick={() => {
                setWithoutSellerDetailsFilter((v) => !v);
                setWithDescriptionFilter(false);
                setWithoutDescriptionFilter(false);
                setPage(1);
              }}
              className={`rounded-lg border shadow-sm p-4 text-left transition-all hover:shadow-md focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-teal-400 ${
                withoutSellerDetailsFilter ? "border-teal-400 bg-teal-50 ring-1 ring-teal-200" : "bg-white border-gray-200 hover:border-gray-300"
              }`}
              title="Fără detalii vânzător – filtrează și selectează pentru actualizare"
            >
              <p className="text-xs text-gray-500 uppercase tracking-wide">Fără detalii vânzător</p>
              <p className="text-2xl font-bold text-teal-600">{stats.withoutSellerDetails ?? 0}</p>
            </button>
            <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-4" title="Număr de județe distincte">
              <p className="text-xs text-gray-500 uppercase tracking-wide">Județe</p>
              <p className="text-2xl font-bold text-gray-900">{stats.byCounty.length}</p>
            </div>
            <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-4" title="Număr de categorii distincte – filtrează în dropdown">
              <p className="text-xs text-gray-500 uppercase tracking-wide">Categorii</p>
              <p className="text-2xl font-bold text-gray-900">{(stats.byCategory ?? []).length}</p>
            </div>
          </div>
        )}

        {/* Filtre + Tabel produse */}
        <div className="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden">
          <div className="p-4 border-b border-gray-200 flex flex-wrap items-center gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-gray-500">Caută:</span>
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => { setSearchQuery(e.target.value); setPage(1); }}
                placeholder="titlu, vânzător, ID…"
                className="rounded-lg border border-gray-300 bg-white text-gray-900 px-3 py-1.5 text-sm w-48 min-w-[120px] placeholder:text-gray-400"
                aria-label="Caută în anunțuri"
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-gray-500">Status:</span>
              <select
                value={statusFilter}
                onChange={(e) => { setStatusFilter(e.target.value as "active" | "deleted" | "all" | "reactivated"); setPage(1); setSelectedIds(new Set()); }}
                className="rounded-lg border border-gray-300 bg-white text-gray-900 px-3 py-1.5 text-sm"
              >
                <option value="active">Active</option>
                <option value="deleted">Dezactivate</option>
                <option value="reactivated">Reactivate</option>
                <option value="all">Toate</option>
              </select>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-gray-500">Publicare:</span>
              <select
                value={publishedFilter}
                onChange={(e) => { setPublishedFilter(e.target.value as "all" | "published" | "unpublished"); setPage(1); }}
                className="rounded-lg border border-gray-300 bg-white text-gray-900 px-3 py-1.5 text-sm"
              >
                <option value="all">Toate</option>
                <option value="published">Publicate</option>
                <option value="unpublished">Nepublicate</option>
              </select>
            </div>
            {stats && (
              <>
                <span className="text-sm text-gray-500">Județ:</span>
                <select
                  value={countyFilter}
                  onChange={(e) => { setCountyFilter(e.target.value); setPage(1); }}
                  className="rounded-lg border border-gray-300 bg-white text-gray-900 px-3 py-1.5 text-sm max-w-[200px]"
                >
                  <option value="">Toate</option>
                  {ROMANIAN_COUNTIES.map((county) => {
                    const count = (stats?.byCounty ?? []).find(
                      (c) => (c.county || "").trim().toLowerCase() === county.trim().toLowerCase()
                    )?.count ?? 0;
                    return (
                      <option key={county} value={county}>{county} ({count})</option>
                    );
                  })}
                </select>
              </>
            )}
            {/* Filtre 3 niveluri: CATEGORIE (Executări și Insolvență) → CAT. PRINCIPALĂ → CATEGORIE (Subcategorie) */}
            {stats && (
              <>
                <span className="text-sm text-gray-500">CATEGORIE</span>
                <select
                  value={FILTER_TOP_CATEGORY_EXECUTARI}
                  disabled
                  className="rounded-lg border border-gray-300 bg-gray-50 text-gray-900 px-3 py-1.5 text-sm max-w-[220px] cursor-default"
                  title="Categoria pentru această pagină"
                >
                  <option value={FILTER_TOP_CATEGORY_EXECUTARI}>{FILTER_TOP_CATEGORY_EXECUTARI}</option>
                </select>
              </>
            )}
            {stats && (
              <>
                <span className="text-sm text-gray-500">CAT. PRINCIPALĂ</span>
                <select
                  value={mainCategoryFilter}
                  onChange={(e) => { setMainCategoryFilter(e.target.value); setCategoryFilter(""); setSubcategoryFilter(""); setPage(1); }}
                  className="rounded-lg border border-gray-300 bg-white text-gray-900 px-3 py-1.5 text-sm max-w-[200px]"
                >
                  <option value="">Toate</option>
                  {EXECUTARI_CAT_PRINCIPALA.map((mc) => {
                    const count = (stats?.byMainCategory ?? []).find((x) => x.mainCategory === mc)?.count ?? 0;
                    return (
                      <option key={mc} value={mc}>{mc} ({count})</option>
                    );
                  })}
                </select>
              </>
            )}
            {mainCategoryFilter && (() => {
              const subcats = getExecutariSubcategoriiForFilter(mainCategoryFilter);
              if (subcats.length === 0) return null;
              return (
                <>
                  <span className="text-sm text-gray-500">Subcategorie:</span>
                  <select
                    value={categoryFilter}
                    onChange={(e) => { setCategoryFilter(e.target.value); setPage(1); }}
                    className="rounded-lg border border-gray-300 bg-white text-gray-900 px-3 py-1.5 text-sm max-w-[200px]"
                  >
                    {subcats.map((s) => (
                      <option key={s.value || "toate"} value={s.value}>{s.label}</option>
                    ))}
                  </select>
                </>
              );
            })()}
            <span className="text-sm text-gray-500">Perioadă:</span>
            <select
              value={timeFilter}
              onChange={(e) => { setTimeFilter(e.target.value); setPage(1); }}
              className="rounded-lg border border-gray-300 bg-white text-gray-900 px-3 py-1.5 text-sm"
            >
              <option value="all">Toate</option>
              <option value="7d">Ultimele 7 zile</option>
              <option value="30d">Ultimele 30 zile</option>
              <option value="90d">Ultimele 90 zile</option>
            </select>
            <span className="text-sm text-gray-500">Sortare:</span>
            <select
              value={sortOrder}
              onChange={(e) => { setSortOrder(e.target.value); setPage(1); }}
              className="rounded-lg border border-gray-300 bg-white text-gray-900 px-3 py-1.5 text-sm max-w-[200px]"
            >
              <option value="newest">Cele mai noi</option>
              <option value="oldest">Cele mai vechi</option>
              <option value="price_asc">Preț crescător</option>
              <option value="price_desc">Preț descrescător</option>
            </select>
            <label className="flex items-center gap-2 cursor-pointer select-none" title="Doar anunțuri deja publicate pe /ro (cu link „Vizualizează”)">
              <input
                type="checkbox"
                checked={onSiteFilter}
                onChange={(e) => { setOnSiteFilter(e.target.checked); setPage(1); }}
                className="rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
              />
              <span className={`text-sm ${onSiteFilter ? "text-emerald-700 font-medium" : "text-gray-600"}`}>
                Pe site (/ro)
              </span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={showOnlyEndedOrFoldedFilter}
                onChange={(e) => { setShowOnlyEndedOrFoldedFilter(e.target.checked); setPage(1); }}
                className="rounded border-gray-300 text-red-600 focus:ring-red-500"
              />
              <span className={`text-sm ${showOnlyEndedOrFoldedFilter ? "text-red-700 font-medium" : "text-gray-600"}`}>
                Doar publicate fără dată/oră sau cu data expirată
                {listings.length > 0 && (
                  <span className="ml-1 text-gray-500 font-normal">
                    ({listings.filter(isPublishedMissingOrExpiredDate).length} pe pagină)
                  </span>
                )}
              </span>
            </label>
            {statusFilter === "deleted" && (
              <button
                type="button"
                onClick={() => setShowConfirmDeleteDeactivatedModal(true)}
                disabled={isDeletingDeactivated}
                className="px-3 py-1.5 rounded-lg border border-red-300 bg-red-50 text-red-700 text-sm font-medium hover:bg-red-100 disabled:opacity-50"
              >
                {isDeletingDeactivated ? "Se șterg…" : "Șterge definitiv anunțurile dezactivate"}
              </button>
            )}
            {selectedIds.size > 0 && (
              <span className="text-sm text-gray-600">
                {selectedIds.size} selectate
              </span>
            )}
            <button
              type="button"
              onClick={selectAllMatchingFilters}
              disabled={loadingList || totalCount === 0}
              className="px-3 py-1.5 rounded-lg border border-gray-300 bg-white text-gray-700 text-sm font-medium hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              title="Selectează toate anunțurile care respectă filtrele curente (nu doar cele de pe această pagină)"
            >
              Selectează toate{totalCount > 0 ? ` (${totalCount})` : ""}
            </button>
            {statusFilter === "active" && (stats?.withoutDescription ?? 0) > 0 && (
              <button
                type="button"
                onClick={selectAllWithoutDescription}
                className="px-3 py-1.5 rounded-lg border border-amber-200 bg-amber-50 text-amber-700 text-sm font-medium hover:bg-amber-100"
              >
                Selectează toate fără descriere
              </button>
            )}
            {statusFilter === "active" && (stats?.withoutTitle ?? 0) > 0 && (
              <button
                type="button"
                onClick={selectAllWithoutTitle}
                className="px-3 py-1.5 rounded-lg border border-sky-200 bg-sky-50 text-sky-700 text-sm font-medium hover:bg-sky-100"
              >
                Selectează toate fără titlu
              </button>
            )}
            {statusFilter === "active" && (stats?.withoutSellerDetails ?? 0) > 0 && (
              <button
                type="button"
                onClick={selectAllWithoutSellerDetails}
                className="px-3 py-1.5 rounded-lg border border-teal-200 bg-teal-50 text-teal-700 text-sm font-medium hover:bg-teal-100"
              >
                Selectează toate fără detalii vânzător
              </button>
            )}
            {selectedIds.size > 0 && (
              <>
                {statusFilter !== "deleted" ? (
                  <button
                    type="button"
                    onClick={() => bulkSetDeleted(true)}
                    disabled={bulkActionLoading}
                    className="px-3 py-1.5 rounded-lg border border-red-200 bg-red-50 text-red-700 text-sm font-medium hover:bg-red-100 disabled:opacity-50"
                  >
                    {bulkActionLoading ? "Se procesează…" : "Marchează ca șterse"}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => bulkSetDeleted(false)}
                    disabled={bulkActionLoading}
                    className="px-3 py-1.5 rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-700 text-sm font-medium hover:bg-emerald-100 disabled:opacity-50"
                  >
                    {bulkActionLoading ? "Se procesează…" : "Reactivează"}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setSelectedIds(new Set())}
                  className="px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 text-sm hover:bg-gray-50"
                >
                  Deselectează
                </button>
                <button
                  type="button"
                  onClick={handleBulkRegenerate}
                  disabled={isRegeneratingBulk}
                  className="px-3 py-1.5 rounded-lg border border-amber-300 bg-amber-50 text-amber-800 text-sm font-medium hover:bg-amber-100 disabled:opacity-50 disabled:cursor-not-allowed"
                  title="Regenerează titlul și descrierea din anunțul sursă pentru toate produsele selectate (doar cele publicate pe site)"
                >
                  {isRegeneratingBulk ? "Se regenerează…" : "Regenerează selectate"}
                </button>
              </>
            )}
            <span className="text-sm text-gray-500 ml-auto">
              {totalCount} în total
            </span>
          </div>

          <div className="overflow-x-auto">
            {loadingList ? (
              <div className="p-8 text-center text-gray-500">
                <i className="ri-loader-4-line animate-spin text-2xl block mb-2" />
                Se încarcă...
              </div>
            ) : listings.length === 0 ? (
              <div className="p-8 text-center text-gray-500">
                Niciun produs sincronizat. Rulează sincronizarea mai întâi.
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50">
                    <th className="w-10 py-2 px-2 text-center">
                      <input
                        type="checkbox"
                        checked={displayedListings.length > 0 && displayedListings.every((r) => selectedIds.has(r.id))}
                        onChange={selectAllOnPage}
                        className="rounded border-gray-300"
                      />
                    </th>
                    <th className="text-left py-2 px-3 font-medium text-gray-700">ID</th>
                    <th className="text-left py-2 px-3 font-medium text-gray-700">Cod anunț</th>
                    <th className="text-left py-2 px-3 font-medium text-gray-700">Titlu</th>
                    <th className="text-left py-2 px-3 font-medium text-gray-700">Cat. principală</th>
                    <th className="text-left py-2 px-3 font-medium text-gray-700">Categorie</th>
                    <th className="text-left py-2 px-3 font-medium text-gray-700">Preț</th>
                    <th className="text-left py-2 px-3 font-medium text-gray-700">Județ / Oraș</th>
                    <th className="text-left py-2 px-3 font-medium text-gray-700">PDF</th>
                    <th className="text-left py-2 px-3 font-medium text-gray-700">Imagini</th>
                    <th className="text-left py-2 px-3 font-medium text-gray-700">Adăugat</th>
                    <th className="text-left py-2 px-3 font-medium text-gray-700">Ultima vedere</th>
                    <th className="text-left py-2 px-3 font-medium text-gray-700">Status</th>
                    <th className="text-left py-2 px-3 font-medium text-gray-700">Pe site</th>
                    <th className="text-left py-2 px-3 font-medium text-gray-700">Link</th>
                    <th className="text-left py-2 px-3 font-medium text-gray-700 w-24">Detalii</th>
                  </tr>
                </thead>
                <tbody>
                  {vendorGroups.map((group) => {
                    const palette = VENDOR_PALETTE[group.colorIndex];
                    return (
                      <React.Fragment key={group.vendorKey}>
                        <tr className={`border-b-2 ${palette.header}`}>
                          <td colSpan={16} className={`py-2 px-3 font-semibold text-gray-800 ${palette.border} ${palette.bg}`}>
                            <i className="ri-user-line mr-1.5 text-gray-500" />
                            Vânzător: {group.vendorName}
                            <span className="text-gray-500 font-normal text-xs ml-2">({group.rows.length} anunțuri)</span>
                          </td>
                        </tr>
                        {group.rows.map((row) => {
                          const isEndedOrFolded = isPublishedMissingOrExpiredDate(row);
                          const isRegenerating = row.product_id ? regeneratingProductIds.has(row.product_id) : false;
                          return (
                          <React.Fragment key={row.id}>
                            <tr
                              className={`border-b border-gray-100 ${
                                isRegenerating
                                  ? "bg-amber-100/90"
                                  : isEndedOrFolded
                                    ? "bg-red-100/95 border-l-4 border-l-red-500 hover:bg-red-200/90"
                                    : `hover:bg-gray-50/80 ${palette.border} ${palette.bg}`
                              }`}
                              title={isRegenerating ? "Se regenerează…" : isEndedOrFolded ? "Publicat pe /ro, fără dată/oră sau cu data expirată" : undefined}
                            >
                        <td className="w-10 py-2 px-2 text-center">
                          <input
                            type="checkbox"
                            checked={selectedIds.has(row.id)}
                            onChange={() => toggleSelect(row.id)}
                            className="rounded border-gray-300"
                          />
                        </td>
                        <td className="py-2 px-3 text-gray-600 font-mono">{row.source_external_id}</td>
                        <td className="py-2 px-3 text-gray-700 font-mono text-xs" title={`${row.main_category || "—"} + ID`}>{getCodAnunt(row)}</td>
                        <td className="py-2 px-3 max-w-[220px]">
                          <span className="line-clamp-2 text-gray-900" title={row.title || ""}>
                            {row.title || "—"}
                          </span>
                        </td>
                        <td className="py-2 px-3">
                          <span className="text-gray-700 text-xs font-medium" title={row.main_category || ""}>
                            {row.main_category || "—"}
                          </span>
                        </td>
                        <td className="py-2 px-3 max-w-[160px]">
                          <span className="text-gray-700 text-xs" title={row.category || ""}>
                            {row.category ? (row.category.length > 25 ? row.category.slice(0, 24) + "…" : row.category) : "—"}
                          </span>
                        </td>
                        <td className="py-2 px-3 text-gray-700">{formatPriceTextForDisplay(row.price_text)}</td>
                        <td className="py-2 px-3">
                          <span className="text-gray-700">{row.location_county || "—"}</span>
                          {row.location_city && <span className="text-gray-500"> / {row.location_city}</span>}
                        </td>
                        <td className="py-2 px-3">
                          {(row.pdf_urls?.length ?? 0) > 0 || row.pdf_url ? (
                            <div className="flex flex-wrap gap-1">
                              {(Array.isArray(row.pdf_urls) && row.pdf_urls.length > 0
                                ? row.pdf_urls
                                : row.pdf_url
                                  ? [row.pdf_url]
                                  : []
                              ).map((url, idx) => (
                                <a
                                  key={idx}
                                  href={url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-0.5 text-blue-600 hover:underline text-xs"
                                >
                                  <i className="ri-file-pdf-line" />
                                  {row.pdf_urls && row.pdf_urls.length > 1 ? `PDF ${idx + 1}` : "PDF"}
                                </a>
                              ))}
                            </div>
                          ) : "—"}
                        </td>
                        <td className="py-2 px-3">{row.images_count > 0 ? row.images_count : "—"}</td>
                        <td className="py-2 px-3 text-gray-600 whitespace-nowrap" title={formatDate(row.created_at)}>
                          {formatRelativeTimeRo(row.created_at)}
                        </td>
                        <td className="py-2 px-3 text-gray-500 whitespace-nowrap">{formatDate(row.last_seen_at)}</td>
                        <td className="py-2 px-3">
                          {row.deleted_at ? (
                            <span className="text-red-600 text-xs">Dezactivat</span>
                          ) : row.reactivated_at ? (
                            <span className="text-orange-700 font-medium text-xs">Reactivat</span>
                          ) : (
                            <span className="text-emerald-600 text-xs">Activ</span>
                          )}
                        </td>
                        <td className="py-2 px-3">
                          {row.product_id && row.product_slug ? (
                            <div className="flex flex-wrap items-center gap-2">
                              <a
                                href={`/licitatii-publice/${row.product_slug}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-emerald-600 hover:underline text-xs"
                              >
                                Vizualizează <i className="ri-external-link-line" />
                              </a>
                              <button
                                type="button"
                                disabled={regeneratingProductId === row.product_id || regeneratingProductIds.has(row.product_id!)}
                                onClick={() => handleRegenerateProduct(row.product_id!)}
                                className="inline-flex items-center justify-center min-w-[2.25rem] px-2 py-1 rounded text-xs font-medium border border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100 disabled:opacity-60"
                                title={regeneratingProductId === row.product_id || regeneratingProductIds.has(row.product_id!) ? "Se regenerează…" : "Regenerează titlul și descrierea din anunțul sursă"}
                              >
                                {regeneratingProductId === row.product_id || regeneratingProductIds.has(row.product_id!) ? (
                                  <i className="ri-loader-4-line animate-spin text-base" aria-hidden />
                                ) : (
                                  <span>Regenerează <i className="ri-refresh-line" /></span>
                                )}
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              disabled={!!row.deleted_at || publishingIds.has(row.id)}
                              onClick={() => handlePublishToSite([row.id])}
                              className="px-2 py-1 rounded text-xs font-medium bg-blue-100 text-blue-700 hover:bg-blue-200 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              {publishingIds.has(row.id) ? "Se publică…" : "Publică pe site"}
                            </button>
                          )}
                        </td>
                        <td className="py-2 px-3">
                          <a href={row.source_url} target="_blank" rel="noopener noreferrer" className="text-emerald-600 hover:underline">
                            <i className="ri-external-link-line" />
                          </a>
                        </td>
                        <td className="py-2 px-3">
                          <button
                            type="button"
                            onClick={() => toggleDetail(row.id)}
                            className={`px-2 py-1 rounded text-xs font-medium ${
                              expandedId === row.id
                                ? "bg-emerald-500 text-white"
                                : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                            }`}
                          >
                            {expandedId === row.id ? "Ascunde" : "Detalii"}
                          </button>
                        </td>
                          </tr>
                      {expandedId === row.id && (
                        <tr key={`${row.id}-detail`}>
                          <td colSpan={16} className={`p-0 border-b border-gray-200 ${isEndedOrFolded ? "bg-red-50/80" : "bg-gray-50"} ${palette.border}`}>
                            {loadingDetail === row.id ? (
                              <div className="p-6 text-center text-gray-500">
                                <i className="ri-loader-4-line animate-spin text-2xl" />
                              </div>
                            ) : detailCache[row.id] ? (
                              <DetailPanel
                                detail={detailCache[row.id]}
                                formatDate={formatDate}
                                formatDateOnly={formatDateOnly}
                                formatRelativeTimeRo={formatRelativeTimeRo}
                                DetailRow={DetailRow}
                                onRefreshDescription={refreshDescription}
                                isRefreshingDescription={(id) => refreshingDescId === id}
                                onRefreshDetail={refreshDetail}
                                isRefreshingDetail={(id, group) => refreshingDetailId === id && refreshingDetailGroup === group}
                              />
                            ) : (
                              <div className="p-6 text-center text-gray-500">Eroare la încărcare</div>
                            )}
                          </td>
                        </tr>
                      )}
                          </React.Fragment>
                          );
                        })}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          {totalPages > 1 && (
            <WheelPaginationFooter isDarkMode={false} className="mt-0 bg-gray-50 px-4 pb-4 pt-6 sm:pb-6">
              <WheelPagination
                totalPages={totalPages}
                currentPage={page}
                onPageChange={(p) => setPage(p)}
                canGoNext={page < totalPages}
                isDarkMode={false}
              />
            </WheelPaginationFooter>
          )}
        </div>

        {/* Județe (toate, cu număr din DB sau 0) */}
        {stats && (
          <div className="mt-6 bg-white rounded-xl shadow border border-gray-200 p-4">
            <h3 className="font-semibold text-gray-900 mb-3">Anunțuri pe județ</h3>
            <div className="flex flex-wrap gap-2">
              {ROMANIAN_COUNTIES.map((county) => {
                const count = (stats.byCounty ?? []).find(
                  (c) => (c.county || "").trim().toLowerCase() === county.trim().toLowerCase()
                )?.count ?? 0;
                return (
                  <span
                    key={county}
                    onClick={() => { setCountyFilter(county); setPage(1); }}
                    className={`px-3 py-1.5 rounded-full text-sm cursor-pointer ${
                      countyFilter === county
                        ? "bg-emerald-500 text-white"
                        : "bg-gray-100 text-gray-700 hover:bg-gray-200 border border-gray-200"
                    }`}
                  >
                    {county}: <strong>{count}</strong>
                  </span>
                );
              })}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
