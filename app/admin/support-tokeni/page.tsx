"use client";

import { useEffect, useMemo, useState } from "react";
import supabase from "@/lib/supabase";

type RefundRequest = {
  id: string;
  user_email: string;
  user_name: string;
  product_code: string | null;
  product_title: string;
  product_slug: string | null;
  product_image_url: string | null;
  reason: string;
  status: "pending" | "approved" | "rejected" | "refunded";
  admin_note: string | null;
  created_at: string;
  reviewed_at: string | null;
};

export default function AdminTokenSupportPage() {
  const [items, setItems] = useState<RefundRequest[]>([]);
  const [statusFilter, setStatusFilter] = useState<"all" | RefundRequest["status"]>("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [sortOrder, setSortOrder] = useState<"newest" | "oldest">("newest");
  const [expandedRequestIds, setExpandedRequestIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [adminNoteById, setAdminNoteById] = useState<Record<string, string>>({});
  const [error, setError] = useState("");

  const loadData = async () => {
    setLoading(true);
    setError("");
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      if (!accessToken) {
        setError("Nu există sesiune admin activă.");
        setLoading(false);
        return;
      }

      const response = await fetch(`/api/admin/tokens/refund-requests?status=${statusFilter}`, {
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(json.error || "Nu am putut încărca cererile.");
      }
      const rows: RefundRequest[] = Array.isArray(json) ? json : [];
      setItems(rows);
      setAdminNoteById(
        rows.reduce<Record<string, string>>((acc, row) => {
          acc[row.id] = row.admin_note || "";
          return acc;
        }, {})
      );
    } catch (e: any) {
      setError(e?.message || "Eroare la încărcare.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [statusFilter]);

  const pendingCount = useMemo(() => items.filter((item) => item.status === "pending").length, [items]);
  const filteredItems = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    let list = [...items];

    if (q) {
      list = list.filter((item) => {
        const haystack = [
          item.product_code || "",
          item.product_title || "",
          item.user_name || "",
          item.user_email || "",
          item.reason || "",
          item.admin_note || "",
        ]
          .join(" ")
          .toLowerCase();
        return haystack.includes(q);
      });
    }

    if (sortOrder === "oldest") {
      list.sort((a, b) => (a.created_at > b.created_at ? 1 : -1));
    } else {
      list.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
    }
    return list;
  }, [items, searchTerm, sortOrder]);

  const toggleExpanded = (id: string) => {
    setExpandedRequestIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const updateStatus = async (id: string, status: RefundRequest["status"]) => {
    setSavingId(id);
    setError("");
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      if (!accessToken) throw new Error("Sesiune invalidă.");

      const response = await fetch("/api/admin/tokens/refund-requests", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id,
          status,
          adminNote: adminNoteById[id] || "",
        }),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(json.error || "Nu am putut actualiza statusul.");

      setItems((prev) =>
        prev.map((row) =>
          row.id === id
            ? {
                ...row,
                status,
                admin_note: adminNoteById[id] || null,
                reviewed_at: new Date().toISOString(),
              }
            : row
        )
      );
    } catch (e: any) {
      setError(e?.message || "Eroare la actualizare.");
    } finally {
      setSavingId(null);
    }
  };

  return (
    <div className="p-6 md:p-8 space-y-6 bg-white text-gray-900 min-h-full">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900">Support tokeni</h1>
          <p className="text-sm text-gray-600 mt-1">
            Cereri de returnare token pentru anunțuri deblocate.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs px-2 py-1 rounded-full bg-amber-100 text-amber-700 font-semibold">
            {pendingCount} în așteptare
          </span>
          <button
            onClick={loadData}
            className="px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium"
          >
            Reîncarcă
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {(["all", "pending", "approved", "rejected", "refunded"] as const).map((status) => (
          <button
            key={status}
            onClick={() => setStatusFilter(status)}
            className={`px-3 py-1.5 rounded-full text-sm font-medium transition ${
              statusFilter === status ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-700"
            }`}
          >
            {status === "all" ? "Toate" : status}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Caută după cod, titlu, utilizator, email, motiv..."
          className="md:col-span-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
        />
        <select
          value={sortOrder}
          onChange={(e) => setSortOrder(e.target.value as "newest" | "oldest")}
          className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
        >
          <option value="newest">Cele mai noi</option>
          <option value="oldest">Cele mai vechi</option>
        </select>
      </div>

      {error && <div className="rounded-lg border border-red-200 bg-red-50 text-red-700 px-3 py-2 text-sm">{error}</div>}

      <div className="space-y-3">
        {loading ? (
          <div className="text-sm text-gray-600">Se încarcă cererile...</div>
        ) : filteredItems.length === 0 ? (
          <div className="text-sm text-gray-600">Nu există cereri pentru filtrul selectat.</div>
        ) : (
          filteredItems.map((item) => {
            const isResolved = item.status === "approved" || item.status === "rejected" || item.status === "refunded";
            const isExpanded = expandedRequestIds.includes(item.id) || item.status === "pending";
            const compactColor =
              item.status === "approved"
                ? "border-l-green-600 bg-green-50"
                : item.status === "rejected"
                ? "border-l-red-600 bg-red-50"
                : item.status === "refunded"
                ? "border-l-blue-600 bg-blue-50"
                : "border-l-amber-600 bg-amber-50";

            if (isResolved && !isExpanded) {
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => toggleExpanded(item.id)}
                  className={`w-full text-left rounded-lg border border-gray-200 border-l-4 ${compactColor} px-3 py-2 shadow-sm`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-gray-900 truncate">
                        {item.product_title}
                      </p>
                      <p className="text-xs text-gray-600 truncate">
                        {item.product_code || "N/A"} • {item.user_name} • {new Date(item.created_at).toLocaleString("ro-RO")}
                      </p>
                    </div>
                    <span className="text-xs font-semibold text-gray-700 capitalize whitespace-nowrap">
                      {item.status} • vezi
                    </span>
                  </div>
                </button>
              );
            }

            return (
              <div key={item.id} className={`rounded-xl border border-gray-200 bg-white p-4 shadow-sm ${isResolved ? "border-l-4 " + compactColor.split(" ")[0] : ""}`}>
                <button
                  type="button"
                  onClick={() => isResolved && toggleExpanded(item.id)}
                  className="w-full text-left"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-xs text-gray-500">
                        {item.product_code || "N/A"} • {new Date(item.created_at).toLocaleString("ro-RO")}
                      </div>
                      <a
                        href={item.product_slug ? `/licitatii-publice/${item.product_slug}` : "#"}
                        className="text-sm md:text-base font-semibold text-blue-600 hover:underline"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {item.product_title}
                      </a>
                      <div className="text-xs text-gray-600 mt-1">
                        {item.user_name} • {item.user_email}
                      </div>
                    </div>
                    <span className={`text-xs px-2 py-1 rounded-full font-semibold ${
                      item.status === "pending"
                        ? "bg-amber-100 text-amber-700"
                        : item.status === "approved"
                        ? "bg-green-100 text-green-700"
                        : item.status === "refunded"
                        ? "bg-blue-100 text-blue-700"
                        : "bg-red-100 text-red-700"
                    }`}>
                      {item.status}
                    </span>
                  </div>
                </button>

                <div className="mt-3 text-sm text-gray-800">
                  <strong>Motiv:</strong> {item.reason}
                </div>

                <div className="mt-3">
                  <label className="block text-xs font-medium text-gray-600 mb-1">Notă admin</label>
                  <textarea
                    value={adminNoteById[item.id] ?? ""}
                    onChange={(e) => setAdminNoteById((prev) => ({ ...prev, [item.id]: e.target.value }))}
                    rows={2}
                    className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
                    placeholder="Notă internă pentru această cerere..."
                  />
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    disabled={savingId === item.id}
                    onClick={() => updateStatus(item.id, "approved")}
                    className="px-3 py-1.5 rounded-lg text-sm font-medium bg-green-600 hover:bg-green-700 text-white disabled:opacity-60"
                  >
                    Aprobă
                  </button>
                  <button
                    disabled={savingId === item.id}
                    onClick={() => updateStatus(item.id, "refunded")}
                    className="px-3 py-1.5 rounded-lg text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-60"
                  >
                    Marcat returnat
                  </button>
                  <button
                    disabled={savingId === item.id}
                    onClick={() => updateStatus(item.id, "rejected")}
                    className="px-3 py-1.5 rounded-lg text-sm font-medium bg-red-600 hover:bg-red-700 text-white disabled:opacity-60"
                  >
                    Respinge
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

