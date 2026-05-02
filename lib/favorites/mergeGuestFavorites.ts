import type { Session } from "@supabase/supabase-js";

const LS_FAVORITES = "favoriteAuctions";
const LS_TS = "favoriteAuctionsTimestamp";

/**
 * Mută favoritele guest din localStorage (aceeași sursă ca /ro) în contul Supabase.
 * Apelabil după login; ignoră duplicatele (API răspunde alreadyExists).
 */
export async function mergeGuestFavoritesIntoSupabase(
  session: Session,
): Promise<{ attempted: number; saved: number }> {
  if (typeof window === "undefined") {
    return { attempted: 0, saved: 0 };
  }

  const raw = localStorage.getItem(LS_FAVORITES);
  if (!raw) {
    return { attempted: 0, saved: 0 };
  }

  let ids: unknown;
  try {
    ids = JSON.parse(raw);
  } catch {
    return { attempted: 0, saved: 0 };
  }

  if (!Array.isArray(ids) || ids.length === 0) {
    return { attempted: 0, saved: 0 };
  }

  const token = session.access_token;
  if (!token) {
    return { attempted: 0, saved: 0 };
  }

  const list = ids.filter((x): x is string => typeof x === "string" && x.trim().length > 0);
  const okFlags: boolean[] = [];

  for (const itemId of list) {
    try {
      const res = await fetch("/api/user/favorites", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          itemId: itemId.trim(),
          itemType: "auction",
        }),
      });
      okFlags.push(res.ok);
    } catch {
      okFlags.push(false);
    }
  }

  const saved = okFlags.filter(Boolean).length;
  const allOk = list.length > 0 && okFlags.length === list.length && okFlags.every(Boolean);

  if (allOk) {
    localStorage.removeItem(LS_FAVORITES);
    localStorage.removeItem(LS_TS);
  }

  return { attempted: list.length, saved };
}

/** Eveniment pentru badge-ul din header când guest modifică favoritele în același tab. */
export const GUEST_FAVORITES_UPDATED_EVENT = "gobid:guest-favorites-updated";

export function notifyGuestFavoritesUpdated(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(GUEST_FAVORITES_UPDATED_EVENT));
}

/** Citește ID-uri favorite din localStorage (aceeași sursă ca pe /ro). */
export function readGuestFavoriteIdsFromLocalStorage(): {
  auctionIds: string[];
  productIds: string[];
} {
  if (typeof window === "undefined") {
    return { auctionIds: [], productIds: [] };
  }
  let auctionIds: string[] = [];
  let productIds: string[] = [];
  try {
    const raw = localStorage.getItem(LS_FAVORITES);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        auctionIds = parsed.filter((x): x is string => typeof x === "string" && x.trim().length > 0);
      }
    }
  } catch {
    /* ignore */
  }
  try {
    const raw = localStorage.getItem("favoriteProducts");
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        productIds = parsed.filter((x): x is string => typeof x === "string" && x.trim().length > 0);
      }
    }
  } catch {
    /* ignore */
  }
  return { auctionIds, productIds };
}
