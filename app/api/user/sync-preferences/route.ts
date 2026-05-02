import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


/**
 * POST /api/user/sync-preferences
 * Salvează în baza de date tot ce e în localStorage (favorite, unlocked, preferințe, etc.).
 * Body: obiect cu chei ca în localStorage.
 */
export async function POST(request: NextRequest) {
  try {
    if (!supabaseAdmin) {
      return NextResponse.json(
        { error: "Supabase admin client not configured" },
        { status: 500 }
      );
    }
    const supabase = supabaseAdmin;

    const authHeader = request.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json(
        { error: "Missing or invalid authorization" },
        { status: 401 }
      );
    }

    const token = authHeader.replace("Bearer ", "").trim();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return NextResponse.json(
        { error: "Invalid access token" },
        { status: 401 }
      );
    }

    const userId = user.id;
    const body = (await request.json().catch(() => ({}))) as {
      favoriteAuctions?: string[];
      unlockedAuctions?: string[];
      user_search_history?: string[];
      savedFilters?: Record<string, unknown>;
      darkMode?: boolean | string;
      showHeaderNameDesktop?: string | boolean;
      auctionNotifications?: Record<string, unknown>;
      recentlyViewedProducts?: string[] | { id: string }[];
      user_custom_buttons?: unknown[];
      preferences?: Record<string, unknown>;
    };

    const results: { updated: string[]; errors: string[] } = {
      updated: [],
      errors: [],
    };

    // 1) Favorite (auction IDs) -> user_favorites (item_type = 'auction')
    const favoriteIds = Array.isArray(body.favoriteAuctions)
      ? body.favoriteAuctions.filter((id) => typeof id === "string" && id.trim())
      : [];
    if (favoriteIds.length > 0) {
      for (const itemId of favoriteIds) {
        const { error } = await supabase.from("user_favorites").insert({
          user_id: userId,
          item_id: itemId,
          item_type: "auction",
        });
        if (error) {
          if (error.code !== "23505") results.errors.push(`favorite ${itemId}: ${error.message}`);
        } else {
          results.updated.push("favoriteAuctions");
        }
      }
      if (favoriteIds.length && !results.errors.some((e) => e.startsWith("favorite "))) {
        if (!results.updated.includes("favoriteAuctions")) results.updated.push("favoriteAuctions");
      }
    }

    // 2) Unlocked (product IDs) -> user_unlocked_products (doar dacă produsul există)
    const unlockedIds = Array.isArray(body.unlockedAuctions)
      ? body.unlockedAuctions.filter((id) => typeof id === "string" && id.trim())
      : [];
    if (unlockedIds.length > 0) {
      for (const productId of unlockedIds) {
        const { error } = await supabase.from("user_unlocked_products").upsert(
          {
            user_id: userId,
            product_id: productId,
          },
          { onConflict: "user_id,product_id" }
        );
        if (error) results.errors.push(`unlocked ${productId}: ${error.message}`);
        else results.updated.push("unlockedAuctions");
      }
    }

    // 3) user_settings: preferences, saved_filters, search_history, recently_viewed, auction_notifications
    const upsertSetting = async (
      category: string,
      data: Record<string, unknown> | unknown[]
    ) => {
      const { error } = await supabase.from("user_settings").upsert(
        {
          user_id: userId,
          category,
          data: data as Record<string, unknown>,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id,category" }
      );
      if (error) results.errors.push(`${category}: ${error.message}`);
      else results.updated.push(category);
    };

    if (body.preferences && typeof body.preferences === "object") {
      await upsertSetting("preferences", body.preferences);
    } else {
      const prefs: Record<string, unknown> = {};
      if (body.darkMode !== undefined) prefs.darkMode = body.darkMode;
      if (body.showHeaderNameDesktop !== undefined)
        prefs.showHeaderNameDesktop = String(body.showHeaderNameDesktop);
      if (Object.keys(prefs).length > 0) await upsertSetting("preferences", prefs);
    }

    if (body.savedFilters && typeof body.savedFilters === "object") {
      await upsertSetting("saved_filters", body.savedFilters as Record<string, unknown>);
    }

    if (Array.isArray(body.user_search_history)) {
      const arr = body.user_search_history
        .filter((q) => typeof q === "string")
        .slice(0, 50);
      if (arr.length > 0) await upsertSetting("search_history", arr as unknown as Record<string, unknown>);
    }

    if (body.auctionNotifications && typeof body.auctionNotifications === "object") {
      await upsertSetting(
        "auction_notifications",
        body.auctionNotifications as Record<string, unknown>
      );
    }

    const recentRaw = body.recentlyViewedProducts;
    if (Array.isArray(recentRaw) && recentRaw.length > 0) {
      const ids = recentRaw
        .map((x) => (typeof x === "string" ? x : (x as { id?: string })?.id))
        .filter((id): id is string => typeof id === "string" && id.length > 0)
        .slice(0, 100);
      if (ids.length > 0) {
        await upsertSetting("recently_viewed", ids as unknown as Record<string, unknown>);
        // Opțional: scrie și în user_recently_viewed dacă tabelul există
        for (const productId of ids) {
          await supabase
            .from("user_recently_viewed")
            .upsert(
              {
                user_id: userId,
                product_id: productId,
                viewed_at: new Date().toISOString(),
              },
              { onConflict: "user_id,product_id" }
            )
            .then(({ error }) => {
              if (error) results.errors.push(`recently_viewed row: ${error.message}`);
            });
        }
      }
    }

    // 4) user_custom_buttons (tabel dedicat)
    if (Array.isArray(body.user_custom_buttons)) {
      const { error } = await supabase.from("user_custom_buttons").upsert(
        {
          user_id: userId,
          button_config: body.user_custom_buttons,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" }
      );
      if (error) results.errors.push(`user_custom_buttons: ${error.message}`);
      else results.updated.push("user_custom_buttons");
    }

    return NextResponse.json({
      success: true,
      updated: [...new Set(results.updated)],
      errors: results.errors.length > 0 ? results.errors : undefined,
    });
  } catch (e) {
    console.error("sync-preferences error:", e);
    return NextResponse.json(
      { error: "Server error", details: e instanceof Error ? e.message : "" },
      { status: 500 }
    );
  }
}

