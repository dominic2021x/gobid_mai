"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { AuthChangeEvent, Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import LocationPermissionModal from "@/components/LocationPermissionModal";
import {
  resolveAccountTypeFromJwtOnly,
  hasDashboardLocalAuthEvidence,
  looksLikeSupabaseUserId,
} from "@/lib/auth/resolveAccountType";
import { isDashboardAdminClient } from "@/lib/auth/isDashboardAdminClient";
import UniversalHeader from "@/components/UniversalHeader";
import { BackButton } from "@/components/ui/back-button";
import { Button } from "@/components/ui/button";
import WheelPagination from "@/components/ui/wheel-pagination";
import DashboardFooter from "@/components/DashboardFooter";
import { slugify } from "@/lib/slugify";
import { useOblioStatus, requestOblioInvoice, buildPayloadForTransaction } from "@/lib/invoice/oblioClient";
import { submitNetopiaCertificateForm } from "@/lib/netopia-submit-certificate-form";
import UserReviews from "@/components/UserReviews";
import { CATEGORY_LEVEL_3, CATEGORY_LEVEL_3_NAMES, SUBCATEGORY_DISPLAY_TO_KEY } from "@/lib/categories";
import { getAttributesForSubcategory, getSizeOptionsForSubcategory, getBrandOptionsForSubcategory, normalizeConditionForForm } from "@/lib/attributes";
import { getModelsForBrand, PHONE_RAM_OPTIONS, PHONE_STORAGE_OPTIONS, hasModelInMainSection, hasPhoneSpecsInMainSection } from "@/lib/data/brand-models";
import {
  detectTipPiesaFromNormalizedText,
  inferPieseAutoListingCondition,
  matchExtractedMarcaToBrandOption,
  PIESE_AUTO_TIP_PIESA_OPTIONS,
} from "@/lib/piese-auto/infer-from-title";
import {
  PIESE_AUTO_FORM_CATEGORY_DISPLAY,
  PIESE_AUTO_FORM_SUBCATEGORY_DISPLAY,
  pieseAutoCategoryFromDbToFormDisplay,
  pieseAutoSubcategoryFromDbToFormDisplay,
} from "@/lib/piese-auto/dashboard-taxonomy";
import { PIESE_AUTO_CATEGORY_SLUG, PIESE_AUTO_SUBCATEGORY_SLUG } from "@/lib/piese-auto/taxonomy-slugs";
import ProductChat from "@/components/ProductChat";
import { getProductDisplayImage } from "@/lib/getProductDisplayImage";
import { getCdnImageUrl, listingGridTransformOptions } from "@/lib/image/cdn";
import { getSafePhoto, webPathToFile } from "@/lib/mobile/camera/getPhoto";
import PremiumPurchaseButton from "@/components/premium/PremiumPurchaseButton";
import { dashboardApiFetch } from "@/lib/dashboard-api-fetch";
import { uploadImageFile } from "@/lib/upload/client-image-upload";
import { isLikelyImageFile } from "@/lib/upload/image-rules";
import { dashboardApiFetchWithOptionalBearer } from "@/lib/dashboardApiFetchWithOptionalBearer";
import { updateMyProductStatus } from "@/lib/products/updateMyProductStatusClient";
import { fetchMyProductRowForEdit } from "@/lib/products/fetchMyProductForEditClient";
import { recoverDashboardSessionIfNeeded } from "@/lib/auth/dashboardSessionRecovery";
import { getSupabaseAccessTokenRobust } from "@/lib/auth/getSupabaseSessionRobust";
import { reorderArray } from "@/lib/manual-listing/reorder-array";
import { ManualFormImageThumb } from "@/components/manual-listing/ManualFormImageThumb";
import { CameraAddOutlineIcon } from "@/components/manual-listing/CameraAddOutlineIcon";
import { useManualListingImageDnD } from "@/components/manual-listing/useManualListingImageDnD";
import { Loader2, Navigation2 } from "lucide-react";

/** Fetch către API-uri dashboard: cookie-uri + Bearer opțional (vezi `dashboardApiFetchWithOptionalBearer`). */
async function apiFetchWithSession(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  return dashboardApiFetchWithOptionalBearer(supabase, input as string | URL, init ?? {});
}

type LocationAddressComponent = {
  longName?: string;
  shortName?: string;
  types?: string[];
};

const pickLocationComponent = (
  components: LocationAddressComponent[] | undefined,
  acceptedTypes: string[]
): string => {
  const match = components?.find((component) =>
    acceptedTypes.some((type) => component.types?.includes(type))
  );
  return String(match?.longName || match?.shortName || '').trim();
};

const cleanRomanianCountyName = (value: string): string => {
  const cleaned = value
    .replace(/^jude[tț]ul\s+/i, '')
    .replace(/^municipiul\s+/i, '')
    .replace(/\s+county$/i, '')
    .trim();
  if (/^(bucuresti|bucurești|bucharest)$/i.test(cleaned)) return 'București';
  return cleaned;
};

const normalizeLocationOption = (value: string): string => {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/^municipiul\s+/i, '')
    .replace(/^orasul\s+/i, '')
    .replace(/^comuna\s+/i, '')
    .replace(/^sectorul\s+/i, 'sector ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
};

const resolveLocationOption = (options: string[], value: string): string => {
  const normalizedValue = normalizeLocationOption(value);
  if (!normalizedValue) return '';
  return options.find((option) => normalizeLocationOption(option) === normalizedValue) || '';
};

const resolveLocationOptionFromText = (options: string[], text: string): string => {
  const normalizedText = normalizeLocationOption(text);
  if (!normalizedText) return '';
  return (
    options.find((option) => normalizedText.split(/[,]/).some((part) => normalizeLocationOption(part) === normalizeLocationOption(option))) ||
    options.find((option) => {
      const normalizedOption = normalizeLocationOption(option);
      return normalizedText.includes(normalizedOption) || normalizedOption.includes(normalizedText);
    }) ||
    ''
  );
};

const getApproximateLocationFromComponents = (
  components: LocationAddressComponent[] | undefined,
  formattedAddress = ''
) => {
  const allText = [
    formattedAddress,
    ...(components ?? []).flatMap((component) => [component.longName, component.shortName]),
  ]
    .filter(Boolean)
    .join(', ');
  const county = cleanRomanianCountyName(
    pickLocationComponent(components, ['administrative_area_level_1']) ||
      resolveLocationOptionFromText(
        [
          'Alba', 'Arad', 'Argeș', 'Bacău', 'Bihor', 'Bistrița-Năsăud', 'Botoșani',
          'Brașov', 'Brăila', 'Buzău', 'Caraș-Severin', 'Călărași', 'Cluj', 'Constanța',
          'Covasna', 'Dâmbovița', 'Dolj', 'Galați', 'Giurgiu', 'Gorj', 'Harghita',
          'Hunedoara', 'Ialomița', 'Iași', 'Ilfov', 'Maramureș', 'Mehedinți', 'Mureș',
          'Neamț', 'Olt', 'Prahova', 'Sălaj', 'Satu Mare', 'Sibiu', 'Suceava',
          'Teleorman', 'Timiș', 'Tulcea', 'Vâlcea', 'Vaslui', 'Vrancea', 'București'
        ],
        allText
      )
  );
  const city =
    pickLocationComponent(components, ['locality']) ||
    pickLocationComponent(components, ['administrative_area_level_2']) ||
    pickLocationComponent(components, ['postal_town']) ||
    pickLocationComponent(components, ['city', 'town', 'municipality']);
  const village =
    pickLocationComponent(components, ['sublocality', 'sublocality_level_1', 'neighborhood', 'city_district']) ||
    pickLocationComponent(components, ['administrative_area_level_3']);

  const normalizedVillage = village.replace(/^Sectorul\s+/i, 'Sector ');
  const normalizedCity =
    county === 'București' && /^(municipiul\s+)?(bucuresti|bucurești|bucharest)$/i.test(city)
      ? 'București'
      : city.replace(/^Municipiul\s+/i, '').trim();

  return { county, city: normalizedCity, village: normalizedVillage };
};

const resolveApproximateCoordinatesForListing = async (input: {
  county?: string;
  city?: string;
  village?: string;
}): Promise<{ lat: number; lng: number } | undefined> => {
  const county = String(input.county ?? '').trim();
  const city = String(input.city ?? '').trim();
  const village = String(input.village ?? '').trim();
  const query = [village, city, county].filter(Boolean).join(', ');
  if (!query) return undefined;

  try {
    const response = await fetch(`/api/ro/resolve-location?q=${encodeURIComponent(query)}`);
    const data = await response.json();
    if (
      response.ok &&
      data?.ok &&
      typeof data.lat === 'number' &&
      typeof data.lng === 'number' &&
      Number.isFinite(data.lat) &&
      Number.isFinite(data.lng)
    ) {
      return { lat: data.lat, lng: data.lng };
    }
  } catch (error) {
    console.warn('Nu am putut calcula coordonatele aproximative pentru anunț:', error);
  }
  return undefined;
};

// Premium Timer Component
const PremiumTimer = ({ premiumUntil, isDarkMode }: { premiumUntil: string; isDarkMode: boolean }) => {
  const [timeLeft, setTimeLeft] = useState<string>('');
  const [isExpired, setIsExpired] = useState<boolean>(false);
  const [isLastTwoDays, setIsLastTwoDays] = useState<boolean>(false);

  useEffect(() => {
    const updateTimer = () => {
      const now = new Date().getTime();
      const expiry = new Date(premiumUntil).getTime();
      const difference = expiry - now;

      if (difference <= 0) {
        setTimeLeft('Expirat');
        setIsExpired(true);
        setIsLastTwoDays(false);
        return;
      }

      const days = Math.floor(difference / (1000 * 60 * 60 * 24));
      const hours = Math.floor((difference % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((difference % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((difference % (1000 * 60)) / 1000);

      setIsExpired(false);
      setIsLastTwoDays(days <= 2);

      if (days > 0) {
        setTimeLeft(`${days}z ${hours}h ${minutes}m`);
      } else if (hours > 0) {
        setTimeLeft(`${hours}h ${minutes}m ${seconds}s`);
      } else if (minutes > 0) {
        setTimeLeft(`${minutes}m ${seconds}s`);
      } else {
        setTimeLeft(`${seconds}s`);
      }
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);

    return () => clearInterval(interval);
  }, [premiumUntil]);

  // Determină culoarea în funcție de status
  let textColor = '';
  if (isExpired) {
    textColor = isDarkMode ? 'text-red-400' : 'text-red-600';
  } else if (isLastTwoDays) {
    textColor = isDarkMode ? 'text-orange-400' : 'text-orange-600';
  } else {
    textColor = isDarkMode ? 'text-green-400' : 'text-green-600';
  }

  return (
    <div className={`flex items-center gap-1 mt-1 text-xs ${textColor}`}>
      <i className="ri-time-line"></i>
      <span className="font-medium">Expiră în: {timeLeft}</span>
    </div>
  );
};

// Componentă pentru panel-ul Live Bid
interface LiveBidPanelProps {
  product: Product;
  bids: any[];
  loadingBids: boolean;
  counterOfferAmount: number | undefined;
  onCounterOfferChange: (amount: number) => void;
  onAcceptBid: (bidId: string, bidAmount: number) => void;
  onCounterOffer: () => void;
  onCancelAccept: (bidId: string) => void;
  acceptedBidId: string | null;
  countdown: number | null;
  isDarkMode: boolean;
  onOpenReviewModal: (userId: string, productId: string, reviewType?: 'seller' | 'buyer') => void;
  onOpenChat: (productId: string, buyerId: string, buyerInfo: { name: string; avatar?: string }) => void;
}

const LiveBidPanel: React.FC<LiveBidPanelProps> = ({
  product,
  bids,
  loadingBids,
  counterOfferAmount,
  onCounterOfferChange,
  onAcceptBid,
  onCounterOffer,
  onCancelAccept,
  acceptedBidId,
  countdown,
  isDarkMode,
  onOpenReviewModal,
  onOpenChat,
}) => {
  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('ro-RO', {
      style: 'currency',
      currency: product.currency,
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

  // Calculează oferta maximă și minimă
  const highestBid = bids.length > 0 ? Math.max(...bids.map(b => b.amount || 0)) : product.startingPrice;
  const lowestBid = bids.length > 0 ? Math.min(...bids.map(b => b.amount || 0)) : product.startingPrice;
  const defaultCounterOffer = highestBid + 100;

  return (
    <div className={`rounded-2xl shadow-xl p-4 backdrop-blur-sm ${
      isDarkMode 
        ? 'bg-gradient-to-br from-gray-800 via-gray-800 to-gray-900 border border-gray-700/50' 
        : 'bg-gradient-to-br from-white via-green-50/30 to-white border border-green-200/50'
    }`}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className={`p-1.5 rounded-lg ${
            isDarkMode 
              ? 'bg-green-500/20 border border-green-500/30' 
              : 'bg-green-100 border border-green-200'
          }`}>
            <i className={`ri-auction-line text-base ${
              isDarkMode ? 'text-green-400' : 'text-green-600'
            }`}></i>
          </div>
          <div>
            <h3 className={`text-base font-bold ${
              isDarkMode ? 'text-white' : 'text-gray-900'
            }`}>
              Oferte Live Bid
            </h3>
          </div>
        </div>
        <div className={`px-3 py-1.5 rounded-lg ${
          isDarkMode 
            ? 'bg-gradient-to-r from-green-600/20 to-green-500/20 border border-green-500/30' 
            : 'bg-gradient-to-r from-green-50 to-green-100/50 border border-green-200'
        }`}>
          <div className={`text-xs font-medium ${
            isDarkMode ? 'text-gray-400' : 'text-gray-600'
          }`}>
            Cea mai mare ofertă
          </div>
          <div className={`text-base font-bold ${
            isDarkMode ? 'text-green-400' : 'text-green-700'
          }`}>
            {formatPrice(highestBid)}
          </div>
        </div>
      </div>

      {loadingBids ? (
        <div className="text-center py-4">
          <div className={`animate-spin rounded-full h-8 w-8 border-b-2 mx-auto ${
            isDarkMode ? 'border-green-400' : 'border-green-600'
          }`}></div>
          <p className={`mt-2 text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
            Se încarcă ofertele...
          </p>
        </div>
      ) : bids.length === 0 ? (
        <div className={`text-center py-4 ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
          <i className="ri-inbox-line text-4xl mb-2"></i>
          <p>Nu există oferte încă pentru acest produs.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {bids.map((bid) => (
            <div
              key={bid.id}
              className={`p-4 rounded-xl transition-all duration-200 ${
                bid.is_winning
                  ? isDarkMode
                    ? 'bg-gradient-to-r from-green-900/40 via-green-800/30 to-green-900/40 border border-green-500/40 shadow-lg shadow-green-500/10'
                    : 'bg-gradient-to-r from-green-50 via-white to-green-50/50 border border-green-300/60 shadow-md shadow-green-200/30'
                  : isDarkMode
                  ? 'bg-gray-700/50 border border-gray-600/50 hover:border-gray-500/70 hover:bg-gray-700/70'
                  : 'bg-white border border-gray-200/60 hover:border-gray-300 hover:shadow-md'
              }`}
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex-1">
                  <div className={`text-2xl font-bold mb-1 ${
                    isDarkMode ? 'text-white' : 'text-gray-900'
                  }`}>
                    {formatPrice(bid.amount)}
                  </div>
                  <div className="flex items-center gap-3 mt-2">
                    {/* Avatar */}
                    <div className="relative">
                      {(() => {
                        // Debug logging
                        if (!bid.user_profiles) {
                          console.log('[LiveBidPanel] No user_profiles for bid:', bid.id, 'user_id:', bid.user_id);
                        } else {
                          console.log('[LiveBidPanel] User profile found:', {
                            bidId: bid.id,
                            userId: bid.user_id,
                            firstName: bid.user_profiles.first_name,
                            lastName: bid.user_profiles.last_name,
                            avatar: bid.user_profiles.avatar_url
                          });
                        }
                        return null;
                      })()}
                      {bid.user_profiles?.avatar_url ? (
                        <img
                          src={bid.user_profiles.avatar_url}
                          alt={bid.user_profiles.first_name || bid.user_profiles.last_name || 'Utilizator'}
                          className={`w-10 h-10 rounded-full object-cover border-2 shadow-md ${
                            isDarkMode ? 'border-gray-600' : 'border-gray-200'
                          }`}
                          onError={(e) => {
                            // Hide image and show fallback
                            const target = e.target as HTMLImageElement;
                            target.style.display = 'none';
                            const fallback = target.nextElementSibling as HTMLElement;
                            if (fallback) fallback.style.display = 'flex';
                          }}
                        />
                      ) : null}
                      {/* Fallback avatar with initials */}
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold shadow-md ${
                        bid.user_profiles?.avatar_url ? 'hidden' : ''
                      } ${
                        isDarkMode 
                          ? 'bg-gradient-to-br from-gray-600 to-gray-700 text-gray-200 border border-gray-500' 
                          : 'bg-gradient-to-br from-gray-300 to-gray-400 text-gray-700 border border-gray-200'
                      }`}>
                        {(() => {
                          if (bid.user_profiles?.first_name) {
                            return bid.user_profiles.first_name[0].toUpperCase();
                          }
                          if (bid.user_profiles?.last_name) {
                            return bid.user_profiles.last_name[0].toUpperCase();
                          }
                          return 'U';
                        })()}
                      </div>
                      <div className={`absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-green-500 rounded-full border-2 ${
                        isDarkMode ? 'border-gray-800' : 'border-white'
                      }`}></div>
                    </div>
                    {/* Nume */}
                    <div>
                      <div className={`text-sm font-semibold ${
                        isDarkMode ? 'text-gray-100' : 'text-gray-800'
                      }`}>
                        {(() => {
                          // Dacă oferta este făcută de proprietarul produsului, afișează "Eu"
                          if (bid.user_id === product.user_id) {
                            return 'Eu';
                          }
                          if (bid.user_profiles) {
                            const firstName = bid.user_profiles.first_name || '';
                            const lastName = bid.user_profiles.last_name || '';
                            const fullName = `${firstName} ${lastName}`.trim();
                            if (fullName) return fullName;
                          }
                          return 'Utilizator';
                        })()}
                      </div>
                      {/* Rating (stele) - clickable, afișează întotdeauna, chiar dacă nu are review-uri */}
                      <div 
                        className={`flex items-center gap-0.5 mt-1 cursor-pointer hover:opacity-80 transition-opacity ${
                          bid.user_id === product.user_id ? 'cursor-default' : ''
                        }`}
                        onClick={() => {
                          if (bid.user_id && bid.user_id !== product.user_id) {
                            onOpenReviewModal(bid.user_id, product.id);
                          }
                        }}
                      >
                        {[1, 2, 3, 4, 5].map((star) => {
                          const avgRating = bid.user_rating?.avgRating || 0;
                          const hasRating = avgRating > 0;
                          const isFilled = hasRating && star <= Math.round(avgRating);
                          
                          return (
                            <i
                              key={star}
                              className={`text-xs ${
                                isFilled
                                  ? 'ri-star-fill text-yellow-400'
                                  : 'ri-star-line text-gray-400'
                              }`}
                            ></i>
                          );
                        })}
                        <span className={`text-xs ml-1 ${
                          isDarkMode ? 'text-gray-400' : 'text-gray-500'
                        }`}>
                          ({bid.user_rating?.avgRating?.toFixed(1) || '0'})
                        </span>
                      </div>
                      <div className={`text-xs flex items-center gap-1 mt-0.5 ${
                        isDarkMode ? 'text-gray-400' : 'text-gray-500'
                      }`}>
                        <i className="ri-time-line text-xs"></i>
                        {formatDate(bid.created_at)}
                      </div>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {/* Badge Contraoferta - Albastru pentru vânzător */}
                  {bid.user_id === product.user_id ? (
                    <span className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-md ${
                      isDarkMode
                        ? 'bg-gradient-to-r from-blue-500 to-blue-600 text-white shadow-blue-500/30'
                        : 'bg-gradient-to-r from-blue-400 to-blue-500 text-white shadow-blue-400/40'
                    }`}>
                      <i className="ri-arrow-left-right-line text-sm"></i>
                      Contraoferta ta
                    </span>
                  ) : (
                    <>
                      {/* Badge Contraoferta - Roșu pentru cumpărător (dacă există oferte anterioare de la vânzător) */}
                      {(() => {
                        const hasPreviousSellerBids = bids.some((b: any) => 
                          b.user_id === product.user_id && 
                          new Date(b.created_at).getTime() < new Date(bid.created_at).getTime()
                        );
                        return hasPreviousSellerBids ? (
                          <span className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-md ${
                            isDarkMode
                              ? 'bg-gradient-to-r from-red-500 to-red-600 text-white shadow-red-500/30'
                              : 'bg-gradient-to-r from-red-400 to-red-500 text-white shadow-red-400/40'
                          }`}>
                            <i className="ri-arrow-left-right-line text-sm"></i>
                            Contraoferta cumpărătorului
                          </span>
                        ) : null;
                      })()}
                      {bid.amount === highestBid && (
                        <span className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-md ${
                          isDarkMode
                            ? 'bg-gradient-to-r from-yellow-500 to-yellow-600 text-white shadow-yellow-500/30'
                            : 'bg-gradient-to-r from-yellow-400 to-yellow-500 text-white shadow-yellow-400/40'
                        }`}>
                          <i className="ri-arrow-up-line text-sm"></i>
                          Cea mai mare ofertă
                        </span>
                      )}
                      {bid.amount === lowestBid && bids.length > 1 && (
                        <span className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-md ${
                          isDarkMode
                            ? 'bg-gradient-to-r from-red-500 to-red-600 text-white shadow-red-500/30'
                            : 'bg-gradient-to-r from-red-400 to-red-500 text-white shadow-red-400/40'
                        }`}>
                          <i className="ri-arrow-down-line text-sm"></i>
                          Cea mai mică ofertă
                        </span>
                      )}
                      {acceptedBidId === bid.id && countdown !== null && countdown > 0 && (
                        <div className={`px-4 py-2 rounded-xl text-sm font-semibold flex items-center gap-2 shadow-md ${
                          isDarkMode
                            ? 'bg-gradient-to-r from-yellow-600/20 to-yellow-500/20 border border-yellow-500/40 text-yellow-300'
                            : 'bg-gradient-to-r from-yellow-50 to-yellow-100/50 border border-yellow-300/60 text-yellow-700'
                        }`}>
                          <i className="ri-time-line animate-pulse"></i>
                          <span>Răzgândire: {Math.floor(countdown / 60)}:{(countdown % 60).toString().padStart(2, '0')}</span>
                        </div>
                      )}
                      {acceptedBidId === bid.id && countdown !== null && countdown > 0 && (
                        <button
                          onClick={() => onCancelAccept(bid.id)}
                          className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all duration-200 flex items-center gap-2 shadow-md ${
                            isDarkMode
                              ? 'bg-gradient-to-r from-red-600 to-red-700 hover:from-red-500 hover:to-red-600 text-white shadow-red-500/30 hover:shadow-lg hover:shadow-red-500/40 hover:scale-105 active:scale-95'
                              : 'bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white shadow-red-400/40 hover:shadow-lg hover:shadow-red-500/50 hover:scale-105 active:scale-95'
                          }`}
                        >
                          <i className="ri-close-line"></i>
                          <span>Anulează</span>
                        </button>
                      )}
                      {/* Nu afișa butonul "Acceptă" pentru propriile oferte */}
                      {acceptedBidId !== bid.id && (
                        <>
                          {/* Butonul de chat apare doar pentru ofertele de la cumpărători (nu pentru contraofertele vânzătorului) */}
                          {bid.user_id !== product.user_id && (
                            <button
                              onClick={() => {
                                const buyerName = bid.user_profiles
                                  ? `${bid.user_profiles.first_name || ''} ${bid.user_profiles.last_name || ''}`.trim() || 'Utilizator'
                                  : 'Utilizator';
                                onOpenChat(product.id, bid.user_id, {
                                  name: buyerName,
                                  avatar: bid.user_profiles?.avatar_url,
                                });
                              }}
                              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all duration-200 flex items-center gap-2 shadow-md hover:shadow-lg hover:scale-105 active:scale-95 ${
                                isDarkMode
                                  ? 'bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-500 hover:to-blue-600 text-white border border-blue-500/30'
                                  : 'bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white border border-sky-400/30'
                              }`}
                            >
                              <i className="ri-message-3-line text-base"></i>
                              <span>Chat</span>
                            </button>
                          )}
                          {/* Butonul "Acceptă" apare doar pentru ofertele de la cumpărători (nu pentru contraofertele vânzătorului) */}
                          {bid.user_id !== product.user_id && (
                            <button
                              onClick={() => onAcceptBid(bid.id, bid.amount)}
                              disabled={acceptedBidId !== null}
                              className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all duration-200 flex items-center gap-2 shadow-md ${
                                acceptedBidId !== null
                                  ? isDarkMode
                                    ? 'bg-gray-600/50 text-gray-400 cursor-not-allowed border border-gray-600/50'
                                    : 'bg-gray-200 text-gray-500 cursor-not-allowed border border-gray-300'
                                  : isDarkMode
                                  ? 'bg-gradient-to-r from-green-600 to-green-700 hover:from-green-500 hover:to-green-600 text-white shadow-green-500/30 hover:shadow-lg hover:shadow-green-500/40 hover:scale-105 active:scale-95'
                                  : 'bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white shadow-green-400/40 hover:shadow-lg hover:shadow-green-500/50 hover:scale-105 active:scale-95'
                              }`}
                            >
                              <i className="ri-check-line"></i>
                              Acceptă
                            </button>
                          )}
                        </>
                      )}
                    </>
                  )}
                  {acceptedBidId === bid.id && (countdown === null || countdown <= 0) && (
                    <span className={`px-4 py-2 rounded-xl text-sm font-semibold flex items-center gap-2 shadow-md ${
                      isDarkMode
                        ? 'bg-gradient-to-r from-green-600 to-green-700 text-white shadow-green-500/30'
                        : 'bg-gradient-to-r from-green-500 to-green-600 text-white shadow-green-400/40'
                    }`}>
                      <i className="ri-checkbox-circle-line"></i>
                      <span>Acceptată</span>
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))}

          {/* Secțiune contraoferta - Blocată când există o ofertă acceptată */}
          {(() => {
            // Verifică dacă există o ofertă acceptată
            const hasAcceptedBid = bids.some((bid: any) => bid.is_winning === true) || acceptedBidId !== null;
            
            return (
              <div className={`mt-6 pt-5 border-t ${
                isDarkMode ? 'border-gray-700/50' : 'border-gray-200/60'
              }`}>
                <div className="flex items-center gap-2 mb-4">
                  <div className={`p-2 rounded-lg ${
                    hasAcceptedBid
                      ? isDarkMode 
                        ? 'bg-gray-600/20 border border-gray-600/30' 
                        : 'bg-gray-100 border border-gray-300'
                      : isDarkMode 
                        ? 'bg-blue-500/20 border border-blue-500/30' 
                        : 'bg-blue-100 border border-blue-200'
                  }`}>
                    <i className={`ri-arrow-up-line text-lg ${
                      hasAcceptedBid
                        ? isDarkMode ? 'text-gray-500' : 'text-gray-400'
                        : isDarkMode ? 'text-blue-400' : 'text-blue-600'
                    }`}></i>
                  </div>
                  <h4 className={`text-base font-bold ${
                    isDarkMode ? 'text-white' : 'text-gray-900'
                  }`}>
                    Plasează contraoferta
                  </h4>
                  {hasAcceptedBid && (
                    <div className="relative group">
                      <i className={`ri-information-line text-lg ${
                        isDarkMode ? 'text-gray-400' : 'text-gray-500'
                      } cursor-help`}></i>
                      <div className={`absolute left-1/2 -translate-x-1/2 bottom-full mb-2 px-3 py-2 rounded-lg text-xs font-medium whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none z-50 ${
                        isDarkMode
                          ? 'bg-gray-800 text-gray-200 border border-gray-700 shadow-xl'
                          : 'bg-gray-900 text-white shadow-xl'
                      }`}>
                        Oferta a fost acceptată. Contaoferta este dezactivată automat.
                        <div className={`absolute left-1/2 -translate-x-1/2 top-full w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent ${
                          isDarkMode ? 'border-t-gray-800' : 'border-t-gray-900'
                        }`}></div>
                      </div>
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex-1 relative">
                    <input
                      type="number"
                      value={counterOfferAmount || defaultCounterOffer}
                      onChange={(e) => !hasAcceptedBid && onCounterOfferChange(Number(e.target.value))}
                      min={highestBid + 1}
                      step="100"
                      disabled={hasAcceptedBid}
                      className={`w-full px-4 py-3 rounded-xl border text-sm font-medium transition-all duration-200 ${
                        hasAcceptedBid
                          ? isDarkMode
                            ? 'bg-gray-700/30 border-gray-600/30 text-gray-500 placeholder-gray-600 cursor-not-allowed'
                            : 'bg-gray-100 border-gray-300 text-gray-400 placeholder-gray-400 cursor-not-allowed'
                          : isDarkMode
                            ? 'bg-gray-700/50 border-gray-600/50 text-white placeholder-gray-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30'
                            : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 shadow-sm'
                      }`}
                      placeholder={hasAcceptedBid ? 'Contaoferta dezactivată' : `Minim ${formatPrice(highestBid + 100)}`}
                    />
                    <div className={`absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium ${
                      hasAcceptedBid
                        ? isDarkMode ? 'text-gray-600' : 'text-gray-400'
                        : isDarkMode ? 'text-gray-400' : 'text-gray-500'
                    }`}>
                      Lei
                    </div>
                  </div>
                  <div className="relative group">
                    <button
                      onClick={onCounterOffer}
                      disabled={hasAcceptedBid}
                      className={`px-5 py-3 rounded-xl font-semibold transition-all duration-200 flex items-center gap-2 shadow-lg ${
                        hasAcceptedBid
                          ? isDarkMode
                            ? 'bg-gray-700/30 border border-gray-600/30 text-gray-500 cursor-not-allowed'
                            : 'bg-gray-200 border border-gray-300 text-gray-400 cursor-not-allowed'
                          : isDarkMode
                            ? 'bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-500 hover:to-blue-600 text-white shadow-blue-500/30 hover:shadow-xl hover:shadow-blue-500/40 hover:scale-105 active:scale-95'
                            : 'bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white shadow-blue-400/40 hover:shadow-xl hover:shadow-blue-500/50 hover:scale-105 active:scale-95'
                      }`}
                    >
                      <i className="ri-arrow-up-line"></i>
                      <span>Contaofertă</span>
                    </button>
                    {hasAcceptedBid && (
                      <div className={`absolute left-1/2 -translate-x-1/2 bottom-full mb-2 px-3 py-2 rounded-lg text-xs font-medium whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none z-50 ${
                        isDarkMode
                          ? 'bg-gray-800 text-gray-200 border border-gray-700 shadow-xl'
                          : 'bg-gray-900 text-white shadow-xl'
                      }`}>
                        Oferta a fost acceptată. Contaoferta este dezactivată automat.
                        <div className={`absolute left-1/2 -translate-x-1/2 top-full w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent ${
                          isDarkMode ? 'border-t-gray-800' : 'border-t-gray-900'
                        }`}></div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
};

interface Product {
  id: string;
  title: string;
  description: string;
  category: string;
  subcategory: string;
  sku: string;
  startingPrice: number;
  productType?: 'live-bid' | 'details-only' | 'licitatii-publice' | 'buy-now';
  currency: 'RON' | 'EUR';
  status: 'draft' | 'active' | 'deleted' | 'reserved' | 'inactive' | 'sold';
  images: (string | { type: 'zip'; url?: string })[];
  createdAt: string;
  url?: string;
  slug?: string;
  approvalStatus?: 'pending' | 'approved' | 'rejected';
  rejectionReason?: string;
  bidCount?: number;
  isPremium?: boolean;
  premiumUntil?: string;
  user_id?: string;
}


export default function MyProductsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  /** Fără `?context=piese-auto` în URL, dealerii tot primesc formularul piese (JWT + același fallback ca /dashboard). */
  const urlPieseAutoContext = searchParams.get("context") === "piese-auto";
  const [isPieseAutoDealerAccount, setIsPieseAutoDealerAccount] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      return localStorage.getItem("accountType") === "piese_auto";
    } catch {
      return false;
    }
  });
  const isPieseAuto = urlPieseAutoContext || isPieseAutoDealerAccount;
  /** Titlu anunț (manual + Quick Add): limită afișare și salvare */
  const MANUAL_PRODUCT_TITLE_MAX_LENGTH = 120;
  const [products, setProducts] = useState<Product[]>([]);
  const [filterStatus, setFilterStatus] = useState<'all' | 'draft' | 'active' | 'reserved' | 'sold'>('active');
  const [searchTerm, setSearchTerm] = useState('');
  const [filterPremium, setFilterPremium] = useState<'all' | 'premium' | 'non-premium'>('all');
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'date' | 'price' | 'title'>('date');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const PAGE_SIZE_OPTIONS = [50, 75, 100, 250, 500] as const;
  const [selectedProductIds, setSelectedProductIds] = useState<Set<string>>(new Set());
  const [showBulkDeleteModal, setShowBulkDeleteModal] = useState(false);
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);
  const [bulkDeleteProgress, setBulkDeleteProgress] = useState<{ done: number; total: number } | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [selectedReviewUserId, setSelectedReviewUserId] = useState<string | null>(null);
  const [selectedReviewProductId, setSelectedReviewProductId] = useState<string | null>(null);
  const [selectedReviewType, setSelectedReviewType] = useState<'seller' | 'buyer' | null>(null);
  const [selectedReviewUserInfo, setSelectedReviewUserInfo] = useState<{
    firstName: string | null;
    lastName: string | null;
    avatarUrl: string | null;
    city: string | null;
    country: string | null;
  } | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const oblioStatus = useOblioStatus();
  const [hasSellerReview, setHasSellerReview] = useState<boolean>(false);
  const [hasBuyerReview, setHasBuyerReview] = useState<boolean>(false);
  const [newReviewRating, setNewReviewRating] = useState<number>(0);
  const [newReviewText, setNewReviewText] = useState<string>('');
  const [submittingReview, setSubmittingReview] = useState<boolean>(false);
  const [expandedLiveBidProducts, setExpandedLiveBidProducts] = useState<Set<string>>(new Set());
  const [expandedHistory, setExpandedHistory] = useState<Record<string, boolean>>({});
  const [productBids, setProductBids] = useState<Record<string, any[]>>({});
  const [loadingBids, setLoadingBids] = useState<Record<string, boolean>>({});
  const [counterOfferAmount, setCounterOfferAmount] = useState<Record<string, number>>({});
  const [acceptedBids, setAcceptedBids] = useState<Record<string, { bidId: string; acceptedAt: number }>>({});
  const [countdowns, setCountdowns] = useState<Record<string, number>>({});
  const [showNotificationModal, setShowNotificationModal] = useState(false);
  const [notificationModal, setNotificationModal] = useState<{
    type: 'success' | 'error' | 'info';
    title: string;
    message: string;
  } | null>(null);
  const [toastNotification, setToastNotification] = useState<{
    type: 'success' | 'error' | 'info';
    title: string;
    message: string;
  } | null>(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteModalData, setDeleteModalData] = useState<{
    productId: string;
    productTitle: string;
    productStatus?: string;
  } | null>(null);
  const [userInfo, setUserInfo] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    avatar: '',
    supabaseUserId: null as string | null
  });
  const [showChatModal, setShowChatModal] = useState(false);
  const [chatData, setChatData] = useState<{
    productId: string;
    buyerId: string;
    sellerId: string;
    otherUserInfo: { name: string; avatar?: string };
  } | null>(null);
  
  // State pentru design-ul de chat
  const [selectedConversation, setSelectedConversation] = useState<{ productId: string; buyerId: string } | null>(null);
  const [newCounterOfferAmount, setNewCounterOfferAmount] = useState<Record<string, string>>({});
  // State pentru mesaje necitite: key = `${productId}-${buyerId}`, value = număr de mesaje necitite
  const [unreadMessages, setUnreadMessages] = useState<Record<string, number>>({});
  
  // State pentru modal contraoferta
  const [showCounterOfferModalChat, setShowCounterOfferModalChat] = useState(false);
  const [counterOfferModalChatData, setCounterOfferModalChatData] = useState<{
    productId: string;
    bidId: string;
    currentAmount: number;
    currency: string;
    userName: string;
  } | null>(null);
  const [counterOfferAmountChat, setCounterOfferAmountChat] = useState<string>('');
  const [showCounterOfferAuthModal, setShowCounterOfferAuthModal] = useState(false);

  const goToAuthFromCounterOfferModal = useCallback(() => {
    setShowCounterOfferAuthModal(false);
    const redirect =
      typeof window !== "undefined"
        ? `${window.location.pathname}${window.location.search || ""}`
        : "/dashboard/my-products";
    router.push(`/auth?redirect=${encodeURIComponent(redirect)}`);
  }, [router]);
  
  // State pentru mesajele prietenoase în chat
  const [chatSystemMessages, setChatSystemMessages] = useState<Record<string, Array<{
    id: string;
    message: string;
    timestamp: number;
    isAlert?: boolean;
  }>>>({});

  // State pentru produsele vizionate recent
  const [recentlyViewedProducts, setRecentlyViewedProducts] = useState<Array<{
    id: string;
    title: string;
    image?: string;
    price?: number;
    currency?: string;
    slug?: string;
    url?: string;
    viewedAt: number;
  }>>([]);
  const recentlyViewedScrollRef = useRef<HTMLDivElement>(null);
  const [showRecentlyViewedModal, setShowRecentlyViewedModal] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  // Detect screen size for recently viewed products limit
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768); // md breakpoint
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Load dark mode from localStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('darkMode');
      if (saved !== null) {
        setIsDarkMode(saved === 'true');
      }
    }
  }, []);

  // Load recently viewed products from localStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('recentlyViewedProducts');
        console.log('[my-products] Recently viewed products from localStorage:', saved);
        if (saved) {
          const parsed = JSON.parse(saved);
          console.log('[my-products] Parsed recently viewed products:', parsed);
          // Sort by viewedAt descending and limit to 10
          const sorted = Array.isArray(parsed)
            ? parsed
                .sort((a: any, b: any) => b.viewedAt - a.viewedAt)
                .slice(0, 10)
            : [];
          console.log('[my-products] Sorted recently viewed products:', sorted);
          setRecentlyViewedProducts(sorted);
        } else {
          console.log('[my-products] No recently viewed products found in localStorage');
        }
      } catch (error) {
        console.error('Error loading recently viewed products:', error);
      }
    }
  }, []);

  // Verifică dacă există date de notificare în localStorage pentru a deschide conversația
  useEffect(() => {
    if (typeof window === 'undefined' || !currentUserId) return;
    
    const notificationDataStr = localStorage.getItem('notificationData');
    if (notificationDataStr) {
      try {
        const notificationData = JSON.parse(notificationDataStr);
        
        // Șterge datele din localStorage
        localStorage.removeItem('notificationData');
        
        // Dacă este pentru deschiderea unui chat sau conversație
        if (notificationData.openChat || notificationData.openConversation) {
          const { productId, chatId, senderId, bidId, buyerId } = notificationData;
          
          if (productId) {
            // Pentru mesaje de chat
            if (notificationData.openChat) {
              // Folosim buyerId-ul din localStorage dacă există, altfel folosim senderId
              const actualBuyerId = buyerId || senderId;
              if (actualBuyerId) {
                setTimeout(() => {
                  setSelectedConversation({ productId, buyerId: actualBuyerId });
                }, 500);
              }
            } else if (bidId) {
              // Pentru oferte, trebuie să găsim buyerId-ul din bid
              setTimeout(async () => {
                await loadProductBids(productId);
                // După ce se încarcă bid-urile, găsim buyerId-ul
                const bids = productBids[productId] || [];
                const bid = bids.find((b: any) => b.id === bidId);
                if (bid && bid.user_id) {
                  setSelectedConversation({ productId, buyerId: bid.user_id });
                }
              }, 500);
            }
          }
        }
      } catch (error) {
        console.error('[my-products] Error parsing notification data:', error);
      }
    }
  }, [currentUserId]);

  // Funcție helper pentru afișarea notificărilor
  const showNotification = useCallback((type: 'success' | 'error' | 'info', title: string, message: string, isToast: boolean = false) => {
    if (isToast) {
      // Toast notification - apare temporar
      setToastNotification({ type, title, message });
      setTimeout(() => {
        setToastNotification(null);
      }, 2000); // Dispare după 2 secunde
    } else {
      // Modal notification - apare până când utilizatorul o închide
      setNotificationModal({ type, title, message });
      setShowNotificationModal(true);
    }
  }, []);

  // Apply dark mode class to HTML element
  useEffect(() => {
    if (typeof window !== 'undefined') {
      if (isDarkMode) {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
    }
  }, [isDarkMode]);

  const toggleDarkMode = () => {
    const newMode = !isDarkMode;
    setIsDarkMode(newMode);
    if (typeof window !== 'undefined') {
      localStorage.setItem('darkMode', String(newMode));
    }
  };

  // Check authentication
  useEffect(() => {
    let cancelled = false;

    const checkAuth = async () => {
      try {
        const { user, accountType } = await resolveAccountTypeFromJwtOnly(supabase);
        const userId = user?.id;

        if (user && !cancelled) {
          let dealerPieseAuto = accountType === "piese_auto";
          if (typeof window !== "undefined") {
            const stored = localStorage.getItem("accountType");
            const jwtAccountType = accountType;
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
              dealerPieseAuto = true;
            }
          }
          setIsPieseAutoDealerAccount(dealerPieseAuto);
        }

        // Executor/lichidator: doar dacă JWT confirmă (evită redirect fals din metadata/localStorage în app)
        if (user) {
          const q = typeof window !== 'undefined' ? window.location.search : '';
          if (accountType === 'liquidator') {
            if (typeof window !== 'undefined') {
              window.location.replace(`/dashboard/lichidator/my-products${q}`);
            } else {
              router.replace(`/dashboard/lichidator/my-products${q}`);
            }
            return;
          }
          if (accountType === 'executor') {
            if (typeof window !== 'undefined') {
              window.location.replace(`/dashboard/executor/my-products${q}`);
            } else {
              router.replace(`/dashboard/executor/my-products${q}`);
            }
            return;
          }
        }

        if (!userId && typeof window !== 'undefined') {
          const savedUserInfo = localStorage.getItem('userInfo');
          const savedSupabaseUserId = localStorage.getItem('supabaseUserId');
          if (savedUserInfo) {
            try {
              const parsed = JSON.parse(savedUserInfo) as Record<string, unknown>;
              const fromKey =
                savedSupabaseUserId && looksLikeSupabaseUserId(savedSupabaseUserId)
                  ? savedSupabaseUserId
                  : null;
              const fromParsed =
                (looksLikeSupabaseUserId(parsed.supabaseUserId) ? String(parsed.supabaseUserId) : null) ||
                (looksLikeSupabaseUserId(parsed.userId) ? String(parsed.userId) : null) ||
                (looksLikeSupabaseUserId(parsed.id) ? String(parsed.id) : null);
              const fallbackUserId = fromKey || fromParsed;
              if (fallbackUserId) {
                if (!cancelled) {
                  setCurrentUserId(fallbackUserId);
                  setUserInfo((prev) => ({
                    ...prev,
                    ...(parsed as Record<string, string>),
                    supabaseUserId: fallbackUserId,
                  }));
                }
                return;
              }
            } catch (e) {
              console.error('[my-products] Error parsing userInfo from localStorage:', e);
            }
          }
        }

        if (!userId) {
          if (typeof window !== 'undefined') {
            const savedAdminInfo = localStorage.getItem('adminInfo');
            if (savedAdminInfo) {
              try {
                const adminInfo = JSON.parse(savedAdminInfo);
                if (adminInfo.isAdmin || adminInfo.role === 'manager') return;
              } catch (_) {
                /* ignore */
              }
            }
            if (hasDashboardLocalAuthEvidence()) {
              return;
            }
          }
          router.push('/auth?mode=login');
          return;
        }

        // Set currentUserId
        if (!cancelled) setCurrentUserId(userId);

        // Load user info from localStorage
        const storedUserInfo = localStorage.getItem('userInfo');
        if (storedUserInfo) {
          const parsed = JSON.parse(storedUserInfo);
          if (!cancelled) {
            setUserInfo(prev => ({
              ...prev,
              ...parsed,
              supabaseUserId: userId
            }));
          }
        } else {
          if (!cancelled) {
            setUserInfo(prev => ({
              ...prev,
              supabaseUserId: userId
            }));
          }
        }
      } catch (error) {
        console.error('Error checking auth:', error);
        if (typeof window !== 'undefined') {
          const savedUserInfo = localStorage.getItem('userInfo');
          const savedSupabaseUserId = localStorage.getItem('supabaseUserId');
          if (savedUserInfo) {
            try {
              const parsed = JSON.parse(savedUserInfo) as Record<string, unknown>;
              const fromKey =
                savedSupabaseUserId && looksLikeSupabaseUserId(savedSupabaseUserId)
                  ? savedSupabaseUserId
                  : null;
              const fromParsed =
                (looksLikeSupabaseUserId(parsed.supabaseUserId) ? String(parsed.supabaseUserId) : null) ||
                (looksLikeSupabaseUserId(parsed.userId) ? String(parsed.userId) : null) ||
                (looksLikeSupabaseUserId(parsed.id) ? String(parsed.id) : null);
              const fallbackUserId = fromKey || fromParsed;
              if (fallbackUserId && !cancelled) {
                setCurrentUserId(fallbackUserId);
                setUserInfo((prev) => ({
                  ...prev,
                  ...(parsed as Record<string, string>),
                  supabaseUserId: fallbackUserId,
                }));
                return;
              }
            } catch {
              /* ignore */
            }
          }
          const savedAdminInfo = localStorage.getItem('adminInfo');
          if (savedAdminInfo) {
            try {
              const adminInfo = JSON.parse(savedAdminInfo);
              if (adminInfo.isAdmin || adminInfo.role === 'manager') return;
            } catch (_) {
              /* ignore */
            }
          }
          if (hasDashboardLocalAuthEvidence()) return;
        }
        router.push('/auth?mode=login');
      }
    };

    void checkAuth();
    const retryTimer = setTimeout(() => { void checkAuth(); }, 1200);
    const { data: authListener } = supabase.auth.onAuthStateChange(
      (event: AuthChangeEvent, session: Session | null) => {
        if (event === "SIGNED_OUT") {
          setIsPieseAutoDealerAccount(false);
        }
        if (session?.user) void checkAuth();
      },
    );

    return () => {
      cancelled = true;
      clearTimeout(retryTimer);
      authListener.subscription.unsubscribe();
    };
    // Nu include router în deps: în App Router referința useRouter() poate fi nouă la fiecare render → mii de replace/push/sec.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const mapSupabaseProduct = useCallback((row: any): Product => {
    const images = Array.isArray(row?.images) ? row.images : [];
    const rawSub = String(row.subcategory ?? "");
    const rawCat = String(row.category ?? "");
    let category = rawCat;
    let subcategory = rawSub;
    if (rawSub.trim().toLowerCase() === PIESE_AUTO_SUBCATEGORY_SLUG) {
      subcategory = PIESE_AUTO_FORM_SUBCATEGORY_DISPLAY;
      category = PIESE_AUTO_FORM_CATEGORY_DISPLAY;
    } else if (rawCat.trim().toLowerCase() === PIESE_AUTO_CATEGORY_SLUG && !rawSub.trim()) {
      category = PIESE_AUTO_FORM_CATEGORY_DISPLAY;
    }

    return {
      id: row.id,
      title: row.title ?? '',
      description: row.description ?? '',
      category,
      subcategory,
      sku: row.sku ?? '',
      startingPrice:
        typeof row.starting_price === 'number'
          ? row.starting_price
          : row.starting_price_ron ?? 0,
      productType: (row.product_type ?? 'live-bid') as 'live-bid' | 'details-only' | 'licitatii-publice' | 'buy-now' | undefined,
      currency: row.currency === 'EUR' ? 'EUR' : 'RON',
      status: row.status === 'active' ? 'active' : row.status === 'deleted' ? 'deleted' : row.status === 'reserved' ? 'reserved' : row.status === 'inactive' ? 'inactive' : row.status === 'sold' ? 'sold' : 'draft',
      images,
      createdAt: row.created_at ?? new Date().toISOString(),
      url: row.url ?? undefined,
      slug: row.slug ?? undefined,
      approvalStatus: row.approval_status ?? 'approved',
      rejectionReason: row.rejection_reason ?? undefined,
      isPremium: row.is_premium ?? false,
      premiumUntil: row.premium_until ?? undefined,
      user_id: row.user_id ?? undefined,
    };
  }, []);

  const loadProducts = useCallback(async () => {
    setIsLoading(true);
    try {
      const session = await recoverDashboardSessionIfNeeded(supabase);
      const userId =
        session?.user?.id ||
        currentUserId ||
        userInfo.supabaseUserId ||
        (typeof window !== 'undefined' ? localStorage.getItem('supabaseUserId') : null);

      if (!userId) {
        setProducts([]);
        return;
      }

      // Obține toate produsele utilizatorului (fără limită – paginare cursor după created_at pentru >1000)
      const PAGE_SIZE = 1000;
      const allRows: any[] = [];
      let lastCreatedAt: string | null = null;
      let hasMore = true;
      while (hasMore) {
        let query = supabase
          .from('products')
          .select('*')
          .eq('user_id', userId)
          .neq('status', 'deleted')
          .order('created_at', { ascending: false })
          .limit(PAGE_SIZE);
        if (lastCreatedAt) {
          query = query.lt('created_at', lastCreatedAt);
        }
        const { data: chunk, error } = await query;

        if (error) {
          const hasErrorInfo = error.message || error.details || error.hint || error.code;
          if (hasErrorInfo) {
            console.error('[loadProducts] Supabase error:', { message: error.message, details: error.details, hint: error.hint, code: error.code });
          } else {
            console.warn('[loadProducts] Supabase returned empty error object');
          }
          throw error;
        }
        const list = chunk ?? [];
        allRows.push(...list);
        if (list.length > 0) {
          lastCreatedAt = list[list.length - 1].created_at;
        }
        hasMore = list.length === PAGE_SIZE;
      }

      const data = allRows;
      if (data.length > 0) {
        console.log('[loadProducts] Produse încărcate:', data.length, data.slice(0, 3).map((p: any) => ({ id: p.id, title: p.title, status: p.status })));
      }

      // Obține numărul de oferte pentru fiecare produs (batch pentru multe ID-uri)
      const productIds = data.map((p: any) => p.id);
      const bidCounts: Record<string, number> = {};
      const BID_BATCH = 200;
      for (let i = 0; i < productIds.length; i += BID_BATCH) {
        const batch = productIds.slice(i, i + BID_BATCH);
        try {
          const { data: bidsData, error: bidsError } = await supabase
            .from('bids')
            .select('product_id')
            .in('product_id', batch);
          if (!bidsError && bidsData) {
            bidsData.forEach((bid: any) => {
              if (bid.product_id) bidCounts[bid.product_id] = (bidCounts[bid.product_id] || 0) + 1;
            });
          }
        } catch (bidsErr) {
          console.error('Error fetching bid counts:', bidsErr);
        }
      }

      const mapped = data.map((row: any) => {
        const product = mapSupabaseProduct(row);
        return {
          ...product,
          bidCount: bidCounts[row.id] || 0
        };
      });
      setProducts(mapped);
    } catch (error: any) {
      // Verifică dacă eroarea are informații utile înainte de a o loga
      const errorMessage = error?.message;
      const errorDetails = error?.details;
      const errorHint = error?.hint;
      const errorCode = error?.code;
      const hasErrorInfo = errorMessage || errorDetails || errorHint || errorCode;
      
      if (hasErrorInfo) {
        console.error('❌ Eroare la încărcarea produselor:', {
          message: errorMessage,
          details: errorDetails,
          hint: errorHint,
          code: errorCode,
          stack: error?.stack
        });
      } else {
        // Dacă eroarea este goală sau nu are informații utile, nu o logăm ca eroare
        console.warn('[loadProducts] Error object is empty or has no useful information - this may be a non-critical issue');
      }
      setProducts([]);
    } finally {
      setIsLoading(false);
    }
  }, [currentUserId, mapSupabaseProduct, userInfo.supabaseUserId]);

  useEffect(() => {
    if (userInfo.supabaseUserId) {
      loadProducts();
    }
  }, [userInfo.supabaseUserId, loadProducts]);

  // Încarcă mesajele necitite pentru toate conversațiile
  useEffect(() => {
    const loadUnreadMessages = async () => {
      if (!currentUserId || products.length === 0) return;

      try {
        // Colectează toate conversațiile unice (productId + buyerId)
        const conversations: Array<{ productId: string; buyerId: string }> = [];
        
        products.forEach(product => {
          const bids = productBids[product.id] || [];
          const buyers = new Set(bids.map((bid: any) => bid.user_id).filter((id: string) => id && id !== currentUserId));
          buyers.forEach(buyerId => {
            conversations.push({ productId: product.id, buyerId });
          });
        });

        if (conversations.length === 0) {
          setUnreadMessages({});
          return;
        }

        // Găsește chat-urile pentru aceste conversații
        const productIds = [...new Set(conversations.map(c => c.productId))];
        const { data: chats } = await supabase
          .from('product_chats')
          .select('id, product_id, buyer_user_id, seller_user_id')
          .in('product_id', productIds)
          .eq('seller_user_id', currentUserId);

        if (!chats || chats.length === 0) {
          setUnreadMessages({});
          return;
        }

        // Creează un map de chat-uri: key = `${productId}-${buyerId}`
        const chatMap: Record<string, string> = {};
        chats.forEach((chat: { id: string; product_id: string; buyer_user_id: string }) => {
          const key = `${chat.product_id}-${chat.buyer_user_id}`;
          chatMap[key] = chat.id;
        });

        // Încarcă mesajele necitite pentru fiecare chat
        const chatIds = Object.values(chatMap);
        const { data: unreadMessagesData } = await supabase
          .from('product_chat_messages')
          .select('chat_id, sender_user_id')
          .in('chat_id', chatIds)
          .eq('is_read', false)
          .neq('sender_user_id', currentUserId);

        if (!unreadMessagesData) {
          setUnreadMessages({});
          return;
        }

        // Numără mesajele necitite pentru fiecare conversație
        const unreadCounts: Record<string, number> = {};
        unreadMessagesData.forEach((msg: { chat_id: string; sender_user_id?: string }) => {
          // Găsește conversația corespunzătoare acestui chat_id
          const conversationKey = Object.keys(chatMap).find(key => chatMap[key] === msg.chat_id);
          if (conversationKey) {
            unreadCounts[conversationKey] = (unreadCounts[conversationKey] || 0) + 1;
          }
        });

        setUnreadMessages(unreadCounts);
      } catch (error) {
        console.error('[loadUnreadMessages] Error loading unread messages:', error);
      }
    };

    loadUnreadMessages();
    
    // Reîncarcă mesajele necitite la fiecare 5 secunde
    const interval = setInterval(loadUnreadMessages, 5000);
    
    return () => clearInterval(interval);
  }, [currentUserId, products, productBids]);

  // Marchează mesajele ca citite când se deschide conversația
  useEffect(() => {
    const markMessagesAsRead = async () => {
      if (!selectedConversation || !currentUserId) return;

      const { productId, buyerId } = selectedConversation;
      const conversationKey = `${productId}-${buyerId}`;
      
      // Dacă nu există mesaje necitite, nu face nimic
      if (!unreadMessages[conversationKey]) return;

      try {
        // Găsește chat-ul pentru această conversație
        const { data: chat } = await supabase
          .from('product_chats')
          .select('id')
          .eq('product_id', productId)
          .eq('buyer_user_id', buyerId)
          .eq('seller_user_id', currentUserId)
          .maybeSingle();

        if (!chat) return;

        // Marchează toate mesajele necitite ca citite
        await supabase
          .from('product_chat_messages')
          .update({ is_read: true })
          .eq('chat_id', chat.id)
          .eq('is_read', false)
          .neq('sender_user_id', currentUserId);

        // Elimină conversația din lista de mesaje necitite
        setUnreadMessages(prev => {
          const newState = { ...prev };
          delete newState[conversationKey];
          return newState;
        });
      } catch (error) {
        console.error('[markMessagesAsRead] Error marking messages as read:', error);
      }
    };

    markMessagesAsRead();
  }, [selectedConversation, currentUserId, unreadMessages]);

  // Get unique categories for filters
  const uniqueCategories = Array.from(new Set(products.map(p => p.category).filter(Boolean))).sort();

  const filteredProducts = products.filter(product => {
    const matchesStatus =
      filterStatus === 'all' ||
      (filterStatus === 'draft'
        ? product.status === 'inactive'
        : filterStatus === 'sold'
        ? product.status === 'sold'
        : product.status === filterStatus);
    const matchesSearch = searchTerm === '' || 
      product.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      product.sku.toLowerCase().includes(searchTerm.toLowerCase()) ||
      product.category.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesPremium = 
      filterPremium === 'all' ||
      (filterPremium === 'premium' && product.isPremium) ||
      (filterPremium === 'non-premium' && !product.isPremium);
    const matchesCategory = filterCategory === 'all' || product.category === filterCategory;
    return matchesStatus && matchesSearch && matchesPremium && matchesCategory;
  }).sort((a, b) => {
    // Premium products first
    if (a.isPremium && !b.isPremium) return -1;
    if (!a.isPremium && b.isPremium) return 1;
    
    // Then sort by selected criteria
    if (sortBy === 'price') {
      return b.startingPrice - a.startingPrice;
    } else if (sortBy === 'title') {
      return a.title.localeCompare(b.title);
    } else { // date (default)
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    }
  });

  const activeProducts = products.filter(p => p.status === 'active');
  const draftProducts = products.filter(p => p.status === 'inactive');
  const reservedProducts = products.filter(p => p.status === 'reserved');
  const soldProducts = products.filter(p => p.status === 'sold');

  const totalFiltered = filteredProducts.length;
  const totalPages = Math.max(1, Math.ceil(totalFiltered / pageSize));
  const paginatedProducts = filteredProducts.slice((page - 1) * pageSize, page * pageSize);
  const fromItem = totalFiltered === 0 ? 0 : (page - 1) * pageSize + 1;
  const toItem = Math.min(page * pageSize, totalFiltered);

  useEffect(() => {
    setPage(1);
  }, [filterStatus, searchTerm, filterPremium, filterCategory, sortBy]);

  const toggleSelect = useCallback((id: string) => {
    setSelectedProductIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);
  const toggleSelectAllOnPage = useCallback(() => {
    const idsOnPage = paginatedProducts.map((p) => p.id);
    const allSelected = idsOnPage.every((id) => selectedProductIds.has(id));
    setSelectedProductIds((prev) => {
      const next = new Set(prev);
      if (allSelected) idsOnPage.forEach((id) => next.delete(id));
      else idsOnPage.forEach((id) => next.add(id));
      return next;
    });
  }, [paginatedProducts, selectedProductIds]);
  const clearSelection = useCallback(() => setSelectedProductIds(new Set()), []);

  const BULK_DELETE_CHUNK_SIZE = 50;

  const handleBulkDeleteConfirm = useCallback(async () => {
    const ids = Array.from(selectedProductIds);
    if (ids.length === 0) {
      setShowBulkDeleteModal(false);
      return;
    }
    setIsBulkDeleting(true);
    setBulkDeleteProgress({ done: 0, total: ids.length });
    try {
      let totalDeleted = 0;
      for (let i = 0; i < ids.length; i += BULK_DELETE_CHUNK_SIZE) {
        const chunk = ids.slice(i, i + BULK_DELETE_CHUNK_SIZE);
        const res = await dashboardApiFetchWithOptionalBearer(supabase, '/api/products/delete-bulk', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ productIds: chunk }),
        });
        const json = await res.json();
        if (!res.ok) {
          showNotification('error', 'Eroare', json.error || 'Nu s-au putut șterge produsele.');
          setBulkDeleteProgress(null);
          return;
        }
        totalDeleted += json.deletedCount ?? chunk.length;
        setBulkDeleteProgress({ done: Math.min(i + chunk.length, ids.length), total: ids.length });
      }
      showNotification('success', 'Șters', `${totalDeleted} produse șterse.`);
      clearSelection();
      setShowBulkDeleteModal(false);
      setBulkDeleteProgress(null);
      await loadProducts();
    } catch (e: unknown) {
      showNotification('error', 'Eroare', e instanceof Error ? e.message : 'Eroare la ștergere.');
      setBulkDeleteProgress(null);
    } finally {
      setIsBulkDeleting(false);
    }
  }, [selectedProductIds, clearSelection, loadProducts, showNotification]);

  const isAllOnPageSelected = paginatedProducts.length > 0 && paginatedProducts.every((p) => selectedProductIds.has(p.id));
  const isSomeOnPageSelected = paginatedProducts.some((p) => selectedProductIds.has(p.id));
  const selectAllCheckboxRef = React.useRef<HTMLInputElement | null>(null);
  React.useEffect(() => {
    const el = selectAllCheckboxRef.current;
    if (el) el.indeterminate = isSomeOnPageSelected && !isAllOnPageSelected;
  }, [isSomeOnPageSelected, isAllOnPageSelected]);

  const getStatusBadge = (status: string, approvalStatus?: string) => {
    if (approvalStatus === 'pending') {
      return (
        <span className="text-xs font-semibold text-yellow-600 dark:text-yellow-400">
          În așteptare
        </span>
      );
    }
    if (status === 'sold') {
      return (
        <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400">
          Vândut
        </span>
      );
    }
    if (status === 'reserved') {
      return (
        <span className="text-xs font-bold text-black">
          Rezervat
        </span>
      );
    }
    if (approvalStatus === 'rejected') {
      return (
        <span className="text-xs font-semibold text-red-600 dark:text-red-400">
          Respins
        </span>
      );
    }
    if (status === 'active') {
      return (
        <span className="text-xs font-semibold text-green-600 dark:text-green-400">
          Activ
        </span>
      );
    }
    if (status === 'inactive') {
      return (
        <span className="text-xs font-semibold text-amber-600 dark:text-amber-400">
          Inactiv
        </span>
      );
    }
    return (
      <span className="text-xs font-semibold text-gray-600 dark:text-gray-400">
        Draft
      </span>
    );
  };

  const formatPrice = (price: number, currency: string) => {
    return `${price.toLocaleString('ro-RO')} ${currency}`;
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('ro-RO', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
  };

  const formatFileSize = (bytes?: number): string => {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
  };

  const handleEdit = useCallback(async (productId: string) => {
    try {
      const loaded = await fetchMyProductRowForEdit(supabase, productId);
      if (!loaded.ok) {
        showNotification(
          'error',
          loaded.httpStatus === 401 ? 'Autentificare necesară' : 'Eroare',
          loaded.httpStatus === 401
            ? 'Trebuie să fii autentificat pentru a edita anunțul.'
            : loaded.message
        );
        return;
      }
      const row = loaded.row as Record<string, any>;
      const cf = row.custom_fields || {};
      setManualFormData({
        title: String(row.title ?? '').slice(0, MANUAL_PRODUCT_TITLE_MAX_LENGTH),
        description: row.description ?? '',
        category: isPieseAuto ? pieseAutoCategoryFromDbToFormDisplay(row.category) : (row.category ?? ''),
        subcategory: isPieseAuto ? pieseAutoSubcategoryFromDbToFormDisplay(row.subcategory) : (row.subcategory ?? ''),
        categoryLevel3: row.category_level_3 ?? '',
        size: row.size ?? '',
        brand: row.brand ?? cf.marca ?? cf.brand ?? '',
        model: cf.model ?? cf.model_label ?? '',
        capacitateCilindrica: cf.capacitate_cilindrica ?? cf.capacitateCilindrica ?? '',
        ram: cf.ram ?? '',
        capacitateStocare: cf.capacitate_stocare ?? cf.capacitateStocare ?? '',
        garantie: cf.garantie ?? '',
        color: row.color ?? '',
        condition: normalizeConditionForForm(row.condition),
        sku: row.sku ?? '',
        currency: (row.currency === 'EUR' ? 'EUR' : 'RON') as 'RON' | 'EUR',
        productType: 'live-bid',
        buyNowEnabled: !!cf.buy_now_enabled,
        buyNowPriceRON: cf.buy_now_price_ron ?? null,
        buyNowPriceEUR: cf.buy_now_price_eur ?? null,
        isFreeListing: cf.is_free_listing === true || cf.isFreeListing === true,
        isUrgent: cf.is_urgent === true || cf.isUrgent === true,
        county: row.county ?? '',
        city: row.city ?? '',
        village: cf.village ?? '',
        address: row.address ?? '',
        coordinates: row.coordinates ?? cf.coordinates ?? undefined,
        images: Array.isArray(row.images) ? row.images : [],
        customFields: typeof cf === 'object' && cf !== null ? { ...cf } : {},
        status: (row.status === 'draft' ? 'draft' : row.status === 'active' ? 'active' : 'active') as 'draft' | 'active',
      });
      setManualFormPriceRon(Number(row.starting_price_ron ?? row.starting_price) || 0);
      setManualFormPriceEur(Number(row.starting_price_eur) || 0);
      setManualFormSEO(row.seo && typeof row.seo === 'object' ? {
        title: row.seo.title ?? '',
        description: row.seo.description ?? '',
        keywords: Array.isArray(row.seo.keywords) ? row.seo.keywords : [],
      } : { title: '', description: '', keywords: [] });
      setManualFormBuyNowPriceRon(cf.buy_now_price_ron ?? null);
      setManualFormBuyNowPriceEur(cf.buy_now_price_eur ?? null);
      setManualFormSelectedImageFiles([]);
      setManualFormSkuEditable(true);
      setEditingProductId(productId);
      setEditingProductRow(row);
      setShowManualAddModal(true);
    } catch (e: any) {
      showNotification('error', 'Eroare', e?.message ?? 'Nu s-a putut deschide formularul de editare.');
    }
  }, [showNotification, isPieseAuto]);

  const handleDeleteClick = useCallback((productId: string, productTitle: string, productStatus?: string) => {
    setDeleteModalData({ productId, productTitle, productStatus });
    setShowDeleteModal(true);
  }, []);

  const handleDeleteConfirm = useCallback(async () => {
    if (!deleteModalData) return;

    const { productId, productTitle } = deleteModalData;

    try {
      const result = await updateMyProductStatus(supabase, productId, "inactive");
      if (!result.ok) {
        showNotification(
          "error",
          result.httpStatus === 401 ? "Autentificare necesară" : "Eroare",
          result.httpStatus === 401
            ? "Trebuie să fii autentificat pentru a dezactiva anunțuri."
            : result.message
        );
        setShowDeleteModal(false);
        setDeleteModalData(null);
        return;
      }

      showNotification('success', 'Succes!', 'Anunțul a fost dezactivat. Va fi șters automat după 3 luni dacă nu este reactivat.');
      
      // Reîncarcă lista de produse
      await loadProducts();
      
      // Închide modalul
      setShowDeleteModal(false);
      setDeleteModalData(null);
    } catch (error: any) {
      console.error('Error deleting product:', error);
      showNotification('error', 'Eroare', 'Eroare la dezactivarea anunțului: ' + (error.message || 'Eroare necunoscută'));
      setShowDeleteModal(false);
      setDeleteModalData(null);
    }
  }, [deleteModalData, loadProducts, showNotification]);

  const handleActivateProduct = useCallback(async (productId: string) => {
    try {
      const result = await updateMyProductStatus(supabase, productId, "active");
      if (!result.ok) {
        showNotification(
          "error",
          result.httpStatus === 401 ? "Autentificare necesară" : "Eroare",
          result.httpStatus === 401 ? "Trebuie să fii autentificat." : result.message
        );
        return;
      }
      const { trackGoogleConversion } = await import("@/lib/analytics/googleAds");
      trackGoogleConversion("listing_published", { dedupeKey: productId });
      showNotification('success', 'Succes!', 'Anunțul a fost reactivat.');
      await loadProducts();
    } catch (error: any) {
      console.error('Error activating product:', error);
      showNotification('error', 'Eroare', 'Eroare la reactivare: ' + (error.message || 'Eroare necunoscută'));
    }
  }, [loadProducts, showNotification]);

  // Funcție pentru marcarea produsului ca rezervat
  const handleReserveProduct = useCallback(async (productId: string) => {
    try {
      const result = await updateMyProductStatus(supabase, productId, "reserved");
      if (!result.ok) {
        showNotification(
          "error",
          result.httpStatus === 401 ? "Autentificare necesară" : "Eroare",
          result.httpStatus === 401
            ? "Trebuie să fii autentificat pentru a marca produsul ca rezervat."
            : result.message
        );
        return;
      }

      showNotification('success', 'Succes!', 'Produsul a fost marcat ca rezervat.');
      await loadProducts();
    } catch (error: any) {
      console.error('Error reserving product:', error);
      showNotification('error', 'Eroare', 'Eroare la marcarea produsului ca rezervat: ' + (error.message || 'Eroare necunoscută'));
    }
  }, [loadProducts, showNotification]);

  // Funcție pentru marcarea produsului ca vândut
  const handleMarkAsSold = useCallback(async (productId: string) => {
    try {
      const result = await updateMyProductStatus(supabase, productId, "sold");
      if (!result.ok) {
        showNotification(
          "error",
          result.httpStatus === 401 ? "Autentificare necesară" : "Eroare",
          result.httpStatus === 401
            ? "Trebuie să fii autentificat pentru a marca produsul ca vândut."
            : result.message
        );
        return;
      }
      showNotification('success', 'Succes!', 'Produsul a fost marcat ca vândut.');
      await loadProducts();
    } catch (error: any) {
      console.error('Error marking product as sold:', error);
      showNotification('error', 'Eroare', 'Eroare la marcarea produsului ca vândut: ' + (error.message || 'Eroare necunoscută'));
    }
  }, [loadProducts, showNotification]);

  // Funcție pentru încărcarea ofertelor unui produs
  const loadProductBids = useCallback(async (productId: string) => {
    setLoadingBids(prev => ({ ...prev, [productId]: true }));
    
    try {
      // Găsește produsul pentru a obține slug-ul sau ID-ul real
      const product = products.find(p => p.id === productId);
      if (!product) {
        console.warn('[loadProductBids] Product not found for bid loading:', productId);
        setProductBids(prev => ({ ...prev, [productId]: [] }));
        setLoadingBids(prev => ({ ...prev, [productId]: false }));
        return;
      }

      // Folosește ID-ul produsului din Supabase (poate fi diferit de productId dacă este slug)
      const actualProductId = product.id || productId;

      // Verifică dacă actualProductId este valid
      if (!actualProductId) {
        console.error('[loadProductBids] Invalid productId:', productId, 'product:', product);
        setProductBids(prev => ({ ...prev, [productId]: [] }));
        setLoadingBids(prev => ({ ...prev, [productId]: false }));
        return;
      }

      // Încearcă să obțină ofertele
      console.log('[loadProductBids] Loading bids for productId:', actualProductId, 'type:', typeof actualProductId);
      
      try {
        // Verifică dacă supabase este disponibil
        if (!supabase) {
          console.error('[loadProductBids] Supabase client not available');
          setProductBids(prev => ({ ...prev, [productId]: [] }));
          setLoadingBids(prev => ({ ...prev, [productId]: false }));
          return;
        }

        console.log('[loadProductBids] Querying bids table for product_id:', actualProductId);
        
        const { data: bids, error } = await supabase
          .from('bids')
          .select('id, amount, created_at, is_winning, is_outbid, user_id')
          .eq('product_id', actualProductId)
          .order('amount', { ascending: false })
          .order('created_at', { ascending: false });

        if (error) {
          console.error('[loadProductBids] Error loading bids:', error);
          console.error('[loadProductBids] Error details:', {
            message: error.message,
            details: error.details,
            hint: error.hint,
            code: error.code,
            error: JSON.stringify(error, null, 2)
          });
          
          // Dacă eroarea este goală, poate fi o problemă cu RLS - continuă cu array gol
          if (!error.message && !error.details) {
            console.warn('[loadProductBids] Empty error object - possible RLS issue. Setting empty bids array.');
          }
          
          // Don't throw, just set empty array
          setProductBids(prev => ({ ...prev, [productId]: [] }));
          setLoadingBids(prev => ({ ...prev, [productId]: false }));
          return;
        }

        console.log('[loadProductBids] Bids loaded:', bids?.length || 0);
        
        if (!bids || bids.length === 0) {
          setProductBids(prev => ({ ...prev, [productId]: [] }));
          setLoadingBids(prev => ({ ...prev, [productId]: false }));
          // Resetează acceptarea dacă nu există oferte
          setAcceptedBids(prev => {
            const newState = { ...prev };
            delete newState[productId];
            return newState;
          });
          setCountdowns(prev => {
            const newState = { ...prev };
            delete newState[productId];
            return newState;
          });
          return;
        }

        // Verifică dacă există o ofertă acceptată (is_winning = true) în Supabase
        const winningBid = bids.find((bid: any) => bid.is_winning === true);
        if (winningBid) {
          console.log('[loadProductBids] Found winning bid:', winningBid.id);
          // Setează oferta acceptată din Supabase
          setAcceptedBids(prev => ({
            ...prev,
            [productId]: { bidId: winningBid.id, acceptedAt: Date.now() }
          }));
          // Nu mai setăm countdown dacă oferta este deja acceptată permanent în Supabase
          // Countdown-ul este doar pentru acceptările noi (temporare)
          setCountdowns(prev => {
            const newState = { ...prev };
            // Dacă nu există deja un countdown activ, nu setăm unul nou
            // (oferta este deja acceptată permanent)
            if (!newState[productId]) {
              // Nu setăm countdown pentru ofertele deja acceptate permanent
            }
            return newState;
          });
        } else {
          // Nu există ofertă acceptată în Supabase, resetează state-ul local
          setAcceptedBids(prev => {
            const newState = { ...prev };
            delete newState[productId];
            return newState;
          });
          setCountdowns(prev => {
            const newState = { ...prev };
            delete newState[productId];
            return newState;
          });
        }

        // Încarcă profilele utilizatorilor pentru fiecare ofertă
        // Colectează toate user_id-urile unice
        const userIds: string[] = Array.from(
          new Set(
            (bids || [])
              .map((bid: { user_id?: string | null }) => bid.user_id)
              .filter(
                (id: string | null | undefined): id is string =>
                  typeof id === "string" && id.length > 0,
              ),
          ),
        );
        
        console.log('[loadProductBids] Loading profiles for user_ids:', userIds);
        
        // Încarcă toate profilele dintr-un singur request prin API route (bypass RLS)
        let profilesMap: Record<string, any> = {};
        let ratingsMap: Record<string, { avgRating: number; reviewCount: number }> = {};
        
        if (userIds.length > 0) {
          try {
            const response = await dashboardApiFetch('/api/admin/users/profiles', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ userIds }),
            });

            if (response.ok) {
              const result = await response.json();
              console.log('[loadProductBids] API response:', result);
              if (result.success && result.profiles && Array.isArray(result.profiles)) {
                result.profiles.forEach((profile: any) => {
                  if (profile.user_id) {
                    profilesMap[profile.user_id] = {
                      first_name: profile.first_name,
                      last_name: profile.last_name,
                      avatar_url: profile.avatar_url
                    };
                  }
                });
                console.log('[loadProductBids] ✅ Loaded profiles via API:', Object.keys(profilesMap).length, 'profiles:', profilesMap);
              } else {
                console.warn('[loadProductBids] API response format unexpected:', result);
              }
            } else {
              const errorText = await response.text();
              console.error('[loadProductBids] API route failed with status:', response.status, 'error:', errorText);
              console.warn('[loadProductBids] API route failed, falling back to direct query');
              // Fallback: încarcă profilele direct (poate funcționa dacă RLS permite)
              const profilesPromises = userIds.map(async (userId: string) => {
                try {
                  const { data: profile } = await supabase
                    .from('user_profiles')
                    .select('user_id, first_name, last_name, avatar_url')
                    .eq('user_id', userId)
                    .maybeSingle();
                  return profile ? { user_id: userId, profile } : null;
                } catch (error) {
                  console.warn('[loadProductBids] Error loading profile for', userId, error);
                  return null;
                }
              });
              
              const profilesResults = await Promise.all(profilesPromises);
              profilesResults.forEach((result) => {
                if (result && result.profile) {
                  profilesMap[result.user_id] = result.profile;
                }
              });
            }
          } catch (apiError) {
            console.error('[loadProductBids] Error loading profiles via API:', apiError);
          }

          // Încarcă rating-urile pentru toți utilizatorii prin API route
          try {
            console.log('[loadProductBids] Loading ratings for user_ids:', userIds);
            
            // Folosește API route pentru a obține rating-urile (bypass RLS)
            const ratingsPromises = userIds.map(async (userId: string) => {
              try {
                const response = await dashboardApiFetch(`/api/reviews?userId=${userId}`);
                if (response.ok) {
                  const result = await response.json();
                  console.log('[loadProductBids] Rating API response for', userId, ':', result);
                  if (result.success && result.avgRating > 0) {
                    return {
                      userId,
                      avgRating: result.avgRating,
                      reviewCount: result.reviewCount || 0
                    };
                  } else {
                    console.log('[loadProductBids] No rating found for', userId, 'avgRating:', result.avgRating);
                  }
                } else {
                  const errorText = await response.text();
                  console.warn('[loadProductBids] Rating API failed for', userId, ':', response.status, errorText);
                }
                return null;
              } catch (error) {
                console.warn('[loadProductBids] Error loading rating for', userId, error);
                return null;
              }
            });

            const ratingsResults = await Promise.all(ratingsPromises);
            ratingsResults.forEach((result) => {
              if (result) {
                ratingsMap[result.userId] = {
                  avgRating: result.avgRating,
                  reviewCount: result.reviewCount
                };
              }
            });

            console.log('[loadProductBids] ✅ Loaded ratings:', ratingsMap, 'Total ratings:', Object.keys(ratingsMap).length);
          } catch (ratingsError) {
            console.warn('[loadProductBids] Error loading ratings:', ratingsError);
          }
        }
        
        // Mapare bids cu profilele și rating-urile
        const bidsWithProfiles = (bids || []).map((bid: any) => {
          const profile = bid.user_id ? profilesMap[bid.user_id] : null;
          const rating = bid.user_id ? ratingsMap[bid.user_id] : null;
          
          if (profile) {
            console.log('[loadProductBids] ✅ Profile found for bid:', bid.id, {
              userId: bid.user_id,
              firstName: profile.first_name,
              lastName: profile.last_name,
              hasAvatar: !!profile.avatar_url,
              rating: rating?.avgRating || null,
              reviewCount: rating?.reviewCount || 0
            });
          } else if (bid.user_id) {
            console.warn('[loadProductBids] No profile found for user_id:', bid.user_id);
          }
          
          // Debug: verifică dacă rating-ul există
          if (bid.user_id && !rating) {
            console.log('[loadProductBids] ⚠️ No rating found for user_id:', bid.user_id, 'ratingsMap keys:', Object.keys(ratingsMap));
          }
          
          return {
            ...bid,
            user_profiles: profile || null,
            user_rating: rating || null
          };
        });
        
        console.log('[loadProductBids] ✅ Total bids with profiles:', bidsWithProfiles.length);
        console.log('[loadProductBids] Bids summary:', bidsWithProfiles.map((b: any) => ({
          id: b.id,
          amount: b.amount,
          userId: b.user_id,
          hasProfile: !!b.user_profiles,
          profileName: b.user_profiles ? `${b.user_profiles.first_name || ''} ${b.user_profiles.last_name || ''}`.trim() : 'No profile'
        })));
        
        setProductBids(prev => ({ ...prev, [productId]: bidsWithProfiles || [] }));
        setLoadingBids(prev => ({ ...prev, [productId]: false }));
      } catch (bidsError: any) {
        console.error('[loadProductBids] Error in bids processing:', bidsError);
        setProductBids(prev => ({ ...prev, [productId]: [] }));
        setLoadingBids(prev => ({ ...prev, [productId]: false }));
      }
    } catch (error: any) {
      console.error('[loadProductBids] Error loading product bids:', error);
      console.error('[loadProductBids] Error stack:', error.stack);
      setProductBids(prev => ({ ...prev, [productId]: [] }));
      setLoadingBids(prev => ({ ...prev, [productId]: false }));
    }
  }, [products]);

  // Funcție pentru redirect către pagina ofertele_mele (pentru butonul "Vezi ofertele")
  const goToMyBids = useCallback(() => {
    router.push('/dashboard/ofertele_mele');
    // eslint-disable-next-line react-hooks/exhaustive-deps -- router ref instabilă în Next App Router
  }, []);

  // Funcție pentru toggle panel-ul Live Bid - deschide panel-ul cu conversații (pentru click pe rând)
  const toggleLiveBidPanel = useCallback(async (productId: string) => {
    // Verifică dacă există un panel deschis pentru acest produs
    const isOpen = selectedConversation?.productId === productId;
    if (isOpen) {
      // Dacă este deja selectat, închide
      setSelectedConversation(null);
    } else {
      // Setează conversația selectată (fără buyerId, doar pentru a deschide panel-ul)
      // Încarcă ofertele dacă nu sunt deja încărcate
      if (!productBids[productId] && !loadingBids[productId]) {
        await loadProductBids(productId);
      }
      // Deschide panel-ul cu lista de conversații
      setSelectedConversation({ productId, buyerId: '' });
    }
  }, [selectedConversation, productBids, loadingBids, loadProductBids]);
  
  // Funcție pentru a grupa ofertele după produs și cumpărător
  const getConversationsByProduct = useCallback((productId: string) => {
    const bids = productBids[productId] || [];
    // Grupează ofertele după user_id (cumpărător)
    const bidsByBuyer = bids.reduce((acc, bid) => {
      if (bid.user_id === currentUserId) return acc; // Ignoră ofertele vânzătorului
      const buyerId = bid.user_id;
      if (!acc[buyerId]) {
        acc[buyerId] = {
          buyerId,
          buyerInfo: bid.user_profiles || null,
          bids: []
        };
      }
      acc[buyerId].bids.push(bid);
      return acc;
    }, {} as Record<string, { buyerId: string; buyerInfo: any; bids: any[] }>);

    type Conv = { buyerId: string; buyerInfo: any; bids: any[] };
    const convs: Conv[] = Object.values(bidsByBuyer) as Conv[];
    return convs.map(conv => {
      const sorted = [...conv.bids].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      return {
        buyerId: conv.buyerId,
        buyerInfo: conv.buyerInfo,
        bids: conv.bids,
        latestBid: sorted[0],
        highestBid: conv.bids.length ? Math.max(...conv.bids.map(b => b.amount || 0)) : 0
      };
    });
  }, [productBids, currentUserId]);

  // Funcție pentru acceptarea unei oferte
  const handleAcceptBid = useCallback(async (productId: string, bidId: string, bidAmount: number) => {
    try {
      const response = await apiFetchWithSession('/api/bids/accept', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          product_id: productId,
          bid_id: bidId,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        showNotification(
          'error',
          'Eroare',
          result.error ||
            (response.status === 401 ? 'Trebuie să fii autentificat pentru a accepta oferte.' : 'Eroare la acceptarea ofertei')
        );
        return;
      }

      // Setează oferta acceptată temporar și pornește countdown-ul de 5 minute (300 secunde)
      // Acceptarea va fi finalizată în baza de date doar după ce countdown-ul se termină
      setAcceptedBids(prev => ({
        ...prev,
        [productId]: { bidId, acceptedAt: Date.now() }
      }));
      setCountdowns(prev => ({
        ...prev,
        [productId]: 300 // 5 minute în secunde
      }));

      // Reîncarcă ofertele
      await loadProductBids(productId);
      // Reîncarcă produsele pentru a actualiza prețul
      loadProducts();
      showNotification('success', 'Succes!', 'Oferta a fost acceptată temporar! Ai 5 minute pentru a te răzgândi.');
    } catch (error: any) {
      console.error('Error accepting bid:', error);
      showNotification('error', 'Eroare', 'Eroare la acceptarea ofertei: ' + (error.message || 'Eroare necunoscută'));
    }
  }, [loadProductBids, loadProducts, showNotification]);

  // Funcție pentru anularea acceptării unei oferte
  const handleCancelAccept = useCallback(async (productId: string, bidId: string) => {
    try {
      // Anulează acceptarea în API (resetează is_winning)
      const response = await apiFetchWithSession('/api/bids/accept', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          product_id: productId,
          bid_id: bidId,
          cancel: true, // Flag pentru anulare
        }),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        showNotification(
          'error',
          'Autentificare necesară',
          (err as { error?: string }).error ||
            (response.status === 401
              ? 'Trebuie să fii autentificat pentru a anula acceptarea.'
              : 'Eroare la anularea acceptării')
        );
        return;
      }

      // Elimină acceptarea local
      setAcceptedBids(prev => {
        const newState = { ...prev };
        delete newState[productId];
        return newState;
      });
      setCountdowns(prev => {
        const newState = { ...prev };
        delete newState[productId];
        return newState;
      });

      // Reîncarcă ofertele pentru a actualiza statusul
      await loadProductBids(productId);
      loadProducts();
      showNotification('info', 'Anulat', 'Acceptarea ofertei a fost anulată. Poți accepta o altă ofertă.');
    } catch (error: any) {
      console.error('Error canceling accept:', error);
      showNotification('error', 'Eroare', 'Eroare la anularea acceptării');
    }
  }, [loadProductBids, loadProducts, showNotification]);

  // Countdown pentru ofertele acceptate
  useEffect(() => {
    const interval = setInterval(() => {
      setCountdowns(prev => {
        const newState: Record<string, number> = {};
        let hasActiveCountdown = false;

        Object.keys(prev).forEach(productId => {
          const remaining = prev[productId] - 1;
          if (remaining > 0) {
            newState[productId] = remaining;
            hasActiveCountdown = true;
          } else {
            // Countdown-ul s-a terminat - oferta este final acceptată
            // Nu mai facem nimic, oferta a fost deja acceptată în API
            const acceptedBid = acceptedBids[productId];
            if (acceptedBid) {
              showNotification('info', 'Acceptare finalizată', 'Oferta a fost acceptată definitiv după expirarea perioadei de răzgândire.');
            }
          }
        });

        return hasActiveCountdown ? newState : {};
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [acceptedBids, showNotification]);

  // Funcție pentru deschiderea chat-ului
  const handleOpenChat = useCallback(async (productId: string, buyerId: string, buyerInfo: { name: string; avatar?: string }) => {
    try {
      console.log('[handleOpenChat] Opening chat:', { productId, buyerId, buyerInfo, currentUserId });
      
      const session = await recoverDashboardSessionIfNeeded(supabase);
      if (!session?.user) {
        console.error('[handleOpenChat] No session found');
        showNotification('error', 'Autentificare necesară', 'Trebuie să fii autentificat pentru a deschide chat-ul.');
        return;
      }
      
      const sellerId = session.user.id;
      console.log('[handleOpenChat] Setting chat data:', { productId, buyerId, sellerId, otherUserInfo: buyerInfo });
      
      setChatData({
        productId,
        buyerId,
        sellerId,
        otherUserInfo: buyerInfo,
      });
      setShowChatModal(true);
      console.log('[handleOpenChat] Chat modal opened');
    } catch (error) {
      console.error('[handleOpenChat] Error opening chat:', error);
      showNotification('error', 'Eroare', 'Eroare la deschiderea chat-ului.');
    }
  }, [showNotification, currentUserId]);

  // Funcție pentru contraoferta
  const handleCounterOffer = useCallback(async (productId: string, currentBidAmount: number) => {
    // Nu blocăm contraofertele chiar dacă există o ofertă acceptată
    // Vânzătorul poate face contraoferte oricând, chiar și după ce a acceptat o ofertă
    // (pentru a putea negocia mai bine)
    
    // Obține suma contraofertei din state sau calculează una default
    const bids = productBids[productId] || [];
    const highestBid = bids.length > 0 
      ? Math.max(...bids.map((b: any) => b.amount || 0)) 
      : currentBidAmount;
    
    const counterAmount = counterOfferAmount[productId] || highestBid + 100;
    
    // Validare: contraoferta trebuie să fie mai mare decât oferta maximă
    if (counterAmount <= highestBid) {
      showNotification('error', 'Sumă invalidă', `Contraoferta trebuie să fie mai mare decât oferta maximă (${highestBid} Lei)`);
      return;
    }

    if (!currentUserId) {
      setShowCounterOfferAuthModal(true);
      return;
    }

    try {
      // Creează o ofertă nouă (contraoferta)
      const response = await apiFetchWithSession('/api/bids', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          product_id: productId,
          amount: counterAmount,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        if (response.status === 401) {
          setShowCounterOfferAuthModal(true);
          return;
        }
        showNotification(
          'error',
          'Eroare',
          result.error || 'Eroare la plasarea contraofertei'
        );
        return;
      }

      // Reîncarcă ofertele
      await loadProductBids(productId);
      // Reîncarcă produsele
      loadProducts();
      // Resetează contraoferta
      setCounterOfferAmount(prev => {
        const newState = { ...prev };
        delete newState[productId];
        return newState;
      });
      showNotification('success', 'Succes!', 'Contraoferta a fost plasată cu succes!');
    } catch (error: any) {
      console.error('Error placing counter offer:', error);
      showNotification('error', 'Eroare', 'Eroare la plasarea contraofertei: ' + (error.message || 'Eroare necunoscută'));
    }
  }, [counterOfferAmount, loadProductBids, loadProducts, showNotification, acceptedBids, productBids, currentUserId]);

  // ========== MODAL CONTACT (3 câmpuri + opțiuni anunțuri) ==========
  const [showContactModal, setShowContactModal] = useState(false);
  const [contactNumeComplet, setContactNumeComplet] = useState('');
  const [contactUsername, setContactUsername] = useState('');
  const [contactTelefon, setContactTelefon] = useState('');
  const [contactAllowPhone, setContactAllowPhone] = useState(true); // implicit: Mă pot suna
  const [contactDisplayAs, setContactDisplayAs] = useState<'nume' | 'username'>('nume'); // implicit: Numele complet
  const [contactSaving, setContactSaving] = useState(false);

  // Completează automat câmpurile din modalul Contact cu datele din profil
  useEffect(() => {
    if (!showContactModal) return;
    const loadContactFromProfile = async () => {
      try {
        const res = await dashboardApiFetch('/api/user/profile', {
          credentials: 'same-origin',
          cache: 'no-store',
        });
        if (res.ok) {
          const data = (await res.json()) as Record<string, unknown>;
          const fn = String(data.firstName ?? '');
          const ln = String(data.lastName ?? '');
          const nume = [fn, ln].filter(Boolean).join(' ').trim();
          if (nume) setContactNumeComplet(nume);
          if (typeof data.phone === 'string' && data.phone) setContactTelefon(data.phone);
          const username =
            (data.username as string) ||
            (data.anunturi_username as string) ||
            '';
          if (username) setContactUsername(username);
          setContactAllowPhone(data.anunturi_afiseaza_telefon === false ? false : true);
          setContactDisplayAs(
            data.anunturi_afisare_cu === 'username' ? 'username' : 'nume'
          );
          return;
        }
        const session = await recoverDashboardSessionIfNeeded(supabase);
        const user = session?.user;
        if (!user?.id) return;
        const { data: profile } = await supabase
          .from('user_profiles')
          .select('first_name, last_name, phone, metadata')
          .eq('user_id', user.id)
          .maybeSingle();
        const nume = [profile?.first_name, profile?.last_name].filter(Boolean).join(' ').trim();
        if (nume) setContactNumeComplet(nume);
        if (profile?.phone) setContactTelefon(profile.phone);
        const meta = (profile?.metadata as Record<string, unknown>) || {};
        const username = (meta.username as string) || (user.user_metadata?.username as string) || (user.email ? user.email.split('@')[0] : '') || '';
        if (username) setContactUsername(username);
        setContactAllowPhone(meta.anunturi_afiseaza_telefon === false ? false : true);
        setContactDisplayAs((meta.anunturi_afisare_cu === 'username' ? 'username' : 'nume') as 'nume' | 'username');
      } catch (e) {
        console.error('Error loading contact from profile:', e);
      }
    };
    loadContactFromProfile();
  }, [showContactModal]);

  const saveContactAndOptions = useCallback(async () => {
    setContactSaving(true);
    try {
      const parts = contactNumeComplet.trim().split(/\s+/);
      const firstName = parts[0] ?? '';
      const lastName = parts.slice(1).join(' ') ?? '';
      const res = await dashboardApiFetch('/api/user/profile', {
        method: 'PATCH',
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName,
          lastName,
          phone: contactTelefon.trim(),
          metadataPatch: {
            username: contactUsername.trim() || null,
            anunturi_afiseaza_telefon: contactAllowPhone,
            anunturi_afisare_cu: contactDisplayAs,
          },
        }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        showNotification(
          'error',
          'Eroare',
          (payload as { error?: string }).error || 'Trebuie să fii autentificat.'
        );
        return;
      }
      showNotification('success', 'Salvat', 'Datele de contact și opțiunile au fost salvate.');
      setShowContactModal(false);
    } catch (e: any) {
      showNotification('error', 'Eroare', e?.message || 'Nu s-au putut salva datele.');
    } finally {
      setContactSaving(false);
    }
  }, [contactNumeComplet, contactUsername, contactTelefon, contactAllowPhone, contactDisplayAs, showNotification]);

  // ========== MODAL QUICK ADD ==========
  const [showQuickAddModal, setShowQuickAddModal] = useState(false);
  /** GoBid AI quick add: temporar doar pentru conturi admin (până la update). */
  const [canUseGobidAiQuickAdd, setCanUseGobidAiQuickAdd] = useState(false);
  const [showDeleteAllConfirmModal, setShowDeleteAllConfirmModal] = useState(false);
  const [quickAddImages, setQuickAddImages] = useState<File[]>([]);
  const [quickAddImagePreviews, setQuickAddImagePreviews] = useState<string[]>([]);
  const [isNativeApp, setIsNativeApp] = useState(false);
  const [quickAddDescription, setQuickAddDescription] = useState('');
  const [quickAddRequestedPrice, setQuickAddRequestedPrice] = useState<number>(0);
  const [quickAddMinAcceptedBid, setQuickAddMinAcceptedBid] = useState<number>(0);
  const [quickAddCurrency, setQuickAddCurrency] = useState<'RON' | 'EUR'>('RON');
  const [quickAddCity, setQuickAddCity] = useState<string>('');
  const [quickAddIsGenerating, setQuickAddIsGenerating] = useState(false);
  const [quickAddGeneratedProduct, setQuickAddGeneratedProduct] = useState<any>(null);
  const [quickAddIsSaving, setQuickAddIsSaving] = useState(false);
  const [generationProgress, setGenerationProgress] = useState(0);
  const [showHelpModal, setShowHelpModal] = useState(false);
  const [helpStep, setHelpStep] = useState(0);
  const [typingText, setTypingText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [quickAddIsDictating, setQuickAddIsDictating] = useState(false);
  const [quickAddInterimText, setQuickAddInterimText] = useState('');
  const [showDictationTutorial, setShowDictationTutorial] = useState(false);
  const [tutorialDismissed, setTutorialDismissed] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('dictationTutorialDontShow') === 'true';
    }
    return false;
  });
  const quickAddRecognitionRef = React.useRef<SpeechRecognition | null>(null);
  const startDictationRef = useRef<(() => void) | null>(null);
  const startDictationForTutorialRef = useRef<(() => void) | null>(null);
  /** Fallback când plugin-ul Capacitor Camera lipsește: deschide picker-ul nativ (capture / fișiere). */
  const quickAddCameraInputRef = useRef<HTMLInputElement | null>(null);
  const quickAddGalleryInputRef = useRef<HTMLInputElement | null>(null);
  const manualCameraCaptureRef = useRef<HTMLInputElement | null>(null);
  const manualFileUploadRef = useRef<HTMLInputElement | null>(null);
  const manualNativeAddWrapRef = useRef<HTMLDivElement | null>(null);
  const manualImagePreviewObjectUrlRef = useRef<string | null>(null);
  const categoryDetectionTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const quickAddDescriptionRef = useRef<string>('');
  const handleQuickAddGenerateRef = React.useRef<(() => Promise<void>) | null>(null);
  const extractFieldValueRef = useRef<((text: string, requiredFields: string[]) => { field: string; value: string } | null) | null>(null);
  const detectCategoryFromTextRef = useRef<((text: string) => Promise<{ category: string; subcategory: string; requiredFields: string[] } | null>) | null>(null);
  const detectedCategoryRef = useRef<{ category: string; subcategory: string; requiredFields: string[] } | null>(null);
  const extractedFieldValuesRef = useRef<Record<string, string>>({});
  const categoryCacheRef = useRef<Map<string, { category: string; subcategory: string; requiredFields: string[] }>>(new Map());
  const lastChatGPTCallRef = useRef<number>(0);
  const chatGPTRateLimitRef = useRef<boolean>(false);
  useEffect(() => {
    quickAddDescriptionRef.current = quickAddDescription;
  }, [quickAddDescription]);

  useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      const adminRaw = typeof window !== 'undefined' ? localStorage.getItem('adminInfo') : null;
      try {
        const session = await recoverDashboardSessionIfNeeded(supabase);
        const u = session?.user ?? null;
        let profile: { role?: string; is_admin?: boolean } | null = null;
        if (u?.id) {
          const { data } = await supabase
            .from('user_profiles')
            .select('role, is_admin')
            .eq('user_id', u.id)
            .maybeSingle();
          profile = data ?? null;
        }
        if (!cancelled) {
          setCanUseGobidAiQuickAdd(isDashboardAdminClient(u, profile, adminRaw));
        }
      } catch {
        if (!cancelled) setCanUseGobidAiQuickAdd(false);
      }
    };
    void refresh();
    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      void refresh();
    });
    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!canUseGobidAiQuickAdd && showQuickAddModal) {
      setShowQuickAddModal(false);
    }
  }, [canUseGobidAiQuickAdd, showQuickAddModal]);
  
  const [showMissingFieldsModal, setShowMissingFieldsModal] = useState(false);
  const [missingFieldsData, setMissingFieldsData] = useState<{
    fields: string[];
    category: string;
    subcategory: string;
    extractedFields: Record<string, string>;
  } | null>(null);
  const [fieldInputs, setFieldInputs] = useState<Record<string, string>>({});
  // Voice Dictation State Machine - Hard Delete Mode
  const [deleteMode, setDeleteMode] = useState(false);
  const [pendingDeleteTarget, setPendingDeleteTarget] = useState<string | null>(null);
  const [livePreview, setLivePreview] = useState<string>('');
  const [deleteTargetRanges, setDeleteTargetRanges] = useState<Array<{ start: number; end: number; text: string }>>([]); // Ranges to delete
  const [showDeleteTextModal, setShowDeleteTextModal] = useState(false); // Modal for delete text confirmation
  const [detectedCategory, setDetectedCategory] = useState<{ category: string; subcategory: string; requiredFields: string[] } | null>(null);
  const [completedFields, setCompletedFields] = useState<Set<string>>(new Set()); // Track which fields have been mentioned
  const [extractedFieldValues, setExtractedFieldValues] = useState<Record<string, string>>({}); // Store extracted values for each field
  const [isDeletingAllText, setIsDeletingAllText] = useState(false);
  const reformulatedForCategoryRef = useRef<string | null>(null);
  const previousSubcategoryRef = useRef<string | null>(null);
  
  // Update refs when state changes (must be after state declarations)
  useEffect(() => {
    detectedCategoryRef.current = detectedCategory;
  }, [detectedCategory]);
  
  useEffect(() => {
    extractedFieldValuesRef.current = extractedFieldValues;
  }, [extractedFieldValues]);
  
  // Când subcategoria se schimbă, permitem din nou reformularea la progres complet
  useEffect(() => {
    const sub = detectedCategory?.subcategory ?? null;
    if (sub !== previousSubcategoryRef.current) {
      reformulatedForCategoryRef.current = null;
      previousSubcategoryRef.current = sub;
    }
  }, [detectedCategory?.subcategory]);

  /**
   * Normalize Romanian text for command matching:
   * - lowercase + trim
   * - remove trailing punctuation .,!?:;
   * - diacritics: ă->a, â->a, î->i, ș->s, ț/ţ->t
   * - collapse multiple spaces
   */
  const normalizeRo = useCallback((text: string): string => {
    return text
      .toLowerCase()
      .trim()
      .replace(/[.,!?:;]+$/g, '') // Remove trailing punctuation
      .replace(/ă/g, 'a')
      .replace(/â/g, 'a')
      .replace(/î/g, 'i')
      .replace(/ș/g, 's')
      .replace(/ț/g, 't')
      .replace(/ţ/g, 't')
      .replace(/\s+/g, ' '); // Collapse multiple spaces
  }, []);

  /**
   * Detect if a FINAL transcript is a command
   * MUST run before any textarea append
   * Returns: { isCommand: boolean, commandType?: string, commandData?: any }
   */
  const detectCommand = useCallback((finalText: string): { isCommand: boolean; commandType?: string; commandData?: any } => {
    const normalized = normalizeRo(finalText);
    
    // 1. Clear all command (highest priority)
    if (normalized === 'sterge toata descrierea' || 
        normalized === 'iau de la capat' || 
        normalized === 'iao de la capat') {
      return { isCommand: true, commandType: 'clearAll' };
    }
    
    // 2. Direct delete command: "sterge [text]" - delete immediately and continue dictation
    const directDeleteMatch = normalized.match(/^sterge\s+(.+)$/);
    if (directDeleteMatch && !deleteMode) {
      const targetToDelete = directDeleteMatch[1].trim();
      return { isCommand: true, commandType: 'directDelete', commandData: { target: targetToDelete } };
    }
    
    // 3. Enter delete mode (ONLY "sterge" alone) - stops dictation, next text will be deleted
    if (normalized === 'sterge' && !deleteMode) {
      return { isCommand: true, commandType: 'enterDeleteMode' };
    }
    
    // 4. Continue dictation after delete (exit deleteMode and resume normal dictation)
    if (deleteMode && (
        normalized === 'ok' || 
        normalized === 'gata' || 
        normalized === 'continua' ||
        normalized === 'da' ||
        normalized === 'bine' ||
        normalized === 'corect'
      )) {
      return { isCommand: true, commandType: 'continueDictation' };
    }
    
    // 5. Finish command
    if (normalized === 'am terminat descrierea' || normalized === 'terminat') {
      return { isCommand: true, commandType: 'finish' };
    }
    
    // 6. Generate command
    if (normalized === 'genereaza anunt' || normalized === 'genereaza cu gobid') {
      return { isCommand: true, commandType: 'generate' };
    }
    
    // 7. Publish command
    if (normalized === 'publica' || normalized === 'publica anunt') {
      return { isCommand: true, commandType: 'publish' };
    }
    
    // 8. Close tutorial
    if (normalized === 'nu mai afisa tutorial' || normalized === 'nu mai arata tutorial' || normalized === 'inchide tutorial') {
      return { isCommand: true, commandType: 'closeTutorial' };
    }
    
    return { isCommand: false };
  }, [normalizeRo, deleteMode, pendingDeleteTarget]);

  /**
   * Normalize currency: "lei" = "RON", "euro" = "EUR"
   */
  const normalizeCurrency = useCallback((text: string): string => {
    return text
      .replace(/\blei\b/gi, 'RON')
      .replace(/\beuro\b/gi, 'EUR')
      .replace(/\beur\b/gi, 'EUR');
  }, []);

  /**
   * Find all occurrences of target text in description using diacritics-insensitive comparison
   * Returns count of matches
   */
  const findDeleteMatches = useCallback((description: string, target: string): number => {
    if (!description || !target) return 0;
    
    const normalizedDesc = normalizeRo(description);
    const normalizedTarget = normalizeRo(target.trim());
    
    if (!normalizedTarget) return 0;
    
    // Create regex for matching (case-insensitive, diacritics-insensitive via normalization)
    const escaped = normalizedTarget.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const isSingleWord = normalizedTarget.split(/\s+/).length === 1;
    const regex = isSingleWord 
      ? new RegExp(`\\b${escaped}\\b`, 'gi')
      : new RegExp(escaped, 'gi');
    
    const matches = normalizedDesc.match(regex);
    return matches ? matches.length : 0;
  }, [normalizeRo]);

  /**
   * Delete all occurrences of target text from description using diacritics-insensitive comparison
   * Simple and reliable approach: try multiple matching strategies
   */
  const deleteOccurrences = useCallback((description: string, target: string): string => {
    if (!description || !target) return description;
    
    const targetTrimmed = target.trim();
    if (!targetTrimmed) return description;
    
    let result = description;
    const isSingleWord = targetTrimmed.split(/\s+/).length === 1;
    
    // Strategy 1: Exact match (case-insensitive)
    const exactEscaped = targetTrimmed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const exactRegex = isSingleWord
      ? new RegExp(`\\b${exactEscaped}\\b`, 'gi')
      : new RegExp(exactEscaped, 'gi');
    result = result.replace(exactRegex, '');
    
    // Strategy 2: Normalized match (diacritics-insensitive)
    const normalizedTarget = normalizeRo(targetTrimmed);
    const normalizedDesc = normalizeRo(result);
    const normalizedEscaped = normalizedTarget.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const normalizedRegex = isSingleWord
      ? new RegExp(`\\b${normalizedEscaped}\\b`, 'gi')
      : new RegExp(normalizedEscaped, 'gi');
    
    // Find matches in normalized text and delete corresponding parts in original
    let match;
    const toDelete: Array<{ start: number; end: number }> = [];
    while ((match = normalizedRegex.exec(normalizedDesc)) !== null) {
      // Approximate mapping: find similar pattern in original result
      const searchStart = Math.max(0, match.index - 5);
      const searchEnd = Math.min(result.length, match.index + normalizedTarget.length + 5);
      const searchWindow = result.substring(searchStart, searchEnd);
      
      // Try to find the actual text in original
      const windowRegex = new RegExp(exactEscaped, 'gi');
      const windowMatch = windowRegex.exec(searchWindow);
      if (windowMatch) {
        toDelete.push({
          start: searchStart + windowMatch.index,
          end: searchStart + windowMatch.index + windowMatch[0].length
        });
      }
    }
    
    // Delete from end to start to preserve indices
    toDelete.sort((a, b) => b.start - a.start);
    toDelete.forEach(range => {
      result = result.substring(0, range.start) + result.substring(range.end);
    });
    
    // Strategy 3: For numbers with currency, try flexible matching
    const numberMatch = targetTrimmed.match(/(\d+(?:[.,]\d+)?)\s*(%|lei|ron|euro|eur|baterie|bateria)?/i);
    if (numberMatch) {
      const number = numberMatch[1];
      const suffix = numberMatch[2] || '';
      // Try to match number with any variation of suffix
      const numberPattern = `${number.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*(?:${suffix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}|%|lei|ron|euro|eur|baterie|bateria)?`;
      const numberRegex = new RegExp(numberPattern, 'gi');
      result = result.replace(numberRegex, '');
    }
    
    // Clean up: normalize spaces and trim
    result = result.replace(/\s+/g, ' ').trim();
    
    return result;
  }, [normalizeRo]);

  /** Returns { start, end } indices of the last N words in description (for limiting delete to last 5 words). */
  const getLastNWordsRange = useCallback((description: string, n: number): { start: number; end: number } => {
    const trimmed = description.trim();
    if (!trimmed) return { start: 0, end: description.length };
    const words = trimmed.split(/\s+/).filter(Boolean);
    if (words.length <= n) return { start: 0, end: description.length };
    const lastNStr = words.slice(-n).join(' ');
    const startInTrimmed = trimmed.length - lastNStr.length;
    const trimmedStartInDesc = description.indexOf(trimmed);
    const start = (trimmedStartInDesc >= 0 ? trimmedStartInDesc : 0) + startInTrimmed;
    return { start, end: description.length };
  }, []);

  /**
   * Delete target only if it appears within the last N words (default 5). Used for voice "sterge X".
   */
  const deleteInLastNWords = useCallback((description: string, target: string, lastN: number = 5): string => {
    if (!description || !target?.trim()) return description;
    const { start, end } = getLastNWordsRange(description, lastN);
    const lastPart = description.slice(start, end);
    const rest = description.slice(0, start);
    const afterDelete = deleteOccurrences(lastPart, target.trim());
    const joined = (rest + ' ' + afterDelete).replace(/\s+/g, ' ').trim();
    return joined;
  }, [getLastNWordsRange, deleteOccurrences]);

  /**
   * Find all occurrences of target text in description and return ranges (for highlighting)
   * Supports flexible matching: exact match, currency variations, number matching
   */
  const findDeleteRanges = useCallback((description: string, target: string): Array<{ start: number; end: number; text: string }> => {
    if (!description || !target) return [];
    
    const ranges: Array<{ start: number; end: number; text: string }> = [];
    const targetTrimmed = target.trim();
    const foundPositions: Set<number> = new Set();
    const isSingleWord = targetTrimmed.split(/\s+/).length === 1;
    
    // Strategy 1: Exact match (case-insensitive, with word boundaries for single words)
    const escapedTarget = targetTrimmed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const exactRegex = isSingleWord 
      ? new RegExp(`\\b${escapedTarget}\\b`, 'gi')
      : new RegExp(escapedTarget, 'gi');
    
    let match;
    while ((match = exactRegex.exec(description)) !== null) {
      const start = match.index;
      if (!foundPositions.has(start)) {
        ranges.push({
          start: start,
          end: start + match[0].length,
          text: match[0]
        });
        foundPositions.add(start);
      }
    }
    
    // Strategy 2: If no exact match and contains number, try currency variations
    if (ranges.length === 0 && /\d/.test(targetTrimmed)) {
      const numberMatch = targetTrimmed.match(/(\d+(?:[.,]\d+)?)\s*(lei|ron|euro|eur)?/i);
      if (numberMatch) {
        const number = numberMatch[1];
        // Search for number with any currency (RON, lei, EUR, euro, eur)
        const numberRegex = new RegExp(`${number.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*(?:RON|lei|EUR|euro|eur)?`, 'gi');
        let numMatch;
        while ((numMatch = numberRegex.exec(description)) !== null) {
          const start = numMatch.index;
          if (!foundPositions.has(start)) {
            ranges.push({
              start: start,
              end: start + numMatch[0].length,
              text: numMatch[0]
            });
            foundPositions.add(start);
          }
        }
      }
    }
    
    // Strategy 3: Try currency-normalized search (if still no matches)
    if (ranges.length === 0 && /\d/.test(targetTrimmed)) {
      const normalizedTarget = normalizeCurrency(targetTrimmed);
      const normalizedDesc = normalizeCurrency(description);
      const normalizedEscaped = normalizedTarget.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const normalizedRegex = isSingleWord
        ? new RegExp(`\\b${normalizedEscaped}\\b`, 'gi')
        : new RegExp(normalizedEscaped, 'gi');
      
      // Find in normalized, then search for similar pattern in original
      let normMatch;
      while ((normMatch = normalizedRegex.exec(normalizedDesc)) !== null) {
        const normStart = normMatch.index;
        // Search in original description around this position
        const searchStart = Math.max(0, normStart - 20);
        const searchEnd = Math.min(description.length, normStart + targetTrimmed.length + 20);
        const searchWindow = description.substring(searchStart, searchEnd);
        
        // Try to find a match that contains the number
        const numberInTarget = targetTrimmed.match(/\d+/);
        if (numberInTarget) {
          const numRegex = new RegExp(`${numberInTarget[0]}\\s*(?:RON|lei|EUR|euro|eur)?`, 'gi');
          const windowMatch = numRegex.exec(searchWindow);
          if (windowMatch) {
            const actualStart = searchStart + windowMatch.index;
            if (!foundPositions.has(actualStart)) {
              ranges.push({
                start: actualStart,
                end: actualStart + windowMatch[0].length,
                text: windowMatch[0]
              });
              foundPositions.add(actualStart);
            }
          }
        }
      }
    }
    
    // Remove duplicates and sort by start position
    const uniqueRanges = ranges.filter((range, index, self) => 
      index === self.findIndex(r => r.start === range.start && r.end === range.end)
    );
    
    return uniqueRanges.sort((a, b) => a.start - b.start);
  }, [normalizeCurrency]);

  // Funcție helper pentru evidențierea cuvintelor/propozițiilor cu roșu
  const highlightWordsToDelete = (text: string, ranges: Array<{ start: number; end: number; text: string }>): string => {
    if (!text || ranges.length === 0) return text;
    
    // Sort ranges by start position (descending) to replace from end to start
    const sortedRanges = [...ranges].sort((a, b) => b.start - a.start);
    
    let result = text;
    sortedRanges.forEach(range => {
      const before = result.substring(0, range.start);
      const match = result.substring(range.start, range.end);
      const after = result.substring(range.end);
      result = before + `<span class="bg-red-500 text-white font-semibold px-1 rounded">${match}</span>` + after;
    });
    
    return result;
  };

  /**
   * Extract field values from text and return both field name and extracted value
   * Returns { field: string, value: string } if detected, null otherwise
   */
  const extractFieldValue = useCallback((text: string, requiredFields: string[]): { field: string; value: string } | null => {
    if (!text || !requiredFields || requiredFields.length === 0) return null;
    
    // Try both original text and normalized text (without diacritics) for better matching
    const normalizedText = normalizeRo(text.toLowerCase());
    const originalLower = text.toLowerCase();
    
    // Field extraction patterns with value capture
    const fieldExtractors: Record<string, Array<{ pattern: RegExp; extractValue: (match: RegExpMatchArray, originalText: string) => string }>> = {
      'marca': [
        // Pattern pentru branduri auto (trebuie să fie primul pentru a prinde "BMW" înainte de alte pattern-uri)
        {
          pattern: /\b(bmw|audi|mercedes|mercedes-benz|volkswagen|vw|opel|ford|renault|peugeot|dacia|skoda|škoda|seat|fiat|toyota|honda|mazda|nissan|volvo|hyundai|kia|tesla|porsche|jaguar|land\s+rover|jeep|chevrolet|citroen|citroën|mini|alfa\s+romeo|mitsubishi|subaru|suzuki|infiniti|genesis|cupra|abarth|lancia|smart|ssangyong|maserati|bentley|rolls\s*royce|lada)\b/i,
          extractValue: (match) => {
            const brand = match[1].toLowerCase().replace(/\s+/g, ' ');
            // Normalizează branduri cu spații
            if (brand === 'land rover') return 'Land Rover';
            if (brand === 'alfa romeo') return 'Alfa Romeo';
            return brand.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
          }
        },
        {
          pattern: /\bmarca\s+(bmw|audi|mercedes|mercedes-benz|volkswagen|vw|opel|ford|renault|peugeot|dacia|skoda|seat|fiat|toyota|honda|mazda|nissan|volvo|hyundai|kia|tesla|porsche|jaguar|land\s+rover|jeep|chevrolet|citroen|mini|alfa\s+romeo)\b/i,
          extractValue: (match) => {
            const brand = match[1].toLowerCase().replace(/\s+/g, ' ');
            if (brand === 'land rover') return 'Land Rover';
            if (brand === 'alfa romeo') return 'Alfa Romeo';
            if (brand === 'mercedes-benz') return 'Mercedes-Benz';
            if (brand === 'vw' || brand === 'volkswagen') return 'Volkswagen';
            if (brand === 'škoda' || brand === 'skoda') return 'Škoda';
            if (brand === 'citroën' || brand === 'citroen') return 'Citroën';
            if (brand === 'rolls royce' || brand === 'rolls  royce') return 'Rolls Royce';
            return brand.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
          }
        },
        // Pattern pentru branduri electronice/telefoane
        {
          pattern: /\b(iphone|samsung|xiaomi|huawei|oppo|oneplus|realme|pixel|nokia|apple|motorola|lg|sony|dell|hp|lenovo|asus|acer|msi|razer)\b/i,
          extractValue: (match) => {
            const brand = match[1].toLowerCase();
            if (brand === 'iphone' || brand === 'pixel') return 'Apple';
            if (brand === 'pixel') return 'Google';
            return match[1].charAt(0).toUpperCase() + match[1].slice(1).toLowerCase();
          }
        },
        {
          pattern: /\bmarca\s+(iphone|samsung|xiaomi|huawei|oppo|oneplus|realme|pixel|nokia|apple|motorola|lg|sony|dell|hp|lenovo|asus|acer|msi|razer)\b/i,
          extractValue: (match) => {
            const brand = match[1].toLowerCase();
            if (brand === 'iphone' || brand === 'pixel') return 'Apple';
            if (brand === 'pixel') return 'Google';
            return match[1].charAt(0).toUpperCase() + match[1].slice(1).toLowerCase();
          }
        }
      ],
      'model': [
        // Pattern generic pentru model (orice cuvânt sau număr după marca)
        {
          pattern: /\bmarca\s+\w+\s+([a-z0-9\-\s]+?)(?:\s+partea|\s+stanga|\s+dreapta|\s+fata|\s+spate|\s+tip|\s+stare|$)/i,
          extractValue: (match) => match[1].trim()
        },
        {
          pattern: /\b(iphone\s+\d+[a-z]*|galaxy\s+\w+|pixel\s+\d+|redmi\s+\w+|mi\s+\d+|note\s+\d+|pro\s+\w+)\b/i,
          extractValue: (match) => match[1]
        },
        {
          pattern: /\bmodel\s+(iphone\s+\d+[a-z]*|galaxy\s+\w+|pixel\s+\d+|redmi\s+\w+|mi\s+\d+|note\s+\d+|pro\s+\w+|[a-z0-9\-\s]+)\b/i,
          extractValue: (match) => match[1].trim()
        },
        {
          pattern: /\b(iphone\s+\d+[a-z]*)\b/i,
          extractValue: (match) => match[1]
        }
      ],
      'tip': [
        {
          pattern: /\b(aripa|aripă|capota|capotă|bara|bara\s+fata|bara\s+făță|bara\s+spate|far|faruri|parbriz|parbrizul|geam|geamuri|oglinda|oglinda\s+retrovizoare|bara\s+laterala|bara\s+laterala|spoiler|spoilerul|grila|grilă|bumper|bumperul|cutie|cutie\s+viteze|motor|motorul|suspensie|suspensiile|frana|frâna|frane|frâne|roti|roți|jante|jantele|volan|volanul|scaun|scaune|usi|uși|portiere|portiera|huse|husă|husa|tapiterie|tapiteria)\b/i,
          extractValue: (match) => {
            const tip = match[1].toLowerCase();
            return tip.charAt(0).toUpperCase() + tip.slice(1);
          }
        },
        {
          pattern: /\btip\s+(aripa|aripă|capota|capotă|bara|bara\s+fata|bara\s+făță|bara\s+spate|far|faruri|parbriz|parbrizul|geam|geamuri|oglinda|oglinda\s+retrovizoare|bara\s+laterala|bara\s+laterala|spoiler|spoilerul|grila|grilă|bumper|bumperul|cutie|cutie\s+viteze|motor|motorul|suspensie|suspensiile|frana|frâna|frane|frâne|roti|roți|jante|jantele|volan|volanul|scaun|scaune|usi|uși|portiere|portiera|huse|husă|husa|tapiterie|tapiteria)\b/i,
          extractValue: (match) => {
            const tip = match[1].toLowerCase();
            return tip.charAt(0).toUpperCase() + tip.slice(1);
          }
        }
      ],
      'compatibilitate': [
        {
          pattern: /\bcompatibil\s+(cu|pentru)\s+([a-z0-9\-\s]+?)(?:\s+an|\s+model|\s+serie|$)/i,
          extractValue: (match) => match[2].trim()
        },
        {
          pattern: /\b(pentru|pt\.?|compatibil\s+cu)\s+([a-z0-9\-\s]+?)(?:\s+serie|\s+an|\s+model|$)/i,
          extractValue: (match) => match[2].trim()
        }
      ],
      'capacitate': [
        {
          pattern: /\b(64|128|256|512|1024)\s*(gb|gigabyte|giga)\b/i,
          extractValue: (match) => `${match[1]} GB`
        },
        {
          pattern: /\bcapacitate\s+(64|128|256|512|1024)\s*(gb|gigabyte)?\b/i,
          extractValue: (match) => `${match[1]} GB`
        }
      ],
      'culoare': [
        {
          pattern: /\b(negru|neagra|neagră|alb|albă|gri|rosu|rosie|roșu|roșie|albastru|albastra|albastră|verde|galben|galbena|galbenă|portocaliu|portocalie|auriu|aurie|argintiu|argintie|roz|mov|blue|maro|bej)\b/i,
          extractValue: (match) => {
            const v = match[1].toLowerCase();
            if (v === 'neagra' || v === 'neagră') return 'Negru';
            if (v === 'alba' || v === 'albă') return 'Alb';
            if (v === 'rosie' || v === 'roșie') return 'Roșu';
            if (v === 'albastra' || v === 'albastră') return 'Albastru';
            if (v === 'galbena' || v === 'galbenă') return 'Galben';
            if (v === 'portocalie') return 'Portocaliu';
            if (v === 'aurie') return 'Auriu';
            if (v === 'argintie') return 'Argintiu';
            return match[1].charAt(0).toUpperCase() + match[1].slice(1).toLowerCase();
          }
        },
        {
          pattern: /\bculoare\s+(negru|neagra|neagră|alb|albă|gri|rosu|rosie|roșu|roșie|albastru|albastra|albastră|verde|galben|galbena|galbenă|portocaliu|portocalie|auriu|aurie|argintiu|argintie|roz|mov|blue|maro|bej)\b/i,
          extractValue: (match) => {
            const v = match[1].toLowerCase();
            if (v === 'neagra' || v === 'neagră') return 'Negru';
            if (v === 'alba' || v === 'albă') return 'Alb';
            if (v === 'rosie' || v === 'roșie') return 'Roșu';
            if (v === 'albastra' || v === 'albastră') return 'Albastru';
            if (v === 'galbena' || v === 'galbenă') return 'Galben';
            if (v === 'portocalie') return 'Portocaliu';
            if (v === 'aurie') return 'Auriu';
            if (v === 'argintie') return 'Argintiu';
            return match[1].charAt(0).toUpperCase() + match[1].slice(1).toLowerCase();
          }
        }
      ],
      'stare': [
        {
          pattern: /\bstare\s+(foarte\s+)?(buna|bună|excelenta|excelentă|perfecta|perfectă|noua|nouă|folosita|folosită|impecabila|impecabilă|uzata|uzată|refabricata|refabricată)\b/i,
          extractValue: (match) => {
            const prefix = match[1] ? 'Foarte ' : '';
            const val = match[2].toLowerCase();
            if (val.includes('buna') || val.includes('bună')) return prefix + 'Bună';
            if (val.includes('excelenta') || val.includes('excelentă')) return prefix + 'Excelentă';
            if (val.includes('perfecta') || val.includes('perfectă')) return prefix + 'Perfectă';
            if (val.includes('noua') || val.includes('nouă')) return 'Nouă';
            if (val.includes('folosita') || val.includes('folosită')) return 'Folosită';
            if (val.includes('impecabila') || val.includes('impecabilă')) return 'Impecabilă';
            if (val.includes('uzata') || val.includes('uzată')) return 'Uzată';
            if (val.includes('refabricata') || val.includes('refabricată')) return 'Refabricată';
            return match[2].charAt(0).toUpperCase() + match[2].slice(1);
          }
        },
        {
          pattern: /\b(buna|bună|excelenta|excelentă|perfecta|perfectă|noua|nouă|folosita|folosită|impecabila|impecabilă|uzata|uzată|refabricata|refabricată|foarte\s+buna|foarte\s+bună)\b/i,
          extractValue: (match) => {
            const val = match[1].toLowerCase();
            if (val.includes('foarte')) {
              if (val.includes('buna') || val.includes('bună')) return 'Foarte bună';
            }
            if (val.includes('buna') || val.includes('bună')) return 'Bună';
            if (val.includes('excelenta') || val.includes('excelentă')) return 'Excelentă';
            if (val.includes('perfecta') || val.includes('perfectă')) return 'Perfectă';
            if (val.includes('noua') || val.includes('nouă')) return 'Nouă';
            if (val.includes('folosita') || val.includes('folosită')) return 'Folosită';
            if (val.includes('impecabila') || val.includes('impecabilă')) return 'Impecabilă';
            if (val.includes('uzata') || val.includes('uzată')) return 'Uzată';
            if (val.includes('refabricata') || val.includes('refabricată')) return 'Refabricată';
            return match[1].charAt(0).toUpperCase() + match[1].slice(1);
          }
        }
      ],
      'baterie': [
        {
          pattern: /\b(sanatate|sănătate|sanatatea|sănătatea)\s+(baterie|bateriei|bateria)\s+(\d+)\s*%?\b/i,
          extractValue: (match) => `${match[3]}%`
        },
        {
          pattern: /\b(baterie|bateria|bateriei)\s+(sanatate|sănătate|sanatatea|sănătatea)\s+(\d+)\s*%?\b/i,
          extractValue: (match) => `${match[3]}%`
        },
        {
          pattern: /\b(baterie|bateria|bateriei)\s+(\d+)\s*%?\b/i,
          extractValue: (match) => `${match[2]}%`
        },
        {
          pattern: /\b(\d+)\s*%\s*(baterie|bateria|bateriei|sanatate|sănătate|sanatatea|sănătatea)\b/i,
          extractValue: (match) => `${match[1]}%`
        },
        {
          pattern: /\b(baterie|bateria|bateriei)\s+(100|90|80|70|60|50|40|30|20|10)\s*%?\b/i,
          extractValue: (match) => `${match[2]}%`
        },
        {
          pattern: /\b(sanatate|sănătate|sanatatea|sănătatea)\s+(baterie|bateriei|bateria)\s+(100|90|80|70|60|50|40|30|20|10)\s*%?\b/i,
          extractValue: (match) => `${match[3]}%`
        }
      ],
      'deblocat': [
        {
          pattern: /\b(deblocat|deblocata|deblocată)\s+(pe\s+)?(toate|orice|orice|toate)\s+(retelele|rețelele|retea|rețea|reteaua|rețeaua)\b/i,
          extractValue: () => 'Deblocat'
        },
        {
          pattern: /\b(deblocat|deblocata|deblocată)\s+(in|în|pe)\s+(orice|toate)\s+(retea|rețea|retele|rețele)\b/i,
          extractValue: () => 'Deblocat'
        },
        {
          pattern: /\b(deblocat|deblocata|deblocată|liber|libera|liberă)\s+(pentru|pe|in|în)\s+(orice|toate)\s*(retea|rețea|retele|rețele)?\b/i,
          extractValue: () => 'Deblocat'
        },
        {
          pattern: /\b(deblocat|deblocata|deblocată|blocat|blocata|blocată|lock|unlock|liber|libera|liberă)\b/i,
          extractValue: (match) => {
            const val = match[1].toLowerCase();
            if (val.includes('deblocat') || val.includes('liber') || val === 'unlock') return 'Deblocat';
            return 'Blocat';
          }
        },
        {
          pattern: /\bstatus\s+(deblocat|deblocata|deblocată|blocat|blocata|blocată)\b/i,
          extractValue: (match) => match[1].charAt(0).toUpperCase() + match[1].slice(1).toLowerCase()
        }
      ],
      'iCloud': [
        {
          pattern: /\b(icloud|icloudul)\s+(sters|sters|activ|activa|dezactivat|dezactivata)\b/i,
          extractValue: (match) => match[2].charAt(0).toUpperCase() + match[2].slice(1).toLowerCase()
        },
        {
          pattern: /\b(icloud|icloudul)\s+(liber|libera|gol|goala)\b/i,
          extractValue: () => 'Șters'
        }
      ],
      'accesorii': [
        {
          pattern: /\b(cutie|cablu|incarcator|incarcator|casti|headphones|caruia|caruia|folie|folie|husa|husa|accesorii)\b/i,
          extractValue: (match, originalText) => {
            const accesorii: string[] = [];
            const textLower = originalText.toLowerCase();
            if (textLower.includes('cutie')) accesorii.push('Cutie');
            if (textLower.includes('cablu')) accesorii.push('Cablu');
            if (textLower.includes('incarcator') || textLower.includes('încărcător')) accesorii.push('Încărcător');
            if (textLower.includes('casti') || textLower.includes('căști')) accesorii.push('Căști');
            if (textLower.includes('folie')) accesorii.push('Folie');
            if (textLower.includes('husa') || textLower.includes('husă')) accesorii.push('Husă');
            return accesorii.length > 0 ? accesorii.join(', ') : 'Cutie, Cablu';
          }
        }
      ]
    };
    
    // Check each required field - try both original and normalized text
    for (const field of requiredFields) {
      const extractors = fieldExtractors[field];
      if (extractors) {
        for (const { pattern, extractValue } of extractors) {
          // Try original text first (with diacritics)
          let match = text.match(pattern);
          if (!match) {
            // Try normalized text (without diacritics)
            match = normalizedText.match(pattern);
          }
          if (!match) {
            // Try original lowercase
            match = originalLower.match(pattern);
          }
          if (match) {
            const value = extractValue(match, text);
            console.log(`✅ Extracted ${field} = "${value}" from text: "${text.substring(0, 50)}..."`);
            return { field, value };
          }
        }
      }
    }
    
    return null;
  }, [normalizeRo]);

  /**
   * Detect if user mentioned a specific field in the dictation text
   * Returns the field name if detected, null otherwise
   */
  const detectMentionedField = useCallback((text: string, requiredFields: string[]): string | null => {
    if (!text || !requiredFields || requiredFields.length === 0) return null;
    
    const normalizedText = normalizeRo(text.toLowerCase());
    
    // Field detection patterns
    const fieldPatterns: Record<string, RegExp[]> = {
      'marca': [
        /\b(iphone|samsung|xiaomi|huawei|oppo|oneplus|realme|pixel|nokia|apple|motorola|lg|sony)\b/i,
        /\bmarca\s+(iphone|samsung|xiaomi|huawei|oppo|oneplus|realme|pixel|nokia|apple|motorola|lg|sony)\b/i
      ],
      'model': [
        /\b(iphone\s+\d+|galaxy\s+\w+|pixel\s+\d+|redmi\s+\w+|mi\s+\d+|note\s+\d+|pro\s+\w+)\b/i,
        /\bmodel\s+(iphone\s+\d+|galaxy|pixel|redmi|mi|note|pro)\b/i
      ],
      'capacitate': [
        /\b(64|128|256|512|1024)\s*(gb|gigabyte|giga)\b/i,
        /\bcapacitate\s+(64|128|256|512|1024)\s*(gb|gigabyte)?\b/i
      ],
      'culoare': [
        /\b(negru|neagra|neagră|alb|albă|gri|rosu|rosie|roșu|roșie|albastru|albastra|albastră|verde|galben|galbena|galbenă|portocaliu|portocalie|auriu|aurie|argintiu|argintie|roz|mov|blue|maro|bej)\b/i,
        /\bculoare\s+(negru|neagra|neagră|alb|albă|gri|rosu|rosie|roșu|roșie|albastru|albastra|albastră|verde|galben|galbena|galbenă|portocaliu|portocalie|auriu|aurie|argintiu|argintie|roz|mov|blue|maro|bej)\b/i
      ],
      'stare': [
        /\bstare\s+(foarte\s+)?(buna|bună|excelenta|excelentă|perfecta|perfectă|noua|nouă|folosita|folosită|impecabila|impecabilă|uzata|uzată)\b/i,
        /\b(buna|bună|excelenta|excelentă|perfecta|perfectă|noua|nouă|folosita|folosită|impecabila|impecabilă|uzata|uzată|foarte\s+buna|foarte\s+bună)\b/i
      ],
      'baterie': [
        /\b(sanatate|sănătate|sanatatea|sănătatea)\s+(baterie|bateriei|bateria)\s+(\d+)\s*%?\b/i,
        /\b(baterie|bateria|bateriei)\s+(sanatate|sănătate|sanatatea|sănătatea)\s+(\d+)\s*%?\b/i,
        /\b(baterie|bateria|bateriei)\s+(\d+)\s*%?\b/i,
        /\b(\d+)\s*%\s*(baterie|bateria|bateriei|sanatate|sănătate|sanatatea|sănătatea)\b/i,
        /\b(baterie|bateria|bateriei)\s+(100|90|80|70|60|50|40|30|20|10)\s*%?\b/i,
        /\b(sanatate|sănătate|sanatatea|sănătatea)\s+(baterie|bateriei|bateria)\s+(100|90|80|70|60|50|40|30|20|10)\s*%?\b/i
      ],
      'deblocat': [
        /\b(deblocat|deblocata|deblocată)\s+(pe\s+)?(toate|orice)\s+(retelele|rețelele|retea|rețea|reteaua|rețeaua)\b/i,
        /\b(deblocat|deblocata|deblocată)\s+(in|în|pe)\s+(orice|toate)\s+(retea|rețea|retele|rețele)\b/i,
        /\b(deblocat|deblocata|deblocată|liber|libera|liberă)\s+(pentru|pe|in|în)\s+(orice|toate)\s*(retea|rețea|retele|rețele)?\b/i,
        /\b(deblocat|deblocata|deblocată|blocat|blocata|blocată|lock|unlock|liber|libera|liberă)\b/i,
        /\bstatus\s+(deblocat|deblocata|deblocată|blocat|blocata|blocată)\b/i
      ],
      'iCloud': [
        /\b(icloud|icloudul)\s+(sters|sters|activ|activa|dezactivat|dezactivata)\b/i,
        /\b(icloud|icloudul)\s+(liber|libera|gol|goala)\b/i
      ],
      'accesorii': [
        /\b(cutie|cablu|incarcator|incarcator|casti|headphones|caruia|caruia|folie|folie|husa|husa|accesorii)\b/i,
        /\baccesorii\s+(cutie|cablu|incarcator|casti|folie|husa)\b/i
      ]
    };
    
    // Check each required field
    for (const field of requiredFields) {
      const patterns = fieldPatterns[field];
      if (patterns) {
        for (const pattern of patterns) {
          if (pattern.test(normalizedText) || pattern.test(text)) {
            return field;
          }
        }
      }
    }
    
    return null;
  }, [normalizeRo]);

  // Funcție pentru detectarea categoriei și subcategoriei folosind ChatGPT (prin API route)
  const detectCategoryWithChatGPT = useCallback(async (text: string, templates: any): Promise<{ category: string; subcategory: string; requiredFields: string[] } | null> => {
    // Verifică cache
    const cacheKey = text.toLowerCase().trim().substring(0, 100); // Primele 100 caractere pentru cache
    const cached = categoryCacheRef.current.get(cacheKey);
    if (cached) {
      console.log('✅ Using cached category:', cached.category, '>', cached.subcategory);
      return cached;
    }

    // Rate limiting: maxim un apel la 2 secunde
    const now = Date.now();
    const timeSinceLastCall = now - lastChatGPTCallRef.current;
    if (timeSinceLastCall < 2000) {
      console.log('⏳ Rate limiting: skipping ChatGPT call (too soon)');
      return null;
    }

    // Dacă suntem în rate limit (429), nu mai încercăm timp de 30 secunde
    if (chatGPTRateLimitRef.current) {
      console.log('⏳ Rate limit active, using fallback');
      return null;
    }

    // Textul trebuie să aibă minim 10 caractere pentru a apela ChatGPT
    if (text.trim().length < 10) {
      return null;
    }

    try {
      lastChatGPTCallRef.current = now;
      const response = await dashboardApiFetch('/api/detect-category', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ text })
      });

      if (!response.ok) {
        if (response.status === 429) {
          console.warn('⚠️ Rate limit hit (429), using fallback for 30 seconds');
          chatGPTRateLimitRef.current = true;
          setTimeout(() => {
            chatGPTRateLimitRef.current = false;
            console.log('✅ Rate limit reset, ChatGPT available again');
          }, 30000); // 30 secunde
        }
        console.error('API route error:', response.status, response.statusText);
        return null;
      }

      const result = await response.json();
      if (result.error) {
        console.error('Error from API:', result.error);
        return null;
      }

      // Salvează în cache
      const detected = {
        category: result.category,
        subcategory: result.subcategory,
        requiredFields: result.requiredFields || []
      };
      categoryCacheRef.current.set(cacheKey, detected);
      // Limitează cache-ul la 50 intrări
      if (categoryCacheRef.current.size > 50) {
        const firstKey = categoryCacheRef.current.keys().next().value;
        if (firstKey) {
          categoryCacheRef.current.delete(firstKey);
        }
      }

      console.log('✅ ChatGPT detected category:', detected.category, '>', detected.subcategory);
      return detected;
    } catch (error) {
      console.error('Error detecting category with ChatGPT:', error);
      return null;
    }
  }, []);

  // Primele 3–7 cuvinte pentru detectarea categoriei (începutul anunțului e cel mai relevant)
  const firstWordsForCategory = useCallback((text: string, minWords = 3, maxWords = 7): string => {
    const trimmed = text.trim();
    if (!trimmed) return '';
    const words = trimmed.split(/\s+/).filter(Boolean);
    if (words.length < minWords) return trimmed;
    return words.slice(0, maxWords).join(' ');
  }, []);

  // Funcție pentru detectarea categoriei și subcategoriei din textul dictat
  // OPTIMIZAT: folosește doar primele 3–7 cuvinte + verificare rapidă locală
  const detectCategoryFromText = useCallback(async (text: string) => {
    if (!text || text.trim().length < 3) return null;
    
    const textForCategory = firstWordsForCategory(text, 3, 7);
    if (!textForCategory || textForCategory.length < 3) return null;
    
    const lowerText = textForCategory.toLowerCase();
    const normalizedText = normalizeRo(lowerText);
    console.log('Detecting category from first words:', lowerText);
    
    // Încarcă templates pentru a obține structura categoriilor
    try {
      const templatesModule = await import('./description-templates.json');
      const templates = templatesModule.default || templatesModule;
      console.log('Templates loaded:', Object.keys(templates));
      
      // VERIFICARE RAPIDĂ LOCALĂ (prioritate maximă pentru viteză)
      // Detectează cazurile clare instant, fără a aștepta ChatGPT
      
      // 1. PIESE AUTO - verificare rapidă cu regex
      const carPartsPatterns = [
        /\b(aripa|aripă|aripă\s+de|aripă\s+dreaptă|aripă\s+stângă|aripă\s+față|aripă\s+spate)\b/i,
        /\b(capotă|capota)\b/i,
        /\b(far|faruri|far\s+stâng|far\s+drept|far\s+față|far\s+spate)\b/i,
        /\b(parbriz|parbrizul|geam|geamuri|geam\s+față|geam\s+spate)\b/i,
        /\b(oglindă|oglinda|oglindă\s+retrovizoare|oglindă\s+laterală)\b/i,
        /\b(bară|bara|bară\s+față|bară\s+spate|bară\s+laterală|bumper|bumperul)\b/i,
        /\b(spoiler|spoilerul|grilă)\b/i,
        /\b(cutie\s+(de\s+)?viteze|transmisie)\b/i,
        /\b(motor|motorul|bloc\s+motor|cap\s+motor)\b/i,
        /\b(suspensie|suspensiile|amortizor|amortizoare)\b/i,
        /\b(frana|frâna|frane|frâne|disc\s+frână|plăcuțe\s+frână)\b/i,
        /\b(roți|jante|jantele|anvelope|cauciucuri|pneuri)\b/i,
        /\b(volan|volanul|scaun|scaune|scaun\s+șofer|scaun\s+pasager)\b/i,
        /\b(uși|portiere|portieră|portiera)\b/i,
        /\b(huse|husă|husa|tapiterie|tapiteria)\b/i,
        /\b(piese\s+auto|piese\s+bmw|piese\s+audi|piese\s+mercedes|piese)\b/i,
        /\b(accesorii\s+auto|accesorii\s+mașină)\b/i,
        /\b(filtru|filtru\s+ulei|filtru\s+aer|filtru\s+combustibil)\b/i,
        /\b(baterie\s+auto|baterie\s+mașină)\b/i,
        /\b(radiator|radiatorul|alternator|alternatorul|starter|starterul)\b/i,
        /\b(senzori|senzor|senzor\s+parcare|senzor\s+ploaie)\b/i,
        /\b(camera\s+parcare|camera\s+față|camera\s+spate)\b/i,
        /\b(navigație\s+auto|gps\s+auto|radio\s+auto|sistem\s+audio)\b/i,
        /\b(led|leduri|xenon|halogen)\b/i
      ];
      
      const hasCarPart = carPartsPatterns.some(pattern => 
        pattern.test(lowerText) || pattern.test(normalizedText)
      );
      
      if (hasCarPart) {
        const categoryData = (templates as any)['Autovehicule'];
        if (categoryData?.['Piese Auto și Accesorii']) {
          console.log('⚡ FAST: Detected Piese Auto și Accesorii');
          return {
            category: 'Autovehicule',
            subcategory: 'Piese Auto și Accesorii',
            requiredFields: categoryData['Piese Auto și Accesorii'].requiredFields || []
          };
        }
      }
      
      // 2. TELEFOANE MOBILE - verificare rapidă
      const phonePatterns = [
        /\b(iphone|samsung|xiaomi|huawei|oppo|oneplus|realme|pixel|nokia|telefon|smartphone|mobil|telefonul|telefonului)\b/i
      ];
      
      if (phonePatterns.some(pattern => pattern.test(lowerText))) {
        const categoryData = (templates as any)['Electronice & Tehnologie'];
        if (categoryData?.['Telefoane Mobile']) {
          console.log('⚡ FAST: Detected Telefoane Mobile');
          return {
            category: 'Electronice & Tehnologie',
            subcategory: 'Telefoane Mobile',
            requiredFields: categoryData['Telefoane Mobile'].requiredFields || []
          };
        }
      }
      
      // 3. AUTOTURISME - verificare rapidă (doar dacă NU este piesă auto)
      if (!hasCarPart && /\b(masina|mașină|autoturism|vehicul|automobil|masina\s+intreaga|mașină\s+întreagă)\b/i.test(lowerText)) {
        const categoryData = (templates as any)['Autovehicule'];
        if (categoryData?.['Autoturisme']) {
          console.log('⚡ FAST: Detected Autoturisme');
          return {
            category: 'Autovehicule',
            subcategory: 'Autoturisme',
            requiredFields: categoryData['Autoturisme'].requiredFields || []
          };
        }
      }
      
      // 4. LAPTOPURI - verificare rapidă
      if (/\b(laptop|notebook|pc|computer|macbook|dell|hp|lenovo|asus|acer|msi|razer)\b/i.test(lowerText)) {
        const categoryData = (templates as any)['Electronice & Tehnologie'];
        if (categoryData?.['Laptopuri și PC-uri']) {
          console.log('⚡ FAST: Detected Laptopuri și PC-uri');
          return {
            category: 'Electronice & Tehnologie',
            subcategory: 'Laptopuri și PC-uri',
            requiredFields: categoryData['Laptopuri și PC-uri'].requiredFields || []
          };
        }
      }
      
      // 5. IMOBILIARE - verificare rapidă
      if (/\b(apartament|casa|casă|vila|vila|birou|teren|hala|imobiliar)\b/i.test(lowerText)) {
        const categoryData = (templates as any)['Imobiliare'];
        if (categoryData?.['Apartamente']) {
          console.log('⚡ FAST: Detected Imobiliare');
          return {
            category: 'Imobiliare',
            subcategory: 'Apartamente',
            requiredFields: categoryData['Apartamente'].requiredFields || []
          };
        }
      }
      
      // Dacă verificarea rapidă nu a găsit nimic clar, folosește ChatGPT pe primele cuvinte
      console.log('🤖 Using ChatGPT for complex/ambiguous cases');
      const chatGPTResult = await detectCategoryWithChatGPT(textForCategory, templates);
      if (chatGPTResult) {
        console.log('✅ ChatGPT detected:', chatGPTResult.category, '>', chatGPTResult.subcategory);
        return chatGPTResult;
      }
      
      // Fallback la logica veche dacă ChatGPT nu este disponibil sau eșuează
      console.log('Using fallback category detection');
      
      // Detectare pentru Electronice & Tehnologie
      // Verifică mai întâi cuvintele cheie pentru telefoane - trebuie să fie primul check
      const phoneKeywords = /\b(iphone|samsung|xiaomi|huawei|oppo|oneplus|realme|pixel|nokia|telefon|smartphone|mobil|telefonul|telefonului)\b/i;
      if (phoneKeywords.test(lowerText)) {
        const categoryData = (templates as any)['Electronice & Tehnologie'];
        if (categoryData?.['Telefoane Mobile']) {
          const requiredFields = categoryData['Telefoane Mobile'].requiredFields || [];
          console.log('✅ Detected Telefoane Mobile category from text:', lowerText);
          console.log('📋 Required fields:', requiredFields);
          if (requiredFields.length === 0) {
            console.warn('⚠️ No requiredFields found for Telefoane Mobile');
          }
          return {
            category: 'Electronice & Tehnologie',
            subcategory: 'Telefoane Mobile',
            requiredFields: requiredFields
          };
        } else {
          console.warn('⚠️ Telefoane Mobile subcategory not found in templates');
        }
      }
      
      if (lowerText.match(/\b(laptop|notebook|pc|computer|macbook|dell|hp|lenovo|asus|acer|msi|razer)\b/i)) {
        const categoryData = (templates as any)['Electronice & Tehnologie'];
        if (categoryData?.['Laptopuri și PC-uri']) {
          return {
            category: 'Electronice & Tehnologie',
            subcategory: 'Laptopuri și PC-uri',
            requiredFields: categoryData['Laptopuri și PC-uri'].requiredFields || []
          };
        }
      }
      
      if (lowerText.match(/\b(ipad|tableta|tablet|samsung tab)\b/i)) {
        const categoryData = (templates as any)['Electronice & Tehnologie'];
        if (categoryData?.['Tablete']) {
          return {
            category: 'Electronice & Tehnologie',
            subcategory: 'Tablete',
            requiredFields: categoryData['Tablete'].requiredFields || []
          };
        }
      }
      
      if (lowerText.match(/\b(tv|televizor|smart tv|lg|samsung tv|sony tv)\b/i)) {
        const categoryData = (templates as any)['Electronice & Tehnologie'];
        if (categoryData?.['TV & Audio']) {
          return {
            category: 'Electronice & Tehnologie',
            subcategory: 'TV & Audio',
            requiredFields: categoryData['TV & Audio'].requiredFields || []
          };
        }
      }
      
      if (lowerText.match(/\b(playstation|ps5|ps4|xbox|nintendo|switch|console)\b/i)) {
        const categoryData = (templates as any)['Electronice & Tehnologie'];
        if (categoryData?.['Console & Jocuri']) {
          return {
            category: 'Electronice & Tehnologie',
            subcategory: 'Console & Jocuri',
            requiredFields: categoryData['Console & Jocuri'].requiredFields || []
          };
        }
      }
      
      // Detectare pentru Autovehicule
      if (lowerText.match(/\b(masina|mașină|auto|bmw|mercedes|audi|opel|ford|dacia|renault|volkswagen|skoda|peugeot|citroen|fiat|toyota|honda|nissan|hyundai|kia)\b/i)) {
        const categoryData = (templates as any)['Autovehicule'];
        if (categoryData?.['Autoturisme']) {
          return {
            category: 'Autovehicule',
            subcategory: 'Autoturisme',
            requiredFields: categoryData['Autoturisme'].requiredFields || []
          };
        }
      }
      
      if (lowerText.match(/\b(motocicleta|motocicletă|scuter|motor|yamaha|honda|kawasaki|suzuki|ducati)\b/i)) {
        const categoryData = (templates as any)['Autovehicule'];
        if (categoryData?.['Motociclete']) {
          return {
            category: 'Autovehicule',
            subcategory: 'Motociclete',
            requiredFields: categoryData['Motociclete'].requiredFields || []
          };
        }
      }
      
      // Detectare pentru Imobiliare
      if (lowerText.match(/\b(apartament|casa|casă|vila|vila|birou|teren|hala|imobiliar)\b/i)) {
        const categoryData = (templates as any)['Imobiliare'];
        if (categoryData?.['Apartamente']) {
          return {
            category: 'Imobiliare',
            subcategory: 'Apartamente',
            requiredFields: categoryData['Apartamente'].requiredFields || []
          };
        }
      }
      
    } catch (error) {
      console.error('Error loading templates for category detection:', error);
    }
    
    return null;
  }, [normalizeRo, detectCategoryWithChatGPT, firstWordsForCategory]);

  // Descriere scurtă și corectă când progresul e complet (template-uri pe subcategorie)
  const buildShortDescription = useCallback((
    category: string,
    subcategory: string,
    fields: Record<string, string>
  ): string => {
    const get = (k: string) => fields[k]?.trim() || '';
    const shortTemplates: Record<string, string> = {
      'Telefoane Mobile': 'Vând {marca} {model}, {capacitate}, {culoare}, stare {stare}. Baterie {baterie}. {deblocat}. Inclus: {accesorii}.',
      'Piese Auto și Accesorii': 'Vând piesă {tip} {marca} {model}. Stare: {stare}. Compatibilitate: {compatibilitate}.',
      'Autoturisme': 'Vând {marca} {model}, an {an}, {kilometraj} km. {combustibil}, {cutie}. Stare: {stare}. Dotări: {dotari}.',
      'Laptopuri și PC-uri': 'Vând {marca} {model}, {procesor}, {ram} RAM, {stocare}. Stare: {stare}. Inclus: {accesorii}.',
      'Tablete': 'Vând {marca} {model}, {capacitate}, {culoare}. Stare: {stare}. Inclus: {accesorii}.',
      'Apartamente': 'Apartament {camere}, {suprafata} mp, etaj {etaj}, an {an}. Stare: {stare}. Dotări: {dotari}.',
    };
    let tpl = shortTemplates[subcategory];
    if (!tpl) {
      const parts = Object.entries(fields).filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`);
      return parts.length ? parts.join('. ') + '.' : '';
    }
    let out = tpl;
    for (const [key, value] of Object.entries(fields)) {
      if (value) out = out.replace(new RegExp(`\\{${key}\\}`, 'gi'), value);
    }
    out = out.replace(/\{[^}]+\}/g, '').replace(/\s+/g, ' ').replace(/\s*,\s*,/g, ',').replace(/\s*\.\s*\./g, '.').trim();
    return out;
  }, []);

  // Când progresul e complet, reformulează descrierea în scurtă și corectă (o singură dată per categorie)
  useEffect(() => {
    if (!showQuickAddModal || !detectedCategory?.requiredFields?.length) return;
    const required = detectedCategory.requiredFields;
    const isComplete = completedFields.size >= required.length;
    const allFilled = required.every((f: string) => extractedFieldValues[f]?.trim());
    if (!isComplete || !allFilled) return;
    if (reformulatedForCategoryRef.current === detectedCategory.subcategory) return;
    const shortDesc = buildShortDescription(
      detectedCategory.category,
      detectedCategory.subcategory,
      extractedFieldValues
    );
    if (!shortDesc.trim()) return;
    reformulatedForCategoryRef.current = detectedCategory.subcategory;
    setQuickAddDescription(shortDesc);
    console.log('✅ Descriere reformulată (scurtă):', shortDesc.substring(0, 60) + '...');
  }, [
    showQuickAddModal,
    detectedCategory?.category,
    detectedCategory?.subcategory,
    detectedCategory?.requiredFields,
    completedFields.size,
    extractedFieldValues,
    buildShortDescription,
  ]);

  // Update refs when functions change
  useEffect(() => {
    extractFieldValueRef.current = extractFieldValue;
  }, [extractFieldValue]);
  
  useEffect(() => {
    detectCategoryFromTextRef.current = detectCategoryFromText;
  }, [detectCategoryFromText]);
  
  // Update refs when state changes (after state declarations)
  useEffect(() => {
    detectedCategoryRef.current = detectedCategory;
  }, [detectedCategory]);
  
  useEffect(() => {
    extractedFieldValuesRef.current = extractedFieldValues;
  }, [extractedFieldValues]);

  // Editable fields for generated product
  const [editableTitle, setEditableTitle] = useState<string>('');
  const [editableDescription, setEditableDescription] = useState<string>('');
  const [editableCategory, setEditableCategory] = useState<string>('');
  const [editableSubcategory, setEditableSubcategory] = useState<string>('');
  const [editableLevel3, setEditableLevel3] = useState<string>('');
  const [editableSize, setEditableSize] = useState<string>('');
  const [editableBrand, setEditableBrand] = useState<string>('');
  const [editableColor, setEditableColor] = useState<string>('');
  const [editableCondition, setEditableCondition] = useState<string>('Nou');
  const [editablePrice, setEditablePrice] = useState<number>(0);
  
  // Funcție pentru procesarea și îmbunătățirea descrierii vocale
  const processAndEnhanceDescription = useCallback((callback?: () => void) => {
    if (!quickAddDescription.trim()) return;
    
    // Detectează categoria și subcategoria din descriere sau folosește cele existente
    let category = editableCategory || '';
    let subcategory = editableSubcategory || '';
    
    // Dacă nu există categorie, încearcă să o detecteze din descriere
    if (!category) {
      const suggested = suggestCategoryFromTitle(quickAddDescription);
      if (suggested) {
        category = suggested.category;
        subcategory = suggested.subcategory;
        setEditableCategory(category);
        setEditableSubcategory(subcategory);
      }
    }
    
    // Dacă tot nu avem categorie, folosește o categorie default
    if (!category) {
      category = 'Electronice & Tehnologie';
      subcategory = 'Telefoane Mobile';
    }
    
    // Importă funcțiile de procesare
    import('@/lib/description-processor').then(({ processVoiceDescription, removePriceFromDescription, extractPrice }) => {
      // Extrage prețul din descriere înainte de procesare
      const { price, currency } = extractPrice(quickAddDescription);
      if (price && price > 0) {
        setQuickAddRequestedPrice(price);
        setQuickAddCurrency(currency);
        showNotification('info', 'Preț detectat', `Prețul de ${price} ${currency} a fost extras automat. Poți modifica dacă este necesar.`, true);
      }
      
      // Elimină prețul din descriere
      let cleanedDescription = removePriceFromDescription(quickAddDescription);
      
      // Procesează descrierea vocală
      const { description, missingFields, extractedFields } = processVoiceDescription(
        cleanedDescription,
        category,
        subcategory
      );
      
      // Actualizează descrierea procesată
      setQuickAddDescription(description);
      
      // Dacă există câmpuri lipsă
      if (missingFields.length > 0) {
        // Dacă există callback (utilizatorul vrea să publice), afișează modal pentru câmpuri lipsă
        if (callback) {
          // Blochează publicarea și afișează modal pentru câmpuri lipsă
          setMissingFieldsData({
            fields: missingFields,
            category,
            subcategory,
            extractedFields
          });
          setFieldInputs({});
          setShowMissingFieldsModal(true);
          
          // Oprește dictarea
          if (quickAddRecognitionRef.current) {
            try { quickAddRecognitionRef.current.stop(); } catch (_) {}
            quickAddRecognitionRef.current = null;
          }
          setQuickAddIsDictating(false);
          setQuickAddInterimText('');
          setDetectedCategory(null); // Resetează categoria
          return; // Nu continuă cu publicarea
        } else {
          // Dacă nu există callback, doar afișează notificare
          showNotification('info', 'Descriere îmbunătățită', 
            `Descrierea a fost structurată. Câmpuri care ar putea fi completate: ${missingFields.join(', ')}`);
        }
      } else {
        // Nu sunt câmpuri lipsă
        if (callback) {
          // Dacă există callback și nu sunt câmpuri lipsă, publică direct
          showNotification('success', 'Descriere procesată', 
            'Descrierea a fost structurată și îmbunătățită automat. Se publică anunțul...');
          
          // Oprește dictarea
          if (quickAddRecognitionRef.current) {
            try { quickAddRecognitionRef.current.stop(); } catch (_) {}
            quickAddRecognitionRef.current = null;
          }
          setQuickAddIsDictating(false);
          setQuickAddInterimText('');
          setDetectedCategory(null); // Resetează categoria
          
          // Execută callback-ul pentru publicare
          setTimeout(callback, 500);
          return;
        } else {
          // Dacă nu există callback, doar afișează notificare
          showNotification('success', 'Descriere procesată', 
            'Descrierea a fost structurată și îmbunătățită automat.');
        }
      }
      
      // Oprește dictarea (dacă nu s-a oprit deja)
      if (quickAddRecognitionRef.current) {
        try { quickAddRecognitionRef.current.stop(); } catch (_) {}
        quickAddRecognitionRef.current = null;
      }
      setQuickAddIsDictating(false);
      setQuickAddInterimText('');
      setDetectedCategory(null); // Resetează categoria
    }).catch(error => {
      console.error('Error processing description:', error);
      // Dacă procesarea eșuează, doar elimină prețul
      import('@/lib/description-processor').then(({ removePriceFromDescription }) => {
        const cleaned = removePriceFromDescription(quickAddDescription);
        setQuickAddDescription(cleaned);
      });
    });
  }, [quickAddDescription, editableCategory, editableSubcategory, showNotification]);

  // Categories and subcategories for dropdowns
  const categories = [
    'Imobiliare',
    'Autovehicule',
    'Utilaje & Echipamente',
    'Artă & Antichități',
    'Electronice & Tehnologie',
    'Casă & Grădină',
    'Modă & Lifestyle',
    'Mama și copilul',
    'Agricultură & Zootehnie',
    'Maritime & Aeronautice',
    'Business',
    'Materiale Construcții',
    'Diverse / Speciale'
  ];

  const subcategories: Record<string, string[]> = {
    'Imobiliare': [
      'Apartamente',
      'Case și Vile',
      'Terenuri Intravilane',
      'Terenuri Agricole',
      'Spații Comerciale',
      'Hale Industriale',
      'Proprietăți Turistice'
    ],
    'Autovehicule': [
      'Autoturisme',
      'SUV / 4x4',
      'Motociclete și Scutere',
      'Camioane',
      'Remorci și Semiremorci',
      'Autorulote / Rulote',
      'Vehicule Electrice',
      'Piese Auto și Accesorii'
    ],
    'Utilaje & Echipamente': [
      'Utilaje Construcții',
      'Utilaje Agricole',
      'Echipamente Forestiere',
      'Generatoare și Compresoare',
      'Scule Profesionale',
      'Echipamente Ateliere Auto',
      'Echipamente Electrice / Sudură'
    ],
    'Artă & Antichități': [
      'Picturi',
      'Sculpturi',
      'Bijuterii și Ceasuri',
      'Obiecte de Colecție',
      'Mobilier de Epocă',
      'Cărți Rare, Hărți Vechi',
      'Fotografie Artistică',
      'Licitații Caritabile'
    ],
    'Electronice & Tehnologie': [
      'Laptopuri și PC-uri',
      'Telefoane Mobile',
      'Tablete',
      'TV & Audio',
      'Console & Jocuri',
      'Drone & Gadgeturi Smart',
      'Echipamente Foto/Video'
    ],
    'Casă & Grădină': [
      'Mobilier Interior',
      'Mobilier Exterior',
      'Echipamente de Grădinărit',
      'Decorațiuni',
      'Electrocasnice'
    ],
    'Modă & Lifestyle': [
      'Haine de Designer',
      'Încălțăminte',
      'Genți & Accesorii',
      'Parfumuri & Cosmetice',
      'Ceasuri de Lux'
    ],
    'Mama și copilul': [
      'Haine copil',
      'Încălțăminte copil',
      'Jucării',
      'Mobilier copil',
      'Coșul copilului',
      'Îngrijire bebeluși',
      'Scaune auto copil',
      'Cărucioare',
      'Hranire copil'
    ],
    'Agricultură & Zootehnie': [
      'Tractoare, Combine',
      'Remorci Agricole',
      'Echipamente de Irigații',
      'Animale',
      'Semințe, Furaje, Îngrășăminte'
    ],
    'Maritime & Aeronautice': [
      'Bărci, Iahturi, Skijeturi',
      'Motoare Marine',
      'Avioane Mici / Ultraleușoare',
      'Dronuri Industriale'
    ],
    'Business': [
      'Echipamente de Birou',
      'Mobilier Comercial',
      'Calculatoare Second-Hand',
      'Licitații Lichidări Firme',
      'Loturi Stocuri Produse'
    ],
    'Materiale Construcții': [
      'Ciment, Cărămidă, Oțel',
      'Materiale Izolație',
      'Feronerie, Unelte',
      'Uși, Ferestre, Tâmplărie'
    ],
    'Diverse / Speciale': [
      'Licitații Caritabile',
      'Obiecte Militare / Istorice',
      'NFT / Artă Digitală',
      'Colecții Private',
      'Bunuri Confiscate / Executări'
    ]
  };

  // Helper function to match AI-generated category/subcategory with available options
  const matchCategory = (aiCategory: string): string => {
    if (!aiCategory) return '';
    const normalized = aiCategory.trim();
    // Exact match
    if (categories.includes(normalized)) return normalized;
    // Fuzzy match - check if any category contains the AI category or vice versa
    const match = categories.find(cat => 
      cat.toLowerCase().includes(normalized.toLowerCase()) || 
      normalized.toLowerCase().includes(cat.toLowerCase())
    );
    return match || '';
  };

  const matchSubcategory = (aiSubcategory: string, category: string): string => {
    if (!aiSubcategory || !category) return '';
    const normalized = aiSubcategory.trim();
    const categorySubs = subcategories[category] || [];
    // Exact match
    if (categorySubs.includes(normalized)) return normalized;
    // Fuzzy match
    const match = categorySubs.find(sub => 
      sub.toLowerCase().includes(normalized.toLowerCase()) || 
      normalized.toLowerCase().includes(sub.toLowerCase())
    );
    return match || '';
  };

  // Reguli pentru autocompletare categorie/subcategorie din titlu (prima potrivire câștigă)
  const TITLE_TO_CATEGORY_RULES: { keywords: string[]; category: string; subcategory: string }[] = [
    { keywords: ['iphone', 'samsung galaxy', 'xiaomi', 'huawei', 'oppo', 'oneplus', 'realme', 'smartphone', 'telefon mobil', 'telefoane mobile'], category: 'Electronice & Tehnologie', subcategory: 'Telefoane Mobile' },
    { keywords: ['laptop', 'notebook', 'ultrabook', 'dell ', 'hp ', 'lenovo', 'asus laptop', 'acer ', 'macbook', 'pc desktop'], category: 'Electronice & Tehnologie', subcategory: 'Laptopuri și PC-uri' },
    { keywords: ['tabletă', 'tableta', 'ipad', 'samsung tab'], category: 'Electronice & Tehnologie', subcategory: 'Tablete' },
    { keywords: ['tv ', 'televizor', 'smart tv', 'sony tv', 'samsung tv', 'lg tv'], category: 'Electronice & Tehnologie', subcategory: 'TV & Audio' },
    { keywords: ['playstation', 'xbox', 'nintendo', 'console', 'ps5', 'ps4'], category: 'Electronice & Tehnologie', subcategory: 'Console & Jocuri' },
    { keywords: ['drone', 'dronă', 'dji ', 'gopro'], category: 'Electronice & Tehnologie', subcategory: 'Drone & Gadgeturi Smart' },
    { keywords: ['cameră foto', 'camera foto', 'canon', 'nikon', 'fujifilm', 'objectiv'], category: 'Electronice & Tehnologie', subcategory: 'Echipamente Foto/Video' },
    // Piese Auto ÎNAINTE de Autoturisme – ca „cutie de viteze bmw”, „piese audi” să dea Piese Auto, nu mașină întreagă
    { keywords: ['cutie de viteze', 'cutie viteze', 'cutie-viteze', 'piese auto', 'piesa auto', 'accesorii auto', 'jante', 'anvelope', 'anvelopă', 'transmisie auto', 'amortizor', 'distribuție auto', 'distributie auto', 'far ', 'faruri', 'capotă', 'capota', 'kit ambreiaj', 'volan auto', 'bord auto', 'scaun auto', 'senzor auto', 'reductor', 'diferențial', 'diferential', 'cardan', 'arbore cotit', 'filtru ulei', 'filtru motor', 'bujii', 'bobina auto', 'radiator ', 'pompă apă', 'pompa apa', 'intercooler', 'turbo ', 'egr ', 'dpf ', 'sonda lambda', 'centrală motor', 'centrala motor', 'oglindă retrovizoare', 'parbriz', 'portieră auto', 'portiera auto', 'bara față', 'bara fata', 'silent bloc', 'bieletă', 'bieleta', 'trapez direcție', 'articulație suspensie', 'rulment roată', 'covoraș auto', 'tapis auto'], category: 'Autovehicule', subcategory: 'Piese Auto și Accesorii' },
    { keywords: ['bmw', 'audi', 'mercedes', 'volkswagen', 'skoda', 'dacia', 'ford ', 'opel', 'renault ', 'peugeot', 'citroen', 'toyota', 'honda', 'hyundai', 'kia', 'seat', 'volvo', 'autoturism', 'sedan', 'berlină', 'berlina', 'mașină', 'masina', 'automobil'], category: 'Autovehicule', subcategory: 'Autoturisme' },
    { keywords: ['suv', '4x4', 'land rover', 'jeep', 'cross_over', 'crossover'], category: 'Autovehicule', subcategory: 'SUV / 4x4' },
    { keywords: ['motocicletă', 'motocicleta', 'moped', 'scooter', 'yamaha', 'harley', 'kawasaki', 'honda moto'], category: 'Autovehicule', subcategory: 'Motociclete și Scutere' },
    { keywords: ['camion', 'tir', 'semiremorcă', 'remorcă'], category: 'Autovehicule', subcategory: 'Camioane' },
    { keywords: ['tesla', 'vehicul electric', 'mașină electrică', 'masina electrica'], category: 'Autovehicule', subcategory: 'Vehicule Electrice' },
    { keywords: ['apartament', 'garsonieră', 'garsoniera', 'locuință', 'locuinta', 'imobil'], category: 'Imobiliare', subcategory: 'Apartamente' },
    { keywords: ['casă', 'casa', 'vilă', 'vila', 'house'], category: 'Imobiliare', subcategory: 'Case și Vile' },
    { keywords: ['teren', 'lot'], category: 'Imobiliare', subcategory: 'Terenuri Intravilane' },
    { keywords: ['spațiu comercial', 'spatiu comercial', 'birou', 'magazin'], category: 'Imobiliare', subcategory: 'Spații Comerciale' },
    { keywords: ['hală', 'hala', 'industrial'], category: 'Imobiliare', subcategory: 'Hale Industriale' },
    { keywords: ['tractor', 'combine', 'john deere', 'new holland', 'case ih', 'utilaj agricol'], category: 'Agricultură & Zootehnie', subcategory: 'Tractoare, Combine' },
    { keywords: ['remorcă agricolă', 'remorca agricola'], category: 'Agricultură & Zootehnie', subcategory: 'Remorci Agricole' },
    { keywords: ['utilaj construcții', 'utilaj constructii', 'excavator', 'buldozer', 'macara'], category: 'Utilaje & Echipamente', subcategory: 'Utilaje Construcții' },
    { keywords: ['generator', 'compresor'], category: 'Utilaje & Echipamente', subcategory: 'Generatoare și Compresoare' },
    { keywords: ['barcă', 'barca', 'iaht', 'ambarcațiune', 'boat'], category: 'Maritime & Aeronautice', subcategory: 'Bărci, Iahturi, Skijeturi' },
    { keywords: ['mobilier', 'canapea', 'masă', 'masa', 'dulap', 'pat ', 'scaun'], category: 'Casă & Grădină', subcategory: 'Mobilier Interior' },
    { keywords: ['electrocasnic', 'frigider', 'mașină spălat', 'masina spalat', 'cuptor'], category: 'Casă & Grădină', subcategory: 'Electrocasnice' },
    { keywords: ['pictură', 'pictura', 'tablou', 'artist'], category: 'Artă & Antichități', subcategory: 'Picturi' },
    { keywords: ['bijuterie', 'ceas luxury', 'ceas de lux', 'aur', 'argint'], category: 'Artă & Antichități', subcategory: 'Bijuterii și Ceasuri' },
    // Mama și copilul – ÎNAINTE de Casă & Grădină (mobilier copil vs mobilier interior)
    { keywords: ['carucioare', 'cărucioare', 'carucior', 'cărucior', 'chicco', 'bugaboo', 'stroller'], category: 'Mama și copilul', subcategory: 'Cărucioare' },
    { keywords: ['scaun auto copil', 'scaun auto bebelus', 'maxi cosi', 'britax'], category: 'Mama și copilul', subcategory: 'Scaune auto copil' },
    { keywords: ['jucarii', 'jucării', 'lego', 'papusi', 'păpuși', 'masinute', 'puzzle copil'], category: 'Mama și copilul', subcategory: 'Jucării' },
    { keywords: ['patut copil', 'patut bebelus', 'comoda copil', 'mobilier copil'], category: 'Mama și copilul', subcategory: 'Mobilier copil' },
    { keywords: ['cosul copilului', 'coșul copilului', 'puericultura', 'patut portabil'], category: 'Mama și copilul', subcategory: 'Coșul copilului' },
    { keywords: ['biberon', 'sterilizator', 'incalzitor biberoane', 'hranire copil'], category: 'Mama și copilul', subcategory: 'Hranire copil' },
    { keywords: ['haine copil', 'body copil', 'tricou copil', 'pantaloni copil'], category: 'Mama și copilul', subcategory: 'Haine copil' },
    { keywords: ['incaltaminte copil', 'pantofi copil', 'cizme copil'], category: 'Mama și copilul', subcategory: 'Încălțăminte copil' },
    { keywords: ['ingrijire bebelus', 'îngrijire bebeluși', 'termometru bebelus', 'aspirator nazal'], category: 'Mama și copilul', subcategory: 'Îngrijire bebeluși' },
  ];
  const suggestCategoryFromTitle = (title: string): { category: string; subcategory: string } | null => {
    if (!title || title.trim().length < 2) return null;
    const t = title.trim().toLowerCase();
    for (const rule of TITLE_TO_CATEGORY_RULES) {
      const found = rule.keywords.some(kw => t.includes(kw.trim().toLowerCase()));
      if (found) return { category: rule.category, subcategory: rule.subcategory };
    }
    return null;
  };

  // Premium Promotion Modal (Per-product promotion)
  const [showPremiumModal, setShowPremiumModal] = useState(false);
  const [selectedProductForPremium, setSelectedProductForPremium] = useState<string | null>(null);
  const [premiumWeeks, setPremiumWeeks] = useState<number>(1);
  const [isProcessingPremium, setIsProcessingPremium] = useState(false);
  const premiumAmount = premiumWeeks === 4 ? 9.99 : 4.99;
  const [userCreditBalance, setUserCreditBalance] = useState<number>(0);
  const [isLoadingCredit, setIsLoadingCredit] = useState(false);

  // ========== MODAL LIVE BID ==========
  const [showManualAddModal, setShowManualAddModal] = useState(false);
  /** Locație memorată: afișare compactă blocată + „Editează” (doar la anunț nou, nu la editare). */
  const [manualFormFavoriteLocationLocked, setManualFormFavoriteLocationLocked] = useState(false);
  const [manualFormFavoriteSaveFeedback, setManualFormFavoriteSaveFeedback] = useState(false);
  /** Preview la click pe thumbnail în formularul manual (revocăm object URL la închidere) */
  const [manualImageLightboxSrc, setManualImageLightboxSrc] = useState<string | null>(null);
  /** Zona Media: highlight când tragi fișiere din explorer pe dropzone */
  const [manualFormFileDragActive, setManualFormFileDragActive] = useState(false);
  /** Un singur buton „Adaugă imagini”; în app nativ deschide meniu cameră / galerie */
  const [manualNativeAddMenuOpen, setManualNativeAddMenuOpen] = useState(false);
  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  const [editingProductRow, setEditingProductRow] = useState<Record<string, any> | null>(null);
  const [manualFormData, setManualFormData] = useState({
    title: '',
    description: '',
    category: '',
    subcategory: '',
    categoryLevel3: '',
    size: '',
    brand: '',
    model: '',
    capacitateCilindrica: '',
    ram: '',
    capacitateStocare: '',
    garantie: '',
    color: '',
    condition: 'Nou',
    sku: '',
    currency: 'RON' as 'RON' | 'EUR',
    productType: 'live-bid' as 'live-bid',
    buyNowEnabled: false,
    buyNowPriceRON: null as number | null,
    buyNowPriceEUR: null as number | null,
    isFreeListing: false,
    isUrgent: false,
    county: '',
    city: '',
    village: '',
    address: '',
    coordinates: undefined as { lat: number; lng: number } | undefined,
    images: [] as (string | File)[],
    customFields: {} as Record<string, any>,
    status: 'active' as 'draft' | 'active',
  });
  type LocalitiesData = { counties: string[]; byCounty: Record<string, { cities: string[]; villages: Record<string, string[]> }> };
  const [localitiesByCounty, setLocalitiesByCounty] = useState<LocalitiesData | null>(null);
  const [manualFormPriceRon, setManualFormPriceRon] = useState<number>(0);
  const [manualFormPriceEur, setManualFormPriceEur] = useState<number>(0);
  const [manualFormExchangeRate, setManualFormExchangeRate] = useState<number | null>(null);
  const [manualFormIsSubmitting, setManualFormIsSubmitting] = useState(false);
  const [manualFormMessage, setManualFormMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [manualFormUseMyLocationBusy, setManualFormUseMyLocationBusy] = useState(false);
  const [manualFormLocationPermissionOpen, setManualFormLocationPermissionOpen] = useState(false);
  const [manualFormSkuEditable, setManualFormSkuEditable] = useState(false);
  const [manualFormSelectedImageFiles, setManualFormSelectedImageFiles] = useState<File[]>([]);
  const [manualFormBuyNowPriceRon, setManualFormBuyNowPriceRon] = useState<number | null>(null);
  const [manualFormBuyNowPriceEur, setManualFormBuyNowPriceEur] = useState<number | null>(null);
  const [manualFormIsFetchingRate, setManualFormIsFetchingRate] = useState(false);
  const [manualFormLastRateUpdate, setManualFormLastRateUpdate] = useState<Date | null>(null);
  const [manualFormExchangeError, setManualFormExchangeError] = useState<string | null>(null);
  const [manualFormUserTokens, setManualFormUserTokens] = useState({
    balance: 0,
    totalEarned: 0,
    totalSpent: 0,
    level: 'Basic',
    package: 'Basic' as string
  });
  const [manualFormIsGeneratingSEO, setManualFormIsGeneratingSEO] = useState(false);
  const [manualFormIsEnhancing, setManualFormIsEnhancing] = useState(false);
  const [manualFormAutoEnhance, setManualFormAutoEnhance] = useState(false);
  const [manualFormRewriteTitle, setManualFormRewriteTitle] = useState(false);
  const [manualFormRewriteDescription, setManualFormRewriteDescription] = useState(false);
  const [manualFormSEO, setManualFormSEO] = useState({
    title: '',
    description: '',
    keywords: [] as string[]
  });
  const [manualFormDiscountPercent, setManualFormDiscountPercent] = useState<number | null>(null);
  const [manualFormDiscountValueRon, setManualFormDiscountValueRon] = useState<number | null>(null);
  const [manualFormDiscountValueEur, setManualFormDiscountValueEur] = useState<number | null>(null);
  const [manualFormDiscountedPriceRon, setManualFormDiscountedPriceRon] = useState<number | null>(null);
  const [manualFormDiscountedPriceEur, setManualFormDiscountedPriceEur] = useState<number | null>(null);

  // Helper functions
  const SKU_TOTAL_LENGTH = 10;
  const SKU_PREFIX_LENGTH = 4;
  const SKU_SUFFIX_LENGTH = SKU_TOTAL_LENGTH - SKU_PREFIX_LENGTH;
  const SKU_CHARSET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const MAX_IMAGES = 20;
  const FREE_IMAGES = 8;
  const MAX_DOCUMENTS = 10;
  const MAX_DOCUMENT_SIZE_MB = 10;

  const roundTo = (value: number, decimals = 2) => {
    return Math.round(value * Math.pow(10, decimals)) / Math.pow(10, decimals);
  };

  const sanitizeSkuInput = (value: string): string => {
    const cleaned = value.toUpperCase().replace(/[^A-Z0-9]/g, '');
    return cleaned.slice(0, SKU_TOTAL_LENGTH);
  };

  const normalizeSubcategoryName = (value: string): string => {
    return value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4);
  };

  const generateSku = (subcategory: string, existingSkus: string[]): string => {
    const normalized = normalizeSubcategoryName(subcategory);
    if (!normalized) return '';

    const prefix = (normalized + 'XXXX').slice(0, SKU_PREFIX_LENGTH);
    for (let attempt = 0; attempt < 30; attempt++) {
      let suffix = '';
      for (let i = 0; i < SKU_SUFFIX_LENGTH; i++) {
        const randomIndex = Math.floor(Math.random() * SKU_CHARSET.length);
        suffix += SKU_CHARSET[randomIndex];
      }

      const candidate = `${prefix}${suffix}`;
      if (!existingSkus.includes(candidate)) {
        return candidate;
      }
    }

    const fallback = `${prefix}${Date.now().toString(36).toUpperCase().replace(/[^A-Z0-9]/g, '')}`;
    return fallback.slice(0, SKU_TOTAL_LENGTH).padEnd(SKU_TOTAL_LENGTH, '0');
  };

  // Categories and subcategories are already defined above (around line 954)
  // No need to redefine them here

  const counties = [
    'Alba', 'Arad', 'Argeș', 'Bacău', 'Bihor', 'Bistrița-Năsăud', 'Botoșani',
    'Brașov', 'Brăila', 'Buzău', 'Caraș-Severin', 'Călărași', 'Cluj', 'Constanța',
    'Covasna', 'Dâmbovița', 'Dolj', 'Galați', 'Giurgiu', 'Gorj', 'Harghita',
    'Hunedoara', 'Ialomița', 'Iași', 'Ilfov', 'Maramureș', 'Mehedinți', 'Mureș',
    'Neamț', 'Olt', 'Prahova', 'Sălaj', 'Satu Mare', 'Sibiu', 'Suceava',
    'Teleorman', 'Timiș', 'Tulcea', 'Vâlcea', 'Vaslui', 'Vrancea', 'București'
  ];

  // Orașe per județ (reședințe + alte localități frecvente)
  const citiesByCounty: Record<string, string[]> = {
    'Alba': ['Alba Iulia', 'Aiud', 'Blaj', 'Sebeș', 'Zlatna'],
    'Arad': ['Arad', 'Lipova', 'Chișineu-Criș', 'Ineu', 'Pâncota'],
    'Argeș': ['Pitești', 'Câmpulung', 'Curtea de Argeș', 'Mioveni', 'Ștefănești'],
    'Bacău': ['Bacău', 'Onești', 'Moinești', 'Buhuși', 'Comănești'],
    'Bihor': ['Oradea', 'Salonta', 'Marghita', 'Beiuș', 'Aleșd'],
    'Bistrița-Năsăud': ['Bistrița', 'Beclean', 'Năsăud', 'Sângeorz-Băi', 'Sărățel'],
    'Botoșani': ['Botoșani', 'Dorohoi', 'Săveni', 'Flămânzi', 'Darabani'],
    'Brașov': ['Brașov', 'Făgăraș', 'Săcele', 'Codlea', 'Râșnov', 'Predeal', 'Zărnești'],
    'Brăila': ['Brăila', 'Ianca', 'Însurăței', 'Făurei'],
    'București': ['București', 'Sector 1', 'Sector 2', 'Sector 3', 'Sector 4', 'Sector 5', 'Sector 6'],
    'Buzău': ['Buzău', 'Râmnicu Sărat', 'Nehoiu', 'Pătârlagele', 'Pogoanele'],
    'Caraș-Severin': ['Reșița', 'Caransebeș', 'Oravița', 'Moldova Nouă', 'Băile Herculane'],
    'Călărași': ['Călărași', 'Oltenița', 'Fundulea', 'Lehliu-Gară', 'Budești'],
    'Cluj': ['Cluj-Napoca', 'Dej', 'Gherla', 'Turda', 'Câmpia Turzii', 'Huedin', 'Florești'],
    'Constanța': ['Constanța', 'Mangalia', 'Medgidia', 'Cernavodă', 'Năvodari', 'Eforie', 'Ovidiu', 'Techirghiol'],
    'Covasna': ['Sfântu Gheorghe', 'Târgu Secuiesc', 'Baraolt', 'Covasna', 'Întorsura Buzăului'],
    'Dâmbovița': ['Târgoviște', 'Moreni', 'Găești', 'Pucioasa', 'Titu', 'Fieni', 'Racari'],
    'Dolj': ['Craiova', 'Băilești', 'Calafat', 'Filiași', 'Segarcea', 'Bechet'],
    'Galați': ['Galați', 'Tecuci', 'Târgu Bujor', 'Berești'],
    'Giurgiu': ['Giurgiu', 'Bolintin-Vale', 'Mihăilești', 'Comana'],
    'Gorj': ['Târgu Jiu', 'Motru', 'Rovinari', 'Bumbești-Jiu', 'Târgu Cărbunești'],
    'Harghita': ['Miercurea Ciuc', 'Odorheiu Secuiesc', 'Gheorgheni', 'Toplița', 'Cristuru Secuiesc', 'Băile Tușnad'],
    'Hunedoara': ['Deva', 'Hunedoara', 'Petroșani', 'Lupeni', 'Vulcan', 'Orăștie', 'Brad', 'Simeria'],
    'Ialomița': ['Slobozia', 'Fetești', 'Urziceni', 'Tândărei', 'Amara', 'Ciochina'],
    'Iași': ['Iași', 'Pașcani', 'Hârlău', 'Târgu Frumos', 'Podu Iloaiei', 'Ungheni'],
    'Ilfov': ['Buftea', 'Voluntari', 'Popești-Leordeni', 'Pantelimon', 'Bragadiru', 'Chitila', 'Măgurele', 'Otopeni', 'Mogosoaia', 'Snagov'],
    'Maramureș': ['Baia Mare', 'Sighetu Marmației', 'Baia Sprie', 'Borsa', 'Târgu Lăpuș', 'Vișeu de Sus', 'Cavnic'],
    'Mehedinți': ['Drobeta-Turnu Severin', 'Orșova', 'Strehaia', 'Vânju Mare', 'Baia de Aramă'],
    'Mureș': ['Târgu Mureș', 'Reghin', 'Sighișoara', 'Târnăveni', 'Ludus', 'Sovata', 'Iernut'],
    'Neamț': ['Piatra Neamț', 'Roman', 'Târgu Neamț', 'Roznov', 'Bicaz', 'Bârgău'],
    'Olt': ['Slatina', 'Caracal', 'Corabia', 'Balș', 'Drăgănești-Olt', 'Scornicești'],
    'Prahova': ['Ploiești', 'Câmpina', 'Sinaia', 'Bușteni', 'Azuga', 'Băicoi', 'Breaza', 'Comarnic', 'Vălenii de Munte'],
    'Sălaj': ['Zalău', 'Jibou', 'Șimleu Silvaniei', 'Cehu Silvaniei', 'Crasna'],
    'Satu Mare': ['Satu Mare', 'Carei', 'Negrești-Oaș', 'Tășnad', 'Ardud'],
    'Sibiu': ['Sibiu', 'Mediaș', 'Cisnădie', 'Cârța', 'Avrig', 'Cisnădioara', 'Coplan', 'Șeica Mare', 'Agnita'],
    'Suceava': ['Suceava', 'Fălticeni', 'Rădăuți', 'Câmpulung Moldovenesc', 'Vatra Dornei', 'Gura Humorului', 'Siret'],
    'Teleorman': ['Alexandria', 'Roșiorii de Vede', 'Turnu Măgurele', 'Zimnicea', 'Videle'],
    'Timiș': ['Timișoara', 'Lugoj', 'Sânnicolau Mare', 'Jimbolia', 'Recaș', 'Făget', 'Buziaș', 'Deta'],
    'Tulcea': ['Tulcea', 'Babadag', 'Isaccea', 'Măcin', 'Sulina', 'Murighiol'],
    'Vâlcea': ['Râmnicu Vâlcea', 'Drăgășani', 'Călimănești', 'Băile Olănești', 'Brezoi', 'Horezu'],
    'Vaslui': ['Vaslui', 'Bârlad', 'Huși', 'Negrești', 'Murgeni'],
    'Vrancea': ['Focșani', 'Adjud', 'Mărășești', 'Odobești', 'Panciu'],
  };

  // Dynamic fields config - same as executor
  const dynamicFieldsConfig: Record<string, Record<string, Array<{
    key: string;
    label: string;
    type: 'text' | 'number' | 'select' | 'textarea';
    required: boolean;
    placeholder?: string;
    options?: string[];
    min?: number;
    max?: number;
    step?: number;
  }>>> = {
    'Imobiliare': {
      'Apartamente': [
        { key: 'numarcamere', label: 'Număr camere *', type: 'number', required: true, placeholder: 'Ex: 3', min: 1, max: 10 },
        { key: 'suprafata', label: 'Suprafață (mp)', type: 'number', required: false, placeholder: 'Ex: 75', min: 0, step: 0.01 },
        { key: 'etaj', label: 'Etaj', type: 'select', required: false, options: ['Parter', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10+', 'Ultimul etaj'] },
        { key: 'an', label: 'An construcție', type: 'number', required: false, placeholder: 'Ex: 2020', min: 1800, max: new Date().getFullYear() },
        { key: 'compartimentare', label: 'Compartimentare', type: 'select', required: false, options: ['Decomandat', 'Semidecomandat', 'Nedecomandat', 'Open Space'] },
        { key: 'mentenanta', label: 'Mențenanță (Lei/lună)', type: 'number', required: false, placeholder: 'Ex: 200', min: 0, step: 0.01 },
      ],
      'Case și Vile': [
        { key: 'numarcamere', label: 'Număr camere *', type: 'number', required: true, placeholder: 'Ex: 5', min: 1, max: 20 },
        { key: 'suprafata', label: 'Suprafață construită (mp)', type: 'number', required: false, placeholder: 'Ex: 150', min: 0, step: 0.01 },
        { key: 'suprafataTeren', label: 'Suprafață teren (mp)', type: 'number', required: false, placeholder: 'Ex: 500', min: 0, step: 0.01 },
        { key: 'an', label: 'An construcție', type: 'number', required: false, placeholder: 'Ex: 2015', min: 1800, max: new Date().getFullYear() },
        { key: 'gradina', label: 'Grădină', type: 'select', required: false, options: ['Da', 'Nu'] },
        { key: 'garaj', label: 'Garaj', type: 'select', required: false, options: ['Da', 'Nu'] },
        { key: 'piscina', label: 'Piscină', type: 'select', required: false, options: ['Da', 'Nu'] },
      ],
      'Terenuri Intravilane': [
        { key: 'suprafata', label: 'Suprafață (mp) *', type: 'number', required: true, placeholder: 'Ex: 500', min: 0, step: 0.01 },
        { key: 'tipTeren', label: 'Tip teren', type: 'select', required: false, options: ['Construcții', 'Parcelă', 'Comercial', 'Industrial', 'Servicii', 'Altele'] },
        { key: 'acces', label: 'Acces', type: 'select', required: false, options: ['Asfaltat', 'Pământ', 'Fără acces'] },
        { key: 'utilitati', label: 'Utilități', type: 'select', required: false, options: ['Apa', 'Curent', 'Gaz', 'Canalizare', 'Toate', 'Niciunul'] },
      ],
      'Terenuri Agricole': [
        { key: 'suprafata', label: 'Suprafață (ha) *', type: 'number', required: true, placeholder: 'Ex: 5', min: 0, step: 0.01 },
        { key: 'tipTeren', label: 'Tip teren', type: 'select', required: false, options: ['Arabil', 'Livadă', 'Pădure', 'Pajiște', 'Mixt', 'Altele'] },
        { key: 'acces', label: 'Acces', type: 'select', required: false, options: ['Asfaltat', 'Pământ', 'Drum forestier', 'Fără acces'] },
      ],
      'Spații Comerciale': [
        { key: 'suprafata', label: 'Suprafață (mp)', type: 'number', required: false, placeholder: 'Ex: 100', min: 0, step: 0.01 },
        { key: 'an', label: 'An construcție', type: 'number', required: false, placeholder: 'Ex: 2010', min: 1800, max: new Date().getFullYear() },
        { key: 'tipSpatiu', label: 'Tip spațiu', type: 'select', required: false, options: ['Magazin', 'Showroom', 'Depozit', 'Restaurant', 'Birouri', 'Altele'] },
        { key: 'etaj', label: 'Etaj', type: 'select', required: false, options: ['Parter', '1', '2', '3', '4', '5+'] },
        { key: 'chirie', label: 'Chirie (Lei/lună)', type: 'number', required: false, placeholder: 'Ex: 2000', min: 0, step: 0.01 },
      ],
      'Hale Industriale': [
        { key: 'suprafata', label: 'Suprafață (mp)', type: 'number', required: false, placeholder: 'Ex: 1000', min: 0, step: 0.01 },
        { key: 'an', label: 'An construcție', type: 'number', required: false, placeholder: 'Ex: 2015', min: 1800, max: new Date().getFullYear() },
        { key: 'caiAcces', label: 'Căi de Acces', type: 'select', required: false, options: ['Rutier', 'Feroviar', 'Ambele', 'Rutier principal'] },
        { key: 'utilitati', label: 'Utilități', type: 'select', required: false, options: ['Apa', 'Curent', 'Gaz', 'Canalizare', 'Toate', 'Niciunul'] },
      ],
      'Proprietăți Turistice': [
        { key: 'numarcamere', label: 'Număr camere *', type: 'number', required: true, placeholder: 'Ex: 4', min: 1, max: 20 },
        { key: 'suprafata', label: 'Suprafață (mp)', type: 'number', required: false, placeholder: 'Ex: 120', min: 0, step: 0.01 },
        { key: 'tipProprietate', label: 'Tip Proprietate', type: 'select', required: false, options: ['Cabana', 'Vila', 'Apartament', 'Complex', 'Altele'] },
        { key: 'capacitate', label: 'Capacitate (persoane)', type: 'number', required: false, placeholder: 'Ex: 8', min: 1 },
        { key: 'amenitati', label: 'Amenități', type: 'text', required: false, placeholder: 'Ex: Piscină, Saună, Jacuzzi' },
      ],
    },
    'Autovehicule': {
      'Autoturisme': [
        { key: 'marca', label: 'Marca', type: 'text', required: false, placeholder: 'Ex: BMW' },
        { key: 'model', label: 'Model', type: 'text', required: false, placeholder: 'Ex: X5' },
        { key: 'an', label: 'An Fabricare', type: 'number', required: false, placeholder: 'Ex: 2020', min: 1950, max: new Date().getFullYear() },
        { key: 'kilometraj', label: 'Kilometraj', type: 'number', required: false, placeholder: 'Ex: 50000', min: 0 },
        { key: 'combustibil', label: 'Combustibil', type: 'select', required: false, options: ['Benzină', 'Motorină', 'GPL', 'Electric', 'Hibrid'] },
        { key: 'transmisie', label: 'Transmisie', type: 'select', required: false, options: ['Manuală', 'Automată', 'CVT'] },
        { key: 'putere', label: 'Putere (KW)', type: 'number', required: false, placeholder: 'Ex: 150 sau 154.5', min: 0, step: 0.01 },
        { key: 'culoare', label: 'Culoare', type: 'text', required: false, placeholder: 'Ex: Negru' },
        { key: 'caroserie', label: 'Tip Caroserie', type: 'text', required: false, placeholder: 'Ex: Berlina, Break, SUV' },
        { key: 'serie_sasiu', label: 'Serie Șasiu', type: 'text', required: false, placeholder: 'Ex: JW 0LPD 6EB6FG087935' },
        { key: 'clasa_emisii', label: 'Clasa Emisii', type: 'text', required: false, placeholder: 'Ex: Euro 6, Euro 5' },
        { key: 'stare', label: 'Stare', type: 'select', required: false, options: ['Nou', 'Foarte bună', 'Bună', 'Folosit', 'Uzată'] },
        { key: 'capacitateCilindrica', label: 'Capacitate Cilindrică (cm³)', type: 'number', required: false, placeholder: 'Ex: 3000', min: 0 },
        { key: 'nrLocuri', label: 'Număr Locuri', type: 'number', required: false, placeholder: 'Ex: 5', min: 2, max: 9 },
      ],
      'SUV / 4x4': [
        { key: 'marca', label: 'Marca', type: 'text', required: false, placeholder: 'Ex: Land Rover' },
        { key: 'model', label: 'Model', type: 'text', required: false, placeholder: 'Ex: Discovery' },
        { key: 'an', label: 'An Fabricare', type: 'number', required: false, placeholder: 'Ex: 2021', min: 1950, max: new Date().getFullYear() },
        { key: 'kilometraj', label: 'Kilometraj', type: 'number', required: false, placeholder: 'Ex: 35000', min: 0 },
        { key: 'combustibil', label: 'Combustibil', type: 'select', required: false, options: ['Benzină', 'Motorină', 'GPL', 'Electric', 'Hibrid'] },
        { key: 'transmisie', label: 'Transmisie', type: 'select', required: false, options: ['Manuală', 'Automată', 'CVT'] },
        { key: 'putere', label: 'Putere (KW)', type: 'number', required: false, placeholder: 'Ex: 300 sau 154.5', min: 0, step: 0.01 },
        { key: 'culoare', label: 'Culoare', type: 'text', required: false, placeholder: 'Ex: Alb' },
        { key: 'tip4x4', label: 'Tip 4x4', type: 'select', required: false, options: ['Permanent', 'Cu blocare diferențială', 'Selectabil', 'Altele'] },
      ],
      'Motociclete și Scutere': [
        { key: 'marca', label: 'Marca', type: 'text', required: false, placeholder: 'Ex: Yamaha' },
        { key: 'model', label: 'Model', type: 'text', required: false, placeholder: 'Ex: R1' },
        { key: 'an', label: 'An Fabricare', type: 'number', required: false, placeholder: 'Ex: 2021', min: 1950, max: new Date().getFullYear() },
        { key: 'kilometraj', label: 'Kilometraj', type: 'number', required: false, placeholder: 'Ex: 15000', min: 0 },
        { key: 'combustibil', label: 'Combustibil', type: 'select', required: false, options: ['Benzină', 'Electric'] },
        { key: 'transmisie', label: 'Transmisie', type: 'select', required: false, options: ['Manuală', 'CVT'] },
        { key: 'putere', label: 'Putere (KW)', type: 'number', required: false, placeholder: 'Ex: 200 sau 154.5', min: 0, step: 0.01 },
        { key: 'culoare', label: 'Culoare', type: 'text', required: false, placeholder: 'Ex: Alb' },
        { key: 'capacitateCilindrica', label: 'Capacitate Cilindrică (cm³)', type: 'number', required: false, placeholder: 'Ex: 998', min: 0 },
      ],
      'Camioane': [
        { key: 'marca', label: 'Marca', type: 'text', required: false, placeholder: 'Ex: Mercedes' },
        { key: 'model', label: 'Model', type: 'text', required: false, placeholder: 'Ex: Actros' },
        { key: 'an', label: 'An Fabricare', type: 'number', required: false, placeholder: 'Ex: 2019', min: 1950, max: new Date().getFullYear() },
        { key: 'kilometraj', label: 'Kilometraj', type: 'number', required: false, placeholder: 'Ex: 200000', min: 0 },
        { key: 'capacitateIncarcare', label: 'Capacitate Încărcare (t)', type: 'number', required: false, placeholder: 'Ex: 20', min: 0 },
        { key: 'combustibil', label: 'Combustibil', type: 'select', required: false, options: ['Motorină', 'Electric', 'Hybrid'] },
      ],
      'Remorci și Semiremorci': [
        { key: 'tip', label: 'Tip', type: 'select', required: false, options: ['Remorcă', 'Semiremorcă'] },
        { key: 'capacitateIncarcare', label: 'Capacitate Încărcare (t)', type: 'number', required: false, placeholder: 'Ex: 25', min: 0 },
        { key: 'dimensiuni', label: 'Dimensiuni (m)', type: 'text', required: false, placeholder: 'Ex: 13.6x2.5x2.7' },
        { key: 'stare', label: 'Stare', type: 'select', required: false, options: ['Nouă', 'Foarte bună', 'Bună', 'Uzată'] },
      ],
      'Autorulote / Rulote': [
        { key: 'marca', label: 'Marca', type: 'text', required: false, placeholder: 'Ex: Knaus' },
        { key: 'model', label: 'Model', type: 'text', required: false, placeholder: 'Ex: StarClass' },
        { key: 'an', label: 'An Fabricare', type: 'number', required: false, placeholder: 'Ex: 2022', min: 1950, max: new Date().getFullYear() },
        { key: 'capacitate', label: 'Capacitate (persoane)', type: 'number', required: false, placeholder: 'Ex: 4', min: 1 },
        { key: 'lungime', label: 'Lungime (m)', type: 'number', required: false, placeholder: 'Ex: 7.5', min: 0, step: 0.01 },
      ],
      'Vehicule Electrice': [
        { key: 'marca', label: 'Marca', type: 'text', required: false, placeholder: 'Ex: Tesla' },
        { key: 'model', label: 'Model', type: 'text', required: false, placeholder: 'Ex: Model 3' },
        { key: 'an', label: 'An Fabricare', type: 'number', required: false, placeholder: 'Ex: 2023', min: 2010, max: new Date().getFullYear() },
        { key: 'autonomie', label: 'Autonomie (km)', type: 'number', required: false, placeholder: 'Ex: 500', min: 0 },
        { key: 'capacitateBaterie', label: 'Capacitate Baterie (kWh)', type: 'number', required: false, placeholder: 'Ex: 75', min: 0 },
      ],
      'Piese Auto și Accesorii': [
        { key: 'marca', label: 'Marca mașină (compatibilitate)', type: 'text', required: true, placeholder: 'Ex: VW, BMW, Audi' },
        { key: 'tipPiesa', label: 'Tip piesă', type: 'select', required: true, options: [...PIESE_AUTO_TIP_PIESA_OPTIONS] },
        { key: 'model', label: 'Model mașină', type: 'text', required: true, placeholder: 'Ex: Golf 5, X5, A4' },
        { key: 'capacitateCilindrica', label: 'Capacitate cilindrică (cm³)', type: 'number', required: true, placeholder: 'Ex: 1968, 1998', min: 0 },
        { key: 'stare', label: 'Stare', type: 'select', required: false, options: ['Nou', 'Second hand'] },
        { key: 'codOriginal', label: 'Cod original (opțional)', type: 'text', required: false, placeholder: 'Ex: 123456789' },
      ],
    },
    'Electronice & Tehnologie': {
      'Laptopuri și PC-uri': [
        { key: 'brand', label: 'Marca', type: 'text', required: false, placeholder: 'Ex: Dell' },
        { key: 'model', label: 'Model', type: 'text', required: false, placeholder: 'Ex: XPS 15' },
        { key: 'procesor', label: 'Procesor', type: 'text', required: false, placeholder: 'Ex: Intel i7' },
        { key: 'ram', label: 'RAM (GB)', type: 'select', required: false, options: ['4', '8', '16', '32', '64'] },
        { key: 'stocare', label: 'Stocare', type: 'text', required: false, placeholder: 'Ex: 512GB SSD' },
        { key: 'gpu', label: 'GPU', type: 'text', required: false, placeholder: 'Ex: NVIDIA RTX 3060' },
        { key: 'dimensiuneEcran', label: 'Dimensiune Ecran (inch)', type: 'select', required: false, options: ['13', '14', '15', '16', '17'] },
        { key: 'stare', label: 'Stare', type: 'select', required: false, options: ['Nou', 'Foarte bună', 'Bună', 'Uzată'] },
      ],
      'Telefoane Mobile': [
        { key: 'brand', label: 'Marca', type: 'text', required: false, placeholder: 'Ex: iPhone' },
        { key: 'model', label: 'Model', type: 'text', required: false, placeholder: 'Ex: 15 Pro' },
        { key: 'capacitateStocare', label: 'Capacitate Stocare (GB)', type: 'select', required: false, options: ['32', '64', '128', '256', '512', '1024'] },
        { key: 'ram', label: 'RAM (GB)', type: 'select', required: false, options: ['2', '4', '6', '8', '12', '16'] },
        { key: 'culoare', label: 'Culoare', type: 'text', required: false, placeholder: 'Ex: Negru' },
        { key: 'stare', label: 'Stare', type: 'select', required: false, options: ['Nou', 'Foarte bună', 'Bună', 'Uzată'] },
        { key: 'garantie', label: 'Garanție', type: 'select', required: false, options: ['Da', 'Nu'] },
      ],
      'Tablete': [
        { key: 'brand', label: 'Marca', type: 'text', required: false, placeholder: 'Ex: iPad' },
        { key: 'model', label: 'Model', type: 'text', required: false, placeholder: 'Ex: Pro 12.9' },
        { key: 'capacitateStocare', label: 'Capacitate Stocare (GB)', type: 'select', required: false, options: ['32', '64', '128', '256', '512', '1024'] },
        { key: 'ram', label: 'RAM (GB)', type: 'select', required: false, options: ['2', '4', '6', '8'] },
        { key: 'dimensiuneEcran', label: 'Dimensiune Ecran (inch)', type: 'select', required: false, options: ['7', '8', '9', '10', '11', '12.9'] },
        { key: 'culoare', label: 'Culoare', type: 'text', required: false, placeholder: 'Ex: Gri' },
        { key: 'stare', label: 'Stare', type: 'select', required: false, options: ['Nou', 'Foarte bună', 'Bună', 'Uzată'] },
      ],
      'TV & Audio': [
        { key: 'brand', label: 'Marca', type: 'text', required: false, placeholder: 'Ex: Samsung' },
        { key: 'dimensiuneEcran', label: 'Dimensiune Ecran (inch)', type: 'select', required: false, options: ['32', '43', '50', '55', '65', '75', '85'] },
        { key: 'tipEcran', label: 'Tip Ecran', type: 'select', required: false, options: ['LED', 'OLED', 'QLED', 'LCD', 'Plasma'] },
        { key: 'rezolutie', label: 'Rezoluție', type: 'select', required: false, options: ['HD', 'Full HD', '4K', '8K'] },
        { key: 'stare', label: 'Stare', type: 'select', required: false, options: ['Nou', 'Foarte bună', 'Bună', 'Uzată'] },
      ],
      'Console & Jocuri': [
        { key: 'brand', label: 'Marca', type: 'text', required: false, placeholder: 'Ex: Sony' },
        { key: 'model', label: 'Model', type: 'text', required: false, placeholder: 'Ex: PlayStation 5' },
        { key: 'tipConsole', label: 'Tip Console', type: 'select', required: false, options: ['PlayStation', 'Xbox', 'Nintendo', 'PC Gaming', 'Altele'] },
        { key: 'stocare', label: 'Stocare (GB)', type: 'number', required: false, placeholder: 'Ex: 1000', min: 0 },
        { key: 'stare', label: 'Stare', type: 'select', required: false, options: ['Nou', 'Foarte bună', 'Bună', 'Uzată'] },
        { key: 'garantie', label: 'Garanție', type: 'select', required: false, options: ['Da', 'Nu'] },
      ],
      'Drone & Gadgeturi Smart': [
        { key: 'brand', label: 'Marca', type: 'text', required: false, placeholder: 'Ex: DJI' },
        { key: 'model', label: 'Model', type: 'text', required: false, placeholder: 'Ex: Mavic 3' },
        { key: 'tip', label: 'Tip', type: 'select', required: false, options: ['Drone', 'Smartwatch', 'Smart Speaker', 'Altele'] },
        { key: 'autonomie', label: 'Autonomie', type: 'text', required: false, placeholder: 'Ex: 30 minute' },
        { key: 'stare', label: 'Stare', type: 'select', required: false, options: ['Nou', 'Foarte bună', 'Bună', 'Uzată'] },
      ],
      'Echipamente Foto/Video': [
        { key: 'brand', label: 'Marca', type: 'text', required: false, placeholder: 'Ex: Canon' },
        { key: 'model', label: 'Model', type: 'text', required: false, placeholder: 'Ex: EOS R5' },
        { key: 'tip', label: 'Tip', type: 'select', required: false, options: ['APSC', 'Full Frame', 'Medium Format', 'Action Camera', 'Camcorder', 'Altele'] },
        { key: 'rezolutie', label: 'Rezoluție Video', type: 'select', required: false, options: ['1080p', '4K', '8K'] },
        { key: 'stare', label: 'Stare', type: 'select', required: false, options: ['Nou', 'Foarte bună', 'Bună', 'Uzată'] },
      ],
    },
    'Modă & Lifestyle': {
      'Haine de Designer': [
        { key: 'marime', label: 'Mărime', type: 'select', required: false, options: ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL'] },
        { key: 'material', label: 'Material', type: 'text', required: false, placeholder: 'Ex: Bumbac 100%' },
        { key: 'culoare', label: 'Culoare', type: 'text', required: false, placeholder: 'Ex: Negru' },
        { key: 'stare', label: 'Stare', type: 'select', required: false, options: ['Nou', 'Foarte bună', 'Bună', 'Uzată'] },
        { key: 'sezon', label: 'Sezon', type: 'select', required: false, options: ['Primăvară', 'Vară', 'Toamnă', 'Iarnă', 'All-season'] },
      ],
      'Încălțăminte': [
        { key: 'marime', label: 'Mărime', type: 'select', required: false, options: ['35', '36', '37', '38', '39', '40', '41', '42', '43', '44', '45', '46', '47'] },
        { key: 'tip', label: 'Tip Încalțăminte', type: 'select', required: false, options: ['Pantofi', 'Ghete', 'Adidași', 'Sandale', 'Cizme', 'Altele'] },
        { key: 'material', label: 'Material', type: 'text', required: false, placeholder: 'Ex: Piele' },
        { key: 'culoare', label: 'Culoare', type: 'text', required: false, placeholder: 'Ex: Negru' },
        { key: 'stare', label: 'Stare', type: 'select', required: false, options: ['Nou', 'Foarte bună', 'Bună', 'Uzată'] },
      ],
      'Genți & Accesorii': [
        { key: 'tipAccesoriu', label: 'Tip Accesoriu', type: 'select', required: false, options: ['Geantă', 'Portofel', 'Curea', 'Eșarfă', 'Altele'] },
        { key: 'material', label: 'Material', type: 'text', required: false, placeholder: 'Ex: Piele' },
        { key: 'culoare', label: 'Culoare', type: 'text', required: false, placeholder: 'Ex: Maro' },
        { key: 'stare', label: 'Stare', type: 'select', required: false, options: ['Nou', 'Foarte bună', 'Bună', 'Uzată'] },
      ],
      'Parfumuri & Cosmetice': [
        { key: 'brand', label: 'Marca', type: 'text', required: false, placeholder: 'Ex: Dior' },
        { key: 'model', label: 'Model', type: 'text', required: false, placeholder: 'Ex: Sauvage' },
        { key: 'tip', label: 'Tip', type: 'select', required: false, options: ['Parfum', 'Deodorant', 'Cosmetice', 'Altele'] },
        { key: 'capacitate', label: 'Capacitate (ml)', type: 'number', required: false, placeholder: 'Ex: 100', min: 0 },
        { key: 'stare', label: 'Stare', type: 'select', required: false, options: ['Nou', 'Foarte bună', 'Bună', 'Uzată'] },
      ],
      'Ceasuri de Lux': [
        { key: 'brand', label: 'Marca', type: 'text', required: false, placeholder: 'Ex: Rolex' },
        { key: 'model', label: 'Model', type: 'text', required: false, placeholder: 'Ex: Submariner' },
        { key: 'material', label: 'Material', type: 'select', required: false, options: ['Oțel', 'Aur', 'Platină', 'Titan', 'Ceramică'] },
        { key: 'an', label: 'An Fabricare', type: 'number', required: false, placeholder: 'Ex: 2020', min: 1900, max: new Date().getFullYear() },
        { key: 'stare', label: 'Stare', type: 'select', required: false, options: ['Excelentă', 'Foarte bună', 'Bună', 'Uzată'] },
      ],
    },
    'Casă & Grădină': {
      'Mobilier Interior': [
        { key: 'tipMobilier', label: 'Tip Mobilier', type: 'select', required: false, options: ['Canapea', 'Masă', 'Scaun', 'Dulap', 'Pat', 'Altele'] },
        { key: 'material', label: 'Material', type: 'text', required: false, placeholder: 'Ex: Lemn' },
        { key: 'culoare', label: 'Culoare', type: 'text', required: false, placeholder: 'Ex: Maro' },
        { key: 'dimensiuni', label: 'Dimensiuni (cm)', type: 'text', required: false, placeholder: 'Ex: 200x90x85' },
        { key: 'stare', label: 'Stare', type: 'select', required: false, options: ['Nou', 'Foarte bună', 'Bună', 'Uzată'] },
      ],
      'Mobilier Exterior': [
        { key: 'tipMobilier', label: 'Tip Mobilier', type: 'select', required: false, options: ['Masă', 'Scaun', 'Canapea', 'Umbrelă', 'Altele'] },
        { key: 'material', label: 'Material', type: 'select', required: false, options: ['Rattan', 'Lemn', 'Metal', 'Plastic', 'Altele'] },
        { key: 'stare', label: 'Stare', type: 'select', required: false, options: ['Nou', 'Foarte bună', 'Bună', 'Uzată'] },
      ],
      'Echipamente de Grădinărit': [
        { key: 'tipEchipament', label: 'Tip Echipament', type: 'select', required: false, options: ['Tractoare', 'Cositoare', 'Motoare', 'Unelte', 'Plante', 'Altele'] },
        { key: 'putere', label: 'Putere', type: 'text', required: false, placeholder: 'Ex: 2500W' },
        { key: 'stare', label: 'Stare', type: 'select', required: false, options: ['Nou', 'Foarte bună', 'Bună', 'Uzată'] },
      ],
      'Decorațiuni': [
        { key: 'tipDecoratiune', label: 'Tip Decorațiune', type: 'select', required: false, options: ['Tablou', 'Sculptură', 'Vază', 'Lampa', 'Covor', 'Altele'] },
        { key: 'material', label: 'Material', type: 'text', required: false, placeholder: 'Ex: Ceramică' },
        { key: 'culoare', label: 'Culoare', type: 'text', required: false, placeholder: 'Ex: Alb' },
        { key: 'dimensiuni', label: 'Dimensiuni (cm)', type: 'text', required: false, placeholder: 'Ex: 50x30' },
        { key: 'stare', label: 'Stare', type: 'select', required: false, options: ['Nou', 'Foarte bună', 'Bună', 'Uzată'] },
      ],
      'Electrocasnice': [
        { key: 'brand', label: 'Marca', type: 'text', required: false, placeholder: 'Ex: Samsung' },
        { key: 'model', label: 'Model', type: 'text', required: false, placeholder: 'Ex: WW90TA046AE' },
        { key: 'tipElectrocasnic', label: 'Tip Electrocasnic', type: 'select', required: false, options: ['Mașină de spălat', 'Frigider', 'Cuptor', 'Aragaz', 'Aspirator', 'Altele'] },
        { key: 'energie', label: 'Clasă Energetică', type: 'select', required: false, options: ['A+++', 'A++', 'A+', 'A', 'B', 'C', 'D'] },
        { key: 'an', label: 'An Fabricare', type: 'number', required: false, placeholder: 'Ex: 2020', min: 2010, max: new Date().getFullYear() },
        { key: 'stare', label: 'Stare', type: 'select', required: false, options: ['Nou', 'Foarte bună', 'Bună', 'Uzată'] },
      ],
    },
    'Utilaje & Echipamente': {
      'Utilaje Construcții': [
        { key: 'tipUtilaj', label: 'Tip Utilaj', type: 'select', required: false, options: ['Excavator', 'Buldocer', 'Macara', 'Betoniera', 'Compresor', 'Altele'] },
        { key: 'marca', label: 'Marca', type: 'text', required: false, placeholder: 'Ex: Caterpillar' },
        { key: 'model', label: 'Model', type: 'text', required: false, placeholder: 'Ex: CAT 320' },
        { key: 'an', label: 'An Fabricare', type: 'number', required: false, placeholder: 'Ex: 2018', min: 1950, max: new Date().getFullYear() },
        { key: 'oreUtilizare', label: 'Ore Utilizare', type: 'number', required: false, placeholder: 'Ex: 5000', min: 0 },
      ],
      'Utilaje Agricole': [
        { key: 'tipUtilaj', label: 'Tip Utilaj', type: 'select', required: false, options: ['Tractor', 'Combine', 'Presa', 'Plug', 'Semănătoare', 'Altele'] },
        { key: 'marca', label: 'Marca', type: 'text', required: false, placeholder: 'Ex: John Deere' },
        { key: 'an', label: 'An Fabricare', type: 'number', required: false, placeholder: 'Ex: 2019', min: 1950, max: new Date().getFullYear() },
        { key: 'oreUtilizare', label: 'Ore Utilizare', type: 'number', required: false, placeholder: 'Ex: 3000', min: 0 },
      ],
      'Echipamente Forestiere': [
        { key: 'tipEchipament', label: 'Tip Echipament', type: 'select', required: false, options: ['Ferraj', 'Tractor forestier', 'Echipament tăiere', 'Altele'] },
        { key: 'marca', label: 'Marca', type: 'text', required: false, placeholder: 'Ex: Valmet' },
        { key: 'stare', label: 'Stare', type: 'select', required: false, options: ['Nou', 'Foarte bună', 'Bună', 'Uzată'] },
      ],
      'Generatoare și Compresoare': [
        { key: 'tip', label: 'Tip', type: 'select', required: false, options: ['Generator', 'Compresor'] },
        { key: 'putere', label: 'Putere (kW)', type: 'number', required: false, placeholder: 'Ex: 50', min: 0 },
        { key: 'combustibil', label: 'Combustibil', type: 'select', required: false, options: ['Diesel', 'Benzină', 'Gaz', 'Electric'] },
        { key: 'stare', label: 'Stare', type: 'select', required: false, options: ['Nou', 'Foarte bună', 'Bună', 'Uzată'] },
      ],
      'Scule Profesionale': [
        { key: 'tipScula', label: 'Tip Scula', type: 'select', required: false, options: ['Unelte manuale', 'Unelte electrice', 'Set de scule', 'Altele'] },
        { key: 'marca', label: 'Marca', type: 'text', required: false, placeholder: 'Ex: Bosch' },
        { key: 'stare', label: 'Stare', type: 'select', required: false, options: ['Nou', 'Foarte bună', 'Bună', 'Uzată'] },
      ],
      'Echipamente Ateliere Auto': [
        { key: 'tipEchipament', label: 'Tip Echipament', type: 'select', required: false, options: ['Ridicător', 'Compresor', 'Stand', 'Echipament diagnostic', 'Altele'] },
        { key: 'marca', label: 'Marca', type: 'text', required: false, placeholder: 'Ex: Snap-on' },
        { key: 'stare', label: 'Stare', type: 'select', required: false, options: ['Nou', 'Foarte bună', 'Bună', 'Uzată'] },
      ],
      'Echipamente Electrice / Sudură': [
        { key: 'tipEchipament', label: 'Tip Echipament', type: 'select', required: false, options: ['Aparat sudură', 'Invertor', 'Echipament protecție', 'Altele'] },
        { key: 'putere', label: 'Putere (A)', type: 'number', required: false, placeholder: 'Ex: 200', min: 0 },
        { key: 'stare', label: 'Stare', type: 'select', required: false, options: ['Nou', 'Foarte bună', 'Bună', 'Uzată'] },
      ],
    },
    'Artă & Antichități': {
      'Picturi': [
        { key: 'artist', label: 'Artist', type: 'text', required: false, placeholder: 'Ex: Ioan Popescu' },
        { key: 'tehnica', label: 'Tehnică', type: 'select', required: false, options: ['Ulei', 'Acuarelă', 'Acrilic', 'Pastel', 'Altele'] },
        { key: 'dimensiuni', label: 'Dimensiuni (cm)', type: 'text', required: false, placeholder: 'Ex: 50x70' },
        { key: 'an', label: 'An', type: 'number', required: false, placeholder: 'Ex: 2020', min: 1500, max: new Date().getFullYear() },
        { key: 'stare', label: 'Stare', type: 'select', required: false, options: ['Excelentă', 'Foarte bună', 'Bună', 'Uzată'] },
      ],
      'Sculpturi': [
        { key: 'artist', label: 'Artist', type: 'text', required: false, placeholder: 'Ex: Ion Georgescu' },
        { key: 'material', label: 'Material', type: 'select', required: false, options: ['Bronz', 'Marmură', 'Lemn', 'Altele'] },
        { key: 'dimensiuni', label: 'Dimensiuni (cm)', type: 'text', required: false, placeholder: 'Ex: 30x40x50' },
        { key: 'an', label: 'An', type: 'number', required: false, placeholder: 'Ex: 1990', min: 1500, max: new Date().getFullYear() },
        { key: 'stare', label: 'Stare', type: 'select', required: false, options: ['Excelentă', 'Foarte bună', 'Bună', 'Uzată'] },
      ],
      'Bijuterii și Ceasuri': [
        { key: 'tipBijuterie', label: 'Tip Bijuterie', type: 'select', required: false, options: ['Inel', 'Colier', 'Cercei', 'Brățară', 'Ceas', 'Altele'] },
        { key: 'material', label: 'Material', type: 'select', required: false, options: ['Aur', 'Argint', 'Platină', 'Bijuterii', 'Altele'] },
        { key: 'piatra', label: 'Piatră Prețioasă', type: 'text', required: false, placeholder: 'Ex: Diamant' },
        { key: 'stare', label: 'Stare', type: 'select', required: false, options: ['Nou', 'Foarte bună', 'Bună', 'Uzată'] },
      ],
      'Obiecte de Colecție': [
        { key: 'tipColectie', label: 'Tip Colecție', type: 'select', required: false, options: ['Filatelie', 'Numismatică', 'Figurine', 'Altele'] },
        { key: 'numarPiese', label: 'Număr Piese', type: 'number', required: false, placeholder: 'Ex: 50', min: 1 },
        { key: 'stare', label: 'Stare', type: 'select', required: false, options: ['Excelentă', 'Foarte bună', 'Bună', 'Uzată'] },
      ],
      'Mobilier de Epocă': [
        { key: 'perioada', label: 'Perioadă', type: 'select', required: false, options: ['Sec. XIX', '1900-1950', '1950-2000', 'Altele'] },
        { key: 'material', label: 'Material', type: 'text', required: false, placeholder: 'Ex: Lemn masiv' },
        { key: 'tipMobilier', label: 'Tip Mobilier', type: 'select', required: false, options: ['Canapea', 'Masă', 'Scaun', 'Dulap', 'Pat', 'Altele'] },
        { key: 'stare', label: 'Stare', type: 'select', required: false, options: ['Excelentă', 'Foarte bună', 'Bună', 'Necesită restaurare'] },
      ],
      'Cărți Rare, Hărți Vechi': [
        { key: 'tip', label: 'Tip', type: 'select', required: false, options: ['Carte', 'Hartă', 'Atlas', 'Manuscris', 'Altele'] },
        { key: 'an', label: 'An', type: 'number', required: false, placeholder: 'Ex: 1850', min: 1000, max: new Date().getFullYear() },
        { key: 'limba', label: 'Limbă', type: 'text', required: false, placeholder: 'Ex: Română' },
        { key: 'stare', label: 'Stare', type: 'select', required: false, options: ['Excelentă', 'Foarte bună', 'Bună', 'Uzată'] },
      ],
      'Fotografie Artistică': [
        { key: 'artist', label: 'Artist/Fotograf', type: 'text', required: false, placeholder: 'Ex: Ansel Adams' },
        { key: 'tehnica', label: 'Tehnică', type: 'select', required: false, options: ['Gelatin silver', 'Color', 'Digital print', 'Altele'] },
        { key: 'dimensiuni', label: 'Dimensiuni (cm)', type: 'text', required: false, placeholder: 'Ex: 40x60' },
        { key: 'stare', label: 'Stare', type: 'select', required: false, options: ['Excelentă', 'Foarte bună', 'Bună', 'Uzată'] },
      ],
      'Licitații Caritabile': [
        { key: 'organizatie', label: 'Organizație', type: 'text', required: false, placeholder: 'Ex: UNICEF România' },
        { key: 'scop', label: 'Scop', type: 'text', required: false, placeholder: 'Ex: Sprijin pentru copii' },
      ],
    },
    'Agricultură & Zootehnie': {
      'Tractoare, Combine': [
        { key: 'marca', label: 'Marca', type: 'text', required: false, placeholder: 'Ex: John Deere' },
        { key: 'model', label: 'Model', type: 'text', required: false, placeholder: 'Ex: 6120R' },
        { key: 'an', label: 'An Fabricare', type: 'number', required: false, placeholder: 'Ex: 2020', min: 1950, max: new Date().getFullYear() },
        { key: 'putere', label: 'Putere (CP)', type: 'number', required: false, placeholder: 'Ex: 120', min: 0 },
        { key: 'oreUtilizare', label: 'Ore Utilizare', type: 'number', required: false, placeholder: 'Ex: 2500', min: 0 },
      ],
      'Remorci Agricole': [
        { key: 'tipRemorca', label: 'Tip Remorcă', type: 'select', required: false, options: ['Remorcă basculantă', 'Remorcă platformă', 'Remorcă cisternă', 'Altele'] },
        { key: 'capacitate', label: 'Capacitate (t)', type: 'number', required: false, placeholder: 'Ex: 15', min: 0 },
        { key: 'stare', label: 'Stare', type: 'select', required: false, options: ['Nouă', 'Foarte bună', 'Bună', 'Uzată'] },
      ],
      'Echipamente de Irigații': [
        { key: 'tipEchipament', label: 'Tip Echipament', type: 'select', required: false, options: ['Pivot central', 'Sistem aspersiune', 'Gote', 'Altele'] },
        { key: 'suprafata', label: 'Suprafață (ha)', type: 'number', required: false, placeholder: 'Ex: 10', min: 0, step: 0.01 },
      ],
      'Animale': [
        { key: 'tipAnimal', label: 'Tip Animal', type: 'select', required: false, options: ['Bovine', 'Porcine', 'Ovine', 'Cabaline', 'Altele'] },
        { key: 'numar', label: 'Număr Capete', type: 'number', required: false, placeholder: 'Ex: 50', min: 1 },
        { key: 'rasa', label: 'Rasă', type: 'text', required: false, placeholder: 'Ex: Holstein' },
      ],
      'Semințe, Furaje, Îngrășăminte': [
        { key: 'tip', label: 'Tip', type: 'select', required: false, options: ['Semințe', 'Furaje', 'Îngrășăminte', 'Altele'] },
        { key: 'cantitate', label: 'Cantitate (kg)', type: 'number', required: false, placeholder: 'Ex: 1000', min: 0 },
      ],
    },
    'Maritime & Aeronautice': {
      'Bărci, Iahturi, Skijeturi': [
        { key: 'tipVas', label: 'Tip Vas', type: 'select', required: false, options: ['Barcă', 'Iaht', 'Skijet', 'Ponton', 'Altele'] },
        { key: 'marca', label: 'Marca', type: 'text', required: false, placeholder: 'Ex: Beneteau' },
        { key: 'model', label: 'Model', type: 'text', required: false, placeholder: 'Ex: Oceanis 40' },
        { key: 'lungime', label: 'Lungime (m)', type: 'number', required: false, placeholder: 'Ex: 12', min: 0, step: 0.01 },
        { key: 'an', label: 'An Fabricare', type: 'number', required: false, placeholder: 'Ex: 2020', min: 1950, max: new Date().getFullYear() },
      ],
      'Motoare Marine': [
        { key: 'marca', label: 'Marca', type: 'text', required: false, placeholder: 'Ex: Yamaha' },
        { key: 'model', label: 'Model', type: 'text', required: false, placeholder: 'Ex: F250' },
        { key: 'putere', label: 'Putere (CP)', type: 'number', required: false, placeholder: 'Ex: 250', min: 0 },
        { key: 'an', label: 'An Fabricare', type: 'number', required: false, placeholder: 'Ex: 2021', min: 1950, max: new Date().getFullYear() },
      ],
      'Avioane Mici / Ultraleușoare': [
        { key: 'marca', label: 'Marca', type: 'text', required: false, placeholder: 'Ex: Cessna' },
        { key: 'model', label: 'Model', type: 'text', required: false, placeholder: 'Ex: 172' },
        { key: 'tip', label: 'Tip', type: 'select', required: false, options: ['Avion mic', 'Ultraleușor', 'Glider', 'Altele'] },
        { key: 'oreZbor', label: 'Ore Zbor', type: 'number', required: false, placeholder: 'Ex: 500', min: 0 },
      ],
      'Dronuri Industriale': [
        { key: 'marca', label: 'Marca', type: 'text', required: false, placeholder: 'Ex: DJI' },
        { key: 'model', label: 'Model', type: 'text', required: false, placeholder: 'Ex: Matrice 300' },
        { key: 'autonomie', label: 'Autonomie (minute)', type: 'number', required: false, placeholder: 'Ex: 55', min: 0 },
        { key: 'incarcareMaxima', label: 'Încărcare Maximă (kg)', type: 'number', required: false, placeholder: 'Ex: 9', min: 0, step: 0.01 },
      ],
    },
    'Business & Licitații': {
      'Echipamente de Birou': [
        { key: 'tipEchipament', label: 'Tip Echipament', type: 'select', required: false, options: ['Imprimantă', 'Fax', 'Scaner', 'Proiector', 'Altele'] },
        { key: 'brand', label: 'Marca', type: 'text', required: false, placeholder: 'Ex: HP' },
        { key: 'stare', label: 'Stare', type: 'select', required: false, options: ['Nou', 'Foarte bună', 'Bună', 'Uzată'] },
      ],
      'Mobilier Comercial': [
        { key: 'tipMobilier', label: 'Tip Mobilier', type: 'select', required: false, options: ['Birou', 'Scaun', 'Dulap', 'Vitrină', 'Altele'] },
        { key: 'material', label: 'Material', type: 'text', required: false, placeholder: 'Ex: Lemn' },
        { key: 'stare', label: 'Stare', type: 'select', required: false, options: ['Nou', 'Foarte bună', 'Bună', 'Uzată'] },
      ],
      'Calculatoare Second-Hand': [
        { key: 'brand', label: 'Marca', type: 'text', required: false, placeholder: 'Ex: Dell' },
        { key: 'model', label: 'Model', type: 'text', required: false, placeholder: 'Ex: OptiPlex' },
        { key: 'procesor', label: 'Procesor', type: 'text', required: false, placeholder: 'Ex: Intel i5' },
        { key: 'ram', label: 'RAM (GB)', type: 'select', required: false, options: ['4', '8', '16', '32'] },
      ],
      'Licitații Lichidări Firme': [
        { key: 'tipFirma', label: 'Tip Firmă', type: 'text', required: false, placeholder: 'Ex: SRL' },
        { key: 'domeniu', label: 'Domeniu Activitate', type: 'text', required: false, placeholder: 'Ex: Comerț' },
      ],
      'Loturi Stocuri Produse': [
        { key: 'tipProduse', label: 'Tip Produse', type: 'text', required: false, placeholder: 'Ex: Electronice' },
        { key: 'cantitate', label: 'Cantitate', type: 'number', required: false, placeholder: 'Ex: 100', min: 1 },
      ],
    },
    'Materiale Construcții': {
      'Ciment, Cărămidă, Oțel': [
        { key: 'tipMaterial', label: 'Tip Material', type: 'select', required: false, options: ['Ciment', 'Cărămidă', 'Oțel', 'Altele'] },
        { key: 'cantitate', label: 'Cantitate', type: 'number', required: false, placeholder: 'Ex: 1000', min: 0 },
        { key: 'unitate', label: 'Unitate', type: 'select', required: false, options: ['Kg', 'Tone', 'Tone', 'm³'] },
      ],
      'Materiale Izolație': [
        { key: 'tipIzolatie', label: 'Tip Izolație', type: 'select', required: false, options: ['Polistiren', 'Lână minerală', 'Vată bazaltică', 'Altele'] },
        { key: 'grosime', label: 'Grosime (cm)', type: 'number', required: false, placeholder: 'Ex: 10', min: 0 },
        { key: 'cantitate', label: 'Cantitate (mp)', type: 'number', required: false, placeholder: 'Ex: 500', min: 0 },
      ],
      'Feronerie, Unelte': [
        { key: 'tip', label: 'Tip', type: 'select', required: false, options: ['Feronerie', 'Unelte', 'Ambele'] },
        { key: 'descriere', label: 'Descriere', type: 'textarea', required: false, placeholder: 'Descriere detaliată' },
      ],
      'Uși, Ferestre, Tâmplărie': [
        { key: 'tip', label: 'Tip', type: 'select', required: false, options: ['Uși', 'Ferestre', 'Tâmplărie', 'Altele'] },
        { key: 'material', label: 'Material', type: 'select', required: false, options: ['Lemn', 'PVC', 'Aluminiu', 'Altele'] },
        { key: 'numar', label: 'Număr Piese', type: 'number', required: false, placeholder: 'Ex: 10', min: 1 },
      ],
    },
    'Diverse / Speciale': {
      'Licitații Caritabile': [
        { key: 'organizatie', label: 'Organizație', type: 'text', required: false, placeholder: 'Ex: UNICEF România' },
        { key: 'scop', label: 'Scop', type: 'text', required: false, placeholder: 'Ex: Sprijin pentru copii' },
      ],
      'Obiecte Militare / Istorice': [
        { key: 'perioada', label: 'Perioadă', type: 'text', required: false, placeholder: 'Ex: Al Doilea Război Mondial' },
        { key: 'tip', label: 'Tip Obiect', type: 'text', required: false, placeholder: 'Ex: Uniformă' },
        { key: 'stare', label: 'Stare', type: 'select', required: false, options: ['Excelentă', 'Foarte bună', 'Bună', 'Uzată'] },
      ],
      'NFT / Artă Digitală': [
        { key: 'tip', label: 'Tip', type: 'select', required: false, options: ['NFT', 'Artă Digitală', 'Token', 'Altele'] },
        { key: 'blockchain', label: 'Blockchain', type: 'select', required: false, options: ['Ethereum', 'Solana', 'Polygon', 'Altele'] },
        { key: 'contractAddress', label: 'Contract Address', type: 'text', required: false, placeholder: 'Ex: 0x1234...' },
      ],
      'Colecții Private': [
        { key: 'tipColectie', label: 'Tip Colecție', type: 'text', required: false, placeholder: 'Ex: Coins' },
        { key: 'numarPiese', label: 'Număr Piese', type: 'number', required: false, placeholder: 'Ex: 200', min: 1 },
      ],
      'Bunuri Confiscate / Executări': [
        { key: 'tipExecutare', label: 'Tip Executare', type: 'select', required: false, options: ['ANAF', 'Judecătorie', 'Bancă', 'Furnizor', 'Alte creanțe'] },
        { key: 'descriere', label: 'Descriere', type: 'textarea', required: false, placeholder: 'Descriere detaliată' },
      ],
    },
  };

  // Helper: get dynamic fields for a given category/subcategory (for autocomplete from title/desc)
  type DynamicFieldItem = { key: string; label: string; type: 'text' | 'number' | 'select' | 'textarea'; required: boolean; placeholder?: string; options?: string[]; min?: number; max?: number; step?: number };
  const getDynamicFieldsFor = (category: string, subcategory: string): DynamicFieldItem[] => {
    if (!category || !subcategory) return [];
    const categoryFields = dynamicFieldsConfig[category];
    if (!categoryFields) return [];
    return categoryFields[subcategory] || [];
  };

  // Stare produs standard (din descriere) – valorile folosite în tot marketplace-ul
  const STARE_PRODUS_STANDARD = [
    'Nou sigilat',
    'Ca nou',
    'Foarte bun',
    'Bun',
    'Acceptabil',
    'Defect',
  ] as const;
  const STARE_PRODUS_OPTIONS = STARE_PRODUS_STANDARD;
  // Detectează starea din titlu/descriere și o mapează la una dintre valorile standard
  const suggestStareProdusFromTitleAndDescription = (title: string, description: string): string => {
    const text = `${title || ''} ${description || ''}`.trim().toLowerCase();
    if (!text) return '';

    // Ordine importantă: expresiile mai specifice înainte
    const phrases: [RegExp | string[], string][] = [
      [/\b(nou\s*sigilat|sigilat\b|în\s*sigiliu|nedesfăcut|original\s*închis|nepătat)\b/i, 'Nou sigilat'],
      [/\b(ca\s*nou|impecabil|foarte\s*bine\s*păstrat|excelent\s*stare|nou\s*nefolosit|nou\s*desigilat|desigilat)\b/i, 'Ca nou'],
      [/\b(defect|pentru\s*piese|doar\s*piese|nefuncțional|nu\s*funcționează|reparație|reparat)\b/i, 'Defect'],
      [/\b(foarte\s*bun[ăa]?|foarte\s*bine|excelent\b|stare\s*foarte\s*bună)\b/i, 'Foarte bun'],
      [/\b(stare\s*bună|stare\s*buna|bine\s*întreținut|în\s*stare\s*bună|bun[ăa]?\s*stare)\b/i, 'Bun'],
      [/\bbun\b/i, 'Bun'],
      [/\b(acceptabil|stare\s*acceptabilă|stare\s*acceptabila|funcțional|merge\s*bine)\b/i, 'Acceptabil'],
      [/\b(stare\s*medie|mediu\b|uzură\s*normală|utilizare\s*normală|uzat\s*normal)\b/i, 'Acceptabil'],
      [/\bnou\b/i, 'Ca nou'],
    ];

    for (const [cond, value] of phrases) {
      if (Array.isArray(cond)) {
        if (cond.every((c: string) => text.includes(c))) return value;
      } else if ((cond as RegExp).test(text)) return value;
    }
    return '';
  };

  // Completare automată Caracteristici Specifice din titlu + descriere (la fel ca categorii/subcategorii)
  const suggestDynamicFieldsFromTitleAndDescription = (
    title: string,
    description: string,
    fields: DynamicFieldItem[]
  ): Record<string, string | number> => {
    const out: Record<string, string | number> = {};
    const text = `${title || ''} ${description || ''}`.trim().toLowerCase();
    if (!text || fields.length === 0) return out;
    const textNorm = normalizeRo(text);

    const parseNum = (s: string): number | null => {
      const n = parseFloat(s.replace(/\s/g, '').replace(',', '.'));
      return Number.isFinite(n) ? n : null;
    };

    for (const f of fields) {
      const key = f.key.toLowerCase();
      const label = (f.label || '').toLowerCase();

      if (f.type === 'number') {
        let val: number | null = null;
        if (/\ban\b|an\s*fabricare|an\s*constructie|an\s*construcție/i.test(key + ' ' + label)) {
          const yearMatch = text.match(/\b(19|20)\d{2}\b/g);
          if (yearMatch && yearMatch.length) {
            const y = parseInt(yearMatch[yearMatch.length - 1], 10);
            const min = f.min ?? 1900;
            const max = f.max ?? new Date().getFullYear();
            if (y >= min && y <= max) val = y;
          }
        } else if (/kilometraj|km\b/.test(key + ' ' + label)) {
          const m = text.match(/(\d[\d.\s]*)\s*(?:km|mii\s*km|kilometri)/i) || text.match(/(\d[\d.\s]+)\s*km/i);
          if (m) val = parseNum(m[1]);
        } else if (/putere|kw|cp\b|hp\b/.test(key + ' ' + label)) {
          const m = text.match(/(\d+(?:[.,]\d+)?)\s*(?:kw|cp|hp)/i) || text.match(/(\d+(?:[.,]\d+)?)\s*(?:kw|cp|hp)/i);
          if (m) val = parseNum(m[1]);
        } else if (/suprafață|suprafata|mp\b|ha\b/.test(key + ' ' + label)) {
          const m = text.match(/(\d+(?:[.,]\d+)?)\s*(?:mp|mp²|ha|metri\s*pătrați|m²)/i) || text.match(/(\d+(?:[.,]\d+)?)\s*mp/i) || text.match(/(\d+(?:[.,]\d+)?)/);
          if (m) val = parseNum(m[1]);
        } else if (/capacitate\s*cilindrică|cm³|cc\b|cm3/.test(key + ' ' + label)) {
          const m = text.match(/(\d+)\s*(?:cm³|cc|cm3)/i) || text.match(/(\d+)\s*cc/i);
          if (m) val = parseNum(m[1]);
        } else if (/lungime|metri\b/.test(key + ' ' + label) && !/kilometri/.test(text)) {
          const m = text.match(/(\d+(?:[.,]\d+)?)\s*(?:m\b|metri)/i);
          if (m) val = parseNum(m[1]);
        } else if (/autonomie|baterie|kwh/.test(key + ' ' + label)) {
          const m = text.match(/(\d+(?:[.,]\d+)?)\s*(?:kwh|km|minute?)/i) || text.match(/(\d+)\s*(?:km|kwh)/i);
          if (m) val = parseNum(m[1]);
        } else {
          const m = text.match(/(\d+(?:[.,]\d+)?)/);
          if (m) {
            val = parseNum(m[1]);
            if (val !== null && f.min != null && val < f.min) val = null;
            if (val !== null && f.max != null && val > f.max) val = null;
          }
        }
        if (val !== null) out[f.key] = val;
      } else if (f.type === 'select' && f.options && f.options.length) {
        const optLower = (o: string) => o.toLowerCase();
        const searchPrimary = key === 'tippiesa' ? textNorm : text;
        let found: string | undefined =
          key === 'tippiesa'
            ? (detectTipPiesaFromNormalizedText(textNorm, f.options) ?? undefined)
            : undefined;
        if (!found) {
          found = f.options.find((opt) => searchPrimary.includes(optLower(opt)));
        }
        if (!found) {
          const aliasMap: Record<string, string[]> = {
            'Motorină': ['motorina', 'diesel', 'motorină'],
            'Benzină': ['benzina', 'benzină', 'petrol', 'gasoline'],
            'Electric': ['electric', 'electroc', 'ev ', ' battery'],
            'Hibrid': ['hibrid', 'hybrid', 'plugin', 'phev'],
            'GPL': ['gpl', 'gaz', 'lpg', 'instalație gpl', 'instalatie gpl', 'rezervor gpl'],
            'Manuală': ['manuală', 'manuala', 'manual', 'cutie manuală'],
            'Automată': ['automată', 'automata', 'automat', 'automatic', 'at'],
            'CVT': ['cvt', 'variator'],
            'Nou': ['nou', 'nouă', 'neu', 'new', 'nefolosit'],
            'Foarte bună': ['foarte buna', 'foarte bună', 'excelent', 'impecabil', 'ca nou', 'ca noua'],
            'Bună': ['buna', 'bună', 'bine', 'good'],
            'Uzată': ['uzata', 'uzată', 'uzat', 'folosit', 'second hand', 'second-hand', 'sh'],
            'Folosit': ['folosit', 'used'],
            'Da': ['da', 'yes', 'are', 'dotat'],
            'Nu': ['nu', 'nu are', 'fără', 'fară'],
            'Parter': ['parter', 'pater'],
            'Decomandat': ['decomandat', 'decomandată'],
            'Semidecomandat': ['semidecomandat', 'semi-decomandat'],
            'Nedecomandat': ['nedecomandat'],
            'Open Space': ['open space', 'open-space'],
            'LED': ['led'],
            'OLED': ['oled'],
            'QLED': ['qled'],
            'LCD': ['lcd'],
            '4K': ['4k', 'ultra hd', 'uhd'],
            'Full HD': ['full hd', 'fhd', '1080p'],
            // Tip piesă — Piese Auto (aliniat la opțiunile din formular)
            'Accesorii auto': ['accesorii auto', 'accesorii generale'],
            'Accesorii roți': ['accesorii roti', 'accesorii roți', 'capace jante', 'capace roti'],
            'Aprindere': ['aprindere', 'bujie', 'bujii', 'bobină', 'bobina', 'delco'],
            'Cabluri auto': ['cabluri', 'cablu auto', 'fire auto', 'fasung'],
            'Audio auto': ['audio auto', 'boxe auto', 'subwoofer', 'statie', 'stație', 'dvd auto'],
            'Caroserie': ['caroserie', 'capotă', 'capota', 'portieră', 'portiera', 'bara', 'aripă', 'aripa', 'parbriz', 'spoiler', 'grilă'],
            'Climatizare': ['climatizare', 'aer condiționat', 'aer conditionat', 'compresor ac', 'radiator ac'],
            'Dezmembrări': ['dezmembrări', 'dezmembrari', 'piese dezmembrari'],
            'Direcție': ['direcție', 'directie', 'servodirectie', 'casetă direcție', 'pompă servodirectie'],
            'Diverse': ['diverse', 'alte piese', 'altele'],
            'Electrică auto': ['electrică auto', 'electrice auto', 'senzor', 'ecu', 'alternator', 'baterie auto', 'releu', 'instalație electrică'],
            'Evacuare': ['evacuare', 'eșapament', 'esapament', 'catalizator', 'filtru particule', 'dpf'],
            'Faruri & lumini': ['far', 'faruri', 'lumini', 'lampă', 'stopuri'],
            'Filtre': ['filtru', 'filtre', 'filtru ulei', 'filtru aer', 'filtru combustibil'],
            'Frâne': ['frâne', 'frane', 'discuri frână', 'etrier', 'plăcuțe', 'placute'],
            'Interior auto': ['interior', 'scaun', 'scaune', 'volan', 'covoraș', 'bord', 'airbag'],
            'Întreținere': ['întreținere', 'intretinere', 'mentenanță', 'kit întreținere'],
            'Jante & anvelope': ['jantă', 'jante', 'anvelopă', 'anvelope', 'cauciucuri', 'roți'],
            'GPS': ['gps', 'navigație', 'navigatie'],
            'Revizie': ['revizie', 'kit revizie'],
            'Moto': ['moto', 'motocicletă', 'atv', 'quad'],
            'Motor': ['motor', 'bloc motor', 'chiulasa', 'piston', 'distribuție', 'distributie', 'arbore cotit'],
            'Injectoare': ['injector', 'injectoare', 'injectie', 'common rail'],
            'Rulmenți': ['rulment', 'rulmenți', 'rulmenti'],
            'Răcire': ['răcire', 'racire', 'radiator', 'termostat', 'pompă apă', 'ventilator'],
            'Scule': ['scule', 'cheie dinamometrică', 'tractor'],
            'Suspensie': ['suspensie', 'amortizor', 'arc', 'articulație', 'silent bloc', 'trapez'],
            'Transmisie': ['transmisie', 'cutie viteze', 'ambreiaj', 'cardan', 'diferențial'],
            'Tuning': ['tuning', 'sport', 'body kit'],
            'Turbo': ['turbo', 'turbina', 'turbosuflantă'],
            'Uleiuri': ['ulei', 'uleiuri', 'lubrifiant'],
            'Xenon': ['xenon', 'balast xenon', 'bec xenon'],
            'Nouă': ['nouă', 'noua', 'nefolosit', 'original'],
          };
          const searchAlias = key === 'tippiesa' ? textNorm : text;
          for (const opt of f.options) {
            const aliases = aliasMap[opt] || [optLower(opt)];
            if (
              aliases.some((a) =>
                searchAlias.includes(key === 'tippiesa' ? normalizeRo(a.toLowerCase()) : a)
              )
            ) {
              found = opt;
              break;
            }
          }
        }
        if (found) out[f.key] = found;
      } else if (f.type === 'text' && (key === 'marca' || key === 'brand')) {
        const originalCombined = `${title || ''} ${description || ''}`.trim();
        let marcaFilled = false;

        if (originalCombined) {
          const extracted = extractFieldValue(originalCombined, ['marca']);
          if (extracted?.field === 'marca' && extracted.value?.trim()) {
            out[f.key] = extracted.value.trim();
            marcaFilled = true;
          }
        }

        if (!marcaFilled && key === 'marca') {
          const compatMarca = text.match(
            /\b(?:pentru|pt\.?|compatibil[aăe]?\s+cu|de\s+la|potrivit[aăe]?\s+pentru)\s*:?\s*([a-z0-9ăâîșț]{2,16})\b/i
          );
          if (compatMarca) {
            const raw = compatMarca[1].toLowerCase();
            const shortBrand: Record<string, string> = {
              vw: 'Volkswagen',
              bmw: 'BMW',
              opel: 'Opel',
              ford: 'Ford',
              audi: 'Audi',
              dacia: 'Dacia',
              renault: 'Renault',
              mercedes: 'Mercedes',
              peugeot: 'Peugeot',
              citroen: 'Citroën',
              citroën: 'Citroën',
              toyota: 'Toyota',
              honda: 'Honda',
              hyundai: 'Hyundai',
              kia: 'Kia',
              nissan: 'Nissan',
              mazda: 'Mazda',
              volvo: 'Volvo',
              fiat: 'Fiat',
              seat: 'Seat',
              skoda: 'Škoda',
              škoda: 'Škoda',
              mini: 'Mini',
              jeep: 'Jeep',
              tesla: 'Tesla',
              porsche: 'Porsche',
            };
            if (shortBrand[raw]) {
              out[f.key] = shortBrand[raw];
              marcaFilled = true;
            } else if (raw.length >= 2 && raw.length <= 18 && !/^(piese|piesa|anunt|vand|vând|dezmembrari|dezmembrări|stare|tip|produs)$/i.test(raw)) {
              out[f.key] = raw.charAt(0).toUpperCase() + raw.slice(1);
              marcaFilled = true;
            }
          }
        }

        if (!marcaFilled) {
        const brandMap: [string[], string][] = [
          [['iphone', 'apple'], 'Apple'],
          [['samsung', 'galaxy'], 'Samsung'],
          [['huawei', 'honor'], 'Huawei'],
          [['xiaomi', 'redmi', 'poco'], 'Xiaomi'],
          [['oppo', 'oneplus', 'realme'], 'OPPO'],
          [['nokia'], 'Nokia'],
          [['motorola', 'moto g', 'moto e'], 'Motorola'],
          [['google pixel', 'pixel '], 'Google'],
          [['bmw'], 'BMW'],
          [['audi'], 'Audi'],
          [['mercedes', 'mercedees'], 'Mercedes'],
          [['volkswagen', 'vw ', ' vw', ' vw,', ' vw.', 'pentru vw', ' golf', 'passat', 'polo', 'tiguan', 'golf'], 'Volkswagen'],
          [['dacia', 'duster', 'sandero', 'logan', 'spring'], 'Dacia'],
          [['ford'], 'Ford'],
          [['renault'], 'Renault'],
          [['peugeot'], 'Peugeot'],
          [['toyota'], 'Toyota'],
          [['honda'], 'Honda'],
          [['hyundai'], 'Hyundai'],
          [['kia'], 'Kia'],
          [['skoda', 'škoda', 'octavia', 'kodiaq'], 'Škoda'],
          [['volvo'], 'Volvo'],
          [['land rover', 'range rover', 'discovery', 'defender'], 'Land Rover'],
          [['jeep'], 'Jeep'],
          [['mazda'], 'Mazda'],
          [['nissan'], 'Nissan'],
          [['fiat'], 'Fiat'],
          [['opel'], 'Opel'],
          [['citroen', 'citroën'], 'Citroën'],
          [['seat'], 'Seat'],
          [['tesla', 'model 3', 'model y'], 'Tesla'],
          [['porsche'], 'Porsche'],
          [['mitsubishi', 'outlander', 'lancer'], 'Mitsubishi'],
          [['subaru'], 'Subaru'],
          [['suzuki', 'swift', 'vitara'], 'Suzuki'],
          [['infiniti'], 'Infiniti'],
          [['genesis'], 'Genesis'],
          [['cupra'], 'Cupra'],
          [['abarth'], 'Abarth'],
          [['lancia'], 'Lancia'],
          [['smart'], 'Smart'],
          [['ssangyong', 'ssang'], 'SsangYong'],
          [['maserati'], 'Maserati'],
          [['bentley'], 'Bentley'],
          [['rolls royce', 'rolls-royce'], 'Rolls Royce'],
          [['yamaha'], 'Yamaha'],
          [['dell', 'optiplex', 'xps'], 'Dell'],
          [['hp ', 'hewlett', 'pavilion'], 'HP'],
          [['lenovo'], 'Lenovo'],
          [['asus'], 'ASUS'],
          [['acer'], 'Acer'],
          [['msi'], 'MSI'],
          [['beneteau'], 'Beneteau'],
          [['dji'], 'DJI'],
          [['canon'], 'Canon'],
          [['nikon'], 'Nikon'],
          [['sony'], 'Sony'],
          [['lg tv', ' lg ', 'webos'], 'LG'],
          [['bosch'], 'Bosch'],
          [['siemens'], 'Siemens'],
          [['beko'], 'Beko'],
          [['electrolux'], 'Electrolux'],
          [['whirlpool'], 'Whirlpool'],
          [['gopro'], 'GoPro'],
          [['fujifilm', 'fuji '], 'Fujifilm'],
          [['philips'], 'Philips'],
          [['dyson'], 'Dyson'],
          [['jeanneau'], 'Jeanneau'],
          [['knaus'], 'Knaus'],
          [['kawasaki'], 'Kawasaki'],
          [['ducati'], 'Ducati'],
        ];
        for (const [kws, brand] of brandMap) {
          if (kws.some(kw => text.includes(kw))) {
            out[f.key] = brand;
            break;
          }
        }
        }
      } else if (f.type === 'text' && (key === 'compatibilitate' || label.toLowerCase().includes('compatibilitate'))) {
        // Compatibilitate piese auto: din "compatibil X", "pentru X", "BMW X5 2015-2020", "Golf 5", etc.
        let compat = '';
        const compatMatch = text.match(/(?:compatibil[eăa]?\s*:?\s*|pentru\s+(?:mașina?|modelul?|masina?)\s*:?\s*|fit\s*:?\s*)([^.;\n]{4,100}?)(?=[.;\n]|$)/i)
          || text.match(/(?:pentru|pt\.?)\s+([A-Za-z0-9\s\-]{4,80}?)(?:\s+an\s|\s*\d{4}|\s*[,.]|$)/i);
        if (compatMatch) {
          compat = compatMatch[1].trim().replace(/\s+/g, ' ');
          if (compat.length > 80) compat = compat.slice(0, 77) + '...';
        }
        if (!compat) {
          // Încearcă model + an: "BMW X5 2015", "Golf 5", "Logan 2008-2012", "Duster 2018"
          const modelYear = text.match(/\b(BMW|Audi|VW|Volkswagen|Dacia|Renault|Ford|Opel|Skoda|Škoda|Mercedes|Toyota|Honda|Hyundai|Kia|Peugeot|Citroën|Citroen|Fiat|Seat|Volvo|Mazda|Nissan)\s*([A-Z0-9\s\-]+?)\s*(\d{4}(?:\s*[-–]\s*\d{4})?)?/i)
            || text.match(/\b(Golf|Polo|Passat|Logan|Sandero|Duster|Clio|Megane|Focus|Fiesta|Octavia|A4|A3|Seria\s*3|X5|X3)\s*[\s\-]*(\d)?\s*(\d{4}(?:\s*[-–]\s*\d{4})?)?/i);
          if (modelYear) {
            const parts = modelYear.slice(1).filter(Boolean).map((s: string) => s.trim());
            compat = parts.join(' ');
          }
        }
        if (compat) out[f.key] = compat;
      } else if (f.type === 'text' && (key === 'culoare' || label.includes('culoare'))) {
        const colorMap: [string[], string][] = [
          [['negru', 'neagra', 'neagră', 'black'], 'Negru'],
          [['alb', 'alba', 'albă', 'white'], 'Alb'],
          [['gri', 'gray', 'grey'], 'Gri'],
          [['argintiu', 'argintie', 'argint', 'silver'], 'Argintiu'],
          [['albastru', 'albastra', 'albastră', 'blue'], 'Albastru'],
          [['roșu', 'rosu', 'rosie', 'roșie', 'red'], 'Roșu'],
          [['verde', 'green'], 'Verde'],
          [['galben', 'galbena', 'galbenă', 'yellow'], 'Galben'],
          [['portocaliu', 'portocalie', 'orange'], 'Portocaliu'],
          [['auriu', 'aurie'], 'Auriu'],
          [['maro', 'brown'], 'Maro'],
          [['bej', 'beige'], 'Bej'],
          [['mov', 'blue'], 'Mov'],
          [['roz', 'pink'], 'Roz'],
          [['blue'], 'Blue'],
        ];
        for (const [kws, col] of colorMap) {
          if (kws.some(kw => text.includes(kw))) {
            out[f.key] = col;
            break;
          }
        }
      }
    }
    return out;
  };

  // Get dynamic fields for current category and subcategory
  // Câmpuri deja prezente în secțiunea principală (Categorie/Subcategorie) – nu le mai afișăm în Caracteristici Specifice
  const FIELDS_ALREADY_IN_MAIN_FORM = ['brand', 'model', 'marca', 'culoare', 'stare', 'ram', 'capacitateStocare', 'garantie', 'capacitateCilindrica'];

  const getManualFormDynamicFields = () => {
    if (!manualFormData.category || !manualFormData.subcategory) return [];
    const categoryFields = dynamicFieldsConfig[manualFormData.category];
    if (!categoryFields) return [];
    const fields = categoryFields[manualFormData.subcategory] || [];
    return fields.filter((f: { key: string }) => {
      if (FIELDS_ALREADY_IN_MAIN_FORM.includes(f.key)) return false;
      // Piese auto: „Tip piesă” e afișat în locul vechiului câmp „Stare” (Nou/Second hand)
      if (isPieseAuto && f.key === 'tipPiesa') return false;
      return true;
    });
  };

  const manualFormDynamicFields = getManualFormDynamicFields();

  // Handle dynamic field changes
  const handleManualFormDynamicFieldChange = (key: string, value: string | number) => {
    setManualFormData(prev => ({
      ...prev,
      customFields: {
        ...prev.customFields,
        [key]: value
      }
    }));
  };

  const getManualFormEffectiveRate = () => {
    const rate = manualFormExchangeRate ?? null;
    return rate && rate > 0 ? rate : null;
  };

  const getManualFormRateOrFallback = () => {
    const rate = getManualFormEffectiveRate();
    if (rate && rate > 0) {
      return rate;
    }
    if (manualFormPriceRon > 0 && manualFormPriceEur > 0) {
      return manualFormPriceRon / manualFormPriceEur;
    }
    return null;
  };

  const fetchManualFormExchangeRate = async (): Promise<number | null> => {
    setManualFormIsFetchingRate(true);
    setManualFormExchangeError(null);
    try {
      const response = await dashboardApiFetch('/api/exchange-rate');
      const data = await response.json();
      
      if (data.success && data.rate && data.rate > 0) {
        setManualFormExchangeRate(data.rate);
        if (data.publishedAt) {
          setManualFormLastRateUpdate(new Date(data.publishedAt));
        } else {
          setManualFormLastRateUpdate(new Date());
        }
        setManualFormExchangeError(null);
        return data.rate;
      }
      
      // Dacă există rate chiar dacă success este false, îl folosim
      if (data.rate && data.rate > 0) {
        setManualFormExchangeRate(data.rate);
        if (data.publishedAt) {
          setManualFormLastRateUpdate(new Date(data.publishedAt));
        } else {
          setManualFormLastRateUpdate(new Date());
        }
        if (data.warning) {
          setManualFormExchangeError(data.warning);
        }
        return data.rate;
      }
      
      throw new Error(data.error || 'Nu s-a putut obține cursul valutar');
    } catch (error: any) {
      console.error('Error fetching exchange rate:', error);
      setManualFormExchangeError(error.message || 'Eroare la obținerea cursului valutar');
      return null;
    } finally {
      setManualFormIsFetchingRate(false);
    }
  };

  // Auto-generate SKU when subcategory changes
  useEffect(() => {
    if (manualFormData.subcategory && !manualFormSkuEditable) {
      const existingSkus = products.map(p => p.sku).filter(Boolean);
      const newSku = generateSku(manualFormData.subcategory, existingSkus);
      if (newSku) {
        setManualFormData(prev => ({ ...prev, sku: newSku }));
      }
    }
  }, [manualFormData.subcategory, manualFormSkuEditable, products]);

  // Fetch exchange rate, user tokens, romania localities și locația preferată la deschiderea modalului (doar pentru "Adaugă")
  useEffect(() => {
    if (showManualAddModal) {
      if (!editingProductId && typeof window !== 'undefined') {
        const favCounty = localStorage.getItem('gobid_manual_form_favorite_county');
        const favCity = localStorage.getItem('gobid_manual_form_favorite_city');
        const favVillage = localStorage.getItem('gobid_manual_form_favorite_village');
        const hasFav =
          Boolean((favCounty && favCounty.trim()) || (favCity && favCity.trim()) || (favVillage && favVillage.trim()));
        if (favCounty || favCity || favVillage) {
          setManualFormData(prev => ({
            ...prev,
            county: favCounty || prev.county,
            city: favCity || prev.city,
            village: favVillage || prev.village,
          }));
        }
        setManualFormFavoriteLocationLocked(hasFav);
      } else {
        setManualFormFavoriteLocationLocked(false);
      }
      dashboardApiFetch('/api/romania-localities')
        .then((r) => r.json())
        .then((json: { success?: boolean; data?: LocalitiesData }) => {
          if (json?.success && json.data) setLocalitiesByCounty(json.data);
        })
        .catch((err) => console.error('Failed to load Romania localities:', err));
      fetchManualFormExchangeRate();
      
      // Load user tokens
      const loadUserTokens = async () => {
        try {
          const session = await recoverDashboardSessionIfNeeded(supabase);
          if (session?.access_token) {
            const tokensResponse = await apiFetchWithSession('/api/tokens', {
              method: 'GET',
            });
            if (tokensResponse.ok) {
              const tokensData = await tokensResponse.json();
              setManualFormUserTokens({
                balance: tokensData.balance ?? 0,
                totalEarned: tokensData.totalEarned ?? 0,
                totalSpent: tokensData.totalSpent ?? 0,
                level: tokensData.level ?? 'Basic',
                package: tokensData.package ?? 'Basic'
              });
            }
          }
        } catch (error) {
          console.error('Error loading user tokens:', error);
        }
      };
      loadUserTokens();
    }
  }, [showManualAddModal, editingProductId]);

  useEffect(() => {
    if (!showManualAddModal) setManualFormFavoriteSaveFeedback(false);
  }, [showManualAddModal]);

  useEffect(() => {
    if (!showManualAddModal || !isPieseAuto) return;
    setManualFormData((prev) => {
      if (prev.category === PIESE_AUTO_FORM_CATEGORY_DISPLAY && prev.subcategory === PIESE_AUTO_FORM_SUBCATEGORY_DISPLAY) {
        return prev;
      }
      return {
        ...prev,
        category: PIESE_AUTO_FORM_CATEGORY_DISPLAY,
        subcategory: PIESE_AUTO_FORM_SUBCATEGORY_DISPLAY,
      };
    });
  }, [showManualAddModal, isPieseAuto]);

  const handleManualFormGenerateSEO = async () => {
    if (!manualFormData.title.trim() || !manualFormData.description.trim()) {
      setManualFormMessage({ 
        type: 'error', 
        text: 'Vă rugăm să completați cel puțin titlul și descrierea pentru generarea SEO.' 
      });
      return;
    }

    setManualFormIsGeneratingSEO(true);
    setManualFormMessage(null);

    try {
      const specificatii = Object.entries(manualFormData.customFields || {})
        .map(([key, value]) => `${key}: ${value}`)
        .join(', ');

      const response = await dashboardApiFetch('/api/seo', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          titlu: manualFormData.title,
          descriere: manualFormData.description,
          specificatii: specificatii || undefined
        }),
      });

      if (!response.ok) {
        throw new Error('Eroare la generarea SEO');
      }

      const result = await response.json();
      
      if (result.success && result.data) {
        setManualFormSEO({
          title: result.data.seoTitle || '',
          description: result.data.seoDescription || '',
          keywords: result.data.seoKeywords ? result.data.seoKeywords.split(',').map((k: string) => k.trim()).filter((k: string) => k) : []
        });
        
        setManualFormMessage({ 
          type: 'success', 
          text: `SEO generat cu succes! ${result.openaiAvailable ? '(folosind ChatGPT)' : '(folosind fallback local)'}` 
        });
      } else {
        throw new Error('Nu s-au putut genera date SEO');
      }
    } catch (error: any) {
      console.error('Error generating SEO:', error);
      setManualFormMessage({ 
        type: 'error', 
        text: `Eroare la generarea SEO: ${error.message}` 
      });
    } finally {
      setManualFormIsGeneratingSEO(false);
    }
  };

  const handleManualFormAutoEnhance = async () => {
    if (!manualFormData.title.trim() || !manualFormData.description.trim()) {
      setManualFormMessage({ 
        type: 'error', 
        text: 'Vă rugăm să completați cel puțin titlul și descrierea pentru îmbunătățire automată.' 
      });
      return;
    }

    setManualFormIsEnhancing(true);
    setManualFormMessage(null);

    try {
      const specificatii = Object.entries(manualFormData.customFields || {})
        .map(([key, value]) => `${key}: ${value}`)
        .join(', ');

      const response = await dashboardApiFetch('/api/ai-product-enhancer', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          titlu: manualFormData.title,
          descriere: manualFormData.description,
          specificatii: specificatii || undefined
        }),
      });

      if (!response.ok) {
        throw new Error('Eroare la îmbunătățirea produsului');
      }

      const result = await response.json();
      
      if (result.success && result.data) {
        setManualFormData(prev => ({
          ...prev,
          title: manualFormRewriteTitle
            ? String(result.data.newTitle ?? '').slice(0, MANUAL_PRODUCT_TITLE_MAX_LENGTH)
            : prev.title,
          description: manualFormRewriteDescription ? result.data.newDescription : prev.description,
        }));
        
        setManualFormSEO(prev => ({
          title: result.data.seoTitle || prev.title,
          description: result.data.seoDescription || prev.description,
          keywords: result.data.seoKeywords ? result.data.seoKeywords.split(',').map((k: string) => k.trim()).filter((k: string) => k) : prev.keywords
        }));
        
        setManualFormMessage({ 
          type: 'success', 
          text: `Produs optimizat cu succes! ${result.openaiAvailable ? '(folosind ChatGPT)' : '(folosind fallback local)'}` 
        });
      } else {
        throw new Error('Nu s-au putut îmbunătăți datele produsului');
      }
    } catch (error: any) {
      console.error('Error auto-enhancing:', error);
      setManualFormMessage({ 
        type: 'error', 
        text: `Eroare la îmbunătățirea produsului: ${error.message}` 
      });
    } finally {
      setManualFormIsEnhancing(false);
    }
  };

  const saveManualFormFavoriteLocation = () => {
    if (typeof window === 'undefined') return;
    const county = manualFormData.county || '';
    const city = (manualFormData.city || '').trim();
    const village = (manualFormData.village || '').trim();
    localStorage.setItem('gobid_manual_form_favorite_county', county);
    localStorage.setItem('gobid_manual_form_favorite_city', city);
    localStorage.setItem('gobid_manual_form_favorite_village', village);
    setManualFormFavoriteLocationLocked(true);
    setManualFormFavoriteSaveFeedback(true);
    setTimeout(() => setManualFormFavoriteSaveFeedback(false), 3200);
    setManualFormMessage({ type: 'success', text: 'Locația a fost memorată pentru anunțurile viitoare.' });
    setTimeout(() => setManualFormMessage(null), 3500);
  };

  const applyMyLocationToManualForm = useCallback(async () => {
    if (typeof window === 'undefined' || !navigator.geolocation) {
      setManualFormMessage({ type: 'error', text: 'Browserul nu permite accesul la locație.' });
      return;
    }

    setManualFormUseMyLocationBusy(true);

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          const { latitude, longitude } = position.coords;
          const response = await fetch(
            `/api/ro/resolve-location?lat=${encodeURIComponent(latitude)}&lng=${encodeURIComponent(longitude)}`
          );
          const data = await response.json();

          if (!response.ok || !data?.ok) {
            throw new Error(data?.error || 'Nu am putut detecta localitatea.');
          }

          const approximateLocation = getApproximateLocationFromComponents(data.addressComponents, data.formattedAddress);
          const countyOptions = localitiesByCounty?.counties ?? counties;
          const matchedCounty =
            resolveLocationOption(countyOptions, approximateLocation.county) ||
            resolveLocationOptionFromText(countyOptions, data.formattedAddress || '');
          const cityOptions = matchedCounty
            ? ((localitiesByCounty?.byCounty[matchedCounty]?.cities ?? citiesByCounty[matchedCounty]) || [])
            : [];
          const matchedCity =
            resolveLocationOption(cityOptions, approximateLocation.city) ||
            resolveLocationOption(cityOptions, approximateLocation.village) ||
            resolveLocationOptionFromText(cityOptions, data.formattedAddress || '') ||
            (matchedCounty === 'București' ? 'București' : '');
          const villageOptions = matchedCounty && matchedCity
            ? (localitiesByCounty?.byCounty[matchedCounty]?.villages[matchedCity] || [])
            : [];
          const matchedVillage =
            resolveLocationOption(villageOptions, approximateLocation.village) ||
            resolveLocationOptionFromText(villageOptions, data.formattedAddress || '');
          const approximateCoordinates = await resolveApproximateCoordinatesForListing({
            county: matchedCounty || approximateLocation.county,
            city: matchedCity || approximateLocation.city,
            village: matchedVillage || approximateLocation.village,
          });

          setManualFormData(prev => ({
            ...prev,
            county: matchedCounty || prev.county,
            city: matchedCity || prev.city,
            village: matchedVillage || prev.village,
            coordinates: approximateCoordinates ?? prev.coordinates,
          }));

          if (!matchedCounty && !matchedCity && !matchedVillage) {
            setManualFormMessage({ type: 'error', text: 'Am primit locația, dar nu am putut identifica automat județul/orașul. Te rog completează manual.' });
          } else {
            setManualFormMessage({
              type: 'success',
              text: 'Am completat locația aproximativă. Nu salvăm adresa exactă sau coordonatele GPS în anunț.'
            });
          }
          setTimeout(() => setManualFormMessage(null), 4500);
        } catch (error) {
          console.error('Error resolving current location:', error);
          setManualFormMessage({ type: 'error', text: 'Nu am putut transforma locația în județ și oraș. Poți completa manual.' });
        } finally {
          setManualFormUseMyLocationBusy(false);
        }
      },
      (error) => {
        console.error('Geolocation error:', error);
        setManualFormUseMyLocationBusy(false);
        setManualFormMessage({
          type: 'error',
          text: error.code === error.PERMISSION_DENIED
            ? 'Permisiunea pentru locație a fost refuzată.'
            : 'Nu am putut citi locația dispozitivului.'
        });
      },
      {
        enableHighAccuracy: false,
        timeout: 12000,
        maximumAge: 5 * 60 * 1000,
      }
    );
  }, []);

  const confirmManualFormLocationPermission = useCallback(() => {
    setManualFormLocationPermissionOpen(false);
    window.setTimeout(() => {
      void applyMyLocationToManualForm();
    }, 180);
  }, [applyMyLocationToManualForm]);

  const handleManualFormTitleBlur = (titleValue: string, descriptionValue?: string) => {
    setManualFormData(prev => {
      const suggestion = suggestCategoryFromTitle(titleValue);
      const nextCat = isPieseAuto ? PIESE_AUTO_FORM_CATEGORY_DISPLAY : (suggestion?.category ?? prev.category);
      const nextSub = isPieseAuto ? PIESE_AUTO_FORM_SUBCATEGORY_DISPLAY : (suggestion?.subcategory ?? prev.subcategory);
      const nextCustom = { ...prev.customFields };

      // Completare automată categorie/subcategorie (ca înainte)
      const updated = {
        ...prev,
        category: isPieseAuto ? PIESE_AUTO_FORM_CATEGORY_DISPLAY : (prev.category || suggestion?.category || prev.category),
        subcategory: isPieseAuto ? PIESE_AUTO_FORM_SUBCATEGORY_DISPLAY : (prev.subcategory || suggestion?.subcategory || prev.subcategory),
      };

      // Completare automată Caracteristici Specifice din titlu + descriere
      const desc = descriptionValue ?? prev.description;
      const fields = getDynamicFieldsFor(nextCat, nextSub);
      const suggested = suggestDynamicFieldsFromTitleAndDescription(titleValue, desc, fields);
      for (const [k, v] of Object.entries(suggested)) {
        const cur = nextCustom[k];
        if (v !== undefined && v !== null && v !== '' && (cur === undefined || cur === null || cur === ''))
          nextCustom[k] = v;
      }
      // Stare produs din titlu + descriere (suprascrie doar dacă găsim o stare)
      const stareProdus = suggestStareProdusFromTitleAndDescription(titleValue, desc);
      if (stareProdus) nextCustom.stare_produs = stareProdus;

      // Doar piese auto: marca în customFields + dropdown „Marca” (`brand`) în aceeași secțiune.
      if (isPieseAuto) {
        const prevBrand = String(prev.brand ?? '').trim();
        if (!prevBrand) {
          const hint =
            (typeof nextCustom.marca === 'string' && nextCustom.marca.trim()) ||
            (typeof nextCustom.brand === 'string' && nextCustom.brand.trim()) ||
            '';
          if (hint) {
            const opts = getBrandOptionsForSubcategory(nextSub);
            const matched = matchExtractedMarcaToBrandOption(hint, opts);
            if (matched) updated.brand = matched;
          }
        }
        updated.condition = inferPieseAutoListingCondition(
          titleValue,
          desc,
          nextCustom as Record<string, string>
        );
      }

      updated.customFields = nextCustom;
      return updated;
    });
  };

  const handleManualFormInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    const checked = (e.target as HTMLInputElement).checked;

    if (name === 'isFreeListing') {
      setManualFormData(prev => ({
        ...prev,
        isFreeListing: checked,
        buyNowEnabled: checked ? false : prev.buyNowEnabled,
        buyNowPriceRON: checked ? null : prev.buyNowPriceRON,
        buyNowPriceEUR: checked ? null : prev.buyNowPriceEUR,
      }));
      if (checked) {
        setManualFormBuyNowPriceRon(null);
        setManualFormBuyNowPriceEur(null);
        clearManualFormDiscounts();
      }
    } else if (type === 'checkbox') {
      setManualFormData(prev => ({ ...prev, [name]: checked }));
    } else if (name === 'sku') {
      const sanitized = sanitizeSkuInput(value);
      setManualFormData(prev => ({ ...prev, sku: sanitized }));
    } else if (name === 'currency') {
      setManualFormData(prev => ({ ...prev, currency: value as 'RON' | 'EUR' }));
    } else if (name === 'county') {
      const newCounty = String(value);
      const cities = (localitiesByCounty?.byCounty[newCounty]?.cities ?? citiesByCounty[newCounty]) || [];
      setManualFormData(prev => {
        const keepCity = prev.city && cities.includes(prev.city);
        return { ...prev, county: newCounty, city: keepCity ? prev.city : '', village: '' };
      });
    } else if (name === 'city') {
      setManualFormData(prev => ({ ...prev, city: String(value), village: '' }));
    } else if (name === 'category') {
      if (isPieseAuto) return;
      setManualFormData(prev => ({ ...prev, category: value, subcategory: '', categoryLevel3: '', size: '', brand: '', model: '', capacitateCilindrica: '', ram: '', capacitateStocare: '', garantie: '', color: '', condition: 'Nou' }));
    } else if (name === 'subcategory') {
      if (isPieseAuto) return;
      setManualFormData(prev => ({ ...prev, subcategory: value, categoryLevel3: '', size: '', brand: '', model: '', capacitateCilindrica: '', ram: '', capacitateStocare: '', garantie: '', color: '', condition: 'Nou' }));
    } else if (name === 'brand') {
      setManualFormData(prev => ({ ...prev, brand: value, model: '' }));
    } else if (name === 'title') {
      setManualFormData(prev => ({ ...prev, title: String(value).slice(0, MANUAL_PRODUCT_TITLE_MAX_LENGTH) }));
    } else {
      setManualFormData(prev => ({ ...prev, [name]: value }));
    }
  };

  // Discount calculation functions
  type DiscountSummary = {
    percent: number;
    valueRon: number;
    valueEur: number | null;
    finalRon: number;
    finalEur: number | null;
  };

  type DiscountUpdateInput = {
    percent?: number | null;
    valueRon?: number | null;
    finalPriceRon?: number | null;
    baseRon?: number;
    baseEur?: number;
  };

  const calculateManualFormDiscount = ({
    baseRon,
    baseEur,
    percent,
    valueRon,
    finalPriceRon,
  }: DiscountUpdateInput & { baseRon: number; baseEur: number }): DiscountSummary | null => {
    const safeBaseRon = Number.isFinite(baseRon) ? baseRon : 0;
    const safeBaseEur = Number.isFinite(baseEur) ? baseEur : 0;

    if (safeBaseRon <= 0) {
      return null;
    }

    let pct: number | null = percent ?? null;
    let value: number | null = valueRon ?? null;
    let finalValue: number | null = finalPriceRon ?? null;

    if (pct !== null && Number.isFinite(pct)) {
      pct = Math.min(100, Math.max(0, pct));
      value = roundTo(safeBaseRon * (pct / 100));
      finalValue = roundTo(safeBaseRon - value);
    } else if (value !== null && Number.isFinite(value)) {
      value = Math.min(Math.max(0, value), safeBaseRon);
      pct = safeBaseRon > 0 ? roundTo((value / safeBaseRon) * 100, 2) : 0;
      finalValue = roundTo(safeBaseRon - value);
    } else if (finalValue !== null && Number.isFinite(finalValue)) {
      finalValue = Math.min(Math.max(0, finalValue), safeBaseRon);
      value = roundTo(safeBaseRon - finalValue);
      pct = safeBaseRon > 0 ? roundTo((value / safeBaseRon) * 100, 2) : 0;
    } else {
      return null;
    }

    const safePercent = pct ?? 0;
    const safeValueRon = roundTo(value ?? 0);
    const safeFinalRon = roundTo(finalValue ?? safeBaseRon);

    const fallbackRate = safeBaseEur > 0 ? safeBaseRon / safeBaseEur : null;
    const rate = getManualFormEffectiveRate() ?? fallbackRate;

    let valueEur: number | null = null;
    let finalEur: number | null = null;

    if (rate && rate > 0) {
      valueEur = roundTo(safeValueRon / rate);
      finalEur = roundTo(safeFinalRon / rate);
    } else if (safeBaseEur > 0) {
      const ratio = safeBaseEur / safeBaseRon;
      valueEur = roundTo(safeValueRon * ratio);
      finalEur = roundTo(safeBaseEur - valueEur);
    }

    if (finalEur !== null && finalEur < 0) {
      finalEur = 0;
    }
          
    return {
      percent: safePercent,
      valueRon: safeValueRon,
      valueEur,
      finalRon: safeFinalRon,
      finalEur,
    };
  };

  const updateManualFormDiscounts = ({
    percent,
    valueRon,
    finalPriceRon,
    baseRon = manualFormPriceRon,
    baseEur = manualFormPriceEur,
  }: DiscountUpdateInput) => {
    const summary = calculateManualFormDiscount({
      baseRon,
      baseEur,
      percent: percent ?? null,
      valueRon: valueRon ?? null,
      finalPriceRon: finalPriceRon ?? null,
    });

    if (!summary) {
      clearManualFormDiscounts();
      return;
    }

    setManualFormDiscountPercent(summary.percent);
    setManualFormDiscountValueRon(summary.valueRon);
    setManualFormDiscountValueEur(summary.valueEur);
    setManualFormDiscountedPriceRon(summary.finalRon);
    setManualFormDiscountedPriceEur(summary.finalEur);
  };

  const clearManualFormDiscounts = () => {
    setManualFormDiscountPercent(null);
    setManualFormDiscountValueRon(null);
    setManualFormDiscountValueEur(null);
    setManualFormDiscountedPriceRon(null);
    setManualFormDiscountedPriceEur(null);
  };

  const resetManualForm = useCallback(() => {
    setManualFormData({
      title: '',
      description: '',
      category: isPieseAuto ? PIESE_AUTO_FORM_CATEGORY_DISPLAY : '',
      subcategory: isPieseAuto ? PIESE_AUTO_FORM_SUBCATEGORY_DISPLAY : '',
      categoryLevel3: '',
      size: '',
      brand: '',
      model: '',
      capacitateCilindrica: '',
      ram: '',
      capacitateStocare: '',
      garantie: '',
      color: '',
      condition: isPieseAuto ? 'Second hand' : 'Nou',
      sku: '',
      currency: 'RON',
      productType: 'live-bid',
      buyNowEnabled: false,
      buyNowPriceRON: null,
      buyNowPriceEUR: null,
      isFreeListing: false,
      isUrgent: false,
      county: '',
      city: '',
      village: '',
      address: '',
      coordinates: undefined,
      images: [],
      customFields: {},
      status: 'active',
    });
    setManualFormPriceRon(0);
    setManualFormPriceEur(0);
    setManualFormSelectedImageFiles([]);
    setManualFormSkuEditable(false);
    setManualFormSEO({ title: '', description: '', keywords: [] });
    clearManualFormDiscounts();
    setManualFormBuyNowPriceRon(null);
    setManualFormBuyNowPriceEur(null);
    setManualFormMessage(null);
    setManualFormAutoEnhance(false);
    setManualFormRewriteTitle(false);
    setManualFormRewriteDescription(false);
  }, [isPieseAuto]);

  const reapplyManualFormDiscounts = (baseRon: number, baseEur: number) => {
    if (manualFormDiscountPercent !== null) {
      updateManualFormDiscounts({ percent: manualFormDiscountPercent, baseRon, baseEur });
    } else if (manualFormDiscountValueRon !== null) {
      updateManualFormDiscounts({ valueRon: manualFormDiscountValueRon, baseRon, baseEur });
    } else if (manualFormDiscountedPriceRon !== null) {
      updateManualFormDiscounts({ finalPriceRon: manualFormDiscountedPriceRon, baseRon, baseEur });
    } else {
      clearManualFormDiscounts();
    }
  };

  const handleManualFormRonInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const numeric = Number.isFinite(e.target.valueAsNumber) ? e.target.valueAsNumber : parseFloat(e.target.value.replace(',', '.')) || 0;
    
    if (Number.isNaN(numeric) || numeric < 0) {
      setManualFormPriceRon(0);
      setManualFormPriceEur(0);
      clearManualFormDiscounts();
      return;
    }

    const rate = getManualFormEffectiveRate();
    const convertedEur = rate && rate > 0 ? roundTo(numeric / rate) : manualFormPriceEur;

    setManualFormPriceRon(numeric);
    setManualFormPriceEur(convertedEur);
    
    if (numeric > 0) {
      reapplyManualFormDiscounts(numeric, convertedEur);
    } else {
      clearManualFormDiscounts();
    }
    
    if (rate) {
      setManualFormExchangeError(null);
    } else {
      setManualFormExchangeError('Actualizează cursul pentru conversie în EUR.');
    }
  };

  const handleManualFormEurInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const numeric = Number.isFinite(e.target.valueAsNumber) ? e.target.valueAsNumber : parseFloat(e.target.value.replace(',', '.')) || 0;
    
    if (Number.isNaN(numeric) || numeric < 0) {
      setManualFormPriceEur(0);
      setManualFormPriceRon(0);
      clearManualFormDiscounts();
      return;
    }

    const rate = getManualFormEffectiveRate();
    const convertedRon = rate && rate > 0 ? roundTo(numeric * rate) : manualFormPriceRon;

    setManualFormPriceEur(numeric);
    setManualFormPriceRon(convertedRon);
    
    if (numeric > 0) {
      reapplyManualFormDiscounts(convertedRon, numeric);
    } else {
      clearManualFormDiscounts();
    }
    
    if (rate) {
      setManualFormExchangeError(null);
    } else {
      setManualFormExchangeError('Actualizează cursul pentru conversie în Lei.');
    }
  };

  const handleManualFormDiscountPercentChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawValue = e.target.value;
    if (rawValue.trim() === '') {
      clearManualFormDiscounts();
      return;
    }

    const parsed = parseFloat(rawValue.replace(',', '.'));
    if (Number.isNaN(parsed)) {
      return;
    }

    updateManualFormDiscounts({ percent: parsed, baseRon: manualFormPriceRon, baseEur: manualFormPriceEur });
  };

  const handleManualFormDiscountValueChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawValue = e.target.value;
    if (rawValue.trim() === '') {
      clearManualFormDiscounts();
      return;
    }

    const parsed = parseFloat(rawValue.replace(',', '.'));
    if (Number.isNaN(parsed)) {
      return;
    }

    updateManualFormDiscounts({ valueRon: parsed, baseRon: manualFormPriceRon, baseEur: manualFormPriceEur });
  };

  const handleManualFormDiscountFinalPriceChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawValue = e.target.value;
    if (rawValue.trim() === '') {
      clearManualFormDiscounts();
      return;
    }

    const parsed = parseFloat(rawValue.replace(',', '.'));
    if (Number.isNaN(parsed)) {
      return;
    }

    updateManualFormDiscounts({ finalPriceRon: parsed, baseRon: manualFormPriceRon, baseEur: manualFormPriceEur });
  };

  const handleManualFormDiscountValueEurChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawValue = e.target.value;
    if (rawValue.trim() === '') {
      clearManualFormDiscounts();
      return;
    }

    const parsed = parseFloat(rawValue.replace(',', '.'));
    if (Number.isNaN(parsed) || parsed < 0) {
      return;
    }

    const rate = getManualFormRateOrFallback();
    if (!rate) {
      setManualFormExchangeError('Actualizează cursul pentru a aplica reducerea în EUR.');
      return;
    }

    const baseEurValue = manualFormPriceEur > 0 ? manualFormPriceEur : manualFormPriceRon > 0 ? roundTo(manualFormPriceRon / rate) : parsed;
    updateManualFormDiscounts({ valueRon: roundTo(parsed * rate), baseRon: manualFormPriceRon, baseEur: baseEurValue });
  };

  const handleManualFormDiscountFinalPriceEurChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawValue = e.target.value;
    if (rawValue.trim() === '') {
      clearManualFormDiscounts();
      return;
    }

    const parsed = parseFloat(rawValue.replace(',', '.'));
    if (Number.isNaN(parsed) || parsed < 0) {
      return;
    }

    const rate = getManualFormRateOrFallback();
    if (!rate) {
      setManualFormExchangeError('Actualizează cursul pentru a aplica prețul redus în EUR.');
      return;
    }

    const baseEurValue = manualFormPriceEur > 0 ? manualFormPriceEur : manualFormPriceRon > 0 ? roundTo(manualFormPriceRon / rate) : parsed;
    const finalPriceRon = roundTo(parsed * rate);
    updateManualFormDiscounts({ finalPriceRon, baseRon: manualFormPriceRon, baseEur: baseEurValue });
  };

  const handleManualFormBuyNowRonChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseFloat(e.target.value) || null;
    setManualFormBuyNowPriceRon(value);
    const rate = getManualFormEffectiveRate();
    if (rate && rate > 0 && value !== null) {
      setManualFormBuyNowPriceEur(roundTo(value / rate));
    }
  };

  const handleManualFormBuyNowEurChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseFloat(e.target.value) || null;
    setManualFormBuyNowPriceEur(value);
    const rate = getManualFormEffectiveRate();
    if (rate && rate > 0 && value !== null) {
      setManualFormBuyNowPriceRon(roundTo(value * rate));
    }
  };

  const processManualFormFiles = useCallback((fileList: File[]) => {
    try {
      const files = Array.from(fileList);
      if (files.length === 0) return;

      const currentImageCount = manualFormData.images.length;
      const totalAfterUpload = currentImageCount + files.length;

      if (totalAfterUpload > MAX_IMAGES) {
        const allowedCount = MAX_IMAGES - currentImageCount;
        setManualFormMessage({
          type: 'error',
          text: `Poți adăuga doar ${allowedCount} imagini în plus. Limita maximă este de ${MAX_IMAGES} imagini.`,
        });
        return;
      }

      const pendingImages: File[] = [];
      const uploadErrors: string[] = [];

      for (const file of files) {
        if (file.size > 10 * 1024 * 1024) {
          uploadErrors.push(`${file.name}: max 10MB`);
          continue;
        }

        if (isLikelyImageFile(file)) {
          pendingImages.push(file);
        } else {
          uploadErrors.push(`${file.name}: tip de fișier neacceptat (doar imagini, ex. JPG, PNG, GIF, WebP).`);
        }
      }

      if (pendingImages.length > 0) {
        setManualFormData((prev) => ({
          ...prev,
          images: [...prev.images, ...pendingImages],
        }));
        const total = pendingImages.length;
        const okMsg = `${total} ${total === 1 ? 'imagine adăugată' : 'imagini adăugate'} (se comprimă și se încarcă la salvare).`;
        if (uploadErrors.length > 0) {
          const errPart =
            uploadErrors.length === 1 ? uploadErrors[0]! : uploadErrors.slice(0, 3).join(' · ');
          if (pendingImages.length > 0) {
            setManualFormMessage({
              type: 'success',
              text: `${okMsg} Unele fișiere au fost ignorate: ${errPart}`,
            });
          } else {
            setManualFormMessage({ type: 'error', text: errPart });
          }
        } else {
          setManualFormMessage({ type: 'success', text: okMsg });
        }
      } else if (uploadErrors.length > 0) {
        setManualFormMessage({
          type: 'error',
          text: uploadErrors.length === 1 ? uploadErrors[0]! : uploadErrors.slice(0, 3).join(' · '),
        });
      }
    } catch (error) {
      console.error('Error uploading files:', error);
      setManualFormMessage({ type: 'error', text: 'Eroare la încărcarea fișierelor.' });
    }
  }, [manualFormData.images.length]);

  const handleManualFormFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    try {
      const files = Array.from(e.target.files || []);
      processManualFormFiles(files);
    } catch (error) {
      console.error('Error uploading files:', error);
      setManualFormMessage({ type: 'error', text: 'Eroare la încărcarea fișierelor.' });
    }
    e.target.value = '';
  };

  const handleManualFormMediaZoneDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    if (manualFormData.images.length >= MAX_IMAGES) return;
    e.preventDefault();
    e.stopPropagation();
    const types = Array.from(e.dataTransfer.types);
    const hasFiles = types.includes('Files') || types.some((t) => t.startsWith('image/'));
    if (hasFiles) {
      try {
        e.dataTransfer.dropEffect = 'copy';
      } catch {
        /* ignore */
      }
      setManualFormFileDragActive(true);
    }
  };

  const handleManualFormMediaZoneDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const related = e.relatedTarget as Node | null;
    if (related && e.currentTarget.contains(related)) return;
    setManualFormFileDragActive(false);
  };

  const handleManualFormMediaZoneDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setManualFormFileDragActive(false);
    if (manualFormData.images.length >= MAX_IMAGES) return;
    const files = Array.from(e.dataTransfer.files || []);
    processManualFormFiles(files);
  };

  useEffect(() => {
    const onDragEnd = () => setManualFormFileDragActive(false);
    window.addEventListener('dragend', onDragEnd);
    return () => window.removeEventListener('dragend', onDragEnd);
  }, []);

  const handleManualFormRemoveImage = (index: number) => {
    setManualFormData(prev => {
      const newImages = prev.images.filter((_, i) => i !== index);
      return {
        ...prev,
        images: newImages
      };
    });
  };

  const handleManualFormReorderImages = useCallback((fromIndex: number, toIndex: number) => {
    setManualFormData((prev) => ({
      ...prev,
      images: reorderArray(prev.images, fromIndex, toIndex),
    }));
  }, []);

  const moveManualImageStep = useCallback((index: number, delta: number) => {
    setManualFormData((prev) => {
      const to = index + delta;
      if (to < 0 || to >= prev.images.length) return prev;
      return { ...prev, images: reorderArray(prev.images, index, to) };
    });
  }, []);

  const markManualImageAsFavorite = useCallback((index: number) => {
    setManualFormData((prev) => {
      if (index <= 0 || index >= prev.images.length) return prev;
      return { ...prev, images: reorderArray(prev.images, index, 0) };
    });
  }, []);

  const {
    draggedIndex: manualImageDraggedIndex,
    dragOverIndex: manualImageDragOverIndex,
    getSortableItemProps: getManualImageItemProps,
  } = useManualListingImageDnD(handleManualFormReorderImages);

  const closeManualImagePreview = () => {
    if (manualImagePreviewObjectUrlRef.current) {
      URL.revokeObjectURL(manualImagePreviewObjectUrlRef.current);
      manualImagePreviewObjectUrlRef.current = null;
    }
    setManualImageLightboxSrc(null);
  };

  const openManualImagePreview = (index: number) => {
    const item = manualFormData.images[index];
    if (typeof item === 'string') {
      if (manualImagePreviewObjectUrlRef.current) {
        URL.revokeObjectURL(manualImagePreviewObjectUrlRef.current);
        manualImagePreviewObjectUrlRef.current = null;
      }
      setManualImageLightboxSrc(item);
      return;
    }
    if (item instanceof File && item.type.startsWith('image/')) {
      if (manualImagePreviewObjectUrlRef.current) {
        URL.revokeObjectURL(manualImagePreviewObjectUrlRef.current);
      }
      const url = URL.createObjectURL(item);
      manualImagePreviewObjectUrlRef.current = url;
      setManualImageLightboxSrc(url);
    }
  };

  useEffect(() => {
    if (!manualImageLightboxSrc) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeManualImagePreview();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [manualImageLightboxSrc]);

  /** Native app: add photo directly from camera or gallery; upload then add URL to manual form. */
  const handleManualFormNativePhoto = async (preferredSource: 'camera' | 'photos') => {
    if (manualFormData.images.length >= MAX_IMAGES) {
      setManualFormMessage({ type: 'error', text: `Poți adăuga doar ${MAX_IMAGES} imagini.` });
      return;
    }
    const result = await getSafePhoto({ preferredSource });
    if (!result.ok) {
      if (result.reason === 'cancelled') return;
      if (result.reason === 'plugin-missing' || result.reason === 'unavailable') {
        if (preferredSource === 'camera') {
          manualCameraCaptureRef.current?.click();
        } else {
          manualFileUploadRef.current?.click();
        }
        return;
      }
      setManualFormMessage({ type: 'error', text: result.message });
      return;
    }
    try {
      const file = await webPathToFile(result.webPath);
      if (file.size > 10 * 1024 * 1024) {
        setManualFormMessage({ type: 'error', text: 'Fișierul este prea mare. Max 10MB.' });
        return;
      }
      setManualFormData(prev => ({ ...prev, images: [...prev.images, file] }));
      setManualFormMessage({ type: 'success', text: 'Imagine adăugată (se încarcă la salvare).' });
    } catch {
      setManualFormMessage({ type: 'error', text: 'Nu s-a putut adăuga imaginea.' });
    }
  };

  useEffect(() => {
    if (!manualNativeAddMenuOpen) return;
    const close = (e: MouseEvent | TouchEvent) => {
      if (manualNativeAddWrapRef.current && !manualNativeAddWrapRef.current.contains(e.target as Node)) {
        setManualNativeAddMenuOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setManualNativeAddMenuOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('touchstart', close, { passive: true });
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('touchstart', close);
      document.removeEventListener('keydown', onKey);
    };
  }, [manualNativeAddMenuOpen]);

  const handleManualFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setManualFormIsSubmitting(true);
    setManualFormMessage(null);

    try {
      // Validation
      if (!manualFormData.title || !manualFormData.description || !manualFormData.category || !manualFormData.subcategory) {
        setManualFormMessage({ type: 'error', text: 'Vă rugăm să completați toate câmpurile obligatorii.' });
        setManualFormIsSubmitting(false);
        return;
      }

      if (isPieseAuto) {
        if (!String(manualFormData.brand ?? '').trim()) {
          setManualFormMessage({ type: 'error', text: 'Selectează marca mașinii (compatibilitate).' });
          setManualFormIsSubmitting(false);
          return;
        }
        if (!String(manualFormData.customFields?.tipPiesa ?? '').trim()) {
          setManualFormMessage({ type: 'error', text: 'Selectează tipul piesei.' });
          setManualFormIsSubmitting(false);
          return;
        }
      }

      // Check if price is set
      const isFreeListing = manualFormData.isFreeListing === true;
      const initialPrice = isFreeListing ? 0 : (manualFormData.currency === 'RON' ? manualFormPriceRon : manualFormPriceEur);
      if (!isFreeListing && initialPrice <= 0) {
        setManualFormMessage({ type: 'error', text: 'Prețul de pornire trebuie să fie mai mare decât 0.' });
        setManualFormIsSubmitting(false);
        return;
      }

      // Get user (getSession singur poate fi gol imediat după navigare / în WebView)
      const session = await recoverDashboardSessionIfNeeded(supabase);
      const userId = session?.user?.id;
      if (!userId) {
        setManualFormMessage({ type: 'error', text: 'Trebuie să fii autentificat pentru a salva produsul.' });
        setManualFormIsSubmitting(false);
        return;
      }

      // Upload images (URL-uri deja salvate + fișiere locale la salvare)
      const uploadedImageUrls: string[] = [];
      const imagesToProcess = manualFormData.images || [];

      /** O singură reîmprospătare sesiune înainte de batch — evită zeci de apeluri getSupabaseAccessTokenRobust (presign+proxy pe fiecare poză). */
      await getSupabaseAccessTokenRobust(supabase);

      for (const image of imagesToProcess) {
        if (typeof image === 'string') {
          const u = image.trim();
          if (u) uploadedImageUrls.push(u);
          continue;
        }
        if (typeof Blob !== 'undefined' && image instanceof Blob) {
          const blob: Blob = image;
          const file =
            blob instanceof File
              ? blob
              : new File([blob], `image-${Date.now()}.jpg`, {
                  type: blob.type || 'image/jpeg',
                });
          const uploadResult = await uploadImageFile(file, { fetchImpl: dashboardApiFetch });
          if (!uploadResult.success || !uploadResult.url) {
            throw new Error(
              !uploadResult.success ? uploadResult.error : 'Eroare la încărcarea unei imagini.'
            );
          }
          uploadedImageUrls.push(uploadResult.url);
          continue;
        }
        throw new Error(
          'O intrare din galerie nu este o imagine validă. Șterge pozele și adaugă din nou fișiere JPG, PNG sau WebP.'
        );
      }

      // Generate slug
      const baseSlug = slugify(manualFormData.title).slice(0, 60);
      let uniqueSlug = baseSlug || `produs-${Date.now().toString(36)}`;
      
      // Check slug uniqueness
      for (let attempt = 0; attempt < 5; attempt++) {
        const { data: existing } = await supabase
          .from('products')
          .select('id')
          .eq('slug', uniqueSlug)
          .limit(1);
        
        if (!existing || existing.length === 0) {
          break;
        }
        uniqueSlug = `${baseSlug}-${Math.random().toString(36).slice(2, 6)}`;
      }

      const route = 'live_bid';
      const finalUrl = `/${route}/${uniqueSlug}`;

      // Get effective exchange rate
      let effectiveRate = getManualFormEffectiveRate();
      if (!isFreeListing && (!effectiveRate || effectiveRate <= 0)) {
        const fetchedRate = await fetchManualFormExchangeRate();
        effectiveRate = fetchedRate ?? effectiveRate ?? null;
      }

      if (!isFreeListing && (!effectiveRate || effectiveRate <= 0)) {
        setManualFormMessage({ 
          type: 'error', 
          text: 'Nu am putut obține cursul EUR/RON. Te rugăm să actualizezi cursul și să încerci din nou.' 
        });
        setManualFormIsSubmitting(false);
        return;
      }

      // Prepare product data
      const normalizedStartingPrice = isFreeListing ? 0 : roundTo(manualFormData.currency === 'RON' ? manualFormPriceRon : manualFormPriceEur);
      const normalizedRon = isFreeListing
        ? 0
        : manualFormData.currency === 'RON'
          ? normalizedStartingPrice
          : roundTo(normalizedStartingPrice * (effectiveRate ?? 1));
      const normalizedEur = isFreeListing
        ? 0
        : manualFormData.currency === 'RON'
          ? roundTo(normalizedStartingPrice / (effectiveRate ?? 1))
          : normalizedStartingPrice;
      const normalizedRateUpdatedAt = manualFormLastRateUpdate?.toISOString() ?? new Date().toISOString();

      // Auto-enhance: rescrie titlul, descrierea și generează SEO
      let finalTitle = manualFormData.title.trim().slice(0, MANUAL_PRODUCT_TITLE_MAX_LENGTH);
      let finalDescription = manualFormData.description.trim();
      let finalSEO = { ...manualFormSEO };

      if (manualFormAutoEnhance) {
        setManualFormIsEnhancing(true);
        setManualFormMessage({ type: 'success', text: 'Se procesează îmbunătățirile...' });

        try {
          const specificatii = Object.entries(manualFormData.customFields || {})
            .map(([key, value]) => `${key}: ${value}`)
            .join(', ');

          const response = await dashboardApiFetch('/api/ai-product-enhancer', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              titlu: finalTitle,
              descriere: finalDescription,
              specificatii: specificatii || undefined,
            }),
          });

          if (response.ok) {
            const result = await response.json();
            if (result.success && result.data) {
              finalTitle = (manualFormRewriteTitle ? String(result.data.newTitle ?? '') : finalTitle)
                .trim()
                .slice(0, MANUAL_PRODUCT_TITLE_MAX_LENGTH);
              finalDescription = manualFormRewriteDescription ? result.data.newDescription : finalDescription;
              
              finalSEO = {
                title: result.data.seoTitle || finalSEO.title,
                description: result.data.seoDescription || finalSEO.description,
                keywords: result.data.seoKeywords ? result.data.seoKeywords.split(',').map((k: string) => k.trim()) : finalSEO.keywords
              };
            }
          }
        } catch (error) {
          console.error('Error auto-enhancing on save:', error);
        } finally {
          setManualFormIsEnhancing(false);
        }
      } else {
        // Generate SEO automatically even if autoEnhance is disabled
        // Only generate SEO if title and description exist and SEO fields are empty
        if (finalTitle && finalDescription && (!finalSEO.title || !finalSEO.description)) {
          try {
            const specificatii = Object.entries(manualFormData.customFields || {})
              .map(([key, value]) => `${key}: ${value}`)
              .join(', ');

            const response = await dashboardApiFetch('/api/seo', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                titlu: finalTitle,
                descriere: finalDescription,
                specificatii: specificatii || undefined,
              }),
            });

            if (response.ok) {
              const result = await response.json();
              if (result.success && result.data) {
                finalSEO = {
                  title: finalSEO.title || result.data.seoTitle,
                  description: finalSEO.description || result.data.seoDescription,
                  keywords: finalSEO.keywords.length ? finalSEO.keywords : result.data.seoKeywords.split(',').map((k: string) => k.trim()),
                };
              }
            }
          } catch (error) {
            console.error('Error auto-generating SEO on save:', error);
            // Continue with save even if SEO generation fails
          }
        }
      }

      // Curățare customFields: elimină undefined/NaN pentru JSONB
      const cleanCustomFields: Record<string, unknown> = {};
      const rawCustom = {
        ...manualFormData.customFields,
        exchange_rate: effectiveRate ?? manualFormExchangeRate ?? 1,
        exchange_rate_updated_at: normalizedRateUpdatedAt,
        has_no_expiration: true,
        is_free_listing: isFreeListing,
        isFreeListing,
        is_urgent: manualFormData.isUrgent === true,
        isUrgent: manualFormData.isUrgent === true,
        buy_now_enabled: isFreeListing ? false : (manualFormData.buyNowEnabled || false),
        ...(!isFreeListing && manualFormData.buyNowPriceRON != null && Number.isFinite(manualFormData.buyNowPriceRON) && { buy_now_price_ron: manualFormData.buyNowPriceRON }),
        ...(!isFreeListing && manualFormData.buyNowPriceEUR != null && Number.isFinite(manualFormData.buyNowPriceEUR) && { buy_now_price_eur: manualFormData.buyNowPriceEUR }),
        ...(manualFormData.village && { village: manualFormData.village }),
        is_fixed_price: false,
        ...(manualFormData.model && { model: manualFormData.model, model_label: manualFormData.model }),
        ...(manualFormData.capacitateCilindrica && { capacitate_cilindrica: manualFormData.capacitateCilindrica }),
        ...(manualFormData.ram && { ram: manualFormData.ram }),
        ...(manualFormData.capacitateStocare && { capacitate_stocare: manualFormData.capacitateStocare }),
        ...(manualFormData.garantie && { garantie: manualFormData.garantie }),
      };
      for (const [k, v] of Object.entries(rawCustom)) {
        if (v !== undefined && (typeof v !== 'number' || !Number.isNaN(v)))
          cleanCustomFields[k] = v;
      }

      const isEdit = !!editingProductId;
      const finalSlug = isEdit && editingProductRow?.slug ? editingProductRow.slug : uniqueSlug;
      const finalUrlToUse = isEdit && editingProductRow?.url ? editingProductRow.url : finalUrl;

      const categoryForSave = isPieseAuto ? PIESE_AUTO_CATEGORY_SLUG : manualFormData.category;
      const subcategoryForSave = isPieseAuto ? PIESE_AUTO_SUBCATEGORY_SLUG : manualFormData.subcategory;
      const attrsForManualSave = getAttributesForSubcategory(subcategoryForSave);
      const tipPiesaForLevel3 = String(manualFormData.customFields?.tipPiesa ?? '').trim();
      const categoryLevel3ForSave = isPieseAuto
        ? tipPiesaForLevel3 || (manualFormData.categoryLevel3?.trim() || null)
        : manualFormData.categoryLevel3 || null;
      const approximateCoordinates =
        manualFormData.coordinates ??
        await resolveApproximateCoordinatesForListing({
          county: manualFormData.county,
          city: manualFormData.city,
          village: manualFormData.village,
        });

      // Build payload
      const payload: Record<string, any> = {
        title: finalTitle,
        description: finalDescription,
        category: categoryForSave,
        subcategory: subcategoryForSave,
        category_level_3: categoryLevel3ForSave,
        size: manualFormData.size || null,
        brand: manualFormData.brand || null,
        color: manualFormData.color || null,
        condition: attrsForManualSave.condition
          ? (manualFormData.condition === 'Second hand' ? 'Second hand' : 'Nou')
          : null,
        sku: manualFormData.sku || (isEdit ? (editingProductRow?.sku ?? '') : generateSku(subcategoryForSave, products.map(p => p.sku).filter(Boolean))),
        starting_price: roundTo(normalizedStartingPrice),
        starting_price_ron: normalizedRon,
        starting_price_eur: normalizedEur,
        currency: manualFormData.currency,
        product_type: 'live-bid',
        status: 'active',
        county: manualFormData.county || null,
        city: manualFormData.city || null,
        address: manualFormData.address || null,
        coordinates: approximateCoordinates ?? null,
        images: Array.isArray(uploadedImageUrls) ? uploadedImageUrls : [],
        custom_fields: cleanCustomFields,
        seo: finalSEO ?? { title: '', description: '', keywords: [] },
        documents: [],
        slug: finalSlug,
        url: finalUrlToUse,
        ...(isEdit ? {} : { user_id: userId }),
      };

      if (isEdit) {
        const { data: updatedData, error: updateError } = await supabase
          .from('products')
          .update(payload)
          .eq('id', editingProductId)
          .eq('user_id', userId)
          .select();

        if (updateError) {
          const errMsg = (updateError as any)?.message || (updateError as any)?.details || (updateError as any)?.hint || 'Eroare la salvarea modificărilor.';
          console.error('Supabase update error:', { message: (updateError as any)?.message, details: (updateError as any)?.details });
          throw new Error(errMsg);
        }
        if (!updatedData || updatedData.length === 0) {
          throw new Error('Nu s-au putut salva modificările.');
        }
        const { trackGoogleConversion } = await import("@/lib/analytics/googleAds");
        trackGoogleConversion("listing_published", { dedupeKey: editingProductId });
        setManualFormMessage({ type: 'success', text: 'Modificările au fost salvate!' });
      } else {
        payload.user_id = userId;
        const { data: insertedData, error: insertError } = await supabase
          .from('products')
          .insert(payload)
          .select();

        if (insertError) {
          const errMsg = (insertError as { message?: string; details?: string; hint?: string; code?: string }).message
            || (insertError as { message?: string; details?: string; hint?: string; code?: string }).details
            || (insertError as { message?: string; details?: string; hint?: string; code?: string }).hint
            || (typeof (insertError as any)?.code === 'string' ? `Eroare Supabase [${(insertError as any).code}]` : null)
            || 'Eroare la salvarea produsului.';
          console.error('Supabase insert error:', {
            message: (insertError as any)?.message,
            details: (insertError as any)?.details,
            hint: (insertError as any)?.hint,
            code: (insertError as any)?.code,
          });
          throw new Error(errMsg);
        }

        if (!insertedData || insertedData.length === 0) {
          throw new Error('Produsul nu a fost creat. Te rog încearcă din nou.');
        }
        const insertedId = (insertedData as { id?: string }[])[0]?.id;
        const { trackGoogleConversion } = await import("@/lib/analytics/googleAds");
        trackGoogleConversion("listing_published", { dedupeKey: insertedId ?? String(Date.now()) });
        setManualFormMessage({ type: 'success', text: 'Produsul a fost adăugat cu succes!' });
      }

      setEditingProductId(null);
      setEditingProductRow(null);
      resetManualForm();
      setManualFormSkuEditable(false);

      await loadProducts();

      setTimeout(() => {
        setShowManualAddModal(false);
        setManualFormMessage(null);
      }, 2000);

    } catch (error: any) {
      const errText = error?.message || error?.details || error?.hint || (error?.code ? `Eroare [${error.code}]` : '') || 'Eroare la salvarea produsului. Te rog încearcă din nou.';
      console.error('Error submitting form:', error?.message ?? error?.details ?? error?.hint ?? error);
      setManualFormMessage({ 
        type: 'error', 
        text: errText.trim() || 'Eroare la salvarea produsului. Te rog încearcă din nou.' 
      });
    } finally {
      setManualFormIsSubmitting(false);
    }
  };

  // Load user city from profile when Quick Add modal opens
  useEffect(() => {
    if (!showQuickAddModal) return;

    // Nu mai încărcăm orașul - folosim adresa din anunț
  }, [showQuickAddModal]);

  // Typing animation for help modal
  useEffect(() => {
    if (!showHelpModal) {
      setTypingText('');
      setHelpStep(0);
      setIsTyping(false);
      return;
    }

    const helpTexts = [
      {
        field: 'images',
        text: 'Imagini: pe desktop poți da click sau trage imaginile aici. Pe telefon ai două opțiuni — „Fă o poză” (deschide camera) sau „Încarcă din galerie”. Încarcă imagini clare pentru un anunț mai bun.'
      },
      {
        field: 'description',
        text: 'Descriere cu AI: apasă pe microfon și spune ce vinzi (ex. „Vând iPhone 17”). Categoria se detectează automat și apar câmpurile de completat (marca, model, capacitate etc.). Menționează aceste detalii în text sau vocal; când progresul e complet, descrierea se reformulează scurt. Comenzi vocale: „sterge [text]”, „gata”, „continua”, „publish”. Prețul menționat în descriere (ex. „1800 lei”) este extras automat.'
      },
      {
        field: 'city',
        text: 'Alege județul și orașul unde se află produsul. Predarea se face personal sau prin curier, conform anunțului.'
      },
      {
        field: 'price',
        text: 'Alege moneda (Lei sau EUR) și introdu prețul cerut — acesta este prețul de start pentru licitație. Dacă ai scris prețul în descriere (ex. „2800 lei”), acesta poate fi deja completat automat.'
      }
    ];

    setIsTyping(true);
    const currentText = helpTexts[helpStep]?.text || '';
    let currentIndex = 0;
    setTypingText('');

    const typingInterval = setInterval(() => {
      if (currentIndex < currentText.length) {
        setTypingText(currentText.substring(0, currentIndex + 1));
        currentIndex++;
      } else {
        setIsTyping(false);
        clearInterval(typingInterval);
      }
    }, 30); // Viteza de typing

    return () => clearInterval(typingInterval);
  }, [showHelpModal, helpStep]);

  // ========== QUICK ADD FUNCTIONS ==========
  // Cere permisiunea pentru microfon (necesar pe iOS/Safari). Apelată la deschiderea modalului ȘI la tap pe microfon.
  const requestMicPermission = useCallback((): Promise<boolean> => {
    if (typeof window === 'undefined') return Promise.resolve(true);
    if (!navigator.mediaDevices?.getUserMedia) {
      showNotification('info', 'Microfon', 'Pe acest browser activează microfonul: Setări > Safari/Chrome > Microfon pentru acest site, sau folosește Chrome pe Android.');
      return Promise.resolve(false);
    }
    return navigator.mediaDevices
      .getUserMedia({ audio: true })
      .then((stream) => {
        stream.getTracks().forEach((t) => t.stop());
        return true;
      })
      .catch((err: { name?: string; code?: number }) => {
        const notAllowed = err?.name === 'NotAllowedError' || err?.name === 'PermissionDeniedError' || err?.code === 0;
        if (notAllowed) {
          showNotification('info', 'Microfon', 'Accesul la microfon a fost blocat. În bara de adresă apasă pe iconița lacăt/„Aa” și dă permisiune pentru Microfon, apoi reîncearcă.');
        } else {
          showNotification('error', 'Dictare', 'Nu s-a putut accesa microfonul. Încearcă Chrome sau Edge pe HTTPS.');
        }
        return false;
      });
  }, [showNotification]);

  const handleQuickAddDictation = useCallback((e?: React.MouseEvent) => {
    // Nu folosim preventDefault/stopPropagation ca pe iOS browserul să vadă gestul și să afișeze promptul de permisiune
    if (typeof window === 'undefined') return;
    const SpeechRecognitionAPI = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognitionAPI) {
      showNotification('info', 'Dictare', 'Dictarea vocală funcționează doar în Chrome sau Edge. Deschide pagina în acest browser.');
      return;
    }
    const isSecure = window.isSecureContext || window.location?.hostname === 'localhost' || window.location?.hostname === '127.0.0.1';
    if (!isSecure) {
      showNotification('info', 'Dictare', 'Microfonul funcționează doar pe site securizat (HTTPS) sau localhost.');
      return;
    }
    if (quickAddIsDictating) {
      const rec = quickAddRecognitionRef.current;
      if (rec) {
        try { rec.stop(); } catch (_) {}
        quickAddRecognitionRef.current = null;
      }
      setQuickAddIsDictating(false);
      setQuickAddInterimText('');
      return;
    }
    
    // Pe mobil (iOS/Safari) browserul afișează „Permite microfon” doar când cerem explicit cu getUserMedia
    requestMicPermission().then((allowed) => {
      if (!allowed) return;
      if (!tutorialDismissed) {
        setShowDictationTutorial(true);
        startDictationForTutorialRef.current?.();
        return;
      }
      startDictationRef.current?.();
    });
  }, [quickAddIsDictating, showNotification, requestMicPermission, tutorialDismissed]);

  const startDictationForTutorial = useCallback(() => {
    if (typeof window === 'undefined') return;
    const SpeechRecognitionAPI = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognitionAPI) return;
    
    const recognition = new SpeechRecognitionAPI() as SpeechRecognition & { onstart?: () => void; maxAlternatives?: number };
    recognition.lang = 'ro';
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    recognition.onresult = (e: SpeechRecognitionEvent) => {
      let finalTranscript = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const transcript = e.results[i][0]?.transcript?.trim() || '';
        if (e.results[i].isFinal) {
          finalTranscript += transcript + ' ';
        }
      }
      if (finalTranscript) {
        const processedText = finalTranscript.trim().toLowerCase();
        // Verifică dacă este o comandă pentru a închide tutorialul
        const closeTutorialMatch = processedText.match(/(nu mai afișa tutorial|nu mai afisa tutorial|nu mai arata tutorial|nu mai arăta tutorial|inchide tutorial|închide tutorial)/i);
        if (closeTutorialMatch && showDictationTutorial) {
          setTutorialDismissed(true);
          setShowDictationTutorial(false);
          if (typeof window !== 'undefined') {
            localStorage.setItem('dictationTutorialDontShow', 'true');
          }
          // Oprește microfonul de tutorial
          if (quickAddRecognitionRef.current) {
            try { quickAddRecognitionRef.current.stop(); } catch (_) {}
            quickAddRecognitionRef.current = null;
          }
          setQuickAddIsDictating(false);
          setQuickAddInterimText('');
          // Pornește microfonul normal după închiderea tutorialului
          setTimeout(() => {
            handleQuickAddDictation();
          }, 100);
        }
      }
    };
    recognition.onerror = () => {
      // Ignoră erorile în modul tutorial
    };
    quickAddRecognitionRef.current = recognition;
    setQuickAddIsDictating(true);
    try {
      recognition.start();
    } catch (_) {}
  }, [showDictationTutorial]);
  useEffect(() => {
    startDictationForTutorialRef.current = startDictationForTutorial;
  }, [startDictationForTutorial]);

  const startDictation = useCallback((generateHandler?: () => void) => {
    if (typeof window === 'undefined') return;
    const SpeechRecognitionAPI = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognitionAPI) return;
    
    const recognition = new SpeechRecognitionAPI() as SpeechRecognition & { onstart?: () => void; maxAlternatives?: number };
    recognition.lang = 'ro';
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    recognition.onstart = () => {
      setQuickAddIsDictating(true);
      setDeleteMode(false);
      setPendingDeleteTarget(null);
      setLivePreview('');
      setDeleteTargetRanges([]);
      setShowDeleteTextModal(false);
      // Detect category from current description so suggestions show immediately (e.g. "Vând iPhone 17")
      const currentText = quickAddDescriptionRef.current?.trim() || '';
      if (currentText.length >= 3) {
        detectCategoryFromText(currentText).then((detected) => {
          if (detected && detected.requiredFields && detected.requiredFields.length > 0) {
            console.log('🎯 Setting detectedCategory on mic start:', detected);
            setDetectedCategory(detected);
            setCompletedFields(new Set());
            setExtractedFieldValues({});
            // Extract values from current text
            const extracted: Record<string, string> = {};
            detected.requiredFields.forEach((field: string) => {
              const result = extractFieldValueRef.current?.(currentText, [field]);
              if (result) {
                extracted[result.field] = result.value;
                setCompletedFields(prev => new Set([...prev, result.field]));
              }
            });
            if (Object.keys(extracted).length > 0) {
              setExtractedFieldValues(extracted);
              console.log('✅ Extracted values on mic start:', extracted);
            }
          } else {
            console.log('❌ No category detected or no requiredFields:', detected);
            setDetectedCategory(null);
          }
        }).catch((err) => {
          console.error('Error detecting category on mic start:', err);
          setDetectedCategory(null);
        });
      } else {
        setDetectedCategory(null);
      }
    };
    recognition.onresult = (e: SpeechRecognitionEvent) => {
      // A) LIVE TRANSCRIPTION PREVIEW (interim only - never appended)
      let interimTranscript = '';
      let finalTranscript = '';
      
      // Separate interim from final transcripts
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const transcript = e.results[i][0]?.transcript?.trim() || '';
        if (e.results[i].isFinal) {
          finalTranscript += transcript + ' ';
        } else {
          interimTranscript += transcript + ' ';
        }
      }
      
      // Update live preview (interim only - never appended to textarea)
      if (interimTranscript.trim()) {
        if (deleteMode) {
          setLivePreview(`Țintă de șters: ${interimTranscript.trim()}`);
        } else {
          setLivePreview(interimTranscript.trim());
        }
      } else {
        setLivePreview('');
      }
      
      // B) PROCESS FINAL TRANSCRIPTS ONLY
      // CRITICAL: Command detection MUST run before any textarea append
      if (finalTranscript.trim()) {
        const finalText = finalTranscript.trim();
        
        // Detect command (ONLY on final transcripts, BEFORE any append)
        const commandResult = detectCommand(finalText);
        
        if (commandResult.isCommand) {
          // COMMAND DETECTED - execute and RETURN (do not append)
          setLivePreview(''); // Clear preview
          
          switch (commandResult.commandType) {
            case 'directDelete':
              // Direct delete: "sterge [text]" - delete only if target is in last 5 words
              if (commandResult.commandData?.target) {
                const target = commandResult.commandData.target;
                setQuickAddDescription(prev => deleteInLastNWords(prev, target, 5));
                setLivePreview('');
                // No notification - just delete and continue
              }
              return; // DO NOT append
              
            case 'enterDeleteMode':
              // Enter delete mode: stops dictation, next text will be deleted automatically (silent)
              setDeleteMode(true);
              setPendingDeleteTarget(null);
              setDeleteTargetRanges([]);
              setShowDeleteTextModal(false);
              setLivePreview('');
              // Reset completed fields when entering delete mode
              setCompletedFields(new Set());
              // No notification - just enter delete mode
              return; // DO NOT append
              
            case 'continueDictation':
              // Continue dictation after delete: exit deleteMode and resume normal dictation (silent)
              setDeleteMode(false);
              setPendingDeleteTarget(null);
              setDeleteTargetRanges([]);
              setShowDeleteTextModal(false);
              setLivePreview('');
              // No notification - just resume dictation
              return; // DO NOT append
              
            case 'publish':
              // Check if all required fields are completed before allowing publish
              if (detectedCategory && detectedCategory.requiredFields.length > 0) {
                const allCompleted = detectedCategory.requiredFields.every(field => completedFields.has(field));
                if (!allCompleted) {
                  const remaining = detectedCategory.requiredFields.filter(f => !completedFields.has(f));
                  const fieldLabels: Record<string, string> = {
                    'marca': 'Marca', 'model': 'Model', 'capacitate': 'Capacitate', 'culoare': 'Culoare',
                    'stare': 'Stare', 'baterie': 'Sănătate baterie', 'deblocat': 'Status deblocare',
                    'iCloud': 'Status iCloud', 'accesorii': 'Accesorii incluse'
                  };
                  const remainingLabels = remaining.map(f => fieldLabels[f] || f).join(', ');
                  showNotification('info', 'Câmpuri lipsă', `Mai trebuie să menționezi: ${remainingLabels}`, true);
                  return; // DO NOT proceed with publish
                }
              }
              // All fields completed or no required fields - proceed with publish
              if (!quickAddIsGenerating && quickAddImages.length > 0 && quickAddDescription.trim()) {
                processAndEnhanceDescription(() => {
                  const generateHandler = handleQuickAddGenerateRef.current;
                  if (generateHandler) {
                    generateHandler();
                  }
                });
              }
              return; // DO NOT append
              
            case 'clearAll':
              setQuickAddDescription('');
              setLivePreview('');
              setDeleteMode(false);
              setPendingDeleteTarget(null);
              setDeleteTargetRanges([]);
              setShowDeleteTextModal(false);
              showNotification('success', 'Șters', 'Descrierea a fost ștearsă complet.', true);
              return; // DO NOT append
              
            case 'finish':
            case 'generate':
              if (!quickAddIsGenerating && quickAddImages.length > 0 && quickAddDescription.trim()) {
                processAndEnhanceDescription(() => {
                  const generateHandler = handleQuickAddGenerateRef.current;
                  if (generateHandler) {
                    generateHandler();
                  }
                });
              }
              return; // DO NOT append
              
            case 'closeTutorial':
              setTutorialDismissed(true);
              if (typeof window !== 'undefined') {
                localStorage.setItem('dictationTutorialDontShow', 'true');
              }
              return; // DO NOT append
          }
        }
        
        // C) DELETE MODE: Auto-delete target and wait for continue command
        // While deleteMode === true: DO NOT append any final transcripts to textarea, ever
        if (deleteMode) {
          // In deleteMode, any text (that is not a continue command) is treated as delete target
          // Delete it immediately and stay in deleteMode until user says "OK"/"gata"/etc.
          const target = finalText.trim();
          
          // Delete only if target is in last 5 words - no confirmation, no notification
          setQuickAddDescription(prev => deleteInLastNWords(prev, target, 5));
          setPendingDeleteTarget(target);
          setLivePreview('');
          
          // CRITICAL: Always return in deleteMode - NEVER append text to textarea
          // User must say "OK"/"gata"/"continua" to exit deleteMode and resume dictation
          return;
        }
        
        // D) NORMAL DICTATION: Append to textarea (only if not a command and not in deleteMode)
        // Extract field values and mark fields as completed automatically
        if (detectedCategory && detectedCategory.requiredFields.length > 0) {
          const extracted = extractFieldValueRef.current?.(finalText, detectedCategory.requiredFields);
          if (extracted) {
            setCompletedFields(prev => new Set([...prev, extracted.field]));
            setExtractedFieldValues(prev => ({ ...prev, [extracted.field]: extracted.value }));
            console.log('✅ Extracted field:', extracted.field, '=', extracted.value);
          }
        }
        
        // Extract price if present (optional feature)
        import('@/lib/description-processor').then(({ extractPrice, removePriceFromDescription }) => {
          const { price, currency } = extractPrice(finalText);
          if (price && price > 0) {
            setQuickAddRequestedPrice(price);
            setQuickAddCurrency(currency);
            // Remove price from description
            const cleanedText = removePriceFromDescription(finalText);
            if (cleanedText.trim()) {
              setQuickAddDescription(prev => (prev ? prev + ' ' : '') + cleanedText.trim());
            }
          } else {
            // Normal append
            setQuickAddDescription(prev => (prev ? prev + ' ' : '') + finalText.trim());
          }
        }).catch(() => {
          // Fallback: just append if import fails
          setQuickAddDescription(prev => (prev ? prev + ' ' : '') + finalText.trim());
        });
        
        // Clear interim/preview – textul e deja în câmpul de descriere
        setLivePreview('');
        setQuickAddInterimText('');
      }
      
      // E) Category detection cu debouncing: odată ce categoria e setată, NU o mai schimbăm (flow stabil)
      // Folosim REF pentru a evita closure-uri vechi care permit suprascrierea categoriei
      if (!deleteMode) {
        const finalPart = (finalTranscript || '').trim();
        const interimPart = (interimTranscript || livePreview || '').trim();
        const fullText = [quickAddDescription, finalPart, interimPart].filter(Boolean).join(' ').trim();
        
        // Verificare REF: dacă avem deja categorie, doar extragem valori – NU mai detectăm niciodată
        const currentCategory = detectedCategoryRef.current;
        const hasCategory = currentCategory && currentCategory.requiredFields && currentCategory.requiredFields.length > 0;
        
        if (hasCategory) {
          // Doar extragem valori noi; categoria rămâne neschimbată
          if (fullText.length >= 3) {
            const extracted: Record<string, string> = {};
            const currentValues = extractedFieldValuesRef.current;
            currentCategory.requiredFields.forEach((field: string) => {
              const result = extractFieldValueRef.current?.(fullText, [field]);
              if (result && !currentValues[field]) {
                extracted[result.field] = result.value;
                setCompletedFields(prev => new Set([...prev, result.field]));
              }
            });
            if (Object.keys(extracted).length > 0) {
              setExtractedFieldValues(prev => ({ ...prev, ...extracted }));
              console.log('✅ Extracted new values from text:', extracted);
            }
          }
          return;
        }
        
        // Nu există categorie încă – rulează detectarea o singură dată (debounce)
        if (fullText.length >= 3) {
          if (categoryDetectionTimeoutRef.current) {
            clearTimeout(categoryDetectionTimeoutRef.current);
            categoryDetectionTimeoutRef.current = null;
          }
          
          const hasFinalText = finalPart.length > 0;
          const debounceTime = hasFinalText ? 1200 : 0;
          
          categoryDetectionTimeoutRef.current = setTimeout(() => {
            // Înainte de a seta: dacă între timp s-a setat deja o categorie, nu o suprascrie
            if (detectedCategoryRef.current) {
              return;
            }
            detectCategoryFromText(fullText).then((detected) => {
              // Dacă categoria a fost deja setată între timp (alt timeout/onstart), nu o suprascrie
              if (detectedCategoryRef.current) {
                return;
              }
              if (detected && detected.requiredFields && detected.requiredFields.length > 0) {
                console.log('🎯 Setting detectedCategory during dictation:', detected);
                setDetectedCategory(detected);
                const extracted: Record<string, string> = {};
                detected.requiredFields.forEach((field: string) => {
                  const result = extractFieldValueRef.current?.(fullText, [field]);
                  if (result) {
                    extracted[result.field] = result.value;
                    setCompletedFields(prev => new Set([...prev, result.field]));
                  }
                });
                if (Object.keys(extracted).length > 0) {
                  setExtractedFieldValues(prev => ({ ...prev, ...extracted }));
                  console.log('✅ Extracted values from full text:', extracted);
                }
              }
            }).catch((err) => {
              console.error('Category detection error:', err);
            });
          }, debounceTime);
        }
      } else if (deleteMode) {
        // Clear detected category when entering deleteMode
        if (detectedCategory) {
          setDetectedCategory(null);
        }
      }
    };
    recognition.onend = () => {
      if (quickAddRecognitionRef.current === recognition) {
        setQuickAddIsDictating(false);
        setQuickAddInterimText(''); // Clear live preview
        // Don't reset deleteMode on end - user might want to continue
        quickAddRecognitionRef.current = null;
      }
    };
    recognition.onerror = (ev: Event) => {
      const err = ev as { error?: string };
      const code = err?.error || '';
      setQuickAddIsDictating(false);
      setQuickAddInterimText('');
      setDetectedCategory(null); // Resetează categoria la eroare
      quickAddRecognitionRef.current = null;
      if (code === 'not-allowed' || code === 'service-not-allowed') {
        showNotification('info', 'Microfon', 'Accesul la microfon a fost blocat. Dă permisiunea când browserul o cere sau verifică în setări (icon lângă adresă).');
      } else if (code === 'no-speech') {
        showNotification('info', 'Dictare', 'Nu s-a detectat vorbire. Apasă din nou pe microfon și vorbește clar.', true);
      } else if (code !== 'aborted') {
        showNotification('error', 'Dictare', 'Eroare: ' + (code || 'necunoscută') + '. Folosește Chrome sau Edge pe HTTPS sau localhost.');
      }
    };
    quickAddRecognitionRef.current = recognition;
    try {
      recognition.start();
    } catch (startErr) {
      setQuickAddIsDictating(false);
      setDetectedCategory(null); // Resetează categoria la eroare
      quickAddRecognitionRef.current = null;
      showNotification('error', 'Dictare', 'Nu s-a putut porni microfonul. Încearcă Chrome sau Edge pe HTTPS sau localhost.');
    }
  }, [showNotification, detectCategoryFromText]);
  useEffect(() => {
    startDictationRef.current = startDictation;
  }, [startDictation]);

  useEffect(() => {
    if (!showQuickAddModal && quickAddRecognitionRef.current) {
      quickAddRecognitionRef.current.stop();
      quickAddRecognitionRef.current = null;
      setQuickAddIsDictating(false);
      setDetectedCategory(null); // Resetează categoria când se închide modalul
    }
  }, [showQuickAddModal]);

  // Detect native app (Capacitor iOS/Android) for safe camera flow; avoids capture input crash on iOS.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const cap = (window as unknown as { Capacitor?: { getPlatform?: () => string } }).Capacitor;
    const p = cap?.getPlatform?.();
    setIsNativeApp(p === 'ios' || p === 'android');
  }, []);

  // Preîncarcă templates la deschiderea modalului ca detectarea categoriei să fie instantanee
  useEffect(() => {
    if (showQuickAddModal) {
      import('./description-templates.json').catch(() => {});
    }
  }, [showQuickAddModal]);

  // Detectează categoria când textul se schimbă în câmp (chiar dacă microfonul nu este activ)
  // IMPORTANT: Odată ce categoria este detectată, nu mai rulează detectarea pentru a evita schimbări constante
  useEffect(() => {
    // Dacă există deja o categorie detectată, nu mai rulează detectarea (doar extragerea valorilor)
    const currentCategory = detectedCategoryRef.current;
    const hasCategory = currentCategory && currentCategory.requiredFields && currentCategory.requiredFields.length > 0;
    
    if (hasCategory) {
      if (showQuickAddModal && quickAddDescription.trim().length >= 3 && !quickAddIsDictating) {
        const text = quickAddDescription.trim();
        const extractFn = extractFieldValueRef.current;
        if (!extractFn) return;
        
        // Doar extragem valori noi din text, fără să redetectăm categoria
        const extracted: Record<string, string> = {};
        const currentValues = extractedFieldValuesRef.current;
        currentCategory.requiredFields.forEach((field: string) => {
          const result = extractFn(text, [field]);
          if (result && !currentValues[field]) {
            extracted[field] = result.value;
            setCompletedFields((prev: Set<string>) => new Set([...prev, field]));
          }
        });
        if (Object.keys(extracted).length > 0) {
          setExtractedFieldValues(prev => ({ ...prev, ...extracted }));
        }
      }
      return; // Nu mai rulează detectarea categoriei
    }
    
    // Dacă nu există categorie detectată, rulează detectarea o singură dată
    if (showQuickAddModal && quickAddDescription.trim().length >= 3 && !quickAddIsDictating) {
      const text = quickAddDescription.trim();
      const detectFn = detectCategoryFromTextRef.current;
      const extractFn = extractFieldValueRef.current;
      if (!detectFn || !extractFn) return;
      
      detectFn(text).then((detected) => {
        // Nu suprascrie categoria dacă a fost deja setată (flow stabil)
        if (detectedCategoryRef.current) return;
        if (detected && detected.requiredFields && detected.requiredFields.length > 0) {
          setDetectedCategory((prevCategory) => {
            const isNewCategory = !prevCategory || prevCategory.subcategory !== detected.subcategory;
            if (isNewCategory) {
              setCompletedFields(new Set());
              setExtractedFieldValues({});
            }
            return detected;
          });
          const extracted: Record<string, string> = {};
          detected.requiredFields.forEach((field: string) => {
            const result = extractFn(text, [field]);
            if (result) {
              extracted[result.field] = result.value;
              setCompletedFields((prev: Set<string>) => new Set([...prev, result.field]));
            }
          });
          if (Object.keys(extracted).length > 0) {
            setExtractedFieldValues(prev => ({ ...prev, ...extracted }));
          }
        }
        // Nu apelăm setDetectedCategory(null) – păstrăm categoria existentă
      }).catch(() => {});
    }
  }, [showQuickAddModal, quickAddDescription, quickAddIsDictating]);

  const handleQuickAddImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    setQuickAddImages(files);
    
    // Create previews
    const previewPromises = files.map(file => {
      return new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          resolve(reader.result as string);
        };
        reader.readAsDataURL(file);
      });
    });

    Promise.all(previewPromises).then(previews => {
      setQuickAddImagePreviews(previews);
    });
  };

  /** Native app: camera via Capacitor; dacă plugin-ul lipsește → input HTML cu capture (WebView). */
  const handleNativeTakePhoto = async () => {
    const result = await getSafePhoto({ preferredSource: 'camera' });
    if (result.ok) {
      try {
        const file = await webPathToFile(result.webPath);
        const preview = await new Promise<string>((resolve, reject) => {
          const r = new FileReader();
          r.onloadend = () => resolve(r.result as string);
          r.onerror = reject;
          r.readAsDataURL(file);
        });
        setQuickAddImages((prev) => [...prev, file]);
        setQuickAddImagePreviews((prev) => [...prev, preview]);
      } catch {
        setManualFormMessage({ type: 'error', text: 'Nu s-a putut încărca imaginea.' });
      }
      return;
    }
    if (result.reason === 'cancelled') return;
    if (result.reason === 'plugin-missing' || result.reason === 'unavailable') {
      quickAddCameraInputRef.current?.click();
      return;
    }
    setManualFormMessage({ type: 'error', text: result.message });
  };

  /** Native app: galerie via Capacitor; fallback la input file fără capture. */
  const handleNativePickFromGallery = async () => {
    const result = await getSafePhoto({ preferredSource: 'photos' });
    if (result.ok) {
      try {
        const file = await webPathToFile(result.webPath);
        const preview = await new Promise<string>((resolve, reject) => {
          const r = new FileReader();
          r.onloadend = () => resolve(r.result as string);
          r.onerror = reject;
          r.readAsDataURL(file);
        });
        setQuickAddImages((prev) => [...prev, file]);
        setQuickAddImagePreviews((prev) => [...prev, preview]);
      } catch {
        setManualFormMessage({ type: 'error', text: 'Nu s-a putut încărca imaginea.' });
      }
      return;
    }
    if (result.reason === 'cancelled') return;
    if (result.reason === 'plugin-missing' || result.reason === 'unavailable') {
      quickAddGalleryInputRef.current?.click();
      return;
    }
    setManualFormMessage({ type: 'error', text: result.message });
  };

  const handleQuickAddGenerate = async () => {
    if (quickAddImages.length === 0 || !quickAddDescription.trim()) {
      setManualFormMessage({ type: 'error', text: 'Te rog adaugă cel puțin o imagine și o descriere' });
      return;
    }

    setQuickAddIsGenerating(true);
    setGenerationProgress(0);
    setManualFormMessage(null);

    // Simulate progress updates (will be cleared when API call completes)
    let progressInterval: NodeJS.Timeout | null = setInterval(() => {
      setGenerationProgress(prev => {
        if (prev >= 90) {
          if (progressInterval) {
            clearInterval(progressInterval);
            progressInterval = null;
          }
          return prev;
        }
        // Increment progress gradually, slower as it approaches 90%
        const increment = prev < 30 ? 5 : prev < 60 ? 3 : 2;
        return Math.min(prev + increment, 90);
      });
    }, 300);

    try {
      // Step 1: Convert images to base64 (10-30%)
      setGenerationProgress(10);
      const imagePromises = quickAddImages.map((file, index) => {
        return new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => {
            const base64 = (reader.result as string).split(',')[1];
            // Update progress as each image is processed
            setGenerationProgress(10 + (index + 1) * (20 / quickAddImages.length));
            resolve(base64);
          };
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
      });

      const imageBase64Array = await Promise.all(imagePromises);
      setGenerationProgress(35);

      // Step 2: Analyzing images and description (35-60%)
      setGenerationProgress(40);
      await new Promise(resolve => setTimeout(resolve, 500)); // Small delay for UX
      setGenerationProgress(50);

      // Step 3: Generating product details (60-85%)
      setGenerationProgress(60);
      
      // Call API to generate product
      const response = await dashboardApiFetch('/api/ai-quick-product', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          images: imageBase64Array,
          description: quickAddDescription,
        }),
      });

      setGenerationProgress(85);

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Eroare la generarea produsului');
      }

      const result = await response.json();
      
      // Step 4: Finalizing (85-100%)
      setGenerationProgress(95);
      
      if (result.success && result.product) {
        setGenerationProgress(100);
        await new Promise(resolve => setTimeout(resolve, 300)); // Small delay to show 100%
        
        setQuickAddGeneratedProduct(result.product);
        // Set editable fields with generated values
        // IMPORTANT: Keep user-entered prices - don't override them with AI-generated prices
        setEditableTitle(String(result.product.title || '').slice(0, MANUAL_PRODUCT_TITLE_MAX_LENGTH));
        setEditableDescription(result.product.description || '');
        
        // Match AI-generated category and subcategory with available options
        const matchedCategory = matchCategory(result.product.category || '');
        setEditableCategory(matchedCategory);
        
        // Only set subcategory if category is matched and subcategory exists for that category
        if (matchedCategory) {
          const matchedSubcategory = matchSubcategory(result.product.subcategory || '', matchedCategory);
          setEditableSubcategory(matchedSubcategory);
          setEditableLevel3('');
          setEditableSize('');
          setEditableBrand('');
          setEditableColor('');
          setEditableCondition('Nou');
        } else {
          setEditableSubcategory('');
          setEditableLevel3('');
          setEditableSize('');
          setEditableBrand('');
          setEditableColor('');
          setEditableCondition('Nou');
        }
        // Only set editablePrice if user hasn't entered a requested price
        // Priority: quickAddRequestedPrice > quickAddMinAcceptedBid > AI generated price
        if (quickAddRequestedPrice > 0) {
          setEditablePrice(quickAddRequestedPrice);
        } else         if (quickAddMinAcceptedBid > 0) {
          setEditablePrice(quickAddMinAcceptedBid);
        } else {
          // Only use AI-generated price if user hasn't entered any price
          setEditablePrice(result.product.startingPrice || 0);
        }
        if (isPieseAuto) {
          setEditableCategory(PIESE_AUTO_FORM_CATEGORY_DISPLAY);
          setEditableSubcategory(PIESE_AUTO_FORM_SUBCATEGORY_DISPLAY);
          const genTip = String(
            (result.product as { customFields?: Record<string, unknown>; custom_fields?: Record<string, unknown> })
              ?.customFields?.tipPiesa ??
              (result.product as { custom_fields?: Record<string, unknown> })?.custom_fields?.tipPiesa ??
              ''
          ).trim();
          if (genTip) setEditableLevel3(genTip);
        }
        setManualFormMessage({ type: 'success', text: 'Produs generat cu succes! Poți salva sau edita informațiile.' });
      } else {
        throw new Error('Nu s-a putut genera produsul');
      }
    } catch (error: any) {
      console.error('Error generating quick product:', error);
      setManualFormMessage({ type: 'error', text: error.message || 'Eroare la generarea produsului' });
    } finally {
      if (progressInterval) {
        clearInterval(progressInterval);
      }
      setQuickAddIsGenerating(false);
      // Keep progress at 100% for a moment before resetting
      setTimeout(() => {
        setGenerationProgress(0);
      }, 500);
    }
  };

  // Salvează funcția în ref pentru a fi accesibilă din callback-ul de dictare
  useEffect(() => {
    handleQuickAddGenerateRef.current = handleQuickAddGenerate;
  }, []);

  const handleQuickAddSave = async () => {
    if (!quickAddGeneratedProduct) return;

    setQuickAddIsSaving(true);
    setManualFormMessage(null);

    try {
      const session = await recoverDashboardSessionIfNeeded(supabase);
      if (!session?.user) {
        throw new Error('Trebuie să fii autentificat');
      }

      const userId = session.user.id;

      await getSupabaseAccessTokenRobust(supabase);

      // Upload images
      const uploadedImageUrls: string[] = [];
      for (const file of quickAddImages) {
        const uploadResult = await uploadImageFile(file, { fetchImpl: dashboardApiFetch });
        if (!uploadResult.success || !uploadResult.url) {
          throw new Error(
            !uploadResult.success ? uploadResult.error : 'Eroare la încărcarea unei imagini (quick add).'
          );
        }
        uploadedImageUrls.push(uploadResult.url);
      }

      // Use editable values if they exist, otherwise fallback to generated values
      const finalTitle = String(editableTitle || quickAddGeneratedProduct.title || '')
        .trim()
        .slice(0, MANUAL_PRODUCT_TITLE_MAX_LENGTH);
      const finalDescription = editableDescription || quickAddGeneratedProduct.description;
      const finalCategory = isPieseAuto
        ? PIESE_AUTO_CATEGORY_SLUG
        : editableCategory || quickAddGeneratedProduct.category;
      const finalSubcategory = isPieseAuto
        ? PIESE_AUTO_SUBCATEGORY_SLUG
        : editableSubcategory || quickAddGeneratedProduct.subcategory;
      const tipPiesaQuick = String(
        (quickAddGeneratedProduct as { customFields?: Record<string, unknown>; custom_fields?: Record<string, unknown> })
          ?.customFields?.tipPiesa ??
          (quickAddGeneratedProduct as { custom_fields?: Record<string, unknown> })?.custom_fields?.tipPiesa ??
          ''
      ).trim();
      const categoryLevel3Quick = isPieseAuto
        ? (String(editableLevel3 ?? '').trim() || tipPiesaQuick || null)
        : editableLevel3 || null;
      
      // Calculate starting price: 
      // Priority: editablePrice > quickAddRequestedPrice > quickAddMinAcceptedBid > generated price > 100
      // IMPORTANT: starting_price should use the requested price if available, otherwise min accepted bid, otherwise generated price
      let finalPrice = 100;
      if (editablePrice > 0) {
        finalPrice = editablePrice;
      } else if (quickAddRequestedPrice > 0) {
        finalPrice = quickAddRequestedPrice;
      } else if (quickAddMinAcceptedBid > 0) {
        finalPrice = quickAddMinAcceptedBid;
      } else if (quickAddGeneratedProduct.startingPrice) {
        finalPrice = quickAddGeneratedProduct.startingPrice;
      }

      // Generate slug from editable title
      const baseSlug = slugify(finalTitle).slice(0, 60);
      let uniqueSlug = baseSlug || `produs-${Date.now().toString(36)}`;
      
      // Check slug uniqueness
      for (let attempt = 0; attempt < 5; attempt++) {
        const { data: existing } = await supabase
          .from('products')
          .select('id')
          .eq('slug', uniqueSlug)
          .limit(1);
        
        if (!existing || existing.length === 0) {
          break;
        }
        uniqueSlug = `${baseSlug}-${Math.random().toString(36).slice(2, 6)}`;
      }

      const route = 'live_bid';
      const finalUrl = `/${route}/${uniqueSlug}`;

      // Get exchange rate for price conversion
      let exchangeRate = manualFormExchangeRate;
      if (!exchangeRate || exchangeRate <= 0) {
        try {
          const rateResponse = await dashboardApiFetch('/api/exchange-rate');
          if (rateResponse.ok) {
            const rateData = await rateResponse.json();
            exchangeRate = rateData.rate || null;
          }
        } catch (error) {
          console.error('Error fetching exchange rate:', error);
        }
      }

      // Use selected currency, fallback to AI-generated or Lei
      const currency = quickAddCurrency || quickAddGeneratedProduct.currency || 'RON';
      const effectiveRate = exchangeRate || 5.0; // Fallback rate

      // Calculate prices in both currencies based on selected currency
      const startingPriceRON = currency === 'RON' 
        ? roundTo(finalPrice)
        : roundTo(finalPrice * effectiveRate);
      const startingPriceEUR = currency === 'EUR'
        ? roundTo(finalPrice)
        : roundTo(finalPrice / effectiveRate);

      // Generate SKU
      const existingSkus = products.map(p => p.sku).filter(Boolean);
      const generatedSku = generateSku(finalSubcategory || 'Alte', existingSkus);
      const attrsForQuickAddSave = finalSubcategory ? getAttributesForSubcategory(finalSubcategory) : null;

      // Create product
      const productData: Record<string, any> = {
        title: finalTitle,
        description: finalDescription,
        category: finalCategory,
        subcategory: finalSubcategory,
        category_level_3: categoryLevel3Quick,
        size: editableSize || null,
        brand: editableBrand || null,
        color: editableColor || null,
        condition: attrsForQuickAddSave?.condition
          ? (editableCondition === 'Second hand' ? 'Second hand' : 'Nou')
          : null,
        sku: generatedSku,
        starting_price: roundTo(finalPrice),
        starting_price_ron: startingPriceRON,
        starting_price_eur: startingPriceEUR,
        currency: currency,
        product_type: 'live-bid',
        status: 'active',
        address: quickAddGeneratedProduct?.address || quickAddGeneratedProduct?.customFields?.address || null,
        city: null, // Nu mai folosim câmpul city separat, folosim address
        images: Array.isArray(uploadedImageUrls) ? uploadedImageUrls : [],
        user_id: userId,
        seo: {
          title: quickAddGeneratedProduct.seoTitle || '',
          description: quickAddGeneratedProduct.seoDescription || '',
          keywords: quickAddGeneratedProduct.seoKeywords ? quickAddGeneratedProduct.seoKeywords.split(',').map((k: string) => k.trim()).filter((k: string) => k) : []
        },
        custom_fields: {
          ...(quickAddGeneratedProduct.customFields || {}),
          exchange_rate: effectiveRate,
          exchange_rate_updated_at: new Date().toISOString(),
          has_no_expiration: true,
          stare_produs: suggestStareProdusFromTitleAndDescription(finalTitle, finalDescription) || undefined,
          // Save requested_price and min_accepted_bid exactly as entered by user (in selected currency)
          requested_price: quickAddRequestedPrice > 0 ? roundTo(quickAddRequestedPrice) : null,
          min_accepted_bid: quickAddMinAcceptedBid > 0 ? roundTo(quickAddMinAcceptedBid) : null,
          // Store currency for these prices to know what currency they are in
          requested_price_currency: currency,
          min_accepted_bid_currency: currency,
        },
        documents: [],
        slug: uniqueSlug,
        url: finalUrl,
      };

      const { data: quickAddInserted, error: insertError } = await supabase
        .from('products')
        .insert([productData])
        .select("id");

      if (insertError) {
        throw insertError;
      }

      const quickAddListingId = (quickAddInserted as { id?: string }[] | null)?.[0]?.id;
      const { trackGoogleConversion } = await import("@/lib/analytics/googleAds");
      trackGoogleConversion("listing_published", { dedupeKey: quickAddListingId ?? String(Date.now()) });
      setManualFormMessage({ type: 'success', text: 'Produs creat cu succes!' });

      // Reset form
      setQuickAddImages([]);
      setQuickAddImagePreviews([]);
      setQuickAddDescription('');
      setQuickAddInterimText('');
      setQuickAddRequestedPrice(0);
      setQuickAddMinAcceptedBid(0);
      setQuickAddCurrency('RON');
      setQuickAddCity(''); // Will be reloaded from profile when modal opens again
      setQuickAddGeneratedProduct(null);
      setEditableTitle('');
      setEditableDescription('');
      setEditableCategory('');
      setEditableSubcategory('');
      setEditableLevel3('');
      setEditableSize('');
      setEditableBrand('');
      setEditableColor('');
      setEditableCondition('Nou');
      setEditablePrice(0);

      // Reload products
      await loadProducts();

      // Close modal after delay
      setTimeout(() => {
        setShowQuickAddModal(false);
        setManualFormMessage(null);
      }, 2000);

    } catch (error: any) {
      console.error('Error saving quick product:', error);
      setManualFormMessage({ 
        type: 'error', 
        text: error.message || error.details || error.hint || 'Eroare la salvarea produsului' 
      });
    } finally {
      setQuickAddIsSaving(false);
    }
  };

  // ========== PREMIUM PROMOTION FUNCTIONS ==========
  // Funcție pentru încărcarea creditului utilizatorului via API route (bypasses RLS)
  const loadUserCredit = async () => {
    setIsLoadingCredit(true);
    try {
      const session = await recoverDashboardSessionIfNeeded(supabase);
      if (!session?.user) {
        setUserCreditBalance(0);
        return;
      }

      // Load credit via API route — cookie session sau Bearer (dashboardApiFetch pattern)
      const creditsResponse = await apiFetchWithSession('/api/credits', {
        headers: {},
      });

      if (!creditsResponse.ok) {
        const errorData = await creditsResponse.json().catch(() => ({}));
        console.error('[Premium] Error loading user credit from API:', {
          status: creditsResponse.status,
          error: errorData
        });
        setUserCreditBalance(0);
        return;
      }

      const creditsData = await creditsResponse.json();
      
      if (creditsData.success && creditsData.credit !== undefined) {
        const totalCredit = Math.max(0, creditsData.credit || 0);
        setUserCreditBalance(totalCredit);
        console.log('[Premium] Loaded user credit from API:', totalCredit, 'RON');
      } else {
        console.warn('[Premium] Invalid response from credits API:', creditsData);
        setUserCreditBalance(0);
      }
    } catch (error) {
      console.error('Error loading user credit:', error);
      setUserCreditBalance(0);
    } finally {
      setIsLoadingCredit(false);
    }
  };

  const handlePremiumPayment = async () => {
    if (!selectedProductForPremium) {
      setManualFormMessage({ type: 'error', text: 'Te rog selectează un produs pentru promovare premium' });
      return;
    }

    setIsProcessingPremium(true);
    setManualFormMessage(null);

    try {
      const session = await recoverDashboardSessionIfNeeded(supabase);
      const { data: gotUser } = await supabase.auth.getUser();
      const userId = session?.user?.id ?? gotUser?.user?.id ?? null;
      if (!userId) {
        throw new Error('Trebuie să fii autentificat');
      }

      const totalAmount = premiumWeeks === 4 ? 9.99 : 4.99;

      // Verifică dacă utilizatorul are suficiente credite din user_payments (suma plăților)
      const { data: payments } = await supabase
        .from('user_payments')
        .select('amount')
        .eq('user_id', userId);

      // Calculate total credit (sum of all payment amounts) - same logic as admin
      const totalCredit =
        payments?.reduce(
          (sum: number, payment: { amount?: number | string | null }) =>
            sum + (Number(payment.amount) || 0),
          0,
        ) || 0;
      const hasEnoughCredits = totalCredit >= totalAmount;
      const paymentMethod = hasEnoughCredits ? 'credit' : 'netopia';
      
      console.log('[Premium] Credit check:', { totalCredit, totalAmount, hasEnoughCredits, paymentMethod });

      // Validate data before sending
      if (!selectedProductForPremium) {
        throw new Error('Produsul nu este selectat');
      }
      
      if (!totalAmount || totalAmount <= 0) {
        throw new Error('Suma este invalidă');
      }
      
      if (!premiumWeeks || premiumWeeks < 1) {
        throw new Error('Numărul de săptămâni este invalid');
      }

      // Call API to initiate payment
      const requestBody = {
        product_id: selectedProductForPremium,
        amount: totalAmount,
        weeks: premiumWeeks,
        payment_method: paymentMethod,
      };
      
      console.log('[Premium Payment] Sending request to API:', requestBody);
      console.log('[Premium Payment] Request body type check:', {
        product_id: typeof requestBody.product_id,
        amount: typeof requestBody.amount,
        weeks: typeof requestBody.weeks,
        payment_method: typeof requestBody.payment_method,
      });
      
      let response;
      try {
        const requestBodyString = JSON.stringify(requestBody);
        console.log('[Premium Payment] Request body stringified:', requestBodyString);
        
        response = await apiFetchWithSession('/api/premium/initiate-payment', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: requestBodyString,
        });
        
        console.log('[Premium Payment] API Response status:', response.status, response.statusText);
      } catch (fetchError: any) {
        console.error('[Premium Payment] Fetch error:', fetchError);
        throw new Error(`Eroare la trimiterea cererii: ${fetchError.message || 'Eroare necunoscută'}`);
      }

      // Read response text once
      const responseText = await response.text();
      console.log('[Premium Payment] Response text:', responseText);
      
      if (!response.ok) {
        console.error('[Premium Payment] API Error Response:', {
          status: response.status,
          statusText: response.statusText,
          body: responseText
        });
        
        let error;
        try {
          error = JSON.parse(responseText);
        } catch {
          console.error('[Premium Payment] Failed to parse error response as JSON');
          throw new Error(responseText || 'Eroare la procesarea plății');
        }
        
        // Afișează eroarea detaliată
        const errorMessage = error.error || error.message || 'Eroare la procesarea plății';
        const errorDetails = error.details ? `\nDetalii: ${error.details}` : '';
        console.error('[Premium Payment] Error details:', error);
        throw new Error(`${errorMessage}${errorDetails}`);
      }

      // Parse successful response
      let result;
      try {
        if (!responseText) {
          throw new Error('Răspuns gol de la server');
        }
        
        result = JSON.parse(responseText);
        console.log('[Premium Payment] Parsed result:', result);
      } catch (parseError: any) {
        console.error('[Premium Payment] Failed to parse response as JSON:', parseError);
        throw new Error(`Răspuns invalid de la server: ${responseText.substring(0, 100)}`);
      }
      
      if (result.success) {
        if (result.payment_method === 'credit') {
          // Plata cu credit - succes imediat
          setManualFormMessage({ type: 'success', text: `Promovare premium activată cu succes pentru ${premiumWeeks} ${premiumWeeks === 1 ? 'săptămână' : 'săptămâni'}!` });

          // Factură Oblio dacă e activ din Admin → Module
          if (oblioStatus.enabled) {
            const { payment, clientInfo } = buildPayloadForTransaction(
              { amount: totalAmount, description: `Promovare premium ${premiumWeeks} ${premiumWeeks === 1 ? 'săptămână' : 'săptămâni'}`, status: 'paid', type: 'premium' },
              {
                firstName: userInfo.firstName,
                lastName: userInfo.lastName,
                email: session?.user?.email ?? "",
              },
            );
            requestOblioInvoice(payment, clientInfo, { openPdf: true }).catch(() => {});
          }
          
          // Reset form
          setSelectedProductForPremium(null);
          setPremiumWeeks(1);
          
          // Reload products to show premium status
          await loadProducts();
          // Reîncarcă creditul după plată
          await loadUserCredit();

          // Close modal after delay
          setTimeout(() => {
            setShowPremiumModal(false);
            setManualFormMessage(null);
          }, 2000);
        } else {
          if (
            result.use_form_redirect &&
            result.form_url &&
            result.env_key &&
            result.data &&
            submitNetopiaCertificateForm({
              form_url: result.form_url as string,
              env_key: result.env_key as string,
              data: result.data as string,
              iv: (result.iv ?? '') as string,
              cipher: (result.cipher ?? 'aes-256-cbc') as string,
            })
          ) {
            return;
          }
          if (result.payment_url) {
            window.location.assign(result.payment_url as string);
          } else {
            throw new Error('Link de plată lipsă');
          }
        }
      } else {
        throw new Error(result.error || 'Eroare la activarea promovării premium');
      }
    } catch (error: any) {
      console.error('[Premium Payment] Error processing premium payment:', error);
      console.error('[Premium Payment] Error stack:', error.stack);
      
      // Afișează mesajul de eroare mai detaliat
      const errorMessage = error.message || 'Eroare la procesarea plății premium';
      setManualFormMessage({ 
        type: 'error', 
        text: errorMessage
      });
    } finally {
      setIsProcessingPremium(false);
    }
  };

  return (
    <div className={`min-h-screen ${isPieseAuto ? (isDarkMode ? "bg-[#1a1d21]" : "bg-[#f5f6f8]") : isDarkMode ? "dark bg-gray-900" : "bg-gray-50"}`}>
      <UniversalHeader isDarkMode={isDarkMode} onToggleDarkMode={toggleDarkMode} />
      <LocationPermissionModal
        open={manualFormLocationPermissionOpen}
        onOpenChange={setManualFormLocationPermissionOpen}
        onUseApproximateLocation={confirmManualFormLocationPermission}
        isBusy={manualFormUseMyLocationBusy}
      />
      
      <div className="container mx-auto max-w-7xl px-2 sm:px-4 py-4 sm:py-8">
        {/* Header */}
        <div className="mb-3 sm:mb-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-4 mb-3 sm:mb-4">
            <div className="flex items-center gap-3 flex-1">
              <BackButton
                fallbackHref={isPieseAuto ? "/dashboard/piese-auto" : "/dashboard"}
                label="Înapoi"
                className="shadow-md"
              />
              
              <h1 className={`text-xl sm:text-2xl md:text-3xl font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                Produsele mele
              </h1>
            </div>
            <div className="flex flex-row gap-2 w-full sm:w-auto flex-wrap">
              <button
                onClick={() => setShowContactModal(true)}
                className={`px-2 sm:px-4 py-2 sm:py-3 rounded-lg font-semibold text-xs sm:text-base transition-colors flex-1 sm:flex-none ${
                  isDarkMode
                    ? 'bg-gray-600 hover:bg-gray-500 text-white border border-gray-500'
                    : 'bg-gray-100 hover:bg-gray-200 text-gray-800 border border-gray-300'
                } shadow`}
              >
                <i className="ri-contacts-line mr-1 sm:mr-2"></i>
                <span>Contact anunț</span>
              </button>
              {isPieseAuto ? (
                <a
                  href="/dashboard/piese-auto/my-products?tab=import"
                  className={`px-2 sm:px-6 py-2 sm:py-3 rounded-lg font-semibold text-xs sm:text-base transition-colors flex-1 sm:flex-none flex items-center justify-center gap-1 sm:gap-2 ${
                    isDarkMode
                      ? "bg-amber-600 hover:bg-amber-700 text-white"
                      : "bg-amber-500 hover:bg-amber-600 text-white"
                  } shadow-lg`}
                >
                  <i className="ri-download-cloud-line mr-1 sm:mr-2"></i>
                  <span>Import produse</span>
                </a>
              ) : canUseGobidAiQuickAdd ? (
                <button
                  onClick={() => {
                    setShowQuickAddModal(true);
                    // Cere permisiunea pentru microfon imediat la deschidere (pe iOS/Safari promptul apare doar la primul gest)
                    if (typeof window !== 'undefined' && navigator.mediaDevices?.getUserMedia) {
                      navigator.mediaDevices.getUserMedia({ audio: true })
                        .then((stream) => { stream.getTracks().forEach((t) => t.stop()); })
                        .catch(() => {});
                    }
                  }}
                  className={`px-2 sm:px-6 py-2 sm:py-3 rounded-lg font-semibold text-xs sm:text-base transition-colors flex-1 sm:flex-none ${
                    isDarkMode
                      ? 'bg-blue-600 hover:bg-blue-700 text-white'
                      : 'bg-blue-500 hover:bg-blue-600 text-white'
                  } shadow-lg`}
                >
                  <i className="ri-flashlight-line mr-1 sm:mr-2"></i>
                  <span>Adaugă cu GoBid AI</span>
                </button>
              ) : null}
              <button
                onClick={() => {
                  setEditingProductId(null);
                  setEditingProductRow(null);
                  resetManualForm();
                  setShowManualAddModal(true);
                }}
                className={`px-2 sm:px-6 py-2 sm:py-3 rounded-lg font-semibold text-xs sm:text-base transition-colors flex-1 sm:flex-none ${
                  isDarkMode
                    ? 'bg-blue-600 hover:bg-blue-700 text-white'
                    : 'bg-blue-500 hover:bg-blue-600 text-white'
                } shadow-lg`}
              >
                <i className="ri-add-circle-line mr-1 sm:mr-2"></i>
                <span>Adaugă anunț manual</span>
              </button>
            </div>
          </div>

          {/* Premium Promotion Banner - Design modern compact */}
          <div className={`mb-2 sm:mb-3 md:mb-6 rounded-lg sm:rounded-xl overflow-hidden shadow-xl border ${
            isDarkMode 
              ? 'bg-gradient-to-br from-yellow-600 via-yellow-500 to-yellow-600 border-yellow-500/30' 
              : 'bg-gradient-to-br from-yellow-400 via-yellow-300 to-yellow-400 border-yellow-400/30'
          } relative`}>
            {/* Subtle pattern overlay */}
            <div className="absolute inset-0 opacity-[0.03] bg-[radial-gradient(circle_at_1px_1px,rgba(0,0,0,0.15)_1px,transparent_0)] bg-[length:16px_16px]"></div>
            
            <div className="relative p-2 sm:p-3 md:p-4">
              <div className="flex flex-row items-center justify-between gap-2 sm:gap-3">
                {/* Left section - compact */}
                <div className="flex-1 w-full min-w-0">
                  <div className="flex items-center gap-1 sm:gap-1.5 mb-0.5 sm:mb-1">
                    <div className="p-1 sm:p-1.5 rounded-md flex-shrink-0">
                      <i className="ri-vip-crown-line text-xs sm:text-sm md:text-base text-yellow-900"></i>
                    </div>
                    <h3 className={`text-xs sm:text-sm md:text-base lg:text-lg font-bold truncate ${isDarkMode ? 'text-yellow-900' : 'text-yellow-900'}`}>
                      Promovare Premium
                    </h3>
                  </div>
                  <p className={`text-[9px] sm:text-[10px] md:text-xs mb-1 leading-tight line-clamp-2 ${isDarkMode ? 'text-yellow-900/95' : 'text-yellow-900/95'}`}>
                    Promovează anunțurile tale în prima pagină și obține vizibilitate maximă!
                  </p>
                  <div className="flex flex-wrap gap-0.5 sm:gap-1">
                    <div className={`inline-flex items-center gap-0.5 px-1 sm:px-1.5 py-0.5 text-[8px] sm:text-[9px] md:text-[10px] font-medium ${isDarkMode ? 'text-yellow-900' : 'text-yellow-900'}`}>
                      <i className="ri-checkbox-circle-fill text-[8px] sm:text-[9px]"></i>
                      <span>Poziție prioritară</span>
                    </div>
                    <div className={`inline-flex items-center gap-0.5 px-1 sm:px-1.5 py-0.5 text-[8px] sm:text-[9px] md:text-[10px] font-medium ${isDarkMode ? 'text-yellow-900' : 'text-yellow-900'}`}>
                      <i className="ri-checkbox-circle-fill text-[8px] sm:text-[9px]"></i>
                      <span>Badge Premium</span>
                    </div>
                    <div className={`inline-flex items-center gap-0.5 px-1 sm:px-1.5 py-0.5 text-[8px] sm:text-[9px] md:text-[10px] font-medium ${isDarkMode ? 'text-yellow-900' : 'text-yellow-900'}`}>
                      <i className="ri-checkbox-circle-fill text-[8px] sm:text-[9px]"></i>
                      <span>+300% vizualizări</span>
                    </div>
                  </div>
                </div>
                
                {/* Right section - Price and Button */}
                <div className="flex flex-col items-end gap-1 sm:gap-1.5 flex-shrink-0">
                  <div className="text-right px-1.5 sm:px-2 md:px-3 py-0.5 sm:py-1">
                    <div className={`text-sm sm:text-base md:text-lg lg:text-xl font-bold ${isDarkMode ? 'text-yellow-900' : 'text-yellow-900'}`}>
                      4,99 Lei
                    </div>
                    <div className={`text-[7px] sm:text-[8px] md:text-[9px] font-medium ${isDarkMode ? 'text-yellow-900/90' : 'text-yellow-900/90'}`}>
                      per anunț pe săptămână
                    </div>
                  </div>
                  <button
                    onClick={async () => {
                      setShowPremiumModal(true);
                      await loadUserCredit();
                    }}
                    className={`px-2 sm:px-3 md:px-4 py-1 sm:py-1.5 md:py-2 rounded-md sm:rounded-lg font-bold text-[9px] sm:text-[10px] md:text-xs transition-all whitespace-nowrap ${
                      isDarkMode
                        ? 'bg-yellow-900 hover:bg-yellow-800 text-white shadow-md'
                        : 'bg-yellow-900 hover:bg-yellow-800 text-white shadow-md'
                    }`}
                  >
                    <i className="ri-star-fill mr-0.5 sm:mr-1 text-[9px] sm:text-[10px]"></i>
                    <span>Activează Premium</span>
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-1.5 sm:gap-4 mb-3 sm:mb-6">
            <button
              onClick={() => setFilterStatus('active')}
              className={`p-1.5 sm:p-4 rounded-lg transition-all shadow-sm hover:shadow-md active:scale-95 ${
                isDarkMode ? 'bg-gray-800 hover:bg-gray-700' : 'bg-white hover:bg-gray-50'
              } ${
                filterStatus === 'active'
                  ? isDarkMode
                    ? 'ring-2 ring-green-500'
                    : 'ring-2 ring-green-500'
                  : ''
              }`}
            >
              <p className={`text-xs sm:text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>Active</p>
              <p className={`text-sm sm:text-xl md:text-2xl font-bold text-green-600`}>
                {activeProducts.length}
              </p>
            </button>
            <button
              onClick={() => setFilterStatus('draft')}
              className={`p-1.5 sm:p-4 rounded-lg transition-all shadow-sm hover:shadow-md active:scale-95 ${
                isDarkMode ? 'bg-gray-800 hover:bg-gray-700' : 'bg-white hover:bg-gray-50'
              } ${
                filterStatus === 'draft'
                  ? isDarkMode
                    ? 'ring-2 ring-gray-500'
                    : 'ring-2 ring-gray-500'
                  : ''
              }`}
            >
              <p className={`text-xs sm:text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>Dezactivate</p>
              <p className={`text-sm sm:text-xl md:text-2xl font-bold ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                {draftProducts.length}
              </p>
            </button>
            <button
              onClick={() => setFilterStatus('reserved')}
              className={`p-1.5 sm:p-4 rounded-lg transition-all shadow-sm hover:shadow-md active:scale-95 ${
                isDarkMode ? 'bg-gray-800 hover:bg-gray-700' : 'bg-white hover:bg-gray-50'
              } ${
                filterStatus === 'reserved'
                  ? isDarkMode
                    ? 'ring-2 ring-yellow-500'
                    : 'ring-2 ring-yellow-500'
                  : ''
              }`}
            >
              <p className={`text-xs sm:text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>Rezervat</p>
              <p className={`text-sm sm:text-xl md:text-2xl font-bold text-yellow-600`}>
                {reservedProducts.length}
              </p>
            </button>
            <button
              onClick={() => setFilterStatus('sold')}
              className={`p-1.5 sm:p-4 rounded-lg transition-all shadow-sm hover:shadow-md active:scale-95 ${
                isDarkMode ? 'bg-gray-800 hover:bg-gray-700' : 'bg-white hover:bg-gray-50'
              } ${
                filterStatus === 'sold'
                  ? isDarkMode
                    ? 'ring-2 ring-emerald-500'
                    : 'ring-2 ring-emerald-500'
                  : ''
              }`}
            >
              <p className={`text-xs sm:text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>Vândut</p>
              <p className={`text-sm sm:text-xl md:text-2xl font-bold text-emerald-600`}>
                {soldProducts.length}
              </p>
            </button>
            <button
              type="button"
              onClick={() => setFilterStatus('all')}
              className={`p-1.5 sm:p-4 rounded-lg transition-all shadow-sm hover:shadow-md active:scale-95 ${
                isPieseAuto ? 'hidden sm:block' : ''
              } ${
                isDarkMode ? 'bg-gray-800 hover:bg-gray-700' : 'bg-white hover:bg-gray-50'
              } ${
                filterStatus === 'all'
                  ? isDarkMode
                    ? 'ring-2 ring-blue-500'
                    : 'ring-2 ring-blue-500'
                  : ''
              }`}
            >
              <p className={`text-xs sm:text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>Toate</p>
              <p className={`text-sm sm:text-xl md:text-2xl font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                {products.length}
              </p>
            </button>
          </div>

          {/* Search */}
          <div className={`p-2 sm:p-4 rounded-lg ${isDarkMode ? 'bg-gray-800' : 'bg-white'} shadow-sm mb-3 sm:mb-6`}>
            <input
              type="text"
              placeholder="Caută după titlu, COD ANUNT sau categorie..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className={`w-full px-2 sm:px-4 py-1.5 sm:py-2 text-sm sm:text-base rounded-lg border ${
                isDarkMode
                  ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400'
                  : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500'
              } focus:outline-none focus:ring-2 focus:ring-blue-500`}
            />
          </div>

          {/* Advanced Filters */}
          <div className={`p-2 sm:p-4 rounded-lg ${isDarkMode ? 'bg-gray-800' : 'bg-white'} shadow-sm mb-3 sm:mb-6`}>
            <div className="grid grid-cols-3 gap-2 sm:gap-4">
              {/* Premium Filter */}
              <div>
                <label className={`block text-xs font-medium mb-1 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                  Premium
                </label>
                <select
                  value={filterPremium}
                  onChange={(e) => setFilterPremium(e.target.value as 'all' | 'premium' | 'non-premium')}
                  className={`w-full px-1.5 sm:px-3 py-1.5 sm:py-2 text-xs sm:text-sm rounded-lg border ${
                    isDarkMode
                      ? 'bg-gray-700 border-gray-600 text-white'
                      : 'bg-white border-gray-300 text-gray-900'
                  } focus:outline-none focus:ring-2 focus:ring-blue-500`}
                >
                  <option value="all">Toate</option>
                  <option value="premium">Premium</option>
                  <option value="non-premium">Non-Premium</option>
                </select>
              </div>

              {/* Category Filter */}
              <div>
                <label className={`block text-xs font-medium mb-1 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                  Categorie
                </label>
                <select
                  value={filterCategory}
                  onChange={(e) => setFilterCategory(e.target.value)}
                  className={`w-full px-1.5 sm:px-3 py-1.5 sm:py-2 text-xs sm:text-sm rounded-lg border ${
                    isDarkMode
                      ? 'bg-gray-700 border-gray-600 text-white'
                      : 'bg-white border-gray-300 text-gray-900'
                  } focus:outline-none focus:ring-2 focus:ring-blue-500`}
                >
                  <option value="all">Toate</option>
                  {uniqueCategories.map(category => (
                    <option key={category} value={category}>{category}</option>
                  ))}
                </select>
              </div>

              {/* Sort By */}
              <div>
                <label className={`block text-xs font-medium mb-1 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                  Sortează
                </label>
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as 'date' | 'price' | 'title')}
                  className={`w-full px-1.5 sm:px-3 py-1.5 sm:py-2 text-xs sm:text-sm rounded-lg border ${
                    isDarkMode
                      ? 'bg-gray-700 border-gray-600 text-white'
                      : 'bg-white border-gray-300 text-gray-900'
                  } focus:outline-none focus:ring-2 focus:ring-blue-500`}
                >
                  <option value="date">Data</option>
                  <option value="price">Preț</option>
                  <option value="title">Titlu</option>
                </select>
              </div>
            </div>

            {/* Clear Filters Button */}
            {(filterPremium !== 'all' || filterCategory !== 'all' || sortBy !== 'date') && (
              <div className="mt-3 sm:mt-4">
                <button
                  onClick={() => {
                    setFilterPremium('all');
                    setFilterCategory('all');
                    setSortBy('date');
                  }}
                  className={`text-xs sm:text-sm px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg transition-colors ${
                    isDarkMode
                      ? 'bg-gray-700 hover:bg-gray-600 text-gray-300'
                      : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
                  }`}
                >
                  <i className="ri-close-line mr-1"></i>
                  Resetează filtrele
                </button>
              </div>
            )}

            {/* Pagination: page size + nav */}
            {totalFiltered > 0 && (
              <div className={`mt-3 sm:mt-4 pt-3 sm:pt-4 border-t flex flex-wrap items-center justify-between gap-2 ${isDarkMode ? 'border-gray-700' : 'border-gray-200'}`}>
                <div className="flex flex-wrap items-center gap-2 sm:gap-4">
                  <span className={`text-xs sm:text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                    Afișare:
                  </span>
                  <select
                    value={pageSize}
                    onChange={(e) => {
                      setPageSize(Number(e.target.value));
                      setPage(1);
                    }}
                    className={`text-xs sm:text-sm px-2 py-1.5 rounded-lg border ${
                      isDarkMode
                        ? 'bg-gray-700 border-gray-600 text-white'
                        : 'bg-white border-gray-300 text-gray-900'
                    } focus:outline-none focus:ring-2 focus:ring-blue-500`}
                  >
                    {PAGE_SIZE_OPTIONS.map((n) => (
                      <option key={n} value={n}>{n} per pagină</option>
                    ))}
                  </select>
                  <span className={`text-xs sm:text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                    {fromItem}–{toItem} din {totalFiltered}
                  </span>
                </div>
                <WheelPagination
                  totalPages={totalPages}
                  currentPage={page}
                  onPageChange={setPage}
                  canGoNext={page < totalPages}
                  isDarkMode={isDarkMode}
                />
              </div>
            )}
          </div>
        </div>

        {/* Products Table */}
        {isLoading ? (
          <div className={`text-center py-12 ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
            <p>Se încarcă produsele...</p>
          </div>
        ) : filteredProducts.length === 0 ? (
          <div className={`text-center py-12 ${isDarkMode ? 'bg-gray-800' : 'bg-white'} rounded-lg shadow-sm`}>
            <i className={`ri-inbox-line text-6xl ${isDarkMode ? 'text-gray-600' : 'text-gray-400'} mb-4`}></i>
            <p className={`text-lg font-semibold ${isDarkMode ? 'text-gray-300' : 'text-gray-700'} mb-2`}>
              Nu ai produse{filterStatus !== 'all' ? filterStatus === 'active' ? ' active' : filterStatus === 'sold' ? ' vândute' : filterStatus === 'reserved' ? ' rezervate' : ' dezactivate' : ''}
            </p>
            <p className={`${isDarkMode ? 'text-gray-500' : 'text-gray-500'} mb-4`}>
              {searchTerm ? 'Încearcă alt termen de căutare' : 'Adaugă primul tău produs pentru a începe'}
            </p>
            {!searchTerm && (
              <button
                onClick={() => {
                  setEditingProductId(null);
                  setEditingProductRow(null);
                  resetManualForm();
                  setShowManualAddModal(true);
                }}
                className={`px-6 py-3 rounded-lg font-semibold transition-colors ${
                  isDarkMode
                    ? 'bg-blue-600 hover:bg-blue-700 text-white'
                    : 'bg-blue-500 hover:bg-blue-600 text-white'
                } shadow-lg`}
              >
                <i className="ri-add-circle-line mr-2"></i>
                Adaugă anunț manual
              </button>
            )}
          </div>
        ) : (
          <>
            {/* Selection bar */}
            {selectedProductIds.size > 0 && (
              <div className={`mb-3 flex flex-wrap items-center gap-2 rounded-lg px-3 py-2 ${isDarkMode ? 'bg-blue-900/30 border border-blue-500/30' : 'bg-blue-50 border border-blue-200'}`}>
                <span className={`text-sm font-medium ${isDarkMode ? 'text-blue-200' : 'text-blue-800'}`}>
                  {selectedProductIds.size} produs{selectedProductIds.size === 1 ? '' : 'e'} selectat{selectedProductIds.size === 1 ? '' : 'e'}
                </span>
                <button
                  type="button"
                  onClick={() => setShowBulkDeleteModal(true)}
                  className={`text-sm px-3 py-1.5 rounded-lg font-medium flex items-center gap-1.5 ${isDarkMode ? 'bg-red-600 hover:bg-red-500 text-white' : 'bg-red-500 hover:bg-red-600 text-white'}`}
                >
                  <i className="ri-delete-bin-line"></i>
                  Șterge selectate
                </button>
                <button
                  type="button"
                  onClick={clearSelection}
                  className={`text-sm px-3 py-1.5 rounded-lg font-medium ${isDarkMode ? 'bg-blue-700 hover:bg-blue-600 text-white' : 'bg-blue-200 hover:bg-blue-300 text-blue-800'}`}
                >
                  Deselectează tot
                </button>
              </div>
            )}

            {/* Desktop Table View */}
            <div className={`hidden md:block rounded-lg shadow-sm overflow-hidden ${isDarkMode ? 'bg-gray-800' : 'bg-white'}`}>
              <div className="overflow-x-auto">
                <table className="w-full">
                <thead className={isDarkMode ? 'bg-gray-900' : 'bg-gray-50'}>
                  <tr>
                    <th className={`w-10 px-2 sm:px-4 py-2 sm:py-3 text-left ${
                      isDarkMode ? 'text-gray-300' : 'text-gray-700'
                    }`}>
                      <input
                        type="checkbox"
                        ref={selectAllCheckboxRef}
                        checked={isAllOnPageSelected}
                        onChange={toggleSelectAllOnPage}
                        className="rounded border-gray-400 text-blue-600 focus:ring-blue-500"
                        aria-label="Selectează toate de pe pagină"
                      />
                    </th>
                    <th className={`px-2 sm:px-4 md:px-6 py-2 sm:py-3 text-left text-xs font-medium uppercase tracking-wider ${
                      isDarkMode ? 'text-gray-300' : 'text-gray-700'
                    }`}>
                      Produs
                    </th>
                    <th className={`hidden sm:table-cell px-2 sm:px-4 md:px-6 py-2 sm:py-3 text-left text-xs font-medium uppercase tracking-wider ${
                      isDarkMode ? 'text-gray-300' : 'text-gray-700'
                    }`}>
                      Categorie
                    </th>
                    <th className={`hidden md:table-cell px-2 sm:px-4 md:px-6 py-2 sm:py-3 text-left text-xs font-medium uppercase tracking-wider ${
                      isDarkMode ? 'text-gray-300' : 'text-gray-700'
                    }`}>
                      Preț
                    </th>
                    <th className={`px-2 sm:px-4 md:px-6 py-2 sm:py-3 text-left text-xs font-medium uppercase tracking-wider ${
                      isDarkMode ? 'text-gray-300' : 'text-gray-700'
                    }`}>
                      Status
                    </th>
                    <th className={`px-2 sm:px-4 md:px-6 py-2 sm:py-3 text-right text-xs font-medium uppercase tracking-wider ${
                      isDarkMode ? 'text-gray-300' : 'text-gray-700'
                    }`}>
                      Acțiuni
                    </th>
                  </tr>
                </thead>
                <tbody className={`divide-y ${isDarkMode ? 'divide-gray-700' : 'divide-gray-200'}`}>
                  {paginatedProducts.map((product) => (
                    <React.Fragment key={product.id}>
                      <tr 
                        className={`${product.status === 'inactive' ? '' : isDarkMode ? 'hover:bg-gray-700' : 'hover:bg-gray-50'} ${
                          product.productType === 'live-bid' && product.status === 'active' 
                            ? 'cursor-pointer' 
                            : ''
                        } ${
                          product.status === 'inactive'
                            ? isDarkMode
                              ? 'bg-red-950/50'
                              : 'bg-red-50'
                            : product.status === 'sold'
                            ? isDarkMode
                              ? 'bg-emerald-950/30'
                              : 'bg-emerald-50/50'
                            : ''
                        }`}
                        onClick={(e) => {
                          // Deschide panel-ul cu ofertele dacă se apasă pe rând (dar nu pe link sau buton)
                          if (product.productType === 'live-bid' && product.status === 'active') {
                            const target = e.target as HTMLElement;
                            // Nu deschide dacă s-a apăsat pe link, buton sau input
                            if (!target.closest('a') && !target.closest('button') && !target.closest('input')) {
                              toggleLiveBidPanel(product.id);
                            }
                          }
                        }}
                      >
                      <td className="w-10 px-2 sm:px-4 py-2 sm:py-3 md:py-4" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selectedProductIds.has(product.id)}
                          onChange={() => toggleSelect(product.id)}
                          className="rounded border-gray-400 text-blue-600 focus:ring-blue-500"
                          aria-label={`Selectează ${product.title || product.id}`}
                        />
                      </td>
                      <td className="px-2 sm:px-4 md:px-6 py-2 sm:py-3 md:py-4">
                        <div className="flex items-center gap-2 sm:gap-3">
                          {/* Product Image */}
                          <div className="flex-shrink-0 relative overflow-hidden rounded-lg">
                            <img
                              src={getProductDisplayImage(product)}
                              alt={product.title}
                              className="w-12 h-12 sm:w-14 sm:h-14 md:w-16 md:h-16 object-cover rounded-lg border"
                              onError={(e) => {
                                (e.target as HTMLImageElement).src = '/no-image-placeholder.svg';
                              }}
                            />
                            {/* Badge diagonal VÂNDUT / REZERVAT */}
                            {(product.status === 'sold' || product.status === 'reserved') && (
                              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                                <div
                                  className={`absolute left-1/2 top-1/2 transform -translate-x-1/2 -translate-y-1/2 -rotate-45 w-[180%] text-center py-0.5 px-2 border-2 rounded-sm uppercase tracking-wider font-black text-[10px] sm:text-xs leading-none ${
                                    product.status === 'sold'
                                      ? 'border-emerald-600 text-emerald-600 bg-transparent'
                                      : 'border-amber-500 text-amber-600 bg-transparent'
                                  }`}
                                >
                                  {product.status === 'sold' ? 'VÂNDUT' : 'REZERVAT'}
                                </div>
                              </div>
                            )}
                            {/* Premium Badge on Image */}
                            {product.isPremium && (
                              <div className="absolute -top-1 -right-1 z-10">
                                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-xs font-semibold bg-gradient-to-r from-yellow-500 to-yellow-600 text-white shadow-lg">
                                  <i className="ri-vip-crown-line text-xs"></i>
                                  <span className="hidden sm:inline">Premium</span>
                                </span>
                              </div>
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              {(product.url || product.slug) ? (
                                <a
                                  href={product.url || (product.slug ? `/live_bid/${product.slug}` : `#`)}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className={`text-xs sm:text-sm font-medium hover:underline line-clamp-2 ${
                                    product.status === 'sold'
                                      ? 'text-emerald-700 hover:text-emerald-800 dark:text-emerald-400'
                                      : product.status === 'reserved'
                                      ? 'text-black hover:text-gray-800'
                                      : product.isPremium
                                      ? 'text-yellow-600 hover:text-yellow-700'
                                      : isDarkMode ? 'text-blue-400 hover:text-blue-300' : 'text-blue-600 hover:text-blue-700'
                                  }`}
                                >
                                  {product.title || 'Fără titlu'}
                                </a>
                              ) : (
                                <div className={`text-xs sm:text-sm font-medium line-clamp-2 ${
                                  product.status === 'sold'
                                    ? 'text-emerald-700 dark:text-emerald-400'
                                    : product.status === 'reserved'
                                    ? 'text-black'
                                    : product.isPremium
                                    ? 'text-yellow-600'
                                    : isDarkMode ? 'text-white' : 'text-gray-900'
                                }`}>
                                  {product.title || 'Fără titlu'}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className={`text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                          COD ANUNT: <span className="font-bold">{product.sku || 'N/A'}</span>
                        </div>
                        {/* Premium Timer */}
                        {product.isPremium && product.premiumUntil && (
                          <PremiumTimer premiumUntil={product.premiumUntil} isDarkMode={isDarkMode} />
                        )}
                        {/* Premium Status pentru produse non-premium */}
                        {!product.isPremium && (
                          <div className={`flex items-center gap-1 mt-1 text-xs ${
                            isDarkMode ? 'text-gray-500' : 'text-gray-500'
                          }`}>
                            <i className="ri-vip-crown-line"></i>
                            <span className="font-medium">Premium: Nu este activ</span>
                          </div>
                        )}
                        {/* Mobile: Show category and price below title */}
                        <div className="sm:hidden mt-1">
                          <div className={`text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                            {product.category || 'N/A'}
                            {product.subcategory && ` • ${product.subcategory}`}
                          </div>
                          <div className={`text-xs font-medium ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                            {formatPrice(product.startingPrice, product.currency)}
                          </div>
                        </div>
                      </td>
                      <td className={`hidden sm:table-cell px-2 sm:px-4 md:px-6 py-2 sm:py-3 md:py-4 text-xs sm:text-sm ${
                        isDarkMode ? 'text-gray-300' : 'text-gray-700'
                      }`}>
                        {product.category || 'N/A'}
                        {product.subcategory && (
                          <div className={`text-xs ${isDarkMode ? 'text-gray-500' : 'text-gray-500'}`}>
                            {product.subcategory}
                          </div>
                        )}
                      </td>
                      <td className={`hidden md:table-cell px-2 sm:px-4 md:px-6 py-2 sm:py-3 md:py-4 text-xs sm:text-sm font-medium ${
                        isDarkMode ? 'text-white' : 'text-gray-900'
                      }`}>
                        {formatPrice(product.startingPrice, product.currency)}
                      </td>
                      <td className="px-2 sm:px-4 md:px-6 py-2 sm:py-3 md:py-4">
                        <div className="flex flex-col gap-1">
                          {getStatusBadge(product.status, product.approvalStatus)}
                          {product.approvalStatus === 'rejected' && product.rejectionReason && (
                            <div className={`text-xs mt-1 ${isDarkMode ? 'text-red-400' : 'text-red-600'}`}>
                              {product.rejectionReason}
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="px-2 sm:px-4 md:px-6 py-2 sm:py-3 md:py-4 text-right">
                        <div className="flex flex-col items-end gap-2">
                          {product.status === 'inactive' ? (
                            <div className="flex items-center justify-end gap-1 sm:gap-2">
                              <button
                                onClick={() => handleActivateProduct(product.id)}
                                className={`px-2 sm:px-3 py-1 rounded-lg transition-colors text-xs sm:text-sm ${
                                  isDarkMode
                                    ? 'bg-green-600 hover:bg-green-700 text-white'
                                    : 'bg-green-500 hover:bg-green-600 text-white'
                                }`}
                                title="Activează anunțul"
                              >
                                <i className="ri-eye-line sm:mr-1"></i>
                                <span className="hidden sm:inline">Activează</span>
                              </button>
                              {(product.status === 'inactive' || product.status === 'reserved' || product.status === 'sold') && (
                                <button
                                  onClick={() => handleDeleteClick(product.id, product.title, product.status)}
                                  className={`px-2 sm:px-3 py-1 rounded-lg transition-colors text-xs sm:text-sm ${
                                    isDarkMode
                                      ? 'bg-red-600 hover:bg-red-700 text-white'
                                      : 'bg-red-500 hover:bg-red-600 text-white'
                                  }`}
                                  title="Șterge (ascunde) anunțul"
                                >
                                  <i className="ri-delete-bin-line sm:mr-1"></i>
                                  <span className="hidden sm:inline">Șterge</span>
                                </button>
                              )}
                            </div>
                          ) : product.status === 'sold' ? (
                            /* Produs vândut: doar butonul Șterge */
                            <div className="flex items-center justify-end gap-1 sm:gap-2">
                              <button
                                onClick={() => handleDeleteClick(product.id, product.title, product.status)}
                                className={`px-2 sm:px-3 py-1 rounded-lg transition-colors text-xs sm:text-sm ${
                                  isDarkMode
                                    ? 'bg-red-600 hover:bg-red-700 text-white'
                                    : 'bg-red-500 hover:bg-red-600 text-white'
                                }`}
                                title="Șterge (ascunde) anunțul"
                              >
                                <i className="ri-delete-bin-line sm:mr-1"></i>
                                <span className="hidden sm:inline">Șterge</span>
                              </button>
                            </div>
                          ) : (
                            <>
                              {/* Primul rând: Vezi ofertele și Editează */}
                              <div className="flex items-center justify-end gap-1 sm:gap-2">
                                {product.productType === 'live-bid' && product.status === 'active' && (
                                  <button
                                    onClick={() => goToMyBids()}
                                    className={`px-2 sm:px-3 py-1.5 rounded-lg transition-all text-white text-xs sm:text-sm whitespace-nowrap flex items-center gap-1.5 shadow-sm hover:shadow-md ${
                                      isDarkMode 
                                        ? 'bg-green-600 hover:bg-green-700 active:bg-green-800' 
                                        : 'bg-green-500 hover:bg-green-600 active:bg-green-700'
                                    }`}
                                    title="Vezi toate ofertele în pagina dedicată"
                                  >
                                    <i className="ri-arrow-right-line text-xs sm:text-sm"></i>
                                    <span className="hidden sm:inline">
                                      Vezi ofertele
                                      {(product.bidCount ?? 0) > 0 && (
                                        <span className="ml-2 px-1.5 py-0.5 rounded-full text-xs font-semibold bg-red-500 text-white shadow-md">
                                          {product.bidCount ?? 0}
                                        </span>
                                      )}
                                    </span>
                                    <span className="sm:hidden">
                                      Oferte
                                      {(product.bidCount ?? 0) > 0 && (
                                        <span className="ml-1 px-1 py-0.5 rounded-full text-xs font-semibold bg-red-500 text-white shadow-md">
                                          {product.bidCount ?? 0}
                                        </span>
                                      )}
                                    </span>
                                  </button>
                                )}
                                <button
                                  onClick={() => handleEdit(product.id)}
                                  className={`px-2 sm:px-3 py-1 rounded-lg transition-colors text-xs sm:text-sm ${
                                    isDarkMode
                                      ? 'bg-blue-600 hover:bg-blue-700 text-white'
                                      : 'bg-blue-500 hover:bg-blue-600 text-white'
                                  }`}
                                >
                                  <i className="ri-edit-line sm:mr-1"></i>
                                  <span className="hidden sm:inline">Editează</span>
                                </button>
                              </div>
                              {/* Al doilea rând: Marchează rezervat, Marchează vândut și Dezactivează */}
                              <div className="flex items-center justify-end gap-1 sm:gap-2 flex-wrap">
                                {product.status !== 'reserved' ? (
                                  <button
                                    onClick={() => handleReserveProduct(product.id)}
                                    className={`px-2 sm:px-3 py-1 rounded-lg transition-colors text-xs sm:text-sm ${
                                      isDarkMode
                                        ? 'bg-blue-600 hover:bg-blue-700 text-white'
                                        : 'bg-blue-500 hover:bg-blue-600 text-white'
                                    }`}
                                    title="Marchează produsul ca rezervat"
                                  >
                                    <i className="ri-bookmark-line sm:mr-1"></i>
                                    <span className="hidden sm:inline">Marchează rezervat</span>
                                    <span className="sm:hidden">Rezervat</span>
                                  </button>
                                ) : (
                                  <button
                                    disabled
                                    className={`px-2 sm:px-3 py-1 rounded-lg text-xs sm:text-sm cursor-not-allowed ${
                                      isDarkMode
                                        ? 'bg-gray-700 text-white'
                                        : 'bg-gray-700 text-white'
                                    }`}
                                    title="Produs rezervat"
                                  >
                                    <i className="ri-bookmark-fill sm:mr-1"></i>
                                    <span className="hidden sm:inline">Rezervat</span>
                                    <span className="sm:hidden">Rezervat</span>
                                  </button>
                                )}
                                <button
                                  onClick={() => handleMarkAsSold(product.id)}
                                  className={`px-2 sm:px-3 py-1 rounded-lg transition-colors text-xs sm:text-sm ${
                                    isDarkMode
                                      ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                                      : 'bg-emerald-500 hover:bg-emerald-600 text-white'
                                  }`}
                                  title="Marchează produsul ca vândut"
                                >
                                  <i className="ri-check-double-line sm:mr-1"></i>
                                  <span className="hidden sm:inline">Marchează vândut</span>
                                  <span className="sm:hidden">Vândut</span>
                                </button>
                                <button
                                  onClick={() => handleDeleteClick(product.id, product.title, product.status)}
                                  className={`px-2 sm:px-3 py-1 rounded-lg transition-colors text-xs sm:text-sm ${
                                    isDarkMode
                                      ? 'bg-amber-600 hover:bg-amber-700 text-white'
                                      : 'bg-amber-500 hover:bg-amber-600 text-white'
                                  }`}
                                  title="Dezactivează anunțul"
                                >
                                  <i className="ri-eye-off-line sm:mr-1"></i>
                                  <span className="hidden sm:inline">Dezactivează</span>
                                </button>
                                {((product.status as any) === 'inactive' || product.status === 'reserved' || (product.status as Product['status']) === 'sold') && (
                                    <button
                                      onClick={() => handleDeleteClick(product.id, product.title, product.status)}
                                    className={`px-2 sm:px-3 py-1 rounded-lg transition-colors text-xs sm:text-sm ${
                                      isDarkMode
                                        ? 'bg-red-600 hover:bg-red-700 text-white'
                                        : 'bg-red-500 hover:bg-red-600 text-white'
                                    }`}
                                    title="Șterge (ascunde) anunțul"
                                  >
                                    <i className="ri-delete-bin-line sm:mr-1"></i>
                                    <span className="hidden sm:inline">Șterge</span>
                                  </button>
                                )}
                              </div>
                            </>
                          )}
                          {/* Data sub butoane, aliniată la dreapta */}
                          <div className={`text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                            {new Date(product.createdAt).toLocaleString('ro-RO', {
                              day: '2-digit',
                              month: '2-digit',
                              year: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit'
                            })}
                          </div>
                        </div>
                      </td>
                      </tr>
                      {/* Panel Live Bid - Oferte - Înlocuit cu design de chat */}
                      {product.productType === 'live-bid' && selectedConversation?.productId === product.id && (
                        <tr id={`offers-panel-${product.id}`}>
                          <td colSpan={5} className={`p-0 ${isDarkMode ? 'bg-gray-700' : 'bg-white'}`}>
                            <div className="flex h-[600px] rounded-lg border border-gray-200 overflow-hidden bg-white">
                              {/* Left Panel - Lista de conversații */}
                              <div className="w-full md:w-1/3 border-r border-gray-200 bg-white flex flex-col">
                                {/* Header lista */}
                                <div className="p-4 border-b border-gray-200 bg-white">
                                  <h2 className="text-base font-semibold text-gray-900">
                                    Conversații
                                  </h2>
                                </div>
                                
                                {/* Lista conversații */}
                                <div className="flex-1 overflow-y-auto">
                                  {(() => {
                                    const conversations = getConversationsByProduct(product.id);
                                    if (conversations.length === 0) {
                                      return (
                                        <div className="p-4 text-center text-gray-500 text-sm">
                                          Nu există oferte încă
                                        </div>
                                      );
                                    }
                                    
                                    return conversations.map((conv) => {
                                      const isSelected = selectedConversation?.buyerId === conv.buyerId;
                                      const buyerName = conv.buyerInfo?.first_name && conv.buyerInfo?.last_name
                                        ? `${conv.buyerInfo.first_name} ${conv.buyerInfo.last_name}`
                                        : conv.buyerInfo?.username || conv.buyerInfo?.email || 'Cumpărător';
                                      
                                      // Verifică dacă există mesaje necitite pentru această conversație
                                      const conversationKey = `${product.id}-${conv.buyerId}`;
                                      const unreadCount = unreadMessages[conversationKey] || 0;
                                      const hasUnreadMessages = unreadCount > 0;
                                      
                                      return (
                                        <button
                                          key={conv.buyerId}
                                          onClick={() => {
                                            setSelectedConversation({ productId: product.id, buyerId: conv.buyerId });
                                            // Resetează numărul de mesaje necitite când se selectează conversația
                                            if (hasUnreadMessages) {
                                              setUnreadMessages(prev => {
                                                const newState = { ...prev };
                                                delete newState[conversationKey];
                                                return newState;
                                              });
                                            }
                                          }}
                                          className={`w-full p-3 border-b border-gray-100 hover:bg-gray-50 transition-colors text-left relative ${
                                            isSelected ? 'bg-blue-50' : ''
                                          } ${
                                            hasUnreadMessages ? 'bg-blue-50/50 border-l-4 border-l-blue-500' : ''
                                          }`}
                                        >
                                          <div className="flex items-center gap-3">
                                            {/* Avatar cumpărător */}
                                            <div className="flex-shrink-0 relative">
                                              {conv.buyerInfo?.avatar_url ? (
                                                <img
                                                  src={conv.buyerInfo.avatar_url}
                                                  alt={buyerName}
                                                  className={`w-12 h-12 rounded-full object-cover ${
                                                    hasUnreadMessages ? 'ring-2 ring-blue-500' : ''
                                                  }`}
                                                />
                                              ) : (
                                                <div className={`w-12 h-12 rounded-full flex items-center justify-center text-sm font-semibold ${
                                                  hasUnreadMessages 
                                                    ? 'bg-blue-100 text-blue-700 ring-2 ring-blue-500' 
                                                    : 'bg-gray-200 text-gray-700'
                                                }`}>
                                                  {(conv.buyerInfo?.first_name?.[0] || conv.buyerInfo?.username?.[0] || 'C').toUpperCase()}
                                                </div>
                                              )}
                                              {hasUnreadMessages && (
                                                <div className="absolute -top-1 -right-1 w-4 h-4 bg-blue-500 rounded-full border-2 border-white flex items-center justify-center">
                                                  <div className="w-2 h-2 bg-white rounded-full animate-pulse"></div>
                                                </div>
                                              )}
                                            </div>
                                            
                                            {/* Info conversație */}
                                            <div className="flex-1 min-w-0">
                                              <div className="flex items-start justify-between gap-2 mb-1">
                                                <div className="flex items-center gap-2 flex-1 min-w-0">
                                                  <p className={`text-sm font-medium truncate ${
                                                    hasUnreadMessages ? 'font-semibold text-gray-900' : 'text-gray-900'
                                                  }`}>
                                                    {buyerName}
                                                  </p>
                                                  {hasUnreadMessages && (
                                                    <span className="flex-shrink-0 bg-blue-500 text-white text-xs font-bold px-2 py-0.5 rounded-full min-w-[20px] text-center">
                                                      {unreadCount > 99 ? '99+' : unreadCount}
                                                    </span>
                                                  )}
                                                </div>
                                                {conv.latestBid && (
                                                  <span className="text-xs flex-shrink-0 text-gray-500">
                                                    {(() => {
                                                      const date = new Date(conv.latestBid.created_at);
                                                      const now = new Date();
                                                      const diffMs = now.getTime() - date.getTime();
                                                      const diffMins = Math.floor(diffMs / 60000);
                                                      const diffHours = Math.floor(diffMs / 3600000);
                                                      const diffDays = Math.floor(diffMs / 86400000);
                                                      
                                                      if (diffMins < 1) return 'acum';
                                                      if (diffMins < 60) return `acum ${diffMins} min`;
                                                      if (diffHours < 24) return `acum ${diffHours} h`;
                                                      if (diffDays === 1) return 'acum 1 zi';
                                                      return `acum ${diffDays} zile`;
                                                    })()}
                                                  </span>
                                                )}
                                              </div>
                                              <p className="text-xs truncate mb-1 text-gray-600 block">
                                                {product.title}
                                              </p>
                                              {conv.latestBid && (
                                                <p className={`text-sm font-medium ${
                                                  conv.latestBid.is_winning 
                                                    ? 'text-green-600' 
                                                    : 'text-gray-900'
                                                }`}>
                                                  {formatPrice(conv.latestBid.amount, product.currency)}
                                                </p>
                                              )}
                                            </div>
                                          </div>
                                        </button>
                                      );
                                    });
                                  })()}
                                </div>
                              </div>
                              
                              {/* Right Panel - Chat pentru conversația selectată */}
                              {selectedConversation?.buyerId ? (
                                <div className="flex-1 flex flex-col bg-white">
                                  {(() => {
                                    const conversations = getConversationsByProduct(product.id);
                                    const selectedConv = conversations.find(c => c.buyerId === selectedConversation.buyerId);
                                    if (!selectedConv) return null;
                                    
                                    const bids = selectedConv.bids;
                                    const sortedBids = [...bids].sort((a, b) => 
                                      new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
                                    );
                                    const highestBid = Math.max(...bids.map(b => b.amount || 0));
                                    const buyerInfo = selectedConv.buyerInfo;
                                  
                                  return (
                                    <>
                                      {/* Header conversație */}
                                      <div className="p-3 border-b border-gray-200 bg-white">
                                        <div className="flex items-center justify-between">
                                          <h3 className="text-base font-semibold text-gray-900">
                                            {buyerInfo?.first_name && buyerInfo?.last_name
                                              ? `${buyerInfo.first_name} ${buyerInfo.last_name}`
                                              : buyerInfo?.username || buyerInfo?.email || 'Cumpărător'}
                                          </h3>
                                          <button
                                            onClick={() => setSelectedConversation(null)}
                                            className="p-1 rounded hover:bg-gray-100 transition-colors"
                                          >
                                            <i className="ri-close-line text-lg text-gray-600"></i>
                                          </button>
                                        </div>
                                      </div>
                                      
                                      {/* Card produs */}
                                      <div className="p-4 border-b border-gray-200 bg-white">
                                        <div className="flex gap-3">
                                          <img
                                            src={getCdnImageUrl(
                                              getProductDisplayImage(product),
                                              listingGridTransformOptions(null),
                                            )}
                                            alt={product.title}
                                            className="w-16 h-16 object-cover rounded"
                                            onError={(e) => {
                                              (e.target as HTMLImageElement).src = '/no-image-placeholder.svg';
                                            }}
                                          />
                                          <div className="flex-1">
                                            <p className="text-sm font-medium mb-2 text-gray-900 block">
                                              {product.title}
                                            </p>
                                            <div className="flex items-center gap-2">
                                              {product.startingPrice && (
                                                <span className="text-sm text-gray-500 line-through">
                                                  {new Intl.NumberFormat('ro-RO', {
                                                    style: 'currency',
                                                    currency: product.currency || 'RON',
                                                    minimumFractionDigits: 0,
                                                    maximumFractionDigits: 0,
                                                  }).format(product.startingPrice)}
                                                </span>
                                              )}
                                              <span className="text-base font-semibold text-gray-900">
                                                {new Intl.NumberFormat('ro-RO', {
                                                  style: 'currency',
                                                  currency: product.currency || 'RON',
                                                  minimumFractionDigits: 0,
                                                  maximumFractionDigits: 0,
                                                }).format(highestBid)}
                                              </span>
                                            </div>
                                          </div>
                                        </div>
                                      </div>
                                      
                                      {/* Mesaje (oferte) */}
                                      <div className="flex-1 overflow-y-auto p-4 space-y-3">
                                        {/* Mesaj de la cumpărător cu informații */}
                                        {buyerInfo && (
                                          <div className="flex gap-2">
                                            {buyerInfo.avatar_url ? (
                                              <img
                                                src={buyerInfo.avatar_url}
                                                alt="Cumpărător"
                                                className="w-8 h-8 rounded-full object-cover flex-shrink-0"
                                              />
                                            ) : (
                                              <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold bg-gray-200 text-gray-700 flex-shrink-0">
                                                {(buyerInfo.first_name?.[0] || buyerInfo.username?.[0] || 'C').toUpperCase()}
                                              </div>
                                            )}
                                            <div className="flex-1">
                                              <div className="inline-block px-3 py-2 rounded-lg bg-gray-100 text-gray-900">
                                                <p className="text-sm mb-1">
                                                  Salut, eu sunt {buyerInfo.first_name && buyerInfo.last_name
                                                    ? `${buyerInfo.first_name} ${buyerInfo.last_name}`
                                                    : buyerInfo.username || buyerInfo.email || 'Cumpărător'}
                                                </p>
                                                <p className="text-xs text-gray-600">
                                                  România
                                                </p>
                                                <p className="text-xs text-gray-500 mt-1">
                                                  Ultima conectare acum 27 de minute
                                                </p>
                                              </div>
                                              <span className="text-xs text-gray-400 mt-1 block text-right">
                                                acum 4 zile
                                              </span>
                                            </div>
                                          </div>
                                        )}

                                        {/* Oferte și mesaje prietenoase combinate și sortate cronologic */}
                                        {loadingBids[product.id] ? (
                                          <div className="text-center py-8">
                                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto"></div>
                                            <p className="text-sm text-gray-500 mt-2">Se încarcă ofertele...</p>
                                          </div>
                                        ) : (() => {
                                          // Combină ofertele și mesajele prietenoase
                                          const systemMessages = chatSystemMessages[product.id] || [];
                                          // Inversează ordinea mesajelor prietenoase pentru a apărea corect
                                          const reversedMessages = [...systemMessages].reverse();
                                          const combinedItems: Array<{
                                            type: 'bid' | 'message';
                                            bid?: any;
                                            message?: { id: string; message: string; timestamp: number; isAlert?: boolean };
                                            timestamp: number;
                                          }> = [
                                            ...sortedBids.map(bid => ({
                                              type: 'bid' as const,
                                              bid,
                                              timestamp: new Date(bid.created_at).getTime()
                                            })),
                                            ...reversedMessages.map(msg => ({
                                              type: 'message' as const,
                                              message: msg,
                                              timestamp: msg.timestamp
                                            }))
                                          ];
                                          
                                          // Sortează după timestamp (ordine cronologică: cel mai vechi primul)
                                          combinedItems.sort((a, b) => a.timestamp - b.timestamp);
                                          
                                          if (combinedItems.length === 0) {
                                            return (
                                              <div className="text-center py-8 text-gray-500">
                                                <p>Nu există oferte încă</p>
                                              </div>
                                            );
                                          }
                                          
                                          // Găsește ultima ofertă (nu mesaj de sistem)
                                          const lastBidIndex = combinedItems
                                            .map((item, idx) => ({ item, idx }))
                                            .filter(({ item }) => item.type === 'bid')
                                            .pop()?.idx ?? -1;
                                          
                                          return combinedItems.map((item, index) => {
                                            if (item.type === 'message') {
                                              // Mesaj prietenos sau alertă
                                              const isAlert = item.message!.isAlert;
                                              return (
                                                <div key={item.message!.id} className="flex justify-center my-2">
                                                  <div className={`px-4 py-2 rounded-lg ${
                                                    isAlert
                                                      ? isDarkMode 
                                                        ? 'bg-red-900/30 border border-red-500/30' 
                                                        : 'bg-red-50 border border-red-200'
                                                      : isDarkMode 
                                                        ? 'bg-blue-900/30 border border-blue-500/30' 
                                                        : 'bg-blue-50 border border-blue-200'
                                                  }`}>
                                                    <p className={`text-sm text-center font-semibold ${
                                                      isAlert
                                                        ? isDarkMode ? 'text-red-200' : 'text-red-700'
                                                        : isDarkMode ? 'text-blue-200' : 'text-blue-900'
                                                    }`}>
                                                      {item.message!.message}
                                                    </p>
                                                  </div>
                                                </div>
                                              );
                                            } else {
                                              // Ofertă
                                              const bid = item.bid!;
                                              const isMyBid = bid.user_id === currentUserId;
                                              const isWinning = bid.is_winning;
                                              const isLastBid = index === lastBidIndex;
                                              
                                              return (
                                                <div
                                                  key={bid.id}
                                                  className={`flex gap-2 ${isMyBid ? 'flex-row-reverse' : ''}`}
                                                >
                                                  {!isMyBid && (
                                                    <div className="flex-shrink-0">
                                                      {buyerInfo?.avatar_url ? (
                                                        <img
                                                          src={buyerInfo.avatar_url}
                                                          alt="Cumpărător"
                                                          className="w-8 h-8 rounded-full object-cover"
                                                        />
                                                      ) : (
                                                        <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold bg-gray-200 text-gray-700">
                                                          {(buyerInfo?.first_name?.[0] || buyerInfo?.username?.[0] || 'C').toUpperCase()}
                                                        </div>
                                                      )}
                                                    </div>
                                                  )}
                                                  
                                                  <div className={`flex-1 ${isMyBid ? 'flex flex-col items-end' : ''}`}>
                                                    <div className={`inline-block px-3 py-2 rounded-lg ${
                                                      isMyBid
                                                        ? 'bg-blue-500 text-white'
                                                        : 'bg-gray-100 text-gray-900'
                                                    }`}>
                                                      <span className="text-base font-semibold">
                                                        {new Intl.NumberFormat('ro-RO', {
                                                          style: 'currency',
                                                          currency: product.currency || 'RON',
                                                          minimumFractionDigits: 0,
                                                          maximumFractionDigits: 0,
                                                        }).format(bid.amount)}
                                                      </span>
                                                      {isWinning && (
                                                        <span className="text-xs opacity-90 block mt-1">✓ Acceptată</span>
                                                      )}
                                                      {bid.is_outbid && (
                                                        <span className="text-xs opacity-90 block mt-1">Refuzată</span>
                                                      )}
                                                    </div>
                                                    
                                                    {/* Butoane pentru acțiuni - doar pentru ultima ofertă care nu este a mea și nu este acceptată/refuzată */}
                                                    {!isMyBid && !isWinning && !bid.is_outbid && isLastBid && (
                                                      <div className="flex gap-2 mt-2">
                                                        <button
                                                          onClick={() => {
                                                            const userName = buyerInfo?.first_name && buyerInfo?.last_name
                                                              ? `${buyerInfo.first_name} ${buyerInfo.last_name}`
                                                              : buyerInfo?.username || buyerInfo?.email || 'Cumpărător';
                                                            setCounterOfferModalChatData({
                                                              productId: product.id,
                                                              bidId: bid.id,
                                                              currentAmount: bid.amount,
                                                              currency: product.currency || 'RON',
                                                              userName: userName
                                                            });
                                                            setCounterOfferAmountChat('');
                                                            setShowCounterOfferModalChat(true);
                                                          }}
                                                          className="px-3 py-1.5 text-xs font-medium rounded-lg bg-red-500 hover:bg-red-600 text-white transition-colors"
                                                        >
                                                          Contraoferta
                                                        </button>
                                                        <button
                                                          onClick={async () => {
                                                            try {
                                                              const response = await apiFetchWithSession('/api/bids/accept', {
                                                                method: 'POST',
                                                                headers: {
                                                                  'Content-Type': 'application/json',
                                                                },
                                                                body: JSON.stringify({
                                                                  product_id: product.id,
                                                                  bid_id: bid.id,
                                                                }),
                                                              });
                                                              
                                                              if (response.ok) {
                                                                await loadProductBids(product.id);
                                                                showNotification('success', 'Succes!', 'Oferta a fost acceptată cu succes!');
                                                              } else {
                                                                const result = await response.json();
                                                                showNotification('error', 'Eroare', result.error || 'Eroare la acceptarea ofertei');
                                                              }
                                                            } catch (error: any) {
                                                              console.error('Error accepting bid:', error);
                                                              showNotification('error', 'Eroare', 'Eroare la acceptarea ofertei: ' + (error.message || 'Eroare necunoscută'));
                                                            }
                                                          }}
                                                          className="px-3 py-1.5 text-xs font-medium rounded-lg bg-green-500 hover:bg-green-600 text-white transition-colors"
                                                        >
                                                          Acceptă
                                                        </button>
                                                        <button
                                                          onClick={async () => {
                                                            try {
                                                              const response = await apiFetchWithSession('/api/bids/reject', {
                                                                method: 'POST',
                                                                headers: {
                                                                  'Content-Type': 'application/json',
                                                                },
                                                                body: JSON.stringify({
                                                                  bid_id: bid.id,
                                                                  product_id: product.id,
                                                                }),
                                                              });
                                                              
                                                              if (response.ok) {
                                                                await loadProductBids(product.id);
                                                                showNotification('success', 'Succes!', 'Oferta a fost refuzată');
                                                              } else {
                                                                const result = await response.json();
                                                                showNotification('error', 'Eroare', result.error || 'Eroare la refuzarea ofertei');
                                                              }
                                                            } catch (error: any) {
                                                              console.error('Error rejecting bid:', error);
                                                              showNotification('error', 'Eroare', 'Eroare la refuzarea ofertei: ' + (error.message || 'Eroare necunoscută'));
                                                            }
                                                          }}
                                                          className="px-3 py-1.5 text-xs font-medium rounded-lg bg-red-500 hover:bg-red-600 text-white transition-colors"
                                                        >
                                                          Refuză
                                                        </button>
                                                      </div>
                                                    )}
                                                    
                                                    <span className={`text-xs mt-1 block ${isMyBid ? 'text-right' : ''} text-gray-400`}>
                                                      {(() => {
                                                        const date = new Date(bid.created_at);
                                                        const now = new Date();
                                                        const diffMs = now.getTime() - date.getTime();
                                                        const diffMins = Math.floor(diffMs / 60000);
                                                        const diffHours = Math.floor(diffMs / 3600000);
                                                        const diffDays = Math.floor(diffMs / 86400000);
                                                        
                                                        if (diffMins < 1) return 'acum';
                                                        if (diffMins < 60) return `acum ${diffMins} min`;
                                                        if (diffHours < 24) return `acum ${diffHours} h`;
                                                        if (diffDays === 1) return 'acum 1 zi';
                                                        return `acum ${diffDays} zile`;
                                                      })()}
                                                    </span>
                                                  </div>
                                                </div>
                                              );
                                            }
                                          });
                                        })()}

                                        {/* Mesaj de sistem - articol indisponibil */}
                                        {bids.filter((b: any) => b.is_winning).length > 0 && (
                                          <div className="flex justify-center my-2">
                                            <div className="text-center">
                                              <p className="text-sm text-gray-600">Articolul nu este disponibil</p>
                                              <p className="text-xs text-gray-500">Articolul a fost vândut sau șters</p>
                                            </div>
                                          </div>
                                        )}
                                      </div>
                                      
                                      {/* Input pentru contraoferte */}
                                      <div className="p-3 border-t border-gray-200 bg-white">
                                        <div className="flex items-center gap-2">
                                          <button className="p-2 text-gray-500 hover:text-gray-700 transition-colors">
                                            <i className="ri-camera-line text-xl"></i>
                                          </button>
                                          <input
                                            type="text"
                                            value={newCounterOfferAmount[product.id] || ''}
                                            onChange={(e) => {
                                              const value: string = e.target.value;
                                              if (value === '' || /^\d*\.?\d*$/.test(value)) {
                                                setNewCounterOfferAmount(prev => ({
                                                  ...prev,
                                                  [product.id]: value
                                                }));
                                              }
                                            }}
                                            onKeyDown={async (e) => {
                                              if (e.key === 'Enter') {
                                                e.preventDefault();
                                                const value = newCounterOfferAmount[product.id];
                                                if (!value) return;
                                                
                                                const amount = parseFloat(value);
                                                if (isNaN(amount) || amount <= 0) return;
                                                if (!currentUserId) {
                                                  setShowCounterOfferAuthModal(true);
                                                  return;
                                                }
                                                try {
                                                  const response = await apiFetchWithSession('/api/bids', {
                                                    method: 'POST',
                                                    headers: {
                                                      'Content-Type': 'application/json',
                                                    },
                                                    body: JSON.stringify({
                                                      product_id: product.id,
                                                      amount: amount,
                                                    }),
                                                  });
                                                  
                                                  if (response.ok) {
                                                    const result = await response.json();
                                                    const bidId = (result as { bid?: { id?: string } })?.bid?.id;
                                                    const { trackGoogleConversion } = await import("@/lib/analytics/googleAds");
                                                    trackGoogleConversion("bid_created", bidId ? { dedupeKey: bidId } : undefined);
                                                    setNewCounterOfferAmount(prev => {
                                                      const newState = { ...prev };
                                                      delete newState[product.id];
                                                      return newState;
                                                    });
                                                    
                                                    // Adaugă mesaj prietenos în chat
                                                    const { data: userData } = await supabase.auth.getUser();
                                                    const userName = userData?.user?.user_metadata?.full_name || 
                                                      userData?.user?.user_metadata?.name || 
                                                      userData?.user?.email?.split('@')[0] || 
                                                      'Tu';
                                                    const messageId = `counter-offer-${Date.now()}`;
                                                    setChatSystemMessages(prev => ({
                                                      ...prev,
                                                      [product.id]: [
                                                        ...(prev[product.id] || []),
                                                        {
                                                          id: messageId,
                                                          message: `${userName} dorește să vă facă o contraofertă`,
                                                          timestamp: Date.now()
                                                        }
                                                      ]
                                                    }));
                                                    
                                                    await loadProductBids(product.id);
                                                    
                                                    // Verifică dacă ultimele 2 oferte sunt de la același utilizator
                                                    setTimeout(() => {
                                                      const currentBids = productBids[product.id] || [];
                                                      const sortedProductBids = [...currentBids].sort((a, b) => 
                                                        new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
                                                      );
                                                      
                                                      if (sortedProductBids.length >= 2) {
                                                        const lastBid = sortedProductBids[sortedProductBids.length - 1];
                                                        const secondLastBid = sortedProductBids[sortedProductBids.length - 2];
                                                        
                                                        // Dacă ultimele 2 oferte sunt de la același utilizator, adaugă mesaj roșu
                                                        if (lastBid.user_id === secondLastBid.user_id) {
                                                          const alertMessageId = `counter-offer-alert-${Date.now()}`;
                                                          setChatSystemMessages(prev => {
                                                            const existing = prev[product.id] || [];
                                                            const hasAlert = existing.some(m => m.isAlert && m.message.includes('altă'));
                                                            if (hasAlert) return prev;
                                                            return {
                                                              ...prev,
                                                              [product.id]: [
                                                                ...existing,
                                                                {
                                                                  id: alertMessageId,
                                                                  message: `S-a făcut o altă contraofertă`,
                                                                  timestamp: Date.now(),
                                                                  isAlert: true
                                                                }
                                                              ]
                                                            };
                                                          });
                                                        }
                                                      }
                                                    }, 500);
                                                  } else {
                                                    if (response.status === 401) {
                                                      setShowCounterOfferAuthModal(true);
                                                    } else {
                                                      const result = await response.json().catch(() => ({}));
                                                      showNotification(
                                                        'error',
                                                        'Eroare',
                                                        (result as { error?: string }).error || 'Eroare la trimiterea contraofertei'
                                                      );
                                                    }
                                                  }
                                                } catch (error: any) {
                                                  console.error('Error placing counter offer:', error);
                                                  showNotification('error', 'Eroare', 'Eroare la trimiterea contraofertei: ' + (error.message || 'Eroare necunoscută'));
                                                }
                                              }
                                            }}
                                            placeholder="Scrie un mesaj aici"
                                            className="flex-1 px-3 py-2 rounded-lg border bg-white border-gray-300 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                          />
                                          <button
                                            onClick={async () => {
                                              const value = newCounterOfferAmount[product.id];
                                              if (!value) return;
                                              
                                              const amount = parseFloat(value);
                                              if (isNaN(amount) || amount <= 0) return;
                                              if (!currentUserId) {
                                                setShowCounterOfferAuthModal(true);
                                                return;
                                              }
                                              try {
                                                const response = await apiFetchWithSession('/api/bids', {
                                                  method: 'POST',
                                                  headers: {
                                                    'Content-Type': 'application/json',
                                                  },
                                                  body: JSON.stringify({
                                                    product_id: product.id,
                                                    amount: amount,
                                                  }),
                                                });
                                                
                                                if (response.ok) {
                                                  const result = await response.json();
                                                  const bidId = (result as { bid?: { id?: string } })?.bid?.id;
                                                  const { trackGoogleConversion } = await import("@/lib/analytics/googleAds");
                                                  trackGoogleConversion("bid_created", bidId ? { dedupeKey: bidId } : undefined);
                                                  setNewCounterOfferAmount(prev => {
                                                    const newState = { ...prev };
                                                    delete newState[product.id];
                                                    return newState;
                                                  });
                                                  
                                                  // Adaugă mesaj prietenos în chat
                                                  const { data: userData } = await supabase.auth.getUser();
                                                  const userName = userData?.user?.user_metadata?.full_name || 
                                                    userData?.user?.user_metadata?.name || 
                                                    userData?.user?.email?.split('@')[0] || 
                                                    'Tu';
                                                  const messageId = `counter-offer-${Date.now()}`;
                                                  setChatSystemMessages(prev => ({
                                                    ...prev,
                                                    [product.id]: [
                                                      ...(prev[product.id] || []),
                                                      {
                                                        id: messageId,
                                                        message: `${userName} dorește să vă facă o contraofertă`,
                                                        timestamp: Date.now()
                                                      }
                                                    ]
                                                  }));
                                                  
                                                  await loadProductBids(product.id);
                                                } else {
                                                  if (response.status === 401) {
                                                    setShowCounterOfferAuthModal(true);
                                                  } else {
                                                    const result = await response.json().catch(() => ({}));
                                                    showNotification(
                                                      'error',
                                                      'Eroare',
                                                      (result as { error?: string }).error || 'Eroare la trimiterea contraofertei'
                                                    );
                                                  }
                                                }
                                              } catch (error: any) {
                                                console.error('Error placing counter offer:', error);
                                                showNotification('error', 'Eroare', 'Eroare la trimiterea contraofertei: ' + (error.message || 'Eroare necunoscută'));
                                              }
                                            }}
                                            className="p-2 text-blue-500 hover:text-blue-600 transition-colors"
                                          >
                                            <i className="ri-arrow-right-line text-xl"></i>
                                          </button>
                                        </div>
                                      </div>
                                    </>
                                  );
                                })()}
                              </div>
                              ) : (
                                <div className="flex-1 flex items-center justify-center">
                                  <div className="text-center py-4 text-gray-500">
                                    <i className="ri-inbox-line text-2xl mb-2"></i>
                                    <p className="text-xs">Selectează o conversație pentru a vedea ofertele</p>
                                  </div>
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
              </div>
            </div>

            {/* Mobile Card View - Design nou ca în imagine */}
            <div className="md:hidden space-y-2 sm:space-y-3">
              {paginatedProducts.map((product) => {
                const bids = productBids[product.id] || [];
                const winningBids = bids.filter((b: any) => b.is_winning);
                const highestBid = bids.length > 0 ? Math.max(...bids.map((b: any) => b.amount || 0)) : product.startingPrice;
                const isExpanded = expandedLiveBidProducts.has(product.id);
                const productImage = getProductDisplayImage(product);
                const hasImage = productImage && productImage !== '/no-image-placeholder.svg';
                
                return (
                  <div
                    key={product.id}
                    className={`rounded-lg border shadow-sm ${
                      product.status === 'inactive'
                        ? isDarkMode
                          ? 'bg-red-950/60 border-red-800/60'
                          : 'bg-red-50 border-red-200'
                        : isDarkMode
                        ? 'bg-gray-800 border-gray-700'
                        : 'bg-white border-gray-200'
                    }`}
                  >
                    {/* Card Content */}
                    <div className="p-3">
                      <div className="flex gap-3">
                        <div className="flex-shrink-0 flex items-start pt-0.5">
                          <input
                            type="checkbox"
                            checked={selectedProductIds.has(product.id)}
                            onChange={() => toggleSelect(product.id)}
                            className="rounded border-gray-400 text-blue-600 focus:ring-blue-500 mt-0.5"
                            aria-label={`Selectează ${product.title || product.id}`}
                          />
                        </div>
                        {/* Image Section - Left */}
                        <div className="flex-shrink-0 relative overflow-hidden rounded-lg">
                          {hasImage ? (
                            <>
                              <img
                                src={productImage}
                                alt={product.title}
                                className="w-20 h-20 object-cover rounded-lg"
                                onError={(e) => {
                                  (e.target as HTMLImageElement).src = '/no-image-placeholder.svg';
                                }}
                              />
                              {(product.status === 'sold' || product.status === 'reserved') && (
                                <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                                  <div
                                    className={`absolute left-1/2 top-1/2 transform -translate-x-1/2 -translate-y-1/2 -rotate-45 w-[180%] text-center py-0.5 px-1 border-2 rounded-sm uppercase tracking-wider font-black text-[8px] leading-none ${
                                      product.status === 'sold'
                                        ? 'border-emerald-600 text-emerald-600 bg-transparent'
                                        : 'border-amber-500 text-amber-600 bg-transparent'
                                    }`}
                                  >
                                    {product.status === 'sold' ? 'VÂNDUT' : 'REZERVAT'}
                                  </div>
                                </div>
                              )}
                              {product.isPremium && (
                                <span className="absolute top-0 right-0 inline-flex items-center gap-0.5 px-1 py-0.5 rounded-bl-lg rounded-tr-lg text-[9px] font-semibold bg-gradient-to-r from-yellow-500 to-yellow-600 text-white shadow-sm">
                                  <i className="ri-vip-crown-line text-[9px]"></i>
                                  <span>Premium</span>
                                </span>
                              )}
                            </>
                          ) : (
                            <div className="w-20 h-20 bg-gray-200 rounded-lg flex flex-col items-center justify-center relative">
                              <i className="ri-camera-line text-white text-xl mb-1"></i>
                              <span className="text-white text-[10px] font-medium">FĂRĂ IMAGINE</span>
                              {product.isPremium && (
                                <span className="absolute top-0 right-0 inline-flex items-center gap-0.5 px-1 py-0.5 rounded-bl-lg rounded-tr-lg text-[9px] font-semibold bg-gradient-to-r from-yellow-500 to-yellow-600 text-white shadow-sm">
                                  <i className="ri-vip-crown-line text-[9px]"></i>
                                  <span>Premium</span>
                                </span>
                              )}
                            </div>
                          )}
                        </div>

                        {/* Content Section - Middle */}
                        <div className="flex-1 min-w-0">
                          {/* Title */}
                          <h3 className={`text-sm font-semibold mb-1 line-clamp-2 ${
                            product.isPremium 
                              ? 'text-yellow-600'
                              : isDarkMode ? 'text-blue-400' : 'text-blue-600'
                          }`}>
                            <a
                              href={product.url || (product.slug ? `/live_bid/${product.slug}` : `#`)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="hover:underline"
                            >
                              {product.title || 'Fără titlu'}
                            </a>
                          </h3>
                          
                          {/* Premium Expiry */}
                          {product.isPremium && product.premiumUntil && (
                            <div className="mb-1">
                              <PremiumTimer premiumUntil={product.premiumUntil} isDarkMode={isDarkMode} />
                            </div>
                          )}
                          
                          {/* Price */}
                          <div className="mb-1">
                            <span className={`text-sm font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                              {formatPrice(product.startingPrice, product.currency)}
                            </span>
                          </div>
                          
                          {/* Category and Subcategory */}
                          <div className="flex flex-col">
                            <span className={`text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                              {product.category || 'Diverse'}
                            </span>
                            {product.subcategory && (
                              <span className={`text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                                {product.subcategory}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Actions Section - Right */}
                        <div className="flex flex-col items-end justify-between flex-shrink-0">
                          {/* Buttons Row */}
                          <div className="flex items-center gap-1.5">
                            {product.status === 'inactive' ? (
                              <>
                                <button
                                  onClick={() => handleActivateProduct(product.id)}
                                  title="Activează anunțul"
                                  className={`w-9 h-9 rounded-lg transition-colors flex items-center justify-center ${
                                    isDarkMode 
                                      ? 'bg-green-600 hover:bg-green-700 text-white' 
                                      : 'bg-green-500 hover:bg-green-600 text-white'
                                  }`}
                                >
                                  <i className="ri-eye-line text-base"></i>
                                </button>
{(product.status === 'inactive' || product.status === 'reserved' || product.status === 'sold') && (
                                    <button
                                      onClick={() => handleDeleteClick(product.id, product.title, product.status)}
                                      title="Șterge (ascunde) anunțul"
                                      className={`w-9 h-9 rounded-lg transition-colors flex items-center justify-center ${
                                        isDarkMode 
                                          ? 'bg-red-600 hover:bg-red-700 text-white' 
                                          : 'bg-red-500 hover:bg-red-600 text-white'
                                      }`}
                                    >
                                      <i className="ri-delete-bin-line text-base"></i>
                                    </button>
                                  )}
                                </>
                              ) : product.status === 'sold' ? (
                                /* Produs vândut (mobil): doar Șterge */
                                <button
                                  onClick={() => handleDeleteClick(product.id, product.title, product.status)}
                                  title="Șterge (ascunde) anunțul"
                                  className={`w-9 h-9 rounded-lg transition-colors flex items-center justify-center ${
                                    isDarkMode 
                                      ? 'bg-red-600 hover:bg-red-700 text-white' 
                                      : 'bg-red-500 hover:bg-red-600 text-white'
                                  }`}
                                >
                                  <i className="ri-delete-bin-line text-base"></i>
                                </button>
                            ) : (
                                <>
                                {product.productType === 'live-bid' && product.status === 'active' && (
                                  <button
                                    onClick={() => goToMyBids()}
                                    title="Vezi ofertele"
                                    className={`w-9 h-9 rounded-lg transition-all flex items-center justify-center ${
                                      isDarkMode 
                                        ? 'bg-green-600 hover:bg-green-700 text-white' 
                                        : 'bg-green-500 hover:bg-green-600 text-white'
                                    }`}
                                  >
                                    <i className="ri-arrow-right-line text-base"></i>
                                  </button>
                                )}
                                <button
                                  onClick={() => handleEdit(product.id)}
                                  title="Editează"
                                  className={`w-9 h-9 rounded-lg transition-colors flex items-center justify-center ${
                                    isDarkMode 
                                      ? 'bg-blue-600 hover:bg-blue-700 text-white' 
                                      : 'bg-blue-500 hover:bg-blue-600 text-white'
                                  }`}
                                >
                                  <i className="ri-edit-line text-base"></i>
                                </button>
                                <button
                                  onClick={() => handleMarkAsSold(product.id)}
                                  title="Marchează ca vândut"
                                  className={`w-9 h-9 rounded-lg transition-colors flex items-center justify-center ${
                                    isDarkMode 
                                      ? 'bg-emerald-600 hover:bg-emerald-700 text-white' 
                                      : 'bg-emerald-500 hover:bg-emerald-600 text-white'
                                  }`}
                                >
                                  <i className="ri-check-double-line text-base"></i>
                                </button>
                                <button
                                  onClick={() => handleDeleteClick(product.id, product.title, product.status)}
                                  title="Dezactivează anunțul"
                                  className={`w-9 h-9 rounded-lg transition-colors flex items-center justify-center ${
                                    isDarkMode 
                                      ? 'bg-amber-600 hover:bg-amber-700 text-white' 
                                      : 'bg-amber-500 hover:bg-amber-600 text-white'
                                  }`}
                                >
                                  <i className="ri-eye-off-line text-base"></i>
                                </button>
                                {(product.status === 'reserved' || (product.status as Product['status']) === 'sold') && (
                                  <button
                                    onClick={() => handleDeleteClick(product.id, product.title, product.status)}
                                    title="Șterge (ascunde) anunțul"
                                    className={`w-9 h-9 rounded-lg transition-colors flex items-center justify-center ${
                                      isDarkMode 
                                        ? 'bg-red-600 hover:bg-red-700 text-white' 
                                        : 'bg-red-500 hover:bg-red-600 text-white'
                                    }`}
                                  >
                                    <i className="ri-delete-bin-line text-base"></i>
                                  </button>
                                )}
                              </>
                            )}
                          </div>
                          
                          {/* COD ANUNT */}
                          <p className={`text-[10px] mt-1.5 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                            COD ANUNT: <span className="font-bold">{product.sku || 'N/A'}</span>
                          </p>
                          
                          {/* Date */}
                          <p className={`text-[10px] mt-0.5 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                            {product.createdAt ? new Date(product.createdAt).toLocaleString('ro-RO', {
                              day: '2-digit',
                              month: '2-digit',
                              year: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            }) : ''}
                          </p>
                        </div>
                      </div>
                    </div>
                    
                    {/* Oferte - Ultima ofertă + Istoric expandabil - Identic cu my-bids */}
                    {isExpanded && product.productType === 'live-bid' && (
                      <div id={`offers-panel-${product.id}`} className={`p-2 sm:p-3 lg:p-4`}>
                        {loadingBids[product.id] ? (
                          <div className="text-center py-4">
                            <div className={`animate-spin rounded-full h-6 w-6 border-b-2 mx-auto ${
                              isDarkMode ? 'border-blue-400' : 'border-blue-600'
                            }`}></div>
                            <p className={`mt-2 text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>Se încarcă ofertele...</p>
                          </div>
                        ) : bids.length > 0 ? (() => {
                          const sortedBids = bids.sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
                          const latestBid = sortedBids[0];
                          const historyBids = sortedBids.slice(1);
                          const isHistoryExpanded = expandedHistory[product.id] || false;
                          const isMyBid = latestBid.user_id === currentUserId;
                          const isCounterOffer = latestBid.user_id === product.user_id;
                          const lowestBid = Math.min(...bids.map((b: any) => b.amount || 0));
                          const isLowest = latestBid.amount === lowestBid && bids.length > 1;
                          const hasPreviousBuyerBids = bids.some((b: any) => 
                            b.user_id !== product.user_id && 
                            new Date(b.created_at).getTime() < new Date(latestBid.created_at).getTime()
                          );
                          const hasPreviousSellerBids = bids.some((b: any) => 
                            b.user_id === product.user_id && 
                            new Date(b.created_at).getTime() < new Date(latestBid.created_at).getTime()
                          );
                          
                          return (
                            <>
                              {/* Ultima ofertă */}
                              <div
                                className={`p-1.5 sm:p-2 lg:p-3 rounded-lg sm:rounded-xl transition-all duration-200 mb-2 ${
                                  latestBid.is_winning
                                    ? isDarkMode
                                      ? 'bg-gradient-to-r from-green-900/40 via-green-800/30 to-green-900/40 border border-green-500/40 shadow-lg shadow-green-500/10'
                                      : 'bg-gradient-to-r from-green-50 via-white to-green-50/50 border border-green-300/60 shadow-md shadow-green-200/30'
                                    : isDarkMode
                                    ? 'bg-gray-700/50 border border-gray-600/50 hover:border-gray-500/70 hover:bg-gray-700/70'
                                    : 'bg-white border border-gray-200/60 hover:border-gray-300 hover:shadow-md'
                                }`}>
                                <div className="mb-1.5 sm:mb-2">
                                  {/* Suma și butoanele pe același rând */}
                                  <div className="flex items-center justify-between gap-2 mb-1.5 sm:mb-2">
                                    <div className={`text-base sm:text-lg lg:text-xl font-bold ${
                                      isDarkMode ? 'text-white' : 'text-gray-900'
                                    }`}>
                                      {formatPrice(latestBid.amount, product.currency)}
                                    </div>
                                    <div className="flex flex-wrap items-center gap-1 sm:gap-1.5 flex-shrink-0">
                                      {/* Badge Contraoferta - Albastru pentru vânzător */}
                                      {isCounterOffer && hasPreviousBuyerBids && (
                                        <div className="relative group">
                                          <span className={`px-1.5 py-0.5 sm:px-2 sm:py-1 rounded-lg text-xs font-semibold flex items-center gap-0.5 sm:gap-1 shadow-md ${
                                            isDarkMode
                                              ? 'bg-gradient-to-r from-blue-500 to-blue-600 text-white shadow-blue-500/30'
                                              : 'bg-gradient-to-r from-blue-400 to-blue-500 text-white shadow-blue-400/40'
                                          }`}>
                                            <i className="ri-arrow-left-right-line text-xs"></i>
                                            <span>Contraoferta vânzătorului</span>
                                          </span>
                                        </div>
                                      )}
                                      {/* Badge Contraoferta - Roșu pentru cumpărător */}
                                      {!isCounterOffer && isMyBid && hasPreviousSellerBids && (
                                        <div className="relative group">
                                          <span className={`px-1.5 py-0.5 sm:px-2 sm:py-1 rounded-lg text-xs font-semibold flex items-center gap-0.5 sm:gap-1 shadow-md ${
                                            isDarkMode
                                              ? 'bg-gradient-to-r from-red-500 to-red-600 text-white shadow-red-500/30'
                                              : 'bg-gradient-to-r from-red-400 to-red-500 text-white shadow-red-400/40'
                                          }`}>
                                            <i className="ri-arrow-left-right-line text-xs"></i>
                                            <span>Contraoferta ta</span>
                                          </span>
                                        </div>
                                      )}
                                      {/* Badge Cea mai mare ofertă */}
                                      {!isCounterOffer && latestBid.amount === highestBid && (
                                        <div className="relative group">
                                          <span className={`px-1.5 py-0.5 sm:px-2 sm:py-1 rounded-lg text-xs font-semibold flex items-center gap-0.5 sm:gap-1 shadow-md ${
                                            isDarkMode
                                              ? 'bg-gradient-to-r from-yellow-500 to-yellow-600 text-white shadow-yellow-500/30'
                                              : 'bg-gradient-to-r from-yellow-400 to-yellow-500 text-white shadow-yellow-400/40'
                                          }`}>
                                            <i className="ri-arrow-up-line text-xs"></i>
                                            <span>Cea mai mare ofertă</span>
                                          </span>
                                        </div>
                                      )}
                                      {/* Badge Cea mai mică ofertă */}
                                      {!isCounterOffer && isLowest && (
                                        <div className="relative group">
                                          <span className={`px-1.5 py-0.5 sm:px-2 sm:py-1 rounded-lg text-xs font-semibold flex items-center gap-0.5 sm:gap-1 shadow-md ${
                                            isDarkMode
                                              ? 'bg-gradient-to-r from-red-500 to-red-600 text-white shadow-red-500/30'
                                              : 'bg-gradient-to-r from-red-400 to-red-500 text-white shadow-red-400/40'
                                          }`}>
                                            <i className="ri-arrow-down-line text-xs"></i>
                                            <span>Cea mai mică ofertă</span>
                                          </span>
                                        </div>
                                      )}
                                      {/* Badge Acceptată */}
                                      {latestBid.is_winning && (
                                        <div className="relative group">
                                          <span className={`px-1.5 py-0.5 sm:px-2 sm:py-1 rounded-lg text-xs font-semibold flex items-center gap-0.5 sm:gap-1 shadow-md ${
                                            isDarkMode
                                              ? 'bg-gradient-to-r from-green-600 to-green-700 text-white shadow-green-500/30'
                                              : 'bg-gradient-to-r from-green-500 to-green-600 text-white shadow-green-400/40'
                                          }`}>
                                            <i className="ri-checkbox-circle-line text-xs"></i>
                                            <span>Acceptată</span>
                                          </span>
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                </div>
                                {/* Răzgândire - pentru ofertele acceptate temporar */}
                                {acceptedBids[product.id]?.bidId === latestBid.id && countdowns[product.id] !== null && countdowns[product.id] !== undefined && countdowns[product.id] > 0 && (
                                  <div className={`mt-2 px-2 py-1.5 sm:px-3 sm:py-2 rounded-lg text-xs sm:text-sm font-semibold flex items-center gap-1.5 sm:gap-2 shadow-md ${
                                    isDarkMode
                                      ? 'bg-gradient-to-r from-yellow-600/20 to-yellow-500/20 border border-yellow-500/40 text-yellow-300'
                                      : 'bg-gradient-to-r from-yellow-50 to-yellow-100/50 border border-yellow-300/60 text-yellow-700'
                                  }`}>
                                    <i className="ri-time-line animate-pulse text-xs sm:text-sm"></i>
                                    <span>Răzgândire: {Math.floor((countdowns[product.id] || 0) / 60)}:{((countdowns[product.id] || 0) % 60).toString().padStart(2, '0')}</span>
                                  </div>
                                )}
                                {/* Buton Anulează - pentru ofertele acceptate temporar */}
                                {acceptedBids[product.id]?.bidId === latestBid.id && countdowns[product.id] !== null && countdowns[product.id] !== undefined && countdowns[product.id] > 0 && (
                                  <div className="mt-2">
                                    <button
                                      onClick={() => handleCancelAccept(product.id, latestBid.id)}
                                      className={`w-full px-2 py-1.5 sm:px-3 sm:py-2 rounded-lg text-xs sm:text-sm font-semibold transition-all duration-200 flex items-center justify-center gap-1.5 sm:gap-2 shadow-md ${
                                        isDarkMode
                                          ? 'bg-gradient-to-r from-red-600 to-red-700 hover:from-red-500 hover:to-red-600 text-white shadow-red-500/30 hover:shadow-lg hover:shadow-red-500/40 hover:scale-105 active:scale-95'
                                          : 'bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white shadow-red-400/40 hover:shadow-lg hover:shadow-red-500/50 hover:scale-105 active:scale-95'
                                      }`}
                                    >
                                      <i className="ri-close-line text-xs sm:text-sm"></i>
                                      <span>Anulează</span>
                                    </button>
                                  </div>
                                )}
                                {/* Informații utilizator - sub suma și butoanele */}
                                <div className="flex items-center justify-between gap-2">
                                  <div className="flex items-center gap-1.5 sm:gap-2 flex-1 min-w-0">
                                    {/* Avatar */}
                                    <div className="relative flex-shrink-0">
                                      {latestBid.user_profiles?.avatar_url ? (
                                        <img
                                          src={latestBid.user_profiles.avatar_url}
                                          alt={latestBid.user_profiles.first_name || latestBid.user_profiles.last_name || 'Utilizator'}
                                          className={`w-7 h-7 sm:w-8 sm:h-8 lg:w-10 lg:h-10 rounded-full object-cover border-2 shadow-md ${
                                            isDarkMode ? 'border-gray-600' : 'border-gray-200'
                                          }`}
                                          onError={(e) => {
                                            const target = e.target as HTMLImageElement;
                                            target.style.display = 'none';
                                            const fallback = target.nextElementSibling as HTMLElement;
                                            if (fallback) fallback.style.display = 'flex';
                                          }}
                                        />
                                      ) : null}
                                      <div className={`w-7 h-7 sm:w-8 sm:h-8 lg:w-10 lg:h-10 rounded-full flex items-center justify-center text-xs font-bold shadow-md ${
                                        latestBid.user_profiles?.avatar_url ? 'hidden' : ''
                                      } ${
                                        isDarkMode
                                          ? 'bg-gradient-to-br from-gray-600 to-gray-700 text-gray-200 border border-gray-500' 
                                          : 'bg-gradient-to-br from-gray-300 to-gray-400 text-gray-700 border border-gray-200'
                                      }`}>
                                        {isMyBid ? 'E' : (
                                          latestBid.user_profiles?.first_name 
                                            ? latestBid.user_profiles.first_name[0].toUpperCase()
                                            : latestBid.user_profiles?.last_name
                                            ? latestBid.user_profiles.last_name[0].toUpperCase()
                                            : 'U'
                                        )}
                                      </div>
                                      <div className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 sm:w-3 sm:h-3 bg-green-500 rounded-full border-2 ${
                                        isDarkMode ? 'border-gray-800' : 'border-white'
                                      }`}></div>
                                    </div>
                                    {/* Nume */}
                                    <div className="min-w-0 flex-1">
                                      <div className={`text-xs sm:text-sm font-semibold truncate ${
                                        isDarkMode ? 'text-gray-100' : 'text-gray-800'
                                      }`}>
                                        {isMyBid ? 'Eu' : (
                                          latestBid.user_profiles 
                                            ? `${latestBid.user_profiles.first_name || ''} ${latestBid.user_profiles.last_name || ''}`.trim() || 'Utilizator'
                                            : 'Utilizator'
                                        )}
                                      </div>
                                      <div className={`text-xs flex items-center gap-1 mt-0.5 ${
                                        isDarkMode ? 'text-gray-400' : 'text-gray-500'
                                      }`}>
                                        <i className="ri-time-line text-xs"></i>
                                        {formatDate(latestBid.created_at)}
                                      </div>
                                    </div>
                                  </div>
                                  {/* Butoane active - în partea de jos dreapta */}
                                  <div className="flex items-center gap-1 sm:gap-1.5 flex-shrink-0">
                                    {!latestBid.is_winning && !isCounterOffer && (
                                      <button
                                        onClick={() => handleAcceptBid(product.id, latestBid.id, latestBid.amount)}
                                        disabled={acceptedBids[product.id] !== undefined}
                                        className={`px-1.5 py-1 sm:px-2 sm:py-1.5 rounded-lg text-xs font-semibold transition-all duration-200 flex items-center gap-0.5 sm:gap-1 shadow-md hover:shadow-lg hover:scale-105 active:scale-95 ${
                                          acceptedBids[product.id] !== undefined
                                            ? isDarkMode
                                              ? 'bg-gray-600/50 text-gray-400 cursor-not-allowed border border-gray-600/50'
                                              : 'bg-gray-200 text-gray-500 cursor-not-allowed border border-gray-300'
                                            : isDarkMode
                                            ? 'bg-gradient-to-r from-green-600 to-green-700 hover:from-green-500 hover:to-green-600 text-white shadow-green-500/30'
                                            : 'bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white shadow-green-400/40'
                                        }`}
                                      >
                                        <i className="ri-check-line text-xs"></i>
                                        <span>Acceptă</span>
                                      </button>
                                    )}
                                    {!isCounterOffer && (
                                      <button
                                        onClick={() => {
                                          const buyerName = latestBid.user_profiles 
                                            ? `${latestBid.user_profiles.first_name || ''} ${latestBid.user_profiles.last_name || ''}`.trim() || 'Cumpărător'
                                            : 'Cumpărător';
                                          handleOpenChat(product.id, latestBid.user_id, {
                                            name: buyerName,
                                            avatar: latestBid.user_profiles?.avatar_url,
                                          });
                                        }}
                                        className={`px-1.5 py-1 sm:px-2 sm:py-1.5 rounded-lg text-xs font-semibold transition-all duration-200 flex items-center gap-0.5 sm:gap-1 shadow-md hover:shadow-lg hover:scale-105 active:scale-95 ${
                                          isDarkMode
                                            ? 'bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-500 hover:to-blue-600 text-white border border-blue-500/30'
                                            : 'bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white border border-sky-400/30'
                                        }`}
                                      >
                                        <i className="ri-message-3-line text-xs"></i>
                                        <span>Chat</span>
                                      </button>
                                    )}
                                  </div>
                                </div>
                              </div>
                              
                              {/* Buton Istoric - doar dacă există oferte în istoric */}
                              {historyBids.length > 0 && (
                                <>
                                  <div className="mt-2">
                                    <button
                                      onClick={() => {
                                        setExpandedHistory(prev => ({
                                          ...prev,
                                          [product.id]: !prev[product.id]
                                        }));
                                      }}
                                      className={`w-full px-3 py-2 rounded-lg text-xs sm:text-sm font-semibold transition-all duration-200 flex items-center justify-center gap-2 ${
                                        isDarkMode
                                          ? 'bg-gray-700/50 hover:bg-gray-700/70 text-gray-300 border border-gray-600/50'
                                          : 'bg-gray-100 hover:bg-gray-200 text-gray-700 border border-gray-300'
                                      }`}
                                    >
                                      <i className={`ri-${isHistoryExpanded ? 'arrow-up' : 'arrow-down'}-s-line text-sm`}></i>
                                      <span>Istoric ({historyBids.length} {historyBids.length === 1 ? 'ofertă' : 'oferte'})</span>
                                    </button>
                                  </div>
                                  
                                  {/* Istoric oferte - expandabil */}
                                  {isHistoryExpanded && historyBids.length > 0 && (
                                    <div className="mt-2 space-y-1.5 sm:space-y-2">
                                      {historyBids.map((bid: any) => {
                                        const isMyBidHist = bid.user_id === currentUserId;
                                        const isCounterOfferHist = bid.user_id === product.user_id;
                                        const hasPrevBuyerBids = bids.some((b: any) => 
                                          b.user_id !== product.user_id && 
                                          new Date(b.created_at).getTime() < new Date(bid.created_at).getTime()
                                        );
                                        const hasPrevSellerBids = bids.some((b: any) => 
                                          b.user_id === product.user_id && 
                                          new Date(b.created_at).getTime() < new Date(bid.created_at).getTime()
                                        );
                                        
                                        return (
                                          <div
                                            key={bid.id}
                                            className={`p-1.5 sm:p-2 lg:p-3 rounded-lg sm:rounded-xl transition-all duration-200 ${
                                              bid.is_winning
                                                ? isDarkMode
                                                  ? 'bg-gradient-to-r from-green-900/40 via-green-800/30 to-green-900/40 border border-green-500/40 shadow-lg shadow-green-500/10'
                                                  : 'bg-gradient-to-r from-green-50 via-white to-green-50/50 border border-green-300/60 shadow-md shadow-green-200/30'
                                                : isDarkMode
                                                ? 'bg-gray-700/50 border border-gray-600/50 hover:border-gray-500/70 hover:bg-gray-700/70'
                                                : 'bg-white border border-gray-200/60 hover:border-gray-300 hover:shadow-md'
                                            }`}
                                          >
                                            <div className="mb-1.5 sm:mb-2">
                                              <div className="flex items-center justify-between gap-2 mb-1.5 sm:mb-2">
                                                <div className={`text-base sm:text-lg lg:text-xl font-bold ${
                                                  isDarkMode ? 'text-white' : 'text-gray-900'
                                                }`}>
                                                  {formatPrice(bid.amount, product.currency)}
                                                </div>
                                                <div className="flex flex-wrap items-center gap-1 sm:gap-1.5 flex-shrink-0">
                                                  {isCounterOfferHist && hasPrevBuyerBids && (
                                                    <span className={`px-1.5 py-0.5 sm:px-2 sm:py-1 rounded-lg text-xs font-semibold flex items-center gap-0.5 sm:gap-1 shadow-md ${
                                                      isDarkMode
                                                        ? 'bg-gradient-to-r from-blue-500 to-blue-600 text-white shadow-blue-500/30'
                                                        : 'bg-gradient-to-r from-blue-400 to-blue-500 text-white shadow-blue-400/40'
                                                    }`}>
                                                      <i className="ri-arrow-left-right-line text-xs"></i>
                                                      <span>Contraoferta vânzătorului</span>
                                                    </span>
                                                  )}
                                                  {!isCounterOfferHist && isMyBidHist && hasPrevSellerBids && (
                                                    <span className={`px-1.5 py-0.5 sm:px-2 sm:py-1 rounded-lg text-xs font-semibold flex items-center gap-0.5 sm:gap-1 shadow-md ${
                                                      isDarkMode
                                                        ? 'bg-gradient-to-r from-red-500 to-red-600 text-white shadow-red-500/30'
                                                        : 'bg-gradient-to-r from-red-400 to-red-500 text-white shadow-red-400/40'
                                                    }`}>
                                                      <i className="ri-arrow-left-right-line text-xs"></i>
                                                      <span>Contraoferta ta</span>
                                                    </span>
                                                  )}
                                                  {bid.is_winning && (
                                                    <span className={`px-1.5 py-0.5 sm:px-2 sm:py-1 rounded-lg text-xs font-semibold flex items-center gap-0.5 sm:gap-1 shadow-md ${
                                                      isDarkMode
                                                        ? 'bg-gradient-to-r from-green-600 to-green-700 text-white shadow-green-500/30'
                                                        : 'bg-gradient-to-r from-green-500 to-green-600 text-white shadow-green-400/40'
                                                    }`}>
                                                      <i className="ri-checkbox-circle-line text-xs"></i>
                                                      <span>Acceptată</span>
                                                    </span>
                                                  )}
                                                </div>
                                              </div>
                                            </div>
                                            <div className="flex items-center justify-between gap-2">
                                              <div className="flex items-center gap-1.5 sm:gap-2 flex-1 min-w-0">
                                                <div className="relative flex-shrink-0">
                                                  {bid.user_profiles?.avatar_url ? (
                                                    <img
                                                      src={bid.user_profiles.avatar_url}
                                                      alt={bid.user_profiles.first_name || bid.user_profiles.last_name || 'Utilizator'}
                                                      className={`w-7 h-7 sm:w-8 sm:h-8 rounded-full object-cover border-2 shadow-md ${
                                                        isDarkMode ? 'border-gray-600' : 'border-gray-200'
                                                      }`}
                                                      onError={(e) => {
                                                        const target = e.target as HTMLImageElement;
                                                        target.style.display = 'none';
                                                        const fallback = target.nextElementSibling as HTMLElement;
                                                        if (fallback) fallback.style.display = 'flex';
                                                      }}
                                                    />
                                                  ) : null}
                                                  <div className={`w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center text-xs font-bold shadow-md ${
                                                    bid.user_profiles?.avatar_url ? 'hidden' : ''
                                                  } ${
                                                    isDarkMode
                                                      ? 'bg-gradient-to-br from-gray-600 to-gray-700 text-gray-200 border border-gray-500' 
                                                      : 'bg-gradient-to-br from-gray-300 to-gray-400 text-gray-700 border border-gray-200'
                                                  }`}>
                                                    {isMyBidHist ? 'E' : (
                                                      bid.user_profiles?.first_name 
                                                        ? bid.user_profiles.first_name[0].toUpperCase()
                                                        : bid.user_profiles?.last_name
                                                        ? bid.user_profiles.last_name[0].toUpperCase()
                                                        : 'U'
                                                    )}
                                                  </div>
                                                  <div className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 sm:w-3 sm:h-3 bg-green-500 rounded-full border-2 ${
                                                    isDarkMode ? 'border-gray-800' : 'border-white'
                                                  }`}></div>
                                                </div>
                                                <div className="min-w-0 flex-1">
                                                  <div className={`text-xs sm:text-sm font-semibold truncate ${
                                                    isDarkMode ? 'text-gray-100' : 'text-gray-800'
                                                  }`}>
                                                    {isMyBidHist ? 'Eu' : (
                                                      bid.user_profiles 
                                                        ? `${bid.user_profiles.first_name || ''} ${bid.user_profiles.last_name || ''}`.trim() || 'Utilizator'
                                                        : 'Utilizator'
                                                    )}
                                                  </div>
                                                  <div className={`text-xs flex items-center gap-1 mt-0.5 ${
                                                    isDarkMode ? 'text-gray-400' : 'text-gray-500'
                                                  }`}>
                                                    <i className="ri-time-line text-xs"></i>
                                                    {formatDate(bid.created_at)}
                                                  </div>
                                                </div>
                                              </div>
                                              {!isCounterOfferHist && (
                                                <button
                                                  onClick={() => {
                                                    const buyerName = bid.user_profiles 
                                                      ? `${bid.user_profiles.first_name || ''} ${bid.user_profiles.last_name || ''}`.trim() || 'Cumpărător'
                                                      : 'Cumpărător';
                                                    handleOpenChat(product.id, bid.user_id, {
                                                      name: buyerName,
                                                      avatar: bid.user_profiles?.avatar_url,
                                                    });
                                                  }}
                                                  className={`px-1.5 py-1 sm:px-2 sm:py-1.5 rounded-lg text-xs font-semibold transition-all duration-200 flex items-center gap-0.5 sm:gap-1 shadow-md hover:shadow-lg hover:scale-105 active:scale-95 ${
                                                    isDarkMode
                                                      ? 'bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-500 hover:to-blue-600 text-white border border-blue-500/30'
                                                      : 'bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white border border-sky-400/30'
                                                  }`}
                                                >
                                                  <i className="ri-message-3-line text-xs"></i>
                                                  <span>Chat</span>
                                                </button>
                                              )}
                                            </div>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  )}
                                </>
                              )}
                            </>
                          );
                        })() : null}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* Calculate derived values for discount and exchange rate display - before modal JSX */}
        {(() => {
          // These variables need to be calculated before being used in JSX
          const manualFormDiscountInputsDisabled = manualFormPriceRon <= 0 && manualFormPriceEur <= 0;
          const manualFormEffectiveRateValue = getManualFormEffectiveRate();
          const manualFormInverseRateValue = manualFormEffectiveRateValue && manualFormEffectiveRateValue > 0 ? roundTo(1 / manualFormEffectiveRateValue, 4) : null;
          const manualFormDerivedDiscountValueEur = manualFormDiscountValueRon !== null && manualFormEffectiveRateValue ? roundTo(manualFormDiscountValueRon / manualFormEffectiveRateValue) : null;
          const manualFormDerivedDiscountedPriceEur = manualFormDiscountedPriceRon !== null && manualFormEffectiveRateValue ? roundTo(manualFormDiscountedPriceRon / manualFormEffectiveRateValue) : null;
          return null; // This IIFE is just for variable calculation
        })()}

        {/* Modal Adaugă Listare – același shell ca modalul Contact */}
        {showManualAddModal && (() => {
          const closeManualListingModal = () => {
            closeManualImagePreview();
            setEditingProductId(null);
            setEditingProductRow(null);
            setShowManualAddModal(false);
          };
          return (
            <div
              className="fixed inset-0 z-[200000] box-border flex min-h-0 max-h-[100dvh] max-sm:items-stretch max-sm:justify-start max-sm:p-0 overflow-y-auto overscroll-y-contain sm:items-center sm:justify-center sm:pt-[calc(env(safe-area-inset-top,0px)+12px)] sm:pb-[calc(env(safe-area-inset-bottom,0px)+12px)] sm:pl-[calc(env(safe-area-inset-left,0px)+12px)] sm:pr-[calc(env(safe-area-inset-right,0px)+12px)]"
              style={{
                background: isDarkMode ? 'rgba(0, 0, 0, 0.55)' : 'rgba(15, 23, 42, 0.35)',
                backdropFilter: 'blur(8px)',
                WebkitBackdropFilter: 'blur(8px)',
                WebkitOverflowScrolling: 'touch',
              }}
            >
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="manual-listing-modal-title"
              className={`relative box-border flex min-h-0 w-full max-w-full flex-col overflow-hidden rounded-xl border shadow-[0_24px_64px_-16px_rgba(0,0,0,0.18)] max-sm:min-h-[100dvh] max-sm:max-h-[100dvh] max-sm:rounded-none max-sm:border-0 max-sm:shadow-none sm:max-h-[min(90dvh,90svh,calc(100svh-env(safe-area-inset-top,0px)-env(safe-area-inset-bottom,0px)-24px),calc(100dvh-env(safe-area-inset-top,0px)-env(safe-area-inset-bottom,0px)-24px))] sm:max-w-3xl sm:rounded-2xl md:max-w-5xl lg:max-w-6xl ${
                isDarkMode
                  ? 'border-zinc-800 bg-zinc-950 shadow-black/50 max-sm:bg-zinc-950'
                  : 'border-stone-200/90 bg-white max-sm:bg-white'
              }`}
              onClick={(e) => e.stopPropagation()}
            >

              <div className="relative z-10 flex min-h-0 flex-1 flex-col overflow-hidden">
              <div
                className={`sticky top-0 z-30 flex shrink-0 items-center justify-between border-b px-3 py-3 max-sm:pt-[max(0.75rem,env(safe-area-inset-top,0px))] sm:relative sm:top-auto sm:z-auto sm:px-6 sm:py-5 ${
                  isDarkMode
                    ? 'border-zinc-800/90 bg-zinc-950/90 backdrop-blur-xl supports-[backdrop-filter]:bg-zinc-950/75 sm:bg-zinc-950'
                    : 'border-stone-100 bg-white/90 backdrop-blur-xl supports-[backdrop-filter]:bg-white/80 sm:bg-white'
                }`}
              >
                <div className="flex min-w-0 flex-1 items-center gap-2 pr-1 sm:gap-4 sm:pr-2">
                  <div
                    className={`flex shrink-0 items-center justify-center ${
                      isPieseAuto
                        ? isDarkMode
                          ? 'h-11 w-11 rounded-xl border border-zinc-600/50 bg-zinc-950 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] sm:h-16 sm:w-16 sm:rounded-2xl'
                          : 'h-11 w-11 rounded-xl border border-stone-200/90 bg-white text-stone-900 shadow-[0_2px_12px_rgba(0,0,0,0.06)] sm:h-16 sm:w-16 sm:rounded-2xl'
                        : isDarkMode
                          ? 'h-9 w-9 rounded-full bg-zinc-800 text-zinc-200 sm:h-11 sm:w-11'
                          : 'h-9 w-9 rounded-full bg-stone-100 text-stone-700 sm:h-11 sm:w-11'
                    }`}
                  >
                    <i
                      className={
                        isPieseAuto
                          ? 'ri-steering-2-fill text-[1.35rem] leading-none sm:text-[1.9rem]'
                          : 'ri-auction-line text-lg sm:text-xl'
                      }
                      aria-hidden
                    />
                  </div>
                  <div className="min-w-0">
                    {isPieseAuto ? (
                      <p
                        className={`text-[10px] font-medium uppercase tracking-[0.2em] ${
                          isDarkMode ? 'text-zinc-500' : 'text-stone-400'
                        }`}
                      >
                        Piese auto
                      </p>
                    ) : (
                      <p
                        className={`text-[10px] font-medium uppercase tracking-[0.2em] ${
                          isDarkMode ? 'text-zinc-500' : 'text-stone-400'
                        }`}
                      >
                        Live Bid
                      </p>
                    )}
                    <h2
                      id="manual-listing-modal-title"
                      className={`truncate text-base font-semibold tracking-tight sm:text-lg md:text-xl ${
                        isDarkMode ? 'text-zinc-50' : 'text-stone-900'
                      }`}
                    >
                      {editingProductId ? 'Editează anunț' : 'Adaugă Listare'}
                    </h2>
                    {isPieseAuto ? (
                      <p
                        className={`mt-0.5 line-clamp-2 text-[11px] leading-snug sm:mt-1 sm:text-xs sm:leading-relaxed ${
                          isDarkMode ? 'text-zinc-400' : 'text-stone-500'
                        }`}
                      >
                        {PIESE_AUTO_FORM_CATEGORY_DISPLAY} · {PIESE_AUTO_FORM_SUBCATEGORY_DISPLAY}
                        {String(manualFormData.customFields?.tipPiesa ?? '').trim()
                          ? ` · ${String(manualFormData.customFields?.tipPiesa).trim()}`
                          : ''}
                      </p>
                    ) : null}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={closeManualListingModal}
                  className={`touch-manipulation shrink-0 rounded-full p-2.5 transition-colors min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 sm:p-3 ${
                    isDarkMode
                      ? 'text-red-400 hover:bg-red-950/50 hover:text-red-300'
                      : 'text-red-500 hover:bg-red-50 hover:text-red-600'
                  }`}
                  aria-label="Închide"
                >
                  <i className="ri-close-line text-[1.35rem] leading-none sm:text-2xl sm:leading-none md:text-[1.75rem]" aria-hidden />
                </button>
              </div>

              <div
                className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain touch-pan-y pb-4 sm:pb-[max(12px,env(safe-area-inset-bottom,0px))]"
                style={{ WebkitOverflowScrolling: 'touch' }}
              >
                <div className={`px-4 py-4 sm:p-6 md:p-8 ${
                  isDarkMode ? 'bg-zinc-950' : 'bg-stone-50/70'
                }`}>
                  {manualFormMessage && (
                    <div className={`mb-4 rounded-lg border px-3 py-2.5 text-sm sm:mb-6 sm:rounded-xl sm:px-4 sm:py-3 ${
                      isDarkMode
                        ? manualFormMessage.type === 'success'
                          ? 'border-emerald-500/25 bg-emerald-950/40 text-emerald-300'
                          : 'border-red-500/25 bg-red-950/30 text-red-300'
                        : manualFormMessage.type === 'success'
                          ? 'border-emerald-200/80 bg-emerald-50/90 text-emerald-800'
                          : 'border-red-200/80 bg-red-50/90 text-red-800'
                    }`}>
                      <div className="flex items-center gap-2">
                        {manualFormMessage.type === 'success' ? (
                          <i className="ri-checkbox-circle-line text-lg"></i>
                        ) : (
                          <i className="ri-error-warning-line text-lg"></i>
                        )}
                        <span>{manualFormMessage.text}</span>
                      </div>
                    </div>
                  )}

                  <form id="manual-listing-form" onSubmit={handleManualFormSubmit} className="space-y-5 sm:space-y-8">
                    <div className="space-y-4 sm:space-y-5">
                      <p className={`text-xs font-medium ${isDarkMode ? 'text-zinc-500' : 'text-stone-500'}`}>
                        Detalii anunț
                      </p>
                      <div className="grid grid-cols-1 gap-5 sm:gap-8 md:grid-cols-2 md:gap-10">
                        <div className="space-y-4 sm:space-y-5">
                          <div>
                            <label className={`mb-1.5 block text-sm font-medium ${isDarkMode ? 'text-zinc-300' : 'text-stone-800'}`}>
                              Titlu <span className="text-red-500">*</span>
                              <span className={`ml-1 font-normal ${isDarkMode ? 'text-zinc-500' : 'text-stone-400'}`}>
                                (max. {MANUAL_PRODUCT_TITLE_MAX_LENGTH})
                              </span>
                            </label>
                            <input
                              type="text"
                              name="title"
                              value={manualFormData.title}
                              onChange={handleManualFormInputChange}
                              onBlur={(e) => handleManualFormTitleBlur((e.target as HTMLInputElement).value, manualFormData.description)}
                              className={`w-full rounded-xl border px-3 py-2.5 text-base transition-colors focus:outline-none focus:ring-2 sm:text-sm ${
                                isDarkMode
                                  ? 'border-zinc-700 bg-zinc-900/80 text-zinc-100 placeholder:text-zinc-500 focus:border-zinc-500 focus:ring-white/[0.06]'
                                  : 'border-stone-200 bg-white text-stone-900 placeholder:text-stone-400 focus:border-stone-400 focus:ring-stone-900/[0.06]'
                              }`}
                              placeholder="Ex. Far stânga pentru Audi A4 B8"
                              maxLength={MANUAL_PRODUCT_TITLE_MAX_LENGTH}
                              required
                            />
                            <p className={`mt-1 text-xs tabular-nums ${isDarkMode ? 'text-zinc-600' : 'text-stone-400'}`}>
                              {manualFormData.title.length}/{MANUAL_PRODUCT_TITLE_MAX_LENGTH}
                            </p>
                          </div>
                          <div>
                            <label className={`mb-1.5 block text-sm font-medium ${isDarkMode ? 'text-zinc-300' : 'text-stone-800'}`}>
                              Descriere <span className="text-red-500">*</span>
                            </label>
                            <textarea
                              name="description"
                              value={manualFormData.description}
                              onChange={handleManualFormInputChange}
                              onFocus={() => handleManualFormTitleBlur(manualFormData.title, manualFormData.description)}
                              onBlur={(e) => handleManualFormTitleBlur(manualFormData.title, (e.target as HTMLTextAreaElement).value)}
                              rows={4}
                              className={`w-full rounded-xl border px-3 py-2.5 text-base transition-colors focus:outline-none focus:ring-2 sm:text-sm ${
                                isDarkMode
                                  ? 'border-zinc-700 bg-zinc-900/80 text-zinc-100 placeholder:text-zinc-500 focus:border-zinc-500 focus:ring-white/[0.06]'
                                  : 'border-stone-200 bg-white text-stone-900 placeholder:text-stone-400 focus:border-stone-400 focus:ring-stone-900/[0.06]'
                              }`}
                              placeholder="Stare, cod piesă, compatibilitate, livrare…"
                              required
                            />
                          </div>
                        </div>

                        <div>
                          <label className={`mb-1.5 block text-sm font-medium ${isDarkMode ? 'text-zinc-300' : 'text-stone-800'}`}>
                            Preț <span className="text-red-500">*</span>
                          </label>
                          {manualFormExchangeError && (
                            <p className={`mt-1 text-xs ${isDarkMode ? 'text-red-400' : 'text-red-600'}`}>
                              {manualFormExchangeError}
                            </p>
                          )}
                          <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                            <label
                              className={`flex cursor-pointer items-start gap-2 rounded-xl border px-3 py-2 text-sm transition ${
                                manualFormData.isFreeListing
                                  ? isDarkMode
                                    ? 'border-emerald-500/60 bg-emerald-900/25 text-emerald-100'
                                    : 'border-emerald-300 bg-emerald-50 text-emerald-900'
                                  : isDarkMode
                                    ? 'border-zinc-700 bg-zinc-900/70 text-zinc-300'
                                    : 'border-stone-200 bg-stone-50 text-stone-700'
                              }`}
                            >
                              <input
                                type="checkbox"
                                name="isFreeListing"
                                checked={manualFormData.isFreeListing === true}
                                onChange={handleManualFormInputChange}
                                className="mt-0.5 h-4 w-4 rounded border-stone-300 text-emerald-600 focus:ring-emerald-500"
                              />
                              <span>
                                <span className="block font-semibold">Ofertă gratuită</span>
                                <span className="block text-xs opacity-75">Anunțul se salvează ca oferit gratuit, nu ca vândut.</span>
                              </span>
                            </label>
                            <label
                              className={`flex cursor-pointer items-start gap-2 rounded-xl border px-3 py-2 text-sm transition ${
                                manualFormData.isUrgent
                                  ? isDarkMode
                                    ? 'border-orange-500/60 bg-orange-900/25 text-orange-100'
                                    : 'border-orange-300 bg-orange-50 text-orange-900'
                                  : isDarkMode
                                    ? 'border-zinc-700 bg-zinc-900/70 text-zinc-300'
                                    : 'border-stone-200 bg-stone-50 text-stone-700'
                              }`}
                            >
                              <input
                                type="checkbox"
                                name="isUrgent"
                                checked={manualFormData.isUrgent === true}
                                onChange={handleManualFormInputChange}
                                className="mt-0.5 h-4 w-4 rounded border-stone-300 text-orange-600 focus:ring-orange-500"
                              />
                              <span>
                                <span className="block font-semibold">Urgent</span>
                                <span className="block text-xs opacity-75">
                                  Arată celorlalți utilizatori că vrei să vinzi sau să oferi gratuit produsul cât mai urgent.
                                </span>
                              </span>
                            </label>
                          </div>
                          <div className="mt-2 flex flex-wrap items-center gap-2">
                            <input
                              type="number"
                              inputMode="decimal"
                              min="0"
                              step="0.01"
                              value={manualFormData.isFreeListing === true ? '' : manualFormData.currency === 'RON'
                                ? (Number.isNaN(manualFormPriceRon) || manualFormPriceRon === 0 ? '' : manualFormPriceRon)
                                : (Number.isNaN(manualFormPriceEur) || manualFormPriceEur === 0 ? '' : manualFormPriceEur)}
                              disabled={manualFormData.isFreeListing === true}
                              onChange={(e) => {
                                const v = parseFloat(String(e.target.value)) || 0;
                                if (manualFormData.currency === 'RON') setManualFormPriceRon(v);
                                else setManualFormPriceEur(v);
                              }}
                              className={`min-w-[120px] flex-1 rounded-xl border px-3 py-2.5 text-sm transition-colors focus:outline-none focus:ring-2 ${
                                manualFormData.isFreeListing
                                  ? isDarkMode
                                    ? 'cursor-not-allowed border-dashed border-zinc-700 bg-zinc-900 text-zinc-500'
                                    : 'cursor-not-allowed border-dashed border-stone-200 bg-stone-100 text-stone-400'
                                  : isDarkMode
                                    ? 'border-zinc-700 bg-zinc-900/80 text-zinc-100 focus:border-zinc-500 focus:ring-white/[0.06]'
                                    : 'border-stone-200 bg-white text-stone-900 focus:border-stone-400 focus:ring-stone-900/[0.06]'
                              }`}
                              placeholder={manualFormData.isFreeListing === true ? 'Ofertă gratuită' : '0.00'}
                            />
                            <select
                              name="currency"
                              value={manualFormData.currency}
                              onChange={handleManualFormInputChange}
                              className={`rounded-xl border px-3 py-2.5 text-sm font-medium transition-colors focus:outline-none focus:ring-2 ${
                                isDarkMode
                                  ? 'border-zinc-700 bg-zinc-900/80 text-zinc-100 focus:border-zinc-500 focus:ring-white/[0.06]'
                                  : 'border-stone-200 bg-white text-stone-900 focus:border-stone-400 focus:ring-stone-900/[0.06]'
                              }`}
                            >
                              <option value="RON">Lei</option>
                              <option value="EUR">EUR</option>
                            </select>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Category and Location */}
                    <div
                      className={
                        isPieseAuto
                          ? 'space-y-5 sm:space-y-8'
                          : `rounded-xl border p-4 sm:p-5 md:p-6 ${
                              isDarkMode ? 'border-zinc-800 bg-zinc-900/50' : 'border-stone-200/90 bg-white'
                            } sm:rounded-2xl`
                      }
                    >
                      {isPieseAuto ? (
                        <p className={`text-sm leading-relaxed ${isDarkMode ? 'text-zinc-400' : 'text-stone-600'}`}>
                          {PIESE_AUTO_FORM_CATEGORY_DISPLAY} · {PIESE_AUTO_FORM_SUBCATEGORY_DISPLAY}
                        </p>
                      ) : (
                        <>
                          {/* Categorie și Subcategorie - pe același rând */}
                          <div className="grid grid-cols-1 gap-4 sm:gap-6 md:grid-cols-2">
                            <div>
                              <label
                                className={`block text-sm font-medium mb-2 ${
                                  isDarkMode ? 'text-gray-300' : 'text-gray-700'
                                }`}
                              >
                                Categorie *
                              </label>
                              <select
                                name="category"
                                value={manualFormData.category}
                                onChange={handleManualFormInputChange}
                                className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                                  isDarkMode
                                    ? 'bg-gray-700 border-gray-600 text-white'
                                    : 'bg-white border-gray-300 text-gray-900'
                                }`}
                                required
                              >
                                <option value="">Selectează categoria</option>
                                {categories.map((category) => (
                                  <option key={category} value={category}>
                                    {category}
                                  </option>
                                ))}
                              </select>
                            </div>

                            <div>
                              <label
                                className={`block text-sm font-medium mb-2 ${
                                  isDarkMode ? 'text-gray-300' : 'text-gray-700'
                                }`}
                              >
                                Subcategorie *
                              </label>
                              <select
                                name="subcategory"
                                value={manualFormData.subcategory}
                                onChange={handleManualFormInputChange}
                                className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                                  isDarkMode
                                    ? 'bg-gray-700 border-gray-600 text-white'
                                    : 'bg-white border-gray-300 text-gray-900'
                                }`}
                                required
                                disabled={!manualFormData.category}
                              >
                                <option value="">Selectează subcategoria</option>
                                {manualFormData.category &&
                                  subcategories[manualFormData.category]?.map((subcategory) => (
                                    <option key={subcategory} value={subcategory}>
                                      {subcategory}
                                    </option>
                                  ))}
                              </select>
                            </div>
                          </div>
                        </>
                      )}

                      {/* Level 3 + Atribute (Mărime, Marca, Model, Stare) */}
                      {manualFormData.subcategory && (() => {
                        const subKey = SUBCATEGORY_DISPLAY_TO_KEY[manualFormData.subcategory] ?? manualFormData.subcategory;
                        const level3Opts = CATEGORY_LEVEL_3[subKey];
                        const attrs = getAttributesForSubcategory(manualFormData.subcategory);
                        const sizeOpts = getSizeOptionsForSubcategory(manualFormData.subcategory);
                        const brandOpts = getBrandOptionsForSubcategory(manualFormData.subcategory);
                        const modelOpts = manualFormData.brand ? getModelsForBrand(manualFormData.brand, manualFormData.subcategory) : [];
                        const showModel = hasModelInMainSection(manualFormData.subcategory);
                        const showPhoneSpecs = hasPhoneSpecsInMainSection(manualFormData.subcategory);
                        const subFieldsForGarantie = (dynamicFieldsConfig[manualFormData.category] as Record<string, { key: string }[]>)?.[manualFormData.subcategory] ?? [];
                        const showGarantie = subFieldsForGarantie.some((f: { key: string }) => f.key === 'garantie');
                        const dynamicFieldsHere = (() => {
                          if (!manualFormData.category || !manualFormData.subcategory) return [];
                          const catFields = dynamicFieldsConfig[manualFormData.category];
                          if (!catFields) return [];
                          const fields = (catFields as Record<string, { key: string }[]>)[manualFormData.subcategory] || [];
                          return fields.filter((f: { key: string }) => {
                            if (FIELDS_ALREADY_IN_MAIN_FORM.includes(f.key)) return false;
                            if (isPieseAuto && f.key === 'tipPiesa') return false;
                            return true;
                          });
                        })();
                        const tipPiesaFieldDef = (dynamicFieldsConfig[manualFormData.category]?.[manualFormData.subcategory] ?? []).find(
                          (f: { key: string }) => f.key === 'tipPiesa'
                        );
                        const hasAny = sizeOpts.length > 0 || brandOpts.length > 0 || attrs.condition || showModel || showPhoneSpecs || showGarantie || dynamicFieldsHere.length > 0;
                        if (!hasAny) return null;
                        return (
                          <div
                            className={`mt-4 grid grid-cols-1 gap-4 sm:mt-6 sm:gap-6 md:grid-cols-2 md:gap-8 ${
                              isPieseAuto
                                ? `rounded-xl border p-4 sm:p-5 md:p-6 ${
                                    isDarkMode ? 'border-zinc-800 bg-zinc-900/40' : 'border-stone-200/90 bg-white'
                                  } sm:rounded-2xl`
                                : ''
                            }`}
                          >
                            {sizeOpts.length > 0 ? (
                              <div>
                                <label className={`block text-sm font-medium mb-2 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>Mărime</label>
                                <select name="size" value={manualFormData.size} onChange={handleManualFormInputChange}
                                  className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${isDarkMode ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300 text-gray-900'}`}>
                                  <option value="">Selectează (opțional)</option>
                                  {sizeOpts.map((s, i) => <option key={`size-${i}-${s}`} value={s}>{s}</option>)}
                                </select>
                              </div>
                            ) : null}
                            {brandOpts.length > 0 ? (
                              <div>
                                <label className={`block text-sm font-medium mb-2 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                                  Marca {isPieseAuto ? <span className="text-red-500">*</span> : null}
                                </label>
                                <select
                                  name="brand"
                                  value={manualFormData.brand}
                                  onChange={handleManualFormInputChange}
                                  required={isPieseAuto}
                                  className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${isDarkMode ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300 text-gray-900'}`}
                                >
                                  <option value="">{isPieseAuto ? 'Selectează marca' : 'Selectează (opțional)'}</option>
                                  {brandOpts.map((b, i) => <option key={`brand-${i}-${b}`} value={b}>{b}</option>)}
                                </select>
                              </div>
                            ) : null}
                            {showModel && modelOpts.length > 0 ? (
                              <div>
                                <label className={`block text-sm font-medium mb-2 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>Model</label>
                                <select name="model" value={manualFormData.model} onChange={handleManualFormInputChange}
                                  className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${isDarkMode ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300 text-gray-900'}`}>
                                  <option value="">Selectează (opțional)</option>
                                  {modelOpts.map((m, i) => <option key={`model-${i}-${m}`} value={m}>{m}</option>)}
                                </select>
                              </div>
                            ) : null}
                            {showPhoneSpecs ? (
                              <>
                                <div>
                                  <label className={`block text-sm font-medium mb-2 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>RAM (GB)</label>
                                  <select name="ram" value={manualFormData.ram} onChange={handleManualFormInputChange}
                                    className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${isDarkMode ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300 text-gray-900'}`}>
                                    <option value="">Selectează (opțional)</option>
                                    {[...PHONE_RAM_OPTIONS].map((r) => <option key={r} value={r}>{r}</option>)}
                                  </select>
                                </div>
                                <div>
                                  <label className={`block text-sm font-medium mb-2 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>Capacitate stocare (GB)</label>
                                  <select name="capacitateStocare" value={manualFormData.capacitateStocare} onChange={handleManualFormInputChange}
                                    className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${isDarkMode ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300 text-gray-900'}`}>
                                    <option value="">Selectează (opțional)</option>
                                    {[...PHONE_STORAGE_OPTIONS].map((s) => <option key={s} value={s}>{s}</option>)}
                                  </select>
                                </div>
                              </>
                            ) : null}
                            {attrs.condition && !isPieseAuto ? (
                              <div>
                                <label className={`block text-sm font-medium mb-2 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>Stare <span className="text-red-500">*</span></label>
                                <select
                                  name="condition"
                                  required
                                  value={manualFormData.condition === 'Second hand' ? 'Second hand' : 'Nou'}
                                  onChange={handleManualFormInputChange}
                                  className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${isDarkMode ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300 text-gray-900'}`}
                                >
                                  <option value="Nou">Nou</option>
                                  <option value="Second hand">Second hand</option>
                                </select>
                              </div>
                            ) : null}
                            {attrs.condition && isPieseAuto && tipPiesaFieldDef?.options?.length ? (
                              <div>
                                <label className={`block text-sm font-medium mb-2 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                                  {tipPiesaFieldDef.label} <span className="text-red-500">*</span>
                                </label>
                                <select
                                  value={String(manualFormData.customFields?.tipPiesa ?? '')}
                                  onChange={(e) => handleManualFormDynamicFieldChange('tipPiesa', e.target.value)}
                                  required
                                  className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${isDarkMode ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300 text-gray-900'}`}
                                >
                                  <option value="">Selectează tipul piesei</option>
                                  {tipPiesaFieldDef.options.map((option, i) => (
                                    <option key={`tipPiesa-opt-${i}-${option}`} value={option}>
                                      {option}
                                    </option>
                                  ))}
                                </select>
                              </div>
                            ) : null}
                            {isPieseAuto && attrs.condition ? (
                              <div>
                                <label className={`block text-sm font-medium mb-2 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                                  Stare <span className="text-red-500">*</span>
                                </label>
                                <select
                                  name="condition"
                                  required
                                  value={manualFormData.condition === 'Second hand' ? 'Second hand' : 'Nou'}
                                  onChange={handleManualFormInputChange}
                                  className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${isDarkMode ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300 text-gray-900'}`}
                                >
                                  <option value="Second hand">Second hand</option>
                                  <option value="Nou">Nou</option>
                                </select>
                              </div>
                            ) : null}
                            {showGarantie ? (
                              <div>
                                <label className={`block text-sm font-medium mb-2 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>Garanție</label>
                                <select name="garantie" value={manualFormData.garantie} onChange={handleManualFormInputChange}
                                  className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${isDarkMode ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300 text-gray-900'}`}>
                                  <option value="">Selectează (opțional)</option>
                                  <option value="Da">Da</option>
                                  <option value="Nu">Nu</option>
                                </select>
                              </div>
                            ) : null}
                            {manualFormDynamicFields.map((field) => (
                              <div key={field.key}>
                                <label className={`block text-sm font-medium mb-2 ${field.required ? (isDarkMode ? 'text-gray-300' : 'text-gray-700') : (isDarkMode ? 'text-gray-400' : 'text-gray-600')}`}>
                                  {field.label}
                                </label>
                                {field.type === 'select' ? (
                                  <select
                                    value={manualFormData.customFields?.[field.key] || ''}
                                    onChange={(e) => handleManualFormDynamicFieldChange(field.key, e.target.value)}
                                    required={field.required}
                                    className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${isDarkMode ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300 text-gray-900'}`}
                                  >
                                    <option value="">Selectează...</option>
                                    {field.options?.map((option, i) => (
                                      <option key={`${field.key}-opt-${i}-${option}`} value={option}>{option}</option>
                                    ))}
                                  </select>
                                ) : field.type === 'number' ? (
                                  <input
                                    type="number"
                                    value={manualFormData.customFields?.[field.key] ?? ''}
                                    onChange={(e) => handleManualFormDynamicFieldChange(field.key, parseFloat(e.target.value) || 0)}
                                    placeholder={field.placeholder}
                                    required={field.required}
                                    min={field.min}
                                    max={field.max}
                                    step={field.step || 1}
                                    className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${isDarkMode ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300 text-gray-900'}`}
                                  />
                                ) : field.type === 'textarea' ? (
                                  <textarea
                                    value={manualFormData.customFields?.[field.key] || ''}
                                    onChange={(e) => handleManualFormDynamicFieldChange(field.key, e.target.value)}
                                    placeholder={field.placeholder}
                                    required={field.required}
                                    rows={3}
                                    className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${isDarkMode ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300 text-gray-900'}`}
                                  />
                                ) : (
                                  <input
                                    type="text"
                                    value={manualFormData.customFields?.[field.key] || ''}
                                    onChange={(e) => handleManualFormDynamicFieldChange(field.key, e.target.value)}
                                    placeholder={field.placeholder}
                                    required={field.required}
                                    className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${isDarkMode ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300 text-gray-900'}`}
                                  />
                                )}
                              </div>
                            ))}
                          </div>
                        );
                      })()}

                      {/* Locație */}
                      <div
                        className={`mt-5 rounded-xl border p-4 sm:mt-8 sm:rounded-2xl sm:p-5 md:p-6 ${
                          isDarkMode ? 'border-zinc-800 bg-zinc-900/40' : 'border-stone-200/90 bg-white'
                        }`}
                      >
                        <p className={`mb-4 text-xs font-medium ${isDarkMode ? 'text-zinc-500' : 'text-stone-500'}`}>
                          Locație
                        </p>
                        {manualFormFavoriteLocationLocked && !editingProductId ? (
                          <div
                            className={`rounded-xl border px-4 py-3.5 sm:px-5 sm:py-4 ${
                              isDarkMode
                                ? 'border-zinc-700/90 bg-zinc-950/60'
                                : 'border-stone-200 bg-stone-50/90'
                            }`}
                          >
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                              <div className="min-w-0 flex-1 space-y-2.5 text-sm">
                                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                                  <span
                                    className={`shrink-0 text-[11px] font-semibold uppercase tracking-wide ${
                                      isDarkMode ? 'text-zinc-500' : 'text-stone-500'
                                    }`}
                                  >
                                    Județ
                                  </span>
                                  <span className={`font-medium ${isDarkMode ? 'text-zinc-100' : 'text-stone-900'}`}>
                                    {manualFormData.county?.trim() || '—'}
                                  </span>
                                </div>
                                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                                  <span
                                    className={`shrink-0 text-[11px] font-semibold uppercase tracking-wide ${
                                      isDarkMode ? 'text-zinc-500' : 'text-stone-500'
                                    }`}
                                  >
                                    Oraș / Comună
                                  </span>
                                  <span className={`font-medium ${isDarkMode ? 'text-zinc-100' : 'text-stone-900'}`}>
                                    {manualFormData.city?.trim() || '—'}
                                  </span>
                                </div>
                                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                                  <span
                                    className={`shrink-0 text-[11px] font-semibold uppercase tracking-wide ${
                                      isDarkMode ? 'text-zinc-500' : 'text-stone-500'
                                    }`}
                                  >
                                    Sat
                                  </span>
                                  <span className={`font-medium ${isDarkMode ? 'text-zinc-100' : 'text-stone-900'}`}>
                                    {manualFormData.village?.trim() || '—'}
                                  </span>
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={() => setManualFormFavoriteLocationLocked(false)}
                                className={`inline-flex shrink-0 items-center justify-center gap-1.5 self-start rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${
                                  isDarkMode
                                    ? 'bg-zinc-800 text-zinc-100 ring-1 ring-white/10 hover:bg-zinc-700'
                                    : 'bg-white text-stone-800 ring-1 ring-stone-200 hover:bg-stone-50'
                                }`}
                                title="Deblochează câmpurile ca să poți schimba județul, orașul sau satul"
                              >
                                <i className="ri-pencil-line text-base leading-none" aria-hidden />
                                Editează
                              </button>
                            </div>
                            <p
                              className={`mt-3 text-xs leading-relaxed ${
                                isDarkMode ? 'text-zinc-500' : 'text-stone-500'
                              }`}
                            >
                              Această locație e memorată și se completează automat la anunțuri noi. Apasă Editează ca să o
                              modifici.
                            </p>
                          </div>
                        ) : (
                          <>
                            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                              <p className={`text-xs leading-relaxed ${isDarkMode ? 'text-zinc-500' : 'text-stone-500'}`}>
                                Completează manual sau folosește locația aproximativă a dispozitivului.
                              </p>
                              <div className="flex flex-col gap-2 sm:items-end">
                                <div className="relative group">
                                  <Button
                                    type="button"
                                    onClick={() => setManualFormLocationPermissionOpen(true)}
                                    disabled={manualFormUseMyLocationBusy}
                                    className="h-auto w-full rounded-xl border-0 bg-gradient-to-r from-sky-500 via-blue-500 to-blue-600 py-2.5 text-sm font-semibold text-white shadow-md transition-all hover:from-sky-400 hover:via-blue-500 hover:to-blue-500 hover:shadow-lg focus-visible:ring-2 focus-visible:ring-blue-400/80 sm:w-auto"
                                  >
                                    {manualFormUseMyLocationBusy ? (
                                      <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden />
                                    ) : (
                                      <Navigation2 className="h-4 w-4 shrink-0" aria-hidden />
                                    )}
                                    Folosește locația mea
                                  </Button>
                                  <div
                                    className={`pointer-events-none absolute right-0 top-full z-30 mt-2 w-72 rounded-xl border p-3 text-xs leading-relaxed opacity-0 shadow-xl transition-opacity duration-200 group-hover:opacity-100 group-focus-within:opacity-100 ${
                                      isDarkMode
                                        ? 'border-zinc-700 bg-zinc-950 text-zinc-200'
                                        : 'border-stone-200 bg-white text-stone-700'
                                    }`}
                                  >
                                    Nu publicăm adresa exactă. Locația este folosită doar aproximativ, ca zonă/oraș/sat,
                                    pentru căutări pe rază în km, ca un cerc pe hartă. Nu afișăm direcții către adresa ta.
                                  </div>
                                </div>
                                <p className={`text-[11px] ${isDarkMode ? 'text-zinc-500' : 'text-stone-500'}`}>
                                  Confidențial: nu se salvează coordonatele GPS exacte în anunț.
                                </p>
                              </div>
                            </div>
                            <div className="grid grid-cols-1 gap-6 md:grid-cols-3 md:gap-6">
                              <div>
                                <label
                                  className={`mb-1.5 block text-sm font-medium ${isDarkMode ? 'text-zinc-300' : 'text-stone-800'}`}
                                >
                                  Județ
                                </label>
                                <select
                                  name="county"
                                  value={manualFormData.county || ''}
                                  onChange={handleManualFormInputChange}
                                  className={`w-full rounded-xl border px-3 py-2.5 text-sm transition-colors focus:outline-none focus:ring-2 ${
                                    isDarkMode
                                      ? 'border-zinc-700 bg-zinc-900/80 text-zinc-100 focus:border-zinc-500 focus:ring-white/[0.06]'
                                      : 'border-stone-200 bg-white text-stone-900 focus:border-stone-400 focus:ring-stone-900/[0.06]'
                                  }`}
                                >
                                  <option value="">Selectează județul</option>
                                  {(localitiesByCounty?.counties ?? counties).map((county) => (
                                    <option key={county} value={county}>
                                      {county}
                                    </option>
                                  ))}
                                </select>
                              </div>

                              <div>
                                <label
                                  className={`mb-1.5 block text-sm font-medium ${isDarkMode ? 'text-zinc-300' : 'text-stone-800'}`}
                                >
                                  Oraș / Comună
                                </label>
                                <select
                                  name="city"
                                  value={manualFormData.city || ''}
                                  onChange={handleManualFormInputChange}
                                  disabled={!manualFormData.county}
                                  className={`w-full rounded-xl border px-3 py-2.5 text-sm transition-colors focus:outline-none focus:ring-2 ${
                                    isDarkMode
                                      ? 'border-zinc-700 bg-zinc-900/80 text-zinc-100 focus:border-zinc-500 focus:ring-white/[0.06]'
                                      : 'border-stone-200 bg-white text-stone-900 focus:border-stone-400 focus:ring-stone-900/[0.06]'
                                  } ${!manualFormData.county ? 'cursor-not-allowed opacity-50' : ''}`}
                                >
                                  <option value="">
                                    {manualFormData.county
                                      ? 'Selectează orașul sau comuna'
                                      : 'Selectează mai întâi județul'}
                                  </option>
                                  {(
                                    (localitiesByCounty?.byCounty[manualFormData.county || '']?.cities ??
                                      citiesByCounty[manualFormData.county || '']) || []
                                  ).map((city) => (
                                    <option key={city} value={city}>
                                      {city}
                                    </option>
                                  ))}
                                </select>
                              </div>

                              <div>
                                <label
                                  className={`mb-1.5 block text-sm font-medium ${isDarkMode ? 'text-zinc-300' : 'text-stone-800'}`}
                                >
                                  Sat
                                </label>
                                <select
                                  name="village"
                                  value={manualFormData.village || ''}
                                  onChange={handleManualFormInputChange}
                                  disabled={!manualFormData.city}
                                  className={`w-full rounded-xl border px-3 py-2.5 text-sm transition-colors focus:outline-none focus:ring-2 ${
                                    isDarkMode
                                      ? 'border-zinc-700 bg-zinc-900/80 text-zinc-100 focus:border-zinc-500 focus:ring-white/[0.06]'
                                      : 'border-stone-200 bg-white text-stone-900 focus:border-stone-400 focus:ring-stone-900/[0.06]'
                                  } ${!manualFormData.city ? 'cursor-not-allowed opacity-50' : ''}`}
                                >
                                  <option value="">
                                    {manualFormData.city
                                      ? 'Selectează satul (opțional)'
                                      : 'Selectează mai întâi orașul/comuna'}
                                  </option>
                                  {(
                                    localitiesByCounty?.byCounty[manualFormData.county || '']?.villages[
                                      manualFormData.city || ''
                                    ] || []
                                  ).map((v) => (
                                    <option key={v} value={v}>
                                      {v}
                                    </option>
                                  ))}
                                </select>
                              </div>
                            </div>

                            {!editingProductId ? (
                              <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
                                <button
                                  type="button"
                                  onClick={saveManualFormFavoriteLocation}
                                  className={`inline-flex min-h-[2.5rem] items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold shadow-sm transition-colors ${
                                    manualFormFavoriteSaveFeedback
                                      ? isDarkMode
                                        ? 'bg-emerald-500/25 text-emerald-200 ring-1 ring-emerald-500/40'
                                        : 'bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200/80'
                                      : isDarkMode
                                        ? 'bg-orange-600 text-white hover:bg-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-400/50'
                                        : 'bg-orange-600 text-white hover:bg-orange-700 focus:outline-none focus:ring-2 focus:ring-orange-500/40'
                                  }`}
                                  title="Memorează județul, orașul și satul pentru următoarele anunțuri"
                                >
                                  {manualFormFavoriteSaveFeedback ? (
                                    <>
                                      <i className="ri-checkbox-circle-fill text-base leading-none" aria-hidden />
                                      Memorat pentru anunțuri noi
                                    </>
                                  ) : (
                                    <>
                                      <i className="ri-bookmark-3-line text-base leading-none" aria-hidden />
                                      Memorează locația
                                    </>
                                  )}
                                </button>
                              </div>
                            ) : null}
                          </>
                        )}
                      </div>

                      {/* Câmpurile specifice subcategoriei sunt afișate deasupra, în aceeași secțiune cu Marca, Model, Stare */}
                    </div>

                    {/* Imagini și fișiere — drag & drop fișiere pe întreg cardul Media */}
                    <div
                      onDragOver={handleManualFormMediaZoneDragOver}
                      onDragLeave={handleManualFormMediaZoneDragLeave}
                      onDrop={handleManualFormMediaZoneDrop}
                      className={`rounded-xl border p-4 pb-[max(1rem,env(safe-area-inset-bottom,0px))] transition-[box-shadow,background-color,border-color] duration-200 sm:rounded-2xl sm:p-5 md:p-6 ${
                        manualFormFileDragActive && manualFormData.images.length < MAX_IMAGES
                          ? isDarkMode
                            ? 'border-blue-500/60 bg-blue-950/25 ring-2 ring-blue-500/50 ring-offset-2 ring-offset-zinc-950'
                            : 'border-blue-400 bg-blue-50/40 ring-2 ring-blue-500/45 ring-offset-2 ring-offset-white'
                          : isDarkMode
                            ? 'border-zinc-800 bg-zinc-900/40'
                            : 'border-stone-200/90 bg-white'
                      }`}
                    >
                      <div className="mb-3 flex items-center gap-2 sm:mb-5 sm:gap-3">
                        <div
                          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full sm:h-10 sm:w-10 ${
                            isDarkMode ? 'bg-zinc-800 text-zinc-300' : 'bg-stone-100 text-stone-600'
                          }`}
                        >
                          <i className="ri-image-line text-base sm:text-lg" aria-hidden />
                        </div>
                        <div className="min-w-0">
                          <p className={`text-[10px] font-medium uppercase tracking-[0.18em] ${isDarkMode ? 'text-zinc-500' : 'text-stone-400'}`}>
                            Media
                          </p>
                          <h3 className={`text-sm font-semibold tracking-tight sm:text-base md:text-lg ${isDarkMode ? 'text-zinc-100' : 'text-stone-900'}`}>
                            Imagini și fișiere
                          </h3>
                        </div>
                      </div>

                      <div
                        className={
                          manualFormData.images.length > 0 ? 'space-y-3' : 'space-y-4'
                        }
                      >
                        <input
                          ref={manualFileUploadRef}
                          type="file"
                          id="manual-file-upload"
                          multiple
                          accept="image/*"
                          onChange={handleManualFormFileUpload}
                          disabled={manualFormData.images.length >= MAX_IMAGES}
                          className="hidden"
                        />
                        <input
                          ref={manualCameraCaptureRef}
                          type="file"
                          accept="image/*"
                          capture="environment"
                          onChange={handleManualFormFileUpload}
                          disabled={manualFormData.images.length >= MAX_IMAGES}
                          className="hidden"
                          aria-hidden
                        />
                        {manualFormData.images.length < MAX_IMAGES && (
                          <div
                            ref={manualNativeAddWrapRef}
                            className={`relative w-full ${!isNativeApp ? '2xl:hidden' : ''}`}
                          >
                            <button
                              type="button"
                              aria-expanded={isNativeApp ? manualNativeAddMenuOpen : undefined}
                              aria-haspopup={isNativeApp ? 'menu' : undefined}
                              onClick={() => {
                                if (isNativeApp) {
                                  setManualNativeAddMenuOpen((o) => !o);
                                } else {
                                  manualFileUploadRef.current?.click();
                                }
                              }}
                              className={`touch-manipulation flex w-full min-h-[48px] items-center justify-center gap-2.5 rounded-2xl px-5 py-3.5 text-sm font-semibold shadow-lg transition active:scale-[0.99] ${
                                isDarkMode
                                  ? 'bg-gradient-to-r from-blue-500 to-blue-600 text-white shadow-blue-950/40 hover:from-blue-400 hover:to-blue-500'
                                  : 'bg-gradient-to-r from-blue-600 to-blue-600 text-white shadow-blue-500/30 hover:from-blue-500 hover:to-blue-500'
                              }`}
                            >
                              <i className="ri-image-add-fill text-xl leading-none" aria-hidden />
                              <span>Adaugă imagini</span>
                              {isNativeApp && (
                                <i
                                  className={`ri-arrow-down-s-line text-lg opacity-90 transition-transform ${manualNativeAddMenuOpen ? 'rotate-180' : ''}`}
                                  aria-hidden
                                />
                              )}
                            </button>
                            {isNativeApp && manualNativeAddMenuOpen && (
                              <div
                                role="menu"
                                className={`absolute left-0 right-0 top-[calc(100%+0.5rem)] z-50 overflow-hidden rounded-2xl border shadow-2xl ${
                                  isDarkMode
                                    ? 'border-zinc-600/80 bg-zinc-900 ring-1 ring-white/10'
                                    : 'border-stone-200/90 bg-white ring-1 ring-black/5'
                                }`}
                              >
                                <button
                                  type="button"
                                  role="menuitem"
                                  className={`flex w-full items-center gap-3 px-4 py-3.5 text-left text-sm font-medium transition active:bg-black/5 ${
                                    isDarkMode
                                      ? 'text-zinc-100 hover:bg-zinc-800/90'
                                      : 'text-stone-800 hover:bg-stone-50'
                                  }`}
                                  onClick={() => {
                                    setManualNativeAddMenuOpen(false);
                                    handleManualFormNativePhoto('camera');
                                  }}
                                >
                                  <span
                                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                                      isDarkMode ? 'bg-zinc-800 text-blue-300' : 'bg-blue-50 text-blue-600'
                                    }`}
                                  >
                                    <i className="ri-camera-lens-line text-xl" aria-hidden />
                                  </span>
                                  <span className="flex flex-col gap-0.5">
                                    <span>Fă o poză</span>
                                    <span
                                      className={`text-xs font-normal ${isDarkMode ? 'text-zinc-500' : 'text-stone-500'}`}
                                    >
                                      Deschide camera
                                    </span>
                                  </span>
                                </button>
                                <button
                                  type="button"
                                  role="menuitem"
                                  className={`flex w-full items-center gap-3 border-t px-4 py-3.5 text-left text-sm font-medium transition active:bg-black/5 ${
                                    isDarkMode
                                      ? 'border-zinc-700/80 text-zinc-100 hover:bg-zinc-800/90'
                                      : 'border-stone-100 text-stone-800 hover:bg-stone-50'
                                  }`}
                                  onClick={() => {
                                    setManualNativeAddMenuOpen(false);
                                    handleManualFormNativePhoto('photos');
                                  }}
                                >
                                  <span
                                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                                      isDarkMode ? 'bg-zinc-800 text-blue-300' : 'bg-blue-50 text-blue-600'
                                    }`}
                                  >
                                    <i className="ri-image-2-line text-xl" aria-hidden />
                                  </span>
                                  <span className="flex flex-col gap-0.5">
                                    <span>Încarcă din galerie</span>
                                    <span
                                      className={`text-xs font-normal ${isDarkMode ? 'text-zinc-500' : 'text-stone-500'}`}
                                    >
                                      Alege din galeria telefonului
                                    </span>
                                  </span>
                                </button>
                              </div>
                            )}
                          </div>
                        )}

                        <div
                          className={`relative overflow-x-hidden overflow-y-visible rounded-xl border text-center transition-all sm:rounded-2xl ${
                            manualFormData.images.length > 0
                              ? 'p-3 sm:p-4 md:p-4'
                              : 'p-4 sm:p-6 md:p-7'
                          } ${
                            manualFormFileDragActive && manualFormData.images.length < MAX_IMAGES
                              ? isDarkMode
                                ? 'border-blue-500/50 bg-blue-950/30 shadow-lg shadow-blue-950/20'
                                : 'border-blue-300 bg-blue-50/60 shadow-md shadow-blue-500/10'
                              : manualFormData.images.length >= MAX_IMAGES
                                ? isDarkMode
                                  ? 'border-zinc-800 bg-zinc-950/50 opacity-60'
                                  : 'border-stone-200 bg-stone-50/80 opacity-60'
                                : isDarkMode
                                  ? 'border-zinc-700/90 bg-gradient-to-b from-zinc-900/80 to-zinc-950/50'
                                  : 'border-stone-200/90 bg-gradient-to-b from-white to-stone-50/90'
                          } ${
                            manualFormData.images.length === 0
                              ? 'max-sm:border-0 max-sm:bg-transparent max-sm:p-3 max-sm:shadow-none'
                              : ''
                          }`}
                        >
                          {manualFormData.images.length > 0 && (
                            <div className="mb-0 w-full text-left">
                              <p
                                className={`mb-2 text-xs leading-relaxed sm:text-[11px] sm:leading-snug ${
                                  isDarkMode ? 'text-zinc-500' : 'text-stone-500'
                                }`}
                              >
                                <span className="max-sm:hidden">
                                  Prima imagine este coperta. Reordonarea se face prin glisare de{' '}
                                  <strong className="font-semibold text-stone-700 dark:text-zinc-300">
                                    oriunde pe miniatură
                                  </strong>{' '}
                                  sau cu săgețile de lângă fiecare poză.
                                </span>
                                <span className="hidden max-sm:inline">
                                  Prima imagine este coperta. Reordonare: ține apăsat și mută miniatura sau folosește
                                  săgețile.
                                </span>
                              </p>
                              <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:justify-start sm:gap-3.5">
                                {manualFormData.images.map((image, index) => {
                                  const manualThumbItem = getManualImageItemProps(index);
                                  const orphanLast =
                                    index === manualFormData.images.length - 1 &&
                                    manualFormData.images.length % 2 === 1;
                                  return (
                                    <div
                                      key={index}
                                      {...manualThumbItem}
                                      onDrop={(e) => {
                                        const files = e.dataTransfer.files;
                                        if (
                                          files?.length &&
                                          manualImageDraggedIndex === null &&
                                          manualFormData.images.length < MAX_IMAGES
                                        ) {
                                          e.preventDefault();
                                          e.stopPropagation();
                                          setManualFormFileDragActive(false);
                                          processManualFormFiles(Array.from(files));
                                          return;
                                        }
                                        manualThumbItem.onDrop?.(e);
                                      }}
                                      title="Glisare pentru reordonare · click pe poză pentru mărire"
                                      className={`group relative aspect-square w-full cursor-grab touch-manipulation select-none active:cursor-grabbing sm:aspect-auto sm:h-32 sm:w-32 sm:shrink-0 transition-all duration-200 ease-out ${
                                        orphanLast
                                          ? 'max-sm:col-span-2 max-sm:justify-self-center max-sm:w-[calc((100%-0.5rem)/2)]'
                                          : ''
                                      } ${
                                        manualImageDraggedIndex === index
                                          ? 'z-40 scale-[0.92] opacity-80 shadow-2xl rounded-xl ring-2 ring-blue-500/70'
                                          : manualImageDraggedIndex !== null &&
                                              manualImageDragOverIndex === index &&
                                              manualImageDraggedIndex !== index
                                            ? isDarkMode
                                              ? 'z-10 scale-105 rounded-xl ring-2 ring-amber-400/95 shadow-lg'
                                              : 'z-10 scale-105 rounded-xl ring-2 ring-blue-500 shadow-lg'
                                            : ''
                                      }`}
                                    >
                                      <div
                                        role="button"
                                        tabIndex={0}
                                        onClick={() => openManualImagePreview(index)}
                                        onKeyDown={(ev) => {
                                          if (ev.key === 'Enter' || ev.key === ' ') {
                                            ev.preventDefault();
                                            openManualImagePreview(index);
                                          }
                                        }}
                                        className={`relative h-full w-full overflow-hidden rounded-lg ring-1 ring-black/5 transition hover:opacity-90 hover:ring-2 hover:ring-stone-400/40 focus:outline-none focus:ring-2 focus:ring-stone-500 ${
                                          isDarkMode ? 'bg-zinc-800 ring-white/10' : 'bg-stone-100'
                                        }`}
                                        title="Click pentru imagine mărită"
                                      >
                                        <ManualFormImageThumb image={image} />
                                      </div>
                                      <span
                                        className="pointer-events-none absolute left-1 top-1 flex h-5 min-w-[1.25rem] items-center justify-center rounded-md bg-black/55 px-1 text-[10px] font-semibold text-white tabular-nums"
                                        aria-hidden
                                      >
                                        {index + 1}
                                      </span>
                                      <button
                                        type="button"
                                        draggable={false}
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          markManualImageAsFavorite(index);
                                        }}
                                        disabled={index === 0}
                                        className={`absolute right-1 top-1 z-[2] flex h-8 w-8 items-center justify-center rounded-full border shadow-md transition sm:h-7 sm:w-7 ${
                                          index === 0
                                            ? 'cursor-default border-amber-300/70 bg-amber-500 text-white'
                                            : 'border-white/35 bg-black/50 text-white hover:bg-amber-500 hover:text-white active:bg-amber-600'
                                        }`}
                                        aria-label={
                                          index === 0
                                            ? 'Imagine favorită (copertă)'
                                            : 'Setează ca imagine favorită'
                                        }
                                        title={
                                          index === 0
                                            ? 'Aceasta este imaginea favorită (copertă)'
                                            : 'Setează ca imagine favorită (copertă)'
                                        }
                                      >
                                        <i
                                          className={`${index === 0 ? 'ri-star-fill' : 'ri-star-line'} text-base leading-none sm:text-sm`}
                                          aria-hidden
                                        />
                                      </button>
                                      <div className="absolute bottom-0 left-0 right-0 z-[1] flex items-center justify-center gap-0.5 bg-black/45 px-0.5 py-1 sm:gap-1 sm:px-1">
                                        <button
                                          type="button"
                                          draggable={false}
                                          disabled={index === 0}
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            moveManualImageStep(index, -1);
                                          }}
                                          className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md text-white/95 hover:bg-white/15 active:bg-white/25 disabled:opacity-30 sm:h-6 sm:w-6 sm:rounded"
                                          aria-label="Mută mai spre început"
                                        >
                                          <i className="ri-arrow-left-s-line text-base sm:text-sm" aria-hidden />
                                        </button>
                                        <button
                                          type="button"
                                          draggable={false}
                                          disabled={index >= manualFormData.images.length - 1}
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            moveManualImageStep(index, 1);
                                          }}
                                          className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md text-white/95 hover:bg-white/15 active:bg-white/25 disabled:opacity-30 sm:h-6 sm:w-6 sm:rounded"
                                          aria-label="Mută mai spre sfârșit"
                                        >
                                          <i className="ri-arrow-right-s-line text-base sm:text-sm" aria-hidden />
                                        </button>
                                      </div>
                                      <button
                                        type="button"
                                        draggable={false}
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleManualFormRemoveImage(index);
                                        }}
                                        className="absolute -right-1 -top-1 z-[2] flex h-9 w-9 items-center justify-center rounded-full border border-white/30 bg-red-500 text-white shadow-md transition hover:bg-red-600 active:bg-red-700 sm:-right-1.5 sm:-top-1.5 sm:h-8 sm:w-8"
                                        aria-label="Elimină fișierul"
                                      >
                                        <i className="ri-close-line text-base leading-none sm:text-sm" aria-hidden />
                                      </button>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                          <label
                            htmlFor={manualFormData.images.length >= MAX_IMAGES ? undefined : 'manual-file-upload'}
                            className={`flex w-full flex-col items-center touch-manipulation ${
                              manualFormData.images.length >= MAX_IMAGES ? 'cursor-not-allowed' : 'cursor-pointer'
                            } ${
                              manualFormData.images.length > 0
                                ? isDarkMode
                                  ? 'border-t border-zinc-700/80 pt-3'
                                  : 'border-t border-stone-200/90 pt-3'
                                : ''
                            }`}
                          >
                            {manualFormData.images.length >= MAX_IMAGES ? (
                              <>
                                <div className="mb-2 flex justify-center">
                                  <i
                                    className={`ri-close-circle-fill text-3xl ${
                                      isDarkMode ? 'text-zinc-500' : 'text-gray-400'
                                    }`}
                                    aria-hidden
                                  />
                                </div>
                                <p
                                  className={`mb-1 text-sm font-semibold ${
                                    isDarkMode ? 'text-gray-500' : 'text-gray-500'
                                  }`}
                                >
                                  Limita de 20 imagini atinsă
                                </p>
                                <p
                                  className={`mb-0 flex flex-wrap items-center justify-center gap-1.5 text-xs ${
                                    isDarkMode ? 'text-gray-500' : 'text-gray-500'
                                  }`}
                                >
                                  <i className="ri-drag-drop-line max-sm:hidden text-sm opacity-80" aria-hidden />
                                  <i className="ri-information-line hidden max-sm:inline text-sm opacity-80" aria-hidden />
                                  <span>
                                    <span className="max-sm:hidden">
                                      Poți lăsa fișiere oriunde în secțiunea Media (inclusiv peste miniaturi). JPG, PNG,
                                      GIF, WebP · max 10 MB / fișier
                                    </span>
                                    <span className="hidden max-sm:inline">
                                      JPG, PNG, GIF, WebP · max 10 MB / fișier.
                                    </span>
                                  </span>
                                </p>
                                <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                                  <span
                                    className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${
                                      manualFormData.images.length >= MAX_IMAGES
                                        ? 'bg-red-500/15 text-red-600 dark:text-red-400'
                                        : manualFormData.images.length >= FREE_IMAGES
                                          ? isDarkMode
                                            ? 'bg-amber-500/15 text-amber-300'
                                            : 'bg-amber-100 text-amber-800'
                                          : isDarkMode
                                            ? 'bg-white/10 text-gray-300'
                                            : 'bg-gray-100 text-gray-600'
                                    }`}
                                  >
                                    <i className="ri-stack-fill" aria-hidden />
                                    {manualFormData.images.length}/{MAX_IMAGES} imagini
                                  </span>
                                  {manualFormData.images.length < FREE_IMAGES ? (
                                    <span
                                      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${
                                        isDarkMode ? 'bg-emerald-500/15 text-emerald-300' : 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200/80'
                                      }`}
                                    >
                                      <i className="ri-gift-fill" aria-hidden />
                                      {FREE_IMAGES - manualFormData.images.length === 1
                                        ? '1 poză gratuită rămasă'
                                        : `${FREE_IMAGES - manualFormData.images.length} poze gratuite rămase`}
                                    </span>
                                  ) : (
                                    <span
                                      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${
                                        isDarkMode ? 'bg-amber-500/15 text-amber-200' : 'bg-amber-50 text-amber-800 ring-1 ring-amber-200/80'
                                      }`}
                                    >
                                      <i className="ri-wallet-3-fill" aria-hidden />
                                      {manualFormData.images.length - FREE_IMAGES > 0
                                        ? `${manualFormData.images.length - FREE_IMAGES} ${manualFormData.images.length - FREE_IMAGES > 1 ? 'poze' : 'poză'} cu token${manualFormData.images.length - FREE_IMAGES > 1 ? 'uri' : ''} • `
                                        : ''}
                                      {manualFormUserTokens.balance} token
                                      {manualFormUserTokens.balance !== 1 ? 'uri' : ''} disponibil
                                      {manualFormUserTokens.balance !== 1 ? 'e' : ''}
                                    </span>
                                  )}
                                  {manualFormData.images.length >= FREE_IMAGES && (
                                    <span
                                      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium ${
                                        isDarkMode ? 'bg-blue-500/15 text-blue-300' : 'bg-blue-50 text-blue-700'
                                      }`}
                                    >
                                      <i className="ri-information-fill text-xs" aria-hidden />
                                      1 token = 1 poză peste cele {FREE_IMAGES} gratuite
                                    </span>
                                  )}
                                </div>
                              </>
                            ) : manualFormData.images.length > 0 ? (
                              <>
                                <div className="flex w-full max-w-full flex-col items-center gap-3 sm:flex-row sm:items-center sm:justify-center sm:gap-5">
                                  <div className="flex shrink-0 justify-center">
                                    <CameraAddOutlineIcon
                                      className={`h-11 w-11 shrink-0 sm:h-11 sm:w-11 ${
                                        isDarkMode ? 'text-zinc-100' : 'text-zinc-900'
                                      }`}
                                    />
                                  </div>
                                  <div className="min-w-0 w-full max-w-full space-y-1 text-center sm:flex-1 sm:text-left">
                                    <p
                                      className={`mb-0 text-base font-semibold sm:text-sm ${
                                        isDarkMode ? 'text-gray-200' : 'text-gray-800'
                                      }`}
                                    >
                                      Adaugă mai multe imagini
                                    </p>
                                    <p
                                      className={`mb-0 flex flex-wrap items-center justify-center gap-1.5 text-xs leading-relaxed sm:justify-start sm:text-[11px] sm:leading-snug ${
                                        isDarkMode ? 'text-gray-500' : 'text-gray-500'
                                      }`}
                                    >
                                      <i className="ri-drag-drop-line max-sm:hidden shrink-0 text-sm opacity-80" aria-hidden />
                                      <i className="ri-image-add-line hidden max-sm:inline shrink-0 text-sm opacity-80" aria-hidden />
                                      <span>
                                        <span className="max-sm:hidden">
                                          Poți lăsa fișiere oriunde în Media (inclusiv peste miniaturi). JPG, PNG, GIF,
                                          WebP · max 10 MB / fișier
                                        </span>
                                        <span className="hidden max-sm:inline">
                                          JPG, PNG, GIF, WebP · max 10 MB. Folosește butonul „Adaugă imagini” sau apasă
                                          aici.
                                        </span>
                                      </span>
                                    </p>
                                  </div>
                                </div>
                                <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
                                  <span
                                    className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${
                                      manualFormData.images.length >= FREE_IMAGES
                                        ? isDarkMode
                                          ? 'bg-amber-500/15 text-amber-300'
                                          : 'bg-amber-100 text-amber-800'
                                        : isDarkMode
                                          ? 'bg-white/10 text-gray-300'
                                          : 'bg-gray-100 text-gray-600'
                                    }`}
                                  >
                                    <i className="ri-stack-fill" aria-hidden />
                                    {manualFormData.images.length}/{MAX_IMAGES} imagini
                                  </span>
                                  {manualFormData.images.length < FREE_IMAGES ? (
                                    <span
                                      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${
                                        isDarkMode ? 'bg-emerald-500/15 text-emerald-300' : 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200/80'
                                      }`}
                                    >
                                      <i className="ri-gift-fill" aria-hidden />
                                      {FREE_IMAGES - manualFormData.images.length === 1
                                        ? '1 poză gratuită rămasă'
                                        : `${FREE_IMAGES - manualFormData.images.length} poze gratuite rămase`}
                                    </span>
                                  ) : (
                                    <span
                                      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${
                                        isDarkMode ? 'bg-amber-500/15 text-amber-200' : 'bg-amber-50 text-amber-800 ring-1 ring-amber-200/80'
                                      }`}
                                    >
                                      <i className="ri-wallet-3-fill" aria-hidden />
                                      {manualFormData.images.length - FREE_IMAGES > 0
                                        ? `${manualFormData.images.length - FREE_IMAGES} ${manualFormData.images.length - FREE_IMAGES > 1 ? 'poze' : 'poză'} cu token${manualFormData.images.length - FREE_IMAGES > 1 ? 'uri' : ''} • `
                                        : ''}
                                      {manualFormUserTokens.balance} token
                                      {manualFormUserTokens.balance !== 1 ? 'uri' : ''} disponibil
                                      {manualFormUserTokens.balance !== 1 ? 'e' : ''}
                                    </span>
                                  )}
                                  {manualFormData.images.length >= FREE_IMAGES && (
                                    <span
                                      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium ${
                                        isDarkMode ? 'bg-blue-500/15 text-blue-300' : 'bg-blue-50 text-blue-700'
                                      }`}
                                    >
                                      <i className="ri-information-fill text-xs" aria-hidden />
                                      1 token = 1 poză peste cele {FREE_IMAGES} gratuite
                                    </span>
                                  )}
                                </div>
                              </>
                            ) : (
                              <>
                                <div className="mb-3 flex justify-center max-sm:mb-2 max-sm:hidden">
                                  <CameraAddOutlineIcon
                                    className={`shrink-0 ${
                                      isDarkMode ? 'text-zinc-100' : 'text-zinc-900'
                                    } h-16 w-16 sm:h-[4.5rem] sm:w-[4.5rem]`}
                                  />
                                </div>
                                <p
                                  className={`mb-1 text-sm font-semibold ${
                                    isDarkMode ? 'text-gray-200' : 'text-gray-800'
                                  }`}
                                >
                                  <span className="max-sm:hidden">
                                    Trage fișiere aici sau apasă pentru a selecta
                                  </span>
                                  <span className="hidden max-sm:inline">
                                    Apasă aici sau folosește „Adaugă imagini”
                                  </span>
                                </p>
                                <p
                                  className={`flex flex-wrap items-center justify-center gap-1.5 text-xs ${
                                    isDarkMode ? 'text-gray-500' : 'text-gray-500'
                                  }`}
                                >
                                  <i className="ri-drag-drop-line max-sm:hidden text-sm opacity-80" aria-hidden />
                                  <i className="ri-smartphone-line hidden max-sm:inline text-sm opacity-80" aria-hidden />
                                  <span>
                                    <span className="max-sm:hidden">
                                      Poți lăsa fișiere oriunde în secțiunea Media (inclusiv peste miniaturi). JPG, PNG,
                                      GIF, WebP · max 10 MB / fișier
                                    </span>
                                    <span className="hidden max-sm:inline text-center leading-snug">
                                      Alege din galerie sau fă o poză cu butonul de mai sus. JPG, PNG, GIF, WebP · max 10
                                      MB / fișier.
                                    </span>
                                  </span>
                                </p>
                                <div className="mt-4 flex flex-wrap items-center justify-center gap-2 max-sm:mt-3">
                                  <span
                                    className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${
                                      manualFormData.images.length >= FREE_IMAGES
                                        ? isDarkMode
                                          ? 'bg-amber-500/15 text-amber-300'
                                          : 'bg-amber-100 text-amber-800'
                                        : isDarkMode
                                          ? 'bg-white/10 text-gray-300'
                                          : 'bg-gray-100 text-gray-600'
                                    }`}
                                  >
                                    <i className="ri-stack-fill" aria-hidden />
                                    {manualFormData.images.length}/{MAX_IMAGES} imagini
                                  </span>
                                  {manualFormData.images.length < FREE_IMAGES ? (
                                    <span
                                      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${
                                        isDarkMode ? 'bg-emerald-500/15 text-emerald-300' : 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200/80'
                                      }`}
                                    >
                                      <i className="ri-gift-fill" aria-hidden />
                                      {FREE_IMAGES - manualFormData.images.length === 1
                                        ? '1 poză gratuită rămasă'
                                        : `${FREE_IMAGES - manualFormData.images.length} poze gratuite rămase`}
                                    </span>
                                  ) : (
                                    <span
                                      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${
                                        isDarkMode ? 'bg-amber-500/15 text-amber-200' : 'bg-amber-50 text-amber-800 ring-1 ring-amber-200/80'
                                      }`}
                                    >
                                      <i className="ri-wallet-3-fill" aria-hidden />
                                      {manualFormData.images.length - FREE_IMAGES > 0
                                        ? `${manualFormData.images.length - FREE_IMAGES} ${manualFormData.images.length - FREE_IMAGES > 1 ? 'poze' : 'poză'} cu token${manualFormData.images.length - FREE_IMAGES > 1 ? 'uri' : ''} • `
                                        : ''}
                                      {manualFormUserTokens.balance} token
                                      {manualFormUserTokens.balance !== 1 ? 'uri' : ''} disponibil
                                      {manualFormUserTokens.balance !== 1 ? 'e' : ''}
                                    </span>
                                  )}
                                  {manualFormData.images.length >= FREE_IMAGES && (
                                    <span
                                      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium ${
                                        isDarkMode ? 'bg-blue-500/15 text-blue-300' : 'bg-blue-50 text-blue-700'
                                      }`}
                                    >
                                      <i className="ri-information-fill text-xs" aria-hidden />
                                      1 token = 1 poză peste cele {FREE_IMAGES} gratuite
                                    </span>
                                  )}
                                </div>
                              </>
                            )}
                          </label>
                        </div>

                        {manualFormData.images.length === 0 && (
                          <p
                            className={`px-0.5 text-center text-xs leading-relaxed sm:text-[11px] ${isDarkMode ? 'text-zinc-500' : 'text-stone-500'}`}
                          >
                            <span className="max-sm:hidden">
                              După încărcare, miniaturile apar în galeria din caseta de mai sus. Prima imagine este
                              coperta.
                            </span>
                            <span className="hidden max-sm:inline">
                              După încărcare, pozele apar în zona de mai sus. Prima imagine este coperta.
                            </span>
                          </p>
                        )}
                      </div>
                    </div>

                    {/* GoBid AI */}
                    <div className={`rounded-xl border p-4 sm:rounded-2xl sm:p-5 md:p-6 ${
                      isDarkMode ? 'border-zinc-800 bg-zinc-900/40' : 'border-stone-200/90 bg-white'
                    }`}>
                      <div className="mb-3 flex flex-col gap-2.5 sm:mb-4 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                        <h3 className={`text-base font-semibold ${isDarkMode ? 'text-zinc-100' : 'text-stone-900'}`}>
                          Optimizare conținut
                        </h3>
                        <button
                          type="button"
                          onClick={handleManualFormAutoEnhance}
                          disabled={manualFormIsEnhancing || !manualFormData.title.trim() || !manualFormData.description.trim()}
                          className={`flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium transition-colors ${
                            manualFormIsEnhancing || !manualFormData.title.trim() || !manualFormData.description.trim()
                              ? isDarkMode
                                ? 'cursor-not-allowed bg-zinc-800 text-zinc-500'
                                : 'cursor-not-allowed bg-stone-200 text-stone-500'
                              : isDarkMode
                                ? 'bg-zinc-100 text-zinc-950 hover:bg-white'
                                : 'bg-stone-900 text-white hover:bg-stone-800'
                          }`}
                          title="GoBid AI rescrie instant titlul, descrierea și meta SEO"
                        >
                          {manualFormIsEnhancing ? (
                            <>
                              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                              <span>Procesează...</span>
                            </>
                          ) : (
                            <>
                              <i className="ri-sparkling-2-fill"></i>
                              <span>Optimizează cu GoBid AI</span>
                            </>
                          )}
                        </button>
                      </div>

                      {/* Auto-enhance checkbox cu opțiuni de rescriere */}
                      <div className={`rounded-lg border p-3 sm:rounded-xl sm:p-4 ${
                        isDarkMode ? 'border-zinc-800 bg-zinc-950/60' : 'border-stone-200 bg-stone-50/80'
                      }`}>
                        {/* Checkbox principal */}
                        <label className="flex cursor-pointer items-center gap-2 mb-2.5 sm:mb-3">
                          <input
                            type="checkbox"
                            checked={manualFormAutoEnhance}
                            onChange={(e) => setManualFormAutoEnhance(e.target.checked)}
                            className={`w-5 h-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500 ${
                              isDarkMode ? 'border-gray-600' : ''
                            }`}
                          />
                          <div className="flex-1">
                            <span className={`text-sm font-semibold ${
                              isDarkMode ? 'text-white' : 'text-gray-900'
                            }`}>
                              GoBid AI rescrie titlul, descrierea și meta SEO
                            </span>
                            <p className={`text-xs mt-0.5 ${
                              isDarkMode ? 'text-gray-400' : 'text-gray-600'
                            }`}>
                              Bifează dacă vrei ca la salvare GoBid AI să rescrie titlul, descrierea și meta SEO (altfel rămân textele tale).
                            </p>
                          </div>
                        </label>

                        {/* Opțiuni de rescriere - doar când autoEnhance este activat */}
                        {manualFormAutoEnhance && (
                          <div className={`ml-7 mt-3 space-y-2 border-t pt-3 ${isDarkMode ? 'border-zinc-800' : 'border-stone-200'}`}>
                            <label className="flex items-center gap-2 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={manualFormRewriteTitle}
                                onChange={(e) => setManualFormRewriteTitle(e.target.checked)}
                                className={`w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 ${
                                  isDarkMode ? 'border-gray-600' : ''
                                }`}
                              />
                              <span className={`text-sm ${
                                isDarkMode ? 'text-gray-300' : 'text-gray-700'
                              }`}>
                                GoBid AI rescrie titlul
                              </span>
                            </label>
                            <label className="flex items-center gap-2 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={manualFormRewriteDescription}
                                onChange={(e) => setManualFormRewriteDescription(e.target.checked)}
                                className={`w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 ${
                                  isDarkMode ? 'border-gray-600' : ''
                                }`}
                              />
                              <span className={`text-sm ${
                                isDarkMode ? 'text-gray-300' : 'text-gray-700'
                              }`}>
                                GoBid AI rescrie descrierea
                              </span>
                            </label>
                            <p className={`text-xs pl-6 ${
                              isDarkMode ? 'text-gray-400' : 'text-gray-600'
                            }`}>
                              SEO meta (opțional) este completat automat de GoBid AI dacă alegi butonul de generare.
                            </p>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* SEO: nu se afișează deloc clientului; GoBid AI îl completează la salvare (manualFormAutoEnhance) sau din manualFormSEO */}

                  </form>
                </div>
              </div>
              <div
                className={`shrink-0 border-t px-4 py-4 sm:px-8 sm:py-5 ${
                  isDarkMode
                    ? 'border-zinc-800 bg-zinc-950/95 backdrop-blur-xl supports-[backdrop-filter]:bg-zinc-950/80'
                    : 'border-stone-200 bg-white/95 backdrop-blur-xl supports-[backdrop-filter]:bg-white/90'
                } pb-[max(1rem,env(safe-area-inset-bottom,0px))] shadow-[0_-8px_24px_-12px_rgba(0,0,0,0.12)] dark:shadow-[0_-8px_24px_-12px_rgba(0,0,0,0.35)]`}
              >
                <div className="mx-auto flex w-full max-w-6xl flex-col-reverse gap-3 sm:flex-row sm:flex-wrap sm:justify-end sm:gap-4">
                  <button
                    type="button"
                    onClick={closeManualListingModal}
                    className={`touch-manipulation w-full min-h-[48px] rounded-xl px-5 py-3 text-sm font-semibold transition-colors active:opacity-90 sm:w-auto sm:min-h-0 sm:py-2.5 ${
                      isDarkMode
                        ? 'border border-zinc-700 bg-zinc-900 text-zinc-200 hover:bg-zinc-800 sm:border-0 sm:bg-transparent sm:text-zinc-400 sm:hover:bg-zinc-800 sm:hover:text-zinc-100'
                        : 'border border-stone-200 bg-white text-stone-800 hover:bg-stone-50 sm:border-0 sm:bg-transparent sm:text-stone-600 sm:hover:bg-stone-100 sm:hover:text-stone-900'
                    }`}
                  >
                    Anulează
                  </button>
                  <button
                    type="submit"
                    form="manual-listing-form"
                    disabled={manualFormIsSubmitting}
                    className={`touch-manipulation w-full min-h-[48px] rounded-xl px-6 py-3 text-sm font-semibold shadow-lg transition active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto sm:min-h-0 sm:px-8 sm:py-2.5 sm:shadow-none ${
                      manualFormIsSubmitting
                        ? isDarkMode
                          ? 'bg-zinc-800 text-zinc-500'
                          : 'bg-stone-200 text-stone-500'
                        : isDarkMode
                          ? 'bg-gradient-to-r from-blue-500 to-blue-600 text-white hover:from-blue-400 hover:to-blue-500'
                          : 'bg-gradient-to-r from-blue-600 to-blue-600 text-white shadow-blue-500/25 hover:from-blue-500 hover:to-blue-500'
                    }`}
                  >
                    {manualFormIsSubmitting ? 'Se salvează...' : (editingProductId ? 'Salvează modificările' : 'Salvează produsul')}
                  </button>
                </div>
              </div>
              </div>
            </div>
            </div>
          );
        })()}

      {manualImageLightboxSrc ? (
        <div
          className="fixed inset-0 z-[200001] flex items-center justify-center max-sm:pt-[max(12px,env(safe-area-inset-top,0px))] max-sm:pb-[max(12px,env(safe-area-inset-bottom,0px))] max-sm:pl-[max(12px,env(safe-area-inset-left,0px))] max-sm:pr-[max(12px,env(safe-area-inset-right,0px))] p-3 sm:p-6"
          role="dialog"
          aria-modal="true"
          aria-label="Previzualizare imagine"
        >
          <button
            type="button"
            className="absolute inset-0 bg-black/82 backdrop-blur-[2px] transition-opacity"
            aria-label="Închide previzualizarea"
            onClick={closeManualImagePreview}
          />
          <div className="relative z-10 flex max-h-[min(92dvh,92svh)] w-full max-w-[min(96vw,1280px)] flex-col items-center justify-center">
            <button
              type="button"
              onClick={closeManualImagePreview}
              className={`absolute -right-1 -top-1 z-20 flex h-10 w-10 items-center justify-center rounded-full shadow-lg transition sm:-right-2 sm:-top-2 sm:h-11 sm:w-11 ${
                isDarkMode
                  ? 'bg-zinc-800 text-zinc-100 ring-1 ring-white/15 hover:bg-zinc-700'
                  : 'bg-white text-stone-800 ring-1 ring-black/10 hover:bg-stone-100'
              }`}
              aria-label="Închide"
            >
              <i className="ri-close-line text-2xl leading-none" aria-hidden />
            </button>
            <img
              src={manualImageLightboxSrc}
              alt="Previzualizare imagine încărcată"
              className="max-h-[min(88dvh,88svh)] w-auto max-w-full rounded-lg object-contain shadow-2xl ring-1 ring-white/10"
            />
          </div>
        </div>
      ) : null}

      {/* Counter Offer Modal - Prietenos pentru chat */}
      {showCounterOfferModalChat && counterOfferModalChatData && (
        <div 
          className="fixed inset-0 z-[200000] flex items-center justify-center p-4 animate-in fade-in duration-200"
          style={{ 
            backdropFilter: 'blur(12px)', 
            WebkitBackdropFilter: 'blur(12px)',
            backgroundColor: 'rgba(0, 0, 0, 0.4)'
          }}
        >
          <div 
            className={`w-full max-w-sm rounded-3xl shadow-2xl overflow-hidden transform transition-all animate-in zoom-in-95 duration-200 ${
              isDarkMode ? 'bg-gray-900' : 'bg-white'
            }`}
          >
            <div className="p-8">
              {/* Suma mare în centru */}
              <div className="mb-8 text-center">
                <div className="flex items-center justify-center gap-4 mb-4">
                  <button
                    onClick={() => {
                      const current = parseFloat(counterOfferAmountChat) || counterOfferModalChatData.currentAmount || 0;
                      const newAmount = Math.max(0, current - 10);
                      setCounterOfferAmountChat(newAmount.toString());
                    }}
                    className={`w-12 h-12 rounded-full flex items-center justify-center text-2xl font-bold transition-all ${
                      isDarkMode
                        ? 'bg-gray-800 hover:bg-gray-700 text-gray-300 border border-gray-700'
                        : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
                    }`}
                  >
                    −
                  </button>
                  
                  <div className="flex-1">
                    <input
                      type="text"
                      value={counterOfferAmountChat || ''}
                      onChange={(e) => {
                        const value: string = e.target.value;
                        if (value === '' || /^\d*\.?\d*$/.test(value)) {
                          setCounterOfferAmountChat(value);
                        }
                      }}
                      placeholder={new Intl.NumberFormat('ro-RO', {
                        style: 'currency',
                        currency: counterOfferModalChatData.currency,
                        minimumFractionDigits: 0,
                        maximumFractionDigits: 0,
                      }).format(counterOfferModalChatData.currentAmount || 0)}
                      className={`w-full text-center text-4xl font-bold bg-transparent outline-none ${
                        isDarkMode ? 'text-white placeholder-gray-600' : 'text-gray-900 placeholder-gray-400'
                      }`}
                      autoFocus
                    />
                  </div>
                  
                  <button
                    onClick={() => {
                      const current = parseFloat(counterOfferAmountChat) || counterOfferModalChatData.currentAmount || 0;
                      const newAmount = current + 10;
                      setCounterOfferAmountChat(newAmount.toString());
                    }}
                    className={`w-12 h-12 rounded-full flex items-center justify-center text-2xl font-bold transition-all ${
                      isDarkMode
                        ? 'bg-gray-800 hover:bg-gray-700 text-gray-300 border border-gray-700'
                        : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
                    }`}
                  >
                    +
                  </button>
                </div>
                <p className={`text-sm ${
                  isDarkMode ? 'text-gray-400' : 'text-gray-500'
                }`}>
                  {counterOfferModalChatData.currency}
                </p>
              </div>

              {/* Buttons */}
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setShowCounterOfferModalChat(false);
                    setCounterOfferModalChatData(null);
                    setCounterOfferAmountChat('');
                  }}
                  className={`flex-1 px-6 py-3.5 rounded-xl font-semibold text-sm transition-all ${
                    isDarkMode
                      ? 'bg-gray-800 hover:bg-gray-700 text-gray-300'
                      : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
                  }`}
                >
                  Anulează
                </button>
                <button
                  onClick={async () => {
                    const amount = parseFloat(counterOfferAmountChat);
                    if (!counterOfferAmountChat || isNaN(amount) || amount <= 0) {
                      showNotification('error', 'Eroare', 'Te rugăm să introduci o sumă validă');
                      return;
                    }
                    if (!currentUserId) {
                      setShowCounterOfferAuthModal(true);
                      return;
                    }
                    try {
                      const response = await apiFetchWithSession('/api/bids', {
                        method: 'POST',
                        headers: {
                          'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({
                          product_id: counterOfferModalChatData.productId,
                          amount: amount,
                        }),
                      });
                      
                      if (response.ok) {
                        const result = await response.json();
                        const bidId = (result as { bid?: { id?: string } })?.bid?.id;
                        const { trackGoogleConversion } = await import("@/lib/analytics/googleAds");
                        trackGoogleConversion("bid_created", bidId ? { dedupeKey: bidId } : undefined);
                        setShowCounterOfferModalChat(false);
                        setCounterOfferModalChatData(null);
                        setCounterOfferAmountChat('');
                        
                        // Adaugă mesaj prietenos în chat
                        const { data: userData } = await supabase.auth.getUser();
                        const userName = userData?.user?.user_metadata?.full_name || 
                          userData?.user?.user_metadata?.name || 
                          userData?.user?.email?.split('@')[0] || 
                          'Tu';
                        const messageId = `counter-offer-${Date.now()}`;
                        setChatSystemMessages(prev => ({
                          ...prev,
                          [counterOfferModalChatData.productId]: [
                            ...(prev[counterOfferModalChatData.productId] || []),
                            {
                              id: messageId,
                              message: `${userName} dorește să vă facă o contraofertă`,
                              timestamp: Date.now()
                            }
                          ]
                        }));
                        
                        await loadProductBids(counterOfferModalChatData.productId);
                        
                        // Verifică dacă ultimele 2 oferte sunt de la același utilizator
                        setTimeout(() => {
                          const currentBids = productBids[counterOfferModalChatData.productId] || [];
                          const sortedProductBids = [...currentBids].sort((a, b) => 
                            new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
                          );
                          
                          if (sortedProductBids.length >= 2) {
                            const lastBid = sortedProductBids[sortedProductBids.length - 1];
                            const secondLastBid = sortedProductBids[sortedProductBids.length - 2];
                            
                            // Dacă ultimele 2 oferte sunt de la același utilizator, adaugă mesaj roșu
                            if (lastBid.user_id === secondLastBid.user_id) {
                              const alertMessageId = `counter-offer-alert-${Date.now()}`;
                              setChatSystemMessages(prev => {
                                const existing = prev[counterOfferModalChatData.productId] || [];
                                const hasAlert = existing.some(m => m.isAlert && m.message.includes('altă'));
                                if (hasAlert) return prev;
                                return {
                                  ...prev,
                                  [counterOfferModalChatData.productId]: [
                                    ...existing,
                                    {
                                      id: alertMessageId,
                                      message: `S-a făcut o altă contraofertă`,
                                      timestamp: Date.now(),
                                      isAlert: true
                                    }
                                  ]
                                };
                              });
                            }
                          }
                        }, 500);
                      } else {
                        if (response.status === 401) {
                          setShowCounterOfferAuthModal(true);
                        } else {
                          const result = await response.json().catch(() => ({}));
                          showNotification(
                            'error',
                            'Eroare',
                            (result as { error?: string }).error || 'Eroare la trimiterea contraofertei'
                          );
                        }
                      }
                    } catch (error: any) {
                      console.error('Error placing counter offer:', error);
                      showNotification('error', 'Eroare', 'Eroare la trimiterea contraofertei: ' + (error.message || 'Eroare necunoscută'));
                    }
                  }}
                  className="flex-1 px-6 py-3.5 rounded-xl font-semibold text-sm transition-all bg-red-500 hover:bg-red-600 text-white shadow-lg hover:shadow-xl transform hover:scale-[1.02]"
                >
                  Confirmă contraoferta
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Contraofertă: autentificare necesară (după încercare — răspuns 401) */}
      {showCounterOfferAuthModal && (
        <div
          className="fixed inset-0 z-[200100] flex items-center justify-center p-4"
          role="presentation"
        >
          <button
            type="button"
            className="absolute inset-0 bg-black/50 backdrop-blur-sm transition-opacity animate-in fade-in duration-200"
            aria-label="Închide"
            onClick={() => setShowCounterOfferAuthModal(false)}
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
            aria-labelledby="counter-offer-auth-modal-title"
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
                  id="counter-offer-auth-modal-title"
                  className={`pr-2 text-[1.15rem] font-bold tracking-tight sm:text-xl ${
                    isDarkMode ? "text-white drop-shadow-sm" : "text-gray-900"
                  }`}
                >
                  Contraofertă
                </h2>
                <button
                  type="button"
                  onClick={() => setShowCounterOfferAuthModal(false)}
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
                Pentru a plasa o contraofertă trebuie să fii autentificat cu o sesiune activă. Te rugăm să te conectezi sau să îți creezi un cont, apoi poți încerca din nou.
              </p>
              <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={() => setShowCounterOfferAuthModal(false)}
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
                  onClick={goToAuthFromCounterOfferModal}
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

      {/* Dictation Tutorial Modal */}
      {showDictationTutorial && (
        <div
          className="fixed inset-0 z-[200000] flex items-center justify-center p-4"
          style={{ 
            backdropFilter: 'blur(20px)', 
            WebkitBackdropFilter: 'blur(20px)', 
            backgroundColor: 'rgba(0, 0, 0, 0.7)' 
          }}
          onClick={() => {
            // Nu permite închiderea prin click pe background
          }}
        >
          <div
            className={`w-full max-w-2xl rounded-3xl shadow-2xl transform transition-all max-h-[90vh] flex flex-col ${
              isDarkMode
                ? 'bg-gray-800/95 backdrop-blur-xl border border-gray-700/50'
                : 'bg-white/95 backdrop-blur-xl border border-gray-200/50'
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className={`p-6 border-b ${
              isDarkMode ? 'border-gray-700' : 'border-gray-200'
            }`}>
              <div className="flex items-center gap-4">
                <div className={`p-3 rounded-2xl ${
                  isDarkMode ? 'bg-blue-500/20' : 'bg-blue-100'
                }`}>
                  <i className="ri-mic-line text-3xl text-blue-500"></i>
                </div>
                <div className="flex-1">
                  <h3 className={`text-2xl font-bold ${
                    isDarkMode ? 'text-white' : 'text-gray-900'
                  }`}>
                    Cum funcționează dictarea vocală?
                  </h3>
                  <p className={`text-sm mt-1 ${
                    isDarkMode ? 'text-gray-400' : 'text-gray-600'
                  }`}>
                    GoBid AI - Ghid rapid pentru utilizarea microfonului
                  </p>
                </div>
              </div>
            </div>

            {/* Content */}
            <div className="p-6 space-y-3 overflow-y-auto flex-1" style={{ maxHeight: 'calc(90vh - 200px)' }}>
              {/* Feature 1 */}
              <div className={`flex items-start gap-3 p-3 rounded-xl ${
                isDarkMode ? 'bg-gray-700/30' : 'bg-gray-50'
              }`}>
                <div className={`p-2 rounded-lg flex-shrink-0 ${
                  isDarkMode ? 'bg-green-500/20' : 'bg-green-100'
                }`}>
                  <i className="ri-speak-line text-xl text-green-500"></i>
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className={`font-semibold mb-1 text-sm ${
                    isDarkMode ? 'text-white' : 'text-gray-900'
                  }`}>
                    Vorbește natural
                  </h4>
                  <p className={`text-xs leading-relaxed ${
                    isDarkMode ? 'text-gray-300' : 'text-gray-600'
                  }`}>
                    Spune descrierea produsului în mod natural. Textul apare în timp real. Menționează marca, model, stare, caracteristici, defecte, accesorii.
                  </p>
                </div>
              </div>

              {/* Feature 2 - Transcriere live */}
              <div className={`flex items-start gap-3 p-3 rounded-xl ${
                isDarkMode ? 'bg-gray-700/30' : 'bg-gray-50'
              }`}>
                <div className={`p-2 rounded-lg flex-shrink-0 ${
                  isDarkMode ? 'bg-yellow-500/20' : 'bg-yellow-100'
                }`}>
                  <i className="ri-eye-line text-xl text-yellow-500"></i>
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className={`font-semibold mb-1 text-sm ${
                    isDarkMode ? 'text-white' : 'text-gray-900'
                  }`}>
                    Transcriere live
                  </h4>
                  <p className={`text-xs leading-relaxed ${
                    isDarkMode ? 'text-gray-300' : 'text-gray-600'
                  }`}>
                    Vezi textul în timp real. Butonul microfon pulsează cu punct verde când ascultă. Textul apare instant în caseta de descriere.
                  </p>
                </div>
              </div>

              {/* Feature 3 - Finalizare descriere */}
              <div className={`flex items-start gap-3 p-3 rounded-xl ${
                isDarkMode ? 'bg-gray-700/30' : 'bg-gray-50'
              }`}>
                <div className={`p-2 rounded-lg flex-shrink-0 ${
                  isDarkMode ? 'bg-blue-500/20' : 'bg-blue-100'
                }`}>
                  <i className="ri-check-double-line text-xl text-blue-500"></i>
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className={`font-semibold mb-1 text-sm ${
                    isDarkMode ? 'text-white' : 'text-gray-900'
                  }`}>
                    Finalizare și publicare
                  </h4>
                  <p className={`text-xs leading-relaxed ${
                    isDarkMode ? 'text-gray-300' : 'text-gray-600'
                  }`}>
                    Spune <span className="font-semibold text-blue-600 dark:text-sky-400">"am terminat descrierea"</span> sau <span className="font-semibold text-blue-600 dark:text-sky-400">"genereaza anunt"</span>. Sistemul verifică automat dacă lipsesc informații. Dacă lipsesc → apare modal pentru completare. Dacă nu lipsesc → publică anunțul direct.
                  </p>
                </div>
              </div>

              {/* Feature 4 - Ștergere cuvinte */}
              <div className={`flex items-start gap-3 p-3 rounded-xl ${
                isDarkMode ? 'bg-gray-700/30' : 'bg-gray-50'
              }`}>
                <div className={`p-2 rounded-lg flex-shrink-0 ${
                  isDarkMode ? 'bg-blue-500/20' : 'bg-blue-100'
                }`}>
                  <i className="ri-delete-bin-line text-xl text-blue-500"></i>
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className={`font-semibold mb-1 text-sm ${
                    isDarkMode ? 'text-white' : 'text-gray-900'
                  }`}>
                    Ștergere cuvinte specifice
                  </h4>
                  <p className={`text-xs leading-relaxed ${
                    isDarkMode ? 'text-gray-300' : 'text-gray-600'
                  }`}>
                    Spune <span className="font-semibold text-blue-600 dark:text-sky-400">"sterge"</span> → apare modal "Ștergere activată" → spune cuvintele sau propoziția (ex: "telefon", "iPhone", "stare bună") → devin roșii → confirmă cu <span className="font-semibold text-blue-600 dark:text-sky-400">"da sterge"</span>, <span className="font-semibold text-blue-600 dark:text-sky-400">"este bine sterge"</span> sau <span className="font-semibold text-blue-600 dark:text-sky-400">"ok sterge"</span>.
                  </p>
                </div>
              </div>

              {/* Feature 5 - Ștergere completă */}
              <div className={`flex items-start gap-3 p-3 rounded-xl ${
                isDarkMode ? 'bg-gray-700/30' : 'bg-gray-50'
              }`}>
                <div className={`p-2 rounded-lg flex-shrink-0 ${
                  isDarkMode ? 'bg-red-500/20' : 'bg-red-100'
                }`}>
                  <i className="ri-delete-bin-7-line text-xl text-red-500"></i>
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className={`font-semibold mb-1 text-sm ${
                    isDarkMode ? 'text-white' : 'text-gray-900'
                  }`}>
                    Ștergere completă descriere
                  </h4>
                  <p className={`text-xs leading-relaxed ${
                    isDarkMode ? 'text-gray-300' : 'text-gray-600'
                  }`}>
                    Spune <span className="font-semibold text-red-600 dark:text-red-400">"sterge toata descrierea"</span> sau <span className="font-semibold text-red-600 dark:text-red-400">"iao de la capat"</span>. Descrierea se șterge imediat, fără confirmare.
                  </p>
                </div>
              </div>

              {/* Feature 6 - Publicare anunț */}
              <div className={`flex items-start gap-3 p-3 rounded-xl ${
                isDarkMode ? 'bg-gray-700/30' : 'bg-gray-50'
              }`}>
                <div className={`p-2 rounded-lg flex-shrink-0 ${
                  isDarkMode ? 'bg-blue-500/20' : 'bg-blue-100'
                }`}>
                  <i className="ri-rocket-line text-xl text-blue-500"></i>
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className={`font-semibold mb-1 text-sm ${
                    isDarkMode ? 'text-white' : 'text-gray-900'
                  }`}>
                    Publicare anunț vocală
                  </h4>
                  <p className={`text-xs leading-relaxed ${
                    isDarkMode ? 'text-gray-300' : 'text-gray-600'
                  }`}>
                    După imagini și descriere, spune <span className="font-semibold text-blue-600 dark:text-blue-400">"publica"</span>, <span className="font-semibold text-blue-600 dark:text-blue-400">"genereaza anunt"</span> sau <span className="font-semibold text-blue-600 dark:text-blue-400">"genereaza cu gobid"</span>. Sistemul verifică automat informațiile și procesează descrierea.
                  </p>
                </div>
              </div>

              {/* Feature 7 - Completare automată */}
              <div className={`flex items-start gap-3 p-3 rounded-xl ${
                isDarkMode ? 'bg-gray-700/30' : 'bg-gray-50'
              }`}>
                <div className={`p-2 rounded-lg flex-shrink-0 ${
                  isDarkMode ? 'bg-orange-500/20' : 'bg-orange-100'
                }`}>
                  <i className="ri-information-line text-xl text-orange-500"></i>
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className={`font-semibold mb-1 text-sm ${
                    isDarkMode ? 'text-white' : 'text-gray-900'
                  }`}>
                    Completare automată câmpuri
                  </h4>
                  <p className={`text-xs leading-relaxed ${
                    isDarkMode ? 'text-gray-300' : 'text-gray-600'
                  }`}>
                    Dacă lipsesc informații (ex: marca, model, stare), apare modal pentru completare. Completează vocal (microfon lângă fiecare câmp) sau manual. Publicarea este blocată până la completarea tuturor câmpurilor obligatorii.
                  </p>
                </div>
              </div>

              {/* Feature 8 - Extragere preț */}
              <div className={`flex items-start gap-3 p-3 rounded-xl ${
                isDarkMode ? 'bg-gray-700/30' : 'bg-gray-50'
              }`}>
                <div className={`p-2 rounded-lg flex-shrink-0 ${
                  isDarkMode ? 'bg-emerald-500/20' : 'bg-emerald-100'
                }`}>
                  <i className="ri-money-dollar-circle-line text-xl text-emerald-500"></i>
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className={`font-semibold mb-1 text-sm ${
                    isDarkMode ? 'text-white' : 'text-gray-900'
                  }`}>
                    Extragere automată preț
                  </h4>
                  <p className={`text-xs leading-relaxed ${
                    isDarkMode ? 'text-gray-300' : 'text-gray-600'
                  }`}>
                    Dacă nu vrei să completezi prețul manual, îl poți spune în descriere (ex: "preț 1800 lei", "2000 ron"). Sistemul îl extrage automat și îl completează în câmpul de preț. Prețul este eliminat din descriere. Notificare la detectare.
                  </p>
                </div>
              </div>

              {/* Feature 9 - Procesare inteligentă */}
              <div className={`flex items-start gap-3 p-3 rounded-xl ${
                isDarkMode ? 'bg-gray-700/30' : 'bg-gray-50'
              }`}>
                <div className={`p-2 rounded-lg flex-shrink-0 ${
                  isDarkMode ? 'bg-cyan-500/20' : 'bg-cyan-100'
                }`}>
                  <i className="ri-magic-line text-xl text-cyan-500"></i>
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className={`font-semibold mb-1 text-sm ${
                    isDarkMode ? 'text-white' : 'text-gray-900'
                  }`}>
                    Procesare inteligentă descriere
                  </h4>
                  <p className={`text-xs leading-relaxed ${
                    isDarkMode ? 'text-gray-300' : 'text-gray-600'
                  }`}>
                    Sistemul procesează automat descrierea vocală și o transformă într-o descriere structurată, adaptată la categoria produsului. Extrage marca, model, caracteristici și le organizează profesional.
                  </p>
                </div>
              </div>

              {/* Feature 10 - Închidere tutorial */}
              <div className={`flex items-start gap-3 p-3 rounded-xl ${
                isDarkMode ? 'bg-gray-700/30' : 'bg-gray-50'
              }`}>
                <div className={`p-2 rounded-lg flex-shrink-0 ${
                  isDarkMode ? 'bg-gray-500/20' : 'bg-gray-100'
                }`}>
                  <i className="ri-close-circle-line text-xl text-gray-500"></i>
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className={`font-semibold mb-1 text-sm ${
                    isDarkMode ? 'text-white' : 'text-gray-900'
                  }`}>
                    Închidere tutorial
                  </h4>
                  <p className={`text-xs leading-relaxed ${
                    isDarkMode ? 'text-gray-300' : 'text-gray-600'
                  }`}>
                    Spune <span className="font-semibold text-gray-600 dark:text-gray-400">"nu mai afișa tutorial"</span> pentru a-l închide permanent. Tutorialul apare automat la fiecare activare a microfonului până când îl închizi.
                  </p>
                </div>
              </div>

              {/* Feature 11 - Cerințe tehnice */}
              <div className={`flex items-start gap-3 p-3 rounded-xl ${
                isDarkMode ? 'bg-gray-700/30' : 'bg-gray-50'
              }`}>
                <div className={`p-2 rounded-lg flex-shrink-0 ${
                  isDarkMode ? 'bg-red-500/20' : 'bg-red-100'
                }`}>
                  <i className="ri-error-warning-line text-xl text-red-500"></i>
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className={`font-semibold mb-1 text-sm ${
                    isDarkMode ? 'text-white' : 'text-gray-900'
                  }`}>
                    Cerințe tehnice
                  </h4>
                  <p className={`text-xs leading-relaxed ${
                    isDarkMode ? 'text-gray-300' : 'text-gray-600'
                  }`}>
                    <span className="font-semibold">Browser:</span> Chrome sau Edge. <span className="font-semibold">Conectare:</span> HTTPS sau localhost. <span className="font-semibold">Permisiuni:</span> Acceptă accesul la microfon când browserul cere.
                  </p>
                </div>
              </div>
            </div>

            {/* Footer with buttons */}
            <div className={`p-6 border-t flex flex-col sm:flex-row gap-3 ${
              isDarkMode ? 'border-gray-700' : 'border-gray-200'
            }`}>
              <button
                onClick={() => {
                  setTutorialDismissed(true);
                  if (typeof window !== 'undefined') {
                    localStorage.setItem('dictationTutorialDontShow', 'true');
                  }
                  setShowDictationTutorial(false);
                  // Pornește microfonul după închiderea tutorialului
                  setTimeout(() => {
                    handleQuickAddDictation();
                  }, 100);
                }}
                className={`flex-1 px-6 py-3 rounded-xl font-semibold transition-all ${
                  isDarkMode
                    ? 'bg-gray-700 hover:bg-gray-600 text-white'
                    : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
                }`}
              >
                <i className="ri-close-circle-line mr-2"></i>
                Nu mai afișa tutorialul
              </button>
              <button
                onClick={() => {
                  setTutorialDismissed(true);
                  setShowDictationTutorial(false);
                  // Pornește microfonul după închiderea tutorialului
                  setTimeout(() => {
                    handleQuickAddDictation();
                  }, 100);
                }}
                className={`flex-1 px-6 py-3 rounded-xl font-semibold transition-all ${
                  isDarkMode
                    ? 'bg-gradient-to-r from-blue-600 to-blue-600 hover:from-blue-500 hover:to-blue-500 text-white shadow-lg'
                    : 'bg-gradient-to-r from-blue-500 to-blue-500 hover:from-blue-600 hover:to-blue-600 text-white shadow-lg'
                }`}
              >
                <i className="ri-check-line mr-2"></i>
                Da, am înțeles
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast Notification */}
      {toastNotification && (
        <div className="fixed top-4 right-4 z-[80] animate-in slide-in-from-top-2 fade-in duration-300">
          <div
            className={`rounded-2xl p-4 w-full max-w-sm shadow-2xl backdrop-blur-xl border ${
              toastNotification.type === 'success'
                ? 'bg-green-500/90 border-green-400/50'
                : toastNotification.type === 'error'
                ? 'bg-red-500/90 border-red-400/50'
                : 'bg-blue-500/90 border-blue-400/50'
            }`}
          >
            <div className="flex items-start gap-3">
              {/* Icon */}
              <div className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center ${
                toastNotification.type === 'success'
                  ? 'bg-white/20'
                  : toastNotification.type === 'error'
                  ? 'bg-white/20'
                  : 'bg-white/20'
              }`}>
                {toastNotification.type === 'success' ? (
                  <i className="ri-checkbox-circle-line text-2xl text-white"></i>
                ) : toastNotification.type === 'error' ? (
                  <i className="ri-error-warning-line text-2xl text-white"></i>
                ) : (
                  <i className="ri-information-line text-2xl text-white"></i>
                )}
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-bold text-white mb-1">
                  {toastNotification.title}
                </h3>
                <p className="text-xs text-white/90">
                  {toastNotification.message}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}


      {/* Missing Fields Modal */}
      {showMissingFieldsModal && missingFieldsData && (
        <div
          className="fixed inset-0 z-[200000] flex items-center justify-center p-4"
          style={{ 
            backdropFilter: 'blur(20px)', 
            WebkitBackdropFilter: 'blur(20px)', 
            backgroundColor: 'rgba(0, 0, 0, 0.7)' 
          }}
          onClick={(e) => {
            // Nu permite închiderea prin click pe background
          }}
        >
          <div
            className={`w-full max-w-2xl rounded-3xl shadow-2xl max-h-[90vh] overflow-y-auto ${
              isDarkMode
                ? 'bg-gray-800/95 backdrop-blur-xl border border-gray-700/50'
                : 'bg-white/95 backdrop-blur-xl border border-gray-200/50'
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className={`p-6 border-b ${
              isDarkMode ? 'border-gray-700' : 'border-gray-200'
            }`}>
              <div className="flex items-center gap-4">
                <div className={`p-3 rounded-2xl ${
                  isDarkMode ? 'bg-yellow-500/20' : 'bg-yellow-100'
                }`}>
                  <i className="ri-information-line text-3xl text-yellow-500"></i>
                </div>
                <div className="flex-1">
                  <h3 className={`text-2xl font-bold ${
                    isDarkMode ? 'text-white' : 'text-gray-900'
                  }`}>
                    Informații necesare
                  </h3>
                  <p className={`text-sm mt-1 ${
                    isDarkMode ? 'text-gray-400' : 'text-gray-600'
                  }`}>
                    Pentru a genera o descriere completă, avem nevoie de câteva detalii suplimentare
                  </p>
                </div>
                <button
                  onClick={() => {
                    setShowMissingFieldsModal(false);
                    setMissingFieldsData(null);
                    setFieldInputs({});
                  }}
                  className={`p-2 rounded-xl transition-all ${
                    isDarkMode
                      ? 'text-gray-400 hover:text-white hover:bg-gray-700'
                      : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                  }`}
                >
                  <i className="ri-close-line text-xl"></i>
                </button>
              </div>
            </div>

            {/* Content */}
            <div className="p-6 space-y-4">
              <p className={`text-sm ${
                isDarkMode ? 'text-gray-300' : 'text-gray-700'
              }`}>
                Te rugăm să completezi următoarele informații pentru a crea o descriere cât mai precisă:
              </p>

              {missingFieldsData.fields.map((field, index) => {
                const fieldLabels: Record<string, string> = {
                  marca: 'Marca',
                  model: 'Modelul produsului',
                  capacitate: 'Capacitatea (ex: 128 GB)',
                  culoare: 'Culoarea',
                  stare: 'Starea produsului',
                  baterie: 'Sănătatea bateriei (%)',
                  deblocat: 'Este deblocat?',
                  iCloud: 'Status iCloud',
                  accesorii: 'Accesorii incluse',
                  procesor: 'Procesorul',
                  ram: 'Memoria RAM',
                  stocare: 'Stocarea',
                  an: 'Anul fabricației',
                  kilometraj: 'Kilometrajul',
                  combustibil: 'Tipul de combustibil',
                  cutie: 'Tipul de cutie',
                  dotari: 'Dotările',
                  camere: 'Numărul de camere',
                  suprafata: 'Suprafața (mp)',
                  etaj: 'Etajul',
                  teren: 'Terenul (mp)',
                  categoria: 'Categoria',
                  localizare: 'Localizarea',
                  inaltime: 'Înălțimea (m)',
                  tip: 'Tipul produsului',
                  material: 'Materialul',
                  dimensiuni: 'Dimensiunile',
                  artist: 'Artistul',
                  tehnica: 'Tehnica',
                  certificat: 'Certificat?',
                  epoca: 'Epoca',
                  raritate: 'Raritatea',
                  titlu: 'Titlul',
                  autor: 'Autorul',
                  marime: 'Mărimea',
                  volum: 'Volumul (ml)',
                  putere: 'Puterea',
                  ore: 'Ore de funcționare',
                  cilindree: 'Cilindreea',
                  tonaj: 'Tonajul',
                  autonomie: 'Autonomia',
                  lungime: 'Lungimea (m)',
                  grosime: 'Grosimea (cm)',
                  cantitate: 'Cantitatea',
                  calitate: 'Calitatea',
                  compatibilitate: 'Compatibilitatea',
                  specie: 'Specia',
                  rasa: 'Rasa',
                  varsta: 'Vârsta',
                  blockchain: 'Blockchain-ul',
                  descriere: 'Descrierea detaliată'
                };

                const fieldPlaceholders: Record<string, string> = {
                  marca: 'ex: iPhone, Samsung, BMW, Dell',
                  model: 'ex: 12, 13, Pro, Max, Series 3',
                  capacitate: 'ex: 128 GB, 256 GB',
                  culoare: 'ex: negru, alb, gri, auriu',
                  stare: 'ex: excelentă, foarte bună, bună',
                  baterie: 'ex: 86%, 90%',
                  deblocat: 'ex: deblocat, blocat',
                  iCloud: 'ex: șters, activ, dezactivat',
                  accesorii: 'ex: cutie, cablu, încărcător',
                  procesor: 'ex: Intel i5, AMD Ryzen, M1',
                  ram: 'ex: 8 GB, 16 GB',
                  stocare: 'ex: 256 GB, 512 GB, 1 TB',
                  an: 'ex: 2020, 2021, 2022',
                  kilometraj: 'ex: 50000 km, 100000 km',
                  combustibil: 'ex: benzină, diesel, hibrid, electric',
                  cutie: 'ex: manuală, automată, CVT',
                  dotari: 'ex: climatizare, navigație, senzori',
                  camere: 'ex: 2 camere, 3 camere, garsonieră',
                  suprafata: 'ex: 50 mp, 75 mp, 100 mp',
                  etaj: 'ex: 2, 3, parter, ultimul etaj',
                  teren: 'ex: 500 mp, 1000 mp',
                  categoria: 'ex: intravilan, extravilan',
                  localizare: 'ex: centru, periferie',
                  inaltime: 'ex: 5 m, 6 m',
                  tip: 'ex: masă, scaun, canapea',
                  material: 'ex: lemn, metal, piele',
                  dimensiuni: 'ex: 120x80 cm',
                  artist: 'ex: nume artist',
                  tehnica: 'ex: ulei, acrilic, acvarelă',
                  certificat: 'ex: da, nu, autentic',
                  epoca: 'ex: secolul 19, anii 1950',
                  raritate: 'ex: rar, foarte rar, unic',
                  titlu: 'ex: titlul cărții',
                  autor: 'ex: nume autor',
                  marime: 'ex: S, M, L, XL sau 42, 43',
                  volum: 'ex: 50 ml, 100 ml',
                  putere: 'ex: 100 CP, 150 HP',
                  ore: 'ex: 500 ore, 1000 ore',
                  cilindree: 'ex: 600 cc, 1000 cc',
                  tonaj: 'ex: 3 tone, 5 tone',
                  autonomie: 'ex: 300 km, 500 km sau 30 min',
                  lungime: 'ex: 10 m, 15 m',
                  grosime: 'ex: 10 cm, 20 cm',
                  cantitate: 'ex: 100 kg, 1 tonă, 50 buc',
                  calitate: 'ex: standard, premium',
                  compatibilitate: 'ex: BMW Series 3, Audi A4',
                  specie: 'ex: bovine, ovine, porcine',
                  rasa: 'ex: Holstein, Merino',
                  varsta: 'ex: 2 ani, 6 luni',
                  blockchain: 'ex: Ethereum, Polygon',
                  descriere: 'ex: descriere detaliată a produsului'
                };

                return (
                  <div key={field} className={`p-4 rounded-xl border ${
                    isDarkMode ? 'bg-gray-700/50 border-gray-600' : 'bg-gray-50 border-gray-200'
                  }`}>
                    <label className={`block text-sm font-medium mb-2 ${
                      isDarkMode ? 'text-gray-300' : 'text-gray-700'
                    }`}>
                      {fieldLabels[field] || field}
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={fieldInputs[field] || missingFieldsData.extractedFields[field] || ''}
                        onChange={(e) => setFieldInputs(prev => ({ ...prev, [field]: e.target.value }))}
                        placeholder={fieldPlaceholders[field] || `Introdu ${field}`}
                        className={`flex-1 px-4 py-2 rounded-lg border text-sm ${
                          isDarkMode
                            ? 'bg-gray-800 border-gray-600 text-white placeholder-gray-400'
                            : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500'
                        } focus:outline-none focus:ring-2 focus:ring-blue-500`}
                      />
                      <button
                        onClick={() => {
                          // Pornește dictarea pentru acest câmp specific
                          if (typeof window !== 'undefined') {
                            const SpeechRecognitionAPI = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
                            if (SpeechRecognitionAPI) {
                              const recognition = new SpeechRecognitionAPI();
                              recognition.lang = 'ro';
                              recognition.continuous = false;
                              recognition.interimResults = false;
                              recognition.onresult = (e: SpeechRecognitionEvent) => {
                                const transcript = e.results[0][0]?.transcript?.trim() || '';
                                if (transcript) {
                                  setFieldInputs(prev => ({ ...prev, [field]: transcript }));
                                }
                              };
                              recognition.onerror = () => {
                                showNotification('error', 'Eroare', 'Nu s-a putut activa microfonul pentru acest câmp.');
                              };
                              recognition.start();
                            }
                          }
                        }}
                        className={`px-4 py-2 rounded-lg transition-all ${
                          isDarkMode
                            ? 'bg-blue-600 hover:bg-blue-700 text-white'
                            : 'bg-blue-500 hover:bg-blue-600 text-white'
                        }`}
                        title="Dictare vocală pentru acest câmp"
                      >
                        <i className="ri-mic-line"></i>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Footer */}
            <div className={`p-6 border-t flex gap-3 ${
              isDarkMode ? 'border-gray-700' : 'border-gray-200'
            }`}>
              <button
                onClick={() => {
                  setShowMissingFieldsModal(false);
                  setMissingFieldsData(null);
                  setFieldInputs({});
                }}
                className={`flex-1 px-6 py-3 rounded-xl font-semibold transition-all ${
                  isDarkMode
                    ? 'bg-gray-700 hover:bg-gray-600 text-white'
                    : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
                }`}
              >
                Anulează
              </button>
              <button
                onClick={async () => {
                  // Verifică dacă toate câmpurile sunt completate
                  const allFieldsFilled = missingFieldsData.fields.every(
                    field => fieldInputs[field] && fieldInputs[field].trim()
                  );

                  if (!allFieldsFilled) {
                    showNotification('error', 'Câmpuri incomplete', 
                      'Te rugăm să completezi toate câmpurile obligatorii.');
                    return;
                  }

                  // Actualizează descrierea cu câmpurile completate
                  Promise.all([
                    import('@/lib/description-processor'),
                    import('./description-templates.json')
                  ]).then(([processorModule, templatesModule]) => {
                    // Combină câmpurile extrase cu cele completate
                    const allFields = { ...missingFieldsData.extractedFields, ...fieldInputs };
                    
                    // Reconstruiește descrierea cu toate câmpurile
                    const templates = (templatesModule.default || templatesModule) as any;
                    const categoryData = templates?.[missingFieldsData.category] as Record<string, any> | undefined;
                    const subcategoryData = categoryData?.[missingFieldsData.subcategory] as any;
                    
                    if (subcategoryData) {
                      const randomTemplate = subcategoryData.templates[
                        Math.floor(Math.random() * subcategoryData.templates.length)
                      ];
                      
                      // Completează template-ul manual (similar cu fillTemplate)
                      let description = randomTemplate.pattern;
                      for (const [key, value] of Object.entries(allFields)) {
                        const placeholder = `{${key}}`;
                        if (description.includes(placeholder)) {
                          description = description.replace(new RegExp(placeholder.replace(/[{}]/g, '\\$&'), 'g'), value as string || `[${key} lipsă]`);
                        }
                      }
                      
                      // Procesează câmpuri speciale
                      if (description.includes('{baterieStatus}')) {
                        const baterie = parseInt(allFields.baterie as string || '0');
                        const status = baterie >= 90 ? 'excelentă' : baterie >= 80 ? 'foarte bună' : baterie >= 70 ? 'bună' : 'acceptabilă';
                        description = description.replace(/{baterieStatus}/g, status);
                      }
                      
                      setQuickAddDescription(description);
                      showNotification('success', 'Descriere completă', 
                        'Descrierea a fost completată cu toate informațiile necesare.');
                    }
                    
                    setShowMissingFieldsModal(false);
                    setMissingFieldsData(null);
                    setFieldInputs({});
                    
                    // Continuă cu publicarea dacă era cazul
                    if (handleQuickAddGenerateRef.current) {
                      setTimeout(() => {
                        handleQuickAddGenerateRef.current?.();
                      }, 500);
                    }
                  }).catch(error => {
                    console.error('Error completing description:', error);
                    showNotification('error', 'Eroare', 'Nu s-a putut completa descrierea. Te rugăm să încerci din nou.');
                  });
                }}
                className={`flex-1 px-6 py-3 rounded-xl font-semibold transition-all ${
                  isDarkMode
                    ? 'bg-gradient-to-r from-blue-600 to-blue-600 hover:from-blue-500 hover:to-blue-500 text-white shadow-lg'
                    : 'bg-gradient-to-r from-blue-500 to-blue-500 hover:from-blue-600 hover:to-blue-600 text-white shadow-lg'
                }`}
              >
                <i className="ri-check-line mr-2"></i>
                Completează și continuă
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Notification Modal */}
      {showNotificationModal && notificationModal && (
        <div
          className="fixed inset-0 z-[200000] flex items-center justify-center p-4"
          style={{ backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)', backgroundColor: 'rgba(0, 0, 0, 0.5)' }}
        >
          <div
            className={`rounded-3xl p-8 w-full max-w-md shadow-2xl ${
              isDarkMode
                ? 'bg-gradient-to-br from-gray-800 to-gray-900 border border-gray-700'
                : 'bg-white border border-gray-200'
            }`}
          >
            <div className="flex items-start gap-4">
              {/* Icon */}
              <div className={`flex-shrink-0 w-14 h-14 rounded-full flex items-center justify-center ${
                notificationModal.type === 'success'
                  ? 'bg-green-100 dark:bg-green-900/30'
                  : notificationModal.type === 'error'
                  ? 'bg-red-100 dark:bg-red-900/30'
                  : 'bg-blue-100 dark:bg-blue-900/30'
              }`}>
                {notificationModal.type === 'success' ? (
                  <i className="ri-checkbox-circle-line text-3xl text-green-600 dark:text-green-400"></i>
                ) : notificationModal.type === 'error' ? (
                  <i className="ri-error-warning-line text-3xl text-red-600 dark:text-red-400"></i>
                ) : (
                  <i className="ri-information-line text-3xl text-blue-600 dark:text-blue-400"></i>
                )}
              </div>

              {/* Content */}
              <div className="flex-1">
                <h3 className={`text-xl font-bold mb-2 ${
                  isDarkMode ? 'text-white' : 'text-gray-900'
                }`}>
                  {notificationModal.title}
                </h3>
                <p className={`text-sm mb-6 ${
                  isDarkMode ? 'text-gray-300' : 'text-gray-600'
                }`}>
                  {notificationModal.message}
                </p>
                <button
                  onClick={() => setShowNotificationModal(false)}
                  className={`w-full py-3 px-6 rounded-xl font-semibold transition-all ${
                    notificationModal.type === 'success'
                      ? 'bg-green-500 hover:bg-green-600 text-white'
                      : notificationModal.type === 'error'
                      ? 'bg-red-500 hover:bg-red-600 text-white'
                      : 'bg-blue-500 hover:bg-blue-600 text-white'
                  }`}
                >
                  OK
                </button>
              </div>

              {/* Close button */}
              <button
                onClick={() => setShowNotificationModal(false)}
                className={`p-2 rounded-full transition-colors ${
                  isDarkMode
                    ? 'text-gray-400 hover:text-white hover:bg-gray-700'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                }`}
              >
                <i className="ri-close-line text-xl"></i>
              </button>
            </div>
          </div>
        </div>
      )}

        {/* Modal Contact – ușor mai lat; overlay + card mai transparente */}
        {showContactModal && (
          <div
            className="fixed inset-0 z-[200000] flex items-center justify-center p-2 sm:p-4 md:p-6"
            style={{
              background: isDarkMode
                ? 'linear-gradient(160deg, rgba(26,32,44,0.72) 0%, rgba(45,55,72,0.58) 50%, rgba(26,32,44,0.76) 100%)'
                : 'rgba(15, 23, 42, 0.28)',
              backdropFilter: 'blur(18px) saturate(1.1)',
              WebkitBackdropFilter: 'blur(18px) saturate(1.1)',
            }}
          >
            <div
              className={`relative flex max-h-[92dvh] w-full max-w-[min(100%,27.5rem)] flex-col overflow-hidden rounded-2xl border shadow-2xl sm:max-w-lg md:max-w-xl sm:rounded-3xl ${
                isDarkMode ? 'gobid-modal-dashboard-shell--dark shadow-black/35' : 'gobid-modal-dashboard-shell--light shadow-gray-900/10'
              }`}
            >
              {isDarkMode && (
                <>
                  <div
                    className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,rgba(59,130,246,0.14),transparent),radial-gradient(ellipse_60%_40%_at_100%_100%,rgba(37,99,235,0.1),transparent)] opacity-90"
                  />
                  <div className="pointer-events-none absolute -top-28 -right-20 h-56 w-56 rounded-full bg-blue-600/20 blur-3xl" />
                  <div className="pointer-events-none absolute -bottom-24 -left-16 h-48 w-48 rounded-full bg-sky-900/25 blur-3xl" />
                </>
              )}

              <div className="relative z-10 flex min-h-0 flex-1 flex-col overflow-hidden">
                <div
                  className={`flex shrink-0 items-center justify-between border-b px-3 py-2.5 sm:px-5 sm:py-4 md:px-6 md:py-5 ${
                    isDarkMode ? 'gobid-modal-dashboard-band--dark' : 'gobid-modal-dashboard-band--light'
                  }`}
                >
                  <div className="flex min-w-0 items-center gap-2 sm:gap-3">
                    <div
                      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border shadow-lg sm:h-11 sm:w-11 sm:rounded-2xl ${
                        isDarkMode
                          ? 'border-blue-400/35 bg-gradient-to-br from-blue-600/35 to-slate-900/40 text-blue-100'
                          : 'border-blue-200/80 bg-gradient-to-br from-blue-50/90 to-sky-100/90 text-blue-700 shadow-blue-500/10'
                      }`}
                    >
                      <i className="ri-contacts-line text-lg sm:text-xl"></i>
                    </div>
                    <div className="min-w-0">
                      <p
                        className={`text-[9px] font-semibold uppercase tracking-[0.14em] sm:text-[10px] sm:tracking-[0.2em] ${
                          isDarkMode ? 'text-blue-400/95' : 'text-blue-600'
                        }`}
                      >
                        Anunțuri
                      </p>
                      <h3
                        className={`truncate text-base font-bold tracking-tight sm:text-lg md:text-xl ${
                          isDarkMode
                            ? 'bg-gradient-to-r from-white via-blue-100 to-sky-200/95 bg-clip-text text-transparent'
                            : 'text-gray-900'
                        }`}
                      >
                        Contact anunț
                      </h3>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowContactModal(false)}
                    className={`shrink-0 rounded-lg border p-2 transition-all sm:rounded-xl sm:p-2.5 ${
                      isDarkMode
                        ? 'border-white/10 bg-white/5 text-gray-300 hover:bg-white/10 hover:text-white'
                        : 'border-gray-200/70 bg-white/70 text-gray-600 hover:bg-white/90 hover:text-gray-900'
                    }`}
                    aria-label="Închide"
                  >
                    <i className="ri-close-line text-lg sm:text-xl"></i>
                  </button>
                </div>

                <div className={`min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-3 py-3 sm:px-5 sm:py-5 md:px-6 md:py-6 ${
                  isDarkMode ? 'bg-transparent' : 'gobid-modal-dashboard-body--light'
                }`}>
                  <div className="space-y-2.5 sm:space-y-4">
                  <div>
                    <label
                      className={`mb-1 block text-[10px] font-semibold uppercase tracking-wide sm:mb-2 sm:text-xs ${
                        isDarkMode ? 'text-blue-200/90' : 'text-slate-600'
                      }`}
                    >
                      Numele complet
                    </label>
                    <input
                      type="text"
                      value={contactNumeComplet}
                      onChange={(e) => setContactNumeComplet(e.target.value)}
                      placeholder="Ex: Ion Popescu"
                      className={`w-full rounded-lg border px-3 py-2 text-xs transition-all focus:outline-none focus:ring-2 focus:ring-offset-0 sm:rounded-xl sm:px-4 sm:py-3 sm:text-sm ${
                        isDarkMode
                          ? 'border-white/10 bg-white/[0.07] text-white placeholder:text-gray-500 focus:border-blue-500/50 focus:ring-blue-400/35'
                          : 'border-gray-200/75 bg-white/85 backdrop-blur-sm text-gray-900 placeholder:text-gray-500 focus:border-blue-500 focus:ring-blue-500/25'
                      }`}
                    />
                  </div>
                  <div>
                    <label
                      className={`mb-1 block text-[10px] font-semibold uppercase tracking-wide sm:mb-2 sm:text-xs ${
                        isDarkMode ? 'text-blue-200/90' : 'text-slate-600'
                      }`}
                    >
                      Username
                    </label>
                    <input
                      type="text"
                      value={contactUsername}
                      onChange={(e) => setContactUsername(e.target.value)}
                      placeholder="Ex: ion_popescu"
                      className={`w-full rounded-lg border px-3 py-2 text-xs transition-all focus:outline-none focus:ring-2 focus:ring-offset-0 sm:rounded-xl sm:px-4 sm:py-3 sm:text-sm ${
                        isDarkMode
                          ? 'border-white/10 bg-white/[0.07] text-white placeholder:text-gray-500 focus:border-blue-500/50 focus:ring-blue-400/35'
                          : 'border-gray-200/75 bg-white/85 backdrop-blur-sm text-gray-900 placeholder:text-gray-500 focus:border-blue-500 focus:ring-blue-500/25'
                      }`}
                    />
                  </div>
                  <div>
                    <label
                      className={`mb-1 block text-[10px] font-semibold uppercase tracking-wide sm:mb-2 sm:text-xs ${
                        isDarkMode ? 'text-blue-200/90' : 'text-slate-600'
                      }`}
                    >
                      Nr. de telefon
                    </label>
                    <input
                      type="text"
                      inputMode="tel"
                      value={contactTelefon}
                      onChange={(e) => setContactTelefon(e.target.value)}
                      placeholder="Ex: 0712 345 678"
                      className={`w-full rounded-lg border px-3 py-2 text-xs transition-all focus:outline-none focus:ring-2 focus:ring-offset-0 sm:rounded-xl sm:px-4 sm:py-3 sm:text-sm ${
                        isDarkMode
                          ? 'border-white/10 bg-white/[0.07] text-white placeholder:text-gray-500 focus:border-blue-500/50 focus:ring-blue-400/35'
                          : 'border-gray-200/75 bg-white/85 backdrop-blur-sm text-gray-900 placeholder:text-gray-500 focus:border-blue-500 focus:ring-blue-500/25'
                      }`}
                    />
                  </div>

                  <div
                    className={`mt-0 space-y-3 rounded-xl border p-3 pt-3 backdrop-blur-sm sm:mt-1 sm:space-y-5 sm:rounded-2xl sm:p-4 md:p-5 md:pt-5 ${
                      isDarkMode
                        ? 'border-white/10 bg-white/[0.04] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]'
                        : 'border-gray-200/60 bg-white/40'
                    }`}
                  >
                    <h4
                      className={`flex items-center gap-1.5 text-xs font-bold sm:gap-2 sm:text-sm ${
                        isDarkMode ? 'text-white' : 'text-slate-800'
                      }`}
                    >
                      <span
                        className={`h-px flex-1 max-w-[2rem] rounded-full ${
                          isDarkMode ? 'bg-gradient-to-r from-blue-400 to-transparent' : 'bg-gradient-to-r from-blue-500 to-transparent'
                        }`}
                      />
                      Opțiuni anunțuri
                    </h4>

                    <div className="space-y-3 sm:space-y-5">
                      <div
                        className={`rounded-lg border p-2.5 backdrop-blur-sm sm:rounded-xl sm:p-3.5 md:p-4 ${
                          isDarkMode ? 'border-white/10 bg-white/[0.05]' : 'border-gray-200/50 bg-white/45'
                        }`}
                      >
                        <div className="mb-0.5 flex w-full items-center justify-between gap-2 sm:mb-1">
                          <span className={`text-xs font-semibold leading-tight sm:text-sm ${isDarkMode ? 'text-gray-200' : 'text-slate-700'}`}>
                            Număr de telefon în anunțuri
                          </span>
                          <span
                            title="Mă pot suna: numărul tău va apărea în anunțuri și cumpărătorii te pot suna. Nu mă pot suna: numărul rămâne ascuns."
                            className={`inline-flex h-7 w-7 shrink-0 cursor-help items-center justify-center rounded-full transition-colors sm:h-8 sm:w-8 ${
                              isDarkMode
                                ? 'bg-white/5 text-blue-400 hover:bg-white/10'
                                : 'bg-blue-50 text-blue-700 hover:bg-blue-100'
                            }`}
                            aria-label="Ajutor"
                          >
                            <i className="ri-information-line text-base sm:text-lg"></i>
                          </span>
                        </div>
                        <div className={`mb-2 space-y-0.5 text-[10px] leading-snug sm:mb-3 sm:text-xs sm:leading-relaxed ${isDarkMode ? 'text-gray-400' : 'text-slate-600'}`}>
                          <p>Mă pot suna: numărul apare în anunțuri, cumpărătorii te pot suna.</p>
                          <p>Nu mă pot suna: numărul rămâne ascuns.</p>
                        </div>
                        <div className="flex flex-wrap gap-2 sm:gap-3">
                          <label
                            className={`flex cursor-pointer items-center gap-2 rounded-md border px-2 py-1.5 transition-colors sm:gap-2.5 sm:rounded-lg sm:px-3 sm:py-2 ${
                              isDarkMode
                                ? 'border-transparent hover:bg-white/5 text-gray-200'
                                : 'border-transparent hover:bg-gray-100 text-slate-700'
                            }`}
                          >
                            <input
                              type="radio"
                              name="contactAllowPhone"
                              checked={contactAllowPhone === true}
                              onChange={() => setContactAllowPhone(true)}
                              className="h-3.5 w-3.5 accent-blue-600 sm:h-4 sm:w-4"
                            />
                            <i className="ri-phone-line text-sm text-blue-600 opacity-90 sm:text-base"></i>
                            <span className="text-xs font-medium sm:text-sm">Mă pot suna</span>
                          </label>
                          <label
                            className={`flex cursor-pointer items-center gap-2 rounded-md border px-2 py-1.5 transition-colors sm:gap-2.5 sm:rounded-lg sm:px-3 sm:py-2 ${
                              isDarkMode
                                ? 'border-transparent hover:bg-white/5 text-gray-200'
                                : 'border-transparent hover:bg-gray-100 text-slate-700'
                            }`}
                          >
                            <input
                              type="radio"
                              name="contactAllowPhone"
                              checked={contactAllowPhone === false}
                              onChange={() => setContactAllowPhone(false)}
                              className="h-3.5 w-3.5 accent-blue-600 sm:h-4 sm:w-4"
                            />
                            <i className="ri-phone-off-line text-sm text-sky-600 opacity-90 sm:text-base"></i>
                            <span className="text-xs font-medium sm:text-sm">Nu mă pot suna</span>
                          </label>
                        </div>
                      </div>

                      <div
                        className={`rounded-lg border p-2.5 backdrop-blur-sm sm:rounded-xl sm:p-3.5 md:p-4 ${
                          isDarkMode ? 'border-white/10 bg-white/[0.05]' : 'border-gray-200/50 bg-white/45'
                        }`}
                      >
                        <div className="mb-0.5 flex w-full items-center justify-between gap-2 sm:mb-1">
                          <span className={`text-xs font-semibold leading-tight sm:text-sm ${isDarkMode ? 'text-gray-200' : 'text-slate-700'}`}>
                            Mă afișez în anunțuri cu
                          </span>
                          <span
                            title="Alege cum ești afișat cumpărătorilor: numele tău complet (ex. Ion Popescu) sau username-ul (ex. ion_popescu)."
                            className={`inline-flex h-7 w-7 shrink-0 cursor-help items-center justify-center rounded-full transition-colors sm:h-8 sm:w-8 ${
                              isDarkMode
                                ? 'bg-white/5 text-blue-400 hover:bg-white/10'
                                : 'bg-blue-50 text-blue-700 hover:bg-blue-100'
                            }`}
                            aria-label="Ajutor"
                          >
                            <i className="ri-information-line text-base sm:text-lg"></i>
                          </span>
                        </div>
                        <div className={`mb-2 space-y-0.5 text-[10px] leading-snug sm:mb-3 sm:text-xs sm:leading-relaxed ${isDarkMode ? 'text-gray-400' : 'text-slate-600'}`}>
                          <p>Numele complet: ești afișat cu numele (ex. Ion Popescu).</p>
                          <p>Username: ești afișat cu username-ul (ex. ion_popescu).</p>
                        </div>
                        <div className="flex flex-wrap gap-2 sm:gap-3">
                          <label
                            className={`flex cursor-pointer items-center gap-2 rounded-md border px-2 py-1.5 transition-colors sm:gap-2.5 sm:rounded-lg sm:px-3 sm:py-2 ${
                              isDarkMode
                                ? 'border-transparent hover:bg-white/5 text-gray-200'
                                : 'border-transparent hover:bg-gray-100 text-slate-700'
                            }`}
                          >
                            <input
                              type="radio"
                              name="contactDisplayAs"
                              checked={contactDisplayAs === 'nume'}
                              onChange={() => setContactDisplayAs('nume')}
                              className="h-3.5 w-3.5 accent-blue-600 sm:h-4 sm:w-4"
                            />
                            <i className="ri-user-line text-sm text-blue-600 opacity-90 sm:text-base"></i>
                            <span className="text-xs font-medium sm:text-sm">Numele complet</span>
                          </label>
                          <label
                            className={`flex cursor-pointer items-center gap-2 rounded-md border px-2 py-1.5 transition-colors sm:gap-2.5 sm:rounded-lg sm:px-3 sm:py-2 ${
                              isDarkMode
                                ? 'border-transparent hover:bg-white/5 text-gray-200'
                                : 'border-transparent hover:bg-gray-100 text-slate-700'
                            }`}
                          >
                            <input
                              type="radio"
                              name="contactDisplayAs"
                              checked={contactDisplayAs === 'username'}
                              onChange={() => setContactDisplayAs('username')}
                              className="h-3.5 w-3.5 accent-blue-600 sm:h-4 sm:w-4"
                            />
                            <i className="ri-at-line text-sm text-sky-600 opacity-90 sm:text-base"></i>
                            <span className="text-xs font-medium sm:text-sm">Username</span>
                          </label>
                        </div>
                      </div>
                    </div>
                  </div>
                  </div>
                </div>

                <div
                    className={`flex shrink-0 justify-end gap-2 border-t px-3 py-2.5 sm:gap-3 sm:px-5 sm:py-4 md:px-6 md:py-5 ${
                    isDarkMode ? 'gobid-modal-dashboard-band--dark' : 'gobid-modal-dashboard-band--light'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => setShowContactModal(false)}
                    className={`rounded-lg border px-3 py-2 text-xs font-semibold transition-all sm:rounded-xl sm:px-5 sm:py-2.5 sm:text-sm ${
                      isDarkMode
                        ? 'border-white/15 bg-white/5 text-gray-200 hover:bg-white/10 hover:border-white/25'
                        : 'border-gray-300/80 bg-white/75 text-slate-700 hover:bg-white/95'
                    }`}
                  >
                    Închide
                  </button>
                  <button
                    type="button"
                    onClick={saveContactAndOptions}
                    disabled={contactSaving}
                    className="flex items-center gap-1.5 rounded-lg border border-blue-400/50 bg-gradient-to-r from-blue-600 via-blue-500 to-sky-500 px-3 py-2 text-xs font-semibold text-white transition-all hover:from-blue-500 hover:via-blue-400 hover:to-sky-400 disabled:cursor-not-allowed disabled:opacity-55 sm:gap-2 sm:rounded-xl sm:px-5 sm:py-2.5 sm:text-sm shadow-lg shadow-blue-600/30 hover:shadow-blue-500/40"
                  >
                    {contactSaving ? (
                      <>
                        <i className="ri-loader-4-line animate-spin text-base sm:text-lg"></i>
                        Se salvează...
                      </>
                    ) : (
                      <>
                        <i className="ri-save-line text-base sm:text-lg"></i>
                        Salvează
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Generation Progress Loader - Above Modal */}
        {showQuickAddModal && canUseGobidAiQuickAdd && quickAddIsGenerating && (
          <div 
            className="fixed inset-0 z-[200010] flex items-center justify-center p-4" 
            style={{ 
              backdropFilter: 'blur(12px)', 
              WebkitBackdropFilter: 'blur(12px)', 
              backgroundColor: 'rgba(0, 0, 0, 0.7)' 
            }}
          >
            <div 
              className={`relative w-full max-w-md rounded-2xl shadow-2xl p-8 ${
                isDarkMode 
                  ? 'bg-gradient-to-br from-gray-800 to-gray-900 border border-gray-700' 
                  : 'bg-white border border-gray-200'
              }`}
            >
              {/* Header */}
              <div className="text-center mb-6">
                <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 mb-4">
                  <i className="ri-magic-line text-4xl text-white animate-pulse"></i>
                </div>
                <h3 className={`text-2xl font-bold mb-2 ${
                  isDarkMode ? 'text-white' : 'text-gray-900'
                }`}>
                  Generează anunțul...
                </h3>
                <p className={`text-sm ${
                  isDarkMode ? 'text-gray-400' : 'text-gray-600'
                }`}>
                  GoBid AI procesează informațiile tale
                </p>
              </div>

              {/* Progress Bar */}
              <div className="mb-6">
                <div className={`h-3 rounded-full overflow-hidden ${
                  isDarkMode ? 'bg-gray-700' : 'bg-gray-200'
                }`}>
                  <div 
                    className="h-full bg-gradient-to-r from-blue-500 via-blue-500 to-sky-500 rounded-full transition-all duration-300 ease-out relative overflow-hidden"
                    style={{ width: `${generationProgress}%` }}
                  >
                    {/* Shimmer effect */}
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent animate-shimmer"></div>
                  </div>
                </div>
                <div className="flex justify-between items-center mt-2">
                  <span className={`text-xs font-medium ${
                    isDarkMode ? 'text-gray-400' : 'text-gray-600'
                  }`}>
                    {generationProgress < 30 && 'Analizez imaginile...'}
                    {generationProgress >= 30 && generationProgress < 60 && 'Procesez descrierea...'}
                    {generationProgress >= 60 && generationProgress < 85 && 'Generez detalii produs...'}
                    {generationProgress >= 85 && generationProgress < 100 && 'Finalizez anunțul...'}
                    {generationProgress === 100 && 'Gata!'}
                  </span>
                  <span className={`text-sm font-bold ${
                    isDarkMode ? 'text-white' : 'text-gray-900'
                  }`}>
                    {generationProgress}%
                  </span>
                </div>
              </div>

              {/* Loading Animation */}
              <div className="flex justify-center gap-2">
                {[0, 1, 2].map((i) => (
                  <div
                    key={i}
                    className="w-3 h-3 rounded-full bg-gradient-to-r from-blue-500 to-blue-500 animate-bounce"
                    style={{
                      animationDelay: `${i * 0.2}s`,
                      animationDuration: '1s'
                    }}
                  ></div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Quick Add Modal — overlay scroll + card cu înălțime fixă pe mobil (iOS/WebView) */}
        {showQuickAddModal && canUseGobidAiQuickAdd && (
          <div 
            className="fixed inset-0 z-[200000] overflow-y-auto overscroll-behavior-contain animate-in fade-in duration-300 px-3 sm:px-5" 
            style={{ 
              backdropFilter: 'blur(20px)', 
              WebkitBackdropFilter: 'blur(20px)', 
              background: isDarkMode 
                ? 'radial-gradient(circle at center, rgba(99, 102, 241, 0.15) 0%, rgba(0, 0, 0, 0.8) 100%)' 
                : 'radial-gradient(circle at center, rgba(99, 102, 241, 0.1) 0%, rgba(0, 0, 0, 0.5) 100%)',
              WebkitOverflowScrolling: 'touch',
              paddingTop: 'max(12px, calc(0.35rem + env(safe-area-inset-top, 0px)))',
              paddingBottom: 'max(12px, calc(0.35rem + env(safe-area-inset-bottom, 0px)))',
            }}
          >
            <div
              className="flex min-h-[100dvh] min-h-[100svh] w-full items-start justify-center sm:items-center sm:py-2"
            >
            <div 
              role="dialog"
              aria-modal="true"
              className={`relative flex w-full max-w-3xl min-h-0 shrink flex-col overflow-hidden rounded-2xl sm:rounded-3xl transform transition-all animate-in zoom-in-95 duration-300 max-h-[calc(100dvh-env(safe-area-inset-top,0px)-env(safe-area-inset-bottom,0px)-28px)] sm:max-h-[min(calc(88dvh-2cm),820px)] sm:my-auto ${
                isDarkMode 
                  ? 'bg-gradient-to-br from-slate-900/95 via-blue-950/95 to-blue-950/95 border-2 border-blue-500/30 shadow-2xl shadow-blue-500/20' 
                  : 'bg-gradient-to-br from-white/95 via-blue-50/95 to-blue-50/95 border-2 border-blue-300/50 shadow-2xl shadow-blue-200/30'
              } backdrop-blur-xl`}
            >
              {/* Animated gradient border glow */}
              <div className={`absolute inset-0 rounded-3xl ${
                isDarkMode
                  ? 'bg-gradient-to-r from-blue-600/20 via-blue-600/20 to-sky-600/20'
                  : 'bg-gradient-to-r from-sky-400/10 via-sky-400/10 to-sky-400/10'
              } animate-pulse blur-xl -z-10`}></div>
              
              {/* Grid pattern overlay */}
              <div className={`absolute inset-0 opacity-5 ${
                isDarkMode ? 'bg-[linear-gradient(rgba(255,255,255,0.1)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.1)_1px,transparent_1px)] bg-[size:20px_20px]' : 'bg-[linear-gradient(rgba(0,0,0,0.1)_1px,transparent_1px),linear-gradient(90deg,rgba(0,0,0,0.1)_1px,transparent_1px)] bg-[size:20px_20px]'
              }`}></div>
              <div className={`relative sticky top-0 z-10 flex items-center justify-between gap-2 px-3 py-3 sm:px-4 sm:py-3.5 border-b backdrop-blur-xl shrink-0 ${
                isDarkMode 
                  ? 'bg-gradient-to-r from-blue-900/40 via-blue-900/40 to-sky-900/40 border-blue-500/20' 
                  : 'bg-gradient-to-r from-blue-50/80 via-blue-50/80 to-sky-50/80 border-blue-300/30'
              }`}>
                {/* Animated background particles */}
                <div className="absolute inset-0 overflow-hidden rounded-t-3xl">
                  <div className={`absolute top-0 left-1/4 w-32 h-32 rounded-full ${
                    isDarkMode ? 'bg-blue-500/20' : 'bg-sky-400/20'
                  } blur-3xl animate-pulse`} style={{ animationDuration: '3s' }}></div>
                  <div className={`absolute top-0 right-1/4 w-40 h-40 rounded-full ${
                    isDarkMode ? 'bg-blue-500/20' : 'bg-sky-400/20'
                  } blur-3xl animate-pulse`} style={{ animationDuration: '4s', animationDelay: '1s' }}></div>
                </div>
                
                <div className="flex items-center gap-2 sm:gap-3 relative z-10 min-w-0">
                  <div className={`relative p-2 rounded-xl bg-gradient-to-br shrink-0 ${
                    isDarkMode 
                      ? 'from-blue-500/30 via-blue-500/30 to-sky-500/30 border border-sky-400/40' 
                      : 'from-blue-100 via-blue-100 to-sky-100 border border-blue-300/50'
                  } shadow-lg`}>
                    <i className="ri-robot-2-line text-2xl sm:text-[1.65rem] bg-gradient-to-r from-blue-600 via-blue-600 to-sky-600 bg-clip-text text-transparent dark:from-sky-400 dark:via-sky-400 dark:to-sky-400"></i>
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <h2 className={`text-lg sm:text-xl md:text-2xl font-extrabold leading-tight bg-gradient-to-r ${
                        isDarkMode 
                          ? 'from-blue-300 via-blue-300 to-sky-300 bg-clip-text text-transparent' 
                          : 'from-blue-600 via-blue-600 to-sky-600 bg-clip-text text-transparent'
                      }`}>
                        Adaugă cu GoBid AI
                      </h2>
                    </div>
                    <p className={`text-xs sm:text-sm font-medium flex items-center gap-1 ${
                      isDarkMode ? 'text-gray-300' : 'text-gray-600'
                    }`}>
                      <i className="ri-sparkling-2-line text-sky-400"></i>
                      Creează anunțuri inteligente cu AI
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1 sm:gap-1.5 relative z-10 flex-shrink-0">
                  <button
                    onClick={() => setShowDictationTutorial(true)}
                    className={`px-2 sm:px-2.5 py-1.5 sm:py-2 rounded-lg transition-all flex items-center gap-1 text-[11px] sm:text-xs font-semibold ${
                      isDarkMode
                        ? 'text-blue-300 hover:text-blue-200 hover:bg-blue-500/20 border border-sky-400/30'
                        : 'text-blue-600 hover:text-blue-700 hover:bg-blue-50 border border-blue-200'
                    } backdrop-blur-sm`}
                    title="Cum funcționează dictarea vocală?"
                  >
                    <i className="ri-question-line text-sm sm:text-base"></i>
                    <span className="hidden sm:inline">Ajutor</span>
                  </button>
                  <button
                    onClick={() => {
                      setShowQuickAddModal(false);
                      setQuickAddImages([]);
                      setQuickAddImagePreviews([]);
                      setQuickAddDescription('');
      setQuickAddInterimText('');
                      setQuickAddRequestedPrice(0);
                      setQuickAddMinAcceptedBid(0);
                      setQuickAddCurrency('RON');
                      setQuickAddCity(''); // Will be reloaded from profile when modal opens again
                      setQuickAddGeneratedProduct(null);
                      setEditableTitle('');
                      setEditableDescription('');
                      setEditableCategory('');
                      setEditableSubcategory('');
                      setEditableLevel3('');
                      setEditableSize('');
                      setEditableBrand('');
                      setEditableColor('');
                      setEditableCondition('Nou');
                      setEditablePrice(0);
                      setManualFormMessage(null);
                      setShowHelpModal(false);
                      setHelpStep(0);
                      setTypingText('');
                    }}
                    className={`p-1.5 sm:p-2 rounded-lg transition-all backdrop-blur-sm ${
                      isDarkMode
                        ? 'text-gray-400 hover:text-white hover:bg-gray-700/50 border border-gray-600/30'
                        : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100 border border-gray-200'
                    }`}
                  >
                    <i className="ri-close-line text-base sm:text-lg"></i>
                  </button>
                </div>
              </div>

              {/* Indică utilizatorului să permită microfonul dacă browserul întreabă */}
              <div className={`px-3 py-1.5 text-center text-[11px] sm:text-xs border-b shrink-0 ${
                isDarkMode ? 'bg-blue-900/30 text-blue-200 border-blue-500/20' : 'bg-blue-50 text-blue-700 border-blue-200'
              }`}>
                <i className="ri-mic-line mr-1.5 align-middle"></i>
                Dacă apare o fereastră a browserului despre microfon, apasă <strong>Permite</strong>.
              </div>

              <div
                className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain touch-pan-y p-2.5 sm:p-3 md:p-4 space-y-3 sm:space-y-4 md:space-y-4 relative z-10 pb-[max(12px,env(safe-area-inset-bottom,0px))]"
                style={{ WebkitOverflowScrolling: 'touch' }}
              >
                {/* Message */}
                {manualFormMessage && (
                  <div className={`p-4 rounded-lg border ${
                    isDarkMode 
                      ? 'bg-gray-800 border-gray-700' 
                      : 'bg-gray-50 border-gray-200'
                  } ${
                    manualFormMessage.type === 'success'
                      ? 'text-green-600 dark:text-green-400'
                      : 'text-red-600 dark:text-red-400'
                  }`}>
                    <div className="flex items-center gap-2">
                      {manualFormMessage.type === 'success' ? (
                        <i className="ri-checkbox-circle-line text-lg"></i>
                      ) : (
                        <i className="ri-error-warning-line text-lg"></i>
                      )}
                      <span>{manualFormMessage.text}</span>
                    </div>
                  </div>
                )}

                {/* Image Upload */}
                <div className="relative">
                  <label className={`block text-xs sm:text-sm font-medium mb-1.5 sm:mb-2 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                    Imagini <span className="text-red-500">*</span>
                  </label>
                  {showHelpModal && helpStep === 0 && (
                    <div className={`absolute left-0 right-0 top-full mt-2 p-3 rounded-lg border-2 border-blue-500 bg-blue-50 shadow-lg z-10 ${isDarkMode ? 'bg-blue-900/30 border-blue-400' : 'bg-blue-50 border-blue-500'}`}>
                      <div className="flex items-start gap-2">
                        <i className="ri-information-line text-blue-500 text-lg mt-0.5"></i>
                        <p className={`text-sm flex-1 ${isDarkMode ? 'text-white' : 'text-gray-800'}`}>
                          {typingText}
                          {isTyping && <span className="animate-pulse">|</span>}
                        </p>
                      </div>
                    </div>
                  )}
                  <div className={`relative border-2 border-dashed rounded-xl sm:rounded-2xl p-4 sm:p-6 md:p-8 transition-all group overflow-hidden ${
                    isDarkMode
                      ? 'border-blue-500/30 hover:border-sky-400/50 bg-blue-950/20'
                      : 'border-blue-300/50 hover:border-sky-400/70 bg-blue-50/30'
                  } hover:shadow-lg hover:shadow-blue-500/20`}>
                    {/* Animated background gradient */}
                    <div className={`absolute inset-0 bg-gradient-to-br ${
                      isDarkMode
                        ? 'from-blue-500/5 via-blue-500/5 to-sky-500/5'
                        : 'from-blue-100/20 via-blue-100/20 to-sky-100/20'
                    } opacity-0 group-hover:opacity-100 transition-opacity duration-300`}></div>
                    
                    {/* Image Previews - afișate înăuntrul zonei de upload */}
                    {quickAddImagePreviews.length > 0 && (
                      <div className="grid grid-cols-6 sm:grid-cols-8 md:grid-cols-10 gap-1.5 sm:gap-2 mb-4">
                        {quickAddImagePreviews.map((preview, index) => (
                          <div key={index} className="relative aspect-square">
                            <img src={preview} alt={`Preview ${index + 1}`} className="w-full h-full object-cover rounded-md border border-blue-200/50 dark:border-blue-500/30" />
                            <button
                              onClick={() => {
                                const newImages = [...quickAddImages];
                                const newPreviews = [...quickAddImagePreviews];
                                newImages.splice(index, 1);
                                newPreviews.splice(index, 1);
                                setQuickAddImages(newImages);
                                setQuickAddImagePreviews(newPreviews);
                              }}
                              className="absolute -top-0.5 -right-0.5 bg-red-500 text-white rounded-full w-4 h-4 flex items-center justify-center hover:bg-red-600 transition-colors shadow-lg"
                            >
                              <i className="ri-close-line text-[8px]"></i>
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                    
                    <input
                      ref={quickAddGalleryInputRef}
                      type="file"
                      accept="image/*"
                      multiple
                      onChange={handleQuickAddImageChange}
                      className="hidden"
                      id="quick-add-images"
                    />
                    {/* Capture: folosit pe web; fallback în app nativ dacă lipsește plugin-ul Camera */}
                    <input
                      ref={quickAddCameraInputRef}
                      type="file"
                      accept="image/*"
                      capture="environment"
                      multiple
                      onChange={handleQuickAddImageChange}
                      className="hidden"
                      id="quick-add-camera"
                    />
                    {/* Pe mobil + tabletă: Fă poza + Încarcă din galerie */}
                    {/* Sub 2xl: telefon + tabletă + iPad (inclusiv landscape); altfel zona desktop cu drag & drop */}
                    <div className="2xl:hidden flex flex-col gap-3 relative z-10 items-center">
                      <div className="flex flex-wrap items-center justify-center gap-2">
                        {isNativeApp ? (
                          <>
                            <button
                              type="button"
                              onClick={handleNativeTakePhoto}
                              className={`cursor-pointer inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border-2 transition-all ${
                                isDarkMode
                                  ? 'border-blue-500/50 hover:border-sky-400 bg-blue-500/20 hover:bg-blue-500/30'
                                  : 'border-blue-300 hover:border-sky-400 bg-blue-50 hover:bg-blue-100'
                              }`}
                            >
                              <i className="ri-camera-line text-lg bg-gradient-to-r from-blue-600 to-blue-600 bg-clip-text text-transparent dark:from-sky-400 dark:to-sky-400"></i>
                              <span className="text-xs font-medium whitespace-nowrap">Fă o poză</span>
                            </button>
                            <button
                              type="button"
                              onClick={handleNativePickFromGallery}
                              className={`cursor-pointer inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border-2 transition-all ${
                                isDarkMode
                                  ? 'border-blue-500/50 hover:border-sky-400 bg-blue-500/20 hover:bg-blue-500/30'
                                  : 'border-blue-300 hover:border-sky-400 bg-blue-50 hover:bg-blue-100'
                              }`}
                            >
                              <i className="ri-image-add-line text-lg bg-gradient-to-r from-blue-600 to-blue-600 bg-clip-text text-transparent dark:from-sky-400 dark:to-sky-400"></i>
                              <span className="text-xs font-medium whitespace-nowrap">{quickAddImagePreviews.length > 0 ? 'Adaugă mai multe' : 'Încarcă din galerie'}</span>
                            </button>
                          </>
                        ) : (
                          <>
                            <label htmlFor="quick-add-camera" className={`cursor-pointer inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border-2 transition-all ${
                              isDarkMode
                                ? 'border-blue-500/50 hover:border-sky-400 bg-blue-500/20 hover:bg-blue-500/30'
                                : 'border-blue-300 hover:border-sky-400 bg-blue-50 hover:bg-blue-100'
                            }`}>
                              <i className="ri-camera-line text-lg bg-gradient-to-r from-blue-600 to-blue-600 bg-clip-text text-transparent dark:from-sky-400 dark:to-sky-400"></i>
                              <span className="text-xs font-medium whitespace-nowrap">Fă o poză</span>
                            </label>
                            <label htmlFor="quick-add-images" className={`cursor-pointer inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border-2 transition-all ${
                              isDarkMode
                                ? 'border-blue-500/50 hover:border-sky-400 bg-blue-500/20 hover:bg-blue-500/30'
                                : 'border-blue-300 hover:border-sky-400 bg-blue-50 hover:bg-blue-100'
                            }`}>
                              <i className="ri-image-add-line text-lg bg-gradient-to-r from-blue-600 to-blue-600 bg-clip-text text-transparent dark:from-sky-400 dark:to-sky-400"></i>
                              <span className="text-xs font-medium whitespace-nowrap">{quickAddImagePreviews.length > 0 ? 'Adaugă mai multe' : 'Încarcă din galerie'}</span>
                            </label>
                          </>
                        )}
                      </div>
                      <p className={`text-[10px] ${isDarkMode ? 'text-gray-500' : 'text-gray-500'} text-center`}>
                        <i className="ri-information-line mr-1"></i>
                        Poți face o poză cu camera sau încărca imagini din galerie
                      </p>
                    </div>
                    {/* Pe desktop mare: zona clasică – click sau drag */}
                    <label htmlFor="quick-add-images" className={`hidden 2xl:block cursor-pointer relative z-10 ${quickAddImagePreviews.length > 0 ? 'block text-center' : 'block text-center'}`}>
                      <div className={`relative inline-block mb-2 sm:mb-3 ${quickAddImagePreviews.length > 0 ? 'mx-auto' : ''}`}>
                        <i className="ri-image-add-line text-3xl sm:text-4xl md:text-5xl bg-gradient-to-r from-blue-600 via-blue-600 to-sky-600 bg-clip-text text-transparent dark:from-sky-400 dark:via-sky-400 dark:to-sky-400"></i>
                        <div className="absolute inset-0 bg-gradient-to-r from-blue-500/20 via-blue-500/20 to-sky-500/20 blur-xl rounded-full"></div>
                      </div>
                      <p className={`text-xs sm:text-sm font-medium ${isDarkMode ? 'text-gray-300' : 'text-gray-700'} ${quickAddImagePreviews.length > 0 ? 'text-center' : ''}`}>
                        {quickAddImagePreviews.length > 0 ? 'Adaugă mai multe imagini' : 'Click pentru a încărca imagini sau trage-le aici'}
                      </p>
                      <p className={`text-[10px] sm:text-xs mt-1 sm:mt-2 ${isDarkMode ? 'text-gray-500' : 'text-gray-500'} ${quickAddImagePreviews.length > 0 ? 'text-center' : ''}`}>
                        <i className="ri-information-line mr-1"></i>
                        Poți încărca mai multe imagini
                      </p>
                    </label>
                  </div>
                </div>

                {/* Description */}
                <div className="relative">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <label className={`block text-xs sm:text-sm font-medium flex-1 min-w-0 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                      <span>Descriere <span className="text-red-500">*</span></span>
                      <span className="block text-[10px] sm:text-xs font-normal mt-0.5 text-red-600 dark:text-red-400">Te rugăm să fii cât mai amănunțit: marca, model, stare, defecte, accesorii.</span>
                    </label>
                    <button
                      type="button"
                      onClick={(e) => handleQuickAddDictation(e)}
                      title={quickAddIsDictating ? 'Oprește dictarea' : 'Dictare vocală (Chrome/Edge, HTTPS)'}
                      className="relative flex-shrink-0 transition-all"
                    >
                      <div className={`relative p-2 sm:p-2.5 md:p-3 rounded-2xl bg-gradient-to-br ${
                        isDarkMode 
                          ? 'from-blue-500/30 via-blue-500/30 to-sky-500/30 border border-sky-400/40' 
                          : 'from-blue-100 via-blue-100 to-sky-100 border border-blue-300/50'
                      } shadow-lg`}>
                        <i className={`text-base sm:text-lg md:text-xl relative z-10 bg-gradient-to-r ${
                          quickAddIsDictating
                            ? 'from-blue-600 via-blue-600 to-sky-600 bg-clip-text text-transparent dark:from-sky-400 dark:via-sky-400 dark:to-sky-400'
                            : isDarkMode
                            ? 'text-gray-300'
                            : 'text-gray-700'
                        } ${quickAddIsDictating ? 'ri-mic-fill' : 'ri-mic-line'}`}></i>
                        {/* Pulsing ring - exact ca la robot, întotdeauna activ */}
                        <div className={`absolute inset-0 rounded-2xl ${
                          isDarkMode ? 'bg-blue-500/20' : 'bg-sky-400/20'
                        } animate-ping`}></div>
                      </div>
                      {quickAddIsDictating && (
                        <span className="absolute -top-0.5 -right-0.5 sm:-top-1 sm:-right-1 w-2 h-2 sm:w-3 sm:h-3 bg-green-400 rounded-full border-2 border-white animate-pulse"></span>
                      )}
                    </button>
                  </div>
                  {showHelpModal && helpStep === 1 && (
                    <div className={`absolute left-0 right-0 top-full mt-2 p-3 rounded-lg border-2 border-blue-500 bg-blue-50 shadow-lg z-10 ${isDarkMode ? 'bg-blue-900/30 border-blue-400' : 'bg-blue-50 border-blue-500'}`}>
                      <div className="flex items-start gap-2">
                        <i className="ri-information-line text-blue-500 text-lg mt-0.5"></i>
                        <p className={`text-sm flex-1 ${isDarkMode ? 'text-white' : 'text-gray-800'}`}>
                          {typingText}
                          {isTyping && <span className="animate-pulse">|</span>}
                        </p>
                      </div>
                    </div>
                  )}
                  <div className="relative">
                    {/* Live Preview Indicator */}
                    {quickAddIsDictating && quickAddInterimText && (
                      <div className={`absolute top-2 left-2 text-xs px-2 py-1 rounded ${
                        isDarkMode ? 'bg-blue-900/50 text-blue-300' : 'bg-blue-100 text-blue-700'
                      } z-10`}>
                        <i className="ri-mic-line mr-1"></i>
                        Transcriere live...
                      </div>
                    )}
                    
                    {/* Delete Mode: Show highlighted text */}
                    {deleteMode && deleteTargetRanges.length > 0 ? (
                      <div className="relative">
                        <div
                          className={`w-full rounded-lg sm:rounded-xl border px-3 sm:px-4 py-2 sm:py-3 text-xs sm:text-sm min-h-[120px] sm:min-h-[150px] ${
                            isDarkMode
                              ? 'bg-gray-700 border-red-500 text-white'
                              : 'bg-white border-red-500 text-gray-900'
                          }`}
                          dangerouslySetInnerHTML={{
                            __html: highlightWordsToDelete(quickAddDescription, deleteTargetRanges)
                              .replace(/</g, '&lt;').replace(/>/g, '&gt;')
                              .replace(/&lt;span/g, '<span').replace(/&lt;\/span&gt;/g, '</span>')
                          }}
                        />
                        <textarea
                          value={quickAddDescription}
                          onChange={(e) => setQuickAddDescription(e.target.value)}
                          placeholder="Vând iPhone 17, 256 GB, negru, stare foarte bună..."
                          rows={6}
                          className="absolute inset-0 w-full rounded-lg sm:rounded-xl border-0 px-3 sm:px-4 py-2 sm:py-3 text-xs sm:text-sm bg-transparent text-transparent caret-white resize-none focus:outline-none"
                          style={{ zIndex: 1 }}
                          readOnly
                        />
                      </div>
                    ) : (
                      /* Normal Mode: text scris direct în câmp (interim + final în același textarea) */
                      <textarea
                        value={
                          quickAddIsDictating && (livePreview || quickAddInterimText)
                            ? (quickAddDescription + (quickAddDescription ? ' ' : '') + (livePreview || quickAddInterimText)).trim()
                            : quickAddDescription
                        }
                        onChange={(e) => {
                          const v = e.target.value;
                          setQuickAddDescription(v);
                          if (livePreview || quickAddInterimText) {
                            setLivePreview('');
                            setQuickAddInterimText('');
                          }
                        }}
                        placeholder="Vând iPhone 17, 256 GB, negru, stare foarte bună, fără zgârieturi. Bateria 100%, funcționează perfect. Deblocat în orice rețea. Vine cu cutie și cablu original. Preț 2.800 lei, ușor negociabil. Predare personală în Craiova sau trimit prin curier."
                        rows={6}
                        className={`w-full rounded-lg border px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                          isDarkMode
                            ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400'
                            : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500'
                        } ${quickAddIsDictating ? 'border-blue-400 ring-2 ring-blue-400/20' : ''}`}
                      />
                    )}
                    {/* Delete Mode Preview */}
                    {quickAddIsDictating && deleteMode && livePreview && (
                      <div className={`mt-2 text-xs px-2 py-1 rounded ${
                        isDarkMode ? 'bg-red-900/50 text-red-300' : 'bg-red-100 text-red-700'
                      }`}>
                        <i className="ri-delete-bin-line mr-1"></i>
                        {livePreview}
                      </div>
                    )}
                    
                    {/* Dictating Indicator */}
                    {quickAddIsDictating && (
                      <div className="absolute bottom-2 sm:bottom-3 right-2 sm:right-3 flex items-center gap-1.5 sm:gap-2">
                        {deleteMode ? (
                          // Delete Mode: Show "xxx" instead of animated dots
                          <div className="flex items-center gap-1.5 sm:gap-2">
                            <span className="text-red-600 dark:text-red-400 font-bold text-sm sm:text-base">xxx</span>
                            <span className="text-[10px] sm:text-xs text-red-600 dark:text-red-400 font-medium">
                              Șterge
                            </span>
                          </div>
                        ) : (
                          // Normal Mode: Show animated dots
                          <>
                            <div className="flex gap-0.5 sm:gap-1">
                              <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 bg-red-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                              <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 bg-red-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                              <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 bg-red-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                            </div>
                            <span className="text-[10px] sm:text-xs text-red-600 dark:text-red-400 font-medium">
                              Ascultă...
                            </span>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                  
                  {/* Indiciu: ce să spui pentru a detecta categoria și a afișa sugestiile (când microfonul e pornit dar nu s-a detectat încă) */}
                  {quickAddIsDictating && !deleteMode && !detectedCategory && (
                    <div className="mt-3 w-full">
                      <div className={`rounded-xl border p-3 sm:p-4 ${
                        isDarkMode ? 'bg-slate-800/80 border-slate-600 text-slate-200' : 'bg-amber-50/90 border-amber-200 text-amber-900'
                      }`}>
                        <p className="text-xs sm:text-sm font-semibold mb-1.5">
                          Pentru sugestii, spune ce anunți:
                        </p>
                        <p className="text-[11px] sm:text-xs opacity-90">
                          <strong>Telefoane:</strong> iPhone, Samsung, Xiaomi, telefon, smartphone · 
                          <strong> Laptop/PC:</strong> laptop, notebook, MacBook, Dell · 
                          <strong> Auto:</strong> mașină, BMW, Audi, Dacia · 
                          <strong> Imobiliare:</strong> apartament, casă, vilă
                        </p>
                        <p className="text-[10px] sm:text-[11px] mt-1 opacity-75">
                          Ex.: „Vând iPhone 17” sau „Mașină BMW” → apar câmpurile de completat.
                        </p>
                      </div>
                    </div>
                  )}
                  
                  {/* Sugestii dinamice - afișează când categoria este detectată (microfon activ SAU text deja în câmp) */}
                  {(() => {
                    const shouldShow = detectedCategory && detectedCategory.requiredFields && detectedCategory.requiredFields.length > 0;
                    if (shouldShow) {
                      console.log('✅ Rendering suggestions panel. detectedCategory:', detectedCategory, 'quickAddIsDictating:', quickAddIsDictating);
                    } else {
                      console.log('❌ NOT rendering suggestions. detectedCategory:', detectedCategory, 'quickAddIsDictating:', quickAddIsDictating);
                    }
                    return shouldShow;
                  })() && (
                    <div className="mt-3 w-full z-[100]" style={{ position: 'relative' }}>
                      <div className={`relative rounded-xl sm:rounded-2xl overflow-hidden backdrop-blur-xl border shadow-2xl transform transition-all duration-300 animate-in fade-in slide-in-from-bottom-3 ${
                        isDarkMode
                          ? 'bg-gradient-to-br from-blue-950/95 via-blue-950/95 to-sky-950/95 border-blue-500/40 shadow-blue-500/20'
                          : 'bg-gradient-to-br from-blue-50/95 via-blue-50/95 to-sky-50/95 border-blue-300/60 shadow-blue-200/30'
                      }`}>
                        {/* Glow effect */}
                        <div className={`absolute inset-0 bg-gradient-to-r from-blue-500/20 via-blue-500/20 to-sky-500/20 blur-xl -z-10 ${
                          isDarkMode ? 'opacity-50' : 'opacity-30'
                        }`}></div>
                        
                        {/* Content */}
                        <div className="relative p-3 sm:p-4">
                          {/* Header modern cu iconiță animată */}
                          <div className="flex items-start gap-2 sm:gap-3 mb-2 sm:mb-3">
                            <div className={`relative flex-shrink-0 ${
                              isDarkMode ? '' : ''
                            }`}>
                              <div className={`p-2 sm:p-2.5 rounded-lg sm:rounded-xl bg-gradient-to-br ${
                                isDarkMode 
                                  ? 'from-blue-500/30 via-blue-500/30 to-sky-500/30 border border-sky-400/30' 
                                  : 'from-blue-100 via-blue-100 to-sky-100 border border-blue-200/50'
                              } shadow-lg`}>
                                <i className="ri-sparkling-2-fill text-base sm:text-lg md:text-xl bg-gradient-to-r from-blue-600 via-blue-600 to-sky-600 bg-clip-text text-transparent dark:from-sky-400 dark:via-sky-400 dark:to-sky-400"></i>
                              </div>
                              {/* Pulsing ring */}
                              <div className={`absolute inset-0 rounded-lg sm:rounded-xl ${
                                isDarkMode ? 'bg-blue-500/20' : 'bg-sky-400/20'
                              } animate-ping`}></div>
                            </div>
                            <div className="flex-1 min-w-0 pt-0.5">
                              <div className="flex items-center gap-1.5 sm:gap-2 mb-0.5 sm:mb-1">
                                <h4 className={`font-bold text-xs sm:text-sm bg-gradient-to-r truncate ${
                                  isDarkMode 
                                    ? 'from-blue-200 via-blue-200 to-sky-200' 
                                    : 'from-blue-700 via-blue-700 to-sky-700'
                                } bg-clip-text text-transparent`}>
                                  {detectedCategory?.subcategory || 'Categorie detectată'}
                                </h4>
                                <span className={`text-[8px] sm:text-[10px] px-1 sm:px-1.5 py-0.5 rounded-full font-medium flex-shrink-0 ${
                                  isDarkMode
                                    ? 'bg-blue-500/20 text-blue-300 border border-sky-400/30'
                                    : 'bg-blue-100 text-blue-700 border border-blue-200'
                                }`}>
                                  AI
                                </span>
                              </div>
                              <p className={`text-[10px] sm:text-xs font-medium ${
                                isDarkMode ? 'text-gray-300' : 'text-gray-600'
                              }`}>
                                Menționează pentru descriere completă:
                              </p>
                            </div>
                          </div>
                          
                          {/* Lista de câmpuri necesare - pe mobil 3 pe rând, pe desktop 2 - ROȘU necompletate, tăiate completate */}
                          <div className="grid grid-cols-3 sm:grid-cols-2 gap-1.5 sm:gap-2">
                            {detectedCategory?.requiredFields?.map((field, index) => {
                              // Mapare câmpuri la etichete prietenoase
                              const fieldLabels: Record<string, string> = {
                                'marca': 'Marca',
                                'model': 'Model',
                                'capacitate': 'Capacitate',
                                'culoare': 'Culoare',
                                'stare': 'Stare',
                                'baterie': 'Sănătate baterie',
                                'deblocat': 'Status deblocare',
                                'iCloud': 'Status iCloud',
                                'accesorii': 'Accesorii incluse',
                                'procesor': 'Procesor',
                                'ram': 'Memorie RAM',
                                'stocare': 'Stocare',
                                'dimensiune': 'Dimensiune',
                                'dotari': 'Dotări',
                                'kilometraj': 'Kilometraj',
                                'an': 'An fabricație',
                                'combustibil': 'Combustibil',
                                'cutie': 'Cutie de viteze',
                                'putere': 'Putere',
                                'suprafata': 'Suprafață',
                                'camere': 'Număr camere',
                                'etaj': 'Etaj',
                                'anConstructie': 'An construcție'
                              };
                              
                              const label = fieldLabels[field] || field;
                              const isCompleted = completedFields.has(field);
                              const extractedValue = extractedFieldValues[field];
                              
                              return (
                                <div
                                  key={field}
                                  className={`group relative flex items-center gap-1.5 sm:gap-2 px-2 sm:px-3 py-1.5 sm:py-2 rounded-md sm:rounded-lg transition-all duration-200 ${
                                    isCompleted
                                      ? isDarkMode
                                        ? 'bg-gray-700/30 border border-gray-600/30 opacity-60'
                                        : 'bg-gray-100/50 border border-gray-300/50 opacity-60'
                                      : isDarkMode
                                        ? 'bg-gradient-to-r from-red-500/20 via-red-500/20 to-red-500/20 border border-red-400/40 hover:border-red-400/60'
                                        : 'bg-red-50/80 border border-red-300/60 hover:border-red-400 hover:bg-red-100/90'
                                  } backdrop-blur-sm`}
                                  style={{
                                    animationDelay: `${index * 30}ms`
                                  }}
                                >
                                  {/* Dot indicator - green if completed, red if not */}
                                  <div className={`relative w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full flex-shrink-0 ${
                                    isCompleted
                                      ? isDarkMode
                                        ? 'bg-green-400'
                                        : 'bg-green-500'
                                      : isDarkMode
                                        ? 'bg-red-400'
                                        : 'bg-red-500'
                                  } shadow-sm`}>
                                    {!isCompleted && (
                                      <div className={`absolute inset-0 rounded-full ${
                                        isDarkMode ? 'bg-red-400' : 'bg-red-500'
                                      } animate-ping opacity-75`}></div>
                                    )}
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <span className={`text-[10px] sm:text-xs font-semibold truncate block ${
                                      isCompleted
                                        ? 'line-through text-gray-500 dark:text-gray-400'
                                        : isDarkMode
                                          ? 'text-red-200 group-hover:text-red-100'
                                          : 'text-red-700 group-hover:text-red-800'
                                    } transition-colors`}>
                                      {label}
                                    </span>
                                    {extractedValue && (
                                      <span className={`text-[9px] sm:text-[10px] font-medium block mt-0.5 truncate ${
                                        isDarkMode ? 'text-green-300' : 'text-green-600'
                                      }`}>
                                        ✓ {extractedValue}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                          
                          {/* Progress indicator */}
                          {detectedCategory && detectedCategory.requiredFields.length > 0 && (
                            <div className="mt-2 sm:mt-3 pt-2 sm:pt-3 border-t border-sky-400/20">
                              <div className="flex items-center justify-between mb-1">
                                <span className={`text-[10px] sm:text-xs font-medium ${
                                  isDarkMode ? 'text-gray-300' : 'text-gray-600'
                                }`}>
                                  Progres: {completedFields.size} / {detectedCategory.requiredFields.length}
                                </span>
                                {completedFields.size === detectedCategory.requiredFields.length && (
                                  <span className={`text-[10px] sm:text-xs font-bold ${
                                    isDarkMode ? 'text-green-400' : 'text-green-600'
                                  }`}>
                                    ✓ Complet
                                  </span>
                                )}
                              </div>
                              <div className={`w-full h-1.5 sm:h-2 rounded-full overflow-hidden ${
                                isDarkMode ? 'bg-gray-700/50' : 'bg-gray-200'
                              }`}>
                                <div 
                                  className={`h-full rounded-full transition-all duration-300 ${
                                    completedFields.size === detectedCategory.requiredFields.length
                                      ? 'bg-gradient-to-r from-green-500 to-green-600'
                                      : 'bg-gradient-to-r from-red-500 to-red-600'
                                  }`}
                                  style={{ 
                                    width: `${(completedFields.size / detectedCategory.requiredFields.length) * 100}%` 
                                  }}
                                ></div>
                              </div>
                            </div>
                          )}
                        </div>
                        
                        {/* Bottom accent line */}
                        <div className={`h-1 bg-gradient-to-r ${
                          isDarkMode
                            ? 'from-blue-500 via-blue-500 to-sky-500'
                            : 'from-sky-400 via-sky-400 to-sky-400'
                        }`}></div>
                      </div>
                    </div>
                  )}
                </div>


                {/* Monedă preferată și Prețul cerut pe același rând */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                  {/* Currency Selector */}
                  <div className={`relative p-3 sm:p-4 rounded-xl sm:rounded-2xl border backdrop-blur-sm ${
                    isDarkMode
                      ? 'bg-blue-950/30 border-blue-500/20'
                      : 'bg-blue-50/50 border-blue-200/50'
                  }`}>
                    <label className={`block text-xs sm:text-sm font-semibold mb-2 sm:mb-3 ${isDarkMode ? 'text-gray-200' : 'text-gray-700'}`}>
                      <i className="ri-money-dollar-circle-line mr-1.5 sm:mr-2 text-blue-500"></i>
                      Monedă preferată
                    </label>
                    <div className="flex gap-2 sm:gap-3">
                      <label className={`flex items-center gap-1.5 sm:gap-2 cursor-pointer px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg sm:rounded-xl transition-all flex-1 justify-center ${
                        quickAddCurrency === 'RON'
                          ? isDarkMode
                            ? 'bg-blue-500/30 border-2 border-sky-400/50 text-blue-300'
                            : 'bg-blue-100 border-2 border-sky-400 text-blue-700'
                          : isDarkMode
                          ? 'border-2 border-gray-600 text-gray-400 hover:border-blue-500/30'
                          : 'border-2 border-gray-200 text-gray-600 hover:border-blue-300'
                      }`}>
                        <input
                          type="radio"
                          name="quickAddCurrency"
                          value="RON"
                          checked={quickAddCurrency === 'RON'}
                          onChange={(e) => setQuickAddCurrency(e.target.value as 'RON' | 'EUR')}
                          className="hidden"
                        />
                        <span className="font-semibold text-xs sm:text-sm">Lei</span>
                      </label>
                      <label className={`flex items-center gap-1.5 sm:gap-2 cursor-pointer px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg sm:rounded-xl transition-all flex-1 justify-center ${
                        quickAddCurrency === 'EUR'
                          ? isDarkMode
                            ? 'bg-blue-500/30 border-2 border-sky-400/50 text-blue-300'
                            : 'bg-blue-100 border-2 border-sky-400 text-blue-700'
                          : isDarkMode
                          ? 'border-2 border-gray-600 text-gray-400 hover:border-blue-500/30'
                          : 'border-2 border-gray-200 text-gray-600 hover:border-blue-300'
                      }`}>
                        <input
                          type="radio"
                          name="quickAddCurrency"
                          value="EUR"
                          checked={quickAddCurrency === 'EUR'}
                          onChange={(e) => setQuickAddCurrency(e.target.value as 'RON' | 'EUR')}
                          className="hidden"
                        />
                        <i className="ri-euro-line text-base sm:text-lg"></i>
                        <span className="font-semibold text-xs sm:text-sm">EUR</span>
                      </label>
                    </div>
                  </div>

                  {/* Prețul cerut */}
                  <div className={`relative p-3 sm:p-4 rounded-xl sm:rounded-2xl border backdrop-blur-sm ${
                    isDarkMode
                      ? 'bg-blue-950/30 border-blue-500/20'
                      : 'bg-blue-50/50 border-blue-200/50'
                  }`}>
                    <label className={`block text-xs sm:text-sm font-semibold mb-2 sm:mb-3 ${isDarkMode ? 'text-gray-200' : 'text-gray-700'}`}>
                      <i className="ri-price-tag-3-line mr-1.5 sm:mr-2 text-blue-500"></i>
                      Prețul cerut ({quickAddCurrency})
                    </label>
                    {showHelpModal && helpStep === 3 && (
                      <div className={`absolute left-0 right-0 top-full mt-2 p-3 rounded-lg border-2 border-blue-500 bg-blue-50 shadow-lg z-10 ${isDarkMode ? 'bg-blue-900/30 border-blue-400' : 'bg-blue-50 border-blue-500'}`}>
                        <div className="flex items-start gap-2">
                          <i className="ri-information-line text-blue-500 text-lg mt-0.5"></i>
                          <p className={`text-sm flex-1 ${isDarkMode ? 'text-white' : 'text-gray-800'}`}>
                            {typingText}
                            {isTyping && <span className="animate-pulse">|</span>}
                          </p>
                        </div>
                      </div>
                    )}
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={quickAddRequestedPrice || ''}
                      onChange={(e) => setQuickAddRequestedPrice(parseFloat(e.target.value) || 0)}
                      placeholder="0.00"
                      className={`w-full rounded-lg sm:rounded-xl border-2 px-3 sm:px-4 py-2 sm:py-3 text-xs sm:text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all ${
                        isDarkMode
                          ? 'bg-gray-800/50 border-blue-500/30 text-white placeholder-gray-500 focus:border-sky-400'
                          : 'bg-white/80 border-blue-300/50 text-gray-900 placeholder-gray-400 focus:border-sky-400'
                      }`}
                    />
                  </div>
                </div>

                {/* Generate Button */}
                {!quickAddGeneratedProduct && (
                  <button
                    onClick={handleQuickAddGenerate}
                    disabled={quickAddIsGenerating || quickAddImages.length === 0 || !quickAddDescription.trim()}
                    className={`relative w-full py-4 px-6 rounded-2xl font-bold text-lg transition-all overflow-hidden group ${
                      quickAddIsGenerating || quickAddImages.length === 0 || !quickAddDescription.trim()
                        ? 'bg-gray-400 cursor-not-allowed text-white'
                        : isDarkMode
                        ? 'bg-gradient-to-r from-blue-600 via-blue-600 to-sky-600 hover:from-blue-500 hover:via-blue-500 hover:to-sky-500 text-white shadow-2xl hover:shadow-blue-500/50 border-2 border-sky-400/30'
                        : 'bg-gradient-to-r from-blue-500 via-blue-500 to-sky-500 hover:from-blue-600 hover:via-blue-600 hover:to-sky-600 text-white shadow-2xl hover:shadow-blue-500/50 border-2 border-blue-300/50'
                    }`}
                  >
                    {/* Animated gradient overlay */}
                    {!quickAddIsGenerating && quickAddImages.length > 0 && quickAddDescription.trim() && (
                      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000"></div>
                    )}
                    
                    {/* Shine effect */}
                    <div className={`absolute inset-0 bg-gradient-to-r ${
                      isDarkMode
                        ? 'from-sky-400/30 via-sky-400/30 to-sky-400/30'
                        : 'from-blue-300/40 via-blue-300/40 to-sky-300/40'
                    } blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300`}></div>
                    
                    <span className="relative z-10 flex items-center justify-center gap-2">
                      {quickAddIsGenerating ? (
                        <>
                          <i className="ri-loader-4-line animate-spin text-xl"></i>
                          <span>Generează cu GoBid AI...</span>
                        </>
                      ) : (
                        <>
                          <i className="ri-robot-2-line text-xl"></i>
                          <span>Generează cu GoBid AI</span>
                          <i className="ri-sparkling-2-line text-lg animate-pulse"></i>
                        </>
                      )}
                    </span>
                  </button>
                )}

                {/* Generated Product Preview */}
                {quickAddGeneratedProduct && (
                  <div className={`border-2 rounded-lg p-6 ${isDarkMode ? 'border-blue-500 bg-blue-900/10' : 'border-blue-500 bg-blue-50'}`}>
                    <h3 className={`text-lg font-bold mb-4 ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                      <i className="ri-checkbox-circle-line text-green-500 mr-2"></i>
                      Produs generat cu succes!
                    </h3>
                    
                    <div className="space-y-4">
                      {/* Editable Title */}
                      <div>
                        <label className={`block text-sm font-medium mb-2 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                          Titlu <span className={`font-normal text-xs ${isDarkMode ? 'text-gray-500' : 'text-gray-500'}`}>(max. {MANUAL_PRODUCT_TITLE_MAX_LENGTH} caractere)</span>
                        </label>
                        <input
                          type="text"
                          value={editableTitle}
                          onChange={(e) => setEditableTitle(e.target.value.slice(0, MANUAL_PRODUCT_TITLE_MAX_LENGTH))}
                          className={`w-full rounded-lg border px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                            isDarkMode
                              ? 'bg-gray-700 border-gray-600 text-white'
                              : 'bg-white border-gray-300 text-gray-900'
                          }`}
                          maxLength={MANUAL_PRODUCT_TITLE_MAX_LENGTH}
                        />
                        <p className={`mt-1 text-xs ${isDarkMode ? 'text-gray-500' : 'text-gray-500'}`}>
                          {editableTitle.length}/{MANUAL_PRODUCT_TITLE_MAX_LENGTH}
                        </p>
                      </div>
                      
                      {/* Editable Description */}
                      <div>
                        <label className={`block text-sm font-medium mb-2 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>Descriere</label>
                        <textarea
                          value={editableDescription}
                          onChange={(e) => setEditableDescription(e.target.value)}
                          rows={6}
                          className={`w-full rounded-lg border px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                            isDarkMode
                              ? 'bg-gray-700 border-gray-600 text-white'
                              : 'bg-white border-gray-300 text-gray-900'
                          }`}
                        />
                      </div>
                      
                      {/* Editable Category and Subcategory */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className={`block text-sm font-medium mb-2 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>Categorie</label>
                          <select
                            value={editableCategory}
                            onChange={(e) => {
                              setEditableCategory(e.target.value);
                              setEditableSubcategory('');
                              setEditableLevel3('');
                              setEditableSize('');
                              setEditableBrand('');
                              setEditableColor('');
                              setEditableCondition('Nou');
                            }}
                            className={`w-full rounded-lg border px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                              isDarkMode
                                ? 'bg-gray-700 border-gray-600 text-white'
                                : 'bg-white border-gray-300 text-gray-900'
                            }`}
                          >
                            <option value="">Selectează categoria</option>
                            {categories.map(cat => (
                              <option key={cat} value={cat}>{cat}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className={`block text-sm font-medium mb-2 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>Subcategorie</label>
                          <select
                            value={editableSubcategory}
                            onChange={(e) => {
                              setEditableSubcategory(e.target.value);
                              setEditableLevel3('');
                              setEditableSize('');
                              setEditableBrand('');
                              setEditableColor('');
                              setEditableCondition('Nou');
                            }}
                            disabled={!editableCategory}
                            className={`w-full rounded-lg border px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                              isDarkMode
                                ? 'bg-gray-700 border-gray-600 text-white disabled:bg-gray-800 disabled:text-gray-500'
                                : 'bg-white border-gray-300 text-gray-900 disabled:bg-gray-100 disabled:text-gray-500'
                            }`}
                          >
                            <option value="">Selectează subcategoria</option>
                            {editableCategory && subcategories[editableCategory]?.map(subcat => (
                              <option key={subcat} value={subcat}>{subcat}</option>
                            ))}
                          </select>
                        </div>
                      </div>

                      {/* Level 3 + Atribute Quick Add */}
                      {editableSubcategory && (() => {
                        const subKey = SUBCATEGORY_DISPLAY_TO_KEY[editableSubcategory] ?? editableSubcategory;
                        const level3Opts = CATEGORY_LEVEL_3[subKey];
                        const attrs = getAttributesForSubcategory(editableSubcategory);
                        const sizeOpts = getSizeOptionsForSubcategory(editableSubcategory);
                        const brandOpts = getBrandOptionsForSubcategory(editableSubcategory);
                        const hasAny = sizeOpts.length > 0 || brandOpts.length > 0 || attrs.condition;
                        if (!hasAny) return null;
                        return (
                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-4">
                            {sizeOpts.length > 0 ? (
                              <div>
                                <label className={`block text-sm font-medium mb-1 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>Mărime</label>
                                <select value={editableSize} onChange={(e) => setEditableSize(e.target.value)}
                                  className={`w-full rounded-lg border px-3 py-2 text-sm ${isDarkMode ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300 text-gray-900'}`}>
                                  <option value="">Opțional</option>
                                  {sizeOpts.map((s, i) => <option key={`size-${i}-${s}`} value={s}>{s}</option>)}
                                </select>
                              </div>
                            ) : null}
                            {brandOpts.length > 0 ? (
                              <div>
                                <label className={`block text-sm font-medium mb-1 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>Marca</label>
                                <select value={editableBrand} onChange={(e) => setEditableBrand(e.target.value)}
                                  className={`w-full rounded-lg border px-3 py-2 text-sm ${isDarkMode ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300 text-gray-900'}`}>
                                  <option value="">Opțional</option>
                                  {brandOpts.map((b, i) => <option key={`brand-${i}-${b}`} value={b}>{b}</option>)}
                                </select>
                              </div>
                            ) : null}
                            {attrs.condition ? (
                              <div>
                                <label className={`block text-sm font-medium mb-1 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>Stare <span className="text-red-500">*</span></label>
                                <select
                                  required
                                  value={editableCondition === 'Second hand' ? 'Second hand' : 'Nou'}
                                  onChange={(e) => setEditableCondition(e.target.value)}
                                  className={`w-full rounded-lg border px-3 py-2 text-sm ${isDarkMode ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300 text-gray-900'}`}
                                >
                                  <option value="Nou">Nou</option>
                                  <option value="Second hand">Second hand</option>
                                </select>
                              </div>
                            ) : null}
                          </div>
                        );
                      })()}
                      
                      {/* Editable Price */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className={`block text-sm font-medium mb-2 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                            Preț de pornire ({quickAddCurrency})
                          </label>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={editablePrice > 0 ? editablePrice : (quickAddRequestedPrice > 0 ? quickAddRequestedPrice : '')}
                            onChange={(e) => {
                              const newPrice = parseFloat(e.target.value) || 0;
                              setEditablePrice(newPrice);
                              // Also update requested price if it was the source
                              if (quickAddRequestedPrice > 0 && newPrice === quickAddRequestedPrice) {
                                // Keep them in sync
                              }
                            }}
                            className={`w-full rounded-lg border px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                              isDarkMode
                                ? 'bg-gray-700 border-gray-600 text-white'
                                : 'bg-white border-gray-300 text-gray-900'
                            }`}
                          />
                          {(editablePrice > 0 || quickAddRequestedPrice > 0) && (
                            <p className={`mt-1 text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                              {(() => {
                                const curr = quickAddCurrency || 'RON';
                                const effectiveRate = manualFormExchangeRate || 5.0;
                                const displayPrice = editablePrice > 0 ? editablePrice : quickAddRequestedPrice;
                                
                                if (curr === 'EUR') {
                                  const priceEUR = displayPrice;
                                  const priceRON = roundTo(priceEUR * effectiveRate);
                                  return `≈ ${priceRON.toLocaleString('ro-RO')} Lei`;
                                } else {
                                  const priceRON = displayPrice;
                                  const priceEUR = roundTo(priceRON / effectiveRate);
                                  return `≈ ${priceEUR.toLocaleString('ro-RO')} EUR`;
                                }
                              })()}
                            </p>
                          )}
                        </div>
                      </div>

                      {/* SEO Info */}
                      <div className={`mt-4 p-4 rounded-lg ${isDarkMode ? 'bg-gray-700' : 'bg-gray-100'}`}>
                        <h4 className={`text-sm font-semibold mb-2 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                          <i className="ri-seo-line mr-2"></i>
                          SEO generat automat
                        </h4>
                        <div className="space-y-2 text-xs">
                          <div>
                            <span className={`font-medium ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>Titlu SEO:</span>
                            <p className={isDarkMode ? 'text-gray-400' : 'text-gray-600'}>{quickAddGeneratedProduct.seoTitle}</p>
                          </div>
                          <div>
                            <span className={`font-medium ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>Descriere SEO:</span>
                            <p className={isDarkMode ? 'text-gray-400' : 'text-gray-600'}>{quickAddGeneratedProduct.seoDescription}</p>
                          </div>
                          <div>
                            <span className={`font-medium ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>Cuvinte cheie:</span>
                            <p className={isDarkMode ? 'text-gray-400' : 'text-gray-600'}>{quickAddGeneratedProduct.seoKeywords}</p>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Save Button */}
                    <div className="mt-6 flex gap-3">
                      <button
                        onClick={handleQuickAddSave}
                        disabled={quickAddIsSaving}
                        className={`flex-1 py-3 px-6 rounded-lg font-semibold transition-all ${
                          quickAddIsSaving
                            ? 'bg-gray-400 cursor-not-allowed text-white'
                            : 'bg-green-500 hover:bg-green-600 text-white shadow-lg hover:shadow-xl'
                        }`}
                      >
                        {quickAddIsSaving ? (
                          <>
                            <i className="ri-loader-4-line animate-spin mr-2"></i>
                            Salvează...
                          </>
                        ) : (
                          <>
                            <i className="ri-save-line mr-2"></i>
                            Salvează produs
                          </>
                        )}
                      </button>
                      <button
                        onClick={() => {
                          setQuickAddGeneratedProduct(null);
                          setQuickAddDescription('');
      setQuickAddInterimText('');
                          setQuickAddRequestedPrice(0);
                          setQuickAddMinAcceptedBid(0);
                          setQuickAddCurrency('RON');
                          setEditableTitle('');
                          setEditableDescription('');
                          setEditableCategory('');
                          setEditableSubcategory('');
                          setEditableLevel3('');
                          setEditableSize('');
                          setEditableBrand('');
                          setEditableColor('');
                          setEditableCondition('Nou');
                          setEditablePrice(0);
                          // Keep city value when editing
                        }}
                        className={`px-6 py-3 rounded-lg font-semibold transition-colors ${
                          isDarkMode
                            ? 'bg-gray-700 hover:bg-gray-600 text-white'
                            : 'bg-gray-200 hover:bg-gray-300 text-gray-700'
                        }`}
                      >
                        <i className="ri-edit-line mr-2"></i>
                        Editează
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
            </div>
          </div>
        )}

        {/* Modal de confirmare pentru ștergerea completă a descrierii */}
        {showDeleteAllConfirmModal && (
          <div 
            className="fixed inset-0 z-[200000] flex items-center justify-center p-4" 
            style={{ 
              backdropFilter: 'blur(20px)', 
              WebkitBackdropFilter: 'blur(20px)', 
              background: isDarkMode 
                ? 'radial-gradient(circle at center, rgba(239, 68, 68, 0.15) 0%, rgba(0, 0, 0, 0.8) 100%)' 
                : 'radial-gradient(circle at center, rgba(239, 68, 68, 0.1) 0%, rgba(0, 0, 0, 0.5) 100%)'
            }}
            onClick={(e) => {
              // Nu închide modalul când se face click pe backdrop - doar când se apasă butonul
              e.stopPropagation();
            }}
          >
            <div 
              className={`relative w-full max-w-md rounded-2xl sm:rounded-3xl overflow-hidden transform transition-all animate-in zoom-in-95 duration-300 ${
                isDarkMode 
                  ? 'bg-gradient-to-br from-slate-900/95 via-red-950/95 to-pink-950/95 border-2 border-red-500/30 shadow-2xl shadow-red-500/20' 
                  : 'bg-gradient-to-br from-white/95 via-red-50/95 to-pink-50/95 border-2 border-red-300/50 shadow-2xl shadow-red-200/30'
              } backdrop-blur-xl`}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Animated gradient border glow */}
              <div className={`absolute inset-0 rounded-3xl ${
                isDarkMode
                  ? 'bg-gradient-to-r from-red-600/20 via-pink-600/20 to-red-600/20'
                  : 'bg-gradient-to-r from-red-400/10 via-pink-400/10 to-red-400/10'
              } animate-pulse blur-xl -z-10`}></div>
              
              {/* Content */}
              <div className="relative p-6 sm:p-8">
                {/* Icon */}
                <div className="flex justify-center mb-4">
                  <div className={`w-16 h-16 sm:w-20 sm:h-20 rounded-full flex items-center justify-center ${
                    isDarkMode
                      ? 'bg-red-500/20 border-2 border-red-500/40'
                      : 'bg-red-100 border-2 border-red-300'
                  }`}>
                    <i className={`ri-question-line text-3xl sm:text-4xl ${
                      isDarkMode ? 'text-red-400' : 'text-red-600'
                    }`}></i>
                  </div>
                </div>
                
                {/* Title */}
                <h3 className={`text-xl sm:text-2xl font-bold text-center mb-3 ${
                  isDarkMode ? 'text-white' : 'text-gray-900'
                }`}>
                  Dorești să facem alta?
                </h3>
                
                {/* Description */}
                <p className={`text-sm sm:text-base text-center mb-6 ${
                  isDarkMode ? 'text-gray-300' : 'text-gray-600'
                }`}>
                  Descrierea actuală va fi ștearsă complet. Poți începe o nouă descriere sau închide modalul.
                </p>
                
                {/* Buttons */}
                <div className="flex gap-3 sm:gap-4">
                  <button
                    onClick={() => {
                      // Șterge descrierea și rămâne modalul deschis pentru o nouă descriere
                      // IMPORTANT: Nu reseta starea dictării - lasă microfonul activ dacă era activ
                      setQuickAddDescription('');
                      setQuickAddInterimText('');
                      setDeleteMode(false);
                      setPendingDeleteTarget(null);
                      setDeleteTargetRanges([]);
                      setShowDeleteTextModal(false);
                      setLivePreview('');
                      setIsDeletingAllText(false);
                      setDetectedCategory(null); // Resetează categoria detectată
                      setShowDeleteAllConfirmModal(false);
                      showNotification('success', 'Șters', 'Descrierea a fost ștearsă. Poți începe o nouă descriere.', true);
                    }}
                    className={`flex-1 py-3 px-4 sm:px-6 rounded-xl font-semibold text-sm sm:text-base transition-all ${
                      isDarkMode
                        ? 'bg-green-600 hover:bg-green-700 text-white shadow-lg hover:shadow-xl'
                        : 'bg-green-500 hover:bg-green-600 text-white shadow-lg hover:shadow-xl'
                    }`}
                  >
                    <i className="ri-check-line mr-2"></i>
                    Da
                  </button>
                  <button
                    onClick={() => {
                      // Închide modalul complet
                      setShowDeleteAllConfirmModal(false);
                      setShowQuickAddModal(false);
                    }}
                    className={`flex-1 py-3 px-4 sm:px-6 rounded-xl font-semibold text-sm sm:text-base transition-all ${
                      isDarkMode
                        ? 'bg-gray-700 hover:bg-gray-600 text-white'
                        : 'bg-gray-200 hover:bg-gray-300 text-gray-700'
                    }`}
                  >
                    <i className="ri-close-line mr-2"></i>
                    Nu
                  </button>
                </div>
                
                {/* Voice command hint */}
                <p className={`text-xs text-center mt-4 ${
                  isDarkMode ? 'text-gray-500' : 'text-gray-400'
                }`}>
                  <i className="ri-mic-line mr-1"></i>
                  Spune "da" sau "nu" vocal
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Modal de confirmare pentru ștergerea textului selectat */}
        {showDeleteTextModal && deleteMode && pendingDeleteTarget !== null && (
          <div 
            className="fixed inset-0 z-[200000] flex items-center justify-center p-4" 
            style={{ 
              backdropFilter: 'blur(20px)', 
              WebkitBackdropFilter: 'blur(20px)', 
              background: isDarkMode 
                ? 'radial-gradient(circle at center, rgba(239, 68, 68, 0.15) 0%, rgba(0, 0, 0, 0.8) 100%)' 
                : 'radial-gradient(circle at center, rgba(239, 68, 68, 0.1) 0%, rgba(0, 0, 0, 0.5) 100%)'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div 
              className={`relative w-full max-w-md rounded-2xl sm:rounded-3xl overflow-hidden transform transition-all animate-in zoom-in-95 duration-300 ${
                isDarkMode 
                  ? 'bg-gradient-to-br from-slate-900/95 via-red-950/95 to-pink-950/95 border-2 border-red-500/30 shadow-2xl shadow-red-500/20' 
                  : 'bg-gradient-to-br from-white/95 via-red-50/95 to-pink-50/95 border-2 border-red-300/50 shadow-2xl shadow-red-200/30'
              } backdrop-blur-xl`}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="relative p-6 sm:p-8">
                <div className="flex justify-center mb-4">
                  <div className={`w-16 h-16 sm:w-20 sm:h-20 rounded-full flex items-center justify-center ${
                    isDarkMode
                      ? 'bg-red-500/20 border-2 border-red-500/40'
                      : 'bg-red-100 border-2 border-red-300'
                  }`}>
                    <i className={`ri-delete-bin-line text-3xl sm:text-4xl ${
                      isDarkMode ? 'text-red-400' : 'text-red-600'
                    }`}></i>
                  </div>
                </div>
                
                <h3 className={`text-xl sm:text-2xl font-bold text-center mb-3 ${
                  isDarkMode ? 'text-white' : 'text-gray-900'
                }`}>
                  Confirmă ștergerea
                </h3>
                
                <p className={`text-sm sm:text-base text-center mb-4 ${
                  isDarkMode ? 'text-gray-300' : 'text-gray-600'
                }`}>
                  Vrei să ștergi "{pendingDeleteTarget}"?
                </p>
                
                <p className={`text-xs text-center mb-6 ${
                  isDarkMode ? 'text-gray-400' : 'text-gray-500'
                }`}>
                  {deleteTargetRanges.length} apariție{deleteTargetRanges.length > 1 ? 'i' : ''} găsit{deleteTargetRanges.length > 1 ? 'e' : ''}
                </p>
                
                <div className="flex gap-3 sm:gap-4">
                  <button
                    onClick={() => {
                      // Delete confirmed - only within last 5 words
                      if (pendingDeleteTarget !== null) {
                        setQuickAddDescription(prev => deleteInLastNWords(prev, pendingDeleteTarget, 5));
                        setDeleteMode(false);
                        setPendingDeleteTarget(null);
                        setDeleteTargetRanges([]);
                        setShowDeleteTextModal(false);
                        setLivePreview('');
                        showNotification('success', 'Șters', 'Textul a fost șters.', true);
                      }
                    }}
                    className={`flex-1 py-3 px-4 sm:px-6 rounded-xl font-semibold text-sm sm:text-base transition-all ${
                      isDarkMode
                        ? 'bg-red-600 hover:bg-red-700 text-white shadow-lg hover:shadow-xl'
                        : 'bg-red-500 hover:bg-red-600 text-white shadow-lg hover:shadow-xl'
                    }`}
                  >
                    <i className="ri-check-line mr-2"></i>
                    Da, șterge
                  </button>
                  <button
                    onClick={() => {
                      setDeleteMode(false);
                      setPendingDeleteTarget(null);
                      setDeleteTargetRanges([]);
                      setShowDeleteTextModal(false);
                      setLivePreview('');
                    }}
                    className={`flex-1 py-3 px-4 sm:px-6 rounded-xl font-semibold text-sm sm:text-base transition-all ${
                      isDarkMode
                        ? 'bg-gray-700 hover:bg-gray-600 text-white'
                        : 'bg-gray-200 hover:bg-gray-300 text-gray-700'
                    }`}
                  >
                    <i className="ri-close-line mr-2"></i>
                    Anulează
                  </button>
                </div>
                
                <p className={`text-xs text-center mt-4 ${
                  isDarkMode ? 'text-gray-500' : 'text-gray-400'
                }`}>
                  <i className="ri-mic-line mr-1"></i>
                  Spune "da sterge" sau "ok sterge" pentru confirmare
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Premium Promotion Modal */}
        {showPremiumModal && (
          <div 
            className="fixed inset-0 z-[200000] flex items-center justify-center p-2 sm:p-4" 
            style={{ backdropFilter: 'blur(8px)', backgroundColor: 'rgba(0, 0, 0, 0.5)' }}
          >
            <div 
              className={`w-full max-w-2xl rounded-xl sm:rounded-2xl shadow-2xl max-h-[95vh] sm:max-h-[90vh] overflow-y-auto ${
                isDarkMode ? 'bg-gray-800' : 'bg-white'
              }`}
            >
              <div className="sticky top-0 z-10 flex items-center justify-between p-3 sm:p-4 md:p-6 border-b border-gray-200 dark:border-gray-700 bg-inherit">
                <h2 className={`text-lg sm:text-xl md:text-2xl font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                  <i className="ri-vip-crown-line mr-1 sm:mr-2 text-yellow-500"></i>
                  Promovare Premium
                </h2>
                <button
                  onClick={() => {
                    setShowPremiumModal(false);
                    setSelectedProductForPremium(null);
                    setPremiumWeeks(1);
                    setManualFormMessage(null);
                  }}
                  className={`p-2 rounded-full transition-colors ${
                    isDarkMode
                      ? 'text-gray-400 hover:text-white hover:bg-gray-700'
                      : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                  }`}
                >
                  <i className="ri-close-line text-xl"></i>
                </button>
              </div>

              <div className="p-6 space-y-6">
                {/* Message */}
                {manualFormMessage && (
                  <div className={`p-4 rounded-lg border ${
                    isDarkMode 
                      ? 'bg-gray-800 border-gray-700' 
                      : 'bg-gray-50 border-gray-200'
                  } ${
                    manualFormMessage.type === 'success'
                      ? 'text-green-600 dark:text-green-400'
                      : 'text-red-600 dark:text-red-400'
                  }`}>
                    <div className="flex items-center gap-2">
                      {manualFormMessage.type === 'success' ? (
                        <i className="ri-checkbox-circle-line text-lg"></i>
                      ) : (
                        <i className="ri-error-warning-line text-lg"></i>
                      )}
                      <span>{manualFormMessage.text}</span>
                    </div>
                  </div>
                )}

                {/* Product Selection */}
                <div>
                  <label className={`block text-xs sm:text-sm font-medium mb-1 sm:mb-2 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                    Selectează produsul <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={selectedProductForPremium || ''}
                    onChange={(e) => {
                      const productId = e.target.value;
                      if (productId) {
                        const product = activeProducts.find(p => p.id === productId);
                        // Verifică dacă produsul are premium activ
                        if (product?.isPremium && product?.premiumUntil) {
                          const premiumUntil = new Date(product.premiumUntil);
                          const now = new Date();
                          if (premiumUntil > now) {
                            // Produsul are premium activ - nu permite selecția
                            setManualFormMessage({ 
                              type: 'error', 
                              text: `Acest produs are deja premium activ până pe ${premiumUntil.toLocaleDateString('ro-RO')}. Nu poți activa premium din nou pentru aceeași perioadă.` 
                            });
                            setSelectedProductForPremium(null);
                            return;
                          }
                        }
                      }
                      setSelectedProductForPremium(productId);
                      setManualFormMessage(null);
                    }}
                    className={`w-full rounded-lg border px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-500 ${
                      isDarkMode
                        ? 'bg-gray-700 border-gray-600 text-white'
                        : 'bg-white border-gray-300 text-gray-900'
                    }`}
                  >
                    <option value="">Selectează un produs</option>
                    {activeProducts.map(product => {
                      // Verifică dacă produsul are premium activ
                      const hasActivePremium = product.isPremium && product.premiumUntil && new Date(product.premiumUntil) > new Date();
                      const premiumUntilDate = product.premiumUntil ? new Date(product.premiumUntil) : null;
                      
                      return (
                        <option 
                          key={product.id} 
                          value={product.id}
                          disabled={!!hasActivePremium}
                          style={hasActivePremium ? { 
                            backgroundColor: isDarkMode ? '#374151' : '#f3f4f6',
                            color: isDarkMode ? '#9ca3af' : '#6b7280',
                            fontStyle: 'italic'
                          } : {}}
                        >
                          {product.title} {product.status === 'active' ? '(Activ)' : ''}
                          {hasActivePremium && premiumUntilDate && ` - Premium activ până pe ${premiumUntilDate.toLocaleDateString('ro-RO')}`}
                        </option>
                      );
                    })}
                  </select>
                  {/* Mesaj pentru produsele cu premium activ */}
                  {activeProducts.some(p => p.isPremium && p.premiumUntil && new Date(p.premiumUntil) > new Date()) && (
                    <p className={`mt-2 text-xs ${isDarkMode ? 'text-yellow-400' : 'text-yellow-600'}`}>
                      <i className="ri-information-line mr-1"></i>
                      Produsele cu premium activ sunt marcate și nu pot fi selectate din nou pentru aceeași perioadă.
                    </p>
                  )}
                </div>

                {/* Premium Plan Selection (2 boxes only) */}
                <div>
                  <label className={`block text-xs sm:text-sm font-medium mb-2 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                    Alege planul <span className="text-red-500">*</span>
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {[
                      { label: 'Săptămână', weeks: 1 },
                      { label: 'Lună', weeks: 4 },
                    ].map((plan) => {
                      const selected = premiumWeeks === plan.weeks;
                      return (
                        <button
                          key={plan.label}
                          type="button"
                          onClick={() => setPremiumWeeks(plan.weeks)}
                          className={`rounded-xl border px-4 py-3 text-left transition-all ${
                            selected
                              ? (isDarkMode
                                  ? 'border-yellow-400 bg-yellow-500/20 ring-2 ring-yellow-400/40'
                                  : 'border-yellow-500 bg-yellow-50 ring-2 ring-yellow-300')
                              : (isDarkMode
                                  ? 'border-gray-600 bg-gray-700/60 hover:border-yellow-500/60'
                                  : 'border-gray-300 bg-white hover:border-yellow-400')
                          }`}
                        >
                          <div className={`text-sm font-semibold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                            {plan.label}
                          </div>
                          <div className={`mt-1 text-xs ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>
                            {plan.weeks === 1 ? '4,99 Lei / săptămână' : '9,99 Lei / lună'}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* User Credit Balance */}
                <div className={`p-2 sm:p-3 md:p-4 rounded-lg border ${
                  isDarkMode ? 'bg-blue-900/20 border-blue-500/50' : 'bg-blue-50 border-blue-200'
                }`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1 sm:gap-2">
                      <i className="ri-wallet-3-line text-base sm:text-xl text-blue-600"></i>
                      <span className={`text-xs sm:text-sm font-medium ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                        Credit disponibil:
                      </span>
                    </div>
                    {isLoadingCredit ? (
                      <div className="animate-pulse">
                        <div className="h-5 sm:h-6 w-12 sm:w-16 bg-gray-300 rounded"></div>
                      </div>
                    ) : (
                      <span className={`text-lg sm:text-xl font-bold ${isDarkMode ? 'text-blue-400' : 'text-blue-700'}`}>
                        {userCreditBalance.toFixed(2)} Lei
                      </span>
                    )}
                  </div>
                </div>

                {/* Price Summary */}
                <div className={`p-2 sm:p-3 md:p-4 rounded-lg border ${
                  isDarkMode ? 'bg-yellow-900/20 border-yellow-500/50' : 'bg-yellow-50 border-yellow-200'
                }`}>
                  <div className="flex items-center justify-between pt-2">
                    <span className={`text-sm sm:text-base font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                      Preț de plată:
                    </span>
                    <span className={`text-xl sm:text-2xl font-bold ${isDarkMode ? 'text-yellow-400' : 'text-yellow-700'}`}>
                      {premiumAmount.toFixed(2)} Lei
                    </span>
                  </div>
                  <p className={`text-xs mt-1 sm:mt-2 ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                    <i className="ri-information-line mr-1"></i>
                    {premiumWeeks === 1 ? (
                      <>4,99 Lei per săptămână</>
                    ) : premiumWeeks === 4 ? (
                      <>9,99 Lei pentru 1 lună</>
                    ) : (
                      <>4,99 Lei pentru 1 săptămână</>
                    )}
                  </p>
                  {userCreditBalance >= premiumAmount ? (
                    <div className={`mt-2 sm:mt-3 p-2 sm:p-3 rounded-lg ${isDarkMode ? 'bg-green-900/30 border border-green-500/50' : 'bg-green-100 border border-green-300'}`}>
                      <div className="flex items-center gap-1 sm:gap-2">
                        <i className="ri-checkbox-circle-line text-green-600 text-sm sm:text-base"></i>
                        <span className={`text-xs sm:text-sm font-semibold ${isDarkMode ? 'text-green-400' : 'text-green-700'}`}>
                          Ai suficiente credite! Plata se va face automat cu credit.
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div className={`mt-2 sm:mt-3 p-2 sm:p-3 rounded-lg ${isDarkMode ? 'bg-orange-900/30 border border-orange-500/50' : 'bg-orange-100 border border-orange-300'}`}>
                      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                        <div className="flex items-center gap-1 sm:gap-2">
                          <i className="ri-information-line text-orange-600 text-sm sm:text-base"></i>
                          <span className={`text-xs sm:text-sm ${isDarkMode ? 'text-orange-400' : 'text-orange-700'}`}>
                            Credit insuficient.
                          </span>
                        </div>
                        <a
                          href="/dashboard/tokens"
                          className={`px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg text-xs font-semibold transition-all ${
                            isDarkMode
                              ? 'bg-orange-600 hover:bg-orange-700 text-white'
                              : 'bg-orange-500 hover:bg-orange-600 text-white'
                          }`}
                          onClick={(e) => {
                            e.stopPropagation();
                          }}
                        >
                          <i className="ri-add-line mr-1"></i>
                          Cumpără Credit
                        </a>
                      </div>
                    </div>
                  )}
                </div>

                {/* Benefits */}
                <div className={`p-2 sm:p-3 md:p-4 rounded-lg ${isDarkMode ? 'bg-gray-700' : 'bg-gray-100'}`}>
                  <h4 className={`text-xs sm:text-sm font-semibold mb-2 sm:mb-3 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                    Beneficii Premium:
                  </h4>
                  <ul className="space-y-1.5 sm:space-y-2 text-xs sm:text-sm">
                    <li className={`flex items-center gap-2 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                      <i className="ri-checkbox-circle-line text-green-500"></i>
                      Poziție prioritară în căutări și pe prima pagină
                    </li>
                    <li className={`flex items-center gap-2 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                      <i className="ri-checkbox-circle-line text-green-500"></i>
                      Badge "Premium" vizibil pe produs
                    </li>
                    <li className={`flex items-center gap-2 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                      <i className="ri-checkbox-circle-line text-green-500"></i>
                      Vizualizări mărite cu până la 300%
                    </li>
                    <li className={`flex items-center gap-2 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                      <i className="ri-checkbox-circle-line text-green-500"></i>
                      Promovare automată pe toate platformele
                    </li>
                  </ul>
                </div>

                {/* Payment Button */}
                <PremiumPurchaseButton
                  selectedProductForPremium={selectedProductForPremium}
                  isProcessingPremium={isProcessingPremium}
                  disabled={!selectedProductForPremium || isProcessingPremium}
                  userCreditCoversAmount={userCreditBalance >= premiumAmount}
                  totalAmount={premiumAmount}
                  premiumWeeks={premiumWeeks}
                  onNetopiaOrCredit={handlePremiumPayment}
                  onAppleSuccess={async () => {
                    setManualFormMessage({
                      type: 'success',
                      text: `Promovare premium activată cu succes pentru ${premiumWeeks} ${premiumWeeks === 1 ? 'săptămână' : 'săptămâni'}!`,
                    });
                    setSelectedProductForPremium(null);
                    setPremiumWeeks(1);
                    await loadProducts();
                    await loadUserCredit();
                    setTimeout(() => {
                      setShowPremiumModal(false);
                      setManualFormMessage(null);
                    }, 2000);
                  }}
                  onAppleError={(message) => {
                    setManualFormMessage({ type: 'error', text: message });
                  }}
                />
              </div>
            </div>
          </div>
        )}

        {/* Recently Viewed Products Section */}
        <div className={`mt-8 sm:mt-12 rounded-lg shadow-sm overflow-hidden ${isDarkMode ? 'bg-gray-800' : 'bg-white'}`}>
          <div className="p-4 sm:p-6">
          <div className="flex items-center justify-between mb-6 sm:mb-8">
            <div className="flex items-center gap-4">
              {/* Icon Container with Gradient */}
              <div className={`relative w-12 h-12 sm:w-14 sm:h-14 rounded-2xl flex items-center justify-center transition-all duration-300 ${
                isDarkMode 
                  ? 'bg-gradient-to-br from-blue-500/20 to-blue-500/20 border border-blue-500/30' 
                  : 'bg-gradient-to-br from-blue-50 to-blue-50 border border-blue-200/50'
              }`}>
                <i className={`ri-history-line text-2xl sm:text-3xl bg-gradient-to-r from-blue-500 to-blue-500 bg-clip-text text-transparent`}></i>
                {/* Shine effect */}
                <div className="absolute inset-0 rounded-2xl bg-gradient-to-r from-transparent via-white/10 to-transparent opacity-0 hover:opacity-100 transition-opacity duration-500"></div>
              </div>
              
              {/* Title with Gradient */}
              <div className="flex flex-col">
                <h2 className={`text-base sm:text-lg md:text-xl font-bold bg-gradient-to-r ${
                  isDarkMode 
                    ? 'from-white via-gray-100 to-gray-300' 
                    : 'from-gray-900 via-gray-800 to-gray-700'
                } bg-clip-text text-transparent`}>
                  Produse vizionate recent
                </h2>
                <p className={`text-xs sm:text-sm mt-1 ${
                  isDarkMode ? 'text-gray-400' : 'text-gray-500'
                }`}>
                  {recentlyViewedProducts.length} {recentlyViewedProducts.length === 1 ? 'produs' : 'produse'} în istoric
                </p>
              </div>
            </div>
            
            <div className="flex items-center gap-2 sm:gap-3">
              {((isMobile && recentlyViewedProducts.length > 15) || (!isMobile && recentlyViewedProducts.length > 30)) && (
                <button
                  onClick={() => setShowRecentlyViewedModal(true)}
                  className={`text-xs sm:text-sm px-4 py-2 rounded-xl transition-all duration-300 font-semibold shadow-lg hover:shadow-xl transform hover:scale-105 active:scale-95 ${
                    isDarkMode
                      ? 'bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-500 hover:to-blue-600 text-white border border-blue-500/30'
                      : 'bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white border border-blue-400/30'
                  }`}
                >
                  <i className="ri-eye-line mr-1.5"></i>
                  Vezi mai multe ({recentlyViewedProducts.length})
                </button>
              )}
              <button
                onClick={() => {
                  if (typeof window !== 'undefined') {
                    localStorage.removeItem('recentlyViewedProducts');
                    setRecentlyViewedProducts([]);
                  }
                }}
                className={`text-xs sm:text-sm px-4 py-2 rounded-xl transition-all duration-300 font-medium ${
                  isDarkMode
                    ? 'text-gray-400 hover:text-white hover:bg-gray-700/50 border border-gray-700/50 hover:border-gray-600/50'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100 border border-gray-200/50 hover:border-gray-300/50'
                }`}
              >
                <i className="ri-delete-bin-line mr-1.5"></i>
                Șterge istoricul
              </button>
            </div>
          </div>
          {recentlyViewedProducts.length > 0 ? (
          <div className="relative group">
            {/* Gradient Fade Left */}
            <div className={`absolute left-0 top-0 bottom-0 w-16 z-20 pointer-events-none bg-gradient-to-r ${
              isDarkMode ? 'from-gray-800 to-transparent' : 'from-white to-transparent'
            }`}></div>
            
            {/* Gradient Fade Right */}
            <div className={`absolute right-0 top-0 bottom-0 w-16 z-20 pointer-events-none bg-gradient-to-l ${
              isDarkMode ? 'from-gray-800 to-transparent' : 'from-white to-transparent'
            }`}></div>

            {/* Left Arrow - Modern Design */}
            <button
              onClick={() => {
                if (recentlyViewedScrollRef.current) {
                  recentlyViewedScrollRef.current.scrollBy({ left: -200, behavior: 'smooth' });
                }
              }}
              className={`absolute left-2 top-1/2 -translate-y-1/2 z-30 w-12 h-12 rounded-full flex items-center justify-center transition-all duration-300 shadow-xl backdrop-blur-md border-2 ${
                isDarkMode
                  ? 'bg-gray-800/80 hover:bg-gray-700/90 border-gray-600/50 hover:border-gray-500 text-white hover:scale-110 active:scale-95'
                  : 'bg-white/90 hover:bg-white border-gray-200/50 hover:border-gray-300 text-gray-700 hover:scale-110 active:scale-95'
              }`}
              style={{
                boxShadow: isDarkMode 
                  ? '0 8px 16px rgba(0, 0, 0, 0.3), 0 0 0 1px rgba(255, 255, 255, 0.05)'
                  : '0 8px 16px rgba(0, 0, 0, 0.1), 0 0 0 1px rgba(0, 0, 0, 0.05)'
              }}
              aria-label="Scroll left"
            >
              <i className="ri-arrow-left-s-line text-2xl"></i>
            </button>

            {/* Right Arrow - Modern Design */}
            <button
              onClick={() => {
                if (recentlyViewedScrollRef.current) {
                  recentlyViewedScrollRef.current.scrollBy({ left: 200, behavior: 'smooth' });
                }
              }}
              className={`absolute right-2 top-1/2 -translate-y-1/2 z-30 w-12 h-12 rounded-full flex items-center justify-center transition-all duration-300 shadow-xl backdrop-blur-md border-2 ${
                isDarkMode
                  ? 'bg-gray-800/80 hover:bg-gray-700/90 border-gray-600/50 hover:border-gray-500 text-white hover:scale-110 active:scale-95'
                  : 'bg-white/90 hover:bg-white border-gray-200/50 hover:border-gray-300 text-gray-700 hover:scale-110 active:scale-95'
              }`}
              style={{
                boxShadow: isDarkMode 
                  ? '0 8px 16px rgba(0, 0, 0, 0.3), 0 0 0 1px rgba(255, 255, 255, 0.05)'
                  : '0 8px 16px rgba(0, 0, 0, 0.1), 0 0 0 1px rgba(0, 0, 0, 0.05)'
              }}
              aria-label="Scroll right"
            >
              <i className="ri-arrow-right-s-line text-2xl"></i>
            </button>

            <div ref={recentlyViewedScrollRef} className="overflow-x-auto pb-4 scroll-smooth [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
              <div className="flex gap-4 sm:gap-5 min-w-max py-2">
            {recentlyViewedProducts.slice(0, isMobile ? 15 : 30).map((product) => {
              const productUrl = product.url || (product.slug ? `/live_bid/${product.slug}` : '#');
              const firstImage = Array.isArray(product.image) 
                ? (product.image[0] || (typeof product.image === 'string' ? product.image : ''))
                : (product.image || '');
              
              return (
                <a
                  key={product.id}
                  href={productUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`group relative flex-shrink-0 w-[150px] sm:w-[170px] md:w-[190px] rounded-2xl overflow-hidden transition-all duration-300 hover:scale-[1.03] hover:-translate-y-1 ${
                    isDarkMode 
                      ? 'bg-gradient-to-br from-gray-700/50 to-gray-800/50 border border-gray-700/50 hover:border-gray-600' 
                      : 'bg-gradient-to-br from-white to-gray-50/50 border border-gray-200/50 hover:border-gray-300'
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
                  {/* Image Container with Overlay */}
                  <div className="aspect-square relative overflow-hidden bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-700 dark:to-gray-800">
                    {firstImage ? (
                      <>
                        <img
                          src={firstImage}
                          alt={product.title}
                          className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500 ease-out"
                          onError={(e) => {
                            const target = e.target as HTMLImageElement;
                            target.style.display = 'none';
                          }}
                        />
                        {/* Gradient Overlay on Hover */}
                        <div className="absolute inset-0 bg-gradient-to-t from-black/20 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                      </>
                    ) : (
                      <div className={`w-full h-full flex items-center justify-center ${
                        isDarkMode ? 'bg-gray-700' : 'bg-gray-200'
                      }`}>
                        <i className={`ri-image-line text-4xl ${
                          isDarkMode ? 'text-gray-500' : 'text-gray-400'
                        }`}></i>
                      </div>
                    )}
                  </div>
                  
                  {/* Content */}
                  <div className="p-3 sm:p-4">
                    <h3 className={`text-xs sm:text-sm font-semibold line-clamp-2 mb-2 leading-tight ${
                      isDarkMode ? 'text-white' : 'text-gray-900'
                    }`}>
                      {product.title}
                    </h3>
                    {product.price !== undefined && (
                      <p className={`text-sm sm:text-base font-bold mb-2 ${
                        isDarkMode ? 'text-blue-400' : 'text-blue-600'
                      }`}>
                        {new Intl.NumberFormat('ro-RO', {
                          style: 'currency',
                          currency: product.currency || 'RON',
                          minimumFractionDigits: 0,
                          maximumFractionDigits: 0,
                        }).format(product.price)}
                      </p>
                    )}
                    <p className={`text-xs flex items-center gap-1 ${
                      isDarkMode ? 'text-gray-400' : 'text-gray-500'
                    }`}>
                      <i className="ri-time-line"></i>
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
                  </div>
                </a>
              );
            })}
              </div>
            </div>
          </div>
          ) : (
          <div className={`text-center py-8 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
            <i className="ri-history-line text-4xl mb-3 opacity-50"></i>
            <p className="text-sm">Nu există produse vizionate recent</p>
            <p className="text-xs mt-1">Produsele pe care le vizitezi vor apărea aici</p>
          </div>
          )}
          </div>
        </div>

      {/* Modal Istoric Complet Produse Vizionate Recent */}
      {showRecentlyViewedModal && (
        <div 
          className="fixed inset-0 z-[200000] flex items-center justify-center p-4"
          style={{ 
            backdropFilter: 'blur(8px)', 
            WebkitBackdropFilter: 'blur(8px)', 
            backgroundColor: 'rgba(0, 0, 0, 0.5)' 
          }}
        >
          <div 
            className={`relative w-full max-w-6xl max-h-[90vh] rounded-2xl shadow-2xl transform transition-all overflow-hidden ${
              isDarkMode 
                ? 'bg-gray-800 border border-gray-700' 
                : 'bg-white border border-gray-200'
            }`}
          >
            {/* Header */}
            <div className={`p-4 sm:p-6 border-b ${
              isDarkMode ? 'border-gray-700 bg-gradient-to-r from-gray-800 to-gray-900' : 'border-gray-200 bg-gradient-to-r from-white to-gray-50'
            }`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`w-12 h-12 rounded-full flex items-center justify-center ${
                    isDarkMode 
                      ? 'bg-blue-500/20 border border-blue-500/30' 
                      : 'bg-blue-100 border border-blue-200'
                  }`}>
                    <i className="ri-history-line text-2xl text-blue-500"></i>
                  </div>
                  <div>
                    <h3 className={`text-xl sm:text-2xl font-bold ${
                      isDarkMode ? 'text-white' : 'text-gray-900'
                    }`}>
                      Istoric Produse Vizionate
                    </h3>
                    <p className={`text-sm mt-1 ${
                      isDarkMode ? 'text-gray-400' : 'text-gray-600'
                    }`}>
                      Ultimele {Math.min(recentlyViewedProducts.length, 100)} produse
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setShowRecentlyViewedModal(false)}
                  className={`p-2 rounded-lg transition-all hover:bg-opacity-80 ${
                    isDarkMode 
                      ? 'hover:bg-gray-700 text-gray-400 hover:text-white' 
                      : 'hover:bg-gray-100 text-gray-500 hover:text-gray-700'
                  }`}
                >
                  <i className="ri-close-line text-2xl"></i>
                </button>
              </div>
            </div>

            {/* Content - Scrollable Grid */}
            <div className="overflow-y-auto max-h-[calc(90vh-120px)] p-4 sm:p-6">
              {recentlyViewedProducts.length > 0 ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 sm:gap-4">
                  {recentlyViewedProducts.slice(0, 100).map((product) => {
                    const productUrl = product.url || (product.slug ? `/live_bid/${product.slug}` : '#');
                    const firstImage = Array.isArray(product.image) 
                      ? (product.image[0] || (typeof product.image === 'string' ? product.image : ''))
                      : (product.image || '');
                    
                    return (
                      <a
                        key={product.id}
                        href={productUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={`group relative flex flex-col rounded-lg overflow-hidden transition-all hover:scale-105 hover:shadow-lg ${
                          isDarkMode ? 'bg-gray-700' : 'bg-gray-50'
                        }`}
                      >
                        {/* Image */}
                        <div className="aspect-square relative overflow-hidden bg-gray-200">
                          {firstImage ? (
                            <img
                              src={firstImage}
                              alt={product.title}
                              className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300"
                              onError={(e) => {
                                const target = e.target as HTMLImageElement;
                                target.style.display = 'none';
                              }}
                            />
                          ) : (
                            <div className={`w-full h-full flex items-center justify-center ${
                              isDarkMode ? 'bg-gray-600' : 'bg-gray-200'
                            }`}>
                              <i className={`ri-image-line text-3xl ${
                                isDarkMode ? 'text-gray-500' : 'text-gray-400'
                              }`}></i>
                            </div>
                          )}
                        </div>
                        
                        {/* Content */}
                        <div className="p-2 sm:p-3 flex-1 flex flex-col">
                          <h3 className={`text-xs sm:text-sm font-semibold line-clamp-2 mb-1 flex-1 ${
                            isDarkMode ? 'text-white' : 'text-gray-900'
                          }`}>
                            {product.title}
                          </h3>
                          {product.price !== undefined && (
                            <p className={`text-xs sm:text-sm font-bold mb-1 ${
                              isDarkMode ? 'text-blue-400' : 'text-blue-600'
                            }`}>
                              {new Intl.NumberFormat('ro-RO', {
                                style: 'currency',
                                currency: product.currency || 'RON',
                                minimumFractionDigits: 0,
                                maximumFractionDigits: 0,
                              }).format(product.price)}
                            </p>
                          )}
                          <p className={`text-xs ${
                            isDarkMode ? 'text-gray-400' : 'text-gray-500'
                          }`}>
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
                              return viewedDate.toLocaleDateString('ro-RO', { day: '2-digit', month: '2-digit', year: 'numeric' });
                            })()}
                          </p>
                        </div>
                      </a>
                    );
                  })}
                </div>
              ) : (
                <div className={`text-center py-12 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                  <i className="ri-history-line text-5xl mb-4 opacity-50"></i>
                  <p className="text-base font-semibold mb-2">Nu există produse vizionate</p>
                  <p className="text-sm">Produsele pe care le vizitezi vor apărea aici</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

        {/* Footer */}
        <div className="mt-8">
          <DashboardFooter isDarkMode={isDarkMode} />
        </div>

      {/* Review Modal - Modern Design */}
      {showReviewModal && selectedReviewUserId && (
        <div 
          className="fixed inset-0 z-[200000] flex items-center justify-center p-4"
          style={{ 
            backdropFilter: 'blur(8px)', 
            WebkitBackdropFilter: 'blur(8px)', 
            backgroundColor: 'rgba(0, 0, 0, 0.5)' 
          }}
        >
          <div 
            className={`relative w-full max-w-4xl max-h-[90vh] rounded-2xl shadow-2xl transform transition-all overflow-hidden ${
              isDarkMode 
                ? 'bg-gray-800 border border-gray-700' 
                : 'bg-white border border-gray-200'
            }`}
          >
            {/* Header - Personalizat cu avatar, nume și localitate */}
            <div className={`p-6 border-b ${
              isDarkMode ? 'border-gray-700 bg-gradient-to-r from-gray-800 to-gray-900' : 'border-gray-200 bg-gradient-to-r from-white to-gray-50'
            }`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4 flex-1">
                  {/* Avatar */}
                  <div className="relative flex-shrink-0">
                    {selectedReviewUserInfo?.avatarUrl ? (
                      <img
                        src={selectedReviewUserInfo.avatarUrl}
                        alt={`${selectedReviewUserInfo.firstName || ''} ${selectedReviewUserInfo.lastName || ''}`.trim() || 'Utilizator'}
                        className="w-16 h-16 rounded-full object-cover border-2 shadow-lg"
                        style={{
                          borderColor: isDarkMode ? 'rgba(156, 163, 175, 0.5)' : 'rgba(229, 231, 235, 1)'
                        }}
                        onError={(e) => {
                          const target = e.target as HTMLImageElement;
                          target.style.display = 'none';
                          const fallback = target.nextElementSibling as HTMLElement;
                          if (fallback) fallback.style.display = 'flex';
                        }}
                      />
                    ) : null}
                    {/* Fallback avatar cu inițiale */}
                    <div className={`w-16 h-16 rounded-full flex items-center justify-center text-xl font-bold shadow-lg border-2 ${
                      selectedReviewUserInfo?.avatarUrl ? 'hidden' : ''
                    } ${
                      isDarkMode 
                        ? 'bg-gradient-to-br from-gray-600 to-gray-700 text-gray-200 border-gray-500' 
                        : 'bg-gradient-to-br from-gray-300 to-gray-400 text-gray-700 border-gray-200'
                    }`}>
                      {(() => {
                        if (selectedReviewUserInfo?.firstName) {
                          return selectedReviewUserInfo.firstName[0].toUpperCase();
                        }
                        if (selectedReviewUserInfo?.lastName) {
                          return selectedReviewUserInfo.lastName[0].toUpperCase();
                        }
                        return 'U';
                      })()}
                    </div>
                    <div className={`absolute -bottom-0.5 -right-0.5 w-4 h-4 bg-green-500 rounded-full border-2 ${
                      isDarkMode ? 'border-gray-800' : 'border-white'
                    }`}></div>
                  </div>
                  
                  {/* Nume și localitate */}
                  <div className="flex-1 min-w-0">
                    <h3 className={`text-2xl font-bold truncate ${
                      isDarkMode ? 'text-white' : 'text-gray-900'
                    }`}>
                      {(() => {
                        if (selectedReviewUserInfo?.firstName && selectedReviewUserInfo?.lastName) {
                          return `${selectedReviewUserInfo.firstName} ${selectedReviewUserInfo.lastName}`;
                        } else if (selectedReviewUserInfo?.firstName) {
                          return selectedReviewUserInfo.firstName;
                        } else if (selectedReviewUserInfo?.lastName) {
                          return selectedReviewUserInfo.lastName;
                        }
                        return 'Utilizator';
                      })()}
                    </h3>
                    <div className="flex items-center gap-2 mt-1">
                      {selectedReviewUserInfo?.city && (
                        <>
                          <i className={`ri-map-pin-line text-sm ${
                            isDarkMode ? 'text-gray-400' : 'text-gray-500'
                          }`}></i>
                          <p className={`text-sm truncate ${
                            isDarkMode ? 'text-gray-400' : 'text-gray-600'
                          }`}>
                            {selectedReviewUserInfo.city}
                            {selectedReviewUserInfo.country && `, ${selectedReviewUserInfo.country}`}
                          </p>
                        </>
                      )}
                      {!selectedReviewUserInfo?.city && (
                        <p className={`text-sm ${
                          isDarkMode ? 'text-gray-400' : 'text-gray-500'
                        }`}>
                          Localitate nespecificată
                        </p>
                      )}
                    </div>
                  </div>
                  
                  {/* Iconiță stea */}
                  <div className={`flex-shrink-0 w-12 h-12 rounded-full flex items-center justify-center ${
                    isDarkMode 
                      ? 'bg-gradient-to-br from-yellow-500/20 to-yellow-600/20 border border-yellow-500/30' 
                      : 'bg-gradient-to-br from-yellow-100 to-yellow-200 border border-yellow-300'
                  }`}>
                    <i className="ri-star-fill text-xl text-yellow-500"></i>
                  </div>
                </div>
                
                {/* Buton închidere */}
                <button
                  onClick={() => {
                    setShowReviewModal(false);
                    setSelectedReviewUserId(null);
                    setSelectedReviewProductId(null);
                    setSelectedReviewType(null);
                    setSelectedReviewUserInfo(null);
                  }}
                  className={`ml-4 p-2 rounded-lg transition-all hover:bg-opacity-80 ${
                    isDarkMode 
                      ? 'hover:bg-gray-700 text-gray-400 hover:text-white' 
                      : 'hover:bg-gray-100 text-gray-500 hover:text-gray-700'
                  }`}
                >
                  <i className="ri-close-line text-2xl"></i>
                </button>
              </div>
            </div>

            {/* Content - Scrollable */}
            <div className="overflow-y-auto max-h-[calc(90vh-180px)] p-6">
              {selectedReviewUserId && selectedReviewType && (
                <UserReviews
                  userId={selectedReviewUserId}
                  reviewType={selectedReviewType}
                  isDarkMode={isDarkMode}
                  showAddReview={currentUserId !== selectedReviewUserId} // Dezactivează dacă utilizatorul încearcă să-și lase review singur
                  productId={selectedReviewProductId || undefined}
                />
              )}
            </div>
          </div>
        </div>
      )}

      {/* Șterge selectate (bulk) – confirmare + ștergere poze definitiv */}
      {showBulkDeleteModal && (
        <div
          className="fixed inset-0 z-[200000] flex items-center justify-center p-4"
          style={{
            backdropFilter: 'blur(8px)',
            WebkitBackdropFilter: 'blur(8px)',
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
          }}
        >
          <div
            className={`relative w-full max-w-md rounded-2xl shadow-2xl p-6 ${
              isDarkMode ? 'bg-gray-800 border border-gray-700' : 'bg-white border border-gray-200'
            }`}
          >
            <h3 className={`text-lg font-semibold mb-2 ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
              Ștergere produse selectate
            </h3>
            <p className={`mb-4 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
              {!isBulkDeleting ? (
                <>
                  Vrei să ștergi <strong>{selectedProductIds.size}</strong> produs{selectedProductIds.size === 1 ? '' : 'e'}?
                  Pozele vor fi șterse <strong>definitiv</strong> și nu vor mai putea fi recuperate.
                </>
              ) : bulkDeleteProgress ? (
                <>
                  Se șterg în loturi… <strong>{bulkDeleteProgress.done} / {bulkDeleteProgress.total}</strong>
                </>
              ) : (
                'Se șterg...'
              )}
            </p>
            {isBulkDeleting && bulkDeleteProgress && bulkDeleteProgress.total > 0 && (
              <div className={`mb-4 h-2 rounded-full overflow-hidden ${isDarkMode ? 'bg-gray-700' : 'bg-gray-200'}`}>
                <div
                  className="h-full bg-red-500 transition-all duration-300"
                  style={{ width: `${(100 * bulkDeleteProgress.done) / bulkDeleteProgress.total}%` }}
                />
              </div>
            )}
            <div className="flex gap-3 justify-end">
              <button
                type="button"
                disabled={isBulkDeleting}
                onClick={() => setShowBulkDeleteModal(false)}
                className={`px-4 py-2 rounded-lg font-medium ${isDarkMode ? 'bg-gray-700 text-gray-200' : 'bg-gray-200 text-gray-800'}`}
              >
                Anulare
              </button>
              <button
                type="button"
                disabled={isBulkDeleting}
                onClick={handleBulkDeleteConfirm}
                className="px-4 py-2 rounded-lg font-medium bg-red-600 hover:bg-red-500 text-white disabled:opacity-70 flex items-center gap-2"
              >
                {isBulkDeleting ? (
                  <>
                    <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                    Se șterg...
                  </>
                ) : (
                  <>
                    <i className="ri-delete-bin-line"></i>
                    Șterge
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Șterge (ascunde) anunț – confirmare */}
      {showDeleteModal && deleteModalData && (
        <div 
          className="fixed inset-0 z-[200000] flex items-center justify-center p-4"
          style={{ 
            backdropFilter: 'blur(8px)', 
            WebkitBackdropFilter: 'blur(8px)', 
            backgroundColor: 'rgba(0, 0, 0, 0.5)' 
          }}
        >
          <div 
            className={`relative w-full max-w-md rounded-2xl shadow-2xl transform transition-all ${
              isDarkMode 
                ? 'bg-gray-800 border border-gray-700' 
                : 'bg-white border border-gray-200'
            }`}
          >
            <div className="p-6">
              <p className={`text-base ${
                isDarkMode ? 'text-gray-300' : 'text-gray-700'
              }`}>
                Poți reactiva anunțul oricând dorești.
              </p>
            </div>

            <div className={`p-6 pt-0 flex items-center justify-end gap-3 flex-wrap ${
              isDarkMode ? 'border-gray-700' : 'border-gray-200'
            }`}>
              <button
                onClick={() => {
                  setShowDeleteModal(false);
                  setDeleteModalData(null);
                }}
                className={`px-6 py-2.5 rounded-lg font-medium transition-all ${
                  isDarkMode
                    ? 'bg-gray-700 hover:bg-gray-600 text-white'
                    : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
                }`}
              >
                Anulează
              </button>
              <button
                onClick={handleDeleteConfirm}
                className="px-6 py-2.5 rounded-lg font-medium transition-all bg-amber-600 hover:bg-amber-700 text-white shadow-lg hover:shadow-xl flex items-center gap-2"
                title="Dezactivează anunțul"
              >
                <i className="ri-eye-off-line"></i>
                Dezactivează
              </button>
              {(deleteModalData?.productStatus === 'inactive' || deleteModalData?.productStatus === 'reserved' || deleteModalData?.productStatus === 'sold') && (
                <button
                  onClick={handleDeleteConfirm}
                  className="px-6 py-2.5 rounded-lg font-medium transition-all bg-red-600 hover:bg-red-700 text-white shadow-lg hover:shadow-xl flex items-center gap-2"
                  title="Șterge (ascunde) anunțul"
                >
                  <i className="ri-delete-bin-line"></i>
                  Șterge
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Chat Modal */}
      {showChatModal && chatData && currentUserId && (
        <div 
          className="fixed inset-0 z-[200000] flex items-center justify-center p-4"
        >
          <div className={`w-full max-w-2xl h-[80vh] rounded-2xl shadow-2xl overflow-hidden ${
            isDarkMode ? 'bg-gray-800' : 'bg-white'
          }`}>
            <ProductChat
              productId={chatData.productId}
              buyerId={chatData.buyerId}
              sellerId={chatData.sellerId}
              currentUserId={currentUserId}
              isDarkMode={isDarkMode}
              onClose={() => setShowChatModal(false)}
              otherUserInfo={chatData.otherUserInfo}
            />
          </div>
        </div>
      )}

      {/* Help Modal */}
      {showHelpModal && (
        <div 
          className="fixed inset-0 z-[200000] flex items-center justify-center p-4" 
          style={{ backdropFilter: 'blur(8px)', backgroundColor: 'rgba(0, 0, 0, 0.5)' }}
        >
          <div 
            className={`w-full max-w-md rounded-2xl shadow-2xl ${isDarkMode ? 'bg-gray-800' : 'bg-white'}`}
          >
            <div className={`p-6 border-b ${isDarkMode ? 'border-gray-700' : 'border-gray-200'}`}>
              <div className="flex items-center justify-between">
                <h3 className={`text-xl font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                  <i className="ri-question-line mr-2 text-blue-500"></i>
                  Ai nevoie de ajutor?
                </h3>
                <button
                  onClick={() => {
                    setShowHelpModal(false);
                    setHelpStep(0);
                    setTypingText('');
                  }}
                  className={`p-2 rounded-lg transition-colors ${
                    isDarkMode
                      ? 'text-gray-400 hover:text-white hover:bg-gray-700'
                      : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                  }`}
                >
                  <i className="ri-close-line text-xl"></i>
                </button>
              </div>
            </div>

            <div className="p-6">
              <div className="mb-4">
                <p className={`text-sm mb-4 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                  Navighează prin pașii de mai jos pentru a vedea instrucțiuni detaliate pentru fiecare câmp:
                </p>
                
                <div className="flex gap-2 mb-4">
                  <button
                    onClick={() => setHelpStep(0)}
                    className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                      helpStep === 0
                        ? 'bg-blue-500 text-white'
                        : isDarkMode
                        ? 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    <i className="ri-image-add-line mr-1"></i>
                    Imagini
                  </button>
                  <button
                    onClick={() => setHelpStep(1)}
                    className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                      helpStep === 1
                        ? 'bg-blue-500 text-white'
                        : isDarkMode
                        ? 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    <i className="ri-file-text-line mr-1"></i>
                    Descriere
                  </button>
                  <button
                    onClick={() => setHelpStep(2)}
                    className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                      helpStep === 2
                        ? 'bg-blue-500 text-white'
                        : isDarkMode
                        ? 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    <i className="ri-map-pin-line mr-1"></i>
                    Oraș
                  </button>
                  <button
                    onClick={() => setHelpStep(3)}
                    className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                      helpStep === 3
                        ? 'bg-blue-500 text-white'
                        : isDarkMode
                        ? 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    <i className="ri-money-euro-circle-line mr-1"></i>
                    Preț
                  </button>
                </div>
              </div>

              <div className={`p-4 rounded-lg border-2 border-blue-500 ${isDarkMode ? 'bg-blue-900/20 border-blue-400' : 'bg-blue-50 border-blue-500'}`}>
                <div className="flex items-start gap-3">
                  <i className="ri-information-line text-blue-500 text-xl mt-0.5"></i>
                  <div className="flex-1">
                    <p className={`text-sm ${isDarkMode ? 'text-white' : 'text-gray-800'}`}>
                      {typingText}
                      {isTyping && <span className="animate-pulse">|</span>}
                    </p>
                  </div>
                </div>
              </div>

              <div className="mt-4 flex items-center justify-between">
                <button
                  onClick={() => setHelpStep(Math.max(0, helpStep - 1))}
                  disabled={helpStep === 0}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    helpStep === 0
                      ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                      : isDarkMode
                      ? 'bg-gray-700 text-white hover:bg-gray-600'
                      : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                  }`}
                >
                  <i className="ri-arrow-left-line mr-1"></i>
                  Înapoi
                </button>
                <button
                  onClick={() => setHelpStep(Math.min(3, helpStep + 1))}
                  disabled={helpStep === 3}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    helpStep === 3
                      ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                      : 'bg-blue-500 text-white hover:bg-blue-600'
                  }`}
                >
                  Următorul
                  <i className="ri-arrow-right-line ml-1"></i>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
