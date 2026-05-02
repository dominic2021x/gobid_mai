"use client";

/**
 * Sidebar filtre RO: aceeași structură și controale ca pe /ro (Categorie, Subcategorie,
 * Mai multe detalii, Tip teren, Level3, Județ, Oraș, Preț, Brand, Status).
 * Folosit doar la /admin/recategorizare (centru de update categorii pentru /ro).
 * Nu se folosește în app/ro – /ro rămâne neschimbat.
 */
import React, { useCallback, useMemo } from "react";
import type { RoFilterSchema } from "@/lib/filters";
import {
  EXEC_MAI_MULTE_DETALII_OPTIONS,
  TIP_TEREN_VISIBLE_SLUGS,
  TIP_TEREN_LABELS,
} from "@/lib/filters";
import { FilterGroup, CheckboxGroup, RadioGroup } from "@/components/filters";

const LABEL_CLASS = "mb-1.5 block text-xs font-semibold uppercase tracking-wider text-gray-500";
const LABEL_CLASS_DARK = "mb-1.5 block text-xs font-semibold uppercase tracking-wider text-gray-400";
const INPUT_CLASS = "w-full rounded border border-gray-300 px-2 py-1.5 text-sm";
const INPUT_CLASS_DARK = "w-full rounded border border-gray-600 bg-gray-700 px-2 py-1.5 text-sm text-white placeholder-gray-500";

export type RoFiltersSidebarProps = {
  filterMeta: RoFilterSchema;
  /** Read current param (e.g. (k) => searchParams.get(k) ?? ""). */
  getParam: (key: string) => string;
  setParam: (key: string, value: string | null) => void;
  setMultiParam: (singularKey: string, pluralKey: string, values: string[]) => void;
  /** Base path for "Resetează" (e.g. "/ro" or "/admin/recategorizare"). */
  basePath: string;
  /** Called when user clicks "Resetează filtre" (e.g. () => router.push(basePath)). */
  onReset?: () => void;
  /** Optional controls rendered above core RO filters (e.g. admin titleSearch). */
  extraControls?: React.ReactNode;
  /** Optional prefix for input names to avoid collisions between /ro and admin. */
  namePrefix?: string;
  /** Optional category/subcategory counts to show next to options (e.g. /ro). */
  categoryCounts?: Record<string, number>;
  subcategoryCounts?: Record<string, number>;
  isDarkMode?: boolean;
  /** When false, omit County/City/Price/Brand/Status (e.g. /ro has its own Locație, Interval Preț, Brand list). Default true for admin. */
  includeGenericFilters?: boolean;
};

