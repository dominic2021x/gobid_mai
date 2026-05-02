/**
 * Verification: rules output slugs exist in taxonomy; extravilan ≠ agricole; exclusions; verifyTaxonomy for each.
 * Run: npx tsx scripts/verify-auto-categorize-alignment.ts
 * No DB required. For full integration (apply + listings), see docs/RO_AUTO_CATEGORIZE.md.
 */
import { classifyLandRO } from "@/lib/categorization/rules/roLandRules";
import { verifyTaxonomy } from "@/lib/categorization/verifyTaxonomy";
import { RO_LAND_TAXONOMY, RO_CATEGORIES } from "@/lib/data/ro-categories";
import { RO_LEVEL3_BY_SUBCATEGORY } from "@/lib/taxonomy/ro/taxonomy";

function assertVerify(result: { category: string; subcategory: string; level3?: string }) {
  const v = verifyTaxonomy({
    categorySlug: result.category,
    subcategorySlug: result.subcategory,
    level3Slug: result.level3 ?? undefined,
  });
  if (!v.valid) {
    console.error("   verifyTaxonomy FAIL:", v.error);
    process.exit(1);
  }
}

function main() {
  // 1) Teren intravilan → terenuri + level3 terenuri-intravilane
  console.log("1) Teren intravilan → terenuri + level3 terenuri-intravilane");
  const r1 = classifyLandRO({ title: "Teren intravilan de vanzare" });
  if (!r1 || r1.subcategory !== RO_LAND_TAXONOMY.subcategory || r1.level3 !== RO_LAND_TAXONOMY.level3Intravilan || r1.confidence !== 1) {
    console.error("   FAIL: expected subcategory terenuri + level3 terenuri-intravilane, got", r1);
    process.exit(1);
  }
  assertVerify(r1);
  console.log("   OK:", r1.subcategory, r1.level3, r1.reason);

  // 2) Teren extravilan → terenuri + level3 extravilan (NOT agricole)
  console.log("2) Teren extravilan → terenuri + level3 extravilan, NOT agricole");
  const r2 = classifyLandRO({ title: "Teren extravilan" });
  if (!r2 || r2.subcategory !== RO_LAND_TAXONOMY.subcategory || r2.level3 !== RO_LAND_TAXONOMY.level3Extravilan) {
    console.error("   FAIL: expected subcategory terenuri + level3 terenuri-extravilane, got", r2?.subcategory, r2?.level3, r2);
    process.exit(1);
  }
  if (r2.level3 === RO_LAND_TAXONOMY.level3Agricol) {
    console.error("   FAIL: extravilan must not map to agricole");
    process.exit(1);
  }
  assertVerify(r2);
  console.log("   OK:", r2.subcategory, r2.level3, r2.reason);

  // 3) Teren extravilan agricol → terenuri + level3 agricole
  console.log("3) Teren extravilan agricol → terenuri + level3 terenuri-agricole");
  const r3 = classifyLandRO({ title: "Teren extravilan agricol" });
  if (!r3 || r3.subcategory !== RO_LAND_TAXONOMY.subcategory || r3.level3 !== RO_LAND_TAXONOMY.level3Agricol || r3.confidence !== 1) {
    console.error("   FAIL: expected subcategory terenuri + level3 terenuri-agricole, got", r3);
    process.exit(1);
  }
  assertVerify(r3);
  console.log("   OK:", r3.subcategory, r3.level3, r3.reason);

  // 4) Teren de sport → null
  console.log("4) Teren de sport → null (exclusion)");
  const r4 = classifyLandRO({ title: "Teren de sport" });
  if (r4 !== null) {
    console.error("   FAIL: expected null for sports exclusion, got", r4);
    process.exit(1);
  }
  console.log("   OK: null");

  // 5) Taxonomy: terenuri subcategory and level3 slugs exist
  console.log("5) Taxonomy: RO_LAND_TAXONOMY subcategory terenuri and level3 slugs");
  const cat = RO_CATEGORIES[RO_LAND_TAXONOMY.category];
  if (!cat?.subcategories?.includes(RO_LAND_TAXONOMY.subcategory)) {
    console.error("   FAIL: missing subcategory terenuri");
    process.exit(1);
  }
  const level3List = RO_LEVEL3_BY_SUBCATEGORY[RO_LAND_TAXONOMY.subcategory];
  if (!level3List?.includes(RO_LAND_TAXONOMY.level3Intravilan) || !level3List?.includes(RO_LAND_TAXONOMY.level3Extravilan) || !level3List?.includes(RO_LAND_TAXONOMY.level3Agricol)) {
    console.error("   FAIL: level3 for terenuri missing");
    process.exit(1);
  }
  console.log("   OK: terenuri + level3 in taxonomy");

  console.log("6) applyCategoryChange writes same columns as /api/ro/listings:");
  console.log("   - products.category, products.subcategory, products.category_level_3 (optional)");
  console.log("   See lib/categorization/applyCategoryChange.ts (updatePayload).");

  console.log("\nManual integration (local/dev):");
  console.log("  - Teren extravilan => cron => subcategory terenuri, category_level_3 terenuri-extravilane.");
  console.log("  - Teren extravilan agricol => cron => subcategory terenuri, category_level_3 terenuri-agricole.");
  console.log("  - Teren de sport => not moved.");
  console.log("  - GET /api/ro/listings?category=imobiliare&subcategory=terenuri returns all terenuri (incl. level3); use level3= for specific type.");
}

main();
