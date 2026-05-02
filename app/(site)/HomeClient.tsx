"use client";

/**
 * Legacy full homepage client. No longer used by the homepage (app/(site)/page.tsx).
 * Homepage now uses HomeEnhancementsClient + HomeHeroServer + HomePremiumListingsServer + HomeEnhancementsLazy (HomeLazyShell + independent lazy sections in app/(site)/home/).
 * Kept for reference or other routes (e.g. /ro) that may still import it.
 */

import Image from "next/image";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useState, useEffect, useRef, Suspense } from "react";
import { createPortal } from "react-dom";
import { useSearchParams, useRouter } from "next/navigation";
import type { AuthChangeEvent, Session } from "@supabase/supabase-js";
import { NotificationIcon } from "@/components/HeroIcons";
import UniversalHeader from "@/components/UniversalHeader";
import HeroSearchBar from "@/app/components/HeroSearchBar";
import AuctionListSkeleton from "@/components/skeletons/AuctionListSkeleton";
import { getProductDisplayImage } from "@/lib/getProductDisplayImage";
import type { HomePremiumItem } from "@/lib/server/home/getHomePremiumListings";
import { PieseAutoMarcaInlineSpan } from "@/components/piese-auto/PieseAutoMarcaBadges";

// Hero is server-rendered in app/(site)/HomeHero.tsx for LCP. No Slider in initial client bundle.

// Below-the-fold: smaller initial JS bundle for mobile (LCP / TTI)
const PremiumListings = dynamic(
  () => import("@/components/PremiumListings").then((m) => ({ default: m.PremiumListings })),
  {
    ssr: true,
    loading: () => (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-4 md:gap-6 min-h-[280px] animate-pulse">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="rounded-lg bg-gray-200/80 dark:bg-white/10 h-64" />
        ))}
      </div>
    ),
  }
);

// Third-wave: section components lazy-loaded to shrink main chunk
const HomeCategoriesSection = dynamic(
  () => import("@/app/(site)/home-sections/HomeCategoriesSection").then((m) => ({ default: m.HomeCategoriesSection })),
  { ssr: false }
);
const HomeActiveAuctionsSection = dynamic(
  () => import("@/app/(site)/home-sections/HomeActiveAuctionsSection").then((m) => ({ default: m.HomeActiveAuctionsSection })),
  { ssr: false }
);
const HomePlansSection = dynamic(
  () => import("@/app/(site)/home-sections/HomePlansSection").then((m) => ({ default: m.HomePlansSection })),
  { ssr: false }
);
const HomeNewsletterSection = dynamic(
  () => import("@/app/(site)/home-sections/HomeNewsletterSection").then((m) => ({ default: m.HomeNewsletterSection })),
  { ssr: false }
);
const HomeFabAndModals = dynamic(
  () => import("@/app/(site)/home-sections/HomeFabAndModals").then((m) => ({ default: m.HomeFabAndModals })),
  { ssr: false }
);

// Component to handle password reset token redirects (wrapped in Suspense)
function PasswordResetTokenHandler() {
  const searchParams = useSearchParams();
  const router = useRouter();

  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    const token = searchParams?.get('token') || searchParams?.get('token_hash');
    const type = searchParams?.get('type');
    const error = searchParams?.get('error');
    
    // If we have a recovery token, redirect to reset password page
    if (token && (type === 'recovery' || !type)) {
      const params = new URLSearchParams();
      params.set('token', token);
      if (type) params.set('type', type);
      router.push(`/auth/reset-password?${params.toString()}`);
      return;
    }
    
    // If there's an error from Supabase, redirect to reset password page with error
    if (error) {
      const errorParams = new URLSearchParams();
      const errorCode = searchParams?.get('error_code');
      const errorDescription = searchParams?.get('error_description');
      if (errorCode) errorParams.set('error_code', errorCode);
      if (errorDescription) errorParams.set('error_description', errorDescription);
      router.push(`/auth/reset-password?${errorParams.toString()}`);
      return;
    }
  }, [searchParams, router]);

  return null; // This component doesn't render anything
}

export type HomeClientPremiumItem = HomePremiumItem;

export type HomeClientProps = {
  /** When true, used as lazy content only: no header, no search bar, no mobile menu. */
  hideHeaderAndHero?: boolean;
  /** Premium listings fetched on server; rendered below "Executări și Insolvență" when provided. */
  premiumListings?: HomePremiumItem[] | null;
};

