"use client";

import { Gift, MapPin } from "lucide-react";

import { MarketplaceFilterSection } from "@/components/filters/marketplace/MarketplaceFilterSection";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import type { UseFiltersReturn } from "@/hooks/useFilters";

export function MarketplaceFilterContent({ filters, updateFilter, resetFilters, activeFilterCount, categories }: UseFiltersReturn) {
  return (
    <div className="space-y-0">
      <MarketplaceFilterSection title="Locație" defaultOpen={true}>
        <div className="space-y-3">
          <div className="relative">
            <MapPin className="text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
            <Input
              placeholder="Toată România"
              value={filters.location}
              onChange={(e) => updateFilter("location", e.target.value)}
              className="h-9 pl-9"
            />
          </div>
          <div className="space-y-2">
            <Label className="text-sm font-medium">Rază maximă: {filters.radius} km</Label>
            <input
              type="range"
              min="5"
              max="200"
              step="5"
              value={filters.radius}
              onChange={(e) => updateFilter("radius", e.target.value)}
              className="bg-muted slider h-2 w-full cursor-pointer appearance-none rounded-lg"
            />
            <div className="text-muted-foreground flex justify-between text-xs">
              <span>5 km</span>
              <span>200 km</span>
            </div>
          </div>
        </div>
      </MarketplaceFilterSection>

      <MarketplaceFilterSection title="Categorie" defaultOpen={false}>
        <div className="space-y-2">
          {categories.map((cat) => (
            <div key={cat.value} className="flex items-center space-x-2">
              <Checkbox
                id={`mkt-cat-${cat.value}`}
                checked={filters.category === cat.value}
                onCheckedChange={(checked) => {
                  updateFilter("category", checked ? cat.value : "");
                }}
              />
              <Label htmlFor={`mkt-cat-${cat.value}`} className="cursor-pointer text-sm font-normal">
                {cat.label}
              </Label>
            </div>
          ))}
        </div>
      </MarketplaceFilterSection>

      <MarketplaceFilterSection title="Preț" defaultOpen={false}>
        <div className="space-y-3">
          <div className="flex items-center space-x-2">
            <Checkbox
              id="free-only"
              checked={filters.freeOnly}
              onCheckedChange={(checked) => {
                updateFilter("freeOnly", checked === true);
                if (checked) {
                  updateFilter("priceMin", "");
                  updateFilter("priceMax", "");
                }
              }}
            />
            <Label htmlFor="free-only" className="flex cursor-pointer items-center gap-1.5 text-sm font-medium">
              <Gift className="h-4 w-4" />
              Doar produse gratuite
            </Label>
          </div>

          {!filters.freeOnly && (
            <div className="flex gap-2">
              <Input
                type="number"
                placeholder="Min"
                value={filters.priceMin}
                onChange={(e) => updateFilter("priceMin", e.target.value)}
                className="h-9"
              />
              <span className="text-muted-foreground self-center">-</span>
              <Input
                type="number"
                placeholder="Max"
                value={filters.priceMax}
                onChange={(e) => updateFilter("priceMax", e.target.value)}
                className="h-9"
              />
            </div>
          )}
        </div>
      </MarketplaceFilterSection>

      <MarketplaceFilterSection title="Stare" defaultOpen={false}>
        <RadioGroup value={filters.condition} onValueChange={(value) => updateFilter("condition", value)}>
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="all" id="mkt-all" />
            <Label htmlFor="mkt-all" className="cursor-pointer text-sm font-normal">
              Toate
            </Label>
          </div>
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="new" id="mkt-new" />
            <Label htmlFor="mkt-new" className="cursor-pointer text-sm font-normal">
              Nou
            </Label>
          </div>
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="used" id="mkt-used" />
            <Label htmlFor="mkt-used" className="cursor-pointer text-sm font-normal">
              Folosit
            </Label>
          </div>
        </RadioGroup>
      </MarketplaceFilterSection>

      <MarketplaceFilterSection title="Data publicării" defaultOpen={false}>
        <RadioGroup value={filters.datePosted} onValueChange={(value) => updateFilter("datePosted", value)}>
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="all" id="mkt-date-all" />
            <Label htmlFor="mkt-date-all" className="cursor-pointer text-sm font-normal">
              Orice
            </Label>
          </div>
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="today" id="mkt-today" />
            <Label htmlFor="mkt-today" className="cursor-pointer text-sm font-normal">
              Ultima zi
            </Label>
          </div>
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="week" id="mkt-week" />
            <Label htmlFor="mkt-week" className="cursor-pointer text-sm font-normal">
              Ultima săptămână
            </Label>
          </div>
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="month" id="mkt-month" />
            <Label htmlFor="mkt-month" className="cursor-pointer text-sm font-normal">
              Ultima lună
            </Label>
          </div>
        </RadioGroup>
      </MarketplaceFilterSection>

      <MarketplaceFilterSection title="Opțiuni de livrare" defaultOpen={false}>
        <div className="space-y-2">
          {["Livrare disponibilă", "Ridicare personală"].map((option) => (
            <div key={option} className="flex items-center space-x-2">
              <Checkbox
                id={`mkt-del-${option}`}
                checked={filters.delivery.includes(option)}
                onCheckedChange={(checked) => {
                  if (checked) {
                    updateFilter("delivery", [...filters.delivery, option]);
                  } else {
                    updateFilter(
                      "delivery",
                      filters.delivery.filter((d) => d !== option),
                    );
                  }
                }}
              />
              <Label htmlFor={`mkt-del-${option}`} className="cursor-pointer text-sm font-normal">
                {option}
              </Label>
            </div>
          ))}
        </div>
      </MarketplaceFilterSection>

      {activeFilterCount > 0 && (
        <div className="p-4">
          <Button variant="outline" size="sm" onClick={resetFilters} className="w-full">
            Resetează filtrele
          </Button>
        </div>
      )}
    </div>
  );
}
