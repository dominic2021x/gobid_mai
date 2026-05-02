"use client";

/**
 * HomeLazyShell – composition layer for below-the-fold homepage content.
 * Replaces the single large HomeClient lazy chunk with a thin shell that:
 * - Holds shared state (theme, user, tokens, newsletter, FAB, active auctions)
 * - Lazy-loads each section via independent dynamic() imports for smaller chunks
 * Does NOT render: header, hero, search launcher, mobile menu (handled by HomeEnhancementsClient + HomeHeroServer).
 * Premium block: rendered here when premiumListings is passed (server data); otherwise use HomePremiumListingsServer in page for full server-render.
 */

import Image from "next/image";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { LocationIcon, NotificationIcon } from "@/components/HeroIcons";
import { ProductConditionBadge } from "@/components/ProductConditionBadge";
import { getProductDisplayImage, type ProductLike } from "@/lib/getProductDisplayImage";
import type { HomeActiveAuction } from "@/app/(site)/home/types";
import type { HomePremiumItem } from "@/lib/server/home/getHomePremiumListings";
import { PieseAutoMarcaInlineSpan } from "@/components/piese-auto/PieseAutoMarcaBadges";

// Lazy sections – each is a separate chunk; loaded only when this shell mounts.
const HomeCategoriesSection = dynamic(
  () => import("@/app/(site)/home/HomeCategoriesSection").then((m) => ({ default: m.HomeCategoriesSection })),
  { ssr: false }
);
const HomeActiveAuctionsSection = dynamic(
  () => import("@/app/(site)/home/HomeActiveAuctionsSection").then((m) => ({ default: m.HomeActiveAuctionsSection })),
  { ssr: false }
);
const HomePlansSection = dynamic(
  () => import("@/app/(site)/home/HomePlansSection").then((m) => ({ default: m.HomePlansSection })),
  { ssr: false }
);
const HomeNewsletterSection = dynamic(
  () => import("@/app/(site)/home/HomeNewsletterSection").then((m) => ({ default: m.HomeNewsletterSection })),
  { ssr: false }
);
const HomeFabAndModals = dynamic(
  () => import("@/app/(site)/home/HomeFabAndModals").then((m) => ({ default: m.HomeFabAndModals })),
  { ssr: false }
);

export type { HomePremiumItem as HomeLazyShellPremiumItem };

export type HomeLazyShellProps = {
  activeAuctions?: HomeActiveAuction[] | null;
  /** Server-fetched premium listings; rendered between ActiveAuctions and Plans. Omit to avoid duplicate if using HomePremiumListingsServer in page. */
  premiumListings?: HomePremiumItem[] | null;
  /** Server-fetched marketplace strip for subcategory piese-auto; rendered after Executări, before Premium. */
  pieseAutoListings?: HomePremiumItem[] | null;
};

const FAB_SIZE = 64;
const FAB_STORAGE_KEY = "gobid_floating_add_position";
const DARK_MODE_STORAGE_KEY = "darkMode";
const DARK_MODE_EVENT = "gobid:darkModeChanged";
const isBrowser = typeof window !== "undefined";

const safeStorage = {
  get(key: string): string | null {
    if (!isBrowser) return null;
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key: string, value: string): void {
    if (!isBrowser) return;
    try {
      window.localStorage.setItem(key, value);
    } catch {
      // ignore
    }
  },
  remove(key: string): void {
    if (!isBrowser) return;
    try {
      window.localStorage.removeItem(key);
    } catch {
      // ignore
    }
  },
};

function safeParseJSON<T>(value: string | null, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function pickImage(images: unknown): string | null {
  if (Array.isArray(images) && images.length > 0) {
    const first = images[0];
    if (typeof first === "string" && first.trim().length > 0) return first;
    if (first && typeof first === "object") {
      const maybeUrl = (first as Record<string, unknown>).url;
      if (typeof maybeUrl === "string" && maybeUrl.trim().length > 0) return maybeUrl;
      const preview = (first as Record<string, unknown>).previewUrl;
      if (typeof preview === "string" && preview.trim().length > 0) return preview;
    }
  }
  return null;
}

function calculateTimerSeconds(auctionDate?: string | null): number {
  if (!auctionDate) return 24 * 3600;
  const end = new Date(auctionDate);
  if (Number.isNaN(end.getTime())) return 24 * 3600;
  const diff = end.getTime() - Date.now();
  if (diff <= 0) return 0;
  return Math.floor(diff / 1000);
}

function getEffectiveAuctionDateIso(product: {
  auction_date?: string | null;
  custom_fields?: Record<string, unknown> | null;
}): string | undefined {
  const isRollingDaily = product.custom_fields?.auction_rolling_daily === true;
  const isRollingWeekly = product.custom_fields?.rolling_weekly_weekday != null;
  const rawDate = product.auction_date;
  const isDateInPast = (raw: string | undefined): boolean => {
    if (!raw || !String(raw).trim()) return true;
    const s = String(raw).trim();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const isoMatch = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    const euMatch = s.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})/);
    let d: Date;
    if (isoMatch) {
      d = new Date(parseInt(isoMatch[1], 10), parseInt(isoMatch[2], 10) - 1, parseInt(isoMatch[3], 10), 12, 0, 0);
    } else if (euMatch) {
      d = new Date(parseInt(euMatch[3], 10), parseInt(euMatch[2], 10) - 1, parseInt(euMatch[1], 10), 12, 0, 0);
    } else {
      d = new Date(s.slice(0, 10) + "T12:00:00");
    }
    if (Number.isNaN(d.getTime())) return true;
    return d.getTime() < today.getTime();
  };
  const use30DayFallback = !isRollingDaily && !isRollingWeekly && rawDate && isDateInPast(rawDate);
  if (isRollingDaily || isRollingWeekly) {
    const n = new Date();
    n.setDate(n.getDate() + 1);
    n.setHours(0, 0, 0, 0);
    return n.toISOString();
  }
  if (use30DayFallback) {
    const n = new Date();
    n.setDate(n.getDate() + 30);
    n.setHours(12, 0, 0, 0);
    return n.toISOString();
  }
  return rawDate ?? undefined;
}