export function RoFiltersSidebar({
  filterMeta,
  getParam,
  setParam,
  setMultiParam,
  basePath,
  onReset,
  extraControls,
  namePrefix = "ro-filters",
  categoryCounts = {},
  subcategoryCounts = {},
  isDarkMode = false,
  includeGenericFilters = true,
}: RoFiltersSidebarProps) {
  const category = getParam("category") || getParam("categorie") || "";
  const subcategory = getParam("subcategory") || getParam("subcategorie") || "";
  const execCat = getParam("execCat") || "";
  const execCatsRaw = getParam("execCats") || "";
  const selectedExecCats = useMemo(
    () =>
      execCatsRaw
        ? execCatsRaw.split(",").map((s) => s.trim()).filter(Boolean)
        : execCat
          ? [execCat]
          : [],
    [execCat, execCatsRaw]
  );
  const level3 = getParam("level3") || "";
  const county = getParam("county") || "";
  const city = getParam("city") || "";
  const priceMin = getParam("priceMin") || getParam("price_min") || "";
  const priceMax = getParam("priceMax") || getParam("price_max") || "";
  const brand = getParam("brand") || "";
  const status = getParam("status") || "";

  const catEntry = useMemo(
    () => filterMeta.categories.find((c) => c.slug === category),
    [filterMeta.categories, category]
  );

  const level3Options = useMemo(() => {
    if (!subcategory) return [];
    return filterMeta.level3BySubcategory?.[subcategory] ?? [];
  }, [subcategory, filterMeta.level3BySubcategory]);

  const showTipTeren =
    (category === "executari" &&
      subcategory === "exec-imobiliare" &&
      (execCat === "Terenuri" || selectedExecCats.includes("Terenuri"))) ||
    (subcategory === "terenuri" && category !== "executari");

  const showLevel3Other =
    level3Options.length > 0 &&
    subcategory !== "terenuri" &&
    !(category === "executari" && subcategory === "exec-imobiliare");


  const labelCls = isDarkMode ? LABEL_CLASS_DARK : LABEL_CLASS;
  const inputCls = isDarkMode ? INPUT_CLASS_DARK : INPUT_CLASS;
  const showCounts = Object.keys(categoryCounts).length > 0 || Object.keys(subcategoryCounts).length > 0;

  return (
    <div className="space-y-5">
      {extraControls}

      {/* Categorie */}
      <div>
        <label className={labelCls}>Categorie</label>
        <CheckboxGroup
          options={filterMeta.categories
            .filter((c) => c.slug !== "all")
            .map((c) => ({
              value: c.slug,
              label: showCounts
                ? `${c.name}${categoryCounts[c.slug] != null ? ` (${categoryCounts[c.slug]})` : ""}`
                : c.name,
            }))}
          selected={category ? [category] : []}
            onChange={(selected) => {
              const v = selected.length > 0 ? selected[0] : null;
              setParam("category", v);
              setParam("categorie", v);
              setParam("subcategory", null);
              setParam("subcategorie", null);
              setParam("execCat", null);
              setParam("execCats", null);
              setParam("level3", null);
            }}
          allLabel="Toate categoriile"
          name={`${namePrefix}-category`}
        />
      </div>

      {/* Subcategorie */}
      {catEntry && catEntry.subcategories.length > 0 && (
        <div>
          <label className={labelCls}>Subcategorie</label>
          <CheckboxGroup
            options={catEntry.subcategories.map((sub) => ({
              value: sub,
              label: showCounts
                ? `${filterMeta.subcategoryNames[sub] ?? sub}${subcategoryCounts[sub] != null ? ` (${subcategoryCounts[sub]})` : ""}`
                : (filterMeta.subcategoryNames[sub] ?? sub),
            }))}
            selected={subcategory ? [subcategory] : []}
            onChange={(selected) => {
              const v = selected.length > 0 ? selected[0] : null;
              setParam("subcategory", v);
              setParam("subcategorie", v);
              setParam("execCat", null);
              setParam("execCats", null);
              setParam("level3", null);
            }}
            allLabel="Toate subcategoriile"
            name={`${namePrefix}-subcategory`}
          />
        </div>
      )}

      {/* Mai multe detalii – Executări + Imobiliare (checkboxes, 1:1 cu /ro) */}
      {category === "executari" && subcategory === "exec-imobiliare" && (
        <FilterGroup
          groupId="mai_multe_detalii"
          title="Mai multe detalii"
          options={[...EXEC_MAI_MULTE_DETALII_OPTIONS].map((v) => ({ value: v, label: v }))}
          selected={selectedExecCats}
          onChange={(selected) => {
            setMultiParam("execCat", "execCats", selected);
            if (selected.length === 0 || !selected.includes("Terenuri")) setParam("level3", null);
          }}
        />
      )}

      {/* Tip teren – radio (1:1 cu /ro; labels from TIP_TEREN_LABELS) */}
      {showTipTeren && (
        <FilterGroup
          groupId="tip_teren"
          title="Tip teren"
          options={[...TIP_TEREN_VISIBLE_SLUGS].map((slug) => ({
            value: slug,
            label: TIP_TEREN_LABELS[slug] ?? slug,
          }))}
          value={level3 || "all"}
          onChange={(v) => setParam("level3", v === "all" ? null : v)}
          name={`${namePrefix}-tip-teren`}
        />
      )}

      {/* Level3 for other subcategories – radio (no select; parity with /ro) */}
      {showLevel3Other && (
        <div>
          <label className={labelCls}>Tip (level 3)</label>
          <RadioGroup
            options={level3Options.map((slug) => ({
              value: slug,
              label:
                filterMeta.level3LabelsBySubcategory?.[subcategory]?.[slug] ??
                filterMeta.subcategoryNames[slug] ??
                slug,
            }))}
            value={level3 || "all"}
            onChange={(v) => setParam("level3", v === "all" ? null : v)}
            allValue="all"
            allLabel="Toate"
            name={`${namePrefix}-level3`}
          />
        </div>
      )}

      {/* County, City, Price, Brand, Status – same control types when includeGenericFilters */}
      {includeGenericFilters && (
        <>
          <div>
            <label className={labelCls}>Județ</label>
            <input
              type="text"
              value={county}
              onChange={(e) => setParam("county", e.target.value.trim() || null)}
              placeholder="Județ"
              className={inputCls}
            />
          </div>
          <div>
            <label className={labelCls}>Oraș</label>
            <input
              type="text"
              value={city}
              onChange={(e) => setParam("city", e.target.value.trim() || null)}
              placeholder="Oraș"
              className={inputCls}
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={labelCls}>Preț min</label>
              <input
                type="number"
                value={priceMin}
                onChange={(e) => setParam("priceMin", e.target.value.trim() || null)}
                placeholder="Lei"
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>Preț max</label>
              <input
                type="number"
                value={priceMax}
                onChange={(e) => setParam("priceMax", e.target.value.trim() || null)}
                placeholder="Lei"
                className={inputCls}
              />
            </div>
          </div>
          <div>
            <label className={labelCls}>Marca</label>
            <input
              type="text"
              value={brand}
              onChange={(e) => setParam("brand", e.target.value.trim() || null)}
              placeholder="Marca"
              className={inputCls}
            />
          </div>
          <div>
            <label className={labelCls}>Status</label>
            <select
              value={status || "all"}
              onChange={(e) => setParam("status", e.target.value === "all" ? null : e.target.value)}
              className={inputCls}
            >
              <option value="all">Toate</option>
              <option value="active">Active</option>
              <option value="reserved">Rezervate</option>
              <option value="sold">Vândute</option>
              <option value="in_progress">În desfășurare</option>
            </select>
          </div>
        </>
      )}

      {/* Resetează */}
      {onReset && (
        <div className="pt-2">
          <button
            type="button"
            onClick={onReset}
            className="text-xs text-blue-600 hover:text-blue-800"
          >
            Resetează filtre
          </button>
        </div>
      )}
    </div>
  );
}
