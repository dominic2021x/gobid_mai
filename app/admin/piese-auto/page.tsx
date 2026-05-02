"use client";

/**
 * Panou Admin – Piese auto: validare support + import CSV în contul dealerului.
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import supabase from "@/lib/supabase";
import { refreshSessionSingleFlight } from "@/lib/auth/getSupabaseSessionRobust";
import {
  parsePieseAutoCsvToProducts,
} from "@/lib/piese-auto/parse-piese-auto-csv";
import type { PieseAutoImportInputRow } from "@/lib/piese-auto/import-products-core";
import {
  ADMIN_IMPORT_ROWS_NORMAL,
  ADMIN_IMPORT_ROWS_TURBO,
} from "@/lib/piese-auto/admin-import-limits";

type LoadedUser = {
  userId: string;
  email: string | null;
  fullName: string | null;
  firstName: string | null;
  lastName: string | null;
  accountTypeMetadata: string | null;
  accountTypeProfile: string | null;
  isPieseAuto: boolean;
  csvImportApproved: boolean;
};

type QueueItem = {
  id: string;
  row: PieseAutoImportInputRow;
  sourceIndex: number;
};

type CreatedListing = {
  id: string;
  title: string;
  status?: string | null;
  url?: string | null;
  slug?: string | null;
};

type QueueRowStatus = "pending" | "processing" | "created" | "duplicate" | "error" | "deleted";

type QueueRowMeta = {
  status: QueueRowStatus;
  error?: string;
  product?: CreatedListing;
  /** Durata cererii API pentru lotul curent (același pentru toate rândurile din acel lot). */
  stepDurationMs?: number;
};

function formatDurationMs(ms: number): string {
  if (ms < 1000) return `${ms} ms`;
  const s = ms / 1000;
  if (s < 60) return `${s < 10 ? s.toFixed(1) : Math.round(s)} s`;
  const m = Math.floor(s / 60);
  const sec = Math.round(s % 60);
  return `${m} min ${sec} s`;
}

function Spinner({ className }: { className?: string }) {
  return (
    <svg
      className={`inline-block h-4 w-4 shrink-0 animate-spin text-blue-600 ${className ?? ""}`}
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      aria-hidden
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  );
}

