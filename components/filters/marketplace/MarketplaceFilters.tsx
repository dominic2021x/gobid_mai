"use client";

import * as React from "react";
import { ChevronDown, MapPin, Search, SlidersHorizontal, Sparkles } from "lucide-react";

import { MarketplaceFilterContent } from "@/components/filters/marketplace/MarketplaceFilterContent";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { useFilters } from "@/hooks/useFilters";

export function MarketplaceFilters() {
  const filtersApi = useFilters();
  const { filters, updateFilter, activeFilterCount, categories } = filtersApi;
  const [isMobileFilterOpen, setIsMobileFilterOpen] = React.useState(false);

  return (
    <div className="bg-background min-h-screen">
      <div className="bg-background border-border sticky top-0 z-50 border-b shadow-sm">
        <div className="mx-auto max-w-7xl px-4 py-3">
          <div className="flex items-center gap-3">
            <Sheet open={isMobileFilterOpen} onOpenChange={setIsMobileFilterOpen}>
              <SheetTrigger asChild>
                <Button variant="outline" size="sm" className="flex items-center gap-2 lg:hidden">
                  <SlidersHorizontal className="h-4 w-4" />
                  Filtre
                  {activeFilterCount > 0 && (
                    <span className="bg-primary text-primary-foreground ml-1 flex h-5 w-5 items-center justify-center rounded-full text-xs">
                      {activeFilterCount}
                    </span>
                  )}
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="ro-filters-surface w-full border-border bg-background p-0 sm:max-w-md">
                <SheetHeader className="ro-filters-surface-header border-b border-border px-4 py-3">
                  <SheetTitle>Filtre</SheetTitle>
                </SheetHeader>
                <ScrollArea className="h-[calc(100vh-60px)]">
                  <MarketplaceFilterContent {...filtersApi} />
                </ScrollArea>
              </SheetContent>
            </Sheet>

            <div className="flex flex-1 items-center gap-2">
              <div className="relative max-w-md flex-1">
                <Search className="text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
                <Input
                  placeholder="Caută produse..."
                  value={filters.search}
                  onChange={(e) => updateFilter("search", e.target.value)}
                  className="h-9 pl-9"
                />
              </div>

              <div className="hidden items-center gap-2 lg:flex">
                <Select
                  {...(filters.category ? { value: filters.category } : {})}
                  onValueChange={(value) => updateFilter("category", value)}
                >
                  <SelectTrigger className="h-9 w-[160px]">
                    <SelectValue placeholder="Categorie" />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((cat) => (
                      <SelectItem key={cat.value} value={cat.value}>
                        {cat.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <div className="relative w-[180px]">
                  <MapPin className="text-muted-foreground absolute top-1/2 left-3 z-10 h-4 w-4 -translate-y-1/2" />
                  <Input
                    placeholder="Toată România"
                    value={filters.location}
                    onChange={(e) => updateFilter("location", e.target.value)}
                    className="h-9 pl-9 pr-9"
                  />
                  <ChevronDown className="text-muted-foreground pointer-events-none absolute top-1/2 right-3 h-4 w-4 -translate-y-1/2" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4 py-6">
        <div className="flex gap-6">
          <aside className="hidden w-72 flex-shrink-0 lg:block">
            <div className="ro-filters-surface border-border bg-card sticky top-24 overflow-hidden rounded-xl border shadow-lg">
              <div className="ro-filters-surface-header border-border border-b bg-gradient-to-br from-primary/10 via-primary/5 to-transparent px-4 py-3">
                <h2 className="flex items-center gap-2 text-base font-semibold">
                  <Sparkles className="text-primary h-5 w-5" />
                  Filtre
                </h2>
              </div>
              <ScrollArea className="h-[calc(100vh-180px)]">
                <MarketplaceFilterContent {...filtersApi} />
              </ScrollArea>
            </div>
          </aside>

          <main className="flex-1">
            <div className="border-border bg-gradient-to-br from-card to-muted/20 rounded-xl border p-8 shadow-lg">
              <div className="text-muted-foreground text-center">
                <Sparkles className="text-primary/40 mx-auto mb-4 h-12 w-12" />
                <p className="mb-2 text-base font-medium">Rezultatele căutării vor fi afișate aici</p>
                <p className="text-sm">
                  {activeFilterCount > 0 ? `${activeFilterCount} filtre active` : "Niciun filtru activ"}
                </p>
                {filters.freeOnly && <p className="text-primary mt-2 text-sm font-medium">Afișare doar produse gratuite</p>}
              </div>
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
