"use client";

/**
 * Panel Licitatii insolventa – 2 taburi: Toate anunțurile (cu Publică pe site) și Listate pe site.
 * Cu paginare (50 per pagină), filtre, ID în față și URL anunț / URL pe site la final.
 */

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import WheelPagination, { WheelPaginationFooter } from "@/components/ui/wheel-pagination";
import { formatPriceTextForDisplay } from "@/lib/licitatii-price";
import LicitatiiInsolventaEditModal from "@/components/LicitatiiInsolventaEditModal";

const ROMANIAN_COUNTIES = [
  "Alba", "Arad", "Argeș", "Bacău", "Bihor", "Bistrița-Năsăud", "Botoșani",
  "Brașov", "Brăila", "București", "Buzău", "Caraș-Severin", "Călărași", "Cluj", "Constanța",
  "Covasna", "Dâmbovița", "Dolj", "Galați", "Giurgiu", "Gorj", "Harghita",
  "Hunedoara", "Ialomița", "Iași", "Ilfov", "Maramureș", "Mehedinți", "Mureș",
  "Neamț", "Olt", "Prahova", "Sălaj", "Satu Mare", "Sibiu", "Suceava",
  "Teleorman", "Timiș", "Tulcea", "Vâlcea", "Vaslui", "Vrancea",
];

interface ListingRow {
  id: string;
  source_external_id: string;
  source_url: string;
  title: string | null;
  price_text: string | null;
  category: string | null;
  location_city: string | null;
  location_county: string | null;
  created_at: string | null;
  deleted_at: string | null;
  reactivated_at: string | null;
  product_id?: string | null;
  product_slug?: string | null;
  product_title?: string | null;
  product_description?: string | null;
  product_category?: string | null;
  product_subcategory?: string | null;
  product_county?: string | null;
  product_city?: string | null;
  product_price?: number | null;
}

interface Stats {
  byCounty: { county: string; count: number }[];
  byCategory: { category: string; count: number }[];
}

function formatProductPrice(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "—";
  const intPart = Math.floor(value);
  const decPart = Math.round((value - intPart) * 100);
  return `${intPart.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".")},${decPart.toString().padStart(2, "0")} Lei`;
}

function stripHtml(html: string | null | undefined): string {
  if (!html) return "";
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("ro-RO", { day: "2-digit", month: "2-digit", year: "numeric" });
  } catch {
    return "—";
  }
}

function listingStatus(row: ListingRow): "activ" | "dezactivat" | "reactivat" {
  if (row.deleted_at) return "dezactivat";
  if (row.reactivated_at) return "reactivat";
  return "activ";
}

const LIMIT = 50;

