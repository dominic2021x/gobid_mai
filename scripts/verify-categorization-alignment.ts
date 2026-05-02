/**
 * Verify enterprise categorization: taxonomy validity + expected outputs for real-estate, auto, fashion.
 * Run: npx tsx scripts/verify-categorization-alignment.ts
 */

import { classify } from "@/lib/categorization/engine";
import { verifyTaxonomy } from "@/lib/categorization/verifyTaxonomy";
import { RO_CATEGORIES } from "@/lib/data/ro-categories";
import { RO_LAND_TAXONOMY } from "@/lib/data/ro-categories";

type Case = { name: string; title: string; expectCategory: string; expectSubcategory: string; expectLevel3?: string; expectAttributes?: Record<string, string> };

const cases: Case[] = [
  { name: "teren extravilan agricol", title: "Teren extravilan agricol de vanzare", expectCategory: "imobiliare", expectSubcategory: RO_LAND_TAXONOMY.subcategory, expectLevel3: RO_LAND_TAXONOMY.level3Agricol },
  { name: "SUV diesel", title: "SUV diesel 4x4", expectCategory: "autovehicule", expectSubcategory: "suv-4x4", expectAttributes: { fuel: "diesel", bodyType: "suv" } },
  { name: "berlina benzina", title: "Berlina benzina", expectCategory: "autovehicule", expectSubcategory: "autoturisme", expectAttributes: { fuel: "benzina", bodyType: "berlina" } },
  { name: "piese auto", title: "Piese auto anvelope", expectCategory: "autovehicule", expectSubcategory: "piese-auto", expectAttributes: { partType: "anvelope" } },
  { name: "geanta", title: "Geanta dama", expectCategory: "moda", expectSubcategory: "genti-accesorii", expectAttributes: { accessoryType: "geanta" } },
  { name: "pantaloni", title: "Pantaloni barbati", expectCategory: "moda", expectSubcategory: "haine-designer", expectAttributes: { apparelType: "pantaloni" } },
  { name: "tenisi", title: "Tenisi sport", expectCategory: "moda", expectSubcategory: "incaltaminte", expectAttributes: { footwearType: "tenisi" } },
];

function main() {
  console.log("Enterprise categorization alignment checks\n");

  for (const c of cases) {
    console.log(`Case: ${c.name}`);
    const result = classify({ title: c.title });
    if (!result) {
      console.error(`  FAIL: no classification for "${c.title}"`);
      process.exit(1);
    }
    if (result.categorySlug !== c.expectCategory || result.subcategorySlug !== c.expectSubcategory) {
      console.error(`  FAIL: expected ${c.expectCategory}/${c.expectSubcategory}, got ${result.categorySlug}/${result.subcategorySlug}`);
      process.exit(1);
    }
    if (c.expectLevel3 != null && result.level3Slug !== c.expectLevel3) {
      console.error(`  FAIL: expected level3 ${c.expectLevel3}, got ${result.level3Slug}`);
      process.exit(1);
    }
    const v = verifyTaxonomy({
      categorySlug: result.categorySlug,
      subcategorySlug: result.subcategorySlug,
      level3Slug: result.level3Slug ?? undefined,
    });
    if (!v.valid) {
      console.error(`  FAIL: verifyTaxonomy: ${v.error}`);
      process.exit(1);
    }
    if (c.expectAttributes) {
      for (const [k, val] of Object.entries(c.expectAttributes)) {
        const got = (result.attributes as Record<string, string>)?.[k];
        if (got !== val) {
          console.error(`  FAIL: attribute ${k} expected "${val}", got "${got}"`);
          process.exit(1);
        }
      }
    }
    console.log(`  OK: ${result.categorySlug}/${result.subcategorySlug}`, result.attributes && Object.keys(result.attributes).length ? result.attributes : "");
  }

  console.log("\nTaxonomy: RO_CATEGORIES has autovehicule + moda + imobiliare");
  if (!RO_CATEGORIES["autovehicule"] || !RO_CATEGORIES["moda"] || !RO_CATEGORIES["imobiliare"]) {
    console.error("FAIL: missing category");
    process.exit(1);
  }
  console.log("  OK");

  console.log("\nAll checks passed.");
}

main();
