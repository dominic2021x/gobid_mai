"use client";

import { useCallback, useMemo, useState } from "react";

export type FilterState = {
  search: string;
  location: string;
  radius: string;
  category: string;
  priceMin: string;
  priceMax: string;
  condition: string;
  datePosted: string;
  delivery: string[];
  attributes: string[];
  freeOnly: boolean;
};

export function createInitialFilterState(): FilterState {
  return {
    search: "",
    location: "",
    radius: "20",
    category: "",
    priceMin: "",
    priceMax: "",
    condition: "all",
    datePosted: "all",
    delivery: [],
    attributes: [],
    freeOnly: false,
  };
}

export const INITIAL_FILTER_STATE: FilterState = createInitialFilterState();

export const MARKETPLACE_CATEGORY_OPTIONS = [
  { value: "electronics", label: "Electronice" },
  { value: "furniture", label: "Mobilă & Casă" },
  { value: "clothing", label: "Modă & Beauty" },
  { value: "vehicles", label: "Auto, Moto & Bărci" },
  { value: "hobbies", label: "Hobby & Timp Liber" },
  { value: "realestate", label: "Imobiliare" },
  { value: "jobs", label: "Locuri de muncă" },
  { value: "services", label: "Servicii" },
] as const;

export function useFilters() {
  const [filters, setFilters] = useState<FilterState>(() => createInitialFilterState());

  const updateFilter = useCallback(<K extends keyof FilterState>(key: K, value: FilterState[K]) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  }, []);

  const resetFilters = useCallback(() => {
    setFilters(createInitialFilterState());
  }, []);

  const activeFilterCount = useMemo(
    () =>
      [
        filters.location,
        filters.category,
        filters.priceMin,
        filters.priceMax,
        filters.condition !== "all" ? filters.condition : "",
        filters.datePosted !== "all" ? filters.datePosted : "",
        filters.freeOnly ? "free" : "",
        ...filters.delivery,
        ...filters.attributes,
      ].filter(Boolean).length,
    [filters],
  );

  return {
    filters,
    setFilters,
    updateFilter,
    resetFilters,
    activeFilterCount,
    categories: MARKETPLACE_CATEGORY_OPTIONS,
  };
}

export type UseFiltersReturn = ReturnType<typeof useFilters>;
