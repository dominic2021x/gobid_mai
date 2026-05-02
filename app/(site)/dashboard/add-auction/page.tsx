"use client";

import { dashboardApiFetch } from "@/lib/dashboard-api-fetch";
import React, { useState, useEffect, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import GoogleMapPreview from "@/components/GoogleMapPreview";
import LocationPermissionModal from "@/components/LocationPermissionModal";
import { slugify, generateUniqueSlug } from "@/lib/slugify";
import { supabase } from "@/lib/supabase";
import UniversalHeader from "@/components/UniversalHeader";
import { BackButton } from "@/components/ui/back-button";
import { Button } from "@/components/ui/button";
import Hammer from "@/components/Hammer";
import { reorderArray } from "@/lib/manual-listing/reorder-array";
import { useManualListingImageDnD } from "@/components/manual-listing/useManualListingImageDnD";
import { Loader2, Navigation2 } from "lucide-react";

const roundTo = (value: number, decimals = 2) => {
  if (!Number.isFinite(value)) {
    return 0;
  }
  const factor = Math.pow(10, decimals);
  return Math.round((value + Number.EPSILON) * factor) / factor;
};

const SKU_TOTAL_LENGTH = 10;
const SKU_PREFIX_LENGTH = 4;
const SKU_SUFFIX_LENGTH = SKU_TOTAL_LENGTH - SKU_PREFIX_LENGTH;
const SKU_CHARSET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

const sanitizeSkuInput = (value: string): string => {
  if (!value) return '';
  const cleaned = value.toUpperCase().replace(/[^A-Z0-9]/g, '');
  return cleaned.slice(0, SKU_TOTAL_LENGTH);
};

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

const normalizeSubcategoryName = (value: string): string => {
  if (!value) return '';
  return value
    .normalize('NFD')
    .replace(/[-\u001f]/g, '')
    .replace(/[-\u009f]/g, '')
    .replace(/[^A-Za-z]/g, '')
    .toUpperCase();
};

const generateSku = (subcategory: string, existingSkus: string[]): string => {
  const normalized = normalizeSubcategoryName(subcategory);
  if (!normalized) {
    return '';
  }

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

type ExchangeRatePayload = {
  rate: number;
  publishedAt: Date | null;
};

interface ProductFormData {
  title: string;
  description: string;
  category: string;
  subcategory: string;
  sku: string;
  startingPrice: number;
  currency: 'RON' | 'EUR';
  startingPriceRON?: number;
  startingPriceEUR?: number;
  exchangeRate?: number;
  exchangeRateUpdatedAt?: string;
  productType: 'live-bid' | 'licitatii-publice' | 'buy-now'; // Tip produs
  saleType:
    | 'licitatii-anaf'
    | 'licitatii-insolventa'
    | 'licitatii-executori'
    | 'alte-licitatii'
    | 'vanzare-directa'
    | 'licitatie-publica'; // Tip de vânzare (include valori vechi pentru compatibilitate)
  insolventaDirectSale?: boolean;
  buyNowEnabled?: boolean;
  buyNowPriceRON?: number | null;
  buyNowPriceEUR?: number | null;
  productLocation?: string;
  auctionLocation?: string;
  auctionRegistrationDate?: string;
  auctionDate?: string; // Data licitației (opțional, format intern: YYYY-MM-DDTHH:MM)
  auctionTime?: string; // Ora licitației (opțional, format: HH:MM)
  county?: string; // Județ
  city?: string; // Oraș
  address?: string; // Adresă pentru imobiliare
  coordinates?: { lat: number; lng: number }; // Coordonate pentru hartă
  images: (string | { name: string; size: number; type: string; file: File })[];
  customFields?: Record<string, any>; // Câmpuri custom pentru specificații
  seo: {
    title: string;
    description: string;
    keywords: string[];
  };
  status: 'draft' | 'active';
  url?: string; // URL-ul produsului (generat automat din titlu pentru SEO)
  slug?: string; // Slug-ul produsului (partea finală a URL-ului)
  discountPercent?: number | null;
  discountValueRON?: number | null;
  discountValueEUR?: number | null;
  discountedPriceRON?: number | null;
  discountedPriceEUR?: number | null;
  isFreeListing?: boolean;
  isUrgent?: boolean;
  documents?: Array<{
    name: string;
    url?: string;
    size?: number;
    type?: string;
  }>;
}

export default function AddProductPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const productIdParam = searchParams?.get?.('id') ?? null;
  const [isEditMode, setIsEditMode] = useState(false);
  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isPageLoading, setIsPageLoading] = useState(true);
  const [formData, setFormData] = useState<ProductFormData>({
    title: '',
    description: '',
    category: '',
    subcategory: '',
    sku: '',
    startingPrice: 0,
    currency: 'RON',
    startingPriceRON: 0,
    startingPriceEUR: 0,
    exchangeRate: 1,
    exchangeRateUpdatedAt: new Date().toISOString(),
    productType: 'live-bid',
    saleType: 'alte-licitatii',
    insolventaDirectSale: false,
    buyNowEnabled: false,
    buyNowPriceRON: null,
    buyNowPriceEUR: null,
    productLocation: '',
    auctionLocation: '',
    auctionRegistrationDate: undefined,
    auctionDate: undefined,
    auctionTime: undefined,
    county: undefined,
    city: undefined,
    address: undefined,
    coordinates: undefined,
    images: [],
    customFields: {},
    seo: {
      title: '',
      description: '',
      keywords: []
    },
    status: 'active',
    discountPercent: null,
    discountValueRON: null,
    discountValueEUR: null,
    discountedPriceRON: null,
    discountedPriceEUR: null,
    isFreeListing: false,
    isUrgent: false,
    documents: []
  });

  const [selectedImageFiles, setSelectedImageFiles] = useState<File[]>([]);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [useMyLocationBusy, setUseMyLocationBusy] = useState(false);
  const [locationPermissionModalOpen, setLocationPermissionModalOpen] = useState(false);
  const [isGeneratingSEO, setIsGeneratingSEO] = useState(false);
  const [isRewriting, setIsRewriting] = useState(false);
  const [rewriteTitle, setRewriteTitle] = useState(true); // Default bifat
  const [rewriteDescription, setRewriteDescription] = useState(true); // Default bifat
  const [autoEnhance, setAutoEnhance] = useState(true); // ChatGPT optimization always on by default
  const [isEnhancing, setIsEnhancing] = useState(false);
  const [priceRon, setPriceRon] = useState<number>(0);
  const [priceEur, setPriceEur] = useState<number>(0);
  const [exchangeRate, setExchangeRate] = useState<number | null>(null);
  const [lastRateUpdate, setLastRateUpdate] = useState<Date | null>(null);
  const [isFetchingRate, setIsFetchingRate] = useState(false);
  const [exchangeError, setExchangeError] = useState<string | null>(null);
  const [discountPercent, setDiscountPercent] = useState<number | null>(null);
  const [discountValueRon, setDiscountValueRon] = useState<number | null>(null);
  const [discountValueEur, setDiscountValueEur] = useState<number | null>(null);
  const [discountedPriceRon, setDiscountedPriceRon] = useState<number | null>(null);
  const [discountedPriceEur, setDiscountedPriceEur] = useState<number | null>(null);
  const [buyNowPriceRon, setBuyNowPriceRon] = useState<number | null>(null);
  const [buyNowPriceEur, setBuyNowPriceEur] = useState<number | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [skuDirty, setSkuDirty] = useState(false);
  const [isSkuEditable, setIsSkuEditable] = useState(false);
  const [documentUploads, setDocumentUploads] = useState<File[]>([]);
  const [existingProductSkus, setExistingProductSkus] = useState<Array<{ id: string | null; sku: string }>>([]);
  const [isLoadingProduct, setIsLoadingProduct] = useState(false);
  const [userTokens, setUserTokens] = useState({
    balance: 0,
    totalEarned: 0,
    totalSpent: 0,
    level: 'Basic',
    package: 'Basic' as string
  });
  const [showTokenModal, setShowTokenModal] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [tokensNeeded, setTokensNeeded] = useState(0);

  // Load dark mode from localStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('darkMode');
      if (saved !== null) {
        const darkModeValue = saved === 'true';
        setIsDarkMode(darkModeValue);
      }
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

  // Page loading effect
  useEffect(() => {
    const timer = setTimeout(() => {
      setIsPageLoading(false);
    }, 1000);
    return () => clearTimeout(timer);
  }, []);

  // Load user tokens
  useEffect(() => {
    const loadUserTokens = async () => {
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const userId = sessionData.session?.user?.id;

        if (!userId) {
          // Try localStorage fallback
          const savedTokens = localStorage.getItem('userTokens');
          if (savedTokens) {
            try {
              const parsedTokens = JSON.parse(savedTokens);
              setUserTokens(parsedTokens);
            } catch (e) {
              console.error('Error parsing tokens from localStorage:', e);
            }
          }
          return;
        }

        // Load tokens from API
        const tokensResponse = await dashboardApiFetch('/api/tokens', {
          headers: {
          }
        });

        if (tokensResponse.ok) {
          const tokensData = await tokensResponse.json();
          setUserTokens({
            balance: tokensData.balance ?? 0,
            totalEarned: tokensData.totalEarned ?? 0,
            totalSpent: tokensData.totalSpent ?? 0,
            level: tokensData.level || 'Basic',
            package: tokensData.package || 'Basic'
          });
        }
      } catch (error) {
        console.error('Error loading user tokens:', error);
      }
    };

    loadUserTokens();
  }, []);

  const getExistingSkus = useCallback(
    (excludeId?: string) =>
      existingProductSkus
        .filter(item => (!excludeId || item.id !== excludeId) && item.sku)
        .map(item => item.sku),
    [existingProductSkus]
  );

  useEffect(() => {
    let cancelled = false;

    const fetchSkus = async () => {
      try {
        const { data, error } = await supabase
          .from('products')
          .select('id, sku');

        if (error) {
          console.error('Error fetching product SKUs:', error);
          return;
        }

        if (!cancelled && Array.isArray(data)) {
          const sanitized = data
            .map(item => ({
              id: item?.id ?? null,
              sku: sanitizeSkuInput(item?.sku ?? ''),
            }))
            .filter(item => item.sku);
          setExistingProductSkus(sanitized);
        }
      } catch (error) {
        console.error('Unexpected error fetching SKUs:', error);
      }
    };

    fetchSkus();

    return () => {
      cancelled = true;
    };
  }, []);

  // Track if we just completed an update to prevent reload
  const [justUpdated, setJustUpdated] = useState(false);

  // Load product for editing when productIdParam exists
  // Only load if we're not currently submitting (to avoid overwriting formData during save)
  useEffect(() => {
    if (!productIdParam) {
      setIsEditMode(false);
      setEditingProductId(null);
      setJustUpdated(false);
      return;
    }

    // Don't reload if we're currently submitting or just updated
    if (isSubmitting) {
      console.log('⏸️ Skipping product reload - form is submitting');
      return;
    }

    // Don't reload if we just updated (to preserve the updated images in formData)
    if (justUpdated) {
      console.log('⏸️ Skipping product reload - just completed update');
      return;
    }

    let cancelled = false;
    setIsLoadingProduct(true);
    setIsEditMode(true);
    setEditingProductId(productIdParam);

    const loadProduct = async () => {
      try {
        const { data, error } = await supabase
          .from('products')
          .select('*')
          .eq('id', productIdParam)
          .maybeSingle();

        if (error) {
          console.error('Error loading product:', error);
          setMessage({ type: 'error', text: 'Nu am putut încărca produsul pentru editare.' });
          return;
        }

        if (cancelled) return;

        if (data) {
          console.log('📦 Loading product for edit:', data);
          
          // Process images - ensure they are strings (URLs)
          let processedImages: string[] = [];
          if (data.images && Array.isArray(data.images)) {
            processedImages = data.images.map((img: any) => {
              // If it's already a string URL, use it
              if (typeof img === 'string') {
                return img;
              }
              // If it's an object with url property, use that
              if (typeof img === 'object' && img !== null && img.url) {
                return img.url;
              }
              // Otherwise, try to convert to string
              return String(img);
            }).filter((url: string) => url && url.trim() !== '');
          }
          
          console.log('📸 Processed images from DB:', processedImages.length, processedImages);

          setFormData({
            title: data.title || '',
            description: data.description || '',
            category: data.category || '',
            subcategory: data.subcategory || '',
            sku: data.sku || '',
            startingPrice: data.starting_price || 0,
            currency: (data.currency as 'RON' | 'EUR') || 'RON',
            startingPriceRON: data.starting_price_ron || 0,
            startingPriceEUR: data.starting_price_eur || 0,
            exchangeRate: data.exchange_rate || 1,
            exchangeRateUpdatedAt: data.exchange_rate_updated_at || new Date().toISOString(),
            productType: (data.product_type as 'live-bid' | 'licitatii-publice' | 'buy-now') || 'licitatii-publice',
            saleType: (data.sale_type as ProductFormData['saleType']) || 'licitatii-anaf',
            insolventaDirectSale: data.insolventa_direct_sale ?? false,
            buyNowEnabled: data.buy_now_enabled ?? false,
            buyNowPriceRON: data.buy_now_price_ron ?? null,
            buyNowPriceEUR: data.buy_now_price_eur ?? null,
            productLocation: data.product_location || '',
            auctionLocation: data.auction_location || '',
            auctionRegistrationDate: data.auction_registration_date || undefined,
            auctionDate: data.auction_date || undefined,
            auctionTime: data.auction_date ? data.auction_date.split('T')[1]?.split(':').slice(0, 2).join(':') : undefined,
            county: data.county || undefined,
            city: data.city || undefined,
            address: data.address || undefined,
            coordinates: data.coordinates || undefined,
            images: processedImages, // Use processed images
            customFields: data.custom_fields || {},
            seo: data.seo || { title: '', description: '', keywords: [] },
            status: (data.status as 'draft' | 'active') || 'draft',
            discountPercent: data.discount_percent ?? null,
            discountValueRON: data.discount_value_ron ?? null,
            discountValueEUR: data.discount_value_eur ?? null,
            discountedPriceRON: data.discounted_price_ron ?? null,
            discountedPriceEUR: data.discounted_price_eur ?? null,
            isFreeListing: data.custom_fields?.is_free_listing ?? data.custom_fields?.isFreeListing ?? false,
            isUrgent: data.custom_fields?.is_urgent ?? data.custom_fields?.isUrgent ?? false,
            documents: data.documents || [],
            url: data.url,
            slug: data.slug,
          });

          setPriceRon(data.starting_price_ron || 0);
          setPriceEur(data.starting_price_eur || 0);
          setBuyNowPriceRon(data.buy_now_price_ron ?? null);
          setBuyNowPriceEur(data.buy_now_price_eur ?? null);
          setExchangeRate(data.exchange_rate || null);
          setDiscountPercent(data.discount_percent ?? null);
          setDiscountValueRon(data.discount_value_ron ?? null);
          setDiscountValueEur(data.discount_value_eur ?? null);
          setDiscountedPriceRon(data.discounted_price_ron ?? null);
          setDiscountedPriceEur(data.discounted_price_eur ?? null);

          setMessage({ type: 'success', text: 'Produs încărcat pentru editare.' });
        } else {
          setMessage({ type: 'error', text: 'Produsul nu a fost găsit.' });
        }
      } catch (error) {
        console.error('Unexpected error loading product:', error);
        setMessage({ type: 'error', text: 'Eroare la încărcarea produsului.' });
      } finally {
        if (!cancelled) {
          setIsLoadingProduct(false);
        }
      }
    };

    loadProduct();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productIdParam]); // Only depend on productIdParam to avoid re-running during submit

  const MAX_DOCUMENTS = 5;
  const MAX_DOCUMENT_SIZE_MB = 15;

  const formatFileSize = (bytes?: number | null) => {
    if (!bytes || !Number.isFinite(bytes) || bytes <= 0) {
      return '—';
    }

    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let size = bytes;
    let unitIndex = 0;

    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex += 1;
    }

    const precision = unitIndex === 0 ? 0 : size < 10 ? 1 : 0;
    return `${size.toFixed(precision)} ${units[unitIndex]}`;
  };

  // Funcție helper pentru formatarea datei pentru afișare (26.Noiembrie.2025)
  const formatDateForDisplay = (dateValue: string | undefined): string => {
    if (!dateValue) return '';
    
    // Dacă este în format YYYY-MM-DD sau YYYY-MM-DDTHH:MM
    const dateMatch = dateValue.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (dateMatch) {
      const year = dateMatch[1];
      const month = parseInt(dateMatch[2], 10);
      const day = dateMatch[3];
      
      const monthNames = [
        'Ianuarie', 'Februarie', 'Martie', 'Aprilie', 'Mai', 'Iunie',
        'Iulie', 'August', 'Septembrie', 'Octombrie', 'Noiembrie', 'Decembrie'
      ];
      
      return `${day}.${monthNames[month - 1]}.${year}`;
    }
    
    // Dacă este deja în format 26.Noiembrie.2025, returnează așa
    return dateValue;
  };

  // Funcție helper pentru parsarea input-ului de dată (26.Noiembrie.2025 -> YYYY-MM-DD)
  const parseDateInput = (dateInput: string, timeInput: string): string => {
    if (!dateInput) return '';
    
    // Format: 26.Noiembrie.2025 sau 26/11/2025
    let day: string, month: string, year: string;
    
    // Încearcă formatul 26.Noiembrie.2025
    const dotFormat = dateInput.match(/^(\d{1,2})\.([^.]+)\.(\d{4})$/);
    if (dotFormat) {
      day = dotFormat[1].padStart(2, '0');
      const monthName = dotFormat[2];
      year = dotFormat[3];
      
      const monthNames = [
        'ianuarie', 'februarie', 'martie', 'aprilie', 'mai', 'iunie',
        'iulie', 'august', 'septembrie', 'octombrie', 'noiembrie', 'decembrie'
      ];
      
      const monthIndex = monthNames.findIndex(m => 
        monthName.toLowerCase().startsWith(m.toLowerCase())
      );
      
      if (monthIndex >= 0) {
        month = String(monthIndex + 1).padStart(2, '0');
      } else {
        return ''; // Format invalid
      }
    } else {
      // Încearcă formatul 26/11/2025 sau 26-11-2025
      const slashFormat = dateInput.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
      if (slashFormat) {
        day = slashFormat[1].padStart(2, '0');
        month = slashFormat[2].padStart(2, '0');
        year = slashFormat[3];
      } else {
        // Încearcă formatul YYYY-MM-DD
        const isoFormat = dateInput.match(/^(\d{4})-(\d{2})-(\d{2})/);
        if (isoFormat) {
          return timeInput ? `${dateInput}T${timeInput}` : dateInput;
        }
        return ''; // Format invalid
      }
    }
    
    const formattedDate = `${year}-${month}-${day}`;
    return timeInput ? `${formattedDate}T${timeInput}` : formattedDate;
  };

  const activeCurrency = formData.currency ?? 'RON';

  const categories = [
    'Imobiliare',
    'Autovehicule',
    'Utilaje & Echipamente',
    'Artă & Antichități',
    'Electronice & Tehnologie',
    'Casă & Grădină',
    'Modă & Lifestyle',
    'Agricultură & Zootehnie',
    'Maritime & Aeronautice',
    'Business & Licitații',
    'Materiale Construcții',
    'Diverse / Speciale'
  ];

  const subcategories = {
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
    'Business & Licitații': [
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

  // Lista județelor din România
  const counties = [
    'Alba', 'Arad', 'Argeș', 'Bacău', 'Bihor', 'Bistrița-Năsăud', 'Botoșani',
    'Brașov', 'Brăila', 'Buzău', 'Caraș-Severin', 'Călărași', 'Cluj', 'Constanța',
    'Covasna', 'Dâmbovița', 'Dolj', 'Galați', 'Giurgiu', 'Gorj', 'Harghita',
    'Hunedoara', 'Ialomița', 'Iași', 'Ilfov', 'Maramureș', 'Mehedinți', 'Mureș',
    'Neamț', 'Olt', 'Prahova', 'Sălaj', 'Satu Mare', 'Sibiu', 'Suceava',
    'Teleorman', 'Timiș', 'Tulcea', 'Vâlcea', 'Vaslui', 'Vrancea', 'București'
  ];

  const saleTypeOptions: Array<{
    value: ProductFormData['saleType'];
    label: string;
    description: string;
    icon: string;
    iconClass: string;
    activeClass: string;
    inactiveClass: string;
    indicatorActiveClass: string;
  }> = [
    {
      value: 'licitatii-anaf',
      label: 'Licitații ANAF',
      description: 'Loturi scoase la licitație prin ANAF, cu proceduri fiscal-bugetare clare și termene stricte.',
      icon: 'ri-government-line',
      iconClass: 'text-amber-500',
      activeClass: 'border-amber-500 bg-amber-50 shadow-inner shadow-amber-500/10 dark:border-amber-400 dark:bg-amber-900/20',
      inactiveClass: 'border-gray-200 bg-white hover:border-amber-300 dark:border-gray-600 dark:bg-gray-800 dark:hover:border-amber-400',
      indicatorActiveClass: 'border-amber-500 bg-amber-500',
    },
    {
      value: 'licitatii-insolventa',
      label: 'Licitații insolvență',
      description: 'Proceduri speciale pentru companii în insolvență; poți activa vânzarea directă pentru oferta rapidă.',
      icon: 'ri-exchange-dollar-line',
      iconClass: 'text-sky-500',
      activeClass: 'border-sky-500 bg-sky-50 shadow-inner shadow-sky-500/10 dark:border-sky-400 dark:bg-sky-900/25',
      inactiveClass: 'border-gray-200 bg-white hover:border-sky-300 dark:border-gray-600 dark:bg-gray-800 dark:hover:border-sky-400',
      indicatorActiveClass: 'border-sky-500 bg-sky-500',
    },
    {
      value: 'licitatii-executori',
      label: 'Licitații executori',
      description: 'Dosare gestionate de executori judecătorești, cu condiții standardizate și proces transparent.',
      icon: 'ri-shield-check-line',
      iconClass: 'text-emerald-500',
      activeClass: 'border-emerald-500 bg-emerald-50 shadow-inner shadow-emerald-500/10 dark:border-emerald-400 dark:bg-emerald-900/25',
      inactiveClass: 'border-gray-200 bg-white hover:border-emerald-300 dark:border-gray-600 dark:bg-gray-800 dark:hover:border-emerald-400',
      indicatorActiveClass: 'border-emerald-500 bg-emerald-500',
    },
    {
      value: 'alte-licitatii',
      label: 'Alte licitații',
      description: 'Proceduri publice diverse (instituții locale, private sau mixte) cu reguli flexibile.',
      icon: 'ri-auction-line',
      iconClass: 'text-blue-500',
      activeClass: 'border-blue-500 bg-blue-50 shadow-inner shadow-blue-500/10 dark:border-blue-400 dark:bg-blue-900/25',
      inactiveClass: 'border-gray-200 bg-white hover:border-blue-300 dark:border-gray-600 dark:bg-gray-800 dark:hover:border-blue-400',
      indicatorActiveClass: 'border-blue-500 bg-blue-500',
    },
  ];

  const shouldShowAuctionDate =
    formData.productType === 'licitatii-publice' &&
    (
      formData.saleType === 'licitatii-anaf' ||
      formData.saleType === 'licitatii-executori' ||
      formData.saleType === 'alte-licitatii' ||
      formData.saleType === 'licitatie-publica' ||
      (formData.saleType === 'licitatii-insolventa' && !formData.insolventaDirectSale)
    );

  // Definiții câmpuri dinamice pe categorii și subcategorii
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
        { key: 'numarCamere', label: 'Număr Camere *', type: 'number', required: true, placeholder: 'Ex: 3', min: 1, max: 10 },
        { key: 'numarDormitoare', label: 'Număr Dormitoare', type: 'number', required: false, placeholder: 'Ex: 2', min: 0, max: 10 },
        { key: 'numarBai', label: 'Număr Băi', type: 'number', required: false, placeholder: 'Ex: 1', min: 0, max: 10 },
        { key: 'suprafata', label: 'Suprafață (mp)', type: 'number', required: false, placeholder: 'Ex: 75', min: 0, step: 0.01 },
        { key: 'etaj', label: 'Etaj', type: 'select', required: false, options: ['Parter', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10+', 'Ultimul etaj'] },
        { key: 'anConstructie', label: 'An Construcție', type: 'number', required: false, placeholder: 'Ex: 2020', min: 1800, max: new Date().getFullYear() },
        { key: 'compartimentare', label: 'Compartimentare', type: 'select', required: false, options: ['Decomandat', 'Semidecomandat', 'Nedecomandat', 'Open Space'] },
        { key: 'mentenanta', label: 'Mențenanță (Lei/lună)', type: 'number', required: false, placeholder: 'Ex: 200', min: 0, step: 0.01 },
      ],
      'Case și Vile': [
        { key: 'numarCamere', label: 'Număr Camere *', type: 'number', required: true, placeholder: 'Ex: 5', min: 1, max: 20 },
        { key: 'numarDormitoare', label: 'Număr Dormitoare', type: 'number', required: false, placeholder: 'Ex: 3', min: 0, max: 15 },
        { key: 'numarBai', label: 'Număr Băi', type: 'number', required: false, placeholder: 'Ex: 2', min: 0, max: 10 },
        { key: 'suprafata', label: 'Suprafață Construită (mp)', type: 'number', required: false, placeholder: 'Ex: 150', min: 0, step: 0.01 },
        { key: 'suprafataTeren', label: 'Suprafață Teren (mp)', type: 'number', required: false, placeholder: 'Ex: 500', min: 0, step: 0.01 },
        { key: 'numarEtaje', label: 'Număr Etaje', type: 'number', required: false, placeholder: 'Ex: 2', min: 1, max: 5 },
        { key: 'anConstructie', label: 'An Construcție', type: 'number', required: false, placeholder: 'Ex: 2015', min: 1800, max: new Date().getFullYear() },
        { key: 'garaj', label: 'Garaj', type: 'select', required: false, options: ['Da', 'Nu'] },
      ],
      'Terenuri Intravilane': [
        { key: 'suprafata', label: 'Suprafață (mp) *', type: 'number', required: true, placeholder: 'Ex: 500', min: 0, step: 0.01 },
        { key: 'destinatie', label: 'Destinație', type: 'select', required: false, options: ['Construcție', 'Comercial', 'Industrial', 'Servicii', 'Altele'] },
        { key: 'acces', label: 'Acces', type: 'select', required: false, options: ['Asfaltat', 'Pământ', 'Fără acces'] },
        { key: 'utilitati', label: 'Utilități', type: 'select', required: false, options: ['Apa', 'Curent', 'Gaz', 'Canalizare', 'Toate', 'Niciunul'] },
      ],
      'Terenuri Agricole': [
        { key: 'suprafata', label: 'Suprafață (ha) *', type: 'number', required: true, placeholder: 'Ex: 5', min: 0, step: 0.01 },
        { key: 'tipCultivare', label: 'Tip Cultivare', type: 'select', required: false, options: ['Cereale', 'Leguminoase', 'Pășune', 'Pădure', 'Viticultură', 'Fructe', 'Altele'] },
        { key: 'acces', label: 'Acces', type: 'select', required: false, options: ['Asfaltat', 'Pământ', 'Drum forestier', 'Fără acces'] },
      ],
      'Spații Comerciale': [
        { key: 'suprafata', label: 'Suprafață (mp)', type: 'number', required: false, placeholder: 'Ex: 100', min: 0, step: 0.01 },
        { key: 'tipSpatiu', label: 'Tip Spațiu', type: 'select', required: false, options: ['Magazin', 'Showroom', 'Depozit', 'Restaurant', 'Birouri', 'Altele'] },
        { key: 'etaj', label: 'Etaj', type: 'select', required: false, options: ['Parter', '1', '2', '3', '4', '5+'] },
        { key: 'chirie', label: 'Chirie (Lei/lună)', type: 'number', required: false, placeholder: 'Ex: 2000', min: 0, step: 0.01 },
      ],
      'Hale Industriale': [
        { key: 'suprafata', label: 'Suprafață (mp)', type: 'number', required: false, placeholder: 'Ex: 1000', min: 0, step: 0.01 },
        { key: 'inaltime', label: 'Înălțime (m)', type: 'number', required: false, placeholder: 'Ex: 8', min: 0, step: 0.01 },
        { key: 'caiAcces', label: 'Căi de Acces', type: 'select', required: false, options: ['Rutier', 'Feroviar', 'Ambele', 'Rutier principal'] },
        { key: 'utilitati', label: 'Utilități', type: 'select', required: false, options: ['Apa', 'Curent', 'Gaz', 'Canalizare', 'Toate', 'Niciunul'] },
      ],
      'Proprietăți Turistice': [
        { key: 'numarCamere', label: 'Număr Camere *', type: 'number', required: true, placeholder: 'Ex: 4', min: 1, max: 20 },
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
        { key: 'tipPiesa', label: 'Tip Piesă', type: 'select', required: false, options: ['Motor', 'Transmisie', 'Suspensie', 'Caroserie', 'Interior', 'Electronice', 'Altele'] },
        { key: 'compatibilitate', label: 'Compatibilitate', type: 'text', required: false, placeholder: 'Ex: BMW X5, 2015-2020' },
        { key: 'stare', label: 'Stare', type: 'select', required: false, options: ['Nou', 'Second hand'] },
        { key: 'codOriginal', label: 'Cod Original', type: 'text', required: false, placeholder: 'Ex: 123456789' },
      ],
    },
    'Electronice & Tehnologie': {
      'Laptopuri și PC-uri': [
        { key: 'brand', label: 'Brand', type: 'text', required: false, placeholder: 'Ex: Dell' },
        { key: 'model', label: 'Model', type: 'text', required: false, placeholder: 'Ex: XPS 15' },
        { key: 'procesor', label: 'Procesor', type: 'text', required: false, placeholder: 'Ex: Intel i7' },
        { key: 'ram', label: 'RAM (GB)', type: 'select', required: false, options: ['4', '8', '16', '32', '64'] },
        { key: 'stocare', label: 'Stocare', type: 'text', required: false, placeholder: 'Ex: 512GB SSD' },
        { key: 'gpu', label: 'GPU', type: 'text', required: false, placeholder: 'Ex: NVIDIA RTX 3060' },
        { key: 'dimensiuneEcran', label: 'Dimensiune Ecran (inch)', type: 'select', required: false, options: ['13', '14', '15', '16', '17'] },
        { key: 'stare', label: 'Stare', type: 'select', required: false, options: ['Nou', 'Foarte bună', 'Bună', 'Uzată'] },
      ],
      'Telefoane Mobile': [
        { key: 'brand', label: 'Brand', type: 'text', required: false, placeholder: 'Ex: iPhone' },
        { key: 'model', label: 'Model', type: 'text', required: false, placeholder: 'Ex: 15 Pro' },
        { key: 'capacitateStocare', label: 'Capacitate Stocare (GB)', type: 'select', required: false, options: ['32', '64', '128', '256', '512', '1024'] },
        { key: 'ram', label: 'RAM (GB)', type: 'select', required: false, options: ['2', '4', '6', '8', '12', '16'] },
        { key: 'culoare', label: 'Culoare', type: 'text', required: false, placeholder: 'Ex: Negru' },
        { key: 'stare', label: 'Stare', type: 'select', required: false, options: ['Nou', 'Foarte bună', 'Bună', 'Uzată'] },
        { key: 'garantie', label: 'Garanție', type: 'select', required: false, options: ['Da', 'Nu'] },
      ],
      'Tablete': [
        { key: 'brand', label: 'Brand', type: 'text', required: false, placeholder: 'Ex: iPad' },
        { key: 'model', label: 'Model', type: 'text', required: false, placeholder: 'Ex: Pro 12.9' },
        { key: 'capacitateStocare', label: 'Capacitate Stocare (GB)', type: 'select', required: false, options: ['32', '64', '128', '256', '512', '1024'] },
        { key: 'ram', label: 'RAM (GB)', type: 'select', required: false, options: ['2', '4', '6', '8'] },
        { key: 'dimensiuneEcran', label: 'Dimensiune Ecran (inch)', type: 'select', required: false, options: ['7', '8', '9', '10', '11', '12.9'] },
        { key: 'culoare', label: 'Culoare', type: 'text', required: false, placeholder: 'Ex: Gri' },
        { key: 'stare', label: 'Stare', type: 'select', required: false, options: ['Nou', 'Foarte bună', 'Bună', 'Uzată'] },
      ],
      'TV & Audio': [
        { key: 'brand', label: 'Brand', type: 'text', required: false, placeholder: 'Ex: Samsung' },
        { key: 'dimensiuneEcran', label: 'Dimensiune Ecran (inch)', type: 'select', required: false, options: ['32', '43', '50', '55', '65', '75', '85'] },
        { key: 'tipEcran', label: 'Tip Ecran', type: 'select', required: false, options: ['LED', 'OLED', 'QLED', 'LCD', 'Plasma'] },
        { key: 'rezolutie', label: 'Rezoluție', type: 'select', required: false, options: ['HD', 'Full HD', '4K', '8K'] },
        { key: 'stare', label: 'Stare', type: 'select', required: false, options: ['Nou', 'Foarte bună', 'Bună', 'Uzată'] },
      ],
      'Console & Jocuri': [
        { key: 'brand', label: 'Brand', type: 'text', required: false, placeholder: 'Ex: Sony' },
        { key: 'model', label: 'Model', type: 'text', required: false, placeholder: 'Ex: PlayStation 5' },
        { key: 'tipConsole', label: 'Tip Console', type: 'select', required: false, options: ['PlayStation', 'Xbox', 'Nintendo', 'PC Gaming', 'Altele'] },
        { key: 'stocare', label: 'Stocare (GB)', type: 'number', required: false, placeholder: 'Ex: 1000', min: 0 },
        { key: 'stare', label: 'Stare', type: 'select', required: false, options: ['Nou', 'Foarte bună', 'Bună', 'Uzată'] },
        { key: 'garantie', label: 'Garanție', type: 'select', required: false, options: ['Da', 'Nu'] },
      ],
      'Drone & Gadgeturi Smart': [
        { key: 'brand', label: 'Brand', type: 'text', required: false, placeholder: 'Ex: DJI' },
        { key: 'model', label: 'Model', type: 'text', required: false, placeholder: 'Ex: Mavic 3' },
        { key: 'tip', label: 'Tip', type: 'select', required: false, options: ['Drone', 'Smartwatch', 'Smart Speaker', 'Altele'] },
        { key: 'autonomie', label: 'Autonomie', type: 'text', required: false, placeholder: 'Ex: 30 minute' },
        { key: 'stare', label: 'Stare', type: 'select', required: false, options: ['Nou', 'Foarte bună', 'Bună', 'Uzată'] },
      ],
      'Echipamente Foto/Video': [
        { key: 'brand', label: 'Brand', type: 'text', required: false, placeholder: 'Ex: Canon' },
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
        { key: 'brand', label: 'Brand', type: 'text', required: false, placeholder: 'Ex: Dior' },
        { key: 'model', label: 'Model', type: 'text', required: false, placeholder: 'Ex: Sauvage' },
        { key: 'tip', label: 'Tip', type: 'select', required: false, options: ['Parfum', 'Deodorant', 'Cosmetice', 'Altele'] },
        { key: 'capacitate', label: 'Capacitate (ml)', type: 'number', required: false, placeholder: 'Ex: 100', min: 0 },
        { key: 'stare', label: 'Stare', type: 'select', required: false, options: ['Nou', 'Foarte bună', 'Bună', 'Uzată'] },
      ],
      'Ceasuri de Lux': [
        { key: 'brand', label: 'Brand', type: 'text', required: false, placeholder: 'Ex: Rolex' },
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
        { key: 'brand', label: 'Brand', type: 'text', required: false, placeholder: 'Ex: Samsung' },
        { key: 'model', label: 'Model', type: 'text', required: false, placeholder: 'Ex: WW90TA046AE' },
        { key: 'tipElectrocasnic', label: 'Tip Electrocasnic', type: 'select', required: false, options: ['Mașină de spălat', 'Frigider', 'Cuptor', 'Aragaz', 'Aspirator', 'Altele'] },
        { key: 'energie', label: 'Clasă Energetică', type: 'select', required: false, options: ['A+++', 'A++', 'A+', 'A', 'B', 'C', 'D'] },
        { key: 'an', label: 'An Fabricare', type: 'number', required: false, placeholder: 'Ex: 2020', min: 2010, max: new Date().getFullYear() },
        { key: 'stare', label: 'Stare', type: 'select', required: false, options: ['Nou', 'Foarte bună', 'Bună', 'Uzată'] },
      ],
    },
    'Executări Silite': {
      'Imobile (Executări)': [
        { key: 'tipExecutare', label: 'Tip Executare', type: 'select', required: false, options: ['ANAF', 'Judecătorie', 'Bancă', 'Furnizor', 'Alte creanțe'] },
        { key: 'instanta', label: 'Instanță', type: 'text', required: false, placeholder: 'Ex: Judecătoria București' },
        { key: 'debitor', label: 'Debitor', type: 'text', required: false, placeholder: 'Nume debitor' },
        { key: 'valoareExecutare', label: 'Valoare Executare (Lei)', type: 'number', required: false, placeholder: 'Ex: 500000', min: 0 },
      ],
      'Terenuri (Executări)': [
        { key: 'tipExecutare', label: 'Tip Executare', type: 'select', required: false, options: ['ANAF', 'Judecătorie', 'Bancă', 'Furnizor', 'Alte creanțe'] },
        { key: 'suprafata', label: 'Suprafață (mp)', type: 'number', required: false, placeholder: 'Ex: 1000', min: 0, step: 0.01 },
        { key: 'instanta', label: 'Instanță', type: 'text', required: false, placeholder: 'Ex: Judecătoria București' },
      ],
      'Mașini (Executări)': [
        { key: 'tipExecutare', label: 'Tip Executare', type: 'select', required: false, options: ['ANAF', 'Judecătorie', 'Bancă', 'Furnizor', 'Alte creanțe'] },
        { key: 'marca', label: 'Marca', type: 'text', required: false, placeholder: 'Ex: BMW' },
        { key: 'model', label: 'Model', type: 'text', required: false, placeholder: 'Ex: X5' },
        { key: 'an', label: 'An Fabricare', type: 'number', required: false, placeholder: 'Ex: 2020', min: 1950, max: new Date().getFullYear() },
      ],
      'Utilaje (Executări)': [
        { key: 'tipExecutare', label: 'Tip Executare', type: 'select', required: false, options: ['ANAF', 'Judecătorie', 'Bancă', 'Furnizor', 'Alte creanțe'] },
        { key: 'tipUtilaj', label: 'Tip Utilaj', type: 'text', required: false, placeholder: 'Ex: Excavator' },
        { key: 'marca', label: 'Marca', type: 'text', required: false, placeholder: 'Ex: Caterpillar' },
      ],
      'Bunuri Personale': [
        { key: 'tipBun', label: 'Tip Bun', type: 'text', required: false, placeholder: 'Ex: Mobilier' },
        { key: 'descriere', label: 'Descriere', type: 'textarea', required: false, placeholder: 'Descriere detaliată' },
      ],
      'Acțiuni Societăți': [
        { key: 'tipExecutare', label: 'Tip Executare', type: 'select', required: false, options: ['ANAF', 'Judecătorie', 'Bancă', 'Furnizor', 'Alte creanțe'] },
        { key: 'numeSocietate', label: 'Nume Societate', type: 'text', required: false, placeholder: 'Ex: SC Example SRL' },
        { key: 'numarActiuni', label: 'Număr Acțiuni', type: 'number', required: false, placeholder: 'Ex: 1000', min: 1 },
      ],
      'Drepturi Creanțe': [
        { key: 'tipCreanta', label: 'Tip Creanță', type: 'text', required: false, placeholder: 'Ex: Creanță comercială' },
        { key: 'valoare', label: 'Valoare (Lei)', type: 'number', required: false, placeholder: 'Ex: 100000', min: 0 },
      ],
      'Alte Bunuri': [
        { key: 'tipBun', label: 'Tip Bun', type: 'text', required: false, placeholder: 'Descrie tipul de bun' },
        { key: 'descriere', label: 'Descriere', type: 'textarea', required: false, placeholder: 'Descriere detaliată' },
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
        { key: 'brand', label: 'Brand', type: 'text', required: false, placeholder: 'Ex: HP' },
        { key: 'stare', label: 'Stare', type: 'select', required: false, options: ['Nou', 'Foarte bună', 'Bună', 'Uzată'] },
      ],
      'Mobilier Comercial': [
        { key: 'tipMobilier', label: 'Tip Mobilier', type: 'select', required: false, options: ['Birou', 'Scaun', 'Dulap', 'Vitrină', 'Altele'] },
        { key: 'material', label: 'Material', type: 'text', required: false, placeholder: 'Ex: Lemn' },
        { key: 'stare', label: 'Stare', type: 'select', required: false, options: ['Nou', 'Foarte bună', 'Bună', 'Uzată'] },
      ],
      'Calculatoare Second-Hand': [
        { key: 'brand', label: 'Brand', type: 'text', required: false, placeholder: 'Ex: Dell' },
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

  // Obține câmpurile dinamice pentru categoria și subcategoria curentă
  const getDynamicFields = () => {
    if (!formData.category || !formData.subcategory) return [];
    
    // Pentru Executări Silite, mapăm subcategoriile la categoriile originale
    if (formData.category === 'Executări Silite') {
      const executionToCategoryMap: Record<string, { category: string; subcategory: string }> = {
        'Imobile (Executări)': { category: 'Imobiliare', subcategory: 'Apartamente' },
        'Terenuri (Executări)': { category: 'Imobiliare', subcategory: 'Terenuri Intravilane' },
        'Mașini (Executări)': { category: 'Autovehicule', subcategory: 'Autoturisme' },
        'Utilaje (Executări)': { category: 'Utilaje & Echipamente', subcategory: 'Utilaje Construcții' },
      };
      
      const mapping = executionToCategoryMap[formData.subcategory];
      if (mapping) {
        const categoryFields = dynamicFieldsConfig[mapping.category];
        if (categoryFields) {
          const originalFields = categoryFields[mapping.subcategory] || [];
          // Adăugăm și câmpurile specifice executărilor în față
          const executionFields = dynamicFieldsConfig[formData.category]?.[formData.subcategory] || [];
          return [...executionFields, ...originalFields];
        }
      }
    }
    
    const categoryFields = dynamicFieldsConfig[formData.category];
    if (!categoryFields) return [];
    return categoryFields[formData.subcategory] || [];
  };

  const dynamicFields = getDynamicFields();

  // Handle change pentru câmpuri dinamice
  const handleDynamicFieldChange = (key: string, value: string | number) => {
    setFormData(prev => ({
      ...prev,
      customFields: {
        ...prev.customFields,
        [key]: value
      }
    }));
  };

  // Geocode address function
  const geocodeAddress = async (address: string) => {
    if (!address || typeof window === 'undefined') return;

    // Get Google Maps API key
    const savedModules = localStorage.getItem('admin_modules');
    let apiKey = '';
    
    if (savedModules) {
      try {
        const modules = JSON.parse(savedModules);
        const googleMapsModule = modules.find((m: any) => m.id === 'google-maps');
        if (googleMapsModule?.config?.apiKey) {
          apiKey = googleMapsModule.config.apiKey;
        }
      } catch (e) {
        console.error('Error loading Google Maps config:', e);
      }
    }

    if (!apiKey) {
      apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || '';
    }

    if (!apiKey) {
      console.warn('Google Maps API key not configured');
      return;
    }

    try {
      const response = await fetch(
        `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${apiKey}`
      );
      const data = await response.json();
      
      if (data.status === 'OK' && data.results && data.results.length > 0) {
        const location = data.results[0].geometry.location;
        setFormData(prev => ({
          ...prev,
          coordinates: { lat: location.lat, lng: location.lng }
        }));
      }
    } catch (error) {
      console.error('Error geocoding address:', error);
    }
  };

  const applyMyLocationToForm = useCallback(async () => {
    if (typeof window === 'undefined' || !navigator.geolocation) {
      setMessage({ type: 'error', text: 'Browserul nu permite accesul la locație.' });
      return;
    }

    setUseMyLocationBusy(true);

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
          const matchedCounty =
            resolveLocationOption(counties, approximateLocation.county) ||
            resolveLocationOptionFromText(counties, data.formattedAddress || '');
          const approximateCoordinates = await resolveApproximateCoordinatesForListing({
            county: matchedCounty || approximateLocation.county,
            city: approximateLocation.city,
            village: approximateLocation.village,
          });

          setFormData(prev => ({
            ...prev,
            county: matchedCounty || prev.county,
            city: approximateLocation.city || approximateLocation.village || prev.city,
            coordinates: approximateCoordinates ?? prev.coordinates,
          }));

          if (!matchedCounty && !approximateLocation.city && !approximateLocation.village) {
            setMessage({ type: 'error', text: 'Am primit locația, dar nu am putut identifica automat județul/orașul. Te rog completează manual.' });
          } else {
            setMessage({
              type: 'success',
              text: 'Am completat locația aproximativă. Nu salvăm adresa exactă sau coordonatele GPS în anunț.'
            });
          }
          setTimeout(() => setMessage(null), 4500);
        } catch (error) {
          console.error('Error resolving current location:', error);
          setMessage({ type: 'error', text: 'Nu am putut transforma locația în județ și oraș. Poți completa manual.' });
        } finally {
          setUseMyLocationBusy(false);
        }
      },
      (error) => {
        console.error('Geolocation error:', error);
        setUseMyLocationBusy(false);
        setMessage({
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

  const confirmLocationPermissionModal = useCallback(() => {
    setLocationPermissionModalOpen(false);
    window.setTimeout(() => {
      void applyMyLocationToForm();
    }, 180);
  }, [applyMyLocationToForm]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    
    if (name.startsWith('seo.')) {
      const seoField = name.split('.')[1];
      setFormData(prev => ({
        ...prev,
        seo: {
          ...prev.seo,
          [seoField]: seoField === 'keywords' ? value.split(',').map(k => k.trim()) : value
        }
      }));
    } else if (name === 'category') {
      // Reset address and customFields when category changes
      const isImobiliareOrExecutionImobile = value === 'Imobiliare' || 
        (value === 'Executări Silite' && formData.subcategory === 'Imobile (Executări)');
      
      setSkuDirty(false);
      setFormData(prev => ({
        ...prev,
        [name]: value,
        subcategory: '', // Reset subcategory
        sku: '',
        address: !isImobiliareOrExecutionImobile ? undefined : prev.address,
        coordinates: !isImobiliareOrExecutionImobile ? undefined : prev.coordinates,
        customFields: {} // Reset custom fields when category changes
      }));
    } else if (name === 'subcategory') {
      // Reset customFields when subcategory changes
      // Also handle address visibility for Executări Silite -> Imobile
      const isExecutionImobile = formData.category === 'Executări Silite' && value === 'Imobile (Executări)';
      const isImobiliareCategory = formData.category === 'Imobiliare';
      
      const generatedSku = !skuDirty && value
        ? generateSku(value, getExistingSkus(editingProductId ?? undefined))
        : null;
      
      setFormData(prev => ({
        ...prev,
        [name]: value,
        sku: generatedSku !== null ? generatedSku : prev.sku,
        // Reset address if not Imobiliare or Execution Imobile
        address: (isExecutionImobile || isImobiliareCategory) ? prev.address : undefined,
        coordinates: (isExecutionImobile || isImobiliareCategory) ? prev.coordinates : undefined,
        customFields: {} // Reset custom fields when subcategory changes
      }));
      
      if (!value) {
        setSkuDirty(false);
        setIsSkuEditable(false);
      } else if (generatedSku !== null) {
        setSkuDirty(false);
        setIsSkuEditable(false);
      }
    } else if (name === 'startingPrice') {
      return;
    } else if (name === 'saleType') {
      setFormData(prev => ({
        ...prev,
        saleType: value as ProductFormData['saleType'],
        insolventaDirectSale:
          value === 'licitatii-insolventa'
            ? prev.insolventaDirectSale ?? false
            : false,
      }));
    } else if (name === 'buyNowEnabled') {
      const checked = (e.target as HTMLInputElement).checked;
      const rate = getEffectiveRate();

      setFormData(prev => {
        let nextBuyNowRon =
          prev.buyNowPriceRON ??
          (priceRon > 0 ? priceRon : null);
        let nextBuyNowEur =
          prev.buyNowPriceEUR ??
          (priceEur > 0 ? priceEur : null);

        if (checked) {
          if (nextBuyNowRon !== null && rate && nextBuyNowEur === null) {
            nextBuyNowEur = roundTo(nextBuyNowRon / rate);
          } else if (nextBuyNowEur !== null && rate && nextBuyNowRon === null) {
            nextBuyNowRon = roundTo(nextBuyNowEur * rate);
          }
    } else {
          nextBuyNowRon = null;
          nextBuyNowEur = null;
        }

        // update local state mirrors
        setBuyNowPriceRon(nextBuyNowRon);
        setBuyNowPriceEur(nextBuyNowEur);

        return {
          ...prev,
          buyNowEnabled: checked,
          buyNowPriceRON: checked ? nextBuyNowRon : null,
          buyNowPriceEUR: checked ? nextBuyNowEur : null,
        };
      });
    } else if (name === 'isFreeListing') {
      const checked = (e.target as HTMLInputElement).checked;
      setFormData(prev => ({
        ...prev,
        isFreeListing: checked,
        discountPercent: checked ? null : prev.discountPercent,
        discountValueRON: checked ? null : prev.discountValueRON,
        discountValueEUR: checked ? null : prev.discountValueEUR,
        discountedPriceRON: checked ? null : prev.discountedPriceRON,
        discountedPriceEUR: checked ? null : prev.discountedPriceEUR,
        buyNowEnabled: checked ? false : prev.buyNowEnabled,
        buyNowPriceRON: checked ? null : prev.buyNowPriceRON,
        buyNowPriceEUR: checked ? null : prev.buyNowPriceEUR,
      }));
      if (checked) {
        setBuyNowPriceRon(null);
        setBuyNowPriceEur(null);
        clearDiscounts();
      }
    } else if (name === 'isUrgent') {
      const checked = (e.target as HTMLInputElement).checked;
      setFormData(prev => ({
        ...prev,
        isUrgent: checked,
      }));
    } else if (name === 'insolventaDirectSale') {
      const checked = (e.target as HTMLInputElement).checked;
      setFormData(prev => ({
        ...prev,
        insolventaDirectSale: checked,
        auctionDate: checked ? undefined : prev.auctionDate,
      }));
    } else if (name === 'sku') {
      const sanitized = sanitizeSkuInput(value);
      const prefixBase = formData.subcategory ? (normalizeSubcategoryName(formData.subcategory) + 'XXXX').slice(0, SKU_PREFIX_LENGTH) : '';
      const suffix = sanitized.slice(SKU_PREFIX_LENGTH);
      const finalSku = prefixBase ? `${prefixBase}${suffix}`.slice(0, SKU_TOTAL_LENGTH) : sanitized;
      setSkuDirty(true);
      setFormData(prev => ({
        ...prev,
        sku: finalSku,
      }));
    } else {
      setFormData(prev => ({
        ...prev,
        [name]: name === 'auctionDate' ? value : value
      }));
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    try {
      console.log('📸 handleFileUpload called');
      const files = Array.from(e.target.files || []);
      console.log('📸 Files selected:', files.length, files.map(f => ({ name: f.name, type: f.type, size: f.size })));
      
      if (files.length === 0) {
        console.warn('⚠️ No files selected');
        return;
      }
      
      const FREE_IMAGES = 4; // 4 imagini gratuite
      const currentImageCount = formData.images.length;
      console.log('📸 Current image count:', currentImageCount);
      
      // Calculate how many images need tokens
      const imagesNeedingTokens = Math.max(0, currentImageCount + files.length - FREE_IMAGES);
      const currentImagesNeedingTokens = Math.max(0, currentImageCount - FREE_IMAGES);
      const newImagesNeedingTokens = imagesNeedingTokens - currentImagesNeedingTokens;
      
      // Check if user needs tokens for additional images
      if (newImagesNeedingTokens > 0) {
        // Store files and show modal for confirmation
        setPendingFiles(files);
        setTokensNeeded(newImagesNeedingTokens);
        setShowTokenModal(true);
        e.target.value = ''; // Reset input
        return;
      }
      
      // Check if adding these files would exceed reasonable limit (e.g., 50 total)
      const MAX_TOTAL_IMAGES = 50;
      const totalAfterUpload = currentImageCount + files.length;
      if (totalAfterUpload > MAX_TOTAL_IMAGES) {
        const allowedCount = MAX_TOTAL_IMAGES - currentImageCount;
        setMessage({ type: 'error', text: `Poți adăuga doar ${allowedCount} imagini în plus. Limita maximă este de ${MAX_TOTAL_IMAGES} imagini.` });
        e.target.value = ''; // Reset input
        return;
      }
      
      setSelectedImageFiles(prev => [...prev, ...files]);
      
      let successCount = 0;
      let errorCount = 0;
      const uploadedUrls: string[] = [];
      
      // Process files sequentially to avoid overwhelming the server
      for (let index = 0; index < files.length; index++) {
        const file = files[index];
        try {
          console.log(`📸 Processing file ${index + 1}/${files.length}:`, file.name, file.type, file.size);
          
          // Check file size (10MB max for all files)
          if (file.size > 10 * 1024 * 1024) {
            console.error(`❌ File too large: ${file.name} (${(file.size / 1024 / 1024).toFixed(2)}MB)`);
            setMessage({ type: 'error', text: `Fișierul ${file.name} este prea mare. Dimensiunea maximă este 10MB.` });
            errorCount++;
            continue;
          }

          // Check file type
          if (file.type.startsWith('image/')) {
            console.log(`📤 Uploading image to Cloudinary: ${file.name}`);
            
            // Upload to Cloudinary via /api/upload (no success message during upload)
            const uploadFormData = new FormData();
            uploadFormData.append('file', file);

            const uploadResponse = await dashboardApiFetch('/api/upload', {
              method: 'POST',
              body: uploadFormData,
            });

            if (!uploadResponse.ok) {
              let errorData: any = {};
              const contentType = uploadResponse.headers.get('content-type');
              
              try {
                if (contentType && contentType.includes('application/json')) {
                  errorData = await uploadResponse.json();
                } else {
                  const text = await uploadResponse.text();
                  console.error(`❌ Non-JSON error response for ${file.name}:`, text);
                  errorData = { error: text || `HTTP ${uploadResponse.status}: ${uploadResponse.statusText}` };
                }
              } catch (parseError) {
                console.error(`❌ Error parsing response for ${file.name}:`, parseError);
                errorData = { 
                  error: `HTTP ${uploadResponse.status}: ${uploadResponse.statusText || 'Eroare necunoscută'}` 
                };
              }
              
              console.error(`❌ Upload error for ${file.name}:`, {
                status: uploadResponse.status,
                statusText: uploadResponse.statusText,
                errorData,
              });
              
              setMessage({ 
                type: 'error', 
                text: `Eroare la încărcarea ${file.name}: ${errorData.error || `HTTP ${uploadResponse.status}`}` 
              });
              errorCount++;
              continue;
            }

            const uploadResult = await uploadResponse.json();
            
            if (uploadResult.success && uploadResult.url) {
              console.log(`✅ Image uploaded successfully to Cloudinary: ${uploadResult.url}`);
              uploadedUrls.push(uploadResult.url);
              successCount++;
            } else {
              console.error(`❌ Upload failed for ${file.name}:`, uploadResult);
              setMessage({ type: 'error', text: `Eroare la încărcarea ${file.name}` });
              errorCount++;
            }
          } else if (file.type === 'application/zip' || file.name.toLowerCase().endsWith('.zip')) {
            console.log(`📦 Handling ZIP file: ${file.name}`);
            // Handle .zip files - store file info instead of uploading
            const fileInfo = {
              name: file.name,
              size: file.size,
              type: 'zip',
              file: file
            };
            setFormData(prev => ({
              ...prev,
              images: [...prev.images, fileInfo]
            }));
            // No success message for ZIP files
            successCount++;
          } else {
            console.warn(`⚠️ Unsupported file type: ${file.name}, type: ${file.type}`);
            setMessage({ type: 'error', text: `Tipul de fișier ${file.name} nu este suportat. Vă rugăm să încărcați doar imagini sau fișiere .zip.` });
            errorCount++;
          }
        } catch (fileError) {
          console.error(`❌ Error processing file ${file.name}:`, fileError);
          errorCount++;
        }
      }
      
      // Update form data with uploaded URLs
      if (uploadedUrls.length > 0) {
        setFormData(prev => ({
          ...prev,
          images: [...prev.images, ...uploadedUrls]
        }));
      }
      
      // Deduct tokens for images beyond the free limit
      // Calculate how many images actually need tokens after upload
      const finalImageCount = currentImageCount + successCount;
      const imagesNeedingTokensAfter = Math.max(0, finalImageCount - FREE_IMAGES);
      const previousImagesNeedingTokens = Math.max(0, currentImageCount - FREE_IMAGES);
      const actualNewImagesNeedingTokens = imagesNeedingTokensAfter - previousImagesNeedingTokens;
      
      if (actualNewImagesNeedingTokens > 0 && successCount > 0) {
        const tokensToDeduct = Math.min(actualNewImagesNeedingTokens, successCount);
        try {
          const { data: sessionData } = await supabase.auth.getSession();
          const userId = sessionData.session?.user?.id;
          
          if (userId) {
            const deductResponse = await dashboardApiFetch('/api/tokens', {
              method: 'PUT',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                balance: userTokens.balance - tokensToDeduct,
                totalSpent: userTokens.totalSpent + tokensToDeduct,
              }),
            });

            if (deductResponse.ok) {
              const updatedTokens = await deductResponse.json();
              setUserTokens({
                ...userTokens,
                balance: updatedTokens.balance ?? userTokens.balance - tokensToDeduct,
                totalSpent: updatedTokens.totalSpent ?? userTokens.totalSpent + tokensToDeduct,
              });
              // Update localStorage
              localStorage.setItem('userTokens', JSON.stringify({
                ...userTokens,
                balance: updatedTokens.balance ?? userTokens.balance - tokensToDeduct,
                totalSpent: updatedTokens.totalSpent ?? userTokens.totalSpent + tokensToDeduct,
              }));
            }
          }
        } catch (tokenError) {
          console.error('Error deducting tokens:', tokenError);
        }
      }
      
      // Only show error messages if there are errors
      if (errorCount > 0) {
        setMessage({ 
          type: 'error', 
          text: `${errorCount} fișier${errorCount > 1 ? 'e' : ''} nu ${errorCount > 1 ? 'au putut' : 'a putut'} fi încărcat${errorCount > 1 ? 'e' : ''}.` 
        });
      }
      
      console.log(`📸 Upload complete: ${successCount} success, ${errorCount} errors`);
    } catch (error) {
      console.error('❌ Error in handleFileUpload:', error);
      setMessage({ type: 'error', text: `Eroare la încărcarea fișierelor: ${error instanceof Error ? error.message : 'Eroare necunoscută'}` });
    } finally {
      e.target.value = ''; // Reset input
    }
  };

  // Function to proceed with upload after token confirmation
  const proceedWithUpload = async () => {
    if (pendingFiles.length === 0) {
      setShowTokenModal(false);
      return;
    }

    // Check if user has enough tokens
    if (userTokens.balance < tokensNeeded) {
      setShowTokenModal(false);
      setMessage({ 
        type: 'error', 
        text: `Ai nevoie de ${tokensNeeded} token${tokensNeeded > 1 ? 'uri' : ''} pentru ${tokensNeeded} ${tokensNeeded > 1 ? 'poze' : 'poză'} suplimentar${tokensNeeded > 1 ? 'e' : 'ă'}. Ai ${userTokens.balance} token${userTokens.balance !== 1 ? 'uri' : ''} disponibil${userTokens.balance !== 1 ? 'e' : ''}.` 
      });
      setPendingFiles([]);
      return;
    }

    setShowTokenModal(false);
    const files = [...pendingFiles];
    setPendingFiles([]);
    
    // Create a synthetic event to trigger the upload
    const dataTransfer = new DataTransfer();
    files.forEach(file => dataTransfer.items.add(file));
    
    const syntheticEvent = {
      target: {
        files: dataTransfer.files,
        value: ''
      }
    } as React.ChangeEvent<HTMLInputElement>;
    
    // Call handleFileUpload with the files
    await handleFileUpload(syntheticEvent);
  };

  const removeImage = (index: number) => {
    setFormData(prev => ({
      ...prev,
      images: prev.images.filter((_, i) => i !== index)
    }));
    setSelectedImageFiles(prev => prev.filter((_, i) => i !== index));
  };

  const reorderImages = useCallback((fromIndex: number, toIndex: number) => {
    setFormData((prev) => ({
      ...prev,
      images: reorderArray(prev.images, fromIndex, toIndex),
    }));
    setSelectedImageFiles((prev) => {
      if (fromIndex >= prev.length || toIndex >= prev.length) return prev;
      return reorderArray(prev, fromIndex, toIndex);
    });
  }, []);

  const moveImageStep = useCallback((index: number, delta: number) => {
    setFormData((prev) => {
      const to = index + delta;
      if (to < 0 || to >= prev.images.length) return prev;
      return { ...prev, images: reorderArray(prev.images, index, to) };
    });
    setSelectedImageFiles((prev) => {
      const to = index + delta;
      if (to < 0 || to >= prev.length) return prev;
      return reorderArray(prev, index, to);
    });
  }, []);

  const {
    dragOverIndex: formImageDragOverIndex,
    getSortableTargetProps: getFormImageTargetProps,
    getSortableHandleProps: getFormImageHandleProps,
  } = useManualListingImageDnD(reorderImages);

  const handleGenerateSEO = async () => {
    // Validare: trebuie să existe cel puțin titlu și descriere
    if (!formData.title.trim() || !formData.description.trim()) {
      setMessage({ 
        type: 'error', 
        text: 'Vă rugăm să completați cel puțin titlul și descrierea pentru generare SEO automată.' 
      });
      return;
    }

    setIsGeneratingSEO(true);
    setMessage(null);

    try {
      // Extrage specificații din customFields (dacă există)
      const specificatii = Object.entries(formData.customFields || {})
        .map(([key, value]) => `${key}: ${value}`)
        .join(', ');

      const response = await dashboardApiFetch('/api/seo', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          titlu: formData.title,
          descriere: formData.description,
          specificatii: specificatii || undefined
        }),
      });

      if (!response.ok) {
        throw new Error('Eroare la generarea SEO');
      }

      const result = await response.json();
      
      if (result.success && result.data) {
        // Completează câmpurile SEO
        setFormData(prev => ({
          ...prev,
          seo: {
            title: result.data.seoTitle,
            description: result.data.seoDescription,
            keywords: result.data.seoKeywords.split(',').map((k: string) => k.trim())
          }
        }));
        
        setMessage({ 
          type: 'success', 
          text: `SEO generat cu succes! ${result.openaiAvailable ? '(folosind ChatGPT)' : '(folosind fallback local)'}` 
        });
      } else {
        throw new Error('Nu s-au putut genera date SEO');
      }
    } catch (error: any) {
      console.error('Error generating SEO:', error);
      setMessage({ 
        type: 'error', 
        text: `Eroare la generarea SEO: ${error.message}` 
      });
    } finally {
      setIsGeneratingSEO(false);
    }
  };

  const handleRewriteText = async () => {
    // Validare: trebuie să existe cel puțin titlu și descriere
    if (!formData.title.trim() || !formData.description.trim()) {
      setMessage({ 
        type: 'error', 
        text: 'Vă rugăm să completați cel puțin titlul și descrierea pentru re-scriere.' 
      });
      return;
    }

    setIsRewriting(true);
    setMessage(null);

    try {
      // Extrage specificații din customFields (dacă există)
      const specificatii = Object.entries(formData.customFields || {})
        .map(([key, value]) => `${key}: ${value}`)
        .join(', ');

      const response = await dashboardApiFetch('/api/ai-rewriter', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          titlu: formData.title,
          descriere: formData.description,
          specificatii: specificatii || undefined
        }),
      });

      if (!response.ok) {
        throw new Error('Eroare la re-scrierea textului');
      }

      const result = await response.json();
      
      if (result.success && result.data) {
        // Actualizează titlul și descrierea dacă sunt selectate
        setFormData(prev => ({
          ...prev,
          title: rewriteTitle ? result.data.newTitle : prev.title,
          description: rewriteDescription ? result.data.newDescription : prev.description,
        }));
        
        setMessage({ 
          type: 'success', 
          text: `Text rescris cu succes! Similaritate: ${(result.data.similarityScore * 100).toFixed(1)}% ${result.openaiAvailable ? '(folosind ChatGPT)' : '(folosind fallback local)'}` 
        });
      } else {
        throw new Error('Nu s-a putut rescrie textul');
      }
    } catch (error: any) {
      console.error('Error rewriting text:', error);
      setMessage({ 
        type: 'error', 
        text: `Eroare la re-scrierea textului: ${error.message}` 
      });
    } finally {
      setIsRewriting(false);
    }
  };

  const handleAutoEnhance = async () => {
    // Validare: trebuie să existe cel puțin titlu și descriere
    if (!formData.title.trim() || !formData.description.trim()) {
      setMessage({ 
        type: 'error', 
        text: 'Vă rugăm să completați cel puțin titlul și descrierea pentru îmbunătățire automată.' 
      });
      return;
    }

    setIsEnhancing(true);
    setMessage(null);

    try {
      // Extrage specificații din customFields (dacă există)
      const specificatii = Object.entries(formData.customFields || {})
        .map(([key, value]) => `${key}: ${value}`)
        .join(', ');

      const response = await dashboardApiFetch('/api/ai-product-enhancer', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          titlu: formData.title,
          descriere: formData.description,
          specificatii: specificatii || undefined
        }),
      });

      if (!response.ok) {
        throw new Error('Eroare la îmbunătățirea produsului');
      }

      const result = await response.json();
      
      if (result.success && result.data) {
        // Completează toate câmpurile automat
        setFormData(prev => ({
          ...prev,
          title: result.data.newTitle,
          description: result.data.newDescription,
          seo: {
            title: result.data.seoTitle,
            description: result.data.seoDescription,
            keywords: result.data.seoKeywords.split(',').map((k: string) => k.trim())
          }
        }));
        
        const servicesInfo: string[] = [];
        if (result.services.openaiAvailable) servicesInfo.push('ChatGPT');
        if (result.services.embeddingsAvailable) servicesInfo.push('Embeddings');
        
        setMessage({ 
          type: 'success', 
          text: `Produs îmbunătățit cu succes! Similaritate: ${(result.data.similarityScore * 100).toFixed(1)}% ${servicesInfo.length > 0 ? `(${servicesInfo.join(', ')})` : '(algoritm simplu)'}` 
        });
      } else {
        throw new Error('Nu s-au putut îmbunătăți datele produsului');
      }
    } catch (error: any) {
      console.error('Error enhancing product:', error);
      setMessage({ 
        type: 'error', 
        text: `Eroare la îmbunătățirea produsului: ${error.message}` 
      });
    } finally {
      setIsEnhancing(false);
    }
  };

  const fetchBnrRate = async (): Promise<ExchangeRatePayload> => {
    if (typeof window === 'undefined') {
      throw new Error('BNR rate available only in browser.');
    }

    const response = await fetch('https://www.bnr.ro/nbrfxrates.xml', {
      cache: 'no-store',
      mode: 'cors',
    });
    if (!response.ok) {
      throw new Error('Nu s-a putut accesa cursul BNR.');
    }

    const xmlText = await response.text();
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlText, 'application/xml');
    const eurNode = xmlDoc.querySelector('Rate[currency="EUR"]');
    if (!eurNode || !eurNode.textContent) {
      throw new Error('Cursul EUR nu este disponibil în fișierul BNR.');
    }

    const raw = eurNode.textContent.trim().replace(',', '.');
    const multiplierAttr = eurNode.getAttribute('multiplier');
    const multiplierValue = multiplierAttr ? parseFloat(multiplierAttr.replace(',', '.')) : 1;
    const parsedRate = parseFloat(raw);
    if (!Number.isFinite(parsedRate) || parsedRate <= 0) {
      throw new Error('Valoarea cursului BNR este invalidă.');
    }

    const finalRate = multiplierValue && Number.isFinite(multiplierValue) && multiplierValue > 0
      ? parsedRate / multiplierValue
      : parsedRate;

    let publishedAt: Date | null = null;
    const cubeNode = xmlDoc.querySelector('Cube');
    const dateAttr = cubeNode?.getAttribute('date');
    if (dateAttr) {
      const normalizedDate = dateAttr.includes('.') ? dateAttr.split('.').reverse().join('-') : dateAttr;
      const parsedDate = new Date(normalizedDate);
      if (!Number.isNaN(parsedDate.getTime())) {
        publishedAt = parsedDate;
      }
    }

    return { rate: roundTo(finalRate, 4), publishedAt };
  };

  const fetchFrankfurterRate = async (): Promise<ExchangeRatePayload> => {
    const response = await fetch('https://api.frankfurter.app/latest?from=EUR&to=RON');
    if (!response.ok) {
      throw new Error('Serviciul Frankfurter nu este disponibil.');
    }

    const data = await response.json();
    const rate = Number(data?.rates?.RON);
    if (!Number.isFinite(rate) || rate <= 0) {
      throw new Error('Cursul Frankfurter EUR/RON nu este disponibil.');
    }

    const parsedDate = data?.date ? new Date(data.date) : new Date();
    const publishedAt = Number.isNaN(parsedDate.getTime()) ? new Date() : parsedDate;

    return {
      rate: roundTo(rate, 4),
      publishedAt,
    };
  };

  const fetchFallbackRate = async (): Promise<ExchangeRatePayload> => {
    const response = await fetch('https://api.exchangerate.host/latest?base=EUR&symbols=RON');
    if (!response.ok) {
      throw new Error('Serviciul de curs valutar nu este disponibil.');
    }

    const data = await response.json();
    const fetchedRate = Number(data?.rates?.RON);
    if (!Number.isFinite(fetchedRate) || fetchedRate <= 0) {
      throw new Error('Nu am putut prelua cursul EUR/RON.');
    }

    return { rate: roundTo(fetchedRate, 4), publishedAt: new Date(data?.date ?? Date.now()) };
  };

  const fetchExchangeRate = async () => {
    try {
      setIsFetchingRate(true);
      setExchangeError(null);
 
      let rateData: ExchangeRatePayload | null = null;
      try {
        rateData = await fetchFrankfurterRate();
      } catch (bnrError) {
        console.warn('Cursul Frankfurter nu a putut fi preluat, se încearcă BNR.', bnrError);
        try {
          rateData = await fetchBnrRate();
        } catch (fallbackError) {
          console.warn('Cursul BNR nu a putut fi preluat, se folosește serviciul alternativ.', fallbackError);
          rateData = await fetchFallbackRate();
        }
      }
 
      const fetchedRate = rateData.rate;
      const updateDate = rateData.publishedAt ?? new Date();
 
      setExchangeRate(fetchedRate);
      setLastRateUpdate(updateDate);
 
      let recalculatedRon = 0;
      let recalculatedEur = 0;
      let recalculatedBuyNowRon: number | null = null;
      let recalculatedBuyNowEur: number | null = null;
 
      setFormData(prev => {
        const currentCurrency = prev.currency ?? 'RON';
        const prevRon = typeof prev.startingPriceRON === 'number' ? prev.startingPriceRON : priceRon;
        const prevEur = typeof prev.startingPriceEUR === 'number' ? prev.startingPriceEUR : priceEur;
 
        recalculatedRon = currentCurrency === 'EUR' ? roundTo(prevEur * fetchedRate) : prevRon;
        recalculatedEur = currentCurrency === 'RON' ? roundTo(prevRon / fetchedRate) : prevEur;

        if (prev.buyNowEnabled) {
          const prevBuyNowRon = typeof prev.buyNowPriceRON === 'number' ? prev.buyNowPriceRON : null;
          const prevBuyNowEur = typeof prev.buyNowPriceEUR === 'number' ? prev.buyNowPriceEUR : null;

          if (prevBuyNowRon !== null) {
            recalculatedBuyNowRon = roundTo(prevBuyNowRon);
            recalculatedBuyNowEur = roundTo(prevBuyNowRon / fetchedRate);
          } else if (prevBuyNowEur !== null) {
            recalculatedBuyNowEur = roundTo(prevBuyNowEur);
            recalculatedBuyNowRon = roundTo(prevBuyNowEur * fetchedRate);
          } else {
            recalculatedBuyNowRon = null;
            recalculatedBuyNowEur = null;
          }
        } else {
          recalculatedBuyNowRon = null;
          recalculatedBuyNowEur = null;
        }
 
        return {
          ...prev,
          currency: currentCurrency,
          exchangeRate: fetchedRate,
          exchangeRateUpdatedAt: updateDate.toISOString(),
          startingPriceRON: recalculatedRon,
          startingPriceEUR: recalculatedEur,
          startingPrice: currentCurrency === 'RON' ? recalculatedRon : recalculatedEur,
          buyNowPriceRON: prev.buyNowEnabled ? recalculatedBuyNowRon : null,
          buyNowPriceEUR: prev.buyNowEnabled ? recalculatedBuyNowEur : null,
        };
      });
 
      setPriceRon(recalculatedRon);
      setPriceEur(recalculatedEur);
      setBuyNowPriceRon(recalculatedBuyNowRon);
      setBuyNowPriceEur(recalculatedBuyNowEur);
 
      reapplyDiscounts(recalculatedRon, recalculatedEur);
 
      return fetchedRate;
    } catch (error: any) {
      console.error('Eroare curs EUR/RON:', error);
      setExchangeError(error?.message || 'Nu s-a putut prelua cursul EUR/RON.');
      return null;
    } finally {
      setIsFetchingRate(false);
    }
  };

  const getEffectiveRate = () => {
    const rate = exchangeRate ?? formData.exchangeRate ?? null;
    return rate && rate > 0 ? rate : null;
  };

  const handleRonInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const numeric = Number.isFinite(e.target.valueAsNumber) ? e.target.valueAsNumber : parseFloat(e.target.value.replace(',', '.'));
    if (Number.isNaN(numeric) || numeric < 0) {
      setPriceRon(0);
      setPriceEur(0);
      setFormData(prev => ({
        ...prev,
        currency: 'RON',
        startingPrice: 0,
        startingPriceRON: 0,
        startingPriceEUR: prev.startingPriceEUR,
      }));
      clearDiscounts();
      return;
    }

    const rate = getEffectiveRate();
    const convertedEur = rate ? roundTo(numeric / rate) : priceEur;

    setPriceRon(numeric);
    setPriceEur(convertedEur);
    setFormData(prev => ({
      ...prev,
      currency: 'RON',
      startingPrice: numeric,
      startingPriceRON: numeric,
      startingPriceEUR: rate ? convertedEur : prev.startingPriceEUR,
    }));

    if (numeric > 0) {
      reapplyDiscounts(numeric, convertedEur);
    } else {
      clearDiscounts();
    }

    if (rate) {
      setExchangeError(null);
    } else {
      setExchangeError('Actualizează cursul pentru conversie în EUR.');
    }
  };

  const handleEurInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const numeric = Number.isFinite(e.target.valueAsNumber) ? e.target.valueAsNumber : parseFloat(e.target.value.replace(',', '.'));
    if (Number.isNaN(numeric) || numeric < 0) {
      setPriceEur(0);
      setPriceRon(0);
      setFormData(prev => ({
        ...prev,
        currency: 'EUR',
        startingPrice: 0,
        startingPriceEUR: 0,
        startingPriceRON: prev.startingPriceRON,
      }));
      clearDiscounts();
      return;
    }
 
    const rate = getEffectiveRate();
    const convertedRon = rate ? roundTo(numeric * rate) : priceRon;
 
    setPriceEur(numeric);
    setPriceRon(convertedRon);
    setFormData(prev => ({
      ...prev,
      currency: 'EUR',
      startingPrice: numeric,
      startingPriceEUR: numeric,
      startingPriceRON: rate ? convertedRon : prev.startingPriceRON,
    }));
 
    if (convertedRon > 0) {
      reapplyDiscounts(convertedRon, numeric);
    } else {
      clearDiscounts();
    }
 
    if (rate) {
      setExchangeError(null);
    } else {
      setExchangeError('Actualizează cursul pentru conversie în Lei.');
    }
  };

  const handleBuyNowRonChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawValue = Number.isFinite(e.target.valueAsNumber)
      ? e.target.valueAsNumber
      : parseFloat(e.target.value.replace(',', '.'));

    if (Number.isNaN(rawValue) || rawValue <= 0) {
      setBuyNowPriceRon(null);
      setBuyNowPriceEur(null);
      setFormData(prev => ({
        ...prev,
        buyNowPriceRON: null,
        buyNowPriceEUR: null,
      }));
      return;
    }

    const rate = getEffectiveRate();
    const convertedEur = rate ? roundTo(rawValue / rate) : buyNowPriceEur;

    setBuyNowPriceRon(rawValue);
    setBuyNowPriceEur(convertedEur ?? null);
    setFormData(prev => ({
      ...prev,
      buyNowEnabled: true,
      buyNowPriceRON: rawValue,
      buyNowPriceEUR: convertedEur ?? prev.buyNowPriceEUR ?? null,
    }));

    if (!rate) {
      setExchangeError('Actualizează cursul pentru conversie Cumpără acum în EUR.');
    } else if (exchangeError?.includes('Cumpără acum')) {
      setExchangeError(null);
    }
  };

  const handleBuyNowEurChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawValue = Number.isFinite(e.target.valueAsNumber)
      ? e.target.valueAsNumber
      : parseFloat(e.target.value.replace(',', '.'));

    if (Number.isNaN(rawValue) || rawValue <= 0) {
      setBuyNowPriceRon(null);
      setBuyNowPriceEur(null);
      setFormData(prev => ({
        ...prev,
        buyNowPriceEUR: null,
        buyNowPriceRON: null,
      }));
      return;
    }

    const rate = getEffectiveRate();
    const convertedRon = rate ? roundTo(rawValue * rate) : buyNowPriceRon;

    setBuyNowPriceEur(rawValue);
    setBuyNowPriceRon(convertedRon ?? null);
    setFormData(prev => ({
      ...prev,
      buyNowEnabled: true,
      buyNowPriceEUR: rawValue,
      buyNowPriceRON: convertedRon ?? prev.buyNowPriceRON ?? null,
    }));

    if (!rate) {
      setExchangeError('Actualizează cursul pentru conversie Cumpără acum în Lei.');
    } else if (exchangeError?.includes('Cumpără acum')) {
      setExchangeError(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (isSubmitting) {
      return;
    }
    
    if (!formData.title || !formData.description || !formData.category || !formData.subcategory) {
      setMessage({ type: 'error', text: 'Vă rugăm să completați toate câmpurile obligatorii.' });
        return;
      }

    const isFreeListing = formData.isFreeListing === true;
    const primaryPrice = isFreeListing ? 0 : (formData.currency === 'RON' ? priceRon : priceEur);
    if (!isFreeListing && primaryPrice <= 0) {
      setMessage({ type: 'error', text: 'Prețul de pornire trebuie să fie mai mare decât 0.' });
        return;
      }

    const requiredPrefix = formData.subcategory
      ? (normalizeSubcategoryName(formData.subcategory) + 'XXXX').slice(0, SKU_PREFIX_LENGTH)
      : '';

    if (!requiredPrefix) {
      setMessage({ type: 'error', text: 'Selectează categoria și subcategoria pentru a genera SKU-ul.' });
      return;
    }

    const existingSkus = getExistingSkus(editingProductId ?? undefined);
    let ensuredSku = sanitizeSkuInput(formData.sku);
    if (ensuredSku) {
      const suffix = ensuredSku.slice(SKU_PREFIX_LENGTH);
      ensuredSku = `${requiredPrefix}${suffix}`.slice(0, SKU_TOTAL_LENGTH);
    }

    if (!ensuredSku || ensuredSku.length !== SKU_TOTAL_LENGTH || existingSkus.includes(ensuredSku)) {
      const autoSku = generateSku(formData.subcategory, existingSkus);
      if (!autoSku) {
        setMessage({ type: 'error', text: 'Nu am putut genera SKU-ul automat. Reîncarcă pagina sau încearcă din nou.' });
        return;
      }
      ensuredSku = autoSku;
      setSkuDirty(false);
      setFormData(prev => ({
        ...prev,
        sku: autoSku,
      }));
    }

    setIsSubmitting(true);

    const fail = (text: string) => {
      setMessage({ type: 'error', text });
      setIsSubmitting(false);
    };

    try {
      let effectiveRate = getEffectiveRate();
      if (!isFreeListing && (!effectiveRate || effectiveRate <= 0)) {
        const fetchedRate = await fetchExchangeRate();
        effectiveRate = fetchedRate ?? effectiveRate ?? null;
      }

      if (!isFreeListing && (!effectiveRate || effectiveRate <= 0)) {
        fail('Nu am putut obține cursul EUR/RON. Te rugăm să actualizezi cursul și să încerci din nou.');
        return;
      }

      const normalizedStartingPrice = isFreeListing ? 0 : roundTo(primaryPrice);
      const normalizedRon = isFreeListing
        ? 0
        : formData.currency === 'RON'
          ? normalizedStartingPrice
          : roundTo(normalizedStartingPrice * (effectiveRate ?? 1));
      const normalizedEur = isFreeListing
        ? 0
        : formData.currency === 'RON'
          ? roundTo(normalizedStartingPrice / (effectiveRate ?? 1))
          : normalizedStartingPrice;
      const normalizedRateUpdatedAt =
        lastRateUpdate?.toISOString() ??
        formData.exchangeRateUpdatedAt ??
        new Date().toISOString();

      const discountSummary = isFreeListing ? null : computeDiscountSummary(normalizedRon, normalizedEur);

      let normalizedBuyNowRon: number | null = null;
      let normalizedBuyNowEur: number | null = null;

      if (!isFreeListing && formData.productType === 'live-bid' && formData.buyNowEnabled) {
        const buyNowRate = effectiveRate ?? 1;
        const sourceRon = typeof buyNowPriceRon === 'number'
          ? buyNowPriceRon
          : typeof formData.buyNowPriceRON === 'number'
            ? formData.buyNowPriceRON
            : null;
        const sourceEur = typeof buyNowPriceEur === 'number'
          ? buyNowPriceEur
          : typeof formData.buyNowPriceEUR === 'number'
            ? formData.buyNowPriceEUR
            : null;

        const hasRon = sourceRon !== null && sourceRon > 0;
        const hasEur = sourceEur !== null && sourceEur > 0;

        if (!hasRon && !hasEur) {
          fail('Completează prețul "Cumpără acum" în lei sau EUR pentru a activa opțiunea.');
          return;
        }

        if (hasRon) {
          normalizedBuyNowRon = roundTo(sourceRon!);
        }
        if (hasEur) {
          normalizedBuyNowEur = roundTo(sourceEur!);
        }

        if (normalizedBuyNowRon === null && normalizedBuyNowEur !== null) {
          normalizedBuyNowRon = roundTo(normalizedBuyNowEur * buyNowRate);
        }

        if (normalizedBuyNowEur === null && normalizedBuyNowRon !== null) {
          normalizedBuyNowEur = roundTo(normalizedBuyNowRon / buyNowRate);
        }
      }

      const approximateCoordinates =
        formData.coordinates ??
        await resolveApproximateCoordinatesForListing({
          county: formData.county,
          city: formData.city,
        });

      const normalizedFormData: ProductFormData = {
        ...formData,
        sku: ensuredSku,
        startingPrice: normalizedStartingPrice,
        startingPriceRON: normalizedRon,
        startingPriceEUR: normalizedEur,
        currency: formData.currency,
        exchangeRate: effectiveRate ?? formData.exchangeRate ?? 1,
        exchangeRateUpdatedAt: normalizedRateUpdatedAt,
        discountPercent: discountSummary?.percent ?? null,
        discountValueRON: discountSummary?.valueRon ?? null,
        discountValueEUR: discountSummary?.valueEur ?? null,
        discountedPriceRON: discountSummary?.finalRon ?? null,
        discountedPriceEUR: discountSummary?.finalEur ?? null,
        productLocation: formData.productLocation?.trim() || '',
        auctionLocation: formData.auctionLocation?.trim() || '',
        auctionRegistrationDate:
          formData.productType === 'licitatii-publice'
            ? formData.auctionRegistrationDate || ''
            : undefined,
        buyNowEnabled: !isFreeListing && formData.productType === 'live-bid' ? formData.buyNowEnabled ?? false : false,
        buyNowPriceRON:
          formData.productType === 'live-bid' && formData.buyNowEnabled ? normalizedBuyNowRon : null,
        buyNowPriceEUR:
          formData.productType === 'live-bid' && formData.buyNowEnabled ? normalizedBuyNowEur : null,
        coordinates: approximateCoordinates,
        documents: formData.documents || [],
      };

      if (!isFreeListing) {
        setPriceRon(normalizedRon);
        setPriceEur(normalizedEur);
      }
      setBuyNowPriceRon(normalizedFormData.buyNowPriceRON ?? null);
      setBuyNowPriceEur(normalizedFormData.buyNowPriceEUR ?? null);

      const requiredDynamicFields = dynamicFields.filter(f => f.required);
      const missingRequiredFields = requiredDynamicFields.filter(field => {
        const value = normalizedFormData.customFields?.[field.key];
        return value === undefined || value === null || value === '' || value === 0;
      });

      if (missingRequiredFields.length > 0) {
        fail(`Vă rugăm să completați câmpurile obligatorii: ${missingRequiredFields.map(f => f.label).join(', ')}`);
        return;
      }

      let finalFormData = normalizedFormData;

    // Auto-enhance: rescrie titlul, descrierea și generează SEO
    if (autoEnhance) {
      setIsEnhancing(true);
      setMessage({ type: 'success', text: 'Se procesează îmbunătățirile...' });

      try {
          const specificatii = Object.entries(normalizedFormData.customFields || {})
          .map(([key, value]) => `${key}: ${value}`)
          .join(', ');

        const response = await dashboardApiFetch('/api/ai-product-enhancer', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
              titlu: normalizedFormData.title,
              descriere: normalizedFormData.description,
              specificatii: specificatii || undefined,
          }),
        });

        if (response.ok) {
          const result = await response.json();
          if (result.success && result.data) {
            finalFormData = {
                ...normalizedFormData,
              title: rewriteTitle ? result.data.newTitle : normalizedFormData.title,
              description: rewriteDescription ? result.data.newDescription : normalizedFormData.description,
              seo: {
                title: result.data.seoTitle,
                description: result.data.seoDescription,
                  keywords: result.data.seoKeywords.split(',').map((k: string) => k.trim()),
                },
            };
            setFormData(finalFormData);
          }
        }
      } catch (error) {
        console.error('Error auto-enhancing on save:', error);
      } finally {
        setIsEnhancing(false);
      }
    } else {
      // Generate SEO automatically even if autoEnhance is disabled
      // Only generate SEO if title and description exist and SEO fields are empty
      if (normalizedFormData.title.trim() && normalizedFormData.description.trim() && 
          (!normalizedFormData.seo?.title || !normalizedFormData.seo?.description)) {
        try {
          const specificatii = Object.entries(normalizedFormData.customFields || {})
            .map(([key, value]) => `${key}: ${value}`)
            .join(', ');

          const response = await dashboardApiFetch('/api/seo', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              titlu: normalizedFormData.title,
              descriere: normalizedFormData.description,
              specificatii: specificatii || undefined,
            }),
          });

          if (response.ok) {
            const result = await response.json();
            if (result.success && result.data) {
              finalFormData = {
                ...normalizedFormData,
                seo: {
                  title: normalizedFormData.seo?.title || result.data.seoTitle,
                  description: normalizedFormData.seo?.description || result.data.seoDescription,
                  keywords: normalizedFormData.seo?.keywords?.length ? normalizedFormData.seo.keywords : result.data.seoKeywords.split(',').map((k: string) => k.trim()),
                },
              };
            }
          }
        } catch (error) {
          console.error('Error auto-generating SEO on save:', error);
          // Continue with save even if SEO generation fails
        }
      }
    }

      let baseSlug = (finalFormData.slug || formData.slug || '').trim();
      if (!baseSlug) {
        baseSlug = slugify(finalFormData.title || '').slice(0, 60);
      }
      if (!baseSlug) {
        baseSlug = `produs-${Date.now().toString(36)}`;
      }

      const normalizeSlugValue = (value: string) =>
        value
          .toLowerCase()
          .replace(/[^a-z0-9-]/g, '-')
          .replace(/-+/g, '-')
          .replace(/^-|-$/g, '')
          .slice(0, 60);

      let uniqueSlug = normalizeSlugValue(baseSlug);
      if (!uniqueSlug) {
        uniqueSlug = `produs-${Date.now().toString(36)}`;
      }

      for (let attempt = 0; attempt < 5; attempt++) {
        const slugQuery = supabase
          .from('products')
          .select('id')
          .eq('slug', uniqueSlug)
          .limit(1);

        if (editingProductId) {
          slugQuery.neq('id', editingProductId);
        }

        const { data: slugRows, error: slugError } = await slugQuery;
        if (slugError) {
          console.warn('Nu am putut verifica unicitatea slug-ului:', slugError);
          break;
        }

        if (!slugRows || slugRows.length === 0) {
          break;
        }

        uniqueSlug = normalizeSlugValue(`${baseSlug}-${Math.random().toString(36).slice(2, 6)}`);
      }

      const finalUrl = `/auctions/${uniqueSlug}`;

      finalFormData = {
        ...finalFormData,
        slug: uniqueSlug,
        url: finalUrl,
      };

      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError) {
        console.warn('Nu am putut obține utilizatorul curent din Supabase:', userError);
      }

      const userId = userData?.user?.id ?? null;

      if (!userId) {
        console.warn('Nu există un utilizator autentificat, inserarea produsului a fost oprită.');
        fail('Trebuie să fii autentificat pentru a salva produsul. Te rog reconectează-te.');
        setIsSubmitting(false);
        return;
      }

      // Process images: upload data URLs to Cloudinary, keep existing Cloudinary URLs
      // Note: New images are already uploaded to Cloudinary in handleFileUpload,
      // but we still handle data URLs here for compatibility (e.g., when editing existing products)
      const uploadedImageUrls: string[] = [];
      const imagesToProcess = finalFormData.images || [];
      
      console.log('📸 Processing images for save:', imagesToProcess.length, 'images');
      
      for (let i = 0; i < imagesToProcess.length; i++) {
        const image = imagesToProcess[i];
        
        // Check if it's a data URL (legacy or from editing - needs to be uploaded to Cloudinary)
        if (typeof image === 'string' && image.startsWith('data:image/')) {
          try {
            console.log(`📤 Uploading new image ${i + 1}/${imagesToProcess.length}...`);
            // Convert data URL to blob
            const response = await fetch(image);
            const blob = await response.blob();
            
            // Create a File object from the blob
            const fileExtension = image.split(';')[0].split('/')[1] || 'jpg';
            const fileName = `image-${Date.now()}-${i}.${fileExtension}`;
            const file = new File([blob], fileName, { type: blob.type });
            
            // Upload using the /api/upload endpoint
            const formData = new FormData();
            formData.append('file', file);

            const uploadResponse = await dashboardApiFetch('/api/upload', {
              method: 'POST',
              body: formData,
            });

            if (!uploadResponse.ok) {
              const errorData = await uploadResponse.json();
              console.error('❌ Upload error for image:', errorData);
              // Continue with other images even if one fails
              continue;
            }

            const uploadResult = await uploadResponse.json();
            
            if (uploadResult.success && uploadResult.url) {
              console.log('✅ Image uploaded successfully:', uploadResult.url);
              uploadedImageUrls.push(uploadResult.url);
            } else {
              console.error('❌ Upload failed for image:', uploadResult);
            }
          } catch (error) {
            console.error('❌ Error uploading image:', error);
            // Continue with other images even if one fails
          }
        } else if (typeof image === 'string') {
          // Already a URL, keep it
          console.log('📋 Keeping existing image URL:', image);
          uploadedImageUrls.push(image);
        } else {
          // It's a file object (ZIP or other), keep as is
          console.log('📦 Keeping file object:', image);
          uploadedImageUrls.push(image as any);
        }
      }
      
      console.log('✅ Final images array:', uploadedImageUrls.length, 'images', uploadedImageUrls);

      // Update finalFormData with uploaded image URLs
      finalFormData = {
        ...finalFormData,
        images: uploadedImageUrls,
      };

      // Sanitize images - ensure all are strings (URLs) for Supabase JSONB storage
      const sanitizedImages = (finalFormData.images || []).map((image) => {
        // If it's already a string URL, keep it as is
        if (typeof image === 'string') {
          return image;
        }
        // If it's an object with url property, extract the URL
        if (typeof image === 'object' && image !== null) {
          if ('url' in image && typeof image.url === 'string') {
            return image.url;
          }
          // If no URL, try to convert to string (for ZIP files or other)
          const { name, size, type } = image as any;
          const base: Record<string, any> = { name, size, type };
          if ('url' in image && image.url) {
            base.url = image.url;
          }
          if ('previewUrl' in image && image.previewUrl) {
            base.previewUrl = image.previewUrl;
          }
          return base;
        }
        // Fallback: convert to string
        return String(image);
      }).filter((img) => {
        // Filter out empty or invalid images
        if (typeof img === 'string') {
          return img.trim() !== '';
        }
        return img !== null && img !== undefined;
      });

      console.log('🧹 Sanitized images:', sanitizedImages.length, sanitizedImages);

      const existingDocuments = finalFormData.documents || [];
      const uploadedDocuments: Array<{ name: string; url?: string; size?: number; type?: string }> = [];

      if (documentUploads.length > 0) {
        const userKey = userId || 'anonymous';

        for (const file of documentUploads) {
          const sanitizedName = file.name.replace(/[^a-zA-Z0-9_.-]/g, '_');
          const uniqueSuffix = Math.random().toString(36).slice(2, 8);
          const storagePath = `licitation-docs/${userKey}/${Date.now()}-${uniqueSuffix}-${sanitizedName}`;

          const { error: uploadError } = await supabase.storage
            .from('product-documents')
            .upload(storagePath, file, {
              cacheControl: '3600',
              upsert: true,
              contentType: file.type,
            });

          if (uploadError) {
            console.error('Supabase storage upload error:', uploadError);
            fail('Nu am putut încărca documentele PDF. Încearcă din nou sau contactează un administrator.');
            return;
          }

          const { data: publicUrlData } = supabase.storage
            .from('product-documents')
            .getPublicUrl(storagePath);

          uploadedDocuments.push({
            name: file.name,
            url: publicUrlData?.publicUrl,
            size: file.size,
            type: file.type,
          });
        }
      }

      finalFormData = {
        ...finalFormData,
        documents: [...existingDocuments, ...uploadedDocuments],
      };

      console.log('💾 Preparing payload with images:', sanitizedImages.length, sanitizedImages);

      // Build payload - only include fields that exist in the database schema
      // Based on migration 20251115_products_custom_fields.sql
      const payload: Record<string, any> = {
        title: finalFormData.title,
        description: finalFormData.description,
        category: finalFormData.category,
        subcategory: finalFormData.subcategory,
        sku: finalFormData.sku,
        starting_price: finalFormData.startingPrice,
        starting_price_ron: finalFormData.startingPriceRON,
        starting_price_eur: finalFormData.startingPriceEUR,
        currency: finalFormData.currency,
        product_type: finalFormData.productType,
        sale_type: finalFormData.saleType,
        status: finalFormData.status,
        county: finalFormData.county || null,
        city: finalFormData.city || null,
        address: finalFormData.address || null,
        coordinates: finalFormData.coordinates ?? null,
        product_location: finalFormData.productLocation || null,
        auction_location: finalFormData.auctionLocation || null,
        auction_date: finalFormData.auctionDate || null,
        auction_registration_date: finalFormData.auctionRegistrationDate || null,
        images: sanitizedImages, // JSONB array - must be array
        custom_fields: finalFormData.customFields ?? {}, // JSONB object
        seo: finalFormData.seo ?? { title: '', description: '', keywords: [] }, // JSONB object
        documents: finalFormData.documents ?? [], // JSONB array
        slug: finalFormData.slug,
        url: finalFormData.url,
      };

      // Store additional fields in custom_fields if they don't exist in schema
      // These fields will be accessible via custom_fields JSONB
      const additionalFields: Record<string, any> = {};
      if (finalFormData.exchangeRate) additionalFields.exchange_rate = finalFormData.exchangeRate;
      if (finalFormData.exchangeRateUpdatedAt) additionalFields.exchange_rate_updated_at = finalFormData.exchangeRateUpdatedAt;
      if (finalFormData.discountPercent !== null) additionalFields.discount_percent = finalFormData.discountPercent;
      if (finalFormData.discountValueRON !== null) additionalFields.discount_value_ron = finalFormData.discountValueRON;
      if (finalFormData.discountValueEUR !== null) additionalFields.discount_value_eur = finalFormData.discountValueEUR;
      if (finalFormData.discountedPriceRON !== null) additionalFields.discounted_price_ron = finalFormData.discountedPriceRON;
      if (finalFormData.discountedPriceEUR !== null) additionalFields.discounted_price_eur = finalFormData.discountedPriceEUR;
      if (finalFormData.insolventaDirectSale !== undefined) additionalFields.insolventa_direct_sale = finalFormData.insolventaDirectSale;
      if (finalFormData.buyNowEnabled !== undefined) additionalFields.buy_now_enabled = finalFormData.buyNowEnabled;
      if (finalFormData.buyNowPriceRON !== null) additionalFields.buy_now_price_ron = finalFormData.buyNowPriceRON;
      if (finalFormData.buyNowPriceEUR !== null) additionalFields.buy_now_price_eur = finalFormData.buyNowPriceEUR;
      if (finalFormData.coordinates) additionalFields.coordinates = finalFormData.coordinates;
      additionalFields.is_free_listing = finalFormData.isFreeListing === true;
      additionalFields.isFreeListing = finalFormData.isFreeListing === true;
      additionalFields.is_urgent = finalFormData.isUrgent === true;
      additionalFields.isUrgent = finalFormData.isUrgent === true;

      // Merge additional fields into custom_fields
      if (Object.keys(additionalFields).length > 0) {
        payload.custom_fields = {
          ...payload.custom_fields,
          ...additionalFields,
        };
      }

      console.log('📤 Payload images field:', JSON.stringify(payload.images).substring(0, 200));

      let insertedProduct = null;
      let insertError = null;

      if (editingProductId) {
        console.log('🔄 Updating product:', editingProductId);
        
        // Ensure images is a proper JSON array for JSONB column
        const imagesArray = Array.isArray(sanitizedImages) ? sanitizedImages : [];
        
        // Validate images array - ensure all are strings
        const validatedImages = imagesArray.filter((img): img is string => {
          if (typeof img === 'string' && img.trim() !== '') {
            return true;
          }
          console.warn('⚠️ Invalid image in array, filtering out:', img);
          return false;
        });
        
        console.log('📸 Sanitized images count:', sanitizedImages.length);
        console.log('📸 Validated images count:', validatedImages.length);
        console.log('📸 Validated images:', validatedImages);
        
        // Build update payload with ONLY fields that exist in the schema
        // Based on migration 20251115_products_custom_fields.sql
        const updatePayload: Record<string, any> = {
          title: payload.title,
          description: payload.description,
          category: payload.category,
          subcategory: payload.subcategory,
          sku: payload.sku,
          starting_price: payload.starting_price,
          starting_price_ron: payload.starting_price_ron,
          starting_price_eur: payload.starting_price_eur,
          currency: payload.currency,
          product_type: payload.product_type,
          sale_type: payload.sale_type,
          status: payload.status,
          county: payload.county,
          city: payload.city,
          address: payload.address,
          product_location: payload.product_location,
          auction_location: payload.auction_location,
          auction_date: payload.auction_date,
          auction_registration_date: payload.auction_registration_date,
          images: validatedImages, // JSONB array - ensure it's a valid array of strings
          custom_fields: payload.custom_fields || {}, // JSONB object - ensure it's an object
          seo: payload.seo || { title: '', description: '', keywords: [] }, // JSONB object
          documents: Array.isArray(payload.documents) ? payload.documents : [], // JSONB array
          slug: payload.slug,
          url: payload.url,
        };

        // IMPORTANT: Nu modificăm slug și url la actualizare prin acest formular.
        // URL-ul se poate modifica doar explicit din pagina de listă (butonul "Editare URL").
        delete updatePayload.slug;
        delete updatePayload.url;
        
        // CRITICAL: Ensure images is always a valid JSON array (not null, not undefined)
        // Supabase JSONB columns require explicit array format
        if (!Array.isArray(updatePayload.images)) {
          console.warn('⚠️ Images is not an array, converting to array');
          updatePayload.images = [];
        }
        
        // Ensure images array contains only strings
        updatePayload.images = updatePayload.images.filter((img: any) => {
          const isValid = typeof img === 'string' && img.trim() !== '';
          if (!isValid) {
            console.warn('⚠️ Filtering out invalid image:', img);
          }
          return isValid;
        });
        
        // Remove any undefined or null values
        Object.keys(updatePayload).forEach(key => {
          const value = updatePayload[key];
          if (value === undefined) {
            delete updatePayload[key];
          }
          // Convert null to appropriate defaults for JSONB fields
          if (value === null && (key === 'images' || key === 'custom_fields' || key === 'seo' || key === 'documents')) {
            if (key === 'images') updatePayload[key] = [];
            else if (key === 'custom_fields') updatePayload[key] = {};
            else if (key === 'seo') updatePayload[key] = { title: '', description: '', keywords: [] };
            else if (key === 'documents') updatePayload[key] = [];
          }
        });
        
        // Final validation: ensure images is a proper array
        if (!Array.isArray(updatePayload.images)) {
          console.error('❌ CRITICAL: Images is still not an array after processing!', updatePayload.images);
          updatePayload.images = [];
        }
        
        console.log('📤 Update payload images:', updatePayload.images);
        console.log('📤 Update payload images count:', updatePayload.images?.length);
        console.log('📤 Update payload images type:', typeof updatePayload.images, Array.isArray(updatePayload.images));
        console.log('📤 Update payload keys:', Object.keys(updatePayload));
        console.log('📤 Full update payload:', JSON.stringify(updatePayload, null, 2));
        
        // CRITICAL: Log the exact payload being sent
        console.log('🚀 SENDING UPDATE TO SUPABASE:');
        console.log('🚀 Product ID:', editingProductId);
        console.log('🚀 Images in payload:', JSON.stringify(updatePayload.images));
        console.log('🚀 Images count:', updatePayload.images?.length);
        console.log('🚀 Full payload (first 2000 chars):', JSON.stringify(updatePayload).substring(0, 2000));
        
        // Use API endpoint with supabaseAdmin to bypass RLS
        const updateResponse = await dashboardApiFetch('/api/admin/products/update', {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            id: editingProductId,
            ...updatePayload,
          }),
        });

        const updateResult = await updateResponse.json();
        const updatedProduct = updateResult.data;
        const updateError = updateResult.error ? { message: updateResult.error } : null;

        console.log('📡 UPDATE RESPONSE FROM SUPABASE:');
        console.log('📡 Error:', updateError);
        console.log('📡 Updated product:', updatedProduct);
        console.log('📡 Images in response:', updatedProduct?.images);
        console.log('📡 Images type in response:', typeof updatedProduct?.images, Array.isArray(updatedProduct?.images));

        if (updateError) {
          console.error('❌ Update error:', updateError);
          console.error('❌ Error details:', JSON.stringify(updateError, null, 2));
          insertError = updateError;
        } else {
          console.log('✅ Product updated successfully:', updatedProduct);
          console.log('📸 Images in updated product:', updatedProduct?.images);
          insertedProduct = updatedProduct ?? { id: editingProductId, ...payload };
          
          // CRITICAL: Verify images were actually saved by re-fetching
          if (editingProductId) {
            console.log('🔄 Re-fetching product IMMEDIATELY to verify save...');
            
            // Try multiple times with delays to ensure DB commit
            for (let attempt = 1; attempt <= 3; attempt++) {
              await new Promise(resolve => setTimeout(resolve, 300 * attempt));
              
              console.log(`🔄 Re-fetch attempt ${attempt}/3...`);
              const { data: refetchedProduct, error: refetchError } = await supabase
                .from('products')
                .select('*')
                .eq('id', editingProductId)
                .maybeSingle();
              
              if (!refetchError && refetchedProduct) {
                console.log(`✅ Re-fetch attempt ${attempt} successful:`, refetchedProduct);
                console.log(`📸 Images in re-fetched product (attempt ${attempt}):`, refetchedProduct.images);
                console.log(`📸 Images count (attempt ${attempt}):`, refetchedProduct.images?.length);
                
                // Update formData with the re-fetched images
                if (refetchedProduct.images && Array.isArray(refetchedProduct.images) && refetchedProduct.images.length > 0) {
                  const processedImages = refetchedProduct.images.map((img: any) => {
                    if (typeof img === 'string') return img;
                    if (typeof img === 'object' && img !== null && img.url) return img.url;
                    return String(img);
                  }).filter((url: string) => url && url.trim() !== '');
                  
                  console.log('📸 Processed images for formData:', processedImages);
                  
                  // Use functional update to ensure we don't lose other formData
                  setFormData(prev => {
                    const updated = {
                      ...prev,
                      images: processedImages,
                    };
                    console.log('📸 ✅ Updated formData with images:', updated.images);
                    return updated;
                  });
                  
                  // Mark that we just updated to prevent useEffect from reloading
                  setJustUpdated(true);
                  
                  // Break on success
                  break;
                } else {
                  console.warn(`⚠️ No images in re-fetched product (attempt ${attempt})`);
                  if (attempt === 3) {
                    console.error('❌ CRITICAL: Images were NOT saved to database after 3 attempts!');
                    console.error('❌ Expected images:', validatedImages);
                    console.error('❌ Received images:', refetchedProduct.images);
                    // Even if images weren't found, mark as updated to prevent reload
                    setJustUpdated(true);
                  }
                }
              } else if (refetchError) {
                console.error(`⚠️ Error re-fetching product (attempt ${attempt}):`, refetchError);
                if (attempt === 3) {
                  // Mark as updated even on error to prevent infinite reload loop
                  setJustUpdated(true);
                }
              } else {
                console.warn(`⚠️ Re-fetched product is null (attempt ${attempt})`);
                if (attempt === 3) {
                  setJustUpdated(true);
                }
              }
            }
          }
        }
      } else {
        console.log('➕ Creating new product');
        console.log('📋 Full payload:', JSON.stringify(payload, null, 2));
        
        // Ensure images is a proper JSON array for JSONB column
        const imagesArray = Array.isArray(sanitizedImages) ? sanitizedImages : [];
        
        // Build insert payload with ONLY fields that exist in the schema
        const insertPayload: Record<string, any> = {
          title: payload.title,
          description: payload.description,
          category: payload.category,
          subcategory: payload.subcategory,
          sku: payload.sku,
          starting_price: payload.starting_price,
          starting_price_ron: payload.starting_price_ron,
          starting_price_eur: payload.starting_price_eur,
          currency: payload.currency,
          product_type: payload.product_type,
          sale_type: payload.sale_type,
          status: payload.status,
          county: payload.county,
          city: payload.city,
          address: payload.address,
          product_location: payload.product_location,
          auction_location: payload.auction_location,
          auction_date: payload.auction_date,
          auction_registration_date: payload.auction_registration_date,
          images: imagesArray, // JSONB array
          custom_fields: payload.custom_fields, // JSONB object
          seo: payload.seo, // JSONB object
          documents: payload.documents, // JSONB array
          slug: payload.slug,
          url: payload.url,
          user_id: userId, // Add user_id for user dashboard
          approval_status: 'pending', // Produsele user-ului necesită aprobare
        };
        
        // Remove any undefined or null values
        Object.keys(insertPayload).forEach(key => {
          const value = insertPayload[key];
          if (value === undefined) {
            delete insertPayload[key];
          }
          // Convert null to appropriate defaults for JSONB fields
          if (value === null && (key === 'images' || key === 'custom_fields' || key === 'seo' || key === 'documents')) {
            if (key === 'images') insertPayload[key] = [];
            else if (key === 'custom_fields') insertPayload[key] = {};
            else if (key === 'seo') insertPayload[key] = { title: '', description: '', keywords: [] };
            else if (key === 'documents') insertPayload[key] = [];
          }
        });
        
        console.log('📤 Insert payload images:', insertPayload.images);
        console.log('📤 Insert payload keys:', Object.keys(insertPayload));
        
        const { data: createdProduct, error: createError } = await supabase
          .from('products')
          .insert(insertPayload)
          .select()
          .maybeSingle();

        if (createError) {
          console.error('❌ Create error:', createError);
        } else {
          console.log('✅ Product created successfully:', createdProduct);
          console.log('📸 Images in created product:', createdProduct?.images);
        }
        insertError = createError;
        insertedProduct = createdProduct;
      }

      if (insertError) {
        const errorObject = insertError as Record<string, any>;
        const hasMessage = typeof errorObject?.message === 'string' && errorObject.message.trim().length > 0;
        const hasCode = typeof errorObject?.code === 'string' && errorObject.code.trim().length > 0;
        const hasDetails = errorObject && Object.keys(errorObject).length > 0;
        const isGenuineError = hasMessage || hasCode || hasDetails || typeof insertError !== 'object';

        if (isGenuineError) {
          console.error('Supabase insert error:', insertError);
          const message = hasMessage
            ? errorObject!.message
            : 'Nu am putut salva produsul în baza de date. Încearcă din nou.';
          fail(message);
          return;
        }
      }

      if (!insertedProduct) {
        const { data: fetchedProduct, error: fetchError } = await supabase
          .from('products')
          .select('*')
          .eq('slug', finalFormData.slug)
          .maybeSingle();

        if (!fetchError && fetchedProduct) {
          insertedProduct = fetchedProduct;
        } else {
          insertedProduct = { id: editingProductId ?? null, ...payload };
        }
      }

      if (insertedProduct?.id || ensuredSku) {
        const productId = insertedProduct?.id ?? editingProductId ?? null;
        const skuToStore = sanitizeSkuInput(insertedProduct?.sku ?? ensuredSku);
        if (skuToStore) {
          setExistingProductSkus(prev => {
            const filtered = prev.filter(item => item.id !== productId && item.sku !== skuToStore);
            return [...filtered, { id: productId, sku: skuToStore }];
          });
        }

        // Run automatic risk analysis for live-bid products (user products)
        if (productId && payload.product_type === 'live-bid') {
          try {
            console.log('🔍 [Auto Risk Analysis] Starting risk analysis for product:', productId);
            // Use internal endpoint that doesn't require admin auth
            const riskResponse = await dashboardApiFetch('/api/admin/products/auto-risk-analysis', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                productId: productId,
              }),
            });

            if (riskResponse.ok) {
              const riskResult = await riskResponse.json();
              console.log('✅ [Auto Risk Analysis] Risk analysis completed. Score:', riskResult.riskScore, 'Status:', riskResult.approvalStatus);
              // Risk score is automatically saved by the API endpoint
            } else {
              const errorText = await riskResponse.text();
              console.error('⚠️ [Auto Risk Analysis] Risk analysis failed:', errorText);
            }
          } catch (riskError) {
            console.error('⚠️ [Auto Risk Analysis] Error running risk analysis:', riskError);
            // Don't fail the product creation if risk analysis fails
          }
        }
      }

      setMessage({ type: 'success', text: 'Produsul a fost salvat cu succes!' });
      setIsSubmitting(false);
      setDocumentUploads([]);
      
      // Reset justUpdated flag after a delay to allow re-fetch to complete
      // This prevents useEffect from reloading the product and overwriting the updated images
      if (editingProductId) {
        // The flag is already set in the re-fetch logic above
        // Reset it after 3 seconds to allow future reloads if needed
        setTimeout(() => {
          setJustUpdated(false);
          console.log('🔄 Reset justUpdated flag - product can be reloaded again');
        }, 3000);
      }
      
      // După salvare (creare sau actualizare), mergem înapoi la dashboard-ul user-ului
      setTimeout(() => {
        router.push('/dashboard');
      }, 800);
    } catch (error) {
      console.error('Error saving product:', error);
      fail('A apărut o eroare neașteptată. Încearcă din nou.');
    }
  };

  useEffect(() => {
    fetchExchangeRate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (priceRon > 0) {
      reapplyDiscounts(priceRon, priceEur);
    } else {
      clearDiscounts();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [priceRon, priceEur]);

  const effectiveRateValue = getEffectiveRate();
  const inverseRateValue = effectiveRateValue && effectiveRateValue > 0 ? roundTo(1 / effectiveRateValue, 4) : null;
  const fallbackRateDate = !lastRateUpdate && formData.exchangeRateUpdatedAt
    ? (() => {
        try {
          return new Date(formData.exchangeRateUpdatedAt);
        } catch {
                return null;
        }
      })()
    : null;
  const lastRateDateToDisplay = lastRateUpdate || fallbackRateDate;
  const discountInputsDisabled = formData.isFreeListing === true || priceRon <= 0;
  const derivedDiscountValueEur =
    discountValueEur ??
    (discountValueRon !== null && priceRon > 0 && priceEur > 0
      ? roundTo((discountValueRon / priceRon) * priceEur)
      : null);
  const derivedDiscountedPriceEur =
    discountedPriceEur ??
    (discountedPriceRon !== null && priceRon > 0 && priceEur > 0
      ? roundTo(Math.max(priceEur - ((discountValueRon ?? 0) / (priceRon > 0 ? priceRon : 1)) * priceEur, 0))
      : discountPercent !== null && priceEur > 0
        ? roundTo(priceEur)
        : null);
  const totalDocumentsCount = (formData.documents?.length || 0) + documentUploads.length;
  const remainingDocumentSlots = Math.max(MAX_DOCUMENTS - totalDocumentsCount, 0);
  const isDocumentRequirementActive = formData.productType === 'licitatii-publice';
  const documentUploadDisabled = !isDocumentRequirementActive || remainingDocumentSlots <= 0;

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

  const calculateDiscount = ({
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
    const rate = getEffectiveRate() ?? fallbackRate;

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

  const updateDiscounts = ({
    percent,
    valueRon,
    finalPriceRon,
    baseRon = priceRon,
    baseEur = priceEur,
  }: DiscountUpdateInput) => {
    const summary = calculateDiscount({
      baseRon,
      baseEur,
      percent: percent ?? null,
      valueRon: valueRon ?? null,
      finalPriceRon: finalPriceRon ?? null,
    });

    if (!summary) {
      clearDiscounts();
      return;
    }

    setDiscountPercent(summary.percent);
    setDiscountValueRon(summary.valueRon);
    setDiscountValueEur(summary.valueEur);
    setDiscountedPriceRon(summary.finalRon);
    setDiscountedPriceEur(summary.finalEur);

    setFormData(prev => {
      if (
        prev.discountPercent === summary.percent &&
        prev.discountValueRON === summary.valueRon &&
        prev.discountValueEUR === summary.valueEur &&
        prev.discountedPriceRON === summary.finalRon &&
        prev.discountedPriceEUR === summary.finalEur
      ) {
        return prev;
      }

      return {
        ...prev,
        discountPercent: summary.percent,
        discountValueRON: summary.valueRon,
        discountValueEUR: summary.valueEur,
        discountedPriceRON: summary.finalRon,
        discountedPriceEUR: summary.finalEur,
      };
    });
  };

  const reapplyDiscounts = (baseRon: number, baseEur: number) => {
    if (discountPercent !== null) {
      updateDiscounts({ percent: discountPercent, baseRon, baseEur });
    } else if (discountValueRon !== null) {
      updateDiscounts({ valueRon: discountValueRon, baseRon, baseEur });
    } else if (discountedPriceRon !== null) {
      updateDiscounts({ finalPriceRon: discountedPriceRon, baseRon, baseEur });
    } else {
      clearDiscounts();
    }
  };

  const computeDiscountSummary = (baseRon: number, baseEur: number): DiscountSummary | null => {
    if (discountPercent !== null) {
      return calculateDiscount({ baseRon, baseEur, percent: discountPercent });
    }
    if (discountValueRon !== null) {
      return calculateDiscount({ baseRon, baseEur, valueRon: discountValueRon });
    }
    if (discountedPriceRon !== null) {
      return calculateDiscount({ baseRon, baseEur, finalPriceRon: discountedPriceRon });
    }
    return null;
  };

  const handleDiscountPercentChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawValue = e.target.value;
    if (rawValue.trim() === '') {
      clearDiscounts();
      return;
    }

    const parsed = parseFloat(rawValue.replace(',', '.'));
    if (Number.isNaN(parsed)) {
      return;
    }

    updateDiscounts({ percent: parsed, baseRon: priceRon, baseEur: priceEur });
  };

  const handleDiscountValueChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawValue = e.target.value;
    if (rawValue.trim() === '') {
      clearDiscounts();
      return;
    }

    const parsed = parseFloat(rawValue.replace(',', '.'));
    if (Number.isNaN(parsed)) {
      return;
    }

    updateDiscounts({ valueRon: parsed, baseRon: priceRon, baseEur: priceEur });
  };

  const handleDiscountFinalPriceChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawValue = e.target.value;
    if (rawValue.trim() === '') {
      clearDiscounts();
      return;
    }

    const parsed = parseFloat(rawValue.replace(',', '.'));
    if (Number.isNaN(parsed)) {
      return;
    }

    updateDiscounts({ finalPriceRon: parsed, baseRon: priceRon, baseEur: priceEur });
  };

  function formatCurrencyValue(value: number | null, currencyCode: 'RON' | 'EUR') {
    if (value === null || Number.isNaN(value)) {
      return '—';
    }

    const safeValue = Number.isFinite(value) ? value : 0;

    const suffix = currencyCode === "EUR" ? "EUR" : "Lei";
    return `${safeValue.toLocaleString('ro-RO', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })} ${suffix}`;
  }

  useEffect(() => {
    // Force productType to always be 'live-bid' for user dashboard
    setFormData((prev) => {
      const updates: Partial<ProductFormData> = {};

      if (prev.productType !== 'live-bid') {
        updates.productType = 'live-bid';
      }

      if (prev.saleType !== 'alte-licitatii') {
        updates.saleType = 'alte-licitatii';
      }

      if (prev.insolventaDirectSale) {
        updates.insolventaDirectSale = false;
      }

      if (prev.auctionRegistrationDate) {
        updates.auctionRegistrationDate = undefined;
      }

      if (Object.keys(updates).length > 0) {
        return { ...prev, ...updates };
      }

      return prev;
    });
  }, [formData.productType]);

  const clearDiscounts = () => {
    setDiscountPercent(null);
    setDiscountValueRon(null);
    setDiscountValueEur(null);
    setDiscountedPriceRon(null);
    setDiscountedPriceEur(null);
    setFormData(prev => {
      if (
        prev.discountPercent === null &&
        prev.discountValueRON === null &&
        prev.discountValueEUR === null &&
        prev.discountedPriceRON === null &&
        prev.discountedPriceEUR === null
      ) {
        return prev;
      }

      return {
        ...prev,
        discountPercent: null,
        discountValueRON: null,
        discountValueEUR: null,
        discountedPriceRON: null,
        discountedPriceEUR: null,
      };
    });
  };

  useEffect(() => {
    setDiscountPercent(formData.discountPercent ?? null);
    setDiscountValueRon(formData.discountValueRON ?? null);
    setDiscountValueEur(formData.discountValueEUR ?? null);
    setDiscountedPriceRon(formData.discountedPriceRON ?? null);
    setDiscountedPriceEur(formData.discountedPriceEUR ?? null);
  }, [
    formData.discountPercent,
    formData.discountValueRON,
    formData.discountValueEUR,
    formData.discountedPriceRON,
    formData.discountedPriceEUR,
  ]);

  useEffect(() => {
    if (typeof formData.startingPriceRON === 'number') {
      setPriceRon(formData.startingPriceRON);
    }
    if (typeof formData.startingPriceEUR === 'number') {
      setPriceEur(formData.startingPriceEUR);
    }
    if (typeof formData.exchangeRate === 'number') {
      setExchangeRate(formData.exchangeRate);
    }
    if (formData.exchangeRateUpdatedAt) {
      const parsed = new Date(formData.exchangeRateUpdatedAt);
      if (!Number.isNaN(parsed.getTime())) {
        setLastRateUpdate(parsed);
      }
    }
  }, [
    formData.startingPriceRON,
    formData.startingPriceEUR,
    formData.exchangeRate,
    formData.exchangeRateUpdatedAt,
  ]);

  useEffect(() => {
    if (formData.buyNowEnabled) {
      setBuyNowPriceRon(
        typeof formData.buyNowPriceRON === 'number' ? formData.buyNowPriceRON : null
      );
      setBuyNowPriceEur(
        typeof formData.buyNowPriceEUR === 'number' ? formData.buyNowPriceEUR : null
      );
    } else {
      setBuyNowPriceRon(null);
      setBuyNowPriceEur(null);
    }
  }, [formData.buyNowEnabled, formData.buyNowPriceRON, formData.buyNowPriceEUR]);

  const getRateOrFallback = () => {
    const rate = getEffectiveRate();
    if (rate && rate > 0) {
      return rate;
    }
    if (priceRon > 0 && priceEur > 0) {
      return priceRon / priceEur;
          }
          return null;
  };

  const handleDiscountValueEurChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawValue = e.target.value;
    if (rawValue.trim() === '') {
      clearDiscounts();
      return;
    }

    const parsed = parseFloat(rawValue.replace(',', '.'));
    if (Number.isNaN(parsed) || parsed < 0) {
      return;
    }

    const rate = getRateOrFallback();
    if (!rate) {
      setExchangeError('Actualizează cursul pentru a aplica reducerea în EUR.');
      return;
    }

    const baseEurValue = priceEur > 0 ? priceEur : priceRon > 0 ? roundTo(priceRon / rate) : parsed;
    updateDiscounts({ valueRon: roundTo(parsed * rate), baseRon: priceRon, baseEur: baseEurValue });
  };

  const handleDiscountFinalPriceEurChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawValue = e.target.value;
    if (rawValue.trim() === '') {
      clearDiscounts();
      return;
    }

    const parsed = parseFloat(rawValue.replace(',', '.'));
    if (Number.isNaN(parsed) || parsed < 0) {
      return;
    }

    const rate = getRateOrFallback();
    if (!rate) {
      setExchangeError('Actualizează cursul pentru a aplica prețul redus în EUR.');
      return;
    }

    const baseEurValue = priceEur > 0 ? priceEur : priceRon > 0 ? roundTo(priceRon / rate) : parsed;
    updateDiscounts({ finalPriceRon: roundTo(parsed * rate), baseRon: priceRon, baseEur: baseEurValue });
  };

  const handleRegenerateSku = () => {
    if (!formData.subcategory) {
      setMessage({ type: 'error', text: 'Selectează subcategoria înainte de a genera SKU.' });
      return;
    }

    const newSku = generateSku(formData.subcategory, getExistingSkus(editingProductId ?? undefined));
    if (!newSku) {
      setMessage({ type: 'error', text: 'Nu am putut genera SKU. Încearcă din nou.' });
      return;
    }

    setSkuDirty(false);
    setIsSkuEditable(false);
    setFormData(prev => ({
      ...prev,
      sku: newSku,
    }));
  };

  const handleToggleSkuEdit = () => {
    setIsSkuEditable(prev => {
      if (prev) {
        setSkuDirty(false);
        if (formData.subcategory) {
          const normalized = sanitizeSkuInput(formData.sku);
          const prefix = (normalizeSubcategoryName(formData.subcategory) + 'XXXX').slice(0, SKU_PREFIX_LENGTH);
          const forced = `${prefix}${normalized.slice(SKU_PREFIX_LENGTH)}`.slice(0, SKU_TOTAL_LENGTH);
          setFormData(current => ({
            ...current,
            sku: forced,
          }));
        }
      }
      return !prev;
    });
  };

  useEffect(() => {
    if (!skuDirty && formData.subcategory && !formData.sku) {
      const autoSku = generateSku(formData.subcategory, getExistingSkus(editingProductId ?? undefined));
      if (autoSku) {
        setFormData(prev => ({
          ...prev,
          sku: autoSku,
        }));
      }
    }
  }, [formData.subcategory, formData.sku, skuDirty, editingProductId]);

  useEffect(() => {
    const productId = searchParams?.get?.('id') ?? null;

    if (!productId) {
      setIsEditMode(false);
      setEditingProductId(null);
      setSkuDirty(false);
      return;
    }

    let cancelled = false;

    const loadProduct = async () => {
      setIsLoadingProduct(true);
      try {
        const { data, error } = await supabase
          .from('products')
          .select('*')
          .eq('id', productId)
          .single();

        if (error || !data) {
          console.error('Supabase load product error:', error);
          if (!cancelled) {
            setMessage({
              type: 'error',
              text: 'Produsul selectat nu a fost găsit. Verifică lista de produse și încearcă din nou.',
            });
          }
          return;
        }

        if (cancelled) {
          return;
        }

        setIsEditMode(true);
        setEditingProductId(data.id);
        setSkuDirty(false);

        const sanitizedSku = sanitizeSkuInput(data.sku ?? '') || (data.subcategory ? generateSku(data.subcategory, getExistingSkus(data.id)) : '');
        const seo = data.seo && typeof data.seo === 'object'
          ? {
              title: data.seo.title ?? '',
              description: data.seo.description ?? '',
              keywords: Array.isArray(data.seo.keywords) ? data.seo.keywords : [],
            }
          : { title: '', description: '', keywords: [] };

        const mappedProduct: ProductFormData = {
          title: data.title ?? '',
          description: data.description ?? '',
          category: data.category ?? '',
          subcategory: data.subcategory ?? '',
          sku: sanitizedSku,
          startingPrice: typeof data.starting_price === 'number' ? data.starting_price : data.starting_price_ron ?? 0,
          startingPriceRON: data.starting_price_ron ?? data.starting_price ?? 0,
          startingPriceEUR: data.starting_price_eur ?? 0,
          currency: data.currency === 'EUR' ? 'EUR' : 'RON',
          exchangeRate: data.exchange_rate ?? 1,
          exchangeRateUpdatedAt: data.exchange_rate_updated_at ?? new Date().toISOString(),
          productType: data.product_type ?? 'licitatii-publice',
          saleType: data.sale_type ?? 'licitatii-anaf',
          insolventaDirectSale: !!data.insolventa_direct_sale,
          buyNowEnabled: !!data.buy_now_enabled,
          buyNowPriceRON: data.buy_now_price_ron ?? null,
          buyNowPriceEUR: data.buy_now_price_eur ?? null,
          productLocation: data.product_location ?? '',
          auctionLocation: data.auction_location ?? '',
          auctionRegistrationDate: data.auction_registration_date ?? undefined,
          auctionDate: data.auction_date ?? '',
          county: data.county ?? undefined,
          city: data.city ?? undefined,
          address: data.address ?? undefined,
          coordinates: data.coordinates ?? undefined,
          images: Array.isArray(data.images) ? data.images : [],
          customFields: data.custom_fields && typeof data.custom_fields === 'object' ? data.custom_fields : {},
          seo,
          status: data.status === 'active' ? 'active' : 'draft',
          url: data.url ?? undefined,
          slug: data.slug ?? undefined,
          discountPercent: data.discount_percent ?? null,
          discountValueRON: data.discount_value_ron ?? null,
          discountValueEUR: data.discount_value_eur ?? null,
          discountedPriceRON: data.discounted_price_ron ?? null,
          discountedPriceEUR: data.discounted_price_eur ?? null,
          documents: Array.isArray(data.documents) ? data.documents : [],
        };

        setFormData(mappedProduct);
        setPriceRon(mappedProduct.startingPriceRON ?? 0);
        setPriceEur(mappedProduct.startingPriceEUR ?? 0);
        setExchangeRate(mappedProduct.exchangeRate ?? null);
        setLastRateUpdate(mappedProduct.exchangeRateUpdatedAt ? new Date(mappedProduct.exchangeRateUpdatedAt) : null);
        setBuyNowPriceRon(mappedProduct.buyNowPriceRON ?? null);
        setBuyNowPriceEur(mappedProduct.buyNowPriceEUR ?? null);
        setAutoEnhance(false);
        setRewriteTitle(false);
        setRewriteDescription(false);
      } catch (error) {
        console.error('Unexpected error loading product:', error);
        if (!cancelled) {
          setMessage({
            type: 'error',
            text: 'A intervenit o problemă la încărcarea produsului.',
          });
        }
      } finally {
        if (!cancelled) {
          setIsLoadingProduct(false);
        }
      }
    };

    loadProduct();

    return () => {
      cancelled = true;
    };
  }, [productIdParam, getExistingSkus]);

  const handleDocumentUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    if (files.length === 0) {
      return;
    }

    const existingCount = (formData.documents?.length || 0) + documentUploads.length;
    const availableSlots = MAX_DOCUMENTS - existingCount;

    if (availableSlots <= 0) {
      setMessage({
        type: 'error',
        text: `Ai atins limita maximă de ${MAX_DOCUMENTS} documente PDF.`,
      });
      event.target.value = '';
      return;
    }

    const accepted: File[] = [];
    const rejectedMessages: string[] = [];

    for (const file of files) {
      if (accepted.length >= availableSlots) {
        break;
      }

      const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
      if (!isPdf) {
        rejectedMessages.push(`"${file.name}" nu este un fișier PDF valid.`);
        continue;
      }

      if (file.size > MAX_DOCUMENT_SIZE_MB * 1024 * 1024) {
        rejectedMessages.push(`"${file.name}" depășește ${MAX_DOCUMENT_SIZE_MB}MB.`);
        continue;
      }

      const alreadySelected = documentUploads.some(
        (doc) =>
          doc.name === file.name &&
          doc.size === file.size &&
          doc.lastModified === file.lastModified
      );

      if (alreadySelected) {
        rejectedMessages.push(`"${file.name}" este deja adăugat.`);
        continue;
      }

      accepted.push(file);
    }

    if (accepted.length > 0) {
      setDocumentUploads((prev) => [...prev, ...accepted]);
    }

    let messageType: 'success' | 'error' | null = null;
    let messageText = '';

    if (accepted.length > 0) {
      const nextCount = existingCount + accepted.length;
      messageType = 'success';
      messageText =
        accepted.length === 1
          ? `Documentul PDF "${accepted[0].name}" a fost adăugat. Total: ${nextCount}/${MAX_DOCUMENTS}.`
          : `${accepted.length} documente PDF au fost adăugate. Total: ${nextCount}/${MAX_DOCUMENTS}.`;
    }

    if (rejectedMessages.length > 0) {
      const rejectionDetails = rejectedMessages.join(' ');
      messageType = 'error';
      messageText = `${messageText} ${rejectionDetails}`.trim();
    }

    if (messageType && messageText) {
      setMessage({ type: messageType, text: messageText });
    }

    event.target.value = '';
  };

  const handleRemoveDocumentUpload = (index: number) => {
    setDocumentUploads(prev => prev.filter((_, i) => i !== index));
  };

  const handleRemoveExistingDocument = (index: number) => {
    setFormData(prev => ({
      ...prev,
      documents: (prev.documents || []).filter((_, i) => i !== index),
    }));
  };

  return (
    <div className="min-h-screen transition-all duration-300 bg-gradient-to-br from-gray-50 via-white to-gray-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-700">
      {/* Page Loading */}
      {isPageLoading && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <Hammer 
            size="xl" 
            color="gold" 
            animated={true}
            className="scale-150"
          />
        </div>
      )}

      {/* Universal Header */}
      <UniversalHeader 
        isDarkMode={isDarkMode}
        onToggleDarkMode={toggleDarkMode}
      />
      <LocationPermissionModal
        open={locationPermissionModalOpen}
        onOpenChange={setLocationPermissionModalOpen}
        onUseApproximateLocation={confirmLocationPermissionModal}
        isBusy={useMyLocationBusy}
      />

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-6">
          <BackButton fallbackHref="/dashboard" label="Înapoi" className="shadow-md" />
        </div>

        {/* Page Header */}
        <div className="mb-6">
          <h1 className="text-3xl font-bold mb-2 text-gray-900 dark:text-white">
            {isEditMode ? 'Editează Licitație' : 'Adaugă Licitație Live Bid'}
          </h1>
          <p className="text-gray-600 dark:text-gray-300">
            {isEditMode ? 'Actualizează informațiile licitației' : 'Completează informațiile pentru noua licitație Live Bid'}
          </p>
        </div>

        {message && (
          <div className={`mb-6 p-4 rounded-lg ${
            message.type === 'success' 
              ? 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400' 
              : 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400'
        }`}>
          {message.text}
        </div>
      )}

        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6">
          <form onSubmit={handleSubmit} className="space-y-6">
          {/* Tip Produs - Doar Live Bid */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Tip Produs</h2>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Licitația va fi de tip Live Bid - utilizatorii pot licita în timp real.
            </p>

            <div className="mt-4">
              <div className="relative flex items-center gap-3 rounded-2xl border-2 border-blue-500 bg-blue-50 shadow-lg shadow-blue-500/10 dark:border-blue-400 dark:bg-blue-900/25 p-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <i className="ri-hammer-line text-xl text-blue-500"></i>
                    <span className="font-semibold text-gray-900 dark:text-white">Live Bid</span>
                  </div>
                  <p className="text-xs text-gray-600 dark:text-gray-400">
                    Produsul apare în licitații live, utilizatorii licitează în timp real și poți seta opțiuni suplimentare.
                  </p>
                </div>
                <div className="h-4 w-4 rounded-full border-2 border-blue-500 bg-blue-500">
                  <div className="w-full h-full rounded-full bg-white scale-50"></div>
                </div>
              </div>
            </div>

            <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
              Produsul va apărea în licitații live, iar utilizatorii pot plasa oferte în timp real.
            </p>
          </div>

          {/* Basic Information */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Titlu Produs *
                </label>
                <input
                  type="text"
                  name="title"
                  value={formData.title}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  placeholder="Introdu titlul produsului"
                  required
                />
                <div className="mt-4">
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                      SKU *
                    </label>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={handleToggleSkuEdit}
                        disabled={!formData.sku}
                        className="inline-flex items-center gap-1 text-xs font-semibold text-slate-600 hover:text-slate-800 disabled:text-gray-400 disabled:cursor-not-allowed"
                      >
                        <i className="ri-edit-2-line"></i>
                        {isSkuEditable ? 'Blochează' : 'Editează SKU'}
                      </button>
                      <button
                        type="button"
                        onClick={handleRegenerateSku}
                        disabled={!formData.subcategory}
                        className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-700 disabled:text-gray-400 disabled:cursor-not-allowed"
                      >
                        <i className="ri-refresh-line"></i>
                        Generează automat
                      </button>
                    </div>
                  </div>
                  <input
                    type="text"
                    name="sku"
                    value={formData.sku}
                    onChange={handleInputChange}
                    maxLength={SKU_TOTAL_LENGTH}
                    autoComplete="off"
                    readOnly={!isSkuEditable}
                    className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white tracking-wider uppercase ${
                      isSkuEditable
                        ? 'border-blue-500 dark:border-blue-400 focus:ring-blue-500'
                        : 'border-gray-300 dark:border-gray-600 focus:ring-blue-200 dark:focus:ring-blue-400/30 cursor-not-allowed bg-gray-50 dark:bg-gray-800'
                    }`}
                    placeholder="APAR176DH2"
                    required
                  />
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    Codul este generat automat din subcategorie; nu este nevoie să îl modifici manual. Folosește "Editează SKU" doar dacă ai un motiv bine justificat.
                  </p>
                </div>

                {/* Opțional: Cumpără acum */}
                {formData.productType === 'live-bid' && (
                  <div className="mt-6 rounded-2xl border border-blue-200 bg-blue-50/40 p-5 shadow-sm dark:border-blue-500/30 dark:bg-blue-900/20">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <h4 className="text-sm font-semibold text-blue-700 dark:text-blue-200">
                          Opțional: Cumpără acum
                        </h4>
                        <p className="text-xs text-blue-700/80 dark:text-blue-200/80">
                          Permite utilizatorilor să achiziționeze instant produsul la un preț fix, păstrând licitația activă.
                        </p>
                      </div>
                      <label className="flex items-center gap-2 text-sm font-medium text-blue-700 dark:text-blue-200">
                        <input
                          type="checkbox"
                          name="buyNowEnabled"
                          checked={!!formData.buyNowEnabled}
                          onChange={handleInputChange}
                          className="h-4 w-4 rounded border-blue-300 text-blue-600 focus:ring-blue-500"
                        />
                        Activează
                      </label>
                    </div>

                    {formData.buyNowEnabled ? (
                      <>
                        <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
                          <div>
                            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-blue-800 dark:text-blue-100/90">
                              Preț Cumpără acum (Lei)
                            </label>
                            <input
                              type="number"
                              inputMode="decimal"
                              min="0"
                              step="0.01"
                              value={buyNowPriceRon ?? ''}
                              onChange={handleBuyNowRonChange}
                              className="w-full rounded-lg border border-blue-300 bg-white px-3 py-2 text-sm text-blue-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-blue-500/60 dark:bg-blue-950/40 dark:text-blue-100"
                              placeholder={priceRon > 0 ? priceRon.toFixed(2) : '0.00'}
                            />
                          </div>
                          <div>
                            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-blue-800 dark:text-blue-100/90">
                              Preț Cumpără acum (EUR)
                            </label>
                            <input
                              type="number"
                              inputMode="decimal"
                              min="0"
                              step="0.01"
                              value={buyNowPriceEur ?? ''}
                              onChange={handleBuyNowEurChange}
                              className="w-full rounded-lg border border-blue-300 bg-white px-3 py-2 text-sm text-blue-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-blue-500/60 dark:bg-blue-950/40 dark:text-blue-100"
                              placeholder={
                                buyNowPriceRon && effectiveRateValue
                                  ? roundTo(buyNowPriceRon / effectiveRateValue, 2).toFixed(2)
                                  : priceEur > 0
                                    ? priceEur.toFixed(2)
                                    : '0.00'
                              }
                            />
                          </div>
                        </div>
                        <p className="mt-3 text-xs text-blue-700/80 dark:text-blue-200/80">
                          Conversia se realizează automat folosind cursul live: 1 EUR ≈ {effectiveRateValue ? effectiveRateValue.toFixed(4) : '—'} Lei.
                        </p>
                      </>
                    ) : (
                      <p className="mt-4 text-xs text-blue-700/70 dark:text-blue-200/70">
                        Lasă opțiunea dezactivată dacă preferi doar licitația clasică fără preț instant.
                      </p>
                    )}
                  </div>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Preț de Pornire *
                </label>
                <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                  Introdu valoarea în moneda preferată; conversia în cealaltă monedă se calculează automat folosind cursul live.
                </p>
                <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <label
                    className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition ${
                      formData.isFreeListing
                        ? 'border-emerald-400 bg-emerald-50 text-emerald-900 dark:border-emerald-500/70 dark:bg-emerald-900/25 dark:text-emerald-100'
                        : 'border-gray-200 bg-gray-50 text-gray-700 hover:border-emerald-300 dark:border-gray-700 dark:bg-gray-800/60 dark:text-gray-300'
                    }`}
                  >
                    <input
                      type="checkbox"
                      name="isFreeListing"
                      checked={formData.isFreeListing === true}
                      onChange={handleInputChange}
                      className="mt-0.5 h-4 w-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                    />
                    <span>
                      <span className="block text-sm font-semibold">Ofertă gratuită</span>
                      <span className="block text-xs opacity-75">Anunțul se salvează ca oferit gratuit, nu ca vândut.</span>
                    </span>
                  </label>
                  <label
                    className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition ${
                      formData.isUrgent
                        ? 'border-orange-400 bg-orange-50 text-orange-900 dark:border-orange-500/70 dark:bg-orange-900/25 dark:text-orange-100'
                        : 'border-gray-200 bg-gray-50 text-gray-700 hover:border-orange-300 dark:border-gray-700 dark:bg-gray-800/60 dark:text-gray-300'
                    }`}
                  >
                    <input
                      type="checkbox"
                      name="isUrgent"
                      checked={formData.isUrgent === true}
                      onChange={handleInputChange}
                      className="mt-0.5 h-4 w-4 rounded border-gray-300 text-orange-600 focus:ring-orange-500"
                    />
                    <span>
                      <span className="block text-sm font-semibold">Anunț urgent</span>
                      <span className="block text-xs opacity-75">
                        Arată celorlalți utilizatori că vrei să vinzi sau să oferi gratuit produsul cât mai urgent.
                      </span>
                    </span>
                  </label>
                </div>
                {exchangeError && (
                  <p className="mt-2 text-xs text-red-500 dark:text-red-400">
                    {exchangeError}
                  </p>
                )}
                <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-400">
                      Valoare în Lei
              </label>
              <input
                  type="number"
                      inputMode="decimal"
                  min="0"
                  step="0.01"
                      value={formData.isFreeListing === true || Number.isNaN(priceRon) ? '' : priceRon}
                      onChange={handleRonInputChange}
                      disabled={formData.isFreeListing === true}
                      className={`w-full rounded-lg border px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                        formData.isFreeListing
                          ? 'cursor-not-allowed border-dashed border-gray-300 bg-gray-100 text-gray-400 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-500'
                          : 'border-gray-300 bg-white text-gray-900 dark:border-gray-600 dark:bg-gray-700 dark:text-white'
                      }`}
                  placeholder={formData.isFreeListing === true ? 'Ofertă gratuită' : '0.00'}
              />
            </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-400">
                      Valoare în EUR
              </label>
                  <input
                      type="number"
                      inputMode="decimal"
                      min="0"
                      step="0.01"
                      value={formData.isFreeListing === true || Number.isNaN(priceEur) ? '' : priceEur}
                      onChange={handleEurInputChange}
                      disabled={formData.isFreeListing === true}
                      className={`w-full rounded-lg border px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                        formData.isFreeListing
                          ? 'cursor-not-allowed border-dashed border-gray-300 bg-gray-100 text-gray-400 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-500'
                          : 'border-gray-300 bg-white text-gray-900 dark:border-gray-600 dark:bg-gray-700 dark:text-white'
                      }`}
                      placeholder={formData.isFreeListing === true ? 'Ofertă gratuită' : '0.00'}
                    />
                    </div>
                  </div>
                <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
                  <span>
                    1 EUR ≈ {effectiveRateValue ? effectiveRateValue.toFixed(4) : '—'} Lei
                  </span>
                  <span>
                    1 Lei ≈ {inverseRateValue ? inverseRateValue.toFixed(4) : '—'} EUR
                  </span>
                  <button
                    type="button"
                    onClick={fetchExchangeRate}
                    disabled={isFetchingRate}
                    className={`rounded-full border px-3 py-1 font-semibold transition ${
                      isFetchingRate
                        ? 'cursor-wait border-blue-300 text-blue-400 dark:border-blue-500 dark:text-blue-300'
                        : 'border-blue-500 text-blue-600 hover:bg-blue-50 dark:border-blue-400 dark:text-blue-300 dark:hover:bg-blue-600/20'
                    }`}
                  >
                    {isFetchingRate ? 'Actualizare...' : 'Actualizează cursul'}
                  </button>
                  {lastRateDateToDisplay && (
                    <span>
                      Ultima actualizare: {lastRateDateToDisplay.toLocaleString('ro-RO', {
                        day: '2-digit',
                        month: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                    )}
                  </div>

                <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <div>
                    <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-400">
                      Reducere (%)
                </label>
                    <input
                      type="number"
                      inputMode="decimal"
                      min="0"
                      max="100"
                      step="0.01"
                      value={discountPercent ?? ''}
                      onChange={handleDiscountPercentChange}
                      disabled={discountInputsDisabled}
                      className={`w-full rounded-lg border px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                        discountInputsDisabled
                          ? 'cursor-not-allowed border-dashed border-gray-300 bg-gray-100 text-gray-400 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-500'
                          : 'border-gray-300 bg-white text-gray-900 dark:border-gray-600 dark:bg-gray-700 dark:text-white'
                      }`}
                      placeholder="Ex: 10"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-400">
                      Reducere (Lei)
                    </label>
                    <input
                      type="number"
                      inputMode="decimal"
                      min="0"
                      step="0.01"
                      value={discountValueRon ?? ''}
                      onChange={handleDiscountValueChange}
                      disabled={discountInputsDisabled}
                      className={`w-full rounded-lg border px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                        discountInputsDisabled
                          ? 'cursor-not-allowed border-dashed border-gray-300 bg-gray-100 text-gray-400 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-500'
                          : 'border-gray-300 bg-white text-gray-900 dark:border-gray-600 dark:bg-gray-700 dark:text-white'
                      }`}
                      placeholder="Ex: 20"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-400">
                      Preț redus (Lei)
                    </label>
                    <input
                      type="number"
                      inputMode="decimal"
                      min="0"
                      step="0.01"
                      value={discountedPriceRon ?? ''}
                      onChange={handleDiscountFinalPriceChange}
                      disabled={discountInputsDisabled}
                      className={`w-full rounded-lg border px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                        discountInputsDisabled
                          ? 'cursor-not-allowed border-dashed border-gray-300 bg-gray-100 text-gray-400 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-500'
                          : 'border-gray-300 bg-white text-gray-900 dark:border-gray-600 dark:bg-gray-700 dark:text-white'
                      }`}
                      placeholder={priceRon > 0 ? priceRon.toFixed(2) : '0.00'}
                    />
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-400">
                      Reducere (EUR)
                    </label>
                  <input
                      type="number"
                      inputMode="decimal"
                      min="0"
                      step="0.01"
                      value={discountValueEur ?? ''}
                      onChange={handleDiscountValueEurChange}
                      disabled={discountInputsDisabled}
                      className={`w-full rounded-lg border px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                        discountInputsDisabled
                          ? 'cursor-not-allowed border-dashed border-gray-300 bg-gray-100 text-gray-400 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-500'
                          : 'border-gray-300 bg-white text-gray-900 dark:border-gray-600 dark:bg-gray-700 dark:text-white'
                      }`}
                      placeholder="Ex: 5"
                    />
                    </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-400">
                      Preț redus (EUR)
                    </label>
                    <input
                      type="number"
                      inputMode="decimal"
                      min="0"
                      step="0.01"
                      value={discountedPriceEur ?? ''}
                      onChange={handleDiscountFinalPriceEurChange}
                      disabled={discountInputsDisabled}
                      className={`w-full rounded-lg border px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                        discountInputsDisabled
                          ? 'cursor-not-allowed border-dashed border-gray-300 bg-gray-100 text-gray-400 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-500'
                          : 'border-gray-300 bg-white text-gray-900 dark:border-gray-600 dark:bg-gray-700 dark:text-white'
                      }`}
                      placeholder={priceEur > 0 ? priceEur.toFixed(2) : priceRon > 0 ? (getRateOrFallback() ? (priceRon / (getRateOrFallback() ?? 1)).toFixed(2) : '0.00') : '0.00'}
                    />
                  </div>
                </div>

                {discountInputsDisabled && (
                  <p className="mt-2 text-xs text-amber-500">
                    Setează prețul de pornire înainte de a aplica reduceri.
                  </p>
                )}

                {discountPercent !== null && discountValueRon !== null && (
                  <div className="mt-4 rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm dark:border-white/10 dark:bg-white/5">
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                      <div>
                        <span className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                          Reducere totală
                        </span>
                        <p className="mt-1 font-semibold text-gray-900 dark:text-white">
                          {formatCurrencyValue(discountValueRon, 'RON')}
                        </p>
                        {derivedDiscountValueEur !== null && (
                          <p className="text-xs text-gray-500 dark:text-gray-400">
                            {formatCurrencyValue(derivedDiscountValueEur, 'EUR')}
                          </p>
                    )}
                  </div>
                      <div>
                        <span className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                          Preț după reducere
                        </span>
                        <p className="mt-1 font-semibold text-gray-900 dark:text-white">
                          {formatCurrencyValue(discountedPriceRon, 'RON')}
                        </p>
                        {derivedDiscountedPriceEur !== null && (
                          <p className="text-xs text-gray-500 dark:text-gray-400">
                            {formatCurrencyValue(derivedDiscountedPriceEur, 'EUR')}
                          </p>
                        )}
                      </div>
                      <div>
                        <span className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                          Reducere procentuală
                        </span>
                        <p className="mt-1 font-semibold text-blue-600 dark:text-blue-300">
                          {discountPercent.toLocaleString('ro-RO', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}%
                        </p>
                        {discountValueRon !== null && (
                          <p className="text-xs text-gray-500 dark:text-gray-400">
                            Economisești {formatCurrencyValue(discountValueRon, 'RON')} față de prețul inițial.
                          </p>
                        )}
                      </div>
                    </div>
                    {derivedDiscountValueEur !== null && (
                      <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
                        Echivalent în EUR: economisești {formatCurrencyValue(derivedDiscountValueEur, 'EUR')} iar prețul devine {formatCurrencyValue(derivedDiscountedPriceEur, 'EUR')}.
                      </p>
                    )}
                  </div>
                )}

            </div>
            </div>

            {/* Categorie și Subcategorie - pe același rând */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Categorie *
                </label>
                <select
                  name="category"
                  value={formData.category}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  required
                >
                  <option value="">Selectează categoria</option>
                  {categories.map((category) => (
                    <option key={category} value={category}>{category}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Subcategorie *
                </label>
                <select
                  name="subcategory"
                  value={formData.subcategory}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  required
                  disabled={!formData.category}
                >
                  <option value="">Selectează subcategoria</option>
                  {formData.category && subcategories[formData.category as keyof typeof subcategories]?.map((subcategory) => (
                    <option key={subcategory} value={subcategory}>{subcategory}</option>
                  ))}
                </select>
              </div>
            </div>

              {/* Județ și Oraș */}
              <div className="mt-6 rounded-2xl border border-sky-100 bg-sky-50/60 p-4 dark:border-sky-900/40 dark:bg-sky-950/20">
                <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm font-semibold text-gray-900 dark:text-white">Locația anunțului</p>
                    <p className="mt-1 text-xs text-gray-600 dark:text-gray-400">
                      Completează manual sau folosește locația aproximativă a dispozitivului.
                    </p>
                  </div>
                  <div className="flex flex-col gap-2 sm:items-end">
                    <div className="relative group">
                      <Button
                        type="button"
                        onClick={() => setLocationPermissionModalOpen(true)}
                        disabled={useMyLocationBusy}
                        className="h-auto w-full rounded-xl border-0 bg-gradient-to-r from-sky-500 via-blue-500 to-blue-600 py-2.5 text-sm font-semibold text-white shadow-md transition-all hover:from-sky-400 hover:via-blue-500 hover:to-blue-500 hover:shadow-lg focus-visible:ring-2 focus-visible:ring-blue-400/80 sm:w-auto"
                      >
                        {useMyLocationBusy ? (
                          <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden />
                        ) : (
                          <Navigation2 className="h-4 w-4 shrink-0" aria-hidden />
                        )}
                        Folosește locația mea
                      </Button>
                      <div className="pointer-events-none absolute right-0 top-full z-30 mt-2 w-72 rounded-xl border border-gray-200 bg-white p-3 text-xs leading-relaxed text-gray-700 opacity-0 shadow-xl transition-opacity duration-200 group-hover:opacity-100 group-focus-within:opacity-100 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200">
                        Nu publicăm adresa exactă. Locația este folosită doar aproximativ, ca zonă/oraș/sat, pentru căutări pe rază în km, ca un cerc pe hartă. Nu afișăm direcții către adresa ta.
                      </div>
                    </div>
                    <p className="text-[11px] text-gray-500 dark:text-gray-400">
                      Confidențial: nu se salvează coordonatele GPS exacte în anunț.
                    </p>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Județ
                  </label>
                  <select
                    name="county"
                    value={formData.county || ''}
                    onChange={handleInputChange}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  >
                    <option value="">Selectează județul</option>
                    {counties.map((county) => (
                      <option key={county} value={county}>{county}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Oraș
                  </label>
                  <input
                    type="text"
                    name="city"
                    value={formData.city || ''}
                    onChange={handleInputChange}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    placeholder="Introdu numele orașului"
                  />
                </div>
                </div>
              </div>


              {/* Câmpuri Dinamice - înainte de descriere */}
              {dynamicFields.length > 0 && (
                <div className="mt-6">
                  <div className="bg-gradient-to-r from-blue-50 to-blue-50 dark:from-blue-900/20 dark:to-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800 p-4 mb-4">
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-1">
                      <i className="ri-settings-3-line mr-2 text-blue-600"></i>
                      Caracteristici Specifice
                    </h3>
                    <p className="text-xs text-gray-600 dark:text-gray-400">
                      Completează informațiile specifice pentru {formData.category} - {formData.subcategory}
                    </p>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {dynamicFields.map((field) => (
                      <div key={field.key}>
                        <label className={`block text-sm font-medium mb-2 ${field.required ? 'text-gray-700 dark:text-gray-300' : 'text-gray-600 dark:text-gray-400'}`}>
                          {field.label}
                        </label>
                        
                        {field.type === 'select' ? (
                          <select
                            value={formData.customFields?.[field.key] || ''}
                            onChange={(e) => handleDynamicFieldChange(field.key, e.target.value)}
                            required={field.required}
                            className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white ${
                              field.required 
                                ? 'border-gray-300 dark:border-gray-600 focus:ring-blue-500' 
                                : 'border-gray-300 dark:border-gray-600 focus:ring-blue-500'
                            }`}
                          >
                            <option value="">Selectează...</option>
                            {field.options?.map((option) => (
                              <option key={option} value={option}>{option}</option>
                            ))}
                          </select>
                        ) : field.type === 'number' ? (
                          <input
                            type="number"
                            value={formData.customFields?.[field.key] || ''}
                            onChange={(e) => handleDynamicFieldChange(field.key, parseFloat(e.target.value) || 0)}
                            placeholder={field.placeholder}
                            required={field.required}
                            min={field.min}
                            max={field.max}
                            step={field.step || 1}
                            className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white ${
                              field.required 
                                ? 'border-gray-300 dark:border-gray-600 focus:ring-blue-500' 
                                : 'border-gray-300 dark:border-gray-600 focus:ring-blue-500'
                            }`}
                          />
                        ) : field.type === 'textarea' ? (
                          <textarea
                            value={formData.customFields?.[field.key] || ''}
                            onChange={(e) => handleDynamicFieldChange(field.key, e.target.value)}
                            placeholder={field.placeholder}
                            required={field.required}
                            rows={3}
                            className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white ${
                              field.required 
                                ? 'border-gray-300 dark:border-gray-600 focus:ring-blue-500' 
                                : 'border-gray-300 dark:border-gray-600 focus:ring-blue-500'
                            }`}
                          />
                        ) : (
                          <input
                            type="text"
                            value={formData.customFields?.[field.key] || ''}
                            onChange={(e) => handleDynamicFieldChange(field.key, e.target.value)}
                            placeholder={field.placeholder}
                            required={field.required}
                            className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white ${
                              field.required 
                                ? 'border-gray-300 dark:border-gray-600 focus:ring-blue-500' 
                                : 'border-gray-300 dark:border-gray-600 focus:ring-blue-500'
                            }`}
                          />
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              
            <div className="mt-6">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Descriere *
              </label>
              <textarea
                name="description"
                value={formData.description}
                onChange={handleInputChange}
                rows={4}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                placeholder="Descrie produsul în detaliu..."
                required
              />
            </div>
          </div>

          {(isDocumentRequirementActive || (formData.documents?.length || 0) > 0 || documentUploads.length > 0) && (
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
              <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
                <div>
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                    Documente licitație (PDF) - opțional
                  </h2>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                    Încarcă, dacă dorești, documentele oficiale în format PDF pentru a le oferi clienților mai mult context despre licitație.
                  </p>
                </div>
                <div
                  className={`px-3 py-1 text-xs font-semibold rounded-full ${
                    totalDocumentsCount > 0
                      ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-200'
                      : 'bg-gray-100 text-gray-700 dark:bg-gray-800/60 dark:text-gray-300'
                  }`}
                >
                  {totalDocumentsCount}/{MAX_DOCUMENTS} PDF
                </div>
              </div>

              <div
                className={`border-2 border-dashed rounded-lg p-6 text-center transition-all ${
                  documentUploadDisabled
                    ? 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 opacity-60'
                    : 'border-gray-300 dark:border-gray-600 hover:border-blue-400 dark:hover:border-blue-500'
                }`}
              >
                <input
                  type="file"
                  id="pdf-upload"
                  accept="application/pdf"
                  multiple
                  onChange={handleDocumentUpload}
                  disabled={documentUploadDisabled}
                  className="hidden"
                />
                <label
                  htmlFor="pdf-upload"
                  className={`flex flex-col items-center ${documentUploadDisabled ? 'cursor-not-allowed' : 'cursor-pointer'}`}
                >
                  <i
                    className={`ri-file-pdf-line text-4xl mb-2 ${
                      documentUploadDisabled ? 'text-gray-300 dark:text-gray-600' : 'text-red-500 dark:text-red-400'
                    }`}
                  ></i>
                  <p
                    className={`text-sm ${
                      documentUploadDisabled ? 'text-gray-400 dark:text-gray-600' : 'text-gray-700 dark:text-gray-200'
                    }`}
                  >
                    {documentUploadDisabled
                      ? isDocumentRequirementActive
                        ? 'Limita maximă de documente a fost atinsă'
                        : 'Documentele se pot gestiona doar pentru licitațiile publice'
                      : 'Selectează sau trage fișiere PDF aici'}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    Dimensiune maximă {MAX_DOCUMENT_SIZE_MB}MB per fișier. {remainingDocumentSlots > 0 && isDocumentRequirementActive
                      ? `Mai poți adăuga ${remainingDocumentSlots} document${remainingDocumentSlots === 1 ? '' : 'e'}`
                      : ''}
                  </p>
                </label>
              </div>

              {(formData.documents?.length || 0) > 0 && (
                <div className="mt-6">
                  <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Documente existente</h3>
                  <div className="space-y-3">
                    {(formData.documents || []).map((doc, index) => (
                      <div
                        key={`${doc.name || 'document'}-${index}`}
                        className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-2 bg-white dark:bg-gray-900/40"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="p-2 rounded-full bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-300">
                            <i className="ri-file-pdf-line text-lg"></i>
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                              {doc.name || `Document ${index + 1}`}
                            </p>
                            <p className="text-xs text-gray-500 dark:text-gray-400">
                              {formatFileSize(doc.size)}{doc.url ? ' • Descărcare disponibilă' : ' • Link indisponibil'}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {doc.url && (
                            <a
                              href={doc.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-300 dark:hover:text-blue-200"
                            >
                              Descarcă
                            </a>
                          )}
                          <button
                            type="button"
                            onClick={() => handleRemoveExistingDocument(index)}
                            className="text-xs font-semibold text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
                          >
                            Elimină
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {documentUploads.length > 0 && (
                <div className="mt-6">
                  <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
                    Documente pregătite pentru încărcare
                  </h3>
                  <div className="space-y-3">
                    {documentUploads.map((doc, index) => (
                      <div
                        key={`${doc.name}-pending-${index}`}
                        className="flex items-center justify-between gap-3 rounded-lg border border-blue-200 dark:border-blue-700 px-3 py-2 bg-blue-50/70 dark:bg-blue-900/20"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="p-2 rounded-full bg-blue-100 text-blue-600 dark:bg-blue-800/50 dark:text-blue-200">
                            <i className="ri-timer-line text-lg"></i>
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-blue-900 dark:text-blue-100 truncate">
                              {doc.name}
                            </p>
                            <p className="text-xs text-blue-700/80 dark:text-blue-200/80">
                              {formatFileSize(doc.size)} • Se va încărca la salvare
                            </p>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleRemoveDocumentUpload(index)}
                          className="text-xs font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-300 dark:hover:text-blue-200"
                        >
                          Elimină
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {isDocumentRequirementActive && totalDocumentsCount === 0 && (
                <p className="mt-6 text-sm text-gray-600 dark:text-gray-400">
                  Documentele PDF nu sunt obligatorii, însă pot îmbunătăți încrederea cumpărătorilor și claritatea anunțului.
                </p>
              )}
            </div>
          )}

          {/* File Upload */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Imagini și Fișiere</h2>
            
            <div className={`border-2 border-dashed rounded-lg p-6 text-center transition-all ${
              formData.images.length >= 50
                ? 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 opacity-60'
                : 'border-gray-300 dark:border-gray-600 hover:border-blue-400 dark:hover:border-blue-500'
            }`}>
                  <input
                    type="file"
                id="file-upload"
                    multiple
                accept="image/*,.zip"
                onChange={handleFileUpload}
                    disabled={formData.images.length >= 50}
                className="hidden"
              />
              <label
                htmlFor="file-upload"
                className={`flex flex-col items-center ${
                  formData.images.length >= 50 ? 'cursor-not-allowed' : 'cursor-pointer'
                }`}
              >
                <i className={`ri-upload-cloud-2-line text-4xl mb-2 ${
                  formData.images.length >= 50 ? 'text-gray-300 dark:text-gray-600' : 'text-gray-400 dark:text-gray-500'
                }`}></i>
                <p className={`mb-2 ${
                  formData.images.length >= 50 
                    ? 'text-gray-400 dark:text-gray-600' 
                    : 'text-gray-600 dark:text-gray-400'
                }`}>
                  {formData.images.length >= 50 
                    ? 'Limita de 50 imagini atinsă'
                    : 'Trage fișierele aici sau click pentru a selecta'
                  }
                </p>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Suportă imagini (JPG, PNG, GIF) și fișiere .zip (max 10MB per fișier)
                </p>
                <div className="mt-2 space-y-1">
                  <p className={`text-xs font-semibold ${
                    formData.images.length >= 50
                      ? 'text-red-500 dark:text-red-400'
                      : formData.images.length >= 4
                      ? 'text-yellow-600 dark:text-yellow-400'
                      : 'text-gray-400 dark:text-gray-500'
                  }`}>
                    {formData.images.length}/50 imagini
                  </p>
                  {formData.images.length < 4 ? (
                    <p className="text-xs text-green-600 dark:text-green-400">
                      {4 - formData.images.length === 1 
                        ? '1 poza gratuită rămasă'
                        : `${4 - formData.images.length} poze gratuite rămase`}
                    </p>
                  ) : (
                    <p className="text-xs text-amber-600 dark:text-amber-400">
                      {formData.images.length - 4 > 0 ? `${formData.images.length - 4} ${formData.images.length - 4 > 1 ? 'poze' : 'poză'} cu token${formData.images.length - 4 > 1 ? 'uri' : ''}` : ''} • {userTokens.balance} token{userTokens.balance !== 1 ? 'uri' : ''} disponibil{userTokens.balance !== 1 ? 'e' : ''}
                    </p>
                  )}
                  {formData.images.length >= 4 && (
                    <p className="text-xs text-blue-600 dark:text-blue-400">
                      1 token = 1 poza peste cele 4 gratuite
                    </p>
                  )}
                </div>
                </label>
              </div>

              {formData.images.length > 0 && (
              <div className="mt-4">
                <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Fișiere încărcate</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                  Prima imagine este coperta. Trage pozele sau folosește săgețile pentru ordine.
                </p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {formData.images.map((image, index) => (
                    <div
                      key={index}
                      {...getFormImageTargetProps(index)}
                      className={`relative ${
                        formImageDragOverIndex === index ? 'ring-2 ring-blue-500 rounded-lg' : ''
                      }`}
                    >
                      <div
                        {...getFormImageHandleProps(index)}
                        className="absolute left-0 top-1/2 z-[4] flex h-10 w-6 -translate-y-1/2 cursor-grab items-center justify-center rounded-r bg-black/35 text-white active:cursor-grabbing"
                        title="Trage pentru a muta poziția"
                      >
                        <i className="ri-draggable text-base opacity-95" aria-hidden />
                      </div>
                      {typeof image === 'string' ? (
                        <div className="aspect-square bg-gray-100 dark:bg-gray-700 rounded-lg overflow-hidden">
                      <img
                        src={image}
                        alt={`Preview ${index + 1}`}
                            className="w-full h-full object-cover"
                          />
                    </div>
                      ) : (
                        <div className="aspect-square bg-gray-100 dark:bg-gray-700 rounded-lg flex items-center justify-center">
                          <div className="text-center">
                            <div className="text-2xl mb-1">📦</div>
                            <div className="text-xs text-gray-600 dark:text-gray-400 truncate">
                              {image.name}
                </div>
                            <div className="text-xs text-gray-500 dark:text-gray-400">
                              {(image.size / 1024 / 1024).toFixed(1)} MB
            </div>
          </div>
                </div>
                      )}
                      <span
                        className="pointer-events-none absolute left-1 top-1 rounded bg-black/55 px-1 text-[10px] font-semibold text-white tabular-nums"
                        aria-hidden
                      >
                        {index + 1}
                      </span>
                      <div className="absolute bottom-1 left-1 right-1 z-[1] flex items-center justify-center gap-1 rounded bg-black/45 py-1">
                        <button
                          type="button"
                          disabled={index === 0}
                          onClick={(e) => {
                            e.stopPropagation();
                            moveImageStep(index, -1);
                          }}
                          className="flex h-7 w-7 items-center justify-center rounded text-white hover:bg-white/15 disabled:opacity-30"
                          aria-label="Mută mai spre început"
                        >
                          <i className="ri-arrow-left-s-line text-sm" aria-hidden />
                        </button>
                        <button
                          type="button"
                          disabled={index >= formData.images.length - 1}
                          onClick={(e) => {
                            e.stopPropagation();
                            moveImageStep(index, 1);
                          }}
                          className="flex h-7 w-7 items-center justify-center rounded text-white hover:bg-white/15 disabled:opacity-30"
                          aria-label="Mută mai spre sfârșit"
                        >
                          <i className="ri-arrow-right-s-line text-sm" aria-hidden />
                        </button>
                      </div>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          removeImage(index);
                        }}
                        className="absolute -top-2 -right-2 z-[2] bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-sm hover:bg-red-600"
                      >
                        ×
                      </button>
                  </div>
                ))}
              </div>
            </div>
          )}
          </div>

          {/* SEO - Hidden but functional */}
          <div className="hidden">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">SEO cu GoBid AI</h2>
              <button
                type="button"
                onClick={handleGenerateSEO}
                disabled={isGeneratingSEO || !formData.title.trim() || !formData.description.trim()}
                className="px-4 py-2 bg-gradient-to-r from-blue-600 to-blue-600 hover:from-blue-700 hover:to-blue-700 disabled:from-gray-400 disabled:to-gray-500 disabled:cursor-not-allowed text-white rounded-lg transition-all flex items-center gap-2 text-sm font-medium"
                title="GoBid AI generează automat meta titlu, descriere și cuvinte cheie"
              >
                {isGeneratingSEO ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    <span>Generează...</span>
                  </>
                ) : (
                  <>
                    <i className="ri-magic-line"></i>
                    <span>Regenerează SEO cu GoBid AI</span>
                  </>
                )}
              </button>
            </div>
            <p className="text-xs text-gray-600 dark:text-gray-400 mb-4">
              GoBid AI completează automat câmpurile SEO la salvare; poți ajusta manual oricând sau folosi butonul pentru o nouă sugestie.
            </p>
            
            <div className="space-y-4">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Titlu SEO
                  </label>
                  <span className={`text-xs ${formData.seo.title.length > 65 ? 'text-red-500' : formData.seo.title.length > 60 ? 'text-yellow-500' : 'text-gray-500'}`}>
                    {formData.seo.title.length}/65
                  </span>
                </div>
                <input
                  type="text"
                  name="seo.title"
                  value={formData.seo.title}
                  onChange={handleInputChange}
                  maxLength={65}
                  className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white ${
                    formData.seo.title.length > 65 
                      ? 'border-red-500 focus:ring-red-500' 
                      : formData.seo.title.length > 60
                      ? 'border-yellow-500 focus:ring-yellow-500'
                      : 'border-gray-300 dark:border-gray-600 focus:ring-blue-500'
                  }`}
                  placeholder="Titlu pentru motoarele de căutare (max 65 caractere)"
                />
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Recomandat: 50-60 caractere pentru rezultate optime
                </p>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Descriere SEO
                  </label>
                  <span className={`text-xs ${formData.seo.description.length > 160 ? 'text-red-500' : formData.seo.description.length > 155 ? 'text-yellow-500' : 'text-gray-500'}`}>
                    {formData.seo.description.length}/160
                  </span>
                </div>
                <textarea
                  name="seo.description"
                  value={formData.seo.description}
                  onChange={handleInputChange}
                  rows={3}
                  maxLength={160}
                  className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white ${
                    formData.seo.description.length > 160 
                      ? 'border-red-500 focus:ring-red-500' 
                      : formData.seo.description.length > 155
                      ? 'border-yellow-500 focus:ring-yellow-500'
                      : 'border-gray-300 dark:border-gray-600 focus:ring-blue-500'
                  }`}
                  placeholder="Descriere pentru motoarele de căutare (max 160 caractere)"
                />
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Recomandat: 150-160 caractere pentru rezultate optime
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Cuvinte Cheie (separate prin virgulă)
                  </label>
                  <input
                    type="text"
                  name="seo.keywords"
                  value={formData.seo.keywords.join(', ')}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  placeholder="cuvant1, cuvant2, cuvant3"
                />
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  GoBid AI propune automat cuvinte cheie relevante; editează lista dacă vrei termeni personalizați.
                </p>
                </div>
                    </div>
                    </div>

          {/* GoBid AI Options - Above Status */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Informații de Bază</h2>
              <button
                type="button"
                onClick={handleAutoEnhance}
                disabled={isEnhancing || !formData.title.trim() || !formData.description.trim()}
                className="px-4 py-2 bg-gradient-to-r from-blue-600 to-blue-600 hover:from-blue-700 hover:to-blue-700 disabled:from-gray-400 disabled:to-gray-500 disabled:cursor-not-allowed text-white rounded-lg transition-all flex items-center gap-2 text-sm font-medium shadow-lg"
                title="GoBid AI rescrie instant titlul, descrierea și meta SEO"
              >
                {isEnhancing ? (
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
            <div className="p-4 bg-gradient-to-r from-blue-50 to-blue-50 dark:from-blue-900/20 dark:to-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
              {/* Checkbox principal */}
              <label className="flex items-center gap-2 cursor-pointer mb-3">
                <input
                  type="checkbox"
                  checked={autoEnhance}
                  onChange={(e) => setAutoEnhance(e.target.checked)}
                  className="w-5 h-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <div className="flex-1">
                  <span className="text-sm font-semibold text-gray-900 dark:text-white">
                    GoBid AI rescrie titlul, descrierea și meta SEO
                  </span>
                  <p className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">
                    Activat implicit: la salvare, GoBid AI produce variante unice și meta SEO complete; debifează doar dacă nu dorești rescriere automată
                  </p>
                </div>
              </label>

              {/* Opțiuni de rescriere - doar când autoEnhance este activat */}
              {autoEnhance && (
                <div className="ml-7 mt-3 space-y-2 border-t border-blue-200 dark:border-blue-700 pt-3">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={rewriteTitle}
                      onChange={(e) => setRewriteTitle(e.target.checked)}
                      className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="text-sm text-gray-700 dark:text-gray-300">
                      GoBid AI rescrie titlul
                    </span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={rewriteDescription}
                      onChange={(e) => setRewriteDescription(e.target.checked)}
                      className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="text-sm text-gray-700 dark:text-gray-300">
                      GoBid AI rescrie descrierea
                    </span>
                  </label>
                  <p className="text-xs text-gray-600 dark:text-gray-400 pl-6">
                    SEO meta (opțional) este completat automat de GoBid AI dacă alegi butonul de generare.
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Status */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Status</h2>
            
            <div className="flex space-x-4">
              <label className="flex items-center">
                <input
                  type="radio"
                  name="status"
                  value="draft"
                  checked={formData.status === 'draft'}
                  onChange={handleInputChange}
                  className="mr-2"
                />
                <span className="text-gray-700 dark:text-gray-300">Draft</span>
              </label>
              <label className="flex items-center">
                <input
                  type="radio"
                  name="status"
                  value="active"
                  checked={formData.status === 'active'}
                  onChange={handleInputChange}
                  className="mr-2"
                />
                <span className="text-gray-700 dark:text-gray-300">Activ</span>
              </label>
            </div>
          </div>

          {/* Submit Buttons */}
          <div className="flex justify-end space-x-4">
            <button
              type="button"
              onClick={() => router.back()}
              className="px-6 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            >
              Anulează
            </button>
            <button
              type="submit"
              disabled={isSubmitting || isLoadingProduct}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
             >
              {isSubmitting
                ? 'Se salvează...'
                : isEditMode
                  ? 'Actualizează Produsul'
                  : 'Salvează Produsul'}
            </button>
          </div>
        </form>
        </div>
      </div>

      {/* Token Confirmation Modal */}
      {showTokenModal && (
        <div className="fixed inset-0 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className={`backdrop-blur-lg rounded-2xl p-8 shadow-2xl border max-w-md w-full ${
            isDarkMode 
              ? 'bg-white/10 border-white/20' 
              : 'bg-white border-gray-200'
          }`}>
            <div className="flex items-center justify-between mb-6">
              <h3 className={`text-xl font-semibold ${
                isDarkMode ? 'text-white' : 'text-gray-900'
              }`}>
                Token necesar pentru imagini
              </h3>
              <button
                onClick={() => {
                  setShowTokenModal(false);
                  setPendingFiles([]);
                }}
                className={`p-1 rounded-lg transition-all duration-300 ${
                  isDarkMode 
                    ? 'hover:bg-white/10 text-gray-400 hover:text-white' 
                    : 'hover:bg-gray-100 text-gray-500 hover:text-gray-700'
                }`}
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="mb-6">
              <div className={`p-4 rounded-lg mb-4 ${
                isDarkMode ? 'bg-white/5' : 'bg-blue-50'
              }`}>
                <p className={`text-sm mb-2 ${
                  isDarkMode ? 'text-gray-300' : 'text-gray-700'
                }`}>
                  Pentru a adăuga {tokensNeeded} {tokensNeeded > 1 ? 'poze' : 'poză'} peste cele 4 gratuite, ai nevoie de:
                </p>
                <p className={`text-2xl font-bold ${
                  isDarkMode ? 'text-yellow-400' : 'text-yellow-600'
                }`}>
                  {tokensNeeded} token{tokensNeeded > 1 ? 'uri' : ''}
                </p>
                <p className={`text-xs mt-2 ${
                  isDarkMode ? 'text-gray-400' : 'text-gray-600'
                }`}>
                  1 token = 1 poza peste cele 4 gratuite
                </p>
              </div>

              {userTokens.balance >= tokensNeeded ? (
                <div className={`p-4 rounded-lg mb-4 ${
                  isDarkMode ? 'bg-green-500/20 border border-green-500/30' : 'bg-green-50 border border-green-200'
                }`}>
                  <div className="flex items-center gap-2 mb-2">
                    <i className={`ri-checkbox-circle-fill text-lg ${
                      isDarkMode ? 'text-green-400' : 'text-green-600'
                    }`}></i>
                    <p className={`font-semibold ${
                      isDarkMode ? 'text-green-300' : 'text-green-800'
                    }`}>
                      Ai suficiente token-uri!
                    </p>
                  </div>
                  <p className={`text-sm ${
                    isDarkMode ? 'text-gray-300' : 'text-gray-700'
                  }`}>
                    Ai {userTokens.balance} token{userTokens.balance !== 1 ? 'uri' : ''} disponibil{userTokens.balance !== 1 ? 'e' : ''}. După utilizare, vei avea {userTokens.balance - tokensNeeded} token{userTokens.balance - tokensNeeded !== 1 ? 'uri' : ''} rămase.
                  </p>
                </div>
              ) : (
                <div className={`p-4 rounded-lg mb-4 ${
                  isDarkMode ? 'bg-red-500/20 border border-red-500/30' : 'bg-red-50 border border-red-200'
                }`}>
                  <div className="flex items-center gap-2 mb-2">
                    <i className={`ri-error-warning-fill text-lg ${
                      isDarkMode ? 'text-red-400' : 'text-red-600'
                    }`}></i>
                    <p className={`font-semibold ${
                      isDarkMode ? 'text-red-300' : 'text-red-800'
                    }`}>
                      Token-uri insuficiente
                    </p>
                  </div>
                  <p className={`text-sm mb-3 ${
                    isDarkMode ? 'text-gray-300' : 'text-gray-700'
                  }`}>
                    Ai {userTokens.balance} token{userTokens.balance !== 1 ? 'uri' : ''} disponibil{userTokens.balance !== 1 ? 'e' : ''}, dar ai nevoie de {tokensNeeded} token{tokensNeeded > 1 ? 'uri' : ''}.
                  </p>
                  <div className="flex flex-col gap-2">
                    <a
                      href="/dashboard/payments"
                      className={`px-4 py-2 rounded-lg font-semibold text-center transition-all ${
                        isDarkMode
                          ? 'bg-blue-600 hover:bg-blue-700 text-white'
                          : 'bg-blue-600 hover:bg-blue-700 text-white'
                      }`}
                    >
                      <i className="ri-wallet-3-line mr-2"></i>
                      Cumpără Token-uri
                    </a>
                    <a
                      href="/dashboard/tokens"
                      className={`px-4 py-2 rounded-lg font-medium text-center transition-all ${
                        isDarkMode
                          ? 'bg-white/10 hover:bg-white/20 text-white border border-white/20'
                          : 'bg-gray-100 hover:bg-gray-200 text-gray-700 border border-gray-300'
                      }`}
                    >
                      Vezi Detalii Token-uri
                    </a>
                  </div>
                </div>
              )}
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowTokenModal(false);
                  setPendingFiles([]);
                }}
                className={`flex-1 px-4 py-2 rounded-lg font-medium transition-all ${
                  isDarkMode
                    ? 'bg-white/10 hover:bg-white/20 text-white border border-white/20'
                    : 'bg-gray-100 hover:bg-gray-200 text-gray-700 border border-gray-300'
                }`}
              >
                Anulează
              </button>
              {userTokens.balance >= tokensNeeded && (
                <button
                  onClick={proceedWithUpload}
                  className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold transition-all"
                >
                  <i className="ri-check-line mr-2"></i>
                  Confirmă și continuă
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
