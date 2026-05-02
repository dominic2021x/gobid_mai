"use client";

import { dashboardApiFetch } from "@/lib/dashboard-api-fetch";
import { useEffect, useMemo, useState } from "react";
import Hammer from "@/components/Hammer";
import {
  SearchIcon,
  CoinsIcon,
  SettingsIcon,
  CreditCardIcon,
  HeartIcon,
  SupportIcon
} from "@/components/HeroIcons";
import UniversalHeader from "@/components/UniversalHeader";
import MyAuctionsSection from "@/components/MyAuctionsSection";
import { supabase } from "@/lib/supabase";
import {
  resolveAccountTypeWithUser,
  shouldRedirectAwayFromExecutorRoutes,
} from "@/lib/auth/resolveAccountType";
import { useRouter } from "next/navigation";

type WatchlistProduct = {
  id: string;
  title: string;
  category: string;
  image: string;
  startingPrice?: number | null;
  finalPrice?: number | null;
  auctionDate?: string | null;
  status?: string | null;
  addedAt?: string | null;
  url?: string | null;
  slug?: string | null;
};

type WonAuction = {
  id: string;
  title: string;
  category: string;
  image: string;
  finalPrice?: number | null;
  wonAt: string;
};

type ActivityItem = {
  id: string;
  description: string;
  amount?: string;
  timestamp: string;
  status?: string;
};

type HistoryRow = {
  id: string;
  title: string;
  status: string;
  amount?: string;
  date: string;
};

type DbWatchlistRow = { product_id?: string | null; created_at?: string | null };
type DbActivityLog = {
  id: string;
  event?: string | null;
  created_at: string;
  properties?: Record<string, unknown> | null;
};
type DbProductRow = Record<string, unknown> & { id: string };

const PLACEHOLDER_IMAGE =
  "https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=800&q=80";

function formatCurrency(value?: number | null): string {
  if (value === undefined || value === null || Number.isNaN(value)) {
    return "0 Lei";
  }
  return `${value.toLocaleString("ro-RO")} Lei`;
}

function parseNumeric(value: unknown): number | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value === "number" && !Number.isNaN(value)) return value;
  if (typeof value === "string") {
    const cleaned = Number(value.replace(/[\s,]+/g, "").replace(/[a-zA-Z]+/g, ""));
    if (!Number.isNaN(cleaned)) return cleaned;
  }
  return undefined;
}

function formatAmount(value: unknown): string | undefined {
  const numeric = parseNumeric(value);
  if (numeric !== undefined) return formatCurrency(numeric);
  if (typeof value === "string" && value.trim().length > 0) return value;
  return undefined;
}

function formatDate(value?: string | null): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("ro-RO", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  });
}

function timeAgoLabel(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  const diff = Date.now() - date.getTime();
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (diff < minute) return "acum";
  if (diff < hour) return `${Math.floor(diff / minute)} min`;
  if (diff < day) return `${Math.floor(diff / hour)} ore`;
  return `${Math.floor(diff / day)} zile`;
}

function timeLeftLabel(auctionDate?: string | null): string {
  if (!auctionDate) return "Data neprecizată";
  const end = new Date(auctionDate);
  if (Number.isNaN(end.getTime())) return "Data neprecizată";
  const diff = end.getTime() - Date.now();
  if (diff <= 0) return "Finalizată";

  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (diff < hour) return `${Math.ceil(diff / minute)} min`;
  if (diff < day) return `${Math.ceil(diff / hour)} ore`;
  const days = Math.floor(diff / day);
  const hours = Math.floor((diff % day) / hour);
  return `${days}z ${hours}h`;
}

function pickImage(images: unknown): string {
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
  return PLACEHOLDER_IMAGE;
}

