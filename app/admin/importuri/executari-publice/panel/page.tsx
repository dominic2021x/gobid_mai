"use client";

/**
 * Panel EXECUTARI-PUBLICE – listă anunțuri REPES cu Publică / Regenerează.
 */

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import WheelPagination, { WheelPaginationFooter } from "@/components/ui/wheel-pagination";

interface ListingRow {
  id: string;
  source_external_id: string;
  source_url: string;
  title: string | null;
  price_text: string | null;
  location_county: string | null;
  location_city: string | null;
  created_at: string | null;
  deleted_at: string | null;
  product_id: string | null;
  product_slug: string | null;
}

interface Stats {
  byCounty: { county: string; count: number }[];
}

const LIMIT = 50;

export default function ExecutariPublicePanelPage() {
  const [listings, setListings] = useState<ListingRow[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<Stats | null>(null);
  const [statusFilter, setStatusFilter] = useState<"active" | "deleted" | "all" | "unpublished" | "listed">("active");
  const [countyFilter, setCountyFilter] = useState("");
  const [regeneratingId, setRegeneratingId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [publishingIds, setPublishingIds] = useState<Set<string>>(new Set());

  const fetchStats = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;
      const res = await fetch("/api/admin/sync-repes/listings?statsOnly=1", {
      });
      const data = await res.json();
      if (data.success && data.stats) setStats({ byCounty: data.stats.byCounty ?? [] });
    } catch {
      // ignore
    }
  }, []);

  const fetchListings = useCallback(async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;
      const params = new URLSearchParams({ page: String(page), limit: String(LIMIT), status: statusFilter, panel: "1" });
      if (countyFilter) params.set("county", countyFilter);
      const res = await fetch(`/api/admin/sync-repes/listings?${params}`, {
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
  }, [page, statusFilter, countyFilter]);

  useEffect(() => { fetchStats(); }, [fetchStats]);
  useEffect(() => { fetchListings(); }, [fetchListings]);

  const handleRegenerate = useCallback(async (listingId: string) => {
    setRegeneratingId(listingId);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;
      const res = await fetch("/api/admin/executari-publice/regenerate-product", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ listingId }),
      });
      const data = await res.json();
      if (data.success) await fetchListings();
      else alert(data.error || "Eroare la regenerare");
    } catch {
      alert("Eroare la regenerare");
    } finally {
      setRegeneratingId(null);
    }
  }, [fetchListings]);

  const handlePublish = useCallback(async (listingId: string) => {
    setPublishingIds((prev) => new Set(prev).add(listingId));
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;
      const res = await fetch("/api/admin/executari-publice/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ listingId }),
      });
      const data = await res.json();
      if (data.success && data.results?.[0]?.success) await fetchListings();
      else alert(data.results?.[0]?.error || data.error || "Eroare la publicare");
    } catch {
      alert("Eroare la publicare");
    } finally {
      setPublishingIds((prev) => { const n = new Set(prev); n.delete(listingId); return n; });
    }
  }, [fetchListings]);

  const handlePublishSelected = useCallback(async () => {
    const toPublish = listings.filter((r) => !r.product_id && selectedIds.has(r.id)).map((r) => r.id);
    if (toPublish.length === 0) return;
    setPublishingIds((prev) => new Set([...prev, ...toPublish]));
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;
      const res = await fetch("/api/admin/executari-publice/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ listingIds: toPublish }),
      });
      const data = await res.json();
      if (data.success) {
        setSelectedIds(new Set());
        await fetchListings();
      }
      const results = data.results || [];
      const ok = results.filter((r: { success: boolean }) => r.success).length;
      const fail = results.filter((r: { success: boolean }) => !r.success).length;
      alert(fail === 0 ? `Publicate ${ok} anunțuri.` : `Publicate ${ok}, erori: ${fail}.`);
    } catch {
      alert("Eroare la publicare");
    } finally {
      setPublishingIds((prev) => { const n = new Set(prev); toPublish.forEach((id) => n.delete(id)); return n; });
    }
  }, [listings, selectedIds, fetchListings]);

  const handleBulkRegenerate = useCallback(async () => {
    const listingIds = Array.from(selectedIds);
    if (listingIds.length === 0) return;
    setRegeneratingId("bulk");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;
      const res = await fetch("/api/admin/executari-publice/regenerate-products", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ listingIds }),
      });
      const data = await res.json();
      if (data.success) {
        setSelectedIds(new Set());
        await fetchListings();
        alert(data.message || `Regenerate: ${data.regenerated} reușite.`);
      } else alert(data.error || "Eroare");
    } catch {
      alert("Eroare la regenerare în bulk.");
    } finally {
      setRegeneratingId(null);
    }
  }, [selectedIds, listings, fetchListings]);

  const selectableOnPage = listings.map((r) => r.id);
  const allSelected = selectableOnPage.length > 0 && selectableOnPage.every((id) => selectedIds.has(id));
  const unpublishedSelectedCount = listings.filter((r) => !r.product_id && selectedIds.has(r.id)).length;

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelectedIds((prev) => { const n = new Set(prev); selectableOnPage.forEach((id) => n.delete(id)); return n; });
    } else {
      setSelectedIds((prev) => { const n = new Set(prev); selectableOnPage.forEach((id) => n.add(id)); return n; });
    }
  };

  const toggleSelectOne = (listingId: string) => {
    setSelectedIds((prev) => {
      const n = new Set(prev);
      if (n.has(listingId)) n.delete(listingId);
      else n.add(listingId);
      return n;
    });
  };

  const totalPages = Math.max(1, Math.ceil(totalCount / LIMIT));

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-4 md:p-6">
      <div className="max-w-6xl mx-auto">
        <Link
          href="/admin/importuri/executari-publice"
          className="mb-4 flex items-center gap-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
        >
          <i className="ri-arrow-left-line" />
          Înapoi la EXECUTARI-PUBLICE
        </Link>

        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
          <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between flex-wrap gap-3">
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">Panel EXECUTARI-PUBLICE</h1>
          </div>

          <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex flex-wrap items-center gap-3">
            <select
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value as "active" | "deleted" | "all" | "unpublished" | "listed"); setPage(1); }}
              className="rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-200 px-3 py-1.5 text-sm"
            >
              <option value="active">Active</option>
              <option value="deleted">Dezactivate</option>
              <option value="unpublished">Nelistate</option>
              <option value="listed">Listate</option>
              <option value="all">Toate</option>
            </select>
            <select
              value={countyFilter}
              onChange={(e) => { setCountyFilter(e.target.value); setPage(1); }}
              className="rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-200 px-3 py-1.5 text-sm"
            >
              <option value="">Toate județele</option>
              {(stats?.byCounty || []).map((c) => (
                <option key={c.county} value={c.county}>{c.county} ({c.count})</option>
              ))}
            </select>
            <span className="text-sm text-gray-500 dark:text-gray-400 ml-auto">{totalCount} în total</span>
          </div>

          {selectedIds.size > 0 && (
            <div className="px-4 py-2 border-b border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 flex items-center gap-3 flex-wrap">
              <span className="text-sm font-medium text-amber-900 dark:text-amber-200">{selectedIds.size} selectate (listing ID)</span>
              <button
                type="button"
                onClick={handleBulkRegenerate}
                disabled={regeneratingId === "bulk"}
                className="px-3 py-1.5 rounded-lg border border-amber-400 bg-amber-500 text-white text-sm font-medium hover:bg-amber-600 disabled:opacity-60"
              >
                {regeneratingId === "bulk" ? "Regenerează…" : "Regenerează toate selectate"}
              </button>
              <button type="button" onClick={() => setSelectedIds(new Set())} className="text-sm text-amber-800 dark:text-amber-200 hover:underline">
                Anulează selecția
              </button>
            </div>
          )}

          <div className="p-4 overflow-x-auto">
            {loading ? (
              <div className="flex items-center justify-center py-16 text-gray-500">
                <i className="ri-loader-4-line animate-spin text-3xl mr-2" />
                Se încarcă...
              </div>
            ) : listings.length === 0 ? (
              <div className="py-12 text-center text-gray-500">Niciun anunț.</div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-gray-100 dark:bg-gray-700">
                  <tr>
                    <th className="text-left py-2 px-3 w-10">
                      {selectableOnPage.length > 0 && (
                        <input type="checkbox" checked={allSelected} onChange={toggleSelectAll} className="rounded border-gray-300" />
                      )}
                    </th>
                    <th className="text-left py-2 px-3 font-medium text-gray-700 dark:text-gray-300">ID</th>
                    <th className="text-left py-2 px-3 font-medium text-gray-700 dark:text-gray-300">Titlu</th>
                    <th className="text-left py-2 px-3 font-medium text-gray-700 dark:text-gray-300">Preț</th>
                    <th className="text-left py-2 px-3 font-medium text-gray-700 dark:text-gray-300">Județ / Oraș</th>
                    <th className="text-left py-2 px-3 font-medium text-gray-700 dark:text-gray-300">Acțiuni</th>
                    <th className="text-left py-2 px-3 font-medium text-gray-700 dark:text-gray-300">URL anunț</th>
                    <th className="text-left py-2 px-3 font-medium text-gray-700 dark:text-gray-300">URL pe site</th>
                  </tr>
                </thead>
                <tbody>
                  {listings.map((row) => (
                    <tr key={row.id} className="border-b border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50">
                      <td className="py-2 px-3">
                        <input
                          type="checkbox"
                          checked={selectedIds.has(row.id)}
                          onChange={() => toggleSelectOne(row.id)}
                          className="rounded border-gray-300"
                        />
                      </td>
                      <td className="py-2 px-3 font-mono text-gray-600 dark:text-gray-400">{row.source_external_id}</td>
                      <td className="py-2 px-3 max-w-[200px] truncate text-gray-900 dark:text-white" title={row.title || undefined}>{row.title || "—"}</td>
                      <td className="py-2 px-3 text-gray-600 dark:text-gray-400">{row.price_text ?? "—"}</td>
                      <td className="py-2 px-3 text-gray-600 dark:text-gray-400">{[row.location_county, row.location_city].filter(Boolean).join(" / ") || "—"}</td>
                      <td className="py-2 px-3">
                        {row.product_id ? (
                          <button
                            type="button"
                            onClick={() => handleRegenerate(row.id)}
                            disabled={regeneratingId === row.id}
                            className="px-2 py-1 rounded border border-amber-300 bg-amber-50 dark:bg-amber-900/20 text-amber-800 dark:text-amber-200 text-xs font-medium hover:bg-amber-100 disabled:opacity-60"
                          >
                            {regeneratingId === row.id ? "…" : "Regenerează"}
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handlePublish(row.id)}
                            disabled={!!row.deleted_at || publishingIds.has(row.id)}
                            className="px-2 py-1 rounded border border-emerald-300 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-800 dark:text-emerald-200 text-xs font-medium hover:bg-emerald-100 disabled:opacity-60"
                          >
                            {publishingIds.has(row.id) ? "…" : "Publică"}
                          </button>
                        )}
                      </td>
                      <td className="py-2 px-3">
                        <a href={row.source_url} target="_blank" rel="noopener noreferrer" className="text-blue-600 dark:text-blue-400 hover:underline text-xs break-all">
                          Anunț
                        </a>
                      </td>
                      <td className="py-2 px-3">
                        {row.product_slug ? (
                          <a href={`/licitatii-publice/${row.product_slug}`} target="_blank" rel="noopener noreferrer" className="text-emerald-600 dark:text-emerald-400 hover:underline text-xs break-all">
                            /licitatii-publice/{row.product_slug}
                          </a>
                        ) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {!loading && listings.length > 0 && totalPages > 1 && (
              <WheelPaginationFooter isDarkMode className="mt-4 px-2 pb-4 pt-6 sm:px-4">
                <WheelPagination
                  totalPages={totalPages}
                  currentPage={page}
                  onPageChange={(p) => setPage(p)}
                  canGoNext={page < totalPages}
                  isDarkMode
                />
              </WheelPaginationFooter>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
