"use client";

import React, { useCallback, useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ROMANIAN_CITIES } from "@/lib/data/romanian-cities";

const CUSTOM_CITY_VALUE = "__custom__";

export default function RecategorizareTopBar() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [customCityMode, setCustomCityMode] = useState(false);

  const setParam = useCallback(
    (key: string, value: string | null) => {
      const next = new URLSearchParams(searchParams?.toString() ?? "");
      if (value == null || value === "") next.delete(key);
      else next.set(key, value);
      next.delete("page");
      next.delete("cursor");
      router.push(`/admin/recategorizare?${next.toString()}`, { scroll: false });
    },
    [router, searchParams]
  );

  const productType = searchParams?.get("product_type") || searchParams?.get("productType") || "";
  const titleSearch = searchParams?.get("titleSearch") ?? "";
  const titleSearchMode = (searchParams?.get("titleSearchMode") || "and") as "and" | "or" | "exact";
  const neverRecategorized = searchParams?.get("neverRecategorized") === "1";
  const county = searchParams?.get("county") ?? "";
  const city = searchParams?.get("city") ?? "";
  const isCustomCity = city && !ROMANIAN_CITIES.includes(city);
  const citySelectValue = customCityMode || isCustomCity ? CUSTOM_CITY_VALUE : (city || "");

  useEffect(() => {
    if (city && ROMANIAN_CITIES.includes(city)) setCustomCityMode(false);
  }, [city]);

  const typeOptions: { value: string; label: string; activeClass: string }[] = [
    { value: "", label: "Toate", activeClass: "bg-slate-200 text-slate-800 shadow-sm ring-1 ring-slate-300/80" },
    { value: "live-bid", label: "Live bid", activeClass: "bg-emerald-500 text-white shadow-md shadow-emerald-500/30 ring-1 ring-emerald-600/50" },
    { value: "licitatii-publice", label: "Licitatii publice", activeClass: "bg-blue-600 text-white shadow-md shadow-blue-600/30 ring-1 ring-blue-700/50" },
  ];

  return (
    <div className="flex flex-wrap items-center gap-6 rounded-2xl border border-gray-200/80 bg-gradient-to-b from-gray-50/90 to-white px-5 py-4 shadow-[0_1px_3px_rgba(0,0,0,0.04),0_2px_8px_rgba(0,0,0,0.03)] backdrop-blur-sm">
      {/* Sursă / Tip produs — culori distincte per sursă */}
      <div className="flex items-center gap-4">
        <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-gray-400 whitespace-nowrap">
          Sursă / Tip produs
        </span>
        <div className="flex rounded-xl bg-gray-100/80 p-1 shadow-inner ring-1 ring-black/5">
          {typeOptions.map(({ value, label, activeClass }) => {
            const isActive = (productType || "") === value;
            return (
              <button
                key={value || "all"}
                type="button"
                onClick={() => {
                  setParam("product_type", value || null);
                  setParam("productType", value || null);
                }}
                className={`
                  relative rounded-lg px-4 py-2 text-sm font-medium transition-all duration-200
                  ${isActive ? activeClass : "text-gray-500 hover:text-gray-800 hover:bg-white/50"}
                `}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Anunțuri neactualizate — filtrează doar produsele care nu au fost recategorizate niciodată */}
      <div className="flex items-center gap-3 border-l border-gray-200/80 pl-5">
        <button
          type="button"
          onClick={() => setParam("neverRecategorized", neverRecategorized ? null : "1")}
          className={`
            rounded-xl px-4 py-2 text-sm font-medium transition-all duration-200
            ${neverRecategorized
              ? "bg-amber-500 text-white shadow-md shadow-amber-500/30 ring-1 ring-amber-600/50"
              : "bg-gray-100/80 text-gray-600 hover:bg-gray-200/80 hover:text-gray-800 ring-1 ring-gray-200/60"}
          `}
        >
          Doar neactualizate
        </button>
      </div>

      {/* Caută în titlu — search modern cu icon și mod */}
      <div className="flex items-center gap-3 border-l border-gray-200/80 pl-5">
        <div className="group relative flex items-center">
          <span className="pointer-events-none absolute left-3.5 flex h-5 w-5 items-center justify-center text-gray-400 transition-colors group-focus-within:text-blue-500">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="h-5 w-5">
              <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 21L21 21Z" />
            </svg>
          </span>
          <input
            type="text"
            value={titleSearch}
            onChange={(e) => setParam("titleSearch", e.target.value || null)}
            onBlur={(e) => setParam("titleSearch", e.target.value.trim() || null)}
            placeholder="Cuvinte în titlu..."
            className="h-10 w-56 rounded-xl border border-gray-200/90 bg-white py-2 pl-10 pr-4 text-sm text-gray-800 placeholder:text-gray-400 shadow-sm outline-none transition-all duration-200 focus:border-blue-400 focus:ring-2 focus:ring-blue-500/15 hover:border-gray-300"
          />
          {titleSearch && (
            <button
              type="button"
              onClick={() => setParam("titleSearch", null)}
              className="absolute right-2.5 flex h-6 w-6 items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-600"
              aria-label="Șterge căutarea"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="h-4 w-4">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
        <div className="flex rounded-lg bg-gray-100/80 p-0.5 ring-1 ring-gray-200/60" role="group" aria-label="Mod căutare">
          {[
            { value: "and" as const, label: "Toate" },
            { value: "or" as const, label: "Oricare" },
            { value: "exact" as const, label: "Frază" },
          ].map(({ value, label }) => (
            <button
              key={value}
              type="button"
              onClick={() => setParam("titleSearchMode", value)}
              className={`
                rounded-md px-3 py-1.5 text-xs font-medium transition-all duration-200
                ${titleSearchMode === value
                  ? "bg-white text-gray-800 shadow-sm ring-1 ring-gray-200/80"
                  : "text-gray-500 hover:text-gray-700"}
              `}
              title={value === "and" ? "Toate cuvintele (AND)" : value === "or" ? "Oricare cuvânt (OR)" : "Frază exactă"}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Județ + Oraș — select cu listă orașe și opțiune „Altă localitate” */}
      <div className="flex flex-wrap items-center gap-3 border-l border-gray-200/80 pl-5">
        <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-gray-400 whitespace-nowrap">
          Locație
        </span>
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={county}
            onChange={(e) => setParam("county", e.target.value.trim() || null)}
            onBlur={(e) => setParam("county", e.target.value.trim() || null)}
            placeholder="Județ"
            className="h-10 w-32 rounded-xl border border-gray-200/90 bg-white py-2 px-3 text-sm text-gray-800 placeholder:text-gray-400 shadow-sm outline-none transition-all focus:border-blue-400 focus:ring-2 focus:ring-blue-500/15"
          />
          <div className="flex items-center gap-2">
            <select
              value={citySelectValue}
              onChange={(e) => {
                const v = e.target.value;
                if (v === "") {
                  setCustomCityMode(false);
                  setParam("city", null);
                } else if (v === CUSTOM_CITY_VALUE) {
                  setCustomCityMode(true);
                } else {
                  setCustomCityMode(false);
                  setParam("city", v);
                }
              }}
              className="h-10 min-w-[140px] max-w-[180px] rounded-xl border border-gray-200/90 bg-white py-2 pl-3 pr-8 text-sm text-gray-800 shadow-sm outline-none transition-all focus:border-blue-400 focus:ring-2 focus:ring-blue-500/15"
            >
              <option value="">— Selectează orașul —</option>
              {ROMANIAN_CITIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
              <option value={CUSTOM_CITY_VALUE}>Altă localitate…</option>
            </select>
            {(customCityMode || isCustomCity) && (
              <input
                type="text"
                value={city}
                onChange={(e) => {
                  const v = e.target.value;
                  setParam("city", v ? v : null);
                  if (!v) setCustomCityMode(false);
                }}
                onBlur={(e) => {
                  const v = e.target.value.trim();
                  setParam("city", v || null);
                  if (!v) setCustomCityMode(false);
                }}
                placeholder="Oraș / localitate"
                className="h-10 w-36 rounded-xl border border-gray-200/90 bg-white py-2 px-3 text-sm text-gray-800 placeholder:text-gray-400 shadow-sm outline-none transition-all focus:border-blue-400 focus:ring-2 focus:ring-blue-500/15"
                autoFocus
              />
            )}
          </div>
          {(county || city || customCityMode) && (
            <button
              type="button"
              onClick={() => {
                setCustomCityMode(false);
                setParam("county", null);
                setParam("city", null);
              }}
              className="flex h-10 w-10 items-center justify-center rounded-xl text-gray-400 hover:bg-gray-100 hover:text-gray-600"
              aria-label="Șterge locația"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="h-4 w-4">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