// Secțiunea "Executări și Insolvență" nu mai are fallback mock — dacă nu există anunțuri reale,
// secțiunea se ascunde (vezi HomeActiveAuctionsSection).

function isConditionNewForRoBadge(condition: string | null | undefined): boolean {
  if (!condition) return false;
  const c = String(condition).trim().toLowerCase();
  return c === "nou" || c === "nouă";
}

/** Strip homepage — același layout ca grid-ul /ro (titlu, Nou/Uzat, gratuit vs preț, locație). */
function HomepageMarketplaceStripCard({
  item,
  isDarkMode,
  premiumCrown,
}: {
  item: HomePremiumItem;
  isDarkMode: boolean;
  premiumCrown: boolean;
}) {
  const rawCondition = (item.conditionCode ?? "").trim();
  const showConditionBadge = rawCondition.length > 0;
  const free = Boolean(item.isFreeListing);
  const sp = item.startingPrice ?? 0;

  return (
    <Link
      href={item.url}
      className={`group flex min-h-[298px] cursor-pointer flex-col overflow-hidden rounded-xl border shadow-xl backdrop-blur-lg transition-all duration-300 hover:shadow-2xl sm:min-h-[306px] ${
        isDarkMode ? "border-white/20 bg-white/10" : "border-gray-200 bg-white"
      }`}
    >
      <div className={`relative h-40 shrink-0 border sm:h-44 md:h-52 ${isDarkMode ? "border-gray-600" : "border-white"}`}>
        <Image
          src={item.image}
          alt=""
          fill
          sizes="(max-width: 768px) 50vw, 25vw"
          className="object-cover object-center"
          loading="lazy"
        />
        <div className="absolute left-1 top-1 flex flex-col gap-1 md:left-2 md:top-2">
          <PieseAutoMarcaInlineSpan listing={item} />
          {premiumCrown ? (
            <span className="inline-flex items-center gap-1 rounded border border-yellow-300/50 bg-gradient-to-r from-yellow-500 via-amber-500 to-orange-500 px-1.5 py-0.5 text-xs font-extrabold tracking-wide text-white shadow-lg">
              <i className="ri-vip-crown-2-line text-xs" aria-hidden />
              PREMIUM
            </span>
          ) : null}
        </div>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-1.5 px-2 pb-3 pt-2 sm:px-2.5 sm:pb-3.5">
        <div className="mb-0">
          <h3
            className={`min-h-[2.4em] line-clamp-2 text-xs font-semibold leading-tight transition-colors md:text-base group-hover:text-yellow-500 group-focus:text-yellow-500 group-active:text-yellow-500 ${
              isDarkMode ? "text-white" : "text-black"
            }`}
            title={item.title}
          >
            {item.title}
          </h3>
          {showConditionBadge ? (
            <div className="mt-0.5 flex flex-wrap items-center gap-1 gap-y-0">
              <ProductConditionBadge
                kind={isConditionNewForRoBadge(rawCondition) ? "nou" : "uzat"}
                isDarkMode={isDarkMode}
                showIcon
                size="compact"
              />
            </div>
          ) : null}
        </div>
        <div className="mb-0.5 mt-auto block pt-0.5">
          <div className="flex w-full min-w-0 items-center justify-between gap-2">
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
              {free ? (
                <span className="inline-flex items-center gap-1 text-xs font-normal text-emerald-600 transition-colors md:text-sm dark:text-emerald-400">
                  <i className="ri-gift-line text-sm" aria-hidden />
                  Oferit gratuit
                </span>
              ) : (
                <span
                  className={`text-xs font-semibold transition-colors md:text-sm ${isDarkMode ? "text-white" : "text-gray-900"}`}
                >
                  {sp > 0 ? item.price : "Preț la cerere"}
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="mt-0.5 flex flex-col gap-1 md:flex-row md:items-center md:justify-between md:gap-2">
          <span
            className={`inline-flex min-w-0 flex-1 items-center gap-1 truncate text-xs transition-colors md:flex-none ${
              isDarkMode ? "text-gray-300" : "text-gray-600"
            }`}
          >
            <LocationIcon size="s" className="shrink-0 text-gray-500" />
            <span className="truncate">{item.location}</span>
          </span>
        </div>
      </div>
    </Link>
  );
}

export default function HomeLazyShell(props: HomeLazyShellProps) {
  const { activeAuctions: initialActiveAuctions = null, premiumListings = null, pieseAutoListings = null } = props;
  const hasInitialActiveAuctions = Array.isArray(initialActiveAuctions);
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [isPageLoading, setIsPageLoading] = useState(true);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [userInfo, setUserInfo] = useState({ firstName: "", lastName: "", email: "", phone: "", avatar: "" });
  const [userTokens, setUserTokens] = useState({
    balance: 0,
    totalEarned: 0,
    totalSpent: 0,
    level: "Basic",
    package: "Basic" as string,
  });
  const [unlockedAuctions, setUnlockedAuctions] = useState<string[]>([]);
  const [favoriteAuctions, setFavoriteAuctions] = useState<string[]>([]);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [notificationPopup, setNotificationPopup] = useState({ show: false, message: "" });
  const [lockedNotificationAuctionId, setLockedNotificationAuctionId] = useState<string | null>(null);
  const [newsletterEmail, setNewsletterEmail] = useState("");
  const [newsletterSubscribed, setNewsletterSubscribed] = useState(false);
  const [newsletterLoading, setNewsletterLoading] = useState(false);
  const [showNewsletterForm, setShowNewsletterForm] = useState(false);
  const [newsletterFullName, setNewsletterFullName] = useState("");
  const [newsletterBirthDate, setNewsletterBirthDate] = useState("");
  const [newsletterAcceptTerms, setNewsletterAcceptTerms] = useState(false);
  const [logoError, setLogoError] = useState(false);
  const [realActiveAuctions, setRealActiveAuctions] = useState<HomeActiveAuction[]>(initialActiveAuctions ?? []);
  const [isLoadingActiveAuctions, setIsLoadingActiveAuctions] = useState(!hasInitialActiveAuctions);
  const [floatingButtonPos, setFloatingButtonPos] = useState<{ left: number; top: number } | null>(null);
  const floatingButtonRef = useRef<HTMLAnchorElement>(null);
  const dragStartRef = useRef<{ clientX: number; clientY: number; left: number; top: number } | null>(null);
  const didDragRef = useRef(false);
  const floatingPosRef = useRef<{ left: number; top: number } | null>(null);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!mounted) return;
    const saved = safeStorage.get(DARK_MODE_STORAGE_KEY);
    if (saved !== null) setIsDarkMode(saved === "true");
  }, [mounted]);

  useEffect(() => {
    if (!mounted || typeof window === "undefined") return;

    const syncFromStorage = () => {
      const saved = window.localStorage.getItem(DARK_MODE_STORAGE_KEY);
      setIsDarkMode(saved === "true");
    };

    const onStorage = (event: StorageEvent) => {
      if (event.key === DARK_MODE_STORAGE_KEY) {
        setIsDarkMode(event.newValue === "true");
      }
    };

    const onDarkModeChanged = (event: Event) => {
      const customEvent = event as CustomEvent<boolean>;
      setIsDarkMode(Boolean(customEvent.detail));
    };

    syncFromStorage();
    window.addEventListener("storage", onStorage);
    window.addEventListener(DARK_MODE_EVENT, onDarkModeChanged as EventListener);

    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(DARK_MODE_EVENT, onDarkModeChanged as EventListener);
    };
  }, [mounted]);

  useEffect(() => {
    if (!mounted || !isBrowser) return;
    if (isDarkMode) document.documentElement.classList.add("dark");
    else document.documentElement.classList.remove("dark");
  }, [isDarkMode, mounted]);

  useEffect(() => {
    if (!isBrowser) return;
    const raw = safeStorage.get(FAB_STORAGE_KEY);
    const parsed = safeParseJSON<{ leftPercent: number; topPercent: number } | null>(raw, null);
    if (parsed && typeof parsed.leftPercent === "number" && typeof parsed.topPercent === "number") {
      const w = window.innerWidth;
      const h = window.innerHeight;
      setFloatingButtonPos({
        left: Math.max(0, Math.min(w - FAB_SIZE, parsed.leftPercent * w)),
        top: Math.max(0, Math.min(h - FAB_SIZE, parsed.topPercent * h)),
      });
    }
  }, []);

  useEffect(() => {
    setIsPageLoading(false);
  }, []);

  useEffect(() => {
    const saved = safeStorage.get("userInfo");
    if (!saved) return;
    const parsed = safeParseJSON<typeof userInfo | null>(saved, null);
    if (parsed) {
      setUserInfo(parsed);
      setIsLoggedIn(true);
    }
  }, []);

  useEffect(() => {
    const saved = safeStorage.get("userTokens");
    if (saved) {
      setUserTokens(
        safeParseJSON(saved, {
          balance: 0,
          totalEarned: 0,
          totalSpent: 0,
          level: "Basic",
          package: "Basic",
        })
      );
    }
    const savedUnlocked = safeStorage.get("unlockedAuctions");
    if (savedUnlocked) setUnlockedAuctions(safeParseJSON(savedUnlocked, [] as string[]));
    const savedFav = safeStorage.get("favoriteAuctions");
    if (savedFav) setFavoriteAuctions(safeParseJSON(savedFav, [] as string[]));
  }, []);

  useEffect(() => {
    if (hasInitialActiveAuctions) {
      setRealActiveAuctions(initialActiveAuctions ?? []);
      setIsLoadingActiveAuctions(false);
      return;
    }
    if (realActiveAuctions.length > 0) {
      setIsLoadingActiveAuctions(false);
      return;
    }
    const load = async () => {
      try {
        const supabase = (await import("@/lib/supabase")).default;
        // Indicator canonic: TOATE produsele "Executări și Insolvență" au product_type='licitatii-publice'
        // (vezi docs/PRODUSE_LIVE_BID_LICITATII_PUBLICE.md). Query simplu + retry pe 503/timeouts tranzitorii.
        const isTransientSupabaseError = (err: unknown): boolean => {
          if (!err) return false;
          const e = err as { code?: string; status?: number; message?: string };
          if (e.status && e.status >= 500) return true;
          if (e.code === "PGRST002") return true;
          const msg = String(e.message ?? "").toLowerCase();
          return (
            msg.includes("schema cache") ||
            msg.includes("upstream request timeout") ||
            msg.includes("service unavailable") ||
            msg.includes("econnreset") ||
            msg.includes("fetch failed")
          );
        };

        const MAX_RETRIES = 2;
        const RETRY_DELAY_MS = 600;
        type ProductRow = Record<string, unknown>;
        let productsData: ProductRow[] | null = null;
        let lastError: unknown = null;

        for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
          const { data, error } = await supabase
            .from("products")
            .select(
              "id, title, slug, description, images, starting_price, currency, auction_date, is_premium, premium_until, city, county, address, created_at, custom_fields, category, subcategory, product_type, sale_type, channel"
            )
            .eq("product_type", "licitatii-publice")
            .eq("status", "active")
            .order("created_at", { ascending: false })
            .limit(80);

          if (!error) {
            productsData = (data as ProductRow[] | null) ?? [];
            lastError = null;
            break;
          }

          lastError = error;
          if (attempt < MAX_RETRIES && isTransientSupabaseError(error)) {
            await new Promise((r) => setTimeout(r, RETRY_DELAY_MS * (attempt + 1)));
            continue;
          }
          break;
        }

        if (lastError) {
          const e = lastError as { code?: string; status?: number; message?: string };
          console.warn(
            "[Home] Executări și Insolvență – Supabase indisponibil (status=" +
              (e.status ?? "?") +
              ", code=" +
              (e.code ?? "?") +
              ", msg=" +
              (e.message ?? "?") +
              "). Ascund secțiunea."
          );
          setRealActiveAuctions([]);
          setIsLoadingActiveAuctions(false);
          return;
        }

        if (process.env.NODE_ENV !== "production") {
          console.log("[Home] Executări și Insolvență: fetched", productsData?.length ?? 0, "candidate(s)");
        }
        if (!productsData?.length) {
          setRealActiveAuctions([]);
          setIsLoadingActiveAuctions(false);
          return;
        }
        const licitatii: Record<string, unknown>[] = [];
        for (const product of productsData as Record<string, unknown>[]) {
          const isFixed = !!(product.custom_fields as Record<string, unknown> | null)?.is_fixed_price;
          if (isFixed) continue;
          licitatii.push(product);
        }
        if (licitatii.length === 0) {
          if (process.env.NODE_ENV !== "production") {
            console.log("[Home] Executări și Insolvență: all candidates excluded by is_fixed_price filter");
          }
          setRealActiveAuctions([]);
          setIsLoadingActiveAuctions(false);
          return;
        }
        const shuffled = [...licitatii];
        for (let i = shuffled.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        const four = shuffled.slice(0, 4) as Array<{
          id: string;
          title: string;
          slug: string;
          images: unknown;
          starting_price: number;
          currency: string;
          auction_date: string;
          city?: string;
          county?: string;
          address?: string;
          custom_fields?: Record<string, unknown> | null;
          category?: string;
          subcategory?: string;
        }>;
        const formatted: HomeActiveAuction[] = four.map((product) => {
          const mainCat = (product.custom_fields as Record<string, unknown> | null)?.main_category ?? product.category;
          const productLike: ProductLike = {
            images: product.images as ProductLike["images"],
            category: product.category,
            subcategory: product.subcategory,
            main_category: typeof mainCat === "string" ? mainCat : (product.category ?? undefined),
          };
          const image = getProductDisplayImage(productLike) || "/no-image-placeholder.svg";
          const priceFormatted = `${(product.starting_price || 0).toLocaleString("ro-RO")} ${product.currency || "RON"}`;
          const location = [product.city, product.county, product.address].filter(Boolean).join(", ") || "Locatie neprecizată";
          const effectiveDate = getEffectiveAuctionDateIso(product);
          const timerSeconds = calculateTimerSeconds(effectiveDate ?? product.auction_date);
          return {
            id: product.id,
            title: product.title || "Fără titlu",
            image,
            timerSeconds,
            auctionDate: effectiveDate ?? product.auction_date,
            price: priceFormatted,
            location,
            tokenCost: 1,
            url: `/licitatii-publice/${product.slug ?? product.id}`,
            slug: product.slug ?? product.id,
          };
        });
        setRealActiveAuctions(formatted);
      } catch {
        // ignore
      } finally {
        setIsLoadingActiveAuctions(false);
      }
    };
    if (typeof requestIdleCallback !== "undefined") {
      const id = requestIdleCallback(() => load(), { timeout: 2000 });
      return () => cancelIdleCallback(id);
    }
    load();
  }, [hasInitialActiveAuctions, initialActiveAuctions, realActiveAuctions.length]);

  const activeAuctions = realActiveAuctions;
  const lockedAuctionDetails = lockedNotificationAuctionId
    ? (activeAuctions as Array<{ id: string; title: string; image?: string }>).find((a) => a.id === lockedNotificationAuctionId)
    : null;

  const getFloatingButtonCurrentPos = (): { left: number; top: number } => {
    if (floatingButtonPos) return floatingButtonPos;
    if (floatingButtonRef.current && isBrowser) {
      const r = floatingButtonRef.current.getBoundingClientRect();
      return { left: r.left, top: r.top };
    }
    return { left: window.innerWidth - FAB_SIZE - 20, top: window.innerHeight - FAB_SIZE - 20 };
  };

  const clampFloatingPos = (left: number, top: number) => ({
    left: Math.max(0, Math.min(window.innerWidth - FAB_SIZE, left)),
    top: Math.max(0, Math.min(window.innerHeight - FAB_SIZE, top)),
  });

  const onFloatingDragStart = (clientX: number, clientY: number) => {
    didDragRef.current = false;
    const pos = getFloatingButtonCurrentPos();
    if (!floatingButtonPos) setFloatingButtonPos(pos);
    dragStartRef.current = { clientX, clientY, left: pos.left, top: pos.top };
  };

  const onFloatingDragMove = (clientX: number, clientY: number) => {
    const start = dragStartRef.current;
    if (!start) return;
    const dx = clientX - start.clientX;
    const dy = clientY - start.clientY;
    if (Math.abs(dx) > 8 || Math.abs(dy) > 8) didDragRef.current = true;
    const { left, top } = clampFloatingPos(start.left + dx, start.top + dy);
    floatingPosRef.current = { left, top };
    setFloatingButtonPos({ left, top });
  };

  const onFloatingDragEnd = () => {
    const posToSave = floatingPosRef.current ?? floatingButtonPos;
    if (posToSave && isBrowser) {
      safeStorage.set(FAB_STORAGE_KEY, JSON.stringify({
        leftPercent: posToSave.left / window.innerWidth,
        topPercent: posToSave.top / window.innerHeight,
      }));
    }
    dragStartRef.current = null;
    floatingPosRef.current = null;
  };

  useEffect(() => {
    if (!isBrowser) return;
    const handleMouseMove = (e: MouseEvent) => onFloatingDragMove(e.clientX, e.clientY);
    const handleMouseUp = () => onFloatingDragEnd();
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, []);

  const isAuctionUnlocked = (id: string) => unlockedAuctions.includes(id);
  const isAuctionFavorite = (id: string) => favoriteAuctions.includes(id);

  const handleUnlockAuction = async (auctionId: string) => {
    const supabase = (await import("@/lib/supabase")).default;
    const { data: { session } } = await supabase.auth.getSession();
    const userId = session?.user?.id ?? (isBrowser ? localStorage.getItem("supabaseUserId") : null);
    if (!userId || !session?.access_token) {
      const current = isBrowser ? window.location.pathname + window.location.search : "/";
      router.push(`/auth?mode=login&redirect=${encodeURIComponent(current)}`);
      return;
    }
    if (userTokens.balance < 1) return;
    try {
      const newBalance = userTokens.balance - 1;
      const newTotalSpent = userTokens.totalSpent + 1;
      const newUnlocked = [...unlockedAuctions, auctionId];
      const res = await fetch("/api/tokens", {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          balance: newBalance,
          totalEarned: userTokens.totalEarned,
          totalSpent: newTotalSpent,
          level: userTokens.level,
          package: userTokens.package || "Basic",
        }),
      });
      if (!res.ok) throw new Error("Failed to update tokens");
      const unRes = await fetch("/api/user/unlocked-auctions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ auctionId }),
      });
      if (!unRes.ok) throw new Error("Failed to save unlocked auction");
      setUserTokens((t) => ({ ...t, balance: newBalance, totalSpent: newTotalSpent }));
      setUnlockedAuctions(newUnlocked);
      safeStorage.set("userTokens", JSON.stringify({ ...userTokens, balance: newBalance, totalSpent: newTotalSpent }));
      safeStorage.set("unlockedAuctions", JSON.stringify(newUnlocked));
    } catch (err) {
      console.error("Error unlocking auction:", err);
    }
  };

  const handleToggleFavorite = (auctionId: string) => {
    const next = favoriteAuctions.includes(auctionId)
      ? favoriteAuctions.filter((id) => id !== auctionId)
      : [...favoriteAuctions, auctionId];
    setFavoriteAuctions(next);
    safeStorage.set("favoriteAuctions", JSON.stringify(next));
  };

  const handleNewsletterSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!newsletterFullName.trim()) {
      setNotificationPopup({ show: true, message: "Te rog introdu numele complet!" });
      setTimeout(() => setNotificationPopup({ show: false, message: "" }), 3000);
      return;
    }
    if (!newsletterEmail?.includes("@")) {
      setNotificationPopup({ show: true, message: "Te rog introdu o adresă de email validă!" });
      setTimeout(() => setNotificationPopup({ show: false, message: "" }), 3000);
      return;
    }
    if (!newsletterAcceptTerms) {
      setNotificationPopup({ show: true, message: "Trebuie să accepți Termenii și Condițiile!" });
      setTimeout(() => setNotificationPopup({ show: false, message: "" }), 3000);
      return;
    }
    setNewsletterLoading(true);
    try {
      const response = await fetch("/api/newsletter/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: newsletterEmail, name: newsletterFullName.trim() }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.message || "Eroare la abonare");
      setNewsletterSubscribed(true);
      setNewsletterEmail("");
      setNewsletterFullName("");
      setNewsletterBirthDate("");
      setNewsletterAcceptTerms(false);
      setShowNewsletterForm(false);
      setNotificationPopup({ show: true, message: data.message || "Te-ai abonat cu succes!" });
      setTimeout(() => setNotificationPopup({ show: false, message: "" }), 5000);
    } catch (err: unknown) {
      setNotificationPopup({
        show: true,
        message: err instanceof Error ? err.message : "Eroare la abonare. Te rog încearcă din nou.",
      });
      setTimeout(() => setNotificationPopup({ show: false, message: "" }), 3000);
    } finally {
      setNewsletterLoading(false);
    }
  };

  return (
    <>
      {notificationPopup.show && (
        <div
          className={`fixed inset-x-0 top-20 z-[60] mx-auto w-full max-w-sm rounded-2xl p-4 text-sm font-medium shadow-2xl ring-1 backdrop-blur lg:top-24 ${
            isDarkMode ? "ring-black/10" : "bg-white/95 ring-gray-200"
          }`}
        >
          <div className={`flex items-center gap-3 ${isDarkMode ? "text-gray-800" : "text-gray-900"}`}>
            <NotificationIcon size="m" className="text-blue-500" />
            <span>{notificationPopup.message}</span>
          </div>
        </div>
      )}

      {lockedAuctionDetails && (
        <div
          className={`fixed inset-0 z-[65] flex items-center justify-center backdrop-blur-sm px-4 ${
            isDarkMode ? "bg-black/70" : "bg-gray-900/50"
          }`}
        >
          <div
            className={`relative w-full max-w-md rounded-3xl border p-6 text-center shadow-2xl transition-all duration-300 ${
              isDarkMode ? "border-white/15 bg-gray-800/90 text-white" : "border-gray-200 bg-white text-gray-900"
            }`}
          >
            <button
              type="button"
              onClick={() => setLockedNotificationAuctionId(null)}
              className={`absolute right-4 top-4 rounded-full p-2 transition ${
                isDarkMode ? "bg-white/20 text-white hover:bg-white/30" : "bg-gray-200 text-gray-700 hover:bg-gray-300"
              }`}
              aria-label="Închide"
            >
              <i className="ri-close-line text-lg" aria-hidden />
            </button>
            <div
              className={`mx-auto mb-4 h-20 w-32 overflow-hidden rounded-2xl border shadow-lg ${
                isDarkMode ? "border-white/20" : "border-gray-200"
              }`}
              style={{
                backgroundImage: `url('${lockedAuctionDetails.image ?? ""}')`,
                backgroundSize: "cover",
                backgroundPosition: "center",
              }}
            />
            <h3 className="mb-1 text-lg font-semibold">Deblochează pentru alerte</h3>
            <p className={isDarkMode ? "text-sm text-white/80" : "text-sm text-gray-600"}>
              Pentru a activa notificările pentru <span className="font-semibold">{lockedAuctionDetails.title}</span>, deblochează licitația folosind tokenii disponibili.
            </p>
            <div className="mt-5 flex flex-col gap-3">
              <button
                type="button"
                onClick={() => {
                  handleUnlockAuction(lockedAuctionDetails.id);
                  setLockedNotificationAuctionId(null);
                }}
                className="w-full rounded-full py-2 text-sm font-semibold uppercase tracking-wide shadow-xl bg-gradient-to-r from-yellow-500 via-yellow-600 to-yellow-500 text-gray-900 hover:from-yellow-600 hover:via-yellow-700 hover:to-yellow-600"
              >
                Deblochează licitația
              </button>
              <button
                type="button"
                onClick={() => setLockedNotificationAuctionId(null)}
                className={`w-full rounded-full border py-2 text-sm font-semibold uppercase tracking-wide ${
                  isDarkMode ? "border-white/50 text-white/80 hover:bg-white/10" : "border-gray-300 text-gray-700 hover:bg-gray-50"
                }`}
              >
                Renunță
              </button>
            </div>
          </div>
        </div>
      )}

      <div
        className={`min-h-screen transition-all duration-300 pb-24 md:pb-0 ${
          isDarkMode ? "bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900" : "bg-gradient-to-br from-gray-50 via-white to-gray-50"
        }`}
        suppressHydrationWarning
      >
        <main id="main-content" role="main">
          <HomeCategoriesSection isDarkMode={isDarkMode} />

          <HomeActiveAuctionsSection
            isDarkMode={isDarkMode}
            isPageLoading={isPageLoading}
            isLoadingActiveAuctions={isLoadingActiveAuctions}
            activeAuctions={activeAuctions}
            userTokens={userTokens}
            isAuctionUnlocked={isAuctionUnlocked}
            isAuctionFavorite={isAuctionFavorite}
            handleUnlockAuction={handleUnlockAuction}
            handleToggleFavorite={handleToggleFavorite}
          />

          {pieseAutoListings && pieseAutoListings.length > 0 && (
            <section className="pt-0 sm:pt-1 md:pt-2 pb-8 sm:pb-12 md:pb-16 bg-gray-50/50 dark:bg-transparent">
              <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between mb-4 sm:mb-8 md:mb-12">
                  <h2
                    className={`text-xl sm:text-2xl md:text-4xl font-bold ${
                      isDarkMode
                        ? "bg-gradient-to-r from-white via-gray-100 to-gray-200 bg-clip-text text-transparent"
                        : "text-gray-900"
                    }`}
                  >
                    Piese auto
                  </h2>
                  <Link
                    href="/ro?category=autovehicule&subcategory=piese-auto"
                    className={`text-sm font-semibold whitespace-nowrap transition-colors ${
                      isDarkMode ? "text-amber-400 hover:text-amber-300" : "text-amber-600 hover:text-amber-700"
                    }`}
                  >
                    Vezi toate
                  </Link>
                </div>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 px-1 md:px-0 md:gap-2 lg:gap-3">
                  {pieseAutoListings.slice(0, 4).map((item) => (
                    <HomepageMarketplaceStripCard
                      key={item.id}
                      item={item}
                      isDarkMode={isDarkMode}
                      premiumCrown={false}
                    />
                  ))}
                </div>
              </div>
            </section>
          )}

          {premiumListings && premiumListings.length > 0 && (
            <section className="pt-0 sm:pt-1 md:pt-2 pb-8 sm:pb-12 md:pb-16 bg-gray-50/50 dark:bg-transparent">
              <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
                <div className="text-left mb-4 sm:mb-8 md:mb-12">
                  <h2
                    className={`text-xl sm:text-2xl md:text-4xl font-bold ${
                      isDarkMode
                        ? "bg-gradient-to-r from-white via-gray-100 to-gray-200 bg-clip-text text-transparent"
                        : "text-gray-900"
                    }`}
                  >
                    Licitații Premium
                  </h2>
                </div>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 px-1 md:px-0 md:gap-2 lg:gap-3">
                  {premiumListings.slice(0, 4).map((auction) => (
                    <HomepageMarketplaceStripCard
                      key={auction.id}
                      item={auction}
                      isDarkMode={isDarkMode}
                      premiumCrown
                    />
                  ))}
                </div>
              </div>
            </section>
          )}

          <HomePlansSection isDarkMode={isDarkMode} />

          <HomeNewsletterSection
            isDarkMode={isDarkMode}
            newsletterSubscribed={newsletterSubscribed}
            showNewsletterForm={showNewsletterForm}
            setShowNewsletterForm={setShowNewsletterForm}
            newsletterEmail={newsletterEmail}
            setNewsletterEmail={setNewsletterEmail}
            newsletterFullName={newsletterFullName}
            setNewsletterFullName={setNewsletterFullName}
            newsletterBirthDate={newsletterBirthDate}
            setNewsletterBirthDate={setNewsletterBirthDate}
            newsletterAcceptTerms={newsletterAcceptTerms}
            setNewsletterAcceptTerms={setNewsletterAcceptTerms}
            newsletterLoading={newsletterLoading}
            onNewsletterSubmit={handleNewsletterSubmit}
          />

          <footer
            className={`mt-8 sm:mt-12 md:mt-16 py-4 sm:py-6 md:py-8 border-t transition-all duration-300 ${
              isDarkMode ? "border-white/10" : "border-gray-300"
            }`}
          >
            <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
              <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 lg:gap-8 mb-4 sm:mb-6">
                <div className="col-span-2 sm:col-span-2 lg:col-span-2">
                  <div className="flex items-center justify-between gap-4 mb-2 sm:mb-4">
                    <div className="flex items-center gap-2 sm:gap-3">
                      {!logoError ? (
                        <Image
                          src={isDarkMode ? "/logo_alb.png" : "/logo_negru.png"}
                          alt="gobid.ro Logo"
                          width={224}
                          height={36}
                          sizes="(max-width: 640px) 80px, (max-width: 768px) 96px, 112px"
                          className="h-5 sm:h-6 md:h-7 lg:h-8 w-auto object-contain"
                          style={{ maxHeight: "32px" }}
                          onError={() => setLogoError(true)}
                        />
                      ) : (
                        <div className="w-6 h-6 sm:w-8 sm:h-8 bg-gradient-to-r from-blue-600 to-gray-600 rounded-lg flex items-center justify-center shadow-lg">
                          <i className="ri-diamond-fill text-white text-sm sm:text-lg" aria-hidden />
                        </div>
                      )}
                    </div>
                    <div className="flex gap-2 sm:gap-4 flex-shrink-0">
                      <a href="https://www.facebook.com/gobid.ro" target="_blank" rel="noopener noreferrer" className={`min-w-[48px] min-h-[48px] w-10 h-10 sm:w-11 sm:h-11 md:w-12 md:h-12 backdrop-blur-sm rounded-lg flex items-center justify-center transition-all duration-300 ${isDarkMode ? "bg-white/10 hover:bg-white/20" : "bg-gray-100 hover:bg-gray-200"}`} aria-label="Facebook gobid.ro">
                        <i className="ri-facebook-fill text-blue-500 text-sm sm:text-base" aria-hidden />
                      </a>
                      <a href="https://twitter.com/gobid_ro" target="_blank" rel="noopener noreferrer" className={`min-w-[48px] min-h-[48px] w-10 h-10 sm:w-11 sm:h-11 md:w-12 md:h-12 backdrop-blur-sm rounded-lg flex items-center justify-center transition-all duration-300 ${isDarkMode ? "bg-white/10 hover:bg-white/20" : "bg-gray-100 hover:bg-gray-200"}`} aria-label="Twitter gobid.ro">
                        <i className="ri-twitter-fill text-blue-500 text-sm sm:text-base" aria-hidden />
                      </a>
                      <a href="https://www.linkedin.com/company/gobid-ro" target="_blank" rel="noopener noreferrer" className={`min-w-[48px] min-h-[48px] w-10 h-10 sm:w-11 sm:h-11 md:w-12 md:h-12 backdrop-blur-sm rounded-lg flex items-center justify-center transition-all duration-300 ${isDarkMode ? "bg-white/10 hover:bg-white/20" : "bg-gray-100 hover:bg-gray-200"}`} aria-label="LinkedIn gobid.ro">
                        <i className="ri-linkedin-fill text-blue-600 text-sm sm:text-base" aria-hidden />
                      </a>
                      <a href="https://www.instagram.com/gobid.ro" target="_blank" rel="noopener noreferrer" className={`min-w-[48px] min-h-[48px] w-10 h-10 sm:w-11 sm:h-11 md:w-12 md:h-12 backdrop-blur-sm rounded-lg flex items-center justify-center transition-all duration-300 ${isDarkMode ? "bg-white/10 hover:bg-white/20" : "bg-gray-100 hover:bg-gray-200"}`} aria-label="Instagram gobid.ro">
                        <i className="ri-instagram-fill text-pink-500 text-sm sm:text-base" aria-hidden />
                      </a>
                    </div>
                  </div>
                  <p className={`text-xs sm:text-sm mb-0 max-w-md leading-snug sm:leading-relaxed transition-colors duration-300 ${isDarkMode ? "text-gray-300" : "text-gray-700"}`}>
                    Platforma ta de încredere pentru licitații online. Conectăm cumpărătorii cu vânzătorii într-un mediu sigur și transparent. O platformă 100% românească.
                  </p>
                  <div className="mt-2 hidden md:flex items-center gap-2">
                    <span className={`flex items-center gap-1 text-xs sm:text-sm transition-colors duration-300 ${isDarkMode ? "text-gray-300" : "text-gray-700"}`}>
                      <span>Proiectat și dezvoltat cu</span>
                      <svg
                        viewBox="0 0 24 24"
                        aria-hidden="true"
                        className="h-[0.95em] w-[0.95em] fill-red-500 animate-[heartBeat_1.15s_ease-in-out_infinite]"
                      >
                        <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5A4.5 4.5 0 0 1 6.5 4C8.24 4 9.91 4.81 11 6.08 12.09 4.81 13.76 4 15.5 4A4.5 4.5 0 0 1 20 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
                      </svg>
                      <span>de</span>
                    </span>
                    <a
                      href="https://www.noerror.ro/"
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label="NOERROR (deschide în tab nou)"
                    >
                      <Image
                        src="/reclame/noerror-logo.png"
                        alt="NOError"
                        width={96}
                        height={20}
                        className={`w-auto ${isDarkMode ? "brightness-0 invert" : ""}`}
                        style={{ height: 14 }}
                      />
                    </a>
                  </div>
                </div>
                <div>
                  <h4 className={`font-semibold mb-2 sm:mb-3 text-xs sm:text-sm md:text-base transition-colors duration-300 ${isDarkMode ? "text-white" : "text-gray-900"}`}>
                    Pagini utile
                  </h4>
                  <ul className="space-y-0.5 sm:space-y-1">
                    <li>
                      <a href="/credit-ipotecar-inteligent" className={`transition-colors text-xs sm:text-sm ${isDarkMode ? "text-gray-300 hover:text-yellow-400" : "text-gray-700 hover:text-yellow-500"}`}>
                        Calculator Inteligent Credit Ipotecar
                      </a>
                    </li>
                  </ul>
                </div>
                <div>
                  <h4 className={`font-semibold mb-2 sm:mb-3 text-xs sm:text-sm md:text-base transition-colors duration-300 ${isDarkMode ? "text-white" : "text-gray-900"}`}>
                    Suport
                  </h4>
                  <ul className="space-y-0.5 sm:space-y-1">
                    <li><a href="/despre-noi" className={`transition-colors text-xs sm:text-sm ${isDarkMode ? "text-gray-300 hover:text-yellow-400" : "text-gray-700 hover:text-yellow-500"}`}>Despre GoBid.ro</a></li>
                    <li><a href="/contact" className={`transition-colors text-xs sm:text-sm ${isDarkMode ? "text-gray-300 hover:text-yellow-400" : "text-gray-700 hover:text-yellow-500"}`}>Contact</a></li>
                    <li><a href="/legal/termeni-si-conditii" className={`transition-colors text-xs sm:text-sm ${isDarkMode ? "text-gray-300 hover:text-yellow-400" : "text-gray-700 hover:text-yellow-500"}`}>Termeni și Condiții</a></li>
                    <li><a href="/legal/politica-confidentialitate" className={`transition-colors text-xs sm:text-sm ${isDarkMode ? "text-gray-300 hover:text-yellow-400" : "text-gray-700 hover:text-yellow-500"}`}>Politica de Confidențialitate</a></li>
                    <li><a href="/legal/politica-cookies" className={`transition-colors text-xs sm:text-sm ${isDarkMode ? "text-gray-300 hover:text-yellow-400" : "text-gray-700 hover:text-yellow-500"}`}>Politica Cookie-uri</a></li>
                    <li><a href="/legal" className={`transition-colors text-xs sm:text-sm ${isDarkMode ? "text-gray-300 hover:text-yellow-400" : "text-gray-700 hover:text-yellow-500"}`}>Toate documentele legale</a></li>
                  </ul>
                </div>
              </div>
              <div className={`border-t pt-2 sm:pt-4 md:pt-6 transition-all duration-300 ${isDarkMode ? "border-white/10" : "border-gray-300"}`}>
                <div className="flex flex-col md:flex-row md:items-center md:justify-between md:gap-4 lg:gap-6 gap-2 sm:gap-3">
                  <div className="flex flex-wrap items-center justify-center md:justify-start gap-1 sm:gap-2 md:gap-3 flex-shrink-0">
                    <span className={`text-[10px] sm:text-xs md:text-sm font-medium whitespace-nowrap ${isDarkMode ? "text-gray-400" : "text-gray-700"}`}>Metode de plată:</span>
                    <div className="relative h-5 sm:h-6 md:h-8 lg:h-10 flex items-center flex-shrink-0">
                      <Image src="/netopia-logo.svg" alt="Netopia Payments" width={180} height={40} className="h-5 sm:h-6 md:h-8 lg:h-10 w-auto" />
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center justify-center md:justify-start gap-2 sm:gap-3 flex-shrink-0">
                    <a href="https://anpc.ro" target="_blank" rel="noopener noreferrer" className={`text-[10px] sm:text-xs md:text-sm font-medium whitespace-nowrap ${isDarkMode ? "text-gray-400 hover:text-white" : "text-gray-700 hover:text-gray-900"}`}>ANPC</a>
                    <a href="https://anpc.ro/sol" target="_blank" rel="noopener noreferrer" className={`text-[10px] sm:text-xs md:text-sm font-medium whitespace-nowrap ${isDarkMode ? "text-gray-400 hover:text-white" : "text-gray-700 hover:text-gray-900"}`}>ANPC SOL</a>
                  </div>
                  <div className="flex flex-wrap items-center justify-center md:justify-start md:ml-auto gap-1.5 sm:gap-2 md:gap-3 flex-shrink-0">
                    <p className={`text-xs sm:text-sm whitespace-nowrap ${isDarkMode ? "text-gray-400" : "text-gray-700"}`}>© 2026 gobid.ro. Toate drepturile rezervate.</p>
                    <span className={`text-[10px] sm:text-xs ${isDarkMode ? "text-gray-500" : "text-gray-500"}`}>Operat de DMK WEB STRATEGY SRL CUI 54080033</span>
                  </div>
                </div>
              </div>
              <div className="mt-3 flex md:hidden items-center justify-center gap-2">
                <span className={`flex items-center gap-1 text-xs transition-colors duration-300 ${isDarkMode ? "text-gray-300" : "text-gray-700"}`}>
                  <span>Proiectat și dezvoltat cu</span>
                  <svg
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                    className="h-[0.95em] w-[0.95em] fill-red-500 animate-[heartBeat_1.15s_ease-in-out_infinite]"
                  >
                    <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5A4.5 4.5 0 0 1 6.5 4C8.24 4 9.91 4.81 11 6.08 12.09 4.81 13.76 4 15.5 4A4.5 4.5 0 0 1 20 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
                  </svg>
                  <span>de</span>
                </span>
                <a
                  href="https://www.noerror.ro/"
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="NOERROR (deschide în tab nou)"
                >
                  <Image
                    src="/reclame/noerror-logo.png"
                    alt="NOError"
                    width={96}
                    height={20}
                    className={`w-auto ${isDarkMode ? "brightness-0 invert" : ""}`}
                    style={{ height: 14 }}
                  />
                </a>
              </div>
            </div>
          </footer>
        </main>

        <HomeFabAndModals
          isDarkMode={isDarkMode}
          isLoggedIn={isLoggedIn}
          showAuthModal={showAuthModal}
          setShowAuthModal={setShowAuthModal}
          floatingButtonPos={floatingButtonPos}
          floatingButtonRef={floatingButtonRef}
          onFABClick={(e) => {
            e.preventDefault();
            if (!didDragRef.current && typeof window !== "undefined") {
              window.location.href = isLoggedIn ? "/dashboard" : "/auth";
            }
          }}
          onFloatingDragStart={onFloatingDragStart}
          onFloatingTouchMove={(e) => {
            if (e.touches[0]) {
              if (dragStartRef.current) e.preventDefault();
              onFloatingDragMove(e.touches[0].clientX, e.touches[0].clientY);
            }
          }}
          onFloatingDragEnd={onFloatingDragEnd}
        />
      </div>
    </>
  );
}
