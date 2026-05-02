"use client";

import { dashboardApiFetch } from "@/lib/dashboard-api-fetch";
import { useEffect, useLayoutEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
import DashboardLogoutDarkModeRow from "@/components/dashboard/DashboardLogoutDarkModeRow";
import DashboardFooter from "@/components/DashboardFooter";
import MyAuctionsSection from "@/components/MyAuctionsSection";
import { supabase } from "@/lib/supabase";
import { resolveAccountTypeFromJwtOnly } from "@/lib/auth/resolveAccountType";
import {
  getSupabaseSessionRobust,
  getSupabaseAccessTokenRobust,
} from "@/lib/auth/getSupabaseSessionRobust";
import { debugLog, debugWarn } from "@/lib/debug";

// Throttle "Refreshed credits" debug log across remounts (Fast Refresh)
const creditsLogState = { lastLogTime: 0, lastBalance: -1 };

/** Coloanele `user_id` și header-ul `x-user-id` trebuie să fie UUID Supabase – nu email. */
function isSupabaseUserUuid(v: unknown): v is string {
  if (typeof v !== "string" || !v.trim()) return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    v.trim()
  );
}

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
    const noSpaces = value.replace(/[\s,]+/g, "");
    const noLetters = noSpaces.replace(new RegExp("[a-zA-Z]+", "g"), "");
    const cleaned = Number(noLetters);
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