export default function ExecutorDashboard() {
  const router = useRouter();
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [activeTab, setActiveTab] = useState<"overview" | "active" | "won" | "history" | "my-auctions" | "public-auctions">("overview");
  const [activeViewMode, setActiveViewMode] = useState<"grid" | "list">("grid");
  const [wonViewMode, setWonViewMode] = useState<"grid" | "list">("grid");
  const [activeCategoryFilter, setActiveCategoryFilter] = useState("all");
  const [wonCategoryFilter, setWonCategoryFilter] = useState("all");
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isPageLoading, setIsPageLoading] = useState(true);

  const [userInfo, setUserInfo] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    avatar: ""
  });

  const [userTokens, setUserTokens] = useState({
    balance: 0,
    totalEarned: 0,
    totalSpent: 0,
    level: "Basic"
  });

  const [userStats, setUserStats] = useState({
    totalBids: 0,
    wonAuctions: 0,
    activeBids: 0,
    totalSpent: 0
  });

  const [watchlistProducts, setWatchlistProducts] = useState<WatchlistProduct[]>([]);
  const [wonAuctions, setWonAuctions] = useState<WonAuction[]>([]);
  const [activityItems, setActivityItems] = useState<ActivityItem[]>([]);
  const [historyRows, setHistoryRows] = useState<HistoryRow[]>([]);
  const [isClient, setIsClient] = useState(false);
  
  // PDF Import states
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [isProcessingPdf, setIsProcessingPdf] = useState(false);
  const [extractedData, setExtractedData] = useState<any>(null);

  const handlePdfUpload = async (file: File) => {
    if (!file || file.type !== 'application/pdf') {
      return;
    }

    setIsProcessingPdf(true);
    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await dashboardApiFetch('/api/executor/parse-pdf', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error('Eroare la parsarea PDF-ului');
      }

      const data = await response.json();
      
      if (data.success && data.text) {
        // Aici poți procesa textul extras din PDF
        // De exemplu, poți trimite la un API pentru extragere automată de date
        console.log('PDF parsed successfully:', data.text.substring(0, 200));
      }
    } catch (error) {
      console.error('Error processing PDF:', error);
    } finally {
      setIsProcessingPdf(false);
    }
  };

  // Persist dark mode preference
  useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = window.localStorage.getItem("darkMode");
    if (saved !== null) {
      setIsDarkMode(saved === "true");
    }
  }, []);

  useEffect(() => {
    setIsClient(true);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.document.documentElement.classList.toggle("dark", isDarkMode);
    window.localStorage.setItem("darkMode", JSON.stringify(isDarkMode));
  }, [isDarkMode]);

  const toggleDarkMode = () => setIsDarkMode((prev) => !prev);

  useEffect(() => {
    let isMounted = true;

    const loadDashboardData = async () => {
      setIsPageLoading(true);
      try {
        const { user: resolvedUser, accountType } = await resolveAccountTypeWithUser(supabase);
        const { data: sessionData, error: initialSessionError } = await supabase.auth.getSession();
        let user = sessionData.session?.user ?? resolvedUser;
        let userId: string | null = null;

        console.log('[Dashboard] Initial session check:', {
          hasSession: !!sessionData.session,
          hasUser: !!user,
          userId: user?.id,
          sessionError: initialSessionError?.message,
          accountType,
        });

        // If no Supabase session, try to get userId from localStorage and attempt to set session
        if (!user && typeof window !== "undefined") {
          const savedUserInfo = localStorage.getItem('userInfo');
          const savedSupabaseUserId = localStorage.getItem('supabaseUserId');
          
          if (savedUserInfo) {
            try {
              const userInfo = JSON.parse(savedUserInfo);
              const supabaseUserId = savedSupabaseUserId || userInfo.supabaseUserId;
              
              if (supabaseUserId) {
                console.log('[Dashboard] Found supabaseUserId in localStorage:', supabaseUserId);
                userId = supabaseUserId;
              } else {
                userId = userInfo.email || 'local-user';
                console.log('[Dashboard] Using localStorage fallback for authentication (no supabaseUserId)');
              }
            } catch (e) {
              console.error('Error parsing userInfo from localStorage:', e);
            }
          }
        } else if (user) {
          userId = user.id;

          if (shouldRedirectAwayFromExecutorRoutes(accountType)) {
            if (typeof window !== "undefined") {
              window.location.href = "/dashboard";
            }
            return;
          }
        }

        // Check if user is admin or manager before redirecting
        if (!userId) {
          // Check if admin info exists in localStorage (admin/manager logged in)
          if (typeof window !== "undefined") {
            const savedAdminInfo = localStorage.getItem('adminInfo');
            if (savedAdminInfo) {
              try {
                const adminInfo = JSON.parse(savedAdminInfo);
                if (adminInfo.isAdmin || adminInfo.role === 'manager') {
                  // Admin/Manager can access dashboard, continue without userId
                  console.log('[Dashboard] Admin/Manager access granted');
                } else {
                  window.location.href = "/auth?mode=login";
                  return;
                }
              } catch (e) {
                console.error('Error parsing adminInfo:', e);
                window.location.href = "/auth?mode=login";
                return;
              }
            } else {
              window.location.href = "/auth?mode=login";
              return;
            }
          } else {
            return;
          }
        }

        // Get session for API calls (reuse sessionData from above)
        const session = sessionData.session;
        const accessToken = session?.access_token;
        
        console.log('[Dashboard] API session check:', {
          hasSession: !!session,
          hasAccessToken: !!accessToken,
          userId: user?.id
        });

        const [
          profileRes,
          tokensRes,
          watchlistRes,
          favoritesRes,
          activityRes
        ] = await Promise.all([
          supabase
            .from("user_profiles")
            .select("first_name,last_name,phone,avatar_url")
            .eq("user_id", userId)
            .maybeSingle(),
          // Use API endpoint instead of direct query to avoid RLS issues
          // If no accessToken, use userId from localStorage as fallback
          (async () => {
            console.log('[Dashboard] Fetching tokens from API:', {
              userId,
              hasAccessToken: !!accessToken,
              headers: {
                ...(userId && !accessToken ? { 'x-user-id': userId } : {}),
              },
            });
            
            try {
              const res = await dashboardApiFetch('/api/tokens', {
                headers: {
                  ...(userId && !accessToken ? { 'x-user-id': userId } : {}),
                },
              });
              
              console.log('[Dashboard] API tokens response status:', res.status);
              if (res.ok) {
                const data = await res.json();
                console.log('[Dashboard] API tokens response data:', data);
                return data;
              } else {
                const errorText = await res.text();
                console.error('[Dashboard] API tokens error:', errorText);
                return null;
              }
            } catch (err) {
              console.error('[Dashboard] API tokens fetch error:', err);
              return null;
            }
          })(),
          supabase
            .from("user_watchlist")
            .select("product_id,created_at")
            .eq("user_id", userId)
            .order("created_at", { ascending: false }),
          supabase
            .from("user_favorites")
            .select("item_id,item_type,created_at")
            .eq("user_id", userId),
          supabase
            .from("user_activity_logs")
            .select("id,event,properties,created_at")
            .eq("user_id", userId)
            .order("created_at", { ascending: false })
            .limit(100)
        ]);

        if (!isMounted) return;

        // Get user info from Supabase or localStorage fallback
        let userInfoFromStorage = null;
        if (!user && typeof window !== "undefined") {
          const savedUserInfo = localStorage.getItem('userInfo');
          if (savedUserInfo) {
            try {
              userInfoFromStorage = JSON.parse(savedUserInfo);
            } catch (e) {
              console.error('Error parsing userInfo:', e);
            }
          }
        }

        const profile = profileRes.data;
        setUserInfo({
          firstName: profile?.first_name ?? user?.user_metadata?.first_name ?? userInfoFromStorage?.firstName ?? "",
          lastName: profile?.last_name ?? user?.user_metadata?.last_name ?? userInfoFromStorage?.lastName ?? "",
          email: user?.email ?? userInfoFromStorage?.email ?? "",
          phone: profile?.phone ?? user?.user_metadata?.phone ?? userInfoFromStorage?.phone ?? "",
          avatar: profile?.avatar_url ?? user?.user_metadata?.avatar_url ?? userInfoFromStorage?.avatar ?? ""
        });

        // Get tokens from API response (tokensRes is now the JSON response from /api/tokens)
        const tokens = tokensRes;
        
        console.log('[Dashboard] Loading tokens:', {
          userId,
          tokensData: tokens,
          hasTokens: !!tokens,
          tokensType: typeof tokens,
          tokensIsNull: tokens === null,
          tokensIsUndefined: tokens === undefined,
          tokensBalance: tokens?.balance,
          tokensTotalEarned: tokens?.totalEarned,
          tokensTotalSpent: tokens?.totalSpent,
          accessToken: accessToken ? 'present' : 'missing'
        });
        
        // IMPORTANT: If tokens is null or undefined, it means the API call failed
        // In that case, we should NOT use localStorage fallback if we have a valid userId
        // because it means there's a real issue with the API call
        let tokensFromStorage = null;
        
        // Only use localStorage if Supabase has no record (tokens is null/undefined OR all zeros)
        // AND we don't have a valid session (meaning we're in a fallback scenario)
        const hasNoSupabaseRecord = !tokens || (tokens.balance === 0 && tokens.totalEarned === 0 && tokens.totalSpent === 0);
        const shouldUseLocalStorageFallback = hasNoSupabaseRecord && !accessToken && typeof window !== "undefined";
        
        if (shouldUseLocalStorageFallback) {
          const savedTokens = localStorage.getItem('userTokens');
          if (savedTokens) {
            try {
              tokensFromStorage = JSON.parse(savedTokens);
              console.log('[Dashboard] Using localStorage tokens as fallback (no Supabase session):', tokensFromStorage);
            } catch (e) {
              console.error('Error parsing userTokens:', e);
            }
          }
        }

        // Use Supabase values first, then localStorage, then 0
        // IMPORTANT: If tokens exists (even if balance is 0), use it - don't fallback to localStorage
        const finalTokens = {
          balance: tokens?.balance !== undefined && tokens?.balance !== null ? tokens.balance : (tokensFromStorage?.balance ?? 0),
          totalEarned: tokens?.totalEarned !== undefined && tokens?.totalEarned !== null ? tokens.totalEarned : (tokens?.total_earned !== undefined && tokens?.total_earned !== null ? tokens.total_earned : (tokensFromStorage?.totalEarned ?? tokensFromStorage?.total_earned ?? 0)),
          totalSpent: tokens?.totalSpent !== undefined && tokens?.totalSpent !== null ? tokens.totalSpent : (tokens?.total_spent !== undefined && tokens?.total_spent !== null ? tokens.total_spent : (tokensFromStorage?.totalSpent ?? tokensFromStorage?.total_spent ?? 0)),
          level: tokens?.level ?? tokens?.package ?? tokensFromStorage?.level ?? tokensFromStorage?.package ?? "Basic"
        };
        
        console.log('[Dashboard] Setting user tokens (FINAL):', {
          finalTokens,
          source: tokens ? 'Supabase API' : (tokensFromStorage ? 'localStorage fallback' : 'default (0)'),
          tokensBalance: tokens?.balance,
          tokensTotalEarned: tokens?.totalEarned ?? tokens?.total_earned,
          tokensTotalSpent: tokens?.totalSpent ?? tokens?.total_spent
        });
        
        setUserTokens(finalTokens);
        
        // Update localStorage with Supabase values if they exist (for caching)
        if (tokens && typeof window !== "undefined") {
          localStorage.setItem('userTokens', JSON.stringify({
            balance: tokens.balance ?? finalTokens.balance,
            totalEarned: tokens.totalEarned ?? tokens.total_earned ?? finalTokens.totalEarned,
            totalSpent: tokens.totalSpent ?? tokens.total_spent ?? finalTokens.totalSpent,
            level: tokens.level ?? tokens.package ?? finalTokens.level,
            package: tokens.package ?? tokens.level ?? finalTokens.level
          }));
        }

        const watchlistRows = watchlistRes.data ?? [];
        const favoritesRows = favoritesRes.data ?? [];
        const activityLogs = activityRes.data ?? [];

        const productIds = new Set<string>();
        watchlistRows.forEach((row: DbWatchlistRow) => {
          if (row.product_id) productIds.add(row.product_id);
        });
        favoritesRows.forEach((row: { product_id?: string; item_id?: string; item_type?: string }) => {
          const id = row.product_id ?? (row.item_type === "product" ? row.item_id : null);
          if (id) productIds.add(id);
        });
        activityLogs.forEach((log: DbActivityLog) => {
          const props = (log.properties ?? {}) as Record<string, unknown>;
          const productIdCandidate =
            props.product_id ?? props.productId ?? (props.product as Record<string, unknown>)?.id;
          if (typeof productIdCandidate === "string") {
            productIds.add(productIdCandidate);
          }
        });

        const productMap: Record<string, any> = {};
        if (productIds.size > 0) {
          const { data: productsData } = await supabase
            .from("products")
            .select("*")
            .in("id", Array.from(productIds))
            .neq('status', 'deleted');
          productsData?.forEach((product: DbProductRow) => {
            productMap[String(product.id)] = product;
          });
        }

        const normalizedWatchlist = watchlistRows.map((row: DbWatchlistRow) => {
          const product = row.product_id ? productMap[row.product_id] : undefined;
          return {
            id: row.product_id ?? "",
            title: product?.title ?? "Licitație",
            category: product?.category ?? "Nespecificat",
            image: pickImage(product?.images),
            startingPrice:
              product?.starting_price ?? product?.starting_price_ron ?? product?.starting_price_eur ?? null,
            auctionDate: product?.auction_date ?? null,
            status: product?.status ?? product?.product_type ?? null,
            addedAt: row.created_at
          } satisfies WatchlistProduct;
        });
        setWatchlistProducts(normalizedWatchlist);

        const normalizedWon = activityLogs
          .filter((log: DbActivityLog) => (log.event ?? "").toLowerCase().includes("won"))
          .map((log: DbActivityLog) => {
            const props = (log.properties ?? {}) as Record<string, unknown>;
            const productId =
              props.product_id ?? props.productId ?? (props.product as Record<string, unknown>)?.id;
            const product = typeof productId === "string" ? productMap[productId] : undefined;
            const finalPrice =
              parseNumeric(props.amount) ??
              parseNumeric(props.final_bid) ??
              parseNumeric(props.price);
            return {
              id: log.id,
              title: product?.title ?? (props.title as string) ?? "Licitație câștigată",
              category: product?.category ?? (props.category as string) ?? "Nespecificat",
              image: pickImage(product?.images),
              finalPrice: finalPrice ?? null,
              wonAt: log.created_at
            } satisfies WonAuction;
          });
        setWonAuctions(normalizedWon);

        const mappedActivity: ActivityItem[] = activityLogs.map((log: DbActivityLog) => {
          const props = (log.properties ?? {}) as Record<string, unknown>;
          return {
            id: log.id,
            description:
              (props.description as string) ??
              (props.title as string) ??
              log.event ??
              "Activitate",
            amount: formatAmount(props.amount ?? props.value ?? props.price),
            status: (props.status as string) ?? log.event ?? undefined,
            timestamp: log.created_at
          };
        });
        setActivityItems(mappedActivity);

        const mappedHistory: HistoryRow[] = activityLogs.map((log: DbActivityLog) => {
          const props = (log.properties ?? {}) as Record<string, unknown>;
          return {
            id: log.id,
            title:
              (props.title as string) ??
              (props.description as string) ??
              log.event ??
              "Licitație",
            status: (props.status as string) ?? log.event ?? "-",
            amount: formatAmount(props.amount ?? props.value ?? props.price),
            date: formatDate(log.created_at)
          };
        });
        setHistoryRows(mappedHistory);

        const bidsCount = activityLogs.filter((log: DbActivityLog) =>
          (log.event ?? "").toLowerCase().includes("bid"),
        ).length;
        const totalSpent =
          tokens?.total_spent ??
          normalizedWon.reduce((sum: number, won: WonAuction) => sum + (won.finalPrice ?? 0), 0);

        setUserStats({
          totalBids: bidsCount,
          wonAuctions: normalizedWon.length,
          activeBids: normalizedWatchlist.length,
          totalSpent
        });
      } catch (error) {
        console.error("Error loading dashboard data:", error);
      } finally {
        if (isMounted) {
          setIsPageLoading(false);
        }
      }
    };

    loadDashboardData();
    return () => {
      isMounted = false;
    };
  }, []);

  const handleLogout = async () => {
    try {
      // Sign out from Supabase
      const { error: signOutError } = await supabase.auth.signOut();
      
      if (signOutError) {
        console.error('Error signing out from Supabase:', signOutError);
      }
      
      // Clear all user data from localStorage
      if (typeof window !== "undefined") {
        localStorage.removeItem('userInfo');
        localStorage.removeItem('userTokens');
        localStorage.removeItem('favoriteAuctions');
        localStorage.removeItem('favoriteProducts');
        localStorage.removeItem('favoriteLists');
        localStorage.removeItem('unlockedAuctions');
        localStorage.removeItem('auctionNotifications');
        localStorage.removeItem('supabaseUserId');
        localStorage.removeItem('authRedirect');
      }
      
      // Redirect to home page
      if (typeof window !== "undefined") {
        window.location.href = "/";
      }
    } catch (error) {
      console.error('Error during logout:', error);
      // Still redirect even if there's an error
      if (typeof window !== "undefined") {
        window.location.href = "/";
      }
    }
  };

  const watchlistCategories = useMemo(() => {
    const categories = new Set<string>();
    watchlistProducts.forEach((item) => categories.add(item.category));
    return Array.from(categories);
  }, [watchlistProducts]);

  const wonCategories = useMemo(() => {
    const categories = new Set<string>();
    wonAuctions.forEach((item) => categories.add(item.category));
    return Array.from(categories);
  }, [wonAuctions]);

  const filteredWatchlist = useMemo(() => {
    const filtered =
      activeCategoryFilter === "all"
        ? watchlistProducts
        : watchlistProducts.filter((item) => item.category === activeCategoryFilter);
    return filtered;
  }, [activeCategoryFilter, watchlistProducts]);

  const filteredWonAuctions = useMemo(() => {
    const filtered =
      wonCategoryFilter === "all"
        ? wonAuctions
        : wonAuctions.filter((item) => item.category === wonCategoryFilter);
    return filtered;
  }, [wonCategoryFilter, wonAuctions]);

  const overviewStats = [
    {
      label: "TOTAL LICITAȚII",
      value: userStats.totalBids,
      icon: "ri-auction-line"
    },
    {
      label: "LICITAȚII CÂȘTIGATE",
      value: userStats.wonAuctions,
      icon: "ri-trophy-line"
    },
    {
      label: "LICITAȚII TRACK-uite",
      value: userStats.activeBids,
      icon: "ri-time-line"
    },
    {
      label: "TOTAL CHELTUIT",
      value: formatCurrency(userStats.totalSpent),
      icon: "ri-money-dollar-circle-line"
    }
  ];

  return (
    <div className={`min-h-screen transition-all duration-300 ${
      isDarkMode 
        ? 'bg-gradient-to-br from-gray-900 via-gray-800 to-gray-700' 
        : 'bg-gradient-to-br from-gray-50 via-white to-gray-50'
    }`}>
      {isPageLoading && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <Hammer size="xl" color="gold" animated className="scale-150" />
        </div>
      )}

      <UniversalHeader isDarkMode={isDarkMode} onToggleDarkMode={toggleDarkMode}/>

      {isMobileMenuOpen && (
        <div className="md:hidden fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/50" onClick={() => setIsMobileMenuOpen(false)} />
          <div className={`relative w-80 h-full ${isDarkMode ? "bg-gray-800" : "bg-white"} shadow-xl`}> 
            <div className="flex flex-col h-full">
              <div className="flex items-center justify-between p-4 border-b border-gray-700">
                <h2 className={`text-lg font-semibold ${isDarkMode ? "text-white" : "text-gray-900"}`}>Meniu</h2>
                <button
                  onClick={() => setIsMobileMenuOpen(false)}
                  className={`p-2 rounded-lg ${isDarkMode ? "hover:bg-gray-700 text-white" : "hover:bg-gray-100 text-gray-900"}`}
                >
                  ×
                </button>
              </div>
              <nav className="flex-1 p-4 space-y-2 text-sm">
                {[
                  { href: "/", label: "Homepage", icon: "🏠" },
                  { href: "/ro", label: "Licitatii", icon: "🔨" },
                  { href: "/dashboard/favorites", label: "Favorite", icon: "❤️" },
                  { href: "/dashboard/settings", label: "Setări", icon: "⚙️" },
                  { href: "/dashboard/tokens", label: "Token-uri", icon: "💰" },
                  { href: "/dashboard/payments", label: "Plăți", icon: "💳" },
                  { href: "/dashboard/support", label: "Suport", icon: "🎫" }
                ].map((item) => (
                  <a
                    key={item.href}
                    href={item.href}
                    onClick={() => setIsMobileMenuOpen(false)}
                    className={`flex items-center space-x-3 p-3 rounded-lg transition-colors ${
                      isDarkMode ? "text-gray-300 hover:bg-gray-700" : "text-gray-700 hover:bg-gray-100"
                    }`}
                  >
                    <span>{item.icon}</span>
                    <span>{item.label}</span>
                  </a>
                ))}
              </nav>
              <div className="p-4 border-t border-gray-700">
                <button
                  onClick={handleLogout}
                  className={`w-full flex items-center justify-center space-x-2 p-3 rounded-lg transition-colors ${
                    isDarkMode ? "bg-red-600 hover:bg-red-700 text-white" : "bg-red-100 hover:bg-red-200 text-red-600"
                  }`}
                >
                  <span>🚪</span>
                  <span>Ieșire</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <header className="mb-8 flex flex-col items-center gap-4 text-center relative">
          <div className={`w-16 h-16 rounded-full shadow-2xl overflow-hidden flex items-center justify-center ${
            isDarkMode 
              ? 'bg-gradient-to-r from-gray-600 to-gray-500' 
              : 'bg-gradient-to-r from-gray-300 to-gray-400'
          }`}>
            {userInfo.avatar ? (
              <img src={userInfo.avatar} alt="Avatar" className="w-full h-full object-cover" />
            ) : (
              <span className={`text-xl font-semibold ${
                isDarkMode ? 'text-white' : 'text-gray-900'
              }`}>
                {(userInfo.firstName?.[0] ?? "U").toUpperCase()}
                {(userInfo.lastName?.[0] ?? "U").toUpperCase()}
              </span>
            )}
          </div>
          <div>
            <h2 className={`text-3xl font-bold ${
              isDarkMode ? 'text-white' : 'text-gray-900'
            }`}>Bun venit, {userInfo.firstName || "utilizator"} 👋</h2>
            <p className={isDarkMode ? 'text-gray-300' : 'text-gray-600'}>Panou personalizat cu licitațiile urmărite și activitatea ta.</p>
          </div>
          {/* Logout Button */}
          <button
            onClick={handleLogout}
            className={`absolute top-0 right-0 px-4 py-2 rounded-lg transition-all duration-300 flex items-center gap-2 shadow-lg hover:shadow-xl transform hover:scale-105 ${
              isDarkMode 
                ? 'bg-red-600 hover:bg-red-700 text-white' 
                : 'bg-red-500 hover:bg-red-600 text-white'
            }`}
          >
            <i className="ri-logout-box-line"></i>
            <span className="font-medium">Ieșire</span>
          </button>
        </header>

        <section className={`${isDarkMode ? "bg-gray-800" : "bg-white"} rounded-xl p-6 shadow-lg mb-8`}>
          <h3 className={`${isDarkMode ? "text-white" : "text-gray-900"} text-xl font-semibold mb-4`}>
            Acțiuni rapide
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-7 gap-4">
            <a
              href="/dashboard/add-auction"
              className={`${isDarkMode ? "bg-blue-600 hover:bg-blue-700" : "bg-blue-500 hover:bg-blue-600"} p-4 rounded-lg text-center text-white shadow-lg hover:shadow-xl transform hover:scale-105 transition`}
            >
              <div className="text-2xl mb-2 flex justify-center">
                <i className="ri-add-circle-line text-3xl"></i>
              </div>
              <span className="text-sm font-medium">Adaugă licitație</span>
            </a>
            <a
              href="/dashboard/my-products"
              className={`${isDarkMode ? "bg-orange-600 hover:bg-orange-700" : "bg-orange-500 hover:bg-orange-600"} p-4 rounded-lg text-center text-white shadow-lg hover:shadow-xl transform hover:scale-105 transition`}
            >
              <div className="text-2xl mb-2 flex justify-center">
                <i className="ri-box-3-line text-3xl"></i>
              </div>
              <span className="text-sm font-medium">Produsele mele</span>
            </a>
            <a
              href="/ro"
              className={`${isDarkMode ? "bg-blue-600 hover:bg-blue-700" : "bg-blue-500 hover:bg-blue-600"} p-4 rounded-lg text-center text-white shadow-lg hover:shadow-xl transform hover:scale-105 transition`}
            >
              <div className="text-2xl mb-2 flex justify-center"><SearchIcon size="l" /></div>
              <span className="text-sm font-medium">Caută licitații</span>
            </a>
            <a
              href="/dashboard/tokens"
              className={`${isDarkMode ? "bg-yellow-600 hover:bg-yellow-700" : "bg-yellow-500 hover:bg-yellow-600"} p-4 rounded-lg text-center text-white shadow-lg hover:shadow-xl transform hover:scale-105 transition`}
            >
              <div className="text-2xl mb-2 flex justify-center"><CoinsIcon size="l" /></div>
              <span className="text-sm font-medium">Token-uri ({userTokens.balance})</span>
            </a>
            <a
              href="/dashboard/settings"
              className={`${isDarkMode ? "bg-blue-600 hover:bg-blue-700" : "bg-blue-500 hover:bg-blue-600"} p-4 rounded-lg text-center text-white shadow-lg hover:shadow-xl transform hover:scale-105 transition`}
            >
              <div className="text-2xl mb-2 flex justify-center"><SettingsIcon size="l" /></div>
              <span className="text-sm font-medium">Setări</span>
            </a>
            <a
              href="/dashboard/payments"
              className={`${isDarkMode ? "bg-green-600 hover:bg-green-700" : "bg-green-500 hover:bg-green-600"} p-4 rounded-lg text-center text-white shadow-lg hover:shadow-xl transform hover:scale-105 transition`}
            >
              <div className="text-2xl mb-2 flex justify-center"><CreditCardIcon size="l" /></div>
              <span className="text-sm font-medium">Plăți</span>
            </a>
            <a
              href="/dashboard/favorites"
              className={`${isDarkMode ? "bg-red-600 hover:bg-red-700" : "bg-red-500 hover:bg-red-600"} p-4 rounded-lg text-center text-white shadow-lg hover:shadow-xl transform hover:scale-105 transition`}
            >
              <div className="text-2xl mb-2 flex justify-center"><HeartIcon size="l" /></div>
              <span className="text-sm font-medium">Favorite</span>
            </a>
            <a
              href="/dashboard/support"
              className={`${isDarkMode ? "bg-teal-600 hover:bg-teal-700" : "bg-teal-700 hover:bg-teal-800"} p-4 rounded-lg text-center text-white shadow-lg hover:shadow-xl transform hover:scale-105 transition`}
            >
              <div className="text-2xl mb-2 flex justify-center"><SupportIcon size="l" /></div>
              <span className="text-sm font-medium">Suport</span>
            </a>
          </div>
        </section>

        <section className="mb-8">
          <div className={`rounded-2xl p-2 backdrop-blur-lg flex flex-wrap gap-2 ${
            isDarkMode 
              ? 'bg-white/10 border border-white/20' 
              : 'bg-gray-100 border border-gray-200'
          }`}>
            {[
              { id: "overview", label: "Prezentare" },
              { id: "active", label: "Active" },
              { id: "won", label: "Câștigate" },
              { id: "history", label: "Istoric" },
              { id: "my-auctions", label: "Licitații mele" },
              { id: "public-auctions", label: "Licitații Publice" }
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as typeof activeTab)}
                className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                  activeTab === tab.id
                    ? isDarkMode
                      ? "bg-gradient-to-r from-gray-600 to-gray-500 text-white shadow-lg"
                      : "bg-gradient-to-r from-gray-700 to-gray-600 text-white shadow-lg"
                    : isDarkMode
                      ? "text-gray-200 hover:text-white hover:bg-white/10"
                      : "text-gray-700 hover:text-gray-900 hover:bg-gray-200"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </section>

        {activeTab === "overview" && (
          <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            {overviewStats.map((stat) => (
              <div
                key={stat.label}
                className={`rounded-2xl p-5 shadow-2xl backdrop-blur-lg ${
                  isDarkMode 
                    ? 'bg-white/10 border border-white/20 text-white' 
                    : 'bg-white border border-gray-200 text-gray-900'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className={`text-xs uppercase tracking-wide ${
                      isDarkMode ? 'text-gray-200' : 'text-gray-600'
                    }`}>{stat.label}</p>
                    <p className="text-3xl font-bold mt-2">
                      {typeof stat.value === "number" ? stat.value : stat.value}
                    </p>
                  </div>
                  <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${
                    isDarkMode ? 'bg-white/20' : 'bg-gray-100'
                  }`}>
                    <i className={`${stat.icon} text-2xl`} />
                  </div>
                </div>
              </div>
            ))}
          </section>
        )}

        {activeTab === "active" && (
          <section className="space-y-6">
            <div className="flex flex-col sm:flex-row gap-4 justify-between">
              <div className="flex items-center gap-2">
                <label className={`text-sm font-medium ${isDarkMode ? "text-gray-300" : "text-gray-700"}`}>
                  Categorie:
                </label>
                <select
                  value={activeCategoryFilter}
                  onChange={(e) => setActiveCategoryFilter(e.target.value)}
                  className={`${
                    isDarkMode
                      ? "bg-gray-800 border-gray-700 text-white"
                      : "bg-white border-gray-300 text-gray-900"
                  } px-3 py-2 rounded-lg border text-sm`}
                >
                  <option value="all">Toate</option>
                  {watchlistCategories.map((category) => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setActiveViewMode("grid")}
                  className={`p-2 rounded-lg ${
                    activeViewMode === "grid"
                      ? isDarkMode
                        ? "bg-gradient-to-r from-gray-600 to-gray-500 text-white shadow-lg"
                        : "bg-gradient-to-r from-gray-700 to-gray-600 text-white shadow-lg"
                      : isDarkMode
                        ? "bg-white/10 text-gray-300 hover:bg-white/20"
                        : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                  }`}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h5v5H4zM15 6h5v5h-5zM4 15h5v5H4zM15 15h5v5h-5z" />
                  </svg>
                </button>
                <button
                  onClick={() => setActiveViewMode("list")}
                  className={`p-2 rounded-lg ${
                    activeViewMode === "list"
                      ? isDarkMode
                        ? "bg-gradient-to-r from-gray-600 to-gray-500 text-white shadow-lg"
                        : "bg-gradient-to-r from-gray-700 to-gray-600 text-white shadow-lg"
                      : isDarkMode
                        ? "bg-white/10 text-gray-300 hover:bg-white/20"
                        : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                  }`}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                  </svg>
                </button>
              </div>
            </div>

            {filteredWatchlist.length === 0 ? (
              <div className={`border border-dashed rounded-2xl p-8 text-center ${
                isDarkMode 
                  ? 'border-gray-600 text-gray-300' 
                  : 'border-gray-300 text-gray-600'
              }`}>
                Nu urmărești încă nicio licitație. Adaugă produse în watchlist din pagina licitațiilor.
              </div>
            ) : activeViewMode === "grid" ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredWatchlist.map((item) => (
                  <article
                    key={item.id}
                    className={`rounded-2xl overflow-hidden shadow-2xl backdrop-blur-lg ${
                      isDarkMode 
                        ? 'bg-white/10 border border-white/20' 
                        : 'bg-white border border-gray-200'
                    }`}
                  >
                    <div
                      className="h-40 bg-cover bg-center"
                      style={{ backgroundImage: `url(${item.image})` }}
                    >
                      <div className="h-full w-full bg-black/30 flex items-end p-4 text-white">
                        <div>
                          <p className="text-sm font-semibold">🏆 Câștigat</p>
                          <p className="text-xs text-gray-200">{formatDate(item.auctionDate)}</p>
                        </div>
                      </div>
                    </div>
                    <div className={`p-4 space-y-3 ${
                      isDarkMode ? 'text-white' : 'text-gray-900'
                    }`}>
                      <span className="px-3 py-1 text-xs rounded-full bg-blue-600/70">{item.category}</span>
                      <h3 className="text-lg font-semibold leading-tight">{item.title}</h3>
                      <div className={`text-sm ${
                        isDarkMode ? 'text-gray-200' : 'text-gray-600'
                      }`}>
                        Preț final: {formatCurrency(item.finalPrice ?? undefined)}
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="space-y-3">
                {filteredWatchlist.map((item) => (
                  <article
                    key={item.id}
                    className={`rounded-2xl shadow-2xl backdrop-blur-lg flex flex-col md:flex-row ${
                      isDarkMode 
                        ? 'bg-white/10 border border-white/20' 
                        : 'bg-white border border-gray-200'
                    }`}
                  >
                    <div
                      className="md:w-48 h-40 md:h-auto bg-cover bg-center"
                      style={{ backgroundImage: `url(${item.image})` }}
                    />
                    <div className={`flex-1 p-4 space-y-2 ${
                      isDarkMode ? 'text-white' : 'text-gray-900'
                    }`}>
                      <div className="flex items-center gap-2">
                        <span className="px-3 py-1 text-xs rounded-full bg-blue-600/70">
                          {item.category}
                        </span>
                        <span
                          className={`text-xs ${
                            isDarkMode ? 'text-gray-300' : 'text-gray-600'
                          }`}
                          suppressHydrationWarning
                        >
                          {isClient ? timeLeftLabel(item.auctionDate) : "-"}
                        </span>
                      </div>
                      <h3 className="text-xl font-semibold">{item.title}</h3>
                      <div className={`text-sm ${
                        isDarkMode ? 'text-gray-200' : 'text-gray-600'
                      }`}>
                        Preț pornire: {formatCurrency(item.startingPrice ?? undefined)}
                      </div>
                      <div className={`text-xs ${
                        isDarkMode ? 'text-gray-300' : 'text-gray-500'
                      }`} suppressHydrationWarning>
                        {isClient ? `Adăugat pe ${formatDate(item.addedAt)}` : "Adăugat"}
                      </div>
                    </div>
                    <div className="p-4 flex items-end">
                      <a
                        href={item.url || (item.slug ? item.slug : '#')}
                        className="px-4 py-2 rounded-lg bg-green-600 hover:bg-green-700 transition text-white"
                      >
                        Detalii
                      </a>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        )}

        {activeTab === "won" && (
          <section className="space-y-6">
            <div className="flex flex-col sm:flex-row gap-4 justify-between">
              <div className="flex items-center gap-2">
                <label className={`text-sm font-medium ${isDarkMode ? "text-gray-300" : "text-gray-700"}`}>
                  Categorie:
                </label>
                <select
                  value={wonCategoryFilter}
                  onChange={(e) => setWonCategoryFilter(e.target.value)}
                  className={`${
                    isDarkMode
                      ? "bg-gray-800 border-gray-700 text-white"
                      : "bg-white border-gray-300 text-gray-900"
                  } px-3 py-2 rounded-lg border text-sm`}
                >
                  <option value="all">Toate</option>
                  {wonCategories.map((category) => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setWonViewMode("grid")}
                  className={`p-2 rounded-lg ${
                    wonViewMode === "grid"
                      ? "bg-gradient-to-r from-gray-600 to-gray-500 text-white shadow-lg"
                      : "bg-white/10 text-gray-300 hover:bg-white/20"
                  }`}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h5v5H4zM15 6h5v5h-5zM4 15h5v5H4zM15 15h5v5h-5z" />
                  </svg>
                </button>
                <button
                  onClick={() => setWonViewMode("list")}
                  className={`p-2 rounded-lg ${
                    wonViewMode === "list"
                      ? "bg-gradient-to-r from-gray-600 to-gray-500 text-white shadow-lg"
                      : "bg-white/10 text-gray-300 hover:bg-white/20"
                  }`}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                  </svg>
                </button>
              </div>
            </div>

            {filteredWonAuctions.length === 0 ? (
              <div className={`border border-dashed rounded-2xl p-8 text-center ${
                isDarkMode 
                  ? 'border-gray-600 text-gray-300' 
                  : 'border-gray-300 text-gray-600'
              }`}>
                Încă nu ai licitații câștigate. Când vei câștiga una, apare aici.
              </div>
            ) : wonViewMode === "grid" ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredWonAuctions.map((item) => (
                  <article
                    key={item.id}
                    className={`rounded-2xl overflow-hidden shadow-2xl backdrop-blur-lg ${
                      isDarkMode 
                        ? 'bg-white/10 border border-white/20' 
                        : 'bg-white border border-gray-200'
                    }`}
                  >
                    <div
                      className="h-40 bg-cover bg-center"
                      style={{ backgroundImage: `url(${item.image})` }}
                    >
                      <div className="h-full w-full bg-black/30 flex items-end p-4 text-white">
                        <div>
                          <p className="text-sm font-semibold">🏆 Câștigat</p>
                          <p className="text-xs text-gray-200">{formatDate(item.wonAt)}</p>
                        </div>
                      </div>
                    </div>
                    <div className={`p-4 space-y-3 ${
                      isDarkMode ? 'text-white' : 'text-gray-900'
                    }`}>
                      <span className="px-3 py-1 text-xs rounded-full bg-blue-600/70">{item.category}</span>
                      <h3 className="text-lg font-semibold leading-tight">{item.title}</h3>
                      <div className={`text-sm ${
                        isDarkMode ? 'text-gray-200' : 'text-gray-600'
                      }`}>
                        Preț final: {formatCurrency(item.finalPrice ?? undefined)}
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="space-y-3">
                {filteredWonAuctions.map((item) => (
                  <article
                    key={item.id}
                    className={`rounded-2xl shadow-2xl backdrop-blur-lg flex flex-col md:flex-row ${
                      isDarkMode 
                        ? 'bg-white/10 border border-white/20' 
                        : 'bg-white border border-gray-200'
                    }`}
                  >
                    <div
                      className="md:w-48 h-40 md:h-auto bg-cover bg-center"
                      style={{ backgroundImage: `url(${item.image})` }}
                    />
                    <div className={`flex-1 p-4 space-y-2 ${
                      isDarkMode ? 'text-white' : 'text-gray-900'
                    }`}>
                      <div className="flex items-center gap-2">
                        <span className="px-3 py-1 text-xs rounded-full bg-blue-600/70">
                          {item.category}
                        </span>
                        <span className={`text-xs ${
                          isDarkMode ? 'text-gray-300' : 'text-gray-600'
                        }`} suppressHydrationWarning>
                          {isClient ? formatDate(item.wonAt) : "-"}
                        </span>
                      </div>
                      <h3 className="text-xl font-semibold">{item.title}</h3>
                      <div className={`text-sm ${
                        isDarkMode ? 'text-gray-200' : 'text-gray-600'
                      }`}>
                        Preț final: {formatCurrency(item.finalPrice ?? undefined)}
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        )}

        {activeTab === "history" && (
          <section className="grid grid-cols-1 gap-6">
            <div className={`${isDarkMode ? "bg-gray-800" : "bg-white"} rounded-xl p-6 shadow-lg`}>
              <h3 className={`${isDarkMode ? "text-white" : "text-gray-900"} text-xl font-semibold mb-4`}>
                Activitate recentă
              </h3>
              <div className="space-y-3">
                {activityItems.length === 0 ? (
                  <div className="text-center text-gray-400 py-8">
                    Încă nu ai activitate logată.
                  </div>
                ) : (
                  activityItems.slice(0, 5).map((activity) => (
                    <div
                      key={activity.id}
                      className={`flex items-center justify-between p-3 rounded-lg border ${
                        isDarkMode 
                          ? 'bg-white/5 border-white/10' 
                          : 'bg-gray-50 border-gray-200'
                      }`}
                    >
                      <div>
                        <p className={`text-sm font-medium ${
                          isDarkMode ? 'text-white' : 'text-gray-900'
                        }`}>{activity.description}</p>
                        <p className={`text-xs ${
                          isDarkMode ? 'text-gray-300' : 'text-gray-600'
                        }`} suppressHydrationWarning>
                          {isClient ? timeAgoLabel(activity.timestamp) : "-"}
                        </p>
                      </div>
                      {activity.amount && (
                        <span className={`text-sm font-semibold ${
                          isDarkMode ? 'text-blue-300' : 'text-blue-600'
                        }`}>
                          {activity.amount}
                        </span>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className={`${isDarkMode ? "bg-gray-800" : "bg-white"} rounded-xl p-6 shadow-lg overflow-x-auto`}>
              <h3 className={`${isDarkMode ? "text-white" : "text-gray-900"} text-xl font-semibold mb-4`}>
                Istoric licitații
              </h3>
              <table className="w-full text-sm">
                <thead>
                  <tr className={`${isDarkMode ? "text-gray-300" : "text-gray-600"} border-b ${
                    isDarkMode ? 'border-gray-700/50' : 'border-gray-300'
                  }`}>
                    <th className="py-2 text-left">Licitație</th>
                    <th className="py-2 text-left">Status</th>
                    <th className="py-2 text-left">Sumă</th>
                    <th className="py-2 text-left">Data</th>
                  </tr>
                </thead>
                <tbody>
                  {historyRows.length === 0 ? (
                    <tr>
                      <td colSpan={4} className={`py-6 text-center ${
                        isDarkMode ? 'text-gray-400' : 'text-gray-500'
                      }`}>
                        Nu există înregistrări încă.
                      </td>
                    </tr>
                  ) : (
                    historyRows.map((row) => (
                      <tr key={row.id} className={`border-b ${
                        isDarkMode ? 'border-gray-700/30' : 'border-gray-200'
                      }`}>
                        <td className={`py-3 ${
                          isDarkMode ? 'text-white' : 'text-gray-900'
                        }`}>{row.title}</td>
                        <td className={`py-3 ${
                          isDarkMode ? 'text-gray-200' : 'text-gray-600'
                        }`}>{row.status}</td>
                        <td className={`py-3 ${
                          isDarkMode ? 'text-blue-200' : 'text-blue-600'
                        }`}>{row.amount ?? "-"}</td>
                        <td className={`py-3 ${
                          isDarkMode ? 'text-gray-300' : 'text-gray-500'
                        }`} suppressHydrationWarning>
                          {isClient ? row.date : "-"}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {activeTab === "my-auctions" && (
          <MyAuctionsSection 
            isDarkMode={isDarkMode}
            userId={typeof window !== 'undefined' ? localStorage.getItem('supabaseUserId') || '' : ''}
          />
        )}

        {activeTab === "public-auctions" && (
          <section className="space-y-6">
            <div className={`${isDarkMode ? "bg-gray-800" : "bg-white"} rounded-xl p-6 shadow-lg`}>
              <h3 className={`${isDarkMode ? "text-white" : "text-gray-900"} text-2xl font-semibold mb-6`}>
                Adaugă Licitație Publică
              </h3>
              
              {/* PDF Import Section */}
              <div className={`mb-8 p-6 rounded-lg border-2 border-dashed ${
                isDarkMode 
                  ? 'border-gray-600 bg-gray-700/50' 
                  : 'border-gray-300 bg-gray-50'
              }`}>
                <h4 className={`${isDarkMode ? "text-white" : "text-gray-900"} text-lg font-semibold mb-4`}>
                  Import PDF - Completare Automată
                </h4>
                <p className={`${isDarkMode ? "text-gray-300" : "text-gray-600"} text-sm mb-4`}>
                  Încarcă un PDF cu datele licitației publice și formularul va fi completat automat.
                </p>
                
                <div className="flex flex-col sm:flex-row gap-4">
                  <label className={`flex-1 cursor-pointer ${
                    isDarkMode 
                      ? 'bg-blue-600 hover:bg-blue-700' 
                      : 'bg-blue-500 hover:bg-blue-600'
                  } text-white px-6 py-3 rounded-lg text-center font-medium transition-colors`}>
                    <input
                      type="file"
                      accept=".pdf"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          setPdfFile(file);
                          handlePdfUpload(file);
                        }
                      }}
                      className="hidden"
                    />
                    {pdfFile ? `Fișier selectat: ${pdfFile.name}` : "Selectează PDF"}
                  </label>
                  
                  {isProcessingPdf && (
                    <div className="flex items-center gap-2 text-blue-500">
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-500"></div>
                      <span>Procesare PDF...</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Manual Form */}
              <div className="space-y-4">
                <h4 className={`${isDarkMode ? "text-white" : "text-gray-900"} text-lg font-semibold mb-4`}>
                  Sau completează manual
                </h4>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className={`block text-sm font-medium mb-2 ${isDarkMode ? "text-gray-300" : "text-gray-700"}`}>
                      Titlu Licitație
                    </label>
                    <input
                      type="text"
                      className={`w-full px-4 py-2 rounded-lg border ${
                        isDarkMode 
                          ? 'bg-gray-700 border-gray-600 text-white' 
                          : 'bg-white border-gray-300 text-gray-900'
                      }`}
                      placeholder="Ex: Licitație Publică - Autovehicul"
                    />
                  </div>
                  
                  <div>
                    <label className={`block text-sm font-medium mb-2 ${isDarkMode ? "text-gray-300" : "text-gray-700"}`}>
                      Categorie
                    </label>
                    <select className={`w-full px-4 py-2 rounded-lg border ${
                      isDarkMode 
                        ? 'bg-gray-700 border-gray-600 text-white' 
                        : 'bg-white border-gray-300 text-gray-900'
                    }`}>
                      <option>Autovehicule</option>
                      <option>Imobile</option>
                      <option>Echipamente</option>
                      <option>Altele</option>
                    </select>
                  </div>
                  
                  <div>
                    <label className={`block text-sm font-medium mb-2 ${isDarkMode ? "text-gray-300" : "text-gray-700"}`}>
                      Preț Pornire (Lei)
                    </label>
                    <input
                      type="number"
                      className={`w-full px-4 py-2 rounded-lg border ${
                        isDarkMode 
                          ? 'bg-gray-700 border-gray-600 text-white' 
                          : 'bg-white border-gray-300 text-gray-900'
                      }`}
                      placeholder="0"
                    />
                  </div>
                  
                  <div>
                    <label className={`block text-sm font-medium mb-2 ${isDarkMode ? "text-gray-300" : "text-gray-700"}`}>
                      Data Licitației
                    </label>
                    <input
                      type="datetime-local"
                      className={`w-full px-4 py-2 rounded-lg border ${
                        isDarkMode 
                          ? 'bg-gray-700 border-gray-600 text-white' 
                          : 'bg-white border-gray-300 text-gray-900'
                      }`}
                    />
                  </div>
                </div>
                
                <div>
                  <label className={`block text-sm font-medium mb-2 ${isDarkMode ? "text-gray-300" : "text-gray-700"}`}>
                    Descriere
                  </label>
                  <textarea
                    rows={4}
                    className={`w-full px-4 py-2 rounded-lg border ${
                      isDarkMode 
                        ? 'bg-gray-700 border-gray-600 text-white' 
                        : 'bg-white border-gray-300 text-gray-900'
                    }`}
                    placeholder="Descriere detaliată a licitației..."
                  />
                </div>
                
                <button className={`w-full px-6 py-3 rounded-lg font-semibold transition-colors ${
                  isDarkMode 
                    ? 'bg-green-600 hover:bg-green-700' 
                    : 'bg-green-500 hover:bg-green-600'
                } text-white`}>
                  Publică Licitația
                </button>
              </div>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
