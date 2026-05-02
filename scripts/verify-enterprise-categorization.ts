/**
 * Verify enterprise categorization: run test titles through the engine and assert
 * valid taxonomy targets and expected attributes. Run: npx tsx scripts/verify-enterprise-categorization.ts
 */

import { classify } from "@/lib/categorization/engine";
import { isValidCategory, isValidSubcategory, isLevel3Valid } from "@/lib/taxonomy/ro";

type TestCase = {
  title: string;
  description?: string;
  expectCategory: string;
  expectSubcategory: string;
  expectLevel3?: string;
  expectAttributes?: Record<string, string>;
  minConfidence?: number;
};

const TESTS: TestCase[] = [
  { title: "Apartament 3 camere centru Bucuresti", expectCategory: "imobiliare", expectSubcategory: "apartamente", minConfidence: 0.9 },
  { title: "Casa cu gradina", expectCategory: "imobiliare", expectSubcategory: "case-vile", minConfidence: 0.9 },
  { title: "Teren intravilan constructii", expectCategory: "imobiliare", expectSubcategory: "terenuri-intravilane", minConfidence: 0.85 },
  { title: "Teren agricol 5 ha", expectCategory: "imobiliare", expectSubcategory: "terenuri-agricole", minConfidence: 0.85 },
  { title: "BMW Seria 3 diesel", expectCategory: "autovehicule", expectSubcategory: "autoturisme", minConfidence: 0.85 },
  { title: "Motocicleta Honda CBR", expectCategory: "autovehicule", expectSubcategory: "motociclete", minConfidence: 0.9 },
  { title: "Camion Volvo FH", expectCategory: "autovehicule", expectSubcategory: "camioane", minConfidence: 0.9 },
  { title: "Piese auto anvelope", expectCategory: "autovehicule", expectSubcategory: "piese-auto", minConfidence: 0.85 },
  { title: "iPhone 15 Pro 256GB", expectCategory: "electronice", expectSubcategory: "telefoane", minConfidence: 0.9 },
  { title: "Laptop Dell XPS", expectCategory: "electronice", expectSubcategory: "laptopuri-pc", minConfidence: 0.85 },
  { title: "Rochie seara eleganta", expectCategory: "moda", expectSubcategory: "haine-designer", minConfidence: 0.85 },
  { title: "Pantofi sport Nike", expectCategory: "moda", expectSubcategory: "incaltaminte", minConfidence: 0.85 },
  { title: "Jucarii Lego pentru copii", expectCategory: "mama-copil", expectSubcategory: "jucarii", minConfidence: 0.9 },
  { title: "Carucior bebelus", expectCategory: "mama-copil", expectSubcategory: "carucioare", minConfidence: 0.9 },
  { title: "Canapea extensibila", expectCategory: "casa", expectSubcategory: "mobilier-interior", minConfidence: 0.85 },
  { title: "Frigider Samsung", expectCategory: "casa", expectSubcategory: "electrocasnice", minConfidence: 0.85 },
];

function run() {
  let passed = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const test of TESTS) {
    const result = classify({
      title: test.title,
      description: test.description,
    });

    if (!result) {
      failed += 1;
      errors.push(`"${test.title.slice(0, 50)}" → no result (expected ${test.expectCategory}/${test.expectSubcategory})`);
      continue;
    }

    if (!isValidCategory(result.categorySlug)) {
      failed += 1;
      errors.push(`"${test.title.slice(0, 50)}" → invalid category slug: ${result.categorySlug}`);
      continue;
    }
    if (!isValidSubcategory(result.categorySlug, result.subcategorySlug)) {
      failed += 1;
      errors.push(`"${test.title.slice(0, 50)}" → invalid subcategory: ${result.categorySlug}/${result.subcategorySlug}`);
      continue;
    }
    if (result.level3Slug && !isLevel3Valid(result.categorySlug, result.subcategorySlug, result.level3Slug)) {
      failed += 1;
      errors.push(`"${test.title.slice(0, 50)}" → invalid level3: ${result.level3Slug}`);
      continue;
    }

    if (result.categorySlug !== test.expectCategory || result.subcategorySlug !== test.expectSubcategory) {
      failed += 1;
      errors.push(
        `"${test.title.slice(0, 50)}" → got ${result.categorySlug}/${result.subcategorySlug}, expected ${test.expectCategory}/${test.expectSubcategory}`
      );
      continue;
    }

    const minConf = test.minConfidence ?? 0.75;
    if (result.confidence < minConf) {
      failed += 1;
      errors.push(`"${test.title.slice(0, 50)}" → confidence ${result.confidence} < ${minConf}`);
      continue;
    }

    if (test.expectLevel3 != null && result.level3Slug !== test.expectLevel3) {
      failed += 1;
      errors.push(`"${test.title.slice(0, 50)}" → level3 got ${result.level3Slug}, expected ${test.expectLevel3}`);
      continue;
    }

    if (test.expectAttributes) {
      for (const [k, v] of Object.entries(test.expectAttributes)) {
        const av = (result.attributes as Record<string, string>)?.[k];
        if (av !== v) {
          failed += 1;
          errors.push(`"${test.title.slice(0, 50)}" → attribute ${k}=${av}, expected ${v}`);
          break;
        }
      }
      if (failed > 0 && errors[errors.length - 1].includes("attribute")) continue;
    }

    passed += 1;
  }

  console.log(`\nEnterprise categorization verify: ${passed} passed, ${failed} failed (total ${TESTS.length})\n`);
  if (errors.length) {
    errors.forEach((e) => console.error("  ", e));
    process.exit(1);
  }
  console.log("All tests passed.");
}

run();