export default function Dashboard() {
  const router = useRouter();
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [activeTab, setActiveTab] = useState<"active" | "won" | "history" | "my-auctions">("active");
  const [activeViewMode, setActiveViewMode] = useState<"grid" | "list">("grid");
  const [wonViewMode, setWonViewMode] = useState<"grid" | "list">("grid");
  const [activeCategoryFilter, setActiveCategoryFilter] = useState("all");
  const [wonCategoryFilter, setWonCategoryFilter] = useState("all");
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isPageLoading, setIsPageLoading] = useState(true);
  /** Fără asta, conținutul privat se randează înainte de redirect către piese-auto (flash). */
  const [showPrivateDashboardUi, setShowPrivateDashboardUi] = useState(false);

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

  const [userCredits, setUserCredits] = useState<number>(0);
  const [isLoadingCredits, setIsLoadingCredits] = useState(true);

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
  const [isPortalReady, setIsPortalReady] = useState(false);
  
  // Custom buttons state
  const [customButtons, setCustomButtons] = useState<any[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

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

  // Defer portal (mobile menu) until after document is ready to avoid forced layout / FOUC
  useEffect(() => {
    if (typeof document === "undefined") return;
    const ready = () => {
      requestAnimationFrame(() => setIsPortalReady(true));
    };
    if (document.readyState === "complete") {
      ready();
    } else {
      window.addEventListener("load", ready);
      return () => window.removeEventListener("load", ready);
    }
  }, []);

  // Load custom buttons from database
  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    const loadButtons = async () => {
      try {
        // Get current user
        const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) {
          console.error('Error getting session:', sessionError);
          loadFromLocalStorage();
          return;
        }

        const user = sessionData?.session?.user;
        if (!user) {
          // No user logged in, use localStorage
          loadFromLocalStorage();
          return;
        }

        setCurrentUserId(user.id);

        // Load buttons from database
        const { data: buttonData, error: buttonError } = await supabase
          .from('user_custom_buttons')
          .select('button_config')
          .eq('user_id', user.id)
          .maybeSingle();

        if (buttonError) {
          // PGRST116 = no rows returned (table might not exist or no data)
          // PGRST205 = table not found in schema cache (table doesn't exist)
          // Pentru utilizatori noi, este normal să nu existe înregistrări sau tabelul să nu existe
          
          // Verificare 1: Dacă obiectul este gol {} sau doar has whitelisted properties, nu logăm nimic
          const errorKeys = Object.keys(buttonError);
          if (errorKeys.length === 0) {
            loadFromLocalStorage();
            return;
          }
          
          // Verificare 1.5: Dacă toate valorile sunt falsy (null, undefined, "", 0, false), nu logăm
          const hasAnyTruthyValue = errorKeys.some(key => {
            const value = buttonError[key as keyof typeof buttonError];
            return Boolean(value) && String(value).trim() !== '';
          });
          
          if (!hasAnyTruthyValue) {
            loadFromLocalStorage();
            return;
          }
          
          // Verificare 2: Dacă eroarea are cod PGRST116 (no rows) sau PGRST205 (table not found), nu logăm nimic
          // Acestea sunt erori normale când tabelul nu există sau nu există date
          // Verificăm DIRECT codul înainte de orice altă verificare
          const errorCode = String(buttonError.code || '').trim();
          if (errorCode === 'PGRST116' || errorCode === 'PGRST205') {
            // Nu logăm nimic pentru aceste erori normale
            loadFromLocalStorage();
            return;
          }
          
          // Verificare 3: Dacă toate valorile sunt undefined, null, sau string gol, nu logăm nimic
          const hasAnyRealValue = errorKeys.some(key => {
            const value = buttonError[key as keyof typeof buttonError];
            return value !== undefined && value !== null && value !== '' && String(value).trim() !== '';
          });
          
          if (!hasAnyRealValue) {
            loadFromLocalStorage();
            return;
          }
          
          // Eroare reală - logăm doar dacă avem informații relevante
          // Construim obiectul doar cu proprietățile care au valori reale
          const errorObj: any = {};
          if (buttonError.code && buttonError.code !== 'PGRST116' && buttonError.code !== 'PGRST205' && String(buttonError.code).trim() !== '') {
            errorObj.code = buttonError.code;
          }
          if (buttonError.message && String(buttonError.message).trim() !== '') {
            errorObj.message = buttonError.message;
          }
          if (buttonError.details && String(buttonError.details).trim() !== '') {
            errorObj.details = buttonError.details;
          }
          if (buttonError.hint && String(buttonError.hint).trim() !== '') {
            errorObj.hint = buttonError.hint;
          }
          
          // Verificare finală: logăm doar dacă obiectul nu este gol și are valori reale
          const errorObjKeys = Object.keys(errorObj);
          if (errorObjKeys.length > 0) {
            // Verificare FINALĂ: dacă codul este PGRST116 sau PGRST205, nu logăm nimic
            if (errorObj.code === 'PGRST116' || errorObj.code === 'PGRST205') {
              loadFromLocalStorage();
              return;
            }
            
            // Verificăm că cel puțin o valoare nu este undefined, null, sau string gol
            const hasRealValue = errorObjKeys.some(key => {
              const val = errorObj[key];
              return val !== undefined && val !== null && val !== '' && String(val).trim() !== '';
            });
            
            // Logăm DOAR dacă există cel puțin o valoare reală ȘI obiectul nu este gol
            if (hasRealValue && errorObjKeys.length > 0) {
              // Construim un obiect doar cu valorile reale pentru logging
              const realErrorObj: any = {};
              errorObjKeys.forEach(key => {
                const val = errorObj[key];
                if (val !== undefined && val !== null && val !== '' && String(val).trim() !== '') {
                  realErrorObj[key] = val;
                }
              });
              
              // Logăm doar dacă obiectul final nu este gol
              if (Object.keys(realErrorObj).length > 0) {
                console.error('Error loading buttons from database:', realErrorObj);
              }
            }
          }
          
          loadFromLocalStorage();
          return;
        }

        if (buttonData && buttonData.button_config) {
          try {
            const buttons = JSON.parse(JSON.stringify(buttonData.button_config));
            setCustomButtons(buttons);
            // Also save to localStorage as backup
            localStorage.setItem('user_custom_buttons', JSON.stringify(buttons));
          } catch (e) {
            console.error('Error parsing button config:', e);
            loadFromLocalStorage();
          }
        } else {
          // No saved buttons, try localStorage as fallback
          loadFromLocalStorage();
        }
      } catch (error: any) {
        // Nu logăm eroarea dacă este doar un obiect gol sau o eroare de "no rows found" sau "table not found"
        // Verificăm dacă eroarea are proprietăți relevante înainte de a o loga
        if (error && typeof error === 'object') {
          const errorKeys = Object.keys(error);
          // Dacă obiectul este gol, nu logăm nimic
          if (errorKeys.length === 0) {
            loadFromLocalStorage();
            return;
          }
          
          // Verificare pentru PGRST116 (no rows) sau PGRST205 (table not found) - nu logăm nimic
          // Verificăm DIRECT codul înainte de orice altă verificare
          const errorCode = String(error.code || '').trim();
          if (errorCode === 'PGRST116' || errorCode === 'PGRST205') {
            loadFromLocalStorage();
            return;
          }
          
          // Verificăm dacă are cel puțin o valoare reală
          const hasAnyRealValue = errorKeys.some(key => {
            const value = error[key as keyof typeof error];
            return value !== undefined && value !== null && value !== '' && String(value).trim() !== '';
          });
          
          // Logăm doar dacă are proprietăți relevante (nu este doar un obiect gol)
          // Și verificăm că nu este un obiect gol {} și nu este PGRST116 sau PGRST205
          if (hasAnyRealValue && errorKeys.length > 0 && (error.code || error.message || error.details || error.hint)) {
            // Verificare FINALĂ: dacă codul este PGRST116 sau PGRST205, nu logăm nimic
            const finalErrorCode = String(error.code || '').trim();
            if (finalErrorCode !== 'PGRST116' && finalErrorCode !== 'PGRST205') {
              console.error('Error loading buttons:', error);
            }
          }
        }
        loadFromLocalStorage();
      }
    };

    const loadFromLocalStorage = () => {
      // Fallback to localStorage if database fails
      const savedButtons = localStorage.getItem('user_custom_buttons');
      if (savedButtons) {
        try {
          setCustomButtons(JSON.parse(savedButtons));
        } catch (e) {
          setCustomButtons([]);
        }
      } else {
        setCustomButtons([]);
      }
    };

    loadButtons();

    // Listen for changes when returning from customize page
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'user_custom_buttons') {
        loadButtons();
      }
    };

    // Listen for custom event from customize page
    const handleButtonsUpdated = () => {
      loadButtons();
    };

    // Fără poll la 2s: provoca re-render-uri continue pe tot /dashboard (senzația de „restart”).
    // Reîncărcăm la revenirea în tab / fereastră (după customize) și la evenimente explicite.
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        loadButtons();
      }
    };

    window.addEventListener('storage', handleStorageChange);
    window.addEventListener('userButtonsUpdated', handleButtonsUpdated);
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('userButtonsUpdated', handleButtonsUpdated);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.document.documentElement.classList.toggle("dark", isDarkMode);
    window.localStorage.setItem("darkMode", JSON.stringify(isDarkMode));
  }, [isDarkMode]);

  const toggleDarkMode = () => setIsDarkMode((prev) => !prev);

  /** Înainte de paint: dealer piese auto din storage → fără flash de dashboard privat. */
  useLayoutEffect(() => {
    if (typeof window === "undefined") return;
    try {
      if (localStorage.getItem("accountType") === "piese_auto") {
        window.location.replace("/dashboard/piese-auto");
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    let isMounted = true;

    const loadDashboardData = async () => {
      setIsPageLoading(true);
      /** După window.location — nu apela setIsPageLoading(false); evită flash UI înainte de navigare */
      let didHardRedirect = false;
      const hardRedirect = (href: string) => {
        if (typeof window !== "undefined") {
          didHardRedirect = true;
          window.location.href = href;
        }
      };

      try {
        const { user: resolvedUser, accountType: jwtAccountType } =
          await resolveAccountTypeFromJwtOnly(supabase);
        const { data: sessionData, error: initialSessionError } = await supabase.auth.getSession();
        let user = sessionData.session?.user ?? resolvedUser;
        let userId: string | null = null;

        let accountType: string | undefined = jwtAccountType;
        if (user && typeof window !== "undefined") {
          const stored = localStorage.getItem("accountType");
          const isStrongOtherRole =
            jwtAccountType === "liquidator" ||
            jwtAccountType === "executor" ||
            jwtAccountType === "company" ||
            jwtAccountType === "business";
          if (
            stored === "piese_auto" &&
            !isStrongOtherRole &&
            (jwtAccountType === undefined ||
              jwtAccountType === "" ||
              jwtAccountType === "private")
          ) {
            accountType = "piese_auto";
          }
        }

        debugLog('[Dashboard] Initial session check:', {
          hasSession: !!sessionData.session,
          hasUser: !!user,
          userId: user?.id,
          sessionError: initialSessionError?.message,
          accountType,
          jwtAccountType,
        });

        // Redirect după JWT; pentru dealer piese auto folosim și accountType din localStorage dacă metadata JWT întârzie
        if (user) {
          if (accountType === "liquidator") {
            hardRedirect("/dashboard/lichidator");
            return;
          }
          if (accountType === "executor") {
            hardRedirect("/dashboard/executor");
            return;
          }
          if (accountType === "company" || accountType === "business") {
            hardRedirect("/dashboard/company");
            return;
          }
          if (accountType === "piese_auto") {
            hardRedirect("/dashboard/piese-auto");
            return;
          }
        }

        // If no Supabase session, try to get userId from localStorage and attempt to set session
        if (!user && typeof window !== "undefined") {
          const savedUserInfo = localStorage.getItem('userInfo');
          const savedSupabaseUserId = localStorage.getItem('supabaseUserId');
          
          if (savedUserInfo) {
            try {
              const userInfo = JSON.parse(savedUserInfo);
              const supabaseUserId = savedSupabaseUserId || userInfo.supabaseUserId;
              
              if (supabaseUserId && isSupabaseUserUuid(supabaseUserId)) {
                debugLog('[Dashboard] Found supabaseUserId in localStorage:', supabaseUserId);
                userId = supabaseUserId;
              } else {
                debugLog(
                  '[Dashboard] No UUID în localStorage (nu folosim email ca user_id – așteptăm sesiunea Supabase)'
                );
              }
              
              // Executor/lichidator: nu din localStorage (poate rămâne „executor” după logout alt cont → buclă în app)
              const storedAccountType = localStorage.getItem('accountType');
              if (storedAccountType === 'company' || storedAccountType === 'business') {
                hardRedirect("/dashboard/company");
                return;
              }
              if (storedAccountType === 'piese_auto') {
                hardRedirect("/dashboard/piese-auto");
                return;
              }
            } catch (e) {
              console.error('Error parsing userInfo from localStorage:', e);
            }
          }
        } else if (user) {
          userId = user.id;
        }

        // Orice valoare non-UUID (ex. email în userId din date vechi / localStorage corupt) distruge API-urile
        if (userId != null && userId !== "" && !isSupabaseUserUuid(userId)) {
          const fromUser = user?.id && isSupabaseUserUuid(user.id) ? user.id : null;
          userId = fromUser;
          debugWarn("[Dashboard] userId non-UUID respins (ex. email); fallback la user.id:", fromUser);
        }

        // Check if user is admin or manager before redirecting
        if (!userId) {
          if (typeof window !== "undefined") {
            const savedAdminInfo = localStorage.getItem("adminInfo");
            if (savedAdminInfo) {
              try {
                const adminInfo = JSON.parse(savedAdminInfo);
                if (adminInfo.isAdmin || adminInfo.role === "manager") {
                  debugLog("[Dashboard] Admin/Manager access granted");
                } else {
                  hardRedirect("/auth?mode=login");
                  return;
                }
              } catch (e) {
                console.error("Error parsing adminInfo:", e);
                hardRedirect("/auth?mode=login");
                return;
              }
            } else {
              /**
               * CRITIC: același criteriu ca `dashboard/layout.tsx` (userInfo cu email SAU UUID în storage).
               * Dacă layout te-a lăsat să intri dar aici forțezi /auth → auth vede sesiunea → înapoi la /dashboard → buclă infinită.
               * Pe iPad/WebView sesiunea poate lipsi o clipă dar userInfo există deja.
               */
              const savedUserInfo = localStorage.getItem("userInfo");
              const savedSupabaseUserId = localStorage.getItem("supabaseUserId");
              const sameEvidenceAsLayout =
                (savedSupabaseUserId && isSupabaseUserUuid(savedSupabaseUserId)) ||
                (() => {
                  if (!savedUserInfo) return false;
                  try {
                    const ui = JSON.parse(savedUserInfo) as Record<string, unknown>;
                    return Boolean(
                      ui.email ||
                        (typeof ui.supabaseUserId === "string" &&
                          isSupabaseUserUuid(ui.supabaseUserId)) ||
                        (typeof ui.userId === "string" && isSupabaseUserUuid(ui.userId)) ||
                        (typeof ui.id === "string" && isSupabaseUserUuid(ui.id))
                    );
                  } catch {
                    return false;
                  }
                })();

              if (sameEvidenceAsLayout) {
                debugWarn(
                  "[Dashboard] Fără userId încă, dar există dovezi locale ca în layout — nu redirecționăm la /auth (evită bucla)."
                );
              } else {
                hardRedirect("/auth?mode=login");
                return;
              }
            }
          } else {
            return;
          }
        }

        /**
         * Layout poate marca autentificare doar cu email în userInfo; aici fără UUID nu trimitem x-user-id
         * și API-urile răspund 401. Completăm userId din getUser (după refresh în resolveAccountType) și din storage.
         */
        if (!userId && typeof window !== "undefined") {
          const { data: gu } = await supabase.auth.getUser();
          if (gu.user?.id && isSupabaseUserUuid(gu.user.id)) {
            userId = gu.user.id;
            user = user ?? gu.user;
          }
        }
        if (!userId && typeof window !== "undefined") {
          const sid = localStorage.getItem("supabaseUserId");
          if (sid && isSupabaseUserUuid(sid)) {
            userId = sid;
          } else {
            const raw = localStorage.getItem("userInfo");
            if (raw) {
              try {
                const ui = JSON.parse(raw) as Record<string, unknown>;
                for (const key of ["supabaseUserId", "userId", "id"] as const) {
                  const c = ui[key];
                  if (typeof c === "string" && isSupabaseUserUuid(c)) {
                    userId = c;
                    break;
                  }
                }
              } catch {
                /* ignore */
              }
            }
          }
        }

        if (!didHardRedirect) {
          setShowPrivateDashboardUi(true);
        }

        // Sesiune proaspătă pentru Bearer (getSession singur poate fi gol pe WebView/iOS)
        const session =
          (await getSupabaseSessionRobust(supabase)) ?? sessionData.session;
        const accessToken = session?.access_token ?? null;

        const rowUserId =
          (userId && isSupabaseUserUuid(userId) ? userId : null) ??
          (user?.id && isSupabaseUserUuid(user.id) ? user.id : null);
        /** Interogări DB: evită email/local-user; admin fără user → UUID nil (zero rânduri). */
        const queryUserId = rowUserId ?? "00000000-0000-0000-0000-000000000000";
        
        debugLog('[Dashboard] API session check:', {
          hasSession: !!session,
          hasAccessToken: !!accessToken,
          userId: user?.id,
          rowUserId,
        });

        const [
          profileRes,
          tokensRes,
          watchlistRes,
          favoritesRes,
          activityRes,
          bidsRes,
          paymentsRes
        ] = await Promise.all([
          supabase
            .from("user_profiles")
            .select("first_name,last_name,phone,avatar_url")
            .eq("user_id", queryUserId)
            .maybeSingle(),
          // Use API endpoint instead of direct query to avoid RLS issues
          // If no accessToken, use userId from localStorage as fallback
          (async () => {
            debugLog('[Dashboard] Fetching tokens from API:', {
              userId: rowUserId,
              hasAccessToken: !!accessToken,
              headers: {
                ...(rowUserId ? { 'x-user-id': rowUserId } : {}),
              },
            });

            if (!rowUserId && !accessToken) {
              debugWarn(
                "[Dashboard] Omit /api/tokens: nu există UUID (x-user-id) și nici Bearer — evităm 401 în consolă."
              );
              return null;
            }

            try {
              const res = await dashboardApiFetch('/api/tokens', {
                headers: {
                  ...(rowUserId ? { 'x-user-id': rowUserId } : {}),
                },
              });
              
              debugLog('[Dashboard] API tokens response status:', res.status);
              if (res.ok) {
                const data = await res.json();
                debugLog('[Dashboard] API tokens response data:', data);
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
            .eq("user_id", queryUserId)
            .order("created_at", { ascending: false }),
          supabase
            .from("user_favorites")
            .select("item_id,item_type,created_at")
            .eq("user_id", queryUserId),
          supabase
            .from("user_activity_logs")
            .select("id,event,properties,created_at")
            .eq("user_id", queryUserId)
            .order("created_at", { ascending: false })
            .limit(100),
          supabase
            .from("bids")
            .select("product_id,is_winning")
            .eq("user_id", queryUserId),
          // Load credits via API route (uses supabaseAdmin to bypass RLS)
          (async () => {
            debugLog('[Dashboard] Fetching credits from API:', {
              userId: rowUserId,
              hasAccessToken: !!accessToken
            });

            if (!rowUserId && !accessToken) {
              debugWarn(
                "[Dashboard] Omit /api/credits: nu există UUID și nici Bearer — credit 0 fără apel API."
              );
              return { data: [], error: null, credit: 0 };
            }

            try {
              const res = await dashboardApiFetch('/api/credits', {
                headers: {
                  ...(rowUserId ? { 'x-user-id': rowUserId } : {}),
                },
              });
              
              debugLog('[Dashboard] API credits response status:', res.status);
              if (res.ok) {
                const data = await res.json();
                debugLog('[Dashboard] API credits response data:', data);
                // Return in same format as Supabase query for compatibility
                return {
                  data: data.payments || [],
                  error: null,
                  credit: data.credit || 0
                };
              } else {
                const errorText = await res.text();
                console.error('[Dashboard] API credits error:', errorText);
                return { data: [], error: { message: errorText }, credit: 0 };
              }
            } catch (err) {
              console.error('[Dashboard] API credits fetch error:', err);
              return { data: [], error: err, credit: 0 };
            }
          })()
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
        
        debugLog('[Dashboard] Loading tokens:', {
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
              debugLog('[Dashboard] Using localStorage tokens as fallback (no Supabase session):', tokensFromStorage);
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
        
        debugLog('[Dashboard] Setting user tokens (FINAL):', {
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

        // Calculează câte licitații unice la care a participat (a făcut oferte)
        // Folosim datele din tabela bids (ca în my-bids)
        const bidsData = bidsRes.data ?? [];
        const uniqueProductIds = new Set<string>();
        bidsData.forEach((bid: any) => {
          if (bid.product_id) {
            uniqueProductIds.add(bid.product_id);
          }
        });
        const participatedAuctionsCount = uniqueProductIds.size;

        // Calculează câte licitații active în curs (unde a făcut bid-uri și licitația este încă activă)
        // Folosim datele din tabela bids și verificăm status-ul produselor
        const activeAuctionIds = new Set<string>();
        bidsData.forEach((bid: any) => {
          if (bid.product_id) {
            const product = productMap[bid.product_id];
            // Verifică dacă licitația este activă (status = 'active' sau 'reserved')
            if (product && (product.status === 'active' || product.status === 'reserved')) {
              activeAuctionIds.add(bid.product_id);
            }
          }
        });
        const activeAuctionsCount = activeAuctionIds.size;

        // Calculează câte licitații a câștigat (din tabela bids unde is_winning = true)
        const wonAuctionIds = new Set<string>();
        bidsData.forEach((bid: any) => {
          if (bid.product_id && bid.is_winning === true) {
            wonAuctionIds.add(bid.product_id);
          }
        });
        const wonAuctionsCount = wonAuctionIds.size;

        // Watchlist count (câte licitații urmărește)
        const watchlistCount = normalizedWatchlist.length;

        setUserStats({
          totalBids: participatedAuctionsCount,
          wonAuctions: wonAuctionsCount > 0 ? wonAuctionsCount : normalizedWon.length, // Folosește bids dacă există, altfel activity logs
          activeBids: activeAuctionsCount,
          totalSpent: watchlistCount
        });

        // Calculate credits from API response (same logic as admin)
        try {
          if (paymentsRes.error) {
            console.error('[Dashboard] Error loading payments:', paymentsRes.error, 'rowUserId:', rowUserId);
            setUserCredits(0);
            setIsLoadingCredits(false);
          } else {
            // Use credit directly from API response if available, otherwise calculate from payments
            const creditBalance = paymentsRes.credit !== undefined 
              ? Math.max(0, paymentsRes.credit || 0)
              : (paymentsRes.data ?? []).reduce((total: number, payment: any) => {
                  const amount = payment.amount || 0;
                  return total + (Number(amount) || 0);
                }, 0);
            
            const payments = paymentsRes.data ?? [];
            debugLog('[Dashboard] Credits response:', { 
              credit: creditBalance,
              paymentsCount: payments.length,
              rowUserId,
              hasData: !!paymentsRes.data
            });
            
            setUserCredits(creditBalance);
            setIsLoadingCredits(false);
          }
        } catch (creditError) {
          console.error('[Dashboard] Error calculating credits:', creditError);
          setUserCredits(0);
          setIsLoadingCredits(false);
        }
      } catch (error) {
        console.error("Error loading dashboard data:", error);
      } finally {
        if (isMounted && !didHardRedirect) {
          setIsPageLoading(false);
        }
      }
    };

    loadDashboardData();
    return () => {
      isMounted = false;
    };
  }, []);

  // Refresh credits periodically via API route (realtime updates)
  useEffect(() => {
        const refreshCredits = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const fromSession = session?.user?.id;
        const fromStorage =
          typeof window !== "undefined" ? localStorage.getItem("supabaseUserId") : null;
        const rawId = fromSession || fromStorage;
        const uuidUserId = rawId && isSupabaseUserUuid(rawId) ? rawId : null;

        const accessToken =
          (await getSupabaseAccessTokenRobust(supabase)) ??
          session?.access_token ??
          null;

        if (!uuidUserId && !accessToken) {
          setIsLoadingCredits(false);
          return;
        }

        // Load credits via API route (uses supabaseAdmin to bypass RLS)
        const creditsResponse = await dashboardApiFetch('/api/credits', {
          cache: 'no-store',
          headers: {
            ...(uuidUserId ? { 'x-user-id': uuidUserId } : {}),
          },
        });

        if (!creditsResponse.ok) {
          const text = await creditsResponse.text();
          let errorData: Record<string, unknown> = {};
          try {
            errorData = text ? JSON.parse(text) : {};
          } catch (_) {
            errorData = { message: text || creditsResponse.statusText };
          }
          const hasUsefulBody =
            Object.keys(errorData).length > 0 ||
            (typeof (errorData as { message?: string }).message === 'string' &&
              (errorData as { message: string }).message.length > 0);
          if (creditsResponse.status !== 401) {
            console.warn('[Dashboard] Credits API non-OK:', {
              status: creditsResponse.status,
              statusText: creditsResponse.statusText,
              error: hasUsefulBody ? errorData : { _emptyBody: true, rawPreview: text.slice(0, 200) },
              uuidUserId: uuidUserId ?? '(none)',
            });
          }
          setUserCredits(0);
          setIsLoadingCredits(false);
          return;
        }

        const creditsData = await creditsResponse.json();
        
        if (creditsData.success && creditsData.credit !== undefined) {
          const creditBalance = Math.max(0, creditsData.credit || 0);
          const now = Date.now();
          if (creditBalance !== creditsLogState.lastBalance || now - creditsLogState.lastLogTime >= 30_000) {
            debugLog('[Dashboard] Refreshed credits from API:', creditBalance, 'RON from', creditsData.paymentCount || 0, 'payments');
            creditsLogState.lastLogTime = now;
            creditsLogState.lastBalance = creditBalance;
          }
          setUserCredits(creditBalance);
          setIsLoadingCredits(false);
        } else {
          debugWarn('[Dashboard] Invalid response from credits API:', creditsData);
          setUserCredits(0);
          setIsLoadingCredits(false);
        }
      } catch (error) {
        console.error('[Dashboard] Error refreshing credits:', error);
        setIsLoadingCredits(false);
      }
    };

    // Refresh immediately
    refreshCredits();
    
    // Creditul nu trebuie polling agresiv; 30s e suficient și reduce „clipitul” paginii
    const interval = setInterval(refreshCredits, 30000);
    
    return () => clearInterval(interval);
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
        localStorage.removeItem('accountType');
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

  if (!showPrivateDashboardUi) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-gray-50 via-white to-gray-100 transition-all duration-300 dark:from-gray-900 dark:via-gray-800 dark:to-gray-700">
        <div
          className="h-10 w-10 rounded-full border-2 border-orange-500 border-t-transparent animate-spin dark:border-orange-400"
          aria-hidden
        />
        <p className="mt-4 text-sm text-gray-600 dark:text-gray-400">Se încarcă dashboard-ul…</p>
      </div>
    );
  }

  return (
    <div className={`min-h-screen flex flex-col transition-all duration-300 ${
      isDarkMode 
        ? 'bg-gradient-to-br from-gray-900 via-gray-800 to-gray-700' 
        : 'bg-gradient-to-br from-gray-50 via-white to-gray-50'
    }`}>
      {/* Page Loading - Removed spinner */}

      <UniversalHeader isDarkMode={isDarkMode} onToggleDarkMode={toggleDarkMode}/>

      {isPortalReady && isMobileMenuOpen && typeof document !== "undefined" && createPortal(
        (
        <div className={`md:hidden fixed top-0 left-0 z-[99999] w-80 max-h-[100vh] overflow-y-auto shadow-xl border-r border-gray-200 ${isDarkMode ? "bg-gray-800" : "bg-white"}`}>
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
                  { href: "/dashboard/saved-searches", label: "Căutări salvate", icon: "🔔" },
                  { href: "/dashboard/notifications", label: "Notificări", icon: "🔕" },
                  { href: "/dashboard/ofertele_mele", label: "Ofertele mele", icon: "💬" },
                  { href: "/dashboard/settings", label: "Setări", icon: "⚙️" },
                  { href: "/dashboard/tokens", label: "Token-uri", icon: "💰" },
                  { href: "/dashboard/payments", label: "Plăți", icon: "💳" },
                  { href: "/dashboard/support", label: "Suport", icon: "🎫" },
                  { href: "/dashboard/reviews", label: "Review-uri", icon: "⭐" }
                ].map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setIsMobileMenuOpen(false)}
                    className={`flex items-center space-x-3 p-3 rounded-lg transition-colors ${
                      isDarkMode ? "text-gray-300 hover:bg-gray-700" : "text-gray-700 hover:bg-gray-100"
                    }`}
                  >
                    <span>{item.icon}</span>
                    <span>{item.label}</span>
                  </Link>
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
        ),
        document.body
      )}

      <div className="flex-1 max-w-7xl mx-auto w-full px-3 sm:px-6 lg:px-8 py-4 md:py-8">
        <header className="mb-4 md:mb-8 flex flex-col items-center gap-2 md:gap-4 text-center">
          <DashboardLogoutDarkModeRow
            isDarkMode={isDarkMode}
            onToggleDarkMode={toggleDarkMode}
            onLogout={handleLogout}
          />
          <div className={`w-12 h-12 md:w-16 md:h-16 rounded-full shadow-2xl overflow-hidden flex items-center justify-center ${
            isDarkMode 
              ? 'bg-gradient-to-r from-gray-600 to-gray-500' 
              : 'bg-gradient-to-r from-gray-300 to-gray-400'
          }`}>
            {userInfo.avatar ? (
              <img src={userInfo.avatar} alt="Avatar" className="w-full h-full object-cover" />
            ) : (
              <span className={`text-lg md:text-xl font-semibold ${
                isDarkMode ? 'text-white' : 'text-gray-900'
              }`}>
                {(() => {
                  const name = (userInfo.firstName && userInfo.firstName !== 'User') ? userInfo.firstName : (userInfo.email?.split('@')[0] || 'u');
                  const n = name.trim();
                  return `${(n[0] ?? 'U').toUpperCase()}${(n[1] ?? n[0] ?? 'U').toUpperCase()}`;
                })()}
              </span>
            )}
          </div>
          <div>
            <h2 className={`text-xl md:text-3xl font-bold ${
              isDarkMode ? 'text-white' : 'text-gray-900'
            }`}>Bun venit, {(userInfo.firstName && userInfo.firstName !== 'User' ? userInfo.firstName : (userInfo.email?.split('@')[0] || 'utilizator'))} 👋</h2>
            <p className={`text-sm md:text-base ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>Panou personalizat cu licitațiile urmărite și activitatea ta.</p>
          </div>
        </header>

        <section className={`${isDarkMode ? "bg-gray-800" : "bg-white"} rounded-xl p-4 md:p-6 shadow-lg mb-4 md:mb-8`}>
          <div className="flex justify-between items-center mb-2 md:mb-4">
            <h3 className={`${isDarkMode ? "text-white" : "text-gray-900"} text-lg md:text-xl font-semibold`}>
              Acțiuni rapide
            </h3>
            <button
              onClick={() => router.push('/dashboard/customize-buttons')}
              className={`w-8 h-8 md:w-10 md:h-10 rounded-full transition-all duration-300 flex items-center justify-center shadow-lg hover:shadow-xl transform hover:scale-110 ${
                isDarkMode 
                  ? "bg-gradient-to-br from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white" 
                  : "bg-gradient-to-br from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white"
              }`}
              title="Personalizează butoanele"
            >
              <i className="ri-add-line text-base md:text-xl"></i>
            </button>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-7 gap-2 md:gap-4">
            {customButtons.length > 0 ? (
              customButtons.map((button) => {
                const getColorClass = (color: string) => {
                  const colorMap: Record<string, { light: string; dark: string }> = {
                    orange: { light: "bg-orange-500 hover:bg-orange-600", dark: "bg-orange-600 hover:bg-orange-700" },
                    blue: { light: "bg-blue-500 hover:bg-blue-600", dark: "bg-blue-600 hover:bg-blue-700" },
                    yellow: { light: "bg-yellow-500 hover:bg-yellow-600", dark: "bg-yellow-600 hover:bg-yellow-700" },
                    green: { light: "bg-green-500 hover:bg-green-600", dark: "bg-green-600 hover:bg-green-700" },
                    red: { light: "bg-red-500 hover:bg-red-600", dark: "bg-red-600 hover:bg-red-700" },
                    teal: { light: "bg-teal-500 hover:bg-teal-600", dark: "bg-teal-600 hover:bg-teal-700" },
                    pink: { light: "bg-pink-500 hover:bg-pink-600", dark: "bg-pink-600 hover:bg-pink-700" },
                    gray: { light: "bg-gray-500 hover:bg-gray-600", dark: "bg-gray-600 hover:bg-gray-700" },
                    cyan: { light: "bg-cyan-500 hover:bg-cyan-600", dark: "bg-cyan-600 hover:bg-cyan-700" }
                  };
                  return isDarkMode ? colorMap[button.color]?.dark || colorMap.blue.dark : colorMap[button.color]?.light || colorMap.blue.light;
                };

                const getGradientClass = (color: string) => {
                  const gradientMap: Record<string, { light: string; dark: string }> = {
                    orange: { light: "bg-gradient-to-r from-orange-500 via-orange-500 to-orange-500 hover:from-orange-600 hover:via-orange-600 hover:to-orange-600", dark: "bg-gradient-to-r from-orange-600 via-orange-600 to-orange-600 hover:from-orange-700 hover:via-orange-700 hover:to-orange-700" },
                    blue: { light: "bg-gradient-to-r from-blue-500 via-blue-500 to-blue-500 hover:from-blue-600 hover:via-blue-600 hover:to-blue-600", dark: "bg-gradient-to-r from-blue-600 via-blue-600 to-blue-600 hover:from-blue-700 hover:via-blue-700 hover:to-blue-700" },
                    yellow: { light: "bg-gradient-to-r from-yellow-500 via-yellow-500 to-yellow-500 hover:from-yellow-600 hover:via-yellow-600 hover:to-yellow-600", dark: "bg-gradient-to-r from-yellow-600 via-yellow-600 to-yellow-600 hover:from-yellow-700 hover:via-yellow-700 hover:to-yellow-700" },
                    green: { light: "bg-gradient-to-r from-green-500 via-green-500 to-green-500 hover:from-green-600 hover:via-green-600 hover:to-green-600", dark: "bg-gradient-to-r from-green-600 via-green-600 to-green-600 hover:from-green-700 hover:via-green-700 hover:to-green-700" },
                    red: { light: "bg-gradient-to-r from-red-500 via-red-500 to-red-500 hover:from-red-600 hover:via-red-600 hover:to-red-600", dark: "bg-gradient-to-r from-red-600 via-red-600 to-red-600 hover:from-red-700 hover:via-red-700 hover:to-red-700" },
                    teal: { light: "bg-gradient-to-r from-teal-500 via-teal-500 to-teal-500 hover:from-teal-600 hover:via-teal-600 hover:to-teal-600", dark: "bg-gradient-to-r from-teal-600 via-teal-600 to-teal-600 hover:from-teal-700 hover:via-teal-700 hover:to-teal-700" },
                    pink: { light: "bg-gradient-to-r from-pink-500 via-pink-500 to-pink-500 hover:from-pink-600 hover:via-pink-600 hover:to-pink-600", dark: "bg-gradient-to-r from-pink-600 via-pink-600 to-pink-600 hover:from-pink-700 hover:via-pink-700 hover:to-pink-700" },
                    gray: { light: "bg-gradient-to-r from-gray-500 via-gray-500 to-gray-500 hover:from-gray-600 hover:via-gray-600 hover:to-gray-600", dark: "bg-gradient-to-r from-gray-600 via-gray-600 to-gray-600 hover:from-gray-700 hover:via-gray-700 hover:to-gray-700" },
                    cyan: { light: "bg-gradient-to-r from-cyan-500 via-cyan-500 to-cyan-500 hover:from-cyan-600 hover:via-cyan-600 hover:to-cyan-600", dark: "bg-gradient-to-r from-cyan-600 via-cyan-600 to-cyan-600 hover:from-cyan-700 hover:via-cyan-700 hover:to-cyan-700" }
                  };
                  return isDarkMode ? gradientMap[color]?.dark || gradientMap.blue.dark : gradientMap[color]?.light || gradientMap.blue.light;
                };

                // Special handling for tokens button
                const label = button.id === 'tokens' 
                  ? `Token-uri (${userTokens.balance})` 
                  : button.label;

                // Force URL update for my-bids button to point to ofertele_mele
                const buttonUrl = button.id === 'my-bids' 
                  ? '/dashboard/ofertele_mele' 
                  : button.url;

                return (
                  <Link
                    key={button.id}
                    href={buttonUrl}
                    className={`${getGradientClass(button.color)} p-2.5 md:p-4 rounded-lg md:rounded-xl text-center text-white shadow-lg md:shadow-xl hover:shadow-xl md:hover:shadow-2xl transform hover:scale-[1.02] active:scale-[0.98] transition-all duration-300 relative overflow-hidden group`}
                  >
                    <div className="text-xl md:text-2xl mb-1 md:mb-2 flex justify-center relative z-10">
                      {button.id === 'search' ? (
                        <SearchIcon size="l" />
                      ) : button.id === 'tokens' ? (
                        <CoinsIcon size="l" />
                      ) : button.id === 'settings' ? (
                        <SettingsIcon size="l" />
                      ) : button.id === 'payments' ? (
                        <CreditCardIcon size="l" />
                      ) : button.id === 'favorites' ? (
                        <HeartIcon size="l" />
                      ) : button.id === 'support' ? (
                        <SupportIcon size="l" />
                      ) : button.id === 'my-bids' ? (
                        <i className="ri-auction-line text-3xl"></i>
                      ) : (
                        <i className={`${button.icon} text-3xl`}></i>
                      )}
                    </div>
                    <span className="text-xs md:text-sm font-medium relative z-10">{label}</span>
                    <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/20 to-white/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000"></div>
                  </Link>
                );
              })
            ) : (
              // Default buttons if no custom buttons are set
              <>
                <Link
                  href="/dashboard/ofertele_mele"
                  className={`${isDarkMode ? "bg-gradient-to-r from-cyan-600 via-cyan-600 to-cyan-600 hover:from-cyan-700 hover:via-cyan-700 hover:to-cyan-700" : "bg-gradient-to-r from-cyan-500 via-cyan-500 to-cyan-500 hover:from-cyan-600 hover:via-cyan-600 hover:to-cyan-600"} p-2.5 md:p-4 rounded-lg md:rounded-xl text-center text-white shadow-lg md:shadow-xl hover:shadow-xl md:hover:shadow-2xl transform hover:scale-[1.02] active:scale-[0.98] transition-all duration-300 relative overflow-hidden group`}
                >
                  <div className="text-xl md:text-2xl mb-1 md:mb-2 flex justify-center relative z-10">
                    <i className="ri-auction-line text-2xl md:text-3xl"></i>
                  </div>
                  <span className="text-xs md:text-sm font-medium relative z-10">Ofertele mele</span>
                  <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/20 to-white/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000"></div>
                </Link>
                <Link
                  href="/dashboard/my-products"
                  className={`${isDarkMode ? "bg-gradient-to-r from-orange-600 via-orange-600 to-orange-600 hover:from-orange-700 hover:via-orange-700 hover:to-orange-700" : "bg-gradient-to-r from-orange-500 via-orange-500 to-orange-500 hover:from-orange-600 hover:via-orange-600 hover:to-orange-600"} p-2.5 md:p-4 rounded-lg md:rounded-xl text-center text-white shadow-lg md:shadow-xl hover:shadow-xl md:hover:shadow-2xl transform hover:scale-[1.02] active:scale-[0.98] transition-all duration-300 relative overflow-hidden group`}
                >
                  <div className="text-xl md:text-2xl mb-1 md:mb-2 flex justify-center relative z-10">
                    <i className="ri-notification-3-line text-2xl md:text-3xl"></i>
                  </div>
                  <span className="text-xs md:text-sm font-medium relative z-10">Anunțurile mele</span>
                  <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/20 to-white/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000"></div>
                </Link>
                <Link
                  href="/ro"
                  className={`${isDarkMode ? "bg-gradient-to-r from-blue-600 via-blue-600 to-blue-600 hover:from-blue-700 hover:via-blue-700 hover:to-blue-700" : "bg-gradient-to-r from-blue-500 via-blue-500 to-blue-500 hover:from-blue-600 hover:via-blue-600 hover:to-blue-600"} p-2.5 md:p-4 rounded-lg md:rounded-xl text-center text-white shadow-lg md:shadow-xl hover:shadow-xl md:hover:shadow-2xl transform hover:scale-[1.02] active:scale-[0.98] transition-all duration-300 relative overflow-hidden group`}
                >
                  <div className="text-xl md:text-2xl mb-1 md:mb-2 flex justify-center relative z-10"><SearchIcon size="l" /></div>
                  <span className="text-xs md:text-sm font-medium relative z-10">Caută licitații</span>
                  <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/20 to-white/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000"></div>
                </Link>
                <Link
                  href="/dashboard/favorites"
                  className={`${isDarkMode ? "bg-gradient-to-r from-red-600 via-red-600 to-red-600 hover:from-red-700 hover:via-red-700 hover:to-red-700" : "bg-gradient-to-r from-red-500 via-red-500 to-red-500 hover:from-red-600 hover:via-red-600 hover:to-red-600"} p-2.5 md:p-4 rounded-lg md:rounded-xl text-center text-white shadow-lg md:shadow-xl hover:shadow-xl md:hover:shadow-2xl transform hover:scale-[1.02] active:scale-[0.98] transition-all duration-300 relative overflow-hidden group`}
                >
                  <div className="text-xl md:text-2xl mb-1 md:mb-2 flex justify-center relative z-10"><HeartIcon size="l" /></div>
                  <span className="text-xs md:text-sm font-medium relative z-10">Favorite</span>
                  <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/20 to-white/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000"></div>
                </Link>
                <Link
                  href="/dashboard/exclusiv"
                  className="p-2.5 md:p-4 rounded-lg md:rounded-xl text-center text-white shadow-lg md:shadow-xl hover:shadow-xl md:hover:shadow-2xl transform hover:scale-[1.02] active:scale-[0.98] transition-all duration-300 relative overflow-hidden group hover:opacity-95"
                  style={{
                    background: 'linear-gradient(to right, #3B82F6 0%, #3B82F6 33.333%, #FDE047 33.333%, #FDE047 66.666%, #F87171 66.666%, #F87171 100%)',
                  }}
                >
                  <div className="text-xl md:text-2xl mb-1 md:mb-2 flex justify-center relative z-10">
                    <svg viewBox="0 0 64 56" className="w-6 h-6 md:w-8 md:h-8 shrink-0" fill="white" aria-hidden style={{ filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.3))' }}>
                      <path d="M6 0 h52 l-8 14-18 42-18-42-8-14z"/>
                    </svg>
                  </div>
                  <span className="text-xs md:text-sm font-medium relative z-10 drop-shadow-sm">Anunțuri exclusive</span>
                </Link>
                <Link
                  href="/dashboard/tokens"
                  className={`${isDarkMode ? "bg-gradient-to-r from-yellow-600 via-yellow-600 to-yellow-600 hover:from-yellow-700 hover:via-yellow-700 hover:to-yellow-700" : "bg-gradient-to-r from-yellow-500 via-yellow-500 to-yellow-500 hover:from-yellow-600 hover:via-yellow-600 hover:to-yellow-600"} p-2.5 md:p-4 rounded-lg md:rounded-xl text-center text-white shadow-lg md:shadow-xl hover:shadow-xl md:hover:shadow-2xl transform hover:scale-[1.02] active:scale-[0.98] transition-all duration-300 relative overflow-hidden group`}
                >
                  <div className="text-xl md:text-2xl mb-1 md:mb-2 flex justify-center relative z-10"><CoinsIcon size="l" /></div>
                  <span className="text-xs md:text-sm font-medium relative z-10">Token-uri ({userTokens.balance})</span>
                  <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/20 to-white/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000"></div>
                </Link>
                <Link
                  href="/dashboard/settings"
                  className={`${isDarkMode ? "bg-gradient-to-r from-blue-600 via-blue-600 to-blue-600 hover:from-blue-700 hover:via-blue-700 hover:to-blue-700" : "bg-gradient-to-r from-blue-500 via-blue-500 to-blue-500 hover:from-blue-600 hover:via-blue-600 hover:to-blue-600"} p-2.5 md:p-4 rounded-lg md:rounded-xl text-center text-white shadow-lg md:shadow-xl hover:shadow-xl md:hover:shadow-2xl transform hover:scale-[1.02] active:scale-[0.98] transition-all duration-300 relative overflow-hidden group`}
                >
                  <div className="text-xl md:text-2xl mb-1 md:mb-2 flex justify-center relative z-10"><SettingsIcon size="l" /></div>
                  <span className="text-xs md:text-sm font-medium relative z-10">Setări</span>
                  <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/20 to-white/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000"></div>
                </Link>
                <Link
                  href="/dashboard/payments"
                  className={`${isDarkMode ? "bg-gradient-to-r from-green-600 via-green-600 to-green-600 hover:from-green-700 hover:via-green-700 hover:to-green-700" : "bg-gradient-to-r from-green-500 via-green-500 to-green-500 hover:from-green-600 hover:via-green-600 hover:to-green-600"} p-2.5 md:p-4 rounded-lg md:rounded-xl text-center text-white shadow-lg md:shadow-xl hover:shadow-xl md:hover:shadow-2xl transform hover:scale-[1.02] active:scale-[0.98] transition-all duration-300 relative overflow-hidden group`}
                >
                  <div className="text-xl md:text-2xl mb-1 md:mb-2 flex justify-center relative z-10"><CreditCardIcon size="l" /></div>
                  <span className="text-xs md:text-sm font-medium relative z-10">Plăți</span>
                  <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/20 to-white/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000"></div>
                </Link>
                <Link
                  href="/dashboard/reviews"
                  className={`${isDarkMode ? "bg-gradient-to-r from-blue-600 via-blue-600 to-blue-600 hover:from-blue-700 hover:via-blue-700 hover:to-blue-700" : "bg-gradient-to-r from-blue-500 via-blue-500 to-blue-500 hover:from-blue-600 hover:via-blue-600 hover:to-blue-600"} p-2.5 md:p-4 rounded-lg md:rounded-xl text-center text-white shadow-lg md:shadow-xl hover:shadow-xl md:hover:shadow-2xl transform hover:scale-[1.02] active:scale-[0.98] transition-all duration-300 relative overflow-hidden group`}
                >
                  <div className="text-xl md:text-2xl mb-1 md:mb-2 flex justify-center relative z-10">
                    <i className="ri-star-line text-2xl md:text-3xl"></i>
                  </div>
                  <span className="text-xs md:text-sm font-medium relative z-10">Review-uri</span>
                  <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/20 to-white/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000"></div>
                </Link>
                <Link
                  href="/dashboard/support"
                  className={`${isDarkMode ? "bg-gradient-to-r from-teal-600 via-teal-600 to-teal-600 hover:from-teal-700 hover:via-teal-700 hover:to-teal-700" : "bg-gradient-to-r from-teal-700 via-teal-700 to-teal-700 hover:from-teal-800 hover:via-teal-800 hover:to-teal-800"} p-2.5 md:p-4 rounded-lg md:rounded-xl text-center text-white shadow-lg md:shadow-xl hover:shadow-xl md:hover:shadow-2xl transform hover:scale-[1.02] active:scale-[0.98] transition-all duration-300 relative overflow-hidden group`}
                >
                  <div className="text-xl md:text-2xl mb-1 md:mb-2 flex justify-center relative z-10"><SupportIcon size="l" /></div>
                  <span className="text-xs md:text-sm font-medium relative z-10">Suport</span>
                  <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/20 to-white/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000"></div>
                </Link>
              </>
            )}
          </div>
        </section>

        {/* Tab-uri și conținut: doar pe desktop; pe mobil doar Acțiuni rapide */}
        <section className="hidden md:block mb-4 md:mb-8">
          <div className={`rounded-xl md:rounded-2xl p-1.5 md:p-2 backdrop-blur-lg flex flex-wrap gap-1.5 md:gap-2 ${
            isDarkMode 
              ? 'bg-white/10 border border-white/20' 
              : 'bg-gray-100 border border-gray-200'
          }`}>
            {[
              { id: "active", label: "Active" },
              { id: "won", label: "Câștigate" },
              { id: "history", label: "Istoric" },
              { id: "my-auctions", label: "Licitații mele" }
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as typeof activeTab)}
                className={`px-3 py-1.5 md:px-4 md:py-2 rounded-lg md:rounded-xl text-xs md:text-sm font-medium transition-all ${
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

        {activeTab === "active" && (
          <section className="hidden md:block space-y-4 md:space-y-6 mb-4 md:mb-8">
            <div className="flex flex-col sm:flex-row gap-3 md:gap-4 justify-between">
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
              <div className={`border border-dashed rounded-xl md:rounded-2xl p-4 md:p-8 text-center text-sm md:text-base ${
                isDarkMode 
                  ? 'border-gray-600 text-gray-300' 
                  : 'border-gray-300 text-gray-600'
              }`}>
                Nu urmărești încă nicio licitație. Adaugă produse în watchlist din pagina licitațiilor.
              </div>
            ) : activeViewMode === "grid" ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
                {filteredWatchlist.map((item) => (
                  <article
                    key={item.id}
                    className={`rounded-xl md:rounded-2xl overflow-hidden shadow-lg md:shadow-2xl backdrop-blur-lg ${
                      isDarkMode 
                        ? 'bg-white/10 border border-white/20' 
                        : 'bg-white border border-gray-200'
                    }`}
                  >
                    <div
                      className="h-32 md:h-40 bg-cover bg-center"
                      style={{ backgroundImage: `url(${item.image})` }}
                    >
                      <div className="h-full w-full bg-black/30 flex items-end p-3 md:p-4 text-white">
                        <div>
                          <p className="text-xs md:text-sm font-semibold">🏆 Câștigat</p>
                          <p className="text-xs text-gray-200">{formatDate(item.auctionDate)}</p>
                        </div>
                      </div>
                    </div>
                    <div className={`p-3 md:p-4 space-y-2 md:space-y-3 ${
                      isDarkMode ? 'text-white' : 'text-gray-900'
                    }`}>
                      <span className="px-2 py-0.5 md:px-3 md:py-1 text-xs rounded-full bg-blue-600/70">{item.category}</span>
                      <h3 className="text-base md:text-lg font-semibold leading-tight">{item.title}</h3>
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
          <section className="hidden md:block space-y-4 md:space-y-6 mb-4 md:mb-8">
            <div className="flex flex-col sm:flex-row gap-3 md:gap-4 justify-between">
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
              <div className={`border border-dashed rounded-xl md:rounded-2xl p-4 md:p-8 text-center text-sm md:text-base ${
                isDarkMode 
                  ? 'border-gray-600 text-gray-300' 
                  : 'border-gray-300 text-gray-600'
              }`}>
                Încă nu ai licitații câștigate. Când vei câștiga una, apare aici.
              </div>
            ) : wonViewMode === "grid" ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
                {filteredWonAuctions.map((item) => (
                  <article
                    key={item.id}
                    className={`rounded-xl md:rounded-2xl overflow-hidden shadow-lg md:shadow-2xl backdrop-blur-lg ${
                      isDarkMode 
                        ? 'bg-white/10 border border-white/20' 
                        : 'bg-white border border-gray-200'
                    }`}
                  >
                    <div
                      className="h-32 md:h-40 bg-cover bg-center"
                      style={{ backgroundImage: `url(${item.image})` }}
                    >
                      <div className="h-full w-full bg-black/30 flex items-end p-3 md:p-4 text-white">
                        <div>
                          <p className="text-xs md:text-sm font-semibold">🏆 Câștigat</p>
                          <p className="text-xs text-gray-200">{formatDate(item.wonAt)}</p>
                        </div>
                      </div>
                    </div>
                    <div className={`p-3 md:p-4 space-y-2 md:space-y-3 ${
                      isDarkMode ? 'text-white' : 'text-gray-900'
                    }`}>
                      <span className="px-2 py-0.5 md:px-3 md:py-1 text-xs rounded-full bg-blue-600/70">{item.category}</span>
                      <h3 className="text-base md:text-lg font-semibold leading-tight">{item.title}</h3>
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
          <section className="hidden md:block grid grid-cols-1 gap-4 md:gap-6 mb-4 md:mb-8">
            <div className={`${isDarkMode ? "bg-gray-800" : "bg-white"} rounded-xl p-4 md:p-6 shadow-lg`}>
              <h3 className={`${isDarkMode ? "text-white" : "text-gray-900"} text-lg md:text-xl font-semibold mb-3 md:mb-4`}>
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
          <section className="hidden md:block mb-4 md:mb-8">
            <MyAuctionsSection 
              isDarkMode={isDarkMode}
              userId={typeof window !== 'undefined' ? localStorage.getItem('supabaseUserId') || '' : ''}
            />
          </section>
        )}
      </div>
      
      {/* Dashboard Footer */}
      <DashboardFooter isDarkMode={isDarkMode} />
    </div>
  );
}