export default function AdminPieseAutoPage() {
  const [userIdInput, setUserIdInput] = useState("");
  const [loaded, setLoaded] = useState<LoadedUser | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadingUser, setLoadingUser] = useState(false);

  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [forceDuplicate, setForceDuplicate] = useState(false);
  /** Fără GPT / fără drain sincron imagini / fără re-scrape URL — recomandat pentru volume mari. */
  const [fastImport, setFastImport] = useState(true);
  /**
   * Mod turbo: forțează import rapid + loturi mari (aliniat la server import-rows).
   * Țintă: până la ~1000 rânduri/min în condiții bune; depinde de Supabase / rețea.
   */
  const [turboMode, setTurboMode] = useState(false);
  const [importing, setImporting] = useState(false);
  const [approvalLoading, setApprovalLoading] = useState(false);
  const [queueItems, setQueueItems] = useState<QueueItem[]>([]);
  /** Status + produs per rând din coadă (listă completă, live). */
  const [queueRowState, setQueueRowState] = useState<Record<string, QueueRowMeta>>({});
  /** Rânduri cu eroare bifate pentru retry. */
  const [errorRowSelected, setErrorRowSelected] = useState<Record<string, boolean>>({});
  const [activeProcessingId, setActiveProcessingId] = useState<string | null>(null);
  const rowElRefs = useRef<Record<string, HTMLTableRowElement | null>>({});
  const [processedCount, setProcessedCount] = useState(0);
  const [createdCountLive, setCreatedCountLive] = useState(0);
  const [failedCountLive, setFailedCountLive] = useState(0);
  const [skippedCountLive, setSkippedCountLive] = useState(0);
  const [currentRowLabel, setCurrentRowLabel] = useState<string | null>(null);
  /** Durata totală a ultimului import controlat (Start → stop/final). */
  const [lastImportTotalMs, setLastImportTotalMs] = useState<number | null>(null);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [isRunningControlled, setIsRunningControlled] = useState(false);
  const [isPausedControlled, setIsPausedControlled] = useState(false);
  const [stopRequested, setStopRequested] = useState(false);
  const pauseRef = useRef(false);
  const stopRef = useRef(false);
  /** Citite la fiecare iterație — reflectă Turbo bifat chiar dacă îl schimbi în timpul importului (ex. la Pauză). */
  const turboModeRef = useRef(turboMode);
  const fastImportRef = useRef(fastImport);
  turboModeRef.current = turboMode;
  fastImportRef.current = fastImport;

  const [message, setMessage] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  useEffect(() => {
    pauseRef.current = isPausedControlled;
  }, [isPausedControlled]);

  useEffect(() => {
    stopRef.current = stopRequested;
  }, [stopRequested]);

  useEffect(() => {
    if (turboMode) setFastImport(true);
  }, [turboMode]);

  useEffect(() => {
    if (!activeProcessingId) return;
    const t = window.setTimeout(() => {
      rowElRefs.current[activeProcessingId]?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }, 40);
    return () => window.clearTimeout(t);
  }, [activeProcessingId]);

  const getToken = useCallback(async (): Promise<string | null> => {
    let { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData?.session) {
      const s = await refreshSessionSingleFlight(supabase);
      if (s) sessionData = { session: s };
    }
    return sessionData?.session?.access_token ?? null;
  }, []);

  const loadUser = useCallback(async () => {
    const id = userIdInput.trim();
    if (!id) {
      setLoadError("Introdu UUID-ul utilizatorului.");
      setLoaded(null);
      return;
    }
    setLoadingUser(true);
    setLoadError(null);
    setMessage(null);
    try {
      const token = await getToken();
      if (!token) {
        setLoadError("Nu ești autentificat în admin.");
        setLoaded(null);
        return;
      }
      const res = await fetch(`/api/admin/piese-auto/user?userId=${encodeURIComponent(id)}`, {
        cache: "no-store",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setLoadError(typeof data.error === "string" ? data.error : "Eroare la încărcare.");
        setLoaded(null);
        return;
      }
      setLoaded(data as LoadedUser);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Eroare rețea.");
      setLoaded(null);
    } finally {
      setLoadingUser(false);
    }
  }, [userIdInput, getToken]);

  const setApproval = useCallback(
    async (approved: boolean) => {
      if (!loaded?.userId) return;
      setApprovalLoading(true);
      setMessage(null);
      try {
        const token = await getToken();
        if (!token) {
          setMessage({ type: "err", text: "Nu ești autentificat." });
          return;
        }
        const res = await fetch("/api/admin/piese-auto/user-approval", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ userId: loaded.userId, approved }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setMessage({
            type: "err",
            text: typeof data.error === "string" ? data.error : "Nu s-a putut salva aprobarea.",
          });
          return;
        }
        setLoaded((prev) => (prev ? { ...prev, csvImportApproved: approved } : prev));
        setMessage({
          type: "ok",
          text: approved
            ? "Cont marcat ca validat pentru import CSV."
            : "Aprobarea pentru import CSV a fost retrasă.",
        });
      } catch (e) {
        setMessage({ type: "err", text: e instanceof Error ? e.message : "Eroare." });
      } finally {
        setApprovalLoading(false);
      }
    },
    [loaded, getToken]
  );

  const runImport = useCallback(async () => {
    if (!loaded?.userId) {
      setMessage({ type: "err", text: "Încarcă mai întâi utilizatorul." });
      return;
    }
    if (!loaded.isPieseAuto) {
      setMessage({ type: "err", text: "Utilizatorul nu este cont piese auto." });
      return;
    }
    if (!loaded.csvImportApproved) {
      setMessage({
        type: "err",
        text: "Marchează mai întâi contul ca validat de support (aprobare import CSV).",
      });
      return;
    }
    if (!csvFile) {
      setMessage({ type: "err", text: "Selectează un fișier CSV." });
      return;
    }
    const oneShotMaxRows = turboMode ? ADMIN_IMPORT_ROWS_TURBO : ADMIN_IMPORT_ROWS_NORMAL;
    setImporting(true);
    setMessage(null);
    try {
      const csvText = await csvFile.text();
      const rows = parsePieseAutoCsvToProducts(csvText);
      if (rows.length > oneShotMaxRows) {
        setMessage({
          type: "err",
          text:
            `Importul direct acceptă maxim ${oneShotMaxRows} rânduri. ` +
            `Fișierul are ${rows.length} rânduri; folosește „Pregătește coada live” + „Start / Reia” pentru import sigur pe loturi.`,
        });
        return;
      }

      const token = await getToken();
      if (!token) {
        setMessage({ type: "err", text: "Nu ești autentificat." });
        return;
      }
      const formData = new FormData();
      formData.append("file", csvFile);
      formData.append("targetUserId", loaded.userId);
      if (forceDuplicate) formData.append("forceDuplicate", "true");
      if (turboMode) {
        formData.append("turbo", "true");
        formData.append("fastImport", "true");
      } else if (fastImport) {
        formData.append("fastImport", "true");
      }

      const res = await fetch("/api/admin/piese-auto/import-csv", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage({
          type: "err",
          text: typeof data.error === "string" ? data.error : `Eroare HTTP ${res.status}`,
        });
        return;
      }
      const msg =
        typeof data.message === "string"
          ? data.message
          : `Create: ${data.createdCount ?? 0}, erori: ${data.failedCount ?? 0}`;
      setMessage({ type: "ok", text: msg });
      setCsvFile(null);
    } catch (e) {
      setMessage({ type: "err", text: e instanceof Error ? e.message : "Eroare la import." });
    } finally {
      setImporting(false);
    }
  }, [loaded, csvFile, forceDuplicate, fastImport, turboMode, getToken]);

  const parseCsvToQueue = useCallback(async () => {
    if (!csvFile) {
      setMessage({ type: "err", text: "Selectează un fișier CSV." });
      return;
    }
    const csvText = await csvFile.text();
    const rows = parsePieseAutoCsvToProducts(csvText);
    const prepared: QueueItem[] = rows.map((row, idx) => ({
      id: `${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 8)}`,
      row,
      sourceIndex: idx + 1,
    }));
    setQueueItems(prepared);
    const initRow: Record<string, QueueRowMeta> = {};
    prepared.forEach((p) => {
      initRow[p.id] = { status: "pending" };
    });
    setQueueRowState(initRow);
    setErrorRowSelected({});
    setActiveProcessingId(null);
    setProcessedCount(0);
    setCreatedCountLive(0);
    setFailedCountLive(0);
    setSkippedCountLive(0);
    setCurrentRowLabel(null);
    setStopRequested(false);
    stopRef.current = false;
    setIsPausedControlled(false);
    pauseRef.current = false;
    setMessage({
      type: "ok",
      text: `CSV pregătit pentru import controlat: ${prepared.length} rânduri.`,
    });
  }, [csvFile]);

  const runControlledImport = useCallback(async () => {
    if (!loaded?.userId) {
      setMessage({ type: "err", text: "Încarcă mai întâi utilizatorul." });
      return;
    }
    if (queueItems.length === 0) {
      setMessage({ type: "err", text: "Nu există rânduri în coadă. Apasă „Pregătește coada live”." });
      return;
    }
    const token = await getToken();
    if (!token) {
      setMessage({ type: "err", text: "Nu ești autentificat." });
      return;
    }

    setIsRunningControlled(true);
    setStopRequested(false);
    stopRef.current = false;
    setMessage(null);
    setLastImportTotalMs(null);
    const runStartedAt = performance.now();

    let localProcessed = processedCount;
    let localCreated = createdCountLive;
    let localFailed = failedCountLive;
    let localSkipped = skippedCountLive;
    const currentQueue = [...queueItems];

    while (localProcessed < currentQueue.length) {
      if (stopRef.current) break;
      if (pauseRef.current) {
        await new Promise((resolve) => setTimeout(resolve, 200));
        continue;
      }

      const useTurbo = turboModeRef.current;
      const batchMax = useTurbo ? ADMIN_IMPORT_ROWS_TURBO : ADMIN_IMPORT_ROWS_NORMAL;
      const BATCH = batchMax;
      const batch = currentQueue.slice(localProcessed, localProcessed + BATCH);
      const batchEnd = localProcessed + batch.length;
      const modeLabel = useTurbo
        ? `turbo · lot max ${ADMIN_IMPORT_ROWS_TURBO}`
        : fastImportRef.current
          ? `rapid · lot max ${ADMIN_IMPORT_ROWS_NORMAL}`
          : `complet · lot max ${ADMIN_IMPORT_ROWS_NORMAL}`;
      setCurrentRowLabel(
        `Lot: rânduri ${localProcessed + 1}–${batchEnd} din ${currentQueue.length} (${modeLabel})`
      );

      setActiveProcessingId(batch[0]?.id ?? null);
      setQueueRowState((prev) => {
        const next = { ...prev };
        for (const b of batch) next[b.id] = { status: "processing" };
        return next;
      });

      const batchStartedAt = performance.now();
      try {
        const res = await fetch("/api/admin/piese-auto/import-rows", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            targetUserId: loaded.userId,
            forceDuplicate,
            fastImport: useTurbo ? true : fastImportRef.current,
            turbo: useTurbo,
            items: batch.map((b) => ({ clientId: b.id, row: b.row })),
          }),
        });

        const data = await res.json().catch(() => ({}));
        const batchDurationMs = Math.round(performance.now() - batchStartedAt);
        setCurrentRowLabel(
          `Lot: rânduri ${localProcessed + 1}–${batchEnd} din ${currentQueue.length} (${modeLabel}) · ${formatDurationMs(batchDurationMs)}`
        );

        if (!res.ok) {
          const errText =
            typeof data?.error === "string" ? data.error : `HTTP ${res.status}`;
          for (const b of batch) {
            localFailed += 1;
            setQueueRowState((prev) => ({
              ...prev,
              [b.id]: { status: "error", error: errText, stepDurationMs: batchDurationMs },
            }));
            setErrorRowSelected((prev) => ({ ...prev, [b.id]: true }));
          }
        } else {
          type RowRes = {
            clientId: string;
            status: string;
            product?: CreatedListing & { id: string };
            error?: string;
          };
          const rowResults = Array.isArray(data?.rowResults) ? (data.rowResults as RowRes[]) : [];
          const byClient = new Map(rowResults.map((r) => [r.clientId, r]));

          for (const b of batch) {
            const r = byClient.get(b.id);
            if (!r) {
              localFailed += 1;
              setQueueRowState((prev) => ({
                ...prev,
                [b.id]: {
                  status: "error",
                  error: "Lipsește rezultatul pentru acest rând.",
                  stepDurationMs: batchDurationMs,
                },
              }));
              setErrorRowSelected((prev) => ({ ...prev, [b.id]: true }));
              continue;
            }
            if (r.status === "created" && r.product?.id) {
              localCreated += 1;
              const product: CreatedListing = {
                id: r.product.id,
                title: r.product.title || b.row.title || "Anunț nou",
                status: r.product.status,
                slug: r.product.slug,
                url: r.product.url,
              };
              setQueueRowState((prev) => ({
                ...prev,
                [b.id]: { status: "created", product, stepDurationMs: batchDurationMs },
              }));
            } else if (r.status === "duplicate") {
              localSkipped += 1;
              setQueueRowState((prev) => ({
                ...prev,
                [b.id]: { status: "duplicate", stepDurationMs: batchDurationMs },
              }));
            } else {
              localFailed += 1;
              const errText =
                typeof r.error === "string" ? r.error : "Eroare la import rând.";
              setQueueRowState((prev) => ({
                ...prev,
                [b.id]: { status: "error", error: errText, stepDurationMs: batchDurationMs },
              }));
              setErrorRowSelected((prev) => ({ ...prev, [b.id]: true }));
            }
          }
        }
      } catch (e) {
        const batchDurationMs = Math.round(performance.now() - batchStartedAt);
        setCurrentRowLabel(
          `Lot: rânduri ${localProcessed + 1}–${batchEnd} din ${currentQueue.length} (${modeLabel}) · ${formatDurationMs(batchDurationMs)} · eroare`
        );
        const errText = e instanceof Error ? e.message : "Eroare rețea";
        for (const b of batch) {
          localFailed += 1;
          setQueueRowState((prev) => ({
            ...prev,
            [b.id]: { status: "error", error: errText, stepDurationMs: batchDurationMs },
          }));
          setErrorRowSelected((prev) => ({ ...prev, [b.id]: true }));
        }
      }

      setActiveProcessingId(null);

      localProcessed = batchEnd;
      setProcessedCount(localProcessed);
      setCreatedCountLive(localCreated);
      setFailedCountLive(localFailed);
      setSkippedCountLive(localSkipped);
    }

    setQueueRowState((prev) => {
      const next = { ...prev };
      let dirty = false;
      for (const q of currentQueue) {
        if (next[q.id]?.status === "processing") {
          next[q.id] = { status: "pending" };
          dirty = true;
        }
      }
      return dirty ? next : prev;
    });

    setCurrentRowLabel(null);
    setActiveProcessingId(null);
    setIsRunningControlled(false);
    setIsPausedControlled(false);
    const remaining = Math.max(0, currentQueue.length - localProcessed);
    const totalMs = Math.round(performance.now() - runStartedAt);
    setLastImportTotalMs(totalMs);
    const totalFmt = formatDurationMs(totalMs);
    setMessage({
      type: "ok",
      text:
        remaining > 0
          ? `Import oprit/pauzat. Procesate: ${localProcessed}, rămase: ${remaining}. Durată sesiune: ${totalFmt}.`
          : `Import finalizat. Create: ${localCreated}, duplicate: ${localSkipped}, erori: ${localFailed}. Durată totală: ${totalFmt}.`,
    });
  }, [
    loaded,
    queueItems,
    getToken,
    forceDuplicate,
    processedCount,
    createdCountLive,
    failedCountLive,
    skippedCountLive,
  ]);

  const retrySelectedErrors = useCallback(() => {
    const retryQueue = queueItems.filter(
      (q) => queueRowState[q.id]?.status === "error" && errorRowSelected[q.id]
    );
    if (retryQueue.length === 0) {
      setMessage({ type: "err", text: "Bifează erorile de reluat." });
      return;
    }
    const nextState: Record<string, QueueRowMeta> = {};
    retryQueue.forEach((q) => {
      nextState[q.id] = { status: "pending" };
    });
    setQueueRowState(nextState);
    setQueueItems(retryQueue);
    setErrorRowSelected({});
    setProcessedCount(0);
    setCreatedCountLive(0);
    setFailedCountLive(0);
    setSkippedCountLive(0);
    setCurrentRowLabel(null);
    setStopRequested(false);
    stopRef.current = false;
    setIsPausedControlled(false);
    pauseRef.current = false;
    setMessage({ type: "ok", text: `Retry: ${retryQueue.length} rânduri.` });
  }, [queueItems, queueRowState, errorRowSelected]);

  const toggleErrorRowSelected = useCallback((id: string) => {
    setErrorRowSelected((prev) => ({ ...prev, [id]: !prev[id] }));
  }, []);

  const createdProductPairs = queueItems.flatMap((q) => {
    const m = queueRowState[q.id];
    if (m?.status === "created" && m.product?.id) {
      return [{ queueId: q.id, productId: m.product.id }];
    }
    return [];
  });

  const deleteAllCreatedListings = useCallback(async () => {
    const pairs = queueItems.flatMap((q) => {
      const m = queueRowState[q.id];
      if (m?.status === "created" && m.product?.id) {
        return [{ queueId: q.id, productId: m.product.id }];
      }
      return [];
    });
    if (pairs.length === 0) {
      setMessage({ type: "err", text: "Nu există anunțuri „create” de șters în coadă." });
      return;
    }
    if (
      !window.confirm(
        `Ștergi ${pairs.length} anunț(uri) din baza de date? Operația e ireversibilă (soft delete).`
      )
    ) {
      return;
    }
    const token = await getToken();
    if (!token) {
      setMessage({ type: "err", text: "Nu ești autentificat." });
      return;
    }
    setBulkDeleting(true);
    try {
      const res = await fetch("/api/admin/products/delete", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          productIds: pairs.map((p) => p.productId),
        }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage({
          type: "err",
          text: typeof payload?.error === "string" ? payload.error : "Ștergerea în masă a eșuat.",
        });
        return;
      }
      const n = typeof payload?.deletedCount === "number" ? payload.deletedCount : pairs.length;
      setQueueRowState((prev) => {
        const next = { ...prev };
        for (const p of pairs) {
          next[p.queueId] = { status: "deleted" };
        }
        return next;
      });
      setCreatedCountLive((c) => Math.max(0, c - n));
      setMessage({
        type: "ok",
        text: `Șterse ${n} anunț(uri) din baza de date; rândurile din coadă sunt marcate „Șters”.`,
      });
    } finally {
      setBulkDeleting(false);
    }
  }, [queueItems, queueRowState, getToken]);

  const deleteCreatedListing = useCallback(
    async (queueItemId: string, productId: string) => {
      const token = await getToken();
      if (!token) {
        setMessage({ type: "err", text: "Nu ești autentificat." });
        return;
      }
      const res = await fetch("/api/admin/products/delete", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ productIds: [productId] }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage({
          type: "err",
          text: typeof payload?.error === "string" ? payload.error : "Nu am putut șterge anunțul.",
        });
        return;
      }
      setQueueRowState((prev) => ({
        ...prev,
        [queueItemId]: { status: "deleted" },
      }));
      setMessage({ type: "ok", text: "Anunțul a fost șters (soft delete)." });
    },
    [getToken]
  );

  const selectedRetryableCount = queueItems.filter(
    (q) => queueRowState[q.id]?.status === "error" && errorRowSelected[q.id]
  ).length;

  return (
    <div
      className="min-h-[calc(100vh-3rem)] w-full bg-gray-50 px-4 py-6 text-gray-900 [color-scheme:light] sm:px-6 lg:px-8 lg:py-8"
      data-theme="light"
    >
      <div className="mx-auto w-full max-w-[1920px] space-y-6 lg:space-y-8">
        <div>
          <Link
            href="/admin/importuri"
            className="text-sm font-medium text-blue-600 hover:text-blue-500"
          >
            ← Înapoi la Importuri
          </Link>
          <h1 className="mt-4 text-3xl font-bold text-gray-900">
            Piese auto – import CSV (admin)
          </h1>
          <p className="mt-2 text-sm text-gray-600">
            CSV în contul dealerului validat — anunțuri active.
          </p>
        </div>

        <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-12 xl:gap-8">
          <div className="space-y-6 xl:sticky xl:top-4 xl:col-span-5 xl:self-start">
        <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-900">1. Identifică utilizatorul</h2>
          <p className="mt-1 text-xs text-gray-500">UUID utilizator (auth.users).</p>
          <div className="mt-4 flex flex-col gap-3 sm:flex-row">
            <input
              type="text"
              value={userIdInput}
              onChange={(e) => setUserIdInput(e.target.value)}
              placeholder="User ID (UUID)"
              className="flex-1 rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-gray-900 shadow-sm focus:border-blue-500 focus:ring-blue-500"
            />
            <button
              type="button"
              onClick={() => void loadUser()}
              disabled={loadingUser}
              className="rounded-xl bg-blue-600 px-6 py-2.5 font-semibold text-white shadow hover:bg-blue-500 disabled:opacity-50"
            >
              {loadingUser ? "Se încarcă…" : "Încarcă utilizator"}
            </button>
          </div>
          {loadError && (
            <p className="mt-3 text-sm text-red-600" role="alert">
              {loadError}
            </p>
          )}

          {loaded && (
            <dl className="mt-6 grid gap-3 rounded-xl bg-gray-50 p-4 text-sm">
              <div className="flex flex-wrap justify-between gap-2">
                <dt className="text-gray-500">Email</dt>
                <dd className="font-medium text-gray-900">{loaded.email ?? "—"}</dd>
              </div>
              <div className="flex flex-wrap justify-between gap-2">
                <dt className="text-gray-500">Nume</dt>
                <dd className="font-medium text-gray-900">
                  {loaded.fullName ||
                    [loaded.firstName, loaded.lastName].filter(Boolean).join(" ") ||
                    "—"}
                </dd>
              </div>
              <div className="flex flex-wrap justify-between gap-2">
                <dt className="text-gray-500">Tip cont (metadata / profil)</dt>
                <dd className="font-medium text-gray-900">
                  {loaded.accountTypeMetadata ?? "—"} / {loaded.accountTypeProfile ?? "—"}
                </dd>
              </div>
              <div className="flex flex-wrap justify-between gap-2">
                <dt className="text-gray-500">Dealer piese auto</dt>
                <dd className="font-medium">
                  {loaded.isPieseAuto ? (
                    <span className="text-emerald-600">Da</span>
                  ) : (
                    <span className="text-amber-600">Nu</span>
                  )}
                </dd>
              </div>
              <div className="flex flex-wrap justify-between gap-2">
                <dt className="text-gray-500">Validat pentru import CSV</dt>
                <dd className="font-medium">
                  {loaded.csvImportApproved ? (
                    <span className="text-emerald-600">Da</span>
                  ) : (
                    <span className="text-gray-600">Nu</span>
                  )}
                </dd>
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={!loaded.isPieseAuto || approvalLoading}
                  onClick={() => void setApproval(true)}
                  className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Marchează validat (support)
                </button>
                <button
                  type="button"
                  disabled={!loaded.isPieseAuto || approvalLoading || !loaded.csvImportApproved}
                  onClick={() => void setApproval(false)}
                  className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Retrage aprobarea
                </button>
              </div>
            </dl>
          )}
        </section>

        <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-900">2. Import CSV în contul utilizatorului</h2>
          <p className="mt-1 text-xs text-gray-500">
            <code className="rounded bg-gray-100 px-1">titlu</code>,{" "}
            <code className="rounded bg-gray-100 px-1">url</code>,{" "}
            <code className="rounded bg-gray-100 px-1">pret</code>,{" "}
            <code className="rounded bg-gray-100 px-1">descriere</code>,{" "}
            <code className="rounded bg-gray-100 px-1">id_extern</code>,{" "}
            <code className="rounded bg-gray-100 px-1">imagini</code>
            <span className="text-gray-400"> · </span>
            URL pieseauto / olx → completare automată.
          </p>

          <div className="mt-4 space-y-4">
            <input
              type="file"
              accept=".csv,text/csv"
              onChange={(e) => setCsvFile(e.target.files?.[0] ?? null)}
              className="block w-full text-sm text-gray-600 file:mr-4 file:rounded-lg file:border-0 file:bg-blue-50 file:px-4 file:py-2 file:font-semibold file:text-blue-700 hover:file:bg-blue-100"
            />

            <div
              className={`rounded-xl border-2 px-4 py-3 ${
                turboMode
                  ? "border-amber-400 bg-amber-50 shadow-sm"
                  : "border-gray-200 bg-gray-50"
              }`}
            >
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-semibold text-gray-900">Mod turbo</p>
                  <p className="mt-1 text-xs text-gray-600">
                    Fără GPT și fără re-scrape URL. Imaginile din CSV sunt încărcate{" "}
                    <strong>direct în R2</strong> (fetch paralel mare, nu coadă image_jobs + drain),
                    apoi produsul se salvează <strong>doar</strong> cu URL-uri proprii. Lot până la{" "}
                    <strong>{ADMIN_IMPORT_ROWS_TURBO}</strong> rânduri / cerere — pentru zeci de mii
                    de rânduri rulează „Start” repetat; fiecare lot e cât poate de paralel pe server.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setTurboMode((v) => !v)}
                  className={`shrink-0 rounded-xl px-5 py-2.5 text-sm font-bold shadow transition ${
                    turboMode
                      ? "bg-amber-500 text-white ring-2 ring-amber-300 ring-offset-2 hover:bg-amber-600"
                      : "border border-gray-300 bg-white text-gray-800 hover:bg-gray-100"
                  }`}
                  aria-pressed={turboMode}
                >
                  <span className="mr-1.5" aria-hidden>
                    ⚡
                  </span>
                  {turboMode ? "Turbo ACTIV" : "Activează turbo"}
                </button>
              </div>
            </div>

            <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={forceDuplicate}
                onChange={(e) => setForceDuplicate(e.target.checked)}
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              Forțează duplicate
            </label>

            <label className="flex cursor-pointer items-start gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={turboMode || fastImport}
                disabled={turboMode}
                onChange={(e) => {
                  if (!turboMode) setFastImport(e.target.checked);
                }}
                className="mt-0.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500 disabled:opacity-60"
              />
              <span>
                Import rapid: fără GPT și fără re-scrape URL. În modul turbo rămâne activ.
                Pentru fișiere mari folosește importul live pe loturi; importul direct e limitat
                la {turboMode ? ADMIN_IMPORT_ROWS_TURBO : ADMIN_IMPORT_ROWS_NORMAL} rânduri.
                {turboMode ? (
                  <span className="mt-1 block text-xs font-semibold text-amber-800">
                    Mod turbo îl păstrează mereu activ.
                  </span>
                ) : null}
              </span>
            </label>

            <button
              type="button"
              onClick={() => void runImport()}
              disabled={
                importing ||
                !loaded?.userId ||
                !loaded.csvImportApproved ||
                !loaded.isPieseAuto
              }
              className="w-full rounded-xl bg-blue-600 py-3 font-semibold text-white shadow hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto sm:px-8"
            >
              {importing ? "Se importă…" : "Import direct lot mic"}
            </button>
            <p className="text-xs text-gray-500">
              Pentru importuri mari folosește fluxul de mai jos: „Pregătește coada live” și apoi
              „Start / Reia”. Așa fiecare cerere are lot controlat și nu ține baza de date ocupată
              într-o singură operație lungă.
            </p>

            <div className="rounded-xl border border-blue-100 bg-blue-50 p-4">
              <h3 className="text-sm font-semibold text-blue-900">Import live</h3>
              <p className="mt-1 text-xs text-blue-800">
                Normal: max <strong>{ADMIN_IMPORT_ROWS_NORMAL}</strong> / cerere · Turbo: max{" "}
                <strong>{ADMIN_IMPORT_ROWS_TURBO}</strong>. Pentru lot mare, pornește{" "}
                <strong>Turbo ACTIV</strong> înainte de primul Start (sau activează-l la Pauză — se
                aplică de la următorul lot). Pauză / stop / retry erori.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void parseCsvToQueue()}
                  className="rounded-lg border border-blue-300 bg-white px-3 py-2 text-xs font-semibold text-blue-700 hover:bg-blue-100"
                >
                  Pregătește coada live
                </button>
                <button
                  type="button"
                  onClick={() => void runControlledImport()}
                  disabled={isRunningControlled || queueItems.length === 0}
                  className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-500 disabled:opacity-50"
                >
                  Start / Reia
                </button>
                <button
                  type="button"
                  onClick={() => setIsPausedControlled((v) => !v)}
                  disabled={!isRunningControlled}
                  className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                >
                  {isPausedControlled ? "Continuă" : "Pauză"}
                </button>
                <button
                  type="button"
                  onClick={() => setStopRequested(true)}
                  disabled={!isRunningControlled}
                  className="rounded-lg bg-red-600 px-3 py-2 text-xs font-semibold text-white hover:bg-red-500 disabled:opacity-50"
                >
                  Stop
                </button>
                <button
                  type="button"
                  onClick={retrySelectedErrors}
                  disabled={selectedRetryableCount === 0}
                  className="rounded-lg bg-amber-600 px-3 py-2 text-xs font-semibold text-white hover:bg-amber-500 disabled:opacity-50"
                >
                  Recreează erorile selectate
                </button>
                <button
                  type="button"
                  onClick={() => void deleteAllCreatedListings()}
                  disabled={bulkDeleting || createdProductPairs.length === 0 || isRunningControlled}
                  className="rounded-lg bg-red-700 px-3 py-2 text-xs font-semibold text-white hover:bg-red-600 disabled:opacity-50"
                  title="Șterge din DB toate anunțurile marcate „Creat” în coada curentă"
                >
                  {bulkDeleting ? "Șterg…" : `Șterge toate create (${createdProductPairs.length})`}
                </button>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-2 text-xs sm:grid-cols-6">
                <div className="rounded-lg bg-white p-2"><span className="text-gray-500">Total</span><div className="font-bold">{queueItems.length}</div></div>
                <div className="rounded-lg bg-white p-2"><span className="text-gray-500">Procesate</span><div className="font-bold">{processedCount}</div></div>
                <div className="rounded-lg bg-white p-2"><span className="text-gray-500">Create</span><div className="font-bold text-emerald-700">{createdCountLive}</div></div>
                <div className="rounded-lg bg-white p-2"><span className="text-gray-500">Duplicate</span><div className="font-bold text-amber-700">{skippedCountLive}</div></div>
                <div className="rounded-lg bg-white p-2"><span className="text-gray-500">Erori</span><div className="font-bold text-red-700">{failedCountLive}</div></div>
                <div className="rounded-lg bg-white p-2">
                  <span className="text-gray-500">Durată ultimul import</span>
                  <div className="font-bold tabular-nums text-blue-800">
                    {lastImportTotalMs != null ? formatDurationMs(lastImportTotalMs) : "—"}
                  </div>
                </div>
              </div>

              {currentRowLabel ? (
                <p className="mt-3 text-xs text-gray-700">{currentRowLabel}</p>
              ) : null}
            </div>
          </div>
        </section>
          </div>

          <div
            className="flex min-h-0 flex-col xl:col-span-7 xl:min-h-[calc(100vh-5.5rem)]"
            aria-live="polite"
            aria-busy={isRunningControlled}
          >
            <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
              <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-gray-100 bg-gradient-to-r from-gray-50 to-slate-50 px-4 py-3 sm:px-5">
                <h2 className="text-lg font-semibold text-gray-900">Coadă live</h2>
                <span className="rounded-full bg-white px-2.5 py-0.5 text-xs font-semibold tabular-nums text-gray-700 shadow-sm ring-1 ring-gray-200/80">
                  {queueItems.length} rânduri
                </span>
              </div>
              <div className="min-h-0 flex-1 overflow-auto">
                {queueItems.length === 0 ? (
                  <p className="p-6 text-sm text-gray-500">
                    Pregătește CSV → „Pregătește coada live”.
                  </p>
                ) : (
                  <table className="w-full table-fixed border-collapse text-sm">
                    <thead className="sticky top-0 z-20 border-b border-gray-200 bg-gray-100 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-600">
                      <tr>
                        <th className="w-11 px-2 py-2.5 sm:px-3">#</th>
                        <th className="px-2 py-2.5 sm:px-3">Anunț</th>
                        <th className="w-[8.5rem] px-2 py-2.5 sm:px-3">Status</th>
                        <th className="w-[6.5rem] px-2 py-2.5 sm:px-3">Timp lot</th>
                        <th className="w-[11rem] px-2 py-2.5 sm:px-3">Acțiuni</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {queueItems.map((item) => {
                        const meta = queueRowState[item.id];
                        const status = meta?.status ?? "pending";
                        const isLiveRow = activeProcessingId === item.id && status === "processing";
                        const title = item.row.title || item.row.url || "—";
                        const product = meta?.product;
                        const viewUrl =
                          product?.url ||
                          (product?.slug ? `/live_bid/${product.slug}` : null);
                        const rowClass = [
                          "transition-[background-color,box-shadow] duration-300",
                          isLiveRow
                            ? "animate-pulse bg-gradient-to-r from-blue-100/95 via-white to-blue-100/95 shadow-[inset_0_0_0_1px_rgba(99,102,241,0.35)]"
                            : "",
                          status === "created"
                            ? "bg-emerald-50/90 shadow-[inset_3px_0_0_0_rgba(16,185,129,0.85)]"
                            : "",
                          status === "duplicate" ? "bg-amber-50/85" : "",
                          status === "error" ? "bg-red-50/85" : "",
                          status === "deleted" ? "opacity-55 saturate-50" : "",
                        ]
                          .filter(Boolean)
                          .join(" ");
                        return (
                          <tr
                            key={item.id}
                            ref={(el) => {
                              rowElRefs.current[item.id] = el;
                            }}
                            className={rowClass}
                          >
                            <td className="whitespace-nowrap px-2 py-2 align-middle font-mono text-[11px] text-gray-500 sm:px-3 sm:text-xs">
                              {item.sourceIndex}
                            </td>
                            <td className="min-w-0 px-2 py-2 align-middle sm:px-3">
                              <div className="truncate font-medium text-gray-900" title={title}>
                                {title}
                              </div>
                              {meta?.error ? (
                                <div
                                  className="mt-0.5 truncate text-[11px] text-red-600 sm:text-xs"
                                  title={meta.error}
                                >
                                  {meta.error}
                                </div>
                              ) : null}
                            </td>
                            <td className="whitespace-nowrap px-2 py-2 align-middle sm:px-3">
                              {status === "pending" && (
                                <span className="inline-flex items-center gap-1.5 text-[11px] text-gray-500 sm:text-xs">
                                  <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-gray-400" />
                                  Așteaptă
                                </span>
                              )}
                              {status === "processing" && (
                                <span className="inline-flex items-center gap-2 text-[11px] font-semibold text-blue-700 sm:text-xs">
                                  <Spinner />
                                  Live…
                                </span>
                              )}
                              {status === "created" && (
                                <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 sm:text-xs">
                                  <span className="text-emerald-600">✓</span> Creat
                                </span>
                              )}
                              {status === "duplicate" && (
                                <span className="text-[11px] font-semibold text-amber-900 sm:text-xs">
                                  Duplicat
                                </span>
                              )}
                              {status === "error" && (
                                <span className="text-[11px] font-semibold text-red-800 sm:text-xs">
                                  Eroare
                                </span>
                              )}
                              {status === "deleted" && (
                                <span className="text-[11px] text-gray-500 sm:text-xs">Șters</span>
                              )}
                            </td>
                            <td className="whitespace-nowrap px-2 py-2 align-middle font-mono text-[10px] tabular-nums text-gray-600 sm:px-3 sm:text-[11px]">
                              {typeof meta?.stepDurationMs === "number" ? (
                                <span title="Durata cererii API pentru întreg lotul din care face parte rândul">
                                  {formatDurationMs(meta.stepDurationMs)}
                                </span>
                              ) : (
                                "—"
                              )}
                            </td>
                            <td className="px-2 py-2 align-middle sm:px-3">
                              {status === "created" && product ? (
                                <div className="flex flex-wrap gap-1">
                                  {viewUrl ? (
                                    <a
                                      href={viewUrl}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="rounded border border-blue-300 bg-white px-1.5 py-0.5 text-[10px] font-semibold text-blue-700 hover:bg-blue-50 sm:text-xs"
                                    >
                                      View
                                    </a>
                                  ) : null}
                                  <Link
                                    href="/admin/products"
                                    className="rounded border border-gray-300 bg-white px-1.5 py-0.5 text-[10px] font-semibold text-gray-700 hover:bg-gray-50 sm:text-xs"
                                  >
                                    Edit
                                  </Link>
                                  <button
                                    type="button"
                                    onClick={() => void deleteCreatedListing(item.id, product.id)}
                                    className="rounded bg-red-600 px-1.5 py-0.5 text-[10px] font-semibold text-white hover:bg-red-500 sm:text-xs"
                                  >
                                    Del
                                  </button>
                                </div>
                              ) : null}
                              {status === "error" ? (
                                <label className="inline-flex cursor-pointer items-center gap-1.5 text-[10px] text-gray-700 sm:text-xs">
                                  <input
                                    type="checkbox"
                                    checked={Boolean(errorRowSelected[item.id])}
                                    onChange={() => toggleErrorRowSelected(item.id)}
                                    className="rounded border-gray-300 text-amber-600"
                                  />
                                  Retry
                                </label>
                              ) : null}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            </section>
          </div>
        </div>

        {message && (
          <div
            role="status"
            className={`rounded-xl border px-4 py-3 text-sm ${
              message.type === "ok"
                ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                : "border-red-200 bg-red-50 text-red-900"
            }`}
          >
            {message.text}
          </div>
        )}
      </div>
    </div>
  );
}
