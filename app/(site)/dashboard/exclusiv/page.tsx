"use client";

import { dashboardApiFetch } from "@/lib/dashboard-api-fetch";
import { dashboardApiFetchWithOptionalBearer } from "@/lib/dashboardApiFetchWithOptionalBearer";
import { useState, useEffect, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import UniversalHeader from "@/components/UniversalHeader";
import { BackButton } from "@/components/ui/back-button";
import WheelPagination, { WheelPaginationFooter } from "@/components/ui/wheel-pagination";
import DashboardFooter from "@/components/DashboardFooter";
import { CoinsIcon, HeartIcon } from "@/components/HeroIcons";
import PropertyMap from "@/components/PropertyMap";
import AddToFavoriteListModal from "@/components/AddToFavoriteListModal";
import { supabase } from "@/lib/supabase";
import {
  getSupabaseAccessTokenRobust,
  getSupabaseSessionRobust,
} from "@/lib/auth/getSupabaseSessionRobust";
import { extractAuctionDateAndTimeFromText, combineDateAndTime } from "@/lib/extractAuctionFromDescription";

const DASHBOARD_RESET_VERSION = "2026-02-12-reset-v1";

const formatNumber = (num: number): string =>
  num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");

const cleanTransactionDescription = (value: unknown): string => {
  if (typeof value !== "string") return "N/A";
  return value.replace(/\s*\[product_id:[^\]]+\]/gi, "").trim() || "N/A";
};

const getNextMidnightTimestamp = (fromTs: number): number => {
  const d = new Date(fromTs);
  d.setHours(24, 0, 0, 0);
  return d.getTime();
};

const getTimestampIn30Days = (fromTs: number): number => fromTs + 30 * 24 * 60 * 60 * 1000;

const getNextWeeklyTimestamp = (weekdayRaw: unknown, timeRaw: unknown, fromTs: number): number | null => {
  const weekday = Number(weekdayRaw);
  if (!Number.isFinite(weekday) || weekday < 0 || weekday > 6) return null;

  const now = new Date(fromTs);
  const target = new Date(fromTs);

  const currentWeekday = now.getDay();
  let daysAhead = (weekday - currentWeekday + 7) % 7;

  const timeString = String(timeRaw || "17:00");
  const hh = Number(timeString.split(":")[0] || 17);
  const mm = Number(timeString.split(":")[1] || 0);
  const hours = Number.isFinite(hh) ? hh : 17;
  const minutes = Number.isFinite(mm) ? mm : 0;

  target.setDate(now.getDate() + daysAhead);
  target.setHours(hours, minutes, 0, 0);

  if (daysAhead === 0 && target.getTime() <= fromTs) {
    target.setDate(target.getDate() + 7);
  }

  return target.getTime();
};

const formatTransactionTypeRo = (value: unknown): string => {
  const type = String(value || "").toLowerCase().trim();
  if (!type) return "N/A";
  if (type === "spent") return "Cheltuit";
  if (type === "earned") return "Câștigat";
  if (type === "transferred") return "Transferat";
  if (type === "received") return "Primit";
  return type.charAt(0).toUpperCase() + type.slice(1);
};

function convertProductToAuction(product: Record<string, unknown>): Record<string, unknown> {
  const baseCustomFields =
    product.custom_fields && typeof product.custom_fields === "object"
      ? ({ ...(product.custom_fields as Record<string, unknown>) } as Record<string, unknown>)
      : {};
  const descriptionText = String(product.description || "").trim();
  const extracted = descriptionText ? extractAuctionDateAndTimeFromText(descriptionText) : null;

  let resolvedAuctionDate =
    (product.auction_date as string | undefined) ||
    (product.auctionDate as string | undefined) ||
    (baseCustomFields.auction_date as string | undefined) ||
    (baseCustomFields.data_licitatie as string | undefined);

  if (extracted?.rollingWeekly && extracted.dateIso) {
    if (extracted.rollingWeekly.weekday !== undefined) {
      baseCustomFields.rolling_weekly_weekday = extracted.rollingWeekly.weekday;
    }
    if (extracted.time && !baseCustomFields.auction_time) {
      baseCustomFields.auction_time = extracted.time;
    }
    resolvedAuctionDate = combineDateAndTime(extracted.dateIso, extracted.time) || extracted.dateIso;
  } else if (!resolvedAuctionDate && extracted?.dateIso) {
    if (extracted.time && !baseCustomFields.auction_time) {
      baseCustomFields.auction_time = extracted.time;
    }
    resolvedAuctionDate = combineDateAndTime(extracted.dateIso, extracted.time) || extracted.dateIso;
  }

  if (!resolvedAuctionDate && descriptionText) {
    const descDateMatch = descriptionText.match(/(\d{1,2})[./](\d{1,2})[./](\d{4})/);
    if (descDateMatch) {
      const [, dStr, mStr, yStr] = descDateMatch;
      const dd = String(dStr).padStart(2, "0");
      const mm = String(mStr).padStart(2, "0");
      resolvedAuctionDate = `${yStr}-${mm}-${dd}`;
    }
  }

  if (!resolvedAuctionDate) {
    const slug = String(product.slug || "");
    const fromSlug8 = slug.match(/-(\d{8})$/)?.[1];
    if (fromSlug8 && fromSlug8.length === 8) {
      const d = fromSlug8.slice(0, 2);
      const m = fromSlug8.slice(2, 4);
      const y = fromSlug8.slice(4, 8);
      resolvedAuctionDate = `${y}-${m}-${d}`;
    } else {
      const isoInSlug = slug.match(/-(\d{4}-\d{2}-\d{2})(?:-|$)/)?.[1];
      if (isoInSlug) resolvedAuctionDate = isoInSlug;
    }
  }

  const images = Array.isArray(product.images)
    ? (product.images as unknown[]).filter((img) => typeof img === "string")
    : [];
  const firstImage = images.length > 0 ? (images[0] as string) : "/no-image-placeholder.svg";

  let timeLeft = "Terminat";
  const endVal = (resolvedAuctionDate ?? (product.end_time as string | undefined)) as string | undefined;
  if (endVal) {
    const endDate = new Date(endVal);
    const now = new Date();
    const diffMs = endDate.getTime() - now.getTime();
    if (diffMs > 0) {
      const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
      timeLeft = days > 0 ? `${days} ${days === 1 ? "zi" : "zile"}` : hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
    } else {
      timeLeft = "Terminat";
    }
  }

  const pt = (product.product_type ?? product.productType ?? "produse") as string;
  const typeRoutes: Record<string, string> = { "licitatii-publice": "licitatii-publice", "live-bid": "live_bid", "buy-now": "produs" };
  const route = typeRoutes[pt] ?? "produse";
  const productUrl = (product.url as string) ?? (product.slug ? `/${route}/${product.slug}` : "#");
  const productId = (product.slug ?? product.id ?? `product-${product.id}`) as string;

  const startingPrice = typeof product.starting_price === "number"
    ? product.starting_price
    : ((product.starting_price_ron ?? product.startingPrice) as number) ?? 0;
  const loc = (product.auction_location ?? product.address ?? product.city ?? "București") as string;
  const createdAt = product.created_at ?? product.createdAt;
  const year = createdAt ? new Date(createdAt as string).getFullYear().toString() : new Date().getFullYear().toString();

  return {
    id: productId,
    productDbId: product.id,
    url: productUrl,
    title: (product.title ?? "Produs") as string,
    image: firstImage,
    currentBid: startingPrice,
    timeLeft,
    description: (product.description ?? "") as string,
    seller: "Vânzător",
    condition: (product.condition ?? "Nouă") as string,
    year,
    location: loc,
    shipping: (product.shipping ?? "Gratuit în România") as string,
    paymentMethods: Array.isArray(product.payment_methods) ? product.payment_methods : (Array.isArray(product.paymentMethods) ? product.paymentMethods : ["Card bancar", "Transfer bancar"]),
    returnPolicy: (product.return_policy ?? product.returnPolicy ?? "14 zile retur") as string,
    warranty: (product.warranty ?? "1 an garanție") as string,
    category: String(product.category ?? "diverse").toLowerCase(),
    subcategory: String(product.subcategory ?? "diverse").toLowerCase(),
    isTest: false,
    productType: product.product_type ?? product.productType ?? "live-bid",
    saleType: product.sale_type ?? product.saleType ?? "vanzare-directa",
    auctionDate: resolvedAuctionDate,
    customFields: baseCustomFields,
    createdAt: product.created_at ?? product.createdAt,
    address: product.address,
    coordinates: product.coordinates,
    currency: (product.currency ?? "RON") as string,
    status: (product.status ?? "active") as string,
    isPremium: Boolean((product.is_premium ?? product.isPremium) ?? false),
  };
}

