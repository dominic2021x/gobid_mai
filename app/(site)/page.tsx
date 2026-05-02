import { Suspense } from "react";
import HomeHeroServer from "./HomeHeroServer";
import HomeEnhancementsClient from "./HomeEnhancementsClient";
import HomeEnhancementsLazy from "./HomeEnhancementsLazy";
import { getHomeActiveAuctions } from "@/lib/server/home/getHomeActiveAuctions";
import { getHomePremiumListings } from "@/lib/server/home/getHomePremiumListings";
import { getHomePieseAutoListings } from "@/lib/server/home/getHomePieseAutoListings";

/**
 * Home page – Server Component root.
 * Order: header + search launcher → hero (LCP) → lazy (Categories → Executări și Insolvență → Piese auto → Premium → Plans → Newsletter → Footer → FAB).
 * Premium și Piese auto sunt fetche-uite pe server și trimise în shell-ul lazy; un singur bloc premium, fără duplicat.
 */
export default async function Home() {
  const [activeAuctionsResult, premiumListingsResult, pieseAutoResult] = await Promise.allSettled([
    getHomeActiveAuctions(),
    getHomePremiumListings(),
    getHomePieseAutoListings(),
  ]);
  const activeAuctions = activeAuctionsResult.status === "fulfilled" ? activeAuctionsResult.value : [];
  const premiumListings = premiumListingsResult.status === "fulfilled" ? premiumListingsResult.value : [];
  const pieseAutoListings = pieseAutoResult.status === "fulfilled" ? pieseAutoResult.value : [];

  if (activeAuctionsResult.status === "rejected") {
    console.warn("[home] Failed to load active executari listings on server:", activeAuctionsResult.reason);
  }
  if (premiumListingsResult.status === "rejected") {
    console.warn("[home] Failed to load premium listings on server:", premiumListingsResult.reason);
  }
  if (pieseAutoResult.status === "rejected") {
    console.warn("[home] Failed to load piese auto listings on server:", pieseAutoResult.reason);
  }
  return (
    <>
      <Suspense fallback={null}>
        <HomeEnhancementsClient />
      </Suspense>
      <HomeHeroServer />
      <Suspense fallback={null}>
        <HomeEnhancementsLazy
          activeAuctions={activeAuctions}
          premiumListings={premiumListings}
          pieseAutoListings={pieseAutoListings}
        />
      </Suspense>
    </>
  );
}
