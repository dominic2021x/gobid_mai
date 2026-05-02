"use client";

/**
 * HomeEnhancementsLazy – composition layer for below-the-fold homepage content.
 * Loads a single thin shell (HomeLazyShell) that in turn lazy-loads five independent sections:
 * HomeCategoriesSection, HomeActiveAuctionsSection, HomePlansSection, HomeNewsletterSection, HomeFabAndModals.
 * This replaces the previous single large HomeClient chunk with smaller independent chunks for better LCP/INP/TBT.
 */

import dynamic from "next/dynamic";
import HomePageSkeleton from "./HomePageSkeleton";
import type { HomeActiveAuction } from "./home/types";
import type { HomePremiumItem } from "@/lib/server/home/getHomePremiumListings";

export type HomePremiumListingItem = HomePremiumItem;


export type HomeEnhancementsLazyProps = {
  activeAuctions?: HomeActiveAuction[] | null;
  /** Server-fetched premium listings; passed to shell so premium block renders between ActiveAuctions and Plans (no duplicate if page uses HomePremiumListingsServer). */
  premiumListings?: HomePremiumListingItem[] | null;
  /** Server-fetched piese auto strip; shown under Executări. */
  pieseAutoListings?: HomePremiumListingItem[] | null;
};

const HomeLazyShell = dynamic(
  () => import("./HomeLazyShell").then((m) => m.default),
  { ssr: false, loading: () => <HomePageSkeleton /> }
);

export default function HomeEnhancementsLazy(props: HomeEnhancementsLazyProps) {
  return (
    <HomeLazyShell
      activeAuctions={props.activeAuctions ?? null}
      premiumListings={props.premiumListings ?? null}
      pieseAutoListings={props.pieseAutoListings ?? null}
    />
  );
}
