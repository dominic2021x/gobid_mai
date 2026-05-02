"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";
import { useParams, useRouter } from "next/navigation";
import UniversalHeader from "@/components/UniversalHeader";
import DashboardFooter from "@/components/DashboardFooter";
import { supabase } from "@/lib/supabase";
import Image from "next/image";
import Link from "next/link";
import AddToFavoriteListModal from "@/components/AddToFavoriteListModal";
import { ProductConditionBadge, type ProductConditionKind } from "@/components/ProductConditionBadge";
import { PieseAutoMarcaCornerBadge } from "@/components/piese-auto/PieseAutoMarcaBadges";
import { getMarcaFromListing, isPieseAutoListingProduct } from "@/lib/piese-auto/listing-marca";
import { HeartIcon } from "@/components/HeroIcons";
import { QRCodeSVG } from "qrcode.react";
import { getProductDisplayImage } from "@/lib/getProductDisplayImage";

interface Product {
  id: string;
  title: string;
  description: string;
  slug: string;
  product_type: string;
  starting_price_ron?: number;
  starting_price_eur?: number;
  currency?: string;
  images?: string[];
  category?: string;
  subcategory?: string;
  /** Coloană DB (ex. piese-auto import). */
  brand?: string | null;
  city?: string;
  /** Coloană DB (ex. import piese-auto: „Nou” | „Second hand”) */
  condition?: string | null;
  status: string;
  created_at: string;
  updated_at?: string;
  custom_fields?: Record<string, any>;
}

function stripDiacriticsLower(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

/** Extrage string-uri din custom_fields pentru căutare (coduri, compatibilități etc.). */
function pushCustomFieldsSearchFragments(value: unknown, out: string[]): void {
  if (value == null) return;
  const t = typeof value;
  if (t === "string") {
    const s = (value as string).trim();
    if (s) out.push(s);
    return;
  }
  if (t === "number" || t === "boolean") {
    out.push(String(value));
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) pushCustomFieldsSearchFragments(item, out);
    return;
  }
  if (t === "object") {
    for (const v of Object.values(value as Record<string, unknown>)) {
      pushCustomFieldsSearchFragments(v, out);
    }
  }
}

/** Text concatenat din toate câmpurile relevante pentru căutarea în magazin. */
function buildShopSearchHaystack(p: Product): string {
  const parts: string[] = [
    p.title,
    p.description,
    p.slug,
    p.category ?? "",
    p.subcategory ?? "",
    p.city ?? "",
    getMarcaFromListing(p),
    typeof p.brand === "string" ? p.brand : "",
    p.condition ?? "",
    p.product_type,
  ];
  if (p.custom_fields != null && typeof p.custom_fields === "object") {
    pushCustomFieldsSearchFragments(p.custom_fields, parts);
  }
  return parts.filter(Boolean).join(" ");
}

/**
 * Tokeni AND: fiecare parte din query trebuie să apară în haystack (ex. „usa f10” → găsește „Usa … BMW … F10”).
 * Separare după spații și separatori comuni (virgulă, punct-și-virgulă).
 */
function parseShopSearchTokens(raw: string): string[] {
  return raw
    .trim()
    .split(/[\s,;.]+/)
    .map((t) => stripDiacriticsLower(t.trim()))
    .filter((t) => t.length > 0);
}

function shopHaystackMatchesTokens(normalizedHaystack: string, tokens: string[]): boolean {
  if (tokens.length === 0) return true;
  return tokens.every((tok) => normalizedHaystack.includes(tok));
}

/** Text pentru placeholder animat (scriere + repetare) în câmpul de căutare magazin. */
const SHOP_SEARCH_TYPING_PLACEHOLDER_FULL =
  "Caută în anunțurile acestui vânzător...";

/** Același asset ca în `app/layout.tsx` (`/favicon.ico`). */
const USER_SHOP_QR_FAVICON_SRC = "/favicon.ico";

type UserShopQrBadgeProps = {
  userId: string;
  /** Latura codului QR în pixeli (fără chenar). */
  pixelSize: number;
  className?: string;
};

/** QR spre magazinul public: favicon centrat, doar chenar 1px gri aproape alb, corecție H. */
function UserShopQrBadge({ userId, pixelSize, className = "" }: UserShopQrBadgeProps) {
  const url = `https://gobid.ro/user/${userId}`;
  const centerIconSide = Math.max(10, Math.round(pixelSize * 0.2));

  return (
    <div
      className={`inline-flex shrink-0 rounded-xl border border-gray-100 bg-transparent p-1.5 sm:p-2 ${className}`}
      title="Scanează — pagina magazinului gobid.ro"
    >
      <div className="rounded-lg bg-white p-0.5 sm:p-1">
        <QRCodeSVG
          value={url}
          size={pixelSize}
          level="H"
          includeMargin={false}
          imageSettings={{
            src: USER_SHOP_QR_FAVICON_SRC,
            height: centerIconSide,
            width: centerIconSide,
            excavate: true,
          }}
          className="block rounded-md"
        />
      </div>
    </div>
  );
}

/** Afișare consistentă: „Nou” / „Uzat” / „N/A” din `condition` sau custom_fields. */
function resolveProductConditionLabel(product: Product): "Nou" | "Uzat" | "N/A" {
  const candidates = [
    product.condition,
    product.custom_fields?.stare,
    product.custom_fields?.Stare,
    product.custom_fields?.condition,
  ];
  const raw = candidates.find((v) => v != null && String(v).trim() !== "");
  if (raw == null) return "N/A";
  const s = String(raw).toLowerCase().trim();

  const looksUzat =
    /\b(second[\s-]?hand|secondhand|\bsh\b|uzat[aă]?|utilizat[aă]?|folosit[aă]?|used)\b/.test(s) ||
    s === "second hand";

  const looksNou =
    /\b(nou|nouă|noua|new|nefolosit|unused)\b/.test(s) ||
    /\b(produs\s+nou|piesa\s+noua|piese\s+noi|stare\s+nou|oem\s+nou|nou\s+sigilat|in\s+folie)\b/.test(s);

  if (looksNou && !looksUzat) return "Nou";
  if (looksUzat) return "Uzat";
  if (s === "nou" || s === "nouă" || s === "noua") return "Nou";

  return "N/A";
}

interface UserProfile {
  first_name?: string;
  last_name?: string;
  avatar_url?: string;
  email?: string;
  created_at?: string;
  phone?: string;
  cnp?: string;
  email_verified?: boolean;
  phone_verified?: boolean;
  cnp_verified?: boolean;
  provider?: string;
  email_confirmed_at?: string;
  company_name?: string;
  /** Dealer piese-auto: afișare ca firmă (din user_profiles.metadata) */
  piese_auto_sell_as_company?: boolean;
  /** Din metadata: afișare la anunțuri / profil public (ca la live_bid) */
  username?: string;
  anunturi_afisare_cu?: "username" | "nume";
}

interface UserRating {
  averageRating: number;
  reviewCount: number;
  positivePercentage: number;
}

type UserReviewRow = {
  id: string;
  rating?: number | string | null;
  review_text?: string | null;
};

interface DetailedRatings {
  comportament: number;
  deIncredere: number;
  comunicare: number;
  experientaGenerala: number;
}