const isLicitatiiPublice = (auction: { saleType?: string; productType?: string }) =>
  auction.saleType === "licitatie-publica" || auction.productType === "licitatii-publice";

const isPremiumAuction = (auction: Record<string, unknown>): boolean =>
  Boolean((auction?.isPremium ?? auction?.is_premium) ?? false);

const getDisplayCity = (location: string | undefined): string => {
  if (!location?.trim()) return "";
  const s = String(location).trim();
  const locMatch = s.match(/loc\.\s*([^,]+)/i);
  if (locMatch) return locMatch[1].trim();
  const judMatch = s.match(/jud\.\s*([^,]+)/i);
  if (judMatch) return judMatch[1].trim();
  const first = s.split(",")[0].trim();
  const parts = first.split(/\s+/);
  const last = parts[parts.length - 1];
  if (last && last.length <= 25) return last;
  return first.length <= 30 ? first : s;
};

export default function ExclusivPage() {
  const router = useRouter();
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [userInfo, setUserInfo] = useState({ firstName: "", lastName: "", email: "" });
  const [userTokens, setUserTokens] = useState({ balance: 0 });
  const [isLoading, setIsLoading] = useState(true);
  const [unlockedAuctions, setUnlockedAuctions] = useState<string[]>([]);
  const [realProducts, setRealProducts] = useState<Record<string, unknown>[]>([]);
  const [unlockedProductsFromDb, setUnlockedProductsFromDb] = useState<Record<string, unknown>[]>([]);
  const [productsFromStorage, setProductsFromStorage] = useState<Record<string, unknown>[]>([]);
  const [isLoadingProducts, setIsLoadingProducts] = useState(true);
  const [isLoadingUnlocked, setIsLoadingUnlocked] = useState(true);
  const [tokenTransactions, setTokenTransactions] = useState<any[]>([]);
  const [sortBy, setSortBy] = useState("newest");
  const viewMode: "grid" = "grid";
  const [searchQuery, setSearchQuery] = useState("");
  const [isMobileLayout, setIsMobileLayout] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [favoriteAuctions, setFavoriteAuctions] = useState<string[]>([]);
  const [blockedAuctionProductIds, setBlockedAuctionProductIds] = useState<string[]>([]);
  const [pendingRefundAuctionProductIds, setPendingRefundAuctionProductIds] = useState<string[]>([]);
  const [usedRefundAuctionProductIds, setUsedRefundAuctionProductIds] = useState<string[]>([]);
  const [unlockingAuctionProductId, setUnlockingAuctionProductId] = useState<string | null>(null);
  const [showFavoriteModal, setShowFavoriteModal] = useState(false);
  const [selectedProductForFavorite, setSelectedProductForFavorite] = useState<{ id: string; title: string } | null>(null);
  const [showRefundRequestModal, setShowRefundRequestModal] = useState(false);
  const [selectedAuctionForRefund, setSelectedAuctionForRefund] = useState<null | { productId: string; title: string; code?: string }>(null);
  const [refundReason, setRefundReason] = useState("");
  const [isSubmittingRefundRequest, setIsSubmittingRefundRequest] = useState(false);
  const [refundModalNotice, setRefundModalNotice] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const loadUnlockedRef = useRef<() => Promise<void>>(() => Promise.resolve());
  const [toastMessage, setToastMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [refundUsedNotice, setRefundUsedNotice] = useState<{ productId: string; text: string } | null>(null);
  const [nowTimestamp, setNowTimestamp] = useState(() => Date.now());
  /** Lista completă de la API (titlu, slug etc.) – folosită pentru carduri placeholder când produsul nu e în DB */
  const [unlockedProductsList, setUnlockedProductsList] = useState<Array<{ productId?: string; title?: string; slug?: string | null; imageUrl?: string | null; location?: string | null }>>([]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      try {
        const appliedVersion = localStorage.getItem("dashboard_reset_version");
        if (appliedVersion !== DASHBOARD_RESET_VERSION) {
          // Global dashboard state reset for legacy users (one-time after deploy).
          const keysToDelete = [
            "unlockedAuctions",
            "products",
            "favoriteAuctions",
            "recentlyViewedProducts",
            "searchHistory",
            "lastSearchQuery",
          ];
          keysToDelete.forEach((key) => localStorage.removeItem(key));

          // Clear legacy unlock flags created by old flows.
          for (let i = localStorage.length - 1; i >= 0; i--) {
            const key = localStorage.key(i);
            if (!key) continue;
            if (key.startsWith("price_eval_unlocked_")) {
              localStorage.removeItem(key);
            }
          }

          localStorage.setItem("dashboard_reset_version", DASHBOARD_RESET_VERSION);
        }
      } catch {
        // ignore localStorage reset failures
      }

      const saved = localStorage.getItem("darkMode");
      if (saved !== null) setIsDarkMode(saved === "true");
      try {
        const raw = localStorage.getItem("userInfo");
        if (raw) {
          const parsed = JSON.parse(raw);
          setUserInfo({
            firstName: String(parsed?.firstName || ""),
            lastName: String(parsed?.lastName || ""),
            email: String(parsed?.email || ""),
          });
        }
      } catch {
        // ignore
      }
    }
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined") {
      if (isDarkMode) document.documentElement.classList.add("dark");
      else document.documentElement.classList.remove("dark");
    }
  }, [isDarkMode]);

  const toggleDarkMode = () => {
    const next = !isDarkMode;
    setIsDarkMode(next);
    if (typeof window !== "undefined") localStorage.setItem("darkMode", String(next));
  };

  useEffect(() => {
    const loadTokens = async () => {
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const session = sessionData?.session;
        const userId = sessionData?.session?.user?.id ?? (typeof window !== "undefined" ? localStorage.getItem("supabaseUserId") : null);
        const accessToken = sessionData?.session?.access_token;
        if (session?.user) {
          setUserInfo((prev) => ({
            firstName: prev.firstName || String(session.user.user_metadata?.first_name || ""),
            lastName: prev.lastName || String(session.user.user_metadata?.last_name || ""),
            email: prev.email || String(session.user.email || ""),
          }));
        }

        if (userId) {
          const res = await dashboardApiFetch("/api/tokens", {
            headers: {
              ...(accessToken ? {} : {}),
              ...(userId && !accessToken ? { "x-user-id": userId } : {}),
            },
          });
          if (res.ok) {
            const data = await res.json();
            setUserTokens({ balance: data.balance ?? 0 });
            const transactionsRes = await dashboardApiFetch("/api/tokens/transactions", {
              headers: {
                ...(accessToken ? {} : {}),
                ...(userId && !accessToken ? { "x-user-id": userId } : {}),
              },
            });
            if (transactionsRes.ok) {
              const tx = await transactionsRes.json();
              setTokenTransactions(Array.isArray(tx) ? tx : []);
            } else {
              setTokenTransactions([]);
            }
            setIsLoading(false);
            return;
          }
        }
        if (typeof window !== "undefined") {
          const raw = localStorage.getItem("userTokens");
          if (raw) {
            try {
              const parsed = JSON.parse(raw);
              setUserTokens({ balance: parsed.balance ?? 0 });
            } catch (_) {}
          }
        }
      } catch (_) {}
      finally {
        setIsLoading(false);
      }
    };
    loadTokens();
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const raw = localStorage.getItem("products");
    if (!raw) {
      setProductsFromStorage([]);
      return;
    }
    try {
      const arr = JSON.parse(raw) as Record<string, unknown>[];
      const active = arr.filter(
        (p: Record<string, unknown>) =>
          ["active", "reserved", "sold"].includes(String(p.status ?? "")) &&
          ["live-bid", "details-only", ""].includes(String(p.productType ?? p.product_type ?? ""))
      );
      setProductsFromStorage(active);
    } catch {
      setProductsFromStorage([]);
    }
  }, []);

  useEffect(() => {
    const load = async () => {
      try {
        const PAGE_SIZE = 1000;
        const allRows: any[] = [];
        let from = 0;
        let hasMore = true;
        while (hasMore) {
          const to = from + PAGE_SIZE - 1;
          const { data: chunk, error } = await supabase
            .from("products")
            .select("*")
            .in("status", ["active", "reserved", "sold"])
            .neq("status", "deleted")
            .order("created_at", { ascending: false })
            .range(from, to);
          if (error) break;
          const list = chunk ?? [];
          allRows.push(...list);
          hasMore = list.length === PAGE_SIZE;
          from += PAGE_SIZE;
        }
        const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        const filtered = allRows.filter((p: any) => {
          if (p.status !== 'sold') return true;
          if (!p.sold_at) return true;
          return p.sold_at >= twentyFourHoursAgo;
        });
        setRealProducts(filtered as Record<string, unknown>[]);
      } catch {
        setRealProducts([]);
      } finally {
        setIsLoadingProducts(false);
      }
    };
    load();
  }, []);

  useEffect(() => {
    const load = async () => {
      const saved = typeof window !== "undefined" ? localStorage.getItem("unlockedAuctions") : null;
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const accessToken = session?.access_token;
        const fallbackUserId = typeof window !== "undefined" ? localStorage.getItem("supabaseUserId") : null;
        const effectiveUserId = session?.user?.id || fallbackUserId;
        const mergedIds = new Set<string>();

        // 1) Preferred source: exact unlock history from tokens API
        if (effectiveUserId) {
          const unlockedProductsRes = await dashboardApiFetch("/api/tokens/unlocked-products", {
            headers: {
              ...(accessToken ? {} : {}),
              ...(effectiveUserId && !accessToken ? { "x-user-id": effectiveUserId } : {}),
            },
          });
          if (unlockedProductsRes.ok) {
            const unlockedProducts = (await unlockedProductsRes.json()) as Array<{ productId?: string; slug?: string | null; title?: string; imageUrl?: string | null; location?: string | null }>;
            const list = Array.isArray(unlockedProducts) ? unlockedProducts : [];
            setUnlockedProductsList(list);
            const ids = list.map((item) => String(item?.productId || "").trim()).filter(Boolean);
            ids.forEach((id) => mergedIds.add(id));
          }

          // Products with approved token refund are considered blocked again
          const refundRequestsRes = await dashboardApiFetch("/api/tokens/refund-requests", {
            headers: {
              ...(accessToken ? {} : {}),
              ...(effectiveUserId && !accessToken ? { "x-user-id": effectiveUserId } : {}),
            },
          });
          if (refundRequestsRes.ok) {
            const refundRows = (await refundRequestsRes.json()) as Array<{ product_id?: string; status?: string }>;
            const usedOnce = (Array.isArray(refundRows) ? refundRows : [])
              .map((row) => String(row?.product_id || "").trim())
              .filter(Boolean);
            const blocked = (Array.isArray(refundRows) ? refundRows : [])
              .filter((row) => String(row?.status || "") === "approved")
              .map((row) => String(row?.product_id || "").trim())
              .filter(Boolean);
            const pending = (Array.isArray(refundRows) ? refundRows : [])
              .filter((row) => String(row?.status || "") === "pending")
              .map((row) => String(row?.product_id || "").trim())
              .filter(Boolean);
            setUsedRefundAuctionProductIds(Array.from(new Set(usedOnce)));
            setBlockedAuctionProductIds(Array.from(new Set(blocked)));
            setPendingRefundAuctionProductIds(Array.from(new Set(pending)));
          } else {
            setUsedRefundAuctionProductIds([]);
            setBlockedAuctionProductIds([]);
            setPendingRefundAuctionProductIds([]);
          }
        }

        // 2) Legacy source: unlocked auctions endpoint
        if (accessToken) {
          const res = await dashboardApiFetch("/api/user/unlocked-auctions", {
          });
          if (res.ok) {
            const ids = (await res.json()) as string[];
            (Array.isArray(ids) ? ids : []).forEach((id) => mergedIds.add(String(id)));
          }
        }

        // 3) Local fallback (older clients)
        if (saved) {
          try {
            (JSON.parse(saved) as string[]).forEach((id) => mergedIds.add(String(id)));
          } catch {
            // ignore invalid local data
          }
        }

        // 4) Mereu completăm din istoric tranzacții (spent, deblocare) – sursă de adevăr pentru toate ID-urile deblocate
        if (effectiveUserId) {
          const txRes = await dashboardApiFetch("/api/tokens/transactions", {
            headers: {
              ...(accessToken ? {} : {}),
              ...(effectiveUserId && !accessToken ? { "x-user-id": effectiveUserId } : {}),
            },
          });
          if (txRes.ok) {
            const txRows = (await txRes.json()) as Array<{ type?: string; description?: string; productId?: string }>;
            (Array.isArray(txRows) ? txRows : []).forEach((tx) => {
              if (String(tx?.type || "") !== "spent") return;
              const productId = tx?.productId ? String(tx.productId).trim() : null;
              if (productId) {
                mergedIds.add(productId);
                return;
              }
              const description = String(tx?.description || "");
              if (!/deblocare produs/i.test(description)) return;
              const markerId = description.match(/\[product_id:([a-f0-9-]{8,})\]/i)?.[1]?.trim();
              if (markerId) mergedIds.add(markerId);
            });
          }
        }

        setUnlockedAuctions(Array.from(mergedIds));

        // Încarcă obligatoriu toate produsele deblocate via API server-side (bypass RLS), ca produsele din import admin (licitații publice) să apară
        if (mergedIds.size > 0) {
          const allIds = Array.from(mergedIds);
          try {
            const res = await dashboardApiFetchWithOptionalBearer(
              supabase,
              `/api/products/unlocked-by-ids?ids=${encodeURIComponent(allIds.join(","))}`
            );
            if (res.ok) {
              const rows = (await res.json()) as Record<string, unknown>[];
              setUnlockedProductsFromDb(Array.isArray(rows) ? rows : []);
            } else {
              setUnlockedProductsFromDb([]);
            }
          } catch {
            setUnlockedProductsFromDb([]);
          }
        } else {
          setUnlockedProductsFromDb([]);
        }
      } catch {
        if (saved) {
          try {
            setUnlockedAuctions(JSON.parse(saved) as string[]);
          } catch {
            setUnlockedAuctions([]);
          }
        } else {
          setUnlockedAuctions([]);
        }
      } finally {
        setIsLoadingUnlocked(false);
      }
    };
    loadUnlockedRef.current = load;
    load();
  }, []);

  useEffect(() => {
    const onVisibility = () => {
      if (typeof document !== "undefined" && document.visibilityState === "visible") {
        loadUnlockedRef.current?.();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  // Completăm ID-urile deblocate din tokenTransactions (sursă de adevăr) ca să apară toate cele 8
  useEffect(() => {
    const list = Array.isArray(tokenTransactions) ? tokenTransactions : [];
    const ids = list
      .filter((t: { type?: string; productId?: string }) => t?.type === "spent" && t?.productId)
      .map((t: { productId: string }) => String(t.productId).trim())
      .filter(Boolean);
    if (ids.length === 0) return;
    setUnlockedAuctions((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => next.add(id));
      return Array.from(next);
    });
    // Titluri pentru placeholder din descrierea tranzacției (păstrăm toate intrările din prev, nu colapsăm la cheie goală)
    setUnlockedProductsList((prev) => {
      const byId = new Map<string, { productId?: string; title?: string; slug?: string | null; imageUrl?: string | null; location?: string | null }>();
      prev.forEach((p) => {
        const id = String(p?.productId ?? "").trim();
        if (id) byId.set(id, p);
      });
      list.forEach((t: { type?: string; productId?: string; description?: string }) => {
        if (t?.type !== "spent" || !t?.productId) return;
        const id = String(t.productId).trim();
        const titleFromTx = typeof t.description === "string" && t.description.length > 4 ? t.description.trim() : "";
        if (!byId.has(id) && titleFromTx) byId.set(id, { productId: id, title: titleFromTx });
      });
      return Array.from(byId.values());
    });
  }, [tokenTransactions]);

  useEffect(() => {
    const loadFav = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.access_token) {
          const res = await dashboardApiFetch("/api/user/favorites", { headers: {} });
          if (res.ok) {
            const data = (await res.json()) as { favorites?: { item_id: string; item_type: string }[] };
            const list = data.favorites ?? [];
            setFavoriteAuctions(list.filter((f) => f.item_type === "auction").map((f) => f.item_id));
            return;
          }
        }
        const saved = typeof window !== "undefined" ? localStorage.getItem("favoriteAuctions") : null;
        if (saved) {
          try {
            setFavoriteAuctions(JSON.parse(saved) as string[]);
          } catch {
            setFavoriteAuctions([]);
          }
        } else setFavoriteAuctions([]);
      } catch {
        setFavoriteAuctions([]);
      }
    };
    loadFav();
  }, []);

  /** Convertește o intrare din API (unlocked-products) într-un obiect minimal pentru card, când produsul nu e în DB */
  const placeholderFromUnlockedEntry = (entry: { productId?: string; title?: string; slug?: string | null; imageUrl?: string | null; location?: string | null }): Record<string, unknown> => {
    const id = String(entry?.productId || "").trim() || "unknown";
    const route = "licitatii-publice";
    const slug = entry?.slug ? String(entry.slug) : null;
    const productUrl = slug ? `/${route}/${slug}` : "#";
    return {
      id,
      productDbId: id,
      url: productUrl,
      title: (entry?.title && entry.title !== "Produs indisponibil") ? entry.title : "Anunț deblocat (detalii indisponibile)",
      image: entry?.imageUrl || "/no-image-placeholder.svg",
      currentBid: 0,
      timeLeft: "—",
      description: "",
      seller: "—",
      condition: "—",
      year: new Date().getFullYear().toString(),
      location: entry?.location || "—",
      shipping: "—",
      paymentMethods: [],
      returnPolicy: "—",
      warranty: "—",
      category: "diverse",
      subcategory: "diverse",
      isTest: false,
      productType: "licitatii-publice",
      saleType: "licitatie-publica",
      auctionDate: undefined,
      customFields: {},
      createdAt: undefined,
      address: undefined,
      coordinates: undefined,
      currency: "RON",
      status: "active",
      isPremium: false,
    };
  };

  const allAuctions = useMemo(() => {
    const fromUnlockedDb = (unlockedProductsFromDb as Record<string, unknown>[]).map((p) => convertProductToAuction(p));
    const fromReal = (realProducts as Record<string, unknown>[]).map((p) => convertProductToAuction(p));
    const fromStorage = (productsFromStorage as Record<string, unknown>[]).map((p) => convertProductToAuction(p));
    const merged = [...fromUnlockedDb, ...fromReal, ...fromStorage];
    const seen = new Set<string>();
    const deduped = merged.filter((a) => {
      const id = String((a as { id?: string }).id || "");
      if (!id) return false;
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    });
    // Carduri placeholder pentru ID-uri deblocate care nu au produs în DB (șterse sau inexistente)
    for (const uid of unlockedAuctions) {
      if (!uid) continue;
      const already = deduped.some((a) => {
        const ax = a as { id?: string; productDbId?: unknown };
        return ax.id === uid || (ax.productDbId != null && String(ax.productDbId) === uid);
      });
      if (already) continue;
      const entry = unlockedProductsList.find((p) => String(p?.productId || "").trim() === uid);
      if (entry) deduped.push(placeholderFromUnlockedEntry(entry));
    }
    return deduped;
  }, [unlockedProductsFromDb, realProducts, productsFromStorage, unlockedAuctions, unlockedProductsList]);

  const exclusiveAuctions = useMemo(() => {
    return allAuctions.filter((a) => {
      const ax = a as { id: string; productDbId?: unknown };
      const id = ax.id;
      const dbId = ax.productDbId != null ? String(ax.productDbId) : null;
      return unlockedAuctions.includes(id) || (dbId != null && unlockedAuctions.includes(dbId));
    });
  }, [allAuctions, unlockedAuctions]);

  const filteredAuctions = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const base = q
      ? [...exclusiveAuctions].filter((item) => {
          const x = item as { title?: string; location?: string; category?: string; subcategory?: string };
          const haystack = `${x.title || ""} ${x.location || ""} ${x.category || ""} ${x.subcategory || ""}`.toLowerCase();
          return haystack.includes(q);
        })
      : [...exclusiveAuctions];

    return base.sort((a, b) => {
      const ax = a as { timeLeft: string; currentBid: number; title: string; createdAt?: string; id: string; productDbId?: unknown };
      const bx = b as { timeLeft: string; currentBid: number; title: string; createdAt?: string; id: string; productDbId?: unknown };

      const aProductId = ax.productDbId != null ? String(ax.productDbId) : String(ax.id || "");
      const bProductId = bx.productDbId != null ? String(bx.productDbId) : String(bx.id || "");
      const aBlocked = blockedAuctionProductIds.includes(aProductId);
      const bBlocked = blockedAuctionProductIds.includes(bProductId);

      // Blocatele sunt mereu la final, indiferent de sortare.
      if (aBlocked !== bBlocked) return aBlocked ? 1 : -1;

      const aTs = new Date(String(ax.createdAt || 0)).getTime() || 0;
      const bTs = new Date(String(bx.createdAt || 0)).getTime() || 0;
      switch (sortBy) {
        case "newest": return bTs - aTs;
        case "oldest": return aTs - bTs;
        case "timeLeft": return (ax.timeLeft ?? "").localeCompare(bx.timeLeft ?? "");
        case "priceLow": return (ax.currentBid ?? 0) - (bx.currentBid ?? 0);
        case "priceHigh": return (bx.currentBid ?? 0) - (ax.currentBid ?? 0);
        case "title": return (ax.title ?? "").localeCompare(bx.title ?? "");
        default: return bTs - aTs;
      }
    });
  }, [exclusiveAuctions, sortBy, blockedAuctionProductIds, searchQuery]);

  const nonTestAuctions = useMemo(
    () => filteredAuctions.filter((a) => !(a as { isTest?: boolean }).isTest),
    [filteredAuctions]
  );

  const itemsPerPage = isMobileLayout ? 8 : 12; // mobile: 2x4, desktop: 4x3
  const totalPages = Math.max(1, Math.ceil(nonTestAuctions.length / itemsPerPage));

  const displayedAuctions = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return nonTestAuctions.slice(startIndex, startIndex + itemsPerPage);
  }, [nonTestAuctions, currentPage, itemsPerPage]);

  const isAuctionFavorite = (auctionId: string) => favoriteAuctions.includes(auctionId);

  const handleToggleFavorite = async (auctionId: string) => {
    const isFav = isAuctionFavorite(auctionId);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (isFav) {
        if (session?.access_token) {
          const res = await dashboardApiFetch(`/api/user/favorites?itemId=${auctionId}&itemType=auction`, { method: "DELETE", headers: {} });
          if (res.ok) {
            setFavoriteAuctions((prev) => prev.filter((id) => id !== auctionId));
            if (typeof window !== "undefined") localStorage.setItem("favoriteAuctions", JSON.stringify(favoriteAuctions.filter((id) => id !== auctionId)));
          }
        } else {
          const next = favoriteAuctions.filter((id) => id !== auctionId);
          setFavoriteAuctions(next);
          if (typeof window !== "undefined") localStorage.setItem("favoriteAuctions", JSON.stringify(next));
        }
      } else {
        const auction = allAuctions.find((a) => (a as { id: string }).id === auctionId) as { id: string; title?: string } | undefined;
        if (auction) {
          setSelectedProductForFavorite({ id: auctionId, title: auction.title ?? "Produs" });
          setShowFavoriteModal(true);
        }
      }
    } catch (_) {}
  };

  const handleFavoriteModalSuccess = () => {
    setShowFavoriteModal(false);
    setSelectedProductForFavorite(null);
    const load = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.access_token) {
          const res = await dashboardApiFetch("/api/user/favorites", { headers: {} });
          if (res.ok) {
            const data = (await res.json()) as { favorites?: { item_id: string; item_type: string }[] };
            const list = data.favorites ?? [];
            setFavoriteAuctions(list.filter((f) => f.item_type === "auction").map((f) => f.item_id));
          }
        }
      } catch (_) {}
    };
    load();
  };

  const loading = isLoadingProducts || isLoadingUnlocked;

  const getAuctionProductId = (auction: { productDbId?: unknown; id: string }): string => {
    return auction.productDbId != null ? String(auction.productDbId) : String(auction.id || "");
  };

  const handleUnlockBlockedAuction = async (auction: { productDbId?: unknown; id: string; title?: string }) => {
    const productId = getAuctionProductId(auction);
    if (!productId) {
      setToastMessage({ type: "error", text: "Nu am putut identifica produsul pentru deblocare." });
      return;
    }

    setUnlockingAuctionProductId(productId);
    try {
      const accessToken = await getSupabaseAccessTokenRobust(supabase);
      if (!accessToken) {
        const currentUrl = typeof window !== "undefined" ? window.location.pathname + window.location.search : "";
        const loginUrl = currentUrl ? `/auth?mode=login&redirect=${encodeURIComponent(currentUrl)}` : "/auth?mode=login";
        router.push(loginUrl);
        return;
      }

      const response = await dashboardApiFetch("/api/tokens/spend", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          amount: 1,
          productId,
          reason: `Re-deblocare după returnare token: ${String(auction.title || productId)}`,
        }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error === "Insufficient tokens" ? "Nu ai suficiente token-uri (1 necesar)." : (data.error || "Nu am putut debloca anunțul."));
      }

      setBlockedAuctionProductIds((prev) => prev.filter((id) => id !== productId));
      if (typeof data?.newBalance === "number") {
        setUserTokens({ balance: data.newBalance });
      }
      setUnlockedAuctions((prev) => (prev.includes(productId) ? prev : [...prev, productId]));
      setToastMessage({ type: "success", text: "Anunț deblocat din nou cu succes." });
      loadUnlockedRef.current?.();
    } catch (error: any) {
      setToastMessage({ type: "error", text: error?.message || "Eroare la deblocare." });
    } finally {
      setUnlockingAuctionProductId(null);
    }
  };

  const openRefundModal = (auction: { productDbId?: unknown; id: string; title?: string }) => {
    const productId = getAuctionProductId(auction);
    if (!productId) {
      setToastMessage({ type: "error", text: "Nu am putut identifica anunțul pentru cerere." });
      return;
    }
    if (usedRefundAuctionProductIds.includes(productId)) {
      setToastMessage({
        type: "error",
        text: "Ai folosit deja cererea de token pentru acest anunț. Este permisă o singură dată.",
      });
      return;
    }
    setSelectedAuctionForRefund({
      productId,
      title: String(auction.title || "Anunț"),
      code: productId.slice(0, 8).toUpperCase(),
    });
    setRefundReason("");
    setRefundModalNotice(null);
    setShowRefundRequestModal(true);
  };

  const submitRefundRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAuctionForRefund) return;
    if (refundReason.trim().length < 8) {
      setRefundModalNotice({ type: "error", text: "Scrie un motiv mai detaliat (minim 8 caractere)." });
      return;
    }

    setIsSubmittingRefundRequest(true);
    try {
      const session = await getSupabaseSessionRobust(supabase);
      const fallbackUserId = typeof window !== "undefined" ? localStorage.getItem("supabaseUserId") : null;
      const accessToken = session?.access_token ?? null;
      const effectiveUserId = session?.user?.id || fallbackUserId;

      const response = await dashboardApiFetch("/api/tokens/refund-requests", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(accessToken ? {} : {}),
          ...(effectiveUserId && !accessToken ? { "x-user-id": effectiveUserId } : {}),
        },
        body: JSON.stringify({
          productId: selectedAuctionForRefund.productId,
          reason: refundReason.trim(),
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Nu am putut trimite cererea.");

      // Update instant în UI: marcăm produsul ca "pending refund"
      setPendingRefundAuctionProductIds((prev) => {
        const id = selectedAuctionForRefund.productId;
        if (!id) return prev;
        return prev.includes(id) ? prev : [...prev, id];
      });
      setUsedRefundAuctionProductIds((prev) => {
        const id = selectedAuctionForRefund.productId;
        if (!id) return prev;
        return prev.includes(id) ? prev : [...prev, id];
      });

      setRefundModalNotice({ type: "success", text: "Cererea a fost trimisă către Support tokeni." });
      setTimeout(() => {
        setShowRefundRequestModal(false);
        setRefundModalNotice(null);
      }, 2000);
    } catch (error: any) {
      setRefundModalNotice({ type: "error", text: error?.message || "Eroare la trimiterea cererii." });
    } finally {
      setIsSubmittingRefundRequest(false);
    }
  };

  useEffect(() => {
    if (!refundModalNotice) return;
    const timer = setTimeout(() => setRefundModalNotice(null), 2000);
    return () => clearTimeout(timer);
  }, [refundModalNotice]);

  useEffect(() => {
    if (!toastMessage) return;
    const timer = setTimeout(() => setToastMessage(null), 2500);
    return () => clearTimeout(timer);
  }, [toastMessage]);

  useEffect(() => {
    if (!refundUsedNotice) return;
    const timer = setTimeout(() => setRefundUsedNotice(null), 3000);
    return () => clearTimeout(timer);
  }, [refundUsedNotice]);

  useEffect(() => {
    const timer = setInterval(() => {
      setNowTimestamp(Date.now());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const handleResize = () => {
      if (typeof window === "undefined") return;
      setIsMobileLayout(window.innerWidth < 1024);
    };
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    setCurrentPage((prev) => {
      if (prev > totalPages) return totalPages;
      if (prev < 1) return 1;
      return prev;
    });
  }, [totalPages]);

  useEffect(() => {
    setCurrentPage(1);
  }, [sortBy, itemsPerPage, nonTestAuctions.length]);

  return (
    <div
      className={`min-h-screen transition-all duration-300 relative ${
        isDarkMode
          ? "bg-gradient-to-br from-gray-900 via-gray-800 to-gray-700"
          : "bg-gradient-to-br from-gray-50 via-white to-gray-50"
      } max-md:h-dvh max-md:flex max-md:flex-col max-md:overflow-hidden`}
    >
      <div className="relative z-[1] max-md:flex max-md:flex-col max-md:flex-1 max-md:min-h-0">
        <UniversalHeader
          isDarkMode={isDarkMode}
          onToggleDarkMode={toggleDarkMode}
        />

        <div className="max-md:flex-1 max-md:min-h-0 max-md:flex max-md:flex-col max-md:overflow-hidden">
          <div className="max-w-6xl mx-auto w-full px-3 sm:px-6 lg:px-8 py-4 md:py-8 max-md:flex-1 max-md:min-h-0 max-md:overflow-y-auto max-md:overflow-x-hidden">
            <div className="mb-6">
              <BackButton fallbackHref="/dashboard" label="Înapoi" className="shadow-md" />
            </div>

            {/* Page Header - diamant + Anunțuri exclusive */}
            <div className="mb-3 md:mb-8">
              <div
                className={`backdrop-blur-lg rounded-xl md:rounded-2xl p-3 md:p-8 shadow-xl md:shadow-2xl border ${
                  isDarkMode ? "bg-white/10 border-white/20" : "bg-white border-gray-200"
                }`}
              >
                <div className="flex items-center gap-2 md:gap-4 min-w-0 max-md:overflow-hidden">
                  <div
                    className="rounded-full shadow-xl md:shadow-2xl flex-shrink-0 w-10 h-10 md:w-20 md:h-20 flex items-center justify-center"
                    style={{
                      background: "linear-gradient(to right, #3B82F6 0%, #3B82F6 33.333%, #FDE047 33.333%, #FDE047 66.666%, #F87171 66.666%, #F87171 100%)",
                    }}
                  >
                    <svg viewBox="0 0 64 56" className="w-5 h-4 md:w-10 md:h-9 shrink-0" fill="white" aria-hidden style={{ filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.3))" }}>
                      <path d="M6 0 h52 l-8 14-18 42-18-42-8-14z" />
                    </svg>
                  </div>
                  <div className="min-w-0 flex-1">
                    <h2 className={`text-lg md:text-4xl font-bold max-md:truncate max-md:mb-0 ${isDarkMode ? "text-white" : "text-gray-900"}`}>
                      Anunțuri exclusive
                    </h2>
                    <p className={`text-xs mt-0.5 max-md:hidden ${isDarkMode ? "text-gray-400" : "text-gray-600"}`}>
                      Secțiune dedicată anunțurilor exclusive și gestionării token-urilor
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Buton Token-uri */}
            <div className="mb-4 md:mb-8">
              <Link
                href="/dashboard/tokens"
                className={`flex items-center gap-2 md:gap-4 p-3 md:p-6 rounded-xl md:rounded-2xl border shadow-md md:shadow-lg hover:shadow-lg md:hover:shadow-xl transition-all duration-300 ${
                  isDarkMode
                    ? "bg-gradient-to-r from-yellow-600/20 to-amber-600/20 border-yellow-500/40 hover:from-yellow-600/30 hover:to-amber-600/30"
                    : "bg-gradient-to-r from-yellow-50 to-amber-50 border-yellow-200 hover:from-yellow-100 hover:to-amber-100"
                }`}
              >
                <div className={`w-10 h-10 md:w-16 md:h-16 rounded-full flex items-center justify-center flex-shrink-0 ${isDarkMode ? "bg-yellow-500/30" : "bg-yellow-400"}`}>
                  <CoinsIcon size="l" className={`${isDarkMode ? "text-yellow-300" : "text-yellow-800"} max-md:scale-75`} />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className={`text-sm md:text-xl font-semibold ${isDarkMode ? "text-white" : "text-gray-900"}`}>
                    Centrul de Tokens
                  </h3>
                  <p className={`text-xs md:text-sm mt-0.5 ${isDarkMode ? "text-gray-400" : "text-gray-600"}`}>
                    {isLoading ? "Se încarcă..." : `${userTokens.balance.toLocaleString()} token-uri disponibile`}
                  </p>
                </div>
                <span className={`text-lg md:text-2xl ${isDarkMode ? "text-gray-400" : "text-gray-400"}`} aria-hidden>→</span>
              </Link>
            </div>

            {/* Zona Anunțuri exclusive – toate licitațiile publice deblocate cu token; flux tokeni aici */}
            <div
              className={`backdrop-blur-lg rounded-xl md:rounded-2xl p-3 md:p-8 shadow-xl md:shadow-2xl border ${
                isDarkMode ? "bg-white/10 border-white/20" : "bg-white border-gray-200"
              }`}
            >
              <h3 className={`text-base md:text-xl font-bold mb-0.5 md:mb-1 ${isDarkMode ? "text-white" : "text-gray-900"}`}>
                Anunțuri exclusive
              </h3>
              <p className={`text-xs md:text-sm mb-3 md:mb-4 ${isDarkMode ? "text-gray-400" : "text-gray-600"}`}>
                Toate anunțurile pe care le-ai deblocat cu 1 token apar aici. Token-ul se cheltuiește pe pagina licitației (buton „Deblochează”), iar salvarea și gestionarea se face pe această pagină.
              </p>

              {loading ? (
                <div className={`flex justify-center py-8 md:py-16 ${isDarkMode ? "text-gray-400" : "text-gray-500"}`}>
                  <div className="animate-spin rounded-full h-8 w-8 md:h-10 md:w-10 border-2 border-blue-500 border-t-transparent" />
                </div>
              ) : (
                <>
                  {/* Toolbar: Search + sort */}
                  <div className="flex flex-col md:flex-row gap-1.5 md:gap-3 md:justify-between md:items-center mb-3 md:mb-6">
                    <div className="relative flex-1 md:max-w-sm">
                      <i className={`ri-search-line absolute left-2.5 md:left-3 top-1/2 -translate-y-1/2 text-sm md:text-base ${isDarkMode ? "text-gray-400" : "text-gray-500"}`} />
                      <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Caută în anunțurile deblocate..."
                        className={`w-full pl-8 md:pl-9 pr-2.5 md:pr-3 py-1.5 md:py-2 rounded-lg md:rounded-xl border-0 text-xs md:text-sm transition-all duration-200 focus:ring-2 focus:ring-blue-500 focus:outline-none ${
                          isDarkMode ? "bg-gray-700 text-white placeholder-gray-400" : "bg-gray-100 text-gray-900 placeholder-gray-500"
                        }`}
                      />
                    </div>
                    <div className="relative md:min-w-[180px]">
                      <select
                        value={sortBy}
                        onChange={(e) => setSortBy(e.target.value)}
                        className={`appearance-none px-3 md:px-4 py-1.5 md:py-2 pr-8 md:pr-10 rounded-lg md:rounded-xl border-0 text-xs md:text-sm transition-all duration-200 focus:ring-2 focus:ring-blue-500 focus:outline-none ${
                          isDarkMode ? "bg-gray-700 text-white hover:bg-gray-600" : "bg-gray-100 text-gray-900 hover:bg-gray-200"
                        }`}
                      >
                        <option value="newest">Cele mai noi</option>
                        <option value="oldest">Cele mai vechi</option>
                        <option value="timeLeft">Timp rămas</option>
                        <option value="priceLow">Preț crescător</option>
                        <option value="priceHigh">Preț descrescător</option>
                        <option value="title">Titlu A-Z</option>
                      </select>
                      <div className="absolute inset-y-0 right-0 flex items-center pr-2 md:pr-3 pointer-events-none">
                        <svg className={`w-3.5 h-3.5 md:w-4 md:h-4 ${isDarkMode ? "text-gray-400" : "text-gray-500"}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </div>
                    </div>
                  </div>

                  <p className={`mb-2 md:mb-4 text-xs md:text-sm ${isDarkMode ? "text-gray-300" : "text-gray-600"}`}>
                    {filteredAuctions.length} licitații găsite
                  </p>

                  {displayedAuctions.length === 0 ? (
                    <div className={`text-center py-6 md:py-12 rounded-lg md:rounded-xl border-2 border-dashed ${isDarkMode ? "border-white/20 text-gray-400" : "border-gray-200 text-gray-500"}`}>
                      <p className="text-sm md:text-base font-medium">Niciun anunț exclusiv deblocat.</p>
                      <p className="text-xs md:text-sm mt-1 md:mt-2 px-2">Anunțurile deblocate cu 1 token vor apărea aici.</p>
                      <Link
                        href="/licitatii-publice"
                        className={`inline-flex items-center gap-1.5 mt-3 md:mt-4 px-3 md:px-4 py-1.5 md:py-2 rounded-lg md:rounded-xl text-sm font-medium transition ${isDarkMode ? "bg-blue-500 hover:bg-blue-600 text-white" : "bg-blue-600 hover:bg-blue-700 text-white"}`}
                      >
                        <i className="ri-auction-line text-sm" /> Caută licitații
                      </Link>
                    </div>
                  ) : (
                    <div className={`${viewMode === "grid" ? "grid grid-cols-2 lg:grid-cols-4 gap-2 md:gap-4" : "space-y-2 md:space-y-4"}`}>
                      {displayedAuctions.map((auction) => {
                        const a = auction as Record<string, unknown> & {
                          id: string; url?: string; title?: string; image?: string; timeLeft?: string; currentBid?: number;
                          location?: string; address?: string; coordinates?: unknown; description?: string;
                          category?: string; saleType?: string; productType?: string; condition?: string;
                          auctionDate?: string; createdAt?: string;
                          customFields?: Record<string, unknown>;
                          productDbId?: unknown;
                        };
                        const productId = getAuctionProductId(a);
                        const isBlocked = blockedAuctionProductIds.includes(productId);
                        const hasPendingRefundRequest = pendingRefundAuctionProductIds.includes(productId);
                        const hasUsedRefundRequest = usedRefundAuctionProductIds.includes(productId);
                        const isPub = isLicitatiiPublice(a);
                        const hasMap = false;
                        let timeDisplay = a.timeLeft ?? "";
                        let isEnded = false;
                        let countdownDays = "00";
                        let countdownHours = "00";
                        let countdownMinutes = "00";
                        let countdownSeconds = "00";
                        if (a.auctionDate) {
                          const now = nowTimestamp;
                          let end = new Date(a.auctionDate as string).getTime();
                          const customFields = (a.customFields || {}) as Record<string, unknown>;
                          const isRollingDaily = Boolean(customFields.auction_rolling_daily);
                          const rollingWeeklyWeekday = customFields.rolling_weekly_weekday;
                          const rollingTime = customFields.auction_time || customFields.ora_licitatie || "17:00";

                          if (Number.isFinite(end) && end <= now) {
                            if (isRollingDaily) {
                              end = getNextMidnightTimestamp(now);
                            } else if (rollingWeeklyWeekday != null && String(rollingWeeklyWeekday).trim() !== "") {
                              const weekly = getNextWeeklyTimestamp(rollingWeeklyWeekday, rollingTime, now);
                              if (weekly) end = weekly;
                            } else {
                              // Same UX as auction detail page: keep a future countdown
                              // even when stored auction date is stale.
                              end = getTimestampIn30Days(now);
                            }
                          }

                          if (!Number.isFinite(end) || end <= now) {
                            isEnded = true;
                            timeDisplay = "Licitația s-a încheiat";
                          } else {
                            const diffMs = end - now;
                            const d = Math.floor(diffMs / (1000 * 60 * 60 * 24));
                            const h = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
                            const m = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
                            const s = Math.floor((diffMs % (1000 * 60)) / 1000);
                            countdownDays = String(d).padStart(2, "0");
                            countdownHours = String(h).padStart(2, "0");
                            countdownMinutes = String(m).padStart(2, "0");
                            countdownSeconds = String(s).padStart(2, "0");
                            timeDisplay = d > 0 ? `${d} ${d === 1 ? "zi" : "zile"}` : h > 0 ? `${h}h ${m > 0 ? m + "m" : ""}`.trim() : `${m}m`;
                          }
                        } else if (a.timeLeft === "Terminat") {
                          isEnded = true;
                          timeDisplay = "Licitația s-a încheiat";
                        } else {
                          const dayMatch = String(a.timeLeft || "").match(/(\d+)\s*zile?/i);
                          const hourMatch = String(a.timeLeft || "").match(/(\d+)h/i);
                          const minMatch = String(a.timeLeft || "").match(/(\d+)m/i);
                          countdownDays = String(dayMatch?.[1] || 0).padStart(2, "0");
                          countdownHours = String(hourMatch?.[1] || 0).padStart(2, "0");
                          countdownMinutes = String(minMatch?.[1] || 0).padStart(2, "0");
                        }
                        return (
                          <div
                            key={a.id}
                            role="button"
                            tabIndex={0}
                            onClick={() => { if (!isBlocked && !hasPendingRefundRequest) window.location.href = (a.url as string) || `#`; }}
                            onKeyDown={(e) => { if ((e.key === "Enter" || e.key === " ") && !isBlocked && !hasPendingRefundRequest) { e.preventDefault(); window.location.href = (a.url as string) || `#`; } }}
                            className={`group backdrop-blur-lg rounded-xl shadow-xl overflow-hidden transition-all duration-300 border ${
                              isBlocked
                                ? "border-red-500/80 ring-1 ring-red-500/40"
                                : "border-green-500/80 ring-1 ring-green-500/30 hover:shadow-2xl hover:scale-[1.02] cursor-pointer"
                            } w-full rounded-xl md:rounded-[18px] ${isDarkMode ? "bg-white/10" : "bg-white"}`}
                          >
                            <div className={`w-full ${hasPendingRefundRequest ? "filter blur-[2px]" : ""}`}>
                              <div className="relative h-32 sm:h-44 md:h-56 overflow-hidden">
                                {hasMap ? (
                                  <div className="h-full w-full" onClick={(e) => e.stopPropagation()}>
                                    <PropertyMap address={(a.address ?? a.location) as string} coordinates={a.coordinates as { lat: number; lng: number } | undefined} height="h-full" />
                                  </div>
                                ) : (
                                  <div className="h-full w-full bg-cover bg-center" style={{ backgroundImage: `url(${a.image ?? "/no-image-placeholder.svg"})` }} />
                                )}

                                <div className="absolute top-1 left-1 sm:top-3 sm:left-3">
                                  <span className="inline-flex items-center gap-0.5 rounded-lg md:rounded-xl px-1 py-0.5 text-[10px] sm:text-[11px] font-bold text-white shadow-md bg-gradient-to-r from-blue-700 via-blue-600 to-sky-500">
                                    <i className="ri-shield-star-line text-[10px] sm:text-[11px]" /> Exclusiv
                                  </span>
                                </div>

                                <div className="absolute top-1 right-1 sm:top-3 sm:right-3 flex items-center gap-1 sm:gap-2">
                                  <button
                                    type="button"
                                    onClick={(e) => { e.stopPropagation(); handleToggleFavorite(a.id); }}
                                    className={`h-6 w-6 sm:h-8 sm:w-8 rounded-full border shadow-md flex items-center justify-center transition ${
                                      isAuctionFavorite(a.id)
                                        ? "bg-red-500 border-red-500"
                                        : "bg-white/95 border-gray-200"
                                    }`}
                                    title={isAuctionFavorite(a.id) ? "Elimină din favorite" : "Adaugă la favorite"}
                                  >
                                    <HeartIcon size="m" className={isAuctionFavorite(a.id) ? "text-white fill-white" : "text-red-500"} strokeWidth={1.8} />
                                  </button>
                                  {isBlocked && (
                                    <span className="h-6 w-6 sm:h-8 sm:w-8 rounded-md sm:rounded-lg bg-red-500 text-white shadow-md flex items-center justify-center">
                                      <i className="ri-lock-2-line text-[10px] sm:text-sm" />
                                    </span>
                                  )}
                                </div>

                                <div className="absolute left-1 right-1 sm:left-2 sm:right-2 bottom-1 sm:bottom-2 grid grid-cols-4 gap-0.5 sm:gap-1">
                                  {[
                                    { v: countdownDays, l: "Zile" },
                                    { v: countdownHours, l: "Ore" },
                                    { v: countdownMinutes, l: "Min" },
                                    { v: countdownSeconds, l: "Sec" },
                                  ].map((box) => (
                                    <div key={box.l} className="rounded bg-white/90 backdrop-blur px-0.5 py-0.5 sm:px-1 sm:py-0.5 text-center">
                                      <div className="text-[9px] sm:text-[11px] font-bold text-gray-900 leading-none">{box.v}</div>
                                      <div className="text-[7px] sm:text-[9px] text-gray-600 leading-none mt-0.5">{box.l}</div>
                                    </div>
                                  ))}
                                </div>
                              </div>

                              <div className="p-1.5 sm:p-3 md:p-3.5">
                                <h3 className="text-[11px] sm:text-[14px] leading-tight font-semibold text-gray-900 line-clamp-2 min-h-[2rem] md:min-h-[2.3rem]" title={String(a.title ?? "")}>
                                  {a.title ?? "Produs"}
                                </h3>

                                {isPub && (
                                  <div className="mt-1 sm:mt-2">
                                    <span className="inline-flex items-center gap-0.5 rounded px-1 py-0.5 text-[9px] sm:text-[10px] font-medium bg-blue-50 text-blue-700 border border-blue-200">
                                      <i className="ri-auction-line text-[9px] sm:text-[10px]" /> Lic. Publică
                                    </span>
                                  </div>
                                )}

                                <div className="mt-1 sm:mt-2 text-[10px] sm:text-[12px] leading-tight text-gray-900">
                                  <span className="font-medium">Oferta:</span>{" "}
                                  <span className="font-bold">{formatNumber(Number(a.currentBid ?? 0))} Lei</span>
                                </div>

                                <div className="mt-1 sm:mt-2 flex items-center justify-between gap-1 sm:gap-2">
                                  <div className="flex items-center gap-0.5 text-amber-600 text-[9px] sm:text-[10px] font-medium">
                                    <i className="ri-coin-line" />
                                    1 Token
                                  </div>
                                  {isBlocked ? (
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleUnlockBlockedAuction(a);
                                      }}
                                      disabled={unlockingAuctionProductId === productId}
                                      className={`rounded-lg md:rounded-2xl px-1.5 sm:px-2.5 md:px-3 py-0.5 sm:py-1 text-[9px] sm:text-[10px] leading-none text-white whitespace-nowrap ${
                                        unlockingAuctionProductId === productId
                                          ? "bg-yellow-400 cursor-wait"
                                          : "bg-[#F4B400] hover:bg-[#e0a300]"
                                      }`}
                                    >
                                      {unlockingAuctionProductId === productId ? "Se deblochează..." : "Deblochează"}
                                    </button>
                                  ) : (
                                    <div className="relative">
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          if (hasPendingRefundRequest || hasUsedRefundRequest) {
                                            setRefundUsedNotice({
                                              productId,
                                              text: "Cererea de token a fost deja folosită (maxim o dată)",
                                            });
                                            return;
                                          }
                                          openRefundModal(a);
                                        }}
                                        className="inline-flex items-center gap-0.5 px-1 py-0.5 sm:px-1.5 sm:py-1 rounded md:rounded-lg text-[8px] sm:text-[9px] font-medium bg-red-50 text-red-700 hover:bg-red-100 border border-red-200 whitespace-nowrap"
                                      >
                                        <i className="ri-refund-2-line" />
                                        Cerere token
                                      </button>
                                      {refundUsedNotice?.productId === productId && (
                                        <div className="absolute right-0 bottom-full mb-2 z-30 min-w-[210px] max-w-[280px] rounded-2xl border border-[#F0A343] bg-[#DB830D] px-3 py-2 text-center text-white text-[11px] md:text-xs font-semibold leading-snug shadow-[0_10px_24px_rgba(0,0,0,0.26)] pointer-events-none">
                                          {refundUsedNotice.text}
                                        </div>
                                      )}
                                    </div>
                                  )}
                                </div>

                                <div className="mt-1 sm:mt-2 flex items-center gap-1 text-gray-600 text-[9px] sm:text-[10px]">
                                  <i className="ri-map-pin-line shrink-0" />
                                  <span className="truncate">{getDisplayCity(a.location as string) || a.location || "—"}</span>
                                </div>
                              </div>
                            </div>
                            {hasPendingRefundRequest && (
                              <div className="absolute inset-0 z-20 flex items-center justify-center px-3 pointer-events-none">
                                <div className="rounded-xl bg-red-600/90 text-white text-xs md:text-sm font-semibold px-3 py-2 text-center shadow-xl border border-red-300/50">
                                  S-a făcut cerere de restituire token
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {totalPages > 1 && displayedAuctions.length > 0 && (
                    <WheelPaginationFooter isDarkMode={isDarkMode} className="mt-3 md:mt-6">
                      <WheelPagination
                        totalPages={totalPages}
                        currentPage={currentPage}
                        onPageChange={(p) => setCurrentPage(p)}
                        canGoNext={currentPage < totalPages}
                        isDarkMode={isDarkMode}
                      />
                    </WheelPaginationFooter>
                  )}
                </>
              )}
            </div>

            {/* Istoric Tranzacții Tokens - jos în dashboard/exclusiv */}
            <div
              className={`mt-4 md:mt-8 backdrop-blur-lg rounded-xl md:rounded-2xl p-3 md:p-6 shadow-xl md:shadow-2xl border ${
                isDarkMode ? "bg-white/10 border-white/20" : "bg-white border-gray-200"
              }`}
            >
              <h3 className={`text-base md:text-xl font-bold mb-2 md:mb-4 ${isDarkMode ? "text-white" : "text-gray-900"}`}>
                Istoric Tranzacții Tokens
              </h3>

              {tokenTransactions.length === 0 ? (
                <p className={`text-xs md:text-sm ${isDarkMode ? "text-gray-300" : "text-gray-600"}`}>
                  Nu există tranzacții disponibile.
                </p>
              ) : (
                <div className="overflow-x-auto -mx-1">
                  <table className="w-full min-w-[320px]">
                    <thead>
                      <tr className={`border-b ${isDarkMode ? "border-gray-700" : "border-gray-200"}`}>
                        <th className={`text-left py-1.5 md:py-2 px-1 md:px-3 text-[10px] md:text-sm ${isDarkMode ? "text-gray-300" : "text-gray-600"}`}>Tranzacție</th>
                        <th className={`text-left py-1.5 md:py-2 px-1 md:px-3 text-[10px] md:text-sm ${isDarkMode ? "text-gray-300" : "text-gray-600"}`}>Tip</th>
                        <th className={`text-left py-1.5 md:py-2 px-1 md:px-3 text-[10px] md:text-sm ${isDarkMode ? "text-gray-300" : "text-gray-600"}`}>Sumă</th>
                        <th className={`text-left py-1.5 md:py-2 px-1 md:px-3 text-[10px] md:text-sm max-md:hidden ${isDarkMode ? "text-gray-300" : "text-gray-600"}`}>Status</th>
                        <th className={`text-left py-1.5 md:py-2 px-1 md:px-3 text-[10px] md:text-sm ${isDarkMode ? "text-gray-300" : "text-gray-600"}`}>Data</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tokenTransactions.slice(0, 10).map((transaction) => {
                        const amount = Number(transaction?.amount || 0);
                        const status = String(transaction?.status || "");
                        const statusLabel =
                          status === "completed" ? "Completată" :
                          status === "pending" ? "În așteptare" :
                          status === "failed" ? "Eșuată" : status || "N/A";
                        const dateRaw = String(transaction?.date || "");
                        const dateDisplay = dateRaw.includes("-") ? dateRaw.split("-").reverse().join("-") : dateRaw || "N/A";

                        return (
                          <tr key={transaction.id} className={`border-b ${isDarkMode ? "border-gray-700" : "border-gray-200"}`}>
                            <td className="py-1.5 md:py-2 px-1 md:px-3">
                              <div className="min-w-0 max-w-[120px] md:max-w-none">
                                <p className={`text-[10px] md:text-sm font-medium truncate ${isDarkMode ? "text-white" : "text-gray-900"}`}>
                                  {cleanTransactionDescription(transaction?.description)}
                                </p>
                                <p className={`text-[9px] md:text-xs ${isDarkMode ? "text-gray-400" : "text-gray-600"}`}>
                                  {String(transaction?.paymentMethod || "N/A")}
                                </p>
                              </div>
                            </td>
                            <td className={`py-1.5 md:py-2 px-1 md:px-3 text-[10px] md:text-sm ${isDarkMode ? "text-white" : "text-gray-900"}`}>
                              {formatTransactionTypeRo(transaction?.type)}
                            </td>
                            <td className={`py-1.5 md:py-2 px-1 md:px-3 text-[10px] md:text-sm font-semibold ${amount > 0 ? "text-green-600" : "text-red-600"}`}>
                              {amount > 0 ? "+" : ""}{amount.toLocaleString()}
                            </td>
                            <td className="py-1.5 md:py-2 px-1 md:px-3 max-md:hidden">
                              <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-medium ${
                                status === "completed" ? "bg-green-100 text-green-700" :
                                status === "pending" ? "bg-yellow-100 text-yellow-700" :
                                status === "failed" ? "bg-red-100 text-red-700" :
                                "bg-gray-100 text-gray-700"
                              }`}>
                                {statusLabel}
                              </span>
                            </td>
                            <td className={`py-1.5 md:py-2 px-1 md:px-3 text-[10px] md:text-sm whitespace-nowrap ${isDarkMode ? "text-gray-300" : "text-gray-700"}`}>
                              {dateDisplay}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {selectedProductForFavorite && (
              <AddToFavoriteListModal
                itemType="auction"
                isOpen={showFavoriteModal}
                onClose={() => { setShowFavoriteModal(false); setSelectedProductForFavorite(null); }}
                productId={selectedProductForFavorite.id}
                productTitle={selectedProductForFavorite.title}
                isDarkMode={isDarkMode}
                onSuccess={handleFavoriteModalSuccess}
              />
            )}
          </div>
        </div>
      </div>

      {toastMessage && (
        <div className="fixed left-1/2 -translate-x-1/2 z-[120] px-4" style={{ bottom: 'var(--gobid-floating-bottom)' }}>
          <div
            className={`px-4 py-2 rounded-xl shadow-xl text-sm font-medium ${
              toastMessage.type === "success"
                ? "bg-green-600 text-white"
                : "bg-red-600 text-white"
            }`}
          >
            {toastMessage.text}
          </div>
        </div>
      )}

      {showRefundRequestModal && selectedAuctionForRefund && (
        <div
          className="fixed inset-0 z-[200000] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setShowRefundRequestModal(false)}
        >
          <div
            className={`w-full max-w-lg rounded-2xl p-5 border shadow-2xl ${
              isDarkMode ? "bg-gray-900 border-gray-700" : "bg-white border-gray-200"
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className={`text-lg font-semibold ${isDarkMode ? "text-white" : "text-gray-900"}`}>
                Cerere token pentru anunț
              </h3>
              <button
                type="button"
                onClick={() => setShowRefundRequestModal(false)}
                className={`${isDarkMode ? "text-gray-300 hover:text-white" : "text-gray-500 hover:text-gray-900"}`}
              >
                <i className="ri-close-line text-xl" />
              </button>
            </div>

            <form onSubmit={submitRefundRequest} className="space-y-3">
              {refundModalNotice && (
                <div
                  className={`rounded-lg px-3 py-2 text-sm font-medium ${
                    refundModalNotice.type === "success"
                      ? "bg-green-600 text-white"
                      : "bg-red-600 text-white"
                  }`}
                >
                  {refundModalNotice.text}
                </div>
              )}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className={`block text-xs mb-1 ${isDarkMode ? "text-gray-400" : "text-gray-600"}`}>Nume</label>
                  <input
                    readOnly
                    value={`${userInfo.firstName} ${userInfo.lastName}`.trim() || "Utilizator"}
                    className={`w-full rounded-lg border px-3 py-2 text-sm ${isDarkMode ? "bg-gray-800 border-gray-700 text-gray-200" : "bg-gray-50 border-gray-300 text-gray-700"}`}
                  />
                </div>
                <div>
                  <label className={`block text-xs mb-1 ${isDarkMode ? "text-gray-400" : "text-gray-600"}`}>Email</label>
                  <input
                    readOnly
                    value={userInfo.email || "—"}
                    className={`w-full rounded-lg border px-3 py-2 text-sm ${isDarkMode ? "bg-gray-800 border-gray-700 text-gray-200" : "bg-gray-50 border-gray-300 text-gray-700"}`}
                  />
                </div>
              </div>

              <div className={`rounded-lg px-3 py-2 text-xs ${isDarkMode ? "bg-gray-800 text-gray-300" : "bg-gray-100 text-gray-700"}`}>
                <strong>Cod:</strong> {selectedAuctionForRefund.code || "N/A"} <br />
                <strong>Anunț:</strong> {selectedAuctionForRefund.title}
              </div>

              <div>
                <label className={`block text-xs mb-1 ${isDarkMode ? "text-gray-400" : "text-gray-600"}`}>Motiv</label>
                <textarea
                  required
                  rows={4}
                  value={refundReason}
                  onChange={(e) => setRefundReason(e.target.value)}
                  placeholder="Scrie motivul pentru care ceri tokenul înapoi..."
                  className={`w-full rounded-lg border px-3 py-2 text-sm ${isDarkMode ? "bg-gray-800 border-gray-700 text-white placeholder-gray-500" : "bg-white border-gray-300 text-gray-900 placeholder-gray-500"}`}
                />
              </div>

              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setShowRefundRequestModal(false)}
                  className="px-3 py-2 rounded-lg text-sm bg-gray-500 hover:bg-gray-600 text-white"
                >
                  Anulează
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingRefundRequest}
                  className="px-3 py-2 rounded-lg text-sm bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-60"
                >
                  {isSubmittingRefundRequest ? "Se trimite..." : "Trimite cererea"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="max-md:hidden">
        <DashboardFooter isDarkMode={isDarkMode} />
      </div>
    </div>
  );
}
