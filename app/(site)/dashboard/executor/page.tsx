"use client";

import { dashboardApiFetch } from "@/lib/dashboard-api-fetch";
import { uploadImageFile } from "@/lib/upload/client-image-upload";
import { useEffect, useMemo, useRef, useState } from "react";
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
import MyAuctionsSection from "@/components/MyAuctionsSection";
import DashboardFooter from "@/components/DashboardFooter";
import { supabase } from "@/lib/supabase";
import {
  resolveAccountTypeWithUser,
  shouldRedirectAwayFromExecutorRoutes,
} from "@/lib/auth/resolveAccountType";
import { useRouter, usePathname } from "next/navigation";

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
  const pathname = usePathname();
  const basePath = pathname?.startsWith("/dashboard/lichidator") ? "/dashboard/lichidator" : "/dashboard/executor";
  const bgEmblem = basePath?.includes("lichidator") ? "/images/logo-unpir.png" : "/executori.jpeg";
  const defaultAvatar = basePath?.includes("lichidator") ? "/images/logo-unpir.png" : null;
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [activeTab, setActiveTab] = useState<"overview">("overview");
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

  // Product stats state
  const [productStats, setProductStats] = useState({
    totalProducts: 0,
    activeProducts: 0,
    draftProducts: 0,
    pendingProducts: 0,
    totalValue: 0
  });

  const [watchlistProducts, setWatchlistProducts] = useState<WatchlistProduct[]>([]);
  const [wonAuctions, setWonAuctions] = useState<WonAuction[]>([]);
  const [activityItems, setActivityItems] = useState<ActivityItem[]>([]);
  const [historyRows, setHistoryRows] = useState<HistoryRow[]>([]);
  const [isClient, setIsClient] = useState(false);
  
  // PDF Import states
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [isProcessingPdf, setIsProcessingPdf] = useState(false);

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
  const [extractedData, setExtractedData] = useState<any>(null);

  // Custom buttons state
  const [customButtons, setCustomButtons] = useState<any[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [showAvatarModal, setShowAvatarModal] = useState(false);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [avatarMessage, setAvatarMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  
  // Notifications state
  const [notifications, setNotifications] = useState<any[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);

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
          .from('executor_custom_buttons')
          .select('button_config')
          .eq('user_id', user.id)
          .maybeSingle();

        if (buttonError && buttonError.code !== 'PGRST116') { // PGRST116 = no rows returned
          console.error('Error loading buttons from database:', buttonError);
          loadFromLocalStorage();
          return;
        }

        if (buttonData && buttonData.button_config) {
          try {
            const buttons = JSON.parse(JSON.stringify(buttonData.button_config));
            setCustomButtons(buttons);
            // Also save to localStorage as backup
            localStorage.setItem('executor_custom_buttons', JSON.stringify(buttons));
          } catch (e) {
            console.error('Error parsing button config:', e);
            loadFromLocalStorage();
          }
        } else {
          // No saved buttons, try localStorage as fallback
          loadFromLocalStorage();
        }
      } catch (error) {
        console.error('Error loading buttons:', error);
        loadFromLocalStorage();
      }
    };

    const loadFromLocalStorage = () => {
      // Fallback to localStorage if database fails
      const savedButtons = localStorage.getItem('executor_custom_buttons');
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
      if (e.key === 'executor_custom_buttons') {
        loadButtons();
      }
    };

    // Listen for custom event from customize page
    const handleButtonsUpdated = () => {
      loadButtons();
    };

    // Poll for changes (in case same-window updates)
    const interval = setInterval(() => {
      loadButtons();
    }, 2000);

    window.addEventListener('storage', handleStorageChange);
    window.addEventListener('buttonsUpdated', handleButtonsUpdated);

    return () => {
      clearInterval(interval);
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('buttonsUpdated', handleButtonsUpdated);
    };
  }, []);

  // CRITICAL: Apply dark mode class to HTML element immediately on mount
  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    // Initial load from localStorage
    const saved = localStorage.getItem('darkMode');
    const initialDarkMode = saved === 'true';
    setIsDarkMode(initialDarkMode);
    
    // Apply dark mode class immediately
    const htmlElement = document.documentElement;
    if (initialDarkMode) {
      htmlElement.classList.add('dark');
    } else {
      htmlElement.classList.remove('dark');
    }
  }, []);

  useEffect(() => {
    setIsClient(true);
  }, []);

  // Apply dark mode class whenever isDarkMode changes
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const htmlElement = document.documentElement;
    if (isDarkMode) {
      htmlElement.classList.add('dark');
    } else {
      htmlElement.classList.remove('dark');
    }
    localStorage.setItem('darkMode', String(isDarkMode));
  }, [isDarkMode]);

  const isDarkModeRef = useRef(isDarkMode);
  useEffect(() => {
    isDarkModeRef.current = isDarkMode;
  }, [isDarkMode]);

  // Listen for dark mode changes from UniversalHeader (fără poll la 100ms — re-monta efectul la fiecare toggle + verificări dese = lag / „restart”)
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const updateDarkMode = () => {
      const saved = localStorage.getItem('darkMode');
      const darkModeValue = saved === 'true';
      setIsDarkMode(darkModeValue);

      const htmlElement = document.documentElement;
      if (darkModeValue) {
        htmlElement.classList.add('dark');
      } else {
        htmlElement.classList.remove('dark');
      }
    };

    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'darkMode') {
        updateDarkMode();
      } else if (e.key === 'userInfo' && e.newValue) {
        try {
          const newUserInfo = JSON.parse(e.newValue);
          if (newUserInfo.avatar !== undefined) {
            setUserInfo(prev => ({ ...prev, avatar: newUserInfo.avatar || '' }));
          }
        } catch (e) {
          console.error('Error parsing userInfo from storage:', e);
        }
      }
    };

    const handleDarkModeToggle = () => {
      updateDarkMode();
    };

    const handleAvatarUpdated = (e: CustomEvent) => {
      if (e.detail?.avatarUrl !== undefined) {
        setUserInfo(prev => ({ ...prev, avatar: e.detail.avatarUrl || '' }));
        const currentUserInfo = JSON.parse(localStorage.getItem('userInfo') || '{}');
        localStorage.setItem('userInfo', JSON.stringify({
          ...currentUserInfo,
          avatar: e.detail.avatarUrl || ''
        }));
      }
    };

    // Rețea de siguranță: același tab nu primește „storage”; polling rar, fără dependență de isDarkMode pe efect
    const interval = setInterval(() => {
      const saved = localStorage.getItem('darkMode');
      const currentValue = saved === 'true';
      if (currentValue !== isDarkModeRef.current) {
        updateDarkMode();
      }
    }, 3000);

    window.addEventListener('storage', handleStorageChange);
    window.addEventListener('darkModeChanged', handleDarkModeToggle);
    window.addEventListener('avatarUpdated', handleAvatarUpdated as EventListener);

    return () => {
      clearInterval(interval);
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('darkModeChanged', handleDarkModeToggle);
      window.removeEventListener('avatarUpdated', handleAvatarUpdated as EventListener);
    };
  }, []);

  const toggleDarkMode = () => {
    // This function is passed to UniversalHeader - it will handle localStorage and class updates
    const newMode = !isDarkMode;
    setIsDarkMode(newMode);
    if (typeof window !== 'undefined') {
      localStorage.setItem('darkMode', String(newMode));
      const htmlElement = document.documentElement;
      // CRITICAL: Apply dark mode class to HTML element for Tailwind dark: classes to work
      if (newMode) {
        htmlElement.classList.add('dark');
      } else {
        htmlElement.classList.remove('dark');
      }
      // Dispatch custom event for same-window sync
      window.dispatchEvent(new Event('darkModeChanged'));
    }
  };

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
          setCurrentUserId(user.id);

          if (shouldRedirectAwayFromExecutorRoutes(accountType)) {
            if (typeof window !== "undefined") {
              window.location.href = "/dashboard";
            }
            return;
          }
          if (typeof window !== "undefined") {
            if (pathname?.startsWith("/dashboard/lichidator") && accountType === "executor") {
              window.location.href = "/dashboard/executor";
              return;
            }
            if (pathname?.startsWith("/dashboard/executor") && accountType === "liquidator") {
              window.location.href = "/dashboard/lichidator";
              return;
            }
          }
        }
        
        // Set currentUserId if we have userId
        if (userId) {
          setCurrentUserId(userId);
        }

        // Load notifications for executor
        if (userId) {
          try {
            const { data: notificationsData, error: notificationsError } = await supabase
              .from('user_notifications')
              .select('id, title, message, type, metadata, read_at, created_at')
              .eq('user_id', userId)
              .order('created_at', { ascending: false })
              .limit(10);
            
            if (!notificationsError && notificationsData) {
              const mappedNotifications = notificationsData.map((notif: any) => ({
                id: notif.id,
                message: notif.message || notif.title || 'Notificare',
                type: notif.type || 'info',
                read: !!notif.read_at,
                timestamp: notif.created_at
              }));
              setNotifications(mappedNotifications);
            }
          } catch (error) {
            console.error('Error loading notifications:', error);
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
          activityRes,
          productsRes
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
                // Try to parse error as JSON first
                let errorData;
                try {
                  const errorText = await res.text();
                  errorData = JSON.parse(errorText);
                } catch {
                  // If not JSON, use the text as error message
                  errorData = { error: await res.text() };
                }
                
                // Log error details for debugging, but only if it's not a recoverable error
                if (res.status >= 500) {
                  console.error('[Dashboard] API tokens error:', errorData);
                } else {
                  console.warn('[Dashboard] API tokens warning:', errorData);
                }
                
                // Return null to allow fallback to defaults
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
            .limit(100),
          // Load products for executor
          supabase
            .from("products")
            .select("id,status,approval_status,starting_price,starting_price_ron,currency")
            .eq("user_id", userId)
            .neq("status", "deleted")
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
        const userInfoData = {
          firstName: profile?.first_name ?? user?.user_metadata?.first_name ?? userInfoFromStorage?.firstName ?? "",
          lastName: profile?.last_name ?? user?.user_metadata?.last_name ?? userInfoFromStorage?.lastName ?? "",
          email: user?.email ?? userInfoFromStorage?.email ?? "",
          phone: profile?.phone ?? user?.user_metadata?.phone ?? userInfoFromStorage?.phone ?? "",
          avatar: profile?.avatar_url ?? user?.user_metadata?.avatar_url ?? userInfoFromStorage?.avatar ?? ""
        };
        
        setUserInfo(userInfoData);
        
        // Update localStorage so UniversalHeader can access it
        if (typeof window !== 'undefined') {
          localStorage.setItem('userInfo', JSON.stringify(userInfoData));
        }

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
        const products = productsRes.data ?? [];

        // Calculate product stats
        const totalProducts = products.length;
        const activeProducts = products.filter((p: any) => p.status === 'active' && p.approval_status !== 'pending').length;
        const draftProducts = products.filter((p: any) => p.status === 'draft').length;
        const pendingProducts = products.filter((p: any) => p.approval_status === 'pending').length;
        const totalValue = products.reduce((sum: number, p: any) => {
          const price = p.starting_price || p.starting_price_ron || 0;
          return sum + (typeof price === 'number' ? price : 0);
        }, 0);

        setProductStats({
          totalProducts,
          activeProducts,
          draftProducts,
          pendingProducts,
          totalValue
        });

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

  const handleAvatarFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      // Validate file type
      if (!selectedFile.type.startsWith('image/')) {
        setAvatarMessage({
          type: 'error',
          text: 'Te rog selectează o imagine validă (JPG, PNG, etc.)',
        });
        return;
      }
      // Validate file size (max 5MB)
      if (selectedFile.size > 5 * 1024 * 1024) {
        setAvatarMessage({
          type: 'error',
          text: 'Imaginea este prea mare. Dimensiunea maximă este 5MB.',
        });
        return;
      }
      setAvatarFile(selectedFile);
      // Create preview
      const reader = new FileReader();
      reader.onloadend = () => {
        setAvatarPreview(reader.result as string);
      };
      reader.readAsDataURL(selectedFile);
    } else {
      setAvatarFile(null);
      setAvatarPreview(null);
    }
  };

  const handleAvatarUpload = async () => {
    if (!avatarFile || !currentUserId) {
      setAvatarMessage({
        type: 'error',
        text: 'Te rog selectează o imagine și asigură-te că ești autentificat.',
      });
      return;
    }

    setIsUploadingAvatar(true);
    setAvatarMessage(null);

    try {
      const uploadData = await uploadImageFile(avatarFile, { fetchImpl: dashboardApiFetch });
      if (!uploadData.success) {
        throw new Error(uploadData.error);
      }
      if (!uploadData.url) {
        throw new Error('Eroare la încărcarea imaginii');
      }
      const avatarUrl = uploadData.url;

      // Update user_profiles with new avatar
      const { error: updateError } = await supabase
        .from('user_profiles')
        .update({ avatar_url: avatarUrl })
        .eq('user_id', currentUserId);

      if (updateError) {
        throw updateError;
      }

      // Update local state
      setUserInfo(prev => ({ ...prev, avatar: avatarUrl }));
      
      // Update localStorage
      const currentUserInfo = JSON.parse(localStorage.getItem('userInfo') || '{}');
      localStorage.setItem('userInfo', JSON.stringify({
        ...currentUserInfo,
        avatar: avatarUrl
      }));

      // Dispatch event to notify other components
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('avatarUpdated', { detail: { avatarUrl } }));
      }

      // Close modal and reset
      setShowAvatarModal(false);
      setAvatarFile(null);
      setAvatarPreview(null);
      setAvatarMessage({
        type: 'success',
        text: 'Avatarul a fost actualizat cu succes!',
      });

      // Reload page data after a short delay to show success message
      setTimeout(() => {
        window.location.reload();
      }, 1500);
    } catch (error: any) {
      console.error('Error uploading avatar:', error);
      setAvatarMessage({
        type: 'error',
        text: error.message || 'Eroare la încărcarea avatarului. Te rog încearcă din nou.',
      });
    } finally {
      setIsUploadingAvatar(false);
    }
  };

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
      label: "TOTAL PRODUSE",
      value: productStats.totalProducts,
      icon: "ri-box-3-line"
    },
    {
      label: "PRODUSE ACTIVE",
      value: productStats.activeProducts,
      icon: "ri-checkbox-circle-line"
    },
    {
      label: "DEZACTIVATE",
      value: productStats.draftProducts,
      icon: "ri-edit-line"
    },
    {
      label: "ÎN AȘTEPTARE",
      value: productStats.pendingProducts,
      icon: "ri-time-line"
    }
  ];

  return (
    <div className={`min-h-screen transition-all duration-300 relative ${
      isDarkMode 
        ? 'bg-gradient-to-br from-gray-900 via-gray-800 to-gray-700' 
        : 'bg-gradient-to-br from-gray-50 via-white to-gray-50'
    }`}>
      {/* Background Emblem - Vizibil discret, fără efect strident */}
      <div 
        className="fixed inset-0 opacity-[0.055] dark:opacity-[0.07] md:opacity-[0.035] md:dark:opacity-[0.045] pointer-events-none z-0"
        style={{
          backgroundImage: `url(${bgEmblem})`,
          backgroundSize: 'contain',
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat'
        }}
      />

      {/* Page Loading - Removed spinner */}

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
                  { href: `${basePath}/favorites`, label: "Favorite", icon: "❤️" },
                  { href: `${basePath}/settings`, label: "Setări", icon: "⚙️" },
                  { href: `${basePath}/tokens`, label: "Token-uri", icon: "💰" },
                  { href: `${basePath}/payments`, label: "Plăți", icon: "💳" },
                  { href: `${basePath}/support`, label: "Suport", icon: "🎫" },
                  { href: "/dashboard/reviews", label: "Review-uri", icon: "⭐" }
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

      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-4 md:py-8 relative z-10">
        <DashboardLogoutDarkModeRow
          isDarkMode={isDarkMode}
          onToggleDarkMode={toggleDarkMode}
          onLogout={handleLogout}
          className="mb-3 md:mb-5"
        />
        <header className="mb-4 md:mb-8 relative">
          {/* Top Left Section - Panel Badge */}
          <div className="absolute -top-1 md:-top-4 left-0 z-10">
            <div className={`inline-flex items-center gap-1.5 md:gap-2 px-2.5 md:px-3 py-1 md:py-1.5 rounded-lg ${
              isDarkMode 
                ? 'bg-blue-600/20 border border-blue-500/30' 
                : 'bg-blue-50 border border-blue-200'
            }`}>
              <i className={`ri-shield-user-line text-sm md:text-base ${
                isDarkMode ? 'text-blue-300' : 'text-blue-600'
              }`}></i>
              <span className={`text-[10px] md:text-xs font-medium ${
                isDarkMode ? 'text-blue-200' : 'text-blue-700'
              }`}>
                {basePath?.includes("lichidator") ? "Panel privat pentru lichidatori" : "Panel privat de executori"}
              </span>
            </div>
          </div>
          
          {/* Centered Section - Avatar and Welcome */}
          <div className="flex flex-col items-center gap-2 md:gap-6 text-center pt-10 md:pt-16">
            {/* Avatar with Edit Button */}
            <div className="relative">
              <div className={`w-16 h-16 md:w-24 md:h-24 rounded-full overflow-hidden flex items-center justify-center border-2 ${
                isDarkMode 
                  ? 'bg-gradient-to-br from-blue-600 to-blue-600 border-blue-500' 
                  : 'bg-gradient-to-br from-blue-500 to-blue-500 border-blue-400'
              } shadow-lg`}>
                {(userInfo.avatar || defaultAvatar) ? (
                  <img src={userInfo.avatar || defaultAvatar!} alt="Avatar" className="w-full h-full object-cover" />
                ) : (
                  <span className="text-2xl md:text-3xl">
                    ⚖️
                  </span>
                )}
              </div>
              <button
                onClick={() => setShowAvatarModal(true)}
                className="absolute bottom-0 right-0 w-6 h-6 md:w-7 md:h-7 rounded-full bg-blue-500 hover:bg-blue-600 text-white shadow-md flex items-center justify-center transition-colors border-2 border-white"
                title="Editează avatar"
              >
                <i className="ri-pencil-line text-[10px] md:text-xs"></i>
              </button>
            </div>
            
            {/* Welcome Text */}
            <div className="space-y-0.5 md:space-y-2">
              <h2 className={`text-xl md:text-3xl font-bold ${
                isDarkMode ? 'text-white' : 'text-gray-900'
              }`}>
                Bun venit, {userInfo.firstName || "Executor"} 👋
              </h2>
              <p className={`text-xs md:text-sm ${
                isDarkMode ? 'text-gray-400' : 'text-gray-600'
              }`}>
                Gestionează-ți licitațiile și produsele din panoul tău personal
              </p>
            </div>
          </div>
        </header>

        <section className={`${isDarkMode ? "bg-gray-800/20" : "bg-white/20"} backdrop-blur-sm rounded-xl p-4 md:p-6 shadow-lg mb-4 md:mb-8 relative`}>
          <div className="relative z-10">
          <div className="flex justify-between items-center mb-2 md:mb-4">
            <h3 className={`${isDarkMode ? "text-white" : "text-gray-900"} text-lg md:text-xl font-semibold`}>
              Acțiuni rapide
            </h3>
            <button
              onClick={() => router.push(`${basePath}/customize-buttons`)}
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
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2 md:gap-4">
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
                    gray: { light: "bg-gray-500 hover:bg-gray-600", dark: "bg-gray-600 hover:bg-gray-700" }
                  };
                  return isDarkMode ? colorMap[button.color]?.dark || colorMap.blue.dark : colorMap[button.color]?.light || colorMap.blue.light;
                };

                // Special handling for tokens button
                const label = button.id === 'tokens' 
                  ? `Token-uri (${userTokens.balance})` 
                  : button.label;

                const getGradientClass = (color: string) => {
                  const gradientMap: Record<string, { light: string; dark: string }> = {
                    orange: { light: "bg-gradient-to-r from-orange-500 via-orange-500 to-orange-500 hover:from-orange-600 hover:via-orange-600 hover:to-orange-600", dark: "bg-gradient-to-r from-orange-600 via-orange-600 to-orange-600 hover:from-orange-700 hover:via-orange-700 hover:to-orange-700" },
                    blue: { light: "bg-gradient-to-r from-blue-500 via-blue-500 to-blue-500 hover:from-blue-600 hover:via-blue-600 hover:to-blue-600", dark: "bg-gradient-to-r from-blue-600 via-blue-600 to-blue-600 hover:from-blue-700 hover:via-blue-700 hover:to-blue-700" },
                    yellow: { light: "bg-gradient-to-r from-yellow-500 via-yellow-500 to-yellow-500 hover:from-yellow-600 hover:via-yellow-600 hover:to-yellow-600", dark: "bg-gradient-to-r from-yellow-600 via-yellow-600 to-yellow-600 hover:from-yellow-700 hover:via-yellow-700 hover:to-yellow-700" },
                    green: { light: "bg-gradient-to-r from-green-500 via-green-500 to-green-500 hover:from-green-600 hover:via-green-600 hover:to-green-600", dark: "bg-gradient-to-r from-green-600 via-green-600 to-green-600 hover:from-green-700 hover:via-green-700 hover:to-green-700" },
                    red: { light: "bg-gradient-to-r from-red-500 via-red-500 to-red-500 hover:from-red-600 hover:via-red-600 hover:to-red-600", dark: "bg-gradient-to-r from-red-600 via-red-600 to-red-600 hover:from-red-700 hover:via-red-700 hover:to-red-700" },
                    teal: { light: "bg-gradient-to-r from-teal-500 via-teal-500 to-teal-500 hover:from-teal-600 hover:via-teal-600 hover:to-teal-600", dark: "bg-gradient-to-r from-teal-600 via-teal-600 to-teal-600 hover:from-teal-700 hover:via-teal-700 hover:to-teal-700" },
                    pink: { light: "bg-gradient-to-r from-pink-500 via-pink-500 to-pink-500 hover:from-pink-600 hover:via-pink-600 hover:to-pink-600", dark: "bg-gradient-to-r from-pink-600 via-pink-600 to-pink-600 hover:from-pink-700 hover:via-pink-700 hover:to-pink-700" },
                    gray: { light: "bg-gradient-to-r from-gray-500 via-gray-500 to-gray-500 hover:from-gray-600 hover:via-gray-600 hover:to-gray-600", dark: "bg-gradient-to-r from-gray-600 via-gray-600 to-gray-600 hover:from-gray-700 hover:via-gray-700 hover:to-gray-700" }
                  };
                  return isDarkMode ? gradientMap[color]?.dark || gradientMap.blue.dark : gradientMap[color]?.light || gradientMap.blue.light;
                };

                return (
                  <a
                    key={button.id}
                    href={button.url}
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
                      ) : button.id === 'reviews' ? (
                        <i className="ri-star-line text-2xl md:text-3xl"></i>
                      ) : (
                        <i className={`${button.icon} text-2xl md:text-3xl`}></i>
                      )}
                    </div>
                    <span className="text-xs md:text-sm font-medium relative z-10">{label}</span>
                    <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/20 to-white/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000"></div>
                  </a>
                );
              })
            ) : (
              // Default buttons if no custom buttons are set
              <>
                <a
                  href={`${basePath}/my-products`}
                  className={`${isDarkMode ? "bg-gradient-to-r from-orange-600 via-orange-600 to-orange-600 hover:from-orange-700 hover:via-orange-700 hover:to-orange-700" : "bg-gradient-to-r from-orange-500 via-orange-500 to-orange-500 hover:from-orange-600 hover:via-orange-600 hover:to-orange-600"} p-2.5 md:p-4 rounded-lg md:rounded-xl text-center text-white shadow-lg md:shadow-xl hover:shadow-xl md:hover:shadow-2xl transform hover:scale-[1.02] active:scale-[0.98] transition-all duration-300 relative overflow-hidden group`}
                >
                  <div className="text-xl md:text-2xl mb-1 md:mb-2 flex justify-center relative z-10">
                    <i className="ri-box-3-line text-2xl md:text-3xl"></i>
                  </div>
                  <span className="text-xs md:text-sm font-medium relative z-10">Produsele mele</span>
                  <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/20 to-white/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000"></div>
                </a>
                <a
                  href="/ro"
                  className={`${isDarkMode ? "bg-gradient-to-r from-blue-600 via-blue-600 to-blue-600 hover:from-blue-700 hover:via-blue-700 hover:to-blue-700" : "bg-gradient-to-r from-blue-500 via-blue-500 to-blue-500 hover:from-blue-600 hover:via-blue-600 hover:to-blue-600"} p-2.5 md:p-4 rounded-lg md:rounded-xl text-center text-white shadow-lg md:shadow-xl hover:shadow-xl md:hover:shadow-2xl transform hover:scale-[1.02] active:scale-[0.98] transition-all duration-300 relative overflow-hidden group`}
                >
                  <div className="text-xl md:text-2xl mb-1 md:mb-2 flex justify-center relative z-10"><SearchIcon size="l" /></div>
                  <span className="text-xs md:text-sm font-medium relative z-10">Caută licitații</span>
                  <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/20 to-white/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000"></div>
                </a>
                <a
                  href={`${basePath}/tokens`}
                  className={`${isDarkMode ? "bg-gradient-to-r from-yellow-600 via-yellow-600 to-yellow-600 hover:from-yellow-700 hover:via-yellow-700 hover:to-yellow-700" : "bg-gradient-to-r from-yellow-500 via-yellow-500 to-yellow-500 hover:from-yellow-600 hover:via-yellow-600 hover:to-yellow-600"} p-2.5 md:p-4 rounded-lg md:rounded-xl text-center text-white shadow-lg md:shadow-xl hover:shadow-xl md:hover:shadow-2xl transform hover:scale-[1.02] active:scale-[0.98] transition-all duration-300 relative overflow-hidden group`}
                >
                  <div className="text-xl md:text-2xl mb-1 md:mb-2 flex justify-center relative z-10"><CoinsIcon size="l" /></div>
                  <span className="text-xs md:text-sm font-medium relative z-10">Token-uri ({userTokens.balance})</span>
                  <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/20 to-white/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000"></div>
                </a>
                <a
                  href={`${basePath}/settings`}
                  className={`${isDarkMode ? "bg-gradient-to-r from-blue-600 via-blue-600 to-blue-600 hover:from-blue-700 hover:via-blue-700 hover:to-blue-700" : "bg-gradient-to-r from-blue-500 via-blue-500 to-blue-500 hover:from-blue-600 hover:via-blue-600 hover:to-blue-600"} p-2.5 md:p-4 rounded-lg md:rounded-xl text-center text-white shadow-lg md:shadow-xl hover:shadow-xl md:hover:shadow-2xl transform hover:scale-[1.02] active:scale-[0.98] transition-all duration-300 relative overflow-hidden group`}
                >
                  <div className="text-xl md:text-2xl mb-1 md:mb-2 flex justify-center relative z-10"><SettingsIcon size="l" /></div>
                  <span className="text-xs md:text-sm font-medium relative z-10">Setări</span>
                  <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/20 to-white/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000"></div>
                </a>
                <a
                  href={`${basePath}/payments`}
                  className={`${isDarkMode ? "bg-gradient-to-r from-green-600 via-green-600 to-green-600 hover:from-green-700 hover:via-green-700 hover:to-green-700" : "bg-gradient-to-r from-green-500 via-green-500 to-green-500 hover:from-green-600 hover:via-green-600 hover:to-green-600"} p-2.5 md:p-4 rounded-lg md:rounded-xl text-center text-white shadow-lg md:shadow-xl hover:shadow-xl md:hover:shadow-2xl transform hover:scale-[1.02] active:scale-[0.98] transition-all duration-300 relative overflow-hidden group`}
                >
                  <div className="text-xl md:text-2xl mb-1 md:mb-2 flex justify-center relative z-10"><CreditCardIcon size="l" /></div>
                  <span className="text-xs md:text-sm font-medium relative z-10">Plăți</span>
                  <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/20 to-white/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000"></div>
                </a>
                <a
                  href={`${basePath}/favorites`}
                  className={`${isDarkMode ? "bg-gradient-to-r from-red-600 via-red-600 to-red-600 hover:from-red-700 hover:via-red-700 hover:to-red-700" : "bg-gradient-to-r from-red-500 via-red-500 to-red-500 hover:from-red-600 hover:via-red-600 hover:to-red-600"} p-2.5 md:p-4 rounded-lg md:rounded-xl text-center text-white shadow-lg md:shadow-xl hover:shadow-xl md:hover:shadow-2xl transform hover:scale-[1.02] active:scale-[0.98] transition-all duration-300 relative overflow-hidden group`}
                >
                  <div className="text-xl md:text-2xl mb-1 md:mb-2 flex justify-center relative z-10"><HeartIcon size="l" /></div>
                  <span className="text-xs md:text-sm font-medium relative z-10">Favorite</span>
                  <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/20 to-white/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000"></div>
                </a>
                <a
                  href={`${basePath}/support`}
                  className={`${isDarkMode ? "bg-gradient-to-r from-teal-600 via-teal-600 to-teal-600 hover:from-teal-700 hover:via-teal-700 hover:to-teal-700" : "bg-gradient-to-r from-teal-700 via-teal-700 to-teal-700 hover:from-teal-800 hover:via-teal-800 hover:to-teal-800"} p-2.5 md:p-4 rounded-lg md:rounded-xl text-center text-white shadow-lg md:shadow-xl hover:shadow-xl md:hover:shadow-2xl transform hover:scale-[1.02] active:scale-[0.98] transition-all duration-300 relative overflow-hidden group`}
                >
                  <div className="text-xl md:text-2xl mb-1 md:mb-2 flex justify-center relative z-10"><SupportIcon size="l" /></div>
                  <span className="text-xs md:text-sm font-medium relative z-10">Suport</span>
                  <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/20 to-white/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000"></div>
                </a>
                <a
                  href="/dashboard/reviews"
                  className={`${isDarkMode ? "bg-gradient-to-r from-blue-600 via-blue-600 to-blue-600 hover:from-blue-700 hover:via-blue-700 hover:to-blue-700" : "bg-gradient-to-r from-blue-500 via-blue-500 to-blue-500 hover:from-blue-600 hover:via-blue-600 hover:to-blue-600"} p-2.5 md:p-4 rounded-lg md:rounded-xl text-center text-white shadow-lg md:shadow-xl hover:shadow-xl md:hover:shadow-2xl transform hover:scale-[1.02] active:scale-[0.98] transition-all duration-300 relative overflow-hidden group`}
                >
                  <div className="text-xl md:text-2xl mb-1 md:mb-2 flex justify-center relative z-10">
                    <i className="ri-star-line text-2xl md:text-3xl"></i>
                  </div>
                  <span className="text-xs md:text-sm font-medium relative z-10">Review-uri</span>
                  <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/20 to-white/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000"></div>
                </a>
              </>
            )}
          </div>
          </div>
        </section>

        {activeTab === "overview" && (
          <section className="grid grid-cols-2 gap-2 md:gap-4 mb-4 md:mb-8">
            {overviewStats.map((stat) => (
              <div
                key={stat.label}
                className={`rounded-xl md:rounded-2xl p-3 md:p-5 shadow-lg md:shadow-2xl backdrop-blur-lg ${
                  isDarkMode 
                    ? 'bg-white/2 border border-white/3 text-white' 
                    : 'bg-white/10 border border-gray-200/20 text-gray-900'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className={`text-[10px] md:text-xs uppercase tracking-wide ${
                      isDarkMode ? 'text-gray-200' : 'text-gray-600'
                    }`}>{stat.label}</p>
                    <p className="text-xl md:text-3xl font-bold mt-1 md:mt-2">
                      {typeof stat.value === "number" ? stat.value : stat.value}
                    </p>
                  </div>
                  <div className={`w-10 h-10 md:w-12 md:h-12 rounded-lg flex items-center justify-center ${
                    isDarkMode ? 'bg-white/20' : 'bg-gray-100'
                  }`}>
                    <i className={`${stat.icon} text-lg md:text-2xl`} />
                  </div>
                </div>
              </div>
            ))}
          </section>
        )}

        {/* Removed tabs: active, won, history, my-auctions, public-auctions - all sections removed */}

        {/* Avatar Edit Modal */}
        {showAvatarModal && (
          <div 
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-2 sm:p-4"
            onClick={(e) => {
              if (e.target === e.currentTarget) {
                setShowAvatarModal(false);
                setAvatarFile(null);
                setAvatarPreview(null);
                setAvatarMessage(null);
              }
            }}
          >
            <div 
              className="w-full max-w-md bg-white dark:bg-gray-800 rounded-lg sm:rounded-xl shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="sticky top-0 z-10 flex items-center justify-between p-4 sm:p-4 md:p-6 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
                <h2 className="text-lg sm:text-xl md:text-2xl font-bold text-gray-900 dark:text-white">
                  Editează Avatar
                </h2>
                <button
                  onClick={() => {
                    setShowAvatarModal(false);
                    setAvatarFile(null);
                    setAvatarPreview(null);
                    setAvatarMessage(null);
                  }}
                  className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300"
                >
                  <i className="ri-close-line text-xl sm:text-2xl"></i>
                </button>
              </div>

              <div className="p-4 sm:p-4 md:p-6">
                {/* Message */}
                {avatarMessage && (
                  <div
                    className={`mb-4 p-3 sm:p-4 rounded-lg text-sm sm:text-base ${
                      avatarMessage.type === 'success'
                        ? 'bg-green-50 dark:bg-green-900/20 text-green-800 dark:text-green-300'
                        : 'bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-300'
                    }`}
                  >
                    {avatarMessage.text}
                  </div>
                )}

                {/* Current Avatar Preview */}
                <div className="flex flex-col items-center mb-6">
                  <div className={`w-32 h-32 rounded-full shadow-lg overflow-hidden flex items-center justify-center border-4 ${
                    isDarkMode 
                      ? 'bg-gradient-to-r from-blue-600 to-blue-600 border-blue-500' 
                      : 'bg-gradient-to-r from-blue-500 to-blue-500 border-blue-400'
                  } mb-4`}>
                    {avatarPreview ? (
                      <img src={avatarPreview} alt="Preview" className="w-full h-full object-cover" />
                    ) : (userInfo.avatar || defaultAvatar) ? (
                      <img src={userInfo.avatar || defaultAvatar!} alt="Current Avatar" className="w-full h-full object-cover object-center" />
                    ) : (
                      <span className="text-5xl font-bold text-white">⚖️</span>
                    )}
                  </div>
                  <p className="text-sm text-gray-600 dark:text-gray-400 text-center">
                    {avatarPreview ? 'Preview nou avatar' : 'Avatar curent'}
                  </p>
                </div>

                {/* File Input */}
                <div className="mb-6">
                  <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">
                    Selectează imagine nouă
                  </label>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleAvatarFileChange}
                    className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white"
                  />
                  <p className="text-xs mt-1 text-gray-500 dark:text-gray-400">
                    Format acceptat: JPG, PNG, WebP. Dimensiune maximă: 5MB
                  </p>
                </div>

                {/* Action Buttons */}
                <div className="flex gap-3">
                  <button
                    onClick={() => {
                      setShowAvatarModal(false);
                      setAvatarFile(null);
                      setAvatarPreview(null);
                      setAvatarMessage(null);
                    }}
                    className="flex-1 px-4 py-2 bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-lg transition-colors"
                  >
                    Anulează
                  </button>
                  <button
                    onClick={handleAvatarUpload}
                    disabled={!avatarFile || isUploadingAvatar}
                    className="flex-1 px-4 py-2 bg-blue-500 hover:bg-blue-600 dark:bg-blue-600 dark:hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {isUploadingAvatar ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                        <span>Se încarcă...</span>
                      </>
                    ) : (
                      <>
                        <i className="ri-upload-cloud-line"></i>
                        <span>Salvează Avatar</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
      
      {/* Dashboard Footer */}
      <DashboardFooter isDarkMode={isDarkMode} />
    </div>
  );
}