export default function LicitatiiPanelPage() {
  const [listings, setListings] = useState<ListingRow[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<Stats | null>(null);
  const [statusFilter, setStatusFilter] = useState<"active" | "deleted" | "all">("active");
  const [countyFilter, setCountyFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [timeFilter, setTimeFilter] = useState("all");
  const [sortOrder, setSortOrder] = useState("newest");
  const [regeneratingId, setRegeneratingId] = useState<string | null>(null);
  const [regeneratingBulk, setRegeneratingBulk] = useState(false);
  const [selectedProductIds, setSelectedProductIds] = useState<Set<string>>(new Set());
  const [publishingIds, setPublishingIds] = useState<Set<string>>(new Set());
  const [updatingSellerIds, setUpdatingSellerIds] = useState<Set<string>>(new Set());
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"all" | "onSite">("all");

  const fetchStats = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;
      const res = await fetch("/api/admin/sync-licitatii/listings?statsOnly=1", {
      });
      const data = await res.json();
      if (data.success && data.stats) {
        setStats({
          byCounty: data.stats.byCounty ?? [],
          byCategory: data.stats.byCategory ?? [],
        });
      }
    } catch {
      // ignore
    }
  }, []);

  const fetchListings = useCallback(async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;
      const params = new URLSearchParams({
        page: String(page),
        limit: String(LIMIT),
        status: statusFilter,
        time: timeFilter,
        order: sortOrder,
      });
      if (countyFilter) params.set("county", countyFilter);
      if (categoryFilter) params.set("category", categoryFilter);
      if (activeTab === "onSite") params.set("onSite", "1");
      const res = await fetch(`/api/admin/sync-licitatii/listings?${params}`, {
      });
      const data = await res.json();
      if (data.success) {
        setListings(data.listings || []);
        setTotalCount(data.totalCount ?? 0);
      }
    } catch {
      setListings([]);
      setTotalCount(0);
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter, countyFilter, categoryFilter, timeFilter, sortOrder, activeTab]);

  const handleRegenerate = useCallback(async (productId: string) => {
    setRegeneratingId(productId);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;
      const res = await fetch("/api/admin/licitatii-insolventa/regenerate-product", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ productId }),
      });
      const data = await res.json();
      if (data.success) {
        const scrollY = typeof window !== "undefined" ? window.scrollY : 0;
        await fetchListings();
        if (typeof window !== "undefined") requestAnimationFrame(() => { window.scrollTo(0, scrollY); });
      } else {
        alert(data.error || "Eroare la regenerare");
      }
    } catch (e) {
      alert("Eroare la regenerare");
    } finally {
      setRegeneratingId(null);
    }
  }, [fetchListings]);

  const selectableOnPage = listings.filter((r) => r.product_id).map((r) => r.product_id!);
  const allSelected = selectableOnPage.length > 0 && selectableOnPage.every((id) => selectedProductIds.has(id));

  const toggleSelectAll = useCallback(() => {
    if (allSelected) {
      setSelectedProductIds((prev) => {
        const next = new Set(prev);
        selectableOnPage.forEach((id) => next.delete(id));
        return next;
      });
    } else {
      setSelectedProductIds((prev) => {
        const next = new Set(prev);
        selectableOnPage.forEach((id) => next.add(id));
        return next;
      });
    }
  }, [allSelected, selectableOnPage]);

  const toggleSelectOne = useCallback((productId: string) => {
    setSelectedProductIds((prev) => {
      const next = new Set(prev);
      if (next.has(productId)) next.delete(productId);
      else next.add(productId);
      return next;
    });
  }, []);

  const handleBulkRegenerate = useCallback(async () => {
    const ids = Array.from(selectedProductIds);
    if (ids.length === 0) return;
    setRegeneratingBulk(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;
      let ok = 0;
      let err = 0;
      for (const productId of ids) {
        setRegeneratingId(productId);
        try {
          const res = await fetch("/api/admin/licitatii-insolventa/regenerate-product", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
            body: JSON.stringify({ productId }),
          });
          const data = await res.json();
          if (data.success) ok++;
          else err++;
        } catch {
          err++;
        }
      }
      setRegeneratingId(null);
      setSelectedProductIds(new Set());
      const scrollY = typeof window !== "undefined" ? window.scrollY : 0;
      await fetchListings();
      if (typeof window !== "undefined") requestAnimationFrame(() => { window.scrollTo(0, scrollY); });
      if (err > 0) alert(`${ok} regenerat(e), ${err} eroare.`);
    } catch (e) {
      alert("Eroare la regenerare în bulk.");
    } finally {
      setRegeneratingBulk(false);
      setRegeneratingId(null);
    }
  }, [selectedProductIds, fetchListings]);

  const handleRefreshSeller = useCallback(async (listingId: string) => {
    setUpdatingSellerIds((prev) => new Set(prev).add(listingId));
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;
      const res = await fetch(`/api/admin/sync-licitatii/listings/${listingId}/refresh-detail`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ only: "seller" }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || "Eroare la actualizare detalii vânzător");
        return;
      }
      await fetchListings();
    } catch (e) {
      alert("Eroare la actualizare detalii vânzător");
    } finally {
      setUpdatingSellerIds((prev) => {
        const next = new Set(prev);
        next.delete(listingId);
        return next;
      });
    }
  }, [fetchListings]);

  const handlePublish = useCallback(async (listingId: string) => {
    setPublishingIds((prev) => new Set(prev).add(listingId));
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;
      const res = await fetch("/api/admin/licitatii-insolventa/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ listingId }),
      });
      const data = await res.json();
      if (data.success && data.results?.[0]?.success) {
        await fetchListings();
      } else {
        const err = data.results?.[0]?.error || data.error || "Eroare la publicare";
        alert(err);
      }
    } catch (e) {
      alert("Eroare la publicare");
    } finally {
      setPublishingIds((prev) => {
        const next = new Set(prev);
        next.delete(listingId);
        return next;
      });
    }
  }, [fetchListings]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  useEffect(() => {
    fetchListings();
  }, [fetchListings]);

  const totalPages = Math.max(1, Math.ceil(totalCount / LIMIT));

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-6">
      <div className="max-w-6xl mx-auto">
        <Link
          href="/admin/importuri/licitatii-publice"
          className="mb-4 flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors"
        >
          <i className="ri-arrow-left-line" />
          <span>Înapoi la Licitatii insolventa</span>
        </Link>

        <div className="bg-white rounded-2xl shadow-lg border border-gray-200 overflow-hidden">
          <div className="p-4 border-b border-gray-200 flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-2">
              <img src="/favicon.ico" alt="gobid" className="w-6 h-6 rounded object-contain" />
              <h1 className="text-xl font-bold text-gray-900">Panel Licitatii insolventa</h1>
            </div>
          </div>

          {/* Taburi */}
          <div className="flex border-b border-gray-200 bg-gray-50/50">
            <button
              type="button"
              onClick={() => { setActiveTab("all"); setPage(1); }}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === "all"
                  ? "border-emerald-600 text-emerald-700 bg-white"
                  : "border-transparent text-gray-600 hover:text-gray-900"
              }`}
            >
              Toate anunțurile
            </button>
            <button
              type="button"
              onClick={() => { setActiveTab("onSite"); setPage(1); }}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === "onSite"
                  ? "border-emerald-600 text-emerald-700 bg-white"
                  : "border-transparent text-gray-600 hover:text-gray-900"
              }`}
            >
              Listate pe site
            </button>
          </div>

          {/* Filtre */}
          <div className="p-4 border-b border-gray-200 flex flex-wrap items-center gap-3 bg-gray-50/50">
            <span className="text-sm text-gray-500">Status:</span>
            <select
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value as "active" | "deleted" | "all"); setPage(1); }}
              className="rounded-lg border border-gray-300 bg-white text-gray-900 px-3 py-1.5 text-sm"
            >
              <option value="active">Active</option>
              <option value="deleted">Dezactivate</option>
              <option value="all">Toate</option>
            </select>
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
                    const count = (stats.byCounty ?? []).find(
                      (c) => (c.county || "").trim().toLowerCase() === county.trim().toLowerCase()
                    )?.count ?? 0;
                    return (
                      <option key={county} value={county}>{county} ({count})</option>
                    );
                  })}
                </select>
              </>
            )}
            {stats && (stats.byCategory ?? []).length > 0 && (
              <>
                <span className="text-sm text-gray-500">Categorie:</span>
                <select
                  value={categoryFilter}
                  onChange={(e) => { setCategoryFilter(e.target.value); setPage(1); }}
                  className="rounded-lg border border-gray-300 bg-white text-gray-900 px-3 py-1.5 text-sm max-w-[220px]"
                >
                  <option value="">Toate categoriile</option>
                  {(stats.byCategory ?? []).map((c) => (
                    <option key={c.category} value={c.category}>{c.category} ({c.count})</option>
                  ))}
                </select>
              </>
            )}
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
            <span className="text-sm text-gray-500 ml-auto">
              {totalCount} în total
            </span>
          </div>

          {selectedProductIds.size > 0 && (
            <div className="px-4 py-2 border-b border-amber-200 bg-amber-50 flex items-center gap-3 flex-wrap">
              <span className="text-sm font-medium text-amber-900">
                {selectedProductIds.size} selectat(e)
              </span>
              <button
                type="button"
                onClick={handleBulkRegenerate}
                disabled={regeneratingBulk}
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-amber-400 bg-amber-500 text-white text-sm font-medium hover:bg-amber-600 disabled:opacity-60"
              >
                {regeneratingBulk ? (
                  <>
                    <i className="ri-loader-4-line animate-spin text-base" aria-hidden />
                    Regenerează…
                  </>
                ) : (
                  <>
                    <i className="ri-refresh-line" />
                    Regenerează toate selectate
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={() => setSelectedProductIds(new Set())}
                disabled={regeneratingBulk}
                className="text-sm text-amber-800 hover:underline disabled:opacity-60"
              >
                Anulează selecția
              </button>
            </div>
          )}

          <div className="p-4 min-h-[400px]">
            {loading ? (
              <div className="flex items-center justify-center py-16 text-gray-500">
                <i className="ri-loader-4-line animate-spin text-3xl mr-2" />
                Se încarcă...
              </div>
            ) : listings.length === 0 ? (
              <div className="py-12 text-center text-gray-500">
                {activeTab === "onSite" ? "Niciun anunț listat încă pe site." : "Niciun anunț în această selecție."}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-100 sticky top-0">
                    <tr>
                      <th className="text-left py-2 px-3 w-10">
                        {selectableOnPage.length > 0 ? (
                          <input
                            type="checkbox"
                            checked={allSelected}
                            onChange={toggleSelectAll}
                            title="Selectează / deselectează toate de pe pagină"
                            className="rounded border-gray-300 text-amber-600 focus:ring-amber-500"
                          />
                        ) : null}
                      </th>
                      <th className="text-left py-2 px-3 font-medium text-gray-700 w-24">ID</th>
                      <th className="text-left py-2 px-3 font-medium text-gray-700 w-28">Adăugat</th>
                      <th className="text-left py-2 px-3 font-medium text-gray-700 w-24">Status</th>
                      <th className="text-left py-2 px-3 font-medium text-gray-700">Titlu (pe site)</th>
                      <th className="text-left py-2 px-3 font-medium text-gray-700">Descriere</th>
                      <th className="text-left py-2 px-3 font-medium text-gray-700">Categorie</th>
                      <th className="text-left py-2 px-3 font-medium text-gray-700">Preț</th>
                      <th className="text-left py-2 px-3 font-medium text-gray-700">Județ / Oraș</th>
                      <th className="text-left py-2 px-3 font-medium text-gray-700 w-40">Acțiuni</th>
                      <th className="text-left py-2 px-3 font-medium text-gray-700">URL anunț</th>
                      <th className="text-left py-2 px-3 font-medium text-gray-700">URL pe site</th>
                    </tr>
                  </thead>
                  <tbody>
                    {listings.map((row) => {
                      const status = listingStatus(row);
                      const hasProduct = !!row.product_id;
                      return (
                      <tr key={row.id} className="border-b border-gray-100 hover:bg-gray-50 align-top">
                        <td className="py-2 px-3">
                          {hasProduct ? (
                            <input
                              type="checkbox"
                              checked={selectedProductIds.has(row.product_id!)}
                              onChange={() => toggleSelectOne(row.product_id!)}
                              title="Selectează pentru regenerare în bulk"
                              className="rounded border-gray-300 text-amber-600 focus:ring-amber-500"
                            />
                          ) : null}
                        </td>
                        <td className="py-2 px-3 font-mono text-gray-600 whitespace-nowrap">{row.source_external_id}</td>
                        <td className="py-2 px-3 text-gray-600 whitespace-nowrap text-xs" title={row.created_at || undefined}>
                          {formatDate(row.created_at)}
                        </td>
                        <td className="py-2 px-3 whitespace-nowrap">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                            status === "activ"
                              ? "bg-emerald-100 text-emerald-800"
                              : status === "reactivat"
                              ? "bg-amber-100 text-amber-800"
                              : "bg-gray-200 text-gray-700"
                          }`}>
                            {status === "activ" ? "Activ" : status === "reactivat" ? "Reactivat" : "Dezactivat"}
                          </span>
                        </td>
                        <td className="py-2 px-3 max-w-[240px]">
                          <span className="line-clamp-3 text-gray-900 font-medium" title={row.product_title || row.title || ""}>
                            {row.product_title || row.title || "—"}
                          </span>
                        </td>
                        <td className="py-2 px-3 max-w-[320px]">
                          <span className="line-clamp-4 text-gray-600 text-xs" title={stripHtml(row.product_description || "")}>
                            {stripHtml(row.product_description || "") || "—"}
                          </span>
                        </td>
                        <td className="py-2 px-3">
                          <span className="text-gray-700">{(row.product_category || row.category || "") + (row.product_subcategory ? ` / ${row.product_subcategory}` : "") || "—"}</span>
                        </td>
                        <td className="py-2 px-3 whitespace-nowrap">{row.product_id ? formatProductPrice(row.product_price) : (row.price_text || "—")}</td>
                        <td className="py-2 px-3">
                          {(row.product_county || row.location_county || row.product_city || row.location_city) ? [row.product_county || row.location_county, row.product_city || row.location_city].filter(Boolean).join(" / ") : "—"}
                        </td>
                        <td className="py-2 px-3">
                          <div className="flex flex-wrap items-center gap-2">
                            <button
                              type="button"
                              onClick={() => handleRefreshSeller(row.id)}
                              disabled={updatingSellerIds.has(row.id)}
                              className="inline-flex items-center gap-1 px-2 py-1 rounded border border-slate-300 bg-slate-50 text-slate-700 text-xs font-medium hover:bg-slate-100 disabled:opacity-60"
                              title="Reîmprospătează nume, email, telefon, adresă din anunțul sursă"
                            >
                              {updatingSellerIds.has(row.id) ? (
                                <span><i className="ri-loader-4-line animate-spin" /> Vânzător</span>
                              ) : (
                                <span>Actualiz. vânzător <i className="ri-user-line" /></span>
                              )}
                            </button>
                            {row.product_id ? (
                              <>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingProductId(row.product_id!);
                                    setShowEditModal(true);
                                  }}
                                  className="inline-flex items-center gap-1 text-blue-600 hover:underline text-xs font-medium"
                                >
                                  Detalii / Editează <i className="ri-edit-line" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleRegenerate(row.product_id!)}
                                  disabled={regeneratingId === row.product_id}
                                  className="inline-flex items-center justify-center min-w-[2.25rem] px-2 py-1 rounded border border-amber-300 bg-amber-50 text-amber-800 text-xs font-medium hover:bg-amber-100 disabled:opacity-60"
                                  title={regeneratingId === row.product_id ? "Se regenerează…" : "Regenerează titlul și descrierea"}
                                >
                                  {regeneratingId === row.product_id ? (
                                    <i className="ri-loader-4-line animate-spin text-base" aria-hidden />
                                  ) : (
                                    <span>Regenerează <i className="ri-refresh-line" /></span>
                                  )}
                                </button>
                              </>
                            ) : (
                              <button
                                type="button"
                                onClick={() => handlePublish(row.id)}
                                disabled={!!row.deleted_at || publishingIds.has(row.id)}
                                className="inline-flex items-center gap-1 px-2 py-1 rounded border border-emerald-300 bg-emerald-50 text-emerald-800 text-xs font-medium hover:bg-emerald-100 disabled:opacity-60"
                              >
                                {publishingIds.has(row.id) ? (
                                  <span><i className="ri-loader-4-line animate-spin" /> Se publică</span>
                                ) : (
                                  <span>Publică pe site <i className="ri-global-line" /></span>
                                )}
                              </button>
                            )}
                          </div>
                        </td>
                        <td className="py-2 px-3">
                          <a href={row.source_url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline text-xs break-all" title={row.source_url}>
                            Anunț <i className="ri-external-link-line" />
                          </a>
                        </td>
                        <td className="py-2 px-3">
                          {row.product_slug ? (
                            <a href={`/licitatii-publice/${row.product_slug}`} target="_blank" rel="noopener noreferrer" className="text-emerald-600 hover:underline text-xs break-all" title={`/licitatii-publice/${row.product_slug}`}>
                              Pe site <i className="ri-external-link-line" />
                            </a>
                          ) : "—"}
                        </td>
                      </tr>
                    );})}
                  </tbody>
                </table>
              </div>
            )}

            {!loading && listings.length > 0 && totalPages > 1 && (
              <WheelPaginationFooter isDarkMode={false} className="mt-4 px-2 pb-4 pt-6 sm:px-4">
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
        </div>
      </div>

      {showEditModal && (
        <LicitatiiInsolventaEditModal
          showModal={showEditModal}
          setShowModal={(show) => {
            setShowEditModal(show);
            if (!show) setEditingProductId(null);
          }}
          editingProductId={editingProductId}
          onProductAdded={() => {
            fetchListings();
            setEditingProductId(null);
          }}
        />
      )}
    </div>
  );
}
