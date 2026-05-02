"use client";

/* @refresh reset */

import React, { useState, useEffect, useLayoutEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import VoiceSearch from "./VoiceSearch";
import VoiceTTS from "./VoiceTTS";
import {
  HomeIcon,
  Cog6ToothIcon,
  CurrencyDollarIcon,
  XMarkIcon,
  MoonIcon,
  SunIcon,
  ArrowRightOnRectangleIcon,
  ChevronDownIcon,
  MagnifyingGlassIcon,
  BellIcon,
  EyeIcon,
  EyeSlashIcon,
  UserCircleIcon,
  Squares2X2Icon,
  PlusCircleIcon
} from '@heroicons/react/24/outline';
import { HeartIcon } from '@heroicons/react/24/solid';
import {
  SearchIcon as HSearchIcon,
  SettingsIcon as HSettingsIcon,
  NotificationIcon as HNotificationIcon
} from "./HeroIcons";
import { TapHandIcon } from "./icons/TapHandIcon";
import { SwipeTutorialHandsIcon } from "./icons/SwipeTutorialHandsIcon";
import HeroSearchBar from "@/app/components/HeroSearchBar";
import { usePopularSuggestions, type PopularSuggestionItem } from "@/lib/search/usePopularSuggestions";
import { useAutocompleteSuggestions } from "@/components/search/hooks/useAutocompleteSuggestions";
import { SearchSuggestionsDropdown } from "@/components/search/SearchSuggestionsDropdown";
import { trackAutocorrectEvent } from "@/lib/search/autocorrect/trackAutocorrect";
import type { RealtimePostgresChangesPayload, Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { uploadImageFile } from "@/lib/upload/client-image-upload";
import {
  hasDashboardLocalAuthEvidence,
  readAccountTypeWithoutRefresh,
} from "@/lib/auth/resolveAccountType";
import { signOutSupabaseAndClearAuthStorage } from "@/lib/auth/logout";
import {
  readGuestFavoriteIdsFromLocalStorage,
  GUEST_FAVORITES_UPDATED_EVENT,
} from "@/lib/favorites/mergeGuestFavorites";
import {
  clearRoFooterPersistedQuery,
  getRoFooterResumeHref,
} from "@/lib/ro/roMarketplaceFooterPersistence";
import { LoaderCircle, Search as HeaderSearchLucideIcon } from "lucide-react";

/**
 * Realtime în header deschide wss către Supabase de pe fiecare pagină — în dev (localhost + Firefox)
 * duce la erori WebSocket + presiune pe `/auth/v1/token` (429).
 * - În development: implicit OFF; pornește cu `NEXT_PUBLIC_SUPABASE_HEADER_REALTIME=1`
 * - Oriunde: `NEXT_PUBLIC_SUPABASE_DISABLE_HEADER_REALTIME=1` forțează doar polling
 */
function isHeaderRealtimeEnabled(): boolean {
  if (process.env.NEXT_PUBLIC_SUPABASE_DISABLE_HEADER_REALTIME === "1") return false;
  if (process.env.NEXT_PUBLIC_SUPABASE_DISABLE_HEADER_REALTIME === "true") return false;
  if (process.env.NEXT_PUBLIC_SUPABASE_HEADER_REALTIME === "1") return true;
  if (process.env.NEXT_PUBLIC_SUPABASE_HEADER_REALTIME === "true") return true;
  return process.env.NODE_ENV !== "development";
}

/** Detectează app nativă fără a importa @capacitor (evită stat() la build). */
function isNativePlatform(): boolean {
  if (typeof window === 'undefined') return false;
  const cap = (window as unknown as { Capacitor?: { getPlatform?: () => string } }).Capacitor;
  return Boolean(cap?.getPlatform?.() && cap.getPlatform() !== 'web');
}

export interface UniversalHeaderProps {
  isDarkMode: boolean;
  onToggleDarkMode: () => void;
  /** Ascunde iconul de search în header (ex. pe homepage unde căutarea e deja vizibilă). Opțional – pe homepage se ascunde automat după pathname. */
  hideHeaderSearchIcon?: boolean;
}

const UniversalHeader: React.FC<UniversalHeaderProps> = function UniversalHeader({
  isDarkMode,
  onToggleDarkMode,
  hideHeaderSearchIcon = false
}) {
  // Fix hydration: use client-side only state for dark mode
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // PAS 2: Verifică periodic dacă VoiceSearch e încărcat și ascultă evenimente pentru categorii
  useEffect(() => {
    const interval = setInterval(() => {
      if (
        (window as any).__voiceSearchTrigger &&
        (window as any).__voiceSearchStop
      ) {
        // VoiceSearch global functions ready
        clearInterval(interval);
      }
    }, 500);

    // Ascultă evenimentul voice-transcript-ready pentru categorii
    const handleCategoryVoiceTranscript = (e: CustomEvent) => {
      const transcript = e.detail.text;
      if (transcript && transcript.trim()) {
        setCategorySearchQuery(transcript);
        setIsCategoryVoiceListening(false);
        const confirmText = `Căutare categorie: ${transcript}`;
        setCategoryVoiceResponse(confirmText);
      }
    };

    window.addEventListener('voice-transcript-ready', handleCategoryVoiceTranscript as EventListener);

    return () => {
      clearInterval(interval);
      window.removeEventListener('voice-transcript-ready', handleCategoryVoiceTranscript as EventListener);
    };
  }, []);

  // Use isDarkMode prop directly, but suppress hydration warning for dynamic classes
  const effectiveDarkMode = isDarkMode;
  const pathname = usePathname();
  const router = useRouter();
  const isHomepage = pathname === "/" || pathname === "/ro" || pathname === "/ro/";
  /** Marketplace listări: căutarea e doar în pagină (RoAuctionsViewClient), nu și în header — un singur „search central”. */
  const isRoListingsPage = pathname === "/ro" || pathname === "/ro/";
  /** Doar landing-ul "/" – pe mobil acolo e deja search-ul deschis, deci ascundem iconița */
  const isStrictHomepage = pathname === "/";
  const hideSearchIcon = hideHeaderSearchIcon || isHomepage;
  const QUICK_ACTIONS_HIDDEN_KEY = "gobid_mobile_quick_actions_hidden";
  const QUICK_ACTIONS_TOGGLE_COUNT_KEY = "gobid_quick_actions_toggle_count";
  const VISUAL_A11Y_KEY = "gobid_visual_accessibility_v1";
  const A11Y_ICON_POSITION_KEY = "gobid_a11y_icon_position";
  const A11Y_ICON_HIDDEN_KEY = "gobid_a11y_icon_hidden";
  const MOBILE_NAV_MODE_KEY = "gobid_mobile_nav_mode"; // "side" | "bottom"
  const NAV_FAVORITE_KEY = "gobid_nav_favorite"; // "side" | "bottom" – meniul pe care userul îl are ca favorit

  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
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
    level: 'Basic'
  });
  const [notifications, setNotifications] = useState<any[]>([]);
  const [showNotificationDropdown, setShowNotificationDropdown] = useState(false);
  const [showTokenDropdown, setShowTokenDropdown] = useState(false);
  const [showHeaderSearchModal, setShowHeaderSearchModal] = useState(false);
  const [notificationUserInfos, setNotificationUserInfos] = useState<Record<string, { avatar_url?: string; first_name?: string; last_name?: string; username?: string }>>({});
  const [favoriteAuctions, setFavoriteAuctions] = useState<string[]>([]);
  const [favoriteProducts, setFavoriteProducts] = useState<string[]>([]);
  const [favoriteUsers, setFavoriteUsers] = useState<string[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  /**
   * Linkurile către /dashboard/* din footer și quick actions nu trebuie să ducă la /auth când
   * middleware-ul a deja acceptat sesiunea dar `currentUserId` / userInfo încă nu s-au populat (race la hidratare).
   */
  /**
   * `hasDashboardLocalAuthEvidence()` doar după mount — altfel SSR vs primul paint client diferă (hydration mismatch pe href).
   * Pe `/dashboard` rămâne true și pe server (fără localStorage).
   */
  const canUseDashboardLinks = React.useMemo(() => {
    if (pathname.startsWith("/dashboard")) return true;
    if (
      mounted &&
      !pathname.startsWith("/auth") &&
      hasDashboardLocalAuthEvidence()
    ) {
      return true;
    }
    return Boolean(
      currentUserId || userInfo.firstName || userInfo.lastName || userInfo.email
    );
  }, [mounted, pathname, currentUserId, userInfo.firstName, userInfo.lastName, userInfo.email]);
  const [ttsSettings, setTtsSettings] = useState<{
    provider?: string;
    elevenLabsVoice?: string;
    openAIVoice?: string;
  }>({});
  const [showAvatarModal, setShowAvatarModal] = useState(false);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [avatarMessage, setAvatarMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [isMounted, setIsMounted] = useState(false);
  const [accountType, setAccountType] = useState<string | null>(null);
  const [areQuickActionsHidden, setAreQuickActionsHidden] = useState(false);
  const [quickActionsToggleCount, setQuickActionsToggleCount] = useState(0);
  /** Pe mobil: "side" = meniul lateral stânga, "bottom" = meniu jos (footer ca în poză) */
  const [mobileNavMode, setMobileNavMode] = useState<"side" | "bottom">("bottom"); // implicit meniul jos (footer); userul poate schimba la lateral
  const [navFavorite, setNavFavorite] = useState<"side" | "bottom">("bottom"); // care meniu e favorit (lateral vs jos)
  const [showBottomNavOptionsMenu, setShowBottomNavOptionsMenu] = useState(false);
  const [showNavTutorialModal, setShowNavTutorialModal] = useState(false);
  const [navTutorialTapTarget, setNavTutorialTapTarget] = useState<'meniu_jos' | 'three_dots' | 'lateral' | null>(null);
  const [navTutorialToast, setNavTutorialToast] = useState<string | null>(null);
  const [tutorialRunKey, setTutorialRunKey] = useState(0);
  const manualNavTutorialRef = useRef(false); // true când user a dat click pe „Tutorial meniuri” → rulăm indiferent de „nu mai arăta”
  const navTutorialTimeoutsRef = useRef<(number | ReturnType<typeof setTimeout>)[]>([]);
  const bottomNavThreeDotsRef = useRef<HTMLButtonElement>(null);
  const bottomNavLateralRef = useRef<HTMLButtonElement>(null);
  /** Footer mobil „Anunțuri”: triplă apăsare = reset filtre; altfel merge la ultimul /ro?… salvat. */
  const footerRoTapCountRef = useRef(0);
  const footerRoTapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [footerRoAnunturiHref, setFooterRoAnunturiHref] = useState("/ro");
  const [filtersResetToast, setFiltersResetToast] = useState<string | null>(null);
  const filtersResetToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [navTutorialHandRect, setNavTutorialHandRect] = useState<{ left: number; top: number } | null>(null);
  const [navTutorialPermanentlyDismissed, setNavTutorialPermanentlyDismissed] = useState(false); // ascunde cele 3 poze când user a ales „am înțeles” / „nu am înțeles”
  const [mobileNavTutorialEnabled, setMobileNavTutorialEnabled] = useState(true); // din admin: când false, tutorialul nu se arată deloc
  const hasFreshTutorialSettingsRef = useRef(false);
  const tutorialSettingsRetryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isNavTutorialRunning, setIsNavTutorialRunning] = useState(false); // true pe tot parcursul tutorialului (blur + text)
  const [showVisualA11yPanel, setShowVisualA11yPanel] = useState(false);
  const [visualA11y, setVisualA11y] = useState<{ largeText: boolean; highContrast: boolean }>({
    largeText: false,
    highContrast: false,
  });
  /** Poziție icon accesibilitate (draggable) – { x, y } în px; persistată în localStorage */
  const [a11yIconPosition, setA11yIconPosition] = useState<{ x: number; y: number } | null>(null);
  const a11yIconDragRef = useRef<{
    startX: number;
    startY: number;
    startLeft: number;
    startTop: number;
    pointerId: number;
    target: HTMLElement;
  } | null>(null);
  const a11yIconDidDragRef = useRef(false);
  const a11yIconLastPosRef = useRef<{ x: number; y: number } | null>(null);
  const a11yIconElRef = useRef<HTMLDivElement | null>(null);
  const [a11yIconHidden, setA11yIconHidden] = useState(false);

  const dismissA11yFloatingIcon = useCallback(() => {
    setShowVisualA11yPanel(false);
    setA11yIconHidden(true);
    try {
      localStorage.setItem(A11Y_ICON_HIDDEN_KEY, "1");
    } catch {
      /* ignore */
    }
  }, [A11Y_ICON_HIDDEN_KEY]);

  const handleA11yIconPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (e.button !== 0) return;
      const pos = a11yIconPosition ?? { x: typeof window !== "undefined" ? window.innerWidth - 16 - 48 : 300, y: 64 };
      const target = e.currentTarget as HTMLElement;
      a11yIconDragRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        startLeft: pos.x,
        startTop: pos.y,
        pointerId: e.pointerId,
        target,
      };
      a11yIconDidDragRef.current = false;
      a11yIconLastPosRef.current = { x: pos.x, y: pos.y };
      target.setPointerCapture?.(e.pointerId);
      const onMove = (e2: PointerEvent) => {
        const ref = a11yIconDragRef.current;
        if (!ref) return;
        const dx = e2.clientX - ref.startX;
        const dy = e2.clientY - ref.startY;
        if (Math.abs(dx) > 5 || Math.abs(dy) > 5) a11yIconDidDragRef.current = true;
        const W = 48;
        const H = 48;
        const newX = Math.max(0, Math.min(typeof window !== "undefined" ? window.innerWidth - W : 400, ref.startLeft + dx));
        const newY = Math.max(0, Math.min(typeof window !== "undefined" ? window.innerHeight - H : 400, ref.startTop + dy));
        a11yIconLastPosRef.current = { x: newX, y: newY };
        setA11yIconPosition({ x: newX, y: newY });
      };
      const onUp = () => {
        const ref = a11yIconDragRef.current;
        ref?.target?.releasePointerCapture?.(ref.pointerId);
        a11yIconDragRef.current = null;
        try {
          const toSave = a11yIconLastPosRef.current;
          if (toSave && typeof window !== "undefined") {
            const W = 48;
            const H = 48;
            const x = Math.max(0, Math.min(window.innerWidth - W, toSave.x));
            const y = Math.max(0, Math.min(window.innerHeight - H, toSave.y));
            localStorage.setItem(A11Y_ICON_POSITION_KEY, JSON.stringify({ x, y }));
          }
        } catch { }
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        if (!a11yIconDidDragRef.current) setShowVisualA11yPanel((v) => !v);
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    },
    [a11yIconPosition, A11Y_ICON_POSITION_KEY]
  );
  const executorDashboardBase = accountType === 'liquidator' ? '/dashboard/lichidator' : accountType === 'executor' ? '/dashboard/executor' : '/dashboard';
  const defaultAvatar = pathname?.startsWith('/dashboard/lichidator') ? '/images/logo-unpir.png' : null;
  const [showHeaderNameDesktop, setShowHeaderNameDesktop] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  /** Icon stânga căutare header: spinner la tastare (debounce) + cât încarcă sugestiile API. */
  const [headerSearchIconBusy, setHeaderSearchIconBusy] = useState(false);
  const [headerSearchPlaceholder, setHeaderSearchPlaceholder] = useState('');
  const headerSearchPlaceholderFullText = 'Căutare rapidă...';
  const [searchSuggestions, setSearchSuggestions] = useState<Array<string | { display: string; q: string }>>([]);
  const [searchSubcategories, setSearchSubcategories] = useState<Array<{ display: string; q: string; brand?: string; category?: string; subcategory?: string }>>([]);
  const [searchMeta, setSearchMeta] = useState<{ expandedLocation?: boolean; expandedCategory?: boolean; termsReduced?: boolean } | null>(null);
  const [productSuggestions, setProductSuggestions] = useState<Array<{
    id: string;
    title: string;
    image?: string;
    price?: number;
    category?: string;
    url?: string;
  }>>([]);
  const [showSearchSuggestions, setShowSearchSuggestions] = useState(false);
  const [searchSuggestionsPosition, setSearchSuggestionsPosition] = useState<{ top: number; left: number; width: number } | null>(null);
  const [headerSuggestActiveIndex, setHeaderSuggestActiveIndex] = useState(-1);
  /** Prefixul tastat de user înainte de navigarea cu săgeți (pentru comportament Google-like). */
  const searchAutocompleteBaseRef = useRef('');
  const headerSuggestBlurTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { popularSuggestions, isFromHistory } = usePopularSuggestions();
  const suggestFetchQuery =
    headerSuggestActiveIndex >= 0 && searchAutocompleteBaseRef.current.length > 0
      ? searchAutocompleteBaseRef.current
      : searchQuery;
  const { items: headerSuggestItems, status: headerSuggestStatus, queryNorm: suggestQueryNorm, meta: suggestMeta } = useAutocompleteSuggestions({
    q: suggestFetchQuery,
    limit: 10,
  });
  const suggestTrackSentRef = useRef<string | null>(null);
  const autocorrectShownSentRef = useRef<string | null>(null);
  const didYouMeanShownRef = useRef<{ original: string; suggested: string } | null>(null);
  /** Închide bara extensibilă deschisă de pe mobil când ieși de pe homepage (/). */
  const headerSearchExitHomePathRef = useRef<string | null>(null);

  useEffect(() => {
    searchInputValueRef.current = searchQuery;
  }, [searchQuery]);

  useEffect(() => {
    const prev = headerSearchExitHomePathRef.current;
    if (prev === "/" && pathname !== "/") {
      setShowHeaderSearchModal(false);
    }
    headerSearchExitHomePathRef.current = pathname;
  }, [pathname]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      setAreQuickActionsHidden(localStorage.getItem(QUICK_ACTIONS_HIDDEN_KEY) === "1");
      const count = parseInt(localStorage.getItem(QUICK_ACTIONS_TOGGLE_COUNT_KEY) || "0", 10);
      setQuickActionsToggleCount(count);
      const mode = localStorage.getItem(MOBILE_NAV_MODE_KEY);
      if (mode === "side" || mode === "bottom") setMobileNavMode(mode);
    } catch { }
  }, [QUICK_ACTIONS_HIDDEN_KEY, QUICK_ACTIONS_TOGGLE_COUNT_KEY, MOBILE_NAV_MODE_KEY]);

  // Încarcă poziția iconului de accesibilitate (draggable)
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      setA11yIconHidden(localStorage.getItem(A11Y_ICON_HIDDEN_KEY) === "1");
    } catch {
      /* ignore */
    }
    try {
      const raw = localStorage.getItem(A11Y_ICON_POSITION_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as { x?: number; y?: number };
        const x = Number(parsed?.x);
        const y = Number(parsed?.y);
        if (Number.isFinite(x) && Number.isFinite(y)) {
          const W = 48;
          const H = 48;
          const clampedX = Math.max(0, Math.min(window.innerWidth - W, x));
          const clampedY = Math.max(0, Math.min(window.innerHeight - H, y));
          const pos = { x: clampedX, y: clampedY };
          a11yIconLastPosRef.current = pos;
          setA11yIconPosition(pos);
          return;
        }
      }
      const headerEl = document.querySelector("header");
      const headerHeight = headerEl?.getBoundingClientRect().height ?? 64;
      const top = headerHeight + 8;
      const def = { x: Math.max(0, window.innerWidth - 16 - 48), y: top };
      a11yIconLastPosRef.current = def;
      setA11yIconPosition(def);
    } catch {
      const headerEl = document.querySelector("header");
      const headerHeight = headerEl?.getBoundingClientRect().height ?? 64;
      const top = headerHeight + 8;
      const def = {
        x: Math.max(0, typeof window !== "undefined" ? window.innerWidth - 16 - 48 : 300),
        y: top,
      };
      a11yIconLastPosRef.current = def;
      setA11yIconPosition(def);
    }
  }, [A11Y_ICON_POSITION_KEY, A11Y_ICON_HIDDEN_KEY]);

  const setMobileNavModeAndPersist = useCallback((mode: "side" | "bottom") => {
    setMobileNavMode(mode);
    setNavFavorite(mode); // alegerea userului = favorit, păstrat până o schimbă el
    try {
      localStorage.setItem(MOBILE_NAV_MODE_KEY, mode);
      localStorage.setItem(NAV_FAVORITE_KEY, mode);
    } catch { }
  }, [MOBILE_NAV_MODE_KEY, NAV_FAVORITE_KEY]);

  const flushFooterRoAnunturiTaps = useCallback(() => {
    footerRoTapTimerRef.current = null;
    const n = footerRoTapCountRef.current;
    footerRoTapCountRef.current = 0;
    if (n >= 3) {
      clearRoFooterPersistedQuery();
      setFooterRoAnunturiHref("/ro");
      if (filtersResetToastTimerRef.current) {
        clearTimeout(filtersResetToastTimerRef.current);
        filtersResetToastTimerRef.current = null;
      }
      setFiltersResetToast("Filtrele au fost resetate.");
      filtersResetToastTimerRef.current = setTimeout(() => {
        filtersResetToastTimerRef.current = null;
        setFiltersResetToast(null);
      }, 4500);
      router.push("/ro");
      return;
    }
    if (n >= 1) {
      const href = getRoFooterResumeHref();
      setFooterRoAnunturiHref(href);
      router.push(href);
    }
  }, [router]);

  const handleFooterAnunturiClick = useCallback(
    (e: React.MouseEvent<HTMLAnchorElement>) => {
      e.preventDefault();
      footerRoTapCountRef.current += 1;
      if (footerRoTapTimerRef.current) {
        clearTimeout(footerRoTapTimerRef.current);
      }
      footerRoTapTimerRef.current = setTimeout(flushFooterRoAnunturiTaps, 650);
    },
    [flushFooterRoAnunturiTaps],
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const saved = localStorage.getItem(NAV_FAVORITE_KEY);
      if (saved === "side" || saved === "bottom") setNavFavorite(saved);
    } catch { }
  }, []);

  useEffect(() => {
    setFooterRoAnunturiHref(getRoFooterResumeHref());
  }, [pathname]);

  useEffect(() => {
    return () => {
      if (footerRoTapTimerRef.current) {
        clearTimeout(footerRoTapTimerRef.current);
        footerRoTapTimerRef.current = null;
      }
      if (filtersResetToastTimerRef.current) {
        clearTimeout(filtersResetToastTimerRef.current);
        filtersResetToastTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const onModeChange = (e: CustomEvent<"side" | "bottom">) => {
      if (e.detail === "side" || e.detail === "bottom") setMobileNavMode(e.detail);
    };
    window.addEventListener("gobid_mobile_nav_mode" as any, onModeChange as any);
    return () => window.removeEventListener("gobid_mobile_nav_mode" as any, onModeChange as any);
  }, []);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const el = document.documentElement;
    if (mobileNavMode === "bottom") {
      el.classList.add("gobid-mobile-bottom-nav");
      el.style.setProperty("--gobid-bottom-nav-safe-bottom", "env(safe-area-inset-bottom, 0px)");
      const measureNav = () => {
        const nav = document.querySelector("[data-gobid-bottom-nav]") as HTMLElement | null;
        if (nav) {
          const h = nav.offsetHeight;
          el.style.setProperty("--gobid-bottom-nav-height", `${h}px`);
        } else {
          el.style.setProperty("--gobid-bottom-nav-height", "72px");
        }
      };
      requestAnimationFrame(() => requestAnimationFrame(measureNav));
      const timer = setTimeout(measureNav, 200);
      let ro: ResizeObserver | null = null;
      const attachObserver = () => {
        const navEl = document.querySelector("[data-gobid-bottom-nav]");
        if (navEl && typeof ResizeObserver !== "undefined") {
          ro = new ResizeObserver(measureNav);
          ro.observe(navEl);
        }
      };
      setTimeout(attachObserver, 250);
      return () => {
        clearTimeout(timer);
        ro?.disconnect();
        el.classList.remove("gobid-mobile-bottom-nav");
        el.style.removeProperty("--gobid-bottom-nav-height");
        el.style.removeProperty("--gobid-bottom-nav-safe-bottom");
      };
    } else {
      el.classList.remove("gobid-mobile-bottom-nav");
      el.style.removeProperty("--gobid-bottom-nav-height");
      el.style.removeProperty("--gobid-bottom-nav-safe-bottom");
      return undefined;
    }
  }, [mobileNavMode]);

  const hideQuickActionsAndIncrement = useCallback(() => {
    setAreQuickActionsHidden(true);
    setQuickActionsToggleCount((prev) => {
      const next = prev + 1;
      try { localStorage.setItem(QUICK_ACTIONS_TOGGLE_COUNT_KEY, String(next)); } catch { }
      return next;
    });
    try { localStorage.setItem(QUICK_ACTIONS_HIDDEN_KEY, "1"); } catch { }
  }, [QUICK_ACTIONS_HIDDEN_KEY, QUICK_ACTIONS_TOGGLE_COUNT_KEY]);

  const showQuickActionsAndIncrement = useCallback(() => {
    setAreQuickActionsHidden(false);
    setQuickActionsToggleCount((prev) => {
      const next = prev + 1;
      try { localStorage.setItem(QUICK_ACTIONS_TOGGLE_COUNT_KEY, String(next)); } catch { }
      return next;
    });
    try { localStorage.setItem(QUICK_ACTIONS_HIDDEN_KEY, "0"); } catch { }
  }, [QUICK_ACTIONS_HIDDEN_KEY, QUICK_ACTIONS_TOGGLE_COUNT_KEY]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = localStorage.getItem(VISUAL_A11Y_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      setVisualA11y({
        largeText: Boolean(parsed?.largeText),
        highContrast: Boolean(parsed?.highContrast),
      });
    } catch { }
  }, [VISUAL_A11Y_KEY]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const root = document.documentElement;
    if (visualA11y.largeText) root.classList.add("a11y-visual-large-text");
    else root.classList.remove("a11y-visual-large-text");
    if (visualA11y.highContrast) root.classList.add("a11y-visual-high-contrast");
    else root.classList.remove("a11y-visual-high-contrast");

    if (typeof window !== "undefined") {
      try {
        localStorage.setItem(VISUAL_A11Y_KEY, JSON.stringify(visualA11y));
      } catch { }
    }
  }, [visualA11y, VISUAL_A11Y_KEY]);

  /* Setări tutoriale din admin (pornit/oprit global) */
  useEffect(() => {
    if (typeof window === "undefined") return;
    let cancelled = false;

    const loadTutorialSettings = () => {
      fetch("/api/tutorial-settings")
        .then((r) => {
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          return r.json();
        })
        .then((data) => {
          if (cancelled || typeof data?.mobileNavTutorial !== "boolean") return;
          const isStale = data?.stale === true;

          if (!isStale) {
            hasFreshTutorialSettingsRef.current = true;
            setMobileNavTutorialEnabled(data.mobileNavTutorial);
            return;
          }

          if (!hasFreshTutorialSettingsRef.current) {
            setMobileNavTutorialEnabled(data.mobileNavTutorial);
          }

          if (!tutorialSettingsRetryTimerRef.current) {
            tutorialSettingsRetryTimerRef.current = setTimeout(() => {
              tutorialSettingsRetryTimerRef.current = null;
              loadTutorialSettings();
            }, 2500);
          }
        })
        .catch(() => { });
    };

    loadTutorialSettings();
    return () => {
      cancelled = true;
      if (tutorialSettingsRetryTimerRef.current) {
        clearTimeout(tutorialSettingsRetryTimerRef.current);
      }
    };
  }, []);

  /* Tutorial meniu: deschide/închide lateral (încet), mână tap pe Meniul jos → meniu jos, tap pe 3 puncte → Lateral → modal */
  const SIDEBAR_DEMO_SESSION_KEY = "gobid_sidebar_demo_shown";
  const NAV_TUTORIAL_NEVER_KEY = "gobid_nav_tutorial_never_show"; // localStorage: user a ales „Am înțeles, mulțumesc” → nu mai arăta niciodată
  useEffect(() => {
    if (typeof window === "undefined" || mobileNavMode !== "side") return;
    if (!mobileNavTutorialEnabled) return;
    if (tutorialRunKey === 0) return; // tutorialul pornește doar la click pe „Tutorial meniuri”, nu automat
    try {
      if (!manualNavTutorialRef.current && localStorage.getItem(NAV_TUTORIAL_NEVER_KEY) === "1") return;
      if (!manualNavTutorialRef.current && sessionStorage.getItem(SIDEBAR_DEMO_SESSION_KEY) === "1") return;
    } catch { }
    manualNavTutorialRef.current = false;
    const isMobile = window.innerWidth < 768;
    if (!isMobile) return;

    const add = (t: number | ReturnType<typeof setTimeout>) => { navTutorialTimeoutsRef.current.push(t); };
    const clearAll = () => {
      navTutorialTimeoutsRef.current.forEach(clearTimeout);
      navTutorialTimeoutsRef.current = [];
      setIsNavTutorialRunning(false);
    };

    setNavTutorialTapTarget(null);
    setShowNavTutorialModal(false);
    setNavTutorialToast(null);
    setIsNavTutorialRunning(true);

    /* Mai încet: lateral închis → deschis (pause) → închis, apoi tap Meniul jos → bottom → tap 3 puncte → Lateral → modal */
    add(window.setTimeout(() => setAreQuickActionsHidden(true), 800));
    add(window.setTimeout(() => showQuickActionsAndIncrement(), 4500));
    add(window.setTimeout(() => hideQuickActionsAndIncrement(), 9500));
    add(window.setTimeout(() => showQuickActionsAndIncrement(), 11500));
    add(window.setTimeout(() => setNavTutorialTapTarget("meniu_jos"), 13500));
    add(window.setTimeout(() => {
      setNavTutorialTapTarget(null);
      setMobileNavModeAndPersist("bottom");
      try { localStorage.setItem(MOBILE_NAV_MODE_KEY, "bottom"); } catch { }
    }, 15500));
    add(window.setTimeout(() => setNavTutorialTapTarget("three_dots"), 18500));
    add(window.setTimeout(() => {
      setNavTutorialTapTarget(null);
      setShowBottomNavOptionsMenu(true);
    }, 20500));
    add(window.setTimeout(() => setNavTutorialTapTarget("lateral"), 22000));
    add(window.setTimeout(() => {
      setNavTutorialTapTarget(null);
      setMobileNavModeAndPersist("side");
      setShowBottomNavOptionsMenu(false);
      try { localStorage.setItem(MOBILE_NAV_MODE_KEY, "side"); } catch { }
    }, 24000));
    add(window.setTimeout(() => setShowNavTutorialModal(true), 25500));

    return () => { clearAll(); };
  }, [mobileNavTutorialEnabled, tutorialRunKey, showQuickActionsAndIncrement, hideQuickActionsAndIncrement, setMobileNavModeAndPersist, setShowBottomNavOptionsMenu, MOBILE_NAV_MODE_KEY]);

  /* La mount: dacă user a ales „nu mai arăta”, ascunde și cele 3 poze din tutorial */
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      if (localStorage.getItem(NAV_TUTORIAL_NEVER_KEY) === "1") setNavTutorialPermanentlyDismissed(true);
    } catch { }
  }, []);

  /* Poziție exactă pentru mâna de tap peste butoanele din footer (3 puncte, Meniul lateral) */
  useEffect(() => {
    if (navTutorialTapTarget !== "three_dots" && navTutorialTapTarget !== "lateral") {
      setNavTutorialHandRect(null);
      return;
    }
    const target = navTutorialTapTarget;
    const measure = () => {
      const el = target === "three_dots"
        ? bottomNavThreeDotsRef.current
        : bottomNavLateralRef.current;
      if (el) {
        const r = el.getBoundingClientRect();
        setNavTutorialHandRect({ left: r.left + r.width / 2, top: r.top + r.height / 2 });
      } else {
        setNavTutorialHandRect(null);
      }
    };
    let timeoutId: number | NodeJS.Timeout | null = null;
    const id = requestAnimationFrame(() => {
      if (target === "lateral") {
        timeoutId = window.setTimeout(measure, 120) as number;
      } else {
        measure();
      }
    });
    return () => {
      cancelAnimationFrame(id);
      if (timeoutId != null) clearTimeout(timeoutId);
    };
  }, [navTutorialTapTarget]);

  const [searchLoading, setSearchLoading] = useState(false);
  const [showVoiceTutorial, setShowVoiceTutorial] = useState(false); // Dezactivat implicit
  const [voiceResponse, setVoiceResponse] = useState<string>('');
  const [isVoiceListening, setIsVoiceListening] = useState(false);
  const voiceSearchRef = useRef<{ start: () => void; stop: () => void } | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  /** Valoarea curentă din input (actualizată la fiecare onChange) – folosită la Enter/submit ca să respecte paste-ul imediat. */
  const searchInputValueRef = useRef('');
  const searchSuggestionsRef = useRef<HTMLDivElement>(null);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const suggestAbortRef = useRef<AbortController | null>(null);
  const currentAudioRef = useRef<HTMLAudioElement | null>(null);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [categorySearchQuery, setCategorySearchQuery] = useState('');
  const [isCategoryVoiceListening, setIsCategoryVoiceListening] = useState(false);
  const [categoryVoiceResponse, setCategoryVoiceResponse] = useState<string>('');
  const [showCategoryVoiceTutorial, setShowCategoryVoiceTutorial] = useState(true);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const userMenuTriggerRef = useRef<HTMLButtonElement>(null);
  const [dropdownPosition, setDropdownPosition] = useState<{ top: number; right: number } | null>(null);
  const notificationTriggerRef = useRef<HTMLButtonElement>(null);
  const [notificationDropdownPosition, setNotificationDropdownPosition] = useState<{ top: number; right: number; isDesktop: boolean } | null>(null);
  const nativeNotifiedIdsRef = useRef<Set<string>>(new Set());
  const [imageSearchFile, setImageSearchFile] = useState<File | null>(null);
  const [imageSearchPreview, setImageSearchPreview] = useState<string | null>(null);
  const [isImageSearching, setIsImageSearching] = useState(false);
  const imageSearchInputRef = useRef<HTMLInputElement>(null);
  const loadUserStateRef = useRef<(() => Promise<void>) | null>(null);
  const quickActionsTouchStartXRef = useRef<number | null>(null);
  const quickActionsTouchStartYRef = useRef<number | null>(null);

  // Close user menu when clicking outside (dropdown e în Portal, deci verificăm și data-user-dropdown)
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (userMenuRef.current?.contains(target) || target.closest('[data-user-dropdown]')) return;
      setShowUserMenu(false);
    };

    if (showUserMenu) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showUserMenu]);

  // Poziționare dropdown via Portal – calculează top/right când se deschide
  const updateDropdownPosition = useCallback(() => {
    const trigger = userMenuTriggerRef.current || userMenuRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    setDropdownPosition({ top: rect.bottom + 8, right: window.innerWidth - rect.right });
  }, []);

  useLayoutEffect(() => {
    if (!showUserMenu) {
      setDropdownPosition(null);
      return;
    }
    updateDropdownPosition();
    const onScrollOrResize = () => updateDropdownPosition();
    window.addEventListener('scroll', onScrollOrResize, true);
    window.addEventListener('resize', onScrollOrResize);
    return () => {
      window.removeEventListener('scroll', onScrollOrResize, true);
      window.removeEventListener('resize', onScrollOrResize);
    };
  }, [showUserMenu, updateDropdownPosition]);

  const updateNotificationDropdownPosition = useCallback(() => {
    const trigger = notificationTriggerRef.current;
    if (!trigger || typeof window === "undefined") return;
    const rect = trigger.getBoundingClientRect();
    setNotificationDropdownPosition({
      top: rect.bottom + 8,
      right: Math.max(8, window.innerWidth - rect.right),
      isDesktop: window.innerWidth >= 768,
    });
  }, []);

  useLayoutEffect(() => {
    if (!showNotificationDropdown) {
      setNotificationDropdownPosition(null);
      return;
    }
    updateNotificationDropdownPosition();
    const onScrollOrResize = () => updateNotificationDropdownPosition();
    window.addEventListener("scroll", onScrollOrResize, true);
    window.addEventListener("resize", onScrollOrResize);
    return () => {
      window.removeEventListener("scroll", onScrollOrResize, true);
      window.removeEventListener("resize", onScrollOrResize);
    };
  }, [showNotificationDropdown, updateNotificationDropdownPosition]);

  const sendNativeNotification = useCallback(async (notification: { id?: string; title?: string; message?: string; metadata?: any; read?: boolean }) => {
    if (!isNativePlatform()) return;
    if (!notification || notification.read) return;
    if (notification.id && nativeNotifiedIdsRef.current.has(notification.id)) return;

    try {
      const { LocalNotifications } = await import("@capacitor/local-notifications");
      const permission = await LocalNotifications.checkPermissions();
      const granted = permission.display === "granted";
      if (!granted) {
        const requested = await LocalNotifications.requestPermissions();
        if (requested.display !== "granted") return;
      }

      await LocalNotifications.schedule({
        notifications: [
          {
            id: Math.floor(Date.now() % 2147483000),
            title: notification.title || "Notificare gobid.ro",
            body: notification.message || "Ai o notificare nouă",
            schedule: { at: new Date(Date.now() + 150) },
            extra: {
              user_notification_id: notification.id || null,
              metadata: notification.metadata || {},
            },
          },
        ],
      });

      if (notification.id) nativeNotifiedIdsRef.current.add(notification.id);
    } catch (error) {
      console.warn("[UniversalHeader] Native local notification failed:", error);
    }
  }, []);

  // Categories data
  const categories = {
    'imobiliare': {
      name: 'Imobiliare',
      subcategories: [
        { key: 'apartamente', name: 'Apartamente' },
        { key: 'case-vile', name: 'Case și Vile' },
        { key: 'terenuri-intravilane', name: 'Terenuri Intravilane' },
        { key: 'terenuri-agricole', name: 'Terenuri Agricole' },
        { key: 'spatii-comerciale', name: 'Spații Comerciale' },
        { key: 'hale-industriale', name: 'Hale Industriale' },
        { key: 'proprietati-turistice', name: 'Proprietăți Turistice' }
      ]
    },
    'autovehicule': {
      name: 'Autovehicule',
      subcategories: [
        { key: 'autoturisme', name: 'Autoturisme' },
        { key: 'suv-4x4', name: 'SUV / 4x4' },
        { key: 'motociclete', name: 'Motociclete și Scutere' },
        { key: 'camioane', name: 'Camioane' },
        { key: 'remorci', name: 'Remorci și Semiremorci' },
        { key: 'autorulote', name: 'Autorulote / Rulote' },
        { key: 'vehicule-electrice', name: 'Vehicule Electrice' },
        { key: 'piese-auto', name: 'Piese Auto și Accesorii' }
      ]
    },
    'utilaje': {
      name: 'Utilaje & Echipamente',
      subcategories: [
        { key: 'utilaje-constructii', name: 'Utilaje Construcții' },
        { key: 'utilaje-agricole', name: 'Utilaje Agricole' },
        { key: 'echipamente-forestiere', name: 'Echipamente Forestiere' },
        { key: 'generatoare', name: 'Generatoare și Compresoare' },
        { key: 'scule-profesionale', name: 'Scule Profesionale' },
        { key: 'echipamente-ateliere', name: 'Echipamente Ateliere Auto' },
        { key: 'echipamente-electrice', name: 'Echipamente Electrice / Sudură' }
      ]
    },
    'arta': {
      name: 'Artă & Antichități',
      subcategories: [
        { key: 'picturi', name: 'Picturi' },
        { key: 'sculpturi', name: 'Sculpturi' },
        { key: 'bijuterii', name: 'Bijuterii și Ceasuri' },
        { key: 'obiecte-colectie', name: 'Obiecte de Colecție' },
        { key: 'mobilier-epoca', name: 'Mobilier de Epocă' },
        { key: 'carti-rare', name: 'Cărți Rare, Hărți Vechi' },
        { key: 'fotografie-artistica', name: 'Fotografie Artistică' },
        { key: 'licitatii-caritabile', name: 'Licitații Caritabile' }
      ]
    },
    'electronice': {
      name: 'Electronice & Tehnologie',
      subcategories: [
        { key: 'laptopuri-pc', name: 'Laptopuri și PC-uri' },
        { key: 'telefoane', name: 'Telefoane Mobile' },
        { key: 'tablete', name: 'Tablete' },
        { key: 'tv-audio', name: 'TV & Audio' },
        { key: 'console-jocuri', name: 'Console & Jocuri' },
        { key: 'drone-gadgeturi', name: 'Drone & Gadgeturi Smart' },
        { key: 'echipamente-foto', name: 'Echipamente Foto/Video' }
      ]
    },
    'casa': {
      name: 'Mobilier & Casă',
      subcategories: [
        { key: 'mobilier-interior', name: 'Mobilier Interior' },
        { key: 'mobilier-exterior', name: 'Mobilier Exterior' },
        { key: 'echipamente-gradinarit', name: 'Echipamente Grădinărit' },
        { key: 'decoratiuni', name: 'Decorațiuni' },
        { key: 'electrocasnice', name: 'Electrocasnice' }
      ]
    },
    'moda': {
      name: 'Modă & Lifestyle',
      subcategories: [
        { key: 'haine-designer', name: 'Haine Designer' },
        { key: 'incaltaminte', name: 'Încălțăminte' },
        { key: 'genti-accesorii', name: 'Genti și Accesorii' },
        { key: 'parfumuri-cosmetice', name: 'Parfumuri și Cosmetice' },
        { key: 'ceasuri-lux', name: 'Ceasuri Lux' }
      ]
    },
    'mama-copil': {
      name: 'Mama și copilul',
      subcategories: [
        { key: 'haine-copil', name: 'Haine copil' },
        { key: 'incaltaminte-copil', name: 'Încălțăminte copil' },
        { key: 'jucarii', name: 'Jucării' },
        { key: 'mobilier-copil', name: 'Mobilier copil' },
        { key: 'cosul-copilului', name: 'Coșul copilului' },
        { key: 'ingrijire-bebelusi', name: 'Îngrijire bebeluși' },
        { key: 'scaune-auto-copil', name: 'Scaune auto copil' },
        { key: 'carucioare', name: 'Cărucioare' },
        { key: 'hranire-copil', name: 'Hranire copil' }
      ]
    },
    'agricultura': {
      name: 'Agricultură & Zootehnie',
      subcategories: [
        { key: 'tractoare-combine', name: 'Tractoare și Combine' },
        { key: 'remorci-agricole', name: 'Remorci Agricole' },
        { key: 'echipamente-irigatii', name: 'Echipamente Irigații' },
        { key: 'animale', name: 'Animale' },
        { key: 'seminte-furaje', name: 'Semințe și Furaje' }
      ]
    },
    'maritime': {
      name: 'Maritime & Aeronautice',
      subcategories: [
        { key: 'barci-iahturi', name: 'Barci și Iahturi' },
        { key: 'motoare-marine', name: 'Motoare Marine' },
        { key: 'avioane', name: 'Avioane' },
        { key: 'drone-industriale', name: 'Drone Industriale' }
      ]
    },
    'business': {
      name: 'Business',
      subcategories: [
        { key: 'echipamente-birou', name: 'Echipamente Birou' },
        { key: 'mobilier-comercial', name: 'Mobilier Comercial' },
        { key: 'calculatoare-second', name: 'Calculatoare Second' },
        { key: 'lichidari-firme', name: 'Lichidări Firme' },
        { key: 'loturi-stocuri', name: 'Loturi și Stocuri' }
      ]
    },
    'materiale': {
      name: 'Materiale Construcții',
      subcategories: [
        { key: 'ciment-caramida', name: 'Ciment și Cărămidă' },
        { key: 'materiale-izolatie', name: 'Materiale Izolație' },
        { key: 'feronerie-unelte', name: 'Feronerie și Unelte' },
        { key: 'usi-ferestre', name: 'Uși și Ferestre' }
      ]
    },
    'diverse': {
      name: 'Diverse / Speciale',
      subcategories: [
        { key: 'caritabile', name: 'Caritabile' },
        { key: 'militare-istorice', name: 'Militare și Istorice' },
        { key: 'nft-arta-digitala', name: 'NFT și Artă Digitală' },
        { key: 'colectii-private', name: 'Colecții Private' },
        { key: 'bunuri-confiscate', name: 'Bunuri Confiscate' }
      ]
    }
  };

  // Toggle category expansion
  const toggleCategory = (categoryKey: string) => {
    setExpandedCategories((prev: Set<string>) => {
      const newSet = new Set(prev);
      if (newSet.has(categoryKey)) {
        newSet.delete(categoryKey);
      } else {
        newSet.add(categoryKey);
      }
      return newSet;
    });
  };

  // Filter categories based on search
  const filteredCategories = Object.entries(categories).filter(([key, category]) => {
    const query = categorySearchQuery.toLowerCase();
    return (
      category.name.toLowerCase().includes(query) ||
      category.subcategories.some(sub => sub.name.toLowerCase().includes(query))
    );
  });

  const sanitizeNotificationMessage = useCallback((message: unknown) => {
    if (typeof message !== 'string') return '';
    return message
      .replace(/\s*\[product_id:[^\]]+\]/gi, '')
      .replace(/\s{2,}/g, ' ')
      .trim();
  }, []);

  const mapSupabaseNotification = useCallback((row: any) => ({
    id: row.id,
    title: row.title ?? '',
    message: sanitizeNotificationMessage(row.message ?? ''),
    type: row.type ?? 'info',
    read: Boolean(row.read_at),
    timestamp: row.created_at ?? new Date().toISOString(),
    metadata: row.metadata ?? {},
  }), [sanitizeNotificationMessage]);

  // Set mounted flag on client
  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Desktop-only: remember if we show the name in header
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const saved = localStorage.getItem('showHeaderNameDesktop');
    if (saved !== null) {
      setShowHeaderNameDesktop(saved === 'true');
    }
  }, []);

  const toggleShowHeaderNameDesktop = useCallback(() => {
    setShowHeaderNameDesktop((prev) => {
      const next = !prev;
      if (typeof window !== 'undefined') {
        localStorage.setItem('showHeaderNameDesktop', String(next));
      }
      return next;
    });
  }, []);

  useEffect(() => {
    let isMounted = true;

    const applyGuestFavoritesFromLocalStorage = () => {
      const { auctionIds, productIds } = readGuestFavoriteIdsFromLocalStorage();
      setFavoriteAuctions(auctionIds);
      setFavoriteProducts(productIds);
      setFavoriteUsers([]);
    };

    const resetStateForGuest = () => {
      if (!isMounted) return;
      setCurrentUserId(null);
      setUserInfo({
        firstName: '',
        lastName: '',
        email: '',
        phone: '',
        avatar: '',
      });
      setUserTokens({
        balance: 0,
        totalEarned: 0,
        totalSpent: 0,
        level: 'Basic',
      });
      setNotifications([]);
      setTtsSettings({});
      // Guest fără cont: favoritele stau în localStorage (aceeași logică ca /ro)
      applyGuestFavoritesFromLocalStorage();
    };

    const loadUserState = async () => {
      try {
        /**
         * Mobil / WebView: primul getSession() e deseori gol; localStorage.accountType poate fi
         * învechit (ex. „executor” de la alt flow) → meniul pointează la /dashboard/executor/* și
         * pagina te dă înapoi la /dashboard. Folosim JWT (refresh + getUser) pentru tipul de cont
         * și nu mai încredem executor/lichidator doar din localStorage.
         */
        const { user: resolvedUser, accountType: jwtAccountType } =
          await readAccountTypeWithoutRefresh(supabase);
        const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
        if (!isMounted) {
          return;
        }
        if (sessionError) {
          console.error('Supabase session error:', sessionError);
        }

        const session = sessionData?.session ?? null;
        const user = session?.user ?? resolvedUser;

        if (user) {
          setAccountType(jwtAccountType ?? null);
          if (typeof window !== 'undefined' && jwtAccountType) {
            localStorage.setItem('accountType', jwtAccountType);
          }
        }

        // Fallback la localStorage dacă nu există sesiune Supabase (ex: login cu Apple înainte de verifyOtp)
        if (!user) {
          // Verifică localStorage pentru date utilizator (acceptă firstName SAU lastName SAU email – Apple poate trimite doar prenumele)
          if (typeof window !== 'undefined') {
            try {
              const storedUserInfo = localStorage.getItem('userInfo');
              const storedUserTokens = localStorage.getItem('userTokens');

              if (storedUserInfo) {
                const userInfo = JSON.parse(storedUserInfo);
                const hasAnyUserData = userInfo.firstName || userInfo.lastName || userInfo.email;
                if (hasAnyUserData) {
                  setUserInfo({
                    firstName: userInfo.firstName || '',
                    lastName: userInfo.lastName || '',
                    email: userInfo.email || '',
                    phone: userInfo.phone || '',
                    avatar: userInfo.avatar || '',
                  });
                  if (userInfo.supabaseUserId) {
                    setCurrentUserId(userInfo.supabaseUserId);
                  }

                  // Executor/lichidator: nu din localStorage fără JWT (mobil – valori învechite)
                  const storedAccountType = localStorage.getItem('accountType');
                  if (
                    storedAccountType &&
                    storedAccountType !== 'executor' &&
                    storedAccountType !== 'liquidator'
                  ) {
                    setAccountType(storedAccountType);
                  }

                  if (storedUserTokens) {
                    const tokens = JSON.parse(storedUserTokens);
                    setUserTokens({
                      balance: tokens.balance || 0,
                      totalEarned: tokens.totalEarned || 0,
                      totalSpent: tokens.totalSpent || 0,
                      level: tokens.level || 'Basic',
                    });
                  }

                  // Încarcă favorite din localStorage (licitații + produse)
                  applyGuestFavoritesFromLocalStorage();

                  return; // Nu reseta starea dacă avem date în localStorage
                }
              }
            } catch (e) {
              console.error('Error reading localStorage:', e);
            }
          }

          resetStateForGuest();
          return;
        }

        setCurrentUserId(user.id);

        const [
          profileRes,
          tokensRes,
          notificationsRes,
          favoritesRes,
          settingsRes,
        ] = await Promise.all([
          supabase
            .from('user_profiles')
            .select('first_name,last_name,phone,avatar_url,metadata')
            .eq('user_id', user.id)
            .maybeSingle(),
          supabase
            .from('user_tokens')
            .select('balance,total_earned,total_spent,level')
            .eq('user_id', user.id)
            .maybeSingle(),
          supabase
            .from('user_notifications')
            .select('id,title,message,type,metadata,read_at,created_at')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false })
            .limit(50),
          supabase
            .from('user_favorites')
            .select('item_id, item_type')
            .eq('user_id', user.id),
          supabase
            .from('user_settings')
            .select('data')
            .eq('user_id', user.id)
            .eq('category', 'tts')
            .maybeSingle(),
        ]);

        if (!isMounted) {
          return;
        }

        const profile = profileRes.data;
        if (profile) {
          const userInfoData = {
            firstName: profile.first_name ?? '',
            lastName: profile.last_name ?? '',
            email: user.email ?? '',
            phone: profile.phone ?? '',
            avatar: profile.avatar_url ?? '',
          };
          setUserInfo(userInfoData);
          // Salvează în localStorage pentru sincronizare rapidă
          if (typeof window !== 'undefined') {
            localStorage.setItem('userInfo', JSON.stringify(userInfoData));
          }
        } else {
          // Fallback la user_metadata sau localStorage
          const storedUserInfo = typeof window !== 'undefined' ? localStorage.getItem('userInfo') : null;
          let userInfoData;
          if (storedUserInfo) {
            try {
              const userInfo = JSON.parse(storedUserInfo);
              userInfoData = {
                firstName: userInfo.firstName || (user.user_metadata?.first_name ?? ''),
                lastName: userInfo.lastName || (user.user_metadata?.last_name ?? ''),
                email: user.email ?? userInfo.email ?? '',
                phone: userInfo.phone || (user.user_metadata?.phone ?? ''),
                avatar: userInfo.avatar || (user.user_metadata?.avatar_url ?? ''),
              };
            } catch (e) {
              userInfoData = {
                firstName: user.user_metadata?.first_name ?? '',
                lastName: user.user_metadata?.last_name ?? '',
                email: user.email ?? '',
                phone: user.user_metadata?.phone ?? '',
                avatar: user.user_metadata?.avatar_url ?? '',
              };
            }
          } else {
            userInfoData = {
              firstName: user.user_metadata?.first_name ?? '',
              lastName: user.user_metadata?.last_name ?? '',
              email: user.email ?? '',
              phone: user.user_metadata?.phone ?? '',
              avatar: user.user_metadata?.avatar_url ?? '',
            };
          }
          setUserInfo(userInfoData);
          // Salvează în localStorage pentru sincronizare rapidă
          if (typeof window !== 'undefined') {
            localStorage.setItem('userInfo', JSON.stringify(userInfoData));
          }
        }

        const tokenData = tokensRes.data;
        if (tokenData) {
          setUserTokens({
            balance: tokenData.balance ?? 0,
            totalEarned: tokenData.total_earned ?? 0,
            totalSpent: tokenData.total_spent ?? 0,
            level: tokenData.level ?? 'Basic',
          });
        } else {
          // Fallback la localStorage
          const storedUserTokens = typeof window !== 'undefined' ? localStorage.getItem('userTokens') : null;
          if (storedUserTokens) {
            try {
              const tokens = JSON.parse(storedUserTokens);
              setUserTokens({
                balance: tokens.balance || 0,
                totalEarned: tokens.totalEarned || 0,
                totalSpent: tokens.totalSpent || 0,
                level: tokens.level || 'Basic',
              });
            } catch (e) {
              setUserTokens({
                balance: 0,
                totalEarned: 0,
                totalSpent: 0,
                level: 'Basic',
              });
            }
          } else {
            setUserTokens({
              balance: 0,
              totalEarned: 0,
              totalSpent: 0,
              level: 'Basic',
            });
          }
        }

        const notificationRows = notificationsRes.data ?? [];
        const mappedNotifications = notificationRows.map(mapSupabaseNotification);
        setNotifications(mappedNotifications);

        // Încarcă informațiile utilizatorilor pentru notificări
        loadNotificationUserInfos(mappedNotifications);

        const favoriteRows = favoritesRes.data ?? [];
        // Separate favorites by type
        const auctionIds = favoriteRows
          .filter((row: any) => row.item_type === 'auction')
          .map((row: any) => row.item_id)
          .filter((id: any): id is string => typeof id === 'string' && id.length > 0);
        const productIds = favoriteRows
          .filter((row: any) => row.item_type === 'product')
          .map((row: any) => row.item_id)
          .filter((id: any): id is string => typeof id === 'string' && id.length > 0);
        const userIds = favoriteRows
          .filter((row: any) => row.item_type === 'user')
          .map((row: any) => row.item_id)
          .filter((id: any): id is string => typeof id === 'string' && id.length > 0);

        setFavoriteAuctions(auctionIds);
        setFavoriteProducts(productIds);
        setFavoriteUsers(userIds);

        const ttsData = settingsRes.data?.data ?? {};
        setTtsSettings({
          provider: ttsData.provider ?? undefined,
          elevenLabsVoice: ttsData.voiceId ?? ttsData.elevenLabsVoice ?? undefined,
          openAIVoice: ttsData.voice ?? ttsData.openAIVoice ?? undefined,
        });
      } catch (error) {
        console.error('Error loading header data from Supabase:', error);
        // Fallback la localStorage în caz de eroare
        if (typeof window !== 'undefined') {
          try {
            const storedUserInfo = localStorage.getItem('userInfo');
            const storedUserTokens = localStorage.getItem('userTokens');

            if (storedUserInfo) {
              const userInfo = JSON.parse(storedUserInfo);
              if (userInfo.firstName && userInfo.lastName) {
                setUserInfo({
                  firstName: userInfo.firstName || '',
                  lastName: userInfo.lastName || '',
                  email: userInfo.email || '',
                  phone: userInfo.phone || '',
                  avatar: userInfo.avatar || '',
                });

                if (storedUserTokens) {
                  const tokens = JSON.parse(storedUserTokens);
                  setUserTokens({
                    balance: tokens.balance || 0,
                    totalEarned: tokens.totalEarned || 0,
                    totalSpent: tokens.totalSpent || 0,
                    level: tokens.level || 'Basic',
                  });
                }
                applyGuestFavoritesFromLocalStorage();
                return;
              }
            }
          } catch (e) {
            console.error('Error reading localStorage fallback:', e);
          }
        }
        resetStateForGuest();
      }
    };

    loadUserState();
    loadUserStateRef.current = loadUserState;

    let authDebounce: ReturnType<typeof setTimeout> | null = null;
    const scheduleLoadUserState = () => {
      if (authDebounce) clearTimeout(authDebounce);
      authDebounce = setTimeout(() => {
        authDebounce = null;
        loadUserStateRef.current?.();
      }, 400);
    };

    const { data: authListener } = supabase.auth.onAuthStateChange(() => {
      scheduleLoadUserState();
    });

    // Listen for avatar updates from other components
    const handleAvatarUpdated = (e: CustomEvent) => {
      if (e.detail?.avatarUrl) {
        setUserInfo(prev => ({ ...prev, avatar: e.detail.avatarUrl }));
        if (typeof window !== 'undefined') {
          const currentUserInfo = JSON.parse(localStorage.getItem('userInfo') || '{}');
          localStorage.setItem('userInfo', JSON.stringify({
            ...currentUserInfo,
            avatar: e.detail.avatarUrl
          }));
        }
      }
    };

    // Listen for localStorage changes (from other tabs)
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'userInfo' && e.newValue) {
        try {
          const newUserInfo = JSON.parse(e.newValue);
          setUserInfo({
            firstName: newUserInfo.firstName ?? '',
            lastName: newUserInfo.lastName ?? '',
            email: newUserInfo.email ?? '',
            phone: newUserInfo.phone ?? '',
            avatar: newUserInfo.avatar ?? '',
          });
        } catch (e) {
          console.error('Error parsing userInfo from storage:', e);
        }
      }
      if (e.key === 'favoriteAuctions' || e.key === 'favoriteProducts') {
        void supabase.auth.getSession().then(({ data: { session } }: { data: { session: Session | null } }) => {
          if (session?.user) return;
          const { auctionIds, productIds } = readGuestFavoriteIdsFromLocalStorage();
          setFavoriteAuctions(auctionIds);
          setFavoriteProducts(productIds);
          setFavoriteUsers([]);
        });
      }
    };

    const handleGuestFavoritesUpdated = () => {
      void supabase.auth.getSession().then(({ data: { session } }: { data: { session: Session | null } }) => {
        if (session?.user) return;
        const { auctionIds, productIds } = readGuestFavoriteIdsFromLocalStorage();
        setFavoriteAuctions(auctionIds);
        setFavoriteProducts(productIds);
        setFavoriteUsers([]);
      });
    };

    // Same-tab update: reîncarcă din Supabase (sursa de adevăr), nu doar din localStorage
    const handleUserInfoUpdated = () => {
      loadUserStateRef.current?.();
    };

    window.addEventListener('avatarUpdated', handleAvatarUpdated as EventListener);
    window.addEventListener('storage', handleStorageChange);
    window.addEventListener('userInfoUpdated', handleUserInfoUpdated);
    window.addEventListener(GUEST_FAVORITES_UPDATED_EVENT, handleGuestFavoritesUpdated);

    return () => {
      isMounted = false;
      if (authDebounce) clearTimeout(authDebounce);
      authListener?.subscription.unsubscribe();
      window.removeEventListener('avatarUpdated', handleAvatarUpdated as EventListener);
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('userInfoUpdated', handleUserInfoUpdated);
      window.removeEventListener(GUEST_FAVORITES_UPDATED_EVENT, handleGuestFavoritesUpdated);
    };
  }, []);

  // Listen for new notifications via Realtime (separate effect for currentUserId)
  useEffect(() => {
    if (!currentUserId) {
      return;
    }

    // Funcție pentru a reîncărca notificările (fallback dacă Realtime nu funcționează)
    const reloadNotifications = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;

        const { data: notificationRows, error } = await supabase
          .from('user_notifications')
          .select('id,title,message,type,metadata,read_at,created_at')
          .eq('user_id', currentUserId)
          .order('created_at', { ascending: false })
          .limit(50);

        if (!error && notificationRows) {
          const mappedNotifications = notificationRows.map(mapSupabaseNotification);
          setNotifications(mappedNotifications);
          loadNotificationUserInfos(mappedNotifications);
        }
      } catch (error) {
        console.error('[UniversalHeader] Error reloading notifications:', error);
      }
    };

    if (!isHeaderRealtimeEnabled()) {
      void reloadNotifications();
      const pollOnly = setInterval(reloadNotifications, 10000);
      return () => clearInterval(pollOnly);
    }


    let notificationsChannel: any = null;
    let pollInterval: NodeJS.Timeout | null = null;

    // Încearcă să se conecteze la Realtime
    notificationsChannel = supabase
      .channel(`user_notifications:${currentUserId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'user_notifications',
          filter: `user_id=eq.${currentUserId}`,
        },
        (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => {

          const newNotification = payload.new as any;

          // Folosește aceeași funcție de mapare ca pentru notificările încărcate
          const mappedNotification = mapSupabaseNotification(newNotification);

          // Adaugă notificarea în listă
          setNotifications((prev) => {
            // Verifică dacă notificarea există deja
            if (prev.some(n => n.id === mappedNotification.id)) {
              return prev;
            }

            // Adaugă notificarea la început (notificările noi sunt automat necitite)
            const updated = [mappedNotification, ...prev].slice(0, 50); // Păstrează doar ultimele 50

            return updated;
          });

          // În aplicația nativă (iOS/Android), afișează și notificare de sistem.
          void sendNativeNotification(mappedNotification);
        }
      )
      .subscribe((status: string) => {
        if (status === 'SUBSCRIBED') {
          // Oprește polling-ul dacă Realtime funcționează
          if (pollInterval) {
            clearInterval(pollInterval);
            pollInterval = null;
          }
        } else if (status === 'CHANNEL_ERROR') {
          // Nu logăm ca eroare, ci ca warning - fallback-ul funcționează
          console.warn('[UniversalHeader] ⚠️ Realtime channel error (this is normal if migration not applied). Using polling fallback.');
          // Fallback la polling dacă Realtime nu funcționează
          if (!pollInterval) {
            pollInterval = setInterval(reloadNotifications, 5000); // Reîncarcă la fiecare 5 secunde
          }
        } else if (status === 'TIMED_OUT') {
          console.warn('[UniversalHeader] ⚠️ Realtime channel timed out. Using polling fallback.');
          if (!pollInterval) {
            pollInterval = setInterval(reloadNotifications, 5000);
          }
        }
      });

    // Fallback: polling la fiecare 10 secunde pentru a verifica notificări noi
    // (doar dacă Realtime nu funcționează)
    const fallbackPollInterval = setInterval(() => {
      // Reîncarcă notificările doar dacă Realtime nu este conectat
      if (notificationsChannel?.state !== 'joined') {
        reloadNotifications();
      }
    }, 10000);

    return () => {
      if (notificationsChannel) {
        supabase.removeChannel(notificationsChannel);
      }
      if (pollInterval) {
        clearInterval(pollInterval);
      }
      clearInterval(fallbackPollInterval);
    };
  }, [currentUserId, mapSupabaseNotification, sendNativeNotification]);

  // Listen for favorites changes via Realtime
  useEffect(() => {
    if (!currentUserId) {
      return;
    }

    // Funcție pentru a reîncărca favoritele
    const reloadFavorites = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;

        const { data: favoriteRows, error } = await supabase
          .from('user_favorites')
          .select('item_id, item_type')
          .eq('user_id', currentUserId);

        if (!error && favoriteRows) {
          // Separate favorites by type
          const auctionIds = favoriteRows
            .filter((row: any) => row.item_type === 'auction')
            .map((row: any) => row.item_id)
            .filter((id: any): id is string => typeof id === 'string' && id.length > 0);
          const productIds = favoriteRows
            .filter((row: any) => row.item_type === 'product')
            .map((row: any) => row.item_id)
            .filter((id: any): id is string => typeof id === 'string' && id.length > 0);
          const userIds = favoriteRows
            .filter((row: any) => row.item_type === 'user')
            .map((row: any) => row.item_id)
            .filter((id: any): id is string => typeof id === 'string' && id.length > 0);

          setFavoriteAuctions(auctionIds);
          setFavoriteProducts(productIds);
          setFavoriteUsers(userIds);

        }
      } catch (error) {
        console.error('[UniversalHeader] Error reloading favorites:', error);
      }
    };

    if (!isHeaderRealtimeEnabled()) {
      void reloadFavorites();
      const pollOnly = setInterval(reloadFavorites, 15000);
      return () => clearInterval(pollOnly);
    }


    let favoritesChannel: any = null;

    // Subscribe to favorites changes
    favoritesChannel = supabase
      .channel(`user_favorites:${currentUserId}`)
      .on(
        'postgres_changes',
        {
          event: '*', // Listen to INSERT, UPDATE, DELETE
          schema: 'public',
          table: 'user_favorites',
          filter: `user_id=eq.${currentUserId}`,
        },
        (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => {

          // Pentru DELETE, actualizează imediat state-ul fără să aștepte reîncărcarea completă
          if (payload.eventType === 'DELETE' && payload.old) {
            const deletedItem = payload.old as any;
            const deletedItemId = deletedItem.item_id;
            const deletedItemType = deletedItem.item_type;


            // Actualizează imediat state-ul pentru a elimina item-ul șters
            if (deletedItemType === 'auction') {
              setFavoriteAuctions(prev => prev.filter(id => id !== deletedItemId));
            } else if (deletedItemType === 'product') {
              setFavoriteProducts(prev => prev.filter(id => id !== deletedItemId));
            } else if (deletedItemType === 'user') {
              setFavoriteUsers(prev => prev.filter(id => id !== deletedItemId));
            }
          } else if (payload.eventType === 'INSERT' && payload.new) {
            const newItem = payload.new as any;
            const newItemId = newItem.item_id;
            const newItemType = newItem.item_type;


            // Actualizează imediat state-ul pentru a adăuga item-ul nou
            if (newItemType === 'auction') {
              setFavoriteAuctions(prev => prev.includes(newItemId) ? prev : [...prev, newItemId]);
            } else if (newItemType === 'product') {
              setFavoriteProducts(prev => prev.includes(newItemId) ? prev : [...prev, newItemId]);
            } else if (newItemType === 'user') {
              setFavoriteUsers(prev => prev.includes(newItemId) ? prev : [...prev, newItemId]);
            }
          }

          // Reîncarcă toate favoritele pentru a obține starea actualizată (fallback)
          // Folosim un mic delay pentru a permite Realtime să se sincronizeze
          setTimeout(() => {
            reloadFavorites();
          }, 100);
        }
      )
      .subscribe((status: string) => {
        if (status === 'CHANNEL_ERROR') {
          console.warn('[UniversalHeader] ⚠️ Favorites Realtime channel error (this is normal if migration not applied).');
        } else if (status === 'TIMED_OUT') {
          console.warn('[UniversalHeader] ⚠️ Favorites Realtime channel timed out.');
        }
      });

    return () => {
      if (favoritesChannel) {
        supabase.removeChannel(favoritesChannel);
      }
    };
  }, [currentUserId]);

  // Funcție pentru încărcarea informațiilor utilizatorilor din notificări
  const loadNotificationUserInfos = useCallback(async (notificationsToProcess: any[]) => {
    if (!notificationsToProcess || notificationsToProcess.length === 0) return;

    try {
      // Colectează toate ID-urile utilizatorilor din metadata notificărilor
      const userIds = new Set<string>();
      notificationsToProcess.forEach((notification) => {
        const metadata = notification.metadata;
        if (metadata) {
          // Pentru mesaje de chat
          if (metadata.sender_id) {
            userIds.add(metadata.sender_id);
          }
          // Pentru oferte (bids) - bidder_id pentru oferte normale
          if (metadata.bidder_id) {
            userIds.add(metadata.bidder_id);
          }
          // Pentru contraoferte
          if (metadata.bid_user_id) {
            userIds.add(metadata.bid_user_id);
          }
        }
      });

      if (userIds.size === 0) {
        return;
      }


      // Încarcă informațiile utilizatorilor din user_profiles (folosește user_id, nu id)
      // Notă: username ar putea să nu existe în user_profiles, folosim doar câmpurile cunoscute
      const { data: userProfiles, error } = await supabase
        .from('user_profiles')
        .select('user_id, avatar_url, first_name, last_name')
        .in('user_id', Array.from(userIds));

      // Verifică dacă error-ul este unul real (nu un obiect gol)
      if (error && Object.keys(error).length > 0) {
        console.error('[UniversalHeader] Error loading user profiles for notifications:', error);
        // Continuă execuția chiar dacă nu există profiluri - poate fi normal
      }


      // Creează un obiect cu informațiile utilizatorilor (folosește user_id ca cheie)
      const userInfos: Record<string, { avatar_url?: string; first_name?: string; last_name?: string; username?: string }> = {};
      if (userProfiles) {
        userProfiles.forEach((profile: any) => {
          userInfos[profile.user_id] = {
            avatar_url: profile.avatar_url,
            first_name: profile.first_name,
            last_name: profile.last_name,
            // username nu există în user_profiles, deci nu îl includem
          };
        });
      }


      setNotificationUserInfos(prev => ({ ...prev, ...userInfos }));
    } catch (error) {
      console.error('[UniversalHeader] Error in loadNotificationUserInfos:', error);
    }
  }, []);

  const addNotification = useCallback(
    async (message: string, type: 'success' | 'info' | 'warning' | 'error' = 'info') => {
      if (!currentUserId) {
        return;
      }

      try {
        const { data, error } = await supabase
          .from('user_notifications')
          .insert({
            user_id: currentUserId,
            message,
            type,
          })
          .select('id,title,message,type,metadata,read_at,created_at')
          .single();

        if (error) {
          console.error('Error adding notification:', error);
          return;
        }

        if (data) {
          setNotifications(prev => [mapSupabaseNotification(data), ...prev]);
        }
      } catch (error) {
        console.error('Unexpected error adding notification:', error);
      }
    },
    [currentUserId, mapSupabaseNotification]
  );

  const markAsRead = useCallback(async (notificationId: string) => {
    setNotifications(prev =>
      prev.map(notif =>
        notif.id === notificationId ? { ...notif, read: true } : notif
      )
    );

    try {
      const { error } = await supabase
        .from('user_notifications')
        .update({ read_at: new Date().toISOString() })
        .eq('id', notificationId);

      if (error) {
        console.error('Error marking notification as read:', error);
      }
    } catch (error) {
      console.error('Unexpected error marking notification as read:', error);
    }
  }, []);

  const deleteNotification = useCallback(async (notificationId: string, e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation(); // Previne redirecționarea când se dă click pe butonul de ștergere
    }


    // Optimistic update - elimină notificarea din state imediat
    setNotifications(prev => {
      const filtered = prev.filter(notif => notif.id !== notificationId);
      return filtered;
    });

    try {
      // Get current user session and token
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user?.id || !session.access_token) {
        console.error('[UniversalHeader] ❌ No user session found for delete');
        return;
      }


      // Use API endpoint instead of direct Supabase call
      const response = await fetch(`/api/notifications?id=${notificationId}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      const result = await response.json();

      if (!response.ok || result.error) {
        console.error('[UniversalHeader] ❌ Error deleting notification from DB:', result.error || result.details);
        // Reîncarcă notificările în caz de eroare
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          const { data: notificationRows } = await supabase
            .from('user_notifications')
            .select('id,title,message,type,metadata,read_at,created_at')
            .eq('user_id', session.user.id)
            .order('created_at', { ascending: false })
            .limit(50);

          if (notificationRows) {
            const mappedNotifications = notificationRows.map(mapSupabaseNotification);
            setNotifications(mappedNotifications);
            loadNotificationUserInfos(mappedNotifications);
          }
        }
      }
    } catch (error) {
      console.error('[UniversalHeader] ❌ Unexpected error deleting notification:', error);
    }
  }, [mapSupabaseNotification]);

  const clearAllNotifications = useCallback(async () => {

    // Optimistic update
    setNotifications([]);

    try {
      // Get current user session and token
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user?.id || !session.access_token) {
        console.error('[UniversalHeader] ❌ No user session found for clear all');
        return;
      }


      // Use API endpoint
      const response = await fetch('/api/notifications', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      const result = await response.json();

      if (!response.ok || result.error) {
        console.error('[UniversalHeader] ❌ Error clearing notifications:', result.error || result.details);
        // Reload notifications on error
        const { data: { session: reloadSession } } = await supabase.auth.getSession();
        if (reloadSession) {
          const { data: notificationRows } = await supabase
            .from('user_notifications')
            .select('id,title,message,type,metadata,read_at,created_at')
            .eq('user_id', reloadSession.user.id)
            .order('created_at', { ascending: false })
            .limit(50);

          if (notificationRows) {
            const mappedNotifications = notificationRows.map(mapSupabaseNotification);
            setNotifications(mappedNotifications);
            loadNotificationUserInfos(mappedNotifications);
          }
        }
      }
    } catch (error) {
      console.error('[UniversalHeader] ❌ Unexpected error clearing notifications:', error);
    }
  }, [mapSupabaseNotification, loadNotificationUserInfos]);

  // Get unread count - se actualizează automat când notifications se schimbă
  const unreadCount = notifications.filter(notif => !notif.read).length;

  // Încarcă informațiile utilizatorilor când notificările se schimbă
  useEffect(() => {
    if (notifications.length > 0) {
      loadNotificationUserInfos(notifications);
    }
  }, [notifications, loadNotificationUserInfos]);

  // Fetch search suggestions – autocomplete de la 2 litere. Ordine: CATEGORII → BRANDURI → SUBCATEGORII → PRODUSE (categorii prioritar peste tot)
  const fetchSuggestions = useCallback(async (query: string) => {
    if (query.length < 2) {
      setSearchSuggestions([]);
      setSearchSubcategories([]);
      setProductSuggestions([]);
      setSearchMeta(null);
      return;
    }

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = setTimeout(async () => {
      if (suggestAbortRef.current) suggestAbortRef.current.abort();
      suggestAbortRef.current = new AbortController();
      const signal = suggestAbortRef.current.signal;
      try {
        const response = await fetch(
          `/api/search/suggestions?q=${encodeURIComponent(query)}&limit=10`,
          { signal }
        );
        const data = await response.json();
        if (signal.aborted) return;

        const subcategories = Array.isArray(data.subcategories) ? data.subcategories : [];
        setSearchSubcategories(subcategories);
        setSearchMeta(data.meta && typeof data.meta === 'object' ? data.meta : null);

        const raw = data.suggestions ?? [];
        setSearchSuggestions(Array.isArray(raw) && raw.length > 0 ? raw : []);

        if (data.products && data.products.length > 0) {
          const products = data.products as Array<{
            id: string;
            title: string;
            image?: string;
            price?: number;
            category?: string;
            url?: string;
          }>;
          const uniqueProducts = Array.from(
            new Map(products.map((p) => [p.id, p])).values()
          );
          setProductSuggestions(uniqueProducts);
        } else {
          setProductSuggestions([]);
        }

        const hasSuggestions = subcategories.length > 0
          || (Array.isArray(raw) && raw.length > 0)
          || (data.products && data.products.length > 0);
        setShowSearchSuggestions(!!hasSuggestions);
      } catch (error) {
        if (!signal.aborted) console.error('Error fetching suggestions:', error);
      }
    }, 150);
  }, []);

  // Placeholder care se scrie singur la căutarea din header (desktop + mobil) – max 2 cicluri
  useEffect(() => {
    if (searchQuery !== '') {
      setHeaderSearchPlaceholder('');
      return;
    }
    const fullText = headerSearchPlaceholderFullText;
    let index = 0;
    let cycleCount = 0;
    const maxCycles = 2;
    let timeoutId: ReturnType<typeof setTimeout>;
    const typeNext = () => {
      if (index <= fullText.length) {
        setHeaderSearchPlaceholder(fullText.slice(0, index));
        index += 1;
        timeoutId = setTimeout(typeNext, 85);
      } else {
        cycleCount += 1;
        if (cycleCount >= maxCycles) {
          setHeaderSearchPlaceholder(fullText);
          return;
        }
        timeoutId = setTimeout(() => {
          index = 0;
          typeNext();
        }, 1800);
      }
    };
    typeNext();
    return () => clearTimeout(timeoutId);
  }, [searchQuery]);

  useEffect(() => {
    const q = searchQuery.trim();
    if (!q) {
      setHeaderSearchIconBusy(false);
      return;
    }
    setHeaderSearchIconBusy(true);
    const t = setTimeout(() => setHeaderSearchIconBusy(false), 450);
    return () => clearTimeout(t);
  }, [searchQuery]);

  // Suggest track: impression when dropdown shows API suggestions
  useEffect(() => {
    if (!showSearchSuggestions || headerSuggestItems.length === 0 || suggestQueryNorm.length < 2) return;
    const key = `${suggestQueryNorm}|${headerSuggestItems.map((i) => i.phrase_norm ?? i.q).join(",")}`;
    if (suggestTrackSentRef.current === key) return;
    suggestTrackSentRef.current = key;
    fetch("/api/ro/search/suggest/track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event_type: "impression",
        query_norm: suggestQueryNorm.slice(0, 120),
        suggestions: headerSuggestItems.slice(0, 8).map((i) => ({
          phrase_norm: i.phrase_norm ?? i.q.trim().toLowerCase().replace(/\s+/g, " "),
          kind: i.type ?? "query",
        })),
      }),
    }).catch(() => {});
  }, [showSearchSuggestions, headerSuggestItems, suggestQueryNorm]);

  // Autocorrect: fire autocorrect_shown when "Did you mean X?" is displayed (once per key)
  useEffect(() => {
    const dym = suggestMeta?.didYouMean?.trim();
    if (!showSearchSuggestions || !dym || suggestQueryNorm.length < 2 || dym === suggestQueryNorm) return;
    const key = `shown|${suggestQueryNorm}|${dym}`;
    if (autocorrectShownSentRef.current === key) return;
    autocorrectShownSentRef.current = key;
    didYouMeanShownRef.current = { original: suggestQueryNorm, suggested: dym };
    trackAutocorrectEvent({
      event_type: "autocorrect_shown",
      original_query_norm: suggestQueryNorm.slice(0, 120),
      suggested_query_norm: dym.slice(0, 120),
      page_context: "suggest",
    }).catch(() => {});
  }, [showSearchSuggestions, suggestMeta?.didYouMean, suggestQueryNorm]);

  // Poziționare sugestii (doar când q e gol – dropdown Căutări frecvente)
  useLayoutEffect(() => {
    if (!showSearchSuggestions || searchQuery.trim().length > 0 || typeof window === 'undefined') {
      setSearchSuggestionsPosition(null);
      return;
    }
    const input = searchInputRef.current;
    if (!input) {
      setSearchSuggestionsPosition(null);
      return;
    }
    const rect = input.getBoundingClientRect();
    setSearchSuggestionsPosition({
      top: rect.bottom + 8,
      left: rect.left,
      width: Math.max(rect.width, 384),
    });
  }, [showSearchSuggestions, searchQuery]);

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;

      if (showNotificationDropdown && !target.closest('.notification-dropdown')) {
        setShowNotificationDropdown(false);
      }

      if (showTokenDropdown && !target.closest('.token-dropdown')) {
        setShowTokenDropdown(false);
      }

      if (
        showSearchSuggestions &&
        searchInputRef.current &&
        !searchInputRef.current.contains(target) &&
        !target.closest("[data-header-search-suggestions]") &&
        !target.closest("[data-search-suggestions-dropdown]") &&
        (!searchSuggestionsRef.current || !searchSuggestionsRef.current.contains(target))
      ) {
        setShowSearchSuggestions(false);
        setHeaderSuggestActiveIndex(-1);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showNotificationDropdown, showTokenDropdown, showSearchSuggestions]);

  // Închide automat modalul de tokeni după 3 secunde
  useEffect(() => {
    if (!showTokenDropdown) return;
    const timer = window.setTimeout(() => {
      setShowTokenDropdown(false);
    }, 3000);
    return () => window.clearTimeout(timer);
  }, [showTokenDropdown]);

  const handleSearchSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const currentQ = (searchInputValueRef.current ?? searchInputRef.current?.value ?? searchQuery).trim();
    if (currentQ) {
      setShowSearchSuggestions(false);
      setShowVoiceTutorial(false);

      // Stochează pattern-ul pentru învățare adaptivă
      if (typeof window !== 'undefined') {
        try {
          const { analyzeQuery } = await import('@/lib/ai/brand-detector');
          const { storeSearchPattern } = await import('@/lib/ai/adaptive-learning');
          const analysis = analyzeQuery(currentQ);
          storeSearchPattern(currentQ, currentQ, analysis.category, 'text', false);

          // Salvează căutarea în cookies (ultimele 20 căutări)
          const searchHistory = JSON.parse(localStorage.getItem('user_search_history') || '[]');
          const newHistory = [
            { query: currentQ, timestamp: Date.now() },
            ...searchHistory.filter((item: any) => item.query !== currentQ)
          ].slice(0, 20);
          localStorage.setItem('user_search_history', JSON.stringify(newHistory));

          // Salvează în Supabase (dacă user este autentificat)
          const { data: { session } } = await supabase.auth.getSession();
          if (session?.user?.id) {
            fetch('/api/search/save-history', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                query: currentQ,
                resultsCount: 0, // Va fi actualizat după căutare
                userId: session.user.id,
              }),
            }).catch(err => console.warn('Error saving search history:', err));
          }
        } catch (err) {
          // Silent error handling
        }
      }

      // Adaugă răspuns vocal
      const responseText = `Căutare pentru ${currentQ}... Căutăm în baza de date.`;
      setVoiceResponse(responseText);

      // Analizează query și redirecționează pe /ro (Licitatii) cu filtre
      const { analyzeQuery, buildSearchUrl } = await import('@/lib/ai/brand-detector');
      const analysis = analyzeQuery(currentQ);

      if (analysis.brand) {
        window.location.href = buildSearchUrl(currentQ, {
          brand: analysis.brand.brand,
          category: analysis.category ? analysis.category : undefined,
          model: analysis.model ? analysis.model : undefined,
        }, '/ro');
      } else {
        window.location.href = buildSearchUrl(currentQ, {}, '/ro');
      }
    }
  };

  const trackSearchBeforeNavigate = useCallback(async (query: string) => {
    if (typeof window === 'undefined' || !query.trim()) return;
    try {
      const { analyzeQuery } = await import('@/lib/ai/brand-detector');
      const { storeSearchPattern } = await import('@/lib/ai/adaptive-learning');
      const analysis = analyzeQuery(query);
      storeSearchPattern(query, query, analysis.category, 'text', false);
      const searchHistory = JSON.parse(localStorage.getItem('user_search_history') || '[]');
      const newHistory = [
        { query, timestamp: Date.now() },
        ...searchHistory.filter((item: { query?: string }) => item.query !== query),
      ].slice(0, 20);
      localStorage.setItem('user_search_history', JSON.stringify(newHistory));
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user?.id) {
        fetch('/api/search/save-history', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query, resultsCount: 0, userId: session.user.id }),
        }).catch((err) => console.warn('Error saving search history:', err));
      }
    } catch {
      // Silent
    }
  }, []);

  const handleHeaderSuggestSelect = useCallback(
    (item: {
      label: string;
      q: string;
      phrase_norm?: string;
      type?: string;
      categorySlug?: string;
      subcategorySlug?: string;
      meta?: Record<string, unknown>;
    }) => {
      setSearchQuery(item.label);
      setShowSearchSuggestions(false);
      setHeaderSuggestActiveIndex(-1);
      didYouMeanShownRef.current = null;
      trackSearchBeforeNavigate(item.q);
      const phraseNorm = item.phrase_norm ?? item.q.trim().toLowerCase().replace(/\s+/g, " ");
      const kind = item.type ?? "query";
      if (suggestQueryNorm.length >= 2) {
        fetch("/api/ro/search/suggest/track", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            event_type: "click",
            query_norm: suggestQueryNorm.slice(0, 120),
            phrase_norm: phraseNorm.slice(0, 120),
            kind,
          }),
        }).catch(() => {});
      }
      const params = new URLSearchParams();
      params.set("q", item.q);
      const metaCategory =
        typeof item.meta?.categorySlug === "string" ? item.meta.categorySlug : undefined;
      const metaSubcategory =
        typeof item.meta?.subcategorySlug === "string" ? item.meta.subcategorySlug : undefined;
      const categorySlug = item.categorySlug ?? metaCategory;
      const subcategorySlug = item.subcategorySlug ?? metaSubcategory;
      if (categorySlug) params.set("category", categorySlug);
      if (subcategorySlug) params.set("subcategory", subcategorySlug);
      window.location.href = `/ro?${params.toString()}`;
    },
    [trackSearchBeforeNavigate, suggestQueryNorm]
  );

  const handleDidYouMeanClick = useCallback(
    (suggestedQuery: string) => {
      const orig = didYouMeanShownRef.current?.original ?? suggestQueryNorm;
      setShowSearchSuggestions(false);
      setHeaderSuggestActiveIndex(-1);
      didYouMeanShownRef.current = null;
      trackAutocorrectEvent({
        event_type: "autocorrect_accepted",
        original_query_norm: orig.slice(0, 120),
        suggested_query_norm: suggestedQuery.slice(0, 120),
        page_context: "suggest",
      }).catch(() => {});
      window.location.href = `/ro?q=${encodeURIComponent(suggestedQuery)}`;
    },
    [suggestQueryNorm]
  );

  const handleSuggestionClick = (suggestion: string | { display: string; q: string; categorySlug?: string; subcategorySlug?: string }) => {
    const q = typeof suggestion === 'string' ? suggestion : suggestion.q;
    const display = typeof suggestion === 'string' ? suggestion : suggestion.display;
    const categorySlug = typeof suggestion === 'object' && suggestion && 'categorySlug' in suggestion ? suggestion.categorySlug : undefined;
    const subcategorySlug = typeof suggestion === 'object' && suggestion && 'subcategorySlug' in suggestion ? suggestion.subcategorySlug : undefined;
    setSearchQuery(display);
    setShowSearchSuggestions(false);
    const params = new URLSearchParams();
    params.set('q', q);
    if (categorySlug) params.set('category', categorySlug);
    if (subcategorySlug) params.set('subcategory', subcategorySlug);
    window.location.href = `/ro?${params.toString()}`;
  };

  const applyInlineAutocomplete = useCallback((nextLabel: string) => {
    const next = nextLabel.trim();
    if (!next) return;
    setSearchQuery(next);
    searchInputValueRef.current = next;
    if (typeof window !== "undefined") {
      window.requestAnimationFrame(() => {
        const input = searchInputRef.current;
        if (!input) return;
        input.focus();
        // Exact ca în Google la navigare: textul complet în box, cursor la final.
        input.setSelectionRange(next.length, next.length);
      });
    }
  }, []);

  const handlePopularSuggestionSelect = useCallback((item: PopularSuggestionItem) => {
    const label = typeof item === "string" ? item : item.label;
    const q = typeof item === "string" ? item : item.q;
    const next = (q || label).trim();
    if (!next) return;
    setSearchQuery(next);
    searchInputValueRef.current = next;
    searchAutocompleteBaseRef.current = next;
    setShowSearchSuggestions(true);
    setHeaderSuggestActiveIndex(-1);
    if (typeof window !== "undefined") {
      window.requestAnimationFrame(() => {
        const input = searchInputRef.current;
        if (!input) return;
        input.focus();
        input.setSelectionRange(next.length, next.length);
      });
    }
  }, []);

  // Funcție pentru a normaliza query-ul (similar cu SearchInterface)
  const normalizeQuery = useCallback(async (rawText: string): Promise<string> => {
    let cleaned = rawText.toLowerCase().trim();

    // Folosește optimizeQuery pentru corecție ortografică avansată
    try {
      const { optimizeQuery } = await import('@/lib/ai/fuzzy-search');
      const optimized = optimizeQuery(cleaned);
      cleaned = optimized.corrected;
    } catch (err) {
      // Fallback la corecții simple
    }

    // Corecții inteligente pentru greșeli comune de transcriere vocală
    const corrections: Record<string, string> = {
      // Mașini - corecții pentru voice recognition
      'pasat': 'passat',
      'pazat': 'passat',
      'pazat 2001': 'passat 2001',
      'pasat 2001': 'passat 2001',
      'volkswagen pasat': 'volkswagen passat',
      'volkswagen pazat': 'volkswagen passat',
      'vw pasat': 'vw passat',
      'vw pazat': 'vw passat',
      // Orașe
      'broșov': 'brașov',
      'brasov': 'brașov',
      'brosov': 'brașov',
      'bucuresti': 'bucurești',
      'bucurest': 'bucurești',
      'cluj': 'cluj',
      'timisoara': 'timișoara',
      'timisora': 'timișoara',
      'iasi': 'iași',
      'constanta': 'constanța',
      // Numere - PĂSTRĂM "două" pentru că e mai natural în română (două camere, două băi, etc.)
      // Nu transformăm "două" în "2" pentru a păstra naturalitatea limbii române
      'doua': 'două', // Corectează "doua" fără diacritice în "două"
      'doi': 'două', // Corectează "doi" (masculin) în "două" (feminin/neutru) pentru camere, băi, etc.
      'trei': '3',
      'patru': '4',
      'cinci': '5',
      'șase': '6',
      'sase': '6',
      'șapte': '7',
      'sapte': '7',
      'opt': '8',
      'nouă': '9',
      'noua': '9',
      'zece': '10',
      // Imobiliare
      'câte': '',
      'cate': '',
      'cauta': '',
      'apartamente': 'apartament',
      'apartament': 'apartament',
      'camere': 'camere',
      'camera': 'camere',
      'cameră': 'camere',
      'cămară': 'camere',
      // Mașini - corecții pronunție BMW și modele
      'bemveu': 'bmw',
      'bemve': 'bmw',
      'bemv': 'bmw',
      'beemve': 'bmw',
      'beemveu': 'bmw',
      'bmv': 'bmw',
      'be em ve': 'bmw',
      'be em ve u': 'bmw',
      // BMW Seria 3 - variante românești
      'treiar': 'seria 3',
      'serie trei': 'seria 3',
      'seria trei': 'seria 3',
      'bmw treiar': 'bmw seria 3',
      'bemve treiar': 'bmw seria 3',
      'bemveu treiar': 'bmw seria 3',
      // BMW Seria 5
      'cincar': 'seria 5',
      'serie cinci': 'seria 5',
      'seria cinci': 'seria 5',
      'bmw cincar': 'bmw seria 5',
      // Alte mărci
      'mercedez': 'mercedes',
      'mercedez benz': 'mercedes benz',
      'renol': 'renault',
      'datsia': 'dacia',
      'peugeo': 'peugeot',
      'citroan': 'citroen',
      'sitron': 'citroen',
      'hiundai': 'hyundai',
      // Motorizare
      'litri': 'l',
      'litru': 'l',
      'de 2 litri': '2.0',
      'de 2.0 litri': '2.0',
      'motor 2': '2.0',
      'motor 2.0': '2.0',
    };

    Object.entries(corrections).forEach(([wrong, correct]) => {
      if (correct) {
        cleaned = cleaned.replace(new RegExp(`\\b${wrong}\\b`, 'gi'), correct);
      } else {
        cleaned = cleaned.replace(new RegExp(`\\b${wrong}\\b`, 'gi'), '');
      }
    });

    cleaned = cleaned
      .replace(/^(caut(ă|a)?|câte|cate)\s+(un|o|ună)?\s*/i, "")
      .replace(/^(este|e)\s+(vreun|un|o|ună)?\s*/i, "")
      .replace(/^pot(i|e)?\s+s(ă|a)?\s*(mi)?\s*(arăți|găsești|cauți|gasesti|cauti)?\s*/i, "")
      .replace(/^(vreau|aș\s+vrea|as\s+vrea)\s+(să|sa)?\s*(caut|caută|găsesc|găsească|gasesti)?\s*/i, "")
      .replace(/^ai\s+(vreun|un|o|ună)?\s*/i, "")
      .replace(/^ar\s+fi\s+(vreun|un|o|ună)?\s*/i, "")
      .replace(/^exist(ă|a)?\s+(vreun|un|o|ună)?\s*/i, "")
      .replace(/^(imi|îmi)\s+trebuie\s+(un|o|ună)?\s*/i, "")
      .replace(/\s+(te|vă)\s+rog\s*/gi, " ")
      .replace(/^(în|in|prin|la|pe)\s+(?!brașov|bucurești|cluj|timisoara|iasi|constanta|brasov|brosov)/i, "")
      .replace(/[\.,!?]+$/, "")
      .replace(/\s+/g, " ")
      .trim();

    if (!cleaned || cleaned.length < 3) {
      cleaned = rawText.toLowerCase().trim();
    }

    let normalizedQuery = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);

    normalizedQuery = normalizedQuery
      .replace(/\bbrașov\b/gi, 'Brașov')
      .replace(/\bbucurești\b/gi, 'București')
      .replace(/\bcluj\b/gi, 'Cluj')
      .replace(/\btimișoara\b/gi, 'Timișoara')
      .replace(/\biași\b/gi, 'Iași')
      .replace(/\bconstanța\b/gi, 'Constanța');

    return normalizedQuery;
  }, []);

  // Funcție pentru a vorbi text folosind /api/voice (AI naturală)
  const speak = useCallback(async (text: string) => {
    if (!text) return;

    // Verifică dacă TTS este enabled
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.access_token) {
        const enabledResponse = await fetch('/api/tts/enabled', {
          headers: {
          },
        });

        if (enabledResponse.ok) {
          const { enabled } = await enabledResponse.json();
          if (!enabled) {
            // TTS este dezactivat - nu vorbim
            return;
          }
        }
      }
    } catch (error) {
      // Continuă dacă verificarea eșuează (pentru compatibilitate)
      console.warn('Could not check TTS enabled status:', error);
    }

    try {
      // Oprește orice audio care rulează deja
      if (currentAudioRef.current) {
        currentAudioRef.current.pause();
        currentAudioRef.current.currentTime = 0;
        currentAudioRef.current = null;
      }

      const allAudioElements = document.querySelectorAll('audio');
      allAudioElements.forEach(audio => {
        if (!audio.paused) {
          audio.pause();
          audio.currentTime = 0;
        }
      });

      if (typeof window !== 'undefined' && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }

      const { provider, elevenLabsVoice, openAIVoice } = ttsSettings;

      const response = await fetch('/api/voice', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text,
          provider: provider || undefined,
          voiceId: elevenLabsVoice || undefined,
          voice: openAIVoice || undefined,
        }),
      });

      if (!response.ok) {
        throw new Error(`Voice API error: ${response.status}`);
      }

      const audioBlob = await response.blob();
      const audioUrl = URL.createObjectURL(audioBlob);

      const audio = new Audio(audioUrl);
      currentAudioRef.current = audio;

      return new Promise<void>((resolve, reject) => {
        audio.onended = () => {
          URL.revokeObjectURL(audioUrl);
          currentAudioRef.current = null;
          resolve();
        };
        audio.onerror = (err) => {
          URL.revokeObjectURL(audioUrl);
          currentAudioRef.current = null;
          reject(err);
        };
        audio.play().catch(reject);
      });
    } catch (error: any) {
      // Silent error handling
      throw error;
    }
  }, [ttsSettings]);

  const handleVoiceTranscript = async (transcript: string) => {
    setIsVoiceListening(false);

    if (!transcript || !transcript.trim()) {
      return;
    }

    // Normalizează query-ul cu corecție ortografică avansată
    let normalizedQuery = await normalizeQuery(transcript);

    // Corecție suplimentară pentru toate brandurile și modelele (dacă nu au fost corectate deja)
    // Folosește corecții din fuzzy-search.ts pentru consistență
    const { correctSpelling } = await import('@/lib/ai/fuzzy-search');
    normalizedQuery = correctSpelling(normalizedQuery);

    // Corecții suplimentare pentru expresii compuse (ex: "bemve treiar" -> "bmw seria 3")
    const compoundCorrections: Record<string, string> = {
      'bemve treiar': 'bmw seria 3',
      'bemveu treiar': 'bmw seria 3',
      'bmw treiar': 'bmw seria 3',
      'bemve cincar': 'bmw seria 5',
      'bemveu cincar': 'bmw seria 5',
      'bmw cincar': 'bmw seria 5',
      'volkswagen pasat': 'volkswagen passat',
      'volkswagen pazat': 'volkswagen passat',
      'vw pasat': 'vw passat',
      'vw pazat': 'vw passat',
    };

    for (const [wrong, correct] of Object.entries(compoundCorrections)) {
      const regex = new RegExp(wrong.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
      if (regex.test(normalizedQuery)) {
        normalizedQuery = normalizedQuery.replace(regex, correct);
      }
    }

    // Setează query-ul în input (ca la search scris)
    setSearchQuery(normalizedQuery);
    setShowSearchSuggestions(false);
    setShowVoiceTutorial(false);

    // Caută direct în Supabase (același mecanism ca search-ul normal) pentru răspuns rapid
    try {
      const response = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: normalizedQuery,
          limit: 20,
        }),
      });

      const data = await response.json();

      // Dacă s-au găsit rezultate, navighează direct la search page
      if (data.results && data.results.length > 0) {
        // Stochează pattern-ul pentru învățare adaptivă (succes)
        if (typeof window !== 'undefined') {
          try {
            const { analyzeQuery } = await import('@/lib/ai/brand-detector');
            const { storeSearchPattern } = await import('@/lib/ai/adaptive-learning');
            const analysis = analyzeQuery(normalizedQuery);
            storeSearchPattern(transcript, normalizedQuery, analysis.category, 'voice', true);
          } catch (err) {
            // Silent error handling
          }
        }

        // Navighează la search page cu rezultate
        const { analyzeQuery, buildSearchUrl } = await import('@/lib/ai/brand-detector');
        const analysis = analyzeQuery(normalizedQuery);

        let url = '';
        if (analysis.brand) {
          url = buildSearchUrl(normalizedQuery, {
            brand: analysis.brand.brand,
          }, '/ro');
        } else {
          url = buildSearchUrl(normalizedQuery, {}, '/ro');
        }

        window.location.href = url;
      } else {
        // Nu s-au găsit rezultate - încercă cu variante corectate
        const { optimizeQuery } = await import('@/lib/ai/fuzzy-search');
        const optimized = optimizeQuery(normalizedQuery);

        // Încearcă cu variantele corectate
        if (optimized.variants && optimized.variants.length > 0) {
          for (const variant of optimized.variants.slice(0, 2)) {
            const variantResponse = await fetch('/api/search', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                query: variant,
                limit: 5,
              }),
            });

            const variantData = await variantResponse.json();
            if (variantData.results && variantData.results.length > 0) {
              // Găsit cu variantă - folosește varianta corectată
              normalizedQuery = variant;
              break;
            }
          }
        }

        // Navighează la search page (chiar dacă nu s-au găsit rezultate)
        const url = `/search?q=${encodeURIComponent(normalizedQuery)}`;
        window.location.href = url;
      }
    } catch (error) {
      // Fallback - navighează direct la search page
      const url = `/search?q=${encodeURIComponent(normalizedQuery)}`;
      window.location.href = url;
    }
  };

  const handleVoiceButtonClick = () => {
    if (isVoiceListening) {
      setIsVoiceListening(false);
      if ((window as any).__voiceSearchStop) {
        (window as any).__voiceSearchStop();
      }
    } else {
      setIsVoiceListening(true);
      if ((window as any).__voiceSearchTrigger) {
        (window as any).__voiceSearchTrigger();
      } else {
        const voiceButton = document.querySelector('[title*="Căutare vocală"], [title*="vocală"]') as HTMLElement;
        if (voiceButton) {
          voiceButton.click();
        }
      }
    }
  };

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
      const uploadData = await uploadImageFile(avatarFile);
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

      // Reload after a short delay to show success message
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

  const handleLogout = useCallback(async () => {
    try {
      await signOutSupabaseAndClearAuthStorage();

      // Reset state
      setCurrentUserId(null);
      setUserInfo({
        firstName: '',
        lastName: '',
        email: '',
        phone: '',
        avatar: '',
      });
      setUserTokens({
        balance: 0,
        totalEarned: 0,
        totalSpent: 0,
        level: 'Basic',
      });
      setNotifications([]);
      setFavoriteAuctions([]);
      setTtsSettings({});

      // Redirect to home page
      if (typeof window !== "undefined") {
        window.location.href = "/";
      }
    } catch (error) {
      console.error('Error during sign out:', error);
      // Still redirect even if there's an error
      if (typeof window !== "undefined") {
        window.location.href = "/";
      }
    }
  }, []);

  /* Header în flux (nu fixed) – scroll cu pagina. Fără safe-area-top: .app-root are deja padding-top (--sat) pe iOS. */
  const headerBaseClasses = effectiveDarkMode
    ? 'relative w-full z-[100000] bg-gray-900 text-white'
    : 'relative w-full z-[100000] bg-white text-gray-900';

  const headerBackdropClasses = effectiveDarkMode
    ? 'before:absolute before:inset-0 before:-z-10 before:bg-gray-900 before:border-b before:border-white/10 md:before:bg-gradient-to-br md:before:from-gray-900 md:before:via-gray-900 md:before:to-gray-800 md:before:backdrop-blur-xl'
    : 'before:absolute before:inset-0 before:-z-10 before:bg-white before:border-b before:border-gray-200 before:shadow-[0_8px_24px_-12px_rgba(15,23,42,0.2)] md:before:backdrop-blur-2xl';

  return (
    <>
      {/* Header în flux – scroll cu pagina */}
      <header
        className={`${headerBaseClasses} ${headerBackdropClasses} transition-all duration-300 w-full max-w-[100vw] overflow-x-hidden`}
        suppressHydrationWarning
      >
        <div className="w-full max-w-7xl md:max-w-none mx-auto px-2 sm:px-4 md:px-4 lg:px-6 xl:px-8 min-w-0 max-w-[100vw] box-border" suppressHydrationWarning>
          <div className="flex items-center py-3 md:py-4 lg:py-5 xl:py-6 gap-1.5 sm:gap-2 md:gap-2 lg:gap-3 xl:gap-4 min-w-0 flex-nowrap" suppressHydrationWarning>
            {/* Left side - Logo and Mobile Menu Button – fără translate ca logo-ul să nu fie tăiat */}
            <div className="flex items-center flex-shrink-0 min-w-0 overflow-visible" suppressHydrationWarning>
              {/* Logo – întotdeauna complet vizibil, fără translate care tăia jumătate (meniul mobil e în footer, fără hamburger aici) */}
              <a href="/" className="hover:opacity-80 transition-opacity flex items-center flex-shrink-0 min-w-0 overflow-hidden" suppressHydrationWarning>
                <Image
                  src={effectiveDarkMode ? "/logo_alb.png" : "/logo_negru.png"}
                  alt="gobid.ro Logo"
                  width={224}
                  height={36}
                  sizes="(max-width: 380px) 100px, (max-width: 640px) 120px, (max-width: 768px) 180px, 224px"
                  className="h-[18px] max-h-[18px] w-auto max-w-[100px] sm:max-w-[130px] sm:h-[19px] sm:max-h-[19px] md:h-[30px] md:max-h-[29px] md:max-w-none lg:h-9 object-contain object-left"
                  suppressHydrationWarning
                  priority
                />
              </a>
            </div>

            {/* Mobile spacer: pushes actions to the right */}
            <div className="flex-1 md:hidden" />

            {/* Center: spacer (md–xl) + search bar (xl+) – suppressHydrationWarning evita mismatch la clase responsive server vs client */}
            <div className="flex-1 min-w-0 flex items-center mx-2 lg:mx-4" suppressHydrationWarning>
              <div className="hidden md:block xl:hidden flex-1 min-w-0 h-0" aria-hidden />
              <form
                onSubmit={handleSearchSubmit}
                className={`relative flex-1 min-w-0 max-w-[240px] lg:max-w-md xl:max-w-2xl 2xl:max-w-3xl ${isRoListingsPage ? "hidden" : "hidden xl:block"}`}
              >
                <div className="relative">
                  <div
                    className={`absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none z-10 ${effectiveDarkMode ? 'text-gray-400' : 'text-gray-300'}`}
                  >
                    {headerSearchIconBusy ||
                    (headerSuggestStatus === 'loading' && suggestFetchQuery.trim().length >= 2) ? (
                      <LoaderCircle
                        className={effectiveDarkMode ? "animate-spin text-white" : "animate-spin text-neutral-900"}
                        size={18}
                        strokeWidth={2}
                        role="status"
                        aria-label="Se încarcă…"
                      />
                    ) : (
                      <HeaderSearchLucideIcon size={18} strokeWidth={2} aria-hidden />
                    )}
                  </div>
                  <input
                    ref={searchInputRef}
                    type="text"
                    value={searchQuery}
                    onChange={(e) => {
                      const v = e.target.value;
                      searchInputValueRef.current = v;
                      searchAutocompleteBaseRef.current = v.trim();
                      setSearchQuery(v);
                      if (typeof window !== 'undefined') {
                        localStorage.setItem('header_search_query', v);
                      }
                      setShowSearchSuggestions(true);
                      setHeaderSuggestActiveIndex(-1);
                    }}
                    onFocus={() => {
                      searchAutocompleteBaseRef.current = (searchInputValueRef.current ?? searchQuery).trim();
                      setShowSearchSuggestions(true);
                      if (headerSuggestBlurTimerRef.current) {
                        clearTimeout(headerSuggestBlurTimerRef.current);
                        headerSuggestBlurTimerRef.current = null;
                      }
                    }}
                    onBlur={() => {
                      if (headerSuggestBlurTimerRef.current) clearTimeout(headerSuggestBlurTimerRef.current);
                      headerSuggestBlurTimerRef.current = setTimeout(() => {
                        const dym = didYouMeanShownRef.current;
                        if (dym) {
                          trackAutocorrectEvent({
                            event_type: "autocorrect_ignored",
                            original_query_norm: dym.original.slice(0, 120),
                            suggested_query_norm: dym.suggested.slice(0, 120),
                            page_context: "suggest",
                          }).catch(() => {});
                          didYouMeanShownRef.current = null;
                        }
                        setShowSearchSuggestions(false);
                        setHeaderSuggestActiveIndex(-1);
                        headerSuggestBlurTimerRef.current = null;
                      }, 300);
                    }}
                    onKeyDown={(e) => {
                      if (!showSearchSuggestions) return;
                      const isPopularMode = searchQuery.trim().length === 0;
                      const popularCount = popularSuggestions.length;
                      if (e.key === 'ArrowDown') {
                        e.preventDefault();
                        setHeaderSuggestActiveIndex((i) => {
                          if (isPopularMode) {
                            if (popularCount <= 0) return -1;
                            return Math.min(i + 1, popularCount - 1);
                          }
                          if (headerSuggestItems.length <= 0) return -1;
                          if (!searchAutocompleteBaseRef.current) {
                            searchAutocompleteBaseRef.current = (searchInputValueRef.current ?? searchInputRef.current?.value ?? searchQuery).trim();
                          }
                          const nextIdx = Math.min(i + 1, headerSuggestItems.length - 1);
                          if (nextIdx >= 0 && nextIdx < headerSuggestItems.length) {
                            applyInlineAutocomplete(headerSuggestItems[nextIdx].label);
                          }
                          return nextIdx;
                        });
                        return;
                      }
                      if (e.key === 'ArrowUp') {
                        e.preventDefault();
                        setHeaderSuggestActiveIndex((i) => {
                          if (headerSuggestItems.length <= 0) return -1;
                          if (!searchAutocompleteBaseRef.current) {
                            searchAutocompleteBaseRef.current = (searchInputValueRef.current ?? searchInputRef.current?.value ?? searchQuery).trim();
                          }
                          const nextIdx = Math.max(i - 1, 0);
                          if (!isPopularMode && nextIdx >= 0 && nextIdx < headerSuggestItems.length) {
                            applyInlineAutocomplete(headerSuggestItems[nextIdx].label);
                          }
                          return nextIdx;
                        });
                        return;
                      }
                      if (e.key === "Tab" && !isPopularMode && headerSuggestItems.length > 0) {
                        const currentQ = (searchInputValueRef.current ?? searchInputRef.current?.value ?? searchQuery).trim();
                        const idx =
                          headerSuggestActiveIndex >= 0 && headerSuggestActiveIndex < headerSuggestItems.length
                            ? headerSuggestActiveIndex
                            : 0;
                        const candidate = headerSuggestItems[idx]?.label ?? "";
                        if (candidate && candidate.toLowerCase().startsWith(currentQ.toLowerCase())) {
                          e.preventDefault();
                          applyInlineAutocomplete(candidate);
                          setHeaderSuggestActiveIndex(idx);
                        }
                        return;
                      }
                      if (e.key === 'Enter') {
                        const currentQ = (searchInputValueRef.current ?? searchInputRef.current?.value ?? searchQuery).trim();
                        if (isPopularMode && headerSuggestActiveIndex >= 0 && headerSuggestActiveIndex < popularCount) {
                          e.preventDefault();
                          handlePopularSuggestionSelect(popularSuggestions[headerSuggestActiveIndex]);
                        } else if (currentQ.length > 0 && headerSuggestItems.length > 0 && headerSuggestActiveIndex >= 0 && headerSuggestActiveIndex < headerSuggestItems.length) {
                          e.preventDefault();
                          handleHeaderSuggestSelect(headerSuggestItems[headerSuggestActiveIndex]);
                        } else if (currentQ.length > 0) {
                          e.preventDefault();
                          const dym = didYouMeanShownRef.current;
                          if (dym && currentQ !== dym.suggested) {
                            trackAutocorrectEvent({
                              event_type: "autocorrect_reformulated",
                              original_query_norm: dym.original.slice(0, 120),
                              suggested_query_norm: dym.suggested.slice(0, 120),
                              page_context: "suggest",
                            }).catch(() => {});
                          }
                          didYouMeanShownRef.current = null;
                          setShowSearchSuggestions(false);
                          setHeaderSuggestActiveIndex(-1);
                          window.location.href = `/ro?q=${encodeURIComponent(currentQ)}`;
                        }
                        return;
                      }
                      if (e.key === 'Escape') {
                        e.preventDefault();
                        setShowSearchSuggestions(false);
                        setHeaderSuggestActiveIndex(-1);
                        searchInputRef.current?.blur();
                      }
                    }}
                    aria-expanded={showSearchSuggestions}
                    aria-controls="search-suggestions-listbox"
                    aria-autocomplete="list"
                    aria-activedescendant={headerSuggestItems.length > 0 && headerSuggestActiveIndex >= 0 ? `suggestion-${headerSuggestActiveIndex}` : undefined}
                    autoComplete="off"
                    placeholder={headerSearchPlaceholder || headerSearchPlaceholderFullText}
                    className={`w-full pl-12 pr-20 py-3 rounded-2xl border-2 backdrop-blur-md focus:outline-none focus:ring-2 transition-all shadow-lg hover:shadow-xl ${effectiveDarkMode
                      ? 'border-white/20 bg-white/15 text-white placeholder-gray-300 hover:bg-white/20 focus:ring-white/45 focus:border-white'
                      : 'border-gray-300/50 bg-gray-50/90 text-gray-900 placeholder-gray-500 hover:bg-gray-100/90 focus:ring-black/25 focus:border-neutral-900'
                      }`}
                  />

                  {/* Imagine, Microfon, Search - în această ordine */}
                  <div className="absolute inset-y-0 right-2 flex items-center gap-1 z-10">
                    {/* Căutare după imagine */}
                    <div className="relative group">
                      <input
                        type="file"
                        ref={imageSearchInputRef}
                        accept="image/*"
                        className="hidden"
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            if (!file.type.startsWith('image/')) {
                              alert('Vă rugăm să selectați o imagine validă.');
                              return;
                            }
                            if (file.size > 10 * 1024 * 1024) {
                              alert('Imaginea este prea mare. Dimensiunea maximă este 10MB.');
                              return;
                            }
                            setImageSearchFile(file);
                            const preview = URL.createObjectURL(file);
                            setImageSearchPreview(preview);
                            setIsImageSearching(true);
                            try {
                              const formData = new FormData();
                              formData.append('image', file);
                              const searchResponse = await fetch('/api/search/image', {
                                method: 'POST',
                                body: formData,
                              });
                              const searchResult = await searchResponse.json();
                              if (!searchResponse.ok || searchResult.error) {
                                throw new Error(searchResult.message || searchResult.error || 'Search failed');
                              }
                              sessionStorage.setItem('imageSearchResults', JSON.stringify(searchResult));
                              window.location.href = `/ro?imageSearch=true`;
                            } catch (error: any) {
                              console.error('Error searching image:', error);
                              sessionStorage.setItem('imageSearchError', error.message || 'Eroare la căutarea după imagine');
                              window.location.href = `/ro?imageSearch=true`;
                            }
                            e.target.value = '';
                          }
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => imageSearchInputRef.current?.click()}
                        disabled={isImageSearching}
                        className={`flex items-center justify-center w-10 h-10 rounded-full transition-colors relative ${isImageSearching
                          ? 'bg-gray-200 dark:bg-gray-700 cursor-wait'
                          : effectiveDarkMode
                            ? 'hover:bg-gray-700/50 text-gray-400'
                            : 'hover:bg-gray-100 text-gray-500'
                          }`}
                        suppressHydrationWarning
                      >
                        <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-1.5 bg-gray-800 text-white text-xs rounded-md whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity duration-200 z-50">
                          Căutare după imagine
                          <div className="absolute top-full left-1/2 transform -translate-x-1/2 -mt-1 w-2 h-2 bg-gray-800 rotate-45"></div>
                        </div>
                        {isImageSearching ? (
                          <div className="animate-spin rounded-full h-4 w-4 border-2 border-gray-400 border-t-transparent"></div>
                        ) : (
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5" aria-hidden>
                            <path d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                            <circle cx="12" cy="13" r="3.5" />
                            <path d="M19 13v3a2 2 0 01-2 2H7a2 2 0 01-2-2v-3" />
                          </svg>
                        )}
                      </button>
                    </div>
                    {/* Microfon - căutare vocală */}
                    <div className="relative group">
                      {/* Recording Indicator Box - Desktop */}
                      {isVoiceListening && (
                        <div className="absolute -top-12 left-1/2 transform -translate-x-1/2 bg-gray-800/95 backdrop-blur-sm text-white px-4 py-2 rounded-lg shadow-xl border border-gray-700/50 whitespace-nowrap animate-in slide-in-from-top-2 duration-200 z-50">
                          <div className="flex items-center gap-2">
                            {/* Sound Wave Animation */}
                            <div className="flex items-center gap-0.5">
                              <div className="w-1 h-3 bg-white rounded-full animate-pulse" style={{ animationDelay: '0ms' }}></div>
                              <div className="w-1 h-4 bg-white rounded-full animate-pulse" style={{ animationDelay: '150ms' }}></div>
                              <div className="w-1 h-5 bg-white rounded-full animate-pulse" style={{ animationDelay: '300ms' }}></div>
                              <div className="w-1 h-4 bg-white rounded-full animate-pulse" style={{ animationDelay: '450ms' }}></div>
                              <div className="w-1 h-3 bg-white rounded-full animate-pulse" style={{ animationDelay: '600ms' }}></div>
                            </div>
                            <span className="text-sm font-semibold">Puteți vorbi...</span>
                          </div>
                          {/* Arrow pointing down */}
                          <div className="absolute -bottom-1 left-1/2 transform -translate-x-1/2 w-2 h-2 bg-gray-800/95 rotate-45 border-r border-b border-gray-700/50"></div>
                        </div>
                      )}

                      <button
                        type="button"
                        id="header-voice-search-trigger"
                        onClick={handleVoiceButtonClick}
                        className={`flex items-center justify-center w-10 h-10 rounded-full transition-colors relative ${isVoiceListening
                          ? effectiveDarkMode
                            ? 'bg-gray-700 text-red-500'
                            : 'bg-gray-200 text-red-500'
                          : effectiveDarkMode
                            ? 'hover:bg-gray-700/50 text-gray-400'
                            : 'hover:bg-gray-100 text-gray-500'
                          }`}
                      >
                        {/* Tooltip - Google Style */}
                        {!isVoiceListening && (
                          <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-1.5 bg-gray-800 text-white text-xs rounded-md whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity duration-200 z-50">
                            Fă o căutare vocală
                            <div className="absolute top-full left-1/2 transform -translate-x-1/2 -mt-1 w-2 h-2 bg-gray-800 rotate-45"></div>
                          </div>
                        )}
                        {isVoiceListening ? (
                          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 0 0 6-6v-1.5m-6 7.5a6 6 0 0 1-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 0 1-3-3V4.5a3 3 0 1 1 6 0v8.25a3 3 0 0 1-3 3Z" />
                          </svg>
                        ) : (
                          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 0 0 6-6v-1.5m-6 7.5a6 6 0 0 1-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 0 1-3-3V4.5a3 3 0 1 1 6 0v8.25a3 3 0 0 1-3 3Z" />
                          </svg>
                        )}
                      </button>

                      {/* Hidden VoiceSearch component for actual functionality */}
                      <div className="hidden">
                        <VoiceSearch
                          onTranscript={handleVoiceTranscript}
                          onInterimTranscript={(text) => {
                            setSearchQuery(text);
                          }}
                          onListeningChange={setIsVoiceListening}
                          disabled={searchLoading}
                          useWhisper={true}
                        />
                      </div>
                    </div>
                  </div>

                  {searchLoading && (
                    <div className="absolute inset-y-0 right-20 pr-3 flex items-center z-10">
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    </div>
                  )}

                  {/* Suggestions: q empty = Căutări frecvente; q non-empty = instant RO suggest (portal) */}
                  {showSearchSuggestions && (
                    <>
                      {searchQuery.trim().length === 0 ? (
                        <div
                          ref={searchSuggestionsRef}
                          className={`backdrop-blur-xl rounded-2xl shadow-2xl w-96 max-h-[600px] overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200 ${searchSuggestionsPosition ? '' : 'absolute top-full left-0 mt-2'
                            } ${effectiveDarkMode
                              ? 'bg-gray-900/98 border border-white/10'
                              : 'bg-white/98 border border-gray-200/50'
                            }`}
                          style={searchSuggestionsPosition ? {
                            position: 'fixed',
                            top: searchSuggestionsPosition.top,
                            left: searchSuggestionsPosition.left,
                            width: Math.max(searchSuggestionsPosition?.width ?? 384, 384),
                            zIndex: 100002,
                          } : undefined}
                        >
                          <div className="flex flex-col h-full overflow-y-auto max-h-[600px]">
                            <div className="flex-1 flex-shrink-0 border-b" style={{ borderColor: effectiveDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)' }}>
                              <div className={`px-4 py-3 text-xs font-bold uppercase tracking-wider sticky top-0 z-10 ${effectiveDarkMode ? 'text-gray-400 border-white/10 bg-gray-900/95' : 'text-gray-600 border-gray-200 bg-white/95'
                                }`}>
                                {isFromHistory ? 'Căutări recente' : 'Căutări frecvente'}
                              </div>
                              <div className="p-2 flex flex-wrap gap-2">
                                {popularSuggestions.map((item: PopularSuggestionItem, idx: number) => {
                                  const label = typeof item === 'string' ? item : item.label;
                                  return (
                                    <button
                                      type="button"
                                      key={`${label}-${idx}`}
                                      onClick={() => handlePopularSuggestionSelect(item)}
                                      onMouseEnter={() => setHeaderSuggestActiveIndex(idx)}
                                      className={`flex-shrink-0 px-4 py-2 rounded-none text-sm font-medium transition-all duration-200 whitespace-nowrap border ${effectiveDarkMode
                                        ? (headerSuggestActiveIndex === idx
                                          ? 'bg-white/10 text-white border-white/55'
                                          : 'bg-gray-800 hover:bg-gray-700 text-gray-200 border-gray-700 hover:border-gray-600')
                                        : (headerSuggestActiveIndex === idx
                                          ? 'bg-neutral-100 text-neutral-900 border-neutral-900 shadow-sm'
                                          : 'bg-white hover:bg-gray-50 text-gray-700 border-gray-200 hover:border-gray-300 shadow-sm')
                                        }`}
                                    >
                                      {label}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <SearchSuggestionsDropdown
                          open={showSearchSuggestions}
                          items={headerSuggestItems}
                          activeIndex={
                            headerSuggestItems.length === 0
                              ? -1
                              : Math.min(headerSuggestActiveIndex, headerSuggestItems.length - 1)
                          }
                          onHoverIndex={setHeaderSuggestActiveIndex}
                          onSelect={handleHeaderSuggestSelect}
                          anchorRef={searchInputRef}
                          query={searchQuery}
                          isDarkMode={effectiveDarkMode}
                          showEmptyState
                          status={headerSuggestStatus}
                          maxVisible={8}
                          didYouMean={
                            suggestMeta?.didYouMean?.trim() && suggestMeta.didYouMean.trim() !== suggestQueryNorm
                              ? suggestMeta.didYouMean.trim()
                              : null
                          }
                          onDidYouMeanClick={handleDidYouMeanClick}
                        />
                      )}
                    </>
                  )}
                  {/* Legacy sections below disabled – header uses instant RO suggest only */}
                  {false && searchQuery.trim().length >= 2 && searchMeta != null && (searchMeta!.expandedLocation || searchMeta!.expandedCategory || searchMeta!.termsReduced) && (
                          <div className={`px-4 py-2 text-xs border-b ${effectiveDarkMode ? 'text-amber-200/90 bg-amber-900/20 border-amber-700/30' : 'text-amber-800 bg-amber-50 border-amber-200'}`}>
                            {searchMeta!.expandedLocation && 'Nu avem rezultate în această locație. '}
                            {searchMeta!.expandedCategory && 'Am inclus și categorii apropiate. '}
                            {searchMeta!.termsReduced && 'Căutare extinsă.'}
                          </div>
                        )}
                        {false && searchQuery.trim().length >= 2 && searchSubcategories.length > 0 && (
                          <div className="flex-1 overflow-y-auto border-b" style={{ borderColor: effectiveDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)', maxHeight: '300px' }}>
                            <div className={`px-4 py-3 text-[10px] font-black uppercase tracking-[0.1em] border-b sticky top-0 z-10 flex items-center gap-2 ${effectiveDarkMode ? 'text-blue-400 border-white/10 bg-gray-900/95' : 'text-blue-600 border-gray-200 bg-white/95'
                              }`}>
                              <MagnifyingGlassIcon className="w-3 h-3" />
                              Categorii și Branduri
                            </div>
                            <div className="p-1">
                              {searchSubcategories.slice(0, 8).map((s, i) => (
                                <button
                                  key={i}
                                  type="button"
                                  onClick={() => handleSuggestionClick(s)}
                                  className={`w-full text-left px-3 py-2.5 rounded-xl transition-all duration-200 group flex items-center gap-3 ${effectiveDarkMode ? 'hover:bg-white/5 text-white' : 'hover:bg-blue-50 text-gray-900'
                                    }`}
                                >
                                  <div className={`w-8 h-8 rounded-lg flex-shrink-0 flex items-center justify-center transition-colors ${effectiveDarkMode ? 'bg-gray-800 group-hover:bg-blue-500/20' : 'bg-gray-100 group-hover:bg-blue-100'
                                    }`}>
                                    <i className={`text-base ${s.brand ? 'ri-shield-star-line' : 'ri-layout-grid-line'} ${effectiveDarkMode ? 'text-gray-400 group-hover:text-blue-400' : 'text-gray-500 group-hover:text-blue-600'
                                      }`}></i>
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <div className="font-bold text-sm leading-tight">{s.display}</div>
                                    {(s.category || s.subcategory) && (
                                      <div className={`text-[11px] font-medium mt-0.5 opacity-60`}>
                                        {[s.category, s.subcategory].filter(Boolean).join(' › ')}
                                      </div>
                                    )}
                                  </div>
                                  {s.brand && (
                                    <span className={`flex-shrink-0 text-[10px] font-bold uppercase transition-colors px-1.5 py-0.5 rounded bg-orange-500/10 text-orange-500`}>
                                      BRAND
                                    </span>
                                  )}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}

                        {false && searchQuery.trim().length >= 2 && productSuggestions.length > 0 && (
                          <div className="flex-1 overflow-y-auto border-b" style={{ borderColor: effectiveDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)', maxHeight: '350px' }}>
                            <div className={`px-4 py-3 text-[10px] font-black uppercase tracking-[0.1em] border-b sticky top-0 z-10 flex items-center gap-2 ${effectiveDarkMode ? 'text-orange-400 border-white/10 bg-gray-900/95' : 'text-orange-600 border-gray-200 bg-white/95'
                              }`}>
                              <i className="ri-shopping-bag-3-line text-sm"></i>
                              Produse Recomandate
                            </div>
                            <div className="p-1 space-y-0.5">
                              {productSuggestions.slice(0, 6).map((p, i) => (
                                <button
                                  key={p.id || i}
                                  type="button"
                                  onClick={() => {
                                    if (p.url) window.location.href = p.url;
                                    else handleSuggestionClick(p.title);
                                  }}
                                  className={`w-full text-left px-2 py-2 rounded-xl transition-all duration-200 group flex items-center gap-3 ${effectiveDarkMode ? 'hover:bg-white/5 text-white' : 'hover:bg-orange-50 text-gray-900'
                                    }`}
                                >
                                  <div className="w-12 h-12 rounded-lg overflow-hidden flex-shrink-0 bg-gray-200 border border-gray-200/20">
                                    <img
                                      src={p.image && p.image !== '/no-image-placeholder.svg' ? p.image : '/no-image-placeholder.svg'}
                                      alt=""
                                      className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300"
                                    />
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <div className="font-bold text-xs line-clamp-2 leading-snug">{p.title}</div>
                                    <div className="flex items-center justify-between mt-1">
                                      <div className="text-[10px] font-bold text-orange-500">
                                        {p.price ? `${p.price.toLocaleString('ro-RO')} Lei` : 'Solicită Preț'}
                                      </div>
                                      <div className="text-[10px] opacity-40 italic">{p.category || 'Produs'}</div>
                                    </div>
                                  </div>
                                </button>
                              ))}
                            </div>
                          </div>
                        )}

                        {false && searchQuery.trim().length >= 2 && searchSuggestions.length > 0 && (
                          <div className="flex-1 overflow-y-auto" style={{ maxHeight: '250px' }}>
                            <div className={`px-4 py-3 text-[10px] font-black uppercase tracking-[0.1em] border-b sticky top-0 z-10 flex items-center gap-2 ${effectiveDarkMode ? 'text-gray-400 border-white/10 bg-gray-900/95' : 'text-gray-600 border-gray-200 bg-white/95'
                              }`}>
                              <i className="ri-history-line text-sm"></i>
                              Sugestii Generale
                            </div>
                            <div className="p-1">
                              {searchSuggestions.slice(0, 8).map((suggestion, index) => {
                                const label = typeof suggestion === 'string' ? suggestion : suggestion.display;
                                const subtitle = typeof suggestion === 'object' && 'q' in suggestion
                                  ? (suggestion.display.startsWith('Toate produsele ') ? 'Colecție completă' : 'Căutare sugerată')
                                  : 'Termen de căutare';
                                return (
                                  <button
                                    key={index}
                                    type="button"
                                    onClick={() => handleSuggestionClick(suggestion)}
                                    className={`w-full text-left px-3 py-2 rounded-xl transition-all group flex items-center gap-3 ${effectiveDarkMode ? 'hover:bg-white/5 text-white' : 'hover:bg-gray-100 text-gray-900'
                                      }`}
                                  >
                                    <div className={`w-7 h-7 rounded-lg flex-shrink-0 flex items-center justify-center ${effectiveDarkMode ? 'bg-gray-800 group-hover:bg-gray-700' : 'bg-gray-100 group-hover:bg-gray-200'
                                      }`}>
                                      <i className="ri-search-line text-xs opacity-40"></i>
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <div className="font-semibold text-sm truncate">{label}</div>
                                      <div className={`text-[10px] font-medium opacity-40`}>{subtitle}</div>
                                    </div>
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        )}
                </div>
              </form>
            </div>

            {/* Right side - Desktop Navigation – gap redus pe ecrane înguste ca să încapă tot */}
            <div className="flex items-center gap-1 sm:gap-1.5 md:gap-2 lg:gap-3 xl:gap-4 flex-shrink-0 min-w-0">
              {/* Search icon – desktop (md–xl); după mount evită mismatch hidratare pathname; ascuns pe homepage sau când hideHeaderSearchIcon */}
              {mounted && !hideSearchIcon && (
                <button
                  type="button"
                  onClick={() => {
                    setShowHeaderSearchModal((prev) => {
                      const next = !prev;
                      if (next) window.scrollTo({ top: 0, behavior: 'smooth' });
                      return next;
                    });
                  }}
                  className={`hidden md:flex xl:hidden items-center justify-center p-1.5 sm:p-2 rounded-lg transition-colors flex-shrink-0 ${effectiveDarkMode
                    ? 'hover:bg-white/10 text-gray-300'
                    : 'hover:bg-gray-200 text-gray-600'
                    }`}
                  title="Caută"
                  aria-label="Caută"
                >
                  <MagnifyingGlassIcon className="w-5 h-5" />
                </button>
              )}

              {/* Dark Mode Toggle Button - Desktop Only (hidden on mobile, available in mobile menu) */}
              <button
                onClick={onToggleDarkMode}
                className={`group hidden md:flex items-center justify-center p-1.5 sm:p-2 rounded-lg transition-all duration-300 shadow-lg hover:shadow-xl transform hover:scale-105 overflow-hidden relative ${effectiveDarkMode
                  ? 'bg-gray-800/80 hover:bg-gray-700/80 border border-gray-700/50'
                  : 'bg-gray-100/80 hover:bg-gray-200/80 border border-gray-300/50'
                  }`}
                title={effectiveDarkMode ? 'Comută la modul zi' : 'Comută la modul noapte'}
              >
                {/* Efect de lumină */}
                <span
                  className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-700 ease-in-out pointer-events-none"
                  style={{
                    background: 'linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.3), transparent)',
                    width: '100%',
                    height: '100%',
                    zIndex: 1
                  }}
                />
                <span className="relative z-10">
                  {effectiveDarkMode ? (
                    <SunIcon className="w-4 h-4 sm:w-5 sm:h-5 text-yellow-400" />
                  ) : (
                    <MoonIcon className="w-4 h-4 sm:w-5 sm:h-5 text-gray-700" />
                  )}
                </span>
              </button>

              {/* Search Button - mobil: doar pe homepage (/); după mount: același arbore DOM ca pe SSR (pathname) */}
              {mounted && !hideHeaderSearchIcon && isStrictHomepage && (
                <button
                  type="button"
                  onClick={() => {
                    setShowHeaderSearchModal((prev) => {
                      const next = !prev;
                      if (next) window.scrollTo({ top: 0, behavior: 'smooth' });
                      return next;
                    });
                  }}
                  className={`md:hidden p-1.5 sm:p-2 rounded-lg transition-colors flex items-center justify-center ${effectiveDarkMode
                    ? 'text-white hover:bg-white/10'
                    : 'text-gray-900 hover:bg-gray-200/80'
                    }`}
                  aria-label="Caută"
                >
                  <MagnifyingGlassIcon className="w-5 h-5 sm:w-6 sm:h-6 flex-shrink-0" />
                </button>
              )}

              {/* Notifications Button */}
              <div className="relative notification-dropdown inline-block z-[99999]">
                <button
                  ref={notificationTriggerRef}
                  onClick={() => setShowNotificationDropdown(!showNotificationDropdown)}
                  className="group relative p-1.5 sm:p-2 rounded-lg transition-all duration-300 bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-700 hover:to-blue-600 shadow-lg hover:shadow-xl transform hover:scale-105 flex items-center justify-center"
                >
                  {/* Efect de lumină */}
                  <span
                    className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-700 ease-in-out pointer-events-none rounded-lg"
                    style={{
                      background: 'linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.3), transparent)',
                      width: '100%',
                      height: '100%',
                      zIndex: 0
                    }}
                  />
                  <BellIcon className="w-4 h-4 sm:w-5 sm:h-5 text-white relative z-10 flex-shrink-0" />
                </button>
                {unreadCount > 0 && (
                  <span className="absolute top-0 right-0 bg-red-500 text-white text-xs rounded-full h-5 w-5 flex items-center justify-center font-bold z-20 pointer-events-none transform translate-x-1/2 -translate-y-1/2">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}

                {/* Notification Dropdown - pe mobil: fixed, dimensiuni automate după viewport; pe desktop: absolute */}
                {showNotificationDropdown && isMounted && typeof document !== 'undefined' && createPortal(
                  <div
                    className={`notification-dropdown fixed left-2 right-2 sm:left-3 sm:right-3 w-[calc(100vw-1rem)] sm:w-[calc(100vw-1.5rem)] max-w-[calc(100vw-1rem)] sm:max-w-[calc(100vw-1.5rem)] md:left-auto md:right-auto md:w-[40rem] md:max-w-[40rem] max-h-[min(85dvh,calc(100dvh-5rem))] md:max-h-96 rounded-xl shadow-2xl border z-[100001] flex flex-col ${effectiveDarkMode
                      ? 'bg-gray-800 border-gray-700'
                      : 'bg-white border-gray-200'
                      }`}
                    style={
                      notificationDropdownPosition?.isDesktop
                        ? {
                          top: notificationDropdownPosition.top,
                          right: notificationDropdownPosition.right,
                        }
                        : {
                          top: notificationDropdownPosition?.top ?? 56,
                        }
                    }
                  >
                    <div className={`p-3 sm:p-4 border-b flex-shrink-0 ${effectiveDarkMode ? 'border-gray-700' : 'border-gray-200'
                      }`}>
                      <div className="flex items-center justify-between gap-2">
                        <h3 className={`font-semibold text-sm sm:text-base truncate ${effectiveDarkMode ? 'text-white' : 'text-gray-900'
                          }`}>Notificări</h3>
                        {notifications.length > 0 && (
                          <button
                            onClick={clearAllNotifications}
                            className={`text-xs sm:text-sm flex-shrink-0 ${effectiveDarkMode
                              ? 'text-gray-300 hover:text-white'
                              : 'text-gray-600 hover:text-gray-900'
                              }`}
                          >
                            Șterge toate
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="overflow-y-auto flex-1 min-h-0 max-h-[min(75dvh,calc(100dvh-10rem))] md:max-h-96">
                      {notifications.length === 0 ? (
                        <div className={`p-4 text-center text-sm ${effectiveDarkMode ? 'text-gray-300' : 'text-gray-600'
                          }`}>
                          Nu ai notificări noi
                        </div>
                      ) : (
                        notifications.map((notification) => {
                          // Funcție pentru a obține URL-ul de redirecționare din metadata
                          const getNotificationUrl = async (metadata: any): Promise<{ url: string; useLocalStorage?: boolean; data?: any } | null> => {
                            if (!metadata || typeof metadata !== 'object') return null;

                            // Generic target URL from metadata (used by token refund notifications)
                            if (typeof metadata.target_url === 'string' && metadata.target_url.trim()) {
                              return { url: metadata.target_url.trim() };
                            }

                            // Pentru mesaje de chat
                            if (metadata.type === 'product_chat_message' && metadata.product_id && metadata.chat_id) {
                              // Verifică dacă utilizatorul este vânzător sau cumpărător
                              try {
                                const { data: { session } } = await supabase.auth.getSession();
                                if (!session) return null;

                                const { data: chat } = await supabase
                                  .from('product_chats')
                                  .select('buyer_user_id, seller_user_id')
                                  .eq('id', metadata.chat_id)
                                  .maybeSingle();

                                if (chat) {
                                  const isSeller = chat.seller_user_id === session.user.id;
                                  const isBuyer = chat.buyer_user_id === session.user.id;

                                  if (isSeller) {
                                    // Utilizatorul este vânzător - redirecționează către ofertele_mele
                                    return {
                                      url: '/dashboard/ofertele_mele',
                                      useLocalStorage: true,
                                      data: {
                                        openChat: true,
                                        productId: metadata.product_id,
                                        chatId: metadata.chat_id,
                                        senderId: metadata.sender_id,
                                        buyerId: chat.buyer_user_id
                                      }
                                    };
                                  } else if (isBuyer) {
                                    // Utilizatorul este cumpărător - redirecționează către ofertele_mele
                                    return {
                                      url: '/dashboard/ofertele_mele',
                                      useLocalStorage: true,
                                      data: {
                                        openChat: true,
                                        productId: metadata.product_id,
                                        chatId: metadata.chat_id,
                                        senderId: metadata.sender_id,
                                        sellerId: chat.seller_user_id
                                      }
                                    };
                                  }
                                }
                              } catch (error) {
                                console.error('[UniversalHeader] Error checking chat:', error);
                              }

                              // Fallback: presupunem că este vânzător
                              return {
                                url: '/dashboard/ofertele_mele',
                                useLocalStorage: true,
                                data: {
                                  openChat: true,
                                  productId: metadata.product_id,
                                  chatId: metadata.chat_id,
                                  senderId: metadata.sender_id
                                }
                              };
                            }

                            // Pentru oferte (bids) - vânzătorul primește notificare
                            if (metadata.type === 'bid' && metadata.product_id) {
                              return {
                                url: '/dashboard/ofertele_mele',
                                useLocalStorage: true,
                                data: {
                                  openConversation: true,
                                  productId: metadata.product_id,
                                  bidId: metadata.bid_id
                                }
                              };
                            }

                            // Pentru contraoferte - cumpărătorul primește notificare
                            if (metadata.type === 'counter_offer' && metadata.product_id) {
                              return {
                                url: '/dashboard/ofertele_mele',
                                useLocalStorage: true,
                                data: {
                                  openConversation: true,
                                  productId: metadata.product_id,
                                  bidId: metadata.bid_id
                                }
                              };
                            }

                            // Pentru oferte acceptate
                            if (metadata.type === 'bid_accepted' && metadata.product_slug) {
                              return { url: `/live_bid/${metadata.product_slug}` };
                            }

                            // Fallback: dacă există product_slug
                            if (metadata.product_slug) {
                              return { url: `/live_bid/${metadata.product_slug}` };
                            }

                            return null;
                          };

                          // Funcție helper pentru a obține URL-ul (sincron pentru a putea fi folosită în render)
                          const getNotificationUrlSync = (metadata: any): { url: string; useLocalStorage?: boolean; data?: any } | null => {
                            if (!metadata || typeof metadata !== 'object') return null;

                            // Generic target URL from metadata (used by token refund notifications)
                            if (typeof metadata.target_url === 'string' && metadata.target_url.trim()) {
                              return { url: metadata.target_url.trim() };
                            }

                            // Pentru mesaje de chat - toate către ofertele_mele
                            if (metadata.type === 'product_chat_message' && metadata.product_id) {
                              return {
                                url: '/dashboard/ofertele_mele',
                                useLocalStorage: true,
                                data: {
                                  openChat: true,
                                  productId: metadata.product_id,
                                  chatId: metadata.chat_id,
                                  senderId: metadata.sender_id,
                                  messageId: metadata.message_id // Include messageId pentru a marca mesajul ca citit
                                }
                              };
                            }

                            // Pentru oferte (bids) - toate către ofertele_mele
                            if (metadata.type === 'bid' && metadata.product_id) {
                              return {
                                url: '/dashboard/ofertele_mele',
                                useLocalStorage: true,
                                data: {
                                  openConversation: true,
                                  productId: metadata.product_id,
                                  bidId: metadata.bid_id
                                }
                              };
                            }

                            // Pentru contraoferte - toate către ofertele_mele
                            if (metadata.type === 'counter_offer' && metadata.product_id) {
                              return {
                                url: '/dashboard/ofertele_mele',
                                useLocalStorage: true,
                                data: {
                                  openConversation: true,
                                  productId: metadata.product_id,
                                  bidId: metadata.bid_id
                                }
                              };
                            }

                            // Pentru oferte primite - seller view
                            if (metadata.type === 'bid_received' && metadata.product_id) {
                              return {
                                url: '/dashboard/ofertele_mele',
                                useLocalStorage: true,
                                data: {
                                  openConversation: true,
                                  productId: metadata.product_id,
                                  bidId: metadata.bid_id
                                }
                              };
                            }

                            // Pentru oferte acceptate/refuzate
                            if ((metadata.type === 'bid_accepted' || metadata.type === 'bid_rejected') && metadata.product_id) {
                              return {
                                url: '/dashboard/ofertele_mele',
                                useLocalStorage: true,
                                data: {
                                  openConversation: true,
                                  productId: metadata.product_id,
                                  bidId: metadata.bid_id
                                }
                              };
                            }

                            // Fallback: dacă există product_id → ofertele_mele
                            if (metadata.product_id) {
                              return {
                                url: '/dashboard/ofertele_mele',
                                useLocalStorage: true,
                                data: {
                                  openConversation: true,
                                  productId: metadata.product_id
                                }
                              };
                            }

                            // Fallback: dacă există product_slug → pagina produsului
                            if (metadata.product_slug) {
                              return { url: `/live_bid/${metadata.product_slug}` };
                            }

                            // Default fallback - ofertele_mele (pentru orice tip de notificare legată de bids/offers)
                            if (metadata.type && (
                              metadata.type.includes('bid') ||
                              metadata.type.includes('offer') ||
                              metadata.type.includes('chat')
                            )) {
                              return { url: '/dashboard/ofertele_mele' };
                            }

                            return null;
                          };

                          const notificationUrlData = getNotificationUrlSync(notification.metadata);
                          const notificationUrl = notificationUrlData?.url || null;

                          // Obține ID-ul utilizatorului din metadata
                          const userId = notification.metadata?.sender_id || notification.metadata?.bidder_id || notification.metadata?.bid_user_id;
                          const userInfo = userId ? notificationUserInfos[userId] : null;

                          // Debug logging pentru a vedea de ce nu apare avatarul
                          if (process.env.NODE_ENV === 'development') {
                            if (userId && !userInfo) {
                            } else if (userId && userInfo) {
                            } else {
                            }
                          }

                          return (
                            <div
                              key={notification.id}
                              onClick={async () => {
                                markAsRead(notification.id);

                                // Pentru mesaje de chat, verificăm chat-ul pentru a obține sellerId/buyerId
                                if (notification.metadata?.type === 'product_chat_message' && notification.metadata?.chat_id) {
                                  try {
                                    const { data: { session } } = await supabase.auth.getSession();
                                    if (session) {
                                      const { data: chat } = await supabase
                                        .from('product_chats')
                                        .select('buyer_user_id, seller_user_id')
                                        .eq('id', notification.metadata.chat_id)
                                        .maybeSingle();

                                      if (chat) {
                                        const isSeller = chat.seller_user_id === session.user.id;
                                        const isBuyer = chat.buyer_user_id === session.user.id;

                                        // Toate notificările merg către ofertele_mele
                                        localStorage.setItem('notificationData', JSON.stringify({
                                          openChat: true,
                                          productId: notification.metadata.product_id,
                                          chatId: notification.metadata.chat_id,
                                          senderId: notification.metadata.sender_id,
                                          sellerId: chat.seller_user_id,
                                          buyerId: chat.buyer_user_id,
                                          messageId: notification.metadata.message_id // Include messageId pentru a marca mesajul ca citit
                                        }));
                                        window.location.href = '/dashboard/ofertele_mele';
                                        return;
                                      }
                                    }
                                  } catch (error) {
                                    console.error('[UniversalHeader] Error checking chat:', error);
                                  }
                                }

                                // Pentru celelalte tipuri de notificări
                                if (notificationUrlData) {
                                  // Dacă trebuie să folosim localStorage pentru a transmite date
                                  if (notificationUrlData.useLocalStorage && notificationUrlData.data) {
                                    localStorage.setItem('notificationData', JSON.stringify(notificationUrlData.data));
                                  }
                                  window.location.href = notificationUrlData.url;
                                }
                              }}
                              className={`p-3 sm:p-4 border-b transition-colors ${notificationUrl
                                ? 'cursor-pointer hover:opacity-90'
                                : 'cursor-default'
                                } ${effectiveDarkMode
                                  ? `border-gray-700 hover:bg-gray-700 ${!notification.read ? 'bg-gray-700' : ''}`
                                  : `border-gray-200 hover:bg-gray-50 ${!notification.read ? 'bg-gray-50' : ''}`
                                }`}
                            >
                              <div className="flex items-start gap-2 sm:gap-3 min-w-0">
                                {/* Avatar sau indicator de culoare */}
                                {(notification?.metadata?.type === 'admin_bonus' || notification?.metadata?.icon === 'gift-red') ? (
                                  <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full flex items-center justify-center bg-red-500 text-white shadow-md flex-shrink-0 mt-0.5 sm:mt-1">
                                    <i className="ri-gift-fill text-base sm:text-lg" aria-hidden />
                                  </div>
                                ) : userInfo?.avatar_url ? (
                                  <img
                                    src={userInfo.avatar_url}
                                    alt={userInfo.first_name || userInfo.username || 'User'}
                                    className="w-8 h-8 sm:w-10 sm:h-10 rounded-full object-cover flex-shrink-0 mt-0.5 sm:mt-1"
                                  />
                                ) : userInfo ? (
                                  <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full flex items-center justify-center text-xs sm:text-sm font-semibold bg-gray-200 text-gray-700 flex-shrink-0 mt-0.5 sm:mt-1">
                                    {(userInfo.first_name?.[0] || userInfo.username?.[0] || 'U').toUpperCase()}
                                  </div>
                                ) : (
                                  <div className={`w-2 h-2 rounded-full mt-1.5 sm:mt-2 flex-shrink-0 ${notification.type === 'success' ? 'bg-green-500' :
                                    notification.type === 'warning' ? 'bg-yellow-500' :
                                      notification.type === 'error' ? 'bg-red-500' :
                                        'bg-blue-500'
                                    }`}></div>
                                )}
                                <div className="flex-1 min-w-0 overflow-hidden">
                                  <p className={`text-xs sm:text-sm break-words ${effectiveDarkMode ? 'text-white' : 'text-gray-900'
                                    }`}>{notification.message}</p>
                                  <p className={`text-xs mt-1 ${effectiveDarkMode ? 'text-gray-400' : 'text-gray-500'
                                    }`}>
                                    {(() => {
                                      const date = new Date(notification.timestamp);
                                      const now = new Date();
                                      const diffMs = now.getTime() - date.getTime();
                                      const diffMins = Math.floor(diffMs / 60000);
                                      const diffHours = Math.floor(diffMs / 3600000);
                                      const diffDays = Math.floor(diffMs / 86400000);

                                      if (diffMins < 1) {
                                        return 'acum o clipă';
                                      } else if (diffMins < 60) {
                                        return `acum ${diffMins} ${diffMins === 1 ? 'minut' : 'minute'}`;
                                      } else if (diffHours < 24) {
                                        return `acum ${diffHours} ${diffHours === 1 ? 'oră' : 'ore'}`;
                                      } else if (diffDays === 1) {
                                        return 'acum 1 zi';
                                      } else if (diffDays < 30) {
                                        return `acum ${diffDays} zile`;
                                      } else {
                                        // Pentru date mai vechi, afișăm data completă
                                        return date.toLocaleDateString('ro-RO', { day: '2-digit', month: '2-digit', year: 'numeric' });
                                      }
                                    })()}
                                  </p>
                                </div>
                                <div className="flex items-center gap-2 flex-shrink-0">
                                  <button
                                    onClick={(e) => deleteNotification(notification.id, e)}
                                    className={`p-1.5 rounded-lg transition-colors ${effectiveDarkMode
                                      ? 'hover:bg-gray-600 text-gray-400 hover:text-red-400'
                                      : 'hover:bg-gray-200 text-gray-500 hover:text-red-600'
                                      }`}
                                    title="Șterge notificare"
                                  >
                                    <i className="ri-close-line text-sm"></i>
                                  </button>
                                </div>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>,
                  document.body
                )}
              </div>

              {/* Tokens Display – pe mobil cu badge + dropdown sumă */}
              <div className="relative token-dropdown inline-block">
                <button
                  type="button"
                  onClick={() => setShowTokenDropdown((prev) => !prev)}
                  className="group flex items-center space-x-1 sm:space-x-1.5 md:space-x-2 px-1.5 sm:px-2 md:px-2 lg:px-3 xl:px-4 py-1.5 sm:py-2 rounded-lg transition-all duration-300 bg-gradient-to-r from-yellow-600 to-yellow-500 shadow-lg hover:shadow-xl transform hover:scale-105 relative overflow-hidden"
                  aria-label="Afișează tokenii"
                  aria-expanded={showTokenDropdown}
                >
                  {/* Efect de lumină */}
                  <span
                    className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-700 ease-in-out pointer-events-none"
                    style={{
                      background: 'linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.3), transparent)',
                      width: '100%',
                      height: '100%',
                      zIndex: 1
                    }}
                  />
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true" data-slot="icon" className="w-4 h-4 sm:w-5 sm:h-5 text-white relative z-10 flex-shrink-0">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                  </svg>
                  <div className="text-white hidden md:flex items-center relative z-10 min-w-0" suppressHydrationWarning>
                    <span className="text-sm font-medium">{mounted ? userTokens.balance : 0}</span>
                    <span className="text-xs opacity-90 ml-1 hidden lg:inline">Tokens</span>
                  </div>
                  {/* Mobile Tooltip */}
                  <div className="absolute top-full left-1/2 transform -translate-x-1/2 mt-2 px-3 py-2 bg-yellow-500 text-white text-sm rounded-lg shadow-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none md:hidden" suppressHydrationWarning>
                    <div className="text-center">
                      <div className="font-semibold">{mounted ? userTokens.balance : 0} Tokens</div>
                      <div className="text-xs opacity-90">Nivel: {userTokens.level}</div>
                    </div>
                    <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-b-4 border-transparent border-b-yellow-500"></div>
                  </div>
                </button>
                {showTokenDropdown && (
                  <div className="md:hidden fixed right-3 top-14 min-w-[170px] rounded-xl shadow-2xl p-3 z-[120] bg-gradient-to-r from-yellow-600 to-yellow-500 text-white border border-yellow-400/40" suppressHydrationWarning>
                    <div className="text-xs text-white/85">Total tokeni</div>
                    <div className="text-lg font-bold mt-0.5" suppressHydrationWarning>
                      {mounted ? userTokens.balance : 0}
                    </div>
                  </div>
                )}
              </div>

              {/* Favorites Button — /favorites alias (app/(site)/favorites) matches SSR + client și restul navigației */}
              <div className="relative inline-block">
                <a
                  href="/favorites"
                  className="group relative p-1.5 sm:p-2 rounded-lg transition-all duration-300 bg-gradient-to-r from-red-600 to-red-500 hover:from-red-700 hover:to-red-600 shadow-lg hover:shadow-xl transform hover:scale-105 flex items-center justify-center"
                >
                  {/* Efect de lumină */}
                  <span
                    className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-700 ease-in-out pointer-events-none rounded-lg"
                    style={{
                      background: 'linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.3), transparent)',
                      width: '100%',
                      height: '100%',
                      zIndex: 0
                    }}
                  />
                  <HeartIcon className="w-4 h-4 sm:w-5 sm:h-5 text-white relative z-10 flex-shrink-0" />
                </a>
                {(favoriteAuctions.length + favoriteProducts.length + favoriteUsers.length) > 0 && (
                  <span className="absolute top-0 right-0 bg-blue-500 text-white text-xs rounded-full h-5 w-5 flex items-center justify-center font-bold z-20 pointer-events-none transform translate-x-1/2 -translate-y-1/2">
                    {(favoriteAuctions.length + favoriteProducts.length + favoriteUsers.length) > 9
                      ? '9+'
                      : (favoriteAuctions.length + favoriteProducts.length + favoriteUsers.length)}
                  </span>
                )}
              </div>

              {/* Level Display - Desktop Only – padding redus pe ecrane înguste */}
              <div className="group flex items-center space-x-1.5 md:space-x-2 px-2 md:px-2 lg:px-3 py-1.5 md:py-2 rounded-lg transition-all duration-300 bg-gradient-to-r from-gray-600 to-gray-500 shadow-lg hover:shadow-xl transform hover:scale-105 hidden md:flex overflow-hidden relative flex-shrink-0">
                {/* Efect de lumină */}
                <span
                  className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-700 ease-in-out pointer-events-none"
                  style={{
                    background: 'linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.3), transparent)',
                    width: '100%',
                    height: '100%',
                    zIndex: 1
                  }}
                />
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true" data-slot="icon" className="w-4 h-4 lg:w-5 lg:h-5 text-white relative z-10 flex-shrink-0">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 18.75h-9m9 0a3 3 0 0 1 3 3h-15a3 3 0 0 1 3-3m9 0v-3.375c0-.621-.503-1.125-1.125-1.125h-.871M7.5 18.75v-3.375c0-.621.504-1.125 1.125-1.125h.872m5.007 0H9.497m5.007 0a7.454 7.454 0 0 1-.982-3.172M9.497 14.25a7.454 7.454 0 0 0 .981-3.172M5.25 4.236c-.982.143-1.954.317-2.916.52A6.003 6.003 0 0 0 7.73 9.728M5.25 4.236V4.5c0 2.108.966 3.99 2.48 5.228M5.25 4.236V2.721C7.456 2.41 9.71 2.25 12 2.25c2.291 0 4.545.16 6.75.47v1.516M7.73 9.728a6.726 6.726 0 0 0 2.748 1.35m8.272-6.842V4.5c0 2.108-.966 3.99-2.48 5.228m2.48-5.492a46.32 46.32 0 0 1 2.916.52 6.003 6.003 0 0 1-5.395 4.972m0 0a6.726 6.726 0 0 1-2.749 1.35m0 0a6.772 6.772 0 0 1-3.044 0" />
                </svg>
                <div className="text-white relative z-10 min-w-0">
                  <span className="text-sm font-medium">{userTokens.level}</span>
                  <span className="text-xs opacity-90 ml-1 hidden lg:inline">Nivel</span>
                </div>
              </div>

              {/* Adaugă anunț - desktop (în header) */}
              <a
                href={canUseDashboardLinks
                  ? ((accountType === 'executor' || accountType === 'liquidator') ? `${executorDashboardBase}/add-auction` : "/dashboard/my-products?openManualModal=true")
                  : "/auth"}
                className="hidden md:flex items-center gap-1.5 px-3 py-2 rounded-lg font-semibold text-sm transition-all bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white shadow-lg hover:shadow-xl"
                aria-label="Adaugă anunț"
                title="Adaugă anunț"
              >
                <PlusCircleIcon className="w-5 h-5" />
                <span className="hidden lg:inline">Adaugă anunț</span>
              </a>

              {/* User Info - ascuns pe mobil, vizibil de la md */}
              <div className="hidden md:flex items-center space-x-1 sm:space-x-2 text-gray-300" suppressHydrationWarning>
                {!isMounted ? (
                  // Server-side render - show placeholder
                  <a
                    href="/auth"
                    className="hover:opacity-80 transition-opacity"
                    suppressHydrationWarning
                  >
                    <div className={`w-8 h-8 sm:w-10 sm:h-10 rounded-full flex items-center justify-center hover:scale-105 transition-transform cursor-pointer shadow-lg hover:shadow-xl overflow-hidden ${effectiveDarkMode
                      ? 'bg-gray-700 border border-gray-600'
                      : 'bg-gray-200 border border-gray-300'
                      }`}
                      suppressHydrationWarning>
                      <span className={`text-xs sm:text-sm font-bold ${effectiveDarkMode ? 'text-gray-300' : 'text-gray-600'
                        }`}>
                        ?
                      </span>
                    </div>
                  </a>
                ) : (
                  // Client-side render - show actual content
                  <div className="relative group" ref={userMenuRef}>
                    <button
                      ref={userMenuTriggerRef}
                      onClick={() => {
                        if (canUseDashboardLinks) {
                          setShowUserMenu(!showUserMenu);
                        } else {
                          window.location.href = "/auth";
                        }
                      }}
                      className="flex items-center gap-1 hover:opacity-80 transition-opacity focus:outline-none"
                      suppressHydrationWarning
                    >
                      <div className={`w-8 h-8 sm:w-10 sm:h-10 rounded-full flex items-center justify-center hover:scale-105 transition-transform cursor-pointer shadow-lg hover:shadow-xl overflow-hidden ${effectiveDarkMode
                        ? 'bg-gray-700 border border-gray-600'
                        : 'bg-gray-200 border border-gray-300'
                        }`}
                        suppressHydrationWarning>
                        {(currentUserId || userInfo.firstName || userInfo.lastName || userInfo.avatar || userInfo.email) ? (
                          // User is logged in - show avatar, default UNPIR logo for lichidator, or balanța (⚖️) for executors
                          (userInfo.avatar || defaultAvatar) ? (
                            <img
                              src={userInfo.avatar || defaultAvatar!}
                              alt="Avatar"
                              className="w-full h-full object-cover object-center rounded-full"
                            />
                          ) : (
                            <span className={`text-xs sm:text-sm font-semibold ${effectiveDarkMode ? 'text-white' : 'text-gray-900'
                              }`}>
                              ⚖️
                            </span>
                          )
                        ) : (
                          // User is not logged in - show same icon ca la Logare/Înregistrare
                          <UserCircleIcon className={`w-full h-full p-1 ${effectiveDarkMode ? 'text-gray-300' : 'text-gray-600'
                            }`} />
                        )}
                      </div>

                      {/* Chevron indicator - shows menu is available */}
                      {(currentUserId || userInfo.firstName || userInfo.lastName || userInfo.email) && (
                        <ChevronDownIcon
                          className={`w-3 h-3 sm:w-4 sm:h-4 transition-transform duration-200 ${showUserMenu ? 'rotate-180' : ''
                            } ${effectiveDarkMode ? 'text-white' : 'text-gray-900'
                            }`}
                        />
                      )}
                    </button>

                    {/* Dropdown Menu – randat în Portal pentru a evita tăierea de overflow din header */}
                    {showUserMenu && (currentUserId || userInfo.firstName || userInfo.lastName || userInfo.email) && typeof document !== 'undefined' && createPortal(
                      <div
                        data-user-dropdown
                        className={`fixed w-56 rounded-xl shadow-2xl border overflow-hidden z-[99999] ${effectiveDarkMode
                          ? 'bg-gray-800 border-gray-700'
                          : 'bg-white border-gray-200'
                          }`}
                        style={{
                          top: dropdownPosition?.top ?? (userMenuTriggerRef.current ? userMenuTriggerRef.current.getBoundingClientRect().bottom + 8 : 80),
                          right: dropdownPosition?.right ?? (userMenuTriggerRef.current ? window.innerWidth - userMenuTriggerRef.current.getBoundingClientRect().right : 20)
                        }}
                      >
                        <div className={`px-4 py-3 border-b ${effectiveDarkMode ? 'border-gray-700' : 'border-gray-200'
                          }`}>
                          {/* Desktop-only toggle to show/hide name in header */}
                          <div className={`hidden md:flex items-center justify-between mb-2 ${effectiveDarkMode ? 'text-gray-300' : 'text-gray-600'
                            }`}>
                            <span className="text-xs font-medium">Afișează numele în header</span>
                            <button
                              type="button"
                              onClick={toggleShowHeaderNameDesktop}
                              className={`p-1.5 rounded-md transition-colors ${effectiveDarkMode ? 'hover:bg-gray-700' : 'hover:bg-gray-100'
                                }`}
                              aria-label={showHeaderNameDesktop ? 'Ascunde numele din header' : 'Afișează numele în header'}
                              title={showHeaderNameDesktop ? 'Ascunde numele din header' : 'Afișează numele în header'}
                            >
                              {showHeaderNameDesktop ? (
                                <EyeIcon className="w-4 h-4" />
                              ) : (
                                <EyeSlashIcon className="w-4 h-4" />
                              )}
                            </button>
                          </div>
                          <p className={`text-sm font-semibold ${effectiveDarkMode ? 'text-white' : 'text-gray-900'
                            }`}>
                            {userInfo.firstName && userInfo.lastName && userInfo.firstName !== 'User'
                              ? `${userInfo.firstName} ${userInfo.lastName}`
                              : (userInfo.firstName && userInfo.firstName !== 'User' ? userInfo.firstName : (userInfo.email?.split('@')[0] || 'Utilizator'))
                            }
                          </p>
                          <p className={`text-xs ${effectiveDarkMode ? 'text-gray-400' : 'text-gray-500'
                            }`}>
                            {userInfo.email}
                          </p>
                        </div>

                        <div className="py-2">
                          <Link
                            href={(accountType === 'executor' || accountType === 'liquidator') ? executorDashboardBase : "/dashboard"}
                            prefetch={false}
                            onClick={() => setShowUserMenu(false)}
                            className={`flex items-center gap-3 px-4 py-2.5 transition-colors ${effectiveDarkMode
                              ? 'hover:bg-gray-700 text-gray-300'
                              : 'hover:bg-gray-50 text-gray-700'
                              }`}
                          >
                            <HomeIcon className="w-5 h-5" />
                            <span className="text-sm font-medium">Dashboard</span>
                          </Link>
                          <Link
                            href={(accountType === 'executor' || accountType === 'liquidator') ? `${executorDashboardBase}/settings` : "/dashboard/settings"}
                            prefetch={false}
                            onClick={() => setShowUserMenu(false)}
                            className={`flex items-center gap-3 px-4 py-2.5 transition-colors ${effectiveDarkMode
                              ? 'hover:bg-gray-700 text-gray-300'
                              : 'hover:bg-gray-50 text-gray-700'
                              }`}
                          >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                            </svg>
                            <span className="text-sm font-medium">Profilul tău</span>
                          </Link>
                          <Link
                            href={(accountType === 'executor' || accountType === 'liquidator') ? `${executorDashboardBase}/settings` : "/dashboard/settings"}
                            prefetch={false}
                            onClick={() => setShowUserMenu(false)}
                            className={`flex items-center gap-3 px-4 py-2.5 transition-colors ${effectiveDarkMode
                              ? 'hover:bg-gray-700 text-gray-300'
                              : 'hover:bg-gray-50 text-gray-700'
                              }`}
                          >
                            <Cog6ToothIcon className="w-5 h-5" />
                            <span className="text-sm font-medium">Setări</span>
                          </Link>
                          <Link
                            href={(accountType === 'executor' || accountType === 'liquidator') ? `${executorDashboardBase}/support` : "/dashboard/support"}
                            prefetch={false}
                            onClick={() => setShowUserMenu(false)}
                            className={`flex items-center gap-3 px-4 py-2.5 transition-colors ${effectiveDarkMode
                              ? 'hover:bg-gray-700 text-gray-300'
                              : 'hover:bg-gray-50 text-gray-700'
                              }`}
                          >
                            <i className="ri-customer-service-2-line text-xl" aria-hidden></i>
                            <span className="text-sm font-medium">Suport</span>
                          </Link>
                        </div>

                        <div className={`border-t ${effectiveDarkMode ? 'border-gray-700' : 'border-gray-200'
                          }`}>
                          <button
                            onClick={async () => {
                              try {
                                await signOutSupabaseAndClearAuthStorage();
                                window.location.href = '/';
                              } catch (error) {
                                console.error('Error signing out:', error);
                              }
                            }}
                            className={`w-full flex items-center gap-3 px-4 py-2.5 transition-colors ${effectiveDarkMode
                              ? 'hover:bg-red-900/20 text-red-400'
                              : 'hover:bg-red-50 text-red-600'
                              }`}
                          >
                            <ArrowRightOnRectangleIcon className="w-5 h-5" />
                            <span className="text-sm font-medium">Deconectare</span>
                          </button>
                        </div>
                      </div>,
                      document.body
                    )}
                  </div>
                )}
                <a
                  href={!isMounted
                    ? "/auth"
                    : (currentUserId || userInfo.firstName || userInfo.lastName || userInfo.email
                      ? ((accountType === 'executor' || accountType === 'liquidator') ? executorDashboardBase : "/dashboard")
                      : "/auth")}
                  className={`font-medium hidden items-center transition-colors cursor-pointer ${(currentUserId || userInfo.firstName || userInfo.lastName || userInfo.avatar || userInfo.email) ? 'md:flex' : 'xl:flex'
                    } ${effectiveDarkMode
                      ? 'text-white hover:text-yellow-400'
                      : 'text-black hover:text-yellow-500'
                    }`}
                  title="Logare / Înregistrare"
                  suppressHydrationWarning
                >
                  {!isMounted ? (
                    'Logare / Înregistrare'
                  ) : (
                    (currentUserId || userInfo.firstName || userInfo.lastName || userInfo.avatar || userInfo.email) ? (
                      showHeaderNameDesktop ? (
                        <span className="hidden sm:inline">
                          {userInfo.firstName && userInfo.lastName
                            ? `${userInfo.firstName} ${userInfo.lastName}`
                            : userInfo.firstName || userInfo.email?.split('@')[0] || 'Utilizator'
                          }
                        </span>
                      ) : null
                    ) : (
                      'Logare / Înregistrare'
                    )
                  )}
                </a>
              </div>

              {/* Logout Button - Desktop Only */}
            </div>
          </div>

          {/* Search extensibil – se deschide la click pe iconița de search (mobil + desktop când e icon); dropdown cu Căutări frecvente + sugestii */}
          {showHeaderSearchModal && (
            <div
              className={`px-3 sm:px-4 pb-3 pt-2 border-t ${effectiveDarkMode ? 'border-white/10' : 'border-gray-200/80'
                }`}
            >
              <HeroSearchBar
                variant="standalone"
                isDarkMode={effectiveDarkMode}
                className="w-full"
                popularSuggestions={popularSuggestions}
                useRoSuggestions={true}
                onSuggestionSelect={() => setShowHeaderSearchModal(false)}
              />
            </div>
          )}
        </div>
      </header>

      {/* Icon Accesibilitate - global, draggable, poziție salvată în localStorage */}
      {isMounted && typeof document !== "undefined" && !a11yIconHidden && (
        <div
          ref={a11yIconElRef}
          className="hidden md:flex fixed z-[99998] flex-col items-end gap-0"
          style={
            a11yIconPosition
              ? { left: a11yIconPosition.x, top: a11yIconPosition.y }
              : (() => {
                if (typeof document === "undefined") return { right: 16, top: 80 };
                const headerEl = document.querySelector("header");
                const headerHeight = headerEl?.getBoundingClientRect().height ?? 64;
                return { right: 16, top: headerHeight + 8 };
              })()
          }
        >
          <div className="relative shrink-0">
            <button
              type="button"
              onPointerDown={handleA11yIconPointerDown}
              className="flex items-center justify-center w-12 h-12 rounded-xl shadow-lg hover:shadow-xl active:scale-95 transition-shadow cursor-grab active:cursor-grabbing p-0 overflow-hidden bg-white border border-gray-200/80 hover:border-blue-300 touch-none"
              aria-label="Accesibilitate vizuală (poți muta iconul)"
              title="Accesibilitate vizuală (poți muta iconul)"
            >
              <img src="/icons/accessibility-icon.png" alt="" className="w-full h-full object-cover rounded-xl" aria-hidden />
            </button>
            <button
              type="button"
              onPointerDown={(e) => {
                e.stopPropagation();
              }}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                dismissA11yFloatingIcon();
              }}
              className="absolute -right-1 -top-1 z-10 flex h-6 w-6 items-center justify-center rounded-full bg-white text-gray-600 shadow-md ring-1 ring-gray-200/90 transition-colors hover:bg-gray-50 hover:text-gray-900"
              aria-label="Ascunde iconul de accesibilitate"
              title="Ascunde"
            >
              <XMarkIcon className="h-3.5 w-3.5" aria-hidden />
            </button>
          </div>
          {showVisualA11yPanel && (
            <div
              className="absolute right-0 top-full mt-2 z-50 w-[300px] min-w-[240px] max-w-[calc(100vw-2rem)] rounded-2xl border-0 bg-white shadow-[0_20px_50px_-12px_rgba(0,0,0,0.25),0_0_0_1px_rgba(0,0,0,0.05)] overflow-hidden animate-in fade-in zoom-in-95 duration-150"
              style={{ contain: "layout paint" }}
            >
              <div className="bg-gradient-to-br from-blue-500 to-blue-600 px-5 py-4 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <img src="/icons/accessibility-icon.png" alt="" className="h-9 w-9 rounded-lg object-cover" aria-hidden />
                  <p className="text-base font-semibold text-white">Accesibilitate</p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowVisualA11yPanel(false)}
                  className="flex items-center justify-center w-9 h-9 rounded-lg text-white/90 hover:text-white hover:bg-white/20 transition-colors"
                  aria-label="Închide"
                >
                  <XMarkIcon className="w-5 h-5" />
                </button>
              </div>
              <div className="p-5 space-y-4">
                <div className="flex items-center justify-between gap-4 rounded-xl bg-slate-50 px-4 py-3.5">
                  <div className="flex items-center gap-3">
                    <span className="flex h-9 w-9 items-center justify-center gap-0.5 rounded-lg bg-blue-100 text-blue-600 font-semibold" aria-hidden>
                      <span className="text-[9px] leading-none">a</span>
                      <span className="text-[15px] leading-none">A</span>
                    </span>
                    <span className="text-[15px] font-medium text-slate-800">Text mai mare</span>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={visualA11y.largeText}
                    onClick={() => setVisualA11y((v) => ({ ...v, largeText: !v.largeText }))}
                    className={`relative inline-flex h-8 w-14 shrink-0 cursor-pointer items-center rounded-full transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-2 ${visualA11y.largeText ? "bg-blue-500 shadow-lg shadow-blue-500/30" : "bg-slate-300"
                      }`}
                  >
                    <span
                      className={`inline-block h-6 w-6 transform rounded-full bg-white shadow-md transition-all duration-200 ${visualA11y.largeText ? "translate-x-7" : "translate-x-1"
                        }`}
                    />
                  </button>
                </div>
                <div className="flex items-center justify-between gap-4 rounded-xl bg-slate-50 px-4 py-3.5">
                  <div className="flex items-center gap-3">
                    <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-100 text-blue-600">
                      <i className="ri-contrast-line text-lg" aria-hidden />
                    </span>
                    <span className="text-[15px] font-medium text-slate-800">Contrast mare</span>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={visualA11y.highContrast}
                    onClick={() => setVisualA11y((v) => ({ ...v, highContrast: !v.highContrast }))}
                    className={`relative inline-flex h-8 w-14 shrink-0 cursor-pointer items-center rounded-full transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-2 ${visualA11y.highContrast ? "bg-blue-500 shadow-lg shadow-blue-500/30" : "bg-slate-300"
                      }`}
                  >
                    <span
                      className={`inline-block h-6 w-6 transform rounded-full bg-white shadow-md transition-all duration-200 ${visualA11y.highContrast ? "translate-x-7" : "translate-x-1"
                        }`}
                    />
                  </button>
                </div>
              </div>
              <div className="px-5 pb-5">
                <button
                  type="button"
                  onClick={() => {
                    setVisualA11y({ largeText: false, highContrast: false });
                    setShowVisualA11yPanel(false);
                  }}
                  className="w-full rounded-xl bg-slate-100 px-4 py-3 text-[15px] font-semibold text-slate-700 transition-all hover:bg-slate-200 active:scale-[0.98]"
                >
                  Resetează
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Mobile Menu – panou lateral + overlay; click în afara meniului sau buton X închide */}
      {isMobileMenuOpen && typeof document !== 'undefined' && createPortal(
        <>
          <div
            className="md:hidden fixed inset-0 z-[99998] bg-black/50 backdrop-blur-sm"
            onClick={() => setIsMobileMenuOpen(false)}
            aria-hidden
          />
          <div
            className={`md:hidden fixed top-0 left-0 z-[99999] w-72 max-h-[100vh] overflow-y-auto backdrop-blur-2xl border-r border-gray-200/50 shadow-2xl animate-in slide-in-from-left duration-300 transition-all duration-300 ${effectiveDarkMode
              ? 'bg-gradient-to-br from-gray-900/95 via-gray-800/90 to-gray-900/95 border-gray-700/30'
              : 'bg-gradient-to-br from-white/95 via-gray-50/90 to-white/95'
              }`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex flex-col min-h-0">
              {/* Header cu buton X accesibil */}
              <div className={`flex items-center justify-between gap-3 p-4 border-b transition-colors duration-300 ${effectiveDarkMode ? 'border-gray-700' : 'border-gray-200'
                }`}>
                <h2 className={`text-xl font-bold transition-colors duration-300 ${effectiveDarkMode ? 'text-white' : 'text-gray-900'
                  }`}>
                  Meniu
                </h2>
                <button
                  type="button"
                  onClick={() => setIsMobileMenuOpen(false)}
                  className={`flex items-center justify-center gap-2 min-w-[44px] min-h-[44px] px-3 py-2 rounded-xl transition-colors duration-300 touch-manipulation ${effectiveDarkMode
                    ? 'bg-gray-700 hover:bg-gray-600 text-white'
                    : 'bg-gray-200 hover:bg-gray-300 text-gray-800'
                    }`}
                  aria-label="Închide meniul"
                >
                  <XMarkIcon className="w-6 h-6 flex-shrink-0" />
                  <span className="text-sm font-medium">Închide</span>
                </button>
              </div>

              {/* Dark Mode Toggle */}
              <div className={`p-5 border-b transition-colors duration-300 ${effectiveDarkMode ? 'border-gray-700' : 'border-gray-200'
                }`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {isDarkMode ? (
                      <MoonIcon className={`w-5 h-5 transition-colors duration-300 ${effectiveDarkMode ? 'text-gray-400' : 'text-gray-500'
                        }`} />
                    ) : (
                      <SunIcon className={`w-5 h-5 transition-colors duration-300 ${effectiveDarkMode ? 'text-gray-400' : 'text-gray-500'
                        }`} />
                    )}
                    <span className={`text-sm font-medium transition-colors duration-300 ${effectiveDarkMode ? 'text-gray-300' : 'text-gray-700'
                      }`}>
                      {isDarkMode ? 'Mod Noapte' : 'Mod Zi'}
                    </span>
                  </div>
                  <button
                    onClick={onToggleDarkMode}
                    className={`relative inline-flex h-7 w-14 items-center rounded-full transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${effectiveDarkMode
                      ? 'focus:ring-offset-gray-800 bg-blue-600'
                      : 'focus:ring-offset-white bg-gray-300'
                      }`}
                    title={isDarkMode ? 'Comută la modul zi' : 'Comută la modul noapte'}
                  >
                    <span
                      className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform duration-300 shadow-lg ${isDarkMode ? 'translate-x-8' : 'translate-x-1'
                        }`}
                    />
                  </button>
                </div>
              </div>

              {/* Mobile menu links */}
              <div className="overflow-y-auto p-3 flex-1">
                <nav className="space-y-0.5">
                  <Link
                    href={(accountType === 'executor' || accountType === 'liquidator') ? executorDashboardBase : "/dashboard"}
                    prefetch={false}
                    onClick={() => setIsMobileMenuOpen(false)}
                    className={`flex items-center gap-3 px-3 py-3 rounded-xl transition-all duration-200 ${effectiveDarkMode
                      ? 'text-gray-300 hover:bg-gray-800 hover:text-white'
                      : 'text-gray-700 hover:bg-gray-100 hover:text-gray-900'
                      }`}
                  >
                    <HomeIcon className="w-5 h-5 flex-shrink-0" />
                    <span className="text-sm font-medium">Dashboard</span>
                  </Link>
                  <Link
                    href="/dashboard/ofertele_mele"
                    prefetch={false}
                    onClick={() => setIsMobileMenuOpen(false)}
                    className={`flex items-center gap-3 px-3 py-3 rounded-xl transition-all duration-200 ${effectiveDarkMode
                      ? 'text-gray-300 hover:bg-gray-800 hover:text-white'
                      : 'text-gray-700 hover:bg-gray-100 hover:text-gray-900'
                      }`}
                  >
                    <i className="ri-auction-line text-xl flex-shrink-0" aria-hidden />
                    <span className="text-sm font-medium">Ofertele mele</span>
                  </Link>
                  <Link
                    href={(accountType === 'executor' || accountType === 'liquidator') ? `${executorDashboardBase}/my-products` : "/dashboard/my-products"}
                    prefetch={false}
                    onClick={() => setIsMobileMenuOpen(false)}
                    className={`flex items-center gap-3 px-3 py-3 rounded-xl transition-all duration-200 ${effectiveDarkMode
                      ? 'text-gray-300 hover:bg-gray-800 hover:text-white'
                      : 'text-gray-700 hover:bg-gray-100 hover:text-gray-900'
                      }`}
                  >
                    <HSearchIcon size="m" className="flex-shrink-0" />
                    <span className="text-sm font-medium">Produsele mele</span>
                  </Link>
                  <Link
                    href="/dashboard/exclusiv"
                    prefetch={false}
                    onClick={() => setIsMobileMenuOpen(false)}
                    className={`flex items-center gap-3 px-3 py-3 rounded-xl transition-all duration-200 ${effectiveDarkMode
                      ? 'text-gray-300 hover:bg-gray-800 hover:text-white'
                      : 'text-gray-700 hover:bg-gray-100 hover:text-gray-900'
                      }`}
                  >
                    <HNotificationIcon size="m" className="flex-shrink-0" />
                    <span className="text-sm font-medium">Anunțuri exclusive</span>
                  </Link>
                  <Link
                    href="/ro"
                    prefetch={false}
                    onClick={() => setIsMobileMenuOpen(false)}
                    className={`flex items-center gap-3 px-3 py-3 rounded-xl transition-all duration-200 ${effectiveDarkMode
                      ? 'text-gray-300 hover:bg-gray-800 hover:text-white'
                      : 'text-gray-700 hover:bg-gray-100 hover:text-gray-900'
                      }`}
                  >
                    <Squares2X2Icon className="w-5 h-5 flex-shrink-0" />
                    <span className="text-sm font-medium">Categorii</span>
                  </Link>
                  <Link
                    href={(accountType === 'executor' || accountType === 'liquidator') ? `${executorDashboardBase}/settings` : "/dashboard/settings"}
                    prefetch={false}
                    onClick={() => setIsMobileMenuOpen(false)}
                    className={`flex items-center gap-3 px-3 py-3 rounded-xl transition-all duration-200 ${effectiveDarkMode
                      ? 'text-gray-300 hover:bg-gray-800 hover:text-white'
                      : 'text-gray-700 hover:bg-gray-100 hover:text-gray-900'
                      }`}
                  >
                    <HSettingsIcon size="m" className="flex-shrink-0" />
                    <span className="text-sm font-medium">Setări</span>
                  </Link>
                  <Link
                    href={(accountType === 'executor' || accountType === 'liquidator') ? `${executorDashboardBase}/support` : "/dashboard/support"}
                    prefetch={false}
                    onClick={() => setIsMobileMenuOpen(false)}
                    className={`flex items-center gap-3 px-3 py-3 rounded-xl transition-all duration-200 ${effectiveDarkMode
                      ? 'text-gray-300 hover:bg-gray-800 hover:text-white'
                      : 'text-gray-700 hover:bg-gray-100 hover:text-gray-900'
                      }`}
                  >
                    <i className="ri-customer-service-2-line text-xl flex-shrink-0" aria-hidden></i>
                    <span className="text-sm font-medium">Suport</span>
                  </Link>
                </nav>
              </div>

              {/* User Info */}
              <div className={`p-5 border-t transition-all duration-300 flex-shrink-0 ${effectiveDarkMode
                ? 'border-gray-700 bg-gray-800/50'
                : 'border-gray-200 bg-gray-50/50'
                }`}>
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-12 h-12 rounded-full flex items-center justify-center bg-gradient-to-br from-blue-500 to-blue-600 shadow-lg flex-shrink-0 overflow-hidden">
                    {(userInfo.avatar || defaultAvatar) ? (
                      <img
                        src={userInfo.avatar || defaultAvatar!}
                        alt="Avatar"
                        className="w-full h-full object-cover object-center rounded-full"
                      />
                    ) : (
                      <span className="text-base font-bold text-white">
                        {userInfo.firstName ? userInfo.firstName[0].toUpperCase() : 'U'}
                        {userInfo.lastName ? userInfo.lastName[0].toUpperCase() : 'U'}
                      </span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`font-semibold truncate transition-colors duration-300 ${effectiveDarkMode ? 'text-white' : 'text-gray-900'
                      }`}>
                      {userInfo.firstName && userInfo.lastName && userInfo.firstName !== 'User'
                        ? `${userInfo.firstName} ${userInfo.lastName}`
                        : (userInfo.firstName && userInfo.firstName !== 'User' ? userInfo.firstName : (userInfo.email?.split('@')[0] || 'Utilizator'))
                      }
                    </p>
                    <p className={`text-sm truncate transition-colors duration-300 ${effectiveDarkMode ? 'text-gray-400' : 'text-gray-600'
                      }`}>
                      {userInfo.email || 'Nu este conectat'}
                    </p>
                  </div>
                </div>

                {currentUserId ? (
                  <button
                    onClick={handleLogout}
                    className={`w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl font-medium transition-all duration-200 shadow-lg hover:shadow-xl transform hover:scale-[1.02] active:scale-[0.98] ${effectiveDarkMode
                      ? 'bg-red-600 hover:bg-red-700 text-white'
                      : 'bg-red-500 hover:bg-red-600 text-white'
                      }`}
                  >
                    <ArrowRightOnRectangleIcon className="w-5 h-5" />
                    <span>Deconectare</span>
                  </button>
                ) : (
                  <a
                    href="/auth"
                    className={`w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl font-medium transition-all duration-200 shadow-lg hover:shadow-xl transform hover:scale-[1.02] active:scale-[0.98] ${effectiveDarkMode
                      ? 'bg-green-600 hover:bg-green-700 text-white'
                      : 'bg-green-500 hover:bg-green-600 text-white'
                      }`}
                  >
                    <UserCircleIcon className="w-5 h-5" />
                    <span>Autentificare</span>
                  </a>
                )}
              </div>
            </div>
          </div>
        </>
        , document.body)}

      {/* Avatar Edit Modal */}
      {showAvatarModal && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-2 sm:p-4"
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
                  className={`mb-4 p-3 sm:p-4 rounded-lg text-sm sm:text-base ${avatarMessage.type === 'success'
                    ? 'bg-green-50 dark:bg-green-900/20 text-green-800 dark:text-green-300'
                    : 'bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-300'
                    }`}
                >
                  {avatarMessage.text}
                </div>
              )}

              {/* Current Avatar Preview */}
              <div className="flex flex-col items-center mb-6">
                <div className={`w-32 h-32 rounded-full shadow-lg overflow-hidden flex items-center justify-center border-4 ${effectiveDarkMode
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
                  {avatarPreview ? 'Preview nou avatar' : (userInfo.avatar || defaultAvatar) ? 'Avatar curent' : 'Avatar default (Balanța)'}
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

      {/* Quick actions + icon accesibilitate - global (inclusiv dashboard). Randat via portal. */}
      {isMounted && Boolean(pathname) && typeof document !== "undefined" && createPortal(
        <div className="a11y-menu-container">
          {/* Mod meniu LATERAL: zonă swipe și bară stânga */}
          {mobileNavMode === "side" && (
            <>
              {/* Zonă invizibilă pentru swipe-stânga – pointer-events-none ca pagina să rămână 100% utilizabilă (scriere, click, scroll); închiderea se face din butonul <<< pe bară */}
              {!areQuickActionsHidden && (
                <div
                  className="md:hidden fixed left-20 right-0 top-0 bottom-0 z-[39] pointer-events-none"
                  aria-hidden
                  onTouchStart={(e) => {
                    const t = e.touches[0];
                    quickActionsTouchStartXRef.current = t?.clientX ?? null;
                    quickActionsTouchStartYRef.current = t?.clientY ?? null;
                  }}
                  onTouchEnd={(e) => {
                    const startX = quickActionsTouchStartXRef.current;
                    const startY = quickActionsTouchStartYRef.current;
                    quickActionsTouchStartXRef.current = null;
                    quickActionsTouchStartYRef.current = null;
                    if (startX == null || startY == null) return;
                    const t = e.changedTouches[0];
                    const endX = t?.clientX;
                    const endY = t?.clientY;
                    if (endX == null || endY == null) return;
                    const dx = endX - startX;
                    const dy = endY - startY;
                    if (dx <= -20 && Math.abs(dx) > Math.abs(dy)) {
                      setShowVisualA11yPanel(false);
                      hideQuickActionsAndIncrement();
                    }
                  }}
                  onMouseDown={(e) => {
                    quickActionsTouchStartXRef.current = e.clientX;
                    quickActionsTouchStartYRef.current = e.clientY;
                  }}
                  onMouseUp={(e) => {
                    const startX = quickActionsTouchStartXRef.current;
                    const startY = quickActionsTouchStartYRef.current;
                    quickActionsTouchStartXRef.current = null;
                    quickActionsTouchStartYRef.current = null;
                    if (startX == null || startY == null) return;
                    const dx = e.clientX - startX;
                    const dy = e.clientY - startY;
                    if (dx <= -20 && Math.abs(dx) > Math.abs(dy)) {
                      setShowVisualA11yPanel(false);
                      hideQuickActionsAndIncrement();
                    }
                  }}
                />
              )}
              <div
                className={`a11y-menu-fixed md:hidden fixed left-0 top-1/2 -translate-y-1/2 z-40 transition-all duration-500 ease-out ${areQuickActionsHidden
                  ? "-translate-x-20 opacity-0 scale-95 pointer-events-none"
                  : "translate-x-0 opacity-100 scale-100 pointer-events-auto"
                  }`}
                onTouchStart={(e) => {
                  const t = e.touches[0];
                  quickActionsTouchStartXRef.current = t?.clientX ?? null;
                  quickActionsTouchStartYRef.current = t?.clientY ?? null;
                }}
                onTouchEnd={(e) => {
                  const startX = quickActionsTouchStartXRef.current;
                  const startY = quickActionsTouchStartYRef.current;
                  quickActionsTouchStartXRef.current = null;
                  quickActionsTouchStartYRef.current = null;
                  if (startX == null || startY == null) return;
                  const t = e.changedTouches[0];
                  const endX = t?.clientX;
                  const endY = t?.clientY;
                  if (endX == null || endY == null) return;
                  const dx = endX - startX;
                  const dy = endY - startY;
                  if (dx <= -20 && Math.abs(dx) > Math.abs(dy)) {
                    hideQuickActionsAndIncrement();
                  }
                }}
                onMouseDown={(e) => {
                  quickActionsTouchStartXRef.current = e.clientX;
                  quickActionsTouchStartYRef.current = e.clientY;
                }}
                onMouseUp={(e) => {
                  const startX = quickActionsTouchStartXRef.current;
                  const startY = quickActionsTouchStartYRef.current;
                  quickActionsTouchStartXRef.current = null;
                  quickActionsTouchStartYRef.current = null;
                  if (startX == null || startY == null) return;
                  const dx = e.clientX - startX;
                  const dy = e.clientY - startY;
                  if (dx <= -20 && Math.abs(dx) > Math.abs(dy)) {
                    hideQuickActionsAndIncrement();
                  }
                }}
              >
                <div className="relative rounded-[26px] border border-transparent bg-transparent backdrop-blur-none p-2 flex flex-row items-center gap-2">
                  <div className="flex flex-col items-center gap-2.5">
                    <button
                      type="button"
                      onClick={() => setShowVisualA11yPanel((v) => !v)}
                      className="flex items-center justify-center min-w-[52px] min-h-[52px] w-[52px] h-[52px] rounded-xl shadow-[0_8px_18px_rgba(14,116,216,0.34)] transition-transform p-0 overflow-hidden"
                      aria-label="Accesibilitate vizuală"
                      title="Accesibilitate vizuală"
                    >
                      <img src="/icons/accessibility-icon.png" alt="" className="w-full h-full object-cover rounded-xl" aria-hidden />
                    </button>

                    {showVisualA11yPanel && (
                      <div
                        className="absolute left-full ml-2 top-11 z-50 w-[300px] min-w-[240px] max-w-[calc(100vw-5rem)] rounded-2xl border-0 bg-white shadow-[0_20px_50px_-12px_rgba(0,0,0,0.25),0_0_0_1px_rgba(0,0,0,0.05)] overflow-hidden animate-in fade-in zoom-in-95 duration-150"
                        style={{ contain: "layout paint" }}
                      >
                        <div className="bg-gradient-to-br from-blue-500 to-blue-600 px-5 py-4 flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <img src="/icons/accessibility-icon.png" alt="" className="h-9 w-9 rounded-lg object-cover" aria-hidden />
                            <p className="text-base font-semibold text-white">Accesibilitate</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => setShowVisualA11yPanel(false)}
                            className="flex items-center justify-center w-9 h-9 rounded-lg text-white/90 hover:text-white hover:bg-white/20 transition-colors"
                            aria-label="Închide"
                          >
                            <XMarkIcon className="w-5 h-5" />
                          </button>
                        </div>
                        <div className="p-5 space-y-4">
                          <div className="flex items-center justify-between gap-4 rounded-xl bg-slate-50 px-4 py-3.5">
                            <div className="flex items-center gap-3">
                              <span className="flex h-9 w-9 items-center justify-center gap-0.5 rounded-lg bg-blue-100 text-blue-600 font-semibold" aria-hidden>
                                <span className="text-[9px] leading-none">a</span>
                                <span className="text-[15px] leading-none">A</span>
                              </span>
                              <span className="text-[15px] font-medium text-slate-800">Text mai mare</span>
                            </div>
                            <button
                              type="button"
                              role="switch"
                              aria-checked={visualA11y.largeText}
                              onClick={() => setVisualA11y((v) => ({ ...v, largeText: !v.largeText }))}
                              className={`relative inline-flex h-8 w-14 shrink-0 cursor-pointer items-center rounded-full transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-2 ${visualA11y.largeText ? "bg-blue-500 shadow-lg shadow-blue-500/30" : "bg-slate-300"
                                }`}
                            >
                              <span
                                className={`inline-block h-6 w-6 transform rounded-full bg-white shadow-md transition-all duration-200 ${visualA11y.largeText ? "translate-x-7" : "translate-x-1"
                                  }`}
                              />
                            </button>
                          </div>
                          <div className="flex items-center justify-between gap-4 rounded-xl bg-slate-50 px-4 py-3.5">
                            <div className="flex items-center gap-3">
                              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-100 text-blue-600">
                                <i className="ri-contrast-line text-lg" aria-hidden />
                              </span>
                              <span className="text-[15px] font-medium text-slate-800">Contrast mare</span>
                            </div>
                            <button
                              type="button"
                              role="switch"
                              aria-checked={visualA11y.highContrast}
                              onClick={() => setVisualA11y((v) => ({ ...v, highContrast: !v.highContrast }))}
                              className={`relative inline-flex h-8 w-14 shrink-0 cursor-pointer items-center rounded-full transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-2 ${visualA11y.highContrast ? "bg-blue-500 shadow-lg shadow-blue-500/30" : "bg-slate-300"
                                }`}
                            >
                              <span
                                className={`inline-block h-6 w-6 transform rounded-full bg-white shadow-md transition-all duration-200 ${visualA11y.highContrast ? "translate-x-7" : "translate-x-1"
                                  }`}
                              />
                            </button>
                          </div>
                        </div>
                        <div className="px-5 pb-5">
                          <button
                            type="button"
                            onClick={() => {
                              setVisualA11y({ largeText: false, highContrast: false });
                              setShowVisualA11yPanel(false);
                            }}
                            className="w-full rounded-xl bg-slate-100 px-4 py-3 text-[15px] font-semibold text-slate-700 transition-all hover:bg-slate-200 active:scale-[0.98]"
                          >
                            Resetează
                          </button>
                        </div>
                      </div>
                    )}

                    <Link
                      href={canUseDashboardLinks ? "/dashboard/exclusiv" : "/auth"}
                      prefetch={false}
                      className="flex items-center justify-center min-w-[48px] min-h-[48px] w-14 h-14 rounded-full border border-transparent bg-gradient-to-b from-blue-600/90 to-blue-500/90 backdrop-blur shadow-[0_8px_18px_rgba(14,116,216,0.34)] transition-transform"
                      aria-label="Anunțuri exclusive"
                      title="Anunțuri exclusive"
                    >
                      <i className="ri-vip-diamond-fill text-white text-[22px] leading-none" aria-hidden></i>
                    </Link>

                    <Link
                      href={canUseDashboardLinks ? "/dashboard/ofertele_mele" : "/auth"}
                      prefetch={false}
                      className="flex items-center justify-center min-w-[48px] min-h-[48px] w-14 h-14 rounded-full border border-transparent bg-gradient-to-b from-blue-600/90 to-blue-500/90 backdrop-blur shadow-[0_8px_18px_rgba(14,116,216,0.34)] transition-transform"
                      aria-label="Ofertele mele"
                      title="Ofertele mele"
                    >
                      <i className="ri-auction-line text-white text-[26px] leading-none" aria-hidden></i>
                    </Link>

                    <Link
                      href={canUseDashboardLinks
                        ? ((accountType === 'executor' || accountType === 'liquidator') ? `${executorDashboardBase}/add-auction` : "/dashboard/my-products?openManualModal=true")
                        : "/auth"}
                      prefetch={false}
                      className="flex items-center justify-center min-w-[48px] min-h-[48px] w-14 h-14 rounded-full border border-transparent bg-gradient-to-b from-blue-600/90 to-blue-500/90 backdrop-blur shadow-[0_8px_18px_rgba(14,116,216,0.34)] transition-transform [&>svg]:text-green-300"
                      aria-label="Adaugă anunț"
                      title="Adaugă anunț"
                    >
                      <PlusCircleIcon className="w-7 h-7" aria-hidden />
                    </Link>

                    <Link
                      href={canUseDashboardLinks
                        ? ((accountType === 'executor' || accountType === 'liquidator') ? executorDashboardBase : "/dashboard")
                        : "/auth"}
                      prefetch={false}
                      className="flex items-center justify-center min-w-[48px] min-h-[48px] w-14 h-14 rounded-full border border-transparent bg-gradient-to-b from-blue-600/90 to-blue-500/90 backdrop-blur shadow-[0_8px_18px_rgba(14,116,216,0.34)] transition-transform"
                      aria-label="Dashboard"
                      title="Dashboard"
                    >
                      <Squares2X2Icon className="w-7 h-7 text-white" />
                    </Link>

                    <button
                      type="button"
                      onClick={() => setMobileNavModeAndPersist("bottom")}
                      className="mt-1.5 flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg border border-transparent bg-gradient-to-b from-blue-600/90 to-blue-500/90 backdrop-blur text-white/90 text-[10px] font-medium shadow-[0_8px_18px_rgba(14,116,216,0.34)] hover:from-blue-500 hover:to-blue-400 transition-colors"
                      aria-label="Preferă meniul jos"
                      title="Afișează meniul jos (footer)"
                    >
                      <i className="ri-layout-grid-line text-sm" aria-hidden />
                      <span>Meniul jos</span>
                    </button>
                  </div>
                  {mobileNavTutorialEnabled && !navTutorialPermanentlyDismissed && !navTutorialTapTarget && (
                    <>
                      {/* Mână închide – în dreapta butoanelor */}
                      <div className="swipe-tutorial-hand-close rounded-lg p-1.5 flex-shrink-0 flex items-center justify-center" style={{ width: 48, height: 48, background: "transparent" }} aria-hidden>
                        <SwipeTutorialHandsIcon className="w-full h-full text-white" />
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Tutorial: mână swipe dreapta – deschide meniul (ascuns când apare mâna de tap pe Meniul jos etc.) */}
              {mobileNavTutorialEnabled && !navTutorialPermanentlyDismissed && !navTutorialTapTarget && (
                <div
                  className={`md:hidden fixed left-10 top-1/2 -translate-y-1/2 z-[38] flex flex-col items-center gap-1 transition-all duration-500 ease-out ${areQuickActionsHidden
                    ? "translate-x-0 opacity-100 pointer-events-none"
                    : "-translate-x-4 opacity-0 pointer-events-none"
                    }`}
                  aria-hidden
                >
                  <div
                    className="swipe-tutorial-hand-open rounded-lg p-1.5 flex items-center justify-center"
                    style={{ width: 56, height: 56, background: "transparent" }}
                  >
                    <SwipeTutorialHandsIcon className="w-full h-full text-white" />
                  </div>
                </div>
              )}
              <button
                type="button"
                onClick={showQuickActionsAndIncrement}
                className={`quick-tab-glow md:hidden fixed left-0 top-1/2 -translate-y-1/2 z-40 h-24 w-7 rounded-r-2xl border border-white/20 bg-gradient-to-b from-blue-600/10 via-blue-500/55 to-blue-600/10 shadow-sm flex flex-col items-center justify-center text-white transition-all duration-500 ease-out ${areQuickActionsHidden
                  ? "translate-x-0 opacity-100 scale-100 pointer-events-auto"
                  : "-translate-x-8 opacity-0 scale-90 pointer-events-none"
                  }`}
                aria-label="Arată butoanele rapide"
                title="Arată"
                onTouchStart={(e) => {
                  const t = e.touches[0];
                  quickActionsTouchStartXRef.current = t?.clientX ?? null;
                  quickActionsTouchStartYRef.current = t?.clientY ?? null;
                }}
                onTouchEnd={(e) => {
                  const startX = quickActionsTouchStartXRef.current;
                  const startY = quickActionsTouchStartYRef.current;
                  quickActionsTouchStartXRef.current = null;
                  quickActionsTouchStartYRef.current = null;
                  if (startX == null || startY == null) return;
                  const t = e.changedTouches[0];
                  const endX = t?.clientX;
                  const endY = t?.clientY;
                  if (endX == null || endY == null) return;
                  const dx = endX - startX;
                  const dy = endY - startY;
                  if (dx >= 20 && Math.abs(dx) > Math.abs(dy)) {
                    showQuickActionsAndIncrement();
                  }
                }}
                onMouseDown={(e) => {
                  quickActionsTouchStartXRef.current = e.clientX;
                  quickActionsTouchStartYRef.current = e.clientY;
                }}
                onMouseUp={(e) => {
                  const startX = quickActionsTouchStartXRef.current;
                  const startY = quickActionsTouchStartYRef.current;
                  quickActionsTouchStartXRef.current = null;
                  quickActionsTouchStartYRef.current = null;
                  if (startX == null || startY == null) return;
                  const dx = e.clientX - startX;
                  const dy = e.clientY - startY;
                  if (dx >= 20 && Math.abs(dx) > Math.abs(dy)) {
                    showQuickActionsAndIncrement();
                  }
                }}
              >
                <span className="text-[11px] font-bold leading-none">›</span>
                <span className="mt-1 block h-1 w-1 rounded-full bg-white/90"></span>
                <span className="mt-1 block h-1 w-1 rounded-full bg-white/80"></span>
              </button>
            </>
          )}

          {/* Overlay blur ușor + text pe tot parcursul tutorialului */}
          {mobileNavTutorialEnabled && isNavTutorialRunning && (
            <div className="md:hidden fixed inset-0 z-[35] bg-black/15 backdrop-blur-[3px] pointer-events-none" aria-hidden />
          )}
          {mobileNavTutorialEnabled && isNavTutorialRunning && (
            <p className="md:hidden fixed left-4 right-4 top-20 z-[36] text-center text-sm font-medium text-slate-800 bg-white/95 rounded-xl shadow-lg py-3 px-4 pointer-events-none border border-slate-200/80" aria-hidden>
              Tutorial scurt pentru înțelegerea celor 2 modele de meniuri rapide.
            </p>
          )}
          {/* Overlay mână tap pentru tutorial – poziționare exactă peste butoane (refs pentru 3 puncte și Meniul lateral) */}
          <>
            {mobileNavTutorialEnabled && !navTutorialPermanentlyDismissed && navTutorialTapTarget && (
              <div
                className="md:hidden fixed z-[100] pointer-events-none animate-in fade-in duration-300"
                style={{
                  background: "transparent",
                  ...(navTutorialTapTarget === "meniu_jos"
                    ? { left: 72, top: "72%", transform: "translateY(-50%)" }
                    : (navTutorialTapTarget === "three_dots" || navTutorialTapTarget === "lateral") && navTutorialHandRect
                      ? { left: navTutorialHandRect.left, top: navTutorialHandRect.top, transform: "translate(-50%, -50%)" }
                      : navTutorialTapTarget === "three_dots"
                        ? { left: "max(2rem, calc(env(safe-area-inset-left) + 2rem))", bottom: "calc(var(--gobid-bottom-nav-height, 72px) + var(--gobid-bottom-nav-safe-bottom, 0px) + 0.5rem)", transform: "translate(-50%, 50%)" }
                        : { left: "max(2rem, calc(env(safe-area-inset-left) + 2rem))", bottom: "calc(var(--gobid-bottom-nav-height, 72px) + var(--gobid-bottom-nav-safe-bottom, 0px) + 4.5rem)", transform: "translate(-50%, 50%)" }
                  ),
                }}
                aria-hidden
              >
                <TapHandIcon className="nav-tap-hand-icon w-14 h-14 object-contain drop-shadow-lg text-white" style={{ background: "transparent" }} />
              </div>
            )}
            {showNavTutorialModal && (
              <div className="md:hidden fixed inset-0 z-[101] flex items-center justify-center p-5 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200">
                <div className="bg-white backdrop-blur-md rounded-3xl shadow-2xl shadow-black/15 border border-slate-200/80 max-w-sm w-full p-7 animate-in zoom-in-95 duration-200">
                  <p className="text-slate-900 text-lg font-semibold text-center mb-6 leading-snug">
                    Doriți să vedeți din nou demonstrația?
                  </p>
                  <div className="flex flex-col gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        try {
                          localStorage.setItem(NAV_TUTORIAL_NEVER_KEY, "1");
                          sessionStorage.setItem(SIDEBAR_DEMO_SESSION_KEY, "1");
                        } catch { }
                        setIsNavTutorialRunning(false);
                        setNavTutorialPermanentlyDismissed(true);
                        setShowNavTutorialModal(false);
                        setNavTutorialToast("Puteți schimba modul de meniu (lateral / jos) oricând din Setări sau din opțiunile meniului, după cum vă simțiți mai confortabil.");
                        setTimeout(() => setNavTutorialToast(null), 6000);
                      }}
                      className="w-full py-3.5 rounded-2xl bg-gradient-to-b from-blue-500 to-blue-600 text-white font-semibold shadow-lg shadow-blue-500/25 hover:shadow-blue-500/30 hover:from-blue-600 hover:to-blue-700 active:scale-[0.98] transition-all duration-200"
                    >
                      Am înțeles, mulțumesc
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        try { sessionStorage.removeItem(SIDEBAR_DEMO_SESSION_KEY); } catch { }
                        setShowNavTutorialModal(false);
                        setTutorialRunKey((k) => k + 1);
                      }}
                      className="w-full py-3.5 rounded-2xl border-2 border-slate-200 bg-transparent text-slate-700 font-semibold hover:bg-slate-100 active:scale-[0.98] transition-all duration-200"
                    >
                      Încă o dată
                    </button>
                  </div>
                </div>
              </div>
            )}
            {(filtersResetToast || navTutorialToast) && (
              <div className="pointer-events-none md:hidden fixed inset-x-0 bottom-24 z-[102] flex justify-center px-4">
                <div
                  role="status"
                  className="pointer-events-auto flex w-full max-w-sm flex-col items-center gap-2.5 rounded-2xl border border-white/15 bg-slate-950/35 px-5 py-4 text-center shadow-[0_8px_32px_rgba(0,0,0,0.28)] backdrop-blur-2xl backdrop-saturate-150 animate-in fade-in slide-in-from-bottom-2 duration-200"
                >
                  <span
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/[0.12] ring-1 ring-white/20"
                    aria-hidden
                  >
                    <i
                      className={`text-[22px] leading-none ${
                        filtersResetToast ? "ri-checkbox-circle-fill text-emerald-300/95" : "ri-information-fill text-sky-300/95"
                      }`}
                    />
                  </span>
                  <p className="text-[13px] font-medium leading-snug tracking-tight text-white/95 [text-wrap:balance]">
                    {filtersResetToast ?? navTutorialToast}
                  </p>
                </div>
              </div>
            )}
          </>

          {/* Mod meniu JOS (footer) - bară fixă jos, mini tentă albastră (contur blur transparent) */}
          {mobileNavMode === "bottom" && (
            <>
              <nav
                data-gobid-bottom-nav
                className="md:hidden fixed bottom-0 left-0 right-0 z-40 flex items-center bg-gradient-to-t from-slate-900/95 via-slate-800/55 to-transparent backdrop-blur-xl rounded-t-2xl pt-2 shadow-[inset_0_2px_24px_0_rgba(59,130,246,0.35),inset_0_0_48px_-8px_rgba(96,165,250,0.28),0_-8px_28px_-4px_rgba(59,130,246,0.3)]"
                style={{
                  paddingLeft: "max(0px, env(safe-area-inset-left))",
                  paddingRight: "max(8px, env(safe-area-inset-right))",
                  paddingBottom: "max(12px, env(safe-area-inset-bottom))",
                }}
              >
                <div className="relative flex flex-1 items-center justify-start gap-0.5 self-stretch min-w-0 pl-0.5">
                  <button
                    ref={bottomNavThreeDotsRef}
                    type="button"
                    onClick={() => setShowBottomNavOptionsMenu((v) => !v)}
                    className="gobid-footer-nav-btn p-2 rounded-lg text-white hover:bg-white/10 active:scale-95 transition-transform duration-150 min-w-0 touch-manipulation"
                    aria-label="Opțiuni meniu"
                    aria-expanded={showBottomNavOptionsMenu}
                  >
                    <i className="ri-more-2-fill text-xl" aria-hidden />
                  </button>
                  {showBottomNavOptionsMenu && (() => {
                    const navMode = mobileNavMode as "side" | "bottom";
                    return (
                      <>
                        <div className="fixed inset-0 z-40" aria-hidden onClick={() => setShowBottomNavOptionsMenu(false)} />
                        <div
                          className="absolute left-0 bottom-full mb-1 z-50 w-[min(340px,calc(100vw-1.5rem))] min-w-[280px] rounded-xl bg-gradient-to-b from-gray-800/95 via-gray-800/80 to-transparent border border-white/10 shadow-xl overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-200 backdrop-blur-sm"
                          style={{ bottom: "100%", left: "0" }}
                        >
                          {/* Meniul jos – switch ON/OFF */}
                          <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-white/10 hover:bg-white/5 transition-colors">
                            <div className="flex items-center gap-3 min-w-0">
                              <i className="ri-layout-grid-line text-lg text-white/90 flex-shrink-0" aria-hidden />
                              <span className="text-sm font-medium text-white">Meniul jos (footer)</span>
                              {navFavorite === "bottom" && (
                                <span className="text-[10px] font-semibold text-amber-400/90 uppercase tracking-wide flex-shrink-0">Favorit</span>
                              )}
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0">
                              <span className={`text-[11px] font-bold uppercase ${navMode === "bottom" ? "text-green-400" : "text-white"}`}>ON</span>
                              <button
                                type="button"
                                role="switch"
                                aria-checked={navMode === "bottom"}
                                onClick={() => {
                                  setMobileNavModeAndPersist("bottom");
                                  setShowBottomNavOptionsMenu(false);
                                }}
                                className="relative inline-flex h-7 w-11 flex-shrink-0 rounded-full border border-white/20 bg-white/10 transition-transform duration-200 ease-out hover:scale-105 active:scale-95 focus:outline-none focus:ring-2 focus:ring-amber-400/50 focus:ring-offset-2 focus:ring-offset-gray-800"
                              >
                                <span className={`pointer-events-none inline-block h-5 w-5 rounded-full shadow transition-transform mt-0.5 ${navMode === "bottom" ? "translate-x-0.5 bg-green-500" : "translate-x-6 bg-red-500"}`} />
                              </button>
                              <span className={`text-[11px] font-bold uppercase ${navMode === "bottom" ? "text-white" : "text-red-400"}`}>OFF</span>
                            </div>
                          </div>
                          {/* Meniul lateral – switch ON/OFF */}
                          <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-white/10 hover:bg-white/5 transition-colors">
                            <div className="flex items-center gap-3 min-w-0">
                              <i className="ri-layout-left-line text-lg text-white/90 flex-shrink-0" aria-hidden />
                              <span className="text-sm font-medium text-white">Meniul lateral (stânga)</span>
                              {navFavorite === "side" && (
                                <span className="text-[10px] font-semibold text-amber-400/90 uppercase tracking-wide flex-shrink-0">Favorit</span>
                              )}
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0">
                              <span className={`text-[11px] font-bold uppercase ${navMode === "side" ? "text-green-400" : "text-white"}`}>ON</span>
                              <button
                                ref={bottomNavLateralRef}
                                type="button"
                                role="switch"
                                aria-checked={navMode === "side"}
                                onClick={() => {
                                  setMobileNavModeAndPersist("side");
                                  setShowBottomNavOptionsMenu(false);
                                }}
                                className="relative inline-flex h-7 w-11 flex-shrink-0 rounded-full border border-white/20 bg-white/10 transition-transform duration-200 ease-out hover:scale-105 active:scale-95 focus:outline-none focus:ring-2 focus:ring-amber-400/50 focus:ring-offset-2 focus:ring-offset-gray-800"
                              >
                                <span className={`pointer-events-none inline-block h-5 w-5 rounded-full shadow transition-transform mt-0.5 ${navMode === "side" ? "translate-x-0.5 bg-green-500" : "translate-x-6 bg-red-500"}`} />
                              </button>
                              <span className={`text-[11px] font-bold uppercase ${navMode === "side" ? "text-white" : "text-red-400"}`}>OFF</span>
                            </div>
                          </div>
                          {/* Tema deschisă / întunecată (white / dark mode) */}
                          <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-white/10 hover:bg-white/5 transition-colors">
                            <div className="flex items-center gap-3 min-w-0">
                              {effectiveDarkMode ? (
                                <i className="ri-moon-line text-lg text-white/90 flex-shrink-0" aria-hidden />
                              ) : (
                                <i className="ri-sun-line text-lg text-white/90 flex-shrink-0" aria-hidden />
                              )}
                              <span className="text-sm font-medium text-white">{effectiveDarkMode ? "Mod noapte" : "Mod zi"}</span>
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0">
                              <span className={`text-[11px] font-bold uppercase ${!effectiveDarkMode ? "text-green-400" : "text-white"}`}>Zi</span>
                              <button
                                type="button"
                                role="switch"
                                aria-checked={effectiveDarkMode}
                                onClick={() => {
                                  onToggleDarkMode();
                                }}
                                className="relative inline-flex h-7 w-11 flex-shrink-0 rounded-full border border-white/20 bg-white/10 transition-transform duration-200 ease-out hover:scale-105 active:scale-95 focus:outline-none focus:ring-2 focus:ring-amber-400/50 focus:ring-offset-2 focus:ring-offset-gray-800"
                              >
                                <span className={`pointer-events-none inline-block h-5 w-5 rounded-full shadow transition-transform mt-0.5 ${effectiveDarkMode ? "translate-x-6 bg-amber-500" : "translate-x-0.5 bg-green-500"}`} />
                              </button>
                              <span className={`text-[11px] font-bold uppercase ${effectiveDarkMode ? "text-amber-400" : "text-white"}`}>Noapte</span>
                            </div>
                          </div>
                          {/* Accesibilitate – mutată din footer (în loc intră link „Anunțuri” /ro) */}
                          <button
                            type="button"
                            onClick={() => {
                              setShowBottomNavOptionsMenu(false);
                              setShowVisualA11yPanel(true);
                            }}
                            className="flex w-full items-center gap-3 border-b border-white/10 px-4 py-3 text-left text-white transition-colors hover:bg-white/5"
                          >
                            <img
                              src="/icons/accessibility-icon.png"
                              alt=""
                              className="h-6 w-6 shrink-0 rounded-lg object-cover"
                              aria-hidden
                            />
                            <span className="text-sm font-medium">Accesibilitate</span>
                          </button>
                          {/* Tutorial meniuri – buton cu fundal albastru */}
                          <button
                            type="button"
                            onClick={() => {
                              manualNavTutorialRef.current = true;
                              setMobileNavModeAndPersist("side");
                              setShowBottomNavOptionsMenu(false);
                              setTutorialRunKey((k) => k + 1);
                            }}
                            className="w-full flex items-center gap-3 px-4 py-3 text-left text-white bg-blue-500 hover:bg-blue-600 transition-transform duration-200 ease-out hover:scale-[1.02] active:scale-[0.98]"
                          >
                            <i className="ri-lightbulb-line text-lg text-white" aria-hidden />
                            <span className="text-sm font-medium">Tutorial meniuri</span>
                          </button>
                        </div>
                      </>
                    );
                  })()}
                  <Link
                    href={canUseDashboardLinks ? "/dashboard/exclusiv" : "/auth"}
                    prefetch={false}
                    onClick={() => setShowBottomNavOptionsMenu(false)}
                    className="gobid-footer-nav-btn flex min-w-0 shrink-0 flex-col items-center justify-center gap-0.5 py-2 pr-0.5 text-white active:scale-95 transition-transform duration-150 touch-manipulation"
                    aria-label="Exclusiv"
                    title="Exclusiv"
                  >
                    <i className="ri-vip-diamond-line text-xl" aria-hidden />
                    <span className="w-full truncate text-center text-[10px] font-medium">Exclusiv</span>
                  </Link>
                </div>
                <Link href={canUseDashboardLinks ? "/dashboard/ofertele_mele" : "/auth"} prefetch={false} className="gobid-footer-nav-btn flex flex-col items-center justify-center flex-1 py-2 gap-0.5 text-white active:scale-95 transition-transform duration-150 min-w-0 touch-manipulation" aria-label="Ofertele mele" title="Ofertele mele">
                  <i className="ri-auction-line text-xl" aria-hidden />
                  <span className="text-[10px] font-medium truncate w-full text-center">Ofertele mele</span>
                </Link>
                <Link href={canUseDashboardLinks ? ((accountType === "executor" || accountType === "liquidator") ? `${executorDashboardBase}/add-auction` : "/dashboard/my-products?openManualModal=true") : "/auth"} prefetch={false} className="gobid-footer-nav-btn flex flex-col items-center justify-center flex-1 py-2 gap-0.5 text-green-300 active:scale-95 transition-transform duration-150 min-w-0 touch-manipulation" aria-label="Vinde" title="Vinde">
                  <PlusCircleIcon className="w-9 h-9" aria-hidden />
                  <span className="text-[10px] font-medium truncate w-full text-center">Vinde</span>
                </Link>
                <a
                  href={footerRoAnunturiHref}
                  onClick={handleFooterAnunturiClick}
                  className="gobid-footer-nav-btn flex flex-col items-center justify-center flex-1 py-2 gap-0.5 text-white active:scale-95 transition-transform duration-150 min-w-0 touch-manipulation"
                  aria-label="Anunțuri — licitații și anunțuri pe gobid.ro"
                  title="Anunțuri"
                >
                  <i className="ri-shopping-bag-fill text-[1.35rem] leading-none drop-shadow-[0_1px_2px_rgba(0,0,0,0.35)]" aria-hidden />
                  <span className="text-[10px] font-medium truncate w-full text-center">Anunțuri</span>
                </a>
                <Link href={canUseDashboardLinks ? ((accountType === "executor" || accountType === "liquidator") ? executorDashboardBase : "/dashboard") : "/auth"} prefetch={false} className="gobid-footer-nav-btn flex flex-col items-center justify-center flex-1 py-2 gap-0.5 text-white active:scale-95 transition-transform duration-150 min-w-0 touch-manipulation" aria-label="Dashboard" title="Dashboard">
                  <Squares2X2Icon className="w-6 h-6" aria-hidden />
                  <span className="text-[10px] font-medium truncate w-full text-center">Dashboard</span>
                </Link>
              </nav>
              {/* Panel accesibilitate – din meniul ⋮ sau icon flotant; fixat deasupra barei */}
              {showVisualA11yPanel && (
                <div
                  className="md:hidden fixed left-4 right-4 z-50 rounded-2xl border-0 bg-white shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-150 gobid-floating-above-bottom-nav"
                  style={{
                    left: "max(1rem, env(safe-area-inset-left))",
                    right: "max(1rem, env(safe-area-inset-right))",
                  }}
                >
                  <div className="bg-gradient-to-br from-blue-500 to-blue-600 px-5 py-4 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <img src="/icons/accessibility-icon.png" alt="" className="h-9 w-9 rounded-lg object-cover" aria-hidden />
                      <p className="text-base font-semibold text-white">Accesibilitate</p>
                    </div>
                    <button type="button" onClick={() => setShowVisualA11yPanel(false)} className="flex items-center justify-center w-9 h-9 rounded-lg text-white/90 hover:text-white hover:bg-white/20 transition-colors" aria-label="Închide">
                      <XMarkIcon className="w-5 h-5" />
                    </button>
                  </div>
                  <div className="p-5 space-y-4">
                    <div className="flex items-center justify-between gap-4 rounded-xl bg-slate-50 px-4 py-3.5">
                      <span className="text-[15px] font-medium text-slate-800">Text mai mare</span>
                      <button type="button" role="switch" aria-checked={visualA11y.largeText} onClick={() => setVisualA11y((v) => ({ ...v, largeText: !v.largeText }))} className={`relative inline-flex h-8 w-14 shrink-0 cursor-pointer items-center rounded-full transition-all duration-200 ${visualA11y.largeText ? "bg-blue-500" : "bg-slate-300"}`}>
                        <span className={`inline-block h-6 w-6 transform rounded-full bg-white shadow-md transition-all duration-200 ${visualA11y.largeText ? "translate-x-7" : "translate-x-1"}`} />
                      </button>
                    </div>
                    <div className="flex items-center justify-between gap-4 rounded-xl bg-slate-50 px-4 py-3.5">
                      <span className="text-[15px] font-medium text-slate-800">Contrast mare</span>
                      <button type="button" role="switch" aria-checked={visualA11y.highContrast} onClick={() => setVisualA11y((v) => ({ ...v, highContrast: !v.highContrast }))} className={`relative inline-flex h-8 w-14 shrink-0 cursor-pointer items-center rounded-full transition-all duration-200 ${visualA11y.highContrast ? "bg-blue-500" : "bg-slate-300"}`}>
                        <span className={`inline-block h-6 w-6 transform rounded-full bg-white shadow-md transition-all duration-200 ${visualA11y.highContrast ? "translate-x-7" : "translate-x-1"}`} />
                      </button>
                    </div>
                  </div>
                  <div className="px-5 pb-5">
                    <button type="button" onClick={() => { setVisualA11y({ largeText: false, highContrast: false }); setShowVisualA11yPanel(false); }} className="w-full rounded-xl bg-slate-100 px-4 py-3 text-[15px] font-semibold text-slate-700 hover:bg-slate-200">
                      Resetează
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>,
        document.body
      )}

    </>
  );
};

export default UniversalHeader;