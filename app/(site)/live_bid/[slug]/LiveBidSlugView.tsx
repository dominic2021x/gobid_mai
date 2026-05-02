"use client";

import {
  mapProductRowToAuction,
  type LiveBidAuction,
} from "@/lib/live-bid/mapProductRowToAuction";
import { normalizeLiveBidDescriptionDisplay } from "@/lib/live-bid/description-plain-text";
import { useState, useEffect, useLayoutEffect, useCallback, useRef, useMemo } from "react";
import { createPortal } from "react-dom";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ClockIcon, LocationIcon, ArrowRightIcon, CloseIcon, PlusIcon, MinusIcon } from "@/components/HeroIcons";
import UniversalHeader from "@/components/UniversalHeader";
import Image from "next/image";
import { trackProductView } from "@/lib/analytics/tracking";
import { supabase } from "@/lib/supabase";
import ProductPriceEvaluation from "@/app/price-evaluator/ProductPriceEvaluation";
import { ProductForEvaluation, ProductCategory } from "@/lib/types/priceEvaluation";
import ExecutorBusinessCard from "@/components/ExecutorBusinessCard";
import AddToFavoriteListModal from "@/components/AddToFavoriteListModal";
import { QRCodeSVG } from "qrcode.react";
import ProductChat from "@/components/ProductChat";
import BidListSkeleton from "@/components/skeletons/BidListSkeleton";
import AuctionDetailsSkeleton from "@/components/skeletons/AuctionDetailsSkeleton";
import DashboardFooter from "@/components/DashboardFooter";
import { ProgressiveImage } from "@/components/image/ProgressiveImage";
import {
  collectHttpProductImageUrls,
  fetchImageFocalByUrls,
  getFocalForImageUrl,
} from "@/lib/image/focal-from-product";
import type { LiveBidResolvedImageUrls } from "@/lib/live-bid/resolve-live-bid-image-urls";
import {
  CDN_IMAGE_FALLBACK_SRC,
  CDN_IMAGE_SIZES_GRID,
  getCdnImageUrl,
  listingGridTransformOptions,
  productImageCdn,
  stablePublicImageSrcForHydration,
} from "@/lib/image/cdn";
import { useIsHydrated } from "@/lib/hooks/use-is-hydrated";
import { cn } from "@/lib/utils";
import {
  AuctionShareMenuPanel,
  type AuctionShareMenuAction,
} from "@/components/share/AuctionShareMenu";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { BackButton } from "@/components/ui/back-button";
import SinglepageParteaStanga from "@/components/reclame/singlepage_partea_stanga";
import SinglepageParteaDreapta from "@/components/reclame/singlepage_partea_dreapta";
import SinglepageParteaDreaptaSubcodAnunt from "@/components/singlepage_partea_dreapta_subcodanunt";
import LiveBidDescriptionText from "./LiveBidDescriptionText";

/**
 * Detects transient Supabase/PostgREST errors (schema cache reload, 503 upstream
 * timeouts, connection reset) that should be retried before surfacing "not found".
 */
function isTransientSupabaseError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as Record<string, unknown>;
  const code = typeof e.code === "string" ? e.code : "";
  const msg = typeof e.message === "string" ? e.message.toLowerCase() : "";
  const details = typeof e.details === "string" ? e.details.toLowerCase() : "";
  const hint = typeof e.hint === "string" ? e.hint.toLowerCase() : "";
  const haystack = `${msg} ${details} ${hint}`;
  if (code === "PGRST002") return true;
  return (
    haystack.includes("schema cache") ||
    haystack.includes("upstream request timeout") ||
    haystack.includes("upstream connect error") ||
    haystack.includes("fetch failed") ||
    haystack.includes("connection closed") ||
    haystack.includes(":closed") ||
    haystack.includes("econnreset") ||
    haystack.includes("socket hang up") ||
    haystack.includes("etimedout")
  );
}

/**
 * Run a Supabase query builder with a couple of retries on transient errors
 * (PGRST002 / schema cache reload / 503 upstream). Returns the final `{ data, error }`
 * tuple so callers can keep their existing branching logic.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function runSupabaseQueryWithRetry(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  build: () => PromiseLike<{ data: any; error: any }>,
  { maxRetries = 2, baseDelayMs = 300 }: { maxRetries?: number; baseDelayMs?: number } = {}
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<{ data: any; error: any }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let last: { data: any; error: any } = { data: null, error: null };
  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    last = await build();
    if (!last.error) return last;
    if (!isTransientSupabaseError(last.error) || attempt === maxRetries) return last;
    await new Promise<void>((resolve) => setTimeout(resolve, baseDelayMs * (attempt + 1)));
  }
  return last;
}

function trackRecentlyViewed(product: { id: string; title: string; image?: string | string[]; price?: number; currency?: string; slug?: string; url?: string }) {
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

/** Telefon pentru tel: și cifre internaționale pentru wa.me (fără +). */
function normalizeSellerPhoneForContact(raw: string): { tel: string; waDigits: string } | null {
  const tel = raw.replace(/[\s\-\.()]/g, "").replace(/^0/, "+40");
  if (!/^\+?[0-9]{10,}$/.test(tel)) return null;
  const waDigits = tel.replace(/\D/g, "");
  if (waDigits.length < 10) return null;
  return { tel, waDigits };
}

function buildWhatsAppListingUrl(waDigits: string, listingUrl: string): string {
  const text = `Salut! Am văzut anunțul: ${listingUrl}`;
  return `https://wa.me/${waDigits}?text=${encodeURIComponent(text)}`;
}

/** Afișare lizibilă pentru RO (+40 …). */
function formatPhoneForDisplay(tel: string): string {
  const digits = tel.replace(/\D/g, "");
  if (digits.length < 10) return tel.trim() || tel;
  if (digits.startsWith("40") && digits.length >= 11) {
    const rest = digits.slice(2);
    return `+40 ${rest.slice(0, 3)} ${rest.slice(3, 6)} ${rest.slice(6)}`.trim();
  }
  return tel.startsWith("+") ? tel : `+${digits}`;
}

/** Afișare sumă ofertă în format RO (ex. 1.000). */
function formatBidAmountRo(n: number): string {
  if (n <= 0) return "";
  return n.toLocaleString("ro-RO", { maximumFractionDigits: 0, useGrouping: true });
}

function parseBidAmountDigits(raw: string): number {
  const digits = raw.replace(/\D/g, "");
  if (!digits) return 0;
  const n = parseInt(digits, 10);
  if (Number.isNaN(n)) return 0;
  return Math.min(n, Number.MAX_SAFE_INTEGER);
}

/** Prețul din anunț (Lei) — punct de plecare pentru ofertă; clientul poate modifica (inclusiv mai jos). */
function getAuctionListingPriceRON(a: {
  startingBidRON?: number;
  startingBid: number;
  currentBid: number;
}): number {
  if (a.startingBidRON != null && a.startingBidRON > 0) {
    return Math.floor(Number(a.startingBidRON));
  }
  if (a.startingBid > 0) {
    return Math.floor(a.startingBid);
  }
  return Math.max(0, Math.floor(Number(a.currentBid ?? 0)));
}

/** Ajustează font-size ca tot textul din input să încapă (fără ellipsis). Returnează px-ul aplicat. */
function fitBidInputFontToWidth(input: HTMLInputElement, maxPx: number, minPx: number): number {
  const w = input.clientWidth;
  if (w < 4) return minPx;
  const cap = Math.max(minPx, Math.min(maxPx, 120));
  const floor = minPx;
  input.style.fontSize = `${cap}px`;
  if (input.scrollWidth <= w) return cap;
  let lo = floor;
  let hi = cap;
  for (let i = 0; i < 30; i++) {
    const mid = (lo + hi) / 2;
    input.style.fontSize = `${mid}px`;
    if (input.scrollWidth <= w) lo = mid;
    else hi = mid;
  }
  input.style.fontSize = `${lo}px`;
  return lo;
}

// Componentă pentru panel-ul de oferte ale utilizatorului
interface UserBidsPanelProps {
  product: Auction;
  bids: any[];
  loadingBids: boolean;
  isDarkMode: boolean;
  onClose: () => void;
}

const UserBidsPanel: React.FC<UserBidsPanelProps> = ({
  product,
  bids,
  loadingBids,
  isDarkMode,
  onClose,
}) => {
  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('ro-RO', {
      style: 'currency',
      currency: 'RON',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(price);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString('ro-RO', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatTimeAgo = (dateString: string) => {
    const now = new Date();
    const date = new Date(dateString);
    const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);
    
    if (diffInSeconds < 60) return 'acum';
    if (diffInSeconds < 3600) return `acum ${Math.floor(diffInSeconds / 60)} min`;
    if (diffInSeconds < 86400) return `acum ${Math.floor(diffInSeconds / 3600)} ore`;
    if (diffInSeconds < 604800) return `acum ${Math.floor(diffInSeconds / 86400)} zile`;
    return formatDate(dateString);
  };

  // Calculează oferta maximă și sortează ofertele
  const sortedBids = [...bids].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  const highestBid = bids.length > 0 ? Math.max(...bids.map(b => b.amount || 0)) : product.startingBid;
  const latestBid = sortedBids[0];
  const isLatestHighest = latestBid && latestBid.amount === highestBid;

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4"
      style={{ backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)', backgroundColor: 'rgba(0, 0, 0, 0.5)' }}
      onClick={onClose}
    >
      <div
        className={`rounded-xl sm:rounded-2xl lg:rounded-3xl p-3 sm:p-4 lg:p-6 xl:p-8 w-full max-w-sm sm:max-w-md lg:max-w-2xl xl:max-w-3xl shadow-2xl max-h-[95vh] sm:max-h-[90vh] overflow-y-auto ${
          isDarkMode ? 'bg-gradient-to-br from-gray-800 to-gray-900 border border-gray-700' : 'bg-white border border-gray-200'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex justify-between items-start sm:items-center mb-3 sm:mb-4 lg:mb-6 pb-2 sm:pb-3 lg:pb-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex-1 min-w-0 pr-2">
            <h3 className={`text-base sm:text-lg lg:text-xl xl:text-2xl font-bold mb-0.5 sm:mb-1 lg:mb-2 ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
              <i className="ri-auction-line mr-1.5 sm:mr-2 lg:mr-3 text-blue-500 text-sm sm:text-base"></i>
              Ofertele mele
            </h3>
            <p className={`text-xs sm:text-sm hidden lg:block ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
              Istoricul complet al ofertelor tale pentru acest produs
            </p>
          </div>
          <button
            onClick={onClose}
            className={`p-1 sm:p-1.5 lg:p-2 rounded-full transition-all hover:scale-110 flex-shrink-0 ${
              isDarkMode 
                ? 'text-gray-400 hover:text-white hover:bg-gray-700' 
                : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
            }`}
          >
            <i className="ri-close-line text-lg sm:text-xl"></i>
          </button>
        </div>

        {loadingBids ? (
          <BidListSkeleton count={5} isDarkMode={isDarkMode} />
        ) : bids.length === 0 ? (
          <div className={`text-center py-6 sm:py-12 ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
            <div className={`w-16 h-16 sm:w-20 sm:h-20 mx-auto mb-3 sm:mb-4 rounded-full flex items-center justify-center ${
              isDarkMode ? 'bg-gray-700' : 'bg-gray-100'
            }`}>
              <i className="ri-inbox-line text-3xl sm:text-4xl"></i>
            </div>
            <p className="text-base sm:text-lg font-medium mb-1 sm:mb-2">Nu ai plasat încă nicio ofertă</p>
            <p className="text-xs sm:text-sm">Începe să licitezi pentru acest produs!</p>
          </div>
        ) : (
          <div className="space-y-3 sm:space-y-4 lg:space-y-6">
            {/* Statistici */}
            <div className={`p-2.5 sm:p-3 lg:p-4 xl:p-6 rounded-lg sm:rounded-xl lg:rounded-2xl ${
              isDarkMode 
                ? 'bg-gradient-to-r from-blue-900/30 to-blue-900/30 border border-blue-700/50' 
                : 'bg-gradient-to-r from-blue-50 to-blue-50 border border-blue-200'
            }`}>
              <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:gap-4">
                <div>
                  <div className={`text-[10px] sm:text-xs font-medium mb-0.5 ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                    Ofertă maximă
                  </div>
                  <div className={`text-base sm:text-lg lg:text-xl xl:text-2xl font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                    {formatPrice(highestBid)}
                  </div>
                </div>
                <div>
                  <div className={`text-[10px] sm:text-xs font-medium mb-0.5 ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                    Total oferte
                  </div>
                  <div className={`text-base sm:text-lg lg:text-xl xl:text-2xl font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                    {bids.length}
                  </div>
                </div>
              </div>
            </div>

            {/* Istoric oferte */}
            <div>
              <h4 className={`text-xs sm:text-sm font-semibold mb-1.5 sm:mb-2 lg:mb-3 xl:mb-4 flex items-center ${
                isDarkMode ? 'text-gray-300' : 'text-gray-700'
              }`}>
                <i className="ri-history-line mr-1 sm:mr-1.5 lg:mr-2 text-xs sm:text-sm"></i>
                <span className="hidden sm:inline">Istoric oferte</span>
                <span className="sm:hidden">Istoric</span>
              </h4>
              <div className="space-y-1.5 sm:space-y-2 lg:space-y-3">
                {sortedBids.map((bid, index) => {
                  const isLatest = index === 0;
                  const isHighest = bid.amount === highestBid;
                  
                  return (
                    <div
                      key={bid.id}
                      className={`p-2.5 sm:p-3 lg:p-4 xl:p-5 rounded-lg sm:rounded-xl border-2 transition-all ${
                        isLatest && isHighest
                          ? isDarkMode
                            ? 'bg-gradient-to-r from-green-900/20 to-emerald-900/20 border-green-500/50'
                            : 'bg-gradient-to-r from-green-50 to-emerald-50 border-green-400'
                          : bid.is_outbid
                          ? isDarkMode
                            ? 'bg-red-900/10 border-red-500/30'
                            : 'bg-red-50/50 border-red-200'
                          : isDarkMode
                          ? 'bg-gray-700/50 border-gray-600'
                          : 'bg-white border-gray-200'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-1.5 sm:gap-2 lg:gap-3 xl:gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 lg:gap-3 mb-1 sm:mb-1.5 lg:mb-2">
                            <div className={`text-lg sm:text-xl lg:text-2xl xl:text-3xl font-bold ${
                              isDarkMode ? 'text-white' : 'text-gray-900'
                            }`}>
                              {formatPrice(bid.amount)}
                            </div>
                            {isLatest && (
                              <span className={`px-1.5 sm:px-2 lg:px-3 py-0.5 sm:py-1 rounded-full text-[10px] sm:text-xs font-semibold whitespace-nowrap ${
                                isDarkMode
                                  ? 'bg-blue-600 text-white'
                                  : 'bg-blue-500 text-white'
                              }`}>
                                <i className="ri-time-line mr-0.5 sm:mr-1 text-xs"></i>
                                <span className="hidden lg:inline">Cea mai recentă</span>
                                <span className="lg:hidden">Recentă</span>
                              </span>
                            )}
                            {isHighest && !isLatest && (
                              <span className={`px-1.5 sm:px-2 lg:px-3 py-0.5 sm:py-1 rounded-full text-[10px] sm:text-xs font-semibold whitespace-nowrap ${
                                isDarkMode
                                  ? 'bg-yellow-600 text-white'
                                  : 'bg-yellow-500 text-white'
                              }`}>
                                <i className="ri-arrow-up-line mr-0.5 sm:mr-1 text-xs"></i>
                                <span className="hidden lg:inline">Cea mai mare</span>
                                <span className="lg:hidden">Mare</span>
                              </span>
                            )}
                          </div>
                          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 lg:gap-3 xl:gap-4 text-[10px] sm:text-xs lg:text-sm">
                            <div className={`flex items-center gap-0.5 sm:gap-1 lg:gap-1.5 ${
                              isDarkMode ? 'text-gray-400' : 'text-gray-600'
                            }`}>
                              <i className="ri-calendar-line text-[10px] sm:text-xs"></i>
                              <span className="hidden sm:inline">{formatDate(bid.created_at)}</span>
                              <span className="sm:hidden">{new Date(bid.created_at).toLocaleDateString('ro-RO', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
                            </div>
                            <div className={`flex items-center gap-0.5 sm:gap-1 lg:gap-1.5 ${
                              isDarkMode ? 'text-gray-500' : 'text-gray-500'
                            }`}>
                              <i className="ri-time-line text-[10px] sm:text-xs"></i>
                              <span>{formatTimeAgo(bid.created_at)}</span>
                            </div>
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-0.5 sm:gap-1 lg:gap-2 flex-shrink-0">
                          {isLatest && isHighest && (
                            <div className={`text-[10px] sm:text-xs px-1.5 sm:px-2 lg:px-3 py-0.5 sm:py-1 lg:py-1.5 rounded-md sm:rounded-lg font-semibold whitespace-nowrap ${
                              isDarkMode
                                ? 'bg-green-600/20 text-green-400 border border-green-500/50'
                                : 'bg-green-100 text-green-700 border border-green-300'
                            }`}>
                              <i className="ri-checkbox-circle-line mr-0.5 sm:mr-1 text-xs"></i>
                              <span className="hidden sm:inline">Ofertă activă</span>
                              <span className="sm:hidden">Activă</span>
                            </div>
                          )}
                          {bid.is_outbid && (
                            <div className={`text-[10px] sm:text-xs px-1.5 sm:px-2 lg:px-3 py-0.5 sm:py-1 lg:py-1.5 rounded-md sm:rounded-lg font-semibold whitespace-nowrap ${
                              isDarkMode
                                ? 'bg-red-600/20 text-red-400 border border-red-500/50'
                                : 'bg-red-100 text-red-700 border border-red-300'
                            }`}>
                              <i className="ri-arrow-down-line mr-0.5 sm:mr-1 text-xs"></i>
                              Depășită
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// Componentă pentru istoricul ofertelor publice
interface BidHistoryPanelProps {
  product: Auction;
  bids: any[];
  loadingBids: boolean;
  isDarkMode: boolean;
  onClose: () => void;
  currentUserId: string | null;
  productUserId: string | null;
}

const BidHistoryPanel: React.FC<BidHistoryPanelProps> = ({
  product,
  bids,
  loadingBids,
  isDarkMode,
  onClose,
  currentUserId,
  productUserId,
}) => {
  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('ro-RO', {
      style: 'currency',
      currency: 'RON',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(price);
  };

  const formatTimeAgo = (dateString: string) => {
    const now = new Date();
    const date = new Date(dateString);
    const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);
    
    if (diffInSeconds < 60) return 'acum';
    if (diffInSeconds < 3600) return `acum ${Math.floor(diffInSeconds / 60)} min`;
    if (diffInSeconds < 86400) return `acum ${Math.floor(diffInSeconds / 3600)} ore`;
    if (diffInSeconds < 604800) return `acum ${Math.floor(diffInSeconds / 86400)} zile`;
    return new Date(dateString).toLocaleString('ro-RO', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // Sortează ofertele descrescător după sumă, apoi după dată
  const sortedBids = [...bids].sort((a, b) => {
    if (b.amount !== a.amount) return b.amount - a.amount;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });

  const currentPrice = product?.currentBid || product?.startingBid || 0;
  const isSeller = currentUserId === productUserId;
  const totalBids = bids.length;
  // Afișăm toate ofertele, nu doar cele vizibile
  const visibleBids = sortedBids;
  const hiddenBidsCount = isSeller ? 0 : sortedBids.filter(bid => bid.is_private && bid.user_id !== currentUserId).length;

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4"
      style={{ backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)', backgroundColor: 'rgba(0, 0, 0, 0.5)' }}
      onClick={onClose}
    >
      <div
        className={`rounded-xl sm:rounded-2xl lg:rounded-3xl p-4 sm:p-6 lg:p-8 w-full max-w-2xl lg:max-w-4xl shadow-2xl max-h-[95vh] sm:max-h-[90vh] overflow-y-auto ${
          isDarkMode ? 'bg-gradient-to-br from-gray-800 to-gray-900 border border-gray-700' : 'bg-white border border-gray-200'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex justify-between items-start sm:items-center mb-4 sm:mb-6 pb-3 sm:pb-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex-1 min-w-0 pr-2">
            <h3 className={`text-lg sm:text-xl lg:text-2xl font-bold mb-1 sm:mb-2 ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
              <i className="ri-history-line mr-2 sm:mr-3 text-blue-500"></i>
              Istoric oferte
            </h3>
            <p className={`text-xs sm:text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
              {totalBids > 0 ? `${totalBids} ${totalBids === 1 ? 'ofertă' : 'oferte'} ${hiddenBidsCount > 0 ? `(${hiddenBidsCount} ascunse)` : ''}` : 'Nu există oferte încă'}
            </p>
          </div>
          <button
            onClick={onClose}
            className={`p-2 rounded-full transition-all hover:scale-110 flex-shrink-0 ${
              isDarkMode 
                ? 'text-gray-400 hover:text-white hover:bg-gray-700' 
                : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
            }`}
          >
            <i className="ri-close-line text-xl sm:text-2xl"></i>
          </button>
        </div>

        {loadingBids ? (
          <BidListSkeleton count={5} isDarkMode={isDarkMode} />
        ) : visibleBids.length === 0 ? (
          <div className={`text-center py-12 ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
            <div className={`w-20 h-20 mx-auto mb-4 rounded-full flex items-center justify-center ${
              isDarkMode ? 'bg-gray-700' : 'bg-gray-100'
            }`}>
              <i className="ri-auction-line text-4xl"></i>
            </div>
            <p className="text-lg font-medium mb-2">Nu există oferte încă</p>
            <p className="text-sm">Fii primul care licitează pentru acest produs!</p>
          </div>
        ) : (
          <div className="space-y-3 sm:space-y-4">
            {visibleBids.map((bid, index) => {
              const isWinning = bid.is_winning;
              const isCurrentUser = bid.user_id === currentUserId;
              const isTopBid = index === 0;
              
              return (
                <div
                  key={bid.id}
                  className={`p-4 sm:p-5 rounded-xl border-2 transition-all ${
                    isWinning
                      ? isDarkMode
                        ? 'bg-gradient-to-r from-green-900/30 to-emerald-900/20 border-green-500/50'
                        : 'bg-gradient-to-r from-green-50 to-emerald-50 border-green-400'
                      : isTopBid
                      ? isDarkMode
                        ? 'bg-gradient-to-r from-blue-900/20 to-blue-900/20 border-blue-500/50'
                        : 'bg-gradient-to-r from-blue-50 to-blue-50 border-blue-400'
                      : isCurrentUser
                      ? isDarkMode
                        ? 'bg-gray-700/50 border-gray-600'
                        : 'bg-gray-50 border-gray-300'
                      : isDarkMode
                      ? 'bg-gray-800/50 border-gray-700'
                      : 'bg-white border-gray-200'
                  }`}
                >
                  <div className="flex items-start gap-3 sm:gap-4">
                    {/* Avatar */}
                    <div className="flex-shrink-0">
                      <div className={`w-12 h-12 sm:w-14 sm:h-14 rounded-full flex items-center justify-center text-lg sm:text-xl font-bold ${
                        isDarkMode ? 'bg-gray-700 text-white' : 'bg-gray-200 text-gray-700'
                      }`}>
                        {bid.user_avatar ? (
                          <img 
                            src={bid.user_avatar} 
                            alt={bid.user_name || 'User'} 
                            className="w-full h-full rounded-full object-cover"
                          />
                        ) : (
                          <span>{(bid.user_name || 'U')[0].toUpperCase()}</span>
                        )}
                      </div>
                    </div>

                    {/* Detalii ofertă */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <h4 className={`font-semibold text-base sm:text-lg ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                              {bid.user_name || 'Utilizator anonim'}
                            </h4>
                            {isCurrentUser && (
                              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                                isDarkMode
                                  ? 'bg-blue-600 text-white'
                                  : 'bg-blue-500 text-white'
                              }`}>
                                Tu
                              </span>
                            )}
                            {isWinning && (
                              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                                isDarkMode
                                  ? 'bg-green-600 text-white'
                                  : 'bg-green-500 text-white'
                              }`}>
                                <i className="ri-check-line mr-1"></i>
                                Câștigătoare
                              </span>
                            )}
                            {isTopBid && !isWinning && (
                              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                                isDarkMode
                                  ? 'bg-yellow-600 text-white'
                                  : 'bg-yellow-500 text-white'
                              }`}>
                                <i className="ri-arrow-up-line mr-1"></i>
                                Cea mai mare
                              </span>
                            )}
                          </div>
                          <p className={`text-xs sm:text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                            {formatTimeAgo(bid.created_at)}
                          </p>
                        </div>
                        <div className="text-right flex-shrink-0">
                          {bid.is_private && !isSeller && bid.user_id !== currentUserId ? (
                            <div className="relative group">
                              <div className={`text-xl sm:text-2xl font-bold mb-1 cursor-help ${
                                isDarkMode ? 'text-white' : 'text-gray-900'
                              }`}>
                                ** Lei
                              </div>
                              <p className={`text-xs ${isDarkMode ? 'text-yellow-400' : 'text-yellow-600'}`}>
                                <i className="ri-eye-off-line mr-1"></i>
                                Ascunsă
                              </p>
                              <div className={`absolute bottom-full right-0 mb-2 w-72 p-4 rounded-xl shadow-2xl text-xs z-50 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 pointer-events-none ${
                                isDarkMode 
                                  ? 'bg-gradient-to-br from-gray-700 to-gray-800 text-gray-200 border border-gray-600' 
                                  : 'bg-white text-gray-800 border border-gray-200 shadow-xl'
                              }`}>
                                <div className="font-bold mb-2 text-sm flex items-center gap-2">
                                  <i className="ri-eye-off-line text-blue-500 text-base"></i>
                                  Ofertă privată
                                </div>
                                <p className="text-xs leading-relaxed">
                                  Ofertele pot fi vizibile sau private, în funcție de alegerea ofertantului. Această ofertă a fost setată ca privată de către licitator, astfel încât suma rămâne ascunsă pentru ceilalți participanți. Vânzătorul poate vedea toate ofertele, inclusiv pe cele private.
                                </p>
                                <div className="absolute bottom-0 right-6 transform translate-y-full w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent" 
                                  style={{ borderTopColor: isDarkMode ? '#374151' : '#ffffff' }}
                                ></div>
                              </div>
                            </div>
                          ) : (
                            <>
                              <div className={`text-xl sm:text-2xl font-bold mb-1 ${
                                isDarkMode ? 'text-white' : 'text-gray-900'
                              }`}>
                                {formatPrice(bid.amount)}
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

type Auction = LiveBidAuction;

function normalizeAuctionYearDisplay(raw: unknown): string {
  if (raw == null || raw === '') return '';
  if (typeof raw === 'number' && !Number.isNaN(raw)) return String(Math.floor(raw));
  let str = String(raw).trim();
  str = str.replace(/[.\s]/g, '');
  if (!/^\d+$/.test(str)) {
    const m = str.match(/\d+/);
    str = m ? m[0] : '';
  }
  return str;
}

function buildPieseAutoLocationString(a: Auction): string {
  const cf = (a.customFields ?? {}) as Record<string, unknown>;
  const parts: string[] = [];
  const add = (v: unknown) => {
    if (v == null) return;
    const s = typeof v === 'string' ? v.trim() : String(v).trim();
    if (!s) return;
    if (!parts.some((p) => p.toLowerCase() === s.toLowerCase())) parts.push(s);
  };
  /** Preferă JSONB (import / dashboard); coloanele pot avea default „București”. */
  add(cf.county ?? cf.judet ?? (cf as Record<string, unknown>)['județ'] ?? a.county);
  add(cf.city ?? cf.localitate ?? cf.oras ?? a.city);
  add(cf.village ?? cf.sat ?? a.village);
  if (parts.length) return parts.join(', ');
  const loc =
    (typeof cf.locatie === 'string' && cf.locatie.trim()) ||
    (typeof cf.product_location === 'string' && cf.product_location.trim()) ||
    (typeof a.address === 'string' && a.address.trim()) ||
    (typeof a.location === 'string' && a.location.trim()) ||
    '';
  return loc;
}

interface Bid {
  id: string;
  amount: number;
  bidder: string;
  bidderId: string;
  timestamp: string;
  isWinning: boolean;
  isOutbid: boolean;
}

/** Dezactivat temporar: panelul „Evaluarea prețului…” pe rutele /live_bid. Pune true pentru a-l reactiva. */
const LIVE_BID_PRICE_EVALUATION_ENABLED = false;

/** Markup unic pentru toate zonele — evită divergențe SSR/client la hidratare. */
function PlaceBidOfferCta({
  className,
  onClick,
}: {
  className: string;
  onClick: () => void;
}) {
  return (
    <button type="button" onClick={onClick} className={className}>
      <span className="relative z-0 flex w-full min-w-0 items-center justify-center gap-1 transition-opacity duration-500 group-hover:opacity-0">
        <i className="ri-auction-line shrink-0 text-[1.05rem] opacity-95" aria-hidden="true" />
        <span className="hyphens-auto text-center [overflow-wrap:anywhere]">Plasează o ofertă</span>
      </span>
      <span
        className="pointer-events-none absolute inset-0 z-10 grid w-1/4 place-items-center bg-white/15 not-italic opacity-0 transition-all duration-500 group-hover:w-full group-hover:opacity-100"
        aria-hidden="true"
      >
        <i className="ri-auction-line text-[1.1rem] text-white" aria-hidden="true" />
      </span>
    </button>
  );
}

function FreeListingPriceNotice({ isDarkMode }: { isDarkMode: boolean }) {
  return (
    <div className="mb-3 sm:mb-5 rounded-2xl border border-emerald-400/40 bg-emerald-500/10 px-4 py-3">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white shadow-lg shadow-emerald-500/25">
          <i className="ri-gift-line text-lg" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className={`text-[10px] font-semibold uppercase tracking-[0.18em] ${isDarkMode ? "text-emerald-200" : "text-emerald-700"}`}>
            Produs gratuit
          </p>
          <p className={`text-lg font-extrabold leading-tight sm:text-2xl ${isDarkMode ? "text-emerald-100" : "text-emerald-700"}`}>
            Oferit gratuit
          </p>
        </div>
      </div>
    </div>
  );
}

function FreeListingChatCta({
  className,
  onClick,
  label = "Vorbește pe chat",
}: {
  className: string;
  onClick: () => void;
  label?: string;
}) {
  return (
    <button type="button" onClick={onClick} className={className}>
      <span className="relative z-0 flex w-full min-w-0 items-center justify-center gap-2 transition-opacity duration-500 group-hover:opacity-0">
        <i className="ri-gift-line shrink-0 text-[1.15rem] opacity-95" aria-hidden="true" />
        <span className="hyphens-auto text-center [overflow-wrap:anywhere]">{label}</span>
      </span>
      <span
        className="pointer-events-none absolute inset-0 z-10 grid w-1/4 place-items-center bg-white/15 not-italic opacity-0 transition-all duration-500 group-hover:w-full group-hover:opacity-100"
        aria-hidden="true"
      >
        <i className="ri-gift-line text-[1.2rem] text-white" aria-hidden="true" />
      </span>
    </button>
  );
}

export default function AuctionSinglePage({
  initialProductRow,
  initialResolvedImageUrls,
}: {
  initialProductRow?: Record<string, unknown> | null;
  /** URL-uri imagini calculate pe server — aceleași ca în HTML pentru hidratare corectă. */
  initialResolvedImageUrls?: LiveBidResolvedImageUrls;
}) {
  const params = useParams() || {};
  const router = useRouter();
  const auctionId = (params.slug ?? params["slug"] ?? "") as string;

  const initialRowMatches = Boolean(
    initialProductRow &&
      typeof (initialProductRow as { slug?: string }).slug === "string" &&
      (initialProductRow as { slug: string }).slug === auctionId
  );

  const bidFromPrefetch = (() => {
    if (!initialRowMatches || !initialProductRow) return { inc: 100, amt: 0 };
    const a = mapProductRowToAuction(initialProductRow as Record<string, unknown>);
    const inc = a.bidIncrement || 100;
    return { inc, amt: (a.currentBid || a.startingBid || 0) + inc };
  })();

  const [isDarkMode, setIsDarkMode] = useState(false); // eMAG style - light mode by default
  /** Primul paint SSR + hidratare: același fundal ca serverul; după useLayoutEffect aplicăm tema din localStorage. */
  const [shellThemeSynced, setShellThemeSynced] = useState(false);
  const [auction, setAuction] = useState<Auction | null>(() =>
    initialRowMatches && initialProductRow
      ? mapProductRowToAuction(initialProductRow as Record<string, unknown>)
      : null
  );
  const displayTitle = useMemo(() => {
    const t = auction?.title ?? "";
    return t.replace(/\s*[•\-|]\s*OLX\.ro\s*$/i, "").trim() || t;
  }, [auction?.title]);
  const isFreeListing = useMemo(() => {
    const cf = auction?.customFields as Record<string, unknown> | undefined;
    return cf?.is_free_listing === true || cf?.isFreeListing === true;
  }, [auction?.customFields]);

  /** Link către /ro doar cu categorie. */
  const roCategoryOnlyHref = useMemo(() => {
    if (!auction?.category?.trim()) return "/ro";
    const p = new URLSearchParams();
    p.set("category", auction.category);
    return `/ro?${p.toString()}`;
  }, [auction?.category]);

  /** Link către /ro cu categorie + subcategorie. */
  const roSubcategoryListingHref = useMemo(() => {
    if (!auction?.category?.trim() || !auction?.subcategory?.trim()) return null;
    const p = new URLSearchParams();
    p.set("category", auction.category);
    p.set("subcategory", auction.subcategory);
    return `/ro?${p.toString()}`;
  }, [auction?.category, auction?.subcategory]);

  /** Tip piesă (breadcrumb) — din coloană sau custom_fields */
  const tipPiesaBreadcrumbValue = useMemo(() => {
    if (!auction) return "";
    const cf = auction.customFields as Record<string, unknown> | undefined;
    return String(
      auction.category_level_3 ??
        cf?.tipPiesa ??
        cf?.tip_piesa ??
        cf?.Tip_piesa ??
        cf?.category_level_3 ??
        ""
    ).trim();
  }, [auction]);

  /** Link /ro cu categorie + subcategorie + level3 (tip piesă) */
  const roTipPiesaListingHref = useMemo(() => {
    if (!auction?.category?.trim() || !tipPiesaBreadcrumbValue) return null;
    const p = new URLSearchParams();
    p.set("category", auction.category);
    if (auction.subcategory?.trim()) p.set("subcategory", auction.subcategory);
    p.set("level3", tipPiesaBreadcrumbValue);
    return `/ro?${p.toString()}`;
  }, [auction?.category, auction?.subcategory, tipPiesaBreadcrumbValue]);

  const [productRealId, setProductRealId] = useState<string | null>(() => {
    if (initialRowMatches && initialProductRow && (initialProductRow as { id?: string }).id) {
      return String((initialProductRow as { id: string }).id);
    }
    return null;
  }); // ID-ul real (UUID) al produsului din baza de date
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [isFavorite, setIsFavorite] = useState(false);
  const [timeLeft, setTimeLeft] = useState({ days: 0, hours: 0, minutes: 0, seconds: 0 });
  const [isAuctionEnded, setIsAuctionEnded] = useState(false);
  const [isLoadingAuction, setIsLoadingAuction] = useState(() => !initialRowMatches);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isSharing, setIsSharing] = useState(false);
  const [showShareMenu, setShowShareMenu] = useState(false);
  const [showImageGallery, setShowImageGallery] = useState(false);
  const [isDescriptionExpanded, setIsDescriptionExpanded] = useState(false);
  const [isSpecificationsExpanded, setIsSpecificationsExpanded] = useState(false);
  const [recommendedAuctions, setRecommendedAuctions] = useState<Auction[]>([]);
  const recommendedSliderRef = useRef<HTMLDivElement>(null);
  const [recommendedSlideIndex, setRecommendedSlideIndex] = useState(0);
  const [userProducts, setUserProducts] = useState<Auction[]>([]);
  const userProductsSliderRef = useRef<HTMLDivElement>(null);
  const [userProductsSlideIndex, setUserProductsSlideIndex] = useState(0);
  const [sliderVisibleCount, setSliderVisibleCount] = useState(2); // 2 pe mobil, 5 pe desktop
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
  const [currentBidAmount, setCurrentBidAmount] = useState(bidFromPrefetch.amt);
  /** La focus: cifre fără separatori (editare); la blur: 1.000 format RO */
  const [bidAmountInputFocused, setBidAmountInputFocused] = useState(false);
  const bidAmountInputRef = useRef<HTMLInputElement>(null);
  const bidAmountFitWrapRef = useRef<HTMLDivElement>(null);
  const [bidAmountFontPx, setBidAmountFontPx] = useState(48);
  const [bidIncrement, setBidIncrement] = useState(bidFromPrefetch.inc);
  const [isBidding, setIsBidding] = useState(false);
  const [showBidModal, setShowBidModal] = useState(false);
  const [isPrivateBid, setIsPrivateBid] = useState(false);
  const [showPrivateBidTooltip, setShowPrivateBidTooltip] = useState(false);
  const privateBidTooltipRef = useRef<HTMLDivElement>(null);
  const [tooltipPosition, setTooltipPosition] = useState({ top: 0, left: 0 });
  const [showRandomBidTooltip, setShowRandomBidTooltip] = useState(false);
  const randomBidTooltipRef = useRef<HTMLDivElement>(null);
  const [randomTooltipPosition, setRandomTooltipPosition] = useState({ top: 0, left: 0 });
  const [isBidHistoryExpanded, setIsBidHistoryExpanded] = useState(false);
  const [showEurTooltip, setShowEurTooltip] = useState(false);
  const eurTooltipRef = useRef<HTMLDivElement>(null);
  const [eurTooltipPosition, setEurTooltipPosition] = useState({ top: 0, left: 0 });
  const [showAuctionEndedModal, setShowAuctionEndedModal] = useState(false);
  const [showOwnerBidErrorModal, setShowOwnerBidErrorModal] = useState(false);
  const [productUserId, setProductUserId] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [bids, setBids] = useState<Bid[]>([]);
  const [hasAcceptedBid, setHasAcceptedBid] = useState(false);
  const [userBids, setUserBids] = useState<any[]>([]);
  const [showUserBidsPanel, setShowUserBidsPanel] = useState(false);
  const [loadingUserBids, setLoadingUserBids] = useState(false);
  const [allBids, setAllBids] = useState<any[]>([]);
  const [showBidHistory, setShowBidHistory] = useState(false);
  const [loadingAllBids, setLoadingAllBids] = useState(false);
  const [userInfo, setUserInfo] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    avatar: ''
  });
  const [sellerInfo, setSellerInfo] = useState<{
    name: string;
    avatar: string;
    rating: number;
    reviewCount: number;
    positivePercentage: number;
    lastSeen?: string;
    followerCount?: number;
    followingCount?: number;
    phone?: string;
  } | null>(null);
  const [message, setMessage] = useState({ type: '', text: '' });
  const [showChatModal, setShowChatModal] = useState(false);
  const [chatData, setChatData] = useState<{
    productId: string;
    buyerId: string;
    sellerId: string;
    otherUserInfo: { name: string; avatar?: string };
  } | null>(null);
  const [phoneContactChoice, setPhoneContactChoice] = useState<{
    open: boolean;
    tel: string;
    waDigits: string;
    listingUrl: string;
  }>({ open: false, tel: "", waDigits: "", listingUrl: "" });
  /** Pe desktop: primul click pe „Sună” arată numărul; copiere din clipboard, fără tel:. */
  const [phoneCallRevealedDesktop, setPhoneCallRevealedDesktop] = useState(false);
  const [phoneCopiedDesktop, setPhoneCopiedDesktop] = useState(false);
  const [showMessageAuthModal, setShowMessageAuthModal] = useState(false);
  const [showBidAuthModal, setShowBidAuthModal] = useState(false);

  const openPhoneContactChoice = useCallback((rawPhone: string) => {
    const norm = normalizeSellerPhoneForContact(rawPhone);
    if (!norm) return;
    setPhoneContactChoice({
      open: true,
      tel: norm.tel,
      waDigits: norm.waDigits,
      listingUrl: typeof window !== "undefined" ? window.location.href : "",
    });
  }, []);

  const closePhoneContactChoice = useCallback(() => {
    setPhoneContactChoice((s) => ({ ...s, open: false }));
  }, []);

  /** Mesaj către vânzător: cere autentificare într-un modal dacă nu ești logat. */
  const openMessageChatOrAuthModal = useCallback(() => {
    if (!currentUserId) {
      setShowMessageAuthModal(true);
      return;
    }
    if (!auction?.id || !productUserId) return;
    router.push(`/dashboard/ofertele_mele?productId=${auction.id}&sellerId=${productUserId}`);
  }, [currentUserId, auction?.id, productUserId, router]);

  const goToAuthFromMessageModal = useCallback(() => {
    setShowMessageAuthModal(false);
    const redirect =
      typeof window !== "undefined"
        ? `${window.location.pathname}${window.location.search || ""}`
        : "/";
    router.push(`/auth?redirect=${encodeURIComponent(redirect)}`);
  }, [router]);

  const goToAuthFromBidModal = useCallback(() => {
    setShowBidAuthModal(false);
    setShowBidModal(false);
    const redirect =
      typeof window !== "undefined"
        ? `${window.location.pathname}${window.location.search || ""}`
        : "/";
    router.push(`/auth?redirect=${encodeURIComponent(redirect)}`);
  }, [router]);

  /** Aliniat cu /ro: localStorage + clasa dark pe document.documentElement. */
  useLayoutEffect(() => {
    if (typeof window === "undefined") return;
    const saved = localStorage.getItem("darkMode");
    if (saved !== null) {
      setIsDarkMode(saved === "true");
    } else {
      setIsDarkMode(document.documentElement.classList.contains("dark"));
    }
    setShellThemeSynced(true);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (isDarkMode) {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  }, [isDarkMode]);

  const toggleDarkMode = useCallback(() => {
    setIsDarkMode((prev) => {
      const next = !prev;
      if (typeof window !== "undefined") {
        localStorage.setItem("darkMode", String(next));
      }
      return next;
    });
  }, []);

  const shellClassName = useMemo(() => {
    if (!shellThemeSynced) return "min-h-screen bg-gray-50";
    return `min-h-screen ${isDarkMode ? "bg-gray-950" : "bg-gray-50"}`;
  }, [shellThemeSynced, isDarkMode]);

  useEffect(() => {
    if (phoneContactChoice.open) {
      setPhoneCallRevealedDesktop(false);
      setPhoneCopiedDesktop(false);
    }
  }, [phoneContactChoice.open]);

  const copyDesktopPhoneNumber = useCallback(async () => {
    const t = phoneContactChoice.tel;
    if (!t) return;
    try {
      await navigator.clipboard.writeText(t);
      setPhoneCopiedDesktop(true);
      window.setTimeout(() => setPhoneCopiedDesktop(false), 2200);
    } catch {
      setPhoneCopiedDesktop(false);
    }
  }, [phoneContactChoice.tel]);

  const fitBidAmountInputFont = useCallback(() => {
    const input = bidAmountInputRef.current;
    if (!input || !showBidModal) return;
    const w = input.clientWidth;
    if (w < 8) return;
    const maxPx = Math.min(118, Math.max(46, w * 0.42));
    const px = fitBidInputFontToWidth(input, maxPx, 13);
    setBidAmountFontPx(px);
  }, [showBidModal, currentBidAmount, bidAmountInputFocused]);

  useLayoutEffect(() => {
    if (!showBidModal) return;
    const input = bidAmountInputRef.current;
    const wrap = bidAmountFitWrapRef.current;
    if (!input) return;
    const run = () => fitBidAmountInputFont();
    run();
    let innerRaf = 0;
    const outerRaf = requestAnimationFrame(() => {
      innerRaf = requestAnimationFrame(() => run());
    });
    const ro = new ResizeObserver(() => run());
    if (wrap) ro.observe(wrap);
    ro.observe(input);
    return () => {
      cancelAnimationFrame(outerRaf);
      cancelAnimationFrame(innerRaf);
      ro.disconnect();
    };
  }, [fitBidAmountInputFont, showBidModal]);

  // Detect mobile on mount and resize
  useEffect(() => {
    const checkMobile = () => {
      const mobile = typeof window !== 'undefined' && window.innerWidth < 768;
      setIsMobile(mobile);
      setSliderVisibleCount(mobile ? 2 : 5);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

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

  const cdn = useMemo(() => productImageCdn(auction?.imageVersionAt ?? null), [auction?.imageVersionAt]);

  const isHydrated = useIsHydrated();
  const liveBidThumbSrc = useCallback(
    (img: string, idx: number) =>
      isHydrated
        ? (initialResolvedImageUrls?.thumb[idx] ?? cdn.thumb(img))
        : stablePublicImageSrcForHydration(img),
    [isHydrated, initialResolvedImageUrls, cdn]
  );
  const liveBidHeroSrc = useCallback(
    (img: string, idx: number) =>
      isHydrated
        ? (initialResolvedImageUrls?.hero[idx] ?? cdn.hero(img))
        : stablePublicImageSrcForHydration(img),
    [isHydrated, initialResolvedImageUrls, cdn]
  );

  /** R2/404 sau răspuns invalid: înlocuim cu placeholder-ul standard (evită titlul din `alt` pe fundal gri). */
  const [failedLiveBidThumbIdx, setFailedLiveBidThumbIdx] = useState<Record<number, boolean>>({});
  const [failedLiveBidHeroIdx, setFailedLiveBidHeroIdx] = useState<Record<number, boolean>>({});

  useEffect(() => {
    setFailedLiveBidThumbIdx({});
    setFailedLiveBidHeroIdx({});
  }, [auction?.id]);

  const liveBidThumbDisplaySrc = useCallback(
    (img: string, idx: number) =>
      failedLiveBidThumbIdx[idx] ? CDN_IMAGE_FALLBACK_SRC : liveBidThumbSrc(img, idx),
    [failedLiveBidThumbIdx, liveBidThumbSrc],
  );
  const liveBidHeroDisplaySrc = useCallback(
    (img: string, idx: number) =>
      failedLiveBidHeroIdx[idx] ? CDN_IMAGE_FALLBACK_SRC : liveBidHeroSrc(img, idx),
    [failedLiveBidHeroIdx, liveBidHeroSrc],
  );

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

  const startCountdown = useCallback((auctionDate?: string) => {
    if (!auctionDate) {
      // Nu setăm isAuctionEnded = true dacă nu există dată - poate fi Live Bid cu dată nelimitată
      // setIsAuctionEnded(true);
      return () => {};
    }

    const updateTimer = () => {
      const calculated = calculateTimeLeft(auctionDate);
      
      if (calculated.totalSeconds <= 0) {
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
    return () => clearInterval(interval);
  }, [calculateTimeLeft]);

  // Memoized product for evaluation - only recalculates when auction data changes
  const productForEvaluation = useMemo((): ProductForEvaluation | null => {
    if (!LIVE_BID_PRICE_EVALUATION_ENABLED) return null;
    if (!auction) {
      console.log('[LicitatiiPublice] No auction, productForEvaluation is null');
      return null;
    }

    // Map category to ProductCategory
    const categoryMap: Record<string, ProductCategory> = {
      'autoturisme': 'auto',
      'autovehicule': 'auto',
      'suv': 'auto',
      'motociclete': 'auto',
      'scutere': 'auto',
      'apartamente': 'apartment',
      'apartament': 'apartment',
      'exec-imobiliare': 'apartment',
      'exec-autovehicule': 'auto',
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
      if (auction.customFields?.an) attributes.year = auction.customFields.an;
    }
    
    // For land
    if (productCategory === 'land') {
      if (auction.customFields?.suprafata) attributes.surface = auction.customFields.suprafata;
    }

    // Extract city and area
    const city = String(
      (typeof auction.customFields?.city === "string" ? auction.customFields.city : "") ||
        auction.address?.split(",")[0]?.trim() ||
        auction.location?.split(",")[0]?.trim() ||
        "",
    );

    const product = {
      id: auction.id,
      title: auction.title,
      description: auction.description,
      category: productCategory,
      price: auction.currentBid || auction.startingBid,
      currency: 'RON',
      city: city,
      country: 'România',
      attributes: {
        ...attributes,
        productType: 'live-bid', // Marchează că este Live Bid
      },
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
    let countdownCleanup: (() => void) | null = null;

    const loadAuction = async () => {
      const prefetchMatchesSlug =
        initialProductRow &&
        typeof (initialProductRow as { slug?: string }).slug === "string" &&
        (initialProductRow as { slug: string }).slug === auctionId;

      if (!prefetchMatchesSlug) {
        setIsLoadingAuction(true);
      }
      setLoadError(null);

      try {
        if (!auctionId || auctionId.trim() === '') {
          setLoadError('Slug-ul produsului lipsește din URL.');
          setIsLoadingAuction(false);
          return;
        }

        let productRow: any = null;

        console.log('🔍 [LoadAuction] Searching for product with slug:', auctionId);

        if (
          prefetchMatchesSlug &&
          initialProductRow &&
          (initialProductRow as { product_type?: string }).product_type === "live-bid"
        ) {
          productRow = initialProductRow;
          const { data: { session }, error: sessionCheckError } = await supabase.auth.getSession();
          const currentUserIdValue = session?.user?.id || null;
          setCurrentUserId(currentUserIdValue);
          console.log('🔍 [LoadAuction] Session check (prefetch path):', {
            hasSession: !!session,
            userId: currentUserIdValue,
            sessionError: sessionCheckError,
          });
        } else {
        const [{ data: { session }, error: sessionCheckError }, activeRes] = await Promise.all([
          supabase.auth.getSession(),
          runSupabaseQueryWithRetry(() =>
            supabase
              .from('products')
              .select('*')
              .eq('slug', auctionId)
              .eq('product_type', 'live-bid')
              .in('status', ['active', 'reserved', 'sold'])
              .maybeSingle()
          ),
        ]);
        const currentUserIdValue = session?.user?.id || null;
        setCurrentUserId(currentUserIdValue);

        console.log('🔍 [LoadAuction] Session check:', {
          hasSession: !!session,
          userId: currentUserIdValue,
          sessionError: sessionCheckError,
        });

        let { data: slugProduct, error: slugError } = activeRes;

        console.log('🔍 [LoadAuction] Active product query result:', {
          hasProduct: !!slugProduct,
          productId: slugProduct?.id,
          productSlug: slugProduct?.slug,
          productType: slugProduct?.product_type,
          productStatus: slugProduct?.status,
          productUserId: slugProduct?.user_id,
          currentUserId: currentUserIdValue,
          isOwner: slugProduct?.user_id === currentUserIdValue,
          error: slugError,
          errorCode: slugError?.code,
          errorMessage: slugError?.message
        });

        // Dacă nu găsește produsul 'active' și utilizatorul este autentificat,
        // verifică dacă este proprietar și produsul este 'draft'
        if (!slugProduct && !slugError && currentUserIdValue) {
          console.log('🔍 [LoadAuction] Active product not found, checking draft for owner...');
          const { data: draftProduct, error: draftError } = await runSupabaseQueryWithRetry(() =>
            supabase
              .from('products')
              .select('*')
              .eq('slug', auctionId)
              .eq('product_type', 'live-bid')
              .eq('status', 'draft')
              .eq('user_id', currentUserIdValue)
              .maybeSingle()
          );

          console.log('🔍 [LoadAuction] Draft product query result:', {
            hasProduct: !!draftProduct,
            productId: draftProduct?.id,
            productStatus: draftProduct?.status,
            error: draftError
          });
          
          if (draftProduct) {
            slugProduct = draftProduct;
            slugError = draftError;
            console.log('✅ [LoadAuction] Found draft product for owner');
          }
        }

        console.log('🔍 [LoadAuction] Query result:', {
          hasProduct: !!slugProduct,
          productId: slugProduct?.id,
          productSlug: slugProduct?.slug,
          productType: slugProduct?.product_type,
          productStatus: slugProduct?.status,
          error: slugError,
          errorCode: slugError?.code,
          errorMessage: slugError?.message,
          errorDetails: slugError
        });

        if (slugError) {
          const errorObj = slugError as Record<string, unknown>;
          const errorCode = typeof errorObj.code === 'string' ? errorObj.code : '';
          const errorMessage = typeof errorObj.message === 'string' ? errorObj.message.trim() : '';
          const errorDetails = errorObj.details;
          const errorHint = typeof errorObj.hint === 'string' ? errorObj.hint.trim() : '';
          const hasOwnKeys = Object.keys(errorObj).length > 0;
          const hasDetails =
            errorDetails !== undefined &&
            errorDetails !== null &&
            ((typeof errorDetails === 'string' && errorDetails.trim() !== '') ||
              (typeof errorDetails === 'object' &&
                Object.keys(errorDetails as Record<string, unknown>).length > 0));
          const hasUsefulProperties = errorCode !== '' || errorMessage !== '' || hasDetails || errorHint !== '';
          const isBenignNoRows = errorCode === 'PGRST116';
          const isBenignEmptyObject = !hasOwnKeys || !hasUsefulProperties;
          const isTransientAfterRetries = isTransientSupabaseError(slugError);

          if (!isBenignNoRows && !isBenignEmptyObject && !isTransientAfterRetries) {
            console.error('❌ [LoadAuction] Error loading product:', slugError);
            console.error('❌ [LoadAuction] Error details:', {
              code: errorCode,
              message: errorMessage,
              details: errorDetails,
              hint: errorHint
            });
          } else if (isTransientAfterRetries) {
            console.warn('[LoadAuction] Transient Supabase error after retries:', {
              code: errorCode,
              message: errorMessage,
            });
          }
        }
        if (slugProduct && slugProduct.product_type === 'live-bid') {
          productRow = slugProduct;
          console.log('✅ [LoadAuction] Product found and is live-bid:', productRow.id);
        } else if (slugProduct && slugProduct.product_type !== 'live-bid') {
          console.warn('⚠️ [LoadAuction] Product found but wrong type:', {
            foundType: slugProduct.product_type,
            expectedType: 'live-bid'
          });
          // Redirect către ruta corectă în funcție de product_type
          const productTypeRoutes: Record<string, string> = {
            'licitatii-publice': 'licitatii-publice',
            'buy-now': 'produs',
            'details-only': 'produs',
          };
          const correctRoute = productTypeRoutes[slugProduct.product_type] || 'produs';
          router.replace(`/${correctRoute}/${slugProduct.slug}`);
          return;
        } else {
          console.warn('⚠️ [LoadAuction] Product not found for slug:', auctionId);
          // Fallback: dacă auctionId arată ca UUID, caută după id (ex. link de pe homepage)
          const looksLikeUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(auctionId);
          if (looksLikeUuid) {
            const { data: idProduct, error: idError } = await runSupabaseQueryWithRetry(() =>
              supabase
                .from('products')
                .select('*')
                .eq('id', auctionId)
                .in('status', ['active', 'reserved', 'sold'])
                .maybeSingle()
            );
            if (!idError && idProduct) {
              productRow = idProduct;
              console.log('✅ [LoadAuction] Product found by id:', productRow.id);
            }
          }
        }
        }

        if (cancelled) return;

        if (!productRow) {
          setAuction(null);
          setLoadError('Anunțul nu a fost găsit.');
          setIsLoadingAuction(false);
          return;
        }

        const auctionToUse = mapProductRowToAuction(productRow);
        console.log('🔍 [LoadAuction] Loaded product:', { 
          id: productRow.id, 
          slug: productRow.slug, 
          product_type: productRow.product_type,
          status: productRow.status,
          user_id: productRow.user_id,
          auctionId: auctionToUse.id,
          auctionSlug: auctionToUse.slug
        });
        setAuction(auctionToUse);
        setProductUserId(productRow.user_id || null);

        // Track product view pentru istoricul produselor vizionate
        if (typeof window !== 'undefined') {
          try {
            const images = Array.isArray(productRow.images) ? productRow.images : (productRow.images ? [productRow.images] : []);
            const firstImage = images.length > 0 ? (typeof images[0] === 'string' ? images[0] : images[0]?.url || '') : '';
            trackRecentlyViewed({
              id: productRow.id,
              title: productRow.title || 'Produs',
              image: firstImage || undefined,
              price: productRow.starting_price || productRow.starting_price_ron || undefined,
              currency: productRow.currency || 'RON',
              slug: productRow.slug || undefined,
              url: auctionToUse.slug ? `/live_bid/${auctionToUse.slug}` : undefined,
            });
          } catch (error) {
            console.error('Error tracking recently viewed product:', error);
          }
        }
        
        // Salvează ID-ul real al produsului pentru a-l folosi la licitație
        if (productRow.id) {
          const productIdString = String(productRow.id);
          setProductRealId(productIdString);
          console.log('✅ [LoadAuction] Saved productRealId:', productIdString, 'Type:', typeof productIdString);
          console.log('✅ [LoadAuction] productRealId is UUID?', /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(productIdString));
          
          // Verifică dacă există o ofertă acceptată pentru acest produs
          try {
            const { data: acceptedBidData } = await supabase
              .from('bids')
              .select('id')
              .eq('product_id', productIdString)
              .eq('is_winning', true)
              .maybeSingle();
            
            setHasAcceptedBid(!!acceptedBidData);
            console.log('🔍 [LoadAuction] Has accepted bid:', !!acceptedBidData);
          } catch (error) {
            console.error('Error checking accepted bid:', error);
            setHasAcceptedBid(false);
          }
        } else {
          console.error('❌ [LoadAuction] productRow.id is missing!', productRow);
          setProductRealId(null);
          setHasAcceptedBid(false);
        }
        
        // Pentru Live Bid cu dată nelimitată, nu pornim countdown-ul
        const hasNoExpiration = auctionToUse.customFields?.has_no_expiration === true || 
                                 auctionToUse.customFields?.hasNoExpiration === true;
        const isLiveBid = productRow?.product_type === 'live-bid';
        // Pentru Live Bid, acceptăm statusurile: active, reserved, draft
        const isAcceptableStatus = ['active', 'reserved', 'draft'].includes(productRow?.status || '');
        
        // Verifică dacă produsul are dată de expirare în viitor
        const hasValidFutureDate = auctionToUse.auctionDate && 
          new Date(auctionToUse.auctionDate).getTime() > Date.now();
        
        // Pentru Live Bid cu status acceptabil: fie are has_no_expiration setat, fie nu are dată validă în viitor
        // În ambele cazuri, tratăm ca fiind nelimitat
        if (isLiveBid && isAcceptableStatus && (hasNoExpiration || !hasValidFutureDate)) {
          // Live Bid cu dată nelimitată sau fără dată validă - licitația nu expiră
          setIsAuctionEnded(false);
          setTimeLeft({ days: 0, hours: 0, minutes: 0, seconds: 0 });
          console.log('🔓 Live Bid activ fără expirare:', {
            slug: auctionToUse.slug,
            hasNoExpiration,
            hasValidFutureDate,
            auctionDate: auctionToUse.auctionDate,
            status: productRow?.status,
            isAcceptableStatus,
            isAuctionEnded: false
          });
        } else if (hasValidFutureDate) {
          // Are dată validă în viitor - pornește countdown-ul
          console.log('⏰ Live Bid cu countdown:', {
            slug: auctionToUse.slug,
            auctionDate: auctionToUse.auctionDate
          });
          countdownCleanup = startCountdown(auctionToUse.auctionDate);
        } else {
          // Nu are dată validă și nu este Live Bid activ - marchează ca expirat
          console.log('❌ Auction marked as ended:', {
            slug: auctionToUse.slug,
            isLiveBid,
            isAcceptableStatus,
            hasValidFutureDate,
            status: productRow?.status
          });
          setIsAuctionEnded(true);
          setTimeLeft({ days: 0, hours: 0, minutes: 0, seconds: 0 });
        }

        const incrementFast = auctionToUse.bidIncrement || 100;
        const currentBidFast = auctionToUse.currentBid || auctionToUse.startingBid || 0;
        setBidIncrement(incrementFast);
        setCurrentBidAmount(currentBidFast + incrementFast);

        if (!cancelled) {
          setIsLoadingAuction(false);
        }

        void (async () => {
          if (cancelled) return;
          try {
            const focalUrls = collectHttpProductImageUrls(productRow.images);
            if (focalUrls.length > 0) {
              const focalByUrl = await fetchImageFocalByUrls(focalUrls);
              if (cancelled) return;
              if (Object.keys(focalByUrl).length > 0) {
                setAuction((prev) =>
                  prev && prev.id === auctionToUse.id
                    ? {
                        ...prev,
                        image_focal_by_url: {
                          ...(prev.image_focal_by_url ?? {}),
                          ...focalByUrl,
                        },
                      }
                    : prev,
                );
              }
            }
          } catch (focalErr) {
            console.error('[LoadAuction] focal fetch', focalErr);
          }

          // Încarcă informațiile despre vânzător (nume, avatar, rating)
          if (productRow.user_id) {
            try {
              const uid = productRow.user_id;
              const [sellerProfileRes, reviewsRes, verificationResponse] = await Promise.all([
                supabase
                  .from('user_profiles')
                  .select('first_name, last_name, avatar_url, phone, metadata, company_name')
                  .eq('user_id', uid)
                  .maybeSingle(),
                supabase.from('user_reviews').select('rating').eq('reviewed_user_id', uid),
                fetch(`/api/user/verification/${uid}`),
              ]);
              const sellerProfile = sellerProfileRes.data;
              const reviewsData = reviewsRes.data;

              let sellerName = 'Vânzător';
              let sellerAvatar = '';
              let sellerRating = 0;
              let reviewCount = 0;
              let positivePercentage = 0;
              let lastSeen = '';
              let followerCount = 0;
              let followingCount = 0;

              const meta = (sellerProfile as any)?.metadata as Record<string, unknown> | undefined;
              const afisareCu = meta?.anunturi_afisare_cu === 'username' ? 'username' : 'nume';
              const afiseazaTelefon = meta?.anunturi_afiseaza_telefon !== false;
              if (sellerProfile) {
                const sellAsCompanyPiese =
                  meta?.piese_auto_sell_as_company === true || meta?.piese_auto_sell_as_company === 'true';
                const companyNm = String((sellerProfile as any).company_name || '').trim();
                if (sellAsCompanyPiese && companyNm) {
                  sellerName = companyNm;
                } else if (afisareCu === 'username' && meta?.username && typeof meta.username === 'string') {
                  sellerName = String(meta.username);
                } else {
                  sellerName = (sellerProfile as any).first_name && (sellerProfile as any).last_name
                    ? `${(sellerProfile as any).first_name} ${(sellerProfile as any).last_name}`.trim()
                    : ((sellerProfile as any).first_name || (sellerProfile as any).last_name || sellerName);
                }
                sellerAvatar = (sellerProfile as any).avatar_url || '';
              }

              if (reviewsData && reviewsData.length > 0) {
                const avgRating =
                  reviewsData.reduce(
                    (sum: number, r: { rating?: number | null }) => sum + (r.rating || 0),
                    0,
                  ) / reviewsData.length;
                sellerRating = Math.round(avgRating * 10) / 10;
                reviewCount = reviewsData.length;
                const positiveReviews = reviewsData.filter(
                  (r: { rating?: number | null }) => (r.rating || 0) >= 4,
                ).length;
                positivePercentage = Math.round((positiveReviews / reviewCount) * 100);
              }

              if (verificationResponse.ok) {
                const verificationData = await verificationResponse.json();

                if (verificationData.followersCount !== undefined) {
                  followerCount = verificationData.followersCount;
                }
                if (verificationData.followingCount !== undefined) {
                  followingCount = verificationData.followingCount;
                }

                if (verificationData.lastSignInAt) {
                  const lastSignInAt = new Date(verificationData.lastSignInAt);
                  const now = new Date();
                  const diffMs = now.getTime() - lastSignInAt.getTime();
                  const diffMins = Math.floor(diffMs / 60000);
                  const diffHours = Math.floor(diffMs / 3600000);
                  const diffDays = Math.floor(diffMs / 86400000);

                  if (diffMins < 1) {
                    lastSeen = 'acum';
                  } else if (diffMins < 60) {
                    lastSeen = `acum ${diffMins} ${diffMins === 1 ? 'minut' : 'minute'}`;
                  } else if (diffHours < 24) {
                    lastSeen = `acum ${diffHours} ${diffHours === 1 ? 'oră' : 'ore'}`;
                  } else if (diffDays === 1) {
                    lastSeen = 'ieri';
                  } else if (diffDays < 7) {
                    lastSeen = `acum ${diffDays} ${diffDays === 1 ? 'zi' : 'zile'}`;
                  } else {
                    lastSeen = lastSignInAt.toLocaleDateString('ro-RO', {
                      day: '2-digit',
                      month: '2-digit',
                      year: 'numeric',
                    });
                  }
                } else {
                  lastSeen = 'acum câteva ore';
                }
              }

              if (cancelled) return;
              setSellerInfo({
                name: sellerName,
                avatar: sellerAvatar,
                rating: sellerRating,
                reviewCount: reviewCount,
                positivePercentage: positivePercentage,
                lastSeen: lastSeen,
                followerCount: followerCount,
                followingCount: followingCount,
                phone: afiseazaTelefon ? ((sellerProfile as any)?.phone || '') : '',
              });
              console.log('✅ [LoadAuction] Seller info loaded:', {
                name: sellerName,
                hasAvatar: !!sellerAvatar,
                rating: sellerRating,
                userId: productRow.user_id,
              });
            } catch (error) {
              console.error('❌ [LoadAuction] Error loading seller info:', error);
              if (!cancelled) {
                setSellerInfo({
                  name: 'Vânzător',
                  avatar: '',
                  rating: 0,
                  reviewCount: 0,
                  positivePercentage: 0,
                  lastSeen: 'acum câteva ore',
                  followerCount: 0,
                  followingCount: 0,
                  phone: '',
                });
              }
            }
          } else {
            console.log('⚠️ [LoadAuction] No user_id found in productRow');
            if (!cancelled) setSellerInfo(null);
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
        const executorDataFromCustomFields = {
          licitatorName: customFields.licitator_name || 
            customFields.licitatorName || 
            customFields.Licitator_name || 
            customFields['Licitator name'] ||
            customFields['Nume licitator'] ||
            customFields.executor_name ||
            customFields.executorName ||
            undefined,
          licitatorAddress: customFields.licitator_address || 
            customFields.licitatorAddress || 
            customFields.Licitator_address || 
            customFields['Licitator address'] ||
            customFields['Adresă licitator'] ||
            customFields.executor_address ||
            undefined,
          licitatorFiscalCode: customFields.licitator_fiscal_code || 
            customFields.licitatorFiscalCode || 
            customFields.Licitator_fiscal_code || 
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
            undefined,
          licitatorEmail: customFields.licitator_email || 
            customFields.licitatorEmail || 
            customFields.Licitator_email || 
            customFields['Licitator email'] ||
            customFields['Email licitator'] ||
            customFields.executor_email ||
            undefined,
          licitatorPhone: customFields.licitator_phone || 
            customFields.licitatorPhone || 
            customFields.Licitator_phone || 
            customFields['Licitator phone'] ||
            customFields['Telefon licitator'] ||
            customFields.executor_phone ||
            undefined,
          licitatorFax: customFields.licitator_fax || 
            customFields.licitatorFax || 
            customFields.Licitator_fax || 
            customFields['Licitator fax'] ||
            customFields['Fax licitator'] ||
            undefined,
          licitatorCompetence: customFields.licitator_competence || 
            customFields.licitatorCompetence || 
            customFields.Licitator_competence || 
            customFields['Licitator competence'] ||
            customFields['Competență licitator'] ||
            customFields.competenta ||
            undefined,
          licitatorAvatar: customFields.avatar_url ||
            customFields.avatarUrl ||
            customFields.avatar ||
            undefined,
        };
        
        const hasCustomFieldsData = Object.values(executorDataFromCustomFields).some(val => val !== undefined && val !== null && val !== '');
        
        console.log('[LicitatiiPublice] Executor data from custom_fields:', {
          executorDataFromCustomFields,
          hasCustomFieldsData,
          avatarUrl: executorDataFromCustomFields.licitatorAvatar,
          customFieldsKeys: Object.keys(customFields),
          customFieldsAvatar: customFields.avatar_url || customFields.avatarUrl || customFields.avatar
        });
        
        // Dacă există date în custom_fields, le folosim direct (publice)
        // Dar dacă avatar-ul lipsește din custom_fields, îl luăm din user_profiles dacă există
        if (hasCustomFieldsData) {
          // Dacă avatar-ul lipsește din custom_fields, încercăm să îl luăm din user_profiles
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
                
                // Sync avatar to custom_fields for future use
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
        } else if (productRow.user_id) {
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
            licitatorName: customFields.licitator_name || customFields.licitatorName || customFields.Licitator_name || customFields['Licitator name'] || undefined,
            licitatorAddress: customFields.licitator_address || customFields.licitatorAddress || customFields.Licitator_address || customFields['Licitator address'] || undefined,
            licitatorFiscalCode: customFields.licitator_fiscal_code || customFields.licitatorFiscalCode || customFields.Licitator_fiscal_code || customFields['Licitator fiscal code'] || customFields.CUI || customFields.cui || undefined,
            licitatorConsignmentAccount: customFields.licitator_consignment_account || customFields.licitatorConsignmentAccount || customFields.Licitator_consignment_account || customFields['Licitator consignment account'] || customFields['Cont consignatie'] || undefined,
            licitatorEmail: customFields.licitator_email || customFields.licitatorEmail || customFields.Licitator_email || customFields['Licitator email'] || undefined,
            licitatorPhone: customFields.licitator_phone || customFields.licitatorPhone || customFields.Licitator_phone || customFields['Licitator phone'] || undefined,
            licitatorFax: customFields.licitator_fax || customFields.licitatorFax || customFields.Licitator_fax || customFields['Licitator fax'] || undefined,
            licitatorCompetence: customFields.licitator_competence || customFields.licitatorCompetence || customFields.Licitator_competence || customFields['Licitator competence'] || undefined,
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

        // Fallback public: dacă încă nu avem date și există user_id, solicită profilul prin endpoint cu service role
        if (!executorDataAlreadySet && productRow.user_id) {
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

        // Încărcăm recomandări cu același "Tip produs"
        try {
          const tipProdusCurent =
            productRow?.custom_fields?.Tip_produs ||
            productRow?.custom_fields?.tip_produs ||
            productRow?.category ||
            null;

          if (tipProdusCurent) {
            const { data: recData, error: recError } = await supabase
              .from('products')
              .select('*')
              .eq('product_type', productRow.product_type)
              .neq('id', productRow.id)
              .neq('status', 'deleted')
              .limit(24);

            if (recError && recError.code !== 'PGRST116') {
              console.error('Error loading recommended auctions:', recError);
              setRecommendedAuctions([]);
            } else if (recData && Array.isArray(recData)) {
              const sameTip = recData
                .filter((row: any) => {
                  const rowTip =
                    row?.custom_fields?.Tip_produs ||
                    row?.custom_fields?.tip_produs ||
                    row?.category ||
                    null;
                  return rowTip && rowTip === tipProdusCurent;
                })
                .slice(0, 8);

              setRecommendedAuctions(sameTip.map(mapProductRowToAuction));
            } else {
              setRecommendedAuctions([]);
            }
          } else {
            setRecommendedAuctions([]);
          }
        } catch (recError) {
          console.error('Error loading recommended auctions:', recError);
          setRecommendedAuctions([]);
        }

        // Încărcăm produsele userului dacă are mai multe
        try {
          if (productRow.user_id) {
            const { data: userProductsData, error: userProductsError } = await supabase
              .from('products')
              .select('*')
              .eq('user_id', productRow.user_id)
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
        })().catch((err) => console.error('[LoadAuction] secondary', err));
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
      if (countdownCleanup) {
        countdownCleanup();
      }
    };
  }, [auctionId, startCountdown, initialProductRow]);

  // Funcție pentru încărcarea ofertelor utilizatorului curent
  const loadUserBids = useCallback(async () => {
    if (!productRealId || !currentUserId) {
      console.log('🔍 [LoadUserBids] Missing required data:', {
        productRealId,
        currentUserId,
        hasProductRealId: !!productRealId,
        hasCurrentUserId: !!currentUserId
      });
      return;
    }
    
    console.log('🔍 [LoadUserBids] Loading bids for:', {
      productRealId,
      currentUserId,
      productRealIdType: typeof productRealId,
      currentUserIdType: typeof currentUserId
    });
    
    // Validare UUID
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(productRealId) || !uuidRegex.test(currentUserId)) {
      console.error('❌ [LoadUserBids] Invalid UUID format:', {
        productRealId,
        currentUserId,
        productRealIdValid: uuidRegex.test(productRealId),
        currentUserIdValid: uuidRegex.test(currentUserId)
      });
      setUserBids([]);
      setLoadingUserBids(false);
      return;
    }
    
    setLoadingUserBids(true);
    try {
      // Simplificăm query-ul - fără join pentru a evita problemele cu RLS
      const { data: bidsData, error: bidsError } = await supabase
        .from('bids')
        .select('id, amount, created_at, is_winning, is_outbid, user_id, is_private')
        .eq('product_id', productRealId)
        .eq('user_id', currentUserId)
        .order('amount', { ascending: false })
        .order('created_at', { ascending: false });

      console.log('🔍 [LoadUserBids] Query result:', {
        hasData: !!bidsData,
        dataLength: bidsData?.length || 0,
        hasError: !!bidsError,
        errorCode: bidsError?.code,
        errorMessage: bidsError?.message,
        errorDetails: bidsError?.details,
        errorHint: bidsError?.hint,
        productRealId,
        currentUserId,
        productRealIdType: typeof productRealId,
        currentUserIdType: typeof currentUserId
      });

      if (bidsError) {
        // Verifică dacă eroarea este goală sau are proprietăți reale
        const errorKeys = Object.keys(bidsError);
        const hasRealError = errorKeys.length > 0 && (
          bidsError.code || 
          bidsError.message || 
          bidsError.details || 
          bidsError.hint
        );

        // Nu logăm erori goale sau erori normale (PGRST116 = no rows found, PGRST205 = table not found)
        if (hasRealError) {
          const errorCode = String(bidsError.code || '').trim();
          if (errorCode !== 'PGRST116' && errorCode !== 'PGRST205') {
            console.error('Error loading user bids:', {
              code: bidsError.code,
              message: bidsError.message,
              details: bidsError.details,
              hint: bidsError.hint
            });
          }
        }
        // Dacă eroarea este goală sau este PGRST116 (no rows), continuăm normal
        // PGRST116 înseamnă că nu există oferte, ceea ce este normal
        if (bidsError.code === 'PGRST116' || !hasRealError) {
          setUserBids([]);
          return;
        }
        // Pentru alte erori, setăm lista goală
        setUserBids([]);
        return;
      }

      if (bidsData && bidsData.length > 0) {
        console.log('✅ [LoadUserBids] Loaded bids:', bidsData.length);
        setUserBids(bidsData);
          } else {
        console.log('ℹ️ [LoadUserBids] No bids found for this user and product');
        setUserBids([]);
      }
    } catch (error: any) {
      console.error('❌ [LoadUserBids] Exception:', error);
      setUserBids([]);
    } finally {
      setLoadingUserBids(false);
    }
  }, [productRealId, currentUserId]);

  // Încarcă ofertele utilizatorului când se deschide panelul
  useEffect(() => {
    if (showUserBidsPanel && productRealId && currentUserId) {
      loadUserBids();
    }
  }, [showUserBidsPanel, productRealId, currentUserId, loadUserBids]);

  // La deschidere: suma = prețul din anunț (Lei); utilizatorul o poate schimba liber
  useEffect(() => {
    if (showBidModal && auction) {
      const p = getAuctionListingPriceRON(auction);
      setCurrentBidAmount(p > 0 ? p : 1);
      setIsPrivateBid(false);
    }
  }, [showBidModal, auction]);

  useEffect(() => {
    if (!showBidModal) setBidAmountInputFocused(false);
  }, [showBidModal]);

  useEffect(() => {
    if (!showBidModal) setShowBidAuthModal(false);
  }, [showBidModal]);

  /** Mobil în browser: ascunde meniul footer (nav jos din header); rămân cele 3 butoane. În PWA instalată meniul rămâne. */
  useEffect(() => {
    if (typeof window === "undefined") return;
    const isStandalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
    if (isStandalone) return;
    document.documentElement.classList.add("gobid-live-bid-hide-mobile-footer");
    return () => {
      document.documentElement.classList.remove("gobid-live-bid-hide-mobile-footer");
    };
  }, []);

  // Funcție pentru încărcarea tuturor ofertelor cu detalii utilizator
  const loadAllBids = useCallback(async () => {
    if (!productRealId) {
      return;
    }

    setLoadingAllBids(true);
    try {
      // Încarcă toate ofertele pentru acest produs
      const { data: bidsData, error: bidsError } = await supabase
        .from('bids')
        .select('id, amount, created_at, is_winning, is_outbid, user_id, is_private')
        .eq('product_id', productRealId)
        .order('amount', { ascending: false })
        .order('created_at', { ascending: false });

      if (bidsError) {
        console.error('Error loading all bids:', bidsError);
        setAllBids([]);
        return;
      }

      if (bidsData && bidsData.length > 0) {
        // Obține toate user_id-urile unice
        const userIds = [...new Set(bidsData.map((bid: any) => bid.user_id).filter(Boolean))];
        
        // Încarcă profilurile utilizatorilor
        let userProfilesMap: Record<string, any> = {};
        if (userIds.length > 0) {
          const { data: profilesData } = await supabase
            .from('user_profiles')
            .select('user_id, first_name, last_name, avatar_url')
            .in('user_id', userIds);
          
          if (profilesData) {
            profilesData.forEach((profile: any) => {
              userProfilesMap[profile.user_id] = profile;
            });
          }
        }

        // Transformă datele pentru a include nume și avatar
        const bidsWithUserInfo = bidsData.map((bid: any) => {
          const profile = userProfilesMap[bid.user_id];
          return {
            ...bid,
            user_name: profile 
              ? `${profile.first_name || ''} ${profile.last_name || ''}`.trim() || 'Utilizator anonim'
              : 'Utilizator anonim',
            user_avatar: profile?.avatar_url || null,
          };
        });
        setAllBids(bidsWithUserInfo);
      } else {
        setAllBids([]);
      }
    } catch (error) {
      console.error('Exception loading all bids:', error);
      setAllBids([]);
    } finally {
      setLoadingAllBids(false);
    }
  }, [productRealId]);

  // Încarcă ofertele când se deschide panelul sau când se încarcă produsul
  useEffect(() => {
    if (productRealId) {
      loadAllBids();
    }
  }, [productRealId, loadAllBids]);

  // Verifică periodic dacă o ofertă a fost acceptată
  useEffect(() => {
    if (!productRealId) return;

    const checkAcceptedBid = async () => {
      try {
        const { data: acceptedBidData } = await supabase
          .from('bids')
          .select('id')
          .eq('product_id', productRealId)
          .eq('is_winning', true)
          .maybeSingle();
        
        setHasAcceptedBid(!!acceptedBidData);
      } catch (error) {
        console.error('Error checking accepted bid:', error);
      }
    };

    // Verifică imediat
    checkAcceptedBid();

    // Verifică la fiecare 10 secunde
    const interval = setInterval(checkAcceptedBid, 10000);

    return () => clearInterval(interval);
  }, [productRealId]);

  // Modal „Licitatia s-a încheiat” dezactivat la cererea utilizatorului
  // useEffect(() => {
  //   if (isAuctionEnded && auction) {
  //     setShowAuctionEndedModal(true);
  //   }
  // }, [isAuctionEnded, auction]);

  // Încarcă produsele vizitate recent din localStorage (exclude produsul curent)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const raw = localStorage.getItem('recentlyViewedProducts');
      if (!raw) {
        setRecentlyViewedProducts([]);
        return;
      }
      const list: Array<{ id: string; title?: string; image?: string | string[]; price?: number; slug?: string; url?: string; viewedAt: number; location?: string }> = JSON.parse(raw);
      const currentId = auction?.id || productRealId || '';
      const filtered = list.filter((p) => p.id !== currentId);
      const sorted = [...filtered].sort((a, b) => (b.viewedAt || 0) - (a.viewedAt || 0));
      const mapped = sorted.slice(0, 10).map((p) => {
        const img = Array.isArray(p.image) ? (p.image[0] || '') : (p.image || '');
        return {
          id: p.id,
          title: p.title || 'Produs',
          image: typeof img === 'string' ? img : '',
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
  }, [auction?.id, productRealId]);

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

  // Handler pentru "Cumpară acum" (reutilizat în bara plutitoare pe mobil)
  const handleBuyNow = async () => {
    const currentPrice = auction?.currentBid || auction?.startingBid || auction?.startingBidRON || 0;
    if (!currentUserId) {
      router.push('/auth');
      return;
    }
    if (!currentPrice || currentPrice <= 0) {
      alert('Prețul produsului nu este disponibil');
      return;
    }
    if (!auction?.id) {
      alert('ID-ul produsului nu este disponibil');
      return;
    }
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) {
        router.push('/auth');
        return;
      }
      const response = await fetch('/api/bids', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${sessionData.session.access_token}`
        },
        body: JSON.stringify({ product_id: auction.id, amount: currentPrice })
      });
      if (response.ok) {
        const result = await response.json();
        const bidId = (result as { bid?: { id?: string } })?.bid?.id;
        const { trackGoogleConversion } = await import("@/lib/analytics/googleAds");
        trackGoogleConversion("bid_created", bidId ? { dedupeKey: bidId } : undefined);
        setMessage({ type: 'success', text: 'Achiziție confirmată! Ai 5 minute pentru a te răzgândi. Deschid chatul...' });
        loadUserBids();
        setTimeout(() => router.push(`/dashboard/ofertele_mele?openProduct=${auction?.id}`), 2000);
      } else {
        const error = await response.json();
        alert(error.error || 'Eroare la plasarea ofertei');
      }
    } catch (error) {
      alert('Eroare la plasarea ofertei: ' + (error instanceof Error ? error.message : String(error)));
    }
  };

  // Handler pentru "Plasează o ofertă" (deschide modalul)
  const handlePlaceBidOpen = () => {
    if (auction) {
      const p = getAuctionListingPriceRON(auction);
      setCurrentBidAmount(p > 0 ? p : 1);
    }
    setShowBidModal(true);
  };

  const shareAuction = async (platform?: string) => {
    if (typeof window === 'undefined' || !auction) {
      return;
    }

    const url = window.location.href;
    const title = ((auction.title ?? "").replace(/\s*[•\-|]\s*OLX\.ro\s*$/i, "").trim()) || (auction.title ?? "");
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

  const handleQuickBid = async (amount: number) => {
    if (!auction || loadError) {
      setMessage({ type: 'error', text: loadError || 'Produsul nu este disponibil pentru licitație.' });
      setTimeout(() => setMessage({ type: '', text: '' }), 3000);
      return;
    }

    // Verifică dacă utilizatorul este autentificat și dacă este proprietarul produsului
    const { data: { session } } = await supabase.auth.getSession();
    const userId = session?.user?.id;
    
    if (userId && productUserId && userId === productUserId) {
      // Utilizatorul încearcă să liciteze la propriul produs
      setShowOwnerBidErrorModal(true);
      return;
    }

    setCurrentBidAmount(amount);
    setShowBidModal(true);
  };

  const handleBid = async () => {
    console.log('🎯 [HandleBid] START - Placing bid...');
    console.log('📊 [HandleBid] State check:', {
      hasAuction: !!auction,
      auctionId: auction?.id,
      auctionSlug: auction?.slug,
      isAuctionEnded,
      currentBidAmount,
      productRealId
    });
    
    if (!auction || isAuctionEnded) {
      console.log('❌ [HandleBid] BLOCKED: auction missing or ended', { 
        auction: !!auction, 
        isAuctionEnded,
        auctionId: auction?.id 
      });
      setMessage({ type: 'error', text: 'Produsul nu este disponibil pentru licitație.' });
      setTimeout(() => setMessage({ type: '', text: '' }), 3000);
      return;
    }
    
    console.log('✅ [HandleBid] Checks passed, proceeding with bid...');
    
    // Verifică dacă există eroare de încărcare
    if (loadError) {
      setMessage({ type: 'error', text: loadError });
      setTimeout(() => setMessage({ type: '', text: '' }), 3000);
      return;
    }
    
    // Validare: Oferta minimă trebuie să fie cel puțin 33,3% din prețul cerut + 1 leu
    if (!currentBidAmount || currentBidAmount <= 0) {
      setMessage({ type: 'error', text: 'Te rugăm să introduci o sumă validă pentru ofertă (mai mare decât 0).' });
      setTimeout(() => setMessage({ type: '', text: '' }), 3000);
      return;
    }
    
    // Calculează oferta minimă (33,3% din prețul cerut + 1 leu)
    const currentPrice = auction.currentBid || auction.startingBid || auction.startingBidRON || 0;
    const minimumBidAmount = Math.ceil(currentPrice * (1/3)) + 1; // 33,3% din prețul cerut + 1 leu, rotunjit în sus
    
    if (currentPrice > 0 && currentBidAmount < minimumBidAmount) {
      setMessage({ 
        type: 'error', 
        text: `Oferta minimă este ${minimumBidAmount} Lei (33,3% din prețul cerut de ${currentPrice} Lei + 1 leu).` 
      });
      setTimeout(() => setMessage({ type: '', text: '' }), 5000);
      return;
    }
    
    // Notă: Ofertele sub prețul cerut sunt valide și pot fi acceptate de vânzător,
    // dar vor fi ascunse public (doar vânzătorul le va vedea)
    
    setIsBidding(true);
    
    try {
      // Obține sesiunea utilizatorului
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      
      if (sessionError || !session) {
        setShowBidAuthModal(true);
        return;
      }

      // Obține ID-ul produsului - folosește ID-ul real salvat
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      let productId: string | null = null;
      
      console.log('🔍 Checking productRealId:', productRealId);
      console.log('🔍 auction.id:', auction.id);
      console.log('🔍 auction.slug:', auction.slug);
      
      // Prioritate 1: Folosește productRealId dacă este disponibil și valid
      if (productRealId && uuidRegex.test(productRealId)) {
        productId = productRealId;
        console.log('✅ Using productRealId (valid UUID):', productId);
      } 
      // Prioritate 2: Folosește auction.id dacă este UUID valid
      else if (auction.id && uuidRegex.test(auction.id)) {
        productId = auction.id;
        console.log('✅ Using auction.id (valid UUID):', productId);
        // Salvează-l în productRealId pentru următoarele licitații
        setProductRealId(productId);
      }
      // Prioritate 3: Caută după slug
      else {
        console.log('⚠️ [HandleBid] No valid UUID found, searching by slug...');
        const searchSlug = auction.slug || auctionId;
        console.log('🔍 [HandleBid] Searching for slug:', searchSlug);
        console.log('🔍 [HandleBid] auction.slug:', auction.slug);
        console.log('🔍 [HandleBid] auctionId from params:', auctionId);
        console.log('🔍 [HandleBid] Final searchSlug:', searchSlug);
        
        if (!searchSlug || searchSlug.trim() === '') {
          console.error('❌ [HandleBid] No slug available for search');
          throw new Error('ID-ul produsului nu este valid. Te rugăm să reîmprospătezi pagina.');
        }
        
        // Caută produsul după slug - folosește supabase normal (nu admin) pentru căutare
        // Dacă eșuează, vom trimite slug-ul direct la API care va căuta cu supabaseAdmin
        try {
          console.log('🔍 [HandleBid] Querying Supabase for slug:', searchSlug);
          const { data: productData, error: productError } = await supabase
            .from('products')
            .select('id, slug, product_type, status')
            .eq('slug', searchSlug)
            .eq('product_type', 'live-bid')
            .neq('status', 'deleted')
            .maybeSingle();
          
          console.log('🔍 [HandleBid] Product search result:', { 
            productData, 
            productError,
            searchedSlug: searchSlug,
            foundId: productData?.id,
            foundSlug: productData?.slug,
            slugMatch: productData?.slug === searchSlug,
            errorCode: productError?.code,
            errorMessage: productError?.message,
            errorDetails: productError
          });
          
          if (productData && productData.id) {
            productId = productData.id;
            console.log('✅ [HandleBid] Found product by slug, updating productRealId:', productId);
            setProductRealId(productId);
          } else {
            // Produsul nu a fost găsit în frontend, dar API-ul va încerca să-l găsească
            console.log('⚠️ [HandleBid] Product not found in frontend, will use slug in API call');
            console.log('⚠️ [HandleBid] Slug to send to API:', searchSlug);
            productId = searchSlug;
          }
        } catch (searchError: any) {
          // Dacă există o eroare la căutare, folosește slug-ul direct
          console.warn('⚠️ [HandleBid] Error searching product in frontend:', searchError);
          console.log('⚠️ [HandleBid] Will use slug directly in API call:', searchSlug);
          productId = searchSlug;
        }
      }

      // Validare finală - dacă nu avem UUID, folosim slug-ul direct (API-ul va căuta)
      if (!productId) {
        console.error('❌ No productId available');
        throw new Error('ID-ul produsului nu este valid. Te rugăm să reîmprospătezi pagina.');
      }
      
      console.log('✅ Final productId to send:', productId, 'Is UUID?', uuidRegex.test(productId));
      console.log('✅ ProductId type:', typeof productId);
      console.log('✅ ProductId is UUID?', /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(productId));

      const bidPayload = {
        product_id: productId,
        amount: currentBidAmount,
        is_private: isPrivateBid,
      };
      console.log('📤 [HandleBid] Sending bid request:', bidPayload);
      console.log('📤 [HandleBid] Full payload:', JSON.stringify(bidPayload, null, 2));
      console.log('📤 [HandleBid] Product ID info:', {
        productId,
        isUUID: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(productId),
        productRealId,
        auctionId: auction?.id,
        auctionSlug: auction?.slug
      });

      // Trimite oferta la API
      const response = await fetch('/api/bids', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify(bidPayload),
      });

      console.log('📥 Response status:', response.status);

      const result = await response.json();
      console.log('📥 [HandleBid] Response data:', result);
      console.log('✅ [HandleBid] Response OK?', response.ok);

      if (!response.ok) {
        // Dacă eroarea conține informații despre oferta minimă, afișează-le
        if (result.minimumBidAmount && result.startingPrice) {
          throw new Error(result.error || `Oferta minimă este ${result.minimumBidAmount} Lei (33,3% din prețul cerut de ${result.startingPrice} Lei).`);
        }
        throw new Error(result.error || 'Eroare la plasarea ofertei');
      }

      const bidId = result.bid?.id;
      const { trackGoogleConversion } = await import("@/lib/analytics/googleAds");
      trackGoogleConversion("bid_created", bidId ? { dedupeKey: bidId } : undefined);

      // Adaugă oferta nouă în listă
    const newBid: Bid = {
        id: bidId || Date.now().toString(),
      amount: currentBidAmount,
        bidder: `${userInfo.firstName || ''} ${userInfo.lastName || ''}`.trim() || 'Utilizator',
        bidderId: session.user.id,
      timestamp: new Date().toISOString(),
      isWinning: true,
      isOutbid: false
    };
    
    setBids(prev => [newBid, ...prev.map(bid => ({ ...bid, isWinning: false, isOutbid: true }))]);
    
    if (auction) {
        // Actualizează currentBid doar dacă oferta este mai mare decât prețul curent
        const currentMaxBid = auction.currentBid || auction.startingBid || 0;
        const newCurrentBid = currentBidAmount > currentMaxBid ? currentBidAmount : currentMaxBid;
        
        setAuction(prev => prev ? { 
          ...prev, 
          currentBid: newCurrentBid, 
          bidCount: (prev.bidCount || 0) + 1 
        } : null);
        setCurrentBidAmount(prev => prev + (auction.bidIncrement || bidIncrement || 100));
      }
      
      // Reîncarcă ofertele utilizatorului după ce a plasat o ofertă
      if (productRealId && currentUserId) {
        loadUserBids();
      }
      
    setShowBidModal(false);
      setMessage({ type: 'success', text: result.message || 'Oferta GoBid a fost plasată cu succes! Deschid chatul...' });
      
      console.log('✅ [HandleBid] Bid placed successfully, preparing redirect...');
      console.log('📦 [HandleBid] Product ID for URL:', auction?.id || productRealId);
      
      // Redirecționează către pagina "Ofertele mele" după 2.5 secunde pentru a da timp conversației să se creeze
      setTimeout(() => {
        const productIdForUrl = auction?.id || productRealId;
        console.log('🔄 [HandleBid] Redirecting to ofertele_mele with product:', productIdForUrl);
        if (productIdForUrl) {
          // Adaugă un timestamp pentru a forța refresh-ul conversațiilor
          const redirectUrl = `/dashboard/ofertele_mele?openProduct=${productIdForUrl}&t=${Date.now()}`;
          console.log('🔄 [HandleBid] Redirect URL:', redirectUrl);
          router.push(redirectUrl);
        } else {
          console.log('⚠️ [HandleBid] No product ID, redirecting to base ofertele_mele');
          router.push('/dashboard/ofertele_mele');
        }
      }, 2500);
    } catch (error: any) {
      console.error('❌ Error placing bid:', error);
      let errorMessage = error.message || 'Eroare la plasarea ofertei. Te rugăm să încerci din nou.';
      
      // Mesaje de eroare mai clare pentru utilizator
      if (errorMessage.includes('Produsul nu a fost găsit') || errorMessage.includes('nu a fost găsit')) {
        errorMessage = 'Produsul nu a fost găsit. Te rugăm să reîmprospătezi pagina sau să verifici link-ul.';
        // Închide modalul dacă produsul nu există
        setShowBidModal(false);
      } else if (errorMessage.includes('Neautorizat')) {
        setShowBidAuthModal(true);
        return;
      }
      
      setMessage({ type: 'error', text: errorMessage });
      setTimeout(() => setMessage({ type: '', text: '' }), 5000);
      // Nu închide modalul dacă este o eroare, pentru ca utilizatorul să poată încerca din nou
    } finally {
      setIsBidding(false);
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

  if (isLoadingAuction) {
    return (
      <div className={shellClassName}>
        <UniversalHeader isDarkMode={isDarkMode} onToggleDarkMode={toggleDarkMode} />
        <AuctionDetailsSkeleton contentOnly />
      </div>
    );
  }

  // Error state
  if (!auction || loadError) {
    return (
      <div className={shellClassName}>
        <UniversalHeader isDarkMode={isDarkMode} onToggleDarkMode={toggleDarkMode} />
        <div className="flex items-center justify-center min-h-[70vh] px-4">
          <div className="text-center max-w-md">
            <div className="text-6xl mb-6">😕</div>
            <h2
              className={`text-2xl font-bold mb-3 ${
                !shellThemeSynced ? "text-gray-900" : isDarkMode ? "text-white" : "text-gray-900"
              }`}
            >
              {loadError || 'Anunțul nu a fost găsit'}
            </h2>
              <button
              onClick={() => router.push('/live_bid')}
              className="mt-6 px-8 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold transition"
              >
                Înapoi la licitații
              </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`${shellClassName} ${isAuctionEnded && auction ? "overflow-hidden" : ""}`}
    >
      <UniversalHeader isDarkMode={isDarkMode} onToggleDarkMode={toggleDarkMode} />
      {/* Rail-uri laterale lungi (desktop only) */}
      <SinglepageParteaStanga />
      <SinglepageParteaDreapta />
      
      {/* Overlay pentru licitație încheiată - peste tot conținutul */}
      {auction && isAuctionEnded && showAuctionEndedModal && (
        <div 
          className="fixed inset-0 z-[9999] flex items-center justify-center p-4" 
          style={{ backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)', backgroundColor: 'rgba(0, 0, 0, 0.1)' }}
          onClick={() => setShowAuctionEndedModal(false)}
        >
          <div 
            className={`relative rounded-2xl p-8 max-w-md w-full border shadow-2xl ${
              isDarkMode 
                ? 'bg-gray-800/95 border-gray-700' 
                : 'bg-gray-50 border-gray-200'
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Buton de închidere */}
            <button
              onClick={() => setShowAuctionEndedModal(false)}
              className={`absolute top-4 right-4 p-2 rounded-full transition-colors ${
                isDarkMode 
                  ? 'hover:bg-gray-700 text-gray-300 hover:text-white' 
                  : 'hover:bg-gray-100 text-gray-500 hover:text-gray-700'
              }`}
              aria-label="Închide"
            >
              <CloseIcon size="m" />
            </button>
            
            <div className="text-center">
              {/* Iconița roșie cu linie orizontală */}
              <div className="flex justify-center mb-4">
                <div className="w-12 h-12 rounded-full bg-red-500 flex items-center justify-center">
                  <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </div>
              </div>
              
              {/* Text "Licitatia s-a încheiat" - roșu bold */}
              <h2 className={`text-2xl font-bold mb-3 ${
                isDarkMode ? 'text-red-400' : 'text-red-600'
              }`}>
                Licitatia s-a încheiat
              </h2>
              
              {/* Text "Oferta finală" - gri */}
              <p className={`text-base ${
                isDarkMode ? 'text-gray-300' : 'text-gray-700'
              }`}>
                Oferta finală: <span className="font-semibold">{(auction?.currentBid || auction?.startingBid || 0).toLocaleString('ro-RO')} Lei</span>
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Breadcrumb - blurat când licitația s-a încheiat */}
      <div className={`max-w-7xl mx-auto px-4 py-4 md:py-6 pb-24 md:pb-6 transition-all duration-300 ${
        isAuctionEnded && auction && showAuctionEndedModal ? 'blur-sm pointer-events-none select-none' : ''
      }`} style={isAuctionEnded && auction && showAuctionEndedModal ? { filter: 'blur(4px)' } : {}}>
        {/* Înapoi + Breadcrumb (stânga) · Distribuie + Favorite (dreapta) — același rând pe mobil */}
        <div className="mb-4 flex flex-nowrap flex-row items-center justify-between gap-2 sm:gap-4">
          <div className="flex min-w-0 flex-1 flex-nowrap flex-row items-center gap-2 sm:gap-4">
            <BackButton
              label="Înapoi"
              fallbackHref="/ro"
              roListingReturnListingId={
                auction?.id
                  ? String(auction.id)
                  : productRealId
                    ? String(productRealId)
                    : undefined
              }
              className="shrink-0 shadow-md"
            />
            {auction && (
              <Breadcrumb
                className={cn(
                  "hidden min-w-0 flex-1 overflow-hidden text-sm transition-colors lg:block",
                  /* Contrast breadcrumb pe fundal pagină (doar desktop) */
                  isDarkMode
                    ? "text-gray-300 [&_a[data-slot=breadcrumb-link]:hover]:text-white [&_[data-slot=breadcrumb-page]]:text-gray-100 [&_[data-slot=breadcrumb-separator]]:opacity-80"
                    : "text-gray-700 [&_a[data-slot=breadcrumb-link]:hover]:text-gray-900 [&_[data-slot=breadcrumb-page]]:text-gray-900 [&_[data-slot=breadcrumb-separator]]:opacity-70"
                )}
              >
                <BreadcrumbList>
                  <BreadcrumbItem>
                    <BreadcrumbLink href="/ro">Licitații</BreadcrumbLink>
                  </BreadcrumbItem>
                  {auction.category?.trim() ? (
                    <>
                      <BreadcrumbSeparator />
                      <BreadcrumbItem className="max-w-[min(42vw,11rem)] sm:max-w-xs">
                        <BreadcrumbLink
                          href={roCategoryOnlyHref}
                          className="block truncate"
                          title={auction.category}
                        >
                          {auction.category}
                        </BreadcrumbLink>
                      </BreadcrumbItem>
                    </>
                  ) : null}
                  {auction.subcategory?.trim() && roSubcategoryListingHref ? (
                    <>
                      <BreadcrumbSeparator />
                      <BreadcrumbItem className="max-w-[min(42vw,11rem)] sm:max-w-xs">
                        <BreadcrumbLink
                          href={roSubcategoryListingHref}
                          className="block truncate"
                          title={auction.subcategory}
                        >
                          {auction.subcategory}
                        </BreadcrumbLink>
                      </BreadcrumbItem>
                    </>
                  ) : null}
                  {tipPiesaBreadcrumbValue ? (
                    <>
                      <BreadcrumbSeparator />
                      <BreadcrumbItem className="min-w-0 max-w-[min(52vw,14rem)] sm:max-w-md">
                        {roTipPiesaListingHref ? (
                          <BreadcrumbLink
                            href={roTipPiesaListingHref}
                            className="block truncate"
                            title={tipPiesaBreadcrumbValue}
                          >
                            {tipPiesaBreadcrumbValue}
                          </BreadcrumbLink>
                        ) : (
                          <span
                            className="block truncate font-medium text-inherit"
                            title={tipPiesaBreadcrumbValue}
                          >
                            {tipPiesaBreadcrumbValue}
                          </span>
                        )}
                      </BreadcrumbItem>
                    </>
                  ) : null}
                  <BreadcrumbSeparator />
                  <BreadcrumbItem className="min-w-0 max-w-full flex-1 sm:max-w-none">
                    <BreadcrumbPage
                      className="block min-w-0 truncate text-left"
                      title={displayTitle}
                    >
                      {displayTitle}
                    </BreadcrumbPage>
                  </BreadcrumbItem>
                </BreadcrumbList>
              </Breadcrumb>
            )}
          </div>
          {/* Share + Favorite - vizibile pe mobil și desktop */}
          <div className="flex shrink-0 items-center gap-1 sm:gap-3">
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowShareMenu(!showShareMenu)}
                className={`flex items-center space-x-1.5 px-2 py-1.5 text-xs transition sm:space-x-2 sm:px-4 sm:py-2 sm:text-sm ${
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
                  <div
                    className="fixed inset-0 z-40"
                    onClick={() => setShowShareMenu(false)}
                    aria-hidden
                  />
                  <div
                    className="pointer-events-none fixed left-0 right-0 top-0 z-50 flex justify-center px-3 pt-[max(5.25rem,calc(env(safe-area-inset-top,0px)+4.25rem))] md:pointer-events-auto md:absolute md:left-auto md:right-0 md:top-full md:mt-2 md:block md:p-0 md:pt-0"
                  >
                    <div className="pointer-events-auto">
                      <AuctionShareMenuPanel
                        isDarkMode={isDarkMode}
                        showNativeShare={
                          typeof window !== "undefined" && typeof (navigator as Navigator & { share?: unknown }).share === "function"
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
              className={`flex items-center space-x-1.5 px-2 py-1.5 text-xs transition sm:space-x-2 sm:px-4 sm:py-2 sm:text-sm ${
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
        <div className={`grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-8 transition-all duration-300 ${
          isAuctionEnded && auction && showAuctionEndedModal ? 'blur-sm pointer-events-none select-none' : ''
        }`} style={isAuctionEnded && auction && showAuctionEndedModal ? { filter: 'blur(4px)' } : {}}>
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
                            resolvedFullSrc={initialResolvedImageUrls?.hero[idx]}
                            variant="hero"
                            updatedAt={auction?.imageVersionAt}
                            focal={getFocalForImageUrl(auction, img)}
                            alt={`Imagine ${idx + 1} din ${auction.images.length}`}
                            priority={idx === 0}
                            loading={idx === 0 ? undefined : "lazy"}
                            imgClassName="object-cover"
                          />
                        </div>
                      ))}
                      
                      {/* Badge diagonal VÂNDUT / REZERVAT - Mobile */}
                      {(auction?.status === 'sold' || auction?.status === 'reserved') && (
                        <div className="pointer-events-none absolute inset-0 flex items-center justify-center z-30">
                          <div
                            className={`absolute left-1/2 top-1/2 transform -translate-x-1/2 -translate-y-1/2 -rotate-45 w-[175%] text-center px-4 py-1.5 border-[6px] rounded-sm uppercase tracking-widest font-black leading-none text-xl ${
                              auction?.status === 'sold'
                                ? 'border-emerald-600 text-emerald-600 bg-transparent'
                                : 'border-amber-500 text-amber-600 bg-transparent'
                            }`}
                          >
                            {auction?.status === 'sold' ? 'VÂNDUT' : 'REZERVAT'}
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
                                  src={liveBidThumbDisplaySrc(img, idx)}
                                  alt={`Miniatură ${idx + 1}`}
                                  fill
                                  unoptimized
                                  className="object-cover"
                                  loading="lazy"
                                  style={{
                                    opacity: currentImageIndex === idx ? 1 : 0.6
                                  }}
                                  suppressHydrationWarning
                                  onError={() =>
                                    setFailedLiveBidThumbIdx((m) => (m[idx] ? m : { ...m, [idx]: true }))
                                  }
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
                          resolvedFullSrc={initialResolvedImageUrls?.hero[currentImageIndex]}
                          variant="hero"
                          updatedAt={auction?.imageVersionAt}
                          focal={getFocalForImageUrl(auction, auction.images[currentImageIndex])}
                          alt={`Imagine ${currentImageIndex + 1} din ${auction.images.length}`}
                          priority={currentImageIndex === 0}
                          loading={currentImageIndex === 0 ? undefined : "lazy"}
                          imgClassName="object-cover"
                        />
                      )}
                      {/* Badge diagonal VÂNDUT / REZERVAT */}
                      {(auction?.status === 'sold' || auction?.status === 'reserved') && (
                        <div className="pointer-events-none absolute inset-0 flex items-center justify-center z-10">
                          <div
                            className={`absolute left-1/2 top-1/2 transform -translate-x-1/2 -translate-y-1/2 -rotate-45 w-[175%] text-center px-6 py-2 md:px-10 md:py-3 border-[8px] md:border-[10px] rounded-sm uppercase tracking-widest font-black leading-none text-2xl md:text-5xl ${
                              auction?.status === 'sold'
                                ? 'border-emerald-600 text-emerald-600 bg-transparent'
                                : 'border-amber-500 text-amber-600 bg-transparent'
                            }`}
                          >
                            {auction?.status === 'sold' ? 'VÂNDUT' : 'REZERVAT'}
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
                        src={liveBidThumbDisplaySrc(img, idx)}
                        alt={`Miniatură ${idx + 1}`}
                        fill
                        unoptimized
                        className="object-cover"
                        loading="lazy"
                        suppressHydrationWarning
                        onError={() =>
                          setFailedLiveBidThumbIdx((m) => (m[idx] ? m : { ...m, [idx]: true }))
                        }
                      />
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Title Section — un singur rând, ellipsis dacă e prea lung */}
            <div className="min-w-0">
              <h1
                className={`text-xl md:text-2xl font-normal leading-tight mb-3 truncate ${
                  isDarkMode ? 'text-white' : 'text-gray-900'
                }`}
                title={displayTitle}
              >
                {displayTitle}
              </h1>
            </div>

            {/* Seller Profile - Mobile Only - eBay Style */}
            {sellerInfo && productUserId && (
              <div className="lg:hidden mb-4">
                <div className={`p-3 rounded-lg border transition-all ${
                  isDarkMode 
                    ? 'bg-gray-800 border-gray-700 hover:border-gray-600' 
                    : 'bg-white border-gray-200 hover:border-gray-300'
                }`}>
                  <div className="flex items-center gap-3">
                    {/* Avatar */}
                    <div className="relative flex-shrink-0">
                      {sellerInfo.avatar ? (
                        <img 
                          src={sellerInfo.avatar} 
                          alt={sellerInfo.name}
                          className="w-12 h-12 rounded-full object-cover"
                        />
                      ) : (
                        <div className={`w-12 h-12 rounded-full flex items-center justify-center ${
                          isDarkMode ? 'bg-gray-700' : 'bg-gray-200'
                        }`}>
                          <i className={`ri-user-line text-xl ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}></i>
                        </div>
                      )}
                    </div>
                    
                    {/* Seller Info */}
                    <Link
                      href={`/user/${productUserId}`}
                      className="flex-1 min-w-0"
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`text-sm font-semibold truncate ${
                          isDarkMode ? 'text-white' : 'text-gray-900'
                        }`}>
                          {sellerInfo.name}
                        </span>
                        {sellerInfo.reviewCount > 0 && (
                          <span className={`text-xs ${
                            isDarkMode ? 'text-gray-400' : 'text-gray-600'
                          }`}>
                            ({sellerInfo.reviewCount})
                          </span>
                        )}
                      </div>
                      
                      {/* Rating & Feedback */}
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <div className="flex items-center gap-1">
                          {[1, 2, 3, 4, 5].map((star) => (
                            <i
                              key={star}
                              className={`text-xs ${
                                star <= Math.round(sellerInfo.rating)
                                  ? 'ri-star-fill text-yellow-400'
                                  : 'ri-star-line text-gray-400'
                              }`}
                            ></i>
                          ))}
                          <span className={`text-xs ml-0.5 ${
                            isDarkMode ? 'text-gray-400' : 'text-gray-600'
                          }`}>
                            ({sellerInfo.rating.toFixed(1)})
                          </span>
                        </div>
                        
                        {sellerInfo.positivePercentage > 0 && (
                          <span className={`text-xs ${
                            isDarkMode ? 'text-gray-400' : 'text-gray-600'
                          }`}>
                            {sellerInfo.positivePercentage}% pozitiv
                          </span>
                        )}
                      </div>

                      {/* Followers/Following Info */}
                      <div className={`flex items-center gap-1 text-xs mb-1 ${
                        isDarkMode ? 'text-gray-400' : 'text-gray-600'
                      }`}>
                        <i className="ri-group-line"></i>
                        <span>{sellerInfo.followerCount || 0} urmăritori , {sellerInfo.followingCount || 0} urmăreşte</span>
                      </div>

                      {/* Last Active Status */}
                      <div className={`flex items-center gap-1 text-xs ${
                        isDarkMode ? 'text-gray-400' : 'text-gray-600'
                      }`}>
                        <i className="ri-time-line"></i>
                        <span>Ultima conectare {sellerInfo.lastSeen || 'necunoscută'}</span>
                      </div>
                    </Link>
                    
                    {/* QR Code */}
                    <div className="flex-shrink-0">
                      <QRCodeSVG
                        value={`https://gobid.ro/user/${productUserId}`}
                        size={64}
                        level="M"
                        includeMargin={false}
                        className="rounded"
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* LIVE BIDDING SECTION - Mobile - Modern Design */}
            {auction && !isAuctionEnded && (
              <div className="lg:hidden mb-4">
                
                  {/* Price Display - Modern */}
                  {isFreeListing ? (
                    <FreeListingPriceNotice isDarkMode={isDarkMode} />
                  ) : (
                    <div className={`flex items-baseline gap-1.5 sm:gap-2 flex-wrap mb-3 sm:mb-5 ${
                      isDarkMode ? 'text-white' : 'text-gray-900'
                    }`}>
                      <span className={`text-[10px] sm:text-xs font-medium tracking-wide uppercase ${
                        isDarkMode ? 'text-gray-400' : 'text-gray-500'
                      }`}>
                        Cumpără acum la:
                      </span>
                      <span className="text-lg sm:text-2xl font-extrabold tracking-tight">
                        {(auction?.currentBid || auction?.startingBid || 0).toLocaleString('ro-RO')}
                      </span>
                      <span className="text-sm sm:text-lg font-bold opacity-80">Lei</span>
                      {/* Info Icon - Price Evaluation */}
                      {productForEvaluation && (
                        <button
                          onClick={() => {
                            // Toggle info modal sau tooltip
                            const infoDiv = document.getElementById('price-info-mobile');
                            if (infoDiv) {
                              infoDiv.classList.toggle('hidden');
                            }
                          }}
                          className={`ml-1 w-5 h-5 rounded-full border flex items-center justify-center cursor-pointer transition-all hover:scale-110 ${
                            isDarkMode 
                              ? 'border-gray-500 text-gray-400 hover:border-gray-300 hover:text-gray-200' 
                              : 'border-gray-400 text-gray-600 hover:border-gray-600 hover:text-gray-800'
                          }`}
                        >
                          <i className="ri-information-line text-xs"></i>
                        </button>
                      )}
                    </div>
                  )}
                  
                  {/* Price Info Panel - Mobile */}
                  {!isFreeListing && productForEvaluation && (
                    <div id="price-info-mobile" className="hidden mt-3 p-3 rounded-lg border" style={{
                      background: isDarkMode ? '#1f2937' : '#f9fafb',
                      borderColor: isDarkMode ? '#374151' : '#e5e7eb'
                    }}>
                      <div className={`text-[10px] mb-2 italic ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                        * Evaluarea prețului este cu scop informativ
                      </div>
                      <ProductPriceEvaluation product={productForEvaluation} isDarkMode={isDarkMode} />
                    </div>
                  )}

                  {/* Bid Buttons - Dual Action (Updated); REZERVAT/VÂNDUT din conținut doar desktop, pe mobil e în floating */}
                {(hasAcceptedBid || auction?.status === 'reserved' || auction?.status === 'sold') ? (
                  <div className="hidden md:block">
                    <button
                      disabled
                      className={`w-full py-4 px-6 rounded-xl font-bold text-base transition-all text-white shadow-xl cursor-not-allowed opacity-75 flex items-center justify-center space-x-2 backdrop-blur-sm border ${
                        auction?.status === 'sold'
                          ? 'bg-gradient-to-r from-emerald-500/80 to-emerald-600/80 border-emerald-400/30'
                          : 'bg-gradient-to-r from-red-500/80 to-red-600/80 border-red-400/30'
                      }`}
                    >
                      <i className={`text-xl ${auction?.status === 'sold' ? 'ri-check-double-line' : 'ri-lock-line'}`}></i>
                      <span>{auction?.status === 'sold' ? 'VÂNDUT' : 'REZERVAT'}</span>
                    </button>
                  </div>
                ) : (
                  <>
                    {/* Plasează ofertă - ascuns pe mobil (afișat în bara plutitoare); Cumpară acum ascuns deocamdată */}
                    <div className="hidden md:block">
                    {/* Produsele gratuite duc direct către chat, fără plasare ofertă. */}
                    {isFreeListing ? (
                      <FreeListingChatCta
                        onClick={openMessageChatOrAuthModal}
                        className="group relative flex w-full min-h-[3.25rem] min-w-0 overflow-hidden rounded-xl border border-red-400/50 bg-gradient-to-r from-red-600 via-rose-600 to-red-700 px-3 py-2 font-semibold text-[13px] leading-snug text-white shadow-md shadow-red-500/20 backdrop-blur-xl transition-all duration-200 active:scale-[0.98]"
                        label="Vorbește pe chat"
                      />
                    ) : (auction?.customFields as Record<string, unknown> | undefined)?.is_fixed_price ? (
                      <div className="w-full py-3 px-6 rounded-lg font-medium border-2 text-center" style={{
                        background: isDarkMode ? 'rgba(180, 83, 9, 0.2)' : '#fffbeb',
                        borderColor: isDarkMode ? 'rgba(217, 119, 6, 0.5)' : '#fcd34d'
                      }}>
                        <span className={isDarkMode ? 'text-amber-300' : 'text-amber-800'}>Prețul nu este negociabil</span>
                      </div>
                    ) : (
                    <PlaceBidOfferCta
                      onClick={handlePlaceBidOpen}
                      className="group relative flex w-full min-h-[3.25rem] min-w-0 overflow-hidden rounded-xl border border-blue-400/40 bg-blue-500/80 px-1 py-2 font-semibold text-[13px] leading-snug text-white shadow-md backdrop-blur-xl transition-all duration-200 active:scale-[0.98]"
                    />
                    )}
                    </div>

                    {/* Desktop: arătăm ambele butoane (Scrie mesaj + Sună), similar cu mobil */}
                    <div className="hidden md:flex mt-3 gap-3">
                      <button
                        type="button"
                        onClick={openMessageChatOrAuthModal}
                        className="group relative flex flex-1 items-center justify-center overflow-hidden rounded-xl border py-3 px-4 text-sm font-semibold shadow-lg backdrop-blur-md"
                        style={{
                          background: isDarkMode ? 'rgba(31, 41, 55, 0.55)' : 'rgba(255, 255, 255, 0.72)',
                          borderColor: isDarkMode ? 'rgba(148, 163, 184, 0.35)' : 'rgba(148, 163, 184, 0.3)',
                          color: isDarkMode ? '#f3f4f6' : '#1f2937'
                        }}
                      >
                        <span className="relative z-0 flex w-full items-center justify-center gap-2 transition-opacity duration-500 group-hover:opacity-0">
                          <img src="/icons/conversation-bubble.png" alt="" className="h-6 w-6 min-h-[1.25rem] min-w-[1.25rem] flex-shrink-0 object-contain" aria-hidden />
                          <span className="tracking-wide">Scrie mesaj</span>
                        </span>
                        <span
                          className={`pointer-events-none absolute inset-0 z-10 grid w-1/4 place-items-center opacity-0 transition-all duration-500 group-hover:w-full group-hover:opacity-100 ${isDarkMode ? 'bg-white/10' : 'bg-black/[0.06]'}`}
                          aria-hidden
                        >
                          <img src="/icons/conversation-bubble.png" alt="" className="h-6 w-6 object-contain" />
                        </span>
                      </button>
                      {(() => {
                        const rawPhone = executorData?.licitatorPhone || sellerInfo?.phone || '';
                        if (!normalizeSellerPhoneForContact(rawPhone)) return null;
                        return (
                          <button
                            type="button"
                            onClick={() => openPhoneContactChoice(rawPhone)}
                            className="group relative flex min-w-[190px] cursor-pointer items-center justify-center overflow-hidden rounded-xl border py-3 px-4 text-center text-sm font-semibold shadow-lg backdrop-blur-md"
                            style={{
                              background: 'rgba(34, 197, 94, 0.82)',
                              borderColor: 'rgba(22, 163, 74, 0.85)',
                              color: '#ffffff'
                            }}
                          >
                            <span className="relative z-0 flex items-center justify-center gap-2 transition-opacity duration-500 group-hover:opacity-0">
                              <i className="ri-phone-line text-lg"></i>
                              <span className="tracking-wide">Sună</span>
                            </span>
                            <span
                              className="pointer-events-none absolute inset-0 z-10 grid w-1/4 place-items-center bg-white/15 opacity-0 transition-all duration-500 group-hover:w-full group-hover:opacity-100"
                              aria-hidden
                            >
                              <i className="ri-phone-line text-lg text-white"></i>
                            </span>
                          </button>
                        );
                      })()}
                    </div>
                  </>
                )}

                <div className={`border-t my-4 ${
                  isDarkMode ? 'border-gray-700' : 'border-gray-200'
                }`}></div>

                {auction?.sku && (
                  <div className={`text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                    <span className="text-xs">COD ANUNȚ:</span> <span className={`font-bold ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>{auction.sku}</span>
                  </div>
                )}
              </div>
            )}


            {/* Price Box - Mobile Only (REMOVED) */}
            <div className={`hidden rounded-lg p-5 mb-6 border ${
              isDarkMode 
                ? 'bg-gray-800 border-gray-700' 
                : 'bg-white border-gray-200'
            }`}>

              {/* Timer - Nu afișăm pentru Live Bid cu dată nelimitată */}
              {!isAuctionEnded && !(auction?.customFields?.has_no_expiration === true || auction?.customFields?.hasNoExpiration === true) && (
                <div>
                  <div className="flex items-center space-x-2 mb-3">
                    <ClockIcon size="s" className="text-blue-600" />
                    <span className={`text-sm font-semibold ${
                      isDarkMode ? 'text-white' : 'text-gray-900'
                    }`}>Timp rămas până la licitație</span>
                  </div>
                  <div className="grid grid-cols-4 gap-2 mb-4">
                    {[
                      { value: timeLeft.days, label: 'Zile' },
                      { value: timeLeft.hours, label: 'Ore' },
                      { value: timeLeft.minutes, label: 'Min' },
                      { value: timeLeft.seconds, label: 'Sec' },
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
                    ))}
                  </div>
                  {auction.auctionDate && (
                    <div className={`text-sm ${
                      isDarkMode ? 'text-gray-400' : 'text-gray-600'
                    }`}>
                      <div className="font-semibold mb-1">Data și ora licitației:</div>
                      <div>
                        {(() => {
                          // Folosește ora directă din customFields dacă există
                          const oraLicitatie = auction.customFields?.ora_licitatie || auction.customFields?.Ora_licitație;
                          if (oraLicitatie) {
                            // Parsează data fără timezone conversion
                            const dateStr = auction.auctionDate.split('T')[0]; // Ia doar partea de dată
                            const [year, month, day] = dateStr.split('-');
                            const timeStr = String(oraLicitatie);
                            const [hours, minutes] = timeStr.includes(':') ? timeStr.split(':') : [timeStr.substring(0, 2), timeStr.substring(2, 4) || '00'];
                            
                            // Creează dată locală fără timezone conversion
                            const localDate = new Date(parseInt(year), parseInt(month) - 1, parseInt(day), parseInt(hours || '0'), parseInt(minutes || '0'));
                            
                            return localDate.toLocaleString('ro-RO', {
                              weekday: 'long',
                              year: 'numeric',
                              month: 'long',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                              timeZone: 'Europe/Bucharest'
                            });
                          }
                          
                          // Fallback: parsează auctionDate fără timezone conversion
                          const dateStr = auction.auctionDate.includes('T') 
                            ? auction.auctionDate.split('T')[0] 
                            : auction.auctionDate;
                          const timeStr = auction.auctionDate.includes('T') 
                            ? auction.auctionDate.split('T')[1]?.split(/[+-Z]/)[0] || '00:00'
                            : '00:00';
                          
                          const [year, month, day] = dateStr.split('-');
                          const [hours, minutes] = timeStr.split(':');
                          
                          // Creează dată locală fără timezone conversion
                          const localDate = new Date(parseInt(year), parseInt(month) - 1, parseInt(day), parseInt(hours || '0'), parseInt(minutes || '0'));
                          
                          return localDate.toLocaleString('ro-RO', {
                            weekday: 'long',
                            year: 'numeric',
                            month: 'long',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                            timeZone: 'Europe/Bucharest'
                          });
                        })()}
                      </div>
                      {auction.address && (
                        <div className="mt-2 flex items-center space-x-1">
                          <LocationIcon size="s" />
                          <span>{auction.address}</span>
                </div>
              )}
            </div>
                  )}
          </div>
              )}

              {isAuctionEnded && (
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

            {/* Documents PDF - Mobile Only (deasupra Descriere) */}
            {auction.documents && auction.documents.length > 0 && (
              <div className={`lg:hidden border-2 border-red-500 rounded-lg p-4 mb-6 ${
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
                <div className="space-y-2 mt-3">
                  {auction.documents.map((doc, idx) => (
                    <a
                      key={idx}
                      href={doc.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={`flex items-center justify-between p-3 border rounded-lg transition group ${
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
                        Descarcă →
                      </span>
                    </a>
                  ))}
                </div>
                <div className={`mt-3 text-xs italic ${
                    isDarkMode ? 'text-gray-400' : 'text-gray-600'
                  }`}>
                  * Documentul conține toate detaliile despre licitație, condiții și specificații
                </div>
              </div>
            )}

            {/* Description Section - Storia.ro Style; pentru piese auto include doar Specificații; fără ID în text */}
            {(() => {
              const catNorm = (auction?.category ?? "").trim().toLowerCase();
              const subNorm = (auction?.subcategory ?? "").trim().toLowerCase();
              const subcat = subNorm.replace(/\s+/g, "-");
              const isPieseAuto =
                catNorm === "autovehicule" &&
                (subcat.includes("piese-auto") ||
                  subcat.includes("piese_auto") ||
                  subNorm.includes("piese auto"));
              const cf = auction?.customFields as Record<string, unknown> | undefined;
              const specificatii = cf?.specificatii ?? cf?.specificații ?? (cf as Record<string, unknown> | undefined)?.['Specificatii'];
              const hasSpecs = isPieseAuto && specificatii != null;
              const baseDescription = normalizeLiveBidDescriptionDisplay(auction.description ?? "");
              let fullDescription = baseDescription;
              if (hasSpecs) {
                if (specificatii != null && specificatii !== '') {
                  const specsText =
                    typeof specificatii === "object" &&
                    !Array.isArray(specificatii) &&
                    specificatii !== null
                      ? Object.entries(specificatii as Record<string, unknown>)
                          .sort(([a], [b]) => a.localeCompare(b))
                          .map(([k, v]) => `${k}: ${v}`)
                          .join("\n")
                      : String(specificatii);
                  if (specsText.trim()) {
                    fullDescription += (fullDescription ? '\n\n' : '') + 'Specificații:\n' + specsText;
                  }
                }
              }
              return fullDescription ? (
                <div className={`border rounded-lg p-4 ${
                  isDarkMode 
                    ? 'bg-gray-800 border-gray-700' 
                    : 'bg-white border-gray-200'
                }`}>
                  <h2 className={`text-lg font-semibold mb-3 ${
                    isDarkMode ? 'text-white' : 'text-gray-900'
                  }`}>Descriere</h2>
                  <LiveBidDescriptionText text={isHydrated ? fullDescription : ""} isDarkMode={isDarkMode} />
                </div>
              ) : null;
            })()}

            {/* Property Information Grid - pentru piese auto: doar Marca, An, Tip piesă, Locația */}
            {auction.customFields && Object.keys(auction.customFields).length > 0 && (() => {
                    const catGrid = (auction?.category ?? "").trim().toLowerCase();
                    const subGrid = (auction?.subcategory ?? "").trim().toLowerCase();
                    const subcatNorm = subGrid.replace(/\s+/g, "-");
                    const isPieseAutoGrid =
                      catGrid === "autovehicule" &&
                      (subcatNorm.includes("piese-auto") ||
                        subcatNorm.includes("piese_auto") ||
                        subGrid.includes("piese auto"));

                    if (isPieseAutoGrid) {
                      const cf = auction.customFields as Record<string, unknown>;
                      const marca = String(
                        auction.brand ?? cf.marca ?? cf.brand ?? cf.Marca ?? ''
                      ).trim();
                      const anRaw =
                        cf.an ??
                        cf.an_fabricare ??
                        cf.anFabricatie ??
                        cf.year ??
                        cf.An;
                      const an = normalizeAuctionYearDisplay(anRaw);
                      const tipPiesa = String(
                        auction.category_level_3 ??
                          cf.tipPiesa ??
                          cf.tip_piesa ??
                          cf.Tip_piesa ??
                          cf.category_level_3 ??
                          ''
                      ).trim();
                      const locatie = buildPieseAutoLocationString(auction);
                      const dash = (s: string) => (s ? s : '—');
                      const pieseRows = [
                        { label: 'Marca', value: dash(marca) },
                        { label: 'An', value: dash(an) },
                        { label: 'Tip piesă', value: dash(tipPiesa) },
                        { label: 'Locația:', value: dash(locatie) },
                      ];
                      return (
                        <div
                          className={`border rounded-lg p-4 ${
                            isDarkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'
                          }`}
                        >
                          <h2
                            className={`text-lg font-semibold mb-4 ${
                              isDarkMode ? 'text-white' : 'text-gray-900'
                            }`}
                          >
                            Informații despre licitație
                          </h2>
                          <div className="grid grid-cols-4 gap-2 sm:gap-4">
                            {pieseRows.map((row) => (
                              <div key={row.label} className="flex min-w-0 flex-col">
                                <div
                                  className={`mb-1 text-[10px] leading-tight sm:text-xs ${
                                    isDarkMode ? 'text-gray-400' : 'text-gray-500'
                                  }`}
                                >
                                  {row.label}:
                                </div>
                                <div
                                  className={`truncate text-xs font-semibold sm:text-sm ${
                                    isDarkMode ? 'text-white' : 'text-gray-900'
                                  }`}
                                  title={row.value}
                                >
                                  {row.value}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    }

                    const entries = Object.entries(auction.customFields).filter(([key, value]) => {
                      const keyLower = key.toLowerCase();
                      const normalizedKey = keyLower.replace(/[\s_]+/g, '');
                      // câmpuri pe care nu le afișăm în acest box (date despre produs, nu executor)
                      if (
                        keyLower.includes('detalii_relevante') ||
                        keyLower === 'detalii_relevante' ||
                        keyLower.includes('conditii_suplimentare') ||
                        keyLower.includes('condiții_suplimentare') ||
                        keyLower.includes('descriere_sumara') ||
                        keyLower.includes('descriere sumara') ||
                        keyLower.includes('exchange_rate_updated') ||
                        keyLower.includes('exchangerateupdated') ||
                        keyLower.includes('exchange_rate') ||
                        normalizedKey.includes('buynow') ||
                        // Exclude datele executorului (acestea apar în cardul de business)
                        keyLower.includes('licitator') ||
                        keyLower.includes('executor') ||
                        normalizedKey.includes('licitator') ||
                        normalizedKey.includes('executor') ||
                        keyLower === 'avatar_url' ||
                        keyLower === 'avatarurl' ||
                        keyLower === 'avatar' ||
                        keyLower.includes('executordatasync') ||
                        // STRICT INTERZIS: Exclude toate câmpurile despre licitație (preț, currency, expiration)
                        normalizedKey.includes('requestedprice') ||
                        normalizedKey.includes('requested_price') ||
                        normalizedKey.includes('minacceptedbid') ||
                        normalizedKey.includes('min_accepted_bid') ||
                        normalizedKey.includes('hasnoexpiration') ||
                        normalizedKey.includes('has_no_expiration') ||
                        normalizedKey.includes('requestedpricecurrency') ||
                        normalizedKey.includes('requested_price_currency') ||
                        normalizedKey.includes('minacceptedbidcurrency') ||
                        normalizedKey.includes('min_accepted_bid_currency') ||
                        normalizedKey.includes('pricecurrency') ||
                        normalizedKey.includes('price_currency') ||
                        normalizedKey.includes('bidcurrency') ||
                        normalizedKey.includes('bid_currency') ||
                        normalizedKey.includes('currency') && (normalizedKey.includes('price') || normalizedKey.includes('bid') || normalizedKey.includes('requested')) ||
                        keyLower.includes('imported_from') ||
                        keyLower.includes('imported_at') ||
                        normalizedKey === 'isfixedprice' ||
                        normalizedKey === 'fixedpriceonly'
                      ) {
                        return false;
                      }
                      return value !== null && value !== undefined && value !== '';
                    });
                    if (entries.length === 0) return null;

                    const pickField = (substring: string) => {
                      const normalizedSub = substring.toLowerCase().replace(/[\s_]+/g, '');
                      return entries.find(([key]) => {
                        const normalizedKey = key.toLowerCase().replace(/[\s_]+/g, '');
                        return normalizedKey.includes(normalizedSub);
                      });
                    };

                    const catLower = (auction?.category ?? '').toLowerCase();
                    const subcatLower = (auction?.subcategory ?? '').toLowerCase();
                    const isImob = catLower.includes('imobiliare') || (catLower.includes('executari') && subcatLower.includes('exec-imobiliare')) || ['apartamente','case-vile','case','terenuri','spatii-comerciale','hale-industriale'].some(s => subcatLower.includes(s));
                    const ordered = isImob
                      ? [
                          { id: 'numarcamere', labelOverride: 'Câte camere' },
                          { id: 'address', labelOverride: 'Adresa unde se află' },
                          { id: 'auctionlocation', labelOverride: 'Unde are loc licitația' },
                          { id: 'productlocation', labelOverride: 'Locația imobilului' },
                          { id: 'suprafata', labelOverride: 'Suprafață (mp)' },
                          { id: 'etaj', labelOverride: 'Etaj' },
                          { id: 'anconstructie', labelOverride: 'An construcție' },
                        ]
                      : [
                          { id: 'marca', labelOverride: 'Marca' },
                          { id: 'model', labelOverride: 'Model' },
                          { id: 'an', labelOverride: 'An' },
                          { id: 'putere', labelOverride: 'Putere (kW)' },
                          { id: 'capacitate cilindrica', labelOverride: 'Capacitate cilindrică' },
                          { id: 'caroserie', labelOverride: 'Tip caroserie' },
                          { id: 'culoare', labelOverride: 'Culoare' },
                          { id: 'clasa emisii', labelOverride: 'Clasă emisii' },
                          { id: 'kilometraj', labelOverride: 'Kilometraj' },
                        ];

                    const usedKeys = new Set<string>();

                    const itemsFromOrdered = ordered
                      .map(config => {
                        const match = pickField(config.id);
                        if (!match) return null;
                        const [key, value] = match;
                        usedKeys.add(key);
                      
                      let formattedValue: string = '';
                        const keyLower = key.toLowerCase();
                      const isAn = config.id === 'an' || keyLower.includes('an') && (keyLower.includes('fabricatie') || keyLower.includes('fabricatie') || keyLower === 'an');
                      const isCapacitate = config.id === 'capacitate cilindrica' || (keyLower.includes('capacitate') && keyLower.includes('cilindric'));
                      
                      if (typeof value === 'number') {
                        // Pentru an și capacitate cilindrică, nu folosim separator de mii
                        if (isAn || isCapacitate) {
                          formattedValue = value.toString();
                          // Adaugă " cm³" la final pentru capacitate
                          if (isCapacitate) {
                            formattedValue = formattedValue + ' cm³';
                          }
                        } else {
                          formattedValue = value.toLocaleString('ro-RO');
                        }
                      } else if (typeof value === 'boolean') {
                        formattedValue = value ? 'Da' : 'Nu';
                      } else {
                          let str = String(value);
                          // Normalizează anul de forma 2.017 -> 2017 sau 2.012 -> 2012
                          if (isAn) {
                            // Elimină toate punctele și spațiile
                            str = str.replace(/[.\s]/g, '');
                            // Verifică dacă este un număr valid
                            if (!/^\d+$/.test(str)) {
                              // Dacă nu este număr pur, încearcă să extragă numărul
                              const match = str.match(/\d+/);
                              if (match) {
                                str = match[0];
                              }
                            }
                          }
                          // Normalizează capacitatea cilindrică de forma 2.967 -> 2967 cm³
                          if (isCapacitate) {
                            // Elimină toate punctele, spațiile și unitățile existente
                            str = str.replace(/[.\s]/g, '').replace(/[^0-9]/g, '');
                            // Verifică dacă este un număr valid
                            if (!/^\d+$/.test(str)) {
                              // Dacă nu este număr pur, încearcă să extragă numărul
                              const match = str.match(/\d+/);
                              if (match) {
                                str = match[0];
                              }
                            }
                            // Adaugă " cm³" la final dacă nu există deja
                            if (!str.includes('cm³') && !str.includes('cm3')) {
                              str = str + ' cm³';
                            }
                          }
                          formattedValue = str;
                      }

                      return (
                        <div key={key} className="flex flex-col">
                            <div className={`text-xs mb-1 ${
                                isDarkMode ? 'text-gray-400' : 'text-gray-500'
                              }`}>
                              {config.labelOverride}:
                              </div>
                            <div className={`text-sm font-semibold ${
                                isDarkMode ? 'text-white' : 'text-gray-900'
                              }`}>
                                {formattedValue}
                              </div>
                            </div>
                        );
                      })
                      .filter(Boolean);
                    
                    // restul câmpurilor (în afară de cele deja afișate), cu etichete traduse în română
                    const restItems = entries
                      .filter(([key]) => {
                        if (usedKeys.has(key)) return false;
                        const normalizedKey = key.toLowerCase().replace(/[\s_]+/g, '');
                        // STRICT INTERZIS: Exclude toate câmpurile despre licitație (preț, currency, expiration)
                        if (
                          normalizedKey.includes('requestedprice') ||
                          normalizedKey.includes('requested_price') ||
                          normalizedKey.includes('minacceptedbid') ||
                          normalizedKey.includes('min_accepted_bid') ||
                          normalizedKey.includes('hasnoexpiration') ||
                          normalizedKey.includes('has_no_expiration') ||
                          normalizedKey.includes('requestedpricecurrency') ||
                          normalizedKey.includes('requested_price_currency') ||
                          normalizedKey.includes('minacceptedbidcurrency') ||
                          normalizedKey.includes('min_accepted_bid_currency') ||
                          normalizedKey.includes('pricecurrency') ||
                          normalizedKey.includes('price_currency') ||
                          normalizedKey.includes('bidcurrency') ||
                          normalizedKey.includes('bid_currency') ||
                          (normalizedKey.includes('currency') && (normalizedKey.includes('price') || normalizedKey.includes('bid') || normalizedKey.includes('requested')))
                        ) {
                          return false;
                        }
                        return true;
                      })
                      .map(([key, value]) => {
                        const normalizedKey = key.toLowerCase().replace(/[\s_]+/g, '');

                        let label = key;
                        if (normalizedKey.includes('combustibil') || normalizedKey.includes('fuel')) {
                          label = 'Combustibil';
                        } else if (normalizedKey.includes('transmisie') || normalizedKey.includes('transmission')) {
                          label = 'Transmisie';
                        } else if (normalizedKey.includes('insolventadirectsale')) {
                          label = 'Vânzare directă în insolvență';
                        } else if (normalizedKey === 'source') {
                          label = 'Sursă';
                        } else if (
                          normalizedKey.includes('seriemotor') ||
                          normalizedKey.includes('enginenumber') ||
                          normalizedKey.includes('engineid') ||
                          normalizedKey.includes('enginecode')
                        ) {
                          label = 'Serie motor';
                        } else if (
                          normalizedKey.includes('seriesasiu') ||
                          normalizedKey.includes('vin') ||
                          normalizedKey.includes('chassis')
                        ) {
                          label = 'Serie șasiu';
                        } else if (normalizedKey.includes('stare') || normalizedKey.includes('status') || normalizedKey.includes('state')) {
                          label = 'Stare';
                        } else if (normalizedKey.includes('discountpercent')) {
                          label = 'Procent discount';
                        } else if (normalizedKey.includes('discountvalueeur')) {
                          label = 'Valoare discount EUR';
                        } else if (normalizedKey.includes('discountvalueron')) {
                          label = 'Valoare discount Lei';
                        } else if (normalizedKey.includes('discountedpriceeur')) {
                          label = 'Preț cu discount EUR';
                        } else if (normalizedKey.includes('discountedpriceron')) {
                          label = 'Preț cu discount Lei';
                        } else if (normalizedKey.includes('officialregistration')) {
                          label = 'Înregistrare oficială';
                        } else if (normalizedKey.includes('numarcamere') || normalizedKey.includes('numar_camere')) {
                          label = 'Câte camere';
                        } else if (normalizedKey === 'address' || normalizedKey.includes('adresa')) {
                          label = 'Adresa unde se află';
                        } else if (normalizedKey.includes('auctionlocation') || normalizedKey.includes('auction_location')) {
                          label = 'Unde are loc licitația';
                        } else if (normalizedKey.includes('productlocation') || normalizedKey.includes('product_location')) {
                          label = 'Locația imobilului';
                        } else if (normalizedKey.includes('suprafata')) {
                          label = 'Suprafață (mp)';
                        } else if (normalizedKey.includes('anconstructie') || normalizedKey.includes('an_constructie')) {
                          label = 'An construcție';
                        } else if (normalizedKey === 'isfixedprice' || normalizedKey.includes('fixedprice')) {
                          label = 'Preț fix';
                        } else if (normalizedKey === 'year' || normalizedKey === 'modelyear' || normalizedKey === 'vehicleyear') {
                          label = 'An';
                        } else {
                          // fallback – formatare din cheie (preferăm etichete explicite mai sus pentru a evita engleza brută)
                          label = key
                            .replace(/_/g, ' ')
                            .replace(/([A-Z])/g, ' $1')
                            .replace(/\s+/g, ' ')
                            .replace(/^./, (str) => str.toUpperCase())
                            .trim();
                        }
                      
                      let formattedValue: string = '';
                      if (typeof value === 'number') {
                          formattedValue = value.toLocaleString('ro-RO');
                      } else if (typeof value === 'boolean') {
                        formattedValue = value ? 'Da' : 'Nu';
                      } else {
                        formattedValue = String(value);
                      }

                            return (
                          <div key={key} className="flex flex-col">
                            <div className={`text-xs mb-1 ${
                              isDarkMode ? 'text-gray-400' : 'text-gray-500'
                            }`}>
                              {label}:
                            </div>
                            <div className={`text-sm font-semibold ${
                              isDarkMode ? 'text-white' : 'text-gray-900'
                            }`}>
                                {formattedValue}
                          </div>
                        </div>
                      );
                      });

                    const allItems = [...itemsFromOrdered, ...restItems];
                    if (allItems.length === 0) return null;
                    return (
                      <div className={`border rounded-lg p-4 ${
                        isDarkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'
                      }`}>
                        <h2 className={`text-lg font-semibold mb-4 ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>Informații despre licitație</h2>
                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                          {allItems}
                        </div>
                      </div>
                    );
                  })()}

            {/* Date Executor / Licitator Box - Business Card Design - Mobile */}
            {executorData && (executorData.licitatorName || executorData.licitatorAddress || executorData.licitatorEmail || executorData.licitatorPhone) && (
              <div className="lg:hidden mb-6">
                <ExecutorBusinessCard executorData={executorData} auctionId={auctionId} isDarkMode={isDarkMode} />
            </div>
          )}

            {/* Map Section - Storia.ro Style */}
            {auction.address && (
              <div className={`border rounded-lg p-4 ${
                isDarkMode 
                  ? 'bg-gray-800 border-gray-700' 
                  : 'bg-white border-gray-200'
              }`}>
                <h2 className={`text-lg font-semibold mb-3 ${
                isDarkMode ? 'text-white' : 'text-gray-900'
                }`}>Hartă</h2>
                <div className={`aspect-video rounded-lg overflow-hidden border ${
                  isDarkMode ? 'border-gray-700' : 'border-gray-200'
                }`}>
                  <iframe
                    width="100%"
                    height="100%"
                    style={{ border: 0 }}
                    loading="lazy"
                    allowFullScreen
                    referrerPolicy="no-referrer-when-downgrade"
                    src={`https://www.google.com/maps/embed/v1/place?key=${process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || 'AIzaSyBFw0Qbyq9zTFTd-tUY6d-s6Q4ZXuu9BsQ'}&q=${encodeURIComponent(auction.address || auction.location || 'București, România')}`}
                  ></iframe>
                </div>
                <div className={`mt-2 text-sm flex items-center space-x-2 ${
                  isDarkMode ? 'text-gray-400' : 'text-gray-600'
                }`}>
                  <LocationIcon size="s" />
                  <span>{auction.address || auction.location}</span>
                </div>
                </div>
          )}
              </div>

          {/* Right Column - Price & Actions - Storia.ro Style */}
          <div className="lg:col-span-1">
            {/* Seller Info Card - Desktop - Same as Mobile */}
            {sellerInfo && productUserId && (
              <div className="hidden lg:block mb-4">
                <div className={`p-3 rounded-lg border transition-all ${
                  isDarkMode 
                    ? 'bg-gray-800 border-gray-700 hover:border-gray-600' 
                    : 'bg-white border-gray-200 hover:border-gray-300'
                }`}>
                  <div className="flex items-center gap-3">
                    {/* Avatar */}
                    <div className="relative flex-shrink-0">
                      {sellerInfo.avatar ? (
                        <img 
                          src={sellerInfo.avatar} 
                          alt={sellerInfo.name}
                          className="w-12 h-12 rounded-full object-cover"
                        />
                      ) : (
                        <div className={`w-12 h-12 rounded-full flex items-center justify-center ${
                          isDarkMode ? 'bg-gray-700' : 'bg-gray-200'
                        }`}>
                          <i className={`ri-user-line text-xl ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}></i>
                        </div>
                      )}
                    </div>
                    
                    {/* Seller Info */}
                    <Link
                      href={`/user/${productUserId}`}
                      className="flex-1 min-w-0"
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`text-sm font-semibold truncate ${
                          isDarkMode ? 'text-white' : 'text-gray-900'
                        }`}>
                          {sellerInfo.name}
                        </span>
                        {sellerInfo.reviewCount > 0 && (
                          <span className={`text-xs ${
                            isDarkMode ? 'text-gray-400' : 'text-gray-600'
                          }`}>
                            ({sellerInfo.reviewCount})
                          </span>
                        )}
                      </div>
                      
                      {/* Rating & Feedback */}
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <div className="flex items-center gap-1">
                          {[1, 2, 3, 4, 5].map((star) => (
                            <i
                              key={star}
                              className={`text-xs ${
                                star <= Math.round(sellerInfo.rating)
                                  ? 'ri-star-fill text-yellow-400'
                                  : 'ri-star-line text-gray-400'
                              }`}
                            ></i>
                          ))}
                          <span className={`text-xs ml-0.5 ${
                            isDarkMode ? 'text-gray-400' : 'text-gray-600'
                          }`}>
                            ({sellerInfo.rating.toFixed(1)})
                          </span>
                        </div>
                        
                        {sellerInfo.positivePercentage > 0 && (
                          <span className={`text-xs ${
                            isDarkMode ? 'text-gray-400' : 'text-gray-600'
                          }`}>
                            {sellerInfo.positivePercentage}% pozitiv
                          </span>
                        )}
                      </div>

                      {/* Followers/Following Info */}
                      <div className={`flex items-center gap-1 text-xs mb-1 ${
                        isDarkMode ? 'text-gray-400' : 'text-gray-600'
                      }`}>
                        <i className="ri-group-line"></i>
                        <span>{sellerInfo.followerCount || 0} urmăritori , {sellerInfo.followingCount || 0} urmăreşte</span>
                      </div>

                      {/* Last Active Status */}
                      <div className={`flex items-center gap-1 text-xs ${
                        isDarkMode ? 'text-gray-400' : 'text-gray-600'
                      }`}>
                        <i className="ri-time-line"></i>
                        <span>Ultima conectare {sellerInfo.lastSeen || 'necunoscută'}</span>
                      </div>
                    </Link>
                    
                    {/* QR Code */}
                    <div className="flex-shrink-0">
                      <QRCodeSVG
                        value={`https://gobid.ro/user/${productUserId}`}
                        size={64}
                        level="M"
                        includeMargin={false}
                        className="rounded"
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Price Box - Sticky (doar desktop) */}
            <div className={`hidden lg:block border rounded-lg p-5 mb-6 sticky top-24 max-h-[calc(100vh-8rem)] overflow-y-auto ${
              isDarkMode 
                ? 'bg-gray-800 border-gray-700' 
                : 'bg-white border-gray-200'
            }`}>
              {/* LIVE BIDDING SECTION - Modern Design */}
              {auction && !isAuctionEnded && (
                <>

                    {/* Price Display - Modern */}
                    {isFreeListing ? (
                      <FreeListingPriceNotice isDarkMode={isDarkMode} />
                    ) : (
                      <div className={`flex items-baseline gap-1.5 flex-wrap mb-4 sm:mb-6 ${
                        isDarkMode ? 'text-white' : 'text-gray-900'
                      }`}>
                        <span className={`text-[10px] font-medium tracking-wide uppercase ${
                          isDarkMode ? 'text-gray-400' : 'text-gray-500'
                        }`}>
                          Cumpără acum la:
                        </span>
                        <span className="text-base font-bold tracking-tight">
                          {(auction?.currentBid || auction?.startingBid || 0).toLocaleString('ro-RO')}
                        </span>
                        <span className="text-sm font-semibold opacity-80">Lei</span>
                        {/* Info Icon - Price Evaluation */}
                        {productForEvaluation && (
                          <button
                            onClick={() => {
                              // Toggle info modal sau tooltip
                              const infoDiv = document.getElementById('price-info-desktop');
                              if (infoDiv) {
                                infoDiv.classList.toggle('hidden');
                              }
                            }}
                            className={`ml-1 w-6 h-6 rounded-full border flex items-center justify-center cursor-pointer transition-all hover:scale-110 ${
                              isDarkMode 
                                ? 'border-gray-500 text-gray-400 hover:border-gray-300 hover:text-gray-200' 
                                : 'border-gray-400 text-gray-600 hover:border-gray-600 hover:text-gray-800'
                            }`}
                          >
                            <i className="ri-information-line text-sm"></i>
                          </button>
                        )}
                      </div>
                    )}
                    
                    {/* Price Info Panel - Desktop */}
                    {!isFreeListing && productForEvaluation && (
                      <div id="price-info-desktop" className="hidden mt-3 p-3 rounded-lg border" style={{
                        background: isDarkMode ? '#1f2937' : '#f9fafb',
                        borderColor: isDarkMode ? '#374151' : '#e5e7eb'
                      }}>
                        <div className={`text-[10px] mb-2 italic ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                          * Evaluarea prețului este cu scop informativ
                        </div>
                        <ProductPriceEvaluation product={productForEvaluation} isDarkMode={isDarkMode} />
                      </div>
                    )}

                    {/* Bid Buttons - Dual Action (Desktop); REZERVAT/VÂNDUT din conținut doar desktop, pe mobil e în floating */}
                  {(hasAcceptedBid || auction?.status === 'reserved' || auction?.status === 'sold') ? (
                    <div className="hidden md:block">
                      <button
                        disabled
                        className={`w-full py-5 px-6 rounded-xl font-bold text-lg transition-all text-white shadow-xl cursor-not-allowed opacity-75 flex items-center justify-center space-x-2 backdrop-blur-sm border ${
                          auction?.status === 'sold'
                            ? 'bg-gradient-to-r from-emerald-500/80 to-emerald-600/80 border-emerald-400/30'
                            : 'bg-gradient-to-r from-red-500/80 to-red-600/80 border-red-400/30'
                        }`}
                      >
                        <i className={`text-xl ${auction?.status === 'sold' ? 'ri-check-double-line' : 'ri-lock-line'}`}></i>
                        <span>{auction?.status === 'sold' ? 'VÂNDUT' : 'REZERVAT'}</span>
                      </button>
                    </div>
                  ) : (
                    <>
                      {/* Cumpară acum ascuns deocamdată */}

                      {/* Produsele gratuite duc direct către chat, fără plasare ofertă. */}
                      {isFreeListing ? (
                        <FreeListingChatCta
                          onClick={openMessageChatOrAuthModal}
                          className="group relative flex w-full min-h-[3.25rem] min-w-0 overflow-hidden rounded-xl border border-red-400/50 bg-gradient-to-r from-red-600 via-rose-600 to-red-700 px-3 py-2 font-semibold text-[13px] leading-snug text-white shadow-md shadow-red-500/20 backdrop-blur-xl transition-all duration-200 active:scale-[0.98]"
                          label="Vorbește pe chat"
                        />
                      ) : (auction?.customFields as Record<string, unknown> | undefined)?.is_fixed_price ? (
                        <div className="w-full py-3 px-6 rounded-lg font-medium border-2 text-center" style={{
                          background: isDarkMode ? 'rgba(180, 83, 9, 0.2)' : '#fffbeb',
                          borderColor: isDarkMode ? 'rgba(217, 119, 6, 0.5)' : '#fcd34d'
                        }}>
                          <span className={isDarkMode ? 'text-amber-300' : 'text-amber-800'}>Prețul nu este negociabil</span>
                        </div>
                      ) : (
                      <PlaceBidOfferCta
                        onClick={handlePlaceBidOpen}
                        className="group relative flex w-full min-h-[3.25rem] min-w-0 overflow-hidden rounded-xl border border-blue-400/40 bg-blue-500/80 px-1 py-2 font-semibold text-[13px] leading-snug text-white shadow-md backdrop-blur-xl transition-all duration-200 active:scale-[0.98]"
                      />
                      )}

                      {/* Desktop: arătăm ambele butoane (Scrie mesaj + Sună), similar cu mobil */}
                      <div className="hidden md:flex mt-3 gap-3">
                        <button
                          type="button"
                          onClick={openMessageChatOrAuthModal}
                          className="group relative flex flex-1 items-center justify-center overflow-hidden rounded-xl border py-3 px-4 text-sm font-semibold shadow-lg backdrop-blur-md"
                          style={{
                            background: isDarkMode ? 'rgba(31, 41, 55, 0.55)' : 'rgba(255, 255, 255, 0.72)',
                            borderColor: isDarkMode ? 'rgba(148, 163, 184, 0.35)' : 'rgba(148, 163, 184, 0.3)',
                            color: isDarkMode ? '#f3f4f6' : '#1f2937'
                          }}
                        >
                          <span className="relative z-0 flex w-full items-center justify-center gap-2 transition-opacity duration-500 group-hover:opacity-0">
                            <img src="/icons/conversation-bubble.png" alt="" className="h-6 w-6 min-h-[1.25rem] min-w-[1.25rem] flex-shrink-0 object-contain" aria-hidden />
                            <span className="tracking-wide">Scrie mesaj</span>
                          </span>
                          <span
                            className={`pointer-events-none absolute inset-0 z-10 grid w-1/4 place-items-center opacity-0 transition-all duration-500 group-hover:w-full group-hover:opacity-100 ${isDarkMode ? 'bg-white/10' : 'bg-black/[0.06]'}`}
                            aria-hidden
                          >
                            <img src="/icons/conversation-bubble.png" alt="" className="h-6 w-6 object-contain" />
                          </span>
                        </button>
                        {(() => {
                          const rawPhone = executorData?.licitatorPhone || sellerInfo?.phone || '';
                          if (!normalizeSellerPhoneForContact(rawPhone)) return null;
                          return (
                            <button
                              type="button"
                              onClick={() => openPhoneContactChoice(rawPhone)}
                              className="group relative flex min-w-[190px] cursor-pointer items-center justify-center overflow-hidden rounded-xl border py-3 px-4 text-center text-sm font-semibold shadow-lg backdrop-blur-md"
                              style={{
                                background: 'rgba(34, 197, 94, 0.82)',
                                borderColor: 'rgba(22, 163, 74, 0.85)',
                                color: '#ffffff'
                              }}
                            >
                              <span className="relative z-0 flex items-center justify-center gap-2 transition-opacity duration-500 group-hover:opacity-0">
                                <i className="ri-phone-line text-lg"></i>
                                <span className="tracking-wide">Sună</span>
                              </span>
                              <span
                                className="pointer-events-none absolute inset-0 z-10 grid w-1/4 place-items-center bg-white/15 opacity-0 transition-all duration-500 group-hover:w-full group-hover:opacity-100"
                                aria-hidden
                              >
                                <i className="ri-phone-line text-lg text-white"></i>
                              </span>
                            </button>
                          );
                        })()}
                      </div>
                    </>
                  )}
              </>
            )}


              <div className={`border-t my-4 ${
                isDarkMode ? 'border-gray-700' : 'border-gray-200'
              }`}></div>

              {/* Timer - Nu afișăm pentru Live Bid cu dată nelimitată */}
              {!isAuctionEnded && !(auction?.customFields?.has_no_expiration === true || auction?.customFields?.hasNoExpiration === true) && (
                <div>
                  <div className="flex items-center space-x-2 mb-3">
                    <ClockIcon size="s" className="text-blue-600" />
                    <span className={`text-sm font-semibold ${
                      isDarkMode ? 'text-white' : 'text-gray-900'
                    }`}>Timp rămas până la licitație</span>
                  </div>
                  <div className="grid grid-cols-4 gap-2 mb-4">
                    {[
                      { value: timeLeft.days, label: 'Zile' },
                      { value: timeLeft.hours, label: 'Ore' },
                      { value: timeLeft.minutes, label: 'Min' },
                      { value: timeLeft.seconds, label: 'Sec' },
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
                    ))}
                </div>
                  {auction.auctionDate && (
                    <div className={`text-sm ${
                      isDarkMode ? 'text-gray-400' : 'text-gray-600'
                    }`}>
                      <div className="font-semibold mb-1">Data și ora licitației:</div>
                      <div>
                        {(() => {
                          // Folosește ora directă din customFields dacă există
                          const oraLicitatie = auction.customFields?.ora_licitatie || auction.customFields?.Ora_licitație;
                          if (oraLicitatie) {
                            // Parsează data fără timezone conversion
                            const dateStr = auction.auctionDate.split('T')[0]; // Ia doar partea de dată
                            const [year, month, day] = dateStr.split('-');
                            const timeStr = String(oraLicitatie);
                            const [hours, minutes] = timeStr.includes(':') ? timeStr.split(':') : [timeStr.substring(0, 2), timeStr.substring(2, 4) || '00'];
                            
                            // Creează dată locală fără timezone conversion
                            const localDate = new Date(parseInt(year), parseInt(month) - 1, parseInt(day), parseInt(hours || '0'), parseInt(minutes || '0'));
                            
                            return localDate.toLocaleString('ro-RO', {
                              weekday: 'long',
                              year: 'numeric',
                              month: 'long',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                              timeZone: 'Europe/Bucharest'
                            });
                          }
                          
                          // Fallback: parsează auctionDate fără timezone conversion
                          const dateStr = auction.auctionDate.includes('T') 
                            ? auction.auctionDate.split('T')[0] 
                            : auction.auctionDate;
                          const timeStr = auction.auctionDate.includes('T') 
                            ? auction.auctionDate.split('T')[1]?.split(/[+-Z]/)[0] || '00:00'
                            : '00:00';
                          
                          const [year, month, day] = dateStr.split('-');
                          const [hours, minutes] = timeStr.split(':');
                          
                          // Creează dată locală fără timezone conversion
                          const localDate = new Date(parseInt(year), parseInt(month) - 1, parseInt(day), parseInt(hours || '0'), parseInt(minutes || '0'));
                          
                          return localDate.toLocaleString('ro-RO', {
                            weekday: 'long',
                            year: 'numeric',
                            month: 'long',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                            timeZone: 'Europe/Bucharest'
                          });
                        })()}
                </div>
                      {auction.address && (
                        <div className="mt-2 flex items-center space-x-1">
                          <LocationIcon size="s" />
                          <span>{auction.address}</span>
              </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {isAuctionEnded && (
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

              {/* Prima linie, SKU între cele 2 linii, a doua linie e border-t-ul de pe Action Buttons */}
              <div className={`border-t my-4 ${isDarkMode ? 'border-gray-700' : 'border-gray-200'}`}></div>
              {auction?.sku && (
                <div className={`text-sm mb-2 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                  <span className="text-xs">COD ANUNȚ:</span> <span className={`font-bold ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>{auction.sku}</span>
                </div>
              )}

              {/* Distribuie + favorite gradient: ascunse pe desktop (lg+); folosește linkurile din antet. Pe mobil nu erau aici (doar lg:block înainte). */}
              <div className={`hidden space-y-3 mt-6 pt-6 border-t ${
                isDarkMode ? 'border-gray-700' : 'border-gray-200'
              }`}>
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

            {/* Bloc reclamă desktop sub COD ANUNȚ */}
            <SinglepageParteaDreaptaSubcodAnunt
              isDarkMode={isDarkMode}
              resetKey={auction?.id ?? auctionId}
            />

            {/* Date Executor / Licitator Box - Business Card Design - Desktop */}
            {executorData && (executorData.licitatorName || executorData.licitatorAddress || executorData.licitatorEmail || executorData.licitatorPhone) && (
              <div className="hidden lg:block mb-6 sticky top-24 max-h-[calc(100vh-8rem)] overflow-y-auto">
                <ExecutorBusinessCard executorData={executorData} auctionId={auctionId} isDarkMode={isDarkMode} />
              </div>
            )}

              {/* Documents PDF in Quick Info Box - Desktop Only */}
              {auction.documents && auction.documents.length > 0 && (
                <div className={`hidden lg:block border-2 border-red-500 rounded-lg p-4 mt-4 ${
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
                  <div className="space-y-2 mt-3">
                    {auction.documents.map((doc, idx) => (
                      <a
                        key={idx}
                        href={doc.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={`flex items-center justify-between p-3 border rounded-lg transition group ${
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
                          Descarcă →
                        </span>
                      </a>
                ))}
              </div>
                  <div className={`mt-3 text-xs italic ${
                          isDarkMode ? 'text-gray-400' : 'text-gray-600'
                  }`}>
                    * Documentul conține toate detaliile despre licitație, condiții și specificații
                      </div>
            </div>
              )}
          </div>
        </div>

        {/* User Products - design ca Produse vizionate recent, fără Șterge / X în istoric. Mobil: 2 vizibile, Desktop: 5 vizibile */}
        {userProducts.length > 0 && (() => {
          const visibleCount = sliderVisibleCount;
          const displayed = userProducts.slice(0, 5);
          const maxSlideIndex = Math.max(0, displayed.length - visibleCount);
          const canGoPrev = userProductsSlideIndex > 0;
          const canGoNext = userProductsSlideIndex < maxSlideIndex;
          const scrollToSlide = (index: number) => {
            const el = userProductsSliderRef.current;
            if (!el) return;
            const gap = 8;
            const cardWidth = (el.offsetWidth - gap * (visibleCount - 1)) / visibleCount;
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
                  <div className="absolute inset-0 rounded-2xl bg-gradient-to-r from-transparent via-white/5 to-transparent opacity-0 hover:opacity-100 transition-opacity duration-500" />
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
                <button
                  type="button"
                  aria-label="Anterioare"
                  onClick={() => scrollToSlide(userProductsSlideIndex - 1)}
                  disabled={!canGoPrev}
                  className={`absolute left-2 top-1/2 -translate-y-1/2 z-30 w-10 h-10 sm:w-12 sm:h-12 rounded-full flex items-center justify-center transition-all duration-300 shadow-xl backdrop-blur-md border-2 ${
                    canGoPrev
                      ? isDarkMode
                        ? 'bg-gray-800/80 hover:bg-gray-700/90 border-gray-600/50 hover:border-gray-500 text-white hover:scale-110 active:scale-95'
                        : 'bg-gray-100/95 hover:bg-gray-200 border-gray-200 hover:border-gray-300 text-gray-700 hover:scale-110 active:scale-95'
                      : 'opacity-40 cursor-not-allowed bg-gray-100 border-gray-200 text-gray-400 pointer-events-none'
                  }`}
                  style={{
                    boxShadow: canGoPrev ? (isDarkMode ? '0 8px 16px rgba(0,0,0,0.3)' : '0 4px 12px rgba(0,0,0,0.06), 0 0 0 1px rgba(0,0,0,0.04)') : undefined
                  }}
                >
                  <i className="ri-arrow-left-s-line text-xl sm:text-2xl" aria-hidden />
                </button>
                <button
                  type="button"
                  aria-label="Următoare"
                  onClick={() => scrollToSlide(userProductsSlideIndex + 1)}
                  disabled={!canGoNext}
                  className={`absolute right-2 top-1/2 -translate-y-1/2 z-30 w-10 h-10 sm:w-12 sm:h-12 rounded-full flex items-center justify-center transition-all duration-300 shadow-xl backdrop-blur-md border-2 ${
                    canGoNext
                      ? isDarkMode
                        ? 'bg-gray-800/80 hover:bg-gray-700/90 border-gray-600/50 hover:border-gray-500 text-white hover:scale-110 active:scale-95'
                        : 'bg-gray-100/95 hover:bg-gray-200 border-gray-200 hover:border-gray-300 text-gray-700 hover:scale-110 active:scale-95'
                      : 'opacity-40 cursor-not-allowed bg-gray-100 border-gray-200 text-gray-400 pointer-events-none'
                  }`}
                  style={{
                    boxShadow: canGoNext ? (isDarkMode ? '0 8px 16px rgba(0,0,0,0.3)' : '0 4px 12px rgba(0,0,0,0.06), 0 0 0 1px rgba(0,0,0,0.04)') : undefined
                  }}
                >
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
                    const cardWidth = (el.offsetWidth - gap * (visibleCount - 1)) / visibleCount;
                    const step = cardWidth + gap;
                    const index = step > 0 ? Math.round(el.scrollLeft / step) : 0;
                    setUserProductsSlideIndex(Math.min(index, maxSlideIndex));
                  }}
                >
                  {displayed.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => router.push(`/live_bid/${item.slug || item.id}`)}
                      className={`group flex-shrink-0 w-[calc((100%-8px)/2)] min-w-[calc((100%-8px)/2)] max-w-[calc((100%-8px)/2)] md:w-[calc((100%-32px)/5)] md:min-w-[calc((100%-32px)/5)] md:max-w-[calc((100%-32px)/5)] rounded-2xl overflow-hidden transition-all duration-300 hover:scale-[1.03] hover:-translate-y-1 text-left ${
                        isDarkMode
                          ? 'bg-gradient-to-br from-gray-700/50 to-gray-800/50 border border-gray-700/50 hover:border-gray-600'
                          : 'bg-gradient-to-br from-gray-50 to-gray-100/80 border border-gray-200/70 hover:border-gray-300'
                      }`}
                      style={{
                        boxShadow: isDarkMode ? '0 4px 6px -1px rgba(0,0,0,0.2)' : '0 4px 6px -1px rgba(0,0,0,0.1), 0 2px 4px -1px rgba(0,0,0,0.06)'
                      }}
                      onMouseEnter={(e) => {
                        if (!isDarkMode) e.currentTarget.style.boxShadow = '0 20px 25px -5px rgba(0,0,0,0.15), 0 10px 10px -5px rgba(0,0,0,0.1)';
                        else e.currentTarget.style.boxShadow = '0 20px 25px -5px rgba(0,0,0,0.3)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.boxShadow = isDarkMode ? '0 4px 6px -1px rgba(0,0,0,0.2)' : '0 4px 6px -1px rgba(0,0,0,0.1), 0 2px 4px -1px rgba(0,0,0,0.06)';
                      }}
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
                        <div className="absolute inset-0 bg-gradient-to-t from-black/20 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                      </div>
                      <div className="p-3 sm:p-4">
                        <h3 className={`text-xs sm:text-sm font-semibold line-clamp-2 mb-2 leading-tight ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{item.title}</h3>
                        <div className={`text-[10px] flex items-center gap-0.5 mb-1 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                          <LocationIcon size="s" />
                          <span className="truncate">{item.location}</span>
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

        {/* Din aceeași categorie - design ca Produse vizionate recent. Mobil: 2 vizibile, Desktop: 5 vizibile */}
        {recommendedAuctions.length > 0 && (() => {
          const visibleCount = sliderVisibleCount;
          const displayed = recommendedAuctions.slice(0, 5);
          const maxSlideIndex = Math.max(0, displayed.length - visibleCount);
          const canGoPrev = recommendedSlideIndex > 0;
          const canGoNext = recommendedSlideIndex < maxSlideIndex;
          const scrollToSlide = (index: number) => {
            const el = recommendedSliderRef.current;
            if (!el) return;
            const gap = 8;
            const cardWidth = (el.offsetWidth - gap * (visibleCount - 1)) / visibleCount;
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
                  isDarkMode
                    ? 'bg-gradient-to-br from-blue-500/20 to-blue-500/20 border border-blue-500/30'
                    : 'bg-gradient-to-br from-blue-50/80 to-blue-50/80 border border-blue-200/40'
                }`}>
                  <i className="ri-folder-open-line text-2xl sm:text-3xl bg-gradient-to-r from-blue-500 to-blue-500 bg-clip-text text-transparent" aria-hidden />
                  <div className="absolute inset-0 rounded-2xl bg-gradient-to-r from-transparent via-white/5 to-transparent opacity-0 hover:opacity-100 transition-opacity duration-500" />
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
                <button
                  type="button"
                  aria-label="Anterioare"
                  onClick={() => scrollToSlide(recommendedSlideIndex - 1)}
                  disabled={!canGoPrev}
                  className={`absolute left-2 top-1/2 -translate-y-1/2 z-30 w-10 h-10 sm:w-12 sm:h-12 rounded-full flex items-center justify-center transition-all duration-300 shadow-xl backdrop-blur-md border-2 ${
                    canGoPrev
                      ? isDarkMode
                        ? 'bg-gray-800/80 hover:bg-gray-700/90 border-gray-600/50 hover:border-gray-500 text-white hover:scale-110 active:scale-95'
                        : 'bg-gray-100/95 hover:bg-gray-200 border-gray-200 hover:border-gray-300 text-gray-700 hover:scale-110 active:scale-95'
                      : 'opacity-40 cursor-not-allowed bg-gray-100 border-gray-200 text-gray-400 pointer-events-none'
                  }`}
                  style={{
                    boxShadow: canGoPrev ? (isDarkMode ? '0 8px 16px rgba(0,0,0,0.3)' : '0 4px 12px rgba(0,0,0,0.06), 0 0 0 1px rgba(0,0,0,0.04)') : undefined
                  }}
                >
                  <i className="ri-arrow-left-s-line text-xl sm:text-2xl" aria-hidden />
                </button>
                <button
                  type="button"
                  aria-label="Următoare"
                  onClick={() => scrollToSlide(recommendedSlideIndex + 1)}
                  disabled={!canGoNext}
                  className={`absolute right-2 top-1/2 -translate-y-1/2 z-30 w-10 h-10 sm:w-12 sm:h-12 rounded-full flex items-center justify-center transition-all duration-300 shadow-xl backdrop-blur-md border-2 ${
                    canGoNext
                      ? isDarkMode
                        ? 'bg-gray-800/80 hover:bg-gray-700/90 border-gray-600/50 hover:border-gray-500 text-white hover:scale-110 active:scale-95'
                        : 'bg-gray-100/95 hover:bg-gray-200 border-gray-200 hover:border-gray-300 text-gray-700 hover:scale-110 active:scale-95'
                      : 'opacity-40 cursor-not-allowed bg-gray-100 border-gray-200 text-gray-400 pointer-events-none'
                  }`}
                  style={{
                    boxShadow: canGoNext ? (isDarkMode ? '0 8px 16px rgba(0,0,0,0.3)' : '0 4px 12px rgba(0,0,0,0.06), 0 0 0 1px rgba(0,0,0,0.04)') : undefined
                  }}
                >
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
                    const cardWidth = (el.offsetWidth - gap * (visibleCount - 1)) / visibleCount;
                    const step = cardWidth + gap;
                    const index = step > 0 ? Math.round(el.scrollLeft / step) : 0;
                    setRecommendedSlideIndex(Math.min(index, maxSlideIndex));
                  }}
                >
                  {displayed.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => router.push(`/live_bid/${item.slug || item.id}`)}
                      className={`group flex-shrink-0 w-[calc((100%-8px)/2)] min-w-[calc((100%-8px)/2)] max-w-[calc((100%-8px)/2)] md:w-[calc((100%-32px)/5)] md:min-w-[calc((100%-32px)/5)] md:max-w-[calc((100%-32px)/5)] rounded-2xl overflow-hidden transition-all duration-300 hover:scale-[1.03] hover:-translate-y-1 text-left ${
                        isDarkMode
                          ? 'bg-gradient-to-br from-gray-700/50 to-gray-800/50 border border-gray-700/50 hover:border-gray-600'
                          : 'bg-gradient-to-br from-gray-50 to-gray-100/80 border border-gray-200/70 hover:border-gray-300'
                      }`}
                      style={{
                        boxShadow: isDarkMode ? '0 4px 6px -1px rgba(0,0,0,0.2)' : '0 4px 6px -1px rgba(0,0,0,0.1), 0 2px 4px -1px rgba(0,0,0,0.06)'
                      }}
                      onMouseEnter={(e) => {
                        if (!isDarkMode) e.currentTarget.style.boxShadow = '0 20px 25px -5px rgba(0,0,0,0.15), 0 10px 10px -5px rgba(0,0,0,0.1)';
                        else e.currentTarget.style.boxShadow = '0 20px 25px -5px rgba(0,0,0,0.3)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.boxShadow = isDarkMode ? '0 4px 6px -1px rgba(0,0,0,0.2)' : '0 4px 6px -1px rgba(0,0,0,0.1), 0 2px 4px -1px rgba(0,0,0,0.06)';
                      }}
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
                        <div className="absolute inset-0 bg-gradient-to-t from-black/20 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                      </div>
                      <div className="p-3 sm:p-4">
                        <h3 className={`text-xs sm:text-sm font-semibold line-clamp-2 mb-2 leading-tight ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{item.title}</h3>
                        <div className={`text-[10px] flex items-center gap-0.5 mb-1 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                          <LocationIcon size="s" />
                          <span className="truncate">{item.location}</span>
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

        {/* Produse vizitate recent - design ca la Produsele mele / Ofertele mele */}
        {recentlyViewedProducts.length > 0 && (
          <div className={`mt-6 sm:mt-8 rounded-2xl p-4 sm:p-5 sm:p-7 shadow-xl border overflow-hidden ${
            isDarkMode ? 'bg-gray-800 border-gray-700/50' : 'bg-gray-50/95 border-gray-200/60'
          }`}>
            <div className="flex items-center justify-between mb-4 sm:mb-6">
              <div className="flex items-center gap-3 sm:gap-4">
                <div className={`relative w-12 h-12 sm:w-14 sm:h-14 rounded-2xl flex items-center justify-center transition-all duration-300 ${
                  isDarkMode 
                    ? 'bg-gradient-to-br from-blue-500/20 to-blue-500/20 border border-blue-500/30' 
                    : 'bg-gradient-to-br from-blue-50/80 to-blue-50/80 border border-blue-200/40'
                }`}>
                  <i className={`ri-history-line text-2xl sm:text-3xl bg-gradient-to-r from-blue-500 to-blue-500 bg-clip-text text-transparent`} aria-hidden />
                  <div className="absolute inset-0 rounded-2xl bg-gradient-to-r from-transparent via-white/5 to-transparent opacity-0 hover:opacity-100 transition-opacity duration-500" />
                </div>
                <div className="flex flex-col">
                  <h2 className={`text-base sm:text-lg md:text-xl font-bold bg-gradient-to-r ${
                    isDarkMode 
                      ? 'from-white via-gray-100 to-gray-300' 
                      : 'from-gray-800 via-gray-700 to-gray-600'
                  } bg-clip-text text-transparent`}>
                    Produse vizionate recent
                  </h2>
                  <p className={`text-xs sm:text-sm mt-0.5 ${
                    isDarkMode ? 'text-gray-400' : 'text-gray-500'
                  }`}>
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
                  isDarkMode
                    ? 'text-gray-400 hover:text-white hover:bg-gray-700/50 border border-gray-700/50 hover:border-gray-600/50'
                    : 'text-gray-600 hover:text-gray-800 hover:bg-gray-200/80 border border-gray-200 hover:border-gray-300'
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
              <button
                type="button"
                aria-label="Anterioare"
                onClick={() => {
                  if (recentlyViewedScrollRef.current) {
                    recentlyViewedScrollRef.current.scrollBy({ left: -200, behavior: 'smooth' });
                  }
                }}
                className={`absolute left-2 top-1/2 -translate-y-1/2 z-30 w-10 h-10 sm:w-12 sm:h-12 rounded-full flex items-center justify-center transition-all duration-300 shadow-xl backdrop-blur-md border-2 ${
                  isDarkMode
                    ? 'bg-gray-800/80 hover:bg-gray-700/90 border-gray-600/50 hover:border-gray-500 text-white hover:scale-110 active:scale-95'
                    : 'bg-gray-100/95 hover:bg-gray-200 border-gray-200 hover:border-gray-300 text-gray-700 hover:scale-110 active:scale-95'
                }`}
                style={{
                  boxShadow: isDarkMode 
                    ? '0 8px 16px rgba(0, 0, 0, 0.3), 0 0 0 1px rgba(255, 255, 255, 0.05)'
                    : '0 4px 12px rgba(0, 0, 0, 0.06), 0 0 0 1px rgba(0, 0, 0, 0.04)'
                }}
              >
                <i className="ri-arrow-left-s-line text-xl sm:text-2xl" aria-hidden />
              </button>
              <button
                type="button"
                aria-label="Următoare"
                onClick={() => {
                  if (recentlyViewedScrollRef.current) {
                    recentlyViewedScrollRef.current.scrollBy({ left: 200, behavior: 'smooth' });
                  }
                }}
                className={`absolute right-2 top-1/2 -translate-y-1/2 z-30 w-10 h-10 sm:w-12 sm:h-12 rounded-full flex items-center justify-center transition-all duration-300 shadow-xl backdrop-blur-md border-2 ${
                  isDarkMode
                    ? 'bg-gray-800/80 hover:bg-gray-700/90 border-gray-600/50 hover:border-gray-500 text-white hover:scale-110 active:scale-95'
                    : 'bg-gray-100/95 hover:bg-gray-200 border-gray-200 hover:border-gray-300 text-gray-700 hover:scale-110 active:scale-95'
                }`}
                style={{
                  boxShadow: isDarkMode 
                    ? '0 8px 16px rgba(0, 0, 0, 0.3), 0 0 0 1px rgba(255, 255, 255, 0.05)'
                    : '0 4px 12px rgba(0, 0, 0, 0.06), 0 0 0 1px rgba(0, 0, 0, 0.04)'
                }}
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
                    const href = product.url || `/live_bid/${product.slug || product.id}`;
                    return (
                    <button
                      key={product.id}
                      type="button"
                      onClick={() => router.push(href)}
                      className={`group relative flex-shrink-0 w-[150px] sm:w-[170px] md:w-[190px] rounded-2xl overflow-hidden transition-all duration-300 hover:scale-[1.03] hover:-translate-y-1 text-left ${
                        isDarkMode 
                          ? 'bg-gradient-to-br from-gray-700/50 to-gray-800/50 border border-gray-700/50 hover:border-gray-600' 
                          : 'bg-gradient-to-br from-gray-50 to-gray-100/80 border border-gray-200/70 hover:border-gray-300'
                      }`}
                      style={{
                        boxShadow: isDarkMode
                          ? '0 4px 6px -1px rgba(0, 0, 0, 0.2), 0 2px 4px -1px rgba(0, 0, 0, 0.1)'
                          : '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.boxShadow = isDarkMode
                          ? '0 20px 25px -5px rgba(0, 0, 0, 0.3), 0 10px 10px -5px rgba(0, 0, 0, 0.2)'
                          : '0 20px 25px -5px rgba(0, 0, 0, 0.15), 0 10px 10px -5px rgba(0, 0, 0, 0.1)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.boxShadow = isDarkMode
                          ? '0 4px 6px -1px rgba(0, 0, 0, 0.2), 0 2px 4px -1px rgba(0, 0, 0, 0.1)'
                          : '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)';
                      }}
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
                        <h3 className={`text-xs sm:text-sm font-semibold line-clamp-2 mb-2 leading-tight ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                          {product.title}
                        </h3>
                        {product.startingBidRON != null && (
                          <p className={`text-sm sm:text-base font-bold mb-2 ${isDarkMode ? 'text-blue-400' : 'text-blue-600'}`}>
                            {new Intl.NumberFormat('ro-RO', {
                              style: 'currency',
                              currency: 'RON',
                              minimumFractionDigits: 0,
                              maximumFractionDigits: 0,
                            }).format(product.startingBidRON)}
                          </p>
                        )}
                        {product.viewedAt != null && (
                          <p className={`text-xs flex items-center gap-1 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                            <i className="ri-time-line" aria-hidden />
                            {(() => {
                              const viewedDate = new Date(product.viewedAt);
                              const now = new Date();
                              const diffMs = now.getTime() - viewedDate.getTime();
                              const diffMins = Math.floor(diffMs / 60000);
                              const diffHours = Math.floor(diffMs / 3600000);
                              const diffDays = Math.floor(diffMs / 86400000);
                              if (diffMins < 1) return 'acum';
                              if (diffMins < 60) return `acum ${diffMins} min`;
                              if (diffHours < 24) return `acum ${diffHours} h`;
                              if (diffDays === 1) return 'ieri';
                              if (diffDays < 7) return `acum ${diffDays} zile`;
                              return viewedDate.toLocaleDateString('ro-RO', { day: '2-digit', month: '2-digit' });
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
              setShowShareMenu(false);
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
                setShowShareMenu(false);
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
            
            <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? '12px' : '18px', position: 'relative', zIndex: 1000002 }}>
              <div style={{ position: 'relative' }}>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowShareMenu((open) => !open);
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
                {showShareMenu && (
                  <>
                    <div
                      style={{ position: 'fixed', inset: 0, zIndex: 1000001 }}
                      onClick={() => setShowShareMenu(false)}
                      aria-hidden
                    />
                    <div
                      className={
                        isMobile
                          ? "pointer-events-none fixed left-0 right-0 top-0 z-[1000002] flex justify-center px-3"
                          : "pointer-events-auto absolute right-0 top-full z-[1000002] mt-2"
                      }
                      style={
                        isMobile
                          ? { paddingTop: 'calc(env(safe-area-inset-top, 0px) + 4.25rem)' }
                          : undefined
                      }
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className={isMobile ? "pointer-events-auto" : ""}>
                        <AuctionShareMenuPanel
                          isDarkMode={isDarkMode}
                          showNativeShare={
                            typeof window !== 'undefined' &&
                            typeof (navigator as Navigator & { share?: unknown }).share === 'function'
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
                    src={liveBidHeroDisplaySrc(auction.images[currentImageIndex], currentImageIndex)}
                    alt={`Imagine ${currentImageIndex + 1} din ${auction.images.length}`}
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
                    suppressHydrationWarning
                    onError={() =>
                      setFailedLiveBidHeroIdx((m) =>
                        m[currentImageIndex] ? m : { ...m, [currentImageIndex]: true },
                      )
                    }
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
                            src={liveBidThumbDisplaySrc(thumb, idx)}
                            alt={`Miniatură ${idx + 1}`}
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
                            suppressHydrationWarning
                            onError={() =>
                              setFailedLiveBidThumbIdx((m) => (m[idx] ? m : { ...m, [idx]: true }))
                            }
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
                    src={liveBidHeroDisplaySrc(auction.images[currentImageIndex], currentImageIndex)}
                    alt={`Imagine ${currentImageIndex + 1} din ${auction.images.length}`}
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
                    suppressHydrationWarning
                    onError={() =>
                      setFailedLiveBidHeroIdx((m) =>
                        m[currentImageIndex] ? m : { ...m, [currentImageIndex]: true },
                      )
                    }
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
                    src={liveBidThumbDisplaySrc(thumb, idx)}
                    alt={`Miniatură ${idx + 1}`}
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
                    suppressHydrationWarning
                    onError={() =>
                      setFailedLiveBidThumbIdx((m) => (m[idx] ? m : { ...m, [idx]: true }))
                    }
                  />
                </button>
              ))}
            </div>
          )}
        </div>,
        document.body
      )}

      <div className="mt-12">
        <DashboardFooter isDarkMode={isDarkMode} />
      </div>

      {/* Bid Modal — centrat, glass + gradient (ca modalul de contact) */}
      {showBidModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-4 md:p-6 lg:p-8" role="presentation">
          <button
            type="button"
            className="absolute inset-0 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200"
            aria-label="Închide"
            onClick={() => setShowBidModal(false)}
          />
          <div
            className={`relative z-10 flex max-h-[98vh] w-[92%] max-w-lg flex-col overflow-hidden rounded-3xl border shadow-[0_24px_80px_-12px_rgba(0,0,0,0.35)] backdrop-blur-2xl animate-in fade-in zoom-in-95 duration-200 sm:w-full md:max-w-2xl lg:max-w-3xl xl:max-w-[52rem] ${
              isDarkMode
                ? "border-white/15 bg-gradient-to-br from-gray-900/80 via-slate-900/65 to-gray-950/45 text-white ring-1 ring-white/10"
                : "border-white/40 bg-gradient-to-br from-white/75 via-white/55 to-slate-200/35 text-gray-900 ring-1 ring-black/[0.06]"
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              aria-hidden
              className={`pointer-events-none absolute inset-0 bg-gradient-to-br opacity-90 ${
                isDarkMode
                  ? "from-rose-500/[0.06] via-transparent to-amber-500/[0.05]"
                  : "from-rose-100/45 via-transparent to-amber-100/35"
              }`}
            />
            <div className="relative flex max-h-[inherit] flex-col p-4 sm:p-6 md:p-8 lg:p-10">
              <div className="mb-5 flex items-start justify-between gap-3 sm:mb-6 md:mb-8">
                <h3
                  className={`text-lg font-bold tracking-tight sm:text-xl md:text-2xl lg:text-[1.65rem] ${
                    isDarkMode ? "text-white drop-shadow-sm" : "text-gray-900"
                  }`}
                >
                  Confirmă oferta
                </h3>
                <button
                  type="button"
                  onClick={() => setShowBidModal(false)}
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl transition active:scale-95 ${
                    isDarkMode
                      ? "text-gray-400 hover:bg-white/10 hover:text-white"
                      : "text-gray-600 hover:bg-black/[0.06] hover:text-gray-900"
                  }`}
                  aria-label="Închide"
                >
                  <i className="ri-close-line text-2xl leading-none" />
                </button>
              </div>

              <div className="flex min-h-0 flex-1 flex-col">
                <div className="mb-6 sm:mb-8 md:mb-10">
                  <div className="flex w-full items-center gap-2 sm:gap-3 md:gap-5">
                    <button
                      type="button"
                      onClick={() => setCurrentBidAmount((prev) => Math.max(prev - 10, 1))}
                      className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-2xl font-bold shadow-md transition active:scale-95 sm:h-14 sm:w-14 sm:text-3xl md:h-16 md:w-16 md:text-4xl ${
                        isDarkMode
                          ? "bg-white/10 text-white ring-1 ring-white/15 hover:bg-white/15"
                          : "bg-white/60 text-gray-900 ring-1 ring-black/[0.08] hover:bg-white/80"
                      }`}
                    >
                      −
                    </button>
                    <div className="flex min-h-[6rem] min-w-0 flex-1 items-end px-3 sm:px-4 md:px-6 lg:px-7 pb-0.5 sm:min-h-[7.5rem] md:min-h-[10rem] lg:min-h-[11rem]">
                      <div className="flex min-w-0 w-full flex-1 items-end gap-1.5 sm:gap-2 md:gap-3">
                        <div ref={bidAmountFitWrapRef} className="min-w-0 flex-1">
                          <input
                            ref={bidAmountInputRef}
                            type="text"
                            inputMode="numeric"
                            autoComplete="off"
                            value={
                              bidAmountInputFocused
                                ? currentBidAmount > 0
                                  ? String(currentBidAmount)
                                  : ""
                                : formatBidAmountRo(currentBidAmount)
                            }
                            onFocus={() => setBidAmountInputFocused(true)}
                            onBlur={() => setBidAmountInputFocused(false)}
                            onChange={(e) => setCurrentBidAmount(parseBidAmountDigits(e.target.value))}
                            className={`box-border w-full min-w-0 bg-transparent text-right font-extrabold tabular-nums leading-none outline-none ${
                              isDarkMode ? "text-white" : "text-gray-900"
                            }`}
                            style={{ fontSize: `${bidAmountFontPx}px` }}
                            aria-label="Suma ofertei în Lei"
                          />
                        </div>
                        <span
                          className={`mb-1 shrink-0 self-end text-sm font-bold uppercase tracking-[0.12em] opacity-90 sm:mb-1.5 sm:text-base md:mb-2 md:text-xl lg:text-2xl ${
                            isDarkMode ? "text-gray-400" : "text-gray-500"
                          }`}
                        >
                          Lei
                        </span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setCurrentBidAmount((prev) => prev + 10)}
                      className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-2xl font-bold shadow-md transition active:scale-95 sm:h-14 sm:w-14 sm:text-3xl md:h-16 md:w-16 md:text-4xl ${
                        isDarkMode
                          ? "bg-white/10 text-white ring-1 ring-white/15 hover:bg-white/15"
                          : "bg-white/60 text-gray-900 ring-1 ring-black/[0.08] hover:bg-white/80"
                      }`}
                    >
                      +
                    </button>
                  </div>
                </div>

                <div className="mt-auto flex gap-3 sm:gap-3 md:gap-4">
                  <button
                    type="button"
                    onClick={() => setShowBidModal(false)}
                    className={`flex-1 rounded-2xl py-3.5 text-[15px] font-semibold transition active:scale-[0.99] sm:py-4 sm:text-base md:py-5 md:text-lg ${
                      isDarkMode
                        ? "bg-white/10 text-gray-100 ring-1 ring-white/15 hover:bg-white/15"
                        : "bg-black/[0.06] text-gray-800 ring-1 ring-black/[0.06] hover:bg-black/[0.1]"
                    }`}
                  >
                    Anulează
                  </button>
                  <button
                    type="button"
                    onClick={handleBid}
                    disabled={isBidding || !currentBidAmount || currentBidAmount <= 0}
                    className={`flex-1 rounded-2xl py-3.5 text-[15px] font-semibold shadow-lg transition active:scale-[0.99] sm:py-4 sm:text-base md:py-5 md:text-lg ${
                      isBidding || !currentBidAmount || currentBidAmount <= 0
                        ? isDarkMode
                          ? "cursor-not-allowed bg-white/10 text-gray-500 ring-1 ring-white/10"
                          : "cursor-not-allowed bg-gray-300/80 text-gray-500 ring-1 ring-black/5"
                        : isDarkMode
                          ? "bg-gradient-to-br from-rose-600 to-red-800 text-white shadow-rose-950/40 ring-1 ring-white/15 hover:brightness-110"
                          : "bg-gradient-to-br from-rose-500 via-red-600 to-red-700 text-white shadow-red-500/25 ring-1 ring-red-400/30 hover:shadow-xl hover:shadow-red-500/30"
                    }`}
                  >
                    {isBidding ? "Se procesează..." : "Confirmă oferta"}
                  </button>
                </div>
              </div>
            </div>

            {/* Istoric oferte eliminat - acum totul se întâmplă în chat */}
            {false && allBids.length > 0 && (
              <div className={`mt-2 pt-2 border-t ${
                isDarkMode 
                  ? 'border-gray-700/50' 
                  : 'border-gray-200'
              }`}>
                <div className={`rounded-lg p-2 ${
                  isDarkMode 
                    ? 'bg-gradient-to-br from-gray-800/80 to-gray-900/80 border border-gray-700/50' 
                    : 'bg-gradient-to-br from-gray-50 to-white border border-gray-200'
                }`}
                style={{
                  backdropFilter: 'blur(10px)',
                  WebkitBackdropFilter: 'blur(10px)',
                }}
                >
                  <button
                    onClick={() => setIsBidHistoryExpanded(!isBidHistoryExpanded)}
                    className="flex items-center justify-between w-full mb-1.5 hover:opacity-80 transition-opacity"
                  >
                    <h4 className={`text-sm font-semibold flex items-center gap-1.5 ${
                      isDarkMode ? 'text-white' : 'text-gray-900'
                    }`}>
                      <i className="ri-history-line text-blue-500 text-sm"></i>
                      Istoric oferte
                    </h4>
                    <div className="flex items-center gap-1.5">
                      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
                        isDarkMode 
                          ? 'bg-blue-500/20 text-blue-300' 
                          : 'bg-blue-100 text-blue-700'
                      }`}>
                        {allBids.length} {allBids.length === 1 ? 'ofertă' : 'oferte'}
                      </span>
                      <i className={`ri-arrow-${isBidHistoryExpanded ? 'down' : 'right'}-s-line text-sm transition-transform duration-200 ${
                        isDarkMode ? 'text-gray-400' : 'text-gray-600'
                      }`}></i>
                    </div>
                  </button>
                  {isBidHistoryExpanded && (
                    <>
                      {loadingAllBids ? (
                        <div className="text-center py-3">
                          <div className={`animate-spin rounded-full h-6 w-6 border-b-2 mx-auto ${
                            isDarkMode ? 'border-blue-400' : 'border-blue-600'
                          }`}></div>
                        </div>
                      ) : (
                        <div className="space-y-1 max-h-48 overflow-y-auto pr-1 -mr-1">
                      {allBids
                        .map((bid) => {
                          const isCurrentUser = bid.user_id === currentUserId;
                          const isWinning = bid.is_winning;
                          const isSeller = currentUserId === productUserId;
                          // Ascunde suma dacă oferta este privată și utilizatorul nu este vânzătorul sau ofertantul
                          const shouldHideAmount = bid.is_private && !isSeller && !isCurrentUser;
                          return (
                            <div
                              key={bid.id}
                              className={`p-1.5 rounded-lg border transition-all ${
                                isWinning
                                  ? isDarkMode
                                    ? 'bg-gradient-to-r from-green-900/30 to-emerald-900/20 border-green-500/50'
                                    : 'bg-gradient-to-r from-green-50 to-emerald-50 border-green-400'
                                  : isCurrentUser
                                  ? isDarkMode
                                    ? 'bg-blue-900/20 border-blue-500/50'
                                    : 'bg-blue-50 border-blue-200'
                                  : isDarkMode
                                  ? 'bg-gray-700/30 border-gray-600/50'
                                  : 'bg-white border-gray-200'
                              }`}
                            >
                              <div className="flex items-center justify-between gap-2">
                                <div className="flex items-center gap-1.5 flex-1 min-w-0">
                                  <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0 ${
                                    isDarkMode ? 'bg-gray-600 text-white' : 'bg-gray-200 text-gray-700'
                                  }`}>
                                    {bid.user_avatar ? (
                                      <img src={bid.user_avatar} alt="" className="w-full h-full rounded-full object-cover" />
                                    ) : (
                                      <span>{(bid.user_name || 'U')[0].toUpperCase()}</span>
                                    )}
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-1.5 flex-wrap">
                                      <span className={`font-medium text-xs truncate ${
                                        isDarkMode ? 'text-white' : 'text-gray-900'
                                      }`}>
                                        {isCurrentUser ? 'Tu' : (bid.user_name || 'Utilizator')}
                                      </span>
                                      {isWinning && (
                                        <span className={`px-1 py-0.5 rounded text-[9px] font-bold ${
                                          isDarkMode
                                            ? 'bg-green-500 text-white'
                                            : 'bg-green-500 text-white'
                                        }`}>
                                          ✓
                                        </span>
                                      )}
                                    </div>
                                    <p className={`text-[9px] mt-0.5 ${
                                      isDarkMode ? 'text-gray-400' : 'text-gray-500'
                                    }`}>
                                      {new Date(bid.created_at).toLocaleDateString('ro-RO', {
                                        day: '2-digit',
                                        month: '2-digit',
                                        hour: '2-digit',
                                        minute: '2-digit'
                                      })}
                                    </p>
                                  </div>
                                </div>
                                <div className="text-right flex-shrink-0">
                                  {shouldHideAmount ? (
                                    <div className="relative group">
                                      <span className={`font-bold text-sm cursor-help ${
                                        isDarkMode ? 'text-white' : 'text-gray-900'
                                      }`}>
                                        ** Lei
                                      </span>
                                      <div className={`absolute bottom-full right-0 mb-2 w-48 sm:w-56 p-2 sm:p-2.5 rounded-lg shadow-xl text-[10px] sm:text-xs z-50 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 pointer-events-none ${
                                        isDarkMode 
                                          ? 'bg-gradient-to-br from-red-900/90 to-red-800/90 text-red-100 border border-red-700' 
                                          : 'bg-red-50 text-red-900 border border-red-300 shadow-xl'
                                      }`}>
                                        <div className="font-semibold mb-1 sm:mb-1.5 text-xs sm:text-sm flex items-center gap-1 sm:gap-1.5">
                                          <i className="ri-eye-off-line text-red-600 text-xs sm:text-sm"></i>
                                          Ofertă privată
                                        </div>
                                        <p className="text-[10px] sm:text-xs leading-relaxed">
                                          Ofertele pot fi vizibile sau private, în funcție de alegerea ofertantului. Această ofertă a fost setată ca privată de către licitator, astfel încât suma rămâne ascunsă pentru ceilalți participanți.
                                        </p>
                                        <div className="absolute bottom-0 right-4 transform translate-y-full w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent" 
                                          style={{ borderTopColor: isDarkMode ? '#374151' : '#ffffff' }}
                                        ></div>
                                      </div>
                                    </div>
                                  ) : (
                                    <span className={`font-bold text-base ${
                                      isDarkMode ? 'text-white' : 'text-gray-900'
                                    }`}>
                                      {bid.amount.toLocaleString('ro-RO')} Lei
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* User Bids Panel Modal */}
      {showUserBidsPanel && auction && (
        <UserBidsPanel
          product={auction}
          bids={userBids}
          loadingBids={loadingUserBids}
          isDarkMode={isDarkMode}
          onClose={() => setShowUserBidsPanel(false)}
        />
      )}

      {/* Bid History Panel Modal */}
      {showBidHistory && auction && (
        <BidHistoryPanel
          product={auction}
          bids={allBids}
          loadingBids={loadingAllBids}
          isDarkMode={isDarkMode}
          onClose={() => setShowBidHistory(false)}
          currentUserId={currentUserId}
          productUserId={productUserId}
        />
      )}

      {/* Owner Bid Error Modal */}
      {showOwnerBidErrorModal && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)', backgroundColor: 'rgba(0, 0, 0, 0.4)' }}
          onClick={() => setShowOwnerBidErrorModal(false)}
        >
          <div
            className={`rounded-2xl p-6 w-full max-w-md shadow-2xl ${isDarkMode ? 'bg-gray-800' : 'bg-white'}`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center mb-6">
              <div>
                <h3 className={`text-xl font-bold transition-colors ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                  Nu poți licita la propria licitație
                </h3>
              </div>
            <button
                onClick={() => setShowOwnerBidErrorModal(false)}
                className={`p-2 rounded-full transition-colors ${isDarkMode ? 'text-gray-400 hover:text-white hover:bg-gray-700' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'}`}
            >
                <CloseIcon size="m" />
            </button>
            </div>

            <div className="mb-6">
              <div className={`text-center mb-4 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                <i className="ri-error-warning-line text-5xl mb-4 text-yellow-500"></i>
                <p className="text-base">
                  Nu poți plasa oferte la propriul produs. Poți accepta ofertele primite sau plasa contraoferte doar dacă există deja oferte de la alți utilizatori.
                </p>
              </div>
            </div>

            <div className="space-y-3">
                <button
                onClick={() => setShowOwnerBidErrorModal(false)}
                className={`w-full py-4 px-6 rounded-xl font-bold text-lg transition-all ${
                  isDarkMode
                    ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-lg hover:shadow-xl'
                    : 'bg-blue-500 hover:bg-blue-600 text-white shadow-lg hover:shadow-xl'
                }`}
              >
                Am înțeles
                </button>
            </div>
          </div>
        </div>
      )}

      {/* Success/Error Messages */}
      {message.text && (
        <div className={`fixed top-20 left-1/2 transform -translate-x-1/2 z-50 px-6 py-4 rounded-lg shadow-xl border transition-all duration-500 ${
          message.type === 'success' 
            ? 'bg-green-50 border-green-200 text-green-800' 
            : 'bg-red-50 border-red-200 text-red-800'
        }`}>
          <p className="font-semibold text-center">{message.text}</p>
        </div>
      )}

      {/* Chat Modal – Scrie mesaj (fără plasare ofertă) */}
      {showChatModal && chatData && currentUserId && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)', backgroundColor: 'rgba(0, 0, 0, 0.5)' }}
          onClick={() => {
            setShowChatModal(false);
            setChatData(null);
          }}
        >
          <div
            className={`w-full max-w-2xl h-[80vh] rounded-2xl shadow-2xl overflow-hidden ${isDarkMode ? 'bg-gray-800' : 'bg-white'}`}
            onClick={(e) => e.stopPropagation()}
          >
            <ProductChat
              productId={chatData.productId}
              buyerId={chatData.buyerId}
              sellerId={chatData.sellerId}
              currentUserId={currentUserId}
              isDarkMode={isDarkMode}
              onClose={() => {
                setShowChatModal(false);
                setChatData(null);
              }}
              otherUserInfo={chatData.otherUserInfo}
            />
          </div>
        </div>
      )}

      {/* Alegere Sună vs WhatsApp — centrat, card glass + gradient */}
      {phoneContactChoice.open && (
        <div
          className="fixed inset-0 z-[110] flex items-center justify-center p-4"
          role="presentation"
        >
          <button
            type="button"
            className="absolute inset-0 bg-black/50 backdrop-blur-sm transition-opacity animate-in fade-in duration-200"
            aria-label="Închide"
            onClick={closePhoneContactChoice}
          />
          <div
            className={`relative z-10 w-full max-w-md animate-in fade-in zoom-in-95 duration-200 overflow-hidden rounded-3xl border shadow-[0_24px_80px_-12px_rgba(0,0,0,0.35)] backdrop-blur-2xl ${
              isDarkMode
                ? "border-white/15 bg-gradient-to-br from-gray-900/80 via-slate-900/65 to-gray-950/45 text-white ring-1 ring-white/10"
                : "border-white/40 bg-gradient-to-br from-white/75 via-white/55 to-slate-200/35 text-gray-900 ring-1 ring-black/[0.06]"
            }`}
            style={{ paddingBottom: "max(1.25rem, env(safe-area-inset-bottom))" }}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="phone-contact-choice-title"
          >
            <div
              aria-hidden
              className={`pointer-events-none absolute inset-0 bg-gradient-to-br opacity-90 ${
                isDarkMode
                  ? "from-blue-500/[0.07] via-transparent to-emerald-500/[0.06]"
                  : "from-sky-100/50 via-transparent to-emerald-100/40"
              }`}
            />
            <div className="relative px-5 pb-5 pt-6 sm:px-6 sm:pb-6 sm:pt-7">
              <h2
                id="phone-contact-choice-title"
                className={`text-[1.15rem] font-bold tracking-tight sm:text-xl ${
                  isDarkMode ? "text-white drop-shadow-sm" : "text-gray-900"
                }`}
              >
                Cum vrei să contactezi?
              </h2>
              <p
                className={`mt-2 text-[13px] leading-relaxed sm:text-sm ${
                  isDarkMode ? "text-gray-300/90" : "text-gray-600"
                }`}
              >
                Alege apel telefonic sau WhatsApp — în WhatsApp se trimite automat linkul către acest anunț.
              </p>
              <div className="mt-5 flex flex-col gap-3 sm:mt-6">
                {isMobile ? (
                  <a
                    href={`tel:${phoneContactChoice.tel}`}
                    onClick={closePhoneContactChoice}
                    className={`group flex items-center gap-4 rounded-2xl px-4 py-3.5 no-underline shadow-lg transition active:scale-[0.99] ${
                      isDarkMode
                        ? "bg-gradient-to-br from-blue-600 to-blue-800 text-white shadow-blue-950/40 ring-1 ring-white/10 hover:brightness-110"
                        : "bg-gradient-to-br from-blue-500 via-blue-600 to-blue-700 text-white shadow-blue-500/25 ring-1 ring-blue-400/30 hover:shadow-xl hover:shadow-blue-500/30"
                    }`}
                  >
                    <span
                      className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${
                        isDarkMode ? "bg-white/15 ring-1 ring-white/20" : "bg-white/20 ring-1 ring-white/25"
                      }`}
                    >
                      <i className="ri-phone-line text-2xl text-white" aria-hidden />
                    </span>
                    <span className="min-w-0 flex-1 text-left">
                      <span className="block text-base font-semibold leading-tight">Sună</span>
                      <span className={`mt-0.5 block text-xs font-medium ${isDarkMode ? "text-blue-100/85" : "text-white/90"}`}>
                        Apel telefonic direct
                      </span>
                    </span>
                    <i className="ri-arrow-right-s-line text-lg opacity-70 transition group-hover:translate-x-0.5" aria-hidden />
                  </a>
                ) : phoneCallRevealedDesktop ? (
                  <div
                    className={`rounded-2xl px-4 py-3.5 shadow-lg ring-1 ${
                      isDarkMode
                        ? "bg-gradient-to-br from-blue-600 to-blue-800 text-white shadow-blue-950/40 ring-white/10"
                        : "bg-gradient-to-br from-blue-500 via-blue-600 to-blue-700 text-white shadow-blue-500/25 ring-blue-400/30"
                    }`}
                  >
                    <div className="flex items-start gap-4">
                      <span
                        className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${
                          isDarkMode ? "bg-white/15 ring-1 ring-white/20" : "bg-white/20 ring-1 ring-white/25"
                        }`}
                      >
                        <i className="ri-phone-line text-2xl text-white" aria-hidden />
                      </span>
                      <div className="min-w-0 flex-1 text-left">
                        <span className={`block text-xs font-medium ${isDarkMode ? "text-blue-100/90" : "text-white/90"}`}>
                          Număr de telefon
                        </span>
                        <div className="mt-1 flex min-w-0 items-center gap-1.5">
                          <p className="min-w-0 flex-1 break-all text-xl font-bold tabular-nums tracking-tight text-white sm:text-2xl">
                            {formatPhoneForDisplay(phoneContactChoice.tel)}
                          </p>
                          <button
                            type="button"
                            onClick={copyDesktopPhoneNumber}
                            aria-label={phoneCopiedDesktop ? "Copiat" : "Copiază numărul"}
                            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition active:scale-95 ${
                              isDarkMode
                                ? "text-white hover:bg-white/15"
                                : "text-white hover:bg-white/20"
                            }`}
                          >
                            <i
                              className={`text-2xl leading-none ${phoneCopiedDesktop ? "ri-check-line" : "ri-file-copy-line"}`}
                              aria-hidden
                            />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setPhoneCallRevealedDesktop(true)}
                    aria-expanded={false}
                    className={`group flex w-full items-center gap-4 rounded-2xl px-4 py-3.5 text-left shadow-lg transition active:scale-[0.99] ${
                      isDarkMode
                        ? "bg-gradient-to-br from-blue-600 to-blue-800 text-white shadow-blue-950/40 ring-1 ring-white/10 hover:brightness-110"
                        : "bg-gradient-to-br from-blue-500 via-blue-600 to-blue-700 text-white shadow-blue-500/25 ring-1 ring-blue-400/30 hover:shadow-xl hover:shadow-blue-500/30"
                    }`}
                  >
                    <span
                      className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${
                        isDarkMode ? "bg-white/15 ring-1 ring-white/20" : "bg-white/20 ring-1 ring-white/25"
                      }`}
                    >
                      <i className="ri-phone-line text-2xl text-white" aria-hidden />
                    </span>
                    <span className="min-w-0 flex-1 text-left">
                      <span className="block text-base font-semibold leading-tight">Sună</span>
                      <span className={`mt-0.5 block text-xs font-medium ${isDarkMode ? "text-blue-100/85" : "text-white/90"}`}>
                        Apel telefonic direct
                      </span>
                    </span>
                    <i className="ri-arrow-right-s-line text-lg opacity-70 transition group-hover:translate-x-0.5" aria-hidden />
                  </button>
                )}
                <a
                  href={buildWhatsAppListingUrl(
                    phoneContactChoice.waDigits,
                    phoneContactChoice.listingUrl || (typeof window !== "undefined" ? window.location.href : "")
                  )}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={closePhoneContactChoice}
                  className={`group flex items-center gap-4 rounded-2xl px-4 py-3.5 no-underline shadow-lg transition active:scale-[0.99] ${
                    isDarkMode
                      ? "bg-gradient-to-br from-emerald-700 to-green-900 text-white shadow-emerald-950/50 ring-1 ring-white/10 hover:brightness-110"
                      : "bg-gradient-to-br from-[#25D366] via-[#20bd5a] to-[#128C7E] text-white shadow-[#25D366]/25 ring-1 ring-white/20 hover:shadow-xl hover:shadow-[#25D366]/35"
                  }`}
                >
                  <span
                    className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${
                      isDarkMode ? "bg-white/15 ring-1 ring-white/20" : "bg-white/20 ring-1 ring-white/30"
                    }`}
                  >
                    <i className="ri-whatsapp-line text-2xl text-white" aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1 text-left">
                    <span className="block text-base font-semibold leading-tight">WhatsApp</span>
                    <span className={`mt-0.5 block text-xs font-medium ${isDarkMode ? "text-emerald-100/90" : "text-white/90"}`}>
                      Mesaj cu link anunț
                    </span>
                  </span>
                  <i className="ri-arrow-right-s-line text-lg opacity-70 transition group-hover:translate-x-0.5" aria-hidden />
                </a>
                <button
                  type="button"
                  onClick={closePhoneContactChoice}
                  className={`mt-1 w-full rounded-xl py-3 text-[15px] font-semibold tracking-wide transition ${
                    isDarkMode
                      ? "text-gray-400 hover:bg-white/10 hover:text-gray-200"
                      : "text-gray-700 hover:bg-black/[0.06] hover:text-gray-900"
                  }`}
                >
                  Anulează
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Mesaj: autentificare necesară — același stil glass ca modalul de contact */}
      {showMessageAuthModal && (
        <div
          className="fixed inset-0 z-[111] flex items-center justify-center p-4"
          role="presentation"
        >
          <button
            type="button"
            className="absolute inset-0 bg-black/50 backdrop-blur-sm transition-opacity animate-in fade-in duration-200"
            aria-label="Închide"
            onClick={() => setShowMessageAuthModal(false)}
          />
          <div
            className={`relative z-10 w-full max-w-md animate-in fade-in zoom-in-95 duration-200 overflow-hidden rounded-3xl border shadow-[0_24px_80px_-12px_rgba(0,0,0,0.35)] backdrop-blur-2xl ${
              isDarkMode
                ? "border-white/15 bg-gradient-to-br from-gray-900/80 via-slate-900/65 to-gray-950/45 text-white ring-1 ring-white/10"
                : "border-white/40 bg-gradient-to-br from-white/75 via-white/55 to-slate-200/35 text-gray-900 ring-1 ring-black/[0.06]"
            }`}
            style={{ paddingBottom: "max(1.25rem, env(safe-area-inset-bottom))" }}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="message-auth-modal-title"
          >
            <div
              aria-hidden
              className={`pointer-events-none absolute inset-0 bg-gradient-to-br opacity-90 ${
                isDarkMode
                  ? "from-blue-500/[0.08] via-transparent to-sky-500/[0.06]"
                  : "from-sky-100/50 via-transparent to-blue-100/35"
              }`}
            />
            <div className="relative px-5 pb-5 pt-6 sm:px-6 sm:pb-6 sm:pt-7">
              <div className="mb-4 flex items-start justify-between gap-3">
                <h2
                  id="message-auth-modal-title"
                  className={`pr-2 text-[1.15rem] font-bold tracking-tight sm:text-xl ${
                    isDarkMode ? "text-white drop-shadow-sm" : "text-gray-900"
                  }`}
                >
                  Scrie un mesaj
                </h2>
                <button
                  type="button"
                  onClick={() => setShowMessageAuthModal(false)}
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl transition active:scale-95 ${
                    isDarkMode
                      ? "text-gray-400 hover:bg-white/10 hover:text-white"
                      : "text-gray-600 hover:bg-black/[0.06] hover:text-gray-900"
                  }`}
                  aria-label="Închide"
                >
                  <i className="ri-close-line text-2xl leading-none" />
                </button>
              </div>
              <p
                className={`text-[13px] leading-relaxed sm:text-sm ${
                  isDarkMode ? "text-gray-300/95" : "text-gray-600"
                }`}
              >
                Pentru a trimite mesaje vânzătorului acestui anunț, trebuie să fii autentificat. Te rugăm să te conectezi sau să îți creezi un cont — apoi poți deschide conversația din „Ofertele mele”.
              </p>
              <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={() => setShowMessageAuthModal(false)}
                  className={`order-2 w-full rounded-2xl py-3.5 text-[15px] font-semibold transition active:scale-[0.99] sm:order-1 sm:w-auto sm:min-w-[8rem] sm:px-6 ${
                    isDarkMode
                      ? "bg-white/10 text-gray-100 ring-1 ring-white/15 hover:bg-white/15"
                      : "bg-black/[0.06] text-gray-800 ring-1 ring-black/[0.06] hover:bg-black/[0.1]"
                  }`}
                >
                  Anulează
                </button>
                <button
                  type="button"
                  onClick={goToAuthFromMessageModal}
                  className={`order-1 w-full rounded-2xl py-3.5 text-[15px] font-semibold shadow-lg transition active:scale-[0.99] sm:order-2 sm:w-auto sm:min-w-[11rem] sm:px-6 ${
                    isDarkMode
                      ? "bg-gradient-to-br from-blue-600 to-blue-800 text-white shadow-blue-950/40 ring-1 ring-white/10 hover:brightness-110"
                      : "bg-gradient-to-br from-blue-500 via-blue-600 to-blue-700 text-white shadow-blue-500/25 ring-1 ring-blue-400/30 hover:shadow-xl hover:shadow-blue-500/30"
                  }`}
                >
                  Autentificare
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Ofertă: autentificare necesară — peste modalul „Confirmă oferta” (ca la mesaj) */}
      {showBidAuthModal && (
        <div
          className="fixed inset-0 z-[115] flex items-center justify-center p-4"
          role="presentation"
        >
          <button
            type="button"
            className="absolute inset-0 bg-black/50 backdrop-blur-sm transition-opacity animate-in fade-in duration-200"
            aria-label="Închide"
            onClick={() => setShowBidAuthModal(false)}
          />
          <div
            className={`relative z-10 w-full max-w-md animate-in fade-in zoom-in-95 duration-200 overflow-hidden rounded-3xl border shadow-[0_24px_80px_-12px_rgba(0,0,0,0.35)] backdrop-blur-2xl ${
              isDarkMode
                ? "border-white/15 bg-gradient-to-br from-gray-900/80 via-slate-900/65 to-gray-950/45 text-white ring-1 ring-white/10"
                : "border-white/40 bg-gradient-to-br from-white/75 via-white/55 to-slate-200/35 text-gray-900 ring-1 ring-black/[0.06]"
            }`}
            style={{ paddingBottom: "max(1.25rem, env(safe-area-inset-bottom))" }}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="place-bid-auth-modal-title"
          >
            <div
              aria-hidden
              className={`pointer-events-none absolute inset-0 bg-gradient-to-br opacity-90 ${
                isDarkMode
                  ? "from-blue-500/[0.08] via-transparent to-sky-500/[0.06]"
                  : "from-sky-100/50 via-transparent to-blue-100/35"
              }`}
            />
            <div className="relative px-5 pb-5 pt-6 sm:px-6 sm:pb-6 sm:pt-7">
              <div className="mb-4 flex items-start justify-between gap-3">
                <h2
                  id="place-bid-auth-modal-title"
                  className={`pr-2 text-[1.15rem] font-bold tracking-tight sm:text-xl ${
                    isDarkMode ? "text-white drop-shadow-sm" : "text-gray-900"
                  }`}
                >
                  Confirmă oferta
                </h2>
                <button
                  type="button"
                  onClick={() => setShowBidAuthModal(false)}
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl transition active:scale-95 ${
                    isDarkMode
                      ? "text-gray-400 hover:bg-white/10 hover:text-white"
                      : "text-gray-600 hover:bg-black/[0.06] hover:text-gray-900"
                  }`}
                  aria-label="Închide"
                >
                  <i className="ri-close-line text-2xl leading-none" />
                </button>
              </div>
              <p
                className={`text-[13px] leading-relaxed sm:text-sm ${
                  isDarkMode ? "text-gray-300/95" : "text-gray-600"
                }`}
              >
                Pentru a plasa o ofertă la acest anunț, trebuie să fii autentificat. Te rugăm să te conectezi sau să îți creezi un cont — apoi poți confirma din nou oferta.
              </p>
              <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={() => setShowBidAuthModal(false)}
                  className={`order-2 w-full rounded-2xl py-3.5 text-[15px] font-semibold transition active:scale-[0.99] sm:order-1 sm:w-auto sm:min-w-[8rem] sm:px-6 ${
                    isDarkMode
                      ? "bg-white/10 text-gray-100 ring-1 ring-white/15 hover:bg-white/15"
                      : "bg-black/[0.06] text-gray-800 ring-1 ring-black/[0.06] hover:bg-black/[0.1]"
                  }`}
                >
                  Anulează
                </button>
                <button
                  type="button"
                  onClick={goToAuthFromBidModal}
                  className={`order-1 w-full rounded-2xl py-3.5 text-[15px] font-semibold shadow-lg transition active:scale-[0.99] sm:order-2 sm:w-auto sm:min-w-[11rem] sm:px-6 ${
                    isDarkMode
                      ? "bg-gradient-to-br from-blue-600 to-blue-800 text-white shadow-blue-950/40 ring-1 ring-white/10 hover:brightness-110"
                      : "bg-gradient-to-br from-blue-500 via-blue-600 to-blue-700 text-white shadow-blue-500/25 ring-1 ring-blue-400/30 hover:shadow-xl hover:shadow-blue-500/30"
                  }`}
                >
                  Autentificare
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Bară plutitoare mobil – deasupra meniului de jos (var(--gobid-floating-bottom) din globals.css) */}
      {auction && (
        <div className="md:hidden fixed left-0 right-0 z-40 flex gap-2 px-2.5 py-1.5" style={{ bottom: 'var(--gobid-floating-bottom)' }}>
          {(hasAcceptedBid || auction?.status === 'reserved' || auction?.status === 'sold') ? (
            <button
              disabled
              className={`w-full py-2.5 px-3 rounded-xl font-semibold text-sm flex items-center justify-center gap-1.5 shadow-lg border-0 cursor-not-allowed opacity-90 backdrop-blur-xl ${
                auction?.status === 'sold'
                  ? 'bg-gradient-to-r from-emerald-500/80 to-emerald-600/80 text-white border border-emerald-400/30'
                  : 'bg-gradient-to-r from-red-500/80 to-red-600/80 text-white border border-red-400/30'
              }`}
            >
              <i className={`text-lg ${auction?.status === 'sold' ? 'ri-check-double-line' : 'ri-lock-line'}`}></i>
              <span>{auction?.status === 'sold' ? 'Vândut' : 'Rezervat'}</span>
            </button>
          ) : (
            <>
          {(() => {
            const isFixedPrice = (auction?.customFields as Record<string, unknown> | undefined)?.is_fixed_price;
            const rawPhone = executorData?.licitatorPhone || sellerInfo?.phone || '';
            const hasPhone = !!normalizeSellerPhoneForContact(rawPhone);
            const btnClass = () =>
              `group relative overflow-hidden py-2.5 px-3 rounded-xl font-semibold text-sm flex items-center justify-center gap-1.5 active:scale-[0.98] transition-all duration-200 border backdrop-blur-xl ${
                isDarkMode ? 'bg-white/25 text-white border-white/30' : 'bg-white/85 text-gray-800 border-black/10'
              }`;

            if (isFreeListing) {
              return (
                <div className="grid w-full min-w-0 grid-cols-4 items-stretch gap-2">
                  <FreeListingChatCta
                    onClick={openMessageChatOrAuthModal}
                    className="group relative col-span-3 flex min-h-[3.25rem] min-w-0 overflow-hidden rounded-xl border border-red-400/50 bg-gradient-to-r from-red-600 via-rose-600 to-red-700 px-2 py-2 font-semibold text-[13px] leading-snug text-white shadow-md shadow-red-500/20 backdrop-blur-xl transition-all duration-200 active:scale-[0.98]"
                    label="Produs gratuit"
                  />
                  {hasPhone ? (
                    <button
                      type="button"
                      onClick={() => openPhoneContactChoice(rawPhone)}
                      className="group relative col-span-1 flex h-14 min-h-[3.25rem] w-full min-w-0 items-center justify-center overflow-hidden rounded-xl border border-green-400/40 bg-green-500/85 text-white transition-all duration-200 active:scale-[0.98]"
                      aria-label="Sună sau WhatsApp"
                    >
                      <span className="relative z-0 flex h-full w-full items-center justify-center transition-opacity duration-500 group-hover:opacity-0">
                        <i className="ri-phone-line text-[1.35rem]"></i>
                      </span>
                      <span
                        className="pointer-events-none absolute inset-0 z-10 grid w-1/4 place-items-center bg-white/15 opacity-0 transition-all duration-500 group-hover:w-full group-hover:opacity-100"
                        aria-hidden
                      >
                        <i className="ri-phone-line text-[1.35rem] text-white"></i>
                      </span>
                    </button>
                  ) : (
                    <span className="col-span-1 flex h-14 min-h-[3.25rem] w-full min-w-0 items-center justify-center rounded-xl border border-green-400/30 bg-green-500/30 text-green-100 opacity-60">
                      <i className="ri-phone-line text-[1.35rem]"></i>
                    </span>
                  )}
                </div>
              );
            }

            if (isFixedPrice) {
              // Preț fix: exact 2 butoane egale (50/50), fără diferențe de mărime.
              return (
                <>
                  <button
                    type="button"
                    onClick={openMessageChatOrAuthModal}
                    className={`flex-1 min-w-0 ${btnClass()}`}
                    aria-label="Mesaj"
                  >
                    <span className="relative z-0 flex w-full items-center justify-center gap-1.5 transition-opacity duration-500 group-hover:opacity-0">
                      <img src="/icons/conversation-bubble.png" alt="" className="h-5 w-5 min-h-[1.25rem] min-w-[1.25rem] flex-shrink-0 object-contain" aria-hidden />
                      <span>Mesaj</span>
                    </span>
                    <span
                      className={`pointer-events-none absolute inset-0 z-10 grid w-1/4 place-items-center opacity-0 transition-all duration-500 group-hover:w-full group-hover:opacity-100 ${isDarkMode ? 'bg-white/10' : 'bg-black/[0.06]'}`}
                      aria-hidden
                    >
                      <img src="/icons/conversation-bubble.png" alt="" className="h-5 w-5 object-contain" />
                    </span>
                  </button>
                  {hasPhone ? (
                    <button
                      type="button"
                      onClick={() => openPhoneContactChoice(rawPhone)}
                      className="group relative flex flex-1 min-w-0 items-center justify-center overflow-hidden rounded-xl border border-green-400/40 bg-green-500/80 py-2.5 px-3 text-center text-sm font-semibold text-white backdrop-blur-xl transition-all duration-200 active:scale-[0.98]"
                      aria-label="Sună sau WhatsApp"
                    >
                      <span className="relative z-0 flex items-center justify-center gap-1.5 transition-opacity duration-500 group-hover:opacity-0">
                        <i className="ri-phone-line text-lg"></i>
                        <span>Sună</span>
                      </span>
                      <span
                        className="pointer-events-none absolute inset-0 z-10 grid w-1/4 place-items-center bg-white/15 opacity-0 transition-all duration-500 group-hover:w-full group-hover:opacity-100"
                        aria-hidden
                      >
                        <i className="ri-phone-line text-lg text-white"></i>
                      </span>
                    </button>
                  ) : (
                    <span
                      className="flex-1 min-w-0 py-2.5 px-3 rounded-xl font-semibold text-sm flex items-center justify-center gap-1.5 border border-green-400/30 backdrop-blur-xl opacity-60 cursor-not-allowed bg-green-500/30 text-green-100"
                    >
                      <i className="ri-phone-line text-lg"></i>
                      <span>Sună</span>
                    </span>
                  )}
                </>
              );
            }

            // Preț negociabil (mobil): 50% / 25% / 25% (grid 4 col: 2+1+1)
            return (
              <div className="grid w-full min-w-0 grid-cols-4 items-stretch gap-2">
                <PlaceBidOfferCta
                  onClick={handlePlaceBidOpen}
                  className="group relative col-span-2 flex min-h-[3.25rem] min-w-0 overflow-hidden rounded-xl border border-blue-400/40 bg-blue-500/80 px-1 py-2 font-semibold text-[13px] leading-snug text-white shadow-md backdrop-blur-xl transition-all duration-200 active:scale-[0.98]"
                />
                <button
                  type="button"
                  onClick={openMessageChatOrAuthModal}
                  className="group relative col-span-1 flex h-14 min-h-[3.25rem] w-full min-w-0 items-center justify-center overflow-hidden rounded-xl border border-black/10 bg-white/90 text-gray-800 transition-all duration-200 active:scale-[0.98]"
                  aria-label="Mesaj"
                >
                  <span className="relative z-0 flex h-full w-full items-center justify-center transition-opacity duration-500 group-hover:opacity-0">
                    <img src="/icons/conversation-bubble.png" alt="" className="h-6 w-6 object-contain" aria-hidden />
                  </span>
                  <span
                    className="pointer-events-none absolute inset-0 z-10 grid w-1/4 place-items-center bg-black/[0.06] opacity-0 transition-all duration-500 group-hover:w-full group-hover:opacity-100"
                    aria-hidden
                  >
                    <img src="/icons/conversation-bubble.png" alt="" className="h-6 w-6 object-contain" />
                  </span>
                </button>
                {hasPhone ? (
                  <button
                    type="button"
                    onClick={() => openPhoneContactChoice(rawPhone)}
                    className="group relative col-span-1 flex h-14 min-h-[3.25rem] w-full min-w-0 items-center justify-center overflow-hidden rounded-xl border border-green-400/40 bg-green-500/85 text-white transition-all duration-200 active:scale-[0.98]"
                    aria-label="Sună sau WhatsApp"
                  >
                    <span className="relative z-0 flex h-full w-full items-center justify-center transition-opacity duration-500 group-hover:opacity-0">
                      <i className="ri-phone-line text-[1.35rem]"></i>
                    </span>
                    <span
                      className="pointer-events-none absolute inset-0 z-10 grid w-1/4 place-items-center bg-white/15 opacity-0 transition-all duration-500 group-hover:w-full group-hover:opacity-100"
                      aria-hidden
                    >
                      <i className="ri-phone-line text-[1.35rem] text-white"></i>
                    </span>
                  </button>
                ) : (
                  <span
                    className="col-span-1 flex h-14 min-h-[3.25rem] w-full min-w-0 items-center justify-center rounded-xl border border-green-400/30 bg-green-500/30 text-green-100 opacity-60"
                  >
                    <i className="ri-phone-line text-[1.35rem]"></i>
                  </span>
                )}
              </div>
            );
          })()}
            </>
          )}
        </div>
      )}

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
          itemType="auction"
        />
      )}
    </div>
    </div>
  );
}
