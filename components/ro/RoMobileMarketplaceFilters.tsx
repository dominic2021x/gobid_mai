"use client";

import React, { useEffect, useState } from "react";
import { ChevronDown, Loader2, MapPin, Navigation2, SlidersHorizontal } from "lucide-react";
import { LocationFilterAutocompleteInput } from "@/components/ro/LocationFilterAutocompleteInput";
import { Button } from "@/components/ui/button";

import { ArrowLeftRight, FiltreCadouIcon } from "@/components/ro/FilterStareIcons";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

const numberNoSpinnerClass =
  "[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none";

export type DatePostedValue = "all" | "today" | "week" | "month";
export type ConditionValue = "all" | "new" | "used";

export interface RoMobileMarketplaceFiltersCategory {
  value: string;
  label: string;
}

export interface RoMobileMarketplaceFiltersProps {
  /** Locație (text – „Toată România”) */
  location: string;
  onLocationChange: (value: string) => void;
  /** Rază km (5..200) */
  radiusKm: number;
  onRadiusChange: (km: number) => void;
  /** Categoria selectată (single) */
  category: string;
  onCategoryChange: (value: string) => void;
  categories: RoMobileMarketplaceFiltersCategory[];
  /** Subcategorii ale categoriei curente — afișate când e nevid */
  subcategories?: RoMobileMarketplaceFiltersCategory[];
  selectedSubcategories?: string[];
  onSubcategoriesChange?: (slugs: string[]) => void;
  /** Preț */
  priceMin: string;
  priceMax: string;
  onPriceChange: (next: { min: string; max: string }) => void;
  /** Monedă (Lei / EUR) — deasupra câmpurilor de preț */
  selectedCurrency: "RON" | "EUR";
  onCurrencyChange: (next: "RON" | "EUR") => void;
  /** Pentru același aspect ca filtrele / bara de sus */
  isDarkMode?: boolean;
  freeOnly: boolean;
  onFreeOnlyChange: (next: boolean) => void;
  /** Stare */
  condition: ConditionValue;
  onConditionChange: (value: ConditionValue) => void;
  /** Data publicării */
  datePosted: DatePostedValue;
  onDatePostedChange: (value: DatePostedValue) => void;
  /** Opțiuni de livrare (multi) */
  delivery: string[];
  onDeliveryChange: (next: string[]) => void;
  /** Conținutul „Filtrări avansate” (Mărime, Marcă, Model, Imobiliare, Vehicule, Executări etc) */
  advancedFilters?: React.ReactNode;
  /** Stare deschis/închis pentru „Filtrări avansate” (controlat de parent dacă e setat). */
  advancedOpen?: boolean;
  onAdvancedOpenChange?: (open: boolean) => void;
  /** Ascunde trigger-ul inline „Filtrări avansate” (când controlul e mutat în footer). */
  hideAdvancedTrigger?: boolean;
  /** Include anunțuri din Executări în rezultatele categoriei (nu pe modul doar-Executări). */
  includeExecutariCrosslist?: boolean;
  onIncludeExecutariCrosslistChange?: (next: boolean) => void;
  showExecutariCrosslistToggle?: boolean;
  /** GPS + adresa în câmp + (opțional) închidere sheet / refresh listă. */
  onUseMyLocation?: () => void;
  /** Revine la listarea națională (fără centru/radius geo). */
  onUseNationwide?: () => void;
  useMyLocationBusy?: boolean;
  hasLocationCenter?: boolean;
  /** Grid vs listă — afișat în „Filtrări avansate” (ex. sheet mobil; bara de sus rămâne liberă). */
  resultsViewMode?: "grid" | "list";
  onResultsViewModeChange?: (mode: "grid" | "list") => void;
}

interface FilterSectionProps {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}

