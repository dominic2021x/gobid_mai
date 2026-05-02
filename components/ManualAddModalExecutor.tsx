'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { reorderArray } from '@/lib/manual-listing/reorder-array';
import { useManualListingImageDnD } from '@/components/manual-listing/useManualListingImageDnD';
import { supabase } from '@/lib/supabase';
import { uploadImageFile } from '@/lib/upload/client-image-upload';
import ModernDatePicker from '@/components/ModernDatePicker';
import { slugify, generateUniqueSlug } from '@/lib/slugify';
import { CATEGORY_LEVEL_3, CATEGORY_LEVEL_3_NAMES, SUBCATEGORY_DISPLAY_TO_KEY } from '@/lib/categories';
import {
  getAttributesForSubcategory,
  getSizeOptionsForSubcategory,
  getBrandOptionsForSubcategory,
  COLOR_OPTIONS,
  normalizeConditionForForm,
} from '@/lib/attributes';
import { getImobiliareFieldsForSubcategory } from '@/lib/imobiliare-fields';

interface ManualAddModalExecutorProps {
  showModal: boolean;
  setShowModal: (show: boolean) => void;
  isDarkMode: boolean;
  onProductAdded?: () => void;
  editingProductId?: string | null;
}

const ManualAddModalExecutor: React.FC<ManualAddModalExecutorProps> = ({
  showModal,
  setShowModal,
  isDarkMode,
  onProductAdded,
  editingProductId,
}) => {
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    category: '',
    subcategory: '',
    categoryLevel3: '',
    size: '',
    brand: '',
    color: '',
    condition: 'Nou',
    sku: '',
    startingPrice: 0,
    currency: 'RON' as 'RON' | 'EUR',
    productType: 'licitatii-publice' as const,
    saleType: 'licitatii-executori' as 'licitatii-anaf' | 'licitatii-insolventa' | 'licitatii-executori' | 'alte-licitatii',
    auctionLocation: '',
    auctionRegistrationDate: '',
    auctionDate: '',
    auctionTime: '',
    productLocation: '',
    county: '',
    city: '',
    address: '',
    images: [] as File[],
    documents: [] as File[],
    customFields: {} as Record<string, any>,
    status: 'active' as 'draft' | 'active',
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [exchangeRate, setExchangeRate] = useState<number | null>(null);
  const [isFetchingRate, setIsFetchingRate] = useState(false);
  const [lastRateUpdate, setLastRateUpdate] = useState<Date | null>(null);
  const [priceRon, setPriceRon] = useState<number>(0);
  const [priceEur, setPriceEur] = useState<number>(0);
  const [discountPercent, setDiscountPercent] = useState<number | null>(null);
  const [discountValueRon, setDiscountValueRon] = useState<number | null>(null);
  const [discountedPriceRon, setDiscountedPriceRon] = useState<number | null>(null);
  const [discountValueEur, setDiscountValueEur] = useState<number | null>(null);
  const [discountedPriceEur, setDiscountedPriceEur] = useState<number | null>(null);
  const [seo, setSeo] = useState({ title: '', description: '', keywords: [] as string[] });
  const [isGeneratingSEO, setIsGeneratingSEO] = useState(false);
  const [isEnhancing, setIsEnhancing] = useState(false);
  const [autoEnhance, setAutoEnhance] = useState(false);
  const [rewriteTitle, setRewriteTitle] = useState(false);
  const [rewriteDescription, setRewriteDescription] = useState(false);
  const [officialRegistration, setOfficialRegistration] = useState(false);
  const [skuEditable, setSkuEditable] = useState(false);
  const [existingSkus, setExistingSkus] = useState<string[]>([]);
  const MAX_IMAGES = 50;
  const MAX_DOCUMENTS = 5;
  const MAX_DOCUMENT_SIZE_MB = 15;

  // Categories - complete list (Executări cu 6 subcategorii comune pentru Executori + Insolvență)
  const categories = [
    'Executări',
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
    'Executări': [
      'exec-imobiliare',
      'exec-autovehicule',
      'exec-industrial',
      'exec-afaceri',
      'exec-office',
      'exec-altele'
    ],
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
      'Bunuri Confiscate / Execuții'
    ]
  };

  const counties = [
    'Alba', 'Arad', 'Argeș', 'Bacău', 'Bihor', 'Bistrița-Năsăud', 'Botoșani', 'Brașov',
    'Brăila', 'București', 'Buzău', 'Caraș-Severin', 'Călărași', 'Cluj', 'Constanța',
    'Covasna', 'Dâmbovița', 'Dolj', 'Galați', 'Giurgiu', 'Gorj', 'Harghita', 'Hunedoara',
    'Ialomița', 'Iași', 'Ilfov', 'Maramureș', 'Mehedinți', 'Mureș', 'Neamț', 'Olt',
    'Prahova', 'Satu Mare', 'Sălaj', 'Sibiu', 'Suceava', 'Teleorman', 'Timiș', 'Tulcea',
    'Vaslui', 'Vâlcea', 'Vrancea'
  ];

  // SKU Constants
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
      .replace(/[^\u0000-\u007F]/g, '')
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

  // Helper functions
  const roundTo = (value: number, decimals = 2) => {
    if (!Number.isFinite(value)) return 0;
    const factor = Math.pow(10, decimals);
    return Math.round((value + Number.EPSILON) * factor) / factor;
  };

  const formatDateForDisplay = (dateValue: string | undefined): string => {
    if (!dateValue) return '';
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
    return dateValue;
  };

  const parseDateInput = (dateInput: string, timeInput: string): string => {
    if (!dateInput) return '';
    let day: string, month: string, year: string;
    const dotFormat = dateInput.match(/^(\d{1,2})\.([^.]+)\.(\d{4})$/);
    if (dotFormat) {
      day = dotFormat[1].padStart(2, '0');
      const monthName = dotFormat[2];
      year = dotFormat[3];
      const monthNames = [
        'ianuarie', 'februarie', 'martie', 'aprilie', 'mai', 'iunie',
        'iulie', 'august', 'septembrie', 'octombrie', 'noiembrie', 'decembrie'
      ];
      const monthIndex = monthNames.findIndex(m => monthName.toLowerCase().startsWith(m.toLowerCase()));
      if (monthIndex >= 0) {
        month = String(monthIndex + 1).padStart(2, '0');
      } else {
        return '';
      }
    } else {
      const slashFormat = dateInput.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
      if (slashFormat) {
        day = slashFormat[1].padStart(2, '0');
        month = slashFormat[2].padStart(2, '0');
        year = slashFormat[3];
      } else {
        const isoFormat = dateInput.match(/^(\d{4})-(\d{2})-(\d{2})/);
        if (isoFormat) {
          return timeInput ? `${dateInput}T${timeInput}` : dateInput;
        }
        return '';
      }
    }
    const formattedDate = `${year}-${month}-${day}`;
    return timeInput ? `${formattedDate}T${timeInput}` : formattedDate;
  };

  const fetchExchangeRate = async () => {
    setIsFetchingRate(true);
    try {
      const response = await fetch('/api/exchange-rate');
      if (response.ok) {
        const data = await response.json();
        if (data.rate && data.rate > 0) {
          setExchangeRate(data.rate);
          setLastRateUpdate(new Date());
        }
      }
    } catch (error) {
      console.error('Error fetching exchange rate:', error);
    } finally {
      setIsFetchingRate(false);
    }
  };

  const getEffectiveRate = () => {
    return exchangeRate && exchangeRate > 0 ? exchangeRate : null;
  };

  const calculateDiscount = (baseRon: number, baseEur: number, percent?: number | null, valueRon?: number | null, finalPriceRon?: number | null) => {
    if (baseRon <= 0) return null;
    let pct: number | null = percent ?? null;
    let value: number | null = valueRon ?? null;
    let finalValue: number | null = finalPriceRon ?? null;
    if (pct !== null && Number.isFinite(pct)) {
      pct = Math.min(100, Math.max(0, pct));
      value = roundTo(baseRon * (pct / 100));
      finalValue = roundTo(baseRon - value);
    } else if (value !== null && Number.isFinite(value)) {
      value = Math.min(Math.max(0, value), baseRon);
      pct = baseRon > 0 ? roundTo((value / baseRon) * 100, 2) : 0;
      finalValue = roundTo(baseRon - value);
    } else if (finalValue !== null && Number.isFinite(finalValue)) {
      finalValue = Math.min(Math.max(0, finalValue), baseRon);
      value = roundTo(baseRon - finalValue);
      pct = baseRon > 0 ? roundTo((value / baseRon) * 100, 2) : 0;
    } else {
      return null;
    }
    const rate = getEffectiveRate();
    let valueEur: number | null = null;
    let finalEur: number | null = null;
    if (rate && rate > 0) {
      valueEur = roundTo(value / rate);
      finalEur = roundTo(finalValue / rate);
    } else if (baseEur > 0) {
      const ratio = baseEur / baseRon;
      valueEur = roundTo(value * ratio);
      finalEur = roundTo(baseEur - valueEur);
    }
    return { percent: pct, valueRon: value, valueEur, finalRon: finalValue, finalEur };
  };

  const updateDiscounts = (percent?: number | null, valueRon?: number | null, finalPriceRon?: number | null) => {
    const summary = calculateDiscount(priceRon, priceEur, percent, valueRon, finalPriceRon);
    if (!summary) {
      setDiscountPercent(null);
      setDiscountValueRon(null);
      setDiscountedPriceRon(null);
      setDiscountValueEur(null);
      setDiscountedPriceEur(null);
      return;
    }
    setDiscountPercent(summary.percent);
    setDiscountValueRon(summary.valueRon);
    setDiscountValueEur(summary.valueEur);
    setDiscountedPriceRon(summary.finalRon);
    setDiscountedPriceEur(summary.finalEur);
  };

  const clearDiscounts = () => {
    setDiscountPercent(null);
    setDiscountValueRon(null);
    setDiscountedPriceRon(null);
    setDiscountValueEur(null);
    setDiscountedPriceEur(null);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handlePriceRonChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value) || 0;
    setPriceRon(val);
    const rate = getEffectiveRate();
    if (rate && rate > 0) {
      setPriceEur(roundTo(val / rate));
    }
    if (val > 0) {
      updateDiscounts(discountPercent, discountValueRon, discountedPriceRon);
    } else {
      clearDiscounts();
    }
  };

  const handlePriceEurChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value) || 0;
    setPriceEur(val);
    const rate = getEffectiveRate();
    if (rate && rate > 0) {
      setPriceRon(roundTo(val * rate));
    }
    if (val > 0) {
      updateDiscounts(discountPercent, discountValueRon, discountedPriceRon);
    } else {
      clearDiscounts();
    }
  };

  const handleDiscountPercentChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.trim() === '' ? null : parseFloat(e.target.value);
    if (val === null) {
      clearDiscounts();
      return;
    }
    updateDiscounts(val, null, null);
  };

  const handleDiscountValueChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.trim() === '' ? null : parseFloat(e.target.value);
    if (val === null) {
      clearDiscounts();
      return;
    }
    updateDiscounts(null, val, null);
  };

  const handleDiscountFinalPriceChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.trim() === '' ? null : parseFloat(e.target.value);
    if (val === null) {
      clearDiscounts();
      return;
    }
    updateDiscounts(null, null, val);
  };

  const handleDiscountValueEurChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.trim() === '' ? null : parseFloat(e.target.value);
    if (val === null) {
      clearDiscounts();
      return;
    }
    const rate = getEffectiveRate();
    if (rate && rate > 0) {
      const valueRon = roundTo(val * rate);
      updateDiscounts(null, valueRon, null);
    }
  };

  const handleDiscountFinalPriceEurChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.trim() === '' ? null : parseFloat(e.target.value);
    if (val === null) {
      clearDiscounts();
      return;
    }
    const rate = getEffectiveRate();
    if (rate && rate > 0) {
      const finalPriceRon = roundTo(val * rate);
      updateDiscounts(null, null, finalPriceRon);
    }
  };

  const fileToBase64 = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => {
        const data = r.result as string;
        const base64 = data.includes(',') ? data.split(',')[1] : data;
        resolve(base64 || '');
      };
      r.onerror = () => reject(new Error('Eroare la citirea imaginii'));
      r.readAsDataURL(file);
    });

  const handleGenerateSEO = async () => {
    if (!formData.title || !formData.description) {
      setMessage({ type: 'error', text: 'Completează titlul și descrierea înainte de a genera SEO.' });
      return;
    }
    setIsGeneratingSEO(true);
    setMessage(null);
    try {
      const imageFiles = formData.images.filter((x): x is File => x instanceof File);
      const imagesBase64 = imageFiles.length ? await Promise.all(imageFiles.map(fileToBase64)) : [];
      const body: Record<string, unknown> = {
        titlu: formData.title,
        descriere: formData.description,
        specificatii: formData.subcategory ? `${formData.category} - ${formData.subcategory}` : formData.category,
      };
      if (imagesBase64.length) body.images = imagesBase64;

      const response = await fetch('/api/ai-product-enhancer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Eroare necunoscută' }));
        throw new Error(errorData.error || `Eroare ${response.status}: ${response.statusText}`);
      }
      
      const result = await response.json();
      const data = result.data || result;
      
      if (data.seoTitle || data.seoDescription || data.seoKeywords) {
        setSeo({
          title: data.seoTitle || seo.title,
          description: data.seoDescription || seo.description,
          keywords: Array.isArray(data.seoKeywords) ? data.seoKeywords : (typeof data.seoKeywords === 'string' ? data.seoKeywords.split(',').map((k: string) => k.trim()) : seo.keywords),
        });
        setMessage({ type: 'success', text: 'SEO generat cu succes!' });
      } else {
        setMessage({ type: 'error', text: 'Nu s-au primit date SEO de la server.' });
      }
    } catch (error: any) {
      console.error('Error generating SEO:', error);
      setMessage({ type: 'error', text: error.message || 'Eroare la generarea SEO. Te rugăm să încerci din nou.' });
    } finally {
      setIsGeneratingSEO(false);
    }
  };

  const handleAutoEnhance = async () => {
    if (!formData.title || !formData.description) {
      setMessage({ type: 'error', text: 'Completează titlul și descrierea înainte de a optimiza.' });
      return;
    }
    setIsEnhancing(true);
    setMessage(null);
    try {
      const imageFiles = formData.images.filter((x): x is File => x instanceof File);
      const imagesBase64 = imageFiles.length ? await Promise.all(imageFiles.map(fileToBase64)) : [];
      const body: Record<string, unknown> = {
        titlu: formData.title,
        descriere: formData.description,
        specificatii: formData.subcategory ? `${formData.category} - ${formData.subcategory}` : formData.category,
      };
      if (imagesBase64.length) body.images = imagesBase64;

      const response = await fetch('/api/ai-product-enhancer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Eroare necunoscută' }));
        throw new Error(errorData.error || `Eroare ${response.status}: ${response.statusText}`);
      }
      
      const result = await response.json();
      const data = result.data || result;
      let hasChanges = false;
      
      if (rewriteTitle && data.newTitle && data.newTitle !== formData.title) {
        setFormData(prev => ({ ...prev, title: data.newTitle }));
        hasChanges = true;
      }
      if (rewriteDescription && data.newDescription && data.newDescription !== formData.description) {
        setFormData(prev => ({ ...prev, description: data.newDescription }));
        hasChanges = true;
      }
      if (data.seoTitle || data.seoDescription || data.seoKeywords) {
        setSeo({
          title: data.seoTitle || seo.title,
          description: data.seoDescription || seo.description,
          keywords: Array.isArray(data.seoKeywords) ? data.seoKeywords : (typeof data.seoKeywords === 'string' ? data.seoKeywords.split(',').map((k: string) => k.trim()) : seo.keywords),
        });
        hasChanges = true;
      }
      
      if (hasChanges) {
        setMessage({ type: 'success', text: 'Produs optimizat cu succes cu GoBid AI!' });
      } else {
        setMessage({ type: 'error', text: 'Nu s-au făcut modificări. Verifică că ai bifat opțiunile de rescriere.' });
      }
    } catch (error: any) {
      console.error('Error enhancing product:', error);
      setMessage({ type: 'error', text: error.message || 'Eroare la optimizare. Te rugăm să încerci din nou.' });
    } finally {
      setIsEnhancing(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files) {
      const newImages = Array.from(files).filter(file => file.type.startsWith('image/'));
      const remainingSlots = MAX_IMAGES - formData.images.length;
      const imagesToAdd = newImages.slice(0, remainingSlots);
      if (imagesToAdd.length < newImages.length) {
        setMessage({ type: 'error', text: `Poți adăuga maxim ${MAX_IMAGES} imagini. ${remainingSlots} sloturi disponibile.` });
      }
      setFormData(prev => ({ ...prev, images: [...prev.images, ...imagesToAdd] }));
    }
    e.target.value = '';
  };

  const handleDocumentUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files) {
      const newDocs: File[] = [];
      const remainingSlots = MAX_DOCUMENTS - formData.documents.length;
      Array.from(files).forEach((file, index) => {
        if (index >= remainingSlots) return;
        const sizeMB = file.size / (1024 * 1024);
        if (sizeMB > MAX_DOCUMENT_SIZE_MB) {
          setMessage({ type: 'error', text: `Fișierul ${file.name} depășește limita de ${MAX_DOCUMENT_SIZE_MB}MB.` });
          return;
        }
        if (!file.type.includes('pdf') && !file.name.toLowerCase().endsWith('.pdf')) {
          setMessage({ type: 'error', text: `Doar fișiere PDF sunt permise. ${file.name} nu este PDF.` });
          return;
        }
        newDocs.push(file);
      });
      if (newDocs.length < Array.from(files).length) {
        setMessage({ type: 'error', text: `Poți adăuga maxim ${MAX_DOCUMENTS} documente. ${remainingSlots} sloturi disponibile.` });
      }
      setFormData(prev => ({ ...prev, documents: [...prev.documents, ...newDocs] }));
    }
    e.target.value = '';
  };

  const handleRemoveImage = (index: number) => {
    setFormData(prev => ({
      ...prev,
      images: prev.images.filter((_, i) => i !== index)
    }));
  };

  const reorderImages = useCallback((fromIndex: number, toIndex: number) => {
    setFormData((prev) => ({
      ...prev,
      images: reorderArray(prev.images, fromIndex, toIndex),
    }));
  }, []);

  const moveImageStep = useCallback((index: number, delta: number) => {
    setFormData((prev) => {
      const to = index + delta;
      if (to < 0 || to >= prev.images.length) return prev;
      return { ...prev, images: reorderArray(prev.images, index, to) };
    });
  }, []);

  const {
    dragOverIndex: executorImageDragOverIndex,
    getSortableTargetProps: getExecutorImageTargetProps,
    getSortableHandleProps: getExecutorImageHandleProps,
  } = useManualListingImageDnD(reorderImages);

  const handleRemoveDocument = (index: number) => {
    setFormData(prev => ({
      ...prev,
      documents: prev.documents.filter((_, i) => i !== index)
    }));
  };

  useEffect(() => {
    if (showModal) {
      setMessage(null); // Reset message when modal opens
      fetchExchangeRate();
      
      // Load existing SKUs
      const loadExistingSkus = async () => {
        try {
          const { data, error } = await supabase
            .from('products')
            .select('sku')
            .not('sku', 'is', null);
          
          if (!error && data) {
            const skus = data
              .map((p: { sku: string | null }) => sanitizeSkuInput(p.sku || ''))
              .filter(Boolean);
            setExistingSkus(skus);
          }
        } catch (error) {
          console.error('Error loading existing SKUs:', error);
        }
      };
      
      loadExistingSkus();

      // Load product data if editing
      if (editingProductId) {
        const loadProduct = async () => {
          try {
            const { data: product, error } = await supabase
              .from('products')
              .select('*')
              .eq('id', editingProductId)
              .single();

            if (error) throw error;
            if (!product) return;

            // Parse custom fields
            const customFields = product.custom_fields || {};
            const seoData = product.seo || { title: '', description: '', keywords: [] };

            // Set form data
            setFormData({
              title: product.title || '',
              description: product.description || '',
              category: product.category || '',
              subcategory: product.subcategory || '',
              categoryLevel3: product.category_level_3 || '',
              size: product.size || '',
              brand: product.brand || '',
              color: product.color || '',
              condition: normalizeConditionForForm(product.condition),
              sku: product.sku || '',
              startingPrice: product.starting_price || 0,
              currency: (product.currency as 'RON' | 'EUR') || 'RON',
              productType: 'licitatii-publice' as const,
              saleType: (product.sale_type as any) || 'licitatii-executori',
              auctionLocation: product.auction_location || '',
              auctionRegistrationDate: product.auction_registration_date || '',
              auctionDate: product.auction_date ? product.auction_date.split('T')[0] : '',
              auctionTime: product.auction_date ? product.auction_date.split('T')[1]?.substring(0, 5) || '' : '',
              productLocation: product.product_location || '',
              county: product.county || '',
              city: product.city || '',
              address: product.address || '',
              images: Array.isArray(product.images) ? product.images : [],
              documents: Array.isArray(product.documents) ? product.documents : [],
              customFields: customFields,
              status: (product.status as 'draft' | 'active') || 'active',
            });

            // Set prices
            setPriceRon(product.starting_price_ron || product.starting_price || 0);
            setPriceEur(product.starting_price_eur || 0);

            // Set exchange rate
            if (customFields.exchange_rate) {
              setExchangeRate(customFields.exchange_rate);
            }

            // Set discounts
            if (customFields.discount_percent !== null && customFields.discount_percent !== undefined) {
              setDiscountPercent(customFields.discount_percent);
            }
            if (customFields.discount_value_ron !== null && customFields.discount_value_ron !== undefined) {
              setDiscountValueRon(customFields.discount_value_ron);
            }
            if (customFields.discounted_price_ron !== null && customFields.discounted_price_ron !== undefined) {
              setDiscountedPriceRon(customFields.discounted_price_ron);
            }
            if (customFields.discount_value_eur !== null && customFields.discount_value_eur !== undefined) {
              setDiscountValueEur(customFields.discount_value_eur);
            }
            if (customFields.discounted_price_eur !== null && customFields.discounted_price_eur !== undefined) {
              setDiscountedPriceEur(customFields.discounted_price_eur);
            }

            // Set SEO
            setSeo(seoData);

            // Set official registration
            if (customFields.official_registration !== undefined) {
              setOfficialRegistration(customFields.official_registration);
            }

            // Set SKU editable to false (read-only by default)
            setSkuEditable(false);
          } catch (error) {
            console.error('Error loading product:', error);
            setMessage({ type: 'error', text: 'Nu am putut încărca datele produsului.' });
          }
        };

        loadProduct();
      } else {
        // Reset form when creating new product
        setFormData({
          title: '',
          description: '',
          category: '',
          subcategory: '',
          categoryLevel3: '',
          size: '',
          brand: '',
          color: '',
          condition: 'Nou',
          sku: '',
          startingPrice: 0,
          currency: 'RON',
          productType: 'licitatii-publice',
          saleType: 'licitatii-executori',
          auctionLocation: '',
          auctionRegistrationDate: '',
          auctionDate: '',
          auctionTime: '',
          productLocation: '',
          county: '',
          city: '',
          address: '',
          images: [],
          documents: [],
          customFields: {},
          status: 'active',
        });
        setPriceRon(0);
        setPriceEur(0);
        clearDiscounts();
        setSeo({ title: '', description: '', keywords: [] });
        setOfficialRegistration(false);
        setSkuEditable(false);
        setAutoEnhance(false);
        setRewriteTitle(false);
        setRewriteDescription(false);
      }
    }
  }, [showModal, editingProductId]);

  // Auto-generate SKU when subcategory changes
  useEffect(() => {
    if (formData.subcategory && !skuEditable && existingSkus.length >= 0) {
      const newSku = generateSku(formData.subcategory, existingSkus);
      if (newSku && newSku !== formData.sku) {
        setFormData(prev => ({ ...prev, sku: newSku }));
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData.subcategory, skuEditable]);

  // Note: Discount updates are handled directly in price change handlers
  // No useEffect needed to avoid dependency loops

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setMessage(null);

    try {
      // Get current user
      const { data: sessionData } = await supabase.auth.getSession();
      const userId = sessionData.session?.user?.id;

      if (!userId) {
        throw new Error('Utilizator neautentificat');
      }

      // Upload images (R2 presigned + Supabase metadata)
      // Keep existing image URLs, upload only new File objects
      const imageUrls: string[] = [];
      for (const image of formData.images) {
        if (typeof image === 'string') {
          // Already a URL, keep it
          imageUrls.push(image);
        } else if (image instanceof File) {
          // New file, upload it
          try {
            const uploadResult = await uploadImageFile(image);
            if (uploadResult.success && uploadResult.url) {
              imageUrls.push(uploadResult.url);
            } else {
              throw new Error(
                (!uploadResult.success && uploadResult.error) || 'Eroare la încărcarea imaginii'
              );
            }
          } catch (error) {
            console.error('Error uploading image:', error);
            throw error;
          }
        }
      }

      // Upload documents to Supabase storage
      // Keep existing documents, upload only new File objects
      const documentUrls: Array<{ name: string; url: string; size: number; type: string }> = [];
      for (const doc of formData.documents) {
        if (typeof doc === 'object' && doc !== null && 'url' in doc && typeof doc.url === 'string') {
          // Already a document object with URL, keep it
          documentUrls.push({
            name: doc.name || '',
            url: doc.url,
            size: doc.size || 0,
            type: doc.type || 'application/pdf',
          });
        } else if (doc instanceof File) {
          // New file, upload via API (uses supabaseAdmin to bypass RLS)
          try {
            const formDataUpload = new FormData();
            formDataUpload.append('file', doc);
            formDataUpload.append('userId', userId);

            const uploadResponse = await fetch('/api/upload/document', {
              method: 'POST',
              body: formDataUpload,
            });

            const uploadResult = await uploadResponse.json();

            if (!uploadResponse.ok) {
              console.error('Document upload error:', uploadResult);
              throw new Error(uploadResult.error || 'Nu am putut încărca documentele PDF. Încearcă din nou sau contactează un administrator.');
            }

            if (uploadResult.success && uploadResult.url) {
              documentUrls.push({
                name: uploadResult.name || doc.name,
                url: uploadResult.url,
                size: uploadResult.size ?? doc.size,
                type: uploadResult.type || doc.type,
              });
            } else {
              throw new Error('Nu am putut încărca documentul. Răspuns invalid de la server.');
            }
          } catch (error) {
            console.error('Error uploading document:', error);
            throw error;
          }
        }
      }

      // Parse dates - ModernDatePicker returnează formatul YYYY-MM-DD
      // Combinăm data cu ora dacă există
      const parsedAuctionDate = formData.auctionDate && formData.auctionTime 
        ? `${formData.auctionDate}T${formData.auctionTime}`
        : formData.auctionDate || null;
      const parsedRegistrationDate = formData.auctionRegistrationDate || null;

      // Calculate final prices with exchange rate
      const rate = getEffectiveRate() || 5.0;
      const finalPriceRon = formData.currency === 'RON' ? priceRon : roundTo(priceEur * rate);
      const finalPriceEur = formData.currency === 'EUR' ? priceEur : roundTo(priceRon / rate);

      // Generate slug from title (only for new products)
      let uniqueSlug: string;
      let productUrl: string;
      
      if (editingProductId) {
        // Keep existing slug and URL for editing
        const { data: existingProduct } = await supabase
          .from('products')
          .select('slug, url')
          .eq('id', editingProductId)
          .single();
        
        uniqueSlug = existingProduct?.slug || slugify(formData.title);
        productUrl = existingProduct?.url || `/licitatii-publice/${uniqueSlug}`;
      } else {
        // Generate new slug for new products
        const baseSlug = slugify(formData.title);
        
        // Check for existing slugs to ensure uniqueness
        const { data: existingProducts } = await supabase
          .from('products')
          .select('slug')
          .not('slug', 'is', null);
        
        const existingSlugs = (existingProducts || [])
          .map((p: { slug: string | null }) => p.slug)
          .filter(Boolean) as string[];
        uniqueSlug = generateUniqueSlug(baseSlug, existingSlugs);
        
        // Generate URL for licitatii-publice
        productUrl = `/licitatii-publice/${uniqueSlug}`;
      }

      const attrsForExecutorSave = formData.subcategory ? getAttributesForSubcategory(formData.subcategory) : null;

      // Create product
      const productData: any = {
        user_id: userId,
        title: formData.title,
        description: formData.description,
        category: formData.category,
        subcategory: formData.subcategory,
        category_level_3: formData.categoryLevel3 || null,
        size: formData.size || null,
        brand: formData.brand || null,
        color: formData.color || null,
        condition: attrsForExecutorSave?.condition
          ? (formData.condition === 'Second hand' ? 'Second hand' : 'Nou')
          : null,
        sku: formData.sku,
        starting_price: formData.currency === 'RON' ? finalPriceRon : finalPriceEur,
        starting_price_ron: finalPriceRon,
        starting_price_eur: finalPriceEur,
        currency: formData.currency,
        product_type: formData.productType,
        sale_type: formData.saleType,
        auction_location: formData.auctionLocation || null,
        auction_registration_date: parsedRegistrationDate,
        auction_date: parsedAuctionDate,
        product_location: formData.productLocation || null,
        county: formData.county || null,
        city: formData.city || null,
        address: formData.address || null,
        images: imageUrls,
        documents: documentUrls,
        custom_fields: {
          ...formData.customFields,
          exchange_rate: rate,
          exchange_rate_updated_at: lastRateUpdate?.toISOString() || new Date().toISOString(),
          discount_percent: discountPercent,
          discount_value_ron: discountValueRon,
          discount_value_eur: discountValueEur,
          discounted_price_ron: discountedPriceRon,
          discounted_price_eur: discountedPriceEur,
          official_registration: officialRegistration,
        },
        seo: seo,
        status: formData.status,
        slug: uniqueSlug,
        url: productUrl,
        updated_at: new Date().toISOString(),
      };

      // Don't update created_at when editing
      if (!editingProductId) {
        productData.created_at = new Date().toISOString();
      }

      let result;
      if (editingProductId) {
        // Update existing product
        const { data, error } = await supabase
          .from('products')
          .update(productData)
          .eq('id', editingProductId)
          .select();

        if (error) throw error;
        result = data;
        setMessage({ type: 'success', text: 'Produs actualizat cu succes!' });
      } else {
        // Insert new product
        const { data, error } = await supabase
          .from('products')
          .insert([productData])
          .select();

        if (error) throw error;
        result = data;
        setMessage({ type: 'success', text: 'Produs adăugat cu succes!' });
      }
      
      // Reset form
      setFormData({
        title: '',
        description: '',
        category: '',
        subcategory: '',
        categoryLevel3: '',
        size: '',
        brand: '',
        color: '',
        condition: 'Nou',
        sku: '',
        startingPrice: 0,
        currency: 'RON',
        productType: 'licitatii-publice',
        saleType: 'licitatii-executori',
        auctionLocation: '',
        auctionRegistrationDate: '',
        auctionDate: '',
        auctionTime: '',
        productLocation: '',
        county: '',
        city: '',
        address: '',
        images: [],
        documents: [],
        customFields: {},
        status: 'active',
      });
      setSkuEditable(false);
      setPriceRon(0);
      setPriceEur(0);
      clearDiscounts();
      setSeo({ title: '', description: '', keywords: [] });
      setOfficialRegistration(false);

      // Callback
      if (onProductAdded) {
        onProductAdded();
      }

      // Close modal after delay
      setTimeout(() => {
        setShowModal(false);
        setMessage(null);
      }, 2000);

    } catch (error: any) {
      console.error('Error submitting form:', error);
      setMessage({ 
        type: 'error', 
        text: error.message || 'Eroare la salvarea produsului. Te rog încearcă din nou.' 
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!showModal) return null;

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center backdrop-blur-sm p-2 sm:p-4 bg-black/10 dark:bg-black/15"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          setShowModal(false);
        }
      }}
    >
      <div
        className={`relative w-full max-w-md sm:max-w-2xl md:max-w-4xl lg:max-w-6xl max-h-[95vh] overflow-hidden rounded-xl border shadow-2xl ${
          isDarkMode ? 'gobid-modal-dashboard-shell--dark' : 'gobid-modal-dashboard-shell--light'
        }`}
      >
        {/* Header */}
        <div className={`flex items-center justify-between p-4 border-b ${
          isDarkMode ? 'border-gray-700' : 'border-gray-200'
        }`}>
          <div className="flex-1 min-w-0 pr-2">
            <h2 className={`text-lg font-semibold truncate ${
              isDarkMode ? 'text-white' : 'text-gray-900'
            }`}>
              Adaugă Licitație Publică
            </h2>
            <p className={`text-xs mt-0.5 ${
              isDarkMode ? 'text-gray-400' : 'text-gray-600'
            }`}>
              Completează informațiile pentru noua licitație publică
            </p>
          </div>
          <button
            onClick={() => setShowModal(false)}
            className={`p-1.5 rounded-lg transition-colors ${
              isDarkMode 
                ? 'hover:bg-gray-700 text-gray-400 hover:text-white' 
                : 'hover:bg-gray-100 text-gray-500 hover:text-gray-700'
            }`}
          >
            <i className="ri-close-line text-xl"></i>
          </button>
        </div>

        {/* Content */}
        <div className="overflow-y-auto" style={{ maxHeight: 'calc(95vh - 80px)' }}>
          <div className={`p-4 sm:p-6 ${isDarkMode ? 'bg-gray-800' : 'bg-white'}`}>
            {/* Message */}
            {message && (
              <div className={`mb-4 p-4 rounded-lg border ${
                isDarkMode 
                  ? 'bg-gray-800 border-gray-700' 
                  : 'bg-gray-50 border-gray-200'
              } ${
                message.type === 'success' 
                  ? 'text-green-600 dark:text-green-400'
                  : 'text-red-600 dark:text-red-400'
              }`}>
                <div className="flex items-center gap-2">
                  {message.type === 'success' ? (
                    <i className="ri-checkbox-circle-line text-lg"></i>
                  ) : (
                    <i className="ri-error-warning-line text-lg"></i>
                  )}
                  <span>{message.text}</span>
                </div>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Tip Produs - Doar Licitații Publice */}
              <div className={`rounded-lg border p-4 sm:p-6 ${
                isDarkMode ? 'border-gray-700 bg-gray-800/50' : 'border-gray-200 bg-gray-50'
              }`}>
                <h3 className={`text-base font-semibold mb-2 ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                  Tip Produs
                </h3>
                <p className={`text-xs mb-4 ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                  Alege modul principal în care va fi listat produsul și, dacă este cazul, cum se va desfășura vânzarea.
                </p>
                
                <div className="grid grid-cols-1 gap-4">
                  <label className={`relative flex items-start gap-4 p-4 rounded-xl border-2 cursor-pointer transition-all ${
                    formData.productType === 'licitatii-publice'
                      ? isDarkMode 
                        ? 'border-blue-500 bg-blue-900/20' 
                        : 'border-blue-500 bg-blue-50'
                      : isDarkMode
                        ? 'border-gray-600 bg-gray-800/30 hover:border-gray-500'
                        : 'border-gray-300 bg-white hover:border-gray-400'
                  }`}>
                    <input
                      type="radio"
                      name="productType"
                      value="licitatii-publice"
                      checked={formData.productType === 'licitatii-publice'}
                      onChange={handleInputChange}
                      className="sr-only"
                    />
                    <div className={`flex-1 ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                      <div className="flex items-center gap-3 mb-2">
                        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                          isDarkMode ? 'bg-blue-500/20' : 'bg-blue-100'
                        }`}>
                          <i className="ri-building-line text-xl text-blue-600 dark:text-blue-400"></i>
                        </div>
                        <div className="flex-1">
                          <h4 className="font-semibold">Licitații publice</h4>
                          <p className={`text-xs mt-1 ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                            Listare dedicat portofoliilor publice sau executorilor; controlezi modul de adjudecare și fluxul cu clienții.
                          </p>
                        </div>
                        <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                          formData.productType === 'licitatii-publice'
                            ? 'border-blue-500 bg-blue-500'
                            : isDarkMode
                              ? 'border-gray-500'
                              : 'border-gray-300'
                        }`}>
                          {formData.productType === 'licitatii-publice' && (
                            <div className="w-2.5 h-2.5 rounded-full bg-white"></div>
                          )}
                        </div>
                      </div>
                    </div>
                  </label>
                </div>
                
                <p className={`text-xs mt-3 ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                  Listare dedicat licitațiilor publice; după publicare vei putea stabili condițiile de adjudecare pentru fiecare câștigător.
                </p>
              </div>

              {/* Tip de Vânzare */}
              <div className={`rounded-lg border p-4 sm:p-6 ${
                isDarkMode ? 'border-gray-700 bg-gray-800/50' : 'border-gray-200 bg-gray-50'
              }`}>
                <h3 className={`text-base font-semibold mb-2 ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                  Tip de Vânzare *
                </h3>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <label className={`relative flex items-start gap-3 p-4 rounded-xl border-2 cursor-pointer transition-all ${
                    formData.saleType === 'licitatii-anaf'
                      ? isDarkMode 
                        ? 'border-orange-500 bg-orange-900/20' 
                        : 'border-orange-500 bg-orange-50'
                      : isDarkMode
                        ? 'border-gray-600 bg-gray-800/30 hover:border-gray-500'
                        : 'border-gray-300 bg-white hover:border-gray-400'
                  }`}>
                    <input
                      type="radio"
                      name="saleType"
                      value="licitatii-anaf"
                      checked={formData.saleType === 'licitatii-anaf'}
                      onChange={handleInputChange}
                      className="sr-only"
                      required
                    />
                    <div className={`flex-1 ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                      <div className="flex items-center gap-2 mb-2">
                        <i className="ri-building-line text-xl text-orange-500"></i>
                        <h4 className="font-semibold">Licitații ANAF</h4>
                      </div>
                      <p className={`text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                        Loturi scoase la licitație prin ANAF, cu proceduri fiscal-bugetare clare și termene stricte.
                      </p>
                    </div>
                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                      formData.saleType === 'licitatii-anaf'
                        ? 'border-orange-500 bg-orange-500'
                        : isDarkMode
                          ? 'border-gray-500'
                          : 'border-gray-300'
                    }`}>
                      {formData.saleType === 'licitatii-anaf' && (
                        <div className="w-2.5 h-2.5 rounded-full bg-white"></div>
                      )}
                    </div>
                  </label>

                  <label className={`relative flex items-start gap-3 p-4 rounded-xl border-2 cursor-pointer transition-all ${
                    formData.saleType === 'licitatii-insolventa'
                      ? isDarkMode 
                        ? 'border-blue-500 bg-blue-900/20' 
                        : 'border-blue-500 bg-blue-50'
                      : isDarkMode
                        ? 'border-gray-600 bg-gray-800/30 hover:border-gray-500'
                        : 'border-gray-300 bg-white hover:border-gray-400'
                  }`}>
                    <input
                      type="radio"
                      name="saleType"
                      value="licitatii-insolventa"
                      checked={formData.saleType === 'licitatii-insolventa'}
                      onChange={handleInputChange}
                      className="sr-only"
                      required
                    />
                    <div className={`flex-1 ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                      <div className="flex items-center gap-2 mb-2">
                        <i className="ri-money-dollar-circle-line text-xl text-blue-500"></i>
                        <h4 className="font-semibold">Licitații Insolvență</h4>
                      </div>
                      <p className={`text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                        Proceduri speciale pentru companii în insolvență; poți activa vânzarea directă pentru ofertă rapidă.
                      </p>
                    </div>
                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                      formData.saleType === 'licitatii-insolventa'
                        ? 'border-blue-500 bg-blue-500'
                        : isDarkMode
                          ? 'border-gray-500'
                          : 'border-gray-300'
                    }`}>
                      {formData.saleType === 'licitatii-insolventa' && (
                        <div className="w-2.5 h-2.5 rounded-full bg-white"></div>
                      )}
                    </div>
                  </label>

                  <label className={`relative flex items-start gap-3 p-4 rounded-xl border-2 cursor-pointer transition-all ${
                    formData.saleType === 'licitatii-executori'
                      ? isDarkMode 
                        ? 'border-green-500 bg-green-900/20' 
                        : 'border-green-500 bg-green-50'
                      : isDarkMode
                        ? 'border-gray-600 bg-gray-800/30 hover:border-gray-500'
                        : 'border-gray-300 bg-white hover:border-gray-400'
                  }`}>
                    <input
                      type="radio"
                      name="saleType"
                      value="licitatii-executori"
                      checked={formData.saleType === 'licitatii-executori'}
                      onChange={handleInputChange}
                      className="sr-only"
                      required
                    />
                    <div className={`flex-1 ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                      <div className="flex items-center gap-2 mb-2">
                        <i className="ri-checkbox-circle-line text-xl text-green-500"></i>
                        <h4 className="font-semibold">Licitații executori</h4>
                      </div>
                      <p className={`text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                        Dosare gestionate de executori judecătorești, cu condiții standardizate și proces transparent.
                      </p>
                    </div>
                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                      formData.saleType === 'licitatii-executori'
                        ? 'border-green-500 bg-green-500'
                        : isDarkMode
                          ? 'border-gray-500'
                          : 'border-gray-300'
                    }`}>
                      {formData.saleType === 'licitatii-executori' && (
                        <div className="w-2.5 h-2.5 rounded-full bg-white"></div>
                      )}
                    </div>
                  </label>

                  <label className={`relative flex items-start gap-3 p-4 rounded-xl border-2 cursor-pointer transition-all ${
                    formData.saleType === 'alte-licitatii'
                      ? isDarkMode 
                        ? 'border-blue-500 bg-blue-900/20' 
                        : 'border-blue-500 bg-blue-50'
                      : isDarkMode
                        ? 'border-gray-600 bg-gray-800/30 hover:border-gray-500'
                        : 'border-gray-300 bg-white hover:border-gray-400'
                  }`}>
                    <input
                      type="radio"
                      name="saleType"
                      value="alte-licitatii"
                      checked={formData.saleType === 'alte-licitatii'}
                      onChange={handleInputChange}
                      className="sr-only"
                      required
                    />
                    <div className={`flex-1 ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                      <div className="flex items-center gap-2 mb-2">
                        <i className="ri-flashlight-line text-xl text-blue-500"></i>
                        <h4 className="font-semibold">Alte licitații</h4>
                      </div>
                      <p className={`text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                        Proceduri publice diverse (instituții locale, private sau mixte) cu reguli flexibile.
                      </p>
                    </div>
                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                      formData.saleType === 'alte-licitatii'
                        ? 'border-blue-500 bg-blue-500'
                        : isDarkMode
                          ? 'border-gray-500'
                          : 'border-gray-300'
                    }`}>
                      {formData.saleType === 'alte-licitatii' && (
                        <div className="w-2.5 h-2.5 rounded-full bg-white"></div>
                      )}
                    </div>
                  </label>
                </div>
              </div>

              {/* Informații de Bază cu GoBid AI */}
              <div className={`rounded-lg border p-4 sm:p-6 ${
                isDarkMode ? 'border-gray-700 bg-gray-800/50' : 'border-gray-200 bg-gray-50'
              }`}>
                <div className="flex items-center justify-between mb-4">
                  <h3 className={`text-base font-semibold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                    Informații de Bază
                  </h3>
                  <button
                    type="button"
                    onClick={handleAutoEnhance}
                    disabled={isEnhancing || !formData.title.trim() || !formData.description.trim()}
                    className={`px-4 py-2 rounded-lg transition-all flex items-center gap-2 text-sm font-medium shadow-lg ${
                      isEnhancing || !formData.title.trim() || !formData.description.trim()
                        ? 'bg-gray-400 cursor-not-allowed text-white'
                        : 'bg-gradient-to-r from-blue-600 to-blue-600 hover:from-blue-700 hover:to-blue-700 text-white'
                    }`}
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

                <div className={`p-4 rounded-lg border ${
                  isDarkMode ? 'bg-gradient-to-r from-blue-900/20 to-blue-900/20 border-blue-800' : 'bg-gradient-to-r from-blue-50 to-blue-50 border-blue-200'
                }`}>
                  <label className="flex items-center gap-2 cursor-pointer mb-3">
                    <input
                      type="checkbox"
                      checked={autoEnhance}
                      onChange={(e) => setAutoEnhance(e.target.checked)}
                      className={`w-5 h-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500 ${
                        isDarkMode ? 'border-gray-600' : ''
                      }`}
                    />
                    <div className="flex-1">
                      <span className={`text-sm font-semibold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                        GoBid AI rescrie titlul, descrierea și meta SEO
                      </span>
                      <p className={`text-xs mt-0.5 ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                        Bifează dacă vrei ca la salvare GoBid AI să rescrie titlul, descrierea și meta SEO (altfel rămân textele tale).
                      </p>
                    </div>
                  </label>
                  {autoEnhance && (
                    <div className={`ml-7 mt-3 space-y-2 border-t pt-3 ${
                      isDarkMode ? 'border-blue-700' : 'border-blue-200'
                    }`}>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={rewriteTitle}
                          onChange={(e) => setRewriteTitle(e.target.checked)}
                          className={`w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 ${
                            isDarkMode ? 'border-gray-600' : ''
                          }`}
                        />
                        <span className={`text-sm ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                          GoBid AI rescrie titlul
                        </span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={rewriteDescription}
                          onChange={(e) => setRewriteDescription(e.target.checked)}
                          className={`w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 ${
                            isDarkMode ? 'border-gray-600' : ''
                          }`}
                        />
                        <span className={`text-sm ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                          GoBid AI rescrie descrierea
                        </span>
                      </label>
                      <p className={`text-xs pl-6 ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                        SEO meta (opțional) este completat automat de GoBid AI dacă alegi butonul de generare.
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Basic Information */}
              <div className={`rounded-lg border p-4 sm:p-6 ${
                isDarkMode ? 'border-gray-700 bg-gray-800/50' : 'border-gray-200 bg-gray-50'
              }`}>
                <h3 className={`text-base font-semibold mb-4 ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                  Informații de Bază
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="md:col-span-2">
                    <label className={`block text-sm font-medium mb-2 ${
                      isDarkMode ? 'text-gray-300' : 'text-gray-700'
                    }`}>
                      Titlu *
                    </label>
                    <input
                      type="text"
                      name="title"
                      value={formData.title}
                      onChange={handleInputChange}
                      className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                        isDarkMode ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300 text-gray-900'
                      }`}
                      required
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className={`block text-sm font-medium mb-2 ${
                      isDarkMode ? 'text-gray-300' : 'text-gray-700'
                    }`}>
                      Descriere *
                    </label>
                    <textarea
                      name="description"
                      value={formData.description}
                      onChange={handleInputChange}
                      rows={4}
                      className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                        isDarkMode ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300 text-gray-900'
                      }`}
                      required
                    />
                  </div>

                  <div>
                    <label className={`block text-sm font-medium mb-2 ${
                      isDarkMode ? 'text-gray-300' : 'text-gray-700'
                    }`}>
                      Categorie *
                    </label>
                    <select
                      name="category"
                      value={formData.category}
                      onChange={handleInputChange}
                      className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                        isDarkMode ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300 text-gray-900'
                      }`}
                      required
                    >
                      <option value="">Selectează categoria</option>
                      {categories.map(cat => (
                        <option key={cat} value={cat}>{cat}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className={`block text-sm font-medium mb-2 ${
                      isDarkMode ? 'text-gray-300' : 'text-gray-700'
                    }`}>
                      Subcategorie *
                    </label>
                    <select
                      name="subcategory"
                      value={formData.subcategory}
                      onChange={(e) => {
                        handleInputChange(e);
                        setFormData(prev => ({ ...prev, categoryLevel3: '', size: '', brand: '', color: '', condition: 'Nou' }));
                      }}
                      className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                        isDarkMode ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300 text-gray-900'
                      }`}
                      required
                      disabled={!formData.category}
                    >
                      <option value="">Selectează subcategoria</option>
                      {formData.category && subcategories[formData.category]?.map(sub => (
                        <option key={sub} value={sub}>
                          {formData.category === 'Executări' 
                            ? ({ 'exec-imobiliare': 'Imobiliare', 'exec-autovehicule': 'Autovehicule', 'exec-industrial': 'Industrial', 'exec-afaceri': 'Afaceri', 'exec-office': 'Office', 'exec-altele': 'Altele' } as Record<string, string>)[sub] ?? sub
                            : sub}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Atribute dinamice: Mărime, Marca, Culoare, Stare */}
                  {formData.subcategory && (() => {
                    const attrs = getAttributesForSubcategory(formData.subcategory);
                    const sizeOpts = getSizeOptionsForSubcategory(formData.subcategory);
                    const brandOpts = getBrandOptionsForSubcategory(formData.subcategory);
                    const hasAny = sizeOpts.length > 0 || brandOpts.length > 0 || attrs.color || attrs.condition;
                    if (!hasAny) return null;
                    return (
                      <>
                        {sizeOpts.length > 0 && (
                          <div>
                            <label className={`block text-sm font-medium mb-2 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>Mărime</label>
                            <select name="size" value={formData.size} onChange={handleInputChange}
                              className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${isDarkMode ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300 text-gray-900'}`}>
                              <option value="">Selectează (opțional)</option>
                              {sizeOpts.map((s) => <option key={s} value={s}>{s}</option>)}
                            </select>
                          </div>
                        )}
                        {brandOpts.length > 0 && (
                          <div>
                            <label className={`block text-sm font-medium mb-2 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>Marca</label>
                            <select name="brand" value={formData.brand} onChange={handleInputChange}
                              className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${isDarkMode ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300 text-gray-900'}`}>
                              <option value="">Selectează (opțional)</option>
                              {brandOpts.map((b) => <option key={b} value={b}>{b}</option>)}
                            </select>
                          </div>
                        )}
                        {attrs.color && (
                          <div>
                            <label className={`block text-sm font-medium mb-2 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>Culoare</label>
                            <select name="color" value={formData.color} onChange={handleInputChange}
                              className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${isDarkMode ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300 text-gray-900'}`}>
                              <option value="">Selectează (opțional)</option>
                              {COLOR_OPTIONS.map((c) => <option key={c} value={c}>{c}</option>)}
                            </select>
                          </div>
                        )}
                        {attrs.condition && (
                          <div>
                            <label className={`block text-sm font-medium mb-2 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>Stare <span className="text-red-500">*</span></label>
                            <select
                              name="condition"
                              required
                              value={formData.condition === 'Second hand' ? 'Second hand' : 'Nou'}
                              onChange={handleInputChange}
                              className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${isDarkMode ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300 text-gray-900'}`}
                            >
                              <option value="Nou">Nou</option>
                              <option value="Second hand">Second hand</option>
                            </select>
                          </div>
                        )}
                      </>
                    );
                  })()}

                  {/* Câmpuri specifice imobiliare (număr camere, suprafață, etaj etc.) – aliniate cu filtrele /ro */}
                  {((formData.category === 'Imobiliare' && formData.subcategory) || (formData.category === 'Executări' && formData.subcategory === 'exec-imobiliare')) && (() => {
                    const imobFields = getImobiliareFieldsForSubcategory(formData.subcategory);
                    if (imobFields.length === 0) return null;
                    return (
                      <div className={`rounded-lg border p-4 ${isDarkMode ? 'border-gray-700 bg-gray-800/50' : 'border-gray-200 bg-gray-50'}`}>
                        <h3 className={`text-sm font-semibold mb-3 ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>Detalii imobiliare</h3>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          {imobFields.map((f) => (
                            <div key={f.key}>
                              <label className={`block text-xs font-medium mb-1 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>{f.label}</label>
                              {f.type === 'select' ? (
                                <select
                                  value={formData.customFields?.[f.key] ?? ''}
                                  onChange={(e) => setFormData(prev => ({
                                    ...prev,
                                    customFields: { ...prev.customFields, [f.key]: e.target.value }
                                  }))}
                                  className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${isDarkMode ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300 text-gray-900'}`}
                                >
                                  <option value="">Selectează</option>
                                  {(f.options ?? []).map((o) => <option key={o} value={o}>{o}</option>)}
                                </select>
                              ) : (
                                <input
                                  type={f.type}
                                  value={formData.customFields?.[f.key] ?? ''}
                                  onChange={(e) => setFormData(prev => ({
                                    ...prev,
                                    customFields: { ...prev.customFields, [f.key]: e.target.value }
                                  }))}
                                  placeholder={f.placeholder}
                                  min={f.min}
                                  max={f.max}
                                  step={f.step}
                                  className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${isDarkMode ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300 text-gray-900'}`}
                                />
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })()}

                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className={`block text-sm font-medium ${
                        isDarkMode ? 'text-gray-300' : 'text-gray-700'
                      }`}>
                        SKU *
                      </label>
                      <div className="flex items-center gap-2">
                        {formData.sku && (
                          <button
                            type="button"
                            onClick={() => setSkuEditable(!skuEditable)}
                            className={`text-xs font-semibold ${isDarkMode ? 'text-gray-400' : 'text-gray-600'} hover:underline`}
                          >
                            <i className="ri-edit-2-line mr-1"></i>
                            {skuEditable ? 'Blochează' : 'Editează SKU'}
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => {
                            if (formData.subcategory) {
                              const newSku = generateSku(formData.subcategory, existingSkus);
                              if (newSku) {
                                setFormData(prev => ({ ...prev, sku: newSku }));
                                setSkuEditable(false);
                              }
                            }
                          }}
                          disabled={!formData.subcategory}
                          className={`text-xs font-semibold text-blue-600 hover:text-blue-700 disabled:opacity-50 disabled:cursor-not-allowed ${
                            isDarkMode ? 'text-blue-400' : ''
                          }`}
                        >
                          <i className="ri-refresh-line mr-1"></i>
                          Generează automat
                        </button>
                      </div>
                    </div>
                    <input
                      type="text"
                      name="sku"
                      value={formData.sku}
                      onChange={(e) => {
                        const sanitized = sanitizeSkuInput(e.target.value);
                        setFormData(prev => ({ ...prev, sku: sanitized }));
                      }}
                      maxLength={SKU_TOTAL_LENGTH}
                      readOnly={!skuEditable}
                      className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 uppercase tracking-wider ${
                        skuEditable
                          ? `border-blue-500 focus:ring-blue-500 ${isDarkMode ? 'bg-gray-700 text-white' : 'bg-white text-gray-900'}`
                          : `border-gray-300 focus:ring-blue-200 cursor-not-allowed ${isDarkMode ? 'bg-gray-800 text-gray-400' : 'bg-gray-50 text-gray-500'}`
                      }`}
                      placeholder="APAR176DH2"
                      required
                    />
                    <p className={`text-xs mt-1 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                      Codul este generat automat din subcategorie; nu este nevoie să-l modifici manual. Folosește "Editează SKU" doar dacă ai un motiv bine justificat.
                    </p>
                  </div>

                </div>
              </div>

              {/* Pricing */}
              <div className={`rounded-lg border p-4 sm:p-6 ${
                isDarkMode ? 'border-gray-700 bg-gray-800/50' : 'border-gray-200 bg-gray-50'
              }`}>
                <h3 className={`text-base font-semibold mb-4 ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                  Preț de Pornire *
                </h3>
                <p className={`text-xs mb-4 ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                  Introdu valoarea în moneda preferată; conversia în cealaltă monedă se calculează automat folosind cursul live.
                </p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                  <div>
                    <label className={`block text-xs font-semibold uppercase tracking-wide mb-1 ${
                      isDarkMode ? 'text-gray-400' : 'text-gray-600'
                    }`}>
                      VALOARE ÎN Lei
                    </label>
                    <input
                      type="number"
                      value={priceRon || ''}
                      onChange={handlePriceRonChange}
                      min="0"
                      step="0.01"
                      className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                        isDarkMode ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300 text-gray-900'
                      }`}
                    />
                  </div>

                  <div>
                    <label className={`block text-xs font-semibold uppercase tracking-wide mb-1 ${
                      isDarkMode ? 'text-gray-400' : 'text-gray-600'
                    }`}>
                      VALOARE ÎN EUR
                    </label>
                    <input
                      type="number"
                      value={priceEur || ''}
                      onChange={handlePriceEurChange}
                      min="0"
                      step="0.01"
                      className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                        isDarkMode ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300 text-gray-900'
                      }`}
                    />
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-3 text-xs mb-4">
                  <span className={isDarkMode ? 'text-gray-400' : 'text-gray-600'}>
                    1 EUR ≈ {getEffectiveRate() ? getEffectiveRate()!.toFixed(4) : '—'} Lei
                  </span>
                  <span className={isDarkMode ? 'text-gray-400' : 'text-gray-600'}>
                    1 Lei ≈ {getEffectiveRate() ? roundTo(1 / getEffectiveRate()!, 4).toFixed(4) : '—'} EUR
                  </span>
                  <button
                    type="button"
                    onClick={fetchExchangeRate}
                    disabled={isFetchingRate}
                    className={`px-3 py-1 rounded-full border font-semibold transition ${
                      isFetchingRate
                        ? 'cursor-wait border-blue-300 text-blue-400'
                        : 'border-blue-500 text-blue-600 hover:bg-blue-50 dark:border-blue-400 dark:text-blue-300 dark:hover:bg-blue-600/20'
                    }`}
                  >
                    {isFetchingRate ? 'Actualizare...' : 'Actualizează cursul'}
                  </button>
                  {lastRateUpdate && (
                    <span className={isDarkMode ? 'text-gray-400' : 'text-gray-600'}>
                      Ultima actualizare: {lastRateUpdate.toLocaleString('ro-RO', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                    </span>
                  )}
                </div>

                {/* Discounts */}
                <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <div>
                    <label className={`block text-xs font-semibold uppercase tracking-wide mb-1 ${
                      isDarkMode ? 'text-gray-400' : 'text-gray-600'
                    }`}>
                      REDUCERE (%)
                    </label>
                    <input
                      type="number"
                      inputMode="decimal"
                      value={discountPercent ?? ''}
                      onChange={handleDiscountPercentChange}
                      min="0"
                      max="100"
                      step="0.01"
                      disabled={priceRon <= 0}
                      placeholder="Ex: 10"
                      className={`w-full px-3 py-2 border rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                        priceRon <= 0
                          ? isDarkMode ? 'cursor-not-allowed border-dashed border-gray-600 bg-gray-800 text-gray-500' : 'cursor-not-allowed border-dashed border-gray-300 bg-gray-100 text-gray-400'
                          : isDarkMode ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300 text-gray-900'
                      }`}
                    />
                  </div>
                  <div>
                    <label className={`block text-xs font-semibold uppercase tracking-wide mb-1 ${
                      isDarkMode ? 'text-gray-400' : 'text-gray-600'
                    }`}>
                      REDUCERE (Lei)
                    </label>
                    <input
                      type="number"
                      inputMode="decimal"
                      value={discountValueRon ?? ''}
                      onChange={handleDiscountValueChange}
                      min="0"
                      step="0.01"
                      disabled={priceRon <= 0}
                      placeholder="Ex: 20"
                      className={`w-full px-3 py-2 border rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                        priceRon <= 0
                          ? isDarkMode ? 'cursor-not-allowed border-dashed border-gray-600 bg-gray-800 text-gray-500' : 'cursor-not-allowed border-dashed border-gray-300 bg-gray-100 text-gray-400'
                          : isDarkMode ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300 text-gray-900'
                      }`}
                    />
                  </div>
                  <div>
                    <label className={`block text-xs font-semibold uppercase tracking-wide mb-1 ${
                      isDarkMode ? 'text-gray-400' : 'text-gray-600'
                    }`}>
                      PREȚ REDUS (Lei)
                    </label>
                    <input
                      type="number"
                      inputMode="decimal"
                      value={discountedPriceRon ?? ''}
                      onChange={handleDiscountFinalPriceChange}
                      min="0"
                      step="0.01"
                      disabled={priceRon <= 0}
                      placeholder={priceRon > 0 ? priceRon.toFixed(2) : '0.00'}
                      className={`w-full px-3 py-2 border rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                        priceRon <= 0
                          ? isDarkMode ? 'cursor-not-allowed border-dashed border-gray-600 bg-gray-800 text-gray-500' : 'cursor-not-allowed border-dashed border-gray-300 bg-gray-100 text-gray-400'
                          : isDarkMode ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300 text-gray-900'
                      }`}
                    />
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className={`block text-xs font-semibold uppercase tracking-wide mb-1 ${
                      isDarkMode ? 'text-gray-400' : 'text-gray-600'
                    }`}>
                      REDUCERE (EUR)
                    </label>
                    <input
                      type="number"
                      inputMode="decimal"
                      value={discountValueEur ?? ''}
                      onChange={handleDiscountValueEurChange}
                      min="0"
                      step="0.01"
                      disabled={priceRon <= 0}
                      placeholder="Ex: 5"
                      className={`w-full px-3 py-2 border rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                        priceRon <= 0
                          ? isDarkMode ? 'cursor-not-allowed border-dashed border-gray-600 bg-gray-800 text-gray-500' : 'cursor-not-allowed border-dashed border-gray-300 bg-gray-100 text-gray-400'
                          : isDarkMode ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300 text-gray-900'
                      }`}
                    />
                  </div>
                  <div>
                    <label className={`block text-xs font-semibold uppercase tracking-wide mb-1 ${
                      isDarkMode ? 'text-gray-400' : 'text-gray-600'
                    }`}>
                      PREȚ REDUS (EUR)
                    </label>
                    <input
                      type="number"
                      inputMode="decimal"
                      value={discountedPriceEur ?? ''}
                      onChange={handleDiscountFinalPriceEurChange}
                      min="0"
                      step="0.01"
                      disabled={priceRon <= 0}
                      placeholder={priceEur > 0 ? priceEur.toFixed(2) : priceRon > 0 && getEffectiveRate() ? (priceRon / getEffectiveRate()!).toFixed(2) : '0.00'}
                      className={`w-full px-3 py-2 border rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                        priceRon <= 0
                          ? isDarkMode ? 'cursor-not-allowed border-dashed border-gray-600 bg-gray-800 text-gray-500' : 'cursor-not-allowed border-dashed border-gray-300 bg-gray-100 text-gray-400'
                          : isDarkMode ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300 text-gray-900'
                      }`}
                    />
                  </div>
                </div>

                {priceRon <= 0 && (
                  <p className={`mt-2 text-xs text-amber-500`}>
                    Setează prețul de pornire înainte de a aplica reduceri.
                  </p>
                )}

                {discountPercent !== null && discountValueRon !== null && (
                  <div className={`mt-4 rounded-lg border p-4 text-sm ${
                    isDarkMode ? 'border-white/10 bg-white/5' : 'border-gray-200 bg-white'
                  }`}>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                      <div>
                        <span className={`text-xs font-semibold uppercase tracking-wide ${
                          isDarkMode ? 'text-gray-400' : 'text-gray-500'
                        }`}>
                          REDUCERE TOTALĂ
                        </span>
                        <p className={`mt-1 font-semibold ${
                          isDarkMode ? 'text-white' : 'text-gray-900'
                        }`}>
                          {discountValueRon.toFixed(2)} Lei / {discountValueEur !== null ? discountValueEur.toFixed(2) : '0.00'} EUR
                        </p>
                      </div>
                      <div>
                        <span className={`text-xs font-semibold uppercase tracking-wide ${
                          isDarkMode ? 'text-gray-400' : 'text-gray-500'
                        }`}>
                          PREȚ INIȚIAL
                        </span>
                        <p className={`mt-1 font-semibold ${
                          isDarkMode ? 'text-white' : 'text-gray-900'
                        }`}>
                          {priceRon.toFixed(2)} Lei / {priceEur.toFixed(2)} EUR
                        </p>
                      </div>
                      <div>
                        <span className={`text-xs font-semibold uppercase tracking-wide ${
                          isDarkMode ? 'text-gray-400' : 'text-gray-500'
                        }`}>
                          PREȚ FINAL
                        </span>
                        <p className={`mt-1 font-semibold ${
                          isDarkMode ? 'text-green-400' : 'text-green-600'
                        }`}>
                          {discountedPriceRon !== null ? discountedPriceRon.toFixed(2) : '0.00'} Lei / {discountedPriceEur !== null ? discountedPriceEur.toFixed(2) : '0.00'} EUR
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Auction Details */}
              <div className={`rounded-lg border p-4 sm:p-6 ${
                isDarkMode ? 'border-gray-700 bg-gray-800/50' : 'border-gray-200 bg-gray-50'
              }`}>
                <h3 className={`text-base font-semibold mb-4 ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                  Detalii Licitație
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="md:col-span-2">
                    <label className={`block text-sm font-medium mb-2 ${
                      isDarkMode ? 'text-gray-300' : 'text-gray-700'
                    }`}>
                      Locația Licitației
                    </label>
                    <input
                      type="text"
                      name="auctionLocation"
                      value={formData.auctionLocation}
                      onChange={handleInputChange}
                      className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                        isDarkMode ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300 text-gray-900'
                      }`}
                    />
                  </div>

                  <div>
                    <label className={`block text-sm font-medium mb-2 ${
                      isDarkMode ? 'text-gray-300' : 'text-gray-700'
                    }`}>
                      Data Înregistrării Licitației
                    </label>
                    <ModernDatePicker
                      value={formData.auctionRegistrationDate}
                      onChange={(date) => setFormData(prev => ({ ...prev, auctionRegistrationDate: date }))}
                      isDarkMode={isDarkMode}
                      placeholder="Selectează data înregistrării"
                    />
                    <label className="flex items-center gap-2 mt-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={officialRegistration}
                        onChange={(e) => setOfficialRegistration(e.target.checked)}
                        className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                      <span className={`text-sm ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                        Marchează înscrierea oficială în registrul licitațiilor publice
                      </span>
                    </label>
                  </div>

                  <div>
                    <label className={`block text-sm font-medium mb-2 ${
                      isDarkMode ? 'text-gray-300' : 'text-gray-700'
                    }`}>
                      Data Licitației
                    </label>
                    <ModernDatePicker
                      value={formData.auctionDate}
                      onChange={(date) => setFormData(prev => ({ ...prev, auctionDate: date }))}
                      isDarkMode={isDarkMode}
                      placeholder="Selectează data licitației"
                    />
                  </div>

                  <div>
                    <label className={`block text-sm font-medium mb-2 ${
                      isDarkMode ? 'text-gray-300' : 'text-gray-700'
                    }`}>
                      Ora Licitației
                    </label>
                    <p className={`text-xs mb-2 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                      Format: 21:22 sau 09:30. Stabilește momentul de start al licitației.
                    </p>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        name="auctionTime"
                        value={formData.auctionTime}
                        onChange={handleInputChange}
                        placeholder="21:22"
                        className={`flex-1 px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                          isDarkMode ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300 text-gray-900'
                        }`}
                      />
                      <i className="ri-time-line text-xl text-gray-400"></i>
                    </div>
                  </div>
                </div>
              </div>

              {/* Location */}
              <div className={`rounded-lg border p-4 sm:p-6 ${
                isDarkMode ? 'border-gray-700 bg-gray-800/50' : 'border-gray-200 bg-gray-50'
              }`}>
                <h3 className={`text-base font-semibold mb-4 ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                  Locație Produs
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className={`block text-sm font-medium mb-2 ${
                      isDarkMode ? 'text-gray-300' : 'text-gray-700'
                    }`}>
                      Județ
                    </label>
                    <select
                      name="county"
                      value={formData.county}
                      onChange={handleInputChange}
                      className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                        isDarkMode ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300 text-gray-900'
                      }`}
                    >
                      <option value="">Selectează județul</option>
                      {counties.map(county => (
                        <option key={county} value={county}>{county}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className={`block text-sm font-medium mb-2 ${
                      isDarkMode ? 'text-gray-300' : 'text-gray-700'
                    }`}>
                      Oraș
                    </label>
                    <input
                      type="text"
                      name="city"
                      value={formData.city}
                      onChange={handleInputChange}
                      className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                        isDarkMode ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300 text-gray-900'
                      }`}
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className={`block text-sm font-medium mb-2 ${
                      isDarkMode ? 'text-gray-300' : 'text-gray-700'
                    }`}>
                      Adresă
                    </label>
                    <input
                      type="text"
                      name="address"
                      value={formData.address}
                      onChange={handleInputChange}
                      className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                        isDarkMode ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300 text-gray-900'
                      }`}
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className={`block text-sm font-medium mb-2 ${
                      isDarkMode ? 'text-gray-300' : 'text-gray-700'
                    }`}>
                      Locația Produsului (detalii suplimentare)
                    </label>
                    <input
                      type="text"
                      name="productLocation"
                      value={formData.productLocation}
                      onChange={handleInputChange}
                      className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                        isDarkMode ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300 text-gray-900'
                      }`}
                      placeholder="Ex: Depozit central, Etaj 2, etc."
                    />
                  </div>
                </div>
              </div>

              {/* Images */}
              <div className={`rounded-lg border p-4 sm:p-6 ${
                isDarkMode ? 'border-gray-700 bg-gray-800/50' : 'border-gray-200 bg-gray-50'
              }`}>
                <h3 className={`text-base font-semibold mb-4 ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                  Imagini
                </h3>

                <div className={`border-2 border-dashed rounded-lg p-6 text-center transition-all ${
                  formData.images.length >= MAX_IMAGES
                    ? 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 opacity-60'
                    : 'border-gray-300 dark:border-gray-600 hover:border-blue-400 dark:hover:border-blue-500'
                }`}>
                  <input
                    type="file"
                    id="image-upload"
                    multiple
                    accept="image/*,.zip"
                    onChange={handleFileUpload}
                    disabled={formData.images.length >= MAX_IMAGES}
                    className="hidden"
                  />
                  <label htmlFor="image-upload" className={`flex flex-col items-center ${
                    formData.images.length >= MAX_IMAGES ? 'cursor-not-allowed' : 'cursor-pointer'
                  }`}>
                    <i className={`ri-upload-cloud-2-line text-4xl mb-2 ${
                      formData.images.length >= MAX_IMAGES ? 'text-gray-300 dark:text-gray-600' : 'text-gray-400 dark:text-gray-500'
                    }`}></i>
                    <p className={`mb-2 ${
                      formData.images.length >= MAX_IMAGES
                        ? 'text-gray-400 dark:text-gray-600'
                        : isDarkMode ? 'text-gray-400' : 'text-gray-600'
                    }`}>
                      {formData.images.length >= MAX_IMAGES
                        ? 'Limita de 50 imagini atinsă'
                        : 'Trage fișierele aici sau click pentru a selecta'}
                    </p>
                    <p className={`text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                      Suportă imagini (JPG, PNG, GIF) și fișiere .zip (max 10MB per fișier)
                    </p>
                    <div className="mt-2 space-y-1">
                      <p className={`text-xs font-semibold ${
                        formData.images.length >= MAX_IMAGES
                          ? 'text-red-500 dark:text-red-400'
                          : formData.images.length >= 40
                          ? 'text-yellow-600 dark:text-yellow-400'
                          : isDarkMode ? 'text-gray-500' : 'text-gray-400'
                      }`}>
                        {formData.images.length}/{MAX_IMAGES} imagini
                      </p>
                    </div>
                  </label>
                </div>

                {formData.images.length > 0 && (
                  <div className="mt-4">
                    <p
                      className={`mb-2 text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}
                    >
                      Prima imagine este coperta. Trage pozele sau folosește săgețile pentru ordine.
                    </p>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {formData.images.map((image, index) => (
                      <div
                        key={index}
                        {...getExecutorImageTargetProps(index)}
                        className={`relative ${
                          executorImageDragOverIndex === index
                            ? isDarkMode
                              ? 'rounded-lg ring-2 ring-amber-400/90'
                              : 'rounded-lg ring-2 ring-blue-500'
                            : ''
                        }`}
                      >
                        <div
                          {...getExecutorImageHandleProps(index)}
                          className={`absolute left-0 top-1/2 z-[4] flex h-10 w-6 -translate-y-1/2 cursor-grab items-center justify-center rounded-r active:cursor-grabbing ${
                            isDarkMode ? 'bg-black/40 text-zinc-100' : 'bg-black/35 text-white'
                          }`}
                          title="Trage pentru a muta poziția"
                        >
                          <i className="ri-draggable text-base opacity-95" aria-hidden />
                        </div>
                        <div className={`aspect-square rounded-lg overflow-hidden ${
                          isDarkMode ? 'bg-gray-700' : 'bg-gray-100'
                        }`}>
                          <img
                            src={typeof image === 'string' ? image : URL.createObjectURL(image as File)}
                            alt={`Preview ${index + 1}`}
                            className="w-full h-full object-cover"
                          />
                        </div>
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
                            handleRemoveImage(index);
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

              {/* Documents */}
              <div className={`rounded-lg border p-4 sm:p-6 ${
                isDarkMode ? 'border-gray-700 bg-gray-800/50' : 'border-gray-200 bg-gray-50'
              }`}>
                <div className="flex items-center justify-between mb-2">
                  <h3 className={`text-base font-semibold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                    Documente licitație (PDF) - opțional
                  </h3>
                  <span className={`text-xs font-semibold ${
                    formData.documents.length >= MAX_DOCUMENTS
                      ? 'text-red-500 dark:text-red-400'
                      : isDarkMode ? 'text-gray-400' : 'text-gray-500'
                  }`}>
                    {formData.documents.length}/{MAX_DOCUMENTS} PDF
                  </span>
                </div>
                <p className={`text-xs mb-4 ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                  Încarcă, dacă dorești, documentele oficiale în format PDF pentru a le oferi clienților mai mult context despre licitație.
                </p>

                <div className={`border-2 border-dashed rounded-lg p-6 text-center transition-all ${
                  formData.documents.length >= MAX_DOCUMENTS
                    ? 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 opacity-60'
                    : 'border-gray-300 dark:border-gray-600 hover:border-red-400 dark:hover:border-red-500'
                }`}>
                  <input
                    type="file"
                    id="document-upload"
                    multiple
                    accept=".pdf"
                    onChange={handleDocumentUpload}
                    disabled={formData.documents.length >= MAX_DOCUMENTS}
                    className="hidden"
                  />
                  <label htmlFor="document-upload" className={`flex flex-col items-center ${
                    formData.documents.length >= MAX_DOCUMENTS ? 'cursor-not-allowed' : 'cursor-pointer'
                  }`}>
                    <i className={`ri-file-pdf-line text-4xl mb-2 ${
                      formData.documents.length >= MAX_DOCUMENTS
                        ? 'text-gray-300 dark:text-gray-600'
                        : 'text-red-500 dark:text-red-400'
                    }`}></i>
                    <p className={`mb-2 ${
                      formData.documents.length >= MAX_DOCUMENTS
                        ? 'text-gray-400 dark:text-gray-600'
                        : isDarkMode ? 'text-gray-400' : 'text-gray-600'
                    }`}>
                      {formData.documents.length >= MAX_DOCUMENTS
                        ? 'Limita de 5 documente atinsă'
                        : 'Selectează sau trage fișiere PDF aici'}
                    </p>
                    <p className={`text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                      Dimensiune maxim {MAX_DOCUMENT_SIZE_MB}MB per fișier. Mai poți adăuga {Math.max(MAX_DOCUMENTS - formData.documents.length, 0)} documente
                    </p>
                    <p className={`text-xs mt-2 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                      Documentele PDF nu sunt obligatorii, însă pot îmbunătăți încrederea cumpărătorilor și claritatea anunțului.
                    </p>
                  </label>
                </div>

                {formData.documents.length > 0 && (
                  <div className="mt-4 space-y-2">
                    {formData.documents.map((doc, index) => (
                      <div key={index} className={`flex items-center justify-between p-3 rounded-lg ${
                        isDarkMode ? 'bg-gray-700' : 'bg-gray-100'
                      }`}>
                        <div className="flex items-center gap-2">
                          <i className="ri-file-text-line text-blue-500"></i>
                          <span className={`text-sm ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                            {doc.name}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleRemoveDocument(index)}
                          className="text-red-500 hover:text-red-600"
                        >
                          <i className="ri-close-line"></i>
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* SEO cu GoBid AI */}
              <div className={`rounded-lg border p-4 sm:p-6 ${
                isDarkMode ? 'border-gray-700 bg-gray-800/50' : 'border-gray-200 bg-gray-50'
              }`}>
                <div className="flex items-center justify-between mb-2">
                  <h3 className={`text-base font-semibold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                    SEO cu GoBid AI
                  </h3>
                  <button
                    type="button"
                    onClick={handleGenerateSEO}
                    disabled={isGeneratingSEO || !formData.title?.trim() || !formData.description?.trim()}
                    className={`px-4 py-2 rounded-lg transition-all flex items-center gap-2 text-sm font-medium ${
                      isGeneratingSEO || !formData.title?.trim() || !formData.description?.trim()
                        ? 'bg-gray-400 cursor-not-allowed text-white'
                        : 'bg-gradient-to-r from-blue-600 to-blue-600 hover:from-blue-700 hover:to-blue-700 text-white'
                    }`}
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
                <p className={`text-xs mb-4 ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                  GoBid AI completează automat câmpurile SEO la salvare; poți ajusta manual oricând sau folosi butonul pentru o nouă sugestie.
                </p>

                <div className="space-y-4">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className={`block text-sm font-medium ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                        Titlu SEO
                      </label>
                      <span className={`text-xs ${
                        (seo.title?.length || 0) > 65 ? 'text-red-500' : (seo.title?.length || 0) > 60 ? 'text-yellow-500' : (isDarkMode ? 'text-gray-400' : 'text-gray-500')
                      }`}>
                        {(seo.title?.length || 0)}/65
                      </span>
                    </div>
                    <input
                      type="text"
                      value={seo.title}
                      onChange={(e) => setSeo(prev => ({ ...prev, title: e.target.value }))}
                      maxLength={65}
                      className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 ${
                        isDarkMode ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300 text-gray-900'
                      } ${
                        (seo.title?.length || 0) > 65 ? 'border-red-500 focus:ring-red-500' : (seo.title?.length || 0) > 60 ? 'border-yellow-500 focus:ring-yellow-500' : 'focus:ring-blue-500'
                      }`}
                      placeholder="Titlu pentru motoarele de căutare (max 65 caractere)"
                    />
                    <p className={`text-xs mt-1 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                      Recomandat: 50-60 caractere pentru rezultate optime
                    </p>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className={`block text-sm font-medium ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                        Descriere SEO
                      </label>
                      <span className={`text-xs ${
                        (seo.description?.length || 0) > 160 ? 'text-red-500' : (seo.description?.length || 0) > 155 ? 'text-yellow-500' : (isDarkMode ? 'text-gray-400' : 'text-gray-500')
                      }`}>
                        {(seo.description?.length || 0)}/160
                      </span>
                    </div>
                    <textarea
                      value={seo.description}
                      onChange={(e) => setSeo(prev => ({ ...prev, description: e.target.value }))}
                      rows={3}
                      maxLength={160}
                      className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 ${
                        isDarkMode ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300 text-gray-900'
                      } ${
                        (seo.description?.length || 0) > 160 ? 'border-red-500 focus:ring-red-500' : (seo.description?.length || 0) > 155 ? 'border-yellow-500 focus:ring-yellow-500' : 'focus:ring-blue-500'
                      }`}
                      placeholder="Descriere pentru motoarele de căutare (max 160 caractere)"
                    />
                    <p className={`text-xs mt-1 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                      Recomandat: 150-160 caractere pentru rezultate optime
                    </p>
                  </div>

                  <div>
                    <label className={`block text-sm font-medium mb-2 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                      Cuvinte Cheie (separate prin virgulă)
                    </label>
                    <input
                      type="text"
                      value={seo.keywords.join(', ')}
                      onChange={(e) => setSeo(prev => ({ ...prev, keywords: e.target.value.split(',').map((k: string) => k.trim()).filter(k => k) }))}
                      className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                        isDarkMode ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300 text-gray-900'
                      }`}
                      placeholder="cuvant1, cuvant2, cuvant3"
                    />
                    <p className={`text-xs mt-1 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                      GoBid AI propune automat cuvinte cheie relevante; editează lista dacă vrei termeni personalizați.
                    </p>
                  </div>
                </div>
              </div>

              {/* Submit */}
              <div className="flex justify-end gap-4">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className={`px-6 py-2 rounded-lg font-medium transition-colors ${
                    isDarkMode
                      ? 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                      : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                  }`}
                >
                  Anulează
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className={`px-6 py-2 rounded-lg font-medium transition-colors ${
                    isSubmitting
                      ? 'bg-gray-400 cursor-not-allowed'
                      : isDarkMode
                      ? 'bg-blue-600 hover:bg-blue-700 text-white'
                      : 'bg-blue-500 hover:bg-blue-600 text-white'
                  }`}
                >
                  {isSubmitting ? 'Se salvează...' : 'Salvează Licitația'}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ManualAddModalExecutor;
