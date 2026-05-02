"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { createPortal } from "react-dom";
import { useParams, useRouter } from "next/navigation";
import { ClockIcon, LocationIcon, ArrowLeftIcon, ArrowRightIcon, CloseIcon } from "@/components/HeroIcons";
import UniversalHeader from "@/components/UniversalHeader";
import DashboardFooter from "@/components/DashboardFooter";
import Image from "next/image";
import { trackProductView } from "@/lib/analytics/tracking";
import { supabase } from "@/lib/supabase";
import { parseLicitatiiPrice, formatPriceTextForDisplayEuropean } from "@/lib/licitatii-price";
import {
  extractAuctionDateAndTimeFromText,
  combineDateAndTime,
  nextWeekdayISO,
} from "@/lib/extractAuctionFromDescription";
import { useExchangeRate } from "@/hooks/useExchangeRate";
import { getProductDisplayImage, isPlaceholderImage } from "@/lib/getProductDisplayImage";
import { ProgressiveImage } from "@/components/image/ProgressiveImage";
import {
  collectHttpProductImageUrls,
  fetchImageFocalByUrls,
  getFocalForImageUrl,
} from "@/lib/image/focal-from-product";
import { CDN_IMAGE_SIZES_GRID, getCdnImageUrl, listingGridTransformOptions, productImageCdn } from "@/lib/image/cdn";
import {
  AuctionShareMenuPanel,
  type AuctionShareMenuAction,
} from "@/components/share/AuctionShareMenu";
import { navigateBackFromListingDetail } from "@/lib/ro/listingDetailBackNavigation";
import { getDetailSchema, getDetailRows, hasDisplayableDetailRows } from "@/lib/listings/details";

/** PDF formular de înscriere – afișat la anunțurile care nu sunt de la executări publice (REPES). */
const FORMULAR_INSCRIERE_URL = "/insolventa.pdf";
const FORMULAR_INSCRIERE_DOC = { name: "Formular de înscriere", url: FORMULAR_INSCRIERE_URL, type: "pdf" as const };

/** PDF cerere de participare – standard pentru toate anunțurile de la executări publice (REPES). */
// Fallback către fișier existent în proiect, ca să funcționeze și în aplicație.
const CERERE_PARTICIPARE_URL = "/insolventa.pdf";
const CERERE_PARTICIPARE_DOC = { name: "Cerere de participare la licitație", url: CERERE_PARTICIPARE_URL, type: "pdf" as const };

function trackRecentlyViewed(product: { id: string; title: string; image?: string | string[]; price?: number; currency?: string; slug?: string; url?: string; location?: string; category?: string; subcategory?: string; main_category?: string }) {
  if (typeof window === "undefined") return;
  try {
    const key = "recentlyViewedProducts";
    const raw = localStorage.getItem(key);
    const list: Array<{ id: string; viewedAt: number } & typeof product> = raw ? JSON.parse(raw) : [];
    const filtered = list.filter((p) => p.id !== product.id);
    const updated = [{ ...product, viewedAt: Date.now() }, ...filtered].slice(0, 50);
    localStorage.setItem(key, JSON.stringify(updated));
  } catch (e) {
    console.error("Error tracking recently viewed product:", e);
  }
}

/** Extrage din descriere blocul "Bunurile scoase la licitație" + listă numerotată + "Valoare totală la 90%". Dacă sunt 2+ bunuri, returnează { before, listBlock, after } ca să afișăm doar lista fără blur. */
function parseDescriptionBunuri(description: string): { before: string; listBlock: string; after: string } | null {
  if (!description || !description.trim()) return null;
  const lines = description.split(/\r?\n/);
  const startMarker = /bunurile\s+scoase\s+la\s+licitație|bunurile\s+scoase\s+la\s+licitatie/i;
  const numberedLine = /^\s*\d+\.\s+.+/;
  const endMarker = /valoare\s+totală\s+la\s+90%|valoare\s+totala\s+la\s+90%/i;
  let startIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (startMarker.test(lines[i])) {
      startIdx = i;
      break;
    }
  }
  if (startIdx === -1) return null;
  const listLineIndexes: number[] = [];
  let endIdx = -1;
  for (let i = startIdx; i < lines.length; i++) {
    if (numberedLine.test(lines[i])) listLineIndexes.push(i);
    if (endMarker.test(lines[i])) {
      endIdx = i;
      break;
    }
  }
  if (listLineIndexes.length < 2 || endIdx === -1) return null;
  const before = lines.slice(0, startIdx).join("\n").trimEnd();
  const listBlock = lines.slice(startIdx, endIdx + 1).join("\n");
  const after = lines.slice(endIdx + 1).join("\n").trimStart();
  return { before, listBlock, after };
}

/** Maschează adresa cu stelute când conținutul e blocat (primele 10 caractere + ***). */
function maskAddressForLocked(address: string): string {
  if (!address || !address.trim()) return "—";
  const s = String(address).trim();
  if (s.length <= 10) return "*".repeat(s.length);
  return s.substring(0, 10) + "*".repeat(s.length - 10);
}

function formatFilterChip(value: string | undefined | null): string {
  const s = String(value || "").trim();
  if (!s) return "";
  return s
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\b\w/g, (m) => m.toUpperCase());
}

/** Formatează data și ora licitației în siguranță; evită "Invalid Date" și diferența de o zi din cauza timezone. */
function formatAuctionDateDisplay(
  auctionDate: string | undefined,
  options?: { oraLicitatie?: string | null; withTime?: boolean; shortFormat?: boolean }
): string {
  if (!auctionDate || !String(auctionDate).trim()) return "Data nu este disponibilă";
  const raw = String(auctionDate).trim();
  const oraLicitatie = options?.oraLicitatie != null ? String(options.oraLicitatie).trim() : "";
  const withTime = options?.withTime !== false;
  const shortFormat = options?.shortFormat === true;

  let year = 0;
  let month = 0;
  let day = 0;
  let hours = 0;
  let minutes = 0;
  const tz = "Europe/Bucharest";

  if (raw.includes("T")) {
    const d = new Date(raw);
    if (!isNaN(d.getTime())) {
      const formatter = new Intl.DateTimeFormat("ro-RO", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false });
      const partsArr = formatter.formatToParts(d);
      const get = (t: string) => partsArr.find((p) => p.type === t)?.value ?? "";
      day = parseInt(get("day"), 10) || 0;
      month = (parseInt(get("month"), 10) || 1) - 1;
      year = parseInt(get("year"), 10) || 0;
      hours = parseInt(get("hour"), 10) || 0;
      minutes = parseInt(get("minute"), 10) || 0;
    }
  }
  if (year === 0) {
    const isoMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})(?:\s|$)/);
    if (isoMatch) {
      const [, y, m, d] = isoMatch;
      year = parseInt(y!, 10);
      month = parseInt(m!, 10) - 1;
      day = parseInt(d!, 10);
    }
  }
  if (year === 0) {
    const euMatch = raw.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})/);
    if (euMatch) {
      const [, d, m, y] = euMatch;
      year = parseInt(y!, 10);
      month = parseInt(m!, 10) - 1;
      day = parseInt(d!, 10);
    }
  }
  if (year === 0) {
    const ddmmyyyy = raw.replace(/\D/g, "");
    if (ddmmyyyy.length === 8) {
      day = parseInt(ddmmyyyy.slice(0, 2), 10);
      month = parseInt(ddmmyyyy.slice(2, 4), 10) - 1;
      year = parseInt(ddmmyyyy.slice(4, 8), 10);
    }
  }
  if (year === 0) {
    const fallback = new Date(raw);
    if (!isNaN(fallback.getTime())) {
      const formatter = new Intl.DateTimeFormat("ro-RO", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false });
      const partsArr = formatter.formatToParts(fallback);
      const get = (t: string) => partsArr.find((p) => p.type === t)?.value ?? "";
      day = parseInt(get("day"), 10) || 0;
      month = (parseInt(get("month"), 10) || 1) - 1;
      year = parseInt(get("year"), 10) || 0;
      hours = parseInt(get("hour"), 10) || 0;
      minutes = parseInt(get("minute"), 10) || 0;
    }
  }
  if (year < 1900 || day < 1 || day > 31 || month < 0 || month > 11) return raw || "Data nu este disponibilă";

  if (oraLicitatie) {
    let h = 0;
    let m = 0;
    if (oraLicitatie.includes(":")) {
      const parts = oraLicitatie.split(":");
      h = parseInt(parts[0] || "0", 10);
      m = parseInt(parts[1] || "0", 10);
    } else if (oraLicitatie.includes(".")) {
      const parts = oraLicitatie.split(".");
      h = parseInt(parts[0] || "0", 10);
      m = parseInt(parts[1]?.slice(0, 2) || "0", 10);
    } else {
      const digits = oraLicitatie.replace(/\D/g, "");
      h = parseInt(digits.slice(0, 2) || "0", 10);
      m = parseInt(digits.slice(2, 4) || "0", 10);
    }
    hours = Number.isNaN(h) ? 0 : Math.min(23, Math.max(0, h));
    minutes = Number.isNaN(m) ? 0 : Math.min(59, Math.max(0, m));
  }

  const pad = (n: number) => String(n).padStart(2, "0");
  const dateForBucharest = new Date(Date.UTC(year, month, day, 11, 0, 0));
  const optsRo: Intl.DateTimeFormatOptions = { timeZone: "Europe/Bucharest" };

  if (shortFormat) {
    return dateForBucharest.toLocaleDateString("ro-RO", { day: "2-digit", month: "2-digit", year: "numeric", ...optsRo });
  }
  const weekday = dateForBucharest.toLocaleDateString("ro-RO", { weekday: "long", ...optsRo });
  const monthLong = dateForBucharest.toLocaleDateString("ro-RO", { month: "long", ...optsRo });
  const datePart = `${weekday}, ${day} ${monthLong} ${year}`;
  if (withTime && (hours > 0 || minutes > 0)) {
    return `${datePart} la ${pad(hours)}:${pad(minutes)}`;
  }
  return datePart;
}

import ProductPriceEvaluation from "@/app/price-evaluator/ProductPriceEvaluation";
import { ProductForEvaluation, ProductCategory } from "@/lib/types/priceEvaluation";
import ExecutorBusinessCard from "@/components/ExecutorBusinessCard";
import AddToFavoriteListModal from "@/components/AddToFavoriteListModal";

interface Auction {
  id: string;
  slug?: string;
  title: string;
  description: string;
  currentBid: number;
  startingBid: number;
  startingBidRON?: number;
  startingBidEUR?: number;
  exchangeRate?: number;
  image: string;
  images: string[];
  category: string;
  subcategory: string;
  location: string;
  auctionDate?: string;
  address?: string;
  county?: string;
  city?: string;
  customFields?: Record<string, any>;
  isEvaluationPrice?: boolean;
  status?: 'draft' | 'active' | 'deleted' | 'reserved' | 'sold' | 'ended' | 'in_progress';
  currency?: 'EUR' | 'RON';
  documents?: Array<{
    name: string;
    url?: string;
    size?: number;
    type?: string;
  }>;
  /** True dacă anunțul are cel puțin o poză reală (nu doar imagine din categoria personalizată); folosit pentru afișarea hărții. */
  hasRealImages?: boolean;
  /** Pentru cache bust la imagini R2 (CDN). */
  imageVersionAt?: string | number | null;
  /** Focal AI din `uploaded_images` (smart crop CDN). */
  image_focal_by_url?: Record<string, { focal_x: number; focal_y: number }>;
}