export default function Home(props: HomeClientProps) {
  const { hideHeaderAndHero = false, premiumListings = null } = props;
  const router = useRouter();
  const [isPageLoading, setIsPageLoading] = useState(true);
  const [mounted, setMounted] = useState(typeof window !== 'undefined');
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [searchAccessToken, setSearchAccessToken] = useState<string | null>(null);
  const [userInfo, setUserInfo] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    avatar: ''
  });
  const [userTokens, setUserTokens] = useState({
    balance: 0,
    totalEarned: 0,
    totalSpent: 0,
    level: 'Basic',
    package: 'Basic' as string
  });
  const [unlockedAuctions, setUnlockedAuctions] = useState<string[]>([]);
  const [favoriteAuctions, setFavoriteAuctions] = useState<string[]>([]);
  const [auctionNotifications, setAuctionNotifications] = useState<{[key: string]: {enabled: boolean, timeBefore: string}}>({});
  const [showAuthModal, setShowAuthModal] = useState(false);
  
  const [notificationPopup, setNotificationPopup] = useState({ show: false, message: '' });
  const [lockedNotificationAuctionId, setLockedNotificationAuctionId] = useState<string | null>(null);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [newsletterEmail, setNewsletterEmail] = useState('');
  const [newsletterSubscribed, setNewsletterSubscribed] = useState(false);
  const [newsletterLoading, setNewsletterLoading] = useState(false);
  const [showNewsletterForm, setShowNewsletterForm] = useState(false);
  const [newsletterFullName, setNewsletterFullName] = useState('');
  const [newsletterBirthDate, setNewsletterBirthDate] = useState('');
  const [newsletterAcceptTerms, setNewsletterAcceptTerms] = useState(false);
  const [logoError, setLogoError] = useState(false);
  const [realActiveAuctions, setRealActiveAuctions] = useState<any[]>([]);
  const [isLoadingActiveAuctions, setIsLoadingActiveAuctions] = useState(true);
  const [realPremiumAuctions, setRealPremiumAuctions] = useState<any[]>([]);
  const [isLoadingPremiumAuctions, setIsLoadingPremiumAuctions] = useState(true);
  const [countdownTick, setCountdownTick] = useState(0);

  // Buton floating draggable – poziție salvată în localStorage
  const FAB_SIZE = 64;
  const FAB_STORAGE_KEY = "gobid_floating_add_position";
  const [floatingButtonPos, setFloatingButtonPos] = useState<{ left: number; top: number } | null>(null);
  const floatingButtonRef = useRef<HTMLAnchorElement>(null);
  const dragStartRef = useRef<{ clientX: number; clientY: number; left: number; top: number } | null>(null);
  const didDragRef = useRef(false);
  const floatingPosRef = useRef<{ left: number; top: number } | null>(null);
  const authUnsubscribeRef = useRef<(() => void) | null>(null);

  const isBrowser = typeof window !== 'undefined';

  const safeStorage = {
    get(key: string) {
      if (!isBrowser) return null;
      try {
        return window.localStorage.getItem(key);
      } catch (error) {
        console.warn(`[localStorage] getItem failed for key "${key}"`, error);
        return null;
      }
    },
    set(key: string, value: string) {
      if (!isBrowser) return;
      try {
        window.localStorage.setItem(key, value);
      } catch (error) {
        console.warn(`[localStorage] setItem failed for key "${key}"`, error);
      }
    },
    remove(key: string) {
      if (!isBrowser) return;
      try {
        window.localStorage.removeItem(key);
      } catch (error) {
        console.warn(`[localStorage] removeItem failed for key "${key}"`, error);
      }
    },
  } as const;

  const safeParseJSON = <T,>(value: string | null, fallback: T): T => {
    if (!value) {
      return fallback;
    }
    try {
      return JSON.parse(value) as T;
    } catch (error) {
      console.warn('[JSON] parse failed', error);
      return fallback;
    }
  };



  // Fix hydration: set mounted after component mounts
  useEffect(() => {
    setMounted(true);
  }, []);

  // Load dark mode from localStorage
  useEffect(() => {
    if (!mounted) return;
    const saved = safeStorage.get('darkMode');
    if (saved !== null) {
      const darkModeValue = saved === 'true';
      setIsDarkMode(darkModeValue);
    }
  }, [mounted]);

  // Apply dark mode class to HTML element
  useEffect(() => {
    if (!mounted || !isBrowser) return;
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDarkMode, mounted]);

  // Încarcă poziția butonului floating din localStorage
  useEffect(() => {
    if (!isBrowser) return;
    const raw = safeStorage.get(FAB_STORAGE_KEY);
    const parsed = safeParseJSON<{ leftPercent: number; topPercent: number } | null>(raw, null);
    if (parsed && typeof parsed.leftPercent === 'number' && typeof parsed.topPercent === 'number') {
      const w = window.innerWidth;
      const h = window.innerHeight;
      const left = Math.max(0, Math.min(w - FAB_SIZE, parsed.leftPercent * w));
      const top = Math.max(0, Math.min(h - FAB_SIZE, parsed.topPercent * h));
      setFloatingButtonPos({ left, top });
    }
  }, []);

  // Tick pentru actualizare countdown pe carduri (Zile, Ore, Min, Sec)
  useEffect(() => {
    const iv = setInterval(() => setCountdownTick((t) => t + 1), 1000);
    return () => clearInterval(iv);
  }, []);

  const getFloatingButtonCurrentPos = (): { left: number; top: number } => {
    if (floatingButtonPos) return floatingButtonPos;
    if (floatingButtonRef.current && isBrowser) {
      const r = floatingButtonRef.current.getBoundingClientRect();
      return { left: r.left, top: r.top };
    }
    return {
      left: window.innerWidth - FAB_SIZE - 20,
      top: window.innerHeight - FAB_SIZE - 20,
    };
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
    const start = dragStartRef.current;
    const posToSave = floatingPosRef.current ?? floatingButtonPos;
    if (start && posToSave && isBrowser) {
      const leftPercent = posToSave.left / window.innerWidth;
      const topPercent = posToSave.top / window.innerHeight;
      safeStorage.set(FAB_STORAGE_KEY, JSON.stringify({ leftPercent, topPercent }));
    }
    // Navigate doar dacă interacțiunea A ÎNCEPUT pe butonul floating (start != null) și nu a fost un drag
    const wasFabClick = start !== null;
    const didDrag = didDragRef.current;
    dragStartRef.current = null;
    floatingPosRef.current = null;
    if (wasFabClick && !didDrag && typeof window !== 'undefined') {
      window.location.href = isLoggedIn ? '/dashboard' : '/auth';
    }
  };

  useEffect(() => {
    if (!isBrowser) return;
    const handleMouseMove = (e: MouseEvent) => onFloatingDragMove(e.clientX, e.clientY);
    const handleMouseUp = () => onFloatingDragEnd();
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  const toggleDarkMode = () => {
    const newMode = !isDarkMode;
    setIsDarkMode(newMode);
    safeStorage.set('darkMode', String(newMode));
  };

  // Page loading effect - removed artificial delay for faster loading
  useEffect(() => {
    setIsPageLoading(false);
  }, []);


  // Check if user is logged in
  useEffect(() => {
    const savedUserInfoRaw = safeStorage.get('userInfo');
    if (!savedUserInfoRaw) return;

    const parsed = safeParseJSON<typeof userInfo | null>(savedUserInfoRaw, null);
    if (parsed) {
      setUserInfo(parsed);
      setIsLoggedIn(true);
    }
  }, []);

  // Session token pentru sugestii personale (RO search)
  useEffect(() => {
    if (!isBrowser) return;
    import('@/lib/supabase').then(({ default: supabase }) => {
      supabase.auth.getSession().then(({ data }: { data: { session: Session | null } }) =>
        setSearchAccessToken(data.session?.access_token ?? null),
      );
      const { data: { subscription } } = supabase.auth.onAuthStateChange(
        (_event: AuthChangeEvent, session: Session | null) =>
          setSearchAccessToken(session?.access_token ?? null),
      );
      authUnsubscribeRef.current = () => subscription.unsubscribe();
    });
    return () => {
      authUnsubscribeRef.current?.();
      authUnsubscribeRef.current = null;
    };
  }, [isBrowser]);

  // Nu mai redirecționăm automat la dashboard – utilizatorul poate rămâne pe homepage și folosi butonul floating pentru dashboard

  // Load user data from localStorage
  useEffect(() => {
    const savedUserTokensRaw = safeStorage.get('userTokens');
    if (savedUserTokensRaw) {
      setUserTokens(
        safeParseJSON(savedUserTokensRaw, {
          balance: 0,
          totalEarned: 0,
          totalSpent: 0,
          level: 'Basic',
          package: 'Basic'
        })
      );
    } else {
      // NO default tokens - must be 0 if no record exists
      setUserTokens({
        balance: 0,
        totalEarned: 0,
        totalSpent: 0,
        level: 'Basic',
        package: 'Basic' as const,
      });
    }

    const savedUnlockedAuctions = safeStorage.get('unlockedAuctions');
    if (savedUnlockedAuctions) {
      setUnlockedAuctions(safeParseJSON(savedUnlockedAuctions, [] as string[]));
    }

    const savedFavoriteAuctions = safeStorage.get('favoriteAuctions');
    if (savedFavoriteAuctions) {
      setFavoriteAuctions(safeParseJSON(savedFavoriteAuctions, [] as string[]));
    }

    const savedAuctionNotifications = safeStorage.get('auctionNotifications');
    if (savedAuctionNotifications) {
      setAuctionNotifications(
        safeParseJSON(
          savedAuctionNotifications,
          {} as { [key: string]: { enabled: boolean; timeBefore: string } }
        )
      );
    }

    const userNotificationsKey = `notifications_${userInfo.email || 'default'}`;
    const userNotifications = safeStorage.get(userNotificationsKey);
    if (userNotifications) {
      setNotifications(safeParseJSON(userNotifications, [] as any[]));
    } else {
      const generalNotifications = safeStorage.get('notifications');
      if (generalNotifications) {
        setNotifications(safeParseJSON(generalNotifications, [] as any[]));
      }
    }
  }, [userInfo.email]);

  // Listen for storage changes
  useEffect(() => {
    const handleStorageChange = () => {
      const savedUserTokens = safeStorage.get('userTokens');
      if (savedUserTokens) {
        setUserTokens(
          safeParseJSON(savedUserTokens, {
            balance: 0,
            totalEarned: 0,
            totalSpent: 0,
            level: 'Basic',
            package: 'Basic'
          })
        );
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  const handleLogout = () => {
    safeStorage.remove('userInfo');
    setIsLoggedIn(false);
    setSearchAccessToken(null);
    setUserInfo({
      firstName: '',
      lastName: '',
      email: '',
      phone: '',
      avatar: ''
    });
  };

  // Auction functions
  const isAuctionUnlocked = (auctionId: string) => {
    return unlockedAuctions.includes(auctionId);
  };

  const isAuctionFavorite = (auctionId: string) => {
    return favoriteAuctions.includes(auctionId);
  };

  const handleUnlockAuction = async (auctionId: string) => {
    const supabaseModule = await import('@/lib/supabase');
    const supabase = supabaseModule.default;
    const { data: { session } } = await supabase.auth.getSession();
    const savedSupabaseUserId = typeof window !== 'undefined' ? localStorage.getItem('supabaseUserId') : null;
    const userId = session?.user?.id || savedSupabaseUserId;

    if (!userId || !session?.access_token) {
      const currentUrl = typeof window !== 'undefined' ? window.location.pathname + window.location.search : '/';
      const loginUrl = currentUrl ? `/auth?mode=login&redirect=${encodeURIComponent(currentUrl)}` : '/auth?mode=login';
      router.push(loginUrl);
      return;
    }

    if (userTokens.balance < 1) {
      return;
    }

    try {

      const newBalance = userTokens.balance - 1;
      const newTotalSpent = userTokens.totalSpent + 1;
      const newUnlockedAuctions = [...unlockedAuctions, auctionId];
      
      // Update tokens in Supabase
      const tokensResponse = await fetch('/api/tokens', {
        method: 'PUT',
        headers: {
          ...(session?.access_token ? { 'Authorization': `Bearer ${session.access_token}` } : {}),
          ...(userId && !session?.access_token ? { 'x-user-id': userId } : {}),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          balance: newBalance,
          totalEarned: userTokens.totalEarned,
          totalSpent: newTotalSpent,
          level: userTokens.level,
          package: userTokens.package || 'Basic'
        })
      });

      if (!tokensResponse.ok) {
        throw new Error('Failed to update tokens');
      }

      // Add unlocked auction to Supabase
      const unlockedResponse = await fetch('/api/user/unlocked-auctions', {
        method: 'POST',
        headers: {
          ...(session?.access_token ? { 'Authorization': `Bearer ${session.access_token}` } : {}),
          ...(userId && !session?.access_token ? { 'x-user-id': userId } : {}),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          auctionId
        })
      });

      if (!unlockedResponse.ok) {
        throw new Error('Failed to save unlocked auction');
      }

      // Update local state
      setUserTokens({
        ...userTokens,
        balance: newBalance,
        totalSpent: newTotalSpent
      });
      setUnlockedAuctions(newUnlockedAuctions);
      
      // Save to localStorage as cache (or primary if no Supabase)
      safeStorage.set('userTokens', JSON.stringify({
        ...userTokens,
        balance: newBalance,
        totalSpent: newTotalSpent
      }));
      safeStorage.set('unlockedAuctions', JSON.stringify(newUnlockedAuctions));
    } catch (error) {
      console.error('Error unlocking auction:', error);
    }
  };

  const handleToggleFavorite = (auctionId: string) => {
    const newFavoriteAuctions = favoriteAuctions.includes(auctionId)
      ? favoriteAuctions.filter(id => id !== auctionId)
      : [...favoriteAuctions, auctionId];
    
    setFavoriteAuctions(newFavoriteAuctions);
    safeStorage.set('favoriteAuctions', JSON.stringify(newFavoriteAuctions));
  };

  const handleToggleNotification = (auctionId: string, timeBefore: string) => {
    const currentNotifications = auctionNotifications[auctionId] || { enabled: false, timeBefore: '2h' };
    const newNotifications = {
      ...auctionNotifications,
      [auctionId]: {
        enabled: !currentNotifications.enabled,
        timeBefore: timeBefore
      }
    };
    
    setAuctionNotifications(newNotifications);
    safeStorage.set('auctionNotifications', JSON.stringify(newNotifications));
    
    // Add to centralized notification system
    const auctionTitles: {[key: string]: string} = {
      'auction-1': 'Vilă Modernă București',
      'auction-2': 'Ceas Rolex Submariner Original',
      'auction-3': 'Pictură Ulei Originală - Artist Român',
      'auction-4': 'BMW X5 2020'
    };
    
    const isEnabled = !currentNotifications.enabled;
    const message = isEnabled 
      ? `🔔 Notificare activată pentru "${auctionTitles[auctionId] || 'Licitație'}"` 
      : `🔕 Notificare dezactivată pentru "${auctionTitles[auctionId] || 'Licitație'}"`;
    
    // Add to localStorage notifications
    const existingNotifications = safeParseJSON(
      safeStorage.get('notifications'),
      [] as Array<{ id: string; message: string; type: string; timestamp: string; read: boolean }>
    );
    const newNotification = {
      id: Date.now().toString(),
      message,
      type: isEnabled ? 'success' : 'info',
      timestamp: new Date().toISOString(),
      read: false
    };
    const updatedNotifications = [newNotification, ...existingNotifications];
    safeStorage.set('notifications', JSON.stringify(updatedNotifications));
    
    // Show popup notification
    setNotificationPopup({ show: true, message });
    
    // Auto hide after 2 seconds
    setTimeout(() => {
      setNotificationPopup({ show: false, message: '' });
    }, 2000);
  };

  const isNotificationEnabled = (auctionId: string) => {
    return auctionNotifications[auctionId]?.enabled ?? false;
  };

  const getNotificationTime = (auctionId: string) => {
    return auctionNotifications[auctionId]?.timeBefore ?? '2h';
  };


  // Format time function
  const formatTime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    const formattedHours = hours > 0 ? `${hours.toString().padStart(2, '0')}:` : '';
    const formattedMinutes = minutes.toString().padStart(2, '0');
    const formattedSeconds = secs.toString().padStart(2, '0');

    return `${formattedHours}${formattedMinutes}:${formattedSeconds}`;
  };

  // Format time as "15h 2m" for card display
  const formatTimeRemaining = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  };

  // Helper function to extract first image from images array
  const pickImage = (images: unknown): string | null => {
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
  };

  // Helper function to calculate timer seconds from auction date
  const calculateTimerSeconds = (auctionDate?: string | null): number => {
    if (!auctionDate) return 24 * 3600; // Default 24 hours
    const end = new Date(auctionDate);
    if (Number.isNaN(end.getTime())) return 24 * 3600;
    const diff = end.getTime() - Date.now();
    if (diff <= 0) return 0;
    return Math.floor(diff / 1000);
  };

  // Același logic ca pe /ro: data efectivă pentru countdown (rolling, dată în trecut → +30 zile)
  const getEffectiveAuctionDateIso = (product: { auction_date?: string | null; custom_fields?: Record<string, unknown> | null }): string | undefined => {
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
        d = new Date(s.slice(0, 10) + 'T12:00:00');
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
  };

  // Homepage – secțiunea „Executări”: doar 4 LICITAȚII PUBLICE REALE (nu anunțuri cu preț fix).
  // Deferred until after idle to avoid blocking main thread during hydration (INP/LCP).
  useEffect(() => {
    if (realActiveAuctions.length > 0) {
      setIsLoadingActiveAuctions(false);
      return;
    }

    const loadLicitatiiPublice = async () => {
      try {
        const supabase = (await import('@/lib/supabase')).default;

        // TOATE produsele "Executări și Insolvență" au product_type='licitatii-publice' — indicator canonic
        // (vezi docs/PRODUSE_LIVE_BID_LICITATII_PUBLICE.md). Query simplu, indexabil, rezistent la timeouts.
        // Retry pe erori tranzitorii (503, 5xx, schema cache, upstream timeout).
        const isTransientSupabaseError = (err: unknown): boolean => {
          if (!err) return false;
          const e = err as { code?: string; status?: number; message?: string };
          if (e.status && e.status >= 500) return true;
          if (e.code === 'PGRST002') return true;
          const msg = String(e.message ?? '').toLowerCase();
          return (
            msg.includes('schema cache') ||
            msg.includes('upstream request timeout') ||
            msg.includes('service unavailable') ||
            msg.includes('econnreset') ||
            msg.includes('fetch failed')
          );
        };

        const MAX_RETRIES = 2;
        const RETRY_DELAY_MS = 600;
        type ProductRow = Record<string, unknown>;
        let productsData: ProductRow[] | null = null;
        let lastError: unknown = null;

        for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
          const { data, error } = await supabase
            .from('products')
            .select('id, title, slug, description, images, starting_price, currency, auction_date, is_premium, premium_until, city, county, address, user_id, created_at, custom_fields, category, subcategory, product_type, sale_type, channel')
            .eq('product_type', 'licitatii-publice')
            .eq('status', 'active')
            .order('created_at', { ascending: false })
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
          console.warn('[Home] Executări și Insolvență – Supabase indisponibil (status=' + (e.status ?? '?') + ', code=' + (e.code ?? '?') + ', msg=' + (e.message ?? '?') + '). Ascund secțiunea.');
          setRealActiveAuctions([]);
          setIsLoadingActiveAuctions(false);
          return;
        }

        if (process.env.NODE_ENV !== 'production') {
          console.log('[Home] Executări și Insolvență: fetched', productsData?.length ?? 0, 'candidate(s)');
        }

        if (!productsData || productsData.length === 0) {
          setRealActiveAuctions([]);
          setIsLoadingActiveAuctions(false);
          return;
        }

        const now = new Date();

        // 2) Excludem orice e marcat ca preț fix.
        const licitatiiPublice: any[] = [];
        for (const product of productsData) {
          const isFixedPrice = !!(product.custom_fields as Record<string, unknown> | null)?.is_fixed_price;
          if (isFixedPrice) continue;
          licitatiiPublice.push(product);
        }

        if (licitatiiPublice.length === 0) {
          if (process.env.NODE_ENV !== 'production') {
            console.log('[Home] Executări și Insolvență: all candidates excluded by is_fixed_price filter');
          }
          setRealActiveAuctions([]);
          setIsLoadingActiveAuctions(false);
          return;
        }

        // 3) 4 random din licitațiile publice (Fisher-Yates)
        const shuffled = [...licitatiiPublice];
        for (let i = shuffled.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        const cele4Licitatii = shuffled.slice(0, 4);

        // 4) Format pentru carduri – imaginea: poză reală sau imagine standard din categorie (nu harta)
        const formattedAuctions = cele4Licitatii.map((product: any) => {
          const image = getProductDisplayImage({
            images: product.images,
            category: product.category,
            subcategory: product.subcategory,
            main_category: (product.custom_fields as Record<string, unknown> | null)?.main_category ?? product.category,
          }) || '/no-image-placeholder.svg';
          const startingPrice = product.starting_price || 0;
          const currency = product.currency || 'RON';
          const priceFormatted = `${startingPrice.toLocaleString('ro-RO')} ${currency}`;
          
          const locationParts = [
            product.city,
            product.county,
            product.address
          ].filter(Boolean);
          const location = locationParts.length > 0 ? locationParts.join(', ') : 'Locatie neprecizată';

          const effectiveDateIso = getEffectiveAuctionDateIso(product);
          const timerSeconds = calculateTimerSeconds(effectiveDateIso ?? product.auction_date);
          const isExclusive = product.is_premium === true && product.premium_until && new Date(product.premium_until) > now;

          return {
            id: product.id,
            title: product.title || 'Fără titlu',
            description: product.description || '',
            image: image,
            timerSeconds: timerSeconds,
            auctionDate: effectiveDateIso ?? product.auction_date,
            price: priceFormatted,
            location: location,
            address: product.address || product.city || null,
            coordinates: product.coordinates || null,
            seller: 'Organizator licitație',
            participants: `${Math.floor(Math.random() * 30) + 5} participanți`,
            tokenCost: 1,
            notificationTime: '2h',
            isExclusive,
            url: `/licitatii-publice/${product.slug ?? product.id}`,
            slug: product.slug ?? product.id,
            metrics: {
              watchers: `${Math.floor(Math.random() * 200) + 50} urmăritori`,
              bids: `${Math.floor(Math.random() * 50) + 10} oferte active`
            }
          };
        });

        setRealActiveAuctions(formattedAuctions);
      } catch (error) {
        console.error('[Home] Error loading active auctions:', error);
      } finally {
        setIsLoadingActiveAuctions(false);
      }
    };

    const run = () => loadLicitatiiPublice();
    if (typeof requestIdleCallback !== "undefined") {
      const id = requestIdleCallback(run, { timeout: 2000 });
      return () => cancelIdleCallback(id);
    }
    run();
  }, []);

  // Homepage – secțiunea „Licitații Premium”: 4 produse platite (is_premium, premium_until > now).
  // Deferred until after idle to reduce main-thread work during hydration.
  useEffect(() => {
    const loadPremiumAuctions = async () => {
      try {
        const supabase = (await import('@/lib/supabase')).default;
        const now = new Date().toISOString();

        const { data: productsData, error } = await supabase
          .from('products')
          .select('id, title, slug, description, images, starting_price, currency, auction_date, is_premium, premium_until, city, county, address, auction_location, product_location, created_at, custom_fields, product_type, category, subcategory, brand')
          .eq('status', 'active')
          .eq('is_premium', true)
          .gte('premium_until', now)
          .order('created_at', { ascending: false })
          .limit(4);

        if (error) {
          console.error('[Home] Licitații premium – eroare Supabase:', error?.message ?? error);
          setRealPremiumAuctions([]);
          setIsLoadingPremiumAuctions(false);
          return;
        }

        if (!productsData || productsData.length === 0) {
          setRealPremiumAuctions([]);
          setIsLoadingPremiumAuctions(false);
          return;
        }

        const formatted = productsData.map((product: any) => {
          const cf = product.custom_fields && typeof product.custom_fields === 'object' ? (product.custom_fields as Record<string, unknown>) : {};
          const image = pickImage(product.images) || '/no-image-placeholder.svg';
          const startingPrice = product.starting_price || 0;
          const currency = product.currency || 'RON';
          const priceFormatted = `${startingPrice.toLocaleString('ro-RO')} ${currency}`;
          // Locație – exact ca pe /ro: auction_location || address || city || 'București'
          const locFromCf = [cf.auction_location, cf.address, cf.city].find((v: unknown) => typeof v === 'string' && String(v).trim());
          const location = product.auction_location || product.address || product.city || (typeof locFromCf === 'string' ? String(locFromCf).trim() : '') || product.county || 'București';
          const timerSeconds = calculateTimerSeconds(product.auction_date);
          const slug = product.slug ?? cf.slug ?? product.id;
          const isLicitatiePublica = product.product_type === 'licitatii-publice';
          const url = isLicitatiePublica ? `/licitatii-publice/${slug}` : `/live_bid/${slug}`;

          const condition = product.condition ?? cf.condition;
          const conditionStr = condition != null ? String(condition).trim() : '';
          // Același fallback ca pe /ro: condition || 'Nouă' ca produsele să apară "Nou" când nu e setat
          const conditionForDisplay = conditionStr || 'Nouă';

          return {
            id: product.id,
            title: product.title || 'Fără titlu',
            description: product.description || '',
            image,
            timerSeconds,
            auctionDate: product.auction_date,
            price: priceFormatted,
            location,
            condition: conditionForDisplay,
            createdAt: product.created_at || null,
            address: product.address || product.city || null,
            coordinates: product.coordinates || null,
            seller: 'Organizator licitație',
            participants: `${Math.floor(Math.random() * 30) + 5} participanți`,
            tokenCost: 1,
            notificationTime: '2h',
            isExclusive: true,
            url,
            slug,
            category: product.category ?? null,
            subcategory: product.subcategory ?? null,
            brand: typeof product.brand === 'string' ? product.brand : null,
            custom_fields:
              cf && typeof cf === 'object' ? (cf as Record<string, unknown>) : null,
            metrics: {
              watchers: `${Math.floor(Math.random() * 200) + 50} urmăritori`,
              bids: `${Math.floor(Math.random() * 50) + 10} oferte active`
            }
          };
        });

        setRealPremiumAuctions(formatted);
      } catch (error) {
        console.error('[Home] Error loading premium auctions:', error);
        setRealPremiumAuctions([]);
      } finally {
        setIsLoadingPremiumAuctions(false);
      }
    };

    const run = () => loadPremiumAuctions();
    if (typeof requestIdleCallback !== "undefined") {
      const id = requestIdleCallback(run, { timeout: 2000 });
      return () => cancelIdleCallback(id);
    }
    run();
  }, []);

  // Secțiunea "Executări și Insolvență" afișează DOAR anunțuri reale.
  // Fără fallback mock — dacă nu există anunțuri reale, secțiunea se ascunde (vezi render-ul HomeActiveAuctionsSection).
  const activeAuctions = realActiveAuctions;

  const lockedAuctionDetails = lockedNotificationAuctionId
    ? activeAuctions.find((auction) => auction.id === lockedNotificationAuctionId)
    : null;

  const handleNewsletterSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    // Validare
    if (!newsletterFullName.trim()) {
      setNotificationPopup({ show: true, message: 'Te rog introdu numele complet!' });
      setTimeout(() => setNotificationPopup({ show: false, message: '' }), 3000);
      return;
    }

    if (!newsletterEmail || !newsletterEmail.includes('@')) {
      setNotificationPopup({ show: true, message: 'Te rog introdu o adresă de email validă!' });
      setTimeout(() => setNotificationPopup({ show: false, message: '' }), 3000);
      return;
    }

    if (!newsletterAcceptTerms) {
      setNotificationPopup({ show: true, message: 'Trebuie să accepți Termenii și Condițiile!' });
      setTimeout(() => setNotificationPopup({ show: false, message: '' }), 3000);
      return;
    }

    setNewsletterLoading(true);

    try {
      // Call API to subscribe
      const response = await fetch('/api/newsletter/subscribe', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: newsletterEmail,
          name: newsletterFullName.trim(),
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || 'Eroare la abonare');
      }

      setNewsletterSubscribed(true);
      setNewsletterEmail('');
      setNewsletterFullName('');
      setNewsletterBirthDate('');
      setNewsletterAcceptTerms(false);
      setShowNewsletterForm(false);
      setNotificationPopup({ show: true, message: data.message || 'Te-ai abonat cu succes! Verifică email-ul pentru codul tău de 5 tokeni.' });
      setTimeout(() => setNotificationPopup({ show: false, message: '' }), 5000);
    } catch (error: any) {
      console.error('Error subscribing to newsletter:', error);
      setNotificationPopup({ show: true, message: error.message || 'Eroare la abonare. Te rog încearcă din nou.' });
      setTimeout(() => setNotificationPopup({ show: false, message: '' }), 3000);
    } finally {
      setNewsletterLoading(false);
    }
  };


  // Simple timer display
  const SimpleTimer = ({ time, color }: { time: string, color: string }) => {
    return (
      <div className={`text-2xl font-bold font-mono ${color} tracking-wider`}>
        {time}
      </div>
    );
  };

  // Don't render homepage sections until we're on the client to avoid hydration mismatches from client-only state (theme, timers, Supabase data).
  // Note: mounted is now set to true immediately on client side to prevent white screen

  return (
    <>
      <Suspense fallback={null}>
        <PasswordResetTokenHandler />
      </Suspense>
      <div className={`min-h-screen transition-all duration-300 pb-24 md:pb-0 ${
        isDarkMode 
          ? 'bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900' 
          : 'bg-gradient-to-br from-gray-50 via-white to-gray-50'
      }`} suppressHydrationWarning>
      {/* Page Loading - Show skeleton instead of spinner */}

      {/* Notification Popup */}
      {notificationPopup.show && (
        <div className={`fixed inset-x-0 top-20 z-[60] mx-auto w-full max-w-sm rounded-2xl p-4 text-sm font-medium shadow-2xl ring-1 backdrop-blur lg:top-24 ${
          isDarkMode 
            ? 'ring-black/10' 
            : 'bg-white/95 ring-gray-200'
        }`}>
          <div className={`flex items-center gap-3 ${
            isDarkMode ? 'text-gray-800' : 'text-gray-900'
          }`}>
            <NotificationIcon size="m" className="text-blue-500" />
            <span>{notificationPopup.message}</span>
          </div>
        </div>
      )}

      {lockedAuctionDetails && (
        <div className={`fixed inset-0 z-[65] flex items-center justify-center backdrop-blur-sm px-4 ${
          isDarkMode ? 'bg-black/70' : 'bg-gray-900/50'
        }`}>
          <div className={`relative w-full max-w-md rounded-3xl border p-6 text-center shadow-2xl transition-all duration-300 ${
            isDarkMode 
              ? 'border-white/15 bg-gray-800/90 text-white' 
              : 'border-gray-200 bg-white text-gray-900'
          }`}>
            <button
              type="button"
              onClick={() => setLockedNotificationAuctionId(null)}
              className={`absolute right-4 top-4 rounded-full p-2 transition ${
                isDarkMode 
                  ? 'bg-white/20 text-white hover:bg-white/30' 
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
              aria-label="Închide"
            >
              <i className="ri-close-line text-lg"></i>
            </button>
            <div
              className={`mx-auto mb-4 h-20 w-32 overflow-hidden rounded-2xl border shadow-lg ${
                isDarkMode ? 'border-white/20' : 'border-gray-200'
              }`}
              style={{ backgroundImage: `url('${lockedAuctionDetails.image}')`, backgroundSize: 'cover', backgroundPosition: 'center' }}
            />
            <h3 className="mb-1 text-lg font-semibold">Deblochează pentru alerte</h3>
            <p className={`text-sm ${
              isDarkMode ? 'text-white/80' : 'text-gray-600'
            }`}>
              Pentru a activa notificările pentru <span className="font-semibold">{lockedAuctionDetails.title}</span>, deblochează licitația folosind tokenii disponibili.
            </p>
            <div className="mt-5 flex flex-col gap-3">
              <button
                type="button"
                onClick={() => {
                  handleUnlockAuction(lockedAuctionDetails.id);
                  setLockedNotificationAuctionId(null);
                }}
                className={`w-full rounded-full py-2 text-sm font-semibold uppercase tracking-wide shadow-xl hover:shadow-2xl transform hover:scale-[1.02] active:scale-[0.98] transition-all duration-300 relative overflow-hidden group ${
                  isDarkMode 
                    ? 'bg-gradient-to-r from-yellow-500 via-yellow-600 to-yellow-500 hover:from-yellow-600 hover:via-yellow-700 hover:to-yellow-600 text-gray-900' 
                    : 'bg-gradient-to-r from-yellow-500 via-yellow-600 to-yellow-500 hover:from-yellow-600 hover:via-yellow-700 hover:to-yellow-600 text-gray-900'
                }`}
              >
                <span className="relative z-10">Deblochează licitația</span>
                <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/20 to-white/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000"></div>
              </button>
              <button
                type="button"
                onClick={() => setLockedNotificationAuctionId(null)}
                className={`w-full rounded-full border py-2 text-sm font-semibold uppercase tracking-wide transition-all duration-300 shadow-sm hover:shadow-md transform hover:scale-[1.02] active:scale-[0.98] ${
                  isDarkMode 
                    ? 'border-white/50 text-white/80 hover:bg-white/10 backdrop-blur-sm' 
                    : 'border-gray-300 text-gray-700 hover:bg-gray-50 backdrop-blur-sm'
                }`}
              >
                Renunță
              </button>
            </div>
          </div>
        </div>
      )}

      {!hideHeaderAndHero && (
        <>
          <UniversalHeader 
            isDarkMode={isDarkMode}
            onToggleDarkMode={toggleDarkMode}
          />
          <div className="md:hidden w-full px-3 py-2">
            <div className="flex justify-center">
              <HeroSearchBar isDarkMode={isDarkMode} variant="standalone" className="w-full max-w-lg" useRoSuggestions accessToken={searchAccessToken} />
            </div>
          </div>
          {isMobileMenuOpen && typeof document !== 'undefined' && createPortal(
            <div className={`md:hidden fixed top-0 left-0 z-[99999] w-80 max-h-[100vh] overflow-y-auto shadow-xl border-r border-gray-200 ${isDarkMode ? '' : 'bg-white'}`}>
            <div className="flex flex-col h-full min-h-0">
              {/* Header */}
              <div className={`flex items-center justify-between p-4 border-b transition-colors duration-300 ${
                isDarkMode ? 'border-gray-600' : 'border-gray-200'
              }`}>
                <div className="flex items-center space-x-3">
                  <h2 className={`text-lg font-semibold transition-colors duration-300 ${
                    isDarkMode ? 'text-white' : 'text-gray-900'
                  }`}>
                    Meniu
                  </h2>
                  {/* Dark Mode Toggle - Inline with title */}
                  <div className="flex items-center space-x-2">
                    <button
                      type="button"
                      onClick={() => setIsDarkMode(!isDarkMode)}
                      className={`relative inline-flex h-6 w-12 items-center rounded-full transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 shadow-lg ${
                        isDarkMode ? 'bg-blue-600' : 'bg-gray-200'
                      }`}
                      title={isDarkMode ? 'Comută la mod luminos' : 'Comută la mod întunecat'}
                      aria-label={isDarkMode ? 'Comută la mod luminos' : 'Comută la mod întunecat'}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform duration-300 shadow-md ${
                          isDarkMode ? 'translate-x-6' : 'translate-x-1'
                        }`}
                      />
                      <div className="absolute inset-0 flex items-center justify-between px-1">
                        <span className={`text-xs font-medium transition-opacity duration-300 ${
                          isDarkMode ? 'opacity-0' : 'opacity-100 text-gray-600'
                        }`}>
                          ☀️
                        </span>
                        <span className={`text-xs font-medium transition-opacity duration-300 ${
                          isDarkMode ? 'opacity-100' : 'opacity-0 text-white'
                        }`}>
                          🌙
                        </span>
                      </div>
                    </button>
                    <span className={`text-xs font-medium transition-all duration-300 ${
                      isDarkMode ? 'text-white' : 'text-gray-700'
                    }`}>
                      {isDarkMode ? 'Mod Noapte Activ' : 'Mod Zi Activ'}
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsMobileMenuOpen(false)}
                  className={`p-3 min-w-[48px] min-h-[48px] rounded-lg transition-all duration-300 flex items-center justify-center ${
                    isDarkMode 
                      ? '' 
                      : ''
                  }`}
                  aria-label="Închide meniul"
                >
                  <span className={`text-xl transition-colors duration-300 ${
                    isDarkMode ? 'text-white' : 'text-gray-900'
                  }`}>
                    ×
                  </span>
                </button>
              </div>

              {/* Navigation Links */}
              <div className="flex-1 p-4 space-y-2 overflow-y-auto min-h-0">
                <a
                  href="/"
                  className={`flex items-center space-x-3 p-3 rounded-lg transition-all duration-300 shadow-lg hover:shadow-xl transform hover:scale-105 ${
                    isDarkMode 
                      ? 'text-gray-300 hover:text-yellow-400' 
                      : 'text-gray-700 hover:text-yellow-500'
                  }`}
                  onClick={() => setIsMobileMenuOpen(false)}
                >
                  <span className="text-lg">🏠</span>
                  <span>Homepage</span>
                </a>
                
                <a
                  href="/ro"
                  className={`flex items-center space-x-3 p-3 rounded-lg transition-all duration-300 shadow-lg hover:shadow-xl transform hover:scale-105 ${
                    isDarkMode 
                      ? 'text-gray-300 hover:text-yellow-400' 
                      : 'text-gray-700 hover:text-yellow-500'
                  }`}
                  onClick={() => setIsMobileMenuOpen(false)}
                >
                  <span className="text-lg">🔨</span>
                  <span>Licitatii</span>
                </a>
                
                {isLoggedIn ? (
                  <>
                    
                    <a
                      href="/favorites"
                      className={`flex items-center space-x-3 p-3 rounded-lg transition-all duration-300 shadow-lg hover:shadow-xl transform hover:scale-105 ${
                        isDarkMode 
                          ? 'text-gray-300 hover:bg-gray-700 hover:text-yellow-400' 
                          : 'text-gray-700 hover:bg-gray-100 hover:text-yellow-500'
                      }`}
                      onClick={() => setIsMobileMenuOpen(false)}
                    >
                      <span className="text-lg">❤️</span>
                      <span>Favorite</span>
                    </a>
                    
                    <a
                      href="/dashboard/settings"
                      className={`flex items-center space-x-3 p-3 rounded-lg transition-all duration-300 shadow-lg hover:shadow-xl transform hover:scale-105 ${
                        isDarkMode 
                          ? 'text-gray-300 hover:bg-gray-700 hover:text-yellow-400' 
                          : 'text-gray-700 hover:bg-gray-100 hover:text-yellow-500'
                      }`}
                      onClick={() => setIsMobileMenuOpen(false)}
                    >
                      <span className="text-lg">⚙️</span>
                      <span>Setări</span>
                    </a>
                    
                    <a
                      href="/dashboard/tokens"
                      className={`flex items-center space-x-3 p-3 rounded-lg transition-all duration-300 shadow-lg hover:shadow-xl transform hover:scale-105 ${
                        isDarkMode 
                          ? 'text-gray-300 hover:bg-gray-700 hover:text-yellow-400' 
                          : 'text-gray-700 hover:bg-gray-100 hover:text-yellow-500'
                      }`}
                      onClick={() => setIsMobileMenuOpen(false)}
                    >
                      <span className="text-lg">💰</span>
                      <span>Token-uri</span>
                    </a>
                    
                    <a
                      href="/dashboard/payments"
                      className={`flex items-center space-x-3 p-3 rounded-lg transition-all duration-300 shadow-lg hover:shadow-xl transform hover:scale-105 ${
                        isDarkMode 
                          ? 'text-gray-300 hover:bg-gray-700 hover:text-yellow-400' 
                          : 'text-gray-700 hover:bg-gray-100 hover:text-yellow-500'
                      }`}
                      onClick={() => setIsMobileMenuOpen(false)}
                    >
                      <span className="text-lg">💳</span>
                      <span>Plăți</span>
                    </a>
                    
                    <a
                      href="/dashboard/support"
                      className={`flex items-center space-x-3 p-3 rounded-lg transition-all duration-300 shadow-lg hover:shadow-xl transform hover:scale-105 ${
                        isDarkMode 
                          ? 'text-gray-300 hover:bg-gray-700 hover:text-yellow-400' 
                          : 'text-gray-700 hover:bg-gray-100 hover:text-yellow-500'
                      }`}
                      onClick={() => setIsMobileMenuOpen(false)}
                    >
                      <span className="text-lg">🎫</span>
                      <span>Suport</span>
                    </a>
                  </>
                ) : (
                  <>
                    <a
                      href="/auth?mode=register"
                      className={`flex items-center space-x-3 p-3 rounded-lg transition-all duration-300 shadow-lg hover:shadow-xl transform hover:scale-105 ${
                        isDarkMode 
                          ? 'text-gray-300 hover:bg-gray-700 hover:text-yellow-400' 
                          : 'text-gray-700 hover:bg-gray-100 hover:text-yellow-500'
                      }`}
                      onClick={() => setIsMobileMenuOpen(false)}
                    >
                      <span className="text-lg">📝</span>
                      <span>Înregistrare</span>
                    </a>
                    
                    <a
                      href="/auth?mode=login"
                      className={`flex items-center space-x-3 p-3 rounded-lg transition-all duration-300 shadow-lg hover:shadow-xl transform hover:scale-105 ${
                        isDarkMode 
                          ? 'text-gray-300 hover:bg-gray-700 hover:text-yellow-400' 
                          : 'text-gray-700 hover:bg-gray-100 hover:text-yellow-500'
                      }`}
                      onClick={() => setIsMobileMenuOpen(false)}
                    >
                      <span className="text-lg">🔑</span>
                      <span>Autentificare</span>
                    </a>
                  </>
                )}
              </div>

              {/* Logout Button - Bottom (only if logged in) */}
              {isLoggedIn && (
                <div className={`p-4 border-t transition-colors duration-300 ${
                  isDarkMode ? 'border-gray-600' : 'border-gray-200'
                }`}>
                  <button
                    onClick={() => {
                      handleLogout();
                      setIsMobileMenuOpen(false);
                    }}
                    className={`w-full flex items-center justify-center space-x-2 p-3 rounded-xl transition-all duration-300 shadow-xl hover:shadow-2xl transform hover:scale-[1.02] active:scale-[0.98] relative overflow-hidden group ${
                      isDarkMode 
                        ? 'bg-gradient-to-r from-red-600 via-red-500 to-red-600 hover:from-red-700 hover:via-red-600 hover:to-red-700 text-white' 
                        : 'bg-gradient-to-r from-red-100 via-red-50 to-red-100 hover:from-red-200 hover:via-red-100 hover:to-red-200 text-red-600'
                    }`}
                  >
                    <span className="text-lg relative z-10">🚪</span>
                    <span className="relative z-10">Ieșire</span>
                    <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/20 to-white/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000"></div>
                  </button>
                </div>
              )}
            </div>
        </div>
      , document.body)}
        </>
      )}

      <main id="main-content" role="main">
      {/* Hero is server-rendered in page.tsx (HomeHero) for LCP. No client Slider in initial bundle. */}

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

      {premiumListings && premiumListings.length > 0 && (
        <section className="pt-0 sm:pt-1 md:pt-2 pb-8 sm:pb-12 md:pb-16 bg-gray-50/50 dark:bg-transparent">
          <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
            <div className="text-left mb-4 sm:mb-8 md:mb-12">
              <h2 className="text-xl sm:text-2xl md:text-4xl font-bold bg-gradient-to-r from-gray-900 via-gray-800 to-gray-900 dark:from-white dark:via-gray-100 dark:to-gray-200 bg-clip-text text-transparent">
                Licitații Premium
              </h2>
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 px-1 md:px-0 md:gap-2 lg:gap-3">
              {premiumListings.slice(0, 4).map((auction) => (
                <Link
                  key={auction.id}
                  href={auction.url}
                  className="group backdrop-blur-lg rounded-xl shadow-xl overflow-hidden transition-all duration-300 border hover:shadow-2xl bg-white dark:bg-white/10 border-gray-200 dark:border-white/20"
                >
                  <div className="relative h-48 md:h-64 border border-white dark:border-gray-600">
                    <Image
                      src={auction.image}
                      alt=""
                      fill
                      sizes="(max-width: 768px) 50vw, 25vw"
                      className="object-cover object-center"
                      loading="lazy"
                    />
                    <div className="absolute top-1 left-1 md:top-2 md:left-2 flex flex-col gap-1">
                      <PieseAutoMarcaInlineSpan listing={auction} />
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-extrabold tracking-wide text-white shadow-lg border border-yellow-300/50 bg-gradient-to-r from-yellow-500 via-amber-500 to-orange-500">
                        PREMIUM
                      </span>
                    </div>
                  </div>
                  <div className="p-2 sm:p-3">
                    <h3 className="text-xs sm:text-sm md:text-base font-semibold line-clamp-2 text-black dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400">
                      {auction.title}
                    </h3>
                    <p className="mt-0.5 sm:mt-1 text-[10px] sm:text-xs text-gray-600 dark:text-gray-400 truncate">
                      {auction.location}
                    </p>
                    <p className="mt-0.5 sm:mt-1 text-[10px] sm:text-xs md:text-sm font-semibold text-gray-900 dark:text-white">
                      {auction.price}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      {!hideHeaderAndHero && (
        <section className={`pt-0 sm:pt-1 md:pt-2 pb-8 sm:pb-12 md:pb-16 ${
          isDarkMode ? '' : 'bg-gray-50/50'
        }`}>
          <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
            <div className="text-left mb-4 sm:mb-8 md:mb-12">
              <div className="flex items-center justify-start gap-2 sm:gap-4 mb-2 sm:mb-4">
                <h2
                  className={`text-xl sm:text-2xl md:text-4xl font-bold transition-colors duration-300 ${
                    isDarkMode
                      ? 'bg-gradient-to-r from-white via-gray-100 to-gray-200 bg-clip-text text-transparent'
                      : 'bg-gradient-to-r from-gray-900 via-gray-800 to-gray-900 bg-clip-text text-transparent'
                  }`}
                >
                  Licitații Premium
                </h2>
              </div>
            </div>
            {(isPageLoading || isLoadingPremiumAuctions) ? (
              <AuctionListSkeleton count={4} viewMode="grid" isDarkMode={isDarkMode} />
            ) : (
              <PremiumListings
                auctions={realPremiumAuctions}
                isDarkMode={isDarkMode}
                isFavorite={isAuctionFavorite}
                onToggleFavorite={handleToggleFavorite}
              />
            )}
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

      {/* Footer – compact pe mobil */}
      <footer className={`mt-8 sm:mt-12 md:mt-16 py-4 sm:py-6 md:py-8 border-t transition-all duration-300 ${
        isDarkMode 
          ? 'border-white/10' 
          : 'border-gray-300'
      }`}>
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
          {/* First Row - Menu */}
          <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 lg:gap-8 mb-4 sm:mb-6">
            {/* Company Info - First Column */}
            <div className="col-span-2 sm:col-span-2 lg:col-span-2">
              {/* Logo stânga, iconițe sociale dreapta – același rând */}
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
                      style={{ maxHeight: '32px' }}
                      onError={() => setLogoError(true)}
                    />
                  ) : (
                    <div className="w-6 h-6 sm:w-8 sm:h-8 bg-gradient-to-r from-blue-600 to-gray-600 rounded-lg flex items-center justify-center shadow-lg">
                      <i className="ri-diamond-fill text-white text-sm sm:text-lg" />
                    </div>
                  )}
                </div>
                <div className="flex gap-2 sm:gap-4 flex-shrink-0">
                  <a href="https://www.facebook.com/gobid.ro" target="_blank" rel="noopener noreferrer" className={`min-w-[48px] min-h-[48px] w-10 h-10 sm:w-11 sm:h-11 md:w-12 md:h-12 backdrop-blur-sm rounded-lg flex items-center justify-center transition-all duration-300 ${
                    isDarkMode 
                      ? 'bg-white/10 hover:bg-white/20' 
                      : 'bg-gray-100 hover:bg-gray-200'
                  }`} aria-label="Facebook gobid.ro">
                    <i className="ri-facebook-fill text-blue-500 text-sm sm:text-base" aria-hidden></i>
                  </a>
                  <a href="https://twitter.com/gobid_ro" target="_blank" rel="noopener noreferrer" className={`min-w-[48px] min-h-[48px] w-10 h-10 sm:w-11 sm:h-11 md:w-12 md:h-12 backdrop-blur-sm rounded-lg flex items-center justify-center transition-all duration-300 ${
                    isDarkMode 
                      ? 'bg-white/10 hover:bg-white/20' 
                      : 'bg-gray-100 hover:bg-gray-200'
                  }`} aria-label="Twitter gobid.ro">
                    <i className="ri-twitter-fill text-blue-500 text-sm sm:text-base" aria-hidden></i>
                  </a>
                  <a href="https://www.linkedin.com/company/gobid-ro" target="_blank" rel="noopener noreferrer" className={`min-w-[48px] min-h-[48px] w-10 h-10 sm:w-11 sm:h-11 md:w-12 md:h-12 backdrop-blur-sm rounded-lg flex items-center justify-center transition-all duration-300 ${
                    isDarkMode 
                      ? 'bg-white/10 hover:bg-white/20' 
                      : 'bg-gray-100 hover:bg-gray-200'
                  }`} aria-label="LinkedIn gobid.ro">
                    <i className="ri-linkedin-fill text-blue-600 text-sm sm:text-base" aria-hidden></i>
                  </a>
                  <a href="https://www.instagram.com/gobid.ro" target="_blank" rel="noopener noreferrer" className={`min-w-[48px] min-h-[48px] w-10 h-10 sm:w-11 sm:h-11 md:w-12 md:h-12 backdrop-blur-sm rounded-lg flex items-center justify-center transition-all duration-300 ${
                    isDarkMode 
                      ? 'bg-white/10 hover:bg-white/20' 
                      : 'bg-gray-100 hover:bg-gray-200'
                  }`} aria-label="Instagram gobid.ro">
                    <i className="ri-instagram-fill text-pink-500 text-sm sm:text-base" aria-hidden></i>
                  </a>
                </div>
              </div>
              <p className={`text-xs sm:text-sm mb-0 max-w-md leading-snug sm:leading-relaxed transition-colors duration-300 ${
                isDarkMode ? 'text-gray-300' : 'text-gray-700'
              }`}>
                Platforma ta de încredere pentru licitații online. Conectăm cumpărătorii cu vânzătorii într-un mediu sigur și transparent. O platformă 100% românească.
              </p>
              <div className="mt-2 hidden md:flex items-center gap-2">
                <span className={`flex items-center gap-1 text-xs sm:text-sm transition-colors duration-300 ${
                  isDarkMode ? 'text-gray-300' : 'text-gray-700'
                }`}>
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
                    className={`w-auto ${isDarkMode ? 'brightness-0 invert' : ''}`}
                    style={{ height: 14 }}
                  />
                </a>
              </div>
            </div>

            {/* Pagini utile - Second Column */}
            <div>
              <h4 className={`font-semibold mb-2 sm:mb-3 text-xs sm:text-sm md:text-base transition-colors duration-300 ${
                isDarkMode ? 'text-white' : 'text-gray-900'
              }`}>
                Pagini utile
              </h4>
              <ul className="space-y-0.5 sm:space-y-1">
                <li><a href="/credit-ipotecar-inteligent" className={`transition-colors text-xs sm:text-sm ${
                  isDarkMode ? 'text-gray-300 hover:text-yellow-400' : 'text-gray-700 hover:text-yellow-500'
                }`}>
                  Calculator Inteligent Credit Ipotecar
                </a></li>
              </ul>
            </div>

            {/* Support - Third Column */}
            <div>
              <h4 className={`font-semibold mb-2 sm:mb-3 text-xs sm:text-sm md:text-base transition-colors duration-300 ${
                isDarkMode ? 'text-white' : 'text-gray-900'
              }`}>
                Suport
              </h4>
              <ul className="space-y-0.5 sm:space-y-1">
                <li><a href="/despre-noi" className={`transition-colors text-xs sm:text-sm ${
                  isDarkMode ? 'text-gray-300 hover:text-yellow-400' : 'text-gray-700 hover:text-yellow-500'
                }`}>
                  Despre GoBid.ro
                </a></li>
                <li><a href="/contact" className={`transition-colors text-xs sm:text-sm ${
                  isDarkMode ? 'text-gray-300 hover:text-yellow-400' : 'text-gray-700 hover:text-yellow-500'
                }`}>
                  Contact
                </a></li>
                <li><a href="/legal/termeni-si-conditii" className={`transition-colors text-xs sm:text-sm ${
                  isDarkMode ? 'text-gray-300 hover:text-yellow-400' : 'text-gray-700 hover:text-yellow-500'
                }`}>
                  Termeni și Condiții
                </a></li>
                <li><a href="/legal/politica-confidentialitate" className={`transition-colors text-xs sm:text-sm ${
                  isDarkMode ? 'text-gray-300 hover:text-yellow-400' : 'text-gray-700 hover:text-yellow-500'
                }`}>
                  Politica de Confidențialitate
                </a></li>
                <li><a href="/legal/politica-cookies" className={`transition-colors text-xs sm:text-sm ${
                  isDarkMode ? 'text-gray-300 hover:text-yellow-400' : 'text-gray-700 hover:text-yellow-500'
                }`}>
                  Politica Cookie-uri
                </a></li>
                <li><a href="/legal/date-identificare" className={`transition-colors text-xs sm:text-sm ${
                  isDarkMode ? 'text-gray-300 hover:text-yellow-400' : 'text-gray-700 hover:text-yellow-500'
                }`}>
                  Date de identificare
                </a></li>
                <li><a href="/legal" className={`transition-colors text-xs sm:text-sm ${
                  isDarkMode ? 'text-gray-300 hover:text-yellow-400' : 'text-gray-700 hover:text-yellow-500'
                }`}>
                  Toate documentele legale
                </a></li>
              </ul>
            </div>
          </div>

          {/* Second Row - Metode de plată + ANPC – compact pe mobil */}
          <div className={`border-t pt-2 sm:pt-4 md:pt-6 transition-all duration-300 ${
            isDarkMode ? 'border-white/10' : 'border-gray-300'
          }`}>
            <div className="flex flex-col md:flex-row md:items-center md:justify-between md:gap-4 lg:gap-6 gap-2 sm:gap-3">
              <div className="flex flex-col md:flex-row md:items-center md:gap-4 lg:gap-6 flex-1 gap-2 sm:gap-3">
                {/* Metode de plată: Netopia (card) */}
                <div className="flex flex-wrap items-center justify-center md:justify-start gap-1 sm:gap-2 md:gap-3 flex-shrink-0">
                  <span className={`text-[10px] sm:text-xs md:text-sm font-medium whitespace-nowrap transition-colors duration-300 ${
                    isDarkMode ? 'text-gray-400' : 'text-gray-700'
                  }`}>
                    Metode de plată:
                  </span>
                  <div className="relative h-5 sm:h-6 md:h-8 lg:h-10 flex items-center flex-shrink-0">
                    <Image
                      src="/netopia-logo.svg"
                      alt="Netopia Payments"
                      width={180}
                      height={40}
                      className="h-5 sm:h-6 md:h-8 lg:h-10 w-auto"
                    />
                  </div>
                </div>

                {/* ANPC / ANPC SOL + iconițe pe același rând */}
                <div className="flex flex-wrap items-center justify-center md:justify-start gap-2 sm:gap-3 flex-shrink-0">
                  <div className="flex items-center gap-1 sm:gap-2">
                    <a 
                      href="https://anpc.ro" 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className={`text-[10px] sm:text-xs md:text-sm font-medium transition-colors whitespace-nowrap ${
                        isDarkMode ? 'text-gray-400 hover:text-white' : 'text-gray-700 hover:text-gray-900'
                      }`}
                    >
                      ANPC
                    </a>
                    <span className={`text-[10px] sm:text-xs transition-colors duration-300 ${
                      isDarkMode ? 'text-gray-500' : 'text-gray-500'
                    }`}>
                      /
                    </span>
                    <a 
                      href="https://anpc.ro/sol" 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className={`text-[10px] sm:text-xs md:text-sm font-medium transition-colors whitespace-nowrap ${
                        isDarkMode ? 'text-gray-400 hover:text-white' : 'text-gray-700 hover:text-gray-900'
                      }`}
                    >
                      ANPC SOL
                    </a>
                  </div>
                  <div className="flex items-center gap-1.5 sm:gap-2">
                    <a
                      href="https://anpc.ro/sol"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hover:opacity-80 transition-opacity inline-block flex-shrink-0 min-w-[44px] min-h-[44px] flex items-center"
                      aria-label="ANPC SOL - Soluționarea Online a Litigiilor (deschide în tab nou)"
                    >
                      <Image 
                        src="/anpc-sol.svg" 
                        alt="" 
                        width={140}
                        height={84}
                        className="h-7 sm:h-9 md:h-12 lg:h-14 w-auto"
                        quality={90}
                      />
                    </a>
                    <a
                      href="https://anpc.ro"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hover:opacity-80 transition-opacity inline-block flex-shrink-0 min-w-[44px] min-h-[44px] flex items-center"
                      aria-label="ANPC SAL - Soluționarea Alternativă a Litigiilor (deschide în tab nou)"
                    >
                      <Image 
                        src="/anpc-sal.svg" 
                        alt="" 
                        width={140}
                        height={84}
                        className="h-7 sm:h-9 md:h-12 lg:h-14 w-auto"
                        quality={90}
                      />
                    </a>
                  </div>
                </div>

                {/* Copyright, Operator */}
                <div className="flex flex-wrap items-center justify-center md:justify-start md:ml-auto gap-1.5 sm:gap-2 md:gap-3 flex-shrink-0">
                  <p className={`text-xs sm:text-sm whitespace-nowrap transition-colors duration-300 ${
                    isDarkMode ? 'text-gray-400' : 'text-gray-700'
                  }`}>
                    © 2026 gobid.ro. Toate drepturile rezervate.
                  </p>
                  <span className={`text-[10px] sm:text-xs transition-colors duration-300 ${
                    isDarkMode ? 'text-gray-500' : 'text-gray-500'
                  }`}>
                    Operat de DMK WEB STRATEGY SRL CUI 54080033
                  </span>
                </div>
              </div>
            </div>
          </div>
          <div className="mt-3 flex md:hidden items-center justify-center gap-2">
            <span className={`flex items-center gap-1 text-xs transition-colors duration-300 ${
              isDarkMode ? 'text-gray-300' : 'text-gray-700'
            }`}>
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
                className={`w-auto ${isDarkMode ? 'brightness-0 invert' : ''}`}
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






