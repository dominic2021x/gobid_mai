"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import GoogleMapPreview from "@/components/GoogleMapPreview";
import { slugify, generateUniqueSlug } from "@/lib/slugify";
import { supabase } from "@/lib/supabase";
import { CATEGORY_LEVEL_3, CATEGORY_LEVEL_3_NAMES, SUBCATEGORY_DISPLAY_TO_KEY } from "@/lib/categories";
import { getAttributesForSubcategory, getSizeOptionsForSubcategory, getBrandOptionsForSubcategory, COLOR_OPTIONS, CONDITION_OPTIONS } from "@/lib/attributes";
import { reorderArray } from "@/lib/manual-listing/reorder-array";
import { useManualListingImageDnD } from "@/components/manual-listing/useManualListingImageDnD";

const roundTo = (value: number, decimals = 2) => {
  if (!Number.isFinite(value)) {
    return 0;
  }
  const factor = Math.pow(10, decimals);
  return Math.round((value + Number.EPSILON) * factor) / factor;
};

/** Extrage mesajul real din eroarea Supabase/PostgREST */
const formatSupabaseError = (err: unknown): string => {
  if (!err) return 'Unknown error';
  const e = err as Record<string, unknown>;
  const msg = (e?.message ?? (err as Error)?.message) as string | undefined;
  if (msg && typeof msg === 'string') return msg;
  const parts = [
    e?.message,
    e?.code,
    e?.details,
    e?.hint,
    (err as Error)?.message
  ].filter(Boolean) as string[];
  if (parts.length) return parts.join(' | ');
  try {
    return JSON.stringify(err, Object.getOwnPropertyNames(Object(err)));
  } catch {
    return String(err);
  }
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
  categoryLevel3?: string;
  size?: string;
  brand?: string;
  color?: string;
  condition?: string;
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
    | 'licitatie-publica'; // Tip de v�nzare (include valori vechi pentru compatibilitate)
  insolventaDirectSale?: boolean;
  buyNowEnabled?: boolean;
  buyNowPriceRON?: number | null;
  buyNowPriceEUR?: number | null;
  productLocation?: string;
  auctionLocation?: string;
  auctionRegistrationDate?: string;
  auctionDate?: string; // Data licitaiei (opional, format intern: YYYY-MM-DDTHH:MM)
  auctionTime?: string; // Ora licitaiei (opional, format: HH:MM)
  county?: string; // Jude
  city?: string; // Ora
  address?: string; // Adres pentru imobiliare
  coordinates?: { lat: number; lng: number }; // Coordonate pentru hart
  images: (string | { name: string; size: number; type: string; file: File })[];
  customFields?: Record<string, any>; // C�mpuri custom pentru specificaii
  seo: {
    title: string;
    description: string;
    keywords: string[];
  };
  status: 'draft' | 'active';
  url?: string; // URL-ul produsului (generat automat din titlu pentru SEO)
  slug?: string; // Slug-ul produsului (partea final a URL-ului)
  discountPercent?: number | null;
  discountValueRON?: number | null;
  discountValueEUR?: number | null;
  discountedPriceRON?: number | null;
  discountedPriceEUR?: number | null;
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
  const [formData, setFormData] = useState<ProductFormData>({
    title: '',
    description: '',
    category: '',
    subcategory: '',
    categoryLevel3: '',
    size: '',
    brand: '',
    color: '',
    condition: '',
    sku: '',
    startingPrice: 0,
    currency: 'RON',
    startingPriceRON: 0,
    startingPriceEUR: 0,
    exchangeRate: 1,
    exchangeRateUpdatedAt: new Date().toISOString(),
    productType: 'licitatii-publice',
    saleType: 'licitatii-anaf',
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
    status: 'draft',
    discountPercent: null,
    discountValueRON: null,
    discountValueEUR: null,
    discountedPriceRON: null,
    discountedPriceEUR: null,
    documents: []
  });

  const [selectedImageFiles, setSelectedImageFiles] = useState<File[]>([]);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
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
      console.log('� Skipping product reload - form is submitting');
      return;
    }

    // Don't reload if we just updated (to preserve the updated images in formData)
    if (justUpdated) {
      console.log('� Skipping product reload - just completed update');
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
          setMessage({ type: 'error', text: 'Nu am putut �ncrca produsul pentru editare.' });
          return;
        }

        if (cancelled) return;

        if (data) {
          console.log('=� Loading product for edit:', data);
          
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
          
          console.log('=� Processed images from DB:', processedImages.length, processedImages);

          setFormData({
            title: data.title || '',
            description: data.description || '',
            category: data.category || '',
            subcategory: data.subcategory || '',
            categoryLevel3: data.category_level_3 ?? '',
            size: data.size ?? '',
            brand: data.brand ?? '',
            color: data.color ?? '',
            condition: data.condition ?? '',
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

          setMessage({ type: 'success', text: 'Produs �ncrcat pentru editare.' });
        } else {
          setMessage({ type: 'error', text: 'Produsul nu a fost gsit.' });
        }
      } catch (error) {
        console.error('Unexpected error loading product:', error);
        setMessage({ type: 'error', text: 'Eroare la �ncrcarea produsului.' });
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
      return '�';
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

  // Funcie helper pentru formatarea datei pentru afiare (26.Noiembrie.2025)
  const formatDateForDisplay = (dateValue: string | undefined): string => {
    if (!dateValue) return '';
    
    // Dac este �n format YYYY-MM-DD sau YYYY-MM-DDTHH:MM
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
    
    // Dac este deja �n format 26.Noiembrie.2025, returneaz aa
    return dateValue;
  };

  // Funcie helper pentru parsarea input-ului de dat (26.Noiembrie.2025 -> YYYY-MM-DD)
  const parseDateInput = (dateInput: string, timeInput: string): string => {
    if (!dateInput) return '';
    
    // Format: 26.Noiembrie.2025 sau 26/11/2025
    let day: string, month: string, year: string;
    
    // �ncearc formatul 26.Noiembrie.2025
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
      // �ncearc formatul 26/11/2025 sau 26-11-2025
      const slashFormat = dateInput.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
      if (slashFormat) {
        day = slashFormat[1].padStart(2, '0');
        month = slashFormat[2].padStart(2, '0');
        year = slashFormat[3];
      } else {
        // �ncearc formatul YYYY-MM-DD
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
    'Art & Antichiti',
    'Electronice & Tehnologie',
    'Cas & Grdin',
    'Mod & Lifestyle',
    'Agricultur & Zootehnie',
    'Maritime & Aeronautice',
    'Business & Licitaii',
    'Materiale Construcii',
    'Diverse / Speciale'
  ];

  const subcategories = {
    'Imobiliare': [
      'Apartamente',
      'Case i Vile',
      'Terenuri Intravilane',
      'Terenuri Agricole',
      'Spaii Comerciale',
      'Hale Industriale',
      'Proprieti Turistice'
    ],
    'Autovehicule': [
      'Autoturisme',
      'SUV / 4x4',
      'Motociclete i Scutere',
      'Camioane',
      'Remorci i Semiremorci',
      'Autorulote / Rulote',
      'Vehicule Electrice',
      'Piese Auto i Accesorii'
    ],
    'Utilaje & Echipamente': [
      'Utilaje Construcii',
      'Utilaje Agricole',
      'Echipamente Forestiere',
      'Generatoare i Compresoare',
      'Scule Profesionale',
      'Echipamente Ateliere Auto',
      'Echipamente Electrice / Sudur'
    ],
    'Art & Antichiti': [
      'Picturi',
      'Sculpturi',
      'Bijuterii i Ceasuri',
      'Obiecte de Colecie',
      'Mobilier de Epoc',
      'Cri Rare, Hri Vechi',
      'Fotografie Artistic',
      'Licitaii Caritabile'
    ],
    'Electronice & Tehnologie': [
      'Laptopuri i PC-uri',
      'Telefoane Mobile',
      'Tablete',
      'TV & Audio',
      'Console & Jocuri',
      'Drone & Gadgeturi Smart',
      'Echipamente Foto/Video'
    ],
    'Cas & Grdin': [
      'Mobilier Interior',
      'Mobilier Exterior',
      'Echipamente de Grdinrit',
      'Decoraiuni',
      'Electrocasnice'
    ],
    'Mod & Lifestyle': [
      'Haine de Designer',
      '�nclminte',
      'Geni & Accesorii',
      'Parfumuri & Cosmetice',
      'Ceasuri de Lux'
    ],
    'Agricultur & Zootehnie': [
      'Tractoare, Combine',
      'Remorci Agricole',
      'Echipamente de Irigaii',
      'Animale',
      'Semine, Furaje, �ngrminte'
    ],
    'Maritime & Aeronautice': [
      'Brci, Iahturi, Skijeturi',
      'Motoare Marine',
      'Avioane Mici / Ultraleuoare',
      'Dronuri Industriale'
    ],
    'Business & Licitaii': [
      'Echipamente de Birou',
      'Mobilier Comercial',
      'Calculatoare Second-Hand',
      'Licitaii Lichidri Firme',
      'Loturi Stocuri Produse'
    ],
    'Materiale Construcii': [
      'Ciment, Crmid, Oel',
      'Materiale Izolaie',
      'Feronerie, Unelte',
      'Ui, Ferestre, T�mplrie'
    ],
    'Diverse / Speciale': [
      'Licitaii Caritabile',
      'Obiecte Militare / Istorice',
      'NFT / Art Digital',
      'Colecii Private',
      'Bunuri Confiscate / Executri'
    ]
  };

  // Lista judeelor din Rom�nia
  const counties = [
    'Alba', 'Arad', 'Arge', 'Bacu', 'Bihor', 'Bistria-Nsud', 'Botoani',
    'Braov', 'Brila', 'Buzu', 'Cara-Severin', 'Clrai', 'Cluj', 'Constana',
    'Covasna', 'D�mbovia', 'Dolj', 'Galai', 'Giurgiu', 'Gorj', 'Harghita',
    'Hunedoara', 'Ialomia', 'Iai', 'Ilfov', 'Maramure', 'Mehedini', 'Mure',
    'Neam', 'Olt', 'Prahova', 'Slaj', 'Satu Mare', 'Sibiu', 'Suceava',
    'Teleorman', 'Timi', 'Tulcea', 'V�lcea', 'Vaslui', 'Vrancea', 'Bucureti'
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
      label: 'Licitaii ANAF',
      description: 'Loturi scoase la licitaie prin ANAF, cu proceduri fiscal-bugetare clare i termene stricte.',
      icon: 'ri-government-line',
      iconClass: 'text-amber-500',
      activeClass: 'border-amber-500 bg-amber-50 shadow-inner shadow-amber-500/10 dark:border-amber-400 dark:bg-amber-900/20',
      inactiveClass: 'border-gray-200 bg-white hover:border-amber-300 dark:border-gray-600 dark:bg-gray-800 dark:hover:border-amber-400',
      indicatorActiveClass: 'border-amber-500 bg-amber-500',
    },
    {
      value: 'licitatii-insolventa',
      label: 'Licitaii insolven',
      description: 'Proceduri speciale pentru companii �n insolven; poi activa v�nzarea direct pentru oferta rapid.',
      icon: 'ri-exchange-dollar-line',
      iconClass: 'text-sky-500',
      activeClass: 'border-sky-500 bg-sky-50 shadow-inner shadow-sky-500/10 dark:border-sky-400 dark:bg-sky-900/25',
      inactiveClass: 'border-gray-200 bg-white hover:border-sky-300 dark:border-gray-600 dark:bg-gray-800 dark:hover:border-sky-400',
      indicatorActiveClass: 'border-sky-500 bg-sky-500',
    },
    {
      value: 'licitatii-executori',
      label: 'Licitaii executori',
      description: 'Dosare gestionate de executori judectoreti, cu condiii standardizate i proces transparent.',
      icon: 'ri-shield-check-line',
      iconClass: 'text-emerald-500',
      activeClass: 'border-emerald-500 bg-emerald-50 shadow-inner shadow-emerald-500/10 dark:border-emerald-400 dark:bg-emerald-900/25',
      inactiveClass: 'border-gray-200 bg-white hover:border-emerald-300 dark:border-gray-600 dark:bg-gray-800 dark:hover:border-emerald-400',
      indicatorActiveClass: 'border-emerald-500 bg-emerald-500',
    },
    {
      value: 'alte-licitatii',
      label: 'Alte licitaii',
      description: 'Proceduri publice diverse (instituii locale, private sau mixte) cu reguli flexibile.',
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

  // Definiii c�mpuri dinamice pe categorii i subcategorii
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
        { key: 'numarCamere', label: 'Numr Camere *', type: 'number', required: true, placeholder: 'Ex: 3', min: 1, max: 10 },
        { key: 'numarDormitoare', label: 'Numr Dormitoare', type: 'number', required: false, placeholder: 'Ex: 2', min: 0, max: 10 },
        { key: 'numarBai', label: 'Numr Bi', type: 'number', required: false, placeholder: 'Ex: 1', min: 0, max: 10 },
        { key: 'suprafata', label: 'Suprafa (mp)', type: 'number', required: false, placeholder: 'Ex: 75', min: 0, step: 0.01 },
        { key: 'etaj', label: 'Etaj', type: 'select', required: false, options: ['Parter', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10+', 'Ultimul etaj'] },
        { key: 'anConstructie', label: 'An Construcie', type: 'number', required: false, placeholder: 'Ex: 2020', min: 1800, max: new Date().getFullYear() },
        { key: 'compartimentare', label: 'Compartimentare', type: 'select', required: false, options: ['Decomandat', 'Semidecomandat', 'Nedecomandat', 'Open Space'] },
        { key: 'mentenanta', label: 'Menenan (RON/lun)', type: 'number', required: false, placeholder: 'Ex: 200', min: 0, step: 0.01 },
      ],
      'Case i Vile': [
        { key: 'numarCamere', label: 'Numr Camere *', type: 'number', required: true, placeholder: 'Ex: 5', min: 1, max: 20 },
        { key: 'numarDormitoare', label: 'Numr Dormitoare', type: 'number', required: false, placeholder: 'Ex: 3', min: 0, max: 15 },
        { key: 'numarBai', label: 'Numr Bi', type: 'number', required: false, placeholder: 'Ex: 2', min: 0, max: 10 },
        { key: 'suprafata', label: 'Suprafa Construit (mp)', type: 'number', required: false, placeholder: 'Ex: 150', min: 0, step: 0.01 },
        { key: 'suprafataTeren', label: 'Suprafa Teren (mp)', type: 'number', required: false, placeholder: 'Ex: 500', min: 0, step: 0.01 },
        { key: 'numarEtaje', label: 'Numr Etaje', type: 'number', required: false, placeholder: 'Ex: 2', min: 1, max: 5 },
        { key: 'anConstructie', label: 'An Construcie', type: 'number', required: false, placeholder: 'Ex: 2015', min: 1800, max: new Date().getFullYear() },
        { key: 'garaj', label: 'Garaj', type: 'select', required: false, options: ['Da', 'Nu'] },
      ],
      'Terenuri Intravilane': [
        { key: 'suprafata', label: 'Suprafa (mp) *', type: 'number', required: true, placeholder: 'Ex: 500', min: 0, step: 0.01 },
        { key: 'destinatie', label: 'Destinaie', type: 'select', required: false, options: ['Construcie', 'Comercial', 'Industrial', 'Servicii', 'Altele'] },
        { key: 'acces', label: 'Acces', type: 'select', required: false, options: ['Asfaltat', 'Pm�nt', 'Fr acces'] },
        { key: 'utilitati', label: 'Utiliti', type: 'select', required: false, options: ['Apa', 'Curent', 'Gaz', 'Canalizare', 'Toate', 'Niciunul'] },
      ],
      'Terenuri Agricole': [
        { key: 'suprafata', label: 'Suprafa (ha) *', type: 'number', required: true, placeholder: 'Ex: 5', min: 0, step: 0.01 },
        { key: 'tipCultivare', label: 'Tip Cultivare', type: 'select', required: false, options: ['Cereale', 'Leguminoase', 'Pune', 'Pdure', 'Viticultur', 'Fructe', 'Altele'] },
        { key: 'acces', label: 'Acces', type: 'select', required: false, options: ['Asfaltat', 'Pm�nt', 'Drum forestier', 'Fr acces'] },
      ],
      'Spaii Comerciale': [
        { key: 'suprafata', label: 'Suprafa (mp)', type: 'number', required: false, placeholder: 'Ex: 100', min: 0, step: 0.01 },
        { key: 'tipSpatiu', label: 'Tip Spaiu', type: 'select', required: false, options: ['Magazin', 'Showroom', 'Depozit', 'Restaurant', 'Birouri', 'Altele'] },
        { key: 'etaj', label: 'Etaj', type: 'select', required: false, options: ['Parter', '1', '2', '3', '4', '5+'] },
        { key: 'chirie', label: 'Chirie (RON/lun)', type: 'number', required: false, placeholder: 'Ex: 2000', min: 0, step: 0.01 },
      ],
      'Hale Industriale': [
        { key: 'suprafata', label: 'Suprafa (mp)', type: 'number', required: false, placeholder: 'Ex: 1000', min: 0, step: 0.01 },
        { key: 'inaltime', label: '�nlime (m)', type: 'number', required: false, placeholder: 'Ex: 8', min: 0, step: 0.01 },
        { key: 'caiAcces', label: 'Ci de Acces', type: 'select', required: false, options: ['Rutier', 'Feroviar', 'Ambele', 'Rutier principal'] },
        { key: 'utilitati', label: 'Utiliti', type: 'select', required: false, options: ['Apa', 'Curent', 'Gaz', 'Canalizare', 'Toate', 'Niciunul'] },
      ],
      'Proprieti Turistice': [
        { key: 'numarCamere', label: 'Numr Camere *', type: 'number', required: true, placeholder: 'Ex: 4', min: 1, max: 20 },
        { key: 'tipProprietate', label: 'Tip Proprietate', type: 'select', required: false, options: ['Cabana', 'Vila', 'Apartament', 'Complex', 'Altele'] },
        { key: 'capacitate', label: 'Capacitate (persoane)', type: 'number', required: false, placeholder: 'Ex: 8', min: 1 },
        { key: 'amenitati', label: 'Ameniti', type: 'text', required: false, placeholder: 'Ex: Piscin, Saun, Jacuzzi' },
      ],
    },
    'Autovehicule': {
      'Autoturisme': [
        { key: 'marca', label: 'Marca', type: 'text', required: false, placeholder: 'Ex: BMW' },
        { key: 'model', label: 'Model', type: 'text', required: false, placeholder: 'Ex: X5' },
        { key: 'an', label: 'An Fabricare', type: 'number', required: false, placeholder: 'Ex: 2020', min: 1950, max: new Date().getFullYear() },
        { key: 'kilometraj', label: 'Kilometraj', type: 'number', required: false, placeholder: 'Ex: 50000', min: 0 },
        { key: 'combustibil', label: 'Combustibil', type: 'select', required: false, options: ['Benzin', 'Motorin', 'GPL', 'Electric', 'Hibrid'] },
        { key: 'transmisie', label: 'Transmisie', type: 'select', required: false, options: ['Manual', 'Automat', 'CVT'] },
        { key: 'putere', label: 'Putere (KW)', type: 'number', required: false, placeholder: 'Ex: 150 sau 154.5', min: 0, step: 0.01 },
        { key: 'culoare', label: 'Culoare', type: 'text', required: false, placeholder: 'Ex: Negru' },
        { key: 'caroserie', label: 'Tip Caroserie', type: 'text', required: false, placeholder: 'Ex: Berlina, Break, SUV' },
        { key: 'serie_sasiu', label: 'Serie asiu', type: 'text', required: false, placeholder: 'Ex: JW 0LPD 6EB6FG087935' },
        { key: 'clasa_emisii', label: 'Clasa Emisii', type: 'text', required: false, placeholder: 'Ex: Euro 6, Euro 5' },
        { key: 'stare', label: 'Stare', type: 'select', required: false, options: ['Nou', 'Foarte bun', 'Bun', 'Folosit', 'Uzat'] },
        { key: 'capacitateCilindrica', label: 'Capacitate Cilindric (cm�)', type: 'number', required: false, placeholder: 'Ex: 3000', min: 0 },
        { key: 'nrLocuri', label: 'Numr Locuri', type: 'number', required: false, placeholder: 'Ex: 5', min: 2, max: 9 },
      ],
      'SUV / 4x4': [
        { key: 'marca', label: 'Marca', type: 'text', required: false, placeholder: 'Ex: Land Rover' },
        { key: 'model', label: 'Model', type: 'text', required: false, placeholder: 'Ex: Discovery' },
        { key: 'an', label: 'An Fabricare', type: 'number', required: false, placeholder: 'Ex: 2021', min: 1950, max: new Date().getFullYear() },
        { key: 'kilometraj', label: 'Kilometraj', type: 'number', required: false, placeholder: 'Ex: 35000', min: 0 },
        { key: 'combustibil', label: 'Combustibil', type: 'select', required: false, options: ['Benzin', 'Motorin', 'GPL', 'Electric', 'Hibrid'] },
        { key: 'transmisie', label: 'Transmisie', type: 'select', required: false, options: ['Manual', 'Automat', 'CVT'] },
        { key: 'putere', label: 'Putere (KW)', type: 'number', required: false, placeholder: 'Ex: 300 sau 154.5', min: 0, step: 0.01 },
        { key: 'culoare', label: 'Culoare', type: 'text', required: false, placeholder: 'Ex: Alb' },
        { key: 'tip4x4', label: 'Tip 4x4', type: 'select', required: false, options: ['Permanent', 'Cu blocare diferenial', 'Selectabil', 'Altele'] },
      ],
      'Motociclete i Scutere': [
        { key: 'marca', label: 'Marca', type: 'text', required: false, placeholder: 'Ex: Yamaha' },
        { key: 'model', label: 'Model', type: 'text', required: false, placeholder: 'Ex: R1' },
        { key: 'an', label: 'An Fabricare', type: 'number', required: false, placeholder: 'Ex: 2021', min: 1950, max: new Date().getFullYear() },
        { key: 'kilometraj', label: 'Kilometraj', type: 'number', required: false, placeholder: 'Ex: 15000', min: 0 },
        { key: 'combustibil', label: 'Combustibil', type: 'select', required: false, options: ['Benzin', 'Electric'] },
        { key: 'transmisie', label: 'Transmisie', type: 'select', required: false, options: ['Manual', 'CVT'] },
        { key: 'putere', label: 'Putere (KW)', type: 'number', required: false, placeholder: 'Ex: 200 sau 154.5', min: 0, step: 0.01 },
        { key: 'culoare', label: 'Culoare', type: 'text', required: false, placeholder: 'Ex: Alb' },
        { key: 'capacitateCilindrica', label: 'Capacitate Cilindric (cm�)', type: 'number', required: false, placeholder: 'Ex: 998', min: 0 },
      ],
      'Camioane': [
        { key: 'marca', label: 'Marca', type: 'text', required: false, placeholder: 'Ex: Mercedes' },
        { key: 'model', label: 'Model', type: 'text', required: false, placeholder: 'Ex: Actros' },
        { key: 'an', label: 'An Fabricare', type: 'number', required: false, placeholder: 'Ex: 2019', min: 1950, max: new Date().getFullYear() },
        { key: 'kilometraj', label: 'Kilometraj', type: 'number', required: false, placeholder: 'Ex: 200000', min: 0 },
        { key: 'capacitateIncarcare', label: 'Capacitate �ncrcare (t)', type: 'number', required: false, placeholder: 'Ex: 20', min: 0 },
        { key: 'combustibil', label: 'Combustibil', type: 'select', required: false, options: ['Motorin', 'Electric', 'Hybrid'] },
      ],
      'Remorci i Semiremorci': [
        { key: 'tip', label: 'Tip', type: 'select', required: false, options: ['Remorc', 'Semiremorc'] },
        { key: 'capacitateIncarcare', label: 'Capacitate �ncrcare (t)', type: 'number', required: false, placeholder: 'Ex: 25', min: 0 },
        { key: 'dimensiuni', label: 'Dimensiuni (m)', type: 'text', required: false, placeholder: 'Ex: 13.6x2.5x2.7' },
        { key: 'stare', label: 'Stare', type: 'select', required: false, options: ['Nou', 'Foarte bun', 'Bun', 'Uzat'] },
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
      'Piese Auto i Accesorii': [
        { key: 'tipPiesa', label: 'Tip Pies', type: 'select', required: false, options: ['Motor', 'Transmisie', 'Suspensie', 'Caroserie', 'Interior', 'Electronice', 'Altele'] },
        { key: 'compatibilitate', label: 'Compatibilitate', type: 'text', required: false, placeholder: 'Ex: BMW X5, 2015-2020' },
        { key: 'stare', label: 'Stare', type: 'select', required: false, options: ['Nou', 'Second hand'] },
        { key: 'codOriginal', label: 'Cod Original', type: 'text', required: false, placeholder: 'Ex: 123456789' },
      ],
    },
    'Electronice & Tehnologie': {
      'Laptopuri i PC-uri': [
        { key: 'brand', label: 'Brand', type: 'text', required: false, placeholder: 'Ex: Dell' },
        { key: 'model', label: 'Model', type: 'text', required: false, placeholder: 'Ex: XPS 15' },
        { key: 'procesor', label: 'Procesor', type: 'text', required: false, placeholder: 'Ex: Intel i7' },
        { key: 'ram', label: 'RAM (GB)', type: 'select', required: false, options: ['4', '8', '16', '32', '64'] },
        { key: 'stocare', label: 'Stocare', type: 'text', required: false, placeholder: 'Ex: 512GB SSD' },
        { key: 'gpu', label: 'GPU', type: 'text', required: false, placeholder: 'Ex: NVIDIA RTX 3060' },
        { key: 'dimensiuneEcran', label: 'Dimensiune Ecran (inch)', type: 'select', required: false, options: ['13', '14', '15', '16', '17'] },
        { key: 'stare', label: 'Stare', type: 'select', required: false, options: ['Nou', 'Foarte bun', 'Bun', 'Uzat'] },
      ],
      'Telefoane Mobile': [
        { key: 'brand', label: 'Brand', type: 'text', required: false, placeholder: 'Ex: iPhone' },
        { key: 'model', label: 'Model', type: 'text', required: false, placeholder: 'Ex: 15 Pro' },
        { key: 'capacitateStocare', label: 'Capacitate Stocare (GB)', type: 'select', required: false, options: ['32', '64', '128', '256', '512', '1024'] },
        { key: 'ram', label: 'RAM (GB)', type: 'select', required: false, options: ['2', '4', '6', '8', '12', '16'] },
        { key: 'culoare', label: 'Culoare', type: 'text', required: false, placeholder: 'Ex: Negru' },
        { key: 'stare', label: 'Stare', type: 'select', required: false, options: ['Nou', 'Foarte bun', 'Bun', 'Uzat'] },
        { key: 'garantie', label: 'Garanie', type: 'select', required: false, options: ['Da', 'Nu'] },
      ],
      'Tablete': [
        { key: 'brand', label: 'Brand', type: 'text', required: false, placeholder: 'Ex: iPad' },
        { key: 'model', label: 'Model', type: 'text', required: false, placeholder: 'Ex: Pro 12.9' },
        { key: 'capacitateStocare', label: 'Capacitate Stocare (GB)', type: 'select', required: false, options: ['32', '64', '128', '256', '512', '1024'] },
        { key: 'ram', label: 'RAM (GB)', type: 'select', required: false, options: ['2', '4', '6', '8'] },
        { key: 'dimensiuneEcran', label: 'Dimensiune Ecran (inch)', type: 'select', required: false, options: ['7', '8', '9', '10', '11', '12.9'] },
        { key: 'culoare', label: 'Culoare', type: 'text', required: false, placeholder: 'Ex: Gri' },
        { key: 'stare', label: 'Stare', type: 'select', required: false, options: ['Nou', 'Foarte bun', 'Bun', 'Uzat'] },
      ],
      'TV & Audio': [
        { key: 'brand', label: 'Brand', type: 'text', required: false, placeholder: 'Ex: Samsung' },
        { key: 'dimensiuneEcran', label: 'Dimensiune Ecran (inch)', type: 'select', required: false, options: ['32', '43', '50', '55', '65', '75', '85'] },
        { key: 'tipEcran', label: 'Tip Ecran', type: 'select', required: false, options: ['LED', 'OLED', 'QLED', 'LCD', 'Plasma'] },
        { key: 'rezolutie', label: 'Rezoluie', type: 'select', required: false, options: ['HD', 'Full HD', '4K', '8K'] },
        { key: 'stare', label: 'Stare', type: 'select', required: false, options: ['Nou', 'Foarte bun', 'Bun', 'Uzat'] },
      ],
      'Console & Jocuri': [
        { key: 'brand', label: 'Brand', type: 'text', required: false, placeholder: 'Ex: Sony' },
        { key: 'model', label: 'Model', type: 'text', required: false, placeholder: 'Ex: PlayStation 5' },
        { key: 'tipConsole', label: 'Tip Console', type: 'select', required: false, options: ['PlayStation', 'Xbox', 'Nintendo', 'PC Gaming', 'Altele'] },
        { key: 'stocare', label: 'Stocare (GB)', type: 'number', required: false, placeholder: 'Ex: 1000', min: 0 },
        { key: 'stare', label: 'Stare', type: 'select', required: false, options: ['Nou', 'Foarte bun', 'Bun', 'Uzat'] },
        { key: 'garantie', label: 'Garanie', type: 'select', required: false, options: ['Da', 'Nu'] },
      ],
      'Drone & Gadgeturi Smart': [
        { key: 'brand', label: 'Brand', type: 'text', required: false, placeholder: 'Ex: DJI' },
        { key: 'model', label: 'Model', type: 'text', required: false, placeholder: 'Ex: Mavic 3' },
        { key: 'tip', label: 'Tip', type: 'select', required: false, options: ['Drone', 'Smartwatch', 'Smart Speaker', 'Altele'] },
        { key: 'autonomie', label: 'Autonomie', type: 'text', required: false, placeholder: 'Ex: 30 minute' },
        { key: 'stare', label: 'Stare', type: 'select', required: false, options: ['Nou', 'Foarte bun', 'Bun', 'Uzat'] },
      ],
      'Echipamente Foto/Video': [
        { key: 'brand', label: 'Brand', type: 'text', required: false, placeholder: 'Ex: Canon' },
        { key: 'model', label: 'Model', type: 'text', required: false, placeholder: 'Ex: EOS R5' },
        { key: 'tip', label: 'Tip', type: 'select', required: false, options: ['APSC', 'Full Frame', 'Medium Format', 'Action Camera', 'Camcorder', 'Altele'] },
        { key: 'rezolutie', label: 'Rezoluie Video', type: 'select', required: false, options: ['1080p', '4K', '8K'] },
        { key: 'stare', label: 'Stare', type: 'select', required: false, options: ['Nou', 'Foarte bun', 'Bun', 'Uzat'] },
      ],
    },
    'Mod & Lifestyle': {
      'Haine de Designer': [
        { key: 'marime', label: 'Mrime', type: 'select', required: false, options: ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL'] },
        { key: 'material', label: 'Material', type: 'text', required: false, placeholder: 'Ex: Bumbac 100%' },
        { key: 'culoare', label: 'Culoare', type: 'text', required: false, placeholder: 'Ex: Negru' },
        { key: 'stare', label: 'Stare', type: 'select', required: false, options: ['Nou', 'Foarte bun', 'Bun', 'Uzat'] },
        { key: 'sezon', label: 'Sezon', type: 'select', required: false, options: ['Primvar', 'Var', 'Toamn', 'Iarn', 'All-season'] },
      ],
      '�nclminte': [
        { key: 'marime', label: 'Mrime', type: 'select', required: false, options: ['35', '36', '37', '38', '39', '40', '41', '42', '43', '44', '45', '46', '47'] },
        { key: 'tip', label: 'Tip �ncalminte', type: 'select', required: false, options: ['Pantofi', 'Ghete', 'Adidai', 'Sandale', 'Cizme', 'Altele'] },
        { key: 'material', label: 'Material', type: 'text', required: false, placeholder: 'Ex: Piele' },
        { key: 'culoare', label: 'Culoare', type: 'text', required: false, placeholder: 'Ex: Negru' },
        { key: 'stare', label: 'Stare', type: 'select', required: false, options: ['Nou', 'Foarte bun', 'Bun', 'Uzat'] },
      ],
      'Geni & Accesorii': [
        { key: 'tipAccesoriu', label: 'Tip Accesoriu', type: 'select', required: false, options: ['Geant', 'Portofel', 'Curea', 'Earf', 'Altele'] },
        { key: 'material', label: 'Material', type: 'text', required: false, placeholder: 'Ex: Piele' },
        { key: 'culoare', label: 'Culoare', type: 'text', required: false, placeholder: 'Ex: Maro' },
        { key: 'stare', label: 'Stare', type: 'select', required: false, options: ['Nou', 'Foarte bun', 'Bun', 'Uzat'] },
      ],
      'Parfumuri & Cosmetice': [
        { key: 'brand', label: 'Brand', type: 'text', required: false, placeholder: 'Ex: Dior' },
        { key: 'model', label: 'Model', type: 'text', required: false, placeholder: 'Ex: Sauvage' },
        { key: 'tip', label: 'Tip', type: 'select', required: false, options: ['Parfum', 'Deodorant', 'Cosmetice', 'Altele'] },
        { key: 'capacitate', label: 'Capacitate (ml)', type: 'number', required: false, placeholder: 'Ex: 100', min: 0 },
        { key: 'stare', label: 'Stare', type: 'select', required: false, options: ['Nou', 'Foarte bun', 'Bun', 'Uzat'] },
      ],
      'Ceasuri de Lux': [
        { key: 'brand', label: 'Brand', type: 'text', required: false, placeholder: 'Ex: Rolex' },
        { key: 'model', label: 'Model', type: 'text', required: false, placeholder: 'Ex: Submariner' },
        { key: 'material', label: 'Material', type: 'select', required: false, options: ['Oel', 'Aur', 'Platin', 'Titan', 'Ceramic'] },
        { key: 'an', label: 'An Fabricare', type: 'number', required: false, placeholder: 'Ex: 2020', min: 1900, max: new Date().getFullYear() },
        { key: 'stare', label: 'Stare', type: 'select', required: false, options: ['Excelent', 'Foarte bun', 'Bun', 'Uzat'] },
      ],
    },
    'Cas & Grdin': {
      'Mobilier Interior': [
        { key: 'tipMobilier', label: 'Tip Mobilier', type: 'select', required: false, options: ['Canapea', 'Mas', 'Scaun', 'Dulap', 'Pat', 'Altele'] },
        { key: 'material', label: 'Material', type: 'text', required: false, placeholder: 'Ex: Lemn' },
        { key: 'culoare', label: 'Culoare', type: 'text', required: false, placeholder: 'Ex: Maro' },
        { key: 'dimensiuni', label: 'Dimensiuni (cm)', type: 'text', required: false, placeholder: 'Ex: 200x90x85' },
        { key: 'stare', label: 'Stare', type: 'select', required: false, options: ['Nou', 'Foarte bun', 'Bun', 'Uzat'] },
      ],
      'Mobilier Exterior': [
        { key: 'tipMobilier', label: 'Tip Mobilier', type: 'select', required: false, options: ['Mas', 'Scaun', 'Canapea', 'Umbrel', 'Altele'] },
        { key: 'material', label: 'Material', type: 'select', required: false, options: ['Rattan', 'Lemn', 'Metal', 'Plastic', 'Altele'] },
        { key: 'stare', label: 'Stare', type: 'select', required: false, options: ['Nou', 'Foarte bun', 'Bun', 'Uzat'] },
      ],
      'Echipamente de Grdinrit': [
        { key: 'tipEchipament', label: 'Tip Echipament', type: 'select', required: false, options: ['Tractoare', 'Cositoare', 'Motoare', 'Unelte', 'Plante', 'Altele'] },
        { key: 'putere', label: 'Putere', type: 'text', required: false, placeholder: 'Ex: 2500W' },
        { key: 'stare', label: 'Stare', type: 'select', required: false, options: ['Nou', 'Foarte bun', 'Bun', 'Uzat'] },
      ],
      'Decoraiuni': [
        { key: 'tipDecoratiune', label: 'Tip Decoraiune', type: 'select', required: false, options: ['Tablou', 'Sculptur', 'Vaz', 'Lampa', 'Covor', 'Altele'] },
        { key: 'material', label: 'Material', type: 'text', required: false, placeholder: 'Ex: Ceramic' },
        { key: 'culoare', label: 'Culoare', type: 'text', required: false, placeholder: 'Ex: Alb' },
        { key: 'dimensiuni', label: 'Dimensiuni (cm)', type: 'text', required: false, placeholder: 'Ex: 50x30' },
        { key: 'stare', label: 'Stare', type: 'select', required: false, options: ['Nou', 'Foarte bun', 'Bun', 'Uzat'] },
      ],
      'Electrocasnice': [
        { key: 'brand', label: 'Brand', type: 'text', required: false, placeholder: 'Ex: Samsung' },
        { key: 'model', label: 'Model', type: 'text', required: false, placeholder: 'Ex: WW90TA046AE' },
        { key: 'tipElectrocasnic', label: 'Tip Electrocasnic', type: 'select', required: false, options: ['Main de splat', 'Frigider', 'Cuptor', 'Aragaz', 'Aspirator', 'Altele'] },
        { key: 'energie', label: 'Clas Energetic', type: 'select', required: false, options: ['A+++', 'A++', 'A+', 'A', 'B', 'C', 'D'] },
        { key: 'an', label: 'An Fabricare', type: 'number', required: false, placeholder: 'Ex: 2020', min: 2010, max: new Date().getFullYear() },
        { key: 'stare', label: 'Stare', type: 'select', required: false, options: ['Nou', 'Foarte bun', 'Bun', 'Uzat'] },
      ],
    },
    'Executri Silite': {
      'Imobile (Executri)': [
        { key: 'tipExecutare', label: 'Tip Executare', type: 'select', required: false, options: ['ANAF', 'Judectorie', 'Banc', 'Furnizor', 'Alte creane'] },
        { key: 'instanta', label: 'Instan', type: 'text', required: false, placeholder: 'Ex: Judectoria Bucureti' },
        { key: 'debitor', label: 'Debitor', type: 'text', required: false, placeholder: 'Nume debitor' },
        { key: 'valoareExecutare', label: 'Valoare Executare (Lei)', type: 'number', required: false, placeholder: 'Ex: 500000', min: 0 },
      ],
      'Terenuri (Executri)': [
        { key: 'tipExecutare', label: 'Tip Executare', type: 'select', required: false, options: ['ANAF', 'Judectorie', 'Banc', 'Furnizor', 'Alte creane'] },
        { key: 'suprafata', label: 'Suprafa (mp)', type: 'number', required: false, placeholder: 'Ex: 1000', min: 0, step: 0.01 },
        { key: 'instanta', label: 'Instan', type: 'text', required: false, placeholder: 'Ex: Judectoria Bucureti' },
      ],
      'Maini (Executri)': [
        { key: 'tipExecutare', label: 'Tip Executare', type: 'select', required: false, options: ['ANAF', 'Judectorie', 'Banc', 'Furnizor', 'Alte creane'] },
        { key: 'marca', label: 'Marca', type: 'text', required: false, placeholder: 'Ex: BMW' },
        { key: 'model', label: 'Model', type: 'text', required: false, placeholder: 'Ex: X5' },
        { key: 'an', label: 'An Fabricare', type: 'number', required: false, placeholder: 'Ex: 2020', min: 1950, max: new Date().getFullYear() },
      ],
      'Utilaje (Executri)': [
        { key: 'tipExecutare', label: 'Tip Executare', type: 'select', required: false, options: ['ANAF', 'Judectorie', 'Banc', 'Furnizor', 'Alte creane'] },
        { key: 'tipUtilaj', label: 'Tip Utilaj', type: 'text', required: false, placeholder: 'Ex: Excavator' },
        { key: 'marca', label: 'Marca', type: 'text', required: false, placeholder: 'Ex: Caterpillar' },
      ],
      'Bunuri Personale': [
        { key: 'tipBun', label: 'Tip Bun', type: 'text', required: false, placeholder: 'Ex: Mobilier' },
        { key: 'descriere', label: 'Descriere', type: 'textarea', required: false, placeholder: 'Descriere detaliat' },
      ],
      'Aciuni Societi': [
        { key: 'tipExecutare', label: 'Tip Executare', type: 'select', required: false, options: ['ANAF', 'Judectorie', 'Banc', 'Furnizor', 'Alte creane'] },
        { key: 'numeSocietate', label: 'Nume Societate', type: 'text', required: false, placeholder: 'Ex: SC Example SRL' },
        { key: 'numarActiuni', label: 'Numr Aciuni', type: 'number', required: false, placeholder: 'Ex: 1000', min: 1 },
      ],
      'Drepturi Creane': [
        { key: 'tipCreanta', label: 'Tip Crean', type: 'text', required: false, placeholder: 'Ex: Crean comercial' },
        { key: 'valoare', label: 'Valoare (Lei)', type: 'number', required: false, placeholder: 'Ex: 100000', min: 0 },
      ],
      'Alte Bunuri': [
        { key: 'tipBun', label: 'Tip Bun', type: 'text', required: false, placeholder: 'Descrie tipul de bun' },
        { key: 'descriere', label: 'Descriere', type: 'textarea', required: false, placeholder: 'Descriere detaliat' },
      ],
    },
    'Utilaje & Echipamente': {
      'Utilaje Construcii': [
        { key: 'tipUtilaj', label: 'Tip Utilaj', type: 'select', required: false, options: ['Excavator', 'Buldocer', 'Macara', 'Betoniera', 'Compresor', 'Altele'] },
        { key: 'marca', label: 'Marca', type: 'text', required: false, placeholder: 'Ex: Caterpillar' },
        { key: 'model', label: 'Model', type: 'text', required: false, placeholder: 'Ex: CAT 320' },
        { key: 'an', label: 'An Fabricare', type: 'number', required: false, placeholder: 'Ex: 2018', min: 1950, max: new Date().getFullYear() },
        { key: 'oreUtilizare', label: 'Ore Utilizare', type: 'number', required: false, placeholder: 'Ex: 5000', min: 0 },
      ],
      'Utilaje Agricole': [
        { key: 'tipUtilaj', label: 'Tip Utilaj', type: 'select', required: false, options: ['Tractor', 'Combine', 'Presa', 'Plug', 'Semntoare', 'Altele'] },
        { key: 'marca', label: 'Marca', type: 'text', required: false, placeholder: 'Ex: John Deere' },
        { key: 'an', label: 'An Fabricare', type: 'number', required: false, placeholder: 'Ex: 2019', min: 1950, max: new Date().getFullYear() },
        { key: 'oreUtilizare', label: 'Ore Utilizare', type: 'number', required: false, placeholder: 'Ex: 3000', min: 0 },
      ],
      'Echipamente Forestiere': [
        { key: 'tipEchipament', label: 'Tip Echipament', type: 'select', required: false, options: ['Ferraj', 'Tractor forestier', 'Echipament tiere', 'Altele'] },
        { key: 'marca', label: 'Marca', type: 'text', required: false, placeholder: 'Ex: Valmet' },
        { key: 'stare', label: 'Stare', type: 'select', required: false, options: ['Nou', 'Foarte bun', 'Bun', 'Uzat'] },
      ],
      'Generatoare i Compresoare': [
        { key: 'tip', label: 'Tip', type: 'select', required: false, options: ['Generator', 'Compresor'] },
        { key: 'putere', label: 'Putere (kW)', type: 'number', required: false, placeholder: 'Ex: 50', min: 0 },
        { key: 'combustibil', label: 'Combustibil', type: 'select', required: false, options: ['Diesel', 'Benzin', 'Gaz', 'Electric'] },
        { key: 'stare', label: 'Stare', type: 'select', required: false, options: ['Nou', 'Foarte bun', 'Bun', 'Uzat'] },
      ],
      'Scule Profesionale': [
        { key: 'tipScula', label: 'Tip Scula', type: 'select', required: false, options: ['Unelte manuale', 'Unelte electrice', 'Set de scule', 'Altele'] },
        { key: 'marca', label: 'Marca', type: 'text', required: false, placeholder: 'Ex: Bosch' },
        { key: 'stare', label: 'Stare', type: 'select', required: false, options: ['Nou', 'Foarte bun', 'Bun', 'Uzat'] },
      ],
      'Echipamente Ateliere Auto': [
        { key: 'tipEchipament', label: 'Tip Echipament', type: 'select', required: false, options: ['Ridictor', 'Compresor', 'Stand', 'Echipament diagnostic', 'Altele'] },
        { key: 'marca', label: 'Marca', type: 'text', required: false, placeholder: 'Ex: Snap-on' },
        { key: 'stare', label: 'Stare', type: 'select', required: false, options: ['Nou', 'Foarte bun', 'Bun', 'Uzat'] },
      ],
      'Echipamente Electrice / Sudur': [
        { key: 'tipEchipament', label: 'Tip Echipament', type: 'select', required: false, options: ['Aparat sudur', 'Invertor', 'Echipament protecie', 'Altele'] },
        { key: 'putere', label: 'Putere (A)', type: 'number', required: false, placeholder: 'Ex: 200', min: 0 },
        { key: 'stare', label: 'Stare', type: 'select', required: false, options: ['Nou', 'Foarte bun', 'Bun', 'Uzat'] },
      ],
    },
    'Art & Antichiti': {
      'Picturi': [
        { key: 'artist', label: 'Artist', type: 'text', required: false, placeholder: 'Ex: Ioan Popescu' },
        { key: 'tehnica', label: 'Tehnic', type: 'select', required: false, options: ['Ulei', 'Acuarel', 'Acrilic', 'Pastel', 'Altele'] },
        { key: 'dimensiuni', label: 'Dimensiuni (cm)', type: 'text', required: false, placeholder: 'Ex: 50x70' },
        { key: 'an', label: 'An', type: 'number', required: false, placeholder: 'Ex: 2020', min: 1500, max: new Date().getFullYear() },
        { key: 'stare', label: 'Stare', type: 'select', required: false, options: ['Excelent', 'Foarte bun', 'Bun', 'Uzat'] },
      ],
      'Sculpturi': [
        { key: 'artist', label: 'Artist', type: 'text', required: false, placeholder: 'Ex: Ion Georgescu' },
        { key: 'material', label: 'Material', type: 'select', required: false, options: ['Bronz', 'Marmur', 'Lemn', 'Altele'] },
        { key: 'dimensiuni', label: 'Dimensiuni (cm)', type: 'text', required: false, placeholder: 'Ex: 30x40x50' },
        { key: 'an', label: 'An', type: 'number', required: false, placeholder: 'Ex: 1990', min: 1500, max: new Date().getFullYear() },
        { key: 'stare', label: 'Stare', type: 'select', required: false, options: ['Excelent', 'Foarte bun', 'Bun', 'Uzat'] },
      ],
      'Bijuterii i Ceasuri': [
        { key: 'tipBijuterie', label: 'Tip Bijuterie', type: 'select', required: false, options: ['Inel', 'Colier', 'Cercei', 'Brar', 'Ceas', 'Altele'] },
        { key: 'material', label: 'Material', type: 'select', required: false, options: ['Aur', 'Argint', 'Platin', 'Bijuterii', 'Altele'] },
        { key: 'piatra', label: 'Piatr Preioas', type: 'text', required: false, placeholder: 'Ex: Diamant' },
        { key: 'stare', label: 'Stare', type: 'select', required: false, options: ['Nou', 'Foarte bun', 'Bun', 'Uzat'] },
      ],
      'Obiecte de Colecie': [
        { key: 'tipColectie', label: 'Tip Colecie', type: 'select', required: false, options: ['Filatelie', 'Numismatic', 'Figurine', 'Altele'] },
        { key: 'numarPiese', label: 'Numr Piese', type: 'number', required: false, placeholder: 'Ex: 50', min: 1 },
        { key: 'stare', label: 'Stare', type: 'select', required: false, options: ['Excelent', 'Foarte bun', 'Bun', 'Uzat'] },
      ],
      'Mobilier de Epoc': [
        { key: 'perioada', label: 'Perioad', type: 'select', required: false, options: ['Sec. XIX', '1900-1950', '1950-2000', 'Altele'] },
        { key: 'material', label: 'Material', type: 'text', required: false, placeholder: 'Ex: Lemn masiv' },
        { key: 'tipMobilier', label: 'Tip Mobilier', type: 'select', required: false, options: ['Canapea', 'Mas', 'Scaun', 'Dulap', 'Pat', 'Altele'] },
        { key: 'stare', label: 'Stare', type: 'select', required: false, options: ['Excelent', 'Foarte bun', 'Bun', 'Necesit restaurare'] },
      ],
      'Cri Rare, Hri Vechi': [
        { key: 'tip', label: 'Tip', type: 'select', required: false, options: ['Carte', 'Hart', 'Atlas', 'Manuscris', 'Altele'] },
        { key: 'an', label: 'An', type: 'number', required: false, placeholder: 'Ex: 1850', min: 1000, max: new Date().getFullYear() },
        { key: 'limba', label: 'Limb', type: 'text', required: false, placeholder: 'Ex: Rom�n' },
        { key: 'stare', label: 'Stare', type: 'select', required: false, options: ['Excelent', 'Foarte bun', 'Bun', 'Uzat'] },
      ],
      'Fotografie Artistic': [
        { key: 'artist', label: 'Artist/Fotograf', type: 'text', required: false, placeholder: 'Ex: Ansel Adams' },
        { key: 'tehnica', label: 'Tehnic', type: 'select', required: false, options: ['Gelatin silver', 'Color', 'Digital print', 'Altele'] },
        { key: 'dimensiuni', label: 'Dimensiuni (cm)', type: 'text', required: false, placeholder: 'Ex: 40x60' },
        { key: 'stare', label: 'Stare', type: 'select', required: false, options: ['Excelent', 'Foarte bun', 'Bun', 'Uzat'] },
      ],
      'Licitaii Caritabile': [
        { key: 'organizatie', label: 'Organizaie', type: 'text', required: false, placeholder: 'Ex: UNICEF Rom�nia' },
        { key: 'scop', label: 'Scop', type: 'text', required: false, placeholder: 'Ex: Sprijin pentru copii' },
      ],
    },
    'Agricultur & Zootehnie': {
      'Tractoare, Combine': [
        { key: 'marca', label: 'Marca', type: 'text', required: false, placeholder: 'Ex: John Deere' },
        { key: 'model', label: 'Model', type: 'text', required: false, placeholder: 'Ex: 6120R' },
        { key: 'an', label: 'An Fabricare', type: 'number', required: false, placeholder: 'Ex: 2020', min: 1950, max: new Date().getFullYear() },
        { key: 'putere', label: 'Putere (CP)', type: 'number', required: false, placeholder: 'Ex: 120', min: 0 },
        { key: 'oreUtilizare', label: 'Ore Utilizare', type: 'number', required: false, placeholder: 'Ex: 2500', min: 0 },
      ],
      'Remorci Agricole': [
        { key: 'tipRemorca', label: 'Tip Remorc', type: 'select', required: false, options: ['Remorc basculant', 'Remorc platform', 'Remorc cistern', 'Altele'] },
        { key: 'capacitate', label: 'Capacitate (t)', type: 'number', required: false, placeholder: 'Ex: 15', min: 0 },
        { key: 'stare', label: 'Stare', type: 'select', required: false, options: ['Nou', 'Foarte bun', 'Bun', 'Uzat'] },
      ],
      'Echipamente de Irigaii': [
        { key: 'tipEchipament', label: 'Tip Echipament', type: 'select', required: false, options: ['Pivot central', 'Sistem aspersiune', 'Gote', 'Altele'] },
        { key: 'suprafata', label: 'Suprafa (ha)', type: 'number', required: false, placeholder: 'Ex: 10', min: 0, step: 0.01 },
      ],
      'Animale': [
        { key: 'tipAnimal', label: 'Tip Animal', type: 'select', required: false, options: ['Bovine', 'Porcine', 'Ovine', 'Cabaline', 'Altele'] },
        { key: 'numar', label: 'Numr Capete', type: 'number', required: false, placeholder: 'Ex: 50', min: 1 },
        { key: 'rasa', label: 'Ras', type: 'text', required: false, placeholder: 'Ex: Holstein' },
      ],
      'Semine, Furaje, �ngrminte': [
        { key: 'tip', label: 'Tip', type: 'select', required: false, options: ['Semine', 'Furaje', '�ngrminte', 'Altele'] },
        { key: 'cantitate', label: 'Cantitate (kg)', type: 'number', required: false, placeholder: 'Ex: 1000', min: 0 },
      ],
    },
    'Maritime & Aeronautice': {
      'Brci, Iahturi, Skijeturi': [
        { key: 'tipVas', label: 'Tip Vas', type: 'select', required: false, options: ['Barc', 'Iaht', 'Skijet', 'Ponton', 'Altele'] },
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
      'Avioane Mici / Ultraleuoare': [
        { key: 'marca', label: 'Marca', type: 'text', required: false, placeholder: 'Ex: Cessna' },
        { key: 'model', label: 'Model', type: 'text', required: false, placeholder: 'Ex: 172' },
        { key: 'tip', label: 'Tip', type: 'select', required: false, options: ['Avion mic', 'Ultraleuor', 'Glider', 'Altele'] },
        { key: 'oreZbor', label: 'Ore Zbor', type: 'number', required: false, placeholder: 'Ex: 500', min: 0 },
      ],
      'Dronuri Industriale': [
        { key: 'marca', label: 'Marca', type: 'text', required: false, placeholder: 'Ex: DJI' },
        { key: 'model', label: 'Model', type: 'text', required: false, placeholder: 'Ex: Matrice 300' },
        { key: 'autonomie', label: 'Autonomie (minute)', type: 'number', required: false, placeholder: 'Ex: 55', min: 0 },
        { key: 'incarcareMaxima', label: '�ncrcare Maxim (kg)', type: 'number', required: false, placeholder: 'Ex: 9', min: 0, step: 0.01 },
      ],
    },
    'Business & Licitaii': {
      'Echipamente de Birou': [
        { key: 'tipEchipament', label: 'Tip Echipament', type: 'select', required: false, options: ['Imprimant', 'Fax', 'Scaner', 'Proiector', 'Altele'] },
        { key: 'brand', label: 'Brand', type: 'text', required: false, placeholder: 'Ex: HP' },
        { key: 'stare', label: 'Stare', type: 'select', required: false, options: ['Nou', 'Foarte bun', 'Bun', 'Uzat'] },
      ],
      'Mobilier Comercial': [
        { key: 'tipMobilier', label: 'Tip Mobilier', type: 'select', required: false, options: ['Birou', 'Scaun', 'Dulap', 'Vitrin', 'Altele'] },
        { key: 'material', label: 'Material', type: 'text', required: false, placeholder: 'Ex: Lemn' },
        { key: 'stare', label: 'Stare', type: 'select', required: false, options: ['Nou', 'Foarte bun', 'Bun', 'Uzat'] },
      ],
      'Calculatoare Second-Hand': [
        { key: 'brand', label: 'Brand', type: 'text', required: false, placeholder: 'Ex: Dell' },
        { key: 'model', label: 'Model', type: 'text', required: false, placeholder: 'Ex: OptiPlex' },
        { key: 'procesor', label: 'Procesor', type: 'text', required: false, placeholder: 'Ex: Intel i5' },
        { key: 'ram', label: 'RAM (GB)', type: 'select', required: false, options: ['4', '8', '16', '32'] },
      ],
      'Licitaii Lichidri Firme': [
        { key: 'tipFirma', label: 'Tip Firm', type: 'text', required: false, placeholder: 'Ex: SRL' },
        { key: 'domeniu', label: 'Domeniu Activitate', type: 'text', required: false, placeholder: 'Ex: Comer' },
      ],
      'Loturi Stocuri Produse': [
        { key: 'tipProduse', label: 'Tip Produse', type: 'text', required: false, placeholder: 'Ex: Electronice' },
        { key: 'cantitate', label: 'Cantitate', type: 'number', required: false, placeholder: 'Ex: 100', min: 1 },
      ],
    },
    'Materiale Construcii': {
      'Ciment, Crmid, Oel': [
        { key: 'tipMaterial', label: 'Tip Material', type: 'select', required: false, options: ['Ciment', 'Crmid', 'Oel', 'Altele'] },
        { key: 'cantitate', label: 'Cantitate', type: 'number', required: false, placeholder: 'Ex: 1000', min: 0 },
        { key: 'unitate', label: 'Unitate', type: 'select', required: false, options: ['Kg', 'Tone', 'Tone', 'm�'] },
      ],
      'Materiale Izolaie': [
        { key: 'tipIzolatie', label: 'Tip Izolaie', type: 'select', required: false, options: ['Polistiren', 'L�n mineral', 'Vat bazaltic', 'Altele'] },
        { key: 'grosime', label: 'Grosime (cm)', type: 'number', required: false, placeholder: 'Ex: 10', min: 0 },
        { key: 'cantitate', label: 'Cantitate (mp)', type: 'number', required: false, placeholder: 'Ex: 500', min: 0 },
      ],
      'Feronerie, Unelte': [
        { key: 'tip', label: 'Tip', type: 'select', required: false, options: ['Feronerie', 'Unelte', 'Ambele'] },
        { key: 'descriere', label: 'Descriere', type: 'textarea', required: false, placeholder: 'Descriere detaliat' },
      ],
      'Ui, Ferestre, T�mplrie': [
        { key: 'tip', label: 'Tip', type: 'select', required: false, options: ['Ui', 'Ferestre', 'T�mplrie', 'Altele'] },
        { key: 'material', label: 'Material', type: 'select', required: false, options: ['Lemn', 'PVC', 'Aluminiu', 'Altele'] },
        { key: 'numar', label: 'Numr Piese', type: 'number', required: false, placeholder: 'Ex: 10', min: 1 },
      ],
    },
    'Diverse / Speciale': {
      'Licitaii Caritabile': [
        { key: 'organizatie', label: 'Organizaie', type: 'text', required: false, placeholder: 'Ex: UNICEF Rom�nia' },
        { key: 'scop', label: 'Scop', type: 'text', required: false, placeholder: 'Ex: Sprijin pentru copii' },
      ],
      'Obiecte Militare / Istorice': [
        { key: 'perioada', label: 'Perioad', type: 'text', required: false, placeholder: 'Ex: Al Doilea Rzboi Mondial' },
        { key: 'tip', label: 'Tip Obiect', type: 'text', required: false, placeholder: 'Ex: Uniform' },
        { key: 'stare', label: 'Stare', type: 'select', required: false, options: ['Excelent', 'Foarte bun', 'Bun', 'Uzat'] },
      ],
      'NFT / Art Digital': [
        { key: 'tip', label: 'Tip', type: 'select', required: false, options: ['NFT', 'Art Digital', 'Token', 'Altele'] },
        { key: 'blockchain', label: 'Blockchain', type: 'select', required: false, options: ['Ethereum', 'Solana', 'Polygon', 'Altele'] },
        { key: 'contractAddress', label: 'Contract Address', type: 'text', required: false, placeholder: 'Ex: 0x1234...' },
      ],
      'Colecii Private': [
        { key: 'tipColectie', label: 'Tip Colecie', type: 'text', required: false, placeholder: 'Ex: Coins' },
        { key: 'numarPiese', label: 'Numr Piese', type: 'number', required: false, placeholder: 'Ex: 200', min: 1 },
      ],
      'Bunuri Confiscate / Executri': [
        { key: 'tipExecutare', label: 'Tip Executare', type: 'select', required: false, options: ['ANAF', 'Judectorie', 'Banc', 'Furnizor', 'Alte creane'] },
        { key: 'descriere', label: 'Descriere', type: 'textarea', required: false, placeholder: 'Descriere detaliat' },
      ],
    },
  };

  // Obine c�mpurile dinamice pentru categoria i subcategoria curent
  const getDynamicFields = () => {
    if (!formData.category || !formData.subcategory) return [];
    
    // Pentru Executri Silite, mapm subcategoriile la categoriile originale
    if (formData.category === 'Executri Silite') {
      const executionToCategoryMap: Record<string, { category: string; subcategory: string }> = {
        'Imobile (Executri)': { category: 'Imobiliare', subcategory: 'Apartamente' },
        'Terenuri (Executri)': { category: 'Imobiliare', subcategory: 'Terenuri Intravilane' },
        'Maini (Executri)': { category: 'Autovehicule', subcategory: 'Autoturisme' },
        'Utilaje (Executri)': { category: 'Utilaje & Echipamente', subcategory: 'Utilaje Construcii' },
      };
      
      const mapping = executionToCategoryMap[formData.subcategory];
      if (mapping) {
        const categoryFields = dynamicFieldsConfig[mapping.category];
        if (categoryFields) {
          const originalFields = categoryFields[mapping.subcategory] || [];
          // Adugm i c�mpurile specifice executrilor �n fa
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

  // Handle change pentru c�mpuri dinamice
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
        (value === 'Executri Silite' && formData.subcategory === 'Imobile (Executri)');
      
      setSkuDirty(false);
      setFormData(prev => ({
        ...prev,
        [name]: value,
        subcategory: '', // Reset subcategory
        categoryLevel3: '',
        size: '',
        brand: '',
        color: '',
        condition: '',
        sku: '',
        address: !isImobiliareOrExecutionImobile ? undefined : prev.address,
        coordinates: !isImobiliareOrExecutionImobile ? undefined : prev.coordinates,
        customFields: {} // Reset custom fields when category changes
      }));
    } else if (name === 'subcategory') {
      // Reset customFields when subcategory changes
      // Also handle address visibility for Executri Silite -> Imobile
      const isExecutionImobile = formData.category === 'Executri Silite' && value === 'Imobile (Executri)';
      const isImobiliareCategory = formData.category === 'Imobiliare';
      
      const generatedSku = !skuDirty && value
        ? generateSku(value, getExistingSkus(editingProductId ?? undefined))
        : null;
      
      setFormData(prev => ({
        ...prev,
        [name]: value,
        sku: generatedSku !== null ? generatedSku : prev.sku,
        categoryLevel3: '',
        size: '',
        brand: '',
        color: '',
        condition: '',
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
      console.log('=� handleFileUpload called');
      const files = Array.from(e.target.files || []);
      console.log('=� Files selected:', files.length, files.map(f => ({ name: f.name, type: f.type, size: f.size })));
      
      if (files.length === 0) {
        console.warn('� No files selected');
        return;
      }
      
      const MAX_IMAGES = 50;
      
      // Check current image count
      const currentImageCount = formData.images.length;
      console.log('=� Current image count:', currentImageCount);
      
      if (currentImageCount >= MAX_IMAGES) {
        setMessage({ type: 'error', text: `Ai atins limita maxim de ${MAX_IMAGES} imagini. terge unele imagini �nainte de a aduga altele.` });
        e.target.value = ''; // Reset input
        return;
      }
      
      // Check if adding these files would exceed the limit
      const totalAfterUpload = currentImageCount + files.length;
      if (totalAfterUpload > MAX_IMAGES) {
        const allowedCount = MAX_IMAGES - currentImageCount;
        setMessage({ type: 'error', text: `Poi aduga doar ${allowedCount} imagini �n plus. Limita maxim este de ${MAX_IMAGES} imagini.` });
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
          console.log(`=� Processing file ${index + 1}/${files.length}:`, file.name, file.type, file.size);
          
          // Check file size (10MB max for all files)
          if (file.size > 10 * 1024 * 1024) {
            console.error(`L File too large: ${file.name} (${(file.size / 1024 / 1024).toFixed(2)}MB)`);
            setMessage({ type: 'error', text: `Fiierul ${file.name} este prea mare. Dimensiunea maxim este 10MB.` });
            errorCount++;
            continue;
          }

          // Check file type
          if (file.type.startsWith('image/')) {
            console.log(`=� Uploading image to Cloudinary: ${file.name}`);
            
            // Show loading state
            setMessage({ type: 'success', text: `Se �ncarc ${file.name}... (${index + 1}/${files.length})` });
            
            // Upload to Cloudinary via /api/upload
            const uploadFormData = new FormData();
            uploadFormData.append('file', file);

            const uploadResponse = await fetch('/api/upload', {
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
                  console.error(`L Non-JSON error response for ${file.name}:`, text);
                  errorData = { error: text || `HTTP ${uploadResponse.status}: ${uploadResponse.statusText}` };
                }
              } catch (parseError) {
                console.error(`L Error parsing response for ${file.name}:`, parseError);
                errorData = { 
                  error: `HTTP ${uploadResponse.status}: ${uploadResponse.statusText || 'Eroare necunoscut'}` 
                };
              }
              
              console.error(`L Upload error for ${file.name}:`, {
                status: uploadResponse.status,
                statusText: uploadResponse.statusText,
                errorData,
              });
              
              setMessage({ 
                type: 'error', 
                text: `Eroare la �ncrcarea ${file.name}: ${errorData.error || `HTTP ${uploadResponse.status}`}` 
              });
              errorCount++;
              continue;
            }

            const uploadResult = await uploadResponse.json();
            
            if (uploadResult.success && uploadResult.url) {
              console.log(` Image uploaded successfully to Cloudinary: ${uploadResult.url}`);
              uploadedUrls.push(uploadResult.url);
              successCount++;
            } else {
              console.error(`L Upload failed for ${file.name}:`, uploadResult);
              setMessage({ type: 'error', text: `Eroare la �ncrcarea ${file.name}` });
              errorCount++;
            }
          } else if (file.type === 'application/zip' || file.name.toLowerCase().endsWith('.zip')) {
            console.log(`=� Handling ZIP file: ${file.name}`);
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
            setMessage({ type: 'success', text: `Fiierul .zip ${file.name} a fost adugat!` });
            successCount++;
          } else {
            console.warn(`� Unsupported file type: ${file.name}, type: ${file.type}`);
            setMessage({ type: 'error', text: `Tipul de fiier ${file.name} nu este suportat. V rugm s �ncrcai doar imagini sau fiiere .zip.` });
            errorCount++;
          }
        } catch (fileError) {
          console.error(`L Error processing file ${file.name}:`, fileError);
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
      
      // Success message
      if (successCount > 0) {
        const message = errorCount > 0
          ? `${successCount} fiier${successCount > 1 ? 'e' : ''} adugat${successCount > 1 ? 'e' : ''}, ${errorCount} eroare${errorCount > 1 ? 'ri' : ''}. Total: ${currentImageCount + successCount}/${MAX_IMAGES} imagini.`
          : `${successCount} fiier${successCount > 1 ? 'e' : ''} �ncrcat${successCount > 1 ? 'e' : ''} cu succes �n Cloudinary. Total: ${currentImageCount + successCount}/${MAX_IMAGES} imagini.`;
        setMessage({ type: 'success', text: message });
      }
      
      console.log(`=� Upload complete: ${successCount} success, ${errorCount} errors`);
    } catch (error) {
      console.error('L Error in handleFileUpload:', error);
      setMessage({ type: 'error', text: `Eroare la �ncrcarea fiierelor: ${error instanceof Error ? error.message : 'Eroare necunoscut'}` });
    } finally {
      e.target.value = ''; // Reset input
    }
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
    dragOverIndex: adminImageDragOverIndex,
    getSortableTargetProps: getAdminImageTargetProps,
    getSortableHandleProps: getAdminImageHandleProps,
  } = useManualListingImageDnD(reorderImages);

  const handleGenerateSEO = async () => {
    // Validare: trebuie s existe cel puin titlu i descriere
    if (!formData.title.trim() || !formData.description.trim()) {
      setMessage({ 
        type: 'error', 
        text: 'V rugm s completai cel puin titlul i descrierea pentru generare SEO automat.' 
      });
      return;
    }

    setIsGeneratingSEO(true);
    setMessage(null);

    try {
      // Extrage specificaii din customFields (dac exist)
      const specificatii = Object.entries(formData.customFields || {})
        .map(([key, value]) => `${key}: ${value}`)
        .join(', ');

      const response = await fetch('/api/seo', {
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
        // Completeaz c�mpurile SEO
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
    // Validare: trebuie s existe cel puin titlu i descriere
    if (!formData.title.trim() || !formData.description.trim()) {
      setMessage({ 
        type: 'error', 
        text: 'V rugm s completai cel puin titlul i descrierea pentru re-scriere.' 
      });
      return;
    }

    setIsRewriting(true);
    setMessage(null);

    try {
      // Extrage specificaii din customFields (dac exist)
      const specificatii = Object.entries(formData.customFields || {})
        .map(([key, value]) => `${key}: ${value}`)
        .join(', ');

      const response = await fetch('/api/ai-rewriter', {
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
        // Actualizeaz titlul i descrierea dac sunt selectate
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
    // Validare: trebuie s existe cel puin titlu i descriere
    if (!formData.title.trim() || !formData.description.trim()) {
      setMessage({ 
        type: 'error', 
        text: 'V rugm s completai cel puin titlul i descrierea pentru �mbuntire automat.' 
      });
      return;
    }

    setIsEnhancing(true);
    setMessage(null);

    try {
      // Extrage specificaii din customFields (dac exist)
      const specificatii = Object.entries(formData.customFields || {})
        .map(([key, value]) => `${key}: ${value}`)
        .join(', ');

      const response = await fetch('/api/ai-product-enhancer', {
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
        throw new Error('Eroare la �mbuntirea produsului');
      }

      const result = await response.json();
      
      if (result.success && result.data) {
        // Completeaz toate c�mpurile automat
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
          text: `Produs �mbuntit cu succes! Similaritate: ${(result.data.similarityScore * 100).toFixed(1)}% ${servicesInfo.length > 0 ? `(${servicesInfo.join(', ')})` : '(algoritm simplu)'}` 
        });
      } else {
        throw new Error('Nu s-au putut �mbunti datele produsului');
      }
    } catch (error: any) {
      console.error('Error enhancing product:', error);
      setMessage({ 
        type: 'error', 
        text: `Eroare la �mbuntirea produsului: ${error.message}` 
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
      throw new Error('Cursul EUR nu este disponibil �n fiierul BNR.');
    }

    const raw = eurNode.textContent.trim().replace(',', '.');
    const multiplierAttr = eurNode.getAttribute('multiplier');
    const multiplierValue = multiplierAttr ? parseFloat(multiplierAttr.replace(',', '.')) : 1;
    const parsedRate = parseFloat(raw);
    if (!Number.isFinite(parsedRate) || parsedRate <= 0) {
      throw new Error('Valoarea cursului BNR este invalid.');
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
        console.warn('Cursul Frankfurter nu a putut fi preluat, se �ncearc BNR.', bnrError);
        try {
          rateData = await fetchBnrRate();
        } catch (fallbackError) {
          console.warn('Cursul BNR nu a putut fi preluat, se folosete serviciul alternativ.', fallbackError);
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
      setExchangeError('Actualizeaz cursul pentru conversie �n EUR.');
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
      setExchangeError('Actualizeaz cursul pentru conversie �n Lei.');
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
      setExchangeError('Actualizeaz cursul pentru conversie Cumpr acum �n EUR.');
    } else if (exchangeError?.includes('Cumpr acum')) {
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
      setExchangeError('Actualizeaz cursul pentru conversie Cumpr acum �n Lei.');
    } else if (exchangeError?.includes('Cumpr acum')) {
      setExchangeError(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (isSubmitting) {
      return;
    }
    
    if (!formData.title || !formData.description || !formData.category || !formData.subcategory) {
      setMessage({ type: 'error', text: 'V rugm s completai toate c�mpurile obligatorii.' });
        return;
      }

    const primaryPrice = formData.currency === 'RON' ? priceRon : priceEur;
    if (primaryPrice <= 0) {
      setMessage({ type: 'error', text: 'Preul de pornire trebuie s fie mai mare dec�t 0.' });
        return;
      }

    const requiredPrefix = formData.subcategory
      ? (normalizeSubcategoryName(formData.subcategory) + 'XXXX').slice(0, SKU_PREFIX_LENGTH)
      : '';

    if (!requiredPrefix) {
      setMessage({ type: 'error', text: 'Selecteaz categoria i subcategoria pentru a genera SKU-ul.' });
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
        setMessage({ type: 'error', text: 'Nu am putut genera SKU-ul automat. Re�ncarc pagina sau �ncearc din nou.' });
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
      if (!effectiveRate || effectiveRate <= 0) {
        const fetchedRate = await fetchExchangeRate();
        effectiveRate = fetchedRate ?? effectiveRate ?? null;
      }

      if (!effectiveRate || effectiveRate <= 0) {
        fail('Nu am putut obine cursul EUR/RON. Te rugm s actualizezi cursul i s �ncerci din nou.');
        return;
      }

      const normalizedStartingPrice = roundTo(primaryPrice);
      const normalizedRon = formData.currency === 'RON'
        ? normalizedStartingPrice
        : roundTo(normalizedStartingPrice * effectiveRate);
      const normalizedEur = formData.currency === 'RON'
        ? roundTo(normalizedStartingPrice / effectiveRate)
        : normalizedStartingPrice;
      const normalizedRateUpdatedAt =
        lastRateUpdate?.toISOString() ??
        formData.exchangeRateUpdatedAt ??
        new Date().toISOString();

      const discountSummary = computeDiscountSummary(normalizedRon, normalizedEur);

      let normalizedBuyNowRon: number | null = null;
      let normalizedBuyNowEur: number | null = null;

      if (formData.productType === 'live-bid' && formData.buyNowEnabled) {
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
          fail('Completeaz preul "Cumpr acum" �n Lei sau EUR pentru a activa opiunea.');
          return;
        }

        if (hasRon) {
          normalizedBuyNowRon = roundTo(sourceRon!);
        }
        if (hasEur) {
          normalizedBuyNowEur = roundTo(sourceEur!);
        }

        if (normalizedBuyNowRon === null && normalizedBuyNowEur !== null) {
          normalizedBuyNowRon = roundTo(normalizedBuyNowEur * effectiveRate);
        }

        if (normalizedBuyNowEur === null && normalizedBuyNowRon !== null) {
          normalizedBuyNowEur = roundTo(normalizedBuyNowRon / effectiveRate);
        }
      }

      const normalizedFormData: ProductFormData = {
        ...formData,
        sku: ensuredSku,
        startingPrice: normalizedStartingPrice,
        startingPriceRON: normalizedRon,
        startingPriceEUR: normalizedEur,
        currency: formData.currency,
        exchangeRate: effectiveRate,
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
        buyNowEnabled: formData.productType === 'live-bid' ? formData.buyNowEnabled ?? false : false,
        buyNowPriceRON:
          formData.productType === 'live-bid' && formData.buyNowEnabled ? normalizedBuyNowRon : null,
        buyNowPriceEUR:
          formData.productType === 'live-bid' && formData.buyNowEnabled ? normalizedBuyNowEur : null,
        documents: formData.documents || [],
      };

      setPriceRon(normalizedRon);
      setPriceEur(normalizedEur);
      setBuyNowPriceRon(normalizedFormData.buyNowPriceRON ?? null);
      setBuyNowPriceEur(normalizedFormData.buyNowPriceEUR ?? null);

      const requiredDynamicFields = dynamicFields.filter(f => f.required);
      const missingRequiredFields = requiredDynamicFields.filter(field => {
        const value = normalizedFormData.customFields?.[field.key];
        return value === undefined || value === null || value === '' || value === 0;
      });

      if (missingRequiredFields.length > 0) {
        fail(`V rugm s completai c�mpurile obligatorii: ${missingRequiredFields.map(f => f.label).join(', ')}`);
        return;
      }

      let finalFormData = normalizedFormData;

    if (autoEnhance) {
      setIsEnhancing(true);
      setMessage({ type: 'success', text: 'Se proceseaz �mbuntirile...' });

      try {
          const specificatii = Object.entries(normalizedFormData.customFields || {})
          .map(([key, value]) => `${key}: ${value}`)
          .join(', ');

        const response = await fetch('/api/ai-product-enhancer', {
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
              title: result.data.newTitle,
              description: result.data.newDescription,
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

      const finalUrl = `/licitatii-publice/${uniqueSlug}`;

      finalFormData = {
        ...finalFormData,
        slug: uniqueSlug,
        url: finalUrl,
      };

      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError) {
        console.warn('Nu am putut obine utilizatorul curent din Supabase:', userError);
      }

      const userId = userData?.user?.id ?? null;

      if (!userId) {
        console.warn('Nu exist un utilizator autentificat, inserarea produsului a fost oprit.');
        fail('Trebuie s fii autentificat pentru a salva produsul. Te rog reconecteaz-te.');
        setIsSubmitting(false);
        return;
      }

      // Process images: upload data URLs to Cloudinary, keep existing Cloudinary URLs
      // Note: New images are already uploaded to Cloudinary in handleFileUpload,
      // but we still handle data URLs here for compatibility (e.g., when editing existing products)
      const uploadedImageUrls: string[] = [];
      const imagesToProcess = finalFormData.images || [];
      
      console.log('=� Processing images for save:', imagesToProcess.length, 'images');
      
      for (let i = 0; i < imagesToProcess.length; i++) {
        const image = imagesToProcess[i];
        
        // Check if it's a data URL (legacy or from editing - needs to be uploaded to Cloudinary)
        if (typeof image === 'string' && image.startsWith('data:image/')) {
          try {
            console.log(`=� Uploading new image ${i + 1}/${imagesToProcess.length}...`);
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

            const uploadResponse = await fetch('/api/upload', {
              method: 'POST',
              body: formData,
            });

            if (!uploadResponse.ok) {
              const errorData = await uploadResponse.json();
              console.error('L Upload error for image:', errorData);
              // Continue with other images even if one fails
              continue;
            }

            const uploadResult = await uploadResponse.json();
            
            if (uploadResult.success && uploadResult.url) {
              console.log(' Image uploaded successfully:', uploadResult.url);
              uploadedImageUrls.push(uploadResult.url);
            } else {
              console.error('L Upload failed for image:', uploadResult);
            }
          } catch (error) {
            console.error('L Error uploading image:', error);
            // Continue with other images even if one fails
          }
        } else if (typeof image === 'string') {
          // Already a URL, keep it
          console.log('=� Keeping existing image URL:', image);
          uploadedImageUrls.push(image);
        } else {
          // It's a file object (ZIP or other), keep as is
          console.log('=� Keeping file object:', image);
          uploadedImageUrls.push(image as any);
        }
      }
      
      console.log(' Final images array:', uploadedImageUrls.length, 'images', uploadedImageUrls);

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

      console.log('>� Sanitized images:', sanitizedImages.length, sanitizedImages);

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
            fail('Nu am putut �ncrca documentele PDF. �ncearc din nou sau contacteaz un administrator.');
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

      console.log('=� Preparing payload with images:', sanitizedImages.length, sanitizedImages);

      // Build payload - only include fields that exist in the database schema
      // Based on migration 20251115_products_custom_fields.sql
      const payload: Record<string, any> = {
        title: finalFormData.title,
        description: finalFormData.description,
        category: finalFormData.category,
        subcategory: finalFormData.subcategory,
        category_level_3: finalFormData.categoryLevel3 || null,
        size: finalFormData.size || null,
        brand: finalFormData.brand || null,
        color: finalFormData.color || null,
        condition: finalFormData.condition || null,
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

      // Merge additional fields into custom_fields
      if (Object.keys(additionalFields).length > 0) {
        payload.custom_fields = {
          ...payload.custom_fields,
          ...additionalFields,
        };
      }

      console.log('=� Payload images field:', JSON.stringify(payload.images).substring(0, 200));

      let insertedProduct = null;
      let insertError = null;

      if (editingProductId) {
        console.log('= Updating product:', editingProductId);
        
        // Ensure images is a proper JSON array for JSONB column
        const imagesArray = Array.isArray(sanitizedImages) ? sanitizedImages : [];
        
        // Validate images array - ensure all are strings
        const validatedImages = imagesArray.filter((img): img is string => {
          if (typeof img === 'string' && img.trim() !== '') {
            return true;
          }
          console.warn('� Invalid image in array, filtering out:', img);
          return false;
        });
        
        console.log('=� Sanitized images count:', sanitizedImages.length);
        console.log('=� Validated images count:', validatedImages.length);
        console.log('=� Validated images:', validatedImages);
        
        // Build update payload with ONLY fields that exist in the schema
        // Based on migration 20251115_products_custom_fields.sql
        const updatePayload: Record<string, any> = {
          title: payload.title,
          description: payload.description,
          category: payload.category,
          subcategory: payload.subcategory,
          category_level_3: payload.category_level_3,
          size: payload.size,
          brand: payload.brand,
          color: payload.color,
          condition: payload.condition,
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

        // IMPORTANT: Nu modificm slug i url la actualizare prin acest formular.
        // URL-ul se poate modifica doar explicit din pagina de list (butonul "Editare URL").
        delete updatePayload.slug;
        delete updatePayload.url;
        
        // CRITICAL: Ensure images is always a valid JSON array (not null, not undefined)
        // Supabase JSONB columns require explicit array format
        if (!Array.isArray(updatePayload.images)) {
          console.warn('� Images is not an array, converting to array');
          updatePayload.images = [];
        }
        
        // Ensure images array contains only strings
        updatePayload.images = updatePayload.images.filter((img: any) => {
          const isValid = typeof img === 'string' && img.trim() !== '';
          if (!isValid) {
            console.warn('� Filtering out invalid image:', img);
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
          console.error('L CRITICAL: Images is still not an array after processing!', updatePayload.images);
          updatePayload.images = [];
        }
        
        console.log('=� Update payload images:', updatePayload.images);
        console.log('=� Update payload images count:', updatePayload.images?.length);
        console.log('=� Update payload images type:', typeof updatePayload.images, Array.isArray(updatePayload.images));
        console.log('=� Update payload keys:', Object.keys(updatePayload));
        console.log('=� Full update payload:', JSON.stringify(updatePayload, null, 2));
        
        // CRITICAL: Log the exact payload being sent
        console.log('=� SENDING UPDATE TO SUPABASE:');
        console.log('=� Product ID:', editingProductId);
        console.log('=� Images in payload:', JSON.stringify(updatePayload.images));
        console.log('=� Images count:', updatePayload.images?.length);
        console.log('=� Full payload (first 2000 chars):', JSON.stringify(updatePayload).substring(0, 2000));
        
        // Use API endpoint with supabaseAdmin to bypass RLS
        const updateResponse = await fetch('/api/admin/products/update', {
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

        console.log('=� UPDATE RESPONSE FROM SUPABASE:');
        console.log('=� Error:', updateError);
        console.log('=� Updated product:', updatedProduct);
        console.log('=� Images in response:', updatedProduct?.images);
        console.log('=� Images type in response:', typeof updatedProduct?.images, Array.isArray(updatedProduct?.images));

        if (updateError) {
          console.error('L Update error:', updateError);
          console.error('L Error details:', JSON.stringify(updateError, null, 2));
          insertError = updateError;
        } else {
          console.log(' Product updated successfully:', updatedProduct);
          console.log('=� Images in updated product:', updatedProduct?.images);
          insertedProduct = updatedProduct ?? { id: editingProductId, ...payload };
          
          // CRITICAL: Verify images were actually saved by re-fetching
          if (editingProductId) {
            console.log('= Re-fetching product IMMEDIATELY to verify save...');
            
            // Try multiple times with delays to ensure DB commit
            for (let attempt = 1; attempt <= 3; attempt++) {
              await new Promise(resolve => setTimeout(resolve, 300 * attempt));
              
              console.log(`= Re-fetch attempt ${attempt}/3...`);
              const { data: refetchedProduct, error: refetchError } = await supabase
                .from('products')
                .select('*')
                .eq('id', editingProductId)
                .maybeSingle();
              
              if (!refetchError && refetchedProduct) {
                console.log(` Re-fetch attempt ${attempt} successful:`, refetchedProduct);
                console.log(`=� Images in re-fetched product (attempt ${attempt}):`, refetchedProduct.images);
                console.log(`=� Images count (attempt ${attempt}):`, refetchedProduct.images?.length);
                
                // Update formData with the re-fetched images
                if (refetchedProduct.images && Array.isArray(refetchedProduct.images) && refetchedProduct.images.length > 0) {
                  const processedImages = refetchedProduct.images.map((img: any) => {
                    if (typeof img === 'string') return img;
                    if (typeof img === 'object' && img !== null && img.url) return img.url;
                    return String(img);
                  }).filter((url: string) => url && url.trim() !== '');
                  
                  console.log('=� Processed images for formData:', processedImages);
                  
                  // Use functional update to ensure we don't lose other formData
                  setFormData(prev => {
                    const updated = {
                      ...prev,
                      images: processedImages,
                    };
                    console.log('=�  Updated formData with images:', updated.images);
                    return updated;
                  });
                  
                  // Mark that we just updated to prevent useEffect from reloading
                  setJustUpdated(true);
                  
                  // Break on success
                  break;
                } else {
                  console.warn(`� No images in re-fetched product (attempt ${attempt})`);
                  if (attempt === 3) {
                    console.error('L CRITICAL: Images were NOT saved to database after 3 attempts!');
                    console.error('L Expected images:', validatedImages);
                    console.error('L Received images:', refetchedProduct.images);
                    // Even if images weren't found, mark as updated to prevent reload
                    setJustUpdated(true);
                  }
                }
              } else if (refetchError) {
                console.error(`� Error re-fetching product (attempt ${attempt}):`, refetchError);
                if (attempt === 3) {
                  // Mark as updated even on error to prevent infinite reload loop
                  setJustUpdated(true);
                }
              } else {
                console.warn(`� Re-fetched product is null (attempt ${attempt})`);
                if (attempt === 3) {
                  setJustUpdated(true);
                }
              }
            }
          }
        }
      } else {
        console.log('� Creating new product');
        console.log('=� Full payload:', JSON.stringify(payload, null, 2));
        
        // Ensure images is a proper JSON array for JSONB column
        const imagesArray = Array.isArray(sanitizedImages) ? sanitizedImages : [];
        
        // Build insert payload with ONLY fields that exist in the schema
        const insertPayload: Record<string, any> = {
          title: payload.title,
          description: payload.description,
          category: payload.category,
          subcategory: payload.subcategory,
          category_level_3: payload.category_level_3,
          size: payload.size,
          brand: payload.brand,
          color: payload.color,
          condition: payload.condition,
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
        
        console.log('=� Insert payload images:', insertPayload.images);
        console.log('=� Insert payload keys:', Object.keys(insertPayload));
        
        const createResponse = await fetch('/api/admin/products/create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(insertPayload),
        });
        const createResult = await createResponse.json();
        const createdProduct = createResult.data;
        const createError = createResult.error ? { message: createResult.error } : null;

        if (createError) {
          console.error('Create error:', formatSupabaseError(createError), createError);
        } else {
          console.log(' Product created successfully:', createdProduct);
          console.log('=� Images in created product:', createdProduct?.images);
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
          const errMsg = formatSupabaseError(insertError);
          console.error('Supabase insert error:', errMsg, insertError);
          const message = hasMessage ? errorObject!.message : (errMsg && errMsg !== 'Unknown error' ? errMsg : 'Nu am putut salva produsul �n baza de date. �ncearc? din nou.');
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
          console.log('= Reset justUpdated flag - product can be reloaded again');
        }, 3000);
      }
      
      // Dup salvare (creare sau actualizare), mergem �napoi la lista de produse
      setTimeout(() => {
        router.push('/admin/products');
      }, 800);
    } catch (error) {
      console.error('Error saving product:', error);
      fail('A aprut o eroare neateptat. �ncearc din nou.');
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
  const discountInputsDisabled = priceRon <= 0;
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
      return '�';
    }

    const safeValue = Number.isFinite(value) ? value : 0;

    const suffix = currencyCode === "EUR" ? "EUR" : "Lei";
    return `${safeValue.toLocaleString('ro-RO', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })} ${suffix}`;
  }

  useEffect(() => {
    setFormData((prev) => {
      let nextType: ProductFormData['productType'] = prev.productType;
      const rawType = prev.productType as unknown as string;

      if (rawType === 'executari' || rawType === 'details-only') {
        nextType = 'licitatii-publice';
      }

      const validPublicSaleTypes: Array<ProductFormData['saleType']> = [
        'licitatii-anaf',
        'licitatii-insolventa',
        'licitatii-executori',
        'alte-licitatii',
      ];

      let desiredSaleType: ProductFormData['saleType'] = prev.saleType;

      if (nextType === 'live-bid') {
        desiredSaleType = 'alte-licitatii';
      } else if (nextType === 'licitatii-publice') {
        if (!validPublicSaleTypes.includes(prev.saleType)) {
          desiredSaleType = 'licitatii-anaf';
        }
    } else {
        desiredSaleType = 'vanzare-directa';
      }

      const updates: Partial<ProductFormData> = {};

      if (nextType !== prev.productType) {
        updates.productType = nextType;
      }

      if (desiredSaleType !== prev.saleType) {
        updates.saleType = desiredSaleType;
      }

      if (nextType !== 'licitatii-publice' && prev.insolventaDirectSale) {
        updates.insolventaDirectSale = false;
      }

      if (nextType !== 'licitatii-publice' && prev.auctionRegistrationDate) {
        updates.auctionRegistrationDate = undefined;
      }

      if (
        nextType !== 'live-bid' &&
        (prev.buyNowEnabled || (prev.buyNowPriceRON ?? null) !== null || (prev.buyNowPriceEUR ?? null) !== null)
      ) {
        updates.buyNowEnabled = false;
        updates.buyNowPriceRON = null;
        updates.buyNowPriceEUR = null;
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
      setExchangeError('Actualizeaz cursul pentru a aplica reducerea �n EUR.');
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
      setExchangeError('Actualizeaz cursul pentru a aplica preul redus �n EUR.');
      return;
    }

    const baseEurValue = priceEur > 0 ? priceEur : priceRon > 0 ? roundTo(priceRon / rate) : parsed;
    updateDiscounts({ finalPriceRon: roundTo(parsed * rate), baseRon: priceRon, baseEur: baseEurValue });
  };

  const handleRegenerateSku = () => {
    if (!formData.subcategory) {
      setMessage({ type: 'error', text: 'Selecteaz subcategoria �nainte de a genera SKU.' });
      return;
    }

    const newSku = generateSku(formData.subcategory, getExistingSkus(editingProductId ?? undefined));
    if (!newSku) {
      setMessage({ type: 'error', text: 'Nu am putut genera SKU. �ncearc din nou.' });
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
              text: 'Produsul selectat nu a fost gsit. Verific lista de produse i �ncearc din nou.',
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
          categoryLevel3: data.category_level_3 ?? '',
          size: data.size ?? '',
          brand: data.brand ?? '',
          color: data.color ?? '',
          condition: data.condition ?? '',
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
            text: 'A intervenit o problem la �ncrcarea produsului.',
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
        text: `Ai atins limita maxim de ${MAX_DOCUMENTS} documente PDF.`,
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
        rejectedMessages.push(`"${file.name}" nu este un fiier PDF valid.`);
        continue;
      }

      if (file.size > MAX_DOCUMENT_SIZE_MB * 1024 * 1024) {
        rejectedMessages.push(`"${file.name}" depete ${MAX_DOCUMENT_SIZE_MB}MB.`);
        continue;
      }

      const alreadySelected = documentUploads.some(
        (doc) =>
          doc.name === file.name &&
          doc.size === file.size &&
          doc.lastModified === file.lastModified
      );

      if (alreadySelected) {
        rejectedMessages.push(`"${file.name}" este deja adugat.`);
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
          ? `Documentul PDF "${accepted[0].name}" a fost adugat. Total: ${nextCount}/${MAX_DOCUMENTS}.`
          : `${accepted.length} documente PDF au fost adugate. Total: ${nextCount}/${MAX_DOCUMENTS}.`;
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
    <div className="min-h-screen bg-white dark:bg-gray-900 p-4 md:p-6">
      <div className="max-w-5xl mx-auto w-full">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
            {isEditMode ? 'Editeaz Produs' : 'Adaug Produs Nou'}
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            {isEditMode ? 'Actualizeaz informaiile produsului' : 'Completeaz informaiile pentru noul produs'}
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

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Tip Produs */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Tip Produs</h2>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Alege modul principal �n care va fi listat produsul i, dac este cazul, cum se va desfura v�nzarea.
            </p>

            <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
              <label className={`relative flex items-center gap-3 rounded-2xl border-2 p-4 transition-all ${
                formData.productType === 'live-bid'
                  ? 'border-blue-500 bg-blue-50 shadow-lg shadow-blue-500/10 dark:border-blue-400 dark:bg-blue-900/25'
                  : 'border-gray-200 bg-white hover:border-blue-300 dark:border-gray-600 dark:bg-gray-800 dark:hover:border-blue-400'
              }`}>
                <input
                  type="radio"
                  name="productType"
                  value="live-bid"
                  checked={formData.productType === 'live-bid'}
                  onChange={handleInputChange}
                  className="sr-only"
                />
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <i className="ri-hammer-line text-xl text-blue-500"></i>
                    <span className="font-semibold text-gray-900 dark:text-white">Live Bid</span>
                  </div>
                  <p className="text-xs text-gray-600 dark:text-gray-400">
                    Produsul apare �n licitaii live, utilizatorii liciteaz �n timp real i poi seta opiuni suplimentare.
                  </p>
                </div>
                <div className={`hidden h-4 w-4 rounded-full border-2 md:block ${
                  formData.productType === 'live-bid'
                    ? 'border-blue-500 bg-blue-500'
                    : 'border-gray-200 dark:border-gray-600'
                }`}>
                  {formData.productType === 'live-bid' && <div className="w-full h-full rounded-full bg-white scale-50"></div>}
                </div>
              </label>

              <label className={`relative flex items-center gap-3 rounded-2xl border-2 p-4 transition-all ${
                formData.productType === 'licitatii-publice'
                  ? 'border-blue-500 bg-blue-50 shadow-lg shadow-blue-500/10 dark:border-blue-400 dark:bg-blue-900/25'
                  : 'border-gray-200 bg-white hover:border-blue-300 dark:border-gray-600 dark:bg-gray-800 dark:hover:border-blue-400'
              }`}>
                <input
                  type="radio"
                  name="productType"
                  value="licitatii-publice"
                  checked={formData.productType === 'licitatii-publice'}
                  onChange={handleInputChange}
                  className="sr-only"
                />
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <i className="ri-building-4-line text-xl text-blue-500"></i>
                    <span className="font-semibold text-gray-900 dark:text-white">Licitaii publice</span>
                  </div>
                  <p className="text-xs text-gray-600 dark:text-gray-400">
                    Listare dedicat portofoliilor publice sau executrilor; controlezi modul de adjudecare i fluxul cu clienii.
                  </p>
                </div>
                <div className={`hidden h-4 w-4 rounded-full border-2 md:block ${
                  formData.productType === 'licitatii-publice'
                    ? 'border-blue-500 bg-blue-500'
                    : 'border-gray-200 dark:border-gray-600'
                }`}>
                  {formData.productType === 'licitatii-publice' && <div className="w-full h-full rounded-full bg-white scale-50"></div>}
                </div>
              </label>

              <label className={`relative flex items-center gap-3 rounded-2xl border-2 p-4 transition-all ${
                formData.productType === 'buy-now'
                  ? 'border-emerald-500 bg-emerald-50 shadow-lg shadow-emerald-500/10 dark:border-emerald-400 dark:bg-emerald-900/25'
                  : 'border-gray-200 bg-white hover:border-emerald-300 dark:border-gray-600 dark:bg-gray-800 dark:hover:border-emerald-400'
              }`}>
                <input
                  type="radio"
                  name="productType"
                  value="buy-now"
                  checked={formData.productType === 'buy-now'}
                  onChange={handleInputChange}
                  className="sr-only"
                />
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <i className="ri-shopping-bag-3-line text-xl text-emerald-500"></i>
                    <span className="font-semibold text-gray-900 dark:text-white">Cumpr acum</span>
                  </div>
                  <p className="text-xs text-gray-600 dark:text-gray-400">
                    Produs disponibil pentru cumprare direct, cu plat i livrare gestionate din panoul admin.
                  </p>
                </div>
                <div className={`hidden h-4 w-4 rounded-full border-2 md:block ${
                  formData.productType === 'buy-now'
                    ? 'border-emerald-500 bg-emerald-500'
                    : 'border-gray-200 dark:border-gray-600'
                }`}>
                  {formData.productType === 'buy-now' && <div className="w-full h-full rounded-full bg-white scale-50"></div>}
                </div>
              </label>
            </div>

            <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
              {formData.productType === 'live-bid'
                ? 'Produsul va aprea �n licitaii live, iar utilizatorii pot plasa oferte �n timp real.'
                : formData.productType === 'licitatii-publice'
                  ? 'Listare dedicat licitaiilor publice; dup publicare vei putea stabili condiiile de adjudecare pentru fiecare c�tigtor.'
                  : 'Produsul este disponibil pentru achiziie instant; plata i livrarea se confirm direct cu clientul.'}
            </p>

            {formData.productType === 'licitatii-publice' && (
              <div className="mt-5 border-t border-gray-200 dark:border-gray-700 pt-5">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Tip de V�nzare *
                </label>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {saleTypeOptions.map((option) => {
                    const isActive = formData.saleType === option.value;

                    return (
                      <label
                        key={option.value}
                        className={`relative flex items-start gap-3 rounded-xl border-2 p-4 text-sm transition-all ${
                          isActive ? option.activeClass : option.inactiveClass
                        }`}
                      >
                        <input
                          type="radio"
                          name="saleType"
                          value={option.value}
                          checked={isActive}
                          onChange={handleInputChange}
                          className="sr-only"
                        />
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <i className={`${option.icon} text-lg ${option.iconClass}`}></i>
                            <span className="font-semibold text-gray-900 dark:text-white">
                              {option.label}
                            </span>
                          </div>
                          <p className="text-xs text-gray-600 dark:text-gray-400">
                            {option.description}
                          </p>
                        </div>
                        <div
                          className={`hidden h-4 w-4 rounded-full border-2 md:block ${
                            isActive ? option.indicatorActiveClass : 'border-gray-200 dark:border-gray-600'
                          }`}
                        >
                          {isActive && <div className="w-full h-full rounded-full bg-white scale-50"></div>}
                        </div>
                      </label>
                    );
                  })}
                </div>

                {formData.saleType === 'licitatii-insolventa' && (
                  <div className="mt-4 rounded-xl border border-sky-200 bg-sky-50/80 p-4 text-sm shadow-sm dark:border-sky-400/40 dark:bg-sky-900/30">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="font-semibold text-sky-700 dark:text-sky-200">
                          Opional: activeaz v�nzare direct
                        </p>
                        <p className="text-xs text-sky-700/80 dark:text-sky-200/80">
                          Potrivete listarea pentru investitori care doresc achiziie instant, menin�nd �n acelai timp licitaia activ.
                        </p>
                      </div>
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          name="insolventaDirectSale"
                          checked={!!formData.insolventaDirectSale}
                          onChange={handleInputChange}
                          className="h-4 w-4 rounded border-sky-300 text-sky-600 focus:ring-sky-500"
                        />
                        <span className="text-sm font-medium text-sky-700 dark:text-sky-200">
                          V�nzare direct
                        </span>
                      </label>
                    </div>
                    <p className="mt-3 text-xs text-sky-700/70 dark:text-sky-200/70">
                      Dac dezactivezi opiunea, lotul va rm�ne disponibil exclusiv prin licitaie.
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Basic Information */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Informaii de Baz</h2>
              <button
                type="button"
                onClick={handleAutoEnhance}
                disabled={isEnhancing || !formData.title.trim() || !formData.description.trim()}
                className="px-4 py-2 bg-gradient-to-r from-blue-600 to-blue-600 hover:from-blue-700 hover:to-blue-700 disabled:from-gray-400 disabled:to-gray-500 disabled:cursor-not-allowed text-white rounded-lg transition-all flex items-center gap-2 text-sm font-medium shadow-lg"
                title="ChatGPT rescrie instant titlul, descrierea i meta SEO"
              >
                {isEnhancing ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    <span>Proceseaz...</span>
                  </>
                ) : (
                  <>
                    <i className="ri-sparkling-2-fill"></i>
                    <span>Optimizeaz cu ChatGPT</span>
                  </>
                )}
              </button>
            </div>

            {/* Auto-enhance checkbox cu opiuni de rescriere */}
            <div className="mb-4 p-4 bg-gradient-to-r from-blue-50 to-blue-50 dark:from-blue-900/20 dark:to-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
              {/* Checkbox principal */}
              <label className="flex items-center gap-2 cursor-pointer mb-3">
                <input
                  type="checkbox"
                  checked={autoEnhance}
                  onChange={(e) => setAutoEnhance(e.target.checked)}
                  className="w-5 h-5 rounded border-gray-200 text-blue-600 focus:ring-blue-500"
                />
                <div className="flex-1">
                  <span className="text-sm font-semibold text-gray-900 dark:text-white">
                    ChatGPT rescrie titlul, descrierea i meta SEO
                  </span>
                  <p className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">
                    Activat implicit: la salvare, ChatGPT produce variante unice i meta SEO complete; debifeaz doar dac nu doreti rescriere automat
                  </p>
                </div>
              </label>

              {/* Opiuni de rescriere - doar c�nd autoEnhance este activat */}
              {autoEnhance && (
                <div className="ml-7 mt-3 space-y-2 border-t border-blue-200 dark:border-blue-700 pt-3">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={rewriteTitle}
                      onChange={(e) => setRewriteTitle(e.target.checked)}
                      className="w-4 h-4 rounded border-gray-200 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="text-sm text-gray-700 dark:text-gray-300">
                      ChatGPT rescrie titlul
                    </span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={rewriteDescription}
                      onChange={(e) => setRewriteDescription(e.target.checked)}
                      className="w-4 h-4 rounded border-gray-200 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="text-sm text-gray-700 dark:text-gray-300">
                      ChatGPT rescrie descrierea
                    </span>
                  </label>
                  <p className="text-xs text-gray-600 dark:text-gray-400 pl-6">
                    SEO meta (opional) este completat automat de ChatGPT dac alegi butonul de generare.
                  </p>
                </div>
              )}
            </div>
            
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
                  className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
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
                        {isSkuEditable ? 'Blocheaz' : 'Editeaz SKU'}
                      </button>
                      <button
                        type="button"
                        onClick={handleRegenerateSku}
                        disabled={!formData.subcategory}
                        className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-700 disabled:text-gray-400 disabled:cursor-not-allowed"
                      >
                        <i className="ri-refresh-line"></i>
                        Genereaz automat
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
                        : 'border-gray-200 dark:border-gray-600 focus:ring-blue-200 dark:focus:ring-blue-400/30 cursor-not-allowed bg-white dark:bg-gray-800'
                    }`}
                    placeholder="APAR176DH2"
                    required
                  />
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    Codul este generat automat din subcategorie; nu este nevoie s �l modifici manual. Folosete "Editeaz SKU" doar dac ai un motiv bine justificat.
                  </p>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Pre de Pornire *
                </label>
                <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                  Introdu valoarea �n moneda preferat; conversia �n cealalt moned se calculeaz automat folosind cursul live.
                </p>
                {exchangeError && (
                  <p className="mt-2 text-xs text-red-500 dark:text-red-400">
                    {exchangeError}
                  </p>
                )}
                <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-400">
                      Valoare �n Lei
              </label>
              <input
                  type="number"
                      inputMode="decimal"
                  min="0"
                  step="0.01"
                      value={Number.isNaN(priceRon) ? '' : priceRon}
                      onChange={handleRonInputChange}
                      className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                  placeholder="0.00"
              />
            </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-400">
                      Valoare �n EUR
              </label>
                  <input
                      type="number"
                      inputMode="decimal"
                      min="0"
                      step="0.01"
                      value={Number.isNaN(priceEur) ? '' : priceEur}
                      onChange={handleEurInputChange}
                      className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                      placeholder="0.00"
                    />
                    </div>
                  </div>
                <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
                  <span>
                    1 EUR H {effectiveRateValue ? effectiveRateValue.toFixed(4) : ''} Lei
                  </span>
                  <span>
                    1 Lei H {inverseRateValue ? inverseRateValue.toFixed(4) : ''} EUR
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
                    {isFetchingRate ? 'Actualizare...' : 'Actualizeaz cursul'}
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
                          ? 'cursor-not-allowed border-dashed border-gray-200 bg-white text-gray-400 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-500'
                          : 'border-gray-200 bg-white text-gray-900 dark:border-gray-600 dark:bg-gray-700 dark:text-white'
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
                          ? 'cursor-not-allowed border-dashed border-gray-200 bg-white text-gray-400 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-500'
                          : 'border-gray-200 bg-white text-gray-900 dark:border-gray-600 dark:bg-gray-700 dark:text-white'
                      }`}
                      placeholder="Ex: 20"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-400">
                      Pre redus (Lei)
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
                          ? 'cursor-not-allowed border-dashed border-gray-200 bg-white text-gray-400 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-500'
                          : 'border-gray-200 bg-white text-gray-900 dark:border-gray-600 dark:bg-gray-700 dark:text-white'
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
                          ? 'cursor-not-allowed border-dashed border-gray-200 bg-white text-gray-400 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-500'
                          : 'border-gray-200 bg-white text-gray-900 dark:border-gray-600 dark:bg-gray-700 dark:text-white'
                      }`}
                      placeholder="Ex: 5"
                    />
                    </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-400">
                      Pre redus (EUR)
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
                          ? 'cursor-not-allowed border-dashed border-gray-200 bg-white text-gray-400 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-500'
                          : 'border-gray-200 bg-white text-gray-900 dark:border-gray-600 dark:bg-gray-700 dark:text-white'
                      }`}
                      placeholder={priceEur > 0 ? priceEur.toFixed(2) : priceRon > 0 ? (getRateOrFallback() ? (priceRon / (getRateOrFallback() ?? 1)).toFixed(2) : '0.00') : '0.00'}
                    />
                  </div>
                </div>

                {discountInputsDisabled && (
                  <p className="mt-2 text-xs text-amber-500">
                    Seteaz preul de pornire �nainte de a aplica reduceri.
                  </p>
                )}

                {discountPercent !== null && discountValueRon !== null && (
                  <div className="mt-4 rounded-lg border border-gray-200 bg-white p-4 text-sm dark:border-white/10 dark:bg-white/5">
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                      <div>
                        <span className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                          Reducere total
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
                          Pre dup reducere
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
                          Reducere procentual
                        </span>
                        <p className="mt-1 font-semibold text-blue-600 dark:text-blue-300">
                          {discountPercent.toLocaleString('ro-RO', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}%
                        </p>
                        {discountValueRon !== null && (
                          <p className="text-xs text-gray-500 dark:text-gray-400">
                            Economiseti {formatCurrencyValue(discountValueRon, 'RON')} fa de preul iniial.
                          </p>
                        )}
                      </div>
                    </div>
                    {derivedDiscountValueEur !== null && (
                      <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
                        Echivalent �n EUR: economiseti {formatCurrencyValue(derivedDiscountValueEur, 'EUR')} iar preul devine {formatCurrencyValue(derivedDiscountedPriceEur, 'EUR')}.
                      </p>
                    )}
                  </div>
                )}

                {formData.productType === 'live-bid' && (
                  <div className="mt-8 rounded-2xl border border-blue-200 bg-blue-50/40 p-5 shadow-sm dark:border-blue-500/30 dark:bg-blue-900/20">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <h4 className="text-sm font-semibold text-blue-700 dark:text-blue-200">
                          Opional: Cumpr acum
                        </h4>
                        <p className="text-xs text-blue-700/80 dark:text-blue-200/80">
                          Permite utilizatorilor s achiziioneze instant produsul la un pre fix, pstr�nd licitaia activ.
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
                        Activeaz
                </label>
              </div>

                    {formData.buyNowEnabled ? (
                      <>
                        <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
                          <div>
                            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-blue-800 dark:text-blue-100/90">
                              Pre Cumpr acum (Lei)
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
                              Pre Cumpr acum (EUR)
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
                          Conversia se realizeaz automat folosind cursul live: 1 EUR H {effectiveRateValue ? effectiveRateValue.toFixed(4) : ''} Lei.
                        </p>
                      </>
                    ) : (
                      <p className="mt-4 text-xs text-blue-700/70 dark:text-blue-200/70">
                        Las opiunea dezactivat dac preferi doar licitaia clasic fr pre instant.
                      </p>
                    )}
                  </div>
                )}
            </div>
            </div>

            {/* Categorie i Subcategorie - pe acelai r�nd */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Categorie *
                </label>
                <select
                  name="category"
                  value={formData.category}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  required
                >
                  <option value="">Selecteaz categoria</option>
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
                  className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  required
                  disabled={!formData.category}
                >
                  <option value="">Selecteaz subcategoria</option>
                  {formData.category && subcategories[formData.category as keyof typeof subcategories]?.map((subcategory) => (
                    <option key={subcategory} value={subcategory}>{subcategory}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Level 3 + Atribute */}
            {formData.subcategory && (() => {
              const subKey = SUBCATEGORY_DISPLAY_TO_KEY[formData.subcategory] ?? formData.subcategory;
              const level3Opts = CATEGORY_LEVEL_3[subKey];
              const attrs = getAttributesForSubcategory(formData.subcategory);
              const sizeOpts = getSizeOptionsForSubcategory(formData.subcategory);
              const brandOpts = getBrandOptionsForSubcategory(formData.subcategory);
              const hasAny = (level3Opts?.length ?? 0) > 0 || sizeOpts.length > 0 || brandOpts.length > 0 || attrs.color || attrs.condition;
              if (!hasAny) return null;
              return (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
                  {level3Opts?.length ? (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Detalii (nivel 3)</label>
                      <select name="categoryLevel3" value={formData.categoryLevel3 ?? ''} onChange={handleInputChange}
                        className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white">
                        <option value="">Selecteaz? (op?ional)</option>
                        {level3Opts.map((l3) => <option key={l3} value={l3}>{CATEGORY_LEVEL_3_NAMES[l3] || l3}</option>)}
                      </select>
                    </div>
                  ) : null}
                  {sizeOpts.length > 0 ? (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">M?rime</label>
                      <select name="size" value={formData.size ?? ''} onChange={handleInputChange}
                        className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white">
                        <option value="">Selecteaz? (op?ional)</option>
                        {sizeOpts.map((s) => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </div>
                  ) : null}
                  {brandOpts.length > 0 ? (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Marca</label>
                      <select name="brand" value={formData.brand ?? ''} onChange={handleInputChange}
                        className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white">
                        <option value="">Selecteaz? (op?ional)</option>
                        {brandOpts.map((b) => <option key={b} value={b}>{b}</option>)}
                      </select>
                    </div>
                  ) : null}
                  {attrs.color ? (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Culoare</label>
                      <select name="color" value={formData.color ?? ''} onChange={handleInputChange}
                        className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white">
                        <option value="">Selecteaz? (op?ional)</option>
                        {COLOR_OPTIONS.map((c) => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>
                  ) : null}
                  {attrs.condition ? (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Stare</label>
                      <select name="condition" value={formData.condition ?? ''} onChange={handleInputChange}
                        className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white">
                        <option value="">Selecteaz? (op?ional)</option>
                        {CONDITION_OPTIONS.map((c) => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>
                  ) : null}
                </div>
              );
            })()}

              {/* Jude i Ora */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Jude
                  </label>
                  <select
                    name="county"
                    value={formData.county || ''}
                    onChange={handleInputChange}
                    className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  >
                    <option value="">Selecteaz judeul</option>
                    {counties.map((county) => (
                      <option key={county} value={county}>{county}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Ora
                  </label>
                  <input
                    type="text"
                    name="city"
                    value={formData.city || ''}
                    onChange={handleInputChange}
                    className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    placeholder="Introdu numele oraului"
                  />
                </div>
              </div>

            <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-2">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Locatia produsului
                </label>
                    <input
                  type="text"
                  name="productLocation"
                  value={formData.productLocation || ''}
                      onChange={handleInputChange}
                  className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  placeholder="Ex: Depozit central, Str. Exemplu nr. 10"
                />
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Locaia fizic unde se afl produsul pentru vizionare/predare.
                </p>
                      </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Locatia licitatiei
                </label>
                    <input
                  type="text"
                  name="auctionLocation"
                  value={formData.auctionLocation || ''}
                      onChange={handleInputChange}
                  className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  placeholder="Ex: Sala de licitaii, Bucureti"
                />
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Adresa comunicat participanilor pentru desfurarea licitaiei.
                </p>
                      </div>
                    </div>

            <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-2">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Data licitaiei
                </label>
                <div className="relative">
                  <input
                    type="text"
                    name="auctionDate"
                    value={formData.auctionDate ? formatDateForDisplay(formData.auctionDate) : ''}
                    onChange={(e) => {
                      const dateValue = e.target.value;
                      const timeValue = formData.auctionTime || '';
                      const combinedValue = parseDateInput(dateValue, timeValue);
                      if (combinedValue) {
                        handleInputChange({ target: { name: 'auctionDate', value: combinedValue } } as any);
                      }
                    }}
                    disabled={!shouldShowAuctionDate}
                    placeholder="26.Noiembrie.2025"
                    className={`w-full px-3 py-2 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 border ${
                      shouldShowAuctionDate
                        ? 'border-gray-200 dark:border-gray-600'
                        : 'cursor-not-allowed border-dashed border-gray-200 text-gray-400 dark:border-gray-600 dark:text-gray-500'
                    }`}
                  />
                  <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-gray-400 dark:text-gray-500">
                    <i className="ri-calendar-line text-lg"></i>
                  </span>
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Format: 26.Noiembrie.2025 sau 26/11/2025
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Ora licitaiei
                </label>
                <div className="relative">
                  <input
                    type="text"
                    name="auctionTime"
                    value={formData.auctionTime || (formData.auctionDate && formData.auctionDate.includes('T') ? formData.auctionDate.split('T')[1] : '') || ''}
                    onChange={(e) => {
                      const timeValue = e.target.value;
                      const dateValue = formData.auctionDate ? formatDateForDisplay(formData.auctionDate) : '';
                      const combinedValue = parseDateInput(dateValue, timeValue);
                      setFormData(prev => ({ ...prev, auctionTime: timeValue }));
                      if (combinedValue || dateValue) {
                        handleInputChange({ target: { name: 'auctionDate', value: combinedValue || formData.auctionDate || '' } } as any);
                      }
                    }}
                    disabled={!shouldShowAuctionDate}
                    placeholder="21:22"
                    className={`w-full px-3 py-2 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 border ${
                      shouldShowAuctionDate
                        ? 'border-gray-300 dark:border-gray-600'
                        : 'cursor-not-allowed border-dashed border-gray-300 text-gray-400 dark:border-gray-600 dark:text-gray-500'
                    }`}
                  />
                  <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-gray-400 dark:text-gray-500">
                    <i className="ri-time-line text-lg"></i>
                  </span>
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  {shouldShowAuctionDate
                    ? 'Format: 21:22 sau 09:30. Stabilete momentul de start al licitaiei.'
                    : 'Disponibil doar pentru licitaiile publice sau live bid.'}
                </p>
              </div>

              {formData.productType === 'licitatii-publice' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Data �nscrierii licitaiei
                  </label>
                  <div className="relative">
                    <input
                      type="date"
                      name="auctionRegistrationDate"
                      value={formData.auctionRegistrationDate ? formData.auctionRegistrationDate.split('T')[0] : ''}
                      onChange={(e) => {
                        const dateValue = e.target.value;
                        handleInputChange({ target: { name: 'auctionRegistrationDate', value: dateValue } } as any);
                      }}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-gray-400 dark:text-gray-500">
                      <i className="ri-calendar-line text-lg"></i>
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    Marcheaz �nscrierea oficial �n registrul licitaiilor publice.
                  </p>
                </div>
              )}
            </div>

              {/* Adres i Hart - Doar pentru Imobiliare sau Executri Silite -> Imobile */}
              {(formData.category === 'Imobiliare' || 
                (formData.category === 'Executri Silite' && formData.subcategory === 'Imobile (Executri)')) && (
                <div className="mt-6 space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Adres Complet *
                    </label>
                    <input
                      type="text"
                      name="address"
                      value={formData.address || ''}
                      onChange={(e) => {
                        setFormData(prev => ({ ...prev, address: e.target.value }));
                        // Geocode address to get coordinates
                        if (e.target.value && typeof window !== 'undefined') {
                          geocodeAddress(e.target.value);
                        }
                      }}
                      className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      placeholder="Ex: Str. Exemplu nr. 1, Bucureti, Sector 1"
                    />
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      Adresa va fi folosit pentru afiarea pe hart
                    </p>
                  </div>

                  {/* Google Maps Preview */}
                  {formData.address && (
                    <div className="mt-4">
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Locaie pe Hart
                      </label>
                      <div className="w-full h-64 rounded-lg overflow-hidden border border-gray-300 dark:border-gray-600">
                        <GoogleMapPreview
                          address={formData.address}
                          coordinates={formData.coordinates}
                          onCoordinatesChange={(coords) => {
                            setFormData(prev => ({ ...prev, coordinates: coords }));
                          }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* C�mpuri Dinamice - �nainte de descriere */}
              {dynamicFields.length > 0 && (
                <div className="mt-6">
                  <div className="bg-gradient-to-r from-blue-50 to-blue-50 dark:from-blue-900/20 dark:to-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800 p-4 mb-4">
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-1">
                      <i className="ri-settings-3-line mr-2 text-blue-600"></i>
                      Caracteristici Specifice
                    </h3>
                    <p className="text-xs text-gray-600 dark:text-gray-400">
                      Completeaz informaiile specifice pentru {formData.category} - {formData.subcategory}
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
                            <option value="">Selecteaz...</option>
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
                    className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                placeholder="Descrie produsul �n detaliu..."
                required
              />
            </div>
          </div>

          {(isDocumentRequirementActive || (formData.documents?.length || 0) > 0 || documentUploads.length > 0) && (
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
              <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
                <div>
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                    Documente licitaie (PDF) - opional
                  </h2>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                    �ncarc, dac doreti, documentele oficiale �n format PDF pentru a le oferi clienilor mai mult context despre licitaie.
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
                        ? 'Limita maxim de documente a fost atins'
                        : 'Documentele se pot gestiona doar pentru licitaiile publice'
                      : 'Selecteaz sau trage fiiere PDF aici'}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">
                    Dimensiune maxim {MAX_DOCUMENT_SIZE_MB}MB per fiier. {remainingDocumentSlots > 0 && isDocumentRequirementActive
                      ? `Mai poi aduga ${remainingDocumentSlots} document${remainingDocumentSlots === 1 ? '' : 'e'}`
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
                              {formatFileSize(doc.size)}{doc.url ? ' " Descrcare disponibil' : ' " Link indisponibil'}
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
                              Descarc
                            </a>
                          )}
                          <button
                            type="button"
                            onClick={() => handleRemoveExistingDocument(index)}
                            className="text-xs font-semibold text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
                          >
                            Elimin
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
                    Documente pregtite pentru �ncrcare
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
                              {formatFileSize(doc.size)} " Se va �ncrca la salvare
                            </p>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleRemoveDocumentUpload(index)}
                          className="text-xs font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-300 dark:hover:text-blue-200"
                        >
                          Elimin
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {isDocumentRequirementActive && totalDocumentsCount === 0 && (
                <p className="mt-6 text-sm text-gray-600 dark:text-gray-400">
                  Documentele PDF nu sunt obligatorii, �ns pot �mbunti �ncrederea cumprtorilor i claritatea anunului.
                </p>
              )}
            </div>
          )}

          {/* File Upload */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Imagini i Fiiere</h2>
            
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
                    ? 'Limita de 50 imagini atins'
                    : 'Trage fiierele aici sau click pentru a selecta'
                  }
                </p>
                <p className="text-sm text-gray-500 dark:text-gray-500">
                  Suport imagini (JPG, PNG, GIF) i fiiere .zip (max 10MB per fiier)
                </p>
                <p className={`text-xs mt-1 font-semibold ${
                  formData.images.length >= 50
                    ? 'text-red-500 dark:text-red-400'
                    : formData.images.length >= 40
                    ? 'text-yellow-600 dark:text-yellow-400'
                    : 'text-gray-400 dark:text-gray-500'
                }`}>
                  {formData.images.length}/50 imagini
                </p>
                </label>
              </div>

              {formData.images.length > 0 && (
              <div className="mt-4">
                <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Fi?iere �nc?rcate</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                  Prima imagine este coperta. Trage pozele sau folose?te s?ge?ile pentru ordine.
                </p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {formData.images.map((image, index) => (
                    <div
                      key={index}
                      {...getAdminImageTargetProps(index)}
                      className={`relative ${
                        adminImageDragOverIndex === index ? 'ring-2 ring-blue-500 rounded-lg' : ''
                      }`}
                    >
                      <div
                        {...getAdminImageHandleProps(index)}
                        className="absolute left-0 top-1/2 z-[4] flex h-10 w-6 -translate-y-1/2 cursor-grab items-center justify-center rounded-r bg-black/35 text-white active:cursor-grabbing"
                        title="Trage pentru a muta pozi?ia"
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
                            <div className="text-2xl mb-1">=�</div>
                            <div className="text-xs text-gray-600 dark:text-gray-400 truncate">
                              {image.name}
                </div>
                            <div className="text-xs text-gray-500 dark:text-gray-500">
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
                          aria-label="Mut? mai spre �nceput"
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
                          aria-label="Mut? mai spre sf�r?it"
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
                        �
                      </button>
                  </div>
                ))}
              </div>
            </div>
          )}
          </div>

          {/* SEO */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">SEO cu ChatGPT</h2>
              <button
                type="button"
                onClick={handleGenerateSEO}
                disabled={isGeneratingSEO || !formData.title.trim() || !formData.description.trim()}
                className="px-4 py-2 bg-gradient-to-r from-blue-600 to-blue-600 hover:from-blue-700 hover:to-blue-700 disabled:from-gray-400 disabled:to-gray-500 disabled:cursor-not-allowed text-white rounded-lg transition-all flex items-center gap-2 text-sm font-medium"
                title="ChatGPT genereaz automat meta titlu, descriere i cuvinte cheie"
              >
                {isGeneratingSEO ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    <span>Genereaz...</span>
                  </>
                ) : (
                  <>
                    <i className="ri-magic-line"></i>
                    <span>Regenereaz SEO cu ChatGPT</span>
                  </>
                )}
              </button>
            </div>
            <p className="text-xs text-gray-600 dark:text-gray-400 mb-4">
              ChatGPT completeaz automat c�mpurile SEO la salvare; poi ajusta manual oric�nd sau folosi butonul pentru o nou sugestie.
            </p>
            
            <div className="space-y-4">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Titlu SEO
                  </label>
                  <span className={`text-xs ${(formData.seo?.title ?? '').length > 65 ? 'text-red-500' : (formData.seo?.title ?? '').length > 60 ? 'text-yellow-500' : 'text-gray-500'}`}>
                    {(formData.seo?.title ?? '').length}/65
                  </span>
                </div>
                <input
                  type="text"
                  name="seo.title"
                  value={formData.seo?.title ?? ''}
                  onChange={handleInputChange}
                  maxLength={65}
                  className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white ${
                    (formData.seo?.title ?? '').length > 65 
                      ? 'border-red-500 focus:ring-red-500' 
                      : (formData.seo?.title ?? '').length > 60
                      ? 'border-yellow-500 focus:ring-yellow-500'
                      : 'border-gray-300 dark:border-gray-600 focus:ring-blue-500'
                  }`}
                  placeholder="Titlu pentru motoarele de cutare (max 65 caractere)"
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
                  <span className={`text-xs ${(formData.seo?.description ?? '').length > 160 ? 'text-red-500' : (formData.seo?.description ?? '').length > 155 ? 'text-yellow-500' : 'text-gray-500'}`}>
                    {(formData.seo?.description ?? '').length}/160
                  </span>
                </div>
                <textarea
                  name="seo.description"
                  value={formData.seo?.description ?? ''}
                  onChange={handleInputChange}
                  rows={3}
                  maxLength={160}
                  className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white ${
                    (formData.seo?.description ?? '').length > 160 
                      ? 'border-red-500 focus:ring-red-500' 
                      : (formData.seo?.description ?? '').length > 155
                      ? 'border-yellow-500 focus:ring-yellow-500'
                      : 'border-gray-300 dark:border-gray-600 focus:ring-blue-500'
                  }`}
                  placeholder="Descriere pentru motoarele de cutare (max 160 caractere)"
                />
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Recomandat: 150-160 caractere pentru rezultate optime
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Cuvinte Cheie (separate prin virgul)
                  </label>
                  <input
                    type="text"
                  name="seo.keywords"
                  value={(formData.seo?.keywords ?? []).join(', ')}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  placeholder="cuvant1, cuvant2, cuvant3"
                />
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  ChatGPT propune automat cuvinte cheie relevante; editeaz lista dac vrei termeni personalizai.
                </p>
                </div>
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
              Anuleaz
            </button>
            <button
              type="submit"
              disabled={isSubmitting || isLoadingProduct}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
             >
              {isSubmitting
                ? 'Se salveaz...'
                : isEditMode
                  ? 'Actualizeaz Produsul'
                  : 'Salveaz Produsul'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