export default function AuctionSinglePage() {
  const params = useParams() || {};
  const router = useRouter();
  const auctionId = (params.slug ?? params["slug"] ?? "") as string;
  
  const [isDarkMode, setIsDarkMode] = useState(false); // eMAG style - light mode by default
  const [auction, setAuction] = useState<Auction | null>(null);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [isFavorite, setIsFavorite] = useState(false);
  const [timeLeft, setTimeLeft] = useState({ days: 0, hours: 0, minutes: 0, seconds: 0 });
  const [isAuctionEnded, setIsAuctionEnded] = useState(false);
  const [isLoadingAuction, setIsLoadingAuction] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isSharing, setIsSharing] = useState(false);
  const [showShareMenu, setShowShareMenu] = useState(false);
  const [showImageGallery, setShowImageGallery] = useState(false);
  const [isDescriptionExpanded, setIsDescriptionExpanded] = useState(false);
  const [isSpecificationsExpanded, setIsSpecificationsExpanded] = useState(false);
  const [recommendedAuctions, setRecommendedAuctions] = useState<Auction[]>([]);
  const recommendedSliderRef = useRef<HTMLDivElement>(null);
  const [recommendedSlideIndex, setRecommendedSlideIndex] = useState(0);
  const [recommendedCardsPerRow, setRecommendedCardsPerRow] = useState(2);
  const [userProducts, setUserProducts] = useState<Auction[]>([]);
  const userProductsSliderRef = useRef<HTMLDivElement>(null);
  const [userProductsSlideIndex, setUserProductsSlideIndex] = useState(0);
  const [recentlyViewedProducts, setRecentlyViewedProducts] = useState<Array<{ id: string; title: string; image: string; slug?: string; url?: string; startingBidRON?: number; location: string; viewedAt?: number }>>([]);
  const recentlyViewedScrollRef = useRef<HTMLDivElement>(null);
  const [isMobile, setIsMobile] = useState(false);
  const [logoError, setLogoError] = useState(false);
  const thumbnailsContainerRef = useRef<HTMLDivElement>(null);
  const [executorData, setExecutorData] = useState<{
    licitatorName?: string;
    licitatorAddress?: string;
    licitatorFiscalCode?: string;
    licitatorConsignmentAccount?: string;
    licitatorEmail?: string;
    licitatorPhone?: string;
    licitatorFax?: string;
    licitatorCompetence?: string;
    licitatorAvatar?: string;
  } | null>(null);
  const [showFavoriteModal, setShowFavoriteModal] = useState(false);
  const [selectedProductForFavorite, setSelectedProductForFavorite] = useState<{id: string, title: string} | null>(null);
  const [userTokens, setUserTokens] = useState(0);
  const [priceEvaluationProcessing, setPriceEvaluationProcessing] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);
  const [hasSession, setHasSession] = useState(false);

  const { rate: siteExchangeRate, rateDate: siteExchangeRateDate } = useExchangeRate();
  const effectiveRate = siteExchangeRate > 0 ? siteExchangeRate : 5;

  // Verificare autentificare – pagina anunțurilor licitații publice nu se poate vedea nelogat
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        setHasSession(!!session?.access_token);
      } catch (e) {
        setHasSession(false);
      } finally {
        setAuthChecked(true);
      }
    };
    checkAuth();
  }, []);

  // Load user tokens and admin status (admin vede conținutul deblocat fără token)
  useEffect(() => {
    const loadUserTokensAndAdmin = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.access_token) {
          setUserTokens(0);
          return;
        }

        const [balanceRes, isAdminRes] = await Promise.all([
          fetch('/api/tokens/balance', { headers: { 'Authorization': `Bearer ${session.access_token}` } }),
          fetch('/api/user/is-admin', { headers: { 'Authorization': `Bearer ${session.access_token}` } }),
        ]);

        if (balanceRes.ok) {
          const data = await balanceRes.json();
          setUserTokens(data.balance || 0);
        }
        if (isAdminRes.ok) {
          const data = await isAdminRes.json();
          if (data.isAdmin) setIsAdmin(true);
        }
      } catch (error) {
        console.error('Error loading user tokens / admin:', error);
      }
    };
    loadUserTokensAndAdmin();
  }, []);

  const handleTokenSpent = () => {
    setUserTokens(prev => Math.max(0, prev - 1));
  };

  const [isProductUnlocked, setIsProductUnlocked] = useState(false);
  const effectiveUnlocked = isProductUnlocked || isAdmin;

  // Sync product unlock state from localStorage (same key as price eval unlock)
  useEffect(() => {
    if (!auction?.id || typeof window === 'undefined') return;
    try {
      const keyById = `price_eval_unlocked_${auction.id}`;
      const keyBySlug = auction?.slug ? `price_eval_unlocked_${auction.slug}` : null;
      const isUnlockedById = localStorage.getItem(keyById) === 'true';
      const isUnlockedBySlug = keyBySlug ? localStorage.getItem(keyBySlug) === 'true' : false;
      if (isUnlockedById || isUnlockedBySlug) setIsProductUnlocked(true);
    } catch (e) {
      console.warn('Could not read unlock state', e);
    }
  }, [auction?.id, auction?.slug]);

  // Persistent unlock check from server (works across devices/sessions).
  useEffect(() => {
    let cancelled = false;
    const checkServerUnlockState = async () => {
      if (!auction?.id) return;
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const accessToken = session?.access_token;
        const fallbackUserId = typeof window !== 'undefined' ? localStorage.getItem('supabaseUserId') : null;
        const effectiveUserId = session?.user?.id || fallbackUserId;
        if (!accessToken && !effectiveUserId) return;

        const res = await fetch('/api/tokens/unlocked-products', {
          headers: {
            ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
            ...(effectiveUserId && !accessToken ? { 'x-user-id': effectiveUserId } : {}),
          },
        });
        if (!res.ok) return;

        const rows = await res.json().catch(() => []);
        const exists = Array.isArray(rows) && rows.some((row: any) => {
          const rowId = String(row?.productId || '').trim();
          const rowSlug = row?.slug ? String(row.slug).trim() : '';
          const matchId = rowId && rowId === String(auction.id).trim();
          const matchSlug = auction?.slug && rowSlug && rowSlug === String(auction.slug).trim();
          return matchId || matchSlug;
        });

        if (!cancelled && exists) {
          setIsProductUnlocked(true);
          if (typeof window !== 'undefined') {
            try {
              localStorage.setItem(`price_eval_unlocked_${auction.id}`, 'true');
              if (auction?.slug) localStorage.setItem(`price_eval_unlocked_${auction.slug}`, 'true');
            } catch {}
          }
        }
      } catch (e) {
        console.warn('Could not verify server unlock state', e);
      }
    };
    checkServerUnlockState();
    return () => { cancelled = true; };
  }, [auction?.id, auction?.slug]);

  const handleProductUnlocked = () => {
    setIsProductUnlocked(true);
  };

  const [unlockingProduct, setUnlockingProduct] = useState(false);
  const [showDocLockedNotification, setShowDocLockedNotification] = useState(false);
  const [showUnlockInProgressConfirm, setShowUnlockInProgressConfirm] = useState(false);
  const [unlockToast, setUnlockToast] = useState({ show: false, message: '' });
  const unlockToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [showPdfModal, setShowPdfModal] = useState(false);
  const [pdfModalViewerSrc, setPdfModalViewerSrc] = useState("");
  const [pdfModalDownloadHref, setPdfModalDownloadHref] = useState("");
  const [pdfModalFilename, setPdfModalFilename] = useState("document.pdf");

  // Toast: după 2.5s începe fade-out, apoi curăță mesajul
  useEffect(() => {
    if (!unlockToast.message) return;
    if (unlockToast.show) {
      if (unlockToastTimerRef.current) clearTimeout(unlockToastTimerRef.current);
      unlockToastTimerRef.current = setTimeout(() => {
        setUnlockToast((t) => ({ ...t, show: false }));
        unlockToastTimerRef.current = null;
      }, 2500);
    }
    return () => { if (unlockToastTimerRef.current) clearTimeout(unlockToastTimerRef.current); };
  }, [unlockToast.show, unlockToast.message]);

  useEffect(() => {
    if (!unlockToast.show && unlockToast.message) {
      const t = setTimeout(() => setUnlockToast({ show: false, message: '' }), 350);
      return () => clearTimeout(t);
    }
  }, [unlockToast.show, unlockToast.message]);

  const handleUnlockFromPage = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) {
      const currentUrl = typeof window !== 'undefined' ? window.location.pathname + window.location.search : '';
      const loginUrl = currentUrl ? `/auth?mode=login&redirect=${encodeURIComponent(currentUrl)}` : '/auth?mode=login';
      router.push(loginUrl);
      return;
    }
    setUnlockingProduct(true);
    try {
      const response = await fetch('/api/tokens/spend', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          amount: 1,
          productId: auction?.id || null,
          reason: auction?.title
            ? `Deblocare produs: ${auction.title}`
            : (auction?.id ? `Deblocare produs ${auction.id}` : 'Deblocare produs'),
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const message = data.error === 'Insufficient tokens'
          ? 'Nu ai suficiente token-uri. Ai nevoie de 1 token pentru a debloca evaluarea prețului.'
          : (data.error || 'Nu am putut procesa token-ul');
        throw new Error(message);
      }
      setIsProductUnlocked(true);
      if (typeof data.newBalance === 'number') setUserTokens(data.newBalance);
      else handleTokenSpent();
      if (auction?.id) {
        try {
          localStorage.setItem(`price_eval_unlocked_${auction.id}`, 'true');
          if (auction?.slug) localStorage.setItem(`price_eval_unlocked_${auction.slug}`, 'true');
          const key = 'unlockedAuctions';
          const raw = localStorage.getItem(key);
          const list: string[] = raw ? (() => { try { return JSON.parse(raw) as string[]; } catch { return []; } })() : [];
          const idStr = String(auction.id);
          if (!list.includes(idStr)) {
            localStorage.setItem(key, JSON.stringify([...list, idStr]));
          }
        } catch (e) {
          console.warn('Could not save unlock state', e);
        }
      }
    } catch (err) {
      console.error('Error unlocking:', err);
      const msg = err instanceof Error ? err.message : 'A apărut o eroare. Te rugăm să încerci din nou.';
      setUnlockToast({ show: true, message: msg });
    } finally {
      setUnlockingProduct(false);
    }
  };

  const openPdfModal = useCallback((docUrl?: string, docName?: string) => {
    if (!docUrl) return;
    const normalizedDocUrl = docUrl === "/cerere-participare-licitatie.pdf" ? "/insolventa.pdf" : docUrl;
    const safeDocName = `${(typeof docName === "string" ? docName.replace(/[^\w\s.-]/gi, "_") : "document")}.pdf`;
    const isExternal = /^https?:\/\//i.test(normalizedDocUrl);
    const viewerSrc = `/pdf-viewer?url=${encodeURIComponent(normalizedDocUrl)}&filename=${encodeURIComponent(safeDocName)}&embedded=1`;
    const downloadHref = isExternal
      ? `/api/download-pdf?url=${encodeURIComponent(normalizedDocUrl)}&filename=${encodeURIComponent(safeDocName)}&mode=download`
      : normalizedDocUrl;

    setPdfModalFilename(safeDocName);
    setPdfModalViewerSrc(viewerSrc);
    setPdfModalDownloadHref(downloadHref);
    setShowPdfModal(true);
  }, []);

  useEffect(() => {
    if (!showPdfModal || typeof document === "undefined") return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [showPdfModal]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const onMessage = (event: MessageEvent) => {
      if (event?.data?.type === "closePdfModal") {
        setShowPdfModal(false);
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  // Detect mobile on mount and resize
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(typeof window !== 'undefined' && window.innerWidth < 768);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Cards per row: 5 pe desktop, 2 pe mobil. Viewport pentru vizibilitate secțiune "produse user".
  const [viewportSize, setViewportSize] = useState<'mobile' | 'tablet' | 'desktop'>('desktop');
  useEffect(() => {
    const update = () => {
      if (typeof window === 'undefined') return;
      const w = window.innerWidth;
      if (w >= 1024) {
        setRecommendedCardsPerRow(5);
        setViewportSize('desktop');
      } else if (w >= 768) {
        setRecommendedCardsPerRow(5);
        setViewportSize('tablet');
      } else {
        setRecommendedCardsPerRow(2);
        setViewportSize('mobile');
      }
    };
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  const minUserProductsForViewport = viewportSize === 'desktop' ? 5 : viewportSize === 'tablet' ? 3 : 2;
  const showUserProductsSection = userProducts.length >= minUserProductsForViewport;

  // Auto-scroll thumbnails to show active thumbnail
  useEffect(() => {
    if (thumbnailsContainerRef.current && auction && auction.images.length > 0) {
      const container = thumbnailsContainerRef.current;
      const activeThumbnail = container.children[currentImageIndex] as HTMLElement;
      if (activeThumbnail) {
        const containerRect = container.getBoundingClientRect();
        const thumbnailRect = activeThumbnail.getBoundingClientRect();
        const scrollLeft = activeThumbnail.offsetLeft - container.offsetLeft - (containerRect.width / 2) + (thumbnailRect.width / 2);
        
        container.scrollTo({
          left: scrollLeft,
          behavior: 'smooth'
        });
      }
    }
  }, [currentImageIndex, auction]);

  const mapProductRowToAuction = useCallback((row: any): Auction => {
    const placeholderImage = '/no-image-placeholder.svg';
    let images = Array.isArray(row?.images)
      ? row.images.filter((img: any) => typeof img === 'string')
      : [];
    
    // Asigură că poza generată ANAF (dacă există) este prima
    // Identificăm poza ANAF prin URL-ul care conține '/anaf/' sau '/uploads/anaf/'
    const anafImageIndex = images.findIndex((img: string) => 
      typeof img === 'string' && (img.includes('/anaf/') || img.includes('/uploads/anaf/'))
    );
    
    if (anafImageIndex > 0) {
      // Mută poza ANAF la început
      const anafImage = images[anafImageIndex];
      images = [anafImage, ...images.filter((_: any, idx: number) => idx !== anafImageIndex)];
    }
    
    const rawFirst = images[0] || placeholderImage;
    const hasRealImage = rawFirst && rawFirst !== placeholderImage && !String(rawFirst).includes('placeholder');
    // Considerăm "poze reale" doar imaginile care nu sunt placeholder și nu sunt imaginea implicită de categorie
    const hasRealImages = images.some(
      (url: string) =>
        typeof url === 'string' &&
        url &&
        url !== placeholderImage &&
        !url.includes('placeholder') &&
        !url.includes('/images/category-defaults/')
    );
    const displayImage = getProductDisplayImage({
      images: row?.images,
      image: hasRealImage ? rawFirst : undefined,
      category: row?.category,
      subcategory: row?.subcategory,
      main_category: (row?.custom_fields as any)?.main_category,
    });
    const mainImage = displayImage;
    const startingPriceRON =
      typeof row?.starting_price_ron === 'number'
        ? row.starting_price_ron
        : typeof row?.starting_price === 'number'
        ? row.starting_price
        : 0;
    
    const startingPriceEURRaw =
      typeof row?.starting_price_eur === 'number'
        ? row.starting_price_eur
        : 0;
    
    // Calculează paritatea, preferând valorile explicite din row / custom_fields
    let exchangeRate: number =
      typeof row?.exchange_rate === 'number'
        ? row.exchange_rate
        : typeof row?.custom_fields?.exchange_rate === 'number'
        ? row.custom_fields.exchange_rate
        : 0;

    // Dacă nu avem curs sau este nevalid, încearcă să îl deduci din Lei/EUR
    if (!exchangeRate || exchangeRate <= 0) {
      if (startingPriceRON > 0 && startingPriceEURRaw > 0) {
        const implied = startingPriceRON / startingPriceEURRaw;
        // Acceptăm doar valori plauzibile (de ex. 3–7 Lei/EUR)
        if (implied > 3 && implied < 7) {
          exchangeRate = implied;
        }
      }
    }

    // Dacă tot nu avem curs, folosim o valoare de fallback
    if (!exchangeRate || exchangeRate <= 0) {
      exchangeRate = 5.0;
    }
    
    // Calculăm întotdeauna EUR pornind de la Lei și curs
    const calculatedEUR =
      startingPriceRON > 0 ? startingPriceRON / exchangeRate : startingPriceEURRaw > 0 ? startingPriceEURRaw : 0;

    const pdfUrlsFromCf = Array.isArray((row?.custom_fields as { pdf_urls?: string[] } | null)?.pdf_urls)
      ? ((row.custom_fields as { pdf_urls: string[] }).pdf_urls).filter((u): u is string => typeof u === 'string' && u.trim().length > 0)
      : [];
    const docsFromListing = pdfUrlsFromCf.length > 0
      ? pdfUrlsFromCf.map((url, idx) => ({
          name: `PDF ${idx + 1}`,
          url,
          type: 'pdf',
        }))
      : Array.isArray(row?.documents)
        ? row.documents.map((doc: any, idx: number) => ({
            name: doc?.name && String(doc.name).trim() ? doc.name : `PDF ${idx + 1}`,
            url: doc?.url || doc?.publicUrl || undefined,
            size: typeof doc?.size === 'number' ? doc.size : undefined,
            type: doc?.type,
          }))
        : [];
    // Document standard: Cerere de participare la licitație pentru REPES (executări publice), Formular de înscriere pentru restul
    const isRepes = (row?.custom_fields as { imported_from?: string } | undefined)?.imported_from === "repes";
    const defaultDoc = isRepes ? CERERE_PARTICIPARE_DOC : FORMULAR_INSCRIERE_DOC;
    const restDocs = docsFromListing.filter((d: { url?: string }) => d.url !== FORMULAR_INSCRIERE_URL && d.url !== CERERE_PARTICIPARE_URL);
    const documents = [defaultDoc, ...restDocs];

    const baseCustomFields = row?.custom_fields && typeof row.custom_fields === 'object' ? row.custom_fields : {};
    const cat = (row?.category ?? '').toLowerCase();
    const subcat = (row?.subcategory ?? '').toLowerCase();
    const isImobiliare = cat.includes('imobiliare') || cat.includes('executari') && subcat.includes('exec-imobiliare') || ['apartamente','case-vile','case','terenuri','terenuri-intravilane','terenuri-agricole','spatii-comerciale','hale-industriale'].some(s => subcat.includes(s));
    const customFields = { ...baseCustomFields };
    if (isImobiliare) {
      if (row?.address && !customFields.address) customFields.address = row.address;
      if (row?.auction_location && !customFields.auction_location) customFields.auction_location = row.auction_location;
      if (row?.product_location && !customFields.product_location) customFields.product_location = row.product_location;
    }

    const rawTitle = (row?.title ?? 'Produs licitație').trim();
    const rawDesc = (row?.description ?? '').trim();
    const stripIdSite = (s: string) => s.replace(/\s*ID site:\s*REPES-[^\s]+/gi, '').replace(/\n\s*\n/g, '\n').trim();
    return {
      id: row?.id ?? '',
      slug: row?.slug ?? '',
      title: stripIdSite(rawTitle) || rawTitle || 'Produs licitație',
      description: stripIdSite(rawDesc) || rawDesc,
      currentBid: startingPriceRON,
      startingBid: startingPriceRON,
      startingBidRON: startingPriceRON,
      startingBidEUR: calculatedEUR,
      exchangeRate: exchangeRate,
      image: mainImage,
      images: images.length > 0 && hasRealImage ? images : [mainImage],
      category: row?.category ?? 'diverse',
      subcategory: row?.subcategory ?? 'diverse',
      location: (() => {
        const loc = (row?.custom_fields?.locatie_bunuri && String(row.custom_fields.locatie_bunuri).trim()) || row?.auction_location || row?.address || row?.city;
        if (loc) return loc;
        const desc = String(row?.description ?? "").trim();
        if (desc) {
          const ext = extractAuctionDateAndTimeFromText(desc);
          if (ext.address) return ext.address;
        }
        return "București";
      })(),
      auctionDate: (() => {
        const desc = String(row?.description ?? "").trim();
        const extracted = desc ? extractAuctionDateAndTimeFromText(desc) : null;
        // „În fiecare miercuri” etc.: folosim întotdeauna următoarea zi din săptămână (din ziua de azi), nu data veche din DB
        if (extracted?.rollingWeekly && extracted.dateIso) {
          if (extracted.rollingWeekly.weekday !== undefined) customFields.rolling_weekly_weekday = extracted.rollingWeekly.weekday;
          const combined = combineDateAndTime(extracted.dateIso, extracted.time);
          if (extracted.time && !customFields.auction_time) customFields.auction_time = extracted.time;
          if (extracted.address && !customFields.locatie_bunuri) customFields.locatie_bunuri = extracted.address;
          return combined || extracted.dateIso;
        }
        const fromRow = row?.auction_date ?? row?.custom_fields?.auction_date ?? row?.custom_fields?.data_licitatie;
        if (fromRow && String(fromRow).trim()) return String(fromRow).trim();
        if (extracted?.dateIso) {
          const combined = combineDateAndTime(extracted.dateIso, extracted.time);
          if (extracted.time && !customFields.auction_time) customFields.auction_time = extracted.time;
          if (extracted.address && !customFields.locatie_bunuri) customFields.locatie_bunuri = extracted.address;
          return combined || extracted.dateIso;
        }
        const descDateMatch = desc.match(/(\d{1,2})[./](\d{1,2})[./](\d{4})/);
        if (descDateMatch) {
          const [, dStr, mStr, yStr] = descDateMatch;
          const dd = dStr!.padStart(2, "0");
          const mm = mStr!.padStart(2, "0");
          const di = parseInt(dStr!, 10);
          const mi = parseInt(mStr!, 10);
          if (di >= 1 && di <= 31 && mi >= 1 && mi <= 12) {
            return `${yStr}-${mm}-${dd}`;
          }
        }
        const slug = (row?.slug ?? "") as string;
        const fromSlug8 = slug.match(/-(\d{8})$/)?.[1];
        if (fromSlug8 && fromSlug8.length === 8) {
          const d = fromSlug8.slice(0, 2);
          const m = fromSlug8.slice(2, 4);
          const y = fromSlug8.slice(4, 8);
          return `${y}-${m}-${d}`;
        }
        const isoInSlug = slug.match(/-(\d{4}-\d{2}-\d{2})(?:-|$)/)?.[1];
        if (isoInSlug) return isoInSlug;
        return undefined;
      })(),
      address: (() => {
        const addr = (row?.custom_fields?.locatie_bunuri && String(row.custom_fields.locatie_bunuri).trim()) || row?.address;
        if (addr) return addr;
        const desc = String(row?.description ?? "").trim();
        if (desc) {
          const ext = extractAuctionDateAndTimeFromText(desc);
          if (ext.address) return ext.address;
        }
        return undefined;
      })(),
      county: row?.county ?? undefined,
      city: row?.city ?? undefined,
      customFields,
      // Verifică dacă este preț de evaluare (pentru mașini sau dacă există în customFields)
      isEvaluationPrice: (() => {
        const subcategoryLower = (row?.subcategory ?? '').toLowerCase();
        const isVehicle = subcategoryLower.includes('autoturisme') || 
                         subcategoryLower.includes('autovehicule') ||
                         subcategoryLower.includes('suv') ||
                         subcategoryLower.includes('motociclete') ||
                         subcategoryLower.includes('scutere');
        const hasEvaluationPrice = row?.custom_fields?.pret_evaluare || 
                                  row?.custom_fields?.pretEvaluare ||
                                  row?.pret_evaluare;
        return isVehicle || !!hasEvaluationPrice;
      })(),
      status: row?.status ?? 'active',
      hasRealImages,
      documents,
      currency: (row?.currency === 'EUR' ? 'EUR' : 'RON') as 'EUR' | 'RON',
      imageVersionAt: row?.updated_at ?? row?.created_at ?? null,
      image_focal_by_url:
        row?.image_focal_by_url && typeof row.image_focal_by_url === "object"
          ? (row.image_focal_by_url as Record<string, { focal_x: number; focal_y: number }>)
          : undefined,
    };
  }, []);

  const cdn = useMemo(() => productImageCdn(auction?.imageVersionAt ?? null), [auction?.imageVersionAt]);

  /** Preț pentru afișare: folosim cursul de pe site (același ca /ro), nu cursul din anunț. */
  const displayPriceRON = useMemo(() => {
    const fromDb = auction?.startingBidRON ?? auction?.startingBid;
    if (typeof fromDb === 'number' && fromDb > 0) return fromDb;
    const priceText = auction?.customFields?.price_text;
    if (!priceText || typeof priceText !== 'string') return 0;
    const { value, currency } = parseLicitatiiPrice(priceText);
    if (value <= 0) return 0;
    return currency === 'EUR' ? value * effectiveRate : value;
  }, [auction?.customFields?.price_text, auction?.startingBidRON, auction?.startingBid, effectiveRate]);
  const displayPriceEUR = useMemo(() => {
    const fromDb = auction?.startingBidEUR;
    if (typeof fromDb === 'number' && fromDb > 0) return fromDb;
    const priceText = auction?.customFields?.price_text;
    if (!priceText || typeof priceText !== 'string') return displayPriceRON > 0 ? displayPriceRON / effectiveRate : 0;
    const { value, currency } = parseLicitatiiPrice(priceText);
    if (value <= 0) return displayPriceRON > 0 ? displayPriceRON / effectiveRate : 0;
    return currency === 'EUR' ? value : value / effectiveRate;
  }, [auction?.customFields?.price_text, auction?.startingBidEUR, effectiveRate, displayPriceRON]);

  const getExchangeRateUpdatedAt = (customFields?: Record<string, any> | null): string | null => {
    if (!customFields) return null;
    for (const [key, value] of Object.entries(customFields)) {
      const normalizedKey = key.toLowerCase().replace(/[\s_]+/g, '');
      if (normalizedKey.includes('exchangerateupdated')) {
        const raw = typeof value === 'string' ? value : String(value);
        const date = new Date(raw);
        if (!isNaN(date.getTime())) {
          // Afișăm data/ora în format românesc prietenos
          return date.toLocaleString('ro-RO', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
          });
        }
        return raw;
      }
    }
    return null;
  };

  /** Data cursului: folosim data cursului de pe site (același ca /ro). */
  const exchangeRateUpdatedAtDisplay = siteExchangeRateDate || getExchangeRateUpdatedAt(auction?.customFields ?? null) || null;

  /** Extrage doar orașul din locație (același logică ca pe /ro). */
  const getDisplayCity = (location: string | undefined): string => {
    if (!location || !String(location).trim()) return '';
    const s = String(location).trim();
    const locMatch = s.match(/loc\.\s*([^,]+)/i);
    if (locMatch) return locMatch[1].trim();
    const judMatch = s.match(/jud\.\s*([^,]+)/i);
    if (judMatch) return judMatch[1].trim();
    const first = s.split(',')[0].trim();
    const parts = first.split(/\s+/);
    const last = parts[parts.length - 1];
    if (last && last.length <= 25) return last;
    return first.length <= 30 ? first : s;
  };

  const getRelevantDetails = (customFields?: Record<string, any> | null) => {
    if (!customFields) return null;
    if ((customFields as any).Detalii_relevante) return (customFields as any).Detalii_relevante;
    if ((customFields as any).detalii_relevante) return (customFields as any).detalii_relevante;

    // Caută chei similare, indiferent de spații / majuscule
    for (const [key, value] of Object.entries(customFields)) {
      const normalized = key.toLowerCase().replace(/\s+/g, '');
      if (normalized.includes('detaliirelevante')) {
        return value;
      }
    }
    return null;
  };

  const calculateTimeLeft = useCallback((auctionDate?: string) => {
    if (!auctionDate) {
      return { days: 0, hours: 0, minutes: 0, seconds: 0, totalSeconds: 0 };
    }

    const auctionDateTime = new Date(auctionDate);
    const now = new Date();
    const diff = auctionDateTime.getTime() - now.getTime();

    if (diff <= 0) {
      return { days: 0, hours: 0, minutes: 0, seconds: 0, totalSeconds: 0 };
    }

    const totalSeconds = Math.floor(diff / 1000);
    const days = Math.floor(totalSeconds / (24 * 3600));
    const hours = Math.floor((totalSeconds % (24 * 3600)) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    return { days, hours, minutes, seconds, totalSeconds };
  }, []);

  const getNextMidnightISO = useCallback((): string => {
    const n = new Date();
    n.setDate(n.getDate() + 1);
    n.setHours(0, 0, 0, 0);
    return n.toISOString();
  }, []);

  /** Data în 30 de zile (pentru licitații cu data în trecut – timer 30 zile). */
  const getDateIn30DaysISO = useCallback((): string => {
    const n = new Date();
    n.setDate(n.getDate() + 30);
    n.setHours(12, 0, 0, 0);
    return n.toISOString();
  }, []);

  /** True dacă data licitației este în trecut (înainte de ziua de azi). Acceptă ISO (YYYY-MM-DD) și EU (DD.MM.YYYY / DD/MM/YYYY). */
  const isAuctionDateInPast = useCallback((auctionDate?: string): boolean => {
    if (!auctionDate || !String(auctionDate).trim()) return true;
    const raw = String(auctionDate).trim();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    let d: Date;
    const isoMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
    const euMatch = raw.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})/);
    if (isoMatch) {
      d = new Date(parseInt(isoMatch[1], 10), parseInt(isoMatch[2], 10) - 1, parseInt(isoMatch[3], 10), 12, 0, 0);
    } else if (euMatch) {
      d = new Date(parseInt(euMatch[3], 10), parseInt(euMatch[2], 10) - 1, parseInt(euMatch[1], 10), 12, 0, 0);
    } else {
      d = new Date(raw.slice(0, 10) + "T12:00:00");
    }
    if (Number.isNaN(d.getTime())) return true;
    return d.getTime() < today.getTime();
  }, []);

  const countdownCleanupRef = useRef<(() => void) | null>(null);

  const startCountdown = useCallback((
    auctionDate?: string,
    isRollingDaily?: boolean,
    opts?: { rollingWeeklyWeekday?: number; auctionTime?: string | null }
  ) => {
    const effectiveDate = auctionDate || (isRollingDaily ? getNextMidnightISO() : undefined);
    if (!effectiveDate) {
      setIsAuctionEnded(true);
      return () => {};
    }

    const updateTimer = () => {
      const calculated = calculateTimeLeft(effectiveDate);

      if (calculated.totalSeconds <= 0) {
        if (isRollingDaily) {
          countdownCleanupRef.current?.();
          countdownCleanupRef.current = startCountdown(getNextMidnightISO(), true);
          return;
        }
        if (opts?.rollingWeeklyWeekday != null) {
          const nextDate = nextWeekdayISO(new Date(), opts.rollingWeeklyWeekday as 0 | 1 | 2 | 3 | 4 | 5 | 6);
          const nextDateTime = opts.auctionTime ? combineDateAndTime(nextDate, opts.auctionTime) : nextDate;
          countdownCleanupRef.current?.();
          countdownCleanupRef.current = startCountdown(nextDateTime ?? nextDate, false, opts);
          return;
        }
        setIsAuctionEnded(true);
        setTimeLeft({ days: 0, hours: 0, minutes: 0, seconds: 0 });
        return;
      }

      setTimeLeft({
        days: calculated.days,
        hours: calculated.hours,
        minutes: calculated.minutes,
        seconds: calculated.seconds,
      });
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    const cleanup = () => clearInterval(interval);
    return cleanup;
  }, [calculateTimeLeft, getNextMidnightISO]);

  // Memoized product for evaluation - only recalculates when auction data changes
  const productForEvaluation = useMemo((): ProductForEvaluation | null => {
    if (!auction) {
      console.log('[LicitatiiPublice] No auction, productForEvaluation is null');
      return null;
    }

    // Map category to ProductCategory
    const categoryMap: Record<string, ProductCategory> = {
      'autoturisme': 'auto',
      'autovehicule': 'auto',
      'exec-autovehicule': 'auto',
      'suv': 'auto',
      'motociclete': 'auto',
      'scutere': 'auto',
      'apartamente': 'apartment',
      'apartament': 'apartment',
      'exec-imobiliare': 'apartment',
      'case-vile': 'house',
      'case': 'house',
      'casa': 'house',
      'vile': 'house',
      'terenuri': 'land',
      'teren': 'land',
      'telefoane': 'electronics',
      'laptopuri': 'electronics',
      'tablete': 'electronics',
      'haine': 'fashion',
      'incaltaminte': 'fashion',
    };

    const categoryLower = (auction.category || '').toLowerCase();
    const subcategoryLower = (auction.subcategory || '').toLowerCase();
    
    let productCategory: ProductCategory = 'other';
    
    // Check subcategory first (more specific)
    for (const [key, value] of Object.entries(categoryMap)) {
      if (subcategoryLower.includes(key) || categoryLower.includes(key)) {
        productCategory = value;
        break;
      }
    }

    // Extract attributes from customFields
    const attributes: Record<string, any> = {};
    
    // For auto
    if (productCategory === 'auto') {
      if (auction.customFields?.an) attributes.year = auction.customFields.an;
      if (auction.customFields?.kilometraj) attributes.km = auction.customFields.kilometraj;
      if (auction.customFields?.motor) attributes.engine = auction.customFields.motor;
      if (auction.customFields?.putere) attributes.power = auction.customFields.putere;
    }
    
    // For apartment
    if (productCategory === 'apartment') {
      if (auction.customFields?.suprafata) attributes.surface = auction.customFields.suprafata;
      if (auction.customFields?.camere) attributes.rooms = auction.customFields.camere;
      if (auction.customFields?.numarCamere) attributes.rooms = auction.customFields.numarCamere;
      if (auction.customFields?.an) attributes.year = auction.customFields.an;
      if (auction.customFields?.anConstructie) attributes.year = auction.customFields.anConstructie;
    }
    
    // For house (case, vile)
    if (productCategory === 'house') {
      if (auction.customFields?.suprafata) attributes.surface = auction.customFields.suprafata;
      if (auction.customFields?.suprafataTeren) attributes.suprafata_teren = auction.customFields.suprafataTeren;
      if (auction.customFields?.camere) attributes.rooms = auction.customFields.camere;
      if (auction.customFields?.numarCamere) attributes.rooms = auction.customFields.numarCamere;
      if (auction.customFields?.an) attributes.year = auction.customFields.an;
      if (auction.customFields?.anConstructie) attributes.year = auction.customFields.anConstructie;
    }
    
    // For land
    if (productCategory === 'land') {
      if (auction.customFields?.suprafata) attributes.surface = auction.customFields.suprafata;
    }

    // Extract city and area
    const city = auction.customFields?.city || auction.address?.split(',')[0]?.trim() || auction.location?.split(',')[0]?.trim();

    const product = {
      id: auction.id,
      title: auction.title,
      description: auction.description,
      category: productCategory,
      price: auction.currentBid || auction.startingBid,
      currency: 'RON',
      city: city,
      country: 'România',
      attributes: { ...attributes, product_type: 'licitatii-publice' },
      product_type: 'licitatii-publice',
    };

    console.log('[LicitatiiPublice] Created productForEvaluation:', {
      id: product.id,
      title: product.title,
      category: product.category,
      price: product.price,
      city: product.city,
      hasAttributes: Object.keys(product.attributes).length > 0,
    });

    return product;
  }, [
    auction?.id,
    auction?.title,
    auction?.description,
    auction?.category,
    auction?.subcategory,
    auction?.currentBid,
    auction?.startingBid,
    auction?.location,
    auction?.address,
    auction?.customFields?.an,
    auction?.customFields?.kilometraj,
    auction?.customFields?.motor,
    auction?.customFields?.putere,
    auction?.customFields?.suprafata,
    auction?.customFields?.camere,
    auction?.customFields?.city,
  ]);

  useEffect(() => {
    let cancelled = false;

    const loadAuction = async () => {
      setIsLoadingAuction(true);
      setLoadError(null);

      try {
        if (!auctionId || auctionId.trim() === '') {
          setLoadError('Slug-ul produsului lipsește din URL.');
          setIsLoadingAuction(false);
          return;
        }

        let productRow: any = null;

        const { data: slugProduct, error: slugError } = await supabase
          .from('products')
          .select('*')
          .eq('slug', auctionId)
          .neq('status', 'deleted')
          .maybeSingle();

        if (slugError && slugError.code !== 'PGRST116') {
          console.error('Error loading product:', slugError);
        } else if (slugProduct && slugProduct.product_type === 'licitatii-publice') {
          productRow = slugProduct;
        } else if (slugProduct && slugProduct.product_type !== 'licitatii-publice') {
          // Redirect către ruta corectă în funcție de product_type
          const productTypeRoutes: Record<string, string> = {
            'live-bid': 'live_bid',
            'buy-now': 'produs',
            'details-only': 'produs',
          };
          const correctRoute = productTypeRoutes[slugProduct.product_type] || 'produs';
          router.replace(`/${correctRoute}/${slugProduct.slug}`);
          return;
        }

        if (cancelled) return;

        if (!productRow) {
          setAuction(null);
          setLoadError('Anunțul nu a fost găsit.');
          setIsLoadingAuction(false);
          return;
        }

        const focalUrls = collectHttpProductImageUrls(productRow.images);
        const focalByUrl = focalUrls.length > 0 ? await fetchImageFocalByUrls(focalUrls) : {};
        (productRow as Record<string, unknown>).image_focal_by_url = focalByUrl;

        const auctionToUse = mapProductRowToAuction(productRow);
        setAuction(auctionToUse);
        const isRollingDaily = !!(auctionToUse.customFields?.auction_rolling_daily || (productRow.custom_fields as any)?.auction_rolling_daily);
        const rollingWeeklyWeekday = auctionToUse.customFields?.rolling_weekly_weekday;
        let countdownDate: string | undefined = isRollingDaily ? getNextMidnightISO() : auctionToUse.auctionDate;
        if (!isRollingDaily && rollingWeeklyWeekday == null && countdownDate && isAuctionDateInPast(countdownDate)) {
          countdownDate = getDateIn30DaysISO();
        }
        countdownCleanupRef.current = startCountdown(countdownDate, isRollingDaily, rollingWeeklyWeekday != null ? { rollingWeeklyWeekday, auctionTime: auctionToUse.customFields?.auction_time || auctionToUse.customFields?.ora_licitatie } : undefined);

        // Completează data/ora licitației din descriere în DB dacă lipseau
        const hasNoDateInDb = !productRow.auction_date || !String(productRow.auction_date).trim();
        if (hasNoDateInDb && productRow.description && String(productRow.description).trim().length > 50) {
          fetch("/api/licitatii-publice/fill-auction-from-description", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ productId: productRow.id }),
          })
            .then((res) => res.json())
            .then((data) => {
              if (data.success && data.updated) {
                supabase
                  .from("products")
                  .select("*")
                  .eq("id", productRow.id)
                  .maybeSingle()
                  .then(async ({ data: fresh }: { data: Record<string, unknown> | null }) => {
                    if (!fresh) return;
                    const fu = collectHttpProductImageUrls(fresh.images);
                    const fb = fu.length > 0 ? await fetchImageFocalByUrls(fu) : {};
                    fresh.image_focal_by_url = fb;
                    setAuction(mapProductRowToAuction(fresh));
                  });
              }
            })
            .catch(() => {});
        }

        // Flag local pentru a evita setarea multiplă a datelor executorului
        let executorDataAlreadySet = false;

        // Încărcăm datele executorului (licitator) din profilul utilizatorului
        console.log('[LicitatiiPublice] Loading executor data, productRow.user_id:', productRow.user_id);
        console.log('[LicitatiiPublice] ProductRow custom_fields:', JSON.stringify(productRow.custom_fields, null, 2));
        console.log('[LicitatiiPublice] All custom_fields keys:', Object.keys(productRow.custom_fields || {}));
        
        // Verifică mai întâi dacă există date în custom_fields (publice, fără RLS)
        const customFields = productRow.custom_fields || {};
        
        // Construiește datele executorului din custom_fields (prioritate 1 - publice)
        // Detalii executor din „Detalii din anunț (tabel site)” – REPES folosește exact: Licitator, Email, Telefon, Fax, Adresă, Cod fiscal, Competență
        const executorDataFromCustomFields = {
          licitatorName: customFields.licitator_name || 
            customFields.licitatorName || 
            customFields.Licitator_name || 
            customFields['Licitator'] ||
            customFields['Licitator name'] ||
            customFields['Nume licitator'] ||
            customFields.executor_name ||
            customFields.executorName ||
            undefined,
          licitatorAddress: customFields.licitator_address || 
            customFields.licitatorAddress || 
            customFields.Licitator_address || 
            customFields['Adresă'] ||
            customFields['Licitator address'] ||
            customFields['Adresă licitator'] ||
            customFields.executor_address ||
            undefined,
          licitatorFiscalCode: customFields.licitator_fiscal_code || 
            customFields.licitatorFiscalCode || 
            customFields.Licitator_fiscal_code || 
            customFields['Cod fiscal'] ||
            customFields['Licitator fiscal code'] || 
            customFields.CUI || 
            customFields.cui ||
            customFields['CUI licitator'] ||
            undefined,
          licitatorConsignmentAccount: customFields.licitator_consignment_account || 
            customFields.licitatorConsignmentAccount || 
            customFields.Licitator_consignment_account || 
            customFields['Licitator consignment account'] || 
            customFields['Cont consignatie'] ||
            customFields['Cont consignație'] ||
            customFields['Cont consignatie licitator'] ||
            customFields['Număr dosar execuțional'] ||
            undefined,
          licitatorEmail: customFields.licitator_email || 
            customFields.licitatorEmail || 
            customFields.Licitator_email || 
            customFields['Email'] ||
            customFields['Licitator email'] ||
            customFields['Email licitator'] ||
            customFields.executor_email ||
            undefined,
          licitatorPhone: customFields.licitator_phone || 
            customFields.licitatorPhone || 
            customFields.Licitator_phone || 
            customFields['Telefon'] ||
            customFields['Licitator phone'] ||
            customFields['Telefon licitator'] ||
            customFields.executor_phone ||
            undefined,
          licitatorFax: customFields.licitator_fax || 
            customFields.licitatorFax || 
            customFields.Licitator_fax || 
            customFields['Fax'] ||
            customFields['Licitator fax'] ||
            customFields['Fax licitator'] ||
            undefined,
          licitatorCompetence: customFields.licitator_competence || 
            customFields.licitatorCompetence || 
            customFields.Licitator_competence || 
            customFields['Competență'] ||
            customFields['Licitator competence'] ||
            customFields['Competență licitator'] ||
            customFields.competenta ||
            undefined,
          licitatorAvatar: customFields.avatar_url ||
            customFields.avatarUrl ||
            customFields.avatar ||
            undefined,
        };

        // Pentru produse REPES: business card DOAR din „Detalii din anunț” – încărcăm executor-meta ÎNTÂI ca sursă principală
        const isRepes = (productRow.custom_fields as { imported_from?: string } | undefined)?.imported_from === 'repes';
        if (isRepes && productRow.id) {
          try {
            const res = await fetch(`/api/licitatii-publice/executor-meta?productId=${encodeURIComponent(productRow.id)}`);
            if (res.ok) {
              const { meta } = await res.json();
              if (meta && typeof meta === 'object') {
                const m = meta as Record<string, string>;
                // Helper: ia prima valoare existentă din chei posibile (site-ul poate folosi "Telefon" sau "Telefon (Phone)" etc.)
                const fromMeta = (keys: string[]) => {
                  const v = keys.map((k) => m[k]).find((val) => val !== undefined && val !== null && String(val).trim() !== '');
                  return v !== undefined ? String(v).trim() || undefined : undefined;
                };
                executorDataFromCustomFields.licitatorName = fromMeta(['Licitator', 'Licitator name', 'Nume licitator']) ?? executorDataFromCustomFields.licitatorName;
                executorDataFromCustomFields.licitatorEmail = fromMeta(['Email', 'E-mail', 'Email licitator']) ?? executorDataFromCustomFields.licitatorEmail;
                executorDataFromCustomFields.licitatorPhone = fromMeta(['Telefon', 'Telefon (Phone)', 'Telefon licitator']) ?? executorDataFromCustomFields.licitatorPhone;
                executorDataFromCustomFields.licitatorFax = fromMeta(['Fax']) ?? executorDataFromCustomFields.licitatorFax;
                executorDataFromCustomFields.licitatorAddress = fromMeta(['Adresă', 'Adresă (Address)', 'Adresă licitator']) ?? executorDataFromCustomFields.licitatorAddress;
                executorDataFromCustomFields.licitatorFiscalCode = fromMeta(['Cod fiscal', 'CUI']) ?? executorDataFromCustomFields.licitatorFiscalCode;
                executorDataFromCustomFields.licitatorCompetence = fromMeta(['Competență', 'Competență (Jurisdiction/Competence)']) ?? executorDataFromCustomFields.licitatorCompetence;
                executorDataFromCustomFields.licitatorConsignmentAccount = fromMeta(['Număr dosar execuțional', 'Cont consignatie', 'Cont consignație']) ?? executorDataFromCustomFields.licitatorConsignmentAccount;
                // Fallback: mapează orice cheie din meta care conține "email", "telefon", "adresă" (indiferent de diacritice)
                const normalize = (s: string) => s.toLowerCase().normalize('NFD').replace(/\u0307/g, '').replace(/[\u0300-\u036f]/g, '');
                for (const [key, value] of Object.entries(m)) {
                  if (value == null || String(value).trim() === '') continue;
                  const k = normalize(String(key));
                  if (!executorDataFromCustomFields.licitatorEmail && (k.includes('email') || k === 'e-mail')) executorDataFromCustomFields.licitatorEmail = String(value).trim();
                  if (!executorDataFromCustomFields.licitatorPhone && (k.includes('telefon') || k.includes('phone'))) executorDataFromCustomFields.licitatorPhone = String(value).trim();
                  if (!executorDataFromCustomFields.licitatorAddress && k.includes('adres')) executorDataFromCustomFields.licitatorAddress = String(value).trim();
                }
              }
            }
          } catch (e) {
            console.warn('[LicitatiiPublice] executor-meta fetch failed:', e);
          }
        }
        
        const hasCustomFieldsData = Object.values(executorDataFromCustomFields).some(val => val !== undefined && val !== null && val !== '');
        
        console.log('[LicitatiiPublice] Executor data from custom_fields:', {
          executorDataFromCustomFields,
          hasCustomFieldsData,
          isRepes,
          avatarUrl: executorDataFromCustomFields.licitatorAvatar,
          customFieldsKeys: Object.keys(customFields),
          customFieldsAvatar: customFields.avatar_url || customFields.avatarUrl || customFields.avatar
        });
        
        // Produse REPES (executări publice): business card DOAR din „Detalii din anunț (tabel site)” – custom_fields + executor-meta
        if (isRepes) {
          if (hasCustomFieldsData) {
            setExecutorData(executorDataFromCustomFields);
            executorDataAlreadySet = !!(
              executorDataFromCustomFields.licitatorName ||
              executorDataFromCustomFields.licitatorAddress ||
              executorDataFromCustomFields.licitatorEmail ||
              executorDataFromCustomFields.licitatorPhone
            );
          }
        } else if (hasCustomFieldsData) {
          // Alte produse: custom_fields + eventual avatar din user_profiles
          if (!executorDataFromCustomFields.licitatorAvatar && productRow.user_id) {
            try {
              const { data: executorProfile } = await supabase
                .from('user_profiles')
                .select('avatar_url')
                .eq('user_id', productRow.user_id)
                .maybeSingle();
              
              if (executorProfile?.avatar_url) {
                executorDataFromCustomFields.licitatorAvatar = executorProfile.avatar_url;
                console.log('[LicitatiiPublice] Added avatar from user_profiles to executorDataFromCustomFields:', executorProfile.avatar_url);
                
                if (productRow.id) {
                  try {
                    const updatedCustomFields = {
                      ...customFields,
                      avatar_url: executorProfile.avatar_url
                    };
                    await supabase
                      .from('products')
                      .update({ custom_fields: updatedCustomFields })
                      .eq('id', productRow.id);
                    console.log('[LicitatiiPublice] Synced avatar_url to custom_fields for product:', productRow.id);
                  } catch (syncError) {
                    console.error('[LicitatiiPublice] Error syncing avatar to custom_fields:', syncError);
                  }
                }
              }
            } catch (profileError) {
              console.error('[LicitatiiPublice] Error fetching avatar from user_profiles:', profileError);
            }
          }
          
          console.log('[LicitatiiPublice] Using executor data from custom_fields (public):', executorDataFromCustomFields);
          setExecutorData(executorDataFromCustomFields);
          
          const hasPublicContact = !!(
            executorDataFromCustomFields.licitatorName ||
            executorDataFromCustomFields.licitatorAddress ||
            executorDataFromCustomFields.licitatorEmail ||
            executorDataFromCustomFields.licitatorPhone
          );
          executorDataAlreadySet = hasPublicContact;
        } else if (!isRepes && productRow.user_id) {
          // Dacă nu există date în custom_fields, încercăm să le luăm din user_profiles (poate necesita autentificare)
          try {
            const { data: executorProfile, error: executorError } = await supabase
              .from('user_profiles')
              .select('licitator_name, licitator_address, licitator_fiscal_code, licitator_consignment_account, licitator_email, licitator_phone, licitator_fax, licitator_competence, avatar_url')
              .eq('user_id', productRow.user_id)
              .maybeSingle();

            console.log('[LicitatiiPublice] Executor profile query result:', {
              hasData: !!executorProfile,
              error: executorError,
              errorCode: executorError?.code,
              errorMessage: executorError?.message,
              profile: executorProfile,
              customFieldsKeys: Object.keys(customFields),
              userId: productRow.user_id
            });

            // Construiește datele executorului din profil sau custom_fields
            // Caută în toate variantele posibile de nume de câmpuri
            const executorDataToSet = {
              licitatorName: executorProfile?.licitator_name || 
                customFields.licitator_name || 
                customFields.licitatorName || 
                customFields.Licitator_name || 
                customFields['Licitator name'] ||
                customFields['Nume licitator'] ||
                customFields.executor_name ||
                customFields.executorName ||
                undefined,
              licitatorAddress: executorProfile?.licitator_address || 
                customFields.licitator_address || 
                customFields.licitatorAddress || 
                customFields.Licitator_address || 
                customFields['Licitator address'] ||
                customFields['Adresă licitator'] ||
                customFields.executor_address ||
                undefined,
              licitatorFiscalCode: executorProfile?.licitator_fiscal_code || 
                customFields.licitator_fiscal_code || 
                customFields.licitatorFiscalCode || 
                customFields.Licitator_fiscal_code || 
                customFields['Licitator fiscal code'] || 
                customFields.CUI || 
                customFields.cui ||
                customFields['CUI licitator'] ||
                undefined,
              licitatorConsignmentAccount: executorProfile?.licitator_consignment_account || 
                customFields.licitator_consignment_account || 
                customFields.licitatorConsignmentAccount || 
                customFields.Licitator_consignment_account || 
                customFields['Licitator consignment account'] || 
                customFields['Cont consignatie'] ||
                customFields['Cont consignație'] ||
                customFields['Cont consignatie licitator'] ||
                undefined,
              licitatorEmail: executorProfile?.licitator_email || 
                customFields.licitator_email || 
                customFields.licitatorEmail || 
                customFields.Licitator_email || 
                customFields['Licitator email'] ||
                customFields['Email licitator'] ||
                customFields.executor_email ||
                undefined,
              licitatorPhone: executorProfile?.licitator_phone || 
                customFields.licitator_phone || 
                customFields.licitatorPhone || 
                customFields.Licitator_phone || 
                customFields['Licitator phone'] ||
                customFields['Telefon licitator'] ||
                customFields.executor_phone ||
                undefined,
              licitatorFax: executorProfile?.licitator_fax || 
                customFields.licitator_fax || 
                customFields.licitatorFax || 
                customFields.Licitator_fax || 
                customFields['Licitator fax'] ||
                customFields['Fax licitator'] ||
                undefined,
              licitatorCompetence: executorProfile?.licitator_competence || 
                customFields.licitator_competence || 
                customFields.licitatorCompetence || 
                customFields.Licitator_competence || 
                customFields['Licitator competence'] ||
                customFields['Competență licitator'] ||
                customFields.competenta ||
                undefined,
              licitatorAvatar: customFields.avatar_url ||
                customFields.avatarUrl ||
                customFields.avatar ||
                executorProfile?.avatar_url ||
                undefined,
            };
            
            // Verifică dacă există cel puțin o valoare
            const hasAnyData = Object.values(executorDataToSet).some(val => val !== undefined && val !== null && val !== '');
            
            // Sync avatar_url to custom_fields if it exists in profile but not in custom_fields
            if (executorProfile?.avatar_url && !customFields.avatar_url && !customFields.avatarUrl && !customFields.avatar && productRow.id) {
              try {
                const updatedCustomFields = {
                  ...customFields,
                  avatar_url: executorProfile.avatar_url
                };
                await supabase
                  .from('products')
                  .update({ custom_fields: updatedCustomFields })
                  .eq('id', productRow.id);
                console.log('[LicitatiiPublice] Synced avatar_url to custom_fields for product:', productRow.id);
                // Update executorDataToSet with synced avatar
                executorDataToSet.licitatorAvatar = executorProfile.avatar_url;
              } catch (syncError) {
                console.error('[LicitatiiPublice] Error syncing avatar to custom_fields:', syncError);
              }
            }
            
            if (hasAnyData) {
              console.log('[LicitatiiPublice] Setting executor data:', executorDataToSet);
              setExecutorData(executorDataToSet);
              const hasContact = !!(
                executorDataToSet.licitatorName ||
                executorDataToSet.licitatorAddress ||
                executorDataToSet.licitatorEmail ||
                executorDataToSet.licitatorPhone
              );
              executorDataAlreadySet = hasContact;
            } else {
              console.log('[LicitatiiPublice] No executor data found in profile or custom_fields');
              // Nu mai logăm eroarea dacă este doar un obiect gol (nu există date) sau dacă este PGRST116 (no rows)
              // Verifică dacă există o eroare reală (cu code și message)
              const errorKeys = executorError ? Object.keys(executorError) : [];
              const hasRealError = executorError && 
                errorKeys.length > 0 && 
                'code' in executorError && 
                executorError.code !== 'PGRST116' && 
                'message' in executorError;
              
              if (hasRealError) {
                console.error('[LicitatiiPublice] Error loading executor profile:', executorError);
              } else {
                // Nu este o eroare reală, doar nu există date (normal)
                console.log('[LicitatiiPublice] No executor profile found (this is normal if executor has not filled in licitator details)');
              }
            }
          } catch (executorError) {
            console.error('[LicitatiiPublice] Exception loading executor data:', executorError);
          }
        } else if (hasCustomFieldsData) {
          // Dacă nu există user_id dar există date în custom_fields
          const executorDataToSet = {
            licitatorName: customFields.licitator_name || customFields.licitatorName || customFields.Licitator_name || customFields['Licitator'] || customFields['Licitator name'] || undefined,
            licitatorAddress: customFields.licitator_address || customFields.licitatorAddress || customFields.Licitator_address || customFields['Adresă'] || customFields['Licitator address'] || undefined,
            licitatorFiscalCode: customFields.licitator_fiscal_code || customFields.licitatorFiscalCode || customFields.Licitator_fiscal_code || customFields['Cod fiscal'] || customFields['Licitator fiscal code'] || customFields.CUI || customFields.cui || undefined,
            licitatorConsignmentAccount: customFields.licitator_consignment_account || customFields.licitatorConsignmentAccount || customFields.Licitator_consignment_account || customFields['Licitator consignment account'] || customFields['Cont consignatie'] || customFields['Număr dosar execuțional'] || undefined,
            licitatorEmail: customFields.licitator_email || customFields.licitatorEmail || customFields.Licitator_email || customFields['Email'] || customFields['Licitator email'] || undefined,
            licitatorPhone: customFields.licitator_phone || customFields.licitatorPhone || customFields.Licitator_phone || customFields['Telefon'] || customFields['Licitator phone'] || undefined,
            licitatorFax: customFields.licitator_fax || customFields.licitatorFax || customFields.Licitator_fax || customFields['Fax'] || customFields['Licitator fax'] || undefined,
            licitatorCompetence: customFields.licitator_competence || customFields.licitatorCompetence || customFields.Licitator_competence || customFields['Competență'] || customFields['Licitator competence'] || undefined,
          };
          
          const hasAnyData = Object.values(executorDataToSet).some(val => val !== undefined && val !== null && val !== '');
          if (hasAnyData) {
            console.log('[LicitatiiPublice] Setting executor data from custom_fields (no user_id):', executorDataToSet);
            setExecutorData(executorDataToSet);
            const hasContact = !!(
              executorDataToSet.licitatorName ||
              executorDataToSet.licitatorAddress ||
              executorDataToSet.licitatorEmail ||
              executorDataToSet.licitatorPhone
            );
            executorDataAlreadySet = hasContact;
          } else {
            console.log('[LicitatiiPublice] No executor data found in custom_fields');
          }
        } else {
          console.log('[LicitatiiPublice] No user_id found in productRow and no custom_fields data');
        }

        // Fallback public: dacă încă nu avem date și există user_id, solicită profilul prin endpoint cu service role (nu pentru REPES – acolo doar Detalii anunț)
        if (!executorDataAlreadySet && productRow.user_id && !isRepes) {
          try {
            const response = await fetch(`/api/executor/licitator-public?userId=${productRow.user_id}`);
            if (response.ok) {
              const { executorProfile } = await response.json();
              if (executorProfile) {
                const executorDataFromApi = {
                  licitatorName: executorProfile.licitator_name || undefined,
                  licitatorAddress: executorProfile.licitator_address || undefined,
                  licitatorFiscalCode: executorProfile.licitator_fiscal_code || undefined,
                  licitatorConsignmentAccount: executorProfile.licitator_consignment_account || undefined,
                  licitatorEmail: executorProfile.licitator_email || undefined,
                  licitatorPhone: executorProfile.licitator_phone || undefined,
                  licitatorFax: executorProfile.licitator_fax || undefined,
                  licitatorCompetence: executorProfile.licitator_competence || undefined,
                  licitatorAvatar: executorProfile.avatar_url || undefined,
                };

                const hasAnyData = Object.values(executorDataFromApi).some(
                  (val) => val !== undefined && val !== null && val !== ''
                );

                if (hasAnyData) {
                  console.log('[LicitatiiPublice] Setting executor data from public API:', executorDataFromApi);
                  setExecutorData(executorDataFromApi);
                  executorDataAlreadySet = true;
                }
              }
            } else {
              const responseText = await response.text().catch(() => '');
              console.error('[LicitatiiPublice] Public executor API response not ok', response.status, response.statusText, responseText);
            }
          } catch (publicError) {
            console.error('[LicitatiiPublice] Error fetching public executor data:', publicError);
          }
        }

        // Încărcăm recomandări: progresiv (categorie → subcategorie → rest), prioritate la produsele cu poză
        try {
          const currentCategory = (productRow?.category ?? '').trim().toLowerCase();
          const currentSubcategory = (productRow?.subcategory ?? '').trim().toLowerCase();
          const tipProdusCurent =
            productRow?.custom_fields?.Tip_produs ||
            productRow?.custom_fields?.tip_produs ||
            productRow?.category ||
            null;

          const { data: recData, error: recError } = await supabase
            .from('products')
            .select('*')
            .eq('product_type', productRow.product_type)
            .neq('id', productRow.id)
            .neq('status', 'deleted')
            .limit(50);

          if (recError && recError.code !== 'PGRST116') {
            console.error('Error loading recommended auctions:', recError);
            setRecommendedAuctions([]);
          } else if (recData && Array.isArray(recData)) {
            const hasImage = (row: any) => {
              const imgs = Array.isArray(row?.images) ? row.images : (row?.images ? [row.images] : []);
              const first = imgs[0];
              const url = typeof first === 'string' ? first : (first?.url ?? '');
              return !!url && url !== '/no-image-placeholder.svg' && !String(url).includes('placeholder');
            };
            const byImage = (a: any, b: any) => (hasImage(b) ? 1 : 0) - (hasImage(a) ? 1 : 0);

            const rowCat = (r: any) => (r?.category ?? '').trim().toLowerCase();
            const rowSub = (r: any) => (r?.subcategory ?? '').trim().toLowerCase();
            const rowTip = (r: any) =>
              r?.custom_fields?.Tip_produs || r?.custom_fields?.tip_produs || r?.category || null;

            const sameCatAndSub = recData
              .filter((r: any) => currentCategory && currentSubcategory && rowCat(r) === currentCategory && rowSub(r) === currentSubcategory)
              .sort(byImage);
            const sameCat = recData
              .filter((r: any) => rowCat(r) === currentCategory && (rowSub(r) !== currentSubcategory || !currentSubcategory))
              .sort(byImage);
            const sameSub = recData
              .filter((r: any) => currentSubcategory && rowSub(r) === currentSubcategory && rowCat(r) !== currentCategory)
              .sort(byImage);
            const sameTipOnly = tipProdusCurent
              ? recData.filter(
                  (r: any) =>
                    rowTip(r) === tipProdusCurent &&
                    !sameCatAndSub.includes(r) &&
                    !sameCat.includes(r) &&
                    !sameSub.includes(r)
                ).sort(byImage)
              : [];
            const rest = recData.filter(
              (r: any) =>
                !sameCatAndSub.includes(r) && !sameCat.includes(r) && !sameSub.includes(r) && !sameTipOnly.includes(r)
            ).sort(byImage);

            const combined = [...sameCatAndSub, ...sameCat, ...sameSub, ...sameTipOnly, ...rest].slice(0, 8);
            setRecommendedAuctions(combined.map(mapProductRowToAuction));
          } else {
            setRecommendedAuctions([]);
          }
        } catch (recError) {
          console.error('Error loading recommended auctions:', recError);
          setRecommendedAuctions([]);
        }

        // Încărcăm produsele userului (executor) dacă are mai multe licitații publice
        try {
          if (productRow.user_id) {
            const { data: userProductsData, error: userProductsError } = await supabase
              .from('products')
              .select('*')
              .eq('user_id', productRow.user_id)
              .eq('product_type', 'licitatii-publice')
              .neq('id', productRow.id)
              .in('status', ['active', 'reserved', 'sold'])
              .neq('status', 'deleted')
              .limit(5);

            if (userProductsError && userProductsError.code !== 'PGRST116') {
              console.error('Error loading user products:', userProductsError);
              setUserProducts([]);
            } else if (userProductsData && Array.isArray(userProductsData) && userProductsData.length > 0) {
              setUserProducts(userProductsData.map(mapProductRowToAuction));
            } else {
              setUserProducts([]);
            }
          } else {
            setUserProducts([]);
          }
        } catch (userProductsError) {
          console.error('Error loading user products:', userProductsError);
          setUserProducts([]);
        }

        trackProductView(auctionToUse.id, {
          title: auctionToUse.title,
          category: auctionToUse.category,
          location: auctionToUse.location,
        });

        // Track pentru istoricul produselor vizionate (cu URL licitatii-publice)
        if (typeof window !== 'undefined') {
          try {
            const images = Array.isArray(productRow.images) ? productRow.images : (productRow.images ? [productRow.images] : []);
            const firstImage = images.length > 0 ? (typeof images[0] === 'string' ? images[0] : (images[0] as any)?.url || '') : '';
            const displayImg = getProductDisplayImage({ images: productRow?.images, image: firstImage || undefined, category: productRow?.category, subcategory: productRow?.subcategory, main_category: (productRow?.custom_fields as any)?.main_category });
            trackRecentlyViewed({
              id: productRow.id,
              title: productRow.title || 'Produs',
              image: displayImg,
              price: productRow.starting_price || productRow.starting_price_ron || undefined,
              currency: productRow.currency || 'RON',
              slug: productRow.slug || undefined,
              url: auctionToUse.slug ? `/licitatii-publice/${auctionToUse.slug}` : undefined,
              location: auctionToUse.location || undefined,
              category: productRow?.category,
              subcategory: productRow?.subcategory,
              main_category: (productRow?.custom_fields as any)?.main_category,
            });
          } catch (err) {
            console.error('Error tracking recently viewed product:', err);
          }
        }
      } catch (error) {
        console.error('Error loading auction:', error);
        if (!cancelled) {
          setAuction(null);
          setLoadError('A apărut o eroare la încărcarea anunțului.');
        }
      } finally {
        if (!cancelled) {
          setIsLoadingAuction(false);
        }
      }
    };

    loadAuction();

    return () => {
      cancelled = true;
      countdownCleanupRef.current?.();
      countdownCleanupRef.current = null;
    };
  }, [auctionId, mapProductRowToAuction, startCountdown]);

  // Încarcă produsele vizionate recent din localStorage (exclude produsul curent)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const raw = localStorage.getItem('recentlyViewedProducts');
      if (!raw) {
        setRecentlyViewedProducts([]);
        return;
      }
      const list: Array<{ id: string; title?: string; image?: string | string[]; price?: number; slug?: string; url?: string; viewedAt?: number; location?: string; category?: string; subcategory?: string; main_category?: string }> = JSON.parse(raw);
      const currentId = auction?.id || '';
      const filtered = list.filter((p) => p.id !== currentId);
      const sorted = [...filtered].sort((a, b) => (b.viewedAt || 0) - (a.viewedAt || 0));
      const mapped = sorted.slice(0, 10).map((p) => {
        const img = Array.isArray(p.image) ? (p.image[0] || '') : (p.image || '');
        const imageUrl = typeof img === 'string' ? img : '';
        const useCategoryWhenEmptyOrPlaceholder = !imageUrl || isPlaceholderImage(imageUrl);
        const displayImage = useCategoryWhenEmptyOrPlaceholder
          ? getProductDisplayImage({ image: undefined, category: p.category, subcategory: p.subcategory, main_category: p.main_category })
          : imageUrl;
        return {
          id: p.id,
          title: p.title || 'Produs',
          image: displayImage,
          slug: p.slug,
          url: p.url,
          startingBidRON: p.price,
          location: p.location || '—',
          viewedAt: p.viewedAt,
        };
      });
      setRecentlyViewedProducts(mapped);
    } catch (e) {
      setRecentlyViewedProducts([]);
    }
  }, [auction?.id]);

  const toggleFavorite = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (isFavorite) {
        // Remove favorite
        if (session) {
          const response = await fetch(`/api/user/favorites?itemId=${auctionId}&itemType=auction`, {
            method: 'DELETE',
            headers: {
              'Authorization': `Bearer ${session.access_token}`
            }
          });
          if (response.ok) {
            setIsFavorite(false);
          }
        } else {
          // Remove from localStorage only (guest user)
          if (typeof window !== 'undefined') {
            const savedFavorites = localStorage.getItem('favoriteAuctions');
            let favorites = savedFavorites ? JSON.parse(savedFavorites) : [];
            favorites = favorites.filter((id: string) => id !== auctionId);
            localStorage.setItem('favoriteAuctions', JSON.stringify(favorites));
            setIsFavorite(false);
          }
        }
      } else {
        // Add favorite
        if (session) {
          // User is logged in - check if lists exist
          const favoritesResponse = await fetch('/api/user/favorites', {
            headers: {
              'Authorization': `Bearer ${session.access_token}`
            }
          });

          if (favoritesResponse.ok) {
            const favoritesData = await favoritesResponse.json();
            const listsData = favoritesData.favoriteLists || [];

            // If no lists exist, create "LISTA 1" and save directly
            if (listsData.length === 0) {
              const userId = session.user.id;
              const lista1Id = `lista-1-${userId}`;
              
              // Create "LISTA 1"
              const createListResponse = await fetch('/api/user/favorite-lists', {
                method: 'POST',
                headers: {
                  'Authorization': `Bearer ${session.access_token}`,
                  'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                  id: lista1Id,
                  name: 'LISTA 1'
                })
              });

              if (createListResponse.ok) {
                const newList = await createListResponse.json();
                
                // Save favorite directly to "LISTA 1"
                const addResponse = await fetch('/api/user/favorites', {
                  method: 'POST',
                  headers: {
                    'Authorization': `Bearer ${session.access_token}`,
                    'Content-Type': 'application/json'
                  },
                  body: JSON.stringify({
                    itemId: auctionId,
                    itemType: 'auction',
                    favoriteListId: newList.id
                  })
                });

                if (addResponse.ok) {
                  setIsFavorite(true);
                  return;
                }
              }
            } else if (listsData.length === 1) {
              // Only one list exists - save directly without modal
              const addResponse = await fetch('/api/user/favorites', {
                method: 'POST',
                headers: {
                  'Authorization': `Bearer ${session.access_token}`,
                  'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                  itemId: auctionId,
                  itemType: 'auction',
                  favoriteListId: listsData[0].id
                })
              });

              if (addResponse.ok) {
                setIsFavorite(true);
                return;
              }
            } else {
              // Multiple lists exist - show modal to select lists
              setSelectedProductForFavorite({
                id: auctionId,
                title: auction?.title || 'Produs'
              });
              setShowFavoriteModal(true);
            }
          }
        } else {
          // Guest user - add to localStorage only
          if (typeof window !== 'undefined') {
            const savedFavorites = localStorage.getItem('favoriteAuctions');
            let favorites = savedFavorites ? JSON.parse(savedFavorites) : [];
            favorites.push(auctionId);
            localStorage.setItem('favoriteAuctions', JSON.stringify(favorites));
            setIsFavorite(true);
          }
        }
      }
    } catch (error) {
      console.error('Error toggling favorite:', error);
    }
  };

  // Check if product is in favorites on page load
  useEffect(() => {
    const checkFavoriteStatus = async () => {
      if (!auctionId) return;
      
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          // User is logged in - check from API
          const response = await fetch('/api/user/favorites', {
            headers: {
              'Authorization': `Bearer ${session.access_token}`
            }
          });
          if (response.ok) {
            const data = await response.json();
            const favorites = data.favorites || [];
            const favoriteIds = favorites.map((f: any) => f.item_id);
            if (favoriteIds.includes(auctionId)) {
              setIsFavorite(true);
            } else {
              setIsFavorite(false);
            }
          }
        } else {
          // Guest user - check from localStorage
          if (typeof window !== 'undefined') {
            const savedFavorites = localStorage.getItem('favoriteAuctions');
            if (savedFavorites) {
              const favorites = JSON.parse(savedFavorites);
              setIsFavorite(favorites.includes(auctionId));
            } else {
              setIsFavorite(false);
            }
          }
        }
      } catch (error) {
        console.error('Error checking favorite status:', error);
      }
    };
    
    checkFavoriteStatus();
  }, [auctionId]);

  const handleFavoriteModalSuccess = () => {
    // Reload favorites after modal success
    const loadFavorites = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          const response = await fetch('/api/user/favorites', {
            headers: {
              'Authorization': `Bearer ${session.access_token}`
            }
          });
          if (response.ok) {
            const data = await response.json();
            const favorites = data.favorites || [];
            const favoriteIds = favorites.map((f: any) => f.item_id);
            if (favoriteIds.includes(auctionId)) {
              setIsFavorite(true);
            } else {
              setIsFavorite(false);
            }
          }
        } else {
          // Guest user - check from localStorage
          if (typeof window !== 'undefined') {
            const savedFavorites = localStorage.getItem('favoriteAuctions');
            if (savedFavorites) {
              const favorites = JSON.parse(savedFavorites);
              setIsFavorite(favorites.includes(auctionId));
            } else {
              setIsFavorite(false);
            }
          }
        }
      } catch (error) {
        console.error('Error reloading favorites:', error);
      }
    };
    loadFavorites();
  };

  const shareAuction = async (platform?: string) => {
    if (typeof window === 'undefined' || !auction) {
      return;
    }

    const url = window.location.href;
    const title = auction.title;
    const text = auction.description || title;

    try {
      switch (platform) {
        case 'whatsapp':
          window.open(`https://wa.me/?text=${encodeURIComponent(`${title} ${url}`)}`, '_blank');
          setShowShareMenu(false);
          break;
        
        case 'facebook':
          window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`, '_blank');
          setShowShareMenu(false);
          break;
        
        case 'gmail':
          window.open(`mailto:?subject=${encodeURIComponent(title)}&body=${encodeURIComponent(`${text}\n\n${url}`)}`, '_blank');
          setShowShareMenu(false);
          break;
        
        case 'telegram':
          window.open(`https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(title)}`, '_blank');
          setShowShareMenu(false);
          break;
        
        case 'twitter':
          window.open(`https://twitter.com/intent/tweet?url=${encodeURIComponent(url)}&text=${encodeURIComponent(title)}`, '_blank');
          setShowShareMenu(false);
          break;
        
        case 'copy':
          await navigator.clipboard.writeText(url);
          alert('Link-ul a fost copiat în clipboard!');
          setShowShareMenu(false);
          break;
        
        default:
          // Native share (mobile)
          if (navigator.share) {
            await navigator.share({
              title: title,
              text: text,
              url: url
            });
      } else {
            // Fallback la copy
            await navigator.clipboard.writeText(url);
            alert('Link-ul a fost copiat în clipboard!');
          }
          setShowShareMenu(false);
      }
    } catch (error: any) {
      if (error.name === 'AbortError') {
        return;
      }
      console.error('Error sharing:', error);
    }
  };

  const handleShareMenuAction = async (action: AuctionShareMenuAction) => {
    if (action === "native") {
      await shareAuction();
    } else {
      await shareAuction(action);
    }
  };

  const nextImage = useCallback(() => {
    if (auction && auction.images) {
      // Total items = doar imaginile (fără slide suplimentar)
      const totalItems = auction.images.length;
      setCurrentImageIndex(prev => (prev + 1) % totalItems);
    }
  }, [auction]);

  const prevImage = useCallback(() => {
    if (auction && auction.images) {
      // Total items = doar imaginile (fără slide suplimentar)
      const totalItems = auction.images.length;
      setCurrentImageIndex(prev => (prev - 1 + totalItems) % totalItems);
    }
  }, [auction]);

  // Touch/swipe state for image gallery
  const [touchStart, setTouchStart] = useState<number | null>(null);
  const [touchEnd, setTouchEnd] = useState<number | null>(null);

  // Minimum swipe distance (in pixels)
  const minSwipeDistance = 50;

  const onTouchStart = (e: React.TouchEvent) => {
    setTouchEnd(null);
    setTouchStart(e.targetTouches[0].clientX);
  };

  const onTouchMove = (e: React.TouchEvent) => {
    setTouchEnd(e.targetTouches[0].clientX);
  };

  const onTouchEnd = useCallback(() => {
    if (!touchStart || !touchEnd) return;
    const distance = touchStart - touchEnd;
    const isLeftSwipe = distance > minSwipeDistance;
    const isRightSwipe = distance < -minSwipeDistance;

    if (isLeftSwipe && auction && auction.images) {
      nextImage();
    }
    if (isRightSwipe && auction && auction.images) {
      prevImage();
    }
  }, [touchStart, touchEnd, auction, nextImage, prevImage]);

  // Keyboard navigation for image gallery + body scroll lock
  useEffect(() => {
    if (!showImageGallery || !auction) {
      // Restore scroll when gallery is closed
      document.body.style.overflow = '';
      document.body.style.position = '';
      document.body.style.width = '';
      return;
    }

    // Debug: Log when gallery opens
    console.log('🖼️ GALERIA NOUA SE DESCHIDE!', { showImageGallery, imagesCount: auction.images?.length });

    // Lock body scroll when gallery is open
    document.body.style.overflow = 'hidden';
    document.body.style.position = 'fixed';
    document.body.style.width = '100%';

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowImageGallery(false);
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        prevImage();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        nextImage();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      // Restore scroll when component unmounts
      document.body.style.overflow = '';
      document.body.style.position = '';
      document.body.style.width = '';
    };
  }, [showImageGallery, auction, nextImage, prevImage]);

  // Nelogat: cerem autentificare – anunțurile de licitații publice nu se pot vedea fără cont
  if (authChecked && !hasSession) {
    const loginRedirect = typeof window !== 'undefined'
      ? `${window.location.pathname}${window.location.search || ''}`
      : `/licitatii-publice/${auctionId}`;
    const loginUrl = `/auth?mode=login&redirect=${encodeURIComponent(loginRedirect)}`;
    return (
      <div className={`min-h-screen ${isDarkMode ? 'bg-gray-900' : 'bg-gray-50'}`}>
        <UniversalHeader isDarkMode={isDarkMode} onToggleDarkMode={() => setIsDarkMode(!isDarkMode)} />
        <div className="flex items-center justify-center min-h-[70vh] px-4">
          <div className={`text-center max-w-md rounded-2xl border p-8 ${
            isDarkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200 shadow-lg'
          }`}>
            <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 ${
              isDarkMode ? 'bg-amber-500/20' : 'bg-amber-100'
            }`}>
              <i className="ri-lock-line text-3xl text-amber-500" aria-hidden />
            </div>
            <h2 className={`text-xl font-bold mb-2 ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
              Autentificare necesară
            </h2>
            <p className={`text-sm mb-6 ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
              Trebuie să fii autentificat pentru a vedea anunțurile de licitații publice. Autentifică-te sau creează un cont pentru a continua.
            </p>
            <a
              href={loginUrl}
              className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-lg font-medium bg-amber-500 hover:bg-amber-600 text-white transition-colors"
            >
              <i className="ri-login-box-line text-lg" aria-hidden /> Autentifică-te
            </a>
          </div>
        </div>
      </div>
    );
  }

  // Înainte de a verifica auth, nu afișăm conținutul anunțului
  if (!authChecked) {
    return (
      <div className={`min-h-screen ${isDarkMode ? 'bg-gray-900' : 'bg-white'}`}>
        <UniversalHeader isDarkMode={isDarkMode} onToggleDarkMode={() => setIsDarkMode(!isDarkMode)} />
        <div className="flex items-center justify-center min-h-[70vh]">
          <div className="text-center">
            <div className={`animate-spin rounded-full h-12 w-12 border-4 mx-auto mb-4 ${
              isDarkMode ? 'border-gray-700 border-t-blue-500' : 'border-gray-200 border-t-blue-600'
            }`} />
            <p className={isDarkMode ? 'text-gray-400' : 'text-gray-600'}>Se încarcă...</p>
          </div>
        </div>
      </div>
    );
  }

  if (isLoadingAuction) {
    return (
      <div className={`min-h-screen ${isDarkMode ? 'bg-gray-900' : 'bg-white'}`}>
        <UniversalHeader isDarkMode={isDarkMode} onToggleDarkMode={() => setIsDarkMode(!isDarkMode)} />
        <div className="flex items-center justify-center min-h-[70vh]">
          <div className="text-center">
            <div className={`animate-spin rounded-full h-12 w-12 border-4 mx-auto mb-4 ${
              isDarkMode 
                ? 'border-gray-700 border-t-blue-500' 
                : 'border-gray-200 border-t-blue-600'
            }`}></div>
            <p className={`font-medium ${
              isDarkMode ? 'text-gray-400' : 'text-gray-600'
            }`}>Se încarcă...</p>
          </div>
        </div>
      </div>
    );
  }

  // Error state
  if (!auction || loadError) {
    return (
      <div className={`min-h-screen ${isDarkMode ? 'bg-gray-900' : 'bg-white'}`}>
        <UniversalHeader isDarkMode={isDarkMode} onToggleDarkMode={() => setIsDarkMode(!isDarkMode)} />
        <div className="flex items-center justify-center min-h-[70vh] px-4">
          <div className="text-center max-w-md">
            <div className="text-6xl mb-6">😕</div>
            <h2 className={`text-2xl font-bold mb-3 ${
              isDarkMode ? 'text-white' : 'text-gray-900'
            }`}>
              {loadError || 'Anunțul nu a fost găsit'}
            </h2>
              <button
              onClick={() => router.push('/licitatii-publice')}
              className="mt-6 px-8 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold transition"
              >
                Înapoi la licitații
              </button>
          </div>
        </div>
      </div>
    );
  }

  const showAuctionEnded = isAuctionEnded && !auction?.customFields?.auction_rolling_daily && (auction?.customFields?.rolling_weekly_weekday == null);

  return (
    <div className={`min-h-screen ${isDarkMode ? 'bg-gray-900' : 'bg-gray-50'}`}>
      <UniversalHeader isDarkMode={isDarkMode} onToggleDarkMode={() => setIsDarkMode(!isDarkMode)} />

      {/* Modal confirmare deblocare licitație în curs */}
      {showUnlockInProgressConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          onClick={() => setShowUnlockInProgressConfirm(false)}
        >
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
          <div
            className={`relative w-full max-w-md rounded-2xl shadow-2xl border ${
              isDarkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setShowUnlockInProgressConfirm(false)}
              className={`absolute top-4 right-4 p-2 rounded-full transition-colors ${
                isDarkMode ? 'hover:bg-gray-700 text-gray-400 hover:text-white' : 'hover:bg-gray-100 text-gray-500 hover:text-gray-700'
              }`}
            >
              <i className="ri-close-line text-xl" />
            </button>
            <div className="p-6 md:p-8">
              <div className="flex justify-center mb-4">
                <div className={`w-16 h-16 rounded-full flex items-center justify-center ${
                  isDarkMode ? 'bg-amber-500/20' : 'bg-amber-100'
                }`}>
                  <i className="ri-information-line text-3xl text-amber-500" />
                </div>
              </div>
              <h3 className={`text-xl md:text-2xl font-bold text-center mb-2 ${
                isDarkMode ? 'text-white' : 'text-gray-900'
              }`}>
                Ești sigur?
              </h3>
              <p className={`text-sm md:text-base text-center mb-6 ${
                isDarkMode ? 'text-gray-300' : 'text-gray-600'
              }`}>
                Licitațiile în curs sunt licitații deja începute, în curs de anulare sau de verificare. Există riscul să consumi un token fără să poți beneficia de informațiile anunțului. Dorești totuși să deblochezi?
              </p>
              <div className="flex flex-col sm:flex-row gap-3">
                <button
                  type="button"
                  onClick={() => setShowUnlockInProgressConfirm(false)}
                  className={`flex-1 px-4 py-2.5 rounded-lg font-medium transition-colors ${
                    isDarkMode ? 'bg-gray-700 text-gray-200 hover:bg-gray-600' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  Anulează
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowUnlockInProgressConfirm(false);
                    handleUnlockFromPage();
                  }}
                  className="flex-1 px-4 py-2.5 rounded-lg font-medium bg-amber-500 text-white hover:bg-amber-600 transition-colors"
                >
                  Deblochează totuși
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Toast notificare modernă – token insuficient / eroare deblocare */}
      {unlockToast.message && (
        <div
          className={`fixed inset-0 z-[100] flex items-center justify-center pointer-events-none transition-all duration-300 ease-out ${
            unlockToast.show ? 'opacity-100' : 'opacity-0'
          }`}
          role="alert"
          aria-live="polite"
        >
          <div className={`flex items-center gap-3 px-5 py-4 rounded-xl shadow-xl border max-w-md ${
            isDarkMode
              ? 'bg-gray-800/95 border-amber-500/40 text-gray-100 backdrop-blur-md'
              : 'bg-white/95 border-amber-400/60 text-gray-800 backdrop-blur-md'
          }`}>
            <span className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center ${
              isDarkMode ? 'bg-amber-500/20' : 'bg-amber-100'
            }`}>
              <i className="ri-error-warning-line text-xl text-amber-500" aria-hidden />
            </span>
            <p className="text-sm font-medium leading-snug">{unlockToast.message}</p>
          </div>
        </div>
      )}
      
      {/* Breadcrumb */}
      <div className="max-w-7xl mx-auto px-4 py-4 md:py-6">
        {/* Buton Înapoi - vizibil pe toate device-urile */}
        <div className="flex items-start justify-between gap-3 mb-4">
          <button
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              try {
                const id = auction?.id ? String(auction.id) : String(auctionId ?? "").trim();
                navigateBackFromListingDetail(router, {
                  currentListingId: id,
                  fallbackHref: "/ro",
                });
              } catch (error) {
                console.error('Error navigating back:', error);
                router.push("/ro");
              }
            }}
            type="button"
            className={`flex items-center space-x-2 text-sm transition ${
              isDarkMode 
                ? 'text-gray-300 hover:text-white' 
                : 'text-gray-700 hover:text-gray-900'
            }`}
          >
            <ArrowLeftIcon size="s" />
            <span>Înapoi</span>
          </button>

          {auction && (
            <div className="hidden md:flex items-center justify-end flex-wrap gap-2 flex-1">
              <span className={`text-xs font-medium ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>Flux filtre:</span>
              {auction.category && (
                <button
                  type="button"
                  onClick={() => {
                    const params = new URLSearchParams();
                    params.set("category", auction.category || "");
                    router.push(`/ro?${params.toString()}`);
                  }}
                  className={`px-2.5 py-1 rounded-full text-xs font-semibold transition ${
                    isDarkMode
                      ? 'bg-gray-800 text-gray-200 border border-gray-700 hover:bg-gray-700'
                      : 'bg-gray-100 text-gray-700 border border-gray-200 hover:bg-gray-200'
                  }`}
                >
                  {formatFilterChip(auction.category)}
                </button>
              )}
              {auction.subcategory && (
                <button
                  type="button"
                  onClick={() => {
                    const params = new URLSearchParams();
                    if (auction.category) params.set("category", auction.category);
                    params.set("subcategory", auction.subcategory || "");
                    router.push(`/ro?${params.toString()}`);
                  }}
                  className={`px-2.5 py-1 rounded-full text-xs font-semibold transition ${
                    isDarkMode
                      ? 'bg-gray-800 text-gray-200 border border-gray-700 hover:bg-gray-700'
                      : 'bg-gray-100 text-gray-700 border border-gray-200 hover:bg-gray-200'
                  }`}
                >
                  {formatFilterChip(auction.subcategory)}
                </button>
              )}
              {(auction.city || auction.county || auction.location) && (
                <button
                  type="button"
                  onClick={() => {
                    const params = new URLSearchParams();
                    if (auction.category) params.set("category", auction.category);
                    if (auction.subcategory) params.set("subcategory", auction.subcategory);
                    params.set("location", auction.city || auction.county || auction.location || "");
                    router.push(`/ro?${params.toString()}`);
                  }}
                  className={`px-2.5 py-1 rounded-full text-xs font-semibold transition ${
                    isDarkMode
                      ? 'bg-gray-800 text-gray-200 border border-gray-700 hover:bg-gray-700'
                      : 'bg-gray-100 text-gray-700 border border-gray-200 hover:bg-gray-200'
                  }`}
                >
                  {formatFilterChip(
                    auction.city && auction.county
                      ? `${auction.city}, ${auction.county}`
                      : (auction.city || auction.county || auction.location || "")
                  )}
                </button>
              )}
            </div>
          )}

          {/* Share + Favorite - pe același rând cu Înapoi, doar pe mobil/tabletă */}
          <div className="flex items-center space-x-2 md:hidden">
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowShareMenu(!showShareMenu)}
                className={`flex items-center space-x-2 px-3 py-2 text-sm transition ${
                  isDarkMode
                    ? "text-gray-300 hover:text-white"
                    : "text-gray-700 hover:text-gray-900"
                }`}
              >
                <img src="/icons/share-icon.png" alt="" className="w-[0.8rem] h-[0.8rem] object-contain" />
                <span>Distribuie</span>
              </button>
              {showShareMenu && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowShareMenu(false)} aria-hidden />
                  <div
                    className="pointer-events-none fixed left-0 right-0 top-0 z-50 flex justify-center px-3 pt-[max(5.25rem,calc(env(safe-area-inset-top,0px)+4.25rem))] md:pointer-events-auto md:absolute md:left-auto md:right-0 md:top-full md:mt-2 md:block md:p-0 md:pt-0"
                  >
                    <div className="pointer-events-auto">
                      <AuctionShareMenuPanel
                        isDarkMode={isDarkMode}
                        showNativeShare={
                          typeof window !== "undefined" &&
                          typeof (navigator as Navigator & { share?: unknown }).share === "function"
                        }
                        onClose={() => setShowShareMenu(false)}
                        onAction={handleShareMenuAction}
                      />
                    </div>
                  </div>
                </>
              )}
            </div>
            <button
              type="button"
              onClick={toggleFavorite}
              className={`flex items-center space-x-2 px-3 py-2 text-sm transition ${
                isFavorite
                  ? "text-red-600 hover:text-red-700"
                  : isDarkMode
                    ? "text-gray-300 hover:text-white"
                    : "text-gray-700 hover:text-gray-900"
              }`}
            >
              <img
                src="/icons/heart-icon.png"
                alt=""
                className={`w-[1.1rem] h-[1.1rem] object-contain ${isFavorite ? "opacity-100" : isDarkMode ? "opacity-80" : "opacity-90"}`}
                style={
                  isFavorite
                    ? { filter: "invert(27%) sepia(51%) saturate(2878%) hue-rotate(346deg)" }
                    : undefined
                }
              />
              <span>{isFavorite ? "Salvat" : "Salvează"}</span>
            </button>
          </div>
        </div>

        {/* Main Content - Storia.ro Style */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-8">
          {/* Left Column - Gallery & Details */}
          <div className="lg:col-span-2 space-y-6">
            {/* GALERIE NOUĂ DE LA ZERO - EXACT CA STORIA.RO */}
            {auction && auction.images && auction.images.length > 0 && (
              <div className="flex flex-col lg:flex-row gap-4 lg:gap-6 lg:items-start">
                {/* Imagine principală - Stânga (65% desktop) */}
                <div className="lg:w-[65%]">
                  <div className={`relative rounded-lg overflow-hidden ${
                    isDarkMode ? 'bg-gray-800' : 'bg-white'
                  }`}>
                    {/* Mobile/Tablet: Carousel cu swipe gestures */}
                    <div 
                      className={`lg:hidden relative overflow-hidden rounded-lg ${
                        isDarkMode ? 'bg-gray-800' : 'bg-gray-100'
                      }`}
                      style={{
                        aspectRatio: '10/8', // Înălțime la 80% din lățime (70% + 10% = 80%)
                      }}
                      onTouchStart={onTouchStart}
                      onTouchMove={onTouchMove}
                      onTouchEnd={onTouchEnd}
                    >
                      {auction.images.map((img, idx) => (
                        <div
                          key={idx}
                          className={`absolute inset-0 transition-transform duration-300 ease-in-out ${
                            idx === currentImageIndex ? 'translate-x-0 opacity-100' : 
                            idx < currentImageIndex ? '-translate-x-full opacity-0' : 
                            'translate-x-full opacity-0'
                          }`}
                        >
                          <ProgressiveImage
                            source={img}
                            variant="hero"
                            updatedAt={auction?.imageVersionAt}
                            focal={getFocalForImageUrl(auction, img)}
                            alt={`${auction.title} ${idx + 1}`}
                            priority={idx === 0}
                            loading={idx === 0 ? undefined : "lazy"}
                            imgClassName="object-cover"
                          />
                        </div>
                      ))}
                      
                      {/* Badge diagonal VÂNDUT / REZERVAT / ÎN CURS / TIMP ÎNCHEIAT - Mobile */}
                      {(auction?.status === 'sold' || auction?.status === 'reserved' || auction?.status === 'in_progress' || auction?.status === 'ended') && (
                        <div className="pointer-events-none absolute inset-0 flex items-center justify-center z-30">
                          <div
                            className={`absolute left-1/2 top-1/2 transform -translate-x-1/2 -translate-y-1/2 -rotate-45 w-[175%] text-center px-4 py-1.5 border-[6px] rounded-sm uppercase tracking-widest font-black leading-none text-xl ${
                              auction?.status === 'sold'
                                ? 'border-emerald-600 text-emerald-600 bg-transparent'
                                : auction?.status === 'reserved'
                                ? 'border-amber-500 text-amber-600 bg-transparent'
                                : auction?.status === 'in_progress'
                                ? 'border-emerald-500 text-emerald-600 bg-transparent'
                                : 'border-slate-500 text-slate-600 bg-transparent'
                            }`}
                          >
                            {auction?.status === 'sold' ? 'VÂNDUT' : auction?.status === 'reserved' ? 'REZERVAT' : auction?.status === 'in_progress' ? 'ÎN CURS' : 'TIMP ÎNCHEIAT'}
                          </div>
                        </div>
                      )}
                      
                      {/* Thumbnails peste imagine - Mobile/Tablet */}
                      {auction.images.length > 1 && (
                        <div className="absolute bottom-0 left-0 right-0 z-20 bg-gradient-to-t from-black/70 via-black/50 to-transparent px-2 py-3">
                          <div 
                            ref={thumbnailsContainerRef}
                            className="flex gap-2 overflow-x-auto pb-1 snap-x snap-mandatory"
                            style={{
                              scrollbarWidth: 'none',
                              msOverflowStyle: 'none',
                              WebkitOverflowScrolling: 'touch',
                              touchAction: 'pan-x',
                            }}
                            onClick={(e) => e.stopPropagation()}
                            onTouchStart={(e) => {
                              e.stopPropagation();
                              // Allow scrolling
                            }}
                            onTouchMove={(e) => {
                              e.stopPropagation();
                              // Allow scrolling
                            }}
                            onTouchEnd={(e) => {
                              e.stopPropagation();
                              // Allow scrolling
                            }}
                          >
                            {auction.images.map((img, idx) => (
                              <button
                                key={idx}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setCurrentImageIndex(idx);
                                }}
                                className={`flex-shrink-0 w-14 h-14 relative rounded-lg overflow-hidden border-2 transition-all snap-center ${
                                  currentImageIndex === idx
                                    ? 'border-white ring-2 ring-blue-400 shadow-lg scale-110 opacity-100'
                                    : 'border-white/30 hover:border-white/50 opacity-50 hover:opacity-70'
                                }`}
                                style={{
                                  scrollSnapAlign: 'center',
                                }}
                              >
                                <Image
                                  src={cdn.thumb(img)}
                                  alt={`${auction.title} ${idx + 1}`}
                                  fill
                                  unoptimized
                                  className="object-cover"
                                  loading="lazy"
                                  style={{
                                    opacity: currentImageIndex === idx ? 1 : 0.6
                                  }}
                                />
                                {currentImageIndex === idx && (
                                  <div className="absolute inset-0 bg-blue-400/30" />
                                )}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                      
                      {/* Butoane navigare mobile */}
                      {auction.images.length > 1 && (
                        <>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              prevImage();
                            }}
                            className="absolute left-2 top-1/2 transform -translate-y-1/2 text-white rounded-full z-10 transition-all hover:opacity-80"
                            aria-label="Imaginea anterioară"
                            style={{
                              background: 'transparent',
                              backdropFilter: 'none',
                              padding: '8px',
                              border: 'none',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                            }}
                          >
                            <svg width={isMobile ? "24" : "52"} height={isMobile ? "24" : "52"} fill="none" stroke="#FFFFFF" viewBox="0 0 24 24" strokeWidth={2.5} style={{ filter: 'drop-shadow(0 2px 8px rgba(0,0,0,0.5))' }}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                            </svg>
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              nextImage();
                            }}
                            className="absolute right-2 top-1/2 transform -translate-y-1/2 text-white rounded-full z-10 transition-all hover:opacity-80"
                            aria-label="Imaginea următoare"
                            style={{
                              background: 'transparent',
                              backdropFilter: 'none',
                              padding: '8px',
                              border: 'none',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                            }}
                          >
                            <svg width={isMobile ? "24" : "52"} height={isMobile ? "24" : "52"} fill="none" stroke="#FFFFFF" viewBox="0 0 24 24" strokeWidth={2.5} style={{ filter: 'drop-shadow(0 2px 8px rgba(0,0,0,0.5))' }}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                            </svg>
                          </button>
                        </>
                      )}
                      {/* Click pentru deschidere modal */}
                      <div 
                        className="absolute inset-0 cursor-pointer z-0"
                        onClick={() => setShowImageGallery(true)}
                      />
                    </div>
                    
                    {/* Desktop: Imagine statică (păstrăm exact ca înainte) */}
                    <div 
                      className={`hidden lg:block aspect-square relative cursor-pointer w-full overflow-hidden ${
                        isDarkMode ? 'bg-gray-800' : 'bg-gray-100'
                      }`}
                      onClick={() => setShowImageGallery(true)}
                    >
                      {auction.images[currentImageIndex] && (
                        <ProgressiveImage
                          source={auction.images[currentImageIndex]}
                          variant="hero"
                          updatedAt={auction?.imageVersionAt}
                          focal={getFocalForImageUrl(auction, auction.images[currentImageIndex])}
                          alt={auction.title}
                          priority={currentImageIndex === 0}
                          loading={currentImageIndex === 0 ? undefined : "lazy"}
                          imgClassName="object-cover"
                        />
                      )}
                      {/* Badge diagonal VÂNDUT / REZERVAT / ÎN CURS / TIMP ÎNCHEIAT - Desktop */}
                      {(auction?.status === 'sold' || auction?.status === 'reserved' || auction?.status === 'in_progress' || (auction?.status === 'ended' && !auction?.customFields?.auction_rolling_daily && auction?.customFields?.rolling_weekly_weekday == null)) && (
                        <div className="pointer-events-none absolute inset-0 flex items-center justify-center z-10">
                          <div
                            className={`absolute left-1/2 top-1/2 transform -translate-x-1/2 -translate-y-1/2 -rotate-45 w-[175%] text-center px-6 py-2 md:px-10 md:py-3 border-[8px] md:border-[10px] rounded-sm uppercase tracking-widest font-black leading-none text-2xl md:text-5xl ${
                              auction?.status === 'sold'
                                ? 'border-emerald-600 text-emerald-600 bg-transparent'
                                : auction?.status === 'reserved'
                                ? 'border-amber-500 text-amber-600 bg-transparent'
                                : auction?.status === 'in_progress'
                                ? 'border-emerald-500 text-emerald-600 bg-transparent'
                                : 'border-slate-500 text-slate-600 bg-transparent'
                            }`}
                          >
                            {auction?.status === 'sold' ? 'VÂNDUT' : auction?.status === 'reserved' ? 'REZERVAT' : auction?.status === 'in_progress' ? 'ÎN CURS' : 'TIMP ÎNCHEIAT'}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Grid imagini - Dreapta (35% desktop) */}
                <div className="lg:w-[35%] lg:self-start">
                  {/* Mobile/Tablet: Thumbnails sunt acum peste imaginea principală, deci nu mai afișăm aici */}
                  
                  {/* Desktop: Container thumbnails – înălțime fixă cu scroll intern (păstrăm exact ca înainte) */}
                  <div
                    className="hidden lg:grid grid-cols-2 gap-3 lg:gap-4 max-h-[520px] overflow-y-auto"
                    style={{
                      scrollbarWidth: 'none',
                      msOverflowStyle: 'none',
                    }}
                  >
                    {auction.images.map((img, idx) => (
                      <button
                        key={idx}
                        onClick={() => setCurrentImageIndex(idx)}
                        className={`aspect-square relative rounded-lg overflow-hidden border-2 transition-all ${
                          currentImageIndex === idx
                            ? 'border-blue-600 ring-2 ring-blue-200 shadow-md'
                            : isDarkMode
                              ? 'border-gray-600 hover:border-gray-500'
                            : 'border-gray-200 hover:border-gray-400'
                        }`}
                      >
                        <Image
                          src={cdn.thumb(img)}
                          alt={`${auction.title} ${idx + 1}`}
                          fill
                          unoptimized
                          className="object-cover"
                          loading="lazy"
                        />
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Title Section */}
            <div className="mb-3">
              <h1 className={`text-xl md:text-2xl font-normal leading-tight line-clamp-2 md:line-clamp-none ${
                isDarkMode ? 'text-white' : 'text-gray-900'
              }`}>
                {auction.title}
              </h1>
              {effectiveUnlocked && (
                <span className={`inline-flex items-center gap-1.5 mt-2 px-2.5 py-1 rounded-md text-sm font-medium border ${
                  isDarkMode ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' : 'bg-emerald-100 text-emerald-800 border-emerald-300'
                }`}>
                  <i className="ri-lock-unlock-line text-base" aria-hidden /> Deblocat
                </span>
              )}
            </div>

            {/* Price Evaluation - Mobile */}
            {productForEvaluation && (
              <div className="lg:hidden mb-6 price-evaluation-container" style={{ overflow: 'visible', maxHeight: 'none', height: 'auto' } as any}>
                <ProductPriceEvaluation 
                  product={productForEvaluation} 
                  isDarkMode={isDarkMode}
                  requiresUnlock={true}
                  isUnlockedFromParent={effectiveUnlocked}
                  onUnlockRequest={async () => { if (auction?.status === 'in_progress') setShowUnlockInProgressConfirm(true); else await handleUnlockFromPage(); }}
                  userTokens={userTokens}
                  onTokenSpent={handleTokenSpent}
                  onProductUnlocked={handleProductUnlocked}
                  showProcessingInComponent={false}
                  onProcessingChange={setPriceEvaluationProcessing}
                />
              </div>
            )}

            {/* Business Card - sub evaluare preț pe mobil */}
            {executorData && (executorData.licitatorName || executorData.licitatorAddress || executorData.licitatorEmail || executorData.licitatorPhone) && (
              <div className="lg:hidden mb-6">
                <ExecutorBusinessCard executorData={executorData} auctionId={auctionId} isDarkMode={isDarkMode} isUnlocked={effectiveUnlocked} />
              </div>
            )}

            {/* Price Box - Mobile Only (sub titlu) */}
            <div className={`lg:hidden rounded-lg p-5 mb-6 border ${
              isDarkMode 
                ? 'bg-gray-800 border-gray-700' 
                : 'bg-white border-gray-200'
            }`}>
              {/* Prețul de evaluare - Mare și vizibil */}
              <div className="mb-4">
                <div className="flex items-center gap-2 flex-wrap mb-2">
                  <span className={`text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                    Prețul de evaluare
                  </span>
                  {effectiveUnlocked && (
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${
                      isDarkMode ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40' : 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                    }`}>
                      <i className="ri-lock-unlock-line" aria-hidden /> Deblocat
                    </span>
                  )}
                </div>
                <div className={`text-3xl font-bold mb-1 ${
                  isDarkMode ? 'text-yellow-500' : 'text-red-600'
                }`}>
                  {(displayPriceRON ?? 0) <= 0 ? (
                    'Preț la cerere'
                  ) : (
                    <>{displayPriceRON.toLocaleString('ro-RO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} <span className="text-xl">Lei</span></>
                  )}
                </div>
                {displayPriceEUR > 0 && (displayPriceRON ?? 0) > 0 && (
                  <div className="space-y-1">
                    <div className={`text-xl font-semibold ${
                      isDarkMode ? 'text-yellow-500' : 'text-red-600'
                    }`}>
                      {displayPriceEUR.toLocaleString('ro-RO', {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}{' '}
                      <span className="text-lg">EUR</span>
                    </div>
                    <div className={`text-xs ${
                      isDarkMode ? 'text-gray-400' : 'text-gray-500'
                    }`}>
                      Curs valutar actualizat la:{' '}
                      <span className="font-medium">
                        {exchangeRateUpdatedAtDisplay || 'neprecizat'}
                      </span>
                    </div>
                  </div>
                )}
              </div>

              <div className={`border-t my-4 ${
                isDarkMode ? 'border-gray-700' : 'border-gray-200'
              }`}></div>

              {/* Timer */}
              {!showAuctionEnded && (
                <div>
                  <div className="flex items-center space-x-2 mb-3">
                    <ClockIcon size="s" className="text-blue-600" />
                    <span className={`text-sm font-semibold ${
                      isDarkMode ? 'text-white' : 'text-gray-900'
                    }`}>
                      {auction?.customFields?.auction_rolling_daily
                        ? '24 ore (se resetează la miezul nopții)'
                        : 'Timp rămas până la licitație'}
                    </span>
                  </div>
                  <div className="grid grid-cols-4 gap-2 mb-4">
                    {(() => {
                      const isRollingDaily = auction?.customFields?.auction_rolling_daily;
                      const d = isRollingDaily ? 0 : timeLeft.days;
                      const h = isRollingDaily ? Math.min(23, timeLeft.days * 24 + timeLeft.hours) : timeLeft.hours;
                      const m = timeLeft.minutes;
                      const s = timeLeft.seconds;
                      return [
                        { value: d, label: 'Zile' },
                        { value: h, label: 'Ore' },
                        { value: m, label: 'Min' },
                        { value: s, label: 'Sec' },
                      ].map((item, idx) => (
                        <div key={idx} className={`text-center rounded-lg p-2.5 border ${
                          isDarkMode 
                            ? 'bg-gray-700 border-gray-600' 
                            : 'bg-white border-gray-200'
                        }`}>
                          <div className={`text-xl font-bold mb-0.5 ${
                            isDarkMode ? 'text-white' : 'text-gray-900'
                          }`}>
                            {String(item.value).padStart(2, '0')}
                          </div>
                          <div className={`text-xs font-medium ${
                            isDarkMode ? 'text-gray-400' : 'text-gray-600'
                          }`}>
                            {item.label}
                          </div>
                        </div>
                      ));
                    })()}
                  </div>
                  <div className={`text-sm ${
                      isDarkMode ? 'text-gray-400' : 'text-gray-600'
                    }`}>
                      <div className="font-semibold mb-1">Data și ora licitației:</div>
                      <div>
                        {formatAuctionDateDisplay(auction.auctionDate, {
                          oraLicitatie: auction.customFields?.auction_time || auction.customFields?.ora_licitatie || auction.customFields?.Ora_licitație || auction.customFields?.ora_licitatie_2,
                        })}
                      </div>
                      {(auction.location || auction.address) && (
                        <>
                          <div className="font-semibold mb-1 mt-2">Adresa licitației:</div>
                          <div className="flex items-center space-x-1">
                            <LocationIcon size="s" />
                            <span>{effectiveUnlocked ? (auction.location || auction.address) : maskAddressForLocked(auction.location || auction.address || '')}</span>
                          </div>
                        </>
                      )}
                    </div>
                </div>
              )}

              {auction?.status === 'in_progress' && (
                <div className={`border-t pt-4 mt-4 ${
                  isDarkMode ? 'border-gray-700' : 'border-gray-200'
                }`}>
                  <div className={`text-center py-3 border rounded-lg ${
                    isDarkMode 
                      ? 'bg-emerald-900/30 border-emerald-800' 
                      : 'bg-emerald-50 border-emerald-200'
                  }`}>
                    <div className={`text-sm font-semibold ${
                      isDarkMode ? 'text-emerald-400' : 'text-emerald-700'
                    }`}>În curs</div>
                  </div>
                </div>
              )}
              {showAuctionEnded && (
                <div className={`border-t pt-4 mt-4 ${
                  isDarkMode ? 'border-gray-700' : 'border-gray-200'
                }`}>
                  <div className={`text-center py-3 border rounded-lg ${
                    isDarkMode 
                      ? 'bg-red-900/30 border-red-800' 
                      : 'bg-red-50 border-red-200'
                  }`}>
                    <div className={`text-sm font-semibold ${
                      isDarkMode ? 'text-red-400' : 'text-red-700'
                    }`}>Licitația s-a încheiat</div>
                  </div>
                </div>
              )}
            </div>

            {/* Detalii Relevante - Box sub titlu */}
            {getRelevantDetails(auction.customFields) && (
              <div className={`border rounded-xl px-4 py-3 mb-4 shadow-sm ${
                isDarkMode 
                  ? 'bg-blue-900/30 border-blue-800' 
                  : 'bg-blue-50 border-blue-100'
              }`}>
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-blue-600 text-white text-xs font-bold">
                    i
                  </span>
                  <span className={`text-sm font-semibold ${
                    isDarkMode ? 'text-blue-300' : 'text-blue-900'
                  }`}>
                    Detalii relevante
                  </span>
                </div>
                <div className={`text-sm leading-relaxed whitespace-pre-line ${
                  isDarkMode ? 'text-gray-300' : 'text-gray-700'
                }`}>
                  {String(getRelevantDetails(auction.customFields))}
                </div>
              </div>
            )}

            {/* COD ANUNȚ pe mobil – sub boxul preț/data/locație, chiar înainte de Document licitație */}
            <div className="lg:hidden">
              {(auction?.customFields?.cod_anunt || auction?.customFields?.["Cod anunț"]) && (
                <div className={`border-t pt-4 mt-4 mb-4 ${isDarkMode ? "border-gray-700" : "border-gray-200"}`}>
                  <div className={`text-sm ${isDarkMode ? "text-gray-400" : "text-gray-500"}`}>
                    <span className="text-xs">COD ANUNȚ:</span>{" "}
                    <span className={`font-bold ${isDarkMode ? "text-gray-300" : "text-gray-700"}`}>
                      {(auction.customFields?.cod_anunt || auction.customFields?.["Cod anunț"]).toString().toUpperCase()}
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Documents PDF - Mobile Only (deasupra Descriere) */}
            {auction.documents && auction.documents.length > 0 && (
              <div className={`lg:hidden border-2 border-red-500 rounded-lg p-4 mb-6 overflow-hidden ${
                isDarkMode ? 'bg-gray-800' : 'bg-white'
              }`}>
                <div className="flex items-center space-x-2 mb-2">
                  <div className="w-8 h-8 bg-red-600 rounded flex items-center justify-center flex-shrink-0">
                    <span className="text-white font-bold text-xs">PDF</span>
                  </div>
                  <div className="flex-1">
                    <div className={`text-sm font-bold ${
                      isDarkMode ? 'text-white' : 'text-gray-900'
                    }`}>Document licitație</div>
                    <div className={`text-xs ${
                      isDarkMode ? 'text-gray-400' : 'text-gray-600'
                    }`}>Se poate descărca</div>
                  </div>
                </div>
                <div className="relative min-h-[80px] rounded overflow-hidden">
                  <div className="space-y-2 mt-3">
                    {auction.documents.map((doc, idx) => {
                      const docUrl = doc?.url;
                      return (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => {
                          if (effectiveUnlocked) {
                            openPdfModal(docUrl, doc?.name);
                          } else {
                            setShowDocLockedNotification(true);
                            setTimeout(() => setShowDocLockedNotification(false), 5000);
                          }
                        }}
                        className={`w-full text-left flex items-center justify-between p-3 border rounded-lg transition group cursor-pointer ${
                          isDarkMode
                            ? 'bg-gray-700 hover:bg-gray-600 border-gray-600'
                            : 'bg-gray-50 hover:bg-gray-100 border-gray-200'
                        }`}
                      >
                        <div className="flex items-center space-x-2 flex-1 min-w-0">
                          <div className="w-6 h-6 bg-red-600 rounded flex items-center justify-center flex-shrink-0">
                            <span className="text-white font-bold text-xs">PDF</span>
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className={`text-xs font-semibold truncate group-hover:text-blue-400 ${
                              isDarkMode ? 'text-gray-200' : 'text-gray-900'
                            }`}>
                              {doc.name}
                            </div>
                            {doc.size && (
                              <div className={`text-xs ${
                                isDarkMode ? 'text-gray-400' : 'text-gray-500'
                              }`}>
                                {(doc.size / 1024).toFixed(1)} KB
                              </div>
                            )}
                          </div>
                        </div>
                        <span className="text-blue-600 font-semibold text-xs ml-2 flex-shrink-0 group-hover:underline">
                          Deschide →
                        </span>
                      </button>
                    ); })}
                  </div>
                  {showDocLockedNotification && !effectiveUnlocked && (
                    <div className={`mt-3 py-3 px-3 rounded-lg text-sm text-center ${
                      isDarkMode ? 'bg-amber-900/30 text-amber-200' : 'bg-amber-50 text-amber-800'
                    }`}>
                      Trebuie deblocat anunțul pentru a putea descărca documentele.
                    </div>
                  )}
                  {effectiveUnlocked && (
                    <div className={`mt-3 text-xs italic rounded ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                      * Documentul conține toate detaliile despre licitație, condiții și specificații
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Description Section – flux clar, aliniat, ușor de citit */}
            {auction.description && (() => {
              const bunuri = !effectiveUnlocked ? parseDescriptionBunuri(auction.description) : null;
              const textCls = `text-base leading-[1.85] text-left break-words tracking-normal ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`;
              const blurCls = 'filter blur-[3px] select-none pointer-events-none bg-white/25 rounded';
              const renderParagraph = (block: string, idx: number, addBlur?: boolean) => {
                const trimmed = block.trim();
                if (!trimmed) return null;
                const lines = trimmed.split(/\n/).filter((l) => l.trim());
                const looksLikeNumberedList = lines.length >= 2 && lines.every((l) => /^\s*\d+[.)]\s*/.test(l));
                const looksLikeBulletList = lines.length >= 2 && lines.every((l) => /^\s*[-•*]\s*/.test(l));
                const asList = looksLikeNumberedList || looksLikeBulletList;
                return (
                  <div key={idx} className={addBlur ? blurCls : ''}>
                    {asList ? (
                      looksLikeNumberedList ? (
                        <ol className={`list-decimal list-outside pl-6 space-y-2.5 ${textCls}`}>
                          {lines.map((item, j) => (
                            <li key={j} className="pl-1">{item.replace(/^\s*\d+[.)]\s*/, '').trim() || item.trim()}</li>
                          ))}
                        </ol>
                      ) : (
                        <ul className={`list-disc list-outside pl-6 space-y-2.5 ${textCls}`}>
                          {lines.map((item, j) => (
                            <li key={j} className="pl-1">{item.replace(/^\s*[-•*]\s*/, '').trim() || item.trim()}</li>
                          ))}
                        </ul>
                      )
                    ) : (
                      <p className={`${textCls} whitespace-pre-line`}>{trimmed}</p>
                    )}
                  </div>
                );
              };
              return (
              <div className={`border rounded-xl p-6 md:p-8 ${
                isDarkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'
              }`}>
                <h2 className={`text-xl font-semibold mb-5 text-left ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>Descriere</h2>
                <div className="relative min-h-[100px] overflow-hidden rounded-lg">
                  <div className="max-w-[72ch] space-y-5">
                  {bunuri ? (
                    <>
                      {bunuri.before ? <div className="mb-5">{renderParagraph(bunuri.before, 0, true)}</div> : null}
                      <div className={`${textCls} relative z-10 whitespace-pre-line`}>{bunuri.listBlock}</div>
                      {bunuri.after ? <div className="mt-5">{renderParagraph(bunuri.after, 1, true)}</div> : null}
                    </>
                  ) : (
                    <>
                      {auction.description.split(/\n\n+/).map((paragraph, i) => (
                        <div key={i} className={i > 0 ? 'pt-1' : ''}>
                          {renderParagraph(paragraph, i, !effectiveUnlocked)}
                        </div>
                      ))}
                    </>
                  )}
                  </div>
                  {!effectiveUnlocked && (
                    <div className="absolute inset-0 z-[5] flex items-center justify-center bg-white/25 backdrop-blur-[1px] rounded">
                      <button
                        type="button"
                        onClick={() => { if (auction?.status === 'in_progress') setShowUnlockInProgressConfirm(true); else handleUnlockFromPage(); }}
                        disabled={unlockingProduct}
                        className={`hidden md:flex px-6 py-3 rounded-lg font-medium transition-all transform hover:scale-105 items-center gap-2 ${
                          unlockingProduct ? 'opacity-50 cursor-wait bg-yellow-500 text-white' : 'bg-yellow-500 hover:bg-yellow-600 text-white shadow-lg'
                        }`}
                      >
                        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                          <path d="M8.433 7.418c.155-.103.346-.196.567-.267v1.698a2.305 2.305 0 01-.567-.267C8.07 8.34 8 8.114 8 8c0-.114.07-.34.433-.582zM11 12.849v-1.698c.22.071.412.164.567.267.364.243.433.468.433.582 0 .114-.07.34-.433.582a2.305 2.305 0 01-.567.267z" />
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-13a1 1 0 10-2 0v.092a4.535 4.535 0 00-1.676.662C6.602 6.234 6 7.009 6 8c0 .99.602 1.765 1.324 2.246.48.32 1.054.545 1.676.662v1.941c-.391-.127-.68-.317-.843-.504a1 1 0 10-1.51 1.31c.562.649 1.413 1.076 2.353 1.253V15a1 1 0 102 0v-.092a4.535 4.535 0 001.676-.662C13.398 13.766 14 12.991 14 12c0-.99-.602-1.765-1.324-2.246A4.535 4.535 0 0011 9.092V7.151c.391.127.68.317.843.504a1 1 0 101.511-1.31c-.563-.649-1.413-1.076-2.354-1.253V5z" clipRule="evenodd" />
                        </svg>
                        <span>{unlockingProduct ? 'Se deblochează...' : '1 Token - Deblochează'}</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ); })()}

            {/* Informații despre licitație – schema-driven per subcategorie (Executări); nu se afișează dacă subcategoria e necunoscută sau toate câmpurile sunt goale. */}
            {(() => {
              const schema = getDetailSchema({
                channel: "executari_insolventa",
                category: auction.category ?? "",
                subcategory: auction.subcategory ?? "",
              });
              if (!schema) return null;
              const cf = (auction.customFields || {}) as Record<string, unknown>;
              const fmtPriceEur = (v: number) => {
                const intPart = Math.floor(v);
                const decPart = Math.round((v - intPart) * 100);
                return `${intPart.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".")},${decPart.toString().padStart(2, "0")}`;
              };
              let priceDisplay = cf.price_text && typeof cf.price_text === "string"
                ? formatPriceTextForDisplayEuropean(String(cf.price_text).trim())
                : (auction.currency === "EUR" && displayPriceEUR > 0
                  ? `${fmtPriceEur(displayPriceEUR)} EUR`
                  : auction.startingBidRON != null && auction.startingBidRON > 0
                    ? `${fmtPriceEur(auction.startingBidRON)} Lei`
                    : "—");
              if ((displayPriceRON ?? 0) <= 0 && (displayPriceEUR ?? 0) <= 0) priceDisplay = "Preț la cerere";
              else if (priceDisplay === "0,00" || /^0[,.]00\s/.test(priceDisplay)) priceDisplay = "Preț la cerere";
              const isRolling = !!(auction.customFields?.auction_rolling_daily || (auction.customFields as Record<string, unknown>)?.rolling_weekly_weekday != null);
              const isAuctionInPast = !isRolling && isAuctionDateInPast(auction.auctionDate);
              const formatDateDisplay = (date: string | null | undefined): string => {
                if (!date) return "—";
                const d = formatAuctionDateDisplay(date, { withTime: false, shortFormat: true });
                return d === "Data nu este disponibilă" ? "—" : d;
              };
              const rows = getDetailRows({
                schema,
                listing: {
                  customFields: auction.customFields ?? null,
                  category: auction.category,
                  subcategory: auction.subcategory,
                  county: auction.county,
                  city: auction.city,
                  auctionDate: auction.auctionDate,
                  priceDisplay,
                  currency: auction.currency,
                  startingBidRON: auction.startingBidRON,
                },
                formatDateDisplay,
                isAuctionInPast,
                priceDisplay,
              });
              if (!hasDisplayableDetailRows(rows)) return null;
              return (
                <div className={`border rounded-lg p-4 ${isDarkMode ? "bg-gray-800 border-gray-700" : "bg-white border-gray-200"}`}>
                  <h2 className={`text-lg font-semibold mb-4 ${isDarkMode ? "text-white" : "text-gray-900"}`}>Informații despre licitație</h2>
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                    {rows.map((row) => (
                      <div key={row.key} className="flex flex-col">
                        <div className={`text-xs mb-1 ${isDarkMode ? "text-gray-400" : "text-gray-500"}`}>{row.label}:</div>
                        <div className={`text-sm font-semibold ${isDarkMode ? "text-white" : "text-gray-900"}`}>{row.value}</div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}


            {/* Map Section - doar dacă există adresă și anunțul are poze reale (nu doar imagine din categoria personalizată) */}
            {auction.address && auction.hasRealImages && (
              <div className={`border rounded-lg p-4 relative overflow-hidden ${
                isDarkMode 
                  ? 'bg-gray-800 border-gray-700' 
                  : 'bg-white border-gray-200'
              }`}>
                <h2 className={`text-lg font-semibold mb-3 ${
                  isDarkMode ? 'text-white' : 'text-gray-900'
                }`}>Hartă</h2>
                <div className="relative rounded-lg overflow-hidden">
                  <div className={`aspect-video rounded-lg overflow-hidden border ${
                    isDarkMode ? 'border-gray-700' : 'border-gray-200'
                  } ${!effectiveUnlocked ? 'filter blur-[2.5px] select-none pointer-events-none bg-white/25' : ''}`}>
                    <iframe
                      width="100%"
                      height="100%"
                      style={{ border: 0 }}
                      loading="lazy"
                      allowFullScreen
                      referrerPolicy="no-referrer-when-downgrade"
                      src={`https://www.google.com/maps/embed/v1/place?key=${process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || 'AIzaSyBFw0Qbyq9zTFTd-tUY6d-s6Q4ZXuu9BsQ'}&q=${encodeURIComponent(auction.location || auction.address || 'București, România')}`}
                    ></iframe>
                  </div>
                  <div className={`mt-2 text-sm flex items-center space-x-2 rounded ${!effectiveUnlocked ? 'filter blur-[2.5px] select-none pointer-events-none bg-white/25' : ''} ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                    <LocationIcon size="s" />
                    <span>{auction.location || auction.address}</span>
                  </div>
                  {!effectiveUnlocked && (
                    <div className="absolute inset-0 flex items-center justify-center bg-white/25 backdrop-blur-[1px] rounded-lg">
                      <button
                        type="button"
                        onClick={() => { if (auction?.status === 'in_progress') setShowUnlockInProgressConfirm(true); else handleUnlockFromPage(); }}
                        disabled={unlockingProduct}
                        className={`hidden px-6 py-3 rounded-lg font-medium transition-all transform hover:scale-105 items-center gap-2 ${
                          unlockingProduct ? 'opacity-50 cursor-wait bg-yellow-500 text-white' : 'bg-yellow-500 hover:bg-yellow-600 text-white shadow-lg'
                        }`}
                      >
                        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                          <path d="M8.433 7.418c.155-.103.346-.196.567-.267v1.698a2.305 2.305 0 01-.567-.267C8.07 8.34 8 8.114 8 8c0-.114.07-.34.433-.582zM11 12.849v-1.698c.22.071.412.164.567.267.364.243.433.468.433.582 0 .114-.07.34-.433.582a2.305 2.305 0 01-.567.267z" />
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-13a1 1 0 10-2 0v.092a4.535 4.535 0 00-1.676.662C6.602 6.234 6 7.009 6 8c0 .99.602 1.765 1.324 2.246.48.32 1.054.545 1.676.662v1.941c-.391-.127-.68-.317-.843-.504a1 1 0 10-1.51 1.31c.562.649 1.413 1.076 2.353 1.253V15a1 1 0 102 0v-.092a4.535 4.535 0 001.676-.662C13.398 13.766 14 12.991 14 12c0-.99-.602-1.765-1.324-2.246A4.535 4.535 0 0011 9.092V7.151c.391.127.68.317.843.504a1 1 0 101.511-1.31c-.563-.649-1.413-1.076-2.354-1.253V5z" clipRule="evenodd" />
                        </svg>
                        <span>{unlockingProduct ? 'Se deblochează...' : '1 Token - Deblochează'}</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Right Column - Price & Actions - Storia.ro Style */}
          <div className="lg:col-span-1">
            {/* Price Box - doar desktop, urcă la scroll împreună cu conținutul */}
            <div className={`hidden lg:block border rounded-lg p-5 mb-6 ${
              isDarkMode 
                ? 'bg-gray-800 border-gray-700' 
                : 'bg-white border-gray-200'
            }`}>
              {/* Prețul de evaluare - Mare și vizibil */}
              <div className="mb-4">
                <div className="flex items-center gap-2 flex-wrap mb-2">
                  <span className={`text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                    Prețul de evaluare
                  </span>
                  {effectiveUnlocked && (
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${
                      isDarkMode ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40' : 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                    }`}>
                      <i className="ri-lock-unlock-line" aria-hidden /> Deblocat
                    </span>
                  )}
                </div>
                <div className={`text-3xl font-bold mb-1 ${
                  isDarkMode ? 'text-yellow-500' : 'text-red-600'
                }`}>
                  {(displayPriceRON ?? 0) <= 0 ? (
                    'Preț la cerere'
                  ) : (
                    <>{displayPriceRON.toLocaleString('ro-RO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} <span className="text-xl">Lei</span></>
                  )}
                </div>
                {displayPriceEUR > 0 && (displayPriceRON ?? 0) > 0 && (
                  <div className="space-y-1">
                    <div className={`text-xl font-semibold ${
                      isDarkMode ? 'text-yellow-500' : 'text-red-600'
                    }`}>
                      {displayPriceEUR.toLocaleString('ro-RO', {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}{' '}
                      <span className="text-lg">EUR</span>
                    </div>
                    <div className={`text-xs ${
                      isDarkMode ? 'text-gray-400' : 'text-gray-500'
                    }`}>
                      Curs valutar actualizat la:{' '}
                      <span className="font-medium">
                        {exchangeRateUpdatedAtDisplay || 'neprecizat'}
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {/* Price Evaluation - Desktop */}
              {productForEvaluation ? (
                <div className="mb-4">
                  <ProductPriceEvaluation 
                    product={productForEvaluation} 
                    isDarkMode={isDarkMode}
                    requiresUnlock={true}
                    isUnlockedFromParent={effectiveUnlocked}
                    onUnlockRequest={async () => { if (auction?.status === 'in_progress') setShowUnlockInProgressConfirm(true); else await handleUnlockFromPage(); }}
                    userTokens={userTokens}
                    onTokenSpent={handleTokenSpent}
                    onProductUnlocked={handleProductUnlocked}
                    showProcessingInComponent={false}
                    onProcessingChange={setPriceEvaluationProcessing}
                  />
                </div>
              ) : null}

              <div className={`border-t my-4 ${
                isDarkMode ? 'border-gray-700' : 'border-gray-200'
              }`}></div>

              {/* Timer */}
              {!showAuctionEnded && (
                <div>
                  <div className="flex items-center space-x-2 mb-3">
                    <ClockIcon size="s" className="text-blue-600" />
                    <span className={`text-sm font-semibold ${
                      isDarkMode ? 'text-white' : 'text-gray-900'
                    }`}>
                      {auction?.customFields?.auction_rolling_daily
                        ? '24 ore (se resetează la miezul nopții)'
                        : 'Timp rămas până la licitație'}
                    </span>
                  </div>
                  <div className="grid grid-cols-4 gap-2 mb-4">
                    {(() => {
                      const isRollingDaily = auction?.customFields?.auction_rolling_daily;
                      const d = isRollingDaily ? 0 : timeLeft.days;
                      const h = isRollingDaily ? Math.min(23, timeLeft.days * 24 + timeLeft.hours) : timeLeft.hours;
                      const m = timeLeft.minutes;
                      const s = timeLeft.seconds;
                      return [
                        { value: d, label: 'Zile' },
                        { value: h, label: 'Ore' },
                        { value: m, label: 'Min' },
                        { value: s, label: 'Sec' },
                      ].map((item, idx) => (
                        <div key={idx} className={`text-center rounded-lg p-2.5 border ${
                          isDarkMode 
                            ? 'bg-gray-700 border-gray-600' 
                            : 'bg-white border-gray-200'
                        }`}>
                          <div className={`text-xl font-bold mb-0.5 ${
                            isDarkMode ? 'text-white' : 'text-gray-900'
                          }`}>
                            {String(item.value).padStart(2, '0')}
                          </div>
                          <div className={`text-xs font-medium ${
                            isDarkMode ? 'text-gray-400' : 'text-gray-600'
                          }`}>
                            {item.label}
                          </div>
                        </div>
                      ));
                    })()}
                  </div>
                  <div className={`text-sm ${
                      isDarkMode ? 'text-gray-400' : 'text-gray-600'
                    }`}>
                      <div className="font-semibold mb-1">Data și ora licitației:</div>
                      <div>
                        {formatAuctionDateDisplay(auction.auctionDate, {
                          oraLicitatie: auction.customFields?.auction_time || auction.customFields?.ora_licitatie || auction.customFields?.Ora_licitație || auction.customFields?.ora_licitatie_2,
                        })}
                      </div>
                      {(auction.location || auction.address) && (
                        <>
                          <div className="font-semibold mb-1 mt-2">Adresa licitației:</div>
                          <div className="flex items-center space-x-1">
                            <LocationIcon size="s" />
                            <span>{effectiveUnlocked ? (auction.location || auction.address) : maskAddressForLocked(auction.location || auction.address || '')}</span>
                          </div>
                        </>
                      )}
                    </div>
                </div>
              )}

              {auction?.status === 'in_progress' && (
                <div className={`border-t pt-4 mt-4 ${
                  isDarkMode ? 'border-gray-700' : 'border-gray-200'
                }`}>
                  <div className={`text-center py-3 border rounded-lg ${
                    isDarkMode 
                      ? 'bg-emerald-900/30 border-emerald-800' 
                      : 'bg-emerald-50 border-emerald-200'
                  }`}>
                    <div className={`text-sm font-semibold ${
                      isDarkMode ? 'text-emerald-400' : 'text-emerald-700'
                    }`}>În curs</div>
                  </div>
                </div>
              )}
              {showAuctionEnded && (
                <div className={`border-t pt-4 mt-4 ${
                  isDarkMode ? 'border-gray-700' : 'border-gray-200'
                }`}>
                  <div className={`text-center py-3 border rounded-lg ${
                    isDarkMode 
                      ? 'bg-red-900/30 border-red-800' 
                      : 'bg-red-50 border-red-200'
                  }`}>
                    <div className={`text-sm font-semibold ${
                      isDarkMode ? 'text-red-400' : 'text-red-700'
                    }`}>Licitația s-a încheiat</div>
                  </div>
                </div>
              )}
            </div>

              {/* COD ANUNȚ + Action Buttons - Doar desktop (design ca la anunțurile user / live_bid) */}
              <div className="hidden lg:block mb-6 relative">
                {/* Linie de separare deasupra */}
                <div className={`border-t my-4 ${isDarkMode ? "border-gray-700" : "border-gray-200"}`}></div>
                {(auction?.customFields?.cod_anunt || auction?.customFields?.["Cod anunț"]) && (
                  <div className={`text-sm mb-2 ${isDarkMode ? "text-gray-400" : "text-gray-500"}`}>
                    <span className="text-xs">COD ANUNȚ:</span>{" "}
                    <span className={`font-bold ${isDarkMode ? "text-gray-300" : "text-gray-700"}`}>
                      {(auction.customFields?.cod_anunt || auction.customFields?.["Cod anunț"]).toString().toUpperCase()}
                    </span>
                  </div>
                )}
                {/* Linie + spațiu înainte de butoane */}
                <div className={`space-y-3 mt-6 pt-6 border-t ${isDarkMode ? "border-gray-700" : "border-gray-200"}`}>
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setShowShareMenu(!showShareMenu)}
                    className="w-full py-3 px-6 rounded-lg font-semibold transition-all bg-gradient-to-r from-blue-500 to-blue-500 text-white hover:from-blue-600 hover:to-blue-600 shadow-md hover:shadow-lg flex items-center justify-center space-x-2"
                  >
                    <img src="/icons/share-icon.png" alt="" className="w-[0.8rem] h-[0.8rem] object-contain invert" />
                    <span>Distribuie</span>
                  </button>
                  {showShareMenu && (
                    <>
                      <div className="fixed inset-0 z-40" onClick={() => setShowShareMenu(false)} aria-hidden />
                      <div className="absolute left-0 right-0 top-full z-50 mt-2 flex justify-center px-0">
                        <AuctionShareMenuPanel
                          isDarkMode={isDarkMode}
                          fullWidth
                          showNativeShare={
                            typeof window !== "undefined" &&
                            typeof (navigator as Navigator & { share?: unknown }).share === "function"
                          }
                          onClose={() => setShowShareMenu(false)}
                          onAction={handleShareMenuAction}
                        />
                      </div>
                    </>
                  )}
                </div>
                <button
                  onClick={toggleFavorite}
                  className={`w-full py-3 px-6 rounded-lg font-semibold transition-all shadow-md hover:shadow-lg ${
                    isFavorite
                      ? 'bg-gradient-to-r from-red-600 to-red-500 text-white hover:from-red-700 hover:to-red-600'
                      : 'bg-gradient-to-r from-red-500 to-pink-500 text-white hover:from-red-600 hover:to-pink-600'
                  }`}
                >
                  <div className="flex items-center justify-center space-x-2">
                    <img src="/icons/heart-icon.png" alt="" className="w-[1.1rem] h-[1.1rem] object-contain invert" />
                    <span>{isFavorite ? 'Elimină din favorite' : 'Adaugă la favorite'}</span>
                      </div>
                </button>
                </div>
              </div>

            {/* Date Executor / Licitator Box - Business Card Design - Desktop */}
            {executorData && (executorData.licitatorName || executorData.licitatorAddress || executorData.licitatorEmail || executorData.licitatorPhone) && (
              <div className="hidden lg:block mb-6">
                <ExecutorBusinessCard executorData={executorData} auctionId={auctionId} isDarkMode={isDarkMode} isUnlocked={effectiveUnlocked} />
              </div>
            )}

              {/* Documents PDF in Quick Info Box - Desktop Only */}
              {auction.documents && auction.documents.length > 0 && (
                <div className={`hidden lg:block border-2 border-red-500 rounded-lg p-4 mt-4 overflow-hidden ${
                  isDarkMode ? 'bg-gray-800' : 'bg-white'
                }`}>
                  <div className="flex items-center space-x-2 mb-2">
                    <div className="w-8 h-8 bg-red-600 rounded flex items-center justify-center flex-shrink-0">
                      <span className="text-white font-bold text-xs">PDF</span>
                    </div>
                    <div className="flex-1">
                      <div className={`text-sm font-bold ${
                        isDarkMode ? 'text-white' : 'text-gray-900'
                      }`}>Document licitație</div>
                      <div className={`text-xs ${
                        isDarkMode ? 'text-gray-400' : 'text-gray-600'
                      }`}>Se poate descărca</div>
                    </div>
                  </div>
                  <div className="relative min-h-[80px] rounded overflow-hidden">
                    <div className="space-y-2 mt-3">
                      {auction.documents.map((doc, idx) => {
                        const docUrl = doc?.url;
                        return (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => {
                            if (effectiveUnlocked) {
                              openPdfModal(docUrl, doc?.name);
                            } else {
                              setShowDocLockedNotification(true);
                              setTimeout(() => setShowDocLockedNotification(false), 5000);
                            }
                          }}
                          className={`w-full text-left flex items-center justify-between p-3 border rounded-lg transition group cursor-pointer ${
                            isDarkMode
                              ? 'bg-gray-700 hover:bg-gray-600 border-gray-600'
                              : 'bg-gray-50 hover:bg-gray-100 border-gray-200'
                          }`}
                        >
                          <div className="flex items-center space-x-2 flex-1 min-w-0">
                            <div className="w-6 h-6 bg-red-600 rounded flex items-center justify-center flex-shrink-0">
                              <span className="text-white font-bold text-xs">PDF</span>
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className={`text-xs font-semibold truncate group-hover:text-blue-400 ${
                                isDarkMode ? 'text-gray-200' : 'text-gray-900'
                              }`}>
                                {doc.name}
                              </div>
                              {doc.size && (
                                <div className={`text-xs ${
                                  isDarkMode ? 'text-gray-400' : 'text-gray-500'
                                }`}>
                                  {(doc.size / 1024).toFixed(1)} KB
                                </div>
                              )}
                            </div>
                          </div>
                          <span className="text-blue-600 font-semibold text-xs ml-2 flex-shrink-0 group-hover:underline">
                            Deschide →
                          </span>
                        </button>
                      ); })}
                    </div>
                    {showDocLockedNotification && !effectiveUnlocked && (
                      <div className={`mt-3 py-3 px-3 rounded-lg text-sm text-center ${
                        isDarkMode ? 'bg-amber-900/30 text-amber-200' : 'bg-amber-50 text-amber-800'
                      }`}>
                        <div>Trebuie deblocat anunțul pentru a putea descărca documentele.</div>
                        <button
                          type="button"
                          onClick={() => { if (auction?.status === 'in_progress') setShowUnlockInProgressConfirm(true); else handleUnlockFromPage(); }}
                          disabled={unlockingProduct}
                          className={`hidden md:inline-flex mt-3 px-4 py-2 rounded-lg font-medium transition-all items-center gap-2 ${
                            unlockingProduct
                              ? 'opacity-50 cursor-wait bg-yellow-500 text-white'
                              : 'bg-yellow-500 hover:bg-yellow-600 text-white shadow-lg'
                          }`}
                        >
                          <i className="ri-lock-unlock-line" aria-hidden />
                          <span>{unlockingProduct ? 'Se deblochează...' : 'Deblochează'}</span>
                        </button>
                      </div>
                    )}
                    {effectiveUnlocked && (
                      <div className={`mt-3 text-xs italic rounded ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                        * Documentul conține toate detaliile despre licitație, condiții și specificații
                      </div>
                    )}
                  </div>
                </div>
              )}
          </div>
        </div>

        {/* 1. Îți mai recomandăm și produsele userului (executor) - min 5 desktop, 3 tabletă, 2 mobil */}
        {showUserProductsSection && (() => {
          const displayed = userProducts.slice(0, 5);
          const maxSlideIndex = Math.max(0, displayed.length - recommendedCardsPerRow);
          const canGoPrev = userProductsSlideIndex > 0;
          const canGoNext = userProductsSlideIndex < maxSlideIndex;
          const scrollToSlide = (index: number) => {
            const el = userProductsSliderRef.current;
            if (!el) return;
            const gap = 8;
            const firstCard = el.querySelector('[data-user-product-card]') as HTMLElement;
            const cardWidth = firstCard ? firstCard.offsetWidth : (el.offsetWidth - gap) / recommendedCardsPerRow;
            const step = cardWidth + gap;
            el.scrollTo({ left: index * step, behavior: 'smooth' });
            setUserProductsSlideIndex(index);
          };
          return (
            <div className={`mt-6 sm:mt-8 rounded-2xl p-4 sm:p-5 sm:p-7 shadow-xl border overflow-hidden ${
              isDarkMode ? 'bg-gray-800 border-gray-700/50' : 'bg-gray-50/95 border-gray-200/60'
            }`}>
              <div className="flex items-center gap-3 sm:gap-4 mb-4 sm:mb-6">
                <div className={`relative w-12 h-12 sm:w-14 sm:h-14 rounded-2xl flex items-center justify-center transition-all duration-300 ${
                  isDarkMode
                    ? 'bg-gradient-to-br from-blue-500/20 to-blue-500/20 border border-blue-500/30'
                    : 'bg-gradient-to-br from-blue-50/80 to-blue-50/80 border border-blue-200/40'
                }`}>
                  <i className="ri-store-2-line text-2xl sm:text-3xl bg-gradient-to-r from-blue-500 to-blue-500 bg-clip-text text-transparent" aria-hidden />
                </div>
                <h2 className={`text-base sm:text-lg md:text-xl font-bold bg-gradient-to-r ${
                  isDarkMode ? 'from-white via-gray-100 to-gray-300' : 'from-gray-800 via-gray-700 to-gray-600'
                } bg-clip-text text-transparent`}>
                  Îți mai recomandăm și produsele userului
                </h2>
              </div>
              <div className="relative group">
                <div className={`absolute left-0 top-0 bottom-0 w-6 sm:w-8 z-20 pointer-events-none bg-gradient-to-r ${
                  isDarkMode ? 'from-gray-800/25 to-transparent' : 'from-gray-50/20 to-transparent'
                }`} />
                <div className={`absolute right-0 top-0 bottom-0 w-6 sm:w-8 z-20 pointer-events-none bg-gradient-to-l ${
                  isDarkMode ? 'from-gray-800/25 to-transparent' : 'from-gray-50/20 to-transparent'
                }`} />
                <button type="button" aria-label="Anterioare" onClick={() => scrollToSlide(userProductsSlideIndex - 1)} disabled={!canGoPrev}
                  className={`absolute left-2 top-1/2 -translate-y-1/2 z-30 w-10 h-10 sm:w-12 sm:h-12 rounded-full flex items-center justify-center transition-all duration-300 shadow-xl backdrop-blur-md border-2 ${
                    canGoPrev ? (isDarkMode ? 'bg-gray-800/80 hover:bg-gray-700/90 border-gray-600/50 text-white' : 'bg-gray-100/95 hover:bg-gray-200 border-gray-200 text-gray-700') : 'opacity-40 cursor-not-allowed pointer-events-none'
                  }`}>
                  <i className="ri-arrow-left-s-line text-xl sm:text-2xl" aria-hidden />
                </button>
                <button type="button" aria-label="Următoare" onClick={() => scrollToSlide(userProductsSlideIndex + 1)} disabled={!canGoNext}
                  className={`absolute right-2 top-1/2 -translate-y-1/2 z-30 w-10 h-10 sm:w-12 sm:h-12 rounded-full flex items-center justify-center transition-all duration-300 shadow-xl backdrop-blur-md border-2 ${
                    canGoNext ? (isDarkMode ? 'bg-gray-800/80 hover:bg-gray-700/90 border-gray-600/50 text-white' : 'bg-gray-100/95 hover:bg-gray-200 border-gray-200 text-gray-700') : 'opacity-40 cursor-not-allowed pointer-events-none'
                  }`}>
                  <i className="ri-arrow-right-s-line text-xl sm:text-2xl" aria-hidden />
                </button>
                <div
                  ref={userProductsSliderRef}
                  className="flex gap-2 overflow-x-auto scroll-smooth pb-1 flex-1 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]"
                  style={{ WebkitOverflowScrolling: 'touch' }}
                  onScroll={() => {
                    const el = userProductsSliderRef.current;
                    if (!el) return;
                    const gap = 8;
                    const firstCard = el.querySelector('[data-user-product-card]') as HTMLElement;
                    const cardWidth = firstCard ? firstCard.offsetWidth : (el.offsetWidth - gap) / recommendedCardsPerRow;
                    const step = cardWidth + gap;
                    const index = Math.round(el.scrollLeft / step);
                    setUserProductsSlideIndex(Math.min(index, maxSlideIndex));
                  }}
                >
                  {displayed.map((item) => (
                    <button key={item.id} type="button" onClick={() => router.push(`/licitatii-publice/${item.slug || item.id}`)}
                      data-user-product-card
                      className={`group flex-shrink-0 w-[calc(50%-0.25rem)] min-w-[calc(50%-0.25rem)] max-w-[calc(50%-0.25rem)] md:w-[calc((100%-2rem)/5)] md:min-w-[calc((100%-2rem)/5)] md:max-w-[calc((100%-2rem)/5)] rounded-2xl overflow-hidden transition-all duration-300 hover:scale-[1.03] hover:-translate-y-1 text-left ${
                        isDarkMode ? 'bg-gradient-to-br from-gray-700/50 to-gray-800/50 border border-gray-700/50' : 'bg-gradient-to-br from-gray-50 to-gray-100/80 border border-gray-200/70'
                      }`}
                    >
                      <div className={`aspect-square relative overflow-hidden ${isDarkMode ? 'bg-gray-700' : 'bg-gray-100'}`}>
                        <Image
                          src={getCdnImageUrl(item.image, listingGridTransformOptions(item.imageVersionAt))}
                          alt={item.title}
                          fill
                          unoptimized
                          sizes={CDN_IMAGE_SIZES_GRID}
                          className="object-cover group-hover:scale-110 transition-transform duration-500 ease-out"
                          loading="lazy"
                        />
                      </div>
                      <div className="p-3 sm:p-4">
                        <h3 className={`text-xs sm:text-sm font-semibold line-clamp-2 mb-2 leading-tight ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{item.title}</h3>
                        <div className={`text-[10px] flex items-center gap-0.5 mb-1 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                          <LocationIcon size="s" />
                          <span className="truncate">{getDisplayCity(item.location) || item.location}</span>
                        </div>
                        <p className={`text-sm sm:text-base font-bold ${isDarkMode ? 'text-blue-400' : 'text-blue-600'}`}>
                          {item.startingBidRON?.toLocaleString('ro-RO', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} Lei
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          );
        })()}

        {/* 2. Din aceeași categorie */}
        {recommendedAuctions.length > 0 && (() => {
          const displayed = recommendedAuctions.slice(0, 5);
          const maxSlideIndex = Math.max(0, displayed.length - recommendedCardsPerRow);
          const canGoPrev = recommendedSlideIndex > 0;
          const canGoNext = recommendedSlideIndex < maxSlideIndex;
          const scrollToSlide = (index: number) => {
            const el = recommendedSliderRef.current;
            if (!el) return;
            const gap = 8;
            const firstCard = el.querySelector('[data-recommended-card]') as HTMLElement;
            const cardWidth = firstCard ? firstCard.offsetWidth : (el.offsetWidth - gap) / recommendedCardsPerRow;
            const step = cardWidth + gap;
            el.scrollTo({ left: index * step, behavior: 'smooth' });
            setRecommendedSlideIndex(index);
          };
          return (
            <div className={`mt-6 sm:mt-8 rounded-2xl p-4 sm:p-5 sm:p-7 shadow-xl border overflow-hidden ${
              isDarkMode ? 'bg-gray-800 border-gray-700/50' : 'bg-gray-50/95 border-gray-200/60'
            }`}>
              <div className="flex items-center gap-3 sm:gap-4 mb-4 sm:mb-6">
                <div className={`relative w-12 h-12 sm:w-14 sm:h-14 rounded-2xl flex items-center justify-center transition-all duration-300 ${
                  isDarkMode ? 'bg-gradient-to-br from-blue-500/20 to-blue-500/20 border border-blue-500/30' : 'bg-gradient-to-br from-blue-50/80 to-blue-50/80 border border-blue-200/40'
                }`}>
                  <i className="ri-folder-open-line text-2xl sm:text-3xl bg-gradient-to-r from-blue-500 to-blue-500 bg-clip-text text-transparent" aria-hidden />
                </div>
                <h2 className={`text-base sm:text-lg md:text-xl font-bold bg-gradient-to-r ${
                  isDarkMode ? 'from-white via-gray-100 to-gray-300' : 'from-gray-800 via-gray-700 to-gray-600'
                } bg-clip-text text-transparent`}>
                  Din aceeași categorie
                </h2>
              </div>
              <div className="relative group">
                <div className={`absolute left-0 top-0 bottom-0 w-6 sm:w-8 z-20 pointer-events-none bg-gradient-to-r ${
                  isDarkMode ? 'from-gray-800/25 to-transparent' : 'from-gray-50/20 to-transparent'
                }`} />
                <div className={`absolute right-0 top-0 bottom-0 w-6 sm:w-8 z-20 pointer-events-none bg-gradient-to-l ${
                  isDarkMode ? 'from-gray-800/25 to-transparent' : 'from-gray-50/20 to-transparent'
                }`} />
                <button type="button" aria-label="Anterioare" onClick={() => scrollToSlide(recommendedSlideIndex - 1)} disabled={!canGoPrev}
                  className={`absolute left-2 top-1/2 -translate-y-1/2 z-30 w-10 h-10 sm:w-12 sm:h-12 rounded-full flex items-center justify-center transition-all duration-300 shadow-xl backdrop-blur-md border-2 ${
                    canGoPrev ? (isDarkMode ? 'bg-gray-800/80 hover:bg-gray-700/90 border-gray-600/50 text-white' : 'bg-gray-100/95 hover:bg-gray-200 border-gray-200 text-gray-700') : 'opacity-40 cursor-not-allowed pointer-events-none'
                  }`}>
                  <i className="ri-arrow-left-s-line text-xl sm:text-2xl" aria-hidden />
                </button>
                <button type="button" aria-label="Următoare" onClick={() => scrollToSlide(recommendedSlideIndex + 1)} disabled={!canGoNext}
                  className={`absolute right-2 top-1/2 -translate-y-1/2 z-30 w-10 h-10 sm:w-12 sm:h-12 rounded-full flex items-center justify-center transition-all duration-300 shadow-xl backdrop-blur-md border-2 ${
                    canGoNext ? (isDarkMode ? 'bg-gray-800/80 hover:bg-gray-700/90 border-gray-600/50 text-white' : 'bg-gray-100/95 hover:bg-gray-200 border-gray-200 text-gray-700') : 'opacity-40 cursor-not-allowed pointer-events-none'
                  }`}>
                  <i className="ri-arrow-right-s-line text-xl sm:text-2xl" aria-hidden />
                </button>
                <div
                  ref={recommendedSliderRef}
                  className="flex gap-2 overflow-x-auto scroll-smooth pb-1 flex-1 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]"
                  style={{ WebkitOverflowScrolling: 'touch' }}
                  onScroll={() => {
                    const el = recommendedSliderRef.current;
                    if (!el) return;
                    const gap = 8;
                    const firstCard = el.querySelector('[data-recommended-card]') as HTMLElement;
                    const cardWidth = firstCard ? firstCard.offsetWidth : (el.offsetWidth - gap) / 2;
                    const step = cardWidth + gap;
                    const index = Math.round(el.scrollLeft / step);
                    setRecommendedSlideIndex(Math.min(index, maxSlideIndex));
                  }}
                >
                  {displayed.map((item) => (
                    <button key={item.id} type="button" onClick={() => router.push(`/licitatii-publice/${item.slug || item.id}`)}
                      data-recommended-card
                      className={`group flex-shrink-0 w-[calc(50%-0.25rem)] min-w-[calc(50%-0.25rem)] max-w-[calc(50%-0.25rem)] md:w-[calc((100%-2rem)/5)] md:min-w-[calc((100%-2rem)/5)] md:max-w-[calc((100%-2rem)/5)] rounded-2xl overflow-hidden transition-all duration-300 hover:scale-[1.03] hover:-translate-y-1 text-left ${
                        isDarkMode ? 'bg-gradient-to-br from-gray-700/50 to-gray-800/50 border border-gray-700/50' : 'bg-gradient-to-br from-gray-50 to-gray-100/80 border border-gray-200/70'
                      }`}
                    >
                      <div className={`aspect-square relative overflow-hidden ${isDarkMode ? 'bg-gray-700' : 'bg-gray-100'}`}>
                        <Image
                          src={getCdnImageUrl(item.image, listingGridTransformOptions(item.imageVersionAt))}
                          alt={item.title}
                          fill
                          unoptimized
                          sizes={CDN_IMAGE_SIZES_GRID}
                          className="object-cover group-hover:scale-110 transition-transform duration-500 ease-out"
                          loading="lazy"
                        />
                      </div>
                      <div className="p-3 sm:p-4">
                        <h3 className={`text-xs sm:text-sm font-semibold line-clamp-2 mb-2 leading-tight ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{item.title}</h3>
                        <div className={`text-[10px] flex items-center gap-0.5 mb-1 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                          <LocationIcon size="s" />
                          <span className="truncate">{getDisplayCity(item.location) || item.location}</span>
                        </div>
                        <p className={`text-sm sm:text-base font-bold ${isDarkMode ? 'text-blue-400' : 'text-blue-600'}`}>
                          {item.startingBidRON?.toLocaleString('ro-RO', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} Lei
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          );
        })()}

        {/* 3. Produse vizionate recent */}
        {recentlyViewedProducts.length > 0 && (
          <div className={`mt-6 sm:mt-8 rounded-2xl p-4 sm:p-5 sm:p-7 shadow-xl border overflow-hidden ${
            isDarkMode ? 'bg-gray-800 border-gray-700/50' : 'bg-gray-50/95 border-gray-200/60'
          }`}>
            <div className="flex items-center justify-between mb-4 sm:mb-6">
              <div className="flex items-center gap-3 sm:gap-4">
                <div className={`relative w-12 h-12 sm:w-14 sm:h-14 rounded-2xl flex items-center justify-center transition-all duration-300 ${
                  isDarkMode ? 'bg-gradient-to-br from-blue-500/20 to-blue-500/20 border border-blue-500/30' : 'bg-gradient-to-br from-blue-50/80 to-blue-50/80 border border-blue-200/40'
                }`}>
                  <i className="ri-history-line text-2xl sm:text-3xl bg-gradient-to-r from-blue-500 to-blue-500 bg-clip-text text-transparent" aria-hidden />
                </div>
                <div className="flex flex-col">
                  <h2 className={`text-base sm:text-lg md:text-xl font-bold bg-gradient-to-r ${
                    isDarkMode ? 'from-white via-gray-100 to-gray-300' : 'from-gray-800 via-gray-700 to-gray-600'
                  } bg-clip-text text-transparent`}>
                    Produse vizionate recent
                  </h2>
                  <p className={`text-xs sm:text-sm mt-0.5 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                    {recentlyViewedProducts.length} {recentlyViewedProducts.length === 1 ? 'produs' : 'produse'} în istoric
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (typeof window !== 'undefined') {
                    localStorage.removeItem('recentlyViewedProducts');
                    setRecentlyViewedProducts([]);
                  }
                }}
                className={`text-xs sm:text-sm px-3 sm:px-4 py-2 rounded-xl transition-all duration-300 font-medium ${
                  isDarkMode ? 'text-gray-400 hover:text-white hover:bg-gray-700/50 border border-gray-700/50' : 'text-gray-600 hover:text-gray-800 hover:bg-gray-200/80 border border-gray-200'
                }`}
              >
                <i className="ri-delete-bin-line mr-1.5" aria-hidden />
                Șterge istoricul
              </button>
            </div>
            <div className="relative group">
              <div className={`absolute left-0 top-0 bottom-0 w-6 sm:w-8 z-20 pointer-events-none bg-gradient-to-r ${
                isDarkMode ? 'from-gray-800/25 to-transparent' : 'from-gray-50/20 to-transparent'
              }`} />
              <div className={`absolute right-0 top-0 bottom-0 w-6 sm:w-8 z-20 pointer-events-none bg-gradient-to-l ${
                isDarkMode ? 'from-gray-800/25 to-transparent' : 'from-gray-50/20 to-transparent'
              }`} />
              <button type="button" aria-label="Anterioare"
                onClick={() => { if (recentlyViewedScrollRef.current) recentlyViewedScrollRef.current.scrollBy({ left: -200, behavior: 'smooth' }); }}
                className={`absolute left-2 top-1/2 -translate-y-1/2 z-30 w-10 h-10 sm:w-12 sm:h-12 rounded-full flex items-center justify-center transition-all duration-300 shadow-xl backdrop-blur-md border-2 ${
                  isDarkMode ? 'bg-gray-800/80 hover:bg-gray-700/90 border-gray-600/50 text-white' : 'bg-gray-100/95 hover:bg-gray-200 border-gray-200 text-gray-700'
                }`}
              >
                <i className="ri-arrow-left-s-line text-xl sm:text-2xl" aria-hidden />
              </button>
              <button type="button" aria-label="Următoare"
                onClick={() => { if (recentlyViewedScrollRef.current) recentlyViewedScrollRef.current.scrollBy({ left: 200, behavior: 'smooth' }); }}
                className={`absolute right-2 top-1/2 -translate-y-1/2 z-30 w-10 h-10 sm:w-12 sm:h-12 rounded-full flex items-center justify-center transition-all duration-300 shadow-xl backdrop-blur-md border-2 ${
                  isDarkMode ? 'bg-gray-800/80 hover:bg-gray-700/90 border-gray-600/50 text-white' : 'bg-gray-100/95 hover:bg-gray-200 border-gray-200 text-gray-700'
                }`}
              >
                <i className="ri-arrow-right-s-line text-xl sm:text-2xl" aria-hidden />
              </button>
              <div
                ref={recentlyViewedScrollRef}
                className="overflow-x-auto pb-4 -mx-2 px-2 scroll-smooth [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]"
                style={{ WebkitOverflowScrolling: 'touch' }}
              >
                <div className="flex gap-4 sm:gap-5 min-w-max py-2">
                  {recentlyViewedProducts.map((product) => {
                    const href = product.url || (product.slug || product.id ? `/licitatii-publice/${product.slug || product.id}` : '/licitatii-publice');
                    return (
                      <button
                        key={product.id}
                        type="button"
                        onClick={() => router.push(href)}
                        className={`group relative flex-shrink-0 w-[150px] sm:w-[170px] md:w-[190px] rounded-2xl overflow-hidden transition-all duration-300 hover:scale-[1.03] hover:-translate-y-1 text-left ${
                          isDarkMode ? 'bg-gradient-to-br from-gray-700/50 to-gray-800/50 border border-gray-700/50' : 'bg-gradient-to-br from-gray-50 to-gray-100/80 border border-gray-200/70'
                        }`}
                      >
                        <div className="aspect-square relative overflow-hidden bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-700 dark:to-gray-800">
                          {product.image ? (
                            <>
                              <Image
                                src={getCdnImageUrl(product.image, listingGridTransformOptions(null))}
                                alt={product.title}
                                fill
                                unoptimized
                                className="object-cover group-hover:scale-110 transition-transform duration-500 ease-out"
                                sizes={CDN_IMAGE_SIZES_GRID}
                                loading="lazy"
                              />
                              <div className="absolute inset-0 bg-gradient-to-t from-black/20 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                            </>
                          ) : (
                            <div className={`w-full h-full flex items-center justify-center ${isDarkMode ? 'bg-gray-700' : 'bg-gray-200'}`}>
                              <i className={`ri-image-line text-4xl ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`} aria-hidden />
                            </div>
                          )}
                        </div>
                        <div className="p-3 sm:p-4">
                          <h3 className={`text-xs sm:text-sm font-semibold line-clamp-2 mb-2 leading-tight ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{product.title}</h3>
                          {product.location && product.location !== '—' && (
                            <div className={`text-[10px] flex items-center gap-0.5 mb-1 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                              <LocationIcon size="s" />
                              <span className="truncate">{getDisplayCity(product.location) || product.location}</span>
                            </div>
                          )}
                          {product.startingBidRON != null && (
                            <p className={`text-xs sm:text-sm font-bold ${isDarkMode ? 'text-blue-400' : 'text-blue-600'}`}>
                              {(() => {
                                const n = Math.round(Number(product.startingBidRON));
                                return `${n.toLocaleString('ro-RO', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} Lei`;
                              })()}
                            </p>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        )}

      {/* MODAL GALERIE NOUĂ - DE LA ZERO - EXACT CA STORIA.RO */}
      {showImageGallery && auction && auction.images && auction.images.length > 0 && typeof window !== 'undefined' && createPortal(
        <div 
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(6, 8, 12, 0.4)',
            backdropFilter: 'blur(22px) saturate(1.12)',
            WebkitBackdropFilter: 'blur(22px) saturate(1.12)',
            zIndex: 999999,
            width: '100%',
            maxWidth: '100vw',
            minHeight: '100dvh',
            height: '100dvh',
            overflow: 'hidden',
            margin: 0,
            padding: 0
          }}
          onClick={(e) => {
            // Închide modalul doar dacă click-ul este pe fundal (nu pe imagine sau alte elemente)
            if (e.target === e.currentTarget) {
              setShowImageGallery(false);
            }
          }}
        >
          {/* Header - Înapoi, Share, Heart */}
          <div style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingTop: isMobile
              ? 'calc(env(safe-area-inset-top, 0px) + 14px)'
              : 'max(16px, env(safe-area-inset-top, 0px))',
            paddingLeft: 'max(12px, env(safe-area-inset-left, 0px))',
            paddingRight: 'max(12px, env(safe-area-inset-right, 0px))',
            paddingBottom: isMobile ? '10px' : '16px',
            zIndex: 1000000,
            backgroundColor: 'transparent'
          }}>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowImageGallery(false);
              }}
              style={{
                color: '#FFFFFF',
                background: 'rgba(10, 12, 16, 0.52)',
                backdropFilter: 'blur(16px)',
                WebkitBackdropFilter: 'blur(16px)',
                border: '1px solid rgba(255,255,255,0.14)',
                boxShadow: '0 8px 28px rgba(0,0,0,0.35)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: isMobile ? '6px' : '8px',
                padding: isMobile ? '10px 14px' : '8px 16px',
                borderRadius: '999px'
              }}
            >
              <svg width={isMobile ? "20" : "24"} height={isMobile ? "20" : "24"} fill="none" stroke="#FFFFFF" viewBox="0 0 24 24" strokeWidth={2.2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
              <span style={{ fontSize: isMobile ? '16px' : '18px', fontWeight: 500, color: '#FFFFFF' }}>Înapoi</span>
            </button>
            
            <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? '12px' : '18px' }}>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setShowShareMenu(true);
                }}
                style={{
                  color: '#FFFFFF',
                  background: 'rgba(10, 12, 16, 0.52)',
                  backdropFilter: 'blur(16px)',
                  WebkitBackdropFilter: 'blur(16px)',
                  border: '1px solid rgba(255,255,255,0.14)',
                  boxShadow: '0 8px 28px rgba(0,0,0,0.35)',
                  cursor: 'pointer',
                  padding: isMobile ? '12px' : '14px',
                  borderRadius: '999px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                <img src="/icons/share-icon.png" alt="" style={{ width: isMobile ? '0.8rem' : '1rem', height: isMobile ? '0.8rem' : '1rem', objectFit: 'contain', filter: 'invert(1)' }} />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  toggleFavorite();
                }}
                style={{
                  color: '#FFFFFF',
                  background: 'rgba(10, 12, 16, 0.52)',
                  backdropFilter: 'blur(16px)',
                  WebkitBackdropFilter: 'blur(16px)',
                  border: '1px solid rgba(255,255,255,0.14)',
                  boxShadow: '0 8px 28px rgba(0,0,0,0.35)',
                  cursor: 'pointer',
                  padding: isMobile ? '12px' : '14px',
                  borderRadius: '999px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                <img src="/icons/heart-icon.png" alt="" style={{ width: isMobile ? '1.1rem' : '1.375rem', height: isMobile ? '1.1rem' : '1.375rem', objectFit: 'contain', filter: isFavorite ? 'invert(27%) sepia(51%) saturate(2878%) hue-rotate(346deg)' : 'invert(1)' }} />
              </button>
            </div>
          </div>

          {/* Imagine principală — mobil: coloană (poză → counter → thumbnails); desktop: doar poză centrată */}
          <div 
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              paddingTop: isMobile ? 'calc(88px + env(safe-area-inset-top, 0px))' : 'calc(60px + env(safe-area-inset-top, 0px))',
              paddingBottom: isMobile ? 'max(12px, env(safe-area-inset-bottom, 0px))' : 'calc(80px + env(safe-area-inset-bottom, 0px))',
              paddingLeft: isMobile ? 'max(8px, env(safe-area-inset-left, 0px))' : 'max(0px, env(safe-area-inset-left, 0px))',
              paddingRight: isMobile ? 'max(8px, env(safe-area-inset-right, 0px))' : 'max(0px, env(safe-area-inset-right, 0px))',
              pointerEvents: 'none'
            }}
            onTouchStart={onTouchStart}
            onTouchMove={onTouchMove}
            onTouchEnd={onTouchEnd}
          >
            {isMobile && auction.images[currentImageIndex] ? (
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '100%',
                  maxHeight: '100%',
                  gap: '10px',
                  pointerEvents: 'none',
                }}
              >
                <div
                  style={{
                    pointerEvents: 'auto',
                    width: '100%',
                    height: 'auto',
                    maxWidth: '100%',
                    maxHeight:
                      auction.images.length > 1
                        ? 'calc(100dvh - 88px - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px) - 120px)'
                        : 'calc(100dvh - 88px - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px) - 24px)',
                    borderRadius: '0',
                    overflow: 'hidden',
                    boxShadow: 'none',
                    backgroundColor: '#000',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 1,
                    minHeight: 0,
                  }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <Image
                    src={cdn.hero(auction.images[currentImageIndex])}
                    alt={`${auction.title} - ${currentImageIndex + 1}`}
                    width={1600}
                    height={1600}
                    unoptimized
                    style={{
                      width: '100%',
                      height: '100%',
                      objectFit: 'contain',
                      display: 'block',
                    }}
                    priority
                    draggable={false}
                  />
                </div>
                {auction.images.length > 1 ? (
                  <>
                    <div
                      onClick={(e) => e.stopPropagation()}
                      style={{
                        pointerEvents: 'auto',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        maxWidth:
                          'calc(100vw - env(safe-area-inset-left, 0px) - env(safe-area-inset-right, 0px) - 24px)',
                        overflowX: 'auto',
                        padding: '4px 4px 0',
                        gap: '8px',
                        WebkitOverflowScrolling: 'touch',
                        flexShrink: 0,
                      }}
                    >
                      {auction.images.map((thumb, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setCurrentImageIndex(idx);
                          }}
                          style={{
                            flex: '0 0 auto',
                            width: '48px',
                            height: '48px',
                            borderRadius: '10px',
                            overflow: 'hidden',
                            border:
                              currentImageIndex === idx
                                ? '2px solid rgba(147, 197, 253, 0.95)'
                                : '2px solid rgba(255,255,255,0.28)',
                            padding: 0,
                            cursor: 'pointer',
                            backgroundColor: '#0a0c10',
                            boxShadow:
                              currentImageIndex === idx
                                ? '0 0 0 1px rgba(0,0,0,0.5), 0 6px 20px rgba(59,130,246,0.25)'
                                : '0 4px 14px rgba(0,0,0,0.35)',
                            transition:
                              'transform 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease',
                          }}
                        >
                          <Image
                            src={cdn.thumb(thumb)}
                            alt={`${auction.title} thumbnail ${idx + 1}`}
                            width={48}
                            height={48}
                            unoptimized
                            loading="lazy"
                            style={{
                              width: '100%',
                              height: '100%',
                              objectFit: 'cover',
                              display: 'block',
                            }}
                            draggable={false}
                          />
                        </button>
                      ))}
                    </div>
                    <div
                      onClick={(e) => e.stopPropagation()}
                      style={{
                        pointerEvents: 'auto',
                        backgroundColor: 'rgba(10, 12, 16, 0.55)',
                        backdropFilter: 'blur(14px)',
                        WebkitBackdropFilter: 'blur(14px)',
                        border: '1px solid rgba(255,255,255,0.12)',
                        boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
                        padding: '6px 14px',
                        borderRadius: '999px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        zIndex: 1000000,
                      }}
                    >
                      <span
                        style={{
                          fontSize: '12px',
                          fontWeight: 500,
                          color: '#FFFFFF',
                          letterSpacing: '0.5px',
                        }}
                      >
                        {currentImageIndex + 1} / {auction.images.length}
                      </span>
                    </div>
                  </>
                ) : null}
              </div>
            ) : (
              auction.images[currentImageIndex] && (
                <div
                  style={{
                    pointerEvents: 'auto',
                    width: 'min(80vw, 80vh)',
                    height: 'min(80vw, 80vh)',
                    maxWidth: 'none',
                    maxHeight: 'none',
                    borderRadius: '12px',
                    overflow: 'hidden',
                    boxShadow: '0 20px 40px rgba(0,0,0,0.6)',
                    backgroundColor: '#000',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <Image
                    src={cdn.hero(auction.images[currentImageIndex])}
                    alt={`${auction.title} - ${currentImageIndex + 1}`}
                    width={1600}
                    height={1600}
                    unoptimized
                    style={{
                      width: '100%',
                      height: '100%',
                      objectFit: 'contain',
                      display: 'block',
                    }}
                    priority
                    draggable={false}
                  />
                </div>
              )
            )}
          </div>

          {/* Săgeți navigare - stânga/dreapta */}
          {auction.images.length > 1 && (
            <>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  prevImage();
                }}
                style={{
                  position: 'absolute',
                  left: isMobile ? 'max(8px, env(safe-area-inset-left, 0px))' : '32px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  width: 'auto',
                  height: 'auto',
                  border: 'none',
                  background: 'transparent',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  zIndex: 1000000,
                  padding: '8px',
                }}
              >
                <svg width={isMobile ? "24" : "52"} height={isMobile ? "24" : "52"} fill="none" stroke="#FFFFFF" viewBox="0 0 24 24" strokeWidth={2.5} style={{ filter: 'drop-shadow(0 2px 8px rgba(0,0,0,0.5))' }}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                </svg>
              </button>

              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  nextImage();
                }}
                style={{
                  position: 'absolute',
                  right: isMobile ? 'max(8px, env(safe-area-inset-right, 0px))' : '32px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  width: 'auto',
                  height: 'auto',
                  border: 'none',
                  background: 'transparent',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  zIndex: 1000000,
                  padding: '8px',
                }}
              >
                <svg width={isMobile ? "24" : "52"} height={isMobile ? "24" : "52"} fill="none" stroke="#FFFFFF" viewBox="0 0 24 24" strokeWidth={2.5} style={{ filter: 'drop-shadow(0 2px 8px rgba(0,0,0,0.5))' }}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </>
          )}

          {/* Counter + thumbnails — doar desktop (pe mobil sunt sub poza în coloană) */}
          {!isMobile && auction.images.length > 1 && (
            <div 
              onClick={(e) => e.stopPropagation()}
              style={{
                position: 'absolute',
                bottom: 'max(20px, env(safe-area-inset-bottom, 0px))',
                right: 'max(16px, env(safe-area-inset-right, 0px))',
                backgroundColor: 'rgba(10, 12, 16, 0.55)',
                backdropFilter: 'blur(14px)',
                WebkitBackdropFilter: 'blur(14px)',
                border: '1px solid rgba(255,255,255,0.12)',
                boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
                padding: '8px 16px',
                borderRadius: '999px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                zIndex: 1000000,
                pointerEvents: 'auto'
              }}
            >
              <span style={{ 
                fontSize: '14px', 
                fontWeight: 500, 
                color: '#FFFFFF',
                letterSpacing: '0.5px'
              }}>
                {currentImageIndex + 1} / {auction.images.length}
              </span>
            </div>
          )}

          {!isMobile && auction.images.length > 1 && (
            <div 
              onClick={(e) => e.stopPropagation()}
              style={{
                position: 'absolute',
                bottom: '60px',
                left: '50%',
                transform: 'translateX(-50%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                maxWidth: '90vw',
                overflowX: 'auto',
                padding: '4px 8px',
                gap: '8px',
                zIndex: 1000000,
                pointerEvents: 'auto',
                WebkitOverflowScrolling: 'touch'
              }}
            >
              {auction.images.map((thumb, idx) => (
                <button
                  key={idx}
                  onClick={(e) => {
                    e.stopPropagation();
                    setCurrentImageIndex(idx);
                  }}
                  style={{
                    flex: '0 0 auto',
                    width: '56px',
                    height: '56px',
                    borderRadius: '10px',
                    overflow: 'hidden',
                    border: currentImageIndex === idx
                      ? '2px solid rgba(147, 197, 253, 0.95)'
                      : '2px solid rgba(255,255,255,0.28)',
                    padding: 0,
                    cursor: 'pointer',
                    backgroundColor: '#0a0c10',
                    boxShadow: currentImageIndex === idx
                      ? '0 0 0 1px rgba(0,0,0,0.5), 0 6px 20px rgba(59,130,246,0.25)'
                      : '0 4px 14px rgba(0,0,0,0.35)',
                    transition: 'transform 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease'
                  }}
                >
                  <Image
                    src={cdn.thumb(thumb)}
                    alt={`${auction.title} thumbnail ${idx + 1}`}
                    width={56}
                    height={56}
                    unoptimized
                    loading="lazy"
                    style={{
                      width: '100%',
                      height: '100%',
                      objectFit: 'cover',
                      display: 'block'
                    }}
                    draggable={false}
                  />
                </button>
              ))}
            </div>
          )}
        </div>,
        document.body
      )}

      {showPdfModal && typeof window !== "undefined" && createPortal(
        <div
          className="fixed inset-0 z-[1000000] p-3 sm:p-6 flex items-center justify-center"
          style={{
            background: "linear-gradient(135deg, rgba(15,23,42,0.75) 0%, rgba(30,41,59,0.7) 50%, rgba(15,23,42,0.8) 100%)",
            backdropFilter: "blur(12px)",
            WebkitBackdropFilter: "blur(12px)",
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowPdfModal(false);
          }}
        >
          <div className="relative mx-auto h-full w-full max-w-5xl rounded-2xl overflow-hidden bg-white/95 shadow-2xl ring-1 ring-white/20">
            <button
              type="button"
              onClick={() => setShowPdfModal(false)}
              className="absolute top-4 right-4 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-white/90 text-slate-600 shadow-lg ring-1 ring-black/5 transition hover:bg-white hover:text-slate-900 hover:shadow-xl"
              aria-label="Închide"
              title="Închide"
            >
              <CloseIcon size="xl" />
            </button>
            <iframe
              src={pdfModalViewerSrc}
              title={pdfModalFilename}
              className="h-full w-full bg-gray-50/95 block rounded-2xl"
            />
          </div>
        </div>,
        document.body
      )}

      {/* Mobile floating button: deblocat (verde) sau Deblochează (galben) – bottom din variabilă, automat deasupra meniului de jos */}
      {auction && (
        <div
          className="md:hidden fixed left-1/2 -translate-x-1/2 z-[95] px-4 w-full max-w-md"
          style={{ bottom: 'var(--gobid-floating-bottom)' }}
        >
          {effectiveUnlocked ? (
            <div
              className="w-full px-5 py-3.5 rounded-2xl font-semibold transition-all shadow-2xl flex items-center justify-center gap-2 touch-manipulation bg-emerald-500 text-white border-2 border-emerald-400 pointer-events-none"
              aria-label="Anunț deblocat"
            >
              <span className="w-7 h-7 rounded-full bg-white/20 flex items-center justify-center">
                <i className="ri-lock-unlock-line text-lg" aria-hidden />
              </span>
              <span>Deblocat</span>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => { if (auction?.status === 'in_progress') setShowUnlockInProgressConfirm(true); else handleUnlockFromPage(); }}
              disabled={unlockingProduct}
              className={`w-full px-5 py-3.5 rounded-2xl font-semibold transition-all shadow-2xl flex items-center justify-center gap-2 touch-manipulation ${
                unlockingProduct
                  ? 'opacity-60 cursor-wait bg-yellow-500 text-white'
                  : 'bg-yellow-500 hover:bg-yellow-600 text-white'
              }`}
            >
              <span className="w-7 h-7 rounded-full bg-white/20 flex items-center justify-center">
                <i className="ri-coin-line text-lg" aria-hidden />
              </span>
              <span>{unlockingProduct ? 'Se deblochează...' : '1 Token - Deblochează'}</span>
            </button>
          )}
        </div>
      )}

      {/* Footer */}
      <div className="mt-16">
        <DashboardFooter isDarkMode={isDarkMode} />
      </div>


      {/* Add to Favorite List Modal */}
      {selectedProductForFavorite && (
        <AddToFavoriteListModal
          isOpen={showFavoriteModal}
          onClose={() => {
            setShowFavoriteModal(false);
            setSelectedProductForFavorite(null);
          }}
          productId={selectedProductForFavorite.id}
          productTitle={selectedProductForFavorite.title}
          isDarkMode={isDarkMode}
          onSuccess={handleFavoriteModalSuccess}
        />
      )}
    </div>
    </div>
  );
}