function ExecutariInCategorieToggle({
  id,
  checked,
  onChange,
  isDarkMode,
}: {
  id: string;
  checked: boolean;
  onChange: () => void;
  isDarkMode: boolean;
}) {
  const cardShell = isDarkMode
    ? "border-sky-500/30 bg-gradient-to-br from-sky-500/10 to-blue-500/5"
    : "border-gray-300 bg-white";
  return (
    <div className={cn("min-w-0 rounded-xl border px-2 py-1.5", cardShell)}>
      <div className="flex items-center justify-between gap-1.5">
        <label
          htmlFor={id}
          className="min-w-0 flex-1 cursor-pointer pr-0.5"
          title="Afișează și anunțuri cu executări silite și insolvență"
        >
          <p
            className={cn(
              "whitespace-nowrap text-[8px] font-medium leading-none tracking-tight sm:text-[9px] md:text-[9.5px]",
              isDarkMode ? "text-gray-100" : "text-gray-800",
            )}
          >
            Afișează și anunțuri cu executări silite și insolvență
          </p>
        </label>
        <button
          id={id}
          type="button"
          role="switch"
          aria-checked={checked}
          aria-label="Afișează și anunțuri cu executări silite și insolvență"
          onClick={onChange}
          className={cn(
            "relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border border-transparent transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
            checked
              ? "bg-orange-500"
              : isDarkMode
                ? "bg-white/10"
                : "bg-gray-200",
          )}
        >
          <span
            aria-hidden
            className={cn(
              "pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition duration-200",
              checked ? "translate-x-6" : "translate-x-1",
            )}
          />
        </button>
      </div>
    </div>
  );
}

function FilterSection({ title, defaultOpen = false, children }: FilterSectionProps) {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    setIsOpen(defaultOpen);
  }, [defaultOpen]);

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen} className="border-b border-border">
      <CollapsibleTrigger className="flex w-full items-center justify-between px-4 py-3 transition-colors hover:bg-muted/50">
        <span className="text-sm font-medium">{title}</span>
        <ChevronDown
          className={`h-4 w-4 transition-transform duration-150 ${isOpen ? "rotate-180" : ""}`}
        />
      </CollapsibleTrigger>
      <CollapsibleContent className="px-4 pb-4">{children}</CollapsibleContent>
    </Collapsible>
  );
}

const DELIVERY_OPTIONS = ["Livrare disponibilă", "Ridicare personală"];

export function RoMobileMarketplaceFilters({
  location,
  onLocationChange,
  radiusKm,
  onRadiusChange,
  category,
  onCategoryChange,
  categories,
  subcategories = [],
  selectedSubcategories = [],
  onSubcategoriesChange,
  priceMin,
  priceMax,
  onPriceChange,
  selectedCurrency,
  onCurrencyChange,
  isDarkMode = false,
  freeOnly,
  onFreeOnlyChange,
  condition,
  onConditionChange,
  datePosted,
  onDatePostedChange,
  delivery,
  onDeliveryChange,
  advancedFilters,
  advancedOpen,
  onAdvancedOpenChange,
  hideAdvancedTrigger = false,
  includeExecutariCrosslist = false,
  onIncludeExecutariCrosslistChange,
  showExecutariCrosslistToggle = false,
  onUseMyLocation,
  onUseNationwide,
  useMyLocationBusy = false,
  hasLocationCenter = false,
  resultsViewMode,
  onResultsViewModeChange,
}: RoMobileMarketplaceFiltersProps) {
  const [advancedOpenInternal, setAdvancedOpenInternal] = useState(false);
  const isAdvancedControlled = advancedOpen !== undefined && onAdvancedOpenChange !== undefined;
  const advancedIsOpen = isAdvancedControlled ? Boolean(advancedOpen) : advancedOpenInternal;
  const setAdvancedIsOpen = (v: boolean) => {
    if (isAdvancedControlled) onAdvancedOpenChange?.(v);
    else setAdvancedOpenInternal(v);
  };
  const radiusClamped = Math.max(0, Math.min(200, radiusKm));
  const radiusProgress = `${(radiusClamped / 200) * 100}%`;
  return (
    <div className="space-y-0">
      <FilterSection title="Locație" defaultOpen={true}>
        <div className="space-y-3">
          <div className="relative">
            <MapPin className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <LocationFilterAutocompleteInput
              value={location}
              onChange={onLocationChange}
              isDarkMode={isDarkMode}
              inputClassName="h-9 pl-9"
              placeholder="Caută localitate (ex. Craiova, Segarcea)…"
              aria-label="Caută localitate"
            />
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <Label className="text-sm font-medium">
                Rază maximă:{" "}
                {!hasLocationCenter
                  ? "Toată țara"
                  : radiusKm <= 0
                    ? "fără limită (sortare după distanță)"
                    : `${radiusKm} km`}
              </Label>
              {useMyLocationBusy ? (
                <Loader2
                  className={cn("h-4 w-4 shrink-0 animate-spin", isDarkMode ? "text-gray-500" : "text-muted-foreground")}
                  aria-hidden
                />
              ) : hasLocationCenter ? (
                <span
                  className={cn("text-xs font-medium", isDarkMode ? "text-emerald-400" : "text-emerald-600")}
                >
                  Locație aprox. salvată
                </span>
              ) : null}
            </div>
            <input
              type="range"
              min={0}
              max={200}
              step={5}
              value={radiusKm}
              onChange={(e) => onRadiusChange(Number(e.target.value) || 0)}
              disabled={!hasLocationCenter}
              style={{
                background: `linear-gradient(90deg, rgba(14,165,233,0.95) 0%, rgba(6,182,212,0.95) ${radiusProgress}, rgba(148,163,184,0.25) ${radiusProgress}, rgba(148,163,184,0.25) 100%)`,
              }}
              className={cn(
                "h-2.5 w-full cursor-pointer appearance-none rounded-full border border-border/40 transition-all",
                "shadow-[inset_0_1px_2px_rgba(0,0,0,0.08)]",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/60 focus-visible:ring-offset-1",
                "[&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:appearance-none",
                "[&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border [&::-webkit-slider-thumb]:border-white/60",
                "[&::-webkit-slider-thumb]:bg-gradient-to-br [&::-webkit-slider-thumb]:from-sky-500 [&::-webkit-slider-thumb]:to-cyan-600",
                "[&::-webkit-slider-thumb]:shadow-md [&::-webkit-slider-thumb]:transition-transform [&::-webkit-slider-thumb]:duration-150",
                "[&::-webkit-slider-thumb:hover]:scale-110",
                "[&::-moz-range-thumb]:h-5 [&::-moz-range-thumb]:w-5 [&::-moz-range-thumb]:rounded-full",
                "[&::-moz-range-thumb]:border [&::-moz-range-thumb]:border-white/60 [&::-moz-range-thumb]:bg-cyan-500 [&::-moz-range-thumb]:shadow-md",
                "disabled:cursor-not-allowed disabled:opacity-45",
              )}
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Fără limită</span>
              <div className="flex items-center gap-2">
                <span>200 km</span>
                {onUseNationwide ? (
                  <button
                    type="button"
                    onClick={onUseNationwide}
                    className={cn(
                      "rounded px-1.5 py-0.5 text-[11px] font-semibold transition-colors",
                      isDarkMode
                        ? "text-sky-300 hover:bg-sky-500/15 hover:text-sky-200"
                        : "text-sky-700 hover:bg-sky-100 hover:text-sky-800",
                    )}
                  >
                    Toată țara
                  </button>
                ) : null}
              </div>
            </div>
            {onUseMyLocation || onUseNationwide ? (
              <div className="grid grid-cols-1 gap-2">
                {onUseMyLocation ? (
                  <Button
                    type="button"
                    onClick={onUseMyLocation}
                    disabled={useMyLocationBusy}
                    className={cn(
                      "h-auto w-full rounded-xl border-0 py-2.5 text-sm font-semibold text-white shadow-md transition-all",
                      "bg-gradient-to-r from-sky-500 via-cyan-500 to-teal-500 hover:from-sky-400 hover:via-cyan-500 hover:to-teal-400",
                      "hover:shadow-lg focus-visible:ring-2 focus-visible:ring-sky-400/80",
                      isDarkMode && "opacity-[0.98] hover:opacity-100",
                    )}
                  >
                    {useMyLocationBusy ? (
                      <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden />
                    ) : (
                      <Navigation2 className="h-4 w-4 shrink-0" aria-hidden />
                    )}
                    Caută lângă mine
                  </Button>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      </FilterSection>

      <FilterSection title="Categorie" defaultOpen>
        <div className="space-y-2">
          {showExecutariCrosslistToggle && onIncludeExecutariCrosslistChange && !category ? (
            <div className="mb-0.5">
              <ExecutariInCategorieToggle
                id="mp-exec-crosslist-before-cat"
                checked={includeExecutariCrosslist}
                onChange={() => onIncludeExecutariCrosslistChange(!includeExecutariCrosslist)}
                isDarkMode={isDarkMode}
              />
            </div>
          ) : null}
          {categories.map((cat) => (
            <div key={cat.value} className="space-y-2">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id={`mp-cat-${cat.value}`}
                  checked={category === cat.value}
                  onCheckedChange={(checked) => {
                    onCategoryChange(checked ? cat.value : "");
                  }}
                />
                <Label
                  htmlFor={`mp-cat-${cat.value}`}
                  className="cursor-pointer text-sm font-normal"
                >
                  {cat.label}
                </Label>
              </div>
              {showExecutariCrosslistToggle &&
              onIncludeExecutariCrosslistChange &&
              category === cat.value ? (
                <div className="w-full pl-0">
                  <ExecutariInCategorieToggle
                    id={`mp-exec-crosslist-cat-${cat.value}`}
                    checked={includeExecutariCrosslist}
                    onChange={() => onIncludeExecutariCrosslistChange(!includeExecutariCrosslist)}
                    isDarkMode={isDarkMode}
                  />
                </div>
              ) : null}
            </div>
          ))}
        </div>
      </FilterSection>

      {category && subcategories.length > 0 && onSubcategoriesChange ? (
        <FilterSection title="Subcategorie" defaultOpen={true}>
          <div className="space-y-2">
            <div className="flex items-center space-x-2">
              <Checkbox
                id="mp-subcat-all"
                checked={selectedSubcategories.length === 0}
                onCheckedChange={(checked) => {
                  if (checked) onSubcategoriesChange([]);
                }}
              />
              <Label htmlFor="mp-subcat-all" className="cursor-pointer text-sm font-medium">
                Toate subcategoriile
              </Label>
            </div>
            {subcategories.map((sub) => {
              const isOn = selectedSubcategories.includes(sub.value);
              return (
                <div key={sub.value} className="flex items-center space-x-2">
                  <Checkbox
                    id={`mp-subcat-${sub.value}`}
                    checked={isOn}
                    onCheckedChange={(checked) => {
                      const next = checked
                        ? Array.from(new Set([...selectedSubcategories, sub.value]))
                        : selectedSubcategories.filter((s) => s !== sub.value);
                      onSubcategoriesChange(next);
                    }}
                  />
                  <Label
                    htmlFor={`mp-subcat-${sub.value}`}
                    className="cursor-pointer text-sm font-normal"
                  >
                    {sub.label}
                  </Label>
                </div>
              );
            })}
          </div>
        </FilterSection>
      ) : null}

      <FilterSection title="Preț" defaultOpen>
        <div className="space-y-2.5">
          <button
            type="button"
            onClick={() => {
              const next = !freeOnly;
              onFreeOnlyChange(next);
              if (next) onPriceChange({ min: "", max: "" });
            }}
            className={cn(
              "flex w-full items-center justify-between gap-2 rounded-xl border p-2.5 pr-2 text-left transition-all duration-200",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/50 focus-visible:ring-offset-1",
              freeOnly
                ? isDarkMode
                  ? "border-emerald-500/55 bg-gradient-to-br from-emerald-900/40 to-slate-900/25 ring-1 ring-emerald-500/25"
                  : "border-emerald-400/90 bg-gradient-to-br from-emerald-50/90 to-white ring-1 ring-emerald-200/40"
                : isDarkMode
                  ? "border-slate-500/45 bg-slate-800/35 hover:border-emerald-500/40"
                  : "border-border/60 bg-card hover:border-emerald-300/45",
            )}
            aria-pressed={freeOnly}
            aria-label="Doar produse gratuite"
          >
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <div
                className={cn(
                  "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors",
                  freeOnly
                    ? "bg-emerald-500 text-white"
                    : isDarkMode
                      ? "bg-emerald-500/20 text-emerald-300"
                      : "bg-emerald-100/90 text-emerald-700",
                )}
              >
                <FiltreCadouIcon className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <p
                  className={cn(
                    "text-[13px] font-semibold leading-snug",
                    freeOnly
                      ? isDarkMode
                        ? "text-emerald-200"
                        : "text-emerald-900"
                      : "text-foreground",
                  )}
                >
                  Doar produse gratuite
                </p>
                <p className="text-[11px] leading-tight text-muted-foreground">
                  {freeOnly ? "Fără cost" : "0 lei / gratuite"}
                </p>
              </div>
            </div>
            <span
              className={cn(
                "relative h-5 w-9 shrink-0 rounded-full transition-colors duration-200",
                freeOnly ? "bg-emerald-500" : "bg-muted-foreground/20",
              )}
              aria-hidden
            >
              <span
                className={cn(
                  "absolute top-0.5 left-0.5 h-3.5 w-3.5 rounded-full bg-white shadow-sm transition-transform duration-200 ease-out",
                  freeOnly ? "translate-x-[1.12rem]" : "translate-x-0",
                )}
              />
            </span>
          </button>

          <div
            className="flex w-full items-center justify-end"
            role="group"
            aria-label="Selectează moneda (Lei / EUR)"
          >
            <div
              className={cn(
                "inline-flex h-8 items-center gap-0.5 rounded-lg p-0.5",
                isDarkMode
                  ? "border border-white/15 bg-zinc-900/80"
                  : "border border-zinc-200 bg-zinc-100",
              )}
              role="tablist"
            >
              <button
                type="button"
                role="tab"
                aria-selected={selectedCurrency === "RON"}
                onClick={() => onCurrencyChange("RON")}
                className={cn(
                  "min-w-[5.5rem] rounded-md px-4 py-1.5 text-sm font-semibold leading-none transition-all duration-200 sm:min-w-[6.25rem] sm:px-5",
                  selectedCurrency === "RON"
                    ? isDarkMode
                      ? "bg-white text-zinc-900 shadow-sm"
                      : "bg-zinc-900 text-white shadow-sm"
                    : isDarkMode
                      ? "text-zinc-400 hover:bg-white/10 hover:text-white"
                      : "text-zinc-600 hover:bg-white hover:text-zinc-900",
                )}
              >
                Lei
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={selectedCurrency === "EUR"}
                onClick={() => onCurrencyChange("EUR")}
                className={cn(
                  "min-w-[5.5rem] rounded-md px-4 py-1.5 text-sm font-semibold leading-none transition-all duration-200 sm:min-w-[6.25rem] sm:px-5",
                  selectedCurrency === "EUR"
                    ? isDarkMode
                      ? "bg-white text-zinc-900 shadow-sm"
                      : "bg-zinc-900 text-white shadow-sm"
                    : isDarkMode
                      ? "text-zinc-400 hover:bg-white/10 hover:text-white"
                      : "text-zinc-600 hover:bg-white hover:text-zinc-900",
                )}
              >
                EUR
              </button>
            </div>
          </div>

          {!freeOnly && (
            <div
              className={cn(
                "overflow-hidden rounded-xl border shadow-sm",
                isDarkMode
                  ? "border-emerald-500/30 bg-gradient-to-b from-slate-800/70 via-emerald-950/30 to-slate-900/60"
                  : "border-emerald-200/45 bg-gradient-to-b from-white via-emerald-50/15 to-slate-50/50",
              )}
              role="group"
              aria-label="Interval de preț"
            >
              <div className="flex min-h-[3.5rem] items-stretch">
                <div className="flex min-w-0 flex-1 flex-col justify-center gap-0.5 px-3 py-2">
                  <span
                    className={cn(
                      "text-[10px] font-semibold uppercase tracking-wide",
                      isDarkMode ? "text-emerald-300/90" : "text-emerald-800/80",
                    )}
                  >
                    Minim
                  </span>
                  <div className="flex items-baseline gap-1">
                    <Input
                      type="number"
                      inputMode="decimal"
                      min={0}
                      placeholder="—"
                      value={priceMin}
                      onChange={(e) => onPriceChange({ min: e.target.value, max: priceMax })}
                      className={cn(
                        "h-7 min-w-0 flex-1 border-0 bg-transparent p-0 text-sm font-semibold tabular-nums shadow-none",
                        "text-foreground placeholder:text-muted-foreground/45",
                        "focus-visible:ring-0",
                        "md:text-sm",
                        numberNoSpinnerClass,
                      )}
                    />
                    <span
                      className={cn(
                        "shrink-0 text-[10px] font-medium",
                        isDarkMode ? "text-emerald-400/70" : "text-emerald-700/60",
                      )}
                    >
                      {selectedCurrency === "EUR" ? "EUR" : "Lei"}
                    </span>
                  </div>
                </div>
                <div
                  className={cn(
                    "flex w-7 shrink-0 flex-col items-center justify-center self-stretch border-x border-dashed",
                    isDarkMode
                      ? "border-emerald-500/25 bg-slate-800/40"
                      : "border-emerald-200/50 bg-white/40",
                  )}
                  aria-hidden
                >
                  <ArrowLeftRight
                    className={cn("h-3.5 w-3.5", isDarkMode ? "text-emerald-400/45" : "text-emerald-600/50")}
                  />
                </div>
                <div className="flex min-w-0 flex-1 flex-col justify-center gap-0.5 px-3 py-2">
                  <span
                    className={cn(
                      "text-[10px] font-semibold uppercase tracking-wide",
                      isDarkMode ? "text-emerald-300/90" : "text-emerald-800/80",
                    )}
                  >
                    Maxim
                  </span>
                  <div className="flex items-baseline gap-1">
                    <Input
                      type="number"
                      inputMode="decimal"
                      min={0}
                      placeholder="—"
                      value={priceMax}
                      onChange={(e) => onPriceChange({ min: priceMin, max: e.target.value })}
                      className={cn(
                        "h-7 min-w-0 flex-1 border-0 bg-transparent p-0 text-sm font-semibold tabular-nums shadow-none",
                        "text-foreground placeholder:text-muted-foreground/45",
                        "focus-visible:ring-0",
                        "md:text-sm",
                        numberNoSpinnerClass,
                      )}
                    />
                    <span
                      className={cn(
                        "shrink-0 text-[10px] font-medium",
                        isDarkMode ? "text-emerald-400/70" : "text-emerald-700/60",
                      )}
                    >
                      {selectedCurrency === "EUR" ? "EUR" : "Lei"}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </FilterSection>

      <FilterSection title="Stare">
        <RadioGroup
          value={condition}
          onValueChange={(value) => onConditionChange(value as ConditionValue)}
          className="grid grid-cols-3 gap-1.5"
        >
          <div className="relative min-w-0">
            <RadioGroupItem value="all" id="mp-cond-all" className="sr-only" />
            <Label
              htmlFor="mp-cond-all"
              className={cn(
                "flex min-h-[2.75rem] cursor-pointer items-center justify-center rounded-xl border px-1.5 py-2.5 text-center text-[11px] font-semibold leading-tight sm:text-xs transition-all duration-200",
                "focus-within:ring-2 focus-within:ring-emerald-400/50 focus-within:ring-offset-1",
                condition === "all"
                  ? isDarkMode
                    ? "border-emerald-500/70 bg-gradient-to-b from-emerald-900/45 to-slate-900/35 text-emerald-100 ring-1 ring-emerald-500/25 shadow-sm"
                    : "border-emerald-500/80 bg-gradient-to-b from-emerald-50/90 to-white text-emerald-900 ring-1 ring-emerald-200/50 shadow-sm"
                  : isDarkMode
                    ? "border-slate-500/50 bg-slate-800/40 text-slate-200 hover:border-emerald-500/40"
                    : "border-border/60 bg-white/50 text-foreground hover:border-emerald-300/40",
              )}
            >
              Toate
            </Label>
          </div>
          <div className="relative min-w-0">
            <RadioGroupItem value="new" id="mp-cond-new" className="sr-only" />
            <Label
              htmlFor="mp-cond-new"
              className={cn(
                "flex min-h-[2.75rem] cursor-pointer items-center justify-center rounded-xl border px-1.5 py-2.5 text-center text-[11px] font-semibold leading-tight sm:text-xs transition-all duration-200",
                "focus-within:ring-2 focus-within:ring-emerald-400/50 focus-within:ring-offset-1",
                condition === "new"
                  ? isDarkMode
                    ? "border-emerald-500/70 bg-gradient-to-b from-emerald-900/45 to-slate-900/35 text-emerald-100 ring-1 ring-emerald-500/25 shadow-sm"
                    : "border-emerald-500/80 bg-gradient-to-b from-emerald-50/90 to-white text-emerald-900 ring-1 ring-emerald-200/50 shadow-sm"
                  : isDarkMode
                    ? "border-slate-500/50 bg-slate-800/40 text-slate-200 hover:border-emerald-500/40"
                    : "border-border/60 bg-white/50 text-foreground hover:border-emerald-300/40",
              )}
            >
              Nou
            </Label>
          </div>
          <div className="relative min-w-0">
            <RadioGroupItem value="used" id="mp-cond-used" className="sr-only" />
            <Label
              htmlFor="mp-cond-used"
              className={cn(
                "flex min-h-[2.75rem] cursor-pointer items-center justify-center rounded-xl border px-1.5 py-2.5 text-center text-[11px] font-semibold leading-tight sm:text-xs transition-all duration-200",
                "focus-within:ring-2 focus-within:ring-emerald-400/50 focus-within:ring-offset-1",
                condition === "used"
                  ? isDarkMode
                    ? "border-emerald-500/70 bg-gradient-to-b from-emerald-900/45 to-slate-900/35 text-emerald-100 ring-1 ring-emerald-500/25 shadow-sm"
                    : "border-emerald-500/80 bg-gradient-to-b from-emerald-50/90 to-white text-emerald-900 ring-1 ring-emerald-200/50 shadow-sm"
                  : isDarkMode
                    ? "border-slate-500/50 bg-slate-800/40 text-slate-200 hover:border-emerald-500/40"
                    : "border-border/60 bg-white/50 text-foreground hover:border-emerald-300/40",
              )}
            >
              Folosit
            </Label>
          </div>
        </RadioGroup>
      </FilterSection>

      <FilterSection title="Data publicării">
        <RadioGroup
          value={datePosted}
          onValueChange={(value) => onDatePostedChange(value as DatePostedValue)}
        >
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="all" id="mp-date-all" />
            <Label htmlFor="mp-date-all" className="cursor-pointer text-sm font-normal">
              Orice
            </Label>
          </div>
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="today" id="mp-date-today" />
            <Label htmlFor="mp-date-today" className="cursor-pointer text-sm font-normal">
              Ultima zi
            </Label>
          </div>
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="week" id="mp-date-week" />
            <Label htmlFor="mp-date-week" className="cursor-pointer text-sm font-normal">
              Ultima săptămână
            </Label>
          </div>
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="month" id="mp-date-month" />
            <Label htmlFor="mp-date-month" className="cursor-pointer text-sm font-normal">
              Ultima lună
            </Label>
          </div>
        </RadioGroup>
      </FilterSection>

      <FilterSection title="Opțiuni de livrare">
        <div className="space-y-2">
          {DELIVERY_OPTIONS.map((option) => (
            <div key={option} className="flex items-center space-x-2">
              <Checkbox
                id={`mp-delivery-${option}`}
                checked={delivery.includes(option)}
                onCheckedChange={(checked) => {
                  if (checked) onDeliveryChange([...delivery, option]);
                  else onDeliveryChange(delivery.filter((d) => d !== option));
                }}
              />
              <Label
                htmlFor={`mp-delivery-${option}`}
                className="cursor-pointer text-sm font-normal"
              >
                {option}
              </Label>
            </div>
          ))}
        </div>
      </FilterSection>

      {advancedFilters || (resultsViewMode !== undefined && onResultsViewModeChange) ? (
        <Collapsible
          open={advancedIsOpen}
          onOpenChange={setAdvancedIsOpen}
          className="group border-b border-border"
        >
          {!hideAdvancedTrigger ? (
            <CollapsibleTrigger className="flex w-full items-center justify-between px-4 py-3 transition-colors hover:bg-muted/50">
              <span className="flex items-center gap-2 text-sm font-medium">
                <SlidersHorizontal className="h-4 w-4 text-muted-foreground" />
                Filtrări avansate
              </span>
              <ChevronDown className="h-4 w-4 transition-transform duration-150 group-data-[state=open]:rotate-180" />
            </CollapsibleTrigger>
          ) : null}
          <CollapsibleContent className="space-y-4 px-2 pb-4">
            {resultsViewMode !== undefined && onResultsViewModeChange ? (
              <div className="border-b border-border/70 px-1 pb-4 pt-1">
                <p
                  className={cn(
                    "mb-2 text-sm font-medium",
                    isDarkMode ? "text-gray-300" : "text-muted-foreground",
                  )}
                >
                  Afișare rezultate
                </p>
                <div
                  className={cn(
                    "relative flex w-full max-w-md rounded-xl p-1 transition-colors",
                    isDarkMode ? "bg-gray-700" : "bg-gray-100",
                  )}
                  role="tablist"
                  aria-label="Grid sau listă"
                >
                  <button
                    type="button"
                    role="tab"
                    aria-selected={resultsViewMode === "grid"}
                    onClick={() => onResultsViewModeChange("grid")}
                    className={cn(
                      "relative flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-all",
                      resultsViewMode === "grid"
                        ? "bg-white text-gray-900 shadow-md"
                        : isDarkMode
                          ? "text-gray-400 hover:text-white"
                          : "text-gray-500 hover:text-gray-800",
                    )}
                  >
                    <svg className="h-4 w-4 shrink-0" fill="currentColor" viewBox="0 0 20 20" aria-hidden>
                      <path d="M5 3a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2V5a2 2 0 00-2-2H5zM5 11a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2v-2a2 2 0 00-2-2H5zM11 5a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V5zM11 13a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
                    </svg>
                    Grid
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={resultsViewMode === "list"}
                    onClick={() => onResultsViewModeChange("list")}
                    className={cn(
                      "relative flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-all",
                      resultsViewMode === "list"
                        ? "bg-white text-gray-900 shadow-md"
                        : isDarkMode
                          ? "text-gray-400 hover:text-white"
                          : "text-gray-500 hover:text-gray-800",
                    )}
                  >
                    <svg className="h-4 w-4 shrink-0" fill="currentColor" viewBox="0 0 20 20" aria-hidden>
                      <path
                        fillRule="evenodd"
                        d="M3 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z"
                        clipRule="evenodd"
                      />
                    </svg>
                    Listă
                  </button>
                </div>
              </div>
            ) : null}
            {advancedFilters}
          </CollapsibleContent>
        </Collapsible>
      ) : null}

    </div>
  );
}

export default RoMobileMarketplaceFilters;