export default function UserProductsPage() {
  const params = useParams();
  const router = useRouter();
  const userId = params?.userId as string;
  
  const [mounted, setMounted] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(true);
  const [products, setProducts] = useState<Product[]>([]);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [userRating, setUserRating] = useState<UserRating | null>(null);
  const [detailedRatings, setDetailedRatings] = useState<DetailedRatings | null>(null);
  const [categories, setCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [joinedDate, setJoinedDate] = useState<string>('');
  const [showContactModal, setShowContactModal] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authModalAction, setAuthModalAction] = useState<'follow' | 'save' | 'contact'>('follow');
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [contactMessage, setContactMessage] = useState('');
  const [sendingMessage, setSendingMessage] = useState(false);
  const [contactError, setContactError] = useState<string | null>(null);
  const [contactSuccess, setContactSuccess] = useState(false);
  const [favoriteProducts, setFavoriteProducts] = useState<string[]>([]);
  const [showFavoriteModal, setShowFavoriteModal] = useState(false);
  const [selectedProductForFavorite, setSelectedProductForFavorite] = useState<{id: string, title: string} | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  /** Căutare în magazin: tokeni AND pe toate anunțurile (cu search activ ignoră filtrul de categorie). */
  const [shopSearchQuery, setShopSearchQuery] = useState("");
  /** Doar pentru dealer piese-auto: filtru după marcă (piese-auto). */
  const [selectedShopMarca, setSelectedShopMarca] = useState("");
  const [shopSearchInputFocused, setShopSearchInputFocused] = useState(false);
  /** Lungimea prefixului afișat pentru efectul de tastare la placeholder. */
  const [shopSearchTypingPlaceholderLen, setShopSearchTypingPlaceholderLen] = useState(0);
  const [displayedProductsCount, setDisplayedProductsCount] = useState(12);
  const [loadingMore, setLoadingMore] = useState(false);
  const [isUserFavorite, setIsUserFavorite] = useState(false);
  const [userLocation, setUserLocation] = useState<string | null>(null);
  const [lastSignInAt, setLastSignInAt] = useState<Date | null>(null);
  const [followersCount, setFollowersCount] = useState<number>(0);
  const [followingCount, setFollowingCount] = useState<number>(0);
  const [sortBy, setSortBy] = useState<string>('relevance');
  const [savingUser, setSavingUser] = useState(false);
  const [showErrorModal, setShowErrorModal] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [isFollowing, setIsFollowing] = useState<boolean>(false);
  const [followingUser, setFollowingUser] = useState<boolean>(false);
  const [hasLiked, setHasLiked] = useState<boolean>(false);
  const [hasDisliked, setHasDisliked] = useState<boolean>(false);
  const [likeCount, setLikeCount] = useState<number>(0);
  const [dislikeCount, setDislikeCount] = useState<number>(0);
  const [verifiedInfo, setVerifiedInfo] = useState<{
    email: boolean;
    phone: boolean;
    cnp: boolean;
    google: boolean;
    apple: boolean;
    provider?: string;
  } | null>(null);
  const [followers, setFollowers] = useState<Array<{
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    avatarUrl: string | null;
    createdAt?: string;
    rating?: number;
    reviewCount?: number;
    positivePercentage?: number;
    location?: string;
    lastSignInAt?: string;
    followersCount?: number;
    followingCount?: number;
  }>>([]);
  const [following, setFollowing] = useState<Array<{
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    avatarUrl: string | null;
    createdAt?: string;
    rating?: number;
    reviewCount?: number;
    positivePercentage?: number;
    location?: string;
    lastSignInAt?: string;
    followersCount?: number;
    followingCount?: number;
  }>>([]);
  const [showFollowers, setShowFollowers] = useState<boolean>(false);
  const [showFollowing, setShowFollowing] = useState<boolean>(false);
  const [loadingFollowers, setLoadingFollowers] = useState<boolean>(false);
  const [loadingFollowing, setLoadingFollowing] = useState<boolean>(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (mounted && typeof window !== 'undefined') {
      const saved = localStorage.getItem('darkMode');
      if (saved !== null) {
        const darkModeValue = saved === 'true';
        setIsDarkMode(darkModeValue);
      }
    }
  }, [mounted]);

  useEffect(() => {
    if (mounted && typeof window !== 'undefined') {
      if (isDarkMode) {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
    }
  }, [isDarkMode, mounted]);

  const toggleDarkMode = () => {
    const newMode = !isDarkMode;
    setIsDarkMode(newMode);
    if (typeof window !== 'undefined') {
      localStorage.setItem('darkMode', String(newMode));
      if (newMode) {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
    }
  };

  // Verifică autentificarea utilizatorului
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) {
          setCurrentUserId(session.user.id);
        } else {
          setCurrentUserId(null);
        }
      } catch (error) {
        console.error('Error checking auth:', error);
        setCurrentUserId(null);
      }
    };
    
    if (mounted) {
      checkAuth();
    }
  }, [mounted]);

  // Load favorites
  useEffect(() => {
    const loadFavorites = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        
        if (session) {
          // Load from Supabase if logged in
          const accessToken = session.access_token;
          const response = await fetch('/api/user/favorites', {
            headers: {
              'Authorization': `Bearer ${accessToken}`
            }
          });

          if (response.ok) {
            const data = await response.json();
            const favorites = data.favorites || [];
            const favoriteIds = favorites.filter((f: any) => f.item_type === 'product').map((f: any) => f.item_id);
            setFavoriteProducts(favoriteIds);
            localStorage.setItem('favoriteProducts', JSON.stringify(favoriteIds));
          }
        } else {
          // Load from localStorage for guest users
          const savedFavorites = localStorage.getItem('favoriteProducts');
          if (savedFavorites) {
            setFavoriteProducts(JSON.parse(savedFavorites));
          }
        }
      } catch (error) {
        console.error('Error loading favorites:', error);
      }
    };

    if (mounted) {
      loadFavorites();
    }
  }, [mounted]);

  // Funcție separată pentru calcularea recenziilor (reutilizabilă)
  const calculateReviewsRef = useRef<((targetUserId: string) => Promise<void>) | null>(null);
  
  const calculateReviews = useCallback(async (targetUserId: string) => {
    try {
      // Încarcă rating-ul și review-urile utilizatorului
      const { data: reviewsData, error: reviewsError } = await supabase
        .from('user_reviews')
        .select('rating, review_text, id')
        .eq('reviewed_user_id', targetUserId);

      // Verifică dacă există o eroare reală (nu doar un obiect gol)
      if (reviewsError && reviewsError.code !== 'PGRST116') {
        console.error('[UserProfile] Error loading reviews:', reviewsError);
        return;
      }

      if (reviewsData && reviewsData.length > 0) {
        // Filtrează doar recenziile valide (cu rating între 1 și 5)
        // Eliminăm duplicatele bazate pe ID pentru a calcula corect
        const uniqueReviews = Array.from(
          new Map(
            (reviewsData as UserReviewRow[]).map((r: UserReviewRow) => [r.id, r]),
          ).values(),
        );

        const validReviews = uniqueReviews.filter((r: UserReviewRow) => {
          const rating = Number(r.rating);
          return rating && !isNaN(rating) && rating >= 1 && rating <= 5;
        });

          if (validReviews.length > 0) {
            // Debug: afișează recenziile pentru verificare
            console.log('[UserProfile] ===== REVIEW CALCULATION DEBUG =====');
            console.log(
              '[UserProfile] All reviews:',
              validReviews.map((r: UserReviewRow) => ({ id: r.id, rating: r.rating })),
            );

            // Calculează media rating-ului bazată pe toate recenziile valide
            const ratings = validReviews
              .map((r: UserReviewRow) => {
                const rating = Number(r.rating);
                console.log('[UserProfile] Review rating:', r.id, '->', rating, '(type:', typeof rating, ')');
                return rating;
              })
              .filter((r: number) => {
                const isValid = !isNaN(r) && r >= 1 && r <= 5;
                if (!isValid) {
                  console.warn('[UserProfile] Invalid rating filtered out:', r);
                }
                return isValid;
              });

            const totalRating = ratings.reduce((sum: number, rating: number) => sum + rating, 0);
            const avgRating = totalRating / ratings.length;
            
            console.log('[UserProfile] Total valid reviews:', validReviews.length);
            console.log('[UserProfile] All ratings array:', ratings);
            console.log('[UserProfile] Total rating sum:', totalRating);
            console.log('[UserProfile] Average rating:', avgRating);
            
            // Calculează procentul real de feedback pozitiv bazat pe media rating-urilor
            // Formula: (media_rating / 5) * 100
            // Aceasta reflectă mai precis satisfacția utilizatorilor
            // Exemplu: rating 4.5 = (4.5 / 5) * 100 = 90%
            const positivePercentageExact = (avgRating / 5) * 100;
            const positivePercentage = Math.round(positivePercentageExact * 10) / 10; // Rotunjire la 1 zecimală
            
            // Pentru comparație, calculează și procentul clasic (număr de recenzii >= 4)
            const allRatings = [...ratings]; // Copie pentru debug
            const positiveRatings = allRatings.filter(rating => rating >= 4);
            const positiveCount = positiveRatings.length;
            const classicPercentage = ratings.length > 0
              ? (positiveCount / ratings.length) * 100
              : 0;
            
            console.log('[UserProfile] ===== POSITIVE PERCENTAGE CALCULATION =====');
            console.log('[UserProfile] Average rating:', avgRating);
            console.log('[UserProfile] Calculation: (', avgRating, '/ 5) * 100 =', positivePercentageExact, '%');
            console.log('[UserProfile] Positive percentage (based on average):', positivePercentage, '%');
            console.log('[UserProfile] Classic calculation (reviews >= 4):', classicPercentage, '%');
            console.log('[UserProfile] Positive count (>=4):', positiveCount, 'out of', ratings.length);
            console.log('[UserProfile] All ratings:', ratings);
            console.log('[UserProfile] ===== END DEBUG =====');
            
            const finalAverageRating = Math.round(avgRating * 10) / 10;
            
            setUserRating({
              averageRating: finalAverageRating,
              reviewCount: validReviews.length,
              positivePercentage
            });

          // Calculează rating-uri detaliate
          const criteriaRatings: {
            comportament: number[];
            deIncredere: number[];
            comunicare: number[];
            experientaGenerala: number[];
          } = {
            comportament: [],
            deIncredere: [],
            comunicare: [],
            experientaGenerala: []
          };

          validReviews.forEach((review: any) => {
            if (review.review_text) {
              // Parsează criteriile din review_text
              const criteriaMatch = review.review_text.match(/\[Criterii:.*?\]/);
              if (criteriaMatch) {
                const criteriaText = criteriaMatch[0];
                
                const comportamentMatch = criteriaText.match(/Comportament\s+(\d+)\/5/);
                if (comportamentMatch) {
                  criteriaRatings.comportament.push(parseInt(comportamentMatch[1]));
                }
                
                const deIncredereMatch = criteriaText.match(/De încredere\s+(\d+)\/5/);
                if (deIncredereMatch) {
                  criteriaRatings.deIncredere.push(parseInt(deIncredereMatch[1]));
                }
                
                const comunicareMatch = criteriaText.match(/Comunicare\s+(\d+)\/5/);
                if (comunicareMatch) {
                  criteriaRatings.comunicare.push(parseInt(comunicareMatch[1]));
                }
                
                const experientaMatch = criteriaText.match(/Experiență generală\s+(\d+)\/5/);
                if (experientaMatch) {
                  criteriaRatings.experientaGenerala.push(parseInt(experientaMatch[1]));
                }
              }
            }
          });

          // Calculează media pentru fiecare criteriu
          const calculateAverage = (ratings: number[]): number => {
            if (ratings.length === 0) return 0;
            const sum = ratings.reduce((a, b) => a + b, 0);
            return Math.round((sum / ratings.length) * 10) / 10;
          };

          setDetailedRatings({
            comportament: calculateAverage(criteriaRatings.comportament),
            deIncredere: calculateAverage(criteriaRatings.deIncredere),
            comunicare: calculateAverage(criteriaRatings.comunicare),
            experientaGenerala: calculateAverage(criteriaRatings.experientaGenerala),
          });
        } else {
          // Nu există recenzii valide
          setUserRating({
            averageRating: 0,
            reviewCount: 0,
            positivePercentage: 0
          });
          setDetailedRatings(null);
        }
      } else {
        // Nu există recenzii deloc
        setUserRating({
          averageRating: 0,
          reviewCount: 0,
          positivePercentage: 0
        });
        setDetailedRatings(null);
      }
    } catch (err) {
      console.error('[UserProfile] Error calculating reviews:', err);
    }
  }, []);
  
  // Actualizează ref-ul când funcția se schimbă
  useEffect(() => {
    calculateReviewsRef.current = calculateReviews;
  }, [calculateReviews]);

  useEffect(() => {
    if (!userId) return;

    const loadData = async () => {
      setLoading(true);
      setError(null);

      try {
        const productColumns =
          'id, title, description, slug, product_type, starting_price_ron, starting_price_eur, currency, images, category, subcategory, brand, city, condition, status, created_at, updated_at, custom_fields' as const;
        const pageSize = 1000;

        const fetchProductsPages = async (): Promise<{
          productsData: Product[];
          productsError: Error | null;
        }> => {
          const productsData: Product[] = [];
          let productsError: Error | null = null;
          for (let from = 0; ; from += pageSize) {
            const { data: page, error: pageError } = await supabase
              .from('products')
              .select(productColumns)
              .eq('user_id', userId)
              .in('status', ['active', 'reserved', 'sold'])
              .order('created_at', { ascending: false })
              .range(from, from + pageSize - 1);
            if (pageError) {
              productsError = pageError as Error;
              break;
            }
            if (!page?.length) break;
            productsData.push(...(page as Product[]));
            if (page.length < pageSize) break;
          }
          return { productsData, productsError };
        };

        /** Profil, API verificare, produse și recenzii în paralel — mai puțin timp până la grid. */
        const [profileResult, verificationData, productsPack] = await Promise.all([
          supabase
            .from('user_profiles')
            .select('first_name, last_name, avatar_url, created_at, phone, company_name, metadata')
            .eq('user_id', userId)
            .maybeSingle(),
          fetch(`/api/user/verification/${userId}`)
            .then(async (res) => {
              if (!res.ok) return null;
              try {
                return await res.json();
              } catch {
                return null;
              }
            })
            .catch(() => null),
          fetchProductsPages(),
          calculateReviews(userId),
        ]);

        const { data: profile, error: profileError } = profileResult;

        // Ignoră complet obiectele goale {} și erorile PGRST116 (no rows found)
        // Ignoră de asemenea erorile 42703 (column does not exist) pentru cnp
        // Nu logăm nimic pentru aceste cazuri - acestea nu sunt erori reale
        // Pagina trebuie să fie accesibilă fără logare
        if (profileError) {
          // Verifică dacă este PGRST116 (no rows found) sau 42703 (column does not exist pentru cnp)
          const errorObj = profileError as Record<string, unknown>;
          const errCode = typeof errorObj.code === 'string' ? errorObj.code : '';
          const errMessage = typeof errorObj.message === 'string' ? errorObj.message.trim() : '';
          const errDetails = errorObj.details;
          const errHint = typeof errorObj.hint === 'string' ? errorObj.hint.trim() : '';

          const isNoRowsFound = errCode === 'PGRST116';
          const isCnpError = errCode === '42703' && errMessage.toLowerCase().includes('cnp');

          // Uneori Supabase poate returna un obiect gol sau fără câmpuri utile (ex: {})
          const hasOwnKeys = Object.keys(errorObj).length > 0;
          const hasDetails =
            errDetails !== undefined &&
            errDetails !== null &&
            ((typeof errDetails === 'string' && errDetails.trim() !== '') ||
              (typeof errDetails === 'object' && Object.keys(errDetails as Record<string, unknown>).length > 0));
          const hasUsefulProperties =
            (errCode !== '' && errCode !== 'PGRST116' && errCode !== '42703') ||
            errMessage !== '' ||
            hasDetails ||
            errHint !== '';
          const isBenignEmptyError = !hasOwnKeys || !hasUsefulProperties;

          // IGNORĂ COMPLET dacă este PGRST116, gol, sau eroare de coloană cnp inexistentă - NU LOGĂM NIMIC
          if (!isNoRowsFound && !isBenignEmptyError && !isCnpError) {
            console.error('Error loading user profile:', profileError);
          }
        }

        if (profile) {
          const meta = (profile.metadata as Record<string, unknown> | null | undefined) ?? {};
          const pac = meta.piese_auto_sell_as_company === true || meta.piese_auto_sell_as_company === 'true';
          const uName = typeof meta.username === "string" ? meta.username.trim() : "";
          const afisareCu = meta.anunturi_afisare_cu === "username" ? ("username" as const) : ("nume" as const);
          // Setează profilul cu toate datele disponibile
          // Nu setăm phone_verified aici - aceasta vine doar din API-ul de verificare
          setUserProfile({
            first_name: profile.first_name || undefined,
            last_name: profile.last_name || undefined,
            avatar_url: profile.avatar_url || undefined,
            created_at: profile.created_at || undefined,
            phone: profile.phone || undefined,
            company_name: (profile.company_name as string | undefined) || undefined,
            piese_auto_sell_as_company: pac,
            username: uName || undefined,
            anunturi_afisare_cu: afisareCu,
          });
          if (profile.created_at) {
            const date = new Date(profile.created_at);
            setJoinedDate(date.toLocaleDateString('ro-RO', { month: 'long', year: 'numeric' }));
          }
        } else {
          console.log('[UserProfile] No profile found for userId:', userId);
        }

        try {
          if (verificationData && typeof verificationData === 'object') {
            const vd = verificationData as Record<string, unknown>;
            setVerifiedInfo({
              email: true,
              phone: Boolean(vd.phoneVerified),
              cnp: Boolean(vd.cnpVerified),
              google: Boolean(vd.googleVerified),
              apple: Boolean(vd.appleVerified),
              provider: typeof vd.provider === 'string' ? vd.provider : undefined,
            });
            if (typeof vd.location === 'string' && vd.location.trim()) {
              setUserLocation(vd.location.trim());
            }
            if (vd.lastSignInAt) {
              setLastSignInAt(new Date(String(vd.lastSignInAt)));
            }
            if (vd.followersCount !== undefined && vd.followersCount !== null) {
              setFollowersCount(Number(vd.followersCount));
            }
            if (vd.followingCount !== undefined && vd.followingCount !== null) {
              setFollowingCount(Number(vd.followingCount));
            }
          } else {
            setVerifiedInfo({
              email: true,
              phone: false,
              cnp: false,
              google: false,
              apple: false,
              provider: undefined,
            });
          }
        } catch (err) {
          console.error('Error applying verification info:', err);
          setVerifiedInfo({
            email: true,
            phone: false,
            cnp: false,
            google: false,
            apple: false,
            provider: undefined,
          });
        }

        const { productsData, productsError } = productsPack;

        if (productsError) {
          console.error('Error loading products:', productsError);
          setError('Eroare la încărcarea produselor.');
        } else {
          setProducts(productsData);
          
          // Extrage categorii unice
          const uniqueCategories = Array.from(
            new Set(
              (productsData || [])
                .map((p: { category?: string | null }) => p.category)
                .filter((c: string | null | undefined): c is string => !!c && String(c).trim() !== ''),
            ),
          ).slice(0, 4);
          setCategories(uniqueCategories as string[]);
        }
      } catch (err) {
        console.error('Error loading data:', err);
        setError('Eroare la încărcarea datelor.');
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [userId]);

  // Supabase Realtime pentru recenzii - reîncarcă când se adaugă o recenzie nouă
  useEffect(() => {
    if (!userId) return;

    const reviewsChannel = supabase
      .channel(`user_reviews_${userId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'user_reviews',
          filter: `reviewed_user_id=eq.${userId}`
        },
        (_payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => {
          console.log('[UserProfile] Review change detected:', _payload);
          // Reîncarcă recenziile când se adaugă/modifică/șterge o recenzie
          if (calculateReviewsRef.current) {
            calculateReviewsRef.current(userId);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(reviewsChannel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]); // calculateReviews este stabilă (useCallback fără dependențe)

  // Reset displayed count when category or sort changes
  useEffect(() => {
    setDisplayedProductsCount(12);
  }, [selectedCategory, sortBy, shopSearchQuery, selectedShopMarca]);

  // Placeholder animat (scriere ciclică) când câmpul e gol și nefocusat
  useEffect(() => {
    if (shopSearchQuery !== "" || shopSearchInputFocused) {
      setShopSearchTypingPlaceholderLen(0);
      return;
    }

    let cancelled = false;
    let len = 0;
    const charDelayMs = 52;
    const pauseBeforeRestartMs = 2400;

    const schedule = (fn: () => void, ms: number): number =>
      window.setTimeout(() => {
        if (!cancelled) fn();
      }, ms);

    let timeoutId: number | undefined;

    const loop = () => {
      if (cancelled) return;
      if (len < SHOP_SEARCH_TYPING_PLACEHOLDER_FULL.length) {
        len += 1;
        setShopSearchTypingPlaceholderLen(len);
        timeoutId = schedule(loop, charDelayMs);
      } else {
        timeoutId = schedule(() => {
          if (cancelled) return;
          len = 0;
          setShopSearchTypingPlaceholderLen(0);
          timeoutId = schedule(loop, charDelayMs);
        }, pauseBeforeRestartMs);
      }
    };

    timeoutId = schedule(loop, charDelayMs);

    return () => {
      cancelled = true;
      if (timeoutId != null) window.clearTimeout(timeoutId);
    };
  }, [shopSearchQuery, shopSearchInputFocused]);

  const isDealerPieseAuto = userProfile?.piese_auto_sell_as_company === true;

  const productsAfterCategory = useMemo(() => {
    if (!selectedCategory) return products;
    return products.filter((p) => p.category && p.category.trim() === selectedCategory.trim());
  }, [products, selectedCategory]);

  const dealerMarcaOptions = useMemo(() => {
    if (!isDealerPieseAuto) return [];
    const set = new Set<string>();
    for (const p of products) {
      if (!isPieseAutoListingProduct(p)) continue;
      const m = getMarcaFromListing(p);
      if (m) set.add(m);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, "ro"));
  }, [products, isDealerPieseAuto]);

  const filteredShopProducts = useMemo(() => {
    const searchActive = shopSearchQuery.trim().length > 0;
    const tokens = searchActive ? parseShopSearchTokens(shopSearchQuery) : [];

    let list = searchActive ? products : productsAfterCategory;

    if (isDealerPieseAuto && selectedShopMarca.trim()) {
      const needle = stripDiacriticsLower(selectedShopMarca.trim());
      list = list.filter((p) => {
        if (!isPieseAutoListingProduct(p)) return false;
        return stripDiacriticsLower(getMarcaFromListing(p)) === needle;
      });
    }

    if (tokens.length === 0) return list;
    return list.filter((p) => {
      const hay = stripDiacriticsLower(buildShopSearchHaystack(p));
      return shopHaystackMatchesTokens(hay, tokens);
    });
  }, [products, productsAfterCategory, isDealerPieseAuto, selectedShopMarca, shopSearchQuery]);

  // Sort products based on selected sort option
  const getSortedProducts = (productsList: Product[]) => {
    const sorted = [...productsList];
    
    switch (sortBy) {
      case 'price-asc':
        return sorted.sort((a, b) => {
          const priceA = a.starting_price_ron || a.starting_price_eur || 0;
          const priceB = b.starting_price_ron || b.starting_price_eur || 0;
          return priceA - priceB;
        });
      case 'price-desc':
        return sorted.sort((a, b) => {
          const priceA = a.starting_price_ron || a.starting_price_eur || 0;
          const priceB = b.starting_price_ron || b.starting_price_eur || 0;
          return priceB - priceA;
        });
      case 'newest':
        return sorted.sort((a, b) => {
          const dateA = new Date(a.created_at || 0).getTime();
          const dateB = new Date(b.created_at || 0).getTime();
          return dateB - dateA;
        });
      case 'oldest':
        return sorted.sort((a, b) => {
          const dateA = new Date(a.created_at || 0).getTime();
          const dateB = new Date(b.created_at || 0).getTime();
          return dateA - dateB;
        });
      case 'relevance':
      default:
        // Keep original order (already sorted by created_at DESC from API)
        return sorted;
    }
  };

  const sortedShopProducts = useMemo(
    () => getSortedProducts(filteredShopProducts),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- getSortedProducts depinde de sortBy în corpul componentei
    [filteredShopProducts, sortBy],
  );

  // Infinite scroll handler
  useEffect(() => {
    if (!mounted) return;

    const handleScroll = () => {
      const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
      const windowHeight = window.innerHeight;
      const documentHeight = document.documentElement.scrollHeight;

      if (scrollTop + windowHeight >= documentHeight - 200 && !loadingMore) {
        const total = sortedShopProducts.length;
        if (displayedProductsCount < total) {
          setLoadingMore(true);
          setTimeout(() => {
            setDisplayedProductsCount((prev) => Math.min(prev + 12, total));
            setLoadingMore(false);
          }, 300);
        }
      }
    };

    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, [mounted, displayedProductsCount, sortedShopProducts.length, loadingMore]);

  const getProductUrl = (product: Product): string => {
    const productTypeRoutes: Record<string, string> = {
      'licitatii-publice': 'licitatii-publice',
      'live-bid': 'live_bid',
      'buy-now': 'produs',
    };
    
    const route = productTypeRoutes[product.product_type] || 'produs';
    return `/${route}/${product.slug}`;
  };

  const formatPrice = (price?: number, currency?: string): string => {
    if (!price) return 'Preț negociabil';
    return new Intl.NumberFormat('ro-RO', {
      style: 'currency',
      currency: currency === 'EUR' ? 'EUR' : 'RON',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(price);
  };

  const getUserDisplayName = (): string => {
    if (
      userProfile?.piese_auto_sell_as_company &&
      userProfile.company_name &&
      String(userProfile.company_name).trim()
    ) {
      return String(userProfile.company_name).trim();
    }
    if (
      userProfile?.anunturi_afisare_cu === "username" &&
      userProfile.username &&
      String(userProfile.username).trim()
    ) {
      return String(userProfile.username).trim();
    }
    if (userProfile?.first_name && userProfile?.last_name) {
      return `${userProfile.first_name} ${userProfile.last_name}`;
    }
    if (userProfile?.first_name) {
      return userProfile.first_name;
    }
    if (userProfile?.email) {
      return userProfile.email.split("@")[0];
    }
    // Fallback: folosește primele 8 caractere din ID
    return userId ? userId.substring(0, 8) : "Vânzător";
  };

  const getRatingBarWidth = (rating: number): string => {
    return `${(rating / 5) * 100}%`;
  };

  // Favorite functionality
  const isProductFavorite = (productId: string) => {
    return favoriteProducts.includes(productId);
  };

  const handleToggleFavorite = async (productId: string, e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const isFavorite = isProductFavorite(productId);

      if (isFavorite) {
        // Remove favorite
        if (session) {
          // Remove from Supabase if logged in
          const accessToken = session.access_token;
          const response = await fetch(`/api/user/favorites?itemId=${productId}&itemType=product`, {
            method: 'DELETE',
            headers: {
              'Authorization': `Bearer ${accessToken}`
            }
          });

          if (response.ok) {
            const newFavorites = favoriteProducts.filter(id => id !== productId);
            setFavoriteProducts(newFavorites);
            localStorage.setItem('favoriteProducts', JSON.stringify(newFavorites));
          } else {
            throw new Error('Failed to remove favorite');
          }
        } else {
          // Remove from localStorage only (guest user)
          const newFavorites = favoriteProducts.filter(id => id !== productId);
          setFavoriteProducts(newFavorites);
          localStorage.setItem('favoriteProducts', JSON.stringify(newFavorites));
          localStorage.setItem('favoriteProductsTimestamp', Date.now().toString());
        }
      } else {
        // Add favorite - open modal to select lists
        const product = products.find(p => p.id === productId);
        if (product) {
          setSelectedProductForFavorite({
            id: productId,
            title: product.title || 'Produs'
          });
          setShowFavoriteModal(true);
        }
      }
    } catch (error) {
      console.error('Error toggling favorite:', error);
    }
  };

  const handleFavoriteModalSuccess = () => {
    // Reload favorites after modal success
    const loadFavorites = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          const accessToken = session.access_token;
          const response = await fetch('/api/user/favorites', {
            headers: {
              'Authorization': `Bearer ${accessToken}`
            }
          });
          if (response.ok) {
            const data = await response.json();
            const favorites = data.favorites || [];
            const favoriteIds = favorites.filter((f: any) => f.item_type === 'product').map((f: any) => f.item_id);
            setFavoriteProducts(favoriteIds);
            localStorage.setItem('favoriteProducts', JSON.stringify(favoriteIds));
          }
        }
      } catch (error) {
        console.error('Error reloading favorites:', error);
      }
    };
    loadFavorites();
  };

  // Funcție pentru a găsi lista "Lista Useri favoriti" (nu o creează, doar o găsește)
  // Lista este creată permanent în pagina de favorite
  const getUsersFavoriteList = async (accessToken: string): Promise<string | null> => {
    try {
      // Caută lista existentă
      const listsResponse = await fetch('/api/user/favorite-lists', {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      });

      if (listsResponse.ok) {
        const listsData = await listsResponse.json();
        // Caută lista cu ID fix sau cu numele
        const usersList = listsData.lists?.find((list: any) => 
          list.id === 'lista-useri-favoriti' || list.name === 'Lista Useri favoriti'
        );
        
        if (usersList) {
          return usersList.id;
        }
      }

      // Dacă nu există, returnează ID-ul fix (lista va fi creată în pagina de favorite)
      // Nu creăm lista aici, doar returnăm ID-ul pentru a fi folosit
      return 'lista-useri-favoriti';
    } catch (error) {
      console.error('Error getting users favorite list:', error);
      // Returnează ID-ul fix ca fallback
      return 'lista-useri-favoriti';
    }
  };

  // Funcție pentru a salva/șterge utilizatorul din favorite
  const handleSaveUser = async (e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }

    if (!currentUserId) {
      setAuthModalAction('save');
      setShowAuthModal(true);
      return;
    }

    setSavingUser(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        // Nu facem redirect, doar afișăm un mesaj
        setErrorMessage('Sesiunea a expirat. Te rugăm să te autentifici din nou.');
        setShowErrorModal(true);
        setSavingUser(false);
        return;
      }

      const accessToken = session.access_token;

      if (isUserFavorite) {
        // Șterge utilizatorul din favorite
        const response = await fetch(`/api/user/favorites?itemId=${userId}&itemType=user`, {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${accessToken}`
          }
        });

        if (response.ok) {
          setIsUserFavorite(false);
        } else {
          throw new Error('Failed to remove user from favorites');
        }
      } else {
        // Adaugă utilizatorul în favorite
        // Găsește sau creează lista "Lista Useri favoriti"
        const listId = await getUsersFavoriteList(accessToken);
        
        const response = await fetch('/api/user/favorites', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            itemId: userId,
            itemType: 'user',
            favoriteListId: listId
          })
        });

        if (response.ok) {
          setIsUserFavorite(true);
        } else {
          const errorData = await response.json().catch(() => ({ error: 'Eroare necunoscută' }));
          const errorMsg = errorData.details || errorData.error || errorData.message || 'Eroare la salvare. Te rugăm să încerci din nou.';
          console.error('API Error details:', errorData);
          throw new Error(errorMsg);
        }
      }
    } catch (error: any) {
      console.error('Error saving user:', error);
      let errorMsg = error?.message || error?.details || 'Eroare la salvare. Te rugăm să încerci din nou.';
      
      // Adaugă hint-ul dacă există
      if (error?.hint) {
        errorMsg += `\n\n${error.hint}`;
      }
      
      setErrorMessage(errorMsg);
      setShowErrorModal(true);
    } finally {
      setSavingUser(false);
    }
  };

  // Verifică dacă utilizatorul este salvat în favorite
  useEffect(() => {
    const checkUserFavorite = async () => {
      if (!currentUserId) return;

      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;

        const accessToken = session.access_token;
        const response = await fetch('/api/user/favorites', {
          headers: {
            'Authorization': `Bearer ${accessToken}`
          }
        });

        if (response.ok) {
          const data = await response.json();
          const favorites = data.favorites || [];
          const isFavorite = favorites.some((f: any) => f.item_id === userId && f.item_type === 'user');
          setIsUserFavorite(isFavorite);
        }
      } catch (error) {
        console.error('Error checking user favorite:', error);
      }
    };

    checkUserFavorite();
  }, [currentUserId, userId]);

  // Verifică dacă utilizatorul actual urmărește utilizatorul vizitat
  useEffect(() => {
    const checkFollowing = async () => {
      if (!currentUserId || !userId || currentUserId === userId) {
        setIsFollowing(false);
        return;
      }

      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
          setIsFollowing(false);
          return;
        }

        const accessToken = session.access_token;
        const response = await fetch(`/api/user/follow?followedUserId=${userId}`, {
          headers: {
            'Authorization': `Bearer ${accessToken}`
          }
        });

        if (response.ok) {
          const data = await response.json();
          setIsFollowing(data.isFollowing || false);
        } else {
          setIsFollowing(false);
        }
      } catch (error) {
        console.error('Error checking follow status:', error);
        setIsFollowing(false);
      }
    };

    checkFollowing();
  }, [currentUserId, userId]);

  // Verifică reacțiile utilizatorului (Like/Dislike)
  useEffect(() => {
    const loadReactions = async () => {
      if (!currentUserId || !userId || currentUserId === userId) {
        setHasLiked(false);
        setHasDisliked(false);
        setLikeCount(0);
        setDislikeCount(0);
        return;
      }

      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
          setHasLiked(false);
          setHasDisliked(false);
          setLikeCount(0);
          setDislikeCount(0);
          return;
        }

        const accessToken = session.access_token;
        const response = await fetch(`/api/user/reaction?targetUserId=${userId}`, {
          headers: {
            'Authorization': `Bearer ${accessToken}`
          }
        });

        if (response.ok) {
          const data = await response.json();
          setLikeCount(data.likeCount || 0);
          setDislikeCount(data.dislikeCount || 0);
          setHasLiked(data.userReaction === 'like');
          setHasDisliked(data.userReaction === 'dislike');
        } else {
          setHasLiked(false);
          setHasDisliked(false);
          setLikeCount(0);
          setDislikeCount(0);
        }
      } catch (error) {
        console.error('Error loading reactions:', error);
        setHasLiked(false);
        setHasDisliked(false);
        setLikeCount(0);
        setDislikeCount(0);
      }
    };

    loadReactions();
  }, [currentUserId, userId]);

  // Supabase Realtime pentru user_follows - actualizează followers/following în timp real
  useEffect(() => {
    if (!userId) return;

    // Listener pentru când cineva urmărește/oprește urmărirea acestui utilizator (followed_user_id)
    const followsChannel = supabase
      .channel(`user_follows_${userId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'user_follows',
          filter: `followed_user_id=eq.${userId}`
        },
        async (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => {
          console.log('[UserProfile] Follow change detected for this user:', payload);
          // Reîncarcă numărul de followers
          try {
            const verificationResponse = await fetch(`/api/user/verification/${userId}`);
            if (verificationResponse.ok) {
              const verificationData = await verificationResponse.json();
              if (verificationData.followersCount !== undefined) {
                setFollowersCount(verificationData.followersCount);
              }
            }
          } catch (error) {
            console.error('[UserProfile] Error reloading followers count:', error);
          }
        }
      )
      .subscribe((status: string) => {
        if (status === 'SUBSCRIBED') {
          console.log('[UserProfile] ✅ Successfully subscribed to user_follows Realtime channel');
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.warn('[UserProfile] ⚠️ user_follows Realtime indisponibil (migrație / publication). Numărul de urmăritori se actualizează la reîncărcare.');
        }
      });

    // Listener pentru când utilizatorul actual urmărește/oprește urmărirea altora (follower_user_id)
    let followingChannel: any = null;
    if (currentUserId && currentUserId !== userId) {
      followingChannel = supabase
        .channel(`user_following_${currentUserId}_${userId}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'user_follows',
            filter: `follower_user_id=eq.${currentUserId} AND followed_user_id=eq.${userId}`
          },
          async (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => {
            console.log('[UserProfile] Follow status change detected:', payload);
            if (payload.eventType === 'INSERT') {
              setIsFollowing(true);
            } else if (payload.eventType === 'DELETE') {
              setIsFollowing(false);
            }
            // Reîncarcă numărul de followers pentru utilizatorul vizitat
            try {
              const verificationResponse = await fetch(`/api/user/verification/${userId}`);
              if (verificationResponse.ok) {
                const verificationData = await verificationResponse.json();
                if (verificationData.followersCount !== undefined) {
                  setFollowersCount(verificationData.followersCount);
                }
              }
            } catch (error) {
              console.error('[UserProfile] Error reloading followers count:', error);
            }
          }
        )
        .subscribe((status: string) => {
          if (status === 'SUBSCRIBED') {
            console.log('[UserProfile] ✅ Successfully subscribed to user_following Realtime channel');
          } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            console.warn('[UserProfile] ⚠️ user_following Realtime indisponibil (migrație / publication).');
          }
        });
    }

    return () => {
      supabase.removeChannel(followsChannel);
      if (followingChannel) {
        supabase.removeChannel(followingChannel);
      }
    };
  }, [userId, currentUserId]);

  // Funcție pentru a urmări/opri urmărirea utilizatorului
  const handleFollowUser = async () => {
    if (!currentUserId) {
      setAuthModalAction('follow');
      setShowAuthModal(true);
      return;
    }

    if (currentUserId === userId) {
      setErrorMessage('Nu poți urmări propriul profil.');
      setShowErrorModal(true);
      return;
    }

    setFollowingUser(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setErrorMessage('Sesiunea a expirat. Te rugăm să te autentifici din nou.');
        setShowErrorModal(true);
        setFollowingUser(false);
        return;
      }

      const accessToken = session.access_token;

      if (isFollowing) {
        // Oprește urmărirea
        const response = await fetch(`/api/user/follow?followedUserId=${userId}`, {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${accessToken}`
          }
        });

        if (response.ok) {
          setIsFollowing(false);
          // Actualizează numărul de followers (decrease by 1)
          setFollowersCount(prev => Math.max(0, prev - 1));
          // Reîncarcă datele pentru a actualiza numărul corect
          const verificationResponse = await fetch(`/api/user/verification/${userId}`);
          if (verificationResponse.ok) {
            const verificationData = await verificationResponse.json();
            if (verificationData.followersCount !== undefined) {
              setFollowersCount(verificationData.followersCount);
            }
          }
        } else {
          const errorData = await response.json().catch(() => ({ error: 'Eroare necunoscută' }));
          const errorMessage = errorData.error || 'Eroare la oprirea urmăririi utilizatorului';
          
          // Dacă este eroare 501, înseamnă că tabela nu există încă
          if (response.status === 501) {
            throw new Error(errorMessage + '\n\nFuncționalitatea necesită crearea tabelului user_follows în baza de date.');
          }
          
          throw new Error(errorMessage);
        }
      } else {
        // Începe urmărirea
        const response = await fetch('/api/user/follow', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            followedUserId: userId
          })
        });

        if (response.ok) {
          setIsFollowing(true);
          // Actualizează numărul de followers (increase by 1)
          setFollowersCount(prev => prev + 1);
          // Reîncarcă datele pentru a actualiza numărul corect
          const verificationResponse = await fetch(`/api/user/verification/${userId}`);
          if (verificationResponse.ok) {
            const verificationData = await verificationResponse.json();
            if (verificationData.followersCount !== undefined) {
              setFollowersCount(verificationData.followersCount);
            }
          }
        } else {
          const errorData = await response.json().catch(() => ({ error: 'Eroare necunoscută' }));
          let errorMessage = errorData.error || 'Eroare la urmărirea utilizatorului';
          
          // Log detalii despre eroare pentru debugging
          console.error('[handleFollowUser] API Error:', {
            status: response.status,
            statusText: response.statusText,
            errorData
          });
          
          // Dacă este eroare 501, înseamnă că tabela nu există încă
          if (response.status === 501) {
            errorMessage = errorData.error || 'Funcționalitatea de urmărire nu este încă disponibilă. Te rugăm să rulezi migrarea SQL în Supabase pentru a crea tabela user_follows.';
            throw new Error(errorMessage);
          }
          
          // Dacă există detalii suplimentare, le adăugăm
          if (errorData.details) {
            console.error('[handleFollowUser] Error details:', errorData.details);
          }
          
          throw new Error(errorMessage);
        }
      }
    } catch (error: any) {
      console.error('Error following/unfollowing user:', error);
      let errorMsg = error?.message || error?.details || 'Eroare la urmărire. Te rugăm să încerci din nou.';
      
      // Dacă eroarea este despre tabela care nu există, oferim un mesaj mai clar
      if (errorMsg.includes('42P01') || errorMsg.includes('does not exist') || errorMsg.includes('user_follows')) {
        errorMsg = 'Funcționalitatea de urmărire nu este încă disponibilă.\n\nTe rugăm să rulezi migrarea SQL în Supabase pentru a crea tabela user_follows.';
      }
      
      if (error?.hint) {
        errorMsg += `\n\n${error.hint}`;
      }
      
      setErrorMessage(errorMsg);
      setShowErrorModal(true);
    } finally {
      setFollowingUser(false);
    }
  };

  // Funcție pentru a da Like
  const handleLike = async () => {
    if (!currentUserId) {
      setAuthModalAction('follow');
      setShowAuthModal(true);
      return;
    }

    if (currentUserId === userId) {
      setErrorMessage('Nu poți da Like propriului profil.');
      setShowErrorModal(true);
      return;
    }

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setErrorMessage('Sesiunea a expirat. Te rugăm să te autentifici din nou.');
        setShowErrorModal(true);
        return;
      }

      const accessToken = session.access_token;

      if (hasLiked) {
        // Elimină Like-ul
        const response = await fetch(`/api/user/reaction?targetUserId=${userId}`, {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${accessToken}`
          }
        });

        if (response.ok) {
          setHasLiked(false);
          setLikeCount(prev => Math.max(0, prev - 1));
        }
      } else {
        // Adaugă Like
        const response = await fetch('/api/user/reaction', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            targetUserId: userId,
            reactionType: 'like'
          })
        });

        if (response.ok) {
          setHasLiked(true);
          setLikeCount(prev => prev + 1);
          
          // Dacă avea Dislike, elimină-l
          if (hasDisliked) {
            setHasDisliked(false);
            setDislikeCount(prev => Math.max(0, prev - 1));
          }
        }
      }
    } catch (error: any) {
      console.error('Error toggling like:', error);
      setErrorMessage('Eroare la adăugarea Like-ului. Te rugăm să încerci din nou.');
      setShowErrorModal(true);
    }
  };

  // Funcție pentru a da Dislike
  const handleDislike = async () => {
    if (!currentUserId) {
      setAuthModalAction('follow');
      setShowAuthModal(true);
      return;
    }

    if (currentUserId === userId) {
      setErrorMessage('Nu poți da Dislike propriului profil.');
      setShowErrorModal(true);
      return;
    }

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setErrorMessage('Sesiunea a expirat. Te rugăm să te autentifici din nou.');
        setShowErrorModal(true);
        return;
      }

      const accessToken = session.access_token;

      if (hasDisliked) {
        // Elimină Dislike-ul
        const response = await fetch(`/api/user/reaction?targetUserId=${userId}`, {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${accessToken}`
          }
        });

        if (response.ok) {
          setHasDisliked(false);
          setDislikeCount(prev => Math.max(0, prev - 1));
        }
      } else {
        // Adaugă Dislike
        const response = await fetch('/api/user/reaction', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            targetUserId: userId,
            reactionType: 'dislike'
          })
        });

        if (response.ok) {
          setHasDisliked(true);
          setDislikeCount(prev => prev + 1);
          
          // Dacă avea Like, elimină-l
          if (hasLiked) {
            setHasLiked(false);
            setLikeCount(prev => Math.max(0, prev - 1));
          }
        }
      }
    } catch (error: any) {
      console.error('Error toggling dislike:', error);
      setErrorMessage('Eroare la adăugarea Dislike-ului. Te rugăm să încerci din nou.');
      setShowErrorModal(true);
    }
  };

  // Funcție pentru a încărca lista de followers
  const loadFollowers = async () => {
    if (!userId || loadingFollowers) return;
    
    setLoadingFollowers(true);
    try {
      const response = await fetch(`/api/user/follow/${userId}/list?type=followers`);
      if (response.ok) {
        const data = await response.json();
        setFollowers(data.users || []);
      } else {
        console.error('Error loading followers:', response.statusText);
        setFollowers([]);
      }
    } catch (error) {
      console.error('Error loading followers:', error);
      setFollowers([]);
    } finally {
      setLoadingFollowers(false);
    }
  };

  // Funcție pentru a încărca lista de following
  const loadFollowing = async () => {
    if (!userId || loadingFollowing) return;
    
    setLoadingFollowing(true);
    try {
      const response = await fetch(`/api/user/follow/${userId}/list?type=following`);
      if (response.ok) {
        const data = await response.json();
        setFollowing(data.users || []);
      } else {
        console.error('Error loading following:', response.statusText);
        setFollowing([]);
      }
    } catch (error) {
      console.error('Error loading following:', error);
      setFollowing([]);
    } finally {
      setLoadingFollowing(false);
    }
  };

  // Toggle followers list
  const toggleFollowers = () => {
    if (!showFollowers && followers.length === 0) {
      loadFollowers();
    }
    setShowFollowers(!showFollowers);
  };

  // Toggle following list
  const toggleFollowing = () => {
    if (!showFollowing && following.length === 0) {
      loadFollowing();
    }
    setShowFollowing(!showFollowing);
  };

  const handleSendMessage = async () => {
    if (!contactMessage.trim()) {
      setContactError('Te rugăm să introduci un mesaj.');
      return;
    }

    if (!currentUserId) {
      setContactError('Trebuie să fii autentificat pentru a trimite un mesaj.');
      return;
    }

    setSendingMessage(true);
    setContactError(null);
    setContactSuccess(false);

    try {
      // Obține token-ul de autentificare
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        throw new Error('Nu ești autentificat. Te rugăm să te conectezi.');
      }

      // Găsește primul produs activ al utilizatorului pentru a crea conversația
      const firstProduct = products.length > 0 ? products[0] : null;
      
      if (!firstProduct) {
        throw new Error('Utilizatorul nu are produse active. Nu poți trimite mesaj.');
      }

      // Verifică cine este owner-ul produsului pentru a seta corect buyer/seller
      // Produsul aparține utilizatorului vizitat (userId), deci el este seller-ul
      const productOwnerId = userId;
      const buyerUserId = currentUserId;
      const sellerUserId = productOwnerId;

      // Creează sau găsește conversația de chat
      // Caută chat-ul în ambele sensuri (buyer/seller pot fi inversați)
      const { data: chatData, error: chatError } = await supabase
        .from('product_chats')
        .select('id')
        .eq('product_id', firstProduct.id)
        .or(`and(buyer_user_id.eq.${buyerUserId},seller_user_id.eq.${sellerUserId}),and(buyer_user_id.eq.${sellerUserId},seller_user_id.eq.${buyerUserId})`)
        .maybeSingle();

      let chatId: string;

      // Verifică dacă există o eroare reală (nu doar "no rows found")
      if (chatError) {
        const errorString = JSON.stringify(chatError);
        const isEmpty = errorString === '{}';
        
        // Dacă nu este obiect gol și nu este PGRST116 (no rows found), atunci este o eroare reală
        if (!isEmpty && chatError.code !== 'PGRST116') {
          console.error('Error finding chat:', chatError);
          throw new Error('Eroare la căutarea conversației.');
        }
        // Dacă este PGRST116 sau obiect gol, continuăm (nu există conversație, o vom crea)
      }

      if (chatData) {
        chatId = chatData.id;
      } else {
        // Folosim upsert pentru a crea sau returna chat-ul existent
        // Upsert va crea chat-ul dacă nu există sau va returna cel existent
        const { data: upsertedChat, error: upsertError } = await supabase
          .from('product_chats')
          .upsert({
            product_id: firstProduct.id,
            buyer_user_id: buyerUserId,
            seller_user_id: sellerUserId,
            communication_preference: 'chat'
          }, {
            onConflict: 'product_id,buyer_user_id',
            ignoreDuplicates: false
          })
          .select('id')
          .single();

        if (upsertError) {
          console.error('Error upserting chat:', upsertError);
          
          // Dacă upsert-ul a eșuat, încearcă să găsească chat-ul existent ca ultimă încercare
          const { data: fallbackChat } = await supabase
            .from('product_chats')
            .select('id')
            .eq('product_id', firstProduct.id)
            .or(`and(buyer_user_id.eq.${buyerUserId},seller_user_id.eq.${sellerUserId}),and(buyer_user_id.eq.${sellerUserId},seller_user_id.eq.${buyerUserId})`)
            .maybeSingle();
          
          if (fallbackChat) {
            chatId = fallbackChat.id;
          } else {
            throw new Error(upsertError.message || 'Eroare la crearea conversației.');
          }
        } else if (upsertedChat) {
          chatId = upsertedChat.id;
        } else {
          throw new Error('Eroare la crearea conversației. Conversația nu a fost creată.');
        }
      }

      // Trimite mesajul
      const response = await fetch('/api/product-chat/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          chatId,
          messageText: contactMessage.trim()
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Eroare la trimiterea mesajului.');
      }

      setContactSuccess(true);
      setContactMessage('');
      
      // Redirecționează la pagina de oferte după 1.5 secunde pentru a continua conversația
      setTimeout(() => {
        setShowContactModal(false);
        setContactSuccess(false);
        // Redirecționează la pagina de oferte/mesaje
        router.push('/dashboard/ofertele_mele');
      }, 1500);
    } catch (err: any) {
      console.error('Error sending message:', err);
      setContactError(err.message || 'Eroare la trimiterea mesajului.');
    } finally {
      setSendingMessage(false);
    }
  };

  if (!mounted) {
    return null;
  }

  return (
    <div
      className={`min-h-screen transition-colors duration-300 ${
        isDarkMode ? "bg-gray-900 text-gray-100" : "bg-white text-gray-900"
      }`}
    >
      <UniversalHeader 
        isDarkMode={isDarkMode} 
        onToggleDarkMode={toggleDarkMode}
      />

      <div className="max-w-7xl mx-auto px-2 sm:px-6 lg:px-8 py-2 sm:py-8">
        {/* Back Button */}
        <button
          onClick={() => router.back()}
          className={`mb-6 flex items-center gap-2 px-4 py-2 rounded-lg transition-all ${
            isDarkMode 
              ? 'bg-gray-800 hover:bg-gray-700 text-white border border-gray-700' 
              : 'bg-white hover:bg-gray-50 text-gray-900 border border-gray-200 shadow-sm'
          }`}
        >
          <i className="ri-arrow-left-line"></i>
          <span>Înapoi</span>
        </button>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className={`animate-spin rounded-full h-12 w-12 border-b-2 ${
              isDarkMode ? 'border-blue-400' : 'border-blue-600'
            }`}></div>
          </div>
        ) : error ? (
          <div className={`text-center py-20 ${isDarkMode ? 'text-red-400' : 'text-red-600'}`}>
            <p className="text-lg">{error}</p>
          </div>
        ) : (
          <div className="space-y-2 sm:space-y-6">
            {/* Seller Profile Card - eBay/Amazon Style */}
            <div className={`rounded-lg border p-3 ${
              isDarkMode 
                ? 'bg-gray-800 border-gray-700 hover:border-gray-600' 
                : 'bg-white border-gray-200 hover:border-gray-300'
            }`}>
              {/* Mobile Layout: Similar to product page */}
              <div className="flex sm:hidden items-center gap-3">
                {/* Avatar */}
                <div className="relative flex-shrink-0">
                  {userProfile?.avatar_url ? (
                    <img 
                      src={userProfile.avatar_url} 
                      alt={getUserDisplayName()}
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
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`text-sm font-semibold truncate ${
                      isDarkMode ? 'text-white' : 'text-gray-900'
                    }`}>
                      {getUserDisplayName()}
                    </span>
                    {userRating && userRating.reviewCount > 0 && (
                      <span className={`text-xs ${
                        isDarkMode ? 'text-gray-400' : 'text-gray-600'
                      }`}>
                        ({userRating.reviewCount})
                      </span>
                    )}
                  </div>
                  
                  {/* Rating & Feedback */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="flex items-center gap-1">
                      {[1, 2, 3, 4, 5].map((star) => {
                        if (userRating && userRating.reviewCount > 0 && userRating.averageRating > 0) {
                          // Pentru rating mediu de 4.75: stelele 1-4 sunt pline, steaua 5 este jumătate
                          const fullStars = Math.floor(userRating.averageRating);
                          const hasHalfStar = userRating.averageRating % 1 >= 0.5 && star === fullStars + 1;
                          
                          if (star <= fullStars) {
                            // Stea completă
                            return (
                              <i
                                key={star}
                                className="text-xs ri-star-fill text-yellow-400"
                              ></i>
                            );
                          } else if (hasHalfStar) {
                            // Stea jumătate (dacă rating-ul are zecimale >= 0.5)
                            return (
                              <i
                                key={star}
                                className="text-xs ri-star-half-fill text-yellow-400"
                              ></i>
                            );
                          } else {
                            // Stea goală
                            return (
                              <i
                                key={star}
                                className="text-xs ri-star-line text-gray-400"
                              ></i>
                            );
                          }
                        } else {
                          // Stele goale când nu există review-uri
                          return (
                            <i
                              key={star}
                              className="text-xs ri-star-line text-gray-400"
                            ></i>
                          );
                        }
                      })}
                      {userRating && userRating.reviewCount > 0 && userRating.averageRating > 0 ? (
                        <span className={`text-xs ml-0.5 ${
                          isDarkMode ? 'text-gray-400' : 'text-gray-600'
                        }`}>
                          ({userRating.averageRating.toFixed(1)})
                        </span>
                      ) : null}
                    </div>
                    
                    {userRating && userRating.reviewCount > 0 && userRating.positivePercentage >= 0 ? (
                      <span className={`text-xs ${
                        isDarkMode ? 'text-gray-400' : 'text-gray-600'
                      }`}>
                        {userRating.positivePercentage.toFixed(1)}% pozitiv
                      </span>
                    ) : (
                      <span className={`text-xs ${
                        isDarkMode ? 'text-gray-400' : 'text-gray-600'
                      }`}>
                        N/A pozitiv
                      </span>
                    )}
                  </div>
                  
                </div>
                
                {/* QR Code */}
                <div className="flex-shrink-0">
                  <UserShopQrBadge userId={userId} pixelSize={64} />
                </div>
              </div>

              {/* Ultima conectare și urmăritori - Mobile */}
              {(lastSignInAt || followersCount >= 0 || followingCount >= 0) && (
                <div className="flex sm:hidden items-center gap-2 mt-2 pb-2 border-b border-gray-300 dark:border-gray-600 text-xs">
                  <div className={`flex items-center gap-2 flex-wrap ${
                    isDarkMode ? 'text-gray-400' : 'text-gray-600'
                  }`}>
                    {lastSignInAt && (
                      <span className="flex items-center gap-1">
                        <i className="ri-time-line"></i>
                        <span>
                          Ultima conectare {(() => {
                            const now = new Date();
                            const diffMs = now.getTime() - lastSignInAt.getTime();
                            const diffMins = Math.floor(diffMs / 60000);
                            const diffHours = Math.floor(diffMs / 3600000);
                            const diffDays = Math.floor(diffMs / 86400000);
                            
                            if (diffMins < 1) return 'acum';
                            if (diffMins < 60) return `acum ${diffMins} ${diffMins === 1 ? 'minut' : 'minute'}`;
                            if (diffHours < 24) return `acum ${diffHours} ${diffHours === 1 ? 'oră' : 'ore'}`;
                            if (diffDays === 1) return 'ieri';
                            if (diffDays < 7) return `acum ${diffDays} ${diffDays === 1 ? 'zi' : 'zile'}`;
                            return lastSignInAt.toLocaleDateString('ro-RO', { day: '2-digit', month: '2-digit', year: 'numeric' });
                          })()}
                        </span>
                      </span>
                    )}
                    {(followersCount >= 0 || followingCount >= 0) && (
                      <>
                        {lastSignInAt && <span className="text-gray-400 dark:text-gray-500">•</span>}
                        <span className="flex items-center gap-1 flex-wrap">
                          <i className="ri-user-line"></i>
                          <button
                            onClick={toggleFollowers}
                            className={`hover:underline cursor-pointer ${
                              isDarkMode ? 'text-gray-400 hover:text-gray-300' : 'text-gray-600 hover:text-gray-900'
                            }`}
                            disabled={loadingFollowers}
                          >
                            {followersCount} {followersCount === 1 ? 'urmăritor' : 'urmăritori'}
                          </button>
                          <span className="text-gray-400 dark:text-gray-500">,</span>
                          <button
                            onClick={toggleFollowing}
                            className={`hover:underline cursor-pointer ${
                              isDarkMode ? 'text-gray-400 hover:text-gray-300' : 'text-gray-600 hover:text-gray-900'
                            }`}
                            disabled={loadingFollowing}
                          >
                            {followingCount} urmărește
                          </button>
                        </span>
                      </>
                    )}
                  </div>
                </div>
              )}
              
              {/* Action Buttons - Mobile - Below profile card */}
              {currentUserId !== userId && (
                <div className="flex sm:hidden gap-2 mt-3 justify-start flex-wrap">
                  <div className="flex flex-col items-center gap-1">
                    <button
                      onClick={handleFollowUser}
                      disabled={followingUser}
                      className={`w-9 h-9 rounded-full transition-all duration-300 border-2 flex items-center justify-center ${
                        isFollowing
                          ? 'bg-blue-100 text-blue-600 border-blue-300 hover:bg-blue-200'
                          : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
                      } ${followingUser ? 'opacity-50 cursor-not-allowed' : ''}`}
                      title={isFollowing ? 'Nu mai urmări' : 'Urmărește'}
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill={isFollowing ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/>
                        <circle cx="9" cy="7" r="4"/>
                        <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>
                      </svg>
                    </button>
                    <span className="text-xs font-medium text-gray-600">{followersCount}</span>
                  </div>
                  <div className="flex flex-col items-center gap-1">
                    <button
                      onClick={handleLike}
                      className={`w-9 h-9 rounded-full transition-all duration-300 border-2 flex items-center justify-center ${
                        hasLiked
                          ? 'bg-green-100 text-green-600 border-green-300 hover:bg-green-200'
                          : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
                      }`}
                      title="Like"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill={hasLiked ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M7 10v12M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2h0a3.13 3.13 0 0 1 3 3.88Z"/>
                      </svg>
                    </button>
                    <span className="text-xs font-medium text-gray-600">{likeCount}</span>
                  </div>
                  <div className="flex flex-col items-center gap-1">
                    <button
                      onClick={handleDislike}
                      className={`w-9 h-9 rounded-full transition-all duration-300 border-2 flex items-center justify-center ${
                        hasDisliked
                          ? 'bg-red-100 text-red-600 border-red-300 hover:bg-red-200'
                          : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
                      }`}
                      title="Dislike"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill={hasDisliked ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ transform: 'rotate(180deg)' }}>
                        <path d="M7 10v12M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2h0a3.13 3.13 0 0 1 3 3.88Z"/>
                      </svg>
                    </button>
                    <span className="text-xs font-medium text-gray-600">{dislikeCount}</span>
                  </div>
                  <div className="flex flex-col items-center gap-1">
                    <button
                      onClick={async () => {
                        if (!currentUserId) {
                          setAuthModalAction('contact');
                          setShowAuthModal(true);
                          return;
                        }
                        
                        try {
                          const { data: { session } } = await supabase.auth.getSession();
                          if (!session) {
                            setErrorMessage('Sesiunea a expirat. Te rugăm să te autentifici din nou.');
                            setShowErrorModal(true);
                            return;
                          }

                          // Sortează UUID-urile pentru a respecta constraint-ul (user1_id < user2_id)
                          const [user1Id, user2Id] = [currentUserId, userId].sort();
                          console.log('Creating/finding user chat between:', { user1Id, user2Id });

                          // Creează sau găsește chat-ul direct între utilizatori
                          const { data: existingChat, error: findError } = await supabase
                            .from('user_chats')
                            .select('id')
                            .eq('user1_id', user1Id)
                            .eq('user2_id', user2Id)
                            .maybeSingle();

                          if (findError) {
                            console.error('Error finding existing chat:', findError);
                            alert(`EROARE: Tabela user_chats nu există!\n\nTrebuie să aplici migrația SQL:\n1. Deschide Supabase Dashboard\n2. SQL Editor → New query\n3. Copiază tot din fișierul:\n   supabase/migrations/20260119_user_chats.sql\n4. Run (Ctrl+Enter)\n\nERROARE COMPLETĂ: ${JSON.stringify(findError)}`);
                            return;
                          }

                          let chatId: string;

                          if (existingChat) {
                            console.log('🔍 [CHAT] Existing chat found:', existingChat.id);
                            chatId = existingChat.id;
                            
                            // Verifică dacă chat-ul are deja mesaje
                            const { count, error: countError } = await supabase
                              .from('user_chat_messages')
                              .select('*', { count: 'exact', head: true })
                              .eq('chat_id', chatId);

                            console.log('🔍 [CHAT] Message count:', count, 'Error:', countError);

                            if (count && count > 0) {
                              console.log('✅ [CHAT] Chat has messages, redirecting with unhide...');
                              // Chat-ul are mesaje - redirect direct cu unhide pentru a-l restaura
                              router.push(`/dashboard/ofertele_mele?userChatId=${chatId}&unhide=true`);
                              return;
                            }
                            
                            console.log('⚠️ [CHAT] Chat has no messages, continuing with request...');
                          } else {
                            console.log('No existing chat, creating new one');
                            // Creează chat nou (upsert pentru a evita duplicate key errors)
                            const { data: newChat, error: chatError } = await supabase
                              .from('user_chats')
                              .upsert({
                                user1_id: user1Id,
                                user2_id: user2Id
                              }, {
                                onConflict: 'user1_id,user2_id'
                              })
                              .select('id')
                              .single();

                            console.log('Upsert result:', { newChat, chatError });

                            if (chatError) {
                              console.error('Chat creation error:', chatError);
                              setErrorMessage(`Eroare la crearea chat-ului: ${chatError.message || JSON.stringify(chatError)}`);
                              setShowErrorModal(true);
                              return;
                            }

                            if (!newChat) {
                              console.error('No chat returned from upsert');
                              setErrorMessage('Eroare la crearea chat-ului.');
                              setShowErrorModal(true);
                              return;
                            }

                            console.log('New chat created:', newChat.id);
                            chatId = newChat.id;
                          }

                          // Salvează cererea în baza de date (fără product_id)
                          const { data: request } = await supabase
                            .from('chat_requests')
                            .upsert({
                              sender_user_id: currentUserId,
                              receiver_user_id: userId,
                              product_id: null, // Nu mai este legat de un produs
                              status: 'pending'
                            }, {
                              onConflict: 'sender_user_id,receiver_user_id,product_id'
                            })
                            .select()
                            .single();

                          // Trimite mesaj automat în chat cu cererea
                          const senderName = userProfile?.first_name && userProfile?.last_name
                            ? `${userProfile.first_name} ${userProfile.last_name}`
                            : userProfile?.email || 'Un utilizator';

                          const { error: messageError } = await supabase
                            .from('user_chat_messages')
                            .insert({
                              chat_id: chatId,
                              sender_user_id: currentUserId,
                              message_text: `${senderName} vrea să vorbească cu tine.`,
                              is_system_message: true,
                              metadata: {
                                type: 'chat_request',
                                requestId: request?.id,
                                senderId: currentUserId,
                                senderName: senderName
                              }
                            });

                          if (messageError) {
                            console.error('Error creating message:', messageError);
                            alert(`EROARE la crearea mesajului: ${messageError.message || JSON.stringify(messageError)}`);
                            return;
                          }

                          console.log('✅ Chat request created successfully!', {
                            chatId,
                            requestId: request?.id,
                            message: 'Chat request sent'
                          });

                          // Arată mesaj de success și redirecționează (cu parametri pentru a restaura chat-ul)
                          alert('✅ Cerere de chat trimisă cu succes!\n\nÎn curând vei putea vedea conversația pe pagina de oferte.');
                          router.push(`/dashboard/ofertele_mele?userChatId=${chatId}&unhide=true`);
                        } catch (error) {
                          console.error('Error sending chat request:', error);
                          setErrorMessage('Eroare la trimiterea cererii de chat.');
                          setShowErrorModal(true);
                        }
                      }}
                      className="w-9 h-9 rounded-full transition-all duration-300 border-2 flex items-center justify-center bg-white text-gray-600 border-gray-300 hover:bg-blue-50 hover:text-blue-600 hover:border-blue-300"
                      title="Contactează"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                      </svg>
                    </button>
                    <span className="text-xs font-medium text-gray-600">Chat</span>
                  </div>
                  <div className="flex flex-col items-center gap-1">
                    <button
                      onClick={handleSaveUser}
                      disabled={savingUser}
                      className={`w-9 h-9 rounded-full transition-all duration-300 border-2 flex items-center justify-center ${
                        isUserFavorite
                          ? 'bg-pink-100 text-pink-600 border-pink-300 hover:bg-pink-200'
                          : 'bg-white text-gray-600 border-gray-300 hover:bg-pink-50 hover:text-pink-600 hover:border-pink-300'
                      } ${savingUser ? 'opacity-50 cursor-not-allowed' : ''}`}
                      title={isUserFavorite ? 'Salvat' : 'Salvează'}
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill={isUserFavorite ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>
                      </svg>
                    </button>
                    <span className="text-xs font-medium text-gray-600">{isUserFavorite ? 'Salvat' : 'Salvează'}</span>
                  </div>
                </div>
              )}

              {/* Desktop Layout: Similar to product page */}
              <div className="hidden sm:flex flex-row items-center gap-6">
                {/* Avatar */}
                <div className="relative flex-shrink-0">
                  {userProfile?.avatar_url ? (
                    <img 
                      src={userProfile.avatar_url} 
                      alt={getUserDisplayName()}
                      className="w-20 h-20 rounded-full object-cover"
                    />
                  ) : (
                    <div className={`w-20 h-20 rounded-full flex items-center justify-center ${
                      isDarkMode ? 'bg-gray-700' : 'bg-gray-200'
                    }`}>
                      <i className={`ri-user-line text-4xl ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}></i>
                    </div>
                  )}
                </div>

                {/* Seller Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`text-2xl font-semibold ${
                      isDarkMode ? 'text-white' : 'text-gray-900'
                    }`}>
                      {getUserDisplayName()}
                    </span>
                    {userRating && userRating.reviewCount > 0 && (
                      <span className={`text-lg ${
                        isDarkMode ? 'text-gray-400' : 'text-gray-600'
                      }`}>
                        ({userRating.reviewCount})
                      </span>
                    )}
                  </div>
                  
                  {/* Rating & Feedback */}
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <div className="flex items-center gap-1">
                      {[1, 2, 3, 4, 5].map((star) => {
                        if (userRating && userRating.reviewCount > 0 && userRating.averageRating > 0) {
                          // Pentru rating mediu de 4.75: stelele 1-4 sunt pline, steaua 5 este jumătate
                          const fullStars = Math.floor(userRating.averageRating);
                          const hasHalfStar = userRating.averageRating % 1 >= 0.5 && star === fullStars + 1;
                          
                          if (star <= fullStars) {
                            // Stea completă
                            return (
                              <i
                                key={star}
                                className="text-base ri-star-fill text-yellow-400"
                              ></i>
                            );
                          } else if (hasHalfStar) {
                            // Stea jumătate (dacă rating-ul are zecimale >= 0.5)
                            return (
                              <i
                                key={star}
                                className="text-base ri-star-half-fill text-yellow-400"
                              ></i>
                            );
                          } else {
                            // Stea goală
                            return (
                              <i
                                key={star}
                                className="text-base ri-star-line text-gray-400"
                              ></i>
                            );
                          }
                        } else {
                          // Stele goale când nu există review-uri
                          return (
                            <i
                              key={star}
                              className="text-base ri-star-line text-gray-400"
                            ></i>
                          );
                        }
                      })}
                      {userRating && userRating.reviewCount > 0 && userRating.averageRating > 0 ? (
                        <span className={`text-sm ml-0.5 ${
                          isDarkMode ? 'text-gray-400' : 'text-gray-600'
                        }`}>
                          ({userRating.averageRating.toFixed(1)})
                        </span>
                      ) : null}
                    </div>
                    
                    {userRating && userRating.reviewCount > 0 && userRating.positivePercentage >= 0 ? (
                      <span className={`text-sm ${
                        isDarkMode ? 'text-gray-400' : 'text-gray-600'
                      }`}>
                        {userRating.positivePercentage.toFixed(1)}% pozitiv
                      </span>
                    ) : (
                      <span className={`text-sm ${
                        isDarkMode ? 'text-gray-400' : 'text-gray-600'
                      }`}>
                        N/A pozitiv
                      </span>
                    )}
                  </div>
                  
                </div>

                {/* QR Code - Desktop - Centrat după nume și rating */}
                <div className="flex-shrink-0">
                  <UserShopQrBadge userId={userId} pixelSize={80} />
                </div>
              </div>

              {/* Despre & Informații verificate - Desktop - Below profile info */}
              <div className="hidden sm:block mt-4">
                {/* Despre - Desktop - Locația deasupra separatorului */}
                {userLocation && (
                  <div className="mb-3 pb-3 border-b border-gray-300 dark:border-gray-600">
                    <div className="flex flex-wrap items-center gap-4 text-sm">
                      <div className={`flex items-center gap-1.5 ${
                        isDarkMode ? 'text-gray-400' : 'text-gray-600'
                      }`}>
                        <i className="ri-map-pin-line text-xs"></i>
                        <span>{userLocation}</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Separator cu informații și butoane sub el */}
                {(lastSignInAt || followersCount >= 0 || followingCount >= 0 || (currentUserId !== userId && (userLocation || !userLocation))) && (
                  <div className={`${userLocation ? 'pt-3' : 'mb-3 pb-3 border-b border-gray-300 dark:border-gray-600'} flex items-center justify-between gap-4`}>
                    {/* Ultima conectare și urmăritori în stânga */}
                    {(lastSignInAt || followersCount >= 0 || followingCount >= 0) && (
                      <div className={`flex items-center gap-2 flex-wrap text-sm ${
                        isDarkMode ? 'text-gray-400' : 'text-gray-600'
                      }`}>
                        {lastSignInAt && (
                          <span className="flex items-center gap-1.5">
                            <i className="ri-time-line text-xs"></i>
                            <span>
                              Ultima conectare {(() => {
                                const now = new Date();
                                const diffMs = now.getTime() - lastSignInAt.getTime();
                                const diffMins = Math.floor(diffMs / 60000);
                                const diffHours = Math.floor(diffMs / 3600000);
                                const diffDays = Math.floor(diffMs / 86400000);
                                
                                if (diffMins < 1) return 'acum';
                                if (diffMins < 60) return `acum ${diffMins} ${diffMins === 1 ? 'minut' : 'minute'}`;
                                if (diffHours < 24) return `acum ${diffHours} ${diffHours === 1 ? 'oră' : 'ore'}`;
                                if (diffDays === 1) return 'ieri';
                                if (diffDays < 7) return `acum ${diffDays} ${diffDays === 1 ? 'zi' : 'zile'}`;
                                return lastSignInAt.toLocaleDateString('ro-RO', { day: '2-digit', month: '2-digit', year: 'numeric' });
                              })()}
                            </span>
                          </span>
                        )}
                        {(followersCount >= 0 || followingCount >= 0) && (
                          <>
                            {lastSignInAt && <span className="text-gray-400 dark:text-gray-500">•</span>}
                            <span className="flex items-center gap-1.5 flex-wrap">
                              <i className="ri-user-line text-xs"></i>
                              <button
                                onClick={toggleFollowers}
                                className={`hover:underline cursor-pointer text-xs ${
                                  isDarkMode ? 'text-gray-400 hover:text-gray-300' : 'text-gray-600 hover:text-gray-900'
                                }`}
                                disabled={loadingFollowers}
                              >
                                {followersCount} {followersCount === 1 ? 'urmăritor' : 'urmăritori'}
                              </button>
                              <span className="text-gray-400 dark:text-gray-500 text-xs">,</span>
                              <button
                                onClick={toggleFollowing}
                                className={`hover:underline cursor-pointer text-xs ${
                                  isDarkMode ? 'text-gray-400 hover:text-gray-300' : 'text-gray-600 hover:text-gray-900'
                                }`}
                                disabled={loadingFollowing}
                              >
                                {followingCount} urmărește
                              </button>
                            </span>
                          </>
                        )}
                      </div>
                    )}

                    {/* Butoanele în dreapta */}
                    {currentUserId !== userId && (
                      <div className="flex flex-row gap-3 flex-shrink-0">
                        {/* Buton "Urmărește" */}
                        <div className="flex flex-col items-center gap-1">
                          <button
                            onClick={handleFollowUser}
                            disabled={followingUser}
                            className={`w-11 h-11 rounded-full transition-all duration-300 border-2 flex items-center justify-center ${
                              isFollowing
                                ? 'bg-blue-100 text-blue-600 border-blue-300 hover:bg-blue-200'
                                : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
                            } ${followingUser ? 'opacity-50 cursor-not-allowed' : 'hover:scale-110 hover:shadow-lg'}`}
                            title={isFollowing ? 'Nu mai urmări' : 'Urmărește'}
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill={isFollowing ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/>
                              <circle cx="9" cy="7" r="4"/>
                              <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>
                            </svg>
                          </button>
                          <span className="text-xs font-medium text-gray-600">{followersCount}</span>
                        </div>
                        {/* Buton "Like" */}
                        <div className="flex flex-col items-center gap-1">
                          <button
                            onClick={handleLike}
                            className={`w-11 h-11 rounded-full transition-all duration-300 border-2 flex items-center justify-center ${
                              hasLiked
                                ? 'bg-green-100 text-green-600 border-green-300 hover:bg-green-200'
                                : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
                            } hover:scale-110 hover:shadow-lg`}
                            title="Like"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill={hasLiked ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M7 10v12M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2h0a3.13 3.13 0 0 1 3 3.88Z"/>
                            </svg>
                          </button>
                          <span className="text-xs font-medium text-gray-600">{likeCount}</span>
                        </div>
                        {/* Buton "Dislike" */}
                        <div className="flex flex-col items-center gap-1">
                          <button
                            onClick={handleDislike}
                            className={`w-11 h-11 rounded-full transition-all duration-300 border-2 flex items-center justify-center ${
                              hasDisliked
                                ? 'bg-red-100 text-red-600 border-red-300 hover:bg-red-200'
                                : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
                            } hover:scale-110 hover:shadow-lg`}
                            title="Dislike"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill={hasDisliked ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ transform: 'rotate(180deg)' }}>
                              <path d="M7 10v12M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2h0a3.13 3.13 0 0 1 3 3.88Z"/>
                            </svg>
                          </button>
                          <span className="text-xs font-medium text-gray-600">{dislikeCount}</span>
                        </div>
                        {/* Buton "Contactează" */}
                        <div className="flex flex-col items-center gap-1">
                          <button
                            onClick={async () => {
                              if (!currentUserId) {
                                setAuthModalAction('contact');
                                setShowAuthModal(true);
                                return;
                              }
                              
                              try {
                                const { data: { session } } = await supabase.auth.getSession();
                                if (!session) {
                                  setErrorMessage('Sesiunea a expirat. Te rugăm să te autentifici din nou.');
                                  setShowErrorModal(true);
                                  return;
                                }

                                // Sortează UUID-urile pentru a respecta constraint-ul (user1_id < user2_id)
                                const [user1Id, user2Id] = [currentUserId, userId].sort();
                                console.log('Creating/finding user chat between:', { user1Id, user2Id });

                                // Creează sau găsește chat-ul direct între utilizatori
                                const { data: existingChat, error: findError } = await supabase
                                  .from('user_chats')
                                  .select('id')
                                  .eq('user1_id', user1Id)
                                  .eq('user2_id', user2Id)
                                  .maybeSingle();

                                if (findError) {
                                  console.error('Error finding existing chat:', findError);
                                  alert(`EROARE: Tabela user_chats nu există!\n\nTrebuie să aplici migrația SQL:\n1. Deschide Supabase Dashboard\n2. SQL Editor → New query\n3. Copiază tot din fișierul:\n   supabase/migrations/20260119_user_chats.sql\n4. Run (Ctrl+Enter)\n\nERROARE COMPLETĂ: ${JSON.stringify(findError)}`);
                                  return;
                                }

                                let chatId: string;

                                if (existingChat) {
                                  console.log('🔍 [CHAT MOBILE] Existing chat found:', existingChat.id);
                                  chatId = existingChat.id;
                                  
                                  // Verifică dacă chat-ul are deja mesaje
                                  const { count, error: countError } = await supabase
                                    .from('user_chat_messages')
                                    .select('*', { count: 'exact', head: true })
                                    .eq('chat_id', chatId);

                                  console.log('🔍 [CHAT MOBILE] Message count:', count, 'Error:', countError);

                                  if (count && count > 0) {
                                    console.log('✅ [CHAT MOBILE] Chat has messages, redirecting with unhide...');
                                    // Chat-ul are mesaje - redirect direct cu unhide pentru a-l restaura
                                    router.push(`/dashboard/ofertele_mele?userChatId=${chatId}&unhide=true`);
                                    return;
                                  }
                                  
                                  console.log('⚠️ [CHAT MOBILE] Chat has no messages, continuing with request...');
                                } else {
                                  console.log('No existing chat, creating new one');
                                  // Creează chat nou (upsert pentru a evita duplicate key errors)
                                  const { data: newChat, error: chatError } = await supabase
                                    .from('user_chats')
                                    .upsert({
                                      user1_id: user1Id,
                                      user2_id: user2Id
                                    }, {
                                      onConflict: 'user1_id,user2_id'
                                    })
                                    .select('id')
                                    .single();

                                  console.log('Upsert result:', { newChat, chatError });

                                  if (chatError) {
                                    console.error('Chat creation error:', chatError);
                                    setErrorMessage(`Eroare la crearea chat-ului: ${chatError.message || JSON.stringify(chatError)}`);
                                    setShowErrorModal(true);
                                    return;
                                  }

                                  if (!newChat) {
                                    console.error('No chat returned from upsert');
                                    setErrorMessage('Eroare la crearea chat-ului.');
                                    setShowErrorModal(true);
                                    return;
                                  }

                                  console.log('New chat created:', newChat.id);
                                  chatId = newChat.id;
                                }

                                // Salvează cererea în baza de date (fără product_id)
                                const { data: request } = await supabase
                                  .from('chat_requests')
                                  .upsert({
                                    sender_user_id: currentUserId,
                                    receiver_user_id: userId,
                                    product_id: null, // Nu mai este legat de un produs
                                    status: 'pending'
                                  }, {
                                    onConflict: 'sender_user_id,receiver_user_id,product_id'
                                  })
                                  .select()
                                  .single();

                                // Trimite mesaj automat în chat cu cererea
                                const senderName = userProfile?.first_name && userProfile?.last_name
                                  ? `${userProfile.first_name} ${userProfile.last_name}`
                                  : userProfile?.email || 'Un utilizator';

                                const { error: messageError } = await supabase
                                  .from('user_chat_messages')
                                  .insert({
                                    chat_id: chatId,
                                    sender_user_id: currentUserId,
                                    message_text: `${senderName} vrea să vorbească cu tine.`,
                                    is_system_message: true,
                                    metadata: {
                                      type: 'chat_request',
                                      requestId: request?.id,
                                      senderId: currentUserId,
                                      senderName: senderName
                                    }
                                  });

                                if (messageError) {
                                  console.error('Error creating message:', messageError);
                                  alert(`EROARE la crearea mesajului: ${messageError.message || JSON.stringify(messageError)}`);
                                  return;
                                }

                                console.log('✅ Chat request created successfully!', {
                                  chatId,
                                  requestId: request?.id,
                                  message: 'Chat request sent'
                                });

                                // Arată mesaj de success și redirecționează (cu parametri pentru a restaura chat-ul)
                                alert('✅ Cerere de chat trimisă cu succes!\n\nÎn curând vei putea vedea conversația pe pagina de oferte.');
                                router.push(`/dashboard/ofertele_mele?userChatId=${chatId}&unhide=true`);
                              } catch (error) {
                                console.error('Error sending chat request:', error);
                                setErrorMessage('Eroare la trimiterea cererii de chat.');
                                setShowErrorModal(true);
                              }
                            }}
                            className="w-11 h-11 rounded-full transition-all duration-300 border-2 flex items-center justify-center bg-white text-gray-600 border-gray-300 hover:bg-blue-50 hover:text-blue-600 hover:border-blue-300 hover:scale-110 hover:shadow-lg"
                            title="Contactează"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                            </svg>
                          </button>
                          <span className="text-xs font-medium text-gray-600">Chat</span>
                        </div>
                        {/* Buton "Salvează" */}
                        <div className="flex flex-col items-center gap-1">
                          <button
                            onClick={handleSaveUser}
                            disabled={savingUser}
                            className={`w-11 h-11 rounded-full transition-all duration-300 border-2 flex items-center justify-center ${
                              isUserFavorite
                                ? 'bg-pink-100 text-pink-600 border-pink-300 hover:bg-pink-200'
                                : 'bg-white text-gray-600 border-gray-300 hover:bg-pink-50 hover:text-pink-600 hover:border-pink-300'
                            } ${savingUser ? 'opacity-50 cursor-not-allowed' : 'hover:scale-110 hover:shadow-lg'}`}
                            title={isUserFavorite ? 'Salvat' : 'Salvează'}
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill={isUserFavorite ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>
                            </svg>
                          </button>
                          <span className="text-xs font-medium text-gray-600">{isUserFavorite ? 'Salvat' : 'Salvează'}</span>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Informații verificate - Desktop */}
                {verifiedInfo && (
                  <div className="hidden pt-3 border-t border-gray-300 dark:border-gray-600">
                    <div className="flex flex-wrap items-center gap-3">
                      {verifiedInfo.email && (
                        <div className="flex items-center gap-1.5">
                          <i className="ri-checkbox-circle-fill text-green-600 dark:text-green-400 text-sm"></i>
                          <span className={`text-xs ${
                            isDarkMode ? 'text-gray-300' : 'text-gray-700'
                          }`}>E-mail</span>
                        </div>
                      )}
                      {verifiedInfo.google && (
                        <div className="flex items-center gap-1.5">
                          <i className="ri-checkbox-circle-fill text-green-600 dark:text-green-400 text-sm"></i>
                          <span className={`text-xs ${
                            isDarkMode ? 'text-gray-300' : 'text-gray-700'
                          }`}>Google</span>
                        </div>
                      )}
                      {verifiedInfo.apple && (
                        <div className="flex items-center gap-1.5">
                          <i className="ri-checkbox-circle-fill text-green-600 dark:text-green-400 text-sm"></i>
                          <span className={`text-xs ${
                            isDarkMode ? 'text-gray-300' : 'text-gray-700'
                          }`}>Apple</span>
                        </div>
                      )}
                      {verifiedInfo.phone && (
                        <div className="flex items-center gap-1.5">
                          <i className="ri-checkbox-circle-fill text-green-600 dark:text-green-400 text-sm"></i>
                          <span className={`text-xs ${
                            isDarkMode ? 'text-gray-300' : 'text-gray-700'
                          }`}>Telefon</span>
                        </div>
                      )}
                      {verifiedInfo.cnp && (
                        <div className="flex items-center gap-1.5">
                          <i className="ri-checkbox-circle-fill text-green-600 dark:text-green-400 text-sm"></i>
                          <span className={`text-xs ${
                            isDarkMode ? 'text-gray-300' : 'text-gray-700'
                          }`}>CNP</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Detailed Seller Ratings */}
            {detailedRatings && userRating && userRating.reviewCount > 0 && (
              <div className={`rounded-lg border p-2 sm:p-6 ${
                isDarkMode 
                  ? 'bg-gray-800 border-gray-700' 
                  : 'bg-white border-gray-200 shadow-sm'
              }`}>
                <h2 className={`text-sm sm:text-lg font-bold mb-1 sm:mb-4 ${
                  isDarkMode ? 'text-white' : 'text-gray-900'
                }`}>
                  Rating-uri detaliate vânzător
                </h2>
                <p className={`text-xs sm:text-sm mb-2 sm:mb-4 ${
                  isDarkMode ? 'text-gray-400' : 'text-gray-600'
                }`}>
                  Media pentru ultimele 12 luni
                </p>
                
                <div className="space-y-2 sm:space-y-4">
                  {[
                    { label: 'Comportament / Atitudine', value: detailedRatings.comportament },
                    { label: 'De încredere', value: detailedRatings.deIncredere },
                    { label: 'Comunicare', value: detailedRatings.comunicare },
                    { label: 'Experiență generală', value: detailedRatings.experientaGenerala },
                  ].map((item, index) => (
                    <div key={index}>
                      <div className="flex items-center justify-between mb-0.5 sm:mb-1">
                        <span className={`text-xs sm:text-sm ${
                          isDarkMode ? 'text-gray-300' : 'text-gray-700'
                        }`}>
                          {item.label}
                        </span>
                        <span className={`text-xs sm:text-sm font-semibold ${
                          isDarkMode ? 'text-white' : 'text-gray-900'
                        }`}>
                          {item.value.toFixed(1)}
                        </span>
                      </div>
                      <div className={`h-1.5 sm:h-2 rounded-full overflow-hidden ${
                        isDarkMode ? 'bg-gray-700' : 'bg-gray-200'
                      }`}>
                        <div 
                          className={`h-full transition-all ${
                            item.value >= 4.5 ? 'bg-green-500' :
                            item.value >= 4 ? 'bg-yellow-500' :
                            'bg-orange-500'
                          }`}
                          style={{ width: getRatingBarWidth(item.value) }}
                        ></div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Popular Categories */}
            {categories.length > 0 && (
              <div className={`rounded-lg border p-2 sm:p-6 ${
                isDarkMode 
                  ? 'bg-gray-800 border-gray-700' 
                  : 'bg-white border-gray-200 shadow-sm'
              }`}>
                <div className="flex items-center justify-between mb-2 sm:mb-4">
                  <h2 className={`text-xs sm:text-lg font-bold ${
                    isDarkMode ? 'text-white' : 'text-gray-900'
                  }`}>
                    Categorii populare din acest magazin
                  </h2>
                  <button 
                    onClick={() => setSelectedCategory(null)}
                    className={`px-2 py-1 sm:px-4 sm:py-2 rounded-lg text-xs sm:text-sm font-medium transition-all whitespace-nowrap ${
                      isDarkMode
                        ? 'bg-blue-600 hover:bg-blue-700 text-white'
                        : 'bg-blue-500 hover:bg-blue-600 text-white'
                    }`}
                  >
                    Vezi toate produsele
                  </button>
                </div>
                <div className="flex flex-wrap gap-1 sm:gap-2">
                  <button
                    onClick={() => setSelectedCategory(null)}
                    className={`px-2 py-0.5 sm:px-3 sm:py-1.5 rounded-full text-xs sm:text-sm transition-all cursor-pointer ${
                      selectedCategory === null
                        ? isDarkMode
                          ? 'bg-blue-600 text-white'
                          : 'bg-blue-500 text-white'
                        : isDarkMode
                          ? 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    Toate
                  </button>
                  {categories.map((category, index) => (
                    <button
                      key={index}
                      onClick={() => setSelectedCategory(category)}
                      className={`px-2 py-0.5 sm:px-3 sm:py-1.5 rounded-full text-xs sm:text-sm transition-all cursor-pointer ${
                        selectedCategory === category
                          ? isDarkMode
                            ? 'bg-blue-600 text-white'
                            : 'bg-blue-500 text-white'
                          : isDarkMode
                            ? 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      {category}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Products Grid */}
            <div>
              <div className="flex flex-col gap-3 mb-4">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <h2 className={`text-xl sm:text-2xl font-bold ${
                      isDarkMode ? 'text-white' : 'text-gray-900'
                    }`}>
                      Produse
                    </h2>
                    <span className={`inline-flex items-center justify-center px-3 py-1 rounded-full text-sm font-semibold ${
                      isDarkMode 
                        ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30' 
                        : 'bg-blue-500/10 text-blue-600 border border-blue-500/20'
                    }`}>
                      {filteredShopProducts.length} articole
                    </span>
                  </div>
                
                {/* Filtrele de sortare - ca în poză */}
                {products.length > 0 && (
                  <div className="flex flex-wrap items-center gap-2">
                    {/* Categorie dropdown */}
                    <div className="relative">
                      <select
                        value={selectedCategory || 'all'}
                        onChange={(e) => setSelectedCategory(e.target.value === 'all' ? null : e.target.value)}
                        className={`px-3 py-1.5 rounded-lg text-sm border cursor-pointer appearance-none pr-8 ${
                          isDarkMode
                            ? 'bg-gray-800 border-gray-600 text-gray-300 hover:bg-gray-700'
                            : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
                        }`}
                      >
                        <option value="all">Categorie</option>
                        {categories.map((category, index) => (
                          <option key={index} value={category}>{category}</option>
                        ))}
                      </select>
                      <i className={`ri-arrow-down-s-line absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none ${
                        isDarkMode ? 'text-gray-400' : 'text-gray-600'
                      }`}></i>
                    </div>
                    
                    {/* Toate dropdown */}
                    <div className="relative">
                      <select
                        className={`px-3 py-1.5 rounded-lg text-sm border cursor-pointer appearance-none pr-8 ${
                          isDarkMode
                            ? 'bg-gray-800 border-gray-600 text-gray-300 hover:bg-gray-700'
                            : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
                        }`}
                        defaultValue="all"
                      >
                        <option value="all">Toate</option>
                      </select>
                      <i className={`ri-arrow-down-s-line absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none ${
                        isDarkMode ? 'text-gray-400' : 'text-gray-600'
                      }`}></i>
                    </div>
                    
                    {/* Sortare după dropdown */}
                    <div className="relative">
                      <select
                        value={sortBy}
                        onChange={(e) => setSortBy(e.target.value)}
                        className={`px-3 py-1.5 rounded-lg text-sm border cursor-pointer appearance-none pr-8 ${
                          isDarkMode
                            ? 'bg-gray-800 border-gray-600 text-gray-300 hover:bg-gray-700'
                            : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
                        }`}
                      >
                        <option value="relevance">Sortare după</option>
                        <option value="relevance">Relevanță</option>
                        <option value="price-asc">Preț crescător</option>
                        <option value="price-desc">Preț descrescător</option>
                        <option value="newest">Cel mai recent</option>
                        <option value="oldest">Cel mai vechi</option>
                      </select>
                      <i className={`ri-arrow-down-s-line absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none ${
                        isDarkMode ? 'text-gray-400' : 'text-gray-600'
                      }`}></i>
                    </div>
                  </div>
                )}
                </div>

                {products.length > 0 && (
                  <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
                    <div className="relative flex-1 min-w-0">
                      <i
                        className={`ri-search-line pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-lg ${
                          isDarkMode ? "text-gray-500" : "text-gray-400"
                        }`}
                        aria-hidden
                      />
                      <input
                        type="search"
                        value={shopSearchQuery}
                        onChange={(e) => setShopSearchQuery(e.target.value)}
                        onFocus={() => setShopSearchInputFocused(true)}
                        onBlur={() => setShopSearchInputFocused(false)}
                        placeholder=""
                        aria-label={SHOP_SEARCH_TYPING_PLACEHOLDER_FULL}
                        autoComplete="off"
                        className={`w-full rounded-xl border py-2.5 pl-10 pr-3 text-sm outline-none ring-offset-2 focus:ring-2 ${
                          isDarkMode
                            ? "border-gray-600 bg-gray-800/90 text-white ring-offset-gray-900 placeholder:text-gray-500 focus:ring-blue-500"
                            : "border-gray-200 bg-white text-gray-900 ring-offset-white placeholder:text-gray-400 focus:ring-blue-500"
                        }`}
                      />
                      {shopSearchQuery === "" && !shopSearchInputFocused ? (
                        <span
                          className={`pointer-events-none absolute left-10 top-1/2 max-w-[calc(100%-2.5rem)] -translate-y-1/2 truncate text-left text-sm ${
                            isDarkMode ? "text-gray-500" : "text-gray-400"
                          }`}
                          aria-hidden
                        >
                          {SHOP_SEARCH_TYPING_PLACEHOLDER_FULL.slice(
                            0,
                            shopSearchTypingPlaceholderLen,
                          )}
                          <span
                            className={`ml-px inline-block min-h-[1em] w-px align-middle ${
                              isDarkMode ? "bg-gray-400" : "bg-gray-500"
                            } animate-pulse`}
                            aria-hidden
                          />
                        </span>
                      ) : null}
                    </div>
                    {isDealerPieseAuto && dealerMarcaOptions.length > 0 ? (
                      <div className="relative shrink-0 sm:min-w-[11rem]">
                        <select
                          value={selectedShopMarca}
                          onChange={(e) => setSelectedShopMarca(e.target.value)}
                          aria-label="Marcă piese auto"
                          className={`w-full appearance-none rounded-xl border px-3 py-2.5 pr-9 text-sm cursor-pointer sm:w-auto ${
                            isDarkMode
                              ? "border-gray-600 bg-gray-800 text-gray-200"
                              : "border-gray-200 bg-white text-gray-800"
                          }`}
                        >
                          <option value="">Toate mărcile</option>
                          {dealerMarcaOptions.map((m) => (
                            <option key={m} value={m}>
                              {m}
                            </option>
                          ))}
                        </select>
                        <i
                          className={`ri-arrow-down-s-line pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 ${
                            isDarkMode ? "text-gray-400" : "text-gray-500"
                          }`}
                          aria-hidden
                        />
                      </div>
                    ) : null}
                  </div>
                )}
              </div>
              
              {products.length === 0 ? (
                <div className={`text-center py-20 rounded-lg border ${
                  isDarkMode 
                    ? 'bg-gray-800 border-gray-700 text-gray-400' 
                    : 'bg-white border-gray-200 text-gray-600'
                }`}>
                  <i className="ri-inbox-line text-6xl mb-4"></i>
                  <p className="text-lg">Nu există produse active.</p>
                </div>
              ) : filteredShopProducts.length === 0 ? (
                <div className={`text-center py-16 rounded-lg border ${
                  isDarkMode ? "bg-gray-800 border-gray-700 text-gray-300" : "bg-white border-gray-200 text-gray-600"
                }`}>
                  <i className="ri-search-line mb-3 text-5xl opacity-60" aria-hidden />
                  <p className="text-lg font-medium">Niciun anunț nu corespunde filtrelor.</p>
                  <p className={`mt-1 text-sm ${isDarkMode ? "text-gray-500" : "text-gray-500"}`}>
                    Încearcă alt termen sau altă marcă.
                  </p>
                </div>
              ) : (
                <>
                  <div className={`grid grid-cols-2 lg:grid-cols-3 gap-1.5 md:gap-2 lg:gap-3`}>
                    {sortedShopProducts.slice(0, displayedProductsCount).map((product: Product) => (
                      <div 
                        key={product.id} 
                        className={`backdrop-blur-lg rounded-xl shadow-xl overflow-hidden transition-all duration-300 border hover:shadow-2xl hover:scale-105 ${
                          isDarkMode 
                            ? 'bg-white/10 border-white/20' 
                            : 'bg-white border-gray-200'
                        }`}
                      >
                      {/* Image */}
                      <div 
                        onClick={() => router.push(getProductUrl(product))}
                        className="relative bg-cover bg-center h-32 sm:h-40 md:h-64 cursor-pointer overflow-hidden"
                        style={{backgroundImage: `url(${getProductDisplayImage(product)})`}}
                      >
                        <PieseAutoMarcaCornerBadge listing={product} />
                        {/* Favorite Button */}
                        <div className="absolute top-1 right-1 md:top-2 md:right-2 z-10">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleToggleFavorite(product.id, e);
                            }}
                            className="p-1 sm:p-1.5 md:p-1 transition-all duration-300 transform hover:scale-110"
                            title={isProductFavorite(product.id) ? 'Elimină din favorite' : 'Adaugă la favorite'}
                          >
                            <HeartIcon size="l" className={isProductFavorite(product.id) ? 'text-red-600 fill-red-600 drop-shadow-2xl' : 'text-red-500 drop-shadow-2xl'} strokeWidth={2} />
                          </button>
                        </div>
                        {/* Badge diagonal VÂNDUT / REZERVAT */}
                        {((product as any).status === 'sold' || (product as any).status === 'reserved') && (
                          <div className="pointer-events-none absolute inset-0 flex items-center justify-center z-5">
                            <div
                              className={`absolute left-1/2 top-1/2 transform -translate-x-1/2 -translate-y-1/2 -rotate-45 w-[175%] text-center px-4 py-1 border-[6px] rounded-sm uppercase tracking-widest font-black leading-none text-lg md:text-2xl ${
                                (product as any).status === 'sold'
                                  ? 'border-emerald-600 text-emerald-600 bg-transparent'
                                  : 'border-amber-500 text-amber-600 bg-transparent'
                              }`}
                            >
                              {(product as any).status === 'sold' ? 'VÂNDUT' : 'REZERVAT'}
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Content */}
                      <div className="p-1.5 sm:p-2 md:p-3">
                        <div className="mb-2 sm:mb-2.5">
                          <h3 
                            className={`text-xs sm:text-sm md:text-base font-semibold transition-colors ${isDarkMode ? 'text-white' : 'text-gray-900'} line-clamp-1 cursor-pointer hover:text-blue-600`} 
                            title={product.title}
                            onClick={() => router.push(getProductUrl(product))}
                          >
                            {product.title}
                          </h3>
                          {(() => {
                            const stareLabel = resolveProductConditionLabel(product);
                            const kind: ProductConditionKind =
                              stareLabel === "Nou" ? "nou" : stareLabel === "Uzat" ? "uzat" : "na";
                            return (
                              <div className="mt-1">
                                <ProductConditionBadge kind={kind} isDarkMode={isDarkMode} />
                              </div>
                            );
                          })()}
                        </div>

                        {/* Location - Mobile visible */}
                        <div className="mb-1 sm:mb-1.5 space-y-0.5">
                          {product.city && (
                            <div className={`text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                              {product.city}
                            </div>
                          )}
                        </div>

                        {/* Price and Category - Mobile (Preț propus: and Category) */}
                        <div className="mb-1.5 sm:mb-2 md:hidden space-y-1">
                          <div className={`text-xs ${isDarkMode ? 'text-white' : 'text-gray-900'} flex items-center gap-1`}>
                            <span className="relative group cursor-help">
                              Preț propus:
                              <span className={`absolute bottom-full left-0 mb-2 px-2 py-1 rounded text-[10px] whitespace-nowrap opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 pointer-events-none z-50 max-w-[200px] ${
                                isDarkMode 
                                  ? 'bg-gray-800 text-gray-200 border border-gray-700 shadow-lg' 
                                  : 'bg-gray-900 text-white shadow-xl'
                              }`}>
                                Prețul inițial propus de vânzător
                                <span className={`absolute top-full left-3 -mt-1 border-4 border-transparent ${
                                  isDarkMode ? 'border-t-gray-800' : 'border-t-gray-900'
                                }`}></span>
                              </span>
                            </span>
                            <span className="font-semibold">{formatPrice(
                              product.currency === 'EUR' ? product.starting_price_eur : product.starting_price_ron,
                              product.currency
                            )}</span>
                          </div>
                          {product.category && (
                            <div className={`text-xs ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                              Categorie: <span className="font-semibold">{product.category}</span>
                            </div>
                          )}
                        </div>

                        {/* Always visible content - Desktop only */}
                        <div className="space-y-0.5 mb-1 md:mb-1.5 hidden md:block">
                          <div className="flex items-center gap-1.5">
                            <span className={`text-xs transition-colors ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>Preț:</span>
                            <span className={`text-xs md:text-sm font-semibold transition-colors ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                              {formatPrice(
                                product.currency === 'EUR' ? product.starting_price_eur : product.starting_price_ron,
                                product.currency
                              )}
                            </span>
                          </div>
                          {product.category && (
                            <div className="flex items-center gap-1.5">
                              <span className={`text-xs transition-colors ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>Categorie:</span>
                              <span className={`text-xs md:text-sm font-semibold transition-colors ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                                {product.category}
                              </span>
                            </div>
                          )}
                        </div>

                        {/* Data creare/actualizare */}
                        <div className="mb-1.5 sm:mb-2 md:mb-1.5">
                          {(() => {
                            const dateToShow = product.updated_at || product.created_at;
                            if (dateToShow) {
                              const date = new Date(dateToShow);
                              const isUpdated = product.updated_at && product.updated_at !== product.created_at;
                              const formattedDate = date.toLocaleDateString('ro-RO', { 
                                day: 'numeric', 
                                month: 'long', 
                                year: 'numeric' 
                              });
                              return (
                                <p className={`text-[9px] sm:text-[10px] transition-colors ${isDarkMode ? 'text-gray-500' : 'text-gray-500'}`}>
                                  {isUpdated ? 'Actualizat' : 'Creat'} pe {formattedDate}
                                </p>
                              );
                            }
                            return null;
                          })()}
                        </div>

                      </div>
                      </div>
                    ))}
                  </div>
                  {/* Loading More Indicator */}
                  {(() => {
                    const hasMore = displayedProductsCount < sortedShopProducts.length;

                    if (hasMore || loadingMore) {
                      return (
                        <div className="flex justify-center items-center py-6 mt-4">
                          {loadingMore ? (
                            <div className="flex items-center gap-2">
                              <div className={`animate-spin rounded-full h-6 w-6 border-b-2 ${
                                isDarkMode ? 'border-white' : 'border-gray-900'
                              }`}></div>
                              <span className={`text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                                Se încarcă...
                              </span>
                            </div>
                          ) : (
                            <span className={`text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                              Scroll pentru mai multe produse...
                            </span>
                          )}
                        </div>
                      );
                    }
                    return null;
                  })()}
                </>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Contact Modal */}
      {showContactModal && (
        <>
          {/* Backdrop */}
          <div 
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50"
            onClick={() => {
              setShowContactModal(false);
              setContactMessage('');
              setContactError(null);
              setContactSuccess(false);
            }}
          ></div>
          
          {/* Modal */}
          <div className={`fixed inset-0 z-50 flex items-center justify-center p-4 ${
            isDarkMode ? '' : ''
          }`}>
            <div 
              className={`relative w-full max-w-md rounded-2xl shadow-2xl ${
                isDarkMode 
                  ? 'bg-gray-800 border border-gray-700' 
                  : 'bg-white border border-gray-200'
              }`}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className={`flex items-center justify-between p-6 border-b ${
                isDarkMode ? 'border-gray-700' : 'border-gray-200'
              }`}>
                <h2 className={`text-xl font-bold ${
                  isDarkMode ? 'text-white' : 'text-gray-900'
                }`}>
                  Contactează {getUserDisplayName()}
                </h2>
                <button
                  onClick={() => {
                    setShowContactModal(false);
                    setContactMessage('');
                    setContactError(null);
                    setContactSuccess(false);
                  }}
                  className={`p-2 rounded-lg transition-all ${
                    isDarkMode 
                      ? 'hover:bg-gray-700 text-gray-400 hover:text-white' 
                      : 'hover:bg-gray-100 text-gray-600 hover:text-gray-900'
                  }`}
                >
                  <i className="ri-close-line text-xl"></i>
                </button>
              </div>

              {/* Content */}
              <div className="p-6">
                {!currentUserId ? (
                  /* Not Authenticated */
                  <div className="text-center py-8">
                    <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 ${
                      isDarkMode ? 'bg-gray-700' : 'bg-gray-100'
                    }`}>
                      <i className={`ri-lock-line text-3xl ${
                        isDarkMode ? 'text-gray-400' : 'text-gray-600'
                      }`}></i>
                    </div>
                    <h3 className={`text-lg font-semibold mb-2 ${
                      isDarkMode ? 'text-white' : 'text-gray-900'
                    }`}>
                      Autentificare necesară
                    </h3>
                    <p className={`text-sm mb-6 ${
                      isDarkMode ? 'text-gray-400' : 'text-gray-600'
                    }`}>
                      Trebuie să te conectezi sau să creezi un cont pentru a trimite un mesaj.
                    </p>
                    <div className="flex flex-col sm:flex-row gap-3">
                      <button
                        onClick={() => router.push('/auth?mode=login')}
                        className={`flex-1 px-4 py-3 rounded-lg font-medium transition-all ${
                          isDarkMode
                            ? 'bg-blue-600 hover:bg-blue-700 text-white'
                            : 'bg-blue-500 hover:bg-blue-600 text-white'
                        }`}
                      >
                        Conectează-te
                      </button>
                      <button
                        onClick={() => router.push('/auth?mode=register')}
                        className={`flex-1 px-4 py-3 rounded-lg font-medium transition-all border ${
                          isDarkMode
                            ? 'bg-transparent hover:bg-gray-700 text-white border-gray-600'
                            : 'bg-white hover:bg-gray-50 text-gray-900 border-gray-300'
                        }`}
                      >
                        Creează cont
                      </button>
                    </div>
                  </div>
                ) : contactSuccess ? (
                  /* Success Message */
                  <div className="text-center py-8">
                    <div className="w-16 h-16 rounded-full bg-green-500 flex items-center justify-center mx-auto mb-4">
                      <i className="ri-check-line text-3xl text-white"></i>
                    </div>
                    <h3 className={`text-lg font-semibold mb-2 ${
                      isDarkMode ? 'text-white' : 'text-gray-900'
                    }`}>
                      Mesaj trimis!
                    </h3>
                    <p className={`text-sm ${
                      isDarkMode ? 'text-gray-400' : 'text-gray-600'
                    }`}>
                      Mesajul tău a fost trimis cu succes.
                    </p>
                  </div>
                ) : (
                  /* Message Form */
                  <>
                    <div className="mb-4">
                      <label className={`block text-sm font-medium mb-2 ${
                        isDarkMode ? 'text-gray-300' : 'text-gray-700'
                      }`}>
                        Mesajul tău
                      </label>
                      <textarea
                        value={contactMessage}
                        onChange={(e) => setContactMessage(e.target.value)}
                        placeholder="Scrie mesajul tău aici..."
                        rows={6}
                        className={`w-full px-4 py-3 rounded-lg border resize-none ${
                          isDarkMode
                            ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20'
                            : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20'
                        }`}
                      ></textarea>
                    </div>

                    {contactError && (
                      <div className={`mb-4 p-3 rounded-lg ${
                        isDarkMode 
                          ? 'bg-red-900/30 border border-red-800 text-red-400' 
                          : 'bg-red-50 border border-red-200 text-red-700'
                      }`}>
                        <p className="text-sm">{contactError}</p>
                      </div>
                    )}

                    <div className="flex gap-3">
                      <button
                        onClick={() => {
                          setShowContactModal(false);
                          setContactMessage('');
                          setContactError(null);
                        }}
                        className={`flex-1 px-4 py-3 rounded-lg font-medium transition-all border ${
                          isDarkMode
                            ? 'bg-transparent hover:bg-gray-700 text-white border-gray-600'
                            : 'bg-white hover:bg-gray-50 text-gray-900 border-gray-300'
                        }`}
                      >
                        Anulează
                      </button>
                      <button
                        onClick={handleSendMessage}
                        disabled={sendingMessage || !contactMessage.trim()}
                        className={`flex-1 px-4 py-3 rounded-lg font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
                          isDarkMode
                            ? 'bg-blue-600 hover:bg-blue-700 text-white'
                            : 'bg-blue-500 hover:bg-blue-600 text-white'
                        }`}
                      >
                        {sendingMessage ? (
                          <span className="flex items-center justify-center gap-2">
                            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                            Se trimite...
                          </span>
                        ) : (
                          'Trimite mesaj'
                        )}
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </>
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
          itemType="product"
          isDarkMode={isDarkMode}
          onSuccess={handleFavoriteModalSuccess}
        />
      )}

      {/* Error Modal */}
      {showErrorModal && (
        <>
          {/* Backdrop */}
          <div 
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50"
            onClick={() => {
              setShowErrorModal(false);
              setErrorMessage('');
            }}
          ></div>
          
          {/* Modal */}
          <div className={`fixed inset-0 z-50 flex items-center justify-center p-4 ${
            isDarkMode ? '' : ''
          }`}>
            <div 
              className={`relative w-full max-w-md rounded-2xl shadow-2xl ${
                isDarkMode 
                  ? 'bg-gray-800 border border-gray-700' 
                  : 'bg-white border border-gray-200'
              }`}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className={`flex items-center justify-between p-4 sm:p-6 border-b ${
                isDarkMode ? 'border-gray-700' : 'border-gray-200'
              }`}>
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                    isDarkMode ? 'bg-red-500/20' : 'bg-red-100'
                  }`}>
                    <i className={`ri-error-warning-line text-xl ${
                      isDarkMode ? 'text-red-400' : 'text-red-600'
                    }`}></i>
                  </div>
                  <h2 className={`text-lg sm:text-xl font-bold ${
                    isDarkMode ? 'text-white' : 'text-gray-900'
                  }`}>
                    Eroare
                  </h2>
                </div>
                <button
                  onClick={() => {
                    setShowErrorModal(false);
                    setErrorMessage('');
                  }}
                  className={`p-2 rounded-lg transition-colors ${
                    isDarkMode 
                      ? 'hover:bg-gray-700 text-gray-400 hover:text-white' 
                      : 'hover:bg-gray-100 text-gray-500 hover:text-gray-900'
                  }`}
                >
                  <i className="ri-close-line text-xl"></i>
                </button>
              </div>

              {/* Content */}
              <div className="p-4 sm:p-6">
                <p className={`text-sm sm:text-base whitespace-pre-line ${
                  isDarkMode ? 'text-gray-300' : 'text-gray-700'
                }`}>
                  {errorMessage}
                </p>
              </div>

              {/* Footer */}
              <div className={`flex justify-end gap-3 p-4 sm:p-6 border-t ${
                isDarkMode ? 'border-gray-700' : 'border-gray-200'
              }`}>
                <button
                  onClick={() => {
                    setShowErrorModal(false);
                    setErrorMessage('');
                  }}
                  className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                    isDarkMode
                      ? 'bg-gray-700 hover:bg-gray-600 text-white'
                      : 'bg-gray-100 hover:bg-gray-200 text-gray-900'
                  }`}
                >
                  Închide
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Authentication Modal */}
      {showAuthModal && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          onClick={() => {
            setShowAuthModal(false);
          }}
        >
          {/* Backdrop */}
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm"></div>
          
          {/* Modal */}
          <div 
            className={`relative w-full max-w-md rounded-2xl shadow-2xl z-10 ${
              isDarkMode 
                ? 'bg-gray-800 border border-gray-700' 
                : 'bg-white border border-gray-200'
            }`}
            onClick={(e) => e.stopPropagation()}
          >
              {/* Header */}
              <div className={`flex items-center justify-between p-6 border-b ${
                isDarkMode ? 'border-gray-700' : 'border-gray-200'
              }`}>
                <h2 className={`text-xl font-bold ${
                  isDarkMode ? 'text-white' : 'text-gray-900'
                }`}>
                  Autentificare necesară
                </h2>
                <button
                  onClick={() => {
                    setShowAuthModal(false);
                  }}
                  className={`p-2 rounded-lg transition-all ${
                    isDarkMode 
                      ? 'hover:bg-gray-700 text-gray-400 hover:text-white' 
                      : 'hover:bg-gray-100 text-gray-600 hover:text-gray-900'
                  }`}
                >
                  <i className="ri-close-line text-xl"></i>
                </button>
              </div>

              {/* Content */}
              <div className="p-6">
                <div className="text-center py-4">
                  <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 ${
                    isDarkMode ? 'bg-gray-700' : 'bg-gray-100'
                  }`}>
                    <i className={`ri-lock-line text-3xl ${
                      isDarkMode ? 'text-gray-400' : 'text-gray-600'
                    }`}></i>
                  </div>
                  <h3 className={`text-lg font-semibold mb-2 ${
                    isDarkMode ? 'text-white' : 'text-gray-900'
                  }`}>
                    {authModalAction === 'follow' && 'Urmărește utilizatorul'}
                    {authModalAction === 'save' && 'Salvează utilizatorul'}
                    {authModalAction === 'contact' && 'Contactează utilizatorul'}
                  </h3>
                  <p className={`text-sm mb-6 ${
                    isDarkMode ? 'text-gray-400' : 'text-gray-600'
                  }`}>
                    {authModalAction === 'follow' && 'Trebuie să te conectezi sau să creezi un cont pentru a urmări utilizatori.'}
                    {authModalAction === 'save' && 'Trebuie să te conectezi sau să creezi un cont pentru a salva utilizatori la favorite.'}
                    {authModalAction === 'contact' && 'Trebuie să te conectezi sau să creezi un cont pentru a contacta utilizatorul.'}
                  </p>
                  <div className="flex flex-col sm:flex-row gap-3">
                    <button
                      onClick={() => router.push('/auth?mode=login')}
                      className={`flex-1 px-4 py-3 rounded-lg font-medium transition-all ${
                        isDarkMode
                          ? 'bg-blue-600 hover:bg-blue-700 text-white'
                          : 'bg-blue-500 hover:bg-blue-600 text-white'
                      }`}
                    >
                      Conectează-te
                    </button>
                    <button
                      onClick={() => router.push('/auth?mode=register')}
                      className={`flex-1 px-4 py-3 rounded-lg font-medium transition-all border ${
                        isDarkMode
                          ? 'bg-transparent hover:bg-gray-700 text-white border-gray-600'
                          : 'bg-white hover:bg-gray-50 text-gray-900 border-gray-300'
                      }`}
                    >
                      Creează cont
                    </button>
                  </div>
                </div>
              </div>
            </div>
        </div>
      )}

      {/* Followers Modal */}
      {showFollowers && (
        <>
          {/* Backdrop */}
          <div 
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50"
            onClick={() => {
              setShowFollowers(false);
            }}
          ></div>
          
          {/* Modal */}
          <div className={`fixed inset-0 z-50 flex items-center justify-center p-4 ${
            isDarkMode ? '' : ''
          }`}>
            <div 
              className={`relative w-full max-w-md rounded-2xl shadow-2xl max-h-[80vh] flex flex-col ${
                isDarkMode 
                  ? 'bg-gray-800 border border-gray-700' 
                  : 'bg-white border border-gray-200'
              }`}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className={`flex items-center justify-between p-4 sm:p-6 border-b ${
                isDarkMode ? 'border-gray-700' : 'border-gray-200'
              }`}>
                <h2 className={`text-lg sm:text-xl font-bold ${
                  isDarkMode ? 'text-white' : 'text-gray-900'
                }`}>
                  Urmăritori ({followersCount})
                </h2>
                <button
                  onClick={() => setShowFollowers(false)}
                  className={`p-2 rounded-lg transition-colors ${
                    isDarkMode 
                      ? 'hover:bg-gray-700 text-gray-400 hover:text-white' 
                      : 'hover:bg-gray-100 text-gray-500 hover:text-gray-900'
                  }`}
                >
                  <i className="ri-close-line text-xl"></i>
                </button>
              </div>

              {/* Content - Scrollable list */}
              <div className="flex-1 overflow-y-auto p-4 sm:p-6">
                {loadingFollowers ? (
                  <div className="flex items-center justify-center py-8">
                    <div className={`text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                      Se încarcă...
                    </div>
                  </div>
                ) : followers.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-8">
                    <i className={`ri-user-line text-4xl mb-2 ${
                      isDarkMode ? 'text-gray-600' : 'text-gray-400'
                    }`}></i>
                    <p className={`text-sm ${
                      isDarkMode ? 'text-gray-400' : 'text-gray-600'
                    }`}>
                      Nu există urmăritori
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2 sm:space-y-4">
                    {followers.map((follower) => {
                      const followerDisplayName = follower.firstName && follower.lastName
                        ? `${follower.firstName} ${follower.lastName}`
                        : follower.email?.split('@')[0] || 'Utilizator fără nume';
                      
                      return (
                        <div
                          key={follower.id}
                          className={`rounded-lg border p-3 ${
                            isDarkMode 
                              ? 'bg-gray-800 border-gray-700 hover:border-gray-600' 
                              : 'bg-white border-gray-200 hover:border-gray-300'
                          } transition-all`}
                        >
                          {/* Mobile Layout */}
                          <div className="flex sm:hidden items-center gap-3">
                            {/* Avatar */}
                            <div className="relative flex-shrink-0">
                              {follower.avatarUrl ? (
                                <img 
                                  src={follower.avatarUrl} 
                                  alt={followerDisplayName}
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
                            
                            {/* User Info */}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <Link
                                  href={`/user/${follower.id}`}
                                  onClick={() => setShowFollowers(false)}
                                  className={`text-sm font-semibold truncate hover:underline ${
                                    isDarkMode ? 'text-white' : 'text-gray-900'
                                  }`}
                                >
                                  {followerDisplayName}
                                </Link>
                                {follower.reviewCount && follower.reviewCount > 0 && (
                                  <span className={`text-xs ${
                                    isDarkMode ? 'text-gray-400' : 'text-gray-600'
                                  }`}>
                                    ({follower.reviewCount})
                                  </span>
                                )}
                              </div>
                              
                              {/* Rating & Feedback */}
                              <div className="flex items-center gap-2 flex-wrap">
                                <div className="flex items-center gap-1">
                                  {[1, 2, 3, 4, 5].map((star) => {
                                    if (follower.rating && follower.reviewCount && follower.reviewCount > 0) {
                                      const fullStars = Math.floor(follower.rating);
                                      const hasHalfStar = (follower.rating % 1 >= 0.5) && star === fullStars + 1;
                                      
                                      if (star <= fullStars) {
                                        return (
                                          <i
                                            key={star}
                                            className="text-xs ri-star-fill text-yellow-400"
                                          ></i>
                                        );
                                      } else if (hasHalfStar) {
                                        return (
                                          <i
                                            key={star}
                                            className="text-xs ri-star-half-fill text-yellow-400"
                                          ></i>
                                        );
                                      } else {
                                        return (
                                          <i
                                            key={star}
                                            className="text-xs ri-star-line text-gray-400"
                                          ></i>
                                        );
                                      }
                                    } else {
                                      // Stele goale când nu există review-uri
                                      return (
                                        <i
                                          key={star}
                                          className="text-xs ri-star-line text-gray-400"
                                        ></i>
                                      );
                                    }
                                  })}
                                  {follower.rating && follower.reviewCount && follower.reviewCount > 0 ? (
                                    <span className={`text-xs ml-0.5 ${
                                      isDarkMode ? 'text-gray-400' : 'text-gray-600'
                                    }`}>
                                      ({follower.rating.toFixed(1)})
                                    </span>
                                  ) : null}
                                </div>
                                
                                {follower.rating && follower.reviewCount && follower.reviewCount > 0 && follower.positivePercentage !== undefined && follower.positivePercentage >= 0 ? (
                                  <span className={`text-xs ${
                                    isDarkMode ? 'text-gray-400' : 'text-gray-600'
                                  }`}>
                                    {follower.positivePercentage.toFixed(1)}% pozitiv
                                  </span>
                                ) : (
                                  <span className={`text-xs ${
                                    isDarkMode ? 'text-gray-400' : 'text-gray-600'
                                  }`}>
                                    N/A pozitiv
                                  </span>
                                )}
                              </div>
                            </div>
                            
                            {/* QR Code */}
                            <div className="flex-shrink-0">
                              <Link
                                href={`/user/${follower.id}`}
                                onClick={() => setShowFollowers(false)}
                                className="inline-flex"
                              >
                                <UserShopQrBadge userId={follower.id} pixelSize={64} />
                              </Link>
                            </div>
                          </div>

                          {/* Ultima conectare și urmăritori - Mobile */}
                          {(follower.lastSignInAt || follower.followersCount !== undefined || follower.followingCount !== undefined) && (
                            <div className="flex sm:hidden items-center gap-2 mt-2 pb-2 border-b border-gray-300 dark:border-gray-600 text-xs">
                              <div className={`flex items-center gap-2 flex-wrap ${
                                isDarkMode ? 'text-gray-400' : 'text-gray-600'
                              }`}>
                                {follower.lastSignInAt && (
                                  <span className="flex items-center gap-1">
                                    <i className="ri-time-line"></i>
                                    <span>
                                      Ultima conectare {(() => {
                                        const now = new Date();
                                        const lastSignIn = new Date(follower.lastSignInAt!);
                                        const diffMs = now.getTime() - lastSignIn.getTime();
                                        const diffMins = Math.floor(diffMs / 60000);
                                        const diffHours = Math.floor(diffMs / 3600000);
                                        const diffDays = Math.floor(diffMs / 86400000);
                                        
                                        if (diffMins < 1) return 'acum';
                                        if (diffMins < 60) return `acum ${diffMins} ${diffMins === 1 ? 'minut' : 'minute'}`;
                                        if (diffHours < 24) return `acum ${diffHours} ${diffHours === 1 ? 'oră' : 'ore'}`;
                                        if (diffDays === 1) return 'ieri';
                                        if (diffDays < 7) return `acum ${diffDays} ${diffDays === 1 ? 'zi' : 'zile'}`;
                                        return lastSignIn.toLocaleDateString('ro-RO', { day: '2-digit', month: '2-digit', year: 'numeric' });
                                      })()}
                                    </span>
                                  </span>
                                )}
                                {(follower.followersCount !== undefined || follower.followingCount !== undefined) && (
                                  <>
                                    {follower.lastSignInAt && <span className="text-gray-400 dark:text-gray-500">•</span>}
                                    <span className="flex items-center gap-1">
                                      <i className="ri-user-line"></i>
                                      <span>
                                        {follower.followersCount || 0} {follower.followersCount === 1 ? 'urmăritor' : 'urmăritori'}, {follower.followingCount || 0} urmărește
                                      </span>
                                    </span>
                                  </>
                                )}
                              </div>
                            </div>
                          )}

                          {/* Action Buttons - Mobile */}
                          {currentUserId && currentUserId !== follower.id && (
                            <div className="flex sm:hidden gap-2 mt-3 justify-start">
                              <button
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  router.push(`/user/${follower.id}`);
                                  setShowFollowers(false);
                                }}
                                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap ${
                                  isDarkMode
                                    ? 'bg-blue-600 hover:bg-blue-700 text-white'
                                    : 'bg-blue-500 hover:bg-blue-600 text-white'
                                }`}
                              >
                                Urmărește
                              </button>
                              <button
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  router.push(`/user/${follower.id}`);
                                  setShowFollowers(false);
                                }}
                                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap ${
                                  isDarkMode
                                    ? 'bg-blue-600 hover:bg-blue-700 text-white'
                                    : 'bg-blue-500 hover:bg-blue-600 text-white'
                                }`}
                              >
                                Salvează
                              </button>
                            </div>
                          )}

                          {/* Desktop Layout */}
                          <div className="hidden sm:flex flex-row items-center gap-6">
                            {/* Avatar */}
                            <div className="relative flex-shrink-0">
                              {follower.avatarUrl ? (
                                <img 
                                  src={follower.avatarUrl} 
                                  alt={followerDisplayName}
                                  className="w-20 h-20 rounded-full object-cover"
                                />
                              ) : (
                                <div className={`w-20 h-20 rounded-full flex items-center justify-center ${
                                  isDarkMode ? 'bg-gray-700' : 'bg-gray-200'
                                }`}>
                                  <i className={`ri-user-line text-4xl ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}></i>
                                </div>
                              )}
                            </div>

                            {/* User Info */}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <Link
                                  href={`/user/${follower.id}`}
                                  onClick={() => setShowFollowers(false)}
                                  className={`text-2xl font-semibold hover:underline ${
                                    isDarkMode ? 'text-white' : 'text-gray-900'
                                  }`}
                                >
                                  {followerDisplayName}
                                </Link>
                                {follower.reviewCount && follower.reviewCount > 0 && (
                                  <span className={`text-lg ${
                                    isDarkMode ? 'text-gray-400' : 'text-gray-600'
                                  }`}>
                                    ({follower.reviewCount})
                                  </span>
                                )}
                              </div>
                              
                              {/* Rating & Feedback */}
                              <div className="flex items-center gap-2 flex-wrap mb-1">
                                <div className="flex items-center gap-1">
                                  {[1, 2, 3, 4, 5].map((star) => {
                                    if (follower.rating && follower.reviewCount && follower.reviewCount > 0) {
                                      const fullStars = Math.floor(follower.rating);
                                      const hasHalfStar = (follower.rating % 1 >= 0.5) && star === fullStars + 1;
                                      
                                      if (star <= fullStars) {
                                        return (
                                          <i
                                            key={star}
                                            className="text-base ri-star-fill text-yellow-400"
                                          ></i>
                                        );
                                      } else if (hasHalfStar) {
                                        return (
                                          <i
                                            key={star}
                                            className="text-base ri-star-half-fill text-yellow-400"
                                          ></i>
                                        );
                                      } else {
                                        return (
                                          <i
                                            key={star}
                                            className="text-base ri-star-line text-gray-400"
                                          ></i>
                                        );
                                      }
                                    } else {
                                      // Stele goale când nu există review-uri
                                      return (
                                        <i
                                          key={star}
                                          className="text-base ri-star-line text-gray-400"
                                        ></i>
                                      );
                                    }
                                  })}
                                  {follower.rating && follower.reviewCount && follower.reviewCount > 0 ? (
                                    <span className={`text-sm ml-0.5 ${
                                      isDarkMode ? 'text-gray-400' : 'text-gray-600'
                                    }`}>
                                      ({follower.rating.toFixed(1)})
                                    </span>
                                  ) : null}
                                </div>
                                
                                {follower.rating && follower.reviewCount && follower.reviewCount > 0 && follower.positivePercentage !== undefined && follower.positivePercentage >= 0 ? (
                                  <span className={`text-sm ${
                                    isDarkMode ? 'text-gray-400' : 'text-gray-600'
                                  }`}>
                                    {follower.positivePercentage.toFixed(1)}% pozitiv
                                  </span>
                                ) : (
                                  <span className={`text-sm ${
                                    isDarkMode ? 'text-gray-400' : 'text-gray-600'
                                  }`}>
                                    N/A pozitiv
                                  </span>
                                )}
                              </div>
                            </div>

                            {/* QR Code - Desktop */}
                            <div className="flex-shrink-0">
                              <Link
                                href={`/user/${follower.id}`}
                                onClick={() => setShowFollowers(false)}
                                className="inline-flex"
                              >
                                <UserShopQrBadge userId={follower.id} pixelSize={80} />
                              </Link>
                            </div>
                          </div>

                          {/* Locație - Desktop */}
                          {follower.location && (
                            <div className="hidden sm:block mt-4 mb-3 pb-3 border-b border-gray-300 dark:border-gray-600">
                              <div className="flex flex-wrap items-center gap-4 text-sm">
                                <div className={`flex items-center gap-1.5 ${
                                  isDarkMode ? 'text-gray-400' : 'text-gray-600'
                                }`}>
                                  <i className="ri-map-pin-line text-xs"></i>
                                  <span>{follower.location}</span>
                                </div>
                              </div>
                            </div>
                          )}

                          {/* Ultima conectare și urmăritori + Butoane - Desktop */}
                          <div className={`hidden sm:flex items-center justify-between gap-4 ${follower.location ? 'pt-3' : 'mt-4 mb-3 pb-3 border-b border-gray-300 dark:border-gray-600'}`}>
                            {/* Ultima conectare și urmăritori */}
                            {(follower.lastSignInAt || follower.followersCount !== undefined || follower.followingCount !== undefined) && (
                              <div className={`flex items-center gap-2 flex-wrap text-sm ${
                                isDarkMode ? 'text-gray-400' : 'text-gray-600'
                              }`}>
                                {follower.lastSignInAt && (
                                  <span className="flex items-center gap-1.5">
                                    <i className="ri-time-line text-xs"></i>
                                    <span>
                                      Ultima conectare {(() => {
                                        const now = new Date();
                                        const lastSignIn = new Date(follower.lastSignInAt!);
                                        const diffMs = now.getTime() - lastSignIn.getTime();
                                        const diffMins = Math.floor(diffMs / 60000);
                                        const diffHours = Math.floor(diffMs / 3600000);
                                        const diffDays = Math.floor(diffMs / 86400000);
                                        
                                        if (diffMins < 1) return 'acum';
                                        if (diffMins < 60) return `acum ${diffMins} ${diffMins === 1 ? 'minut' : 'minute'}`;
                                        if (diffHours < 24) return `acum ${diffHours} ${diffHours === 1 ? 'oră' : 'ore'}`;
                                        if (diffDays === 1) return 'ieri';
                                        if (diffDays < 7) return `acum ${diffDays} ${diffDays === 1 ? 'zi' : 'zile'}`;
                                        return lastSignIn.toLocaleDateString('ro-RO', { day: '2-digit', month: '2-digit', year: 'numeric' });
                                      })()}
                                    </span>
                                  </span>
                                )}
                                {(follower.followersCount !== undefined || follower.followingCount !== undefined) && (
                                  <>
                                    {follower.lastSignInAt && <span className="text-gray-400 dark:text-gray-500">•</span>}
                                    <span className="flex items-center gap-1.5">
                                      <i className="ri-user-line text-xs"></i>
                                      <span>
                                        {follower.followersCount || 0} {follower.followersCount === 1 ? 'urmăritor' : 'urmăritori'}, {follower.followingCount || 0} urmărește
                                      </span>
                                    </span>
                                  </>
                                )}
                              </div>
                            )}

                            {/* Action Buttons - Desktop */}
                            {currentUserId && currentUserId !== follower.id && (
                              <div className="flex gap-2">
                                <button
                                  onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    router.push(`/user/${follower.id}`);
                                    setShowFollowers(false);
                                  }}
                                  className={`px-2 py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap ${
                                    isDarkMode
                                      ? 'bg-blue-600 hover:bg-blue-700 text-white'
                                      : 'bg-blue-500 hover:bg-blue-600 text-white'
                                  }`}
                                >
                                  Urmărește
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    router.push(`/user/${follower.id}`);
                                    setShowFollowers(false);
                                  }}
                                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap ${
                                    isDarkMode
                                      ? 'bg-blue-600 hover:bg-blue-700 text-white'
                                      : 'bg-blue-500 hover:bg-blue-600 text-white'
                                  }`}
                                >
                                  Salvează
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        </>
      )}

      {/* Following Modal */}
      {showFollowing && (
        <>
          {/* Backdrop */}
          <div 
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50"
            onClick={() => {
              setShowFollowing(false);
            }}
          ></div>
          
          {/* Modal */}
          <div className={`fixed inset-0 z-50 flex items-center justify-center p-4 ${
            isDarkMode ? '' : ''
          }`}>
            <div 
              className={`relative w-full max-w-md rounded-2xl shadow-2xl max-h-[80vh] flex flex-col ${
                isDarkMode 
                  ? 'bg-gray-800 border border-gray-700' 
                  : 'bg-white border border-gray-200'
              }`}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className={`flex items-center justify-between p-4 sm:p-6 border-b ${
                isDarkMode ? 'border-gray-700' : 'border-gray-200'
              }`}>
                <h2 className={`text-lg sm:text-xl font-bold ${
                  isDarkMode ? 'text-white' : 'text-gray-900'
                }`}>
                  Urmărește ({followingCount})
                </h2>
                <button
                  onClick={() => setShowFollowing(false)}
                  className={`p-2 rounded-lg transition-colors ${
                    isDarkMode 
                      ? 'hover:bg-gray-700 text-gray-400 hover:text-white' 
                      : 'hover:bg-gray-100 text-gray-500 hover:text-gray-900'
                  }`}
                >
                  <i className="ri-close-line text-xl"></i>
                </button>
              </div>

              {/* Content - Scrollable list */}
              <div className="flex-1 overflow-y-auto p-4 sm:p-6">
                {loadingFollowing ? (
                  <div className="flex items-center justify-center py-8">
                    <div className={`text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                      Se încarcă...
                    </div>
                  </div>
                ) : following.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-8">
                    <i className={`ri-user-line text-4xl mb-2 ${
                      isDarkMode ? 'text-gray-600' : 'text-gray-400'
                    }`}></i>
                    <p className={`text-sm ${
                      isDarkMode ? 'text-gray-400' : 'text-gray-600'
                    }`}>
                      Nu urmărește pe nimeni
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2 sm:space-y-4">
                    {following.map((followedUser) => {
                      const followedUserDisplayName = followedUser.firstName && followedUser.lastName
                        ? `${followedUser.firstName} ${followedUser.lastName}`
                        : followedUser.email?.split('@')[0] || 'Utilizator fără nume';
                      
                      return (
                        <div
                          key={followedUser.id}
                          className={`rounded-lg border p-3 ${
                            isDarkMode 
                              ? 'bg-gray-800 border-gray-700 hover:border-gray-600' 
                              : 'bg-white border-gray-200 hover:border-gray-300'
                          } transition-all`}
                        >
                          {/* Mobile Layout */}
                          <div className="flex sm:hidden items-center gap-3">
                            {/* Avatar */}
                            <div className="relative flex-shrink-0">
                              {followedUser.avatarUrl ? (
                                <img 
                                  src={followedUser.avatarUrl} 
                                  alt={followedUserDisplayName}
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
                            
                            {/* User Info */}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <Link
                                  href={`/user/${followedUser.id}`}
                                  onClick={() => setShowFollowing(false)}
                                  className={`text-sm font-semibold truncate hover:underline ${
                                    isDarkMode ? 'text-white' : 'text-gray-900'
                                  }`}
                                >
                                  {followedUserDisplayName}
                                </Link>
                                {followedUser.reviewCount && followedUser.reviewCount > 0 && (
                                  <span className={`text-xs ${
                                    isDarkMode ? 'text-gray-400' : 'text-gray-600'
                                  }`}>
                                    ({followedUser.reviewCount})
                                  </span>
                                )}
                              </div>
                              
                              {/* Rating & Feedback */}
                              <div className="flex items-center gap-2 flex-wrap">
                                <div className="flex items-center gap-1">
                                  {[1, 2, 3, 4, 5].map((star) => {
                                    if (followedUser.rating && followedUser.reviewCount && followedUser.reviewCount > 0) {
                                      const fullStars = Math.floor(followedUser.rating);
                                      const hasHalfStar = (followedUser.rating % 1 >= 0.5) && star === fullStars + 1;
                                      
                                      if (star <= fullStars) {
                                        return (
                                          <i
                                            key={star}
                                            className="text-xs ri-star-fill text-yellow-400"
                                          ></i>
                                        );
                                      } else if (hasHalfStar) {
                                        return (
                                          <i
                                            key={star}
                                            className="text-xs ri-star-half-fill text-yellow-400"
                                          ></i>
                                        );
                                      } else {
                                        return (
                                          <i
                                            key={star}
                                            className="text-xs ri-star-line text-gray-400"
                                          ></i>
                                        );
                                      }
                                    } else {
                                      // Stele goale când nu există review-uri
                                      return (
                                        <i
                                          key={star}
                                          className="text-xs ri-star-line text-gray-400"
                                        ></i>
                                      );
                                    }
                                  })}
                                  {followedUser.rating && followedUser.reviewCount && followedUser.reviewCount > 0 ? (
                                    <span className={`text-xs ml-0.5 ${
                                      isDarkMode ? 'text-gray-400' : 'text-gray-600'
                                    }`}>
                                      ({followedUser.rating.toFixed(1)})
                                    </span>
                                  ) : null}
                                </div>
                                
                                {followedUser.rating && followedUser.reviewCount && followedUser.reviewCount > 0 && followedUser.positivePercentage !== undefined && followedUser.positivePercentage >= 0 ? (
                                  <span className={`text-xs ${
                                    isDarkMode ? 'text-gray-400' : 'text-gray-600'
                                  }`}>
                                    {followedUser.positivePercentage.toFixed(1)}% pozitiv
                                  </span>
                                ) : (
                                  <span className={`text-xs ${
                                    isDarkMode ? 'text-gray-400' : 'text-gray-600'
                                  }`}>
                                    N/A pozitiv
                                  </span>
                                )}
                              </div>
                            </div>
                            
                            {/* QR Code */}
                            <div className="flex-shrink-0">
                              <Link
                                href={`/user/${followedUser.id}`}
                                onClick={() => setShowFollowing(false)}
                                className="inline-flex"
                              >
                                <UserShopQrBadge userId={followedUser.id} pixelSize={64} />
                              </Link>
                            </div>
                          </div>

                          {/* Ultima conectare și urmăritori - Mobile */}
                          {(followedUser.lastSignInAt || followedUser.followersCount !== undefined || followedUser.followingCount !== undefined) && (
                            <div className="flex sm:hidden items-center gap-2 mt-2 pb-2 border-b border-gray-300 dark:border-gray-600 text-xs">
                              <div className={`flex items-center gap-2 flex-wrap ${
                                isDarkMode ? 'text-gray-400' : 'text-gray-600'
                              }`}>
                                {followedUser.lastSignInAt && (
                                  <span className="flex items-center gap-1">
                                    <i className="ri-time-line"></i>
                                    <span>
                                      Ultima conectare {(() => {
                                        const now = new Date();
                                        const lastSignIn = new Date(followedUser.lastSignInAt!);
                                        const diffMs = now.getTime() - lastSignIn.getTime();
                                        const diffMins = Math.floor(diffMs / 60000);
                                        const diffHours = Math.floor(diffMs / 3600000);
                                        const diffDays = Math.floor(diffMs / 86400000);
                                        
                                        if (diffMins < 1) return 'acum';
                                        if (diffMins < 60) return `acum ${diffMins} ${diffMins === 1 ? 'minut' : 'minute'}`;
                                        if (diffHours < 24) return `acum ${diffHours} ${diffHours === 1 ? 'oră' : 'ore'}`;
                                        if (diffDays === 1) return 'ieri';
                                        if (diffDays < 7) return `acum ${diffDays} ${diffDays === 1 ? 'zi' : 'zile'}`;
                                        return lastSignIn.toLocaleDateString('ro-RO', { day: '2-digit', month: '2-digit', year: 'numeric' });
                                      })()}
                                    </span>
                                  </span>
                                )}
                                {(followedUser.followersCount !== undefined || followedUser.followingCount !== undefined) && (
                                  <>
                                    {followedUser.lastSignInAt && <span className="text-gray-400 dark:text-gray-500">•</span>}
                                    <span className="flex items-center gap-1">
                                      <i className="ri-user-line"></i>
                                      <span>
                                        {followedUser.followersCount || 0} {followedUser.followersCount === 1 ? 'urmăritor' : 'urmăritori'}, {followedUser.followingCount || 0} urmărește
                                      </span>
                                    </span>
                                  </>
                                )}
                              </div>
                            </div>
                          )}

                          {/* Action Buttons - Mobile */}
                          {currentUserId && currentUserId !== followedUser.id && (
                            <div className="flex sm:hidden gap-2 mt-3 justify-start">
                              <button
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  router.push(`/user/${followedUser.id}`);
                                  setShowFollowing(false);
                                }}
                                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap ${
                                  isDarkMode
                                    ? 'bg-blue-600 hover:bg-blue-700 text-white'
                                    : 'bg-blue-500 hover:bg-blue-600 text-white'
                                }`}
                              >
                                Urmărește
                              </button>
                              <button
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  router.push(`/user/${followedUser.id}`);
                                  setShowFollowing(false);
                                }}
                                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap ${
                                  isDarkMode
                                    ? 'bg-blue-600 hover:bg-blue-700 text-white'
                                    : 'bg-blue-500 hover:bg-blue-600 text-white'
                                }`}
                              >
                                Salvează
                              </button>
                            </div>
                          )}

                          {/* Desktop Layout */}
                          <div className="hidden sm:flex flex-row items-center gap-6">
                            {/* Avatar */}
                            <div className="relative flex-shrink-0">
                              {followedUser.avatarUrl ? (
                                <img 
                                  src={followedUser.avatarUrl} 
                                  alt={followedUserDisplayName}
                                  className="w-20 h-20 rounded-full object-cover"
                                />
                              ) : (
                                <div className={`w-20 h-20 rounded-full flex items-center justify-center ${
                                  isDarkMode ? 'bg-gray-700' : 'bg-gray-200'
                                }`}>
                                  <i className={`ri-user-line text-4xl ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}></i>
                                </div>
                              )}
                            </div>

                            {/* User Info */}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <Link
                                  href={`/user/${followedUser.id}`}
                                  onClick={() => setShowFollowing(false)}
                                  className={`text-2xl font-semibold hover:underline ${
                                    isDarkMode ? 'text-white' : 'text-gray-900'
                                  }`}
                                >
                                  {followedUserDisplayName}
                                </Link>
                                {followedUser.reviewCount && followedUser.reviewCount > 0 && (
                                  <span className={`text-lg ${
                                    isDarkMode ? 'text-gray-400' : 'text-gray-600'
                                  }`}>
                                    ({followedUser.reviewCount})
                                  </span>
                                )}
                              </div>
                              
                              {/* Rating & Feedback */}
                              <div className="flex items-center gap-2 flex-wrap mb-1">
                                <div className="flex items-center gap-1">
                                  {[1, 2, 3, 4, 5].map((star) => {
                                    if (followedUser.rating && followedUser.reviewCount && followedUser.reviewCount > 0) {
                                      const fullStars = Math.floor(followedUser.rating);
                                      const hasHalfStar = (followedUser.rating % 1 >= 0.5) && star === fullStars + 1;
                                      
                                      if (star <= fullStars) {
                                        return (
                                          <i
                                            key={star}
                                            className="text-base ri-star-fill text-yellow-400"
                                          ></i>
                                        );
                                      } else if (hasHalfStar) {
                                        return (
                                          <i
                                            key={star}
                                            className="text-base ri-star-half-fill text-yellow-400"
                                          ></i>
                                        );
                                      } else {
                                        return (
                                          <i
                                            key={star}
                                            className="text-base ri-star-line text-gray-400"
                                          ></i>
                                        );
                                      }
                                    } else {
                                      // Stele goale când nu există review-uri
                                      return (
                                        <i
                                          key={star}
                                          className="text-base ri-star-line text-gray-400"
                                        ></i>
                                      );
                                    }
                                  })}
                                  {followedUser.rating && followedUser.reviewCount && followedUser.reviewCount > 0 ? (
                                    <span className={`text-sm ml-0.5 ${
                                      isDarkMode ? 'text-gray-400' : 'text-gray-600'
                                    }`}>
                                      ({followedUser.rating.toFixed(1)})
                                    </span>
                                  ) : null}
                                </div>
                                
                                {followedUser.rating && followedUser.reviewCount && followedUser.reviewCount > 0 && followedUser.positivePercentage !== undefined && followedUser.positivePercentage >= 0 ? (
                                  <span className={`text-sm ${
                                    isDarkMode ? 'text-gray-400' : 'text-gray-600'
                                  }`}>
                                    {followedUser.positivePercentage.toFixed(1)}% pozitiv
                                  </span>
                                ) : (
                                  <span className={`text-sm ${
                                    isDarkMode ? 'text-gray-400' : 'text-gray-600'
                                  }`}>
                                    N/A pozitiv
                                  </span>
                                )}
                              </div>
                            </div>

                            {/* QR Code - Desktop */}
                            <div className="flex-shrink-0">
                              <Link
                                href={`/user/${followedUser.id}`}
                                onClick={() => setShowFollowing(false)}
                                className="inline-flex"
                              >
                                <UserShopQrBadge userId={followedUser.id} pixelSize={80} />
                              </Link>
                            </div>
                          </div>

                          {/* Locație - Desktop */}
                          {followedUser.location && (
                            <div className="hidden sm:block mt-4 mb-3 pb-3 border-b border-gray-300 dark:border-gray-600">
                              <div className="flex flex-wrap items-center gap-4 text-sm">
                                <div className={`flex items-center gap-1.5 ${
                                  isDarkMode ? 'text-gray-400' : 'text-gray-600'
                                }`}>
                                  <i className="ri-map-pin-line text-xs"></i>
                                  <span>{followedUser.location}</span>
                                </div>
                              </div>
                            </div>
                          )}

                          {/* Ultima conectare și urmăritori + Butoane - Desktop */}
                          <div className={`hidden sm:flex items-center justify-between gap-4 ${followedUser.location ? 'pt-3' : 'mt-4 mb-3 pb-3 border-b border-gray-300 dark:border-gray-600'}`}>
                            {/* Ultima conectare și urmăritori */}
                            {(followedUser.lastSignInAt || followedUser.followersCount !== undefined || followedUser.followingCount !== undefined) && (
                              <div className={`flex items-center gap-2 flex-wrap text-sm ${
                                isDarkMode ? 'text-gray-400' : 'text-gray-600'
                              }`}>
                                {followedUser.lastSignInAt && (
                                  <span className="flex items-center gap-1.5">
                                    <i className="ri-time-line text-xs"></i>
                                    <span>
                                      Ultima conectare {(() => {
                                        const now = new Date();
                                        const lastSignIn = new Date(followedUser.lastSignInAt!);
                                        const diffMs = now.getTime() - lastSignIn.getTime();
                                        const diffMins = Math.floor(diffMs / 60000);
                                        const diffHours = Math.floor(diffMs / 3600000);
                                        const diffDays = Math.floor(diffMs / 86400000);
                                        
                                        if (diffMins < 1) return 'acum';
                                        if (diffMins < 60) return `acum ${diffMins} ${diffMins === 1 ? 'minut' : 'minute'}`;
                                        if (diffHours < 24) return `acum ${diffHours} ${diffHours === 1 ? 'oră' : 'ore'}`;
                                        if (diffDays === 1) return 'ieri';
                                        if (diffDays < 7) return `acum ${diffDays} ${diffDays === 1 ? 'zi' : 'zile'}`;
                                        return lastSignIn.toLocaleDateString('ro-RO', { day: '2-digit', month: '2-digit', year: 'numeric' });
                                      })()}
                                    </span>
                                  </span>
                                )}
                                {(followedUser.followersCount !== undefined || followedUser.followingCount !== undefined) && (
                                  <>
                                    {followedUser.lastSignInAt && <span className="text-gray-400 dark:text-gray-500">•</span>}
                                    <span className="flex items-center gap-1.5">
                                      <i className="ri-user-line text-xs"></i>
                                      <span>
                                        {followedUser.followersCount || 0} {followedUser.followersCount === 1 ? 'urmăritor' : 'urmăritori'}, {followedUser.followingCount || 0} urmărește
                                      </span>
                                    </span>
                                  </>
                                )}
                              </div>
                            )}

                            {/* Action Buttons - Desktop */}
                            {currentUserId && currentUserId !== followedUser.id && (
                              <div className="flex gap-2">
                                <button
                                  onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    router.push(`/user/${followedUser.id}`);
                                    setShowFollowing(false);
                                  }}
                                  className={`px-2 py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap ${
                                    isDarkMode
                                      ? 'bg-blue-600 hover:bg-blue-700 text-white'
                                      : 'bg-blue-500 hover:bg-blue-600 text-white'
                                  }`}
                                >
                                  Urmărește
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    router.push(`/user/${followedUser.id}`);
                                    setShowFollowing(false);
                                  }}
                                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap ${
                                    isDarkMode
                                      ? 'bg-blue-600 hover:bg-blue-700 text-white'
                                      : 'bg-blue-500 hover:bg-blue-600 text-white'
                                  }`}
                                >
                                  Salvează
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        </>
      )}

      {/* Footer */}
      <div className="mt-16">
        <DashboardFooter isDarkMode={isDarkMode} />
      </div>
    </div>
  );
}
