/**
 * GET /api/search/results
 * Never-empty search results with scenario ladder + infinite waterfall pagination.
 * Params: q, lang, categorySlug?, subcategorySlug?, locationId? (city), cursor?, scenarioIndex?
 *
 * Phase 5: listing rows via `search_ro_listings_enterprise` (same predicate stack as /ro).
 */

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { buildScenarios, type SearchScenario } from "@/lib/search/fallbackLadder";
import { fetchEnterpriseSearchRows } from "@/lib/search/enterpriseSearchResults";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export const runtime = "nodejs";
export const maxDuration = 10;

const PAGE_SIZE = 20;
const MAX_SCENARIOS = 15;

function normalizeCategoryKey(s: string | null | undefined): string {
  if (!s || s === "all") return "all";
  return String(s).toLowerCase().trim().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
}

function mapEnterpriseRow(p: Record<string, unknown>) {
  const images = p.images as unknown;
  const imageUrl = Array.isArray(images) && images.length > 0
    ? (typeof images[0] === "string" ? images[0] : (images[0] as { url?: string })?.url)
    : undefined;
  const url =
    (p.url as string | undefined) ||
    (p.slug ? `/licitatii-publice/${p.slug}` : `/licitatii-publice/${p.id}`);
  return {
    id: p.id,
    title: p.title,
    description: p.description,
    image: imageUrl,
    price: p.starting_price_ron,
    category: p.category,
    subcategory: p.subcategory,
    url,
    city: p.city,
    county: p.county,
  };
}

export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;
    const q = (params.get("q") || "").trim();
    const categorySlug = params.get("categorySlug") || params.get("category") || "";
    const subcategorySlug = params.get("subcategorySlug") || params.get("subcategory") || "";
    const locationId = (params.get("locationId") || params.get("location") || "").trim();
    const cursor = Math.max(0, parseInt(params.get("cursor") || "0", 10));
    let scenarioIndex = Math.max(0, parseInt(params.get("scenarioIndex") || "0", 10));

    if (!supabaseAdmin) {
      return NextResponse.json(
        {
          items: [],
          meta: { expandedLocation: false, expandedCategory: false, termsReduced: false },
          usedScenario: null,
          next: null,
        },
        { status: 200 },
      );
    }

    const categoryKey = normalizeCategoryKey(categorySlug) || "all";
    const subcategoryKey = normalizeCategoryKey(subcategorySlug) || "all";
    const location = locationId && locationId !== "all" ? locationId : "all";

    const filters = {
      location,
      categoryKey: categoryKey === "all" && q ? "all" : categoryKey,
      subcategoryKey: subcategoryKey === "all" && q ? "all" : subcategoryKey,
      query: q,
    };

    const scenarios = buildScenarios(filters).slice(0, MAX_SCENARIOS);

    let scenario: SearchScenario | undefined = scenarios[scenarioIndex];
    let items: any[] = [];
    let usedScenario: {
      scenarioIndex: number;
      locationMode: string;
      categorySlug?: string;
      subcategorySlug?: string;
      usedTokens: string[];
    } | null = null;
    let meta = { expandedLocation: false, expandedCategory: false, termsReduced: false };

    while (scenarioIndex < scenarios.length) {
      scenario = scenarios[scenarioIndex];
      if (!scenario) break;

      const tokenQ = scenario.tokenStep && scenario.tokenStep.trim() ? scenario.tokenStep.trim() : q;
      const loc =
        scenario.locationMode === "strict" && location && location !== "all" ? location : "all";

      try {
        const rows = (
          await fetchEnterpriseSearchRows({
            q: tokenQ,
            categoryKey: scenario.categoryKey ?? "all",
            subcategoryKey: scenario.subcategoryKey ?? "all",
            location: loc,
            offset: cursor,
            limit: PAGE_SIZE,
          })
        ).slice(0, PAGE_SIZE);
        const list = rows.map(mapEnterpriseRow);

        if (list.length > 0) {
          items = list;
          meta = {
            expandedLocation: scenario.reasonFlags.locationExpanded,
            expandedCategory: scenario.reasonFlags.categoryExpanded,
            termsReduced: scenario.reasonFlags.termsReduced,
          };
          usedScenario = {
            scenarioIndex,
            locationMode: scenario.locationMode,
            categorySlug: scenario.categoryKey !== "all" ? scenario.categoryKey : undefined,
            subcategorySlug: scenario.subcategoryKey !== "all" ? scenario.subcategoryKey : undefined,
            usedTokens: scenario.tokenStep ? [scenario.tokenStep] : [],
          };
          break;
        }
      } catch (err) {
        console.warn("[search/results] enterprise rpc", err);
      }

      scenarioIndex++;
    }

    if (items.length === 0 && scenarioIndex >= scenarios.length) {
      try {
        const rows = (
          await fetchEnterpriseSearchRows({
            q: "",
            categoryKey: "all",
            subcategoryKey: "all",
            location: "all",
            offset: 0,
            limit: PAGE_SIZE,
          })
        ).slice(0, PAGE_SIZE);
        if (rows.length > 0) {
          items = rows.map(mapEnterpriseRow);
          meta = { expandedLocation: true, expandedCategory: true, termsReduced: true };
          usedScenario = { scenarioIndex: -1, locationMode: "all", usedTokens: [] };
        }
      } catch (err) {
        console.warn("[search/results] enterprise fallback", err);
      }
    }

    const hasMore = items.length >= PAGE_SIZE;
    const next = hasMore
      ? { scenarioIndex: usedScenario?.scenarioIndex ?? scenarioIndex, cursor: cursor + PAGE_SIZE }
      : scenarioIndex + 1 < scenarios.length
        ? { scenarioIndex: scenarioIndex + 1, cursor: 0 }
        : null;

    return NextResponse.json({
      items,
      meta,
      usedScenario,
      next,
    });
  } catch (e: unknown) {
    console.error("[search/results]", e);
    return NextResponse.json(
      {
        items: [],
        meta: { expandedLocation: false, expandedCategory: false, termsReduced: false },
        usedScenario: null,
        next: null,
        error: e instanceof Error ? e.message : "error",
      },
      { status: 200 },
    );
  }
}
