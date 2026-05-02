"use client";

import { dashboardApiFetch } from "@/lib/dashboard-api-fetch";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import {
  getSupabaseAccessTokenRobust,
  refreshSessionSingleFlight,
} from "@/lib/auth/getSupabaseSessionRobust";
import { usePieseAutoTheme } from "../PieseAutoThemeContext";

function readTabFromBrowser(): string | null {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search).get("tab");
}

export function PieseAutoMyProductsClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tabParam = searchParams.get("tab");
  const { isDarkMode } = usePieseAutoTheme();
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [csvTermsAccepted, setCsvTermsAccepted] = useState(false);
  const [csvStatus, setCsvStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [csvMessage, setCsvMessage] = useState("");
  const [dropActive, setDropActive] = useState(false);
  const csvInputRef = useRef<HTMLInputElement>(null);
  /**
   * `useSearchParams()` poate întârzia un frame față de URL-ul real → fără asta, `tab=import`
   * părea absent, rulam `replace` la my-products și ștergeam Import CSV.
   */
  const showImportOnly = tabParam === "import" || readTabFromBrowser() === "import";

  /** Fără tab=import: mergi direct la lista de produse. Sursă de adevăr: URL real (nu doar hook-ul). */
  useLayoutEffect(() => {
    const tab = readTabFromBrowser() ?? searchParams.get("tab");
    if (tab === "import") return;
    router.replace("/dashboard/my-products?context=piese-auto");
  }, [router, searchParams]);

  useEffect(() => {
    const checkAuth = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.user) {
        const back =
          readTabFromBrowser() === "import"
            ? "/dashboard/piese-auto/my-products?tab=import"
            : "/dashboard/piese-auto/my-products";
        router.push("/auth?mode=login&redirect=" + encodeURIComponent(back));
        return;
      }
      const accountType = session.user.user_metadata?.account_type;
      if (accountType === "piese_auto" && typeof window !== "undefined") {
        try {
          localStorage.setItem("accountType", "piese_auto");
        } catch {
          /* ignore */
        }
      }
    };
    void checkAuth();
  }, [router]);

  const validateAndSetCsvFile = (file: File | null) => {
    if (!file) {
      setCsvFile(null);
      setCsvMessage("");
      return;
    }
    if (!file.name.toLowerCase().endsWith(".csv")) {
      setCsvMessage("Selectează un fișier CSV.");
      setCsvFile(null);
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      setCsvMessage("Fișierul depășește 8 MB.");
      setCsvFile(null);
      return;
    }
    setCsvFile(file);
    setCsvMessage("");
    setCsvStatus("idle");
  };

  const handleCsvFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    validateAndSetCsvFile(e.target.files?.[0] ?? null);
  };

  const handleCsvDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDropActive(false);
    const file = e.dataTransfer.files?.[0];
    validateAndSetCsvFile(file ?? null);
  };

  const handleSubmitCsvEmail = async () => {
    if (!csvFile) {
      setCsvMessage("Selectează un fișier CSV.");
      setCsvStatus("error");
      return;
    }
    if (!csvTermsAccepted) {
      setCsvMessage("Bifează acordul pentru ca echipa GoBid să îți poată importa anunțurile și pentru termenii legali.");
      setCsvStatus("error");
      return;
    }
    let accessToken = await getSupabaseAccessTokenRobust(supabase, 5000);
    if (!accessToken) {
      const ref = await refreshSessionSingleFlight(supabase);
      accessToken = ref?.access_token ?? null;
    }
    if (!accessToken) {
      setCsvMessage("Trebuie să fii autentificat.");
      setCsvStatus("error");
      return;
    }
    setCsvStatus("loading");
    setCsvMessage("");
    try {
      const formData = new FormData();
      formData.append("file", csvFile);
      formData.append("originalFilename", csvFile.name || "import.csv");
      formData.append("termsAccepted", "true");
      const res = await dashboardApiFetch("/api/piese-auto/submit-csv-email", {
        method: "POST",
        cache: "no-store",
        credentials: "include",
        body: formData,
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        message?: string;
        error?: string;
        resendId?: string;
      };
      if (!res.ok) {
        if (typeof window !== "undefined" && process.env.NODE_ENV === "development") {
          console.error("[CSV import] API", res.status, data);
        }
        setCsvMessage(data?.error ?? "Nu s-a putut trimite. Încearcă din nou.");
        setCsvStatus("error");
        return;
      }
      let okMsg = data.message ?? "Fișierul a fost trimis către support. Te vom contacta după procesare.";
      if (typeof window !== "undefined" && process.env.NODE_ENV === "development" && data.resendId) {
        okMsg += ` (Resend id: ${data.resendId})`;
      }
      setCsvMessage(okMsg);
      setCsvStatus("success");
      setCsvFile(null);
      setCsvTermsAccepted(false);
      if (csvInputRef.current) csvInputRef.current.value = "";
    } catch {
      setCsvMessage("A apărut o eroare la trimitere. Încearcă din nou.");
      setCsvStatus("error");
    }
  };

  if (!showImportOnly) {
    return (
      <div className={`rounded-xl p-6 ${isDarkMode ? "bg-gray-800/80 border border-gray-700" : "bg-white border border-gray-200"}`}>
        <p className={`text-sm ${isDarkMode ? "text-gray-300" : "text-gray-600"}`}>Se redirecționează la Produsele mele…</p>
        <Link
          href="/dashboard/my-products?context=piese-auto"
          className={`mt-3 inline-block text-sm font-medium ${isDarkMode ? "text-amber-400 hover:text-amber-300" : "text-amber-600 hover:text-amber-700"}`}
        >
          Mergi la Produsele mele
        </Link>
      </div>
    );
  }

  return (
    <>
      {/* Header */}
      <div className="relative mb-8 overflow-hidden rounded-2xl border border-transparent bg-gradient-to-br from-emerald-500/12 via-transparent to-amber-500/10 p-6 md:p-8 dark:from-emerald-500/15 dark:to-amber-500/8">
        <div
          className={`pointer-events-none absolute inset-0 opacity-40 ${
            isDarkMode
              ? "bg-[radial-gradient(ellipse_80%_50%_at_0%_-20%,rgba(16,185,129,0.25),transparent)]"
              : "bg-[radial-gradient(ellipse_80%_50%_at_0%_-20%,rgba(16,185,129,0.2),transparent)]"
          }`}
        />
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-4">
            <Link
              href="/dashboard/my-products?context=piese-auto"
              className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border transition-all ${
                isDarkMode
                  ? "border-gray-600 bg-gray-800/80 text-gray-200 hover:border-gray-500 hover:bg-gray-700"
                  : "border-gray-200 bg-white text-gray-700 shadow-sm hover:border-gray-300 hover:bg-gray-50"
              }`}
              aria-label="Înapoi la Produsele mele"
            >
              <i className="ri-arrow-left-line text-xl" />
            </Link>
            <div>
              <div className="mb-1 flex flex-wrap items-center gap-2">
                <span
                  className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide ${
                    isDarkMode ? "bg-emerald-500/20 text-emerald-300" : "bg-emerald-100 text-emerald-800"
                  }`}
                >
                  Dealer piese auto
                </span>
              </div>
              <h1
                className={`text-2xl font-bold tracking-tight md:text-3xl ${
                  isDarkMode ? "text-white" : "text-gray-900"
                }`}
              >
                Import catalog{" "}
                <span className="bg-gradient-to-r from-emerald-500 to-teal-500 bg-clip-text text-transparent dark:from-emerald-400 dark:to-teal-400">
                  CSV
                </span>
              </h1>
              <p className={`mt-2 max-w-xl text-sm leading-relaxed md:text-base ${isDarkMode ? "text-gray-400" : "text-gray-600"}`}>
                Încarcă fișierul — echipa GoBid îl verifică, îl procesează și publică anunțurile după validare (de obicei 1–3 zile
                lucrătoare).
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div
        className={`mb-8 inline-flex w-full max-w-xl rounded-2xl p-1.5 shadow-inner ${
          isDarkMode ? "bg-gray-800/90 ring-1 ring-gray-700/80" : "bg-gray-100/90 ring-1 ring-gray-200/80"
        }`}
      >
        <Link
          href="/dashboard/my-products?context=piese-auto"
          className={`flex flex-1 items-center justify-center gap-2 rounded-xl py-3 text-sm font-semibold transition-all ${
            isDarkMode ? "text-gray-400 hover:text-gray-200" : "text-gray-500 hover:text-gray-800"
          }`}
        >
          <i className="ri-layout-grid-line text-lg opacity-80" />
          Produsele mele
        </Link>
        <Link
          href="/dashboard/piese-auto/my-products?tab=import"
          className={`flex flex-1 items-center justify-center gap-2 rounded-xl py-3 text-sm font-semibold shadow-md transition-all ${
            isDarkMode
              ? "bg-gradient-to-b from-amber-500/35 to-amber-600/20 text-amber-100 ring-1 ring-amber-500/30"
              : "bg-white text-amber-900 shadow-gray-200/80 ring-1 ring-amber-200/80"
          }`}
        >
          <i className="ri-upload-cloud-2-line text-lg" />
          Import CSV
        </Link>
      </div>

      <div className="mx-auto max-w-xl">
        <section
          id="import-csv"
          className={`relative overflow-hidden rounded-2xl border shadow-xl shadow-black/5 backdrop-blur-sm dark:shadow-black/20 ${
            isDarkMode ? "border-gray-700/80 bg-gray-800/50" : "border-gray-200/80 bg-white/90"
          }`}
        >
          <div
            className={`border-b px-6 py-5 md:px-8 ${
              isDarkMode ? "border-gray-700/80 bg-gray-800/30" : "border-gray-100 bg-gray-50/50"
            }`}
          >
            <div className="flex items-center gap-3">
              <div
                className={`flex h-12 w-12 items-center justify-center rounded-2xl ${
                  isDarkMode ? "bg-emerald-500/20 text-emerald-400" : "bg-emerald-100 text-emerald-700"
                }`}
              >
                <i className="ri-file-upload-line text-2xl" />
              </div>
              <div>
                <h2 className={`text-lg font-semibold md:text-xl ${isDarkMode ? "text-white" : "text-gray-900"}`}>
                  Trimite fișierul pentru procesare
                </h2>
                <p className={`text-sm ${isDarkMode ? "text-gray-500" : "text-gray-500"}`}>
                  Format CSV · max. 8 MB · trimis securizat către support
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-6 px-6 py-6 md:px-8 md:py-8">
            <input
              ref={csvInputRef}
              id="csv-input"
              type="file"
              accept=".csv,text/csv"
              onChange={handleCsvFileChange}
              className="sr-only"
              aria-label="Selectează fișier CSV"
            />

            <button
              type="button"
              onClick={() => csvInputRef.current?.click()}
              onDragEnter={(e) => {
                e.preventDefault();
                setDropActive(true);
              }}
              onDragOver={(e) => {
                e.preventDefault();
                setDropActive(true);
              }}
              onDragLeave={(e) => {
                e.preventDefault();
                setDropActive(false);
              }}
              onDrop={handleCsvDrop}
              className={`group relative w-full rounded-2xl border-2 border-dashed px-6 py-10 text-center transition-all ${
                dropActive
                  ? isDarkMode
                    ? "border-emerald-400 bg-emerald-500/10"
                    : "border-emerald-500 bg-emerald-50/80"
                  : isDarkMode
                    ? "border-gray-600 bg-gray-900/20 hover:border-gray-500 hover:bg-gray-900/40"
                    : "border-gray-200 bg-gray-50/50 hover:border-emerald-300/80 hover:bg-white"
              }`}
            >
              <div
                className={`mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl transition-transform group-hover:scale-105 ${
                  isDarkMode ? "bg-gray-700 text-gray-300" : "bg-white text-emerald-600 shadow-sm ring-1 ring-gray-100"
                }`}
              >
                <i className="ri-file-excel-2-line text-3xl" />
              </div>
              <p className={`text-base font-medium ${isDarkMode ? "text-gray-200" : "text-gray-800"}`}>
                {csvFile ? csvFile.name : "Trage fișierul aici sau apasă pentru a selecta"}
              </p>
              <p className={`mt-1 text-sm ${isDarkMode ? "text-gray-500" : "text-gray-500"}`}>
                {csvFile
                  ? `${Math.max(1, Math.round(csvFile.size / 1024))} KB · CSV`
                  : "Acceptăm doar fișiere .csv"}
              </p>
              {!csvFile && (
                <span
                  className={`mt-4 inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
                    isDarkMode
                      ? "bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30"
                      : "bg-emerald-600 text-white hover:bg-emerald-700"
                  }`}
                >
                  <i className="ri-folder-open-line" />
                  Alege fișier
                </span>
              )}
            </button>

            <div
              className={`rounded-2xl border p-4 md:p-5 ${
                isDarkMode ? "border-gray-600/80 bg-gray-900/25" : "border-gray-100 bg-gray-50/80"
              }`}
            >
              <label className={`flex cursor-pointer items-start gap-4 ${isDarkMode ? "text-gray-300" : "text-gray-700"}`}>
                <input
                  type="checkbox"
                  checked={csvTermsAccepted}
                  onChange={(e) => setCsvTermsAccepted(e.target.checked)}
                  className={`mt-1 h-4 w-4 shrink-0 rounded border-gray-400 text-emerald-600 focus:ring-emerald-500 focus:ring-offset-0 ${
                    isDarkMode ? "border-gray-500 bg-gray-800" : ""
                  }`}
                />
                <span className="text-sm leading-relaxed">
                  Sunt de acord ca echipa GoBid să îmi importe și să publice pe gobid.ro anunțurile mele, pe baza fișierului trimis.
                  Am citit și accept{" "}
                  <a
                    href="/legal/termeni-import-sursa-externa"
                    className={`font-semibold underline underline-offset-2 ${
                      isDarkMode ? "text-amber-400 hover:text-amber-300" : "text-amber-700 hover:text-amber-800"
                    }`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Termenii pentru import din surse externe (CSV)
                  </a>{" "}
                  și{" "}
                  <a
                    href="/legal/termeni-si-conditii"
                    className={`font-semibold underline underline-offset-2 ${
                      isDarkMode ? "text-amber-400 hover:text-amber-300" : "text-amber-700 hover:text-amber-800"
                    }`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Termenii și condițiile
                  </a>{" "}
                  generale.
                </span>
              </label>
            </div>

            <button
              type="button"
              onClick={handleSubmitCsvEmail}
              disabled={csvStatus === "loading" || !csvFile || !csvTermsAccepted}
              className={`flex w-full items-center justify-center gap-2 rounded-xl py-4 text-base font-semibold text-white shadow-lg transition-all disabled:cursor-not-allowed disabled:opacity-50 ${
                isDarkMode
                  ? "bg-gradient-to-r from-emerald-600 to-teal-600 shadow-emerald-900/30 hover:from-emerald-500 hover:to-teal-500"
                  : "bg-gradient-to-r from-emerald-600 to-teal-600 shadow-emerald-600/25 hover:from-emerald-500 hover:to-teal-500"
              }`}
            >
              {csvStatus === "loading" ? (
                <>
                  <span className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  Se trimite…
                </>
              ) : (
                <>
                  <i className="ri-send-plane-fill text-xl" />
                  Trimite către support
                </>
              )}
            </button>

            {csvMessage && (
              <div
                role="status"
                className={`rounded-xl border px-4 py-3 text-sm leading-relaxed ${
                  csvStatus === "error"
                    ? isDarkMode
                      ? "border-red-500/40 bg-red-500/10 text-red-300"
                      : "border-red-200 bg-red-50 text-red-800"
                    : csvStatus === "success"
                      ? isDarkMode
                        ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-200"
                        : "border-emerald-200 bg-emerald-50 text-emerald-900"
                      : isDarkMode
                        ? "border-gray-600 bg-gray-800/50 text-gray-400"
                        : "border-gray-200 bg-gray-50 text-gray-600"
                }`}
              >
                <div className="flex gap-2">
                  {csvStatus === "success" ? (
                    <i className="ri-checkbox-circle-line mt-0.5 shrink-0 text-lg text-emerald-500 dark:text-emerald-400" />
                  ) : csvStatus === "error" ? (
                    <i className="ri-error-warning-line mt-0.5 shrink-0 text-lg text-red-500" />
                  ) : null}
                  <span>{csvMessage}</span>
                </div>
              </div>
            )}
          </div>
        </section>
      </div>
    </>
  );
}
