"use client";

import { dashboardApiFetch } from "@/lib/dashboard-api-fetch";
import { useState, useEffect, useCallback, useRef } from "react";

const FIELD_LABELS: Record<string, string> = {
  title: "Titlu",
  description: "Descriere",
  category: "Categorie",
  subcategory: "Subcategorie",
  starting_price: "Preț",
  currency: "Monedă",
};

type DraftStatus = {
  hasDraft: boolean;
  draftProductId: string | null;
  status: string | null;
  imagesCount: number;
  ready: boolean;
  missing: string[];
};

const DEBOUNCE_MS = 400;

export default function DraftPanel({
  conversationId,
  accessToken,
  attachedThumbnails,
  uploading,
  onAddPhotosClick,
  onScrollToInput,
  onPublish,
  onOpenMyProducts,
  refreshTrigger,
}: {
  conversationId: string | null;
  accessToken: string | null;
  attachedThumbnails: string[];
  uploading: boolean;
  onAddPhotosClick: () => void;
  onScrollToInput: () => void;
  onPublish: () => void;
  onOpenMyProducts: (draftProductId: string | null) => void;
  refreshTrigger: number;
}) {
  const [status, setStatus] = useState<DraftStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchStatus = useCallback(async () => {
    if (!conversationId || !accessToken) {
      setStatus(null);
      return;
    }
    setLoading(true);
    try {
      const res = await dashboardApiFetch(`/api/assistant/draft-status?conversationId=${encodeURIComponent(conversationId)}`,
        { headers: {} }
      );
      if (!res.ok) {
        setStatus(null);
        return;
      }
      const data = await res.json();
      setStatus({
        hasDraft: data.hasDraft ?? false,
        draftProductId: data.draftProductId ?? null,
        status: data.status ?? null,
        imagesCount: Number(data.imagesCount) || 0,
        ready: Boolean(data.ready),
        missing: Array.isArray(data.missing) ? data.missing : [],
      });
    } catch {
      setStatus(null);
    } finally {
      setLoading(false);
    }
  }, [conversationId, accessToken]);

  useEffect(() => {
    if (!conversationId || !accessToken) {
      setStatus(null);
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      debounceRef.current = null;
      fetchStatus();
    }, DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [conversationId, accessToken, refreshTrigger, fetchStatus]);

  const statusLabel =
    status?.status === "active"
      ? "Publicat"
      : status?.ready
        ? "Gata de publicare"
        : status?.hasDraft
          ? "Draft"
          : null;

  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
          Anunț curent
        </h3>
      </div>
      <div className="p-4 space-y-4">
        {!conversationId ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Alege sau creează o conversație pentru a vedea draftul.
          </p>
        ) : loading && !status ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">Se încarcă...</p>
        ) : !status?.hasDraft ? (
          <div className="text-sm text-gray-500 dark:text-gray-400">
            <p className="mb-2">Niciun draft în această conversație.</p>
            <p>Spune „Vreau să public un anunț” pentru a crea un draft.</p>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2">
              <span
                className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                  statusLabel === "Publicat"
                    ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300"
                    : statusLabel === "Gata de publicare"
                      ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300"
                      : "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300"
                }`}
              >
                {statusLabel}
              </span>
            </div>

            {status.missing.length > 0 && (
              <div>
                <p className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">
                  Câmpuri de completat:
                </p>
                <ul className="text-xs text-gray-600 dark:text-gray-400 space-y-0.5">
                  {status.missing.map((key) => (
                    <li key={key}>• {FIELD_LABELS[key] ?? key}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="space-y-2">
              <button
                type="button"
                onClick={onScrollToInput}
                className="w-full px-3 py-2 text-sm font-medium rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
              >
                Completează
              </button>
              {status.status !== "active" && (
                <button
                  type="button"
                  onClick={onPublish}
                  disabled={!status.ready}
                  className="w-full px-3 py-2 text-sm font-medium rounded-lg bg-green-600 text-white hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  Publică
                </button>
              )}
              <button
                type="button"
                onClick={() => onOpenMyProducts(status.draftProductId)}
                className="w-full px-3 py-2 text-sm font-medium rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                Deschide în Anunțurile mele
              </button>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-gray-600 dark:text-gray-400">
                  Poze ({status.imagesCount})
                </span>
                <button
                  type="button"
                  onClick={onAddPhotosClick}
                  disabled={uploading}
                  className="text-xs font-medium text-green-600 dark:text-green-400 hover:underline disabled:opacity-50"
                >
                  {uploading ? "Se încarcă…" : "Adaugă poze"}
                </button>
              </div>
              {attachedThumbnails.length > 0 || status.imagesCount > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {attachedThumbnails.map((url, idx) => (
                    <a
                      key={`${url}-${idx}`}
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block w-10 h-10 rounded border border-gray-200 dark:border-gray-600 overflow-hidden bg-gray-100 dark:bg-gray-700 shrink-0"
                    >
                      <img
                        src={url}
                        alt=""
                        className="w-full h-full object-cover"
                      />
                    </a>
                  ))}
                  {attachedThumbnails.length === 0 && status.imagesCount > 0 && (
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      {status.imagesCount} poză(e) atașate
                    </span>
                  )}
                </div>
              ) : (
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Nicio poză. Apasă „Adaugă poze” pentru a încărca.
                </p>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