/**
 * GET /api/user/sync-preferences
 * Returnează preferințele salvate în DB (pentru a umple localStorage la login).
 */
export async function GET(request: NextRequest) {
  try {
    if (!supabaseAdmin) {
      return NextResponse.json(
        { error: "Supabase admin client not configured" },
        { status: 500 }
      );
    }
    const supabase = supabaseAdmin;

    const authHeader = request.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json(
        { error: "Missing or invalid authorization" },
        { status: 401 }
      );
    }

    const token = authHeader.replace("Bearer ", "").trim();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return NextResponse.json(
        { error: "Invalid access token" },
        { status: 401 }
      );
    }

    const userId = user.id;

    const { data: settingsRows } = await supabase
      .from("user_settings")
      .select("category, data")
      .eq("user_id", userId);

    const { data: favorites } = await supabase
      .from("user_favorites")
      .select("item_id, item_type")
      .eq("user_id", userId)
      .eq("item_type", "auction");

    const { data: unlocked } = await supabase
      .from("user_unlocked_products")
      .select("product_id")
      .eq("user_id", userId);

    const { data: customButtons } = await supabase
      .from("user_custom_buttons")
      .select("button_config")
      .eq("user_id", userId)
      .maybeSingle();

    const byCategory: Record<string, unknown> = {};
    for (const row of settingsRows ?? []) {
      byCategory[row.category] = row.data;
    }

    return NextResponse.json({
      preferences: byCategory.preferences ?? {},
      saved_filters: byCategory.saved_filters ?? null,
      search_history: byCategory.search_history ?? [],
      recently_viewed: byCategory.recently_viewed ?? [],
      auction_notifications: byCategory.auction_notifications ?? null,
      favoriteAuctions: (favorites ?? []).map((f) => f.item_id),
      unlockedAuctions: (unlocked ?? []).map((u) => u.product_id),
      user_custom_buttons: customButtons?.button_config ?? [],
    });
  } catch (e) {
    console.error("sync-preferences GET error:", e);
    return NextResponse.json(
      { error: "Server error", details: e instanceof Error ? e.message : "" },
      { status: 500 }
    );
  }
}
