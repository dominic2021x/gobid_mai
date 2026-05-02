"use client";

import { supabase } from "@/lib/supabase";

/** Chei eliminate la deconectare (aliniat cu UniversalHeader). */
const AUTH_LOCAL_STORAGE_KEYS = [
  "userInfo",
  "userTokens",
  "favoriteAuctions",
  "favoriteProducts",
  "favoriteLists",
  "unlockedAuctions",
  "auctionNotifications",
  "supabaseUserId",
  "authRedirect",
] as const;

/**
 * Sign-out Supabase + curățare localStorage pentru sesiunea aplicației.
 * Modul dedicat evită importuri ciclice și probleme HMR când logica e doar în componente mari.
 */
export async function signOutSupabaseAndClearAuthStorage(): Promise<void> {
  const { error } = await supabase.auth.signOut();
  if (error) {
    console.error("Error signing out from Supabase:", error);
  }
  if (typeof window === "undefined") return;
  for (const key of AUTH_LOCAL_STORAGE_KEYS) {
    localStorage.removeItem(key);
  }
}
