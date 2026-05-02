"use client";

import { dashboardApiFetch } from "@/lib/dashboard-api-fetch";
import { uploadImageFile } from "@/lib/upload/client-image-upload";
import React, { useState, useEffect, useCallback, useRef } from "react";
import { useRouter, usePathname } from "next/navigation";
import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import UniversalHeader from "@/components/UniversalHeader";
import { BackButton } from "@/components/ui/back-button";
import DashboardFooter from "@/components/DashboardFooter";
import AuthRequiredModal from "@/components/AuthRequiredModal";
import ProductChat from "@/components/ProductChat";
import ManualAddModalExecutor from "@/components/ManualAddModalExecutor";
import { applyDarkModeToHTML, getDarkModeFromStorage, saveDarkModeToStorage } from "@/lib/darkMode";
import { getProductDisplayImage } from "@/lib/getProductDisplayImage";
import { useOblioStatus, requestOblioInvoice, buildPayloadForTransaction } from "@/lib/invoice/oblioClient";
import { submitNetopiaCertificateForm } from "@/lib/netopia-submit-certificate-form";
import PremiumPurchaseButton from "@/components/premium/PremiumPurchaseButton";
import {
  resolveAccountTypeWithUser,
  shouldRedirectAwayFromExecutorRoutes,
} from "@/lib/auth/resolveAccountType";

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
  status: 'draft' | 'active' | 'deleted';
  images: (string | { type: 'zip'; url?: string })[];
  createdAt: string;
  url?: string;
  slug?: string;
  approvalStatus?: 'pending' | 'approved' | 'rejected';
  rejectionReason?: string;
  isPremium?: boolean;
  premiumUntil?: string;
}

export default function ExecutorMyProductsPage() {
  const router = useRouter();
  const pathname = usePathname();
  const basePath = pathname?.startsWith("/dashboard/lichidator") ? "/dashboard/lichidator" : "/dashboard/executor";
  const bgEmblem = basePath?.includes("lichidator") ? "/images/logo-unpir.png" : "/executori.jpeg";
  const defaultAvatar = basePath?.includes("lichidator") ? "/images/logo-unpir.png" : "/favicon.ico";
  const [products, setProducts] = useState<Product[]>([]);
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'pending' | 'draft'>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  // Initialize dark mode from localStorage immediately to prevent flash
  // Default to white mode (false) if not set
  const [isDarkMode, setIsDarkMode] = useState(() => {
    if (typeof window !== 'undefined') {
      const darkModeValue = getDarkModeFromStorage();
      // CRITICAL: Ensure HTML element doesn't have dark class if white mode
      const htmlElement = document.documentElement;
      if (!darkModeValue) {
        htmlElement.classList.remove('dark');
      } else {
        htmlElement.classList.add('dark');
      }
      return darkModeValue;
    }
    // Default to white mode
    return false;
  });
  const [showImportModal, setShowImportModal] = useState(false);
  const [showManualAddModal, setShowManualAddModal] = useState(false);
  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  const [importType, setImportType] = useState<'file' | 'url'>('file');
  const [file, setFile] = useState<File | null>(null);
  const [url, setUrl] = useState('');
  const [isImporting, setIsImporting] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [extractedProducts, setExtractedProducts] = useState<any[]>([]);
  const [selectedProducts, setSelectedProducts] = useState<number[]>([]);
  const [isCreatingProducts, setIsCreatingProducts] = useState(false);
  const [processingProgress, setProcessingProgress] = useState<{
    status: string;
    currentStep?: string;
    progress?: number;
  } | null>(null);
  const [importMessage, setImportMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [userInfo, setUserInfo] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    avatar: '',
    supabaseUserId: null as string | null
  });
  const [showLicitatorModal, setShowLicitatorModal] = useState(false);
  const [licitatorData, setLicitatorData] = useState({
    licitatorName: '',
    licitatorAddress: '',
    licitatorFiscalCode: '',
    licitatorConsignmentAccount: '',
    licitatorEmail: '',
    licitatorPhone: '',
    licitatorFax: '',
    licitatorCompetence: '',
    licitatorAvatar: ''
  });
  const [isSavingLicitator, setIsSavingLicitator] = useState(false);
  const [licitatorMessage, setLicitatorMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [showAvatarModal, setShowAvatarModal] = useState(false);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [licitatorAvatarFile, setLicitatorAvatarFile] = useState<File | null>(null);
  const [licitatorAvatarPreview, setLicitatorAvatarPreview] = useState<string | null>(null);
  const [isUploadingLicitatorAvatar, setIsUploadingLicitatorAvatar] = useState(false);
  const progressIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const oblioStatus = useOblioStatus();
  
  // State pentru oferte și chat
  const [expandedProducts, setExpandedProducts] = useState<Record<string, boolean>>({});
  const [expandedHistory, setExpandedHistory] = useState<Record<string, boolean>>({});
  const [productBids, setProductBids] = useState<Record<string, any[]>>({});
  const [loadingBids, setLoadingBids] = useState<Record<string, boolean>>({});
  const [showChatModal, setShowChatModal] = useState(false);
  const [chatData, setChatData] = useState<{
    productId: string;
    buyerId: string;
    sellerId: string;
    otherUserInfo: { name: string; avatar?: string };
  } | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  // ============= PREMIUM PROMOTION =============
  const [showPremiumModal, setShowPremiumModal] = useState(false);
  const [selectedProductForPremium, setSelectedProductForPremium] = useState<string | null>(null);
  const [premiumWeeks, setPremiumWeeks] = useState(1);
  const [userCreditBalance, setUserCreditBalance] = useState(0);
  const [isLoadingCredit, setIsLoadingCredit] = useState(false);
  const [isProcessingPremium, setIsProcessingPremium] = useState(false);

  // ============= MANUAL FORM STATES =============
  const [manualFormData, setManualFormData] = useState({
    title: '',
    description: '',
    category: '',
    subcategory: '',
    sku: '',
    currency: 'RON' as 'RON' | 'EUR',
    productType: 'live-bid' as 'live-bid',
    buyNowEnabled: false,
    buyNowPriceRON: null as number | null,
    buyNowPriceEUR: null as number | null,
    county: '',
    city: '',
    address: '',
    images: [] as (string | File | { name: string; size: number; type: string; file: File })[],
    customFields: {} as Record<string, any>,
    status: 'active' as 'draft' | 'active',
  });
  const [manualFormPriceRon, setManualFormPriceRon] = useState<number>(0);
  const [manualFormPriceEur, setManualFormPriceEur] = useState<number>(0);
  const [manualFormExchangeRate, setManualFormExchangeRate] = useState<number | null>(null);
  const [manualFormIsSubmitting, setManualFormIsSubmitting] = useState(false);
  const [manualFormMessage, setManualFormMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
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
  const [manualFormDiscountedPriceRon, setManualFormDiscountedPriceRon] = useState<number | null>(null);
  const [manualFormDiscountValueEur, setManualFormDiscountValueEur] = useState<number | null>(null);
  const [manualFormDiscountedPriceEur, setManualFormDiscountedPriceEur] = useState<number | null>(null);


  // ============= MANUAL FORM CONSTANTS & HELPERS =============
  // Helper functions
  const SKU_TOTAL_LENGTH = 10;
  const SKU_PREFIX_LENGTH = 4;
  const SKU_SUFFIX_LENGTH = SKU_TOTAL_LENGTH - SKU_PREFIX_LENGTH;
  const SKU_CHARSET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const MAX_IMAGES = 20;
  const FREE_IMAGES = 4;
  const MAX_DOCUMENTS = 10;
  const MAX_DOCUMENT_SIZE_MB = 10;

  const roundTo = (value: number, decimals = 2) => {
    return Math.round(value * Math.pow(10, decimals)) / Math.pow(10, decimals);
  };

  const slugify = (text: string) => {
    return text
      .toString()
      .toLowerCase()
      .trim()
      .replace(/\s+/g, '-')
      .replace(/[^\w\-]+/g, '')
      .replace(/\-\-+/g, '-')
      .replace(/^-+/, '')
      .replace(/-+$/, '');
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
    'Executări': {
      'exec-imobiliare': [
        { key: 'numarcamere', label: 'Număr camere *', type: 'number', required: true, placeholder: 'Ex: 3', min: 1, max: 20 },
        { key: 'suprafata', label: 'Suprafață construită (mp)', type: 'number', required: false, placeholder: 'Ex: 75', min: 0, step: 0.01 },
        { key: 'suprafataTeren', label: 'Suprafață teren (mp)', type: 'number', required: false, placeholder: 'Ex: 500', min: 0, step: 0.01 },
        { key: 'an', label: 'An construcție', type: 'number', required: false, placeholder: 'Ex: 2015', min: 1800, max: new Date().getFullYear() },
        { key: 'gradina', label: 'Grădină', type: 'select', required: false, options: ['Da', 'Nu'] },
        { key: 'garaj', label: 'Garaj', type: 'select', required: false, options: ['Da', 'Nu'] },
        { key: 'piscina', label: 'Piscină', type: 'select', required: false, options: ['Da', 'Nu'] },
      ],
      'exec-autovehicule': [
        { key: 'marca', label: 'Marca', type: 'text', required: false, placeholder: 'Ex: BMW' },
        { key: 'model', label: 'Model', type: 'text', required: false, placeholder: 'Ex: X5' },
        { key: 'an', label: 'An fabricație', type: 'number', required: false, placeholder: 'Ex: 2020', min: 1950, max: new Date().getFullYear() },
        { key: 'kilometraj', label: 'Kilometraj', type: 'number', required: false, placeholder: 'Ex: 50000', min: 0 },
        { key: 'combustibil', label: 'Combustibil', type: 'select', required: false, options: ['Benzină', 'Motorină', 'GPL', 'Electric', 'Hibrid'] },
        { key: 'transmisie', label: 'Transmisie', type: 'select', required: false, options: ['Manuală', 'Automată', 'CVT'] },
        { key: 'culoare', label: 'Culoare', type: 'text', required: false, placeholder: 'Ex: Negru' },
      ],
      'exec-industrial': [
        { key: 'tipUtilaj', label: 'Tip utilaj/echipament', type: 'select', required: false, options: ['Excavator', 'Buldozer', 'Macara', 'Tractor', 'Generator', 'Altele'] },
        { key: 'suprafata', label: 'Suprafață (mp)', type: 'number', required: false, placeholder: 'Ex: 500', min: 0, step: 0.01 },
        { key: 'an', label: 'An fabricație', type: 'number', required: false, placeholder: 'Ex: 2018', min: 1950, max: new Date().getFullYear() },
      ],
      'exec-afaceri': [
        { key: 'tipBun', label: 'Tip bun', type: 'select', required: false, options: ['Participații', 'Creanțe', 'Stocuri', 'Echipamente', 'Altele'] },
        { key: 'descriere', label: 'Descriere detaliată', type: 'textarea', required: false, placeholder: 'Descriere...' },
      ],
      'exec-office': [
        { key: 'tipEchipament', label: 'Tip echipament', type: 'select', required: false, options: ['Calculatoare', 'Imprimante', 'Mobilier birou', 'Altele'] },
        { key: 'suprafata', label: 'Suprafață (mp)', type: 'number', required: false, placeholder: 'Ex: 50', min: 0, step: 0.01 },
      ],
      'exec-altele': [
        { key: 'descriere', label: 'Descriere', type: 'textarea', required: false, placeholder: 'Descriere produs...' },
      ],
    },
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
        { key: 'tipPiesa', label: 'Tip piesă', type: 'select', required: false, options: [
          'Accesorii auto', 'Accesorii roți', 'Aprindere', 'Cabluri auto', 'Audio auto', 'Caroserie', 'Climatizare', 'Dezmembrări', 'Direcție', 'Diverse',
          'Electrică auto', 'Evacuare', 'Faruri & lumini', 'Filtre', 'Frâne', 'GPL', 'Interior auto', 'Întreținere', 'Jante & anvelope', 'GPS', 'Revizie',
          'Moto', 'Motor', 'Injectoare', 'Rulmenți', 'Răcire', 'Scule', 'Suspensie', 'Transmisie', 'Tuning', 'Turbo', 'Uleiuri', 'Xenon',
        ] },
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

  // Extract categories and subcategories from dynamicFieldsConfig
  const categories = Object.keys(dynamicFieldsConfig);
  const subcategories: Record<string, string[]> = {};
  categories.forEach(category => {
    subcategories[category] = Object.keys(dynamicFieldsConfig[category]);
  });

  // ============= MANUAL FORM HANDLERS =============
  // Câmpuri deja în secțiunea principală – nu le mai afișăm ca „Caracteristici Specifice”
  const FIELDS_ALREADY_IN_MAIN_FORM = ['brand', 'model', 'marca', 'culoare', 'stare', 'ram', 'capacitateStocare', 'garantie', 'capacitateCilindrica'];
  const getManualFormDynamicFields = () => {
    if (!manualFormData.category || !manualFormData.subcategory) return [];
    const categoryFields = dynamicFieldsConfig[manualFormData.category];
    if (!categoryFields) return [];
    const fields = categoryFields[manualFormData.subcategory] || [];
    return fields.filter((f: { key: string }) => !FIELDS_ALREADY_IN_MAIN_FORM.includes(f.key));
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

  // Fetch exchange rate and user tokens on mount
  useEffect(() => {
    if (showManualAddModal) {
      fetchManualFormExchangeRate();
      
      // Load user tokens
      const loadUserTokens = async () => {
        try {
          const { data: sessionData } = await supabase.auth.getSession();
          if (sessionData.session) {
            const tokensResponse = await dashboardApiFetch('/api/tokens', {
              method: 'GET',
              headers: {
              },
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
  }, [showManualAddModal]);

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
          title: manualFormRewriteTitle ? result.data.newTitle : prev.title,
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

  const handleManualFormInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    const checked = (e.target as HTMLInputElement).checked;

    if (type === 'checkbox') {
      setManualFormData(prev => ({ ...prev, [name]: checked }));
    } else if (name === 'sku') {
      const sanitized = sanitizeSkuInput(value);
      setManualFormData(prev => ({ ...prev, sku: sanitized }));
    } else if (name === 'currency') {
      setManualFormData(prev => ({ ...prev, currency: value as 'RON' | 'EUR' }));
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

  const handleManualFormFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    try {
      const files = Array.from(e.target.files || []);
      
      if (files.length === 0) {
        return;
      }
      
      const currentImageCount = manualFormData.images.length;
      const totalAfterUpload = currentImageCount + files.length;
      
      if (totalAfterUpload > MAX_IMAGES) {
        const allowedCount = MAX_IMAGES - currentImageCount;
        setManualFormMessage({ 
          type: 'error', 
          text: `Poți adăuga doar ${allowedCount} imagini în plus. Limita maximă este de ${MAX_IMAGES} imagini.` 
        });
        e.target.value = '';
        return;
      }
      
      const uploadedUrls: string[] = [];
      const zipFiles: Array<{ name: string; size: number; type: string; file: File }> = [];
      
      for (const file of files) {
        if (file.size > 10 * 1024 * 1024) {
          setManualFormMessage({ 
            type: 'error', 
            text: `Fișierul ${file.name} este prea mare. Dimensiunea maximă este 10MB.` 
          });
          continue;
        }

        if (file.type.startsWith('image/')) {
          try {
            const uploadResult = await uploadImageFile(file, { fetchImpl: dashboardApiFetch });
            if (uploadResult.success && uploadResult.url) {
              uploadedUrls.push(uploadResult.url);
            }
          } catch (error) {
            console.error('Error uploading image:', error);
          }
        } else if (file.type === 'application/zip' || file.name.toLowerCase().endsWith('.zip')) {
          zipFiles.push({
            name: file.name,
            size: file.size,
            type: 'zip',
            file: file
          });
        }
      }

      if (uploadedUrls.length > 0 || zipFiles.length > 0) {
        setManualFormData(prev => ({
          ...prev,
          images: [...prev.images, ...uploadedUrls, ...zipFiles]
        }));
        setManualFormMessage({ 
          type: 'success', 
          text: `${uploadedUrls.length + zipFiles.length} ${uploadedUrls.length + zipFiles.length === 1 ? 'fișier' : 'fișiere'} ${uploadedUrls.length + zipFiles.length === 1 ? 'a fost' : 'au fost'} ${uploadedUrls.length + zipFiles.length === 1 ? 'adăugat' : 'adăugate'}.` 
        });
      }
    } catch (error) {
      console.error('Error uploading files:', error);
      setManualFormMessage({ type: 'error', text: 'Eroare la încărcarea fișierelor.' });
    }
    e.target.value = '';
  };

  const handleManualFormRemoveImage = (index: number) => {
    setManualFormData(prev => {
      const newImages = prev.images.filter((_, i) => i !== index);
      return {
        ...prev,
        images: newImages
      };
    });
  };

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

      // Check if price is set
      const initialPrice = manualFormData.currency === 'RON' ? manualFormPriceRon : manualFormPriceEur;
      if (initialPrice <= 0) {
        setManualFormMessage({ type: 'error', text: 'Prețul de pornire trebuie să fie mai mare decât 0.' });
        setManualFormIsSubmitting(false);
        return;
      }

      // Get user
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData?.user?.id;
      if (!userId) {
        setManualFormMessage({ type: 'error', text: 'Trebuie să fii autentificat pentru a salva produsul.' });
        setManualFormIsSubmitting(false);
        return;
      }

      // Upload images
      const uploadedImageUrls: string[] = [];
      const imagesToProcess = manualFormData.images || [];
      
      for (const image of imagesToProcess) {
        if (typeof image === 'string') {
          uploadedImageUrls.push(image);
        }
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
      if (!effectiveRate || effectiveRate <= 0) {
        const fetchedRate = await fetchManualFormExchangeRate();
        effectiveRate = fetchedRate ?? effectiveRate ?? null;
      }

      if (!effectiveRate || effectiveRate <= 0) {
        setManualFormMessage({ 
          type: 'error', 
          text: 'Nu am putut obține cursul EUR/RON. Te rugăm să actualizezi cursul și să încerci din nou.' 
        });
        setManualFormIsSubmitting(false);
        return;
      }

      // Prepare product data
      const normalizedStartingPrice = roundTo(manualFormData.currency === 'RON' ? manualFormPriceRon : manualFormPriceEur);
      const normalizedRon = manualFormData.currency === 'RON'
        ? normalizedStartingPrice
        : roundTo(normalizedStartingPrice * effectiveRate);
      const normalizedEur = manualFormData.currency === 'RON'
        ? roundTo(normalizedStartingPrice / effectiveRate)
        : normalizedStartingPrice;
      const normalizedRateUpdatedAt = manualFormLastRateUpdate?.toISOString() ?? new Date().toISOString();

      // Auto-enhance: rescrie titlul, descrierea și generează SEO
      let finalTitle = manualFormData.title.trim();
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
              finalTitle = manualFormRewriteTitle ? result.data.newTitle : finalTitle;
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

      // Build payload
      const payload: Record<string, any> = {
        title: finalTitle,
        description: finalDescription,
        category: manualFormData.category,
        subcategory: manualFormData.subcategory,
        sku: manualFormData.sku || generateSku(manualFormData.subcategory, products.map(p => p.sku).filter(Boolean)),
        starting_price: roundTo(normalizedStartingPrice),
        starting_price_ron: normalizedRon,
        starting_price_eur: normalizedEur,
        currency: manualFormData.currency,
        product_type: 'live-bid',
        status: manualFormData.status,
        county: manualFormData.county || null,
        city: manualFormData.city || null,
        address: manualFormData.address || null,
        images: Array.isArray(uploadedImageUrls) ? uploadedImageUrls : [],
        custom_fields: {
          ...manualFormData.customFields,
          exchange_rate: effectiveRate,
          exchange_rate_updated_at: normalizedRateUpdatedAt,
          has_no_expiration: true, // Live Bid nu expiră niciodată
          buy_now_enabled: manualFormData.buyNowEnabled || false,
          ...(manualFormData.buyNowPriceRON !== null && { buy_now_price_ron: manualFormData.buyNowPriceRON }),
          ...(manualFormData.buyNowPriceEUR !== null && { buy_now_price_eur: manualFormData.buyNowPriceEUR }),
        },
        seo: finalSEO ?? { title: '', description: '', keywords: [] },
        documents: [],
        slug: uniqueSlug,
        url: finalUrl,
        user_id: userId,
      };

      // Insert product
      const { data: insertedData, error: insertError } = await supabase
        .from('products')
        .insert(payload)
        .select();

      if (insertError) {
        console.error('Supabase insert error:', insertError);
        throw insertError;
      }

      if (!insertedData || insertedData.length === 0) {
        throw new Error('Produsul nu a fost creat. Te rog încearcă din nou.');
      }

      setManualFormMessage({ type: 'success', text: 'Produsul a fost adăugat cu succes!' });
      
      // Reset form
      setManualFormData({
        title: '',
        description: '',
        category: '',
        subcategory: '',
        sku: '',
        currency: 'RON',
        productType: 'live-bid',
        buyNowEnabled: false,
        buyNowPriceRON: null,
        buyNowPriceEUR: null,
        county: '',
        city: '',
        address: '',
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

      // Reload products
      await loadProducts();

      // Close modal after delay
      setTimeout(() => {
        setShowManualAddModal(false);
        setManualFormMessage(null);
      }, 2000);

    } catch (error: any) {
      console.error('Error submitting form:', error);
      setManualFormMessage({ 
        type: 'error', 
        text: error.message || error.details || error.hint || 'Eroare la salvarea produsului. Te rog încearcă din nou.' 
      });
    } finally {
      setManualFormIsSubmitting(false);
    }
  };

  // Handle save licitator data
  const handleSaveLicitator = async () => {
    const { data: sessionData } = await supabase.auth.getSession();
    const userId = sessionData.session?.user?.id;

    if (!userId) {
      setLicitatorMessage({
        type: 'error',
        text: 'Nu ești autentificat. Te rog reconectează-te.',
      });
      return;
    }

    setIsSavingLicitator(true);
    setLicitatorMessage(null);

    try {
      const userEmail = sessionData.session?.user?.email || userInfo.email || '';
      const updateData: any = {
        user_id: userId,
        email: userEmail || null,
        first_name: userInfo.firstName || null,
        last_name: userInfo.lastName || null,
        phone: userInfo.phone || licitatorData.licitatorPhone || null,
        licitator_name: licitatorData.licitatorName || null,
        licitator_address: licitatorData.licitatorAddress || null,
        licitator_email: licitatorData.licitatorEmail || null,
        licitator_phone: licitatorData.licitatorPhone || null,
        licitator_competence: licitatorData.licitatorCompetence || null,
        executor_office_address: licitatorData.licitatorAddress || null,
        executor_chamber: licitatorData.licitatorCompetence || null,
        avatar_url: licitatorData.licitatorAvatar || userInfo.avatar || null,
      };

      // Use upsert to ensure data is saved correctly whether profile exists or not
      const { data, error } = await supabase
        .from('user_profiles')
        .upsert(updateData, {
          onConflict: 'user_id'
        })
        .select();

      if (error) {
        console.error('Error saving licitator data to Supabase:', error);
        throw error;
      }

      // Verify data was saved
      if (!data || data.length === 0) {
        throw new Error('Datele nu au putut fi salvate în baza de date.');
      }

      // Sync avatar_url to custom_fields for all products of this executor
      if (licitatorData.licitatorAvatar) {
        try {
          // Get all products for this executor
          const { data: products, error: productsError } = await supabase
            .from('products')
            .select('id, custom_fields')
            .eq('user_id', userId);

          console.log('[SaveLicitator] Syncing avatar to custom_fields:', {
            userId,
            avatarUrl: licitatorData.licitatorAvatar,
            productsCount: products?.length || 0,
            productsError
          });

          if (!productsError && products && products.length > 0) {
            // Update custom_fields for each product
            const updatePromises = products.map((product: { id: string; custom_fields?: Record<string, unknown> | null }) => {
              const updatedCustomFields = {
                ...(product.custom_fields || {}),
                avatar_url: licitatorData.licitatorAvatar
              };
              console.log('[SaveLicitator] Updating product:', {
                productId: product.id,
                oldCustomFields: product.custom_fields,
                newCustomFields: updatedCustomFields
              });
              return supabase
                .from('products')
                .update({ custom_fields: updatedCustomFields })
                .eq('id', product.id);
            });

            const results = await Promise.all(updatePromises);
            console.log('[SaveLicitator] Sync results:', results);
          } else {
            console.warn('[SaveLicitator] No products found for user:', userId);
          }
        } catch (syncError) {
          console.error('Error syncing avatar to custom_fields:', syncError);
          // Don't throw error, just log it - the main save was successful
        }
      }

      setLicitatorMessage({
        type: 'success',
        text: basePath?.includes("lichidator") ? 'Datele de contact ale lichidatorului au fost salvate cu succes! Acestea vor apărea automat în toate anunțurile tale.' : 'Datele de contact ale executorului au fost salvate cu succes! Acestea vor apărea automat în toate anunțurile tale.',
      });

      // Dispatch event to sync with settings page
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('licitatorDataUpdated', {
          detail: licitatorData
        }));
      }

      // Close modal after a short delay
      setTimeout(() => {
        setShowLicitatorModal(false);
        setLicitatorMessage(null);
      }, 2000);
    } catch (error: any) {
      console.error('Error saving licitator data:', error);
      setLicitatorMessage({
        type: 'error',
        text: error.message || 'Eroare la salvarea datelor. Te rog încearcă din nou.',
      });
    } finally {
      setIsSavingLicitator(false);
    }
  };

  const PREMIUM_PRICE_PER_WEEK = 4.99;

  const loadUserCredit = async () => {
    setIsLoadingCredit(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) {
        setUserCreditBalance(0);
        return;
      }
      const userId = sessionData.session.user.id;
      const accessToken = sessionData.session.access_token;
      
      // Load credit via API route (uses supabaseAdmin to bypass RLS)
      const creditsResponse = await dashboardApiFetch('/api/credits', {
        headers: {
          ...(userId && !accessToken ? { 'x-user-id': userId } : {})
        }
      });

      if (!creditsResponse.ok) {
        const errorData = await creditsResponse.json().catch(() => ({}));
        console.error('[Executor] Error loading user credit from API:', {
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
        console.log('[Executor] Loaded user credit from API:', totalCredit, 'RON');
      } else {
        console.warn('[Executor] Invalid response from credits API:', creditsData);
        setUserCreditBalance(0);
      }
    } catch (e) {
      console.error('Error loading user credit:', e);
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
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) throw new Error('Trebuie să fii autentificat');
      const userId = sessionData.session.user.id;
      const accessToken = sessionData.session.access_token;
      const totalAmount = PREMIUM_PRICE_PER_WEEK * premiumWeeks;
      
      // Load credit via API route (uses supabaseAdmin to bypass RLS)
      const creditsResponse = await dashboardApiFetch('/api/credits', {
        headers: {
          ...(userId && !accessToken ? { 'x-user-id': userId } : {})
        }
      });
      
      let totalCredit = 0;
      if (creditsResponse.ok) {
        const creditsData = await creditsResponse.json();
        if (creditsData.success && creditsData.credit !== undefined) {
          totalCredit = Math.max(0, creditsData.credit || 0);
        }
      }
      
      const hasEnoughCredits = totalCredit >= totalAmount;
      const paymentMethod = hasEnoughCredits ? 'credit' : 'netopia';
      const res = await dashboardApiFetch('/api/premium/initiate-payment', {
        method: 'POST',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          product_id: selectedProductForPremium,
          amount: totalAmount,
          weeks: premiumWeeks,
          payment_method: paymentMethod,
        }),
      });
      const text = await res.text();
      if (!res.ok) {
        let err: { error?: string; message?: string; details?: string } = {};
        try { err = JSON.parse(text); } catch { }
        throw new Error(err.error || err.message || text || 'Eroare la procesarea plății');
      }
      const result = JSON.parse(text);
      if (result.success) {
        if (result.payment_method === 'credit') {
          setManualFormMessage({ type: 'success', text: `Promovare premium activată cu succes pentru ${premiumWeeks} ${premiumWeeks === 1 ? 'săptămână' : 'săptămâni'}!` });
          if (oblioStatus.enabled) {
            const { payment, clientInfo } = buildPayloadForTransaction(
              { amount: totalAmount, description: `Promovare premium ${premiumWeeks} ${premiumWeeks === 1 ? 'săptămână' : 'săptămâni'}`, status: 'paid', type: 'premium' },
              { firstName: userInfo.firstName, lastName: userInfo.lastName, email: sessionData.session?.user?.email ?? userInfo.email ?? '' }
            );
            requestOblioInvoice(payment, clientInfo, { openPdf: true }).catch(() => {});
          }
          setSelectedProductForPremium(null);
          setPremiumWeeks(1);
          await loadProducts();
          await loadUserCredit();
          setTimeout(() => { setShowPremiumModal(false); setManualFormMessage(null); }, 2000);
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
          if (result.payment_url || result.redirect_url) {
            window.location.assign((result.payment_url || result.redirect_url) as string);
          } else {
            throw new Error('Lipsește link-ul de plată Netopia');
          }
        }
      } else throw new Error(result.error || result.message || 'Eroare la activare premium');
    } catch (e: any) {
      console.error('Premium payment error:', e);
      setManualFormMessage({ type: 'error', text: e.message || 'Eroare la promovare premium. Încearcă din nou.' });
    } finally {
      setIsProcessingPremium(false);
    }
  };

  // CRITICAL: Apply dark mode class immediately on mount
  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    // Small delay to ensure layout script has run first
    const timeoutId = setTimeout(() => {
      const darkModeValue = getDarkModeFromStorage();
      const htmlElement = document.documentElement;
      
      // CRITICAL: Force apply based on localStorage value
      // Remove dark class first to ensure clean state
      htmlElement.classList.remove('dark');
      
      if (darkModeValue) {
        htmlElement.classList.add('dark');
      }
      
      // Force reflow
      void htmlElement.offsetHeight;
      
      // Verify and correct if needed
      const hasDark = htmlElement.classList.contains('dark');
      if (hasDark !== darkModeValue) {
        htmlElement.classList.remove('dark');
        if (darkModeValue) {
          htmlElement.classList.add('dark');
        }
        void htmlElement.offsetHeight;
      }
      
      // Sync state
      if (isDarkMode !== darkModeValue) {
        setIsDarkMode(darkModeValue);
      }
    }, 50);
    
    return () => clearTimeout(timeoutId);
  }, []); // Run only once on mount

  // Sync dark mode with localStorage changes (from other tabs or external sources)
  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Listen for changes from other tabs (via localStorage storage event)
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'darkMode') {
        const darkModeValue = e.newValue === 'true';
        const htmlElement = document.documentElement;
        if (darkModeValue) {
          htmlElement.classList.add('dark');
        } else {
          htmlElement.classList.remove('dark');
        }
        setIsDarkMode(darkModeValue);
      } else if (e.key === 'userInfo' && e.newValue) {
        // Sync avatar when updated in other tabs
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

    // Listen for custom event (same-window toggle)
    const handleDarkModeToggled = (e: Event) => {
      const customEvent = e as CustomEvent;
      const htmlElement = document.documentElement;
      let darkModeValue: boolean;
      
      if (customEvent.detail?.darkMode !== undefined) {
        darkModeValue = customEvent.detail.darkMode;
      } else {
        darkModeValue = getDarkModeFromStorage();
      }
      
      // Force apply
      if (darkModeValue) {
        htmlElement.classList.add('dark');
      } else {
        htmlElement.classList.remove('dark');
      }
      setIsDarkMode(darkModeValue);
    };

    // Listen for avatar updates
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

    // Listen for licitator data updates from settings page
    const handleLicitatorDataUpdated = (e: CustomEvent) => {
      if (e.detail) {
        setLicitatorData(e.detail);
      }
    };

    window.addEventListener('storage', handleStorageChange);
    window.addEventListener('darkModeToggled', handleDarkModeToggled as EventListener);
    window.addEventListener('avatarUpdated', handleAvatarUpdated as EventListener);
    window.addEventListener('licitatorDataUpdated', handleLicitatorDataUpdated as EventListener);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('darkModeToggled', handleDarkModeToggled as EventListener);
      window.removeEventListener('avatarUpdated', handleAvatarUpdated as EventListener);
      window.removeEventListener('licitatorDataUpdated', handleLicitatorDataUpdated as EventListener);
    };
  }, []); // Only run once on mount

  // Apply dark mode class whenever isDarkMode changes - CRITICAL for white/dark mode switching
  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    const htmlElement = document.documentElement;
    
    // CRITICAL: Force apply dark mode class based on state
    if (isDarkMode) {
      htmlElement.classList.add('dark');
    } else {
      htmlElement.classList.remove('dark');
    }
    
    // Ensure localStorage matches state
    const storedValue = localStorage.getItem('darkMode');
    const storedBool = storedValue === 'true';
    if (storedBool !== isDarkMode) {
      saveDarkModeToStorage(isDarkMode);
    }
    
    // Double-check after a short delay
    setTimeout(() => {
      const hasDark = htmlElement.classList.contains('dark');
      if (hasDark !== isDarkMode) {
        // Force correct
        if (isDarkMode) {
          htmlElement.classList.add('dark');
        } else {
          htmlElement.classList.remove('dark');
        }
      }
    }, 10);
  }, [isDarkMode]);

  const toggleDarkMode = useCallback(() => {
    // Toggle based on current React state
    const newMode = !isDarkMode;
    const htmlElement = document.documentElement;
    
    // CRITICAL: Manually remove/add dark class FIRST
    if (newMode) {
      htmlElement.classList.add('dark');
    } else {
      htmlElement.classList.remove('dark');
    }
    
    // Update state
    setIsDarkMode(newMode);
    
    // Save to storage
    saveDarkModeToStorage(newMode);
    
    // Dispatch events for synchronization
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('darkModeChanged'));
      window.dispatchEvent(new CustomEvent('darkModeToggled', { detail: { darkMode: newMode } }));
      
      // Double-check after a short delay
      setTimeout(() => {
        const finalCheck = htmlElement.classList.contains('dark');
        if (finalCheck !== newMode) {
          // Force correct
          if (newMode) {
            htmlElement.classList.add('dark');
          } else {
            htmlElement.classList.remove('dark');
          }
          localStorage.setItem('darkMode', String(newMode));
        }
      }, 50);
    }
  }, [isDarkMode]);

  // Listen for avatar updates from other components
  useEffect(() => {
    if (typeof window === 'undefined') return;

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

    window.addEventListener('avatarUpdated', handleAvatarUpdated as EventListener);

    return () => {
      window.removeEventListener('avatarUpdated', handleAvatarUpdated as EventListener);
    };
  }, []);

  // Check authentication
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const { user, accountType } = await resolveAccountTypeWithUser(supabase);
        const userId = user?.id;

        if (!user) {
          router.push('/auth?mode=login');
          return;
        }

        // Doar conturi explicit non-executor (private, firmă, etc.) — nu și metadata lipsă (bug WebView)
        if (shouldRedirectAwayFromExecutorRoutes(accountType)) {
          router.push('/dashboard');
          return;
        }

        if (!userId) {
          router.push('/auth?mode=login');
          return;
        }

        // Load user info from user_profiles and update localStorage for UniversalHeader
        const { data: profile } = await supabase
          .from('user_profiles')
          .select('first_name,last_name,email,phone,avatar,executor_office_address,executor_office_location,executor_chamber,licitator_name,licitator_address,licitator_fiscal_code,licitator_consignment_account,licitator_email,licitator_phone,licitator_fax,licitator_competence,avatar_url')
          .eq('user_id', userId)
          .maybeSingle();

        const meta = user?.user_metadata || {};
        const executorName = [profile?.first_name || meta.first_name, profile?.last_name || meta.last_name].filter(Boolean).join(' ').trim();
        const executorAddr = profile?.executor_office_address || profile?.licitator_address || profile?.executor_office_location || meta.executor_office_address || meta.company_address || meta.address || '';
        const executorChamberVal = profile?.executor_chamber || profile?.licitator_competence || profile?.executor_office_location || meta.executor_chamber || meta.company_county || '';
        const userEmail = profile?.email || user.email || meta.email || '';

        if (profile) {
          // Update userInfo state
          setUserInfo({
            firstName: profile.first_name || meta.first_name || user.email?.split('@')[0] || '',
            lastName: profile.last_name || meta.last_name || '',
            email: userEmail || '',
            phone: profile.phone || meta.phone || '',
            avatar: profile.avatar || meta.avatar_url || '',
            supabaseUserId: userId
          });
          
          // Set currentUserId pentru chat și oferte
          setCurrentUserId(userId);

          // Update localStorage so UniversalHeader can access it
          localStorage.setItem('userInfo', JSON.stringify({
            firstName: profile.first_name || meta.first_name || user.email?.split('@')[0] || '',
            lastName: profile.last_name || meta.last_name || '',
            email: userEmail || '',
            phone: profile.phone || meta.phone || '',
            avatar: profile.avatar || meta.avatar_url || ''
          }));

          // Load licitator data – din profil sau user_metadata (înregistrare, setări)
          setLicitatorData({
            licitatorName: profile.licitator_name || executorName || '',
            licitatorAddress: executorAddr || '',
            licitatorFiscalCode: profile.licitator_fiscal_code || meta.licitator_fiscal_code || '',
            licitatorConsignmentAccount: profile.licitator_consignment_account || meta.licitator_consignment_account || '',
            licitatorEmail: profile.licitator_email || userEmail || '',
            licitatorPhone: profile.licitator_phone || profile.phone || meta.phone || '',
            licitatorFax: profile.licitator_fax || meta.licitator_fax || '',
            licitatorCompetence: executorChamberVal || '',
            licitatorAvatar: profile.avatar_url || profile.avatar || meta.avatar_url || ''
          });
        } else {
          // Fallback când profilul nu există – folosim user_metadata din înregistrare
          setUserInfo({
            firstName: meta.first_name || user.email?.split('@')[0] || '',
            lastName: meta.last_name || '',
            email: user.email || meta.email || '',
            phone: meta.phone || '',
            avatar: meta.avatar_url || '',
            supabaseUserId: userId
          });
          localStorage.setItem('userInfo', JSON.stringify({
            firstName: meta.first_name || user.email?.split('@')[0] || '',
            lastName: meta.last_name || '',
            email: user.email || meta.email || '',
            phone: meta.phone || '',
            avatar: meta.avatar_url || ''
          }));
          setLicitatorData({
            licitatorName: executorName || '',
            licitatorAddress: executorAddr || '',
            licitatorFiscalCode: meta.licitator_fiscal_code || '',
            licitatorConsignmentAccount: meta.licitator_consignment_account || '',
            licitatorEmail: user.email || meta.email || '',
            licitatorPhone: meta.phone || '',
            licitatorFax: meta.licitator_fax || '',
            licitatorCompetence: executorChamberVal || '',
            licitatorAvatar: meta.avatar_url || ''
          });
        }
      } catch (error) {
        console.error('Error checking auth:', error);
        router.push('/auth?mode=login');
      }
    };

    checkAuth();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- router instabil în Next → buclă infinită
  }, []);

  // Reload licitator data when modal opens to sync with settings
  useEffect(() => {
    if (!showLicitatorModal) return;

    const reloadLicitatorData = async () => {
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const userId = sessionData.session?.user?.id;
        const authUser = sessionData.session?.user;
        const meta = authUser?.user_metadata || {};

        if (!userId) return;

        const { data: profile } = await supabase
          .from('user_profiles')
          .select('first_name,last_name,email,phone,executor_office_address,executor_office_location,executor_chamber,licitator_name,licitator_address,licitator_fiscal_code,licitator_consignment_account,licitator_email,licitator_phone,licitator_fax,licitator_competence,avatar_url,avatar')
          .eq('user_id', userId)
          .maybeSingle();

        const executorName = [profile?.first_name || meta.first_name, profile?.last_name || meta.last_name].filter(Boolean).join(' ').trim();
        const executorAddr = profile?.executor_office_address || profile?.licitator_address || profile?.executor_office_location || meta.executor_office_address || meta.company_address || meta.address || '';
        const executorChamberVal = profile?.executor_chamber || profile?.licitator_competence || profile?.executor_office_location || meta.executor_chamber || meta.company_county || '';
        const userEmail = profile?.email || authUser?.email || meta.email || '';

        setLicitatorData({
          licitatorName: profile?.licitator_name || executorName || '',
          licitatorAddress: executorAddr || '',
          licitatorFiscalCode: profile?.licitator_fiscal_code || meta.licitator_fiscal_code || '',
          licitatorConsignmentAccount: profile?.licitator_consignment_account || meta.licitator_consignment_account || '',
          licitatorEmail: profile?.licitator_email || userEmail || meta.licitator_email || '',
          licitatorPhone: profile?.licitator_phone || profile?.phone || meta.phone || meta.licitator_phone || '',
          licitatorFax: profile?.licitator_fax || meta.licitator_fax || '',
          licitatorCompetence: executorChamberVal || '',
          licitatorAvatar: profile?.avatar_url || profile?.avatar || meta.avatar_url || ''
        });
      } catch (error) {
        console.error('Error reloading licitator data:', error);
      }
    };

    reloadLicitatorData();
  }, [showLicitatorModal]);

  // ============= MANUAL FORM EFFECTS =============
  useEffect(() => {
    if (manualFormData.subcategory && !manualFormSkuEditable) {
      const existingSkus = products.map(p => p.sku).filter(Boolean);
      const newSku = generateSku(manualFormData.subcategory, existingSkus);
      if (newSku) {
        setManualFormData(prev => ({ ...prev, sku: newSku }));
      }
    }
  }, [manualFormData.subcategory, manualFormSkuEditable, products]);

  // Fetch exchange rate and user tokens on mount
  useEffect(() => {
    if (showManualAddModal) {
      fetchManualFormExchangeRate();
      
      // Load user tokens
      const loadUserTokens = async () => {
        try {
          const { data: sessionData } = await supabase.auth.getSession();
          if (sessionData.session) {
            const tokensResponse = await dashboardApiFetch('/api/tokens', {
              method: 'GET',
              headers: {
              },
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
  }, [showManualAddModal]);

  const mapSupabaseProduct = useCallback((row: any): Product => {
    const images = Array.isArray(row?.images) ? row.images : [];

    return {
      id: row.id,
      title: row.title ?? '',
      description: row.description ?? '',
      category: row.category ?? '',
      subcategory: row.subcategory ?? '',
      sku: row.sku ?? '',
      startingPrice:
        typeof row.starting_price === 'number'
          ? row.starting_price
          : row.starting_price_ron ?? 0,
      productType: (row.product_type ?? 'live-bid') as 'live-bid' | 'details-only' | 'licitatii-publice' | 'buy-now' | undefined,
      currency: row.currency === 'EUR' ? 'EUR' : 'RON',
      status: row.status === 'active' ? 'active' : row.status === 'deleted' ? 'deleted' : 'draft',
      images,
      createdAt: row.created_at ?? new Date().toISOString(),
      url: row.url ?? undefined,
      slug: row.slug ?? undefined,
      approvalStatus: row.approval_status ?? 'approved',
      rejectionReason: row.rejection_reason ?? undefined,
      isPremium: row.is_premium ?? false,
      premiumUntil: row.premium_until ?? undefined,
    };
  }, []);

  const loadProducts = useCallback(async () => {
    setIsLoading(true);
    try {
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      const userId = sessionData.session?.user?.id;

      console.log('🔵 [LoadProducts] Session check:', {
        hasSession: !!sessionData.session,
        hasUser: !!sessionData.session?.user,
        userId: userId,
        sessionError: sessionError?.message,
      });

      if (!userId) {
        console.error('❌ [LoadProducts] No userId found, redirecting to login');
        router.push('/auth?mode=login');
        return;
      }

      console.log('🔵 [LoadProducts] Querying products for userId:', userId);

      // Obține toate produsele utilizatorului (fără limită – paginare Supabase 1000/request)
      const PAGE_SIZE = 1000;
      const allRows: any[] = [];
      let from = 0;
      let hasMore = true;
      while (hasMore) {
        const to = from + PAGE_SIZE - 1;
        const { data: chunk, error } = await supabase
          .from('products')
          .select('*')
          .eq('user_id', userId)
          .neq('status', 'deleted')
          .order('created_at', { ascending: false })
          .range(from, to);

        if (error) {
          console.error('❌ [LoadProducts] Error loading products:', error);
          throw error;
        }
        const list = chunk ?? [];
        allRows.push(...list);
        hasMore = list.length === PAGE_SIZE;
        from += PAGE_SIZE;
      }

      const mapped = allRows.map((row: any) => mapSupabaseProduct(row));
      console.log('✅ [LoadProducts] Mapped products:', mapped.length);
      setProducts(mapped);
    } catch (error: any) {
      console.error('❌ [LoadProducts] Error:', error);
      setProducts([]);
    } finally {
      setIsLoading(false);
    }
  }, [mapSupabaseProduct, router]);

  useEffect(() => {
    if (userInfo.supabaseUserId) {
      loadProducts();
    }
  }, [userInfo.supabaseUserId, loadProducts]);

  // Preîncarcă numărul de oferte pentru produsele active (pentru badge)
  useEffect(() => {
    if (!userInfo.supabaseUserId || products.length === 0) return;

    const loadBidsCount = async () => {
      const activeProductIds = products
        .filter(p => p.status === 'active')
        .map(p => p.id);

      if (activeProductIds.length === 0) return;

      try {
        const { data: bidsData, error } = await supabase
          .from('bids')
          .select('product_id, user_id, is_winning')
          .in('product_id', activeProductIds);

        if (error) {
          console.error('[LoadBidsCount] Error:', error);
          return;
        }

        // Grupează ofertele pe produs
        const bidsByProduct: Record<string, any[]> = {};
        bidsData?.forEach((bid: any) => {
          if (!bidsByProduct[bid.product_id]) {
            bidsByProduct[bid.product_id] = [];
          }
          bidsByProduct[bid.product_id].push(bid);
        });

        // Actualizează productBids cu toate ofertele (fără profile pentru performanță)
        setProductBids(prev => {
          const updated = { ...prev };
          Object.keys(bidsByProduct).forEach(productId => {
            // Actualizează întotdeauna pentru a reflecta numărul corect de oferte
            updated[productId] = bidsByProduct[productId].map((bid: any) => ({
              ...bid,
              user_profiles: prev[productId]?.find((b: any) => b.id === bid.id)?.user_profiles || null, // Păstrează profilele existente
            }));
          });
          return updated;
        });
      } catch (error) {
        console.error('[LoadBidsCount] Error:', error);
      }
    };

    loadBidsCount();
  }, [userInfo.supabaseUserId, products]);

  // Realtime listener pentru oferte noi
  useEffect(() => {
    if (!userInfo.supabaseUserId || products.length === 0) return;

    const activeProductIds = products
      .filter(p => p.status === 'active' && p.productType === 'live-bid')
      .map(p => p.id);
    
    if (activeProductIds.length === 0) return;

    console.log('[Realtime] Setting up bids listener for products:', activeProductIds.length);

    // Creează un canal pentru fiecare produs (sau unul pentru toate)
    const channel = supabase
      .channel(`bids-realtime-${userInfo.supabaseUserId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'bids'
        },
        (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => {
          console.log('[Realtime] New bid received:', payload.new);
          const newBid = payload.new as Record<string, unknown> & { id?: string; product_id?: string };
          const productId = newBid.product_id;
          if (typeof productId !== 'string' || !activeProductIds.includes(productId)) {
            return;
          }

          // Actualizează productBids pentru produsul respectiv
          setProductBids(prev => {
            const currentBids = prev[productId] || [];
            // Verifică dacă oferta nu există deja (pentru a evita duplicate)
            const exists = currentBids.some((b: { id?: string }) => b.id === newBid.id);
            if (exists) {
              return prev;
            }

            // Adaugă noua ofertă (fără profile pentru performanță - se va încărca când se expandează)
            return {
              ...prev,
              [productId]: [{ ...newBid, user_profiles: null }, ...currentBids],
            };
          });
        }
      )
      .subscribe((status: string) => {
        if (process.env.NODE_ENV === 'development') {
          console.log('[Realtime] Bids channel status:', status);
        }
        if (status === 'SUBSCRIBED') {
          return;
        }
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.warn('[Realtime] Bids: canal indisponibil (publication Realtime pentru `bids`). Ofertele se reîncarcă la deschidere.');
        }
      });

    return () => {
      console.log('[Realtime] Unsubscribing from bids channel');
      supabase.removeChannel(channel);
    };
  }, [userInfo.supabaseUserId, products]);

  // Funcție pentru încărcarea ofertelor pentru un produs
  const loadProductBids = useCallback(async (productId: string) => {
    if (loadingBids[productId]) {
      console.log('[LoadProductBids] Already loading bids for product:', productId);
      return;
    }
    
    console.log('[LoadProductBids] Loading bids for product:', productId);
    setLoadingBids(prev => ({ ...prev, [productId]: true }));
    
    try {
      const { data: bidsData, error: bidsError } = await supabase
        .from('bids')
        .select('id, amount, created_at, is_winning, is_outbid, product_id, user_id')
        .eq('product_id', productId)
        .order('created_at', { ascending: false });

      if (bidsError) {
        console.error('[LoadProductBids] Error loading bids:', bidsError);
        setProductBids(prev => ({ ...prev, [productId]: [] }));
        return;
      }

      console.log('[LoadProductBids] Found bids:', bidsData?.length || 0);

      // Obține profilele utilizatorilor
      const userIds = [...new Set(bidsData?.map((b: any) => b.user_id).filter(Boolean) || [])];
      let profilesMap: Record<string, any> = {};

      if (userIds.length > 0) {
        try {
          const profilesResponse = await dashboardApiFetch('/api/admin/users/profiles', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userIds }),
          });
          
          if (profilesResponse.ok) {
            const { profiles } = await profilesResponse.json();
            if (profiles && Array.isArray(profiles)) {
              profiles.forEach((profile: any) => {
                profilesMap[profile.user_id] = profile;
              });
            }
          }
        } catch (apiError) {
          console.error('Error loading user profiles via API:', apiError);
        }
      }

      // Mapare oferte cu profile
      const mappedBids = (bidsData || []).map((bid: any) => ({
        ...bid,
        user_profiles: profilesMap[bid.user_id] || null,
      }));

      console.log('[LoadProductBids] Mapped bids:', mappedBids.length);
      setProductBids(prev => ({ ...prev, [productId]: mappedBids }));
    } catch (error: any) {
      console.error('[LoadProductBids] Error:', error);
      setProductBids(prev => ({ ...prev, [productId]: [] }));
    } finally {
      setLoadingBids(prev => ({ ...prev, [productId]: false }));
    }
  }, [loadingBids]);

  // Toggle expandare produs pentru a vedea ofertele
  const toggleProductExpansion = useCallback((productId: string) => {
    setExpandedProducts(prev => {
      const isExpanded = !prev[productId];
      if (isExpanded) {
        // Încarcă ofertele când se expandează (chiar dacă există deja, reîncarcă pentru actualizare)
        loadProductBids(productId);
      }
      return { ...prev, [productId]: isExpanded };
    });
  }, [loadProductBids]);

  const filteredProducts = products.filter(product => {
    let matchesStatus = false;
    if (filterStatus === 'all') {
      matchesStatus = true;
    } else if (filterStatus === 'pending') {
      matchesStatus = product.approvalStatus === 'pending';
    } else {
      matchesStatus = product.status === filterStatus;
    }
    const matchesSearch = searchTerm === '' || 
      product.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      product.sku.toLowerCase().includes(searchTerm.toLowerCase()) ||
      product.category.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesStatus && matchesSearch;
  });

  const activeProducts = products.filter(p => p.status === 'active' && p.approvalStatus !== 'pending');
  const pendingProducts = products.filter(p => p.approvalStatus === 'pending');
  const draftProducts = products.filter(p => p.status === 'draft');

  const getStatusBadge = (status: string, approvalStatus?: string) => {
    if (approvalStatus === 'pending') {
      return (
        <span className={`inline-flex items-center px-2 py-1 text-xs font-semibold rounded-full whitespace-nowrap ${
          isDarkMode 
            ? 'bg-yellow-900/30 text-yellow-300' 
            : 'bg-yellow-100 text-yellow-800'
        }`}>
          În așteptare
        </span>
      );
    }
    if (approvalStatus === 'rejected') {
      return (
        <span className={`inline-flex items-center px-2 py-1 text-xs font-semibold rounded-full whitespace-nowrap ${
          isDarkMode 
            ? 'bg-red-900/30 text-red-300' 
            : 'bg-red-100 text-red-800'
        }`}>
          Respins
        </span>
      );
    }
    if (status === 'active') {
      return (
        <span className={`inline-flex items-center px-2 py-1 text-xs font-semibold rounded-full whitespace-nowrap ${
          isDarkMode 
            ? 'bg-green-900/30 text-green-300' 
            : 'bg-green-100 text-green-800'
        }`}>
          Activ
        </span>
      );
    }
    return (
      <span className={`inline-flex items-center px-2 py-1 text-xs font-semibold rounded-full whitespace-nowrap ${
        isDarkMode 
          ? 'bg-orange-900/30 text-orange-300' 
          : 'bg-orange-100 text-orange-800'
      }`}>
        Dezactivate
      </span>
    );
  };

  const formatPrice = (price: number, currency: string) => {
    return `${price.toLocaleString('ro-RO')} ${currency}`;
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

  const getTimeRemaining = useCallback((createdAt: string): { hours: number; minutes: number; seconds: number; expired: boolean } => {
    const created = new Date(createdAt).getTime();
    const now = Date.now();
    const expirationTime = created + (12 * 60 * 60 * 1000); // 12 ore în milisecunde
    const remaining = expirationTime - now;
    
    if (remaining <= 0) {
      return { hours: 0, minutes: 0, seconds: 0, expired: true };
    }
    
    const hours = Math.floor(remaining / (1000 * 60 * 60));
    const minutes = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((remaining % (1000 * 60)) / 1000);
    
    return { hours, minutes, seconds, expired: false };
  }, []);

  const handleEdit = async (productId: string) => {
    try {
      // Load product data
      const { data: product, error } = await supabase
        .from('products')
        .select('*')
        .eq('id', productId)
        .single();

      if (error || !product) {
        console.error('Error loading product:', error);
        alert('Nu am putut încărca datele produsului. Te rugăm să încerci din nou.');
        return;
      }

      // Set editing product ID and open modal
      setEditingProductId(productId);
      setShowManualAddModal(true);
    } catch (error) {
      console.error('Error in handleEdit:', error);
      alert('A apărut o eroare. Te rugăm să încerci din nou.');
    }
  };

  const handleActivateProduct = async (productId: string) => {
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) {
        setShowAuthModal(true);
        return;
      }
      const { error } = await supabase
        .from('products')
        .update({ status: 'active' })
        .eq('id', productId)
        .eq('user_id', sessionData.session.user.id);
      if (error) throw error;
      setImportMessage({ type: 'success', text: 'Anunțul a fost reactivat.' });
      setTimeout(() => setImportMessage(null), 3000);
      await loadProducts();
    } catch (error: any) {
      console.error('Error activating product:', error);
      setImportMessage({ type: 'error', text: 'Eroare la reactivare: ' + (error.message || 'Eroare necunoscută') });
      setTimeout(() => setImportMessage(null), 3000);
    }
  };

  const handleDeactivateProduct = async (productId: string) => {
    if (!confirm('Ești sigur că vrei să dezactivezi acest anunț?')) {
      return;
    }
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) {
        setShowAuthModal(true);
        return;
      }
      const { error } = await supabase
        .from('products')
        .update({ status: 'draft' })
        .eq('id', productId)
        .eq('user_id', sessionData.session.user.id);
      if (error) throw error;
      setImportMessage({ type: 'success', text: 'Anunțul a fost dezactivat.' });
      setTimeout(() => setImportMessage(null), 3000);
      await loadProducts();
    } catch (error: any) {
      console.error('Error deactivating product:', error);
      setImportMessage({ type: 'error', text: 'Eroare la dezactivare: ' + (error.message || 'Eroare necunoscută') });
      setTimeout(() => setImportMessage(null), 3000);
    }
  };

  const handleDelete = async (productId: string, productTitle: string) => {
    if (!confirm(`Ești sigur că vrei să ștergi produsul "${productTitle}"? Această acțiune nu poate fi anulată.`)) {
      return;
    }

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const userId = sessionData.session?.user?.id;

      if (!userId) {
        setShowAuthModal(true);
        return;
      }

      // Setează status la 'deleted' în loc să șteargă fizic
      const { error } = await supabase
        .from('products')
        .update({ status: 'deleted' })
        .eq('id', productId)
        .eq('user_id', userId); // Asigură-te că doar proprietarul poate șterge

      if (error) {
        console.error('Eroare la ștergerea produsului:', error);
        alert(`Eroare la ștergerea produsului: ${error.message}`);
        return;
      }

      // Reîncarcă lista de produse
      await loadProducts();
      
      // Afișează mesaj de succes
      setImportMessage({ type: 'success', text: 'Produsul a fost șters cu succes.' });
      setTimeout(() => setImportMessage(null), 3000);
    } catch (error: any) {
      console.error('Eroare la ștergerea produsului:', error);
      alert(`Eroare la ștergerea produsului: ${error.message || 'Eroare necunoscută'}`);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
      setUrl('');
    } else {
      setFile(null);
    }
  };

  const handleAvatarFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      // Validate file type
      if (!selectedFile.type.startsWith('image/')) {
        setImportMessage({
          type: 'error',
          text: 'Te rog selectează o imagine validă (JPG, PNG, etc.)',
        });
        return;
      }
      // Validate file size (max 5MB)
      if (selectedFile.size > 5 * 1024 * 1024) {
        setImportMessage({
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
    if (!avatarFile || !userInfo.supabaseUserId) {
      setImportMessage({
        type: 'error',
        text: 'Te rog selectează o imagine și asigură-te că ești autentificat.',
      });
      return;
    }

    setIsUploadingAvatar(true);
    setImportMessage(null);

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
        .eq('user_id', userInfo.supabaseUserId);

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
      setImportMessage({
        type: 'success',
        text: 'Avatarul a fost actualizat cu succes!',
      });

      // Reload page data after a short delay to show success message
      setTimeout(() => {
        window.location.reload();
      }, 1500);
    } catch (error: any) {
      console.error('Error uploading avatar:', error);
      setImportMessage({
        type: 'error',
        text: error.message || 'Eroare la încărcarea avatarului. Te rog încearcă din nou.',
      });
    } finally {
      setIsUploadingAvatar(false);
    }
  };

  const handleLicitatorAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      // Check file size (5MB max)
      if (selectedFile.size > 5 * 1024 * 1024) {
        setLicitatorMessage({
          type: 'error',
          text: 'Fișierul este prea mare. Dimensiunea maximă este 5MB.',
        });
        return;
      }
      
      // Check file type
      if (!selectedFile.type.startsWith('image/')) {
        setLicitatorMessage({
          type: 'error',
          text: 'Vă rugăm să selectați o imagine validă.',
        });
        return;
      }

      // Set preview immediately
      const reader = new FileReader();
      reader.onloadend = () => {
        setLicitatorAvatarPreview(reader.result as string);
      };
      reader.readAsDataURL(selectedFile);

      // Automatically upload the avatar
      setLicitatorAvatarFile(selectedFile);
      setIsUploadingLicitatorAvatar(true);
      setLicitatorMessage(null);

      try {
        const uploadData = await uploadImageFile(selectedFile, { fetchImpl: dashboardApiFetch });
        if (!uploadData.success) {
          throw new Error(uploadData.error);
        }
        if (!uploadData.url) {
          throw new Error('Eroare la încărcarea imaginii');
        }
        const avatarUrl = uploadData.url;

        // Update user_profiles with new avatar_url
        const { error: updateError } = await supabase
          .from('user_profiles')
          .upsert({
            user_id: userInfo.supabaseUserId,
            avatar_url: avatarUrl
          }, {
            onConflict: 'user_id'
          });

        if (updateError) {
          throw updateError;
        }

        // Sync avatar_url to custom_fields for all products of this executor
        try {
          // Get all products for this executor
          const { data: products, error: productsError } = await supabase
            .from('products')
            .select('id, custom_fields')
            .eq('user_id', userInfo.supabaseUserId);

          console.log('[LicitatorAvatar] Syncing avatar to custom_fields:', {
            userId: userInfo.supabaseUserId,
            avatarUrl,
            productsCount: products?.length || 0,
            productsError
          });

          if (!productsError && products && products.length > 0) {
            // Update custom_fields for each product
            const updatePromises = products.map((product: { id: string; custom_fields?: Record<string, unknown> | null }) => {
              const updatedCustomFields = {
                ...(product.custom_fields || {}),
                avatar_url: avatarUrl
              };
              console.log('[LicitatorAvatar] Updating product:', {
                productId: product.id,
                oldCustomFields: product.custom_fields,
                newCustomFields: updatedCustomFields
              });
              return supabase
                .from('products')
                .update({ custom_fields: updatedCustomFields })
                .eq('id', product.id);
            });

            const results = await Promise.all(updatePromises);
            console.log('[LicitatorAvatar] Sync results:', results);
          } else {
            console.warn('[LicitatorAvatar] No products found for user:', userInfo.supabaseUserId);
          }
        } catch (syncError) {
          console.error('Error syncing avatar to custom_fields:', syncError);
          // Don't throw error, just log it - the main save was successful
        }

        // Update local state
        setLicitatorData(prev => ({ ...prev, licitatorAvatar: avatarUrl }));
        setLicitatorAvatarFile(null);
        setLicitatorAvatarPreview(null);

        // Dispatch event to sync with other components
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('licitatorDataUpdated', {
            detail: {
              ...licitatorData,
              licitatorAvatar: avatarUrl
            }
          }));
        }

        setLicitatorMessage({
          type: 'success',
          text: 'Avatarul pentru cardul de business a fost încărcat și salvat automat!',
        });
      } catch (error: any) {
        console.error('Error uploading licitator avatar:', error);
        setLicitatorMessage({
          type: 'error',
          text: error.message || 'Eroare la încărcarea avatarului. Te rog încearcă din nou.',
        });
        // Reset preview on error
        setLicitatorAvatarFile(null);
        setLicitatorAvatarPreview(null);
      } finally {
        setIsUploadingLicitatorAvatar(false);
      }
    } else {
      setLicitatorAvatarFile(null);
      setLicitatorAvatarPreview(null);
    }
  };

  const handleLicitatorAvatarUpload = async () => {
    if (!licitatorAvatarFile || !userInfo.supabaseUserId) {
      setLicitatorMessage({
        type: 'error',
        text: 'Te rog selectează o imagine și asigură-te că ești autentificat.',
      });
      return;
    }

    setIsUploadingLicitatorAvatar(true);
    setLicitatorMessage(null);

    try {
      const uploadData = await uploadImageFile(licitatorAvatarFile, { fetchImpl: dashboardApiFetch });
      if (!uploadData.success) {
        throw new Error(uploadData.error);
      }
      if (!uploadData.url) {
        throw new Error('Eroare la încărcarea imaginii');
      }
      const avatarUrl = uploadData.url;

      // Update user_profiles with new avatar_url
      const { error: updateError } = await supabase
        .from('user_profiles')
        .upsert({
          user_id: userInfo.supabaseUserId,
          avatar_url: avatarUrl
        }, {
          onConflict: 'user_id'
        });

      if (updateError) {
        throw updateError;
      }

      // Sync avatar_url to custom_fields for all products of this executor
      try {
        // Get all products for this executor
        const { data: products, error: productsError } = await supabase
          .from('products')
          .select('id, custom_fields')
          .eq('user_id', userInfo.supabaseUserId);

        console.log('[LicitatorAvatar] Syncing avatar to custom_fields:', {
          userId: userInfo.supabaseUserId,
          avatarUrl,
          productsCount: products?.length || 0,
          productsError
        });

        if (!productsError && products && products.length > 0) {
          // Update custom_fields for each product
          const updatePromises = products.map((product: { id: string; custom_fields?: Record<string, unknown> | null }) => {
            const updatedCustomFields = {
              ...(product.custom_fields || {}),
              avatar_url: avatarUrl
            };
            console.log('[LicitatorAvatar] Updating product:', {
              productId: product.id,
              oldCustomFields: product.custom_fields,
              newCustomFields: updatedCustomFields
            });
            return supabase
              .from('products')
              .update({ custom_fields: updatedCustomFields })
              .eq('id', product.id);
          });

          const results = await Promise.all(updatePromises);
          console.log('[LicitatorAvatar] Sync results:', results);
        } else {
          console.warn('[LicitatorAvatar] No products found for user:', userInfo.supabaseUserId);
        }
      } catch (syncError) {
        console.error('Error syncing avatar to custom_fields:', syncError);
        // Don't throw error, just log it - the main save was successful
      }

      // Update local state
      setLicitatorData(prev => ({ ...prev, licitatorAvatar: avatarUrl }));
      setLicitatorAvatarFile(null);
      setLicitatorAvatarPreview(null);

      // Dispatch event to sync with other components
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('licitatorDataUpdated', {
          detail: {
            ...licitatorData,
            licitatorAvatar: avatarUrl
          }
        }));
      }

      setLicitatorMessage({
        type: 'success',
        text: 'Avatarul pentru cardul de business a fost încărcat cu succes!',
      });
    } catch (error: any) {
      console.error('Error uploading licitator avatar:', error);
      setLicitatorMessage({
        type: 'error',
        text: error.message || 'Eroare la încărcarea avatarului. Te rog încearcă din nou.',
      });
    } finally {
      setIsUploadingLicitatorAvatar(false);
    }
  };

  const handleImport = async () => {
    if (importType === 'file') {
      if (!file) {
        setImportMessage({
          type: 'error',
          text: 'Te rog selectează un fișier',
        });
        return;
      }
    } else if (importType === 'url') {
      if (!url.trim()) {
        setImportMessage({
          type: 'error',
          text: 'Te rog introdu un URL valid',
        });
        return;
      }
    }

    setIsImporting(true);
    setImportMessage(null);
    setProcessingProgress({
      status: 'Început procesare...',
      currentStep: 'Se încarcă fișierul...',
      progress: 0,
    });

    // Simulează progres incremental
    let currentProgress = 0;
    
    // Cleanup interval-uri existente
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current);
      progressIntervalRef.current = null;
    }
    
    const updateProgress = (targetProgress: number, step: string, status: string) => {
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
        progressIntervalRef.current = null;
      }
      
      const increment = targetProgress > currentProgress ? 1 : -1;
      const stepSize = Math.abs(targetProgress - currentProgress) / 20; // 20 pași pentru tranziție lină
      
      progressIntervalRef.current = setInterval(() => {
        if ((increment > 0 && currentProgress < targetProgress) || (increment < 0 && currentProgress > targetProgress)) {
          currentProgress = Math.min(Math.max(currentProgress + stepSize * increment, 0), 100);
          setProcessingProgress({
            status,
            currentStep: step,
            progress: Math.round(currentProgress),
          });
        } else {
          if (progressIntervalRef.current) {
            clearInterval(progressIntervalRef.current);
            progressIntervalRef.current = null;
          }
          currentProgress = targetProgress;
          setProcessingProgress({
            status,
            currentStep: step,
            progress: targetProgress,
          });
        }
      }, 100); // Actualizează la fiecare 100ms pentru animație lină
    };

    try {
      let response: Response;

      // Obține userId și token pentru autentificare
      const { data: sessionData } = await supabase.auth.getSession();
      const userId = sessionData.session?.user?.id;
      const accessToken = sessionData.session?.access_token;

      if (!userId) {
        setImportMessage({
          type: 'error',
          text: 'Nu ești autentificat. Te rog reconectează-te.',
        });
        setIsImporting(false);
        if (progressIntervalRef.current) {
          clearInterval(progressIntervalRef.current);
          progressIntervalRef.current = null;
        }
        return;
      }

      if (importType === 'file') {
        // Detectează automat tipul fișierului din extensie
        const fileName = file!.name.toLowerCase();
        let detectedType = 'other';
        if (fileName.endsWith('.pdf')) {
          detectedType = 'pdf';
        } else if (fileName.endsWith('.csv')) {
          detectedType = 'csv';
        } else if (fileName.endsWith('.xml')) {
          detectedType = 'xml';
        } else if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls')) {
          detectedType = 'excel';
        }
        
        const formData = new FormData();
        formData.append('file', file!);
        formData.append('sourceType', detectedType);
        formData.append('autoCreate', 'true');
        formData.append('userId', userId);

        // Progres incremental: 10% -> 30%
        updateProgress(10, 'Se încarcă fișierul...', 'Încărcare fișier...');
        await new Promise(resolve => setTimeout(resolve, 300));
        
        updateProgress(30, 'GoBid AI analizează conținutul...', 'Procesare cu GoBid AI...');
        
        const fetchPromise = dashboardApiFetch('/api/executor/import/process', {
          method: 'POST',
          headers: accessToken ? {
          } : {},
          body: formData,
        });

        // Simulează progres în timpul procesării (30% -> 70%) - mai lent pentru a nu ajunge prea repede
        const progressSimulation = setInterval(() => {
          if (currentProgress < 70) {
            // Crește mai lent: 0.5% la fiecare 300ms în loc de 2% la fiecare 200ms
            currentProgress = Math.min(currentProgress + 0.5, 70);
            setProcessingProgress({
              status: 'Procesare cu GoBid AI...',
              currentStep: 'GoBid AI analizează conținutul...',
              progress: Math.round(currentProgress),
            });
          }
        }, 300);

        response = await fetchPromise;
        clearInterval(progressSimulation);
      } else {
        updateProgress(10, 'Se descarcă URL-ul...', 'Descărcare conținut...');
        await new Promise(resolve => setTimeout(resolve, 200));
        
        updateProgress(30, 'GoBid AI analizează URL-ul...', 'Procesare cu GoBid AI...');
        
        const fetchPromise = dashboardApiFetch('/api/executor/import/process', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            url: url.trim(),
            sourceType: importType,
            autoCreate: true,
            userId: userId,
          }),
        });

        // Simulează progres în timpul procesării (30% -> 70%) - mai lent pentru a nu ajunge prea repede
        const progressSimulation = setInterval(() => {
          if (currentProgress < 70) {
            // Crește mai lent: 0.5% la fiecare 300ms în loc de 2% la fiecare 200ms
            currentProgress = Math.min(currentProgress + 0.5, 70);
            setProcessingProgress({
              status: 'Procesare cu GoBid AI...',
              currentStep: 'GoBid AI analizează URL-ul...',
              progress: Math.round(currentProgress),
            });
          }
        }, 300);

        response = await fetchPromise;
        clearInterval(progressSimulation);
      }

      // Progres: 70% -> 90% (mai rapid după ce ajunge la 70%)
      updateProgress(75, 'GoBid AI extrage produsele...', 'Extragere date...');
      await new Promise(resolve => setTimeout(resolve, 200));
      
      updateProgress(90, 'Procesare date...', 'Extragere date...');
      await new Promise(resolve => setTimeout(resolve, 200));

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        const errorMessage = errorData.error || errorData.message || `Eroare HTTP ${response.status}`;
        throw new Error(errorMessage);
      }

      const result = await response.json();

      console.log('🔵 [HandleImport] Result:', {
        success: result.success,
        autoCreated: result.autoCreated,
        createdCount: result.createdCount,
        productsCount: result.products?.length || 0,
        userId: result.userId,
        message: result.message,
      });

      if (result.success) {
        // Progres final: 90% -> 100% (rapid)
        updateProgress(100, `Găsite ${result.products?.length || 0} produse`, 'Completat!');
        
        // Cleanup interval dacă există
        if (progressIntervalRef.current) {
          clearInterval(progressIntervalRef.current);
          progressIntervalRef.current = null;
        }

        if (result.products && result.products.length > 0) {
          setExtractedProducts(result.products);
          if (result.autoCreated && result.createdCount > 0) {
            setImportMessage({
              type: 'success',
              text: `Import reușit! ${result.createdCount} produse au fost create automat și salvate în baza de date pentru executor.`,
            });
            // Reload products immediately and after a short delay
            console.log('🔵 [HandleImport] Reloading products after auto-create...');
            await loadProducts();
            setTimeout(() => {
              loadProducts(); // Reload again to ensure fresh data
              setShowImportModal(false);
              setExtractedProducts([]);
              setFile(null);
              setUrl('');
            }, 2000);
          } else {
            setImportMessage({
              type: 'success',
              text: `Import reușit! Găsite ${result.products.length} produse. Selectează produsele pe care vrei să le creezi.`,
            });
          }
        } else {
          setImportMessage({
            type: 'success',
            text: 'Import reușit! Verifică rezultatele mai jos.',
          });
        }
      } else {
        throw new Error(result.error || 'Import failed');
      }
    } catch (error: any) {
      console.error('Error importing:', error);
      
      // Cleanup interval dacă există
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
        progressIntervalRef.current = null;
      }
      
      // Mesaje de eroare mai clare pentru utilizator
      let errorMessage = error.message || 'Eroare necunoscută la import';
      
      if (error.message?.includes('PDF') || error.message?.includes('pdf')) {
        errorMessage = error.message;
      } else if (error.message?.includes('prea mare') || error.message?.includes('too large')) {
        errorMessage = error.message;
      } else if (error.message?.includes('autentificat') || error.message?.includes('authenticated')) {
        errorMessage = 'Nu ești autentificat. Te rog reconectează-te și încearcă din nou.';
      } else if (error.message?.includes('HTTP 400') || error.message?.includes('HTTP 500')) {
        errorMessage = error.message.replace('HTTP 400', '').replace('HTTP 500', '').trim() || 'Eroare la procesarea fișierului. Te rog verifică formatul și încearcă din nou.';
      }
      
      setImportMessage({
        type: 'error',
        text: errorMessage,
      });
    } finally {
      // Cleanup final pentru toate interval-urile
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
        progressIntervalRef.current = null;
      }
      
      setIsImporting(false);
      setTimeout(() => {
        setProcessingProgress(null);
      }, 5000);
    }
  };

  const handleCreateSelectedProducts = async () => {
    if (selectedProducts.length === 0) {
      setImportMessage({
        type: 'error',
        text: 'Te rog selectează cel puțin un produs',
      });
      return;
    }

    setIsCreatingProducts(true);
    setImportMessage(null);

    try {
      // Obține userId și token pentru autentificare
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      const userId = sessionData.session?.user?.id;
      const accessToken = sessionData.session?.access_token;

      console.log('🔵 [CreateSelectedProducts] Session check:', {
        hasSession: !!sessionData.session,
        hasUser: !!sessionData.session?.user,
        userId: userId,
        hasToken: !!accessToken,
        sessionError: sessionError?.message,
      });

      if (!userId) {
        console.error('❌ [CreateSelectedProducts] No userId found');
        setImportMessage({
          type: 'error',
          text: 'Nu ești autentificat. Te rog reconectează-te.',
        });
        setIsCreatingProducts(false);
        return;
      }

      const productsToCreate = extractedProducts.filter((_, index) =>
        selectedProducts.includes(index)
      );

      console.log('🔵 [CreateSelectedProducts] Creating products:', {
        count: productsToCreate.length,
        userId: userId,
        hasAccessToken: !!accessToken,
        productTitles: productsToCreate.map(p => p.title),
      });

      const requestBody = {
        products: productsToCreate,
        userId: userId,
      };

      console.log('🔵 [CreateSelectedProducts] Request body:', {
        productsCount: requestBody.products.length,
        userId: requestBody.userId,
        hasUserId: !!requestBody.userId,
      });

      const response = await dashboardApiFetch('/api/executor/import/create-products', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      console.log('🔵 [CreateSelectedProducts] Response status:', response.status);

      const result = await response.json();

      if (result.success) {
        console.log('✅ [CreateProducts] Success:', result);
        console.log('✅ [CreateProducts] Created product IDs:', result.createdProductIds);
        console.log('✅ [CreateProducts] UserId used:', result.userId);
        console.log('❌ [CreateProducts] Failed products:', result.failedProducts);
        
        if (result.failedCount > 0) {
          setImportMessage({
            type: 'error',
            text: `Eroare la crearea produselor: ${result.failedProducts?.map((f: any) => `${f.title || f} (${f.error || 'eroare necunoscută'})`).join(', ') || 'Eroare necunoscută'}`,
          });
        } else {
          setImportMessage({
            type: 'success',
            text: `Creat cu succes ${result.createdCount} produs(e)! Produsele au fost salvate în baza de date.`,
          });
        }
        setExtractedProducts([]);
        setSelectedProducts([]);
        setFile(null);
        setUrl('');
        
        // Reload products immediately and again after delay
        console.log('🔵 [CreateProducts] Reloading products...');
        await loadProducts();
        
        // Close modal after a short delay and reload again
        setTimeout(() => {
          loadProducts(); // Reload again to ensure fresh data
          setShowImportModal(false);
        }, 2000);
      } else {
        throw new Error(result.error || 'Failed to create products');
      }
    } catch (error: any) {
      console.error('Error creating products:', error);
      setImportMessage({
        type: 'error',
        text: `Eroare la crearea produselor: ${error.message}`,
      });
    } finally {
      setIsCreatingProducts(false);
    }
  };

  return (
    <div className={`min-h-screen flex flex-col transition-all duration-300 relative ${
      isDarkMode 
        ? 'bg-gradient-to-br from-gray-900/30 via-gray-800/30 to-gray-700/30' 
        : 'bg-gradient-to-br from-gray-50/30 via-white/30 to-gray-50/30'
    }`}>
      {/* Background Emblem */}
      <div 
        className="fixed inset-0 z-0 bg-cover bg-center bg-no-repeat opacity-[0.06] dark:opacity-[0.08] md:opacity-[0.04] md:dark:opacity-[0.05]"
        style={{ backgroundImage: `url(${bgEmblem})` }}
      />

      <UniversalHeader 
        isDarkMode={isDarkMode} 
        onToggleDarkMode={toggleDarkMode}
      />

      {/* Panel Badge */}
      <div className="fixed top-20 right-2 md:top-24 md:right-4 z-0">
        <div className={`inline-flex items-center gap-1.5 md:gap-2 px-2 py-1 md:px-3 md:py-1.5 rounded-lg ${
          isDarkMode 
            ? 'bg-blue-600/20 border border-blue-500/30' 
            : 'bg-blue-50 border border-blue-200'
        }`}>
          <i className={`ri-shield-user-line text-xs md:text-sm ${
            isDarkMode ? 'text-blue-300' : 'text-blue-600'
          }`}></i>
          <span className={`text-[10px] md:text-xs font-medium ${
            isDarkMode ? 'text-blue-200' : 'text-blue-700'
          }`}>
            {basePath?.includes("lichidator") ? "Panel privat pentru lichidatori" : "Panel privat de executori"}
          </span>
        </div>
      </div>
      
      
      <div className="container mx-auto max-w-7xl px-2 sm:px-4 py-4 sm:py-8 flex-1 relative z-10">
        {/* Header */}
        <div className="mb-3 sm:mb-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-4 mb-3 sm:mb-4">
            <div className="flex-1 mb-4">
              <div className="flex items-center gap-3">
                <BackButton fallbackHref={basePath} label="Înapoi" className="shadow-md" />
                
                <h1 className={`text-xl sm:text-2xl md:text-3xl font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                  Licitațiile mele
                </h1>
              </div>
            </div>
            <div className="flex flex-row gap-2 w-full sm:w-auto flex-wrap">
              <button
                onClick={() => setShowLicitatorModal(true)}
                className={`px-2 sm:px-4 py-2 sm:py-3 rounded-lg font-semibold text-xs sm:text-base transition-colors flex-1 sm:flex-none ${
                  isDarkMode
                    ? 'bg-gray-600 hover:bg-gray-500 text-white border border-gray-500'
                    : 'bg-gray-100 hover:bg-gray-200 text-gray-800 border border-gray-300'
                } shadow`}
              >
                <i className="ri-user-settings-line mr-1 sm:mr-2"></i>
                <span className="hidden sm:inline">{basePath?.includes("lichidator") ? "Date Contact Lichidator" : "Date Contact Executor"}</span>
                <span className="sm:hidden">Contact</span>
              </button>
              <button
                onClick={() => setShowImportModal(true)}
                className={`px-2 sm:px-6 py-2 sm:py-3 rounded-lg font-semibold text-xs sm:text-base transition-colors flex-1 sm:flex-none ${
                  isDarkMode
                    ? 'bg-blue-600 hover:bg-blue-700 text-white'
                    : 'bg-blue-500 hover:bg-blue-600 text-white'
                } shadow-lg`}
              >
                <i className="ri-robot-line mr-1 sm:mr-2"></i>
                <span>Import GoBid AI</span>
              </button>
              <button
                onClick={() => setShowManualAddModal(true)}
                className={`px-2 sm:px-6 py-2 sm:py-3 rounded-lg font-semibold text-xs sm:text-base transition-colors flex-1 sm:flex-none ${
                  isDarkMode
                    ? 'bg-blue-600 hover:bg-blue-700 text-white'
                    : 'bg-blue-500 hover:bg-blue-600 text-white'
                } shadow-lg`}
              >
                <i className="ri-file-list-3-line mr-1 sm:mr-2"></i>
                <span className="hidden sm:inline">Adaugă listare manuală</span>
                <span className="sm:hidden">Listare</span>
              </button>
            </div>
          </div>

          {/* Premium Promotion Banner - 4,99 Lei pentru executori */}
          <div className={`mb-3 sm:mb-6 rounded-xl overflow-hidden shadow-xl backdrop-blur-sm ${
            isDarkMode 
              ? 'bg-gradient-to-r from-yellow-600/70 via-yellow-500/70 to-yellow-600/70' 
              : 'bg-gradient-to-r from-yellow-400/70 via-yellow-300/70 to-yellow-400/70'
          }`}>
            <div className="p-3 sm:p-4 md:p-6 lg:p-8">
              <div className="flex flex-col md:flex-row items-center justify-between gap-3 sm:gap-4 md:gap-6">
                <div className="flex-1 w-full">
                  <div className="flex items-center gap-2 sm:gap-3 mb-2 sm:mb-3">
                    <i className="ri-vip-crown-line text-xl sm:text-2xl md:text-3xl text-yellow-900"></i>
                    <h3 className={`text-lg sm:text-xl md:text-2xl lg:text-3xl font-bold ${isDarkMode ? 'text-yellow-900' : 'text-yellow-900'}`}>
                      Promovare Premium
                    </h3>
                  </div>
                  <p className={`text-xs sm:text-sm md:text-base lg:text-lg mb-2 sm:mb-3 md:mb-4 ${isDarkMode ? 'text-yellow-800' : 'text-yellow-900'}`}>
                    Promovează anunțurile tale în prima pagină și obține vizibilitate maximă!
                  </p>
                  <div className="flex flex-wrap gap-2 sm:gap-3 md:gap-4 text-xs sm:text-sm">
                    <div className="flex items-center gap-1 sm:gap-2">
                      <i className="ri-checkbox-circle-fill text-yellow-900"></i>
                      <span className={isDarkMode ? 'text-yellow-800' : 'text-yellow-900'}>Poziție prioritară</span>
                    </div>
                    <div className="flex items-center gap-1 sm:gap-2">
                      <i className="ri-checkbox-circle-fill text-yellow-900"></i>
                      <span className={isDarkMode ? 'text-yellow-800' : 'text-yellow-900'}>Badge Premium</span>
                    </div>
                    <div className="flex items-center gap-1 sm:gap-2">
                      <i className="ri-checkbox-circle-fill text-yellow-900"></i>
                      <span className={isDarkMode ? 'text-yellow-800' : 'text-yellow-900'}>+300% vizualizări</span>
                    </div>
                  </div>
                </div>
                <div className="flex flex-col items-center md:items-end gap-2 sm:gap-3 md:gap-4 w-full sm:w-auto">
                  <div className="text-center md:text-right">
                    <div className={`text-2xl sm:text-3xl md:text-4xl font-bold ${isDarkMode ? 'text-yellow-900' : 'text-yellow-900'}`}>
                      4,99 Lei
                    </div>
                    <div className={`text-xs sm:text-sm ${isDarkMode ? 'text-yellow-800' : 'text-yellow-900'}`}>
                      per anunț pe săptămână
                    </div>
                  </div>
                  <button
                    onClick={async () => {
                      setShowPremiumModal(true);
                      await loadUserCredit();
                    }}
                    className={`w-full sm:w-auto px-4 sm:px-6 py-2 sm:py-3 rounded-lg font-bold text-xs sm:text-sm md:text-base transition-all ${
                      isDarkMode
                        ? 'bg-yellow-900 hover:bg-yellow-800 text-white'
                        : 'bg-yellow-900 hover:bg-yellow-800 text-white'
                    } shadow-lg hover:shadow-xl transform hover:scale-105`}
                  >
                    <i className="ri-star-fill mr-1 sm:mr-2"></i>
                    Activează Premium
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-4 gap-1.5 sm:gap-4 mb-3 sm:mb-6">
            <button
              onClick={() => setFilterStatus('all')}
              className={`p-1.5 sm:p-4 rounded-lg transition-all shadow-sm hover:shadow-md active:scale-95 ${
                isDarkMode ? 'bg-gray-800/50 hover:bg-gray-700/50 backdrop-blur-sm' : 'bg-white/50 hover:bg-gray-50/50 backdrop-blur-sm'
              } ${
                filterStatus === 'all'
                  ? isDarkMode
                    ? 'ring-2 ring-blue-500'
                    : 'ring-2 ring-blue-500'
                  : ''
              }`}
            >
              <p className={`text-xs sm:text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>Total</p>
              <p className={`text-sm sm:text-xl md:text-2xl font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                {products.length}
              </p>
            </button>
            <button
              onClick={() => setFilterStatus('active')}
              className={`p-1.5 sm:p-4 rounded-lg transition-all shadow-sm hover:shadow-md active:scale-95 ${
                isDarkMode ? 'bg-gray-800/50 hover:bg-gray-700/50 backdrop-blur-sm' : 'bg-white/50 hover:bg-gray-50/50 backdrop-blur-sm'
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
              onClick={() => setFilterStatus('pending')}
              className={`p-1.5 sm:p-4 rounded-lg transition-all shadow-sm hover:shadow-md active:scale-95 ${
                isDarkMode ? 'bg-gray-800/50 hover:bg-gray-700/50 backdrop-blur-sm' : 'bg-white/50 hover:bg-gray-50/50 backdrop-blur-sm'
              } ${
                filterStatus === 'pending'
                  ? isDarkMode
                    ? 'ring-2 ring-orange-500'
                    : 'ring-2 ring-orange-500'
                  : ''
              }`}
            >
              <p className={`text-xs sm:text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>În așteptare</p>
              <p className={`text-sm sm:text-xl md:text-2xl font-bold ${isDarkMode ? 'text-orange-400' : 'text-orange-600'}`}>
                {pendingProducts.length}
              </p>
            </button>
            <button
              onClick={() => setFilterStatus('draft')}
              className={`p-1.5 sm:p-4 rounded-lg transition-all shadow-sm hover:shadow-md active:scale-95 ${
                isDarkMode ? 'bg-gray-800/50 hover:bg-gray-700/50 backdrop-blur-sm' : 'bg-white/50 hover:bg-gray-50/50 backdrop-blur-sm'
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
          </div>

          {/* Search */}
          <div className={`p-3 sm:p-4 rounded-lg shadow-sm mb-4 sm:mb-6 backdrop-blur-sm ${
            isDarkMode ? 'bg-gray-800/50' : 'bg-white/50'
          }`}>
            <input
              type="text"
              placeholder="Caută după titlu, SKU sau categorie..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className={`w-full px-3 sm:px-4 py-2 rounded-lg border text-sm sm:text-base focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                isDarkMode 
                  ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400' 
                  : 'bg-white/30 border-gray-300/50 text-gray-900 placeholder-gray-500'
              }`}
            />
          </div>
        </div>

        {/* Products Table */}
        {isLoading ? (
          <div className={`text-center py-12 ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
            <div className={`animate-spin rounded-full h-12 w-12 border-b-2 mx-auto mb-4 ${
              isDarkMode ? 'border-blue-400' : 'border-blue-600'
            }`}></div>
            <p>Se încarcă produsele...</p>
          </div>
        ) : filteredProducts.length === 0 ? (
          <div className={`text-center py-12 rounded-lg shadow-sm backdrop-blur-sm ${
            isDarkMode ? 'bg-gray-800/50' : 'bg-white/50'
          }`}>
            <i className={`ri-inbox-line text-6xl mb-4 ${
              isDarkMode ? 'text-gray-600' : 'text-gray-400'
            }`}></i>
            <p className={`text-lg font-semibold mb-2 ${
              isDarkMode ? 'text-gray-300' : 'text-gray-700'
            }`}>
              Nu ai produse {filterStatus !== 'all' ? filterStatus === 'active' ? 'active' : 'în așteptare' : ''}
            </p>
            <p className={`mb-4 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
              {searchTerm ? 'Încearcă alt termen de căutare' : 'Adaugă primul tău produs pentru a începe'}
            </p>
            {!searchTerm && (
              <button
                onClick={() => router.push(`${basePath}/add-auction`)}
                className={`px-6 py-3 rounded-lg font-semibold transition-colors text-white shadow-lg ${
                  isDarkMode 
                    ? 'bg-blue-700 hover:bg-blue-800' 
                    : 'bg-blue-600 hover:bg-blue-700'
                }`}
              >
                <i className="ri-add-circle-line mr-2"></i>
                Adaugă produs nou
              </button>
            )}
          </div>
        ) : (
          <>
            {/* Desktop Table View */}
            <div className={`hidden md:block rounded-lg shadow-sm overflow-hidden backdrop-blur-sm ${
              isDarkMode ? 'bg-gray-800/50' : 'bg-white/50'
            }`}>
            <div className="overflow-x-auto">
              <table className="w-full table-fixed">
                <thead className={isDarkMode ? 'bg-gray-900/50 backdrop-blur-sm' : 'bg-gray-50/50 backdrop-blur-sm'}>
                  <tr>
                    <th className={`px-6 py-3 text-left text-xs font-medium uppercase tracking-wider w-[30%] max-w-[30%] ${
                      isDarkMode ? 'text-gray-300' : 'text-gray-700'
                    }`}>
                      Produs
                    </th>
                    <th className={`px-6 py-3 text-left text-xs font-medium uppercase tracking-wider w-[15%] ${
                      isDarkMode ? 'text-gray-300' : 'text-gray-700'
                    }`}>
                      Categorie
                    </th>
                    <th className={`px-6 py-3 text-left text-xs font-medium uppercase tracking-wider w-[12%] ${
                      isDarkMode ? 'text-gray-300' : 'text-gray-700'
                    }`}>
                      Preț
                    </th>
                    <th className={`px-6 py-3 text-left text-xs font-medium uppercase tracking-wider w-[12%] ${
                      isDarkMode ? 'text-gray-300' : 'text-gray-700'
                    }`}>
                      Status
                    </th>
                    <th className={`px-6 py-3 text-right text-xs font-medium uppercase tracking-wider w-[20%] ${
                      isDarkMode ? 'text-gray-300' : 'text-gray-700'
                    }`}>
                      Acțiuni
                    </th>
                  </tr>
                </thead>
                <tbody className={`divide-y ${isDarkMode ? 'divide-gray-700' : 'divide-gray-200'}`}>
                  {filteredProducts.map((product) => (
                    <React.Fragment key={product.id}>
                    <tr className={isDarkMode ? 'hover:bg-gray-700/40' : 'hover:bg-gray-50/40'}>
                      <td className="px-6 py-4">
                        <div className="flex items-center min-w-0">
                          <img
                            src={getProductDisplayImage(product)}
                            alt={product.title}
                            className="h-12 w-12 rounded-lg object-cover mr-3 flex-shrink-0"
                          />
                          <div className="min-w-0 flex-1">
                            <a
                              href={product.url || (product.slug ? `/licitatii-publice/${product.slug}` : `/produs/${product.id}`)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className={`text-sm font-medium hover:underline break-words line-clamp-2 ${
                                isDarkMode 
                                  ? 'text-blue-400 hover:text-blue-300' 
                                  : 'text-blue-600 hover:text-blue-700'
                              }`}
                              title={product.title || 'Fără titlu'}
                            >
                              {product.title || 'Fără titlu'}
                            </a>
                            <div className={`text-xs mt-1 break-all ${
                              isDarkMode ? 'text-gray-400' : 'text-gray-500'
                            }`}>
                              SKU: {product.sku || 'N/A'}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className={`px-6 py-4 whitespace-nowrap text-sm ${
                        isDarkMode ? 'text-gray-300' : 'text-gray-700'
                      }`}>
                        {product.category || 'N/A'}
                        {product.subcategory && (
                          <div className={`text-xs ${
                            isDarkMode ? 'text-gray-400' : 'text-gray-500'
                          }`}>
                            {product.subcategory}
                          </div>
                        )}
                      </td>
                      <td className={`px-6 py-4 whitespace-nowrap text-sm font-medium ${
                        isDarkMode ? 'text-white' : 'text-gray-900'
                      }`}>
                        {formatPrice(product.startingPrice, product.currency)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap min-w-[120px]">
                        <div className="flex flex-col gap-1">
                          {getStatusBadge(product.status, product.approvalStatus)}
                          {product.approvalStatus === 'rejected' && product.rejectionReason && (
                            <div className={`text-xs break-words ${
                              isDarkMode ? 'text-red-400' : 'text-red-600'
                            }`}>
                              {product.rejectionReason}
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right text-sm font-medium">
                        <div className="flex flex-col items-end gap-2">
                          <div className="flex items-center justify-end gap-1.5 flex-shrink-0">
                          {product.status === 'draft' ? (
                            <>
                              <button
                                onClick={() => handleActivateProduct(product.id)}
                                className={`px-2 py-1 rounded-lg transition-colors text-white text-xs whitespace-nowrap ${
                                  isDarkMode
                                    ? 'bg-green-600 hover:bg-green-700'
                                    : 'bg-green-500 hover:bg-green-600'
                                }`}
                                title="Activează anunțul"
                              >
                                <i className="ri-eye-line text-xs"></i>
                                <span className="hidden lg:inline ml-1">Activează</span>
                              </button>
                              <button
                                onClick={() => handleDelete(product.id, product.title)}
                                className={`px-2 py-1 rounded-lg transition-colors text-white whitespace-nowrap ${
                                  isDarkMode
                                    ? 'bg-red-600 hover:bg-red-700'
                                    : 'bg-red-500 hover:bg-red-600'
                                }`}
                                title="Șterge (ascunde) anunțul"
                              >
                                <i className="ri-delete-bin-line text-xs"></i>
                                <span className="hidden lg:inline ml-1">Șterge</span>
                              </button>
                            </>
                          ) : (
                            <>
                              {productBids[product.id] && productBids[product.id].length > 0 && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    e.preventDefault();
                                    setExpandedProducts(prev => ({
                                      ...prev,
                                      [product.id]: !prev[product.id]
                                    }));
                                  }}
                                  className={`px-2 py-1 rounded-lg transition-all text-white text-xs whitespace-nowrap flex items-center gap-1.5 shadow-sm hover:shadow-md ${
                                    isDarkMode 
                                      ? 'bg-green-600 hover:bg-green-700' 
                                      : 'bg-green-500 hover:bg-green-600'
                                  }`}
                                  title="Vezi ofertele"
                                >
                                  <i className="ri-arrow-right-line text-xs"></i>
                                  <span className="hidden lg:inline">Vezi ofertele</span>
                                  <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-red-500 text-white">
                                    {productBids[product.id].filter((b: any) => !b.is_winning).length}
                                  </span>
                                </button>
                              )}
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  e.preventDefault();
                                  handleEdit(product.id);
                                }}
                                className={`px-2 py-1 rounded-lg transition-colors text-white text-xs whitespace-nowrap ${
                                  isDarkMode 
                                    ? 'bg-blue-600 hover:bg-blue-700' 
                                    : 'bg-blue-500 hover:bg-blue-600'
                                }`}
                                title="Editează produs"
                              >
                                <i className="ri-edit-line text-xs"></i>
                                <span className="hidden lg:inline ml-1">Editează</span>
                              </button>
                              <button
                                onClick={() => handleDeactivateProduct(product.id)}
                                className={`px-2 py-1 rounded-lg transition-colors text-white text-xs whitespace-nowrap ${
                                  isDarkMode
                                    ? 'bg-amber-600 hover:bg-amber-700'
                                    : 'bg-amber-500 hover:bg-amber-600'
                                }`}
                                title="Dezactivează anunțul"
                              >
                                <i className="ri-eye-off-line text-xs"></i>
                                <span className="hidden lg:inline ml-1">Dezactivează</span>
                              </button>
                              <button
                                onClick={() => handleDelete(product.id, product.title)}
                                className={`px-2 py-1 rounded-lg transition-colors text-white whitespace-nowrap ${
                                  isDarkMode
                                    ? 'bg-red-600 hover:bg-red-700'
                                    : 'bg-red-500 hover:bg-red-600'
                                }`}
                                title="Șterge (ascunde) anunțul"
                              >
                                <i className="ri-delete-bin-line text-xs"></i>
                                <span className="hidden lg:inline ml-1">Șterge</span>
                              </button>
                            </>
                          )}
                          </div>
                          <div className={`text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                            {formatDate(product.createdAt)}
                          </div>
                        </div>
                      </td>
                    </tr>
                    {/* Secțiune expandabilă pentru oferte */}
                    {expandedProducts[product.id] && (
                      <tr>
                        <td colSpan={5} className={`px-6 py-4 backdrop-blur-sm ${isDarkMode ? 'bg-gray-800/50' : 'bg-gray-50/50'}`}>
                          {loadingBids[product.id] ? (
                            <div className="text-center py-8">
                              <div className={`animate-spin rounded-full h-8 w-8 border-b-2 mx-auto ${
                                isDarkMode ? 'border-blue-400' : 'border-blue-600'
                              }`}></div>
                              <p className={`mt-2 text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>Se încarcă ofertele...</p>
                            </div>
                          ) : productBids[product.id] && productBids[product.id].length > 0 ? (
                            <div className="space-y-3">
                              <h4 className={`text-sm font-semibold mb-3 ${
                                isDarkMode ? 'text-gray-300' : 'text-gray-700'
                              }`}>
                                <i className="ri-history-line mr-2"></i>
                                Istoric oferte ({productBids[product.id].length})
                              </h4>
                              {productBids[product.id]
                                .sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
                                .map((bid: any) => {
                                  const isSellerBid = bid.user_id === userInfo.supabaseUserId;
                                  const isBuyerBid = bid.user_id !== userInfo.supabaseUserId;
                                  const highestBid = Math.max(...productBids[product.id].map((b: any) => b.amount));
                                  
                                  // Verifică dacă este contraoferta (există oferte anterioare de la celălalt tip de utilizator)
                                  const hasPreviousBuyerBids = productBids[product.id].some((b: any) => 
                                    b.user_id !== userInfo.supabaseUserId && 
                                    new Date(b.created_at).getTime() < new Date(bid.created_at).getTime()
                                  );
                                  const hasPreviousSellerBids = productBids[product.id].some((b: any) => 
                                    b.user_id === userInfo.supabaseUserId && 
                                    new Date(b.created_at).getTime() < new Date(bid.created_at).getTime()
                                  );
                                  
                                  return (
                                    <div
                                      key={bid.id}
                                      className={`p-4 rounded-xl transition-all duration-200 ${
                                        bid.is_winning
                                          ? isDarkMode
                                            ? 'bg-gradient-to-r from-green-900/40 via-green-800/30 to-green-900/40 border border-green-500/40 shadow-lg shadow-green-500/10'
                                            : 'bg-gradient-to-r from-green-50 via-white to-green-50/50 border border-green-300/60 shadow-md shadow-green-200/30'
                                          : isDarkMode
                                          ? 'bg-gray-700/50 border border-gray-600/50 hover:border-gray-500/70 hover:bg-gray-700/70'
                                          : 'bg-white/30 border border-gray-200/50 hover:border-gray-300/50 hover:shadow-md'
                                      }`}
                                    >
                                      <div className="flex items-center justify-between mb-3">
                                        <div className="flex-1">
                                          <div className={`text-2xl font-bold mb-1 ${
                                            isDarkMode ? 'text-white' : 'text-gray-900'
                                          }`}>
                                            {formatPrice(bid.amount, product.currency)}
                                          </div>
                                          <div className={`text-sm font-semibold ${
                                            isDarkMode ? 'text-gray-200' : 'text-gray-800'
                                          }`}>
                                            {isSellerBid ? 'Vânzător' : (
                                              bid.user_profiles 
                                                ? `${bid.user_profiles.first_name || ''} ${bid.user_profiles.last_name || ''}`.trim() || 'Cumpărător'
                                                : 'Cumpărător'
                                            )}
                                          </div>
                                          <div className={`text-xs flex items-center gap-1 mt-0.5 ${
                                            isDarkMode ? 'text-gray-400' : 'text-gray-500'
                                          }`}>
                                            <i className="ri-time-line text-xs"></i>
                                            {formatDate(bid.created_at)}
                                          </div>
                                        </div>
                                        <div className="flex items-center gap-2">
                                          {/* Badge Contraoferta - Albastru pentru vânzător */}
                                          {isSellerBid && hasPreviousBuyerBids && (
                                            <span className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-md ${
                                              isDarkMode
                                                ? 'bg-gradient-to-r from-blue-500 to-blue-600 text-white shadow-blue-500/30'
                                                : 'bg-gradient-to-r from-blue-400 to-blue-500 text-white shadow-blue-400/40'
                                            }`}>
                                              <i className="ri-arrow-left-right-line text-sm"></i>
                                              Contraoferta ta
                                            </span>
                                          )}
                                          {/* Badge Contraoferta - Roșu pentru cumpărător */}
                                          {isBuyerBid && hasPreviousSellerBids && (
                                            <span className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-md ${
                                              isDarkMode
                                                ? 'bg-gradient-to-r from-red-500 to-red-600 text-white shadow-red-500/30'
                                                : 'bg-gradient-to-r from-red-400 to-red-500 text-white shadow-red-400/40'
                                            }`}>
                                              <i className="ri-arrow-left-right-line text-sm"></i>
                                              Contraoferta cumpărătorului
                                            </span>
                                          )}
                                          {bid.is_winning && (
                                            <span className={`px-4 py-2 rounded-xl text-sm font-semibold flex items-center gap-2 shadow-md ${
                                              isDarkMode
                                                ? 'bg-gradient-to-r from-green-600 to-green-700 text-white shadow-green-500/30'
                                                : 'bg-gradient-to-r from-green-500 to-green-600 text-white shadow-green-400/40'
                                            }`}>
                                              <i className="ri-checkbox-circle-line"></i>
                                              <span>Acceptată</span>
                                            </span>
                                          )}
                                          {!bid.is_winning && bid.user_id !== userInfo.supabaseUserId && (
                                            <button
                                              onClick={async () => {
                                                try {
                                                  const { data: sessionData } = await supabase.auth.getSession();
                                                  if (!sessionData.session) {
                                                    alert('Trebuie să fii autentificat pentru a accepta oferte.');
                                                    return;
                                                  }

                                                  const response = await dashboardApiFetch('/api/bids/accept', {
                                                    method: 'POST',
                                                    headers: {
                                                      'Content-Type': 'application/json',
                                                    },
                                                    body: JSON.stringify({
                                                      product_id: product.id,
                                                      bid_id: bid.id,
                                                    }),
                                                  });

                                                  const result = await response.json();

                                                  if (!response.ok) {
                                                    alert(result.error || 'Eroare la acceptarea ofertei');
                                                    return;
                                                  }

                                                  // Reîncarcă ofertele
                                                  await loadProductBids(product.id);
                                                  alert('Oferta a fost acceptată cu succes!');
                                                } catch (error: any) {
                                                  console.error('Error accepting bid:', error);
                                                  alert('Eroare la acceptarea ofertei: ' + (error.message || 'Eroare necunoscută'));
                                                }
                                              }}
                                              className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all duration-200 flex items-center gap-2 shadow-md ${
                                                isDarkMode
                                                  ? 'bg-gradient-to-r from-green-600 to-green-700 hover:from-green-500 hover:to-green-600 text-white shadow-green-500/30 hover:shadow-lg hover:shadow-green-500/40 hover:scale-105 active:scale-95'
                                                  : 'bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white shadow-green-400/40 hover:shadow-lg hover:shadow-green-500/50 hover:scale-105 active:scale-95'
                                              }`}
                                            >
                                              <i className="ri-check-line"></i>
                                              <span>Acceptă</span>
                                            </button>
                                          )}
                                          {bid.user_id !== userInfo.supabaseUserId && (
                                            <button
                                              onClick={() => {
                                                const buyerName = bid.user_profiles 
                                                  ? `${bid.user_profiles.first_name || ''} ${bid.user_profiles.last_name || ''}`.trim() || 'Cumpărător'
                                                  : 'Cumpărător';
                                                setChatData({
                                                  productId: product.id,
                                                  buyerId: bid.user_id || '',
                                                  sellerId: userInfo.supabaseUserId || '',
                                                  otherUserInfo: {
                                                    name: buyerName,
                                                    avatar: bid.user_profiles?.avatar_url,
                                                  },
                                                });
                                                setShowChatModal(true);
                                              }}
                                              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all duration-200 flex items-center gap-2 shadow-md hover:shadow-lg hover:scale-105 active:scale-95 ${
                                                isDarkMode
                                                  ? 'bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-500 hover:to-blue-600 text-white border border-blue-500/30'
                                                  : 'bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white border border-blue-400/30'
                                              }`}
                                            >
                                              <i className="ri-message-3-line text-base"></i>
                                              <span>Chat</span>
                                            </button>
                                          )}
                                        </div>
                                      </div>
                                    </div>
                                  );
                                })}
                            </div>
                          ) : (
                            <div className={`text-center py-8 ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                              <i className="ri-inbox-line text-4xl mb-2"></i>
                              <p className="text-sm">Nu există oferte pentru acest produs</p>
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mobile Card View - Identic cu my-bids */}
          <div className="md:hidden space-y-2 sm:space-y-3">
            {filteredProducts.map((product) => {
              const bids = productBids[product.id] || [];
              const winningBids = bids.filter((b: any) => b.is_winning);
              const highestBid = bids.length > 0 ? Math.max(...bids.map((b: any) => b.amount)) : product.startingPrice;
              
              return (
                <div
                  key={product.id}
                  className={`rounded-lg sm:rounded-xl border overflow-hidden ${
                    isDarkMode
                      ? 'bg-white/5 border-white/10'
                      : 'bg-white/30 border-gray-200/50'
                  }`}
                >
                  {/* Header produs - compact: poză + titlu pe același rând */}
                  <div className={`p-2 sm:p-3 border-b ${
                    winningBids.length > 0
                      ? isDarkMode
                        ? 'border-green-500/50 bg-green-900/10'
                        : 'border-green-500 bg-green-50'
                      : isDarkMode
                      ? 'border-gray-700'
                      : 'border-gray-200'
                  }`}>
                    <div className="flex flex-row items-center gap-2 sm:gap-3">
                      <div className="relative flex-shrink-0">
                        <img
                          src={getProductDisplayImage(product)}
                          alt={product.title}
                          className="w-12 h-12 sm:w-14 sm:h-14 object-cover rounded-lg"
                          onError={(e) => {
                            (e.target as HTMLImageElement).src = '/no-image-placeholder.svg';
                          }}
                        />
                        {winningBids.length > 0 && (
                          <div className={`absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full flex items-center justify-center ${
                            isDarkMode ? 'bg-green-500 border-2 border-gray-800' : 'bg-green-500 border-2 border-white'
                          }`}>
                            <i className="ri-check-line text-white text-[10px]"></i>
                          </div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <h3 className={`text-sm font-semibold line-clamp-1 ${
                            isDarkMode ? 'text-white' : 'text-gray-900'
                          }`}>
                            <a
                              href={product.url || (product.slug ? `/licitatii-publice/${product.slug}` : `/produs/${product.id}`)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className={`hover:underline ${
                                isDarkMode ? 'text-blue-400 hover:text-blue-300' : 'text-blue-600 hover:text-blue-700'
                              }`}
                            >
                              {product.title || 'Fără titlu'}
                            </a>
                          </h3>
                          {winningBids.length > 0 && (
                            <span className={`px-1.5 py-0.5 rounded text-xs font-medium flex-shrink-0 ${
                              isDarkMode ? 'bg-green-500/20 text-green-400' : 'bg-green-100 text-green-700'
                            }`}>
                              <i className="ri-checkbox-circle-fill text-xs"></i>
                            </span>
                          )}
                        </div>
                        <div className={`text-xs mt-0.5 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                          SKU: {product.sku || 'N/A'}
                        </div>
                        <p className={`text-xs mt-0.5 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                          <span className={`font-semibold ${isDarkMode ? 'text-white' : 'text-gray-800'}`}>{formatPrice(product.startingPrice, product.currency)}</span>
                          {product.category && (
                            <>
                              <span className="mx-1">•</span>
                              {product.category}
                              {product.subcategory && ` - ${product.subcategory}`}
                            </>
                          )}
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-2 flex-shrink-0">
                        <div className="flex items-center gap-1">
                          {product.status === 'draft' ? (
                            <>
                              <button
                                onClick={() => handleActivateProduct(product.id)}
                                title="Activează anunțul"
                                className={`p-2 sm:px-2.5 sm:py-1.5 rounded-lg transition-colors text-white whitespace-nowrap flex items-center justify-center ${
                                  isDarkMode 
                                    ? 'bg-green-600 hover:bg-green-700' 
                                    : 'bg-green-500 hover:bg-green-600'
                                }`}
                              >
                                <i className="ri-eye-line text-sm sm:text-xs"></i>
                                <span className="hidden sm:inline sm:ml-1">Activează</span>
                              </button>
                              <button
                                onClick={() => handleDelete(product.id, product.title)}
                                title="Șterge (ascunde) anunțul"
                                className={`p-2 sm:px-2.5 sm:py-1.5 rounded-lg transition-colors text-white whitespace-nowrap flex items-center justify-center ${
                                  isDarkMode 
                                    ? 'bg-red-600 hover:bg-red-700' 
                                    : 'bg-red-500 hover:bg-red-600'
                                }`}
                              >
                                <i className="ri-delete-bin-line text-sm sm:text-xs"></i>
                                <span className="hidden sm:inline sm:ml-1">Șterge</span>
                              </button>
                            </>
                          ) : (
                            <>
                              {bids.length > 0 && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    e.preventDefault();
                                    setExpandedProducts(prev => ({
                                      ...prev,
                                      [product.id]: !prev[product.id]
                                    }));
                                  }}
                                  title="Vezi ofertele"
                                  className={`p-2 sm:px-2.5 sm:py-1.5 rounded-lg transition-all duration-200 flex items-center justify-center gap-1 text-white text-xs font-semibold whitespace-nowrap shadow-md hover:shadow-lg ${
                                    isDarkMode 
                                      ? 'bg-gradient-to-r from-green-600 to-green-700 hover:from-green-500 hover:to-green-600'
                                      : 'bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700'
                                  }`}
                                >
                                  <i className="ri-arrow-right-line text-sm sm:text-xs"></i>
                                  <span className="hidden sm:inline">Vezi ofertele</span>
                                  <span className={`sm:ml-1 px-1.5 sm:px-1.5 py-0.5 rounded-full text-[10px] sm:text-xs font-bold bg-red-500 text-white min-w-[18px] text-center`}>
                                    {bids.filter((b: any) => !b.is_winning).length}
                                  </span>
                                </button>
                              )}
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  e.preventDefault();
                                  handleEdit(product.id);
                                }}
                                title="Editează"
                                className={`p-2 sm:px-2.5 sm:py-1.5 rounded-lg transition-colors text-white text-xs whitespace-nowrap flex items-center justify-center ${
                                  isDarkMode 
                                    ? 'bg-blue-600 hover:bg-blue-700' 
                                    : 'bg-blue-500 hover:bg-blue-600'
                                }`}
                              >
                                <i className="ri-edit-line text-sm sm:text-xs"></i>
                                <span className="hidden sm:inline sm:ml-1">Editează</span>
                              </button>
                              <button
                                onClick={() => handleDeactivateProduct(product.id)}
                                title="Dezactivează anunțul"
                                className={`p-2 sm:px-2.5 sm:py-1.5 rounded-lg transition-colors text-white whitespace-nowrap flex items-center justify-center ${
                                  isDarkMode 
                                    ? 'bg-amber-600 hover:bg-amber-700' 
                                    : 'bg-amber-500 hover:bg-amber-600'
                                }`}
                              >
                                <i className="ri-eye-off-line text-sm sm:text-xs"></i>
                                <span className="hidden sm:inline sm:ml-1">Dezactivează</span>
                              </button>
                              <button
                                onClick={() => handleDelete(product.id, product.title)}
                                title="Șterge (ascunde) anunțul"
                                className={`p-2 sm:px-2.5 sm:py-1.5 rounded-lg transition-colors text-white whitespace-nowrap flex items-center justify-center ${
                                  isDarkMode 
                                    ? 'bg-red-600 hover:bg-red-700' 
                                    : 'bg-red-500 hover:bg-red-600'
                                }`}
                              >
                                <i className="ri-delete-bin-line text-sm sm:text-xs"></i>
                                <span className="hidden sm:inline sm:ml-1">Șterge</span>
                              </button>
                            </>
                          )}
                        </div>
                        <div className={`text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                          {formatDate(product.createdAt)}
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  {/* Oferte - Ultima ofertă + Istoric expandabil - Identic cu my-bids */}
                  {expandedProducts[product.id] && (
                    <div className={`p-2 sm:p-3 lg:p-4`}>
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
                        const isSellerBid = latestBid.user_id === userInfo.supabaseUserId;
                        const isBuyerBid = latestBid.user_id !== userInfo.supabaseUserId;
                        const lowestBid = Math.min(...bids.map((b: any) => b.amount));
                        const isLowest = latestBid.amount === lowestBid && bids.length > 1;
                        const hasPreviousBuyerBids = bids.some((b: any) => 
                          b.user_id !== userInfo.supabaseUserId && 
                          new Date(b.created_at).getTime() < new Date(latestBid.created_at).getTime()
                        );
                        const hasPreviousSellerBids = bids.some((b: any) => 
                          b.user_id === userInfo.supabaseUserId && 
                          new Date(b.created_at).getTime() < new Date(latestBid.created_at).getTime()
                        );
                        
                        return (
                          <>
                            {/* Ultima ofertă */}
                            <div
                              key={latestBid.id}
                              className={`p-1.5 sm:p-2 lg:p-3 rounded-lg sm:rounded-xl transition-all duration-200 mb-2 ${
                                latestBid.is_winning
                                  ? isDarkMode
                                    ? 'bg-gradient-to-r from-green-900/40 via-green-800/30 to-green-900/40 border border-green-500/40 shadow-lg shadow-green-500/10'
                                    : 'bg-gradient-to-r from-green-50 via-white to-green-50/50 border border-green-300/60 shadow-md shadow-green-200/30'
                                  : isDarkMode
                                  ? 'bg-gray-700/50 border border-gray-600/50 hover:border-gray-500/70 hover:bg-gray-700/70'
                                  : 'bg-white/30 border border-gray-200/50 hover:border-gray-300/50 hover:shadow-md'
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
                                    {isSellerBid && hasPreviousBuyerBids && (
                                      <div className="relative group">
                                        <span className={`px-1.5 py-0.5 sm:px-2 sm:py-1 rounded-lg text-xs font-semibold flex items-center gap-0.5 sm:gap-1 shadow-md ${
                                          isDarkMode
                                            ? 'bg-gradient-to-r from-blue-500 to-blue-600 text-white shadow-blue-500/30'
                                            : 'bg-gradient-to-r from-blue-400 to-blue-500 text-white shadow-blue-400/40'
                                        }`}>
                                          <i className="ri-arrow-left-right-line text-xs"></i>
                                          <span>Contraoferta ta</span>
                                        </span>
                                      </div>
                                    )}
                                    {/* Badge Contraoferta - Roșu pentru cumpărător */}
                                    {isBuyerBid && hasPreviousSellerBids && (
                                      <div className="relative group">
                                        <span className={`px-1.5 py-0.5 sm:px-2 sm:py-1 rounded-lg text-xs font-semibold flex items-center gap-0.5 sm:gap-1 shadow-md ${
                                          isDarkMode
                                            ? 'bg-gradient-to-r from-red-500 to-red-600 text-white shadow-red-500/30'
                                            : 'bg-gradient-to-r from-red-400 to-red-500 text-white shadow-red-400/40'
                                        }`}>
                                          <i className="ri-arrow-left-right-line text-xs"></i>
                                          <span>Contraoferta cumpărătorului</span>
                                        </span>
                                      </div>
                                    )}
                                    {/* Badge Cea mai mare ofertă */}
                                    {isBuyerBid && latestBid.amount === highestBid && (
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
                                    {isBuyerBid && isLowest && (
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
                                      {isSellerBid ? 'E' : (
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
                                      {isSellerBid ? 'Eu' : (
                                        latestBid.user_profiles 
                                          ? `${latestBid.user_profiles.first_name || ''} ${latestBid.user_profiles.last_name || ''}`.trim() || 'Cumpărător'
                                          : 'Cumpărător'
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
                                  {!latestBid.is_winning && isBuyerBid && (
                                    <button
                                      onClick={async () => {
                                        try {
                                          const { data: sessionData } = await supabase.auth.getSession();
                                          if (!sessionData.session) {
                                            alert('Trebuie să fii autentificat pentru a accepta oferte.');
                                            return;
                                          }

                                          const response = await dashboardApiFetch('/api/bids/accept', {
                                            method: 'POST',
                                            headers: {
                                              'Content-Type': 'application/json',
                                            },
                                            body: JSON.stringify({
                                              product_id: product.id,
                                              bid_id: latestBid.id,
                                            }),
                                          });

                                          const result = await response.json();

                                          if (!response.ok) {
                                            alert(result.error || 'Eroare la acceptarea ofertei');
                                            return;
                                          }

                                          await loadProductBids(product.id);
                                          alert('Oferta a fost acceptată cu succes!');
                                        } catch (error: any) {
                                          console.error('Error accepting bid:', error);
                                          alert('Eroare la acceptarea ofertei: ' + (error.message || 'Eroare necunoscută'));
                                        }
                                      }}
                                      className={`px-1.5 py-1 sm:px-2 sm:py-1.5 rounded-lg text-xs font-semibold transition-all duration-200 flex items-center gap-0.5 sm:gap-1 shadow-md hover:shadow-lg hover:scale-105 active:scale-95 ${
                                        isDarkMode
                                          ? 'bg-gradient-to-r from-green-600 to-green-700 hover:from-green-500 hover:to-green-600 text-white shadow-green-500/30'
                                          : 'bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white shadow-green-400/40'
                                      }`}
                                    >
                                      <i className="ri-check-line text-xs"></i>
                                      <span>Acceptă</span>
                                    </button>
                                  )}
                                  {isBuyerBid && (
                                    <button
                                      onClick={() => {
                                        const buyerName = latestBid.user_profiles 
                                          ? `${latestBid.user_profiles.first_name || ''} ${latestBid.user_profiles.last_name || ''}`.trim() || 'Cumpărător'
                                          : 'Cumpărător';
                                        setChatData({
                                          productId: product.id,
                                          buyerId: latestBid.user_id || '',
                                          sellerId: userInfo.supabaseUserId || '',
                                          otherUserInfo: {
                                            name: buyerName,
                                            avatar: latestBid.user_profiles?.avatar_url,
                                          },
                                        });
                                        setShowChatModal(true);
                                      }}
                                      className={`px-1.5 py-1 sm:px-2 sm:py-1.5 rounded-lg text-xs font-semibold transition-all duration-200 flex items-center gap-0.5 sm:gap-1 shadow-md hover:shadow-lg hover:scale-105 active:scale-95 ${
                                        isDarkMode
                                          ? 'bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-500 hover:to-blue-600 text-white border border-blue-500/30'
                                          : 'bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white border border-blue-400/30'
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
                                      const isSellerBidHist = bid.user_id === userInfo.supabaseUserId;
                                      const isBuyerBidHist = bid.user_id !== userInfo.supabaseUserId;
                                      const hasPrevBuyerBids = bids.some((b: any) => 
                                        b.user_id !== userInfo.supabaseUserId && 
                                        new Date(b.created_at).getTime() < new Date(bid.created_at).getTime()
                                      );
                                      const hasPrevSellerBids = bids.some((b: any) => 
                                        b.user_id === userInfo.supabaseUserId && 
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
                                              : 'bg-white/30 border border-gray-200/50 hover:border-gray-300/50 hover:shadow-md'
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
                                                {isSellerBidHist && hasPrevBuyerBids && (
                                                  <span className={`px-1.5 py-0.5 sm:px-2 sm:py-1 rounded-lg text-xs font-semibold flex items-center gap-0.5 sm:gap-1 shadow-md ${
                                                    isDarkMode
                                                      ? 'bg-gradient-to-r from-blue-500 to-blue-600 text-white shadow-blue-500/30'
                                                      : 'bg-gradient-to-r from-blue-400 to-blue-500 text-white shadow-blue-400/40'
                                                  }`}>
                                                    <i className="ri-arrow-left-right-line text-xs"></i>
                                                    <span>Contraoferta ta</span>
                                                  </span>
                                                )}
                                                {isBuyerBidHist && hasPrevSellerBids && (
                                                  <span className={`px-1.5 py-0.5 sm:px-2 sm:py-1 rounded-lg text-xs font-semibold flex items-center gap-0.5 sm:gap-1 shadow-md ${
                                                    isDarkMode
                                                      ? 'bg-gradient-to-r from-red-500 to-red-600 text-white shadow-red-500/30'
                                                      : 'bg-gradient-to-r from-red-400 to-red-500 text-white shadow-red-400/40'
                                                  }`}>
                                                    <i className="ri-arrow-left-right-line text-xs"></i>
                                                    <span>Contraoferta cumpărătorului</span>
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
                                                  {isSellerBidHist ? 'E' : (
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
                                                  {isSellerBidHist ? 'Eu' : (
                                                    bid.user_profiles 
                                                      ? `${bid.user_profiles.first_name || ''} ${bid.user_profiles.last_name || ''}`.trim() || 'Cumpărător'
                                                      : 'Cumpărător'
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
                                            {isBuyerBidHist && (
                                              <button
                                                onClick={() => {
                                                  const buyerName = bid.user_profiles 
                                                    ? `${bid.user_profiles.first_name || ''} ${bid.user_profiles.last_name || ''}`.trim() || 'Cumpărător'
                                                    : 'Cumpărător';
                                                  setChatData({
                                                    productId: product.id,
                                                    buyerId: bid.user_id || '',
                                                    sellerId: userInfo.supabaseUserId || '',
                                                    otherUserInfo: {
                                                      name: buyerName,
                                                      avatar: bid.user_profiles?.avatar_url,
                                                    },
                                                  });
                                                  setShowChatModal(true);
                                                }}
                                                className={`px-1.5 py-1 sm:px-2 sm:py-1.5 rounded-lg text-xs font-semibold transition-all duration-200 flex items-center gap-0.5 sm:gap-1 shadow-md hover:shadow-lg hover:scale-105 active:scale-95 ${
                                                  isDarkMode
                                                    ? 'bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-500 hover:to-blue-600 text-white border border-blue-500/30'
                                                    : 'bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white border border-blue-400/30'
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
                      })() : (
                        <div className={`text-center py-4 ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                          <i className="ri-inbox-line text-2xl mb-2"></i>
                          <p className="text-xs">Nu există oferte pentru acest produs</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          </>
        )}

        {/* Import Modal */}
        {showImportModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/5 backdrop-blur-sm p-2 sm:p-2 md:p-4">
            <div className={`w-full max-w-sm sm:w-full sm:max-w-lg md:max-w-4xl max-h-[95vh] sm:max-h-[90vh] overflow-y-auto rounded-xl shadow-2xl backdrop-blur-md ${
              isDarkMode ? 'bg-gray-800/80' : 'bg-white/80'
            }`}>
              <div className={`sticky top-0 z-10 flex items-center justify-between p-4 sm:p-4 md:p-6 border-b ${
                isDarkMode 
                  ? 'border-gray-700 bg-gray-800' 
                  : 'border-gray-200 bg-white'
              }`}>
                <div className="flex-1 min-w-0 pr-2">
                  <h2 className={`text-lg sm:text-xl md:text-2xl font-bold ${
                    isDarkMode ? 'text-white' : 'text-gray-900'
                  }`}>
                    Import GoBid AI
                  </h2>
                  <p className={`mt-1 text-xs sm:text-sm ${
                    isDarkMode ? 'text-gray-400' : 'text-gray-600'
                  }`}>
                    <span className="hidden sm:inline">Importează produse din PDF, CSV sau URL cu procesare AI automată</span>
                    <span className="sm:hidden">Importă produse cu AI</span>
                  </p>
                </div>
                <button
                  onClick={() => {
                    setShowImportModal(false);
                    setExtractedProducts([]);
                    setSelectedProducts([]);
                    setFile(null);
                    setUrl('');
                    setImportMessage(null);
                  }}
                  className={`p-2 rounded-lg flex-shrink-0 ${
                    isDarkMode 
                      ? 'hover:bg-gray-700 text-gray-300' 
                      : 'hover:bg-gray-100 text-gray-600'
                  }`}
                >
                  <i className="ri-close-line text-xl sm:text-2xl"></i>
                </button>
              </div>

              <div className="p-4 sm:p-4 md:p-6">
                {/* Message */}
                {importMessage && (
                  <div
                    className={`mb-4 sm:mb-6 p-3 sm:p-4 rounded-lg text-sm sm:text-base ${
                      importMessage.type === 'success'
                        ? isDarkMode 
                          ? 'bg-green-900/20 text-green-300' 
                          : 'bg-green-50 text-green-800'
                        : isDarkMode 
                          ? 'bg-red-900/20 text-red-300' 
                          : 'bg-red-50 text-red-800'
                    }`}
                  >
                    {importMessage.text}
                  </div>
                )}

                {/* Processing Progress */}
                {processingProgress && (
                  <div className={`mb-6 p-4 rounded-lg border ${
                    isDarkMode 
                      ? 'bg-blue-900/20 border-blue-800' 
                      : 'bg-blue-50 border-blue-200'
                  }`}>
                    <div className="flex items-center justify-between mb-2">
                      <p className={`text-sm font-semibold ${
                        isDarkMode ? 'text-blue-300' : 'text-blue-900'
                      }`}>
                        {processingProgress.status}
                      </p>
                      {processingProgress.progress !== undefined && (
                        <span className={`text-sm ${
                          isDarkMode ? 'text-blue-400' : 'text-blue-700'
                        }`}>
                          {processingProgress.progress}%
                        </span>
                      )}
                    </div>
                    {processingProgress.currentStep && (
                      <p className={`text-xs ${
                        isDarkMode ? 'text-blue-400' : 'text-blue-700'
                      }`}>
                        {processingProgress.currentStep}
                      </p>
                    )}
                    {processingProgress.progress !== undefined && (
                      <div className={`mt-2 w-full rounded-full h-2 ${
                        isDarkMode ? 'bg-blue-800' : 'bg-blue-200'
                      }`}>
                        <div
                          className={`h-2 rounded-full transition-all duration-300 ${
                            isDarkMode ? 'bg-blue-400' : 'bg-blue-600'
                          }`}
                          style={{ width: `${processingProgress.progress}%` }}
                        ></div>
                      </div>
                    )}
                  </div>
                )}

                {/* Import Form */}
                {extractedProducts.length === 0 && (
                  <div className="space-y-4">
                    {/* Import Type Selection */}
                    <div>
                      <label className={`block text-sm font-medium mb-2 ${
                        isDarkMode ? 'text-gray-300' : 'text-gray-700'
                      }`}>
                        Tip Sursă
                      </label>
                      <div className="grid grid-cols-2 gap-3">
                        {[
                          { value: 'file', label: 'Import Produse', icon: 'ri-file-upload-line', description: 'PDF, CSV, XML' },
                          { value: 'url', label: 'URL', icon: 'ri-link', description: 'Link extern' },
                        ].map((type) => (
                          <button
                            key={type.value}
                            onClick={() => {
                              setImportType(type.value as 'file' | 'url');
                              if (type.value === 'url') {
                                setFile(null);
                              } else {
                                setUrl('');
                              }
                            }}
                            className={`p-4 rounded-lg border-2 transition-all text-left ${
                              importType === type.value
                                ? isDarkMode 
                                  ? 'border-blue-400 bg-blue-900/30 text-blue-300 shadow-sm' 
                                  : 'border-blue-600 bg-blue-50 text-blue-800 shadow-sm'
                                : isDarkMode 
                                  ? 'border-gray-600 bg-gray-700 text-gray-300 hover:border-blue-500 hover:bg-blue-900/10' 
                                  : 'border-gray-300 bg-white text-gray-700 hover:border-blue-400 hover:bg-blue-50/50'
                            }`}
                          >
                            <i className={`${type.icon} text-2xl mb-2 block`}></i>
                            <span className="text-sm font-semibold block mb-1">{type.label}</span>
                            <span className="text-xs opacity-75">{type.description}</span>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* File Upload or URL Input */}
                    {importType === 'file' ? (
                      <div>
                        <label className={`block text-sm font-medium mb-2 ${
                          isDarkMode ? 'text-gray-300' : 'text-gray-700'
                        }`}>
                          Selectează Fișier (PDF, CSV, XML)
                        </label>
                        <input
                          key="file-input"
                          type="file"
                          accept=".pdf,.csv,.xml,.xlsx,.xls"
                          onChange={handleFileChange}
                          className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 transition-colors ${
                            isDarkMode 
                              ? 'focus:ring-blue-400 focus:border-blue-400 bg-gray-700 border-gray-600 text-white' 
                              : 'focus:ring-blue-500 focus:border-blue-500 bg-white border-gray-300 text-gray-900'
                          }`}
                        />
                        {file && (
                          <p className={`text-xs mt-1 ${
                            isDarkMode ? 'text-gray-400' : 'text-gray-500'
                          }`}>
                            Fișier selectat: {file.name} ({(file.size / 1024 / 1024).toFixed(2)} MB)
                          </p>
                        )}
                      </div>
                    ) : (
                      <div>
                        <label className={`block text-sm font-medium mb-2 ${
                          isDarkMode ? 'text-gray-300' : 'text-gray-700'
                        }`}>
                          URL Sursă
                        </label>
                        <input
                          type="url"
                          value={url || ''}
                          onChange={(e) => setUrl(e.target.value)}
                          placeholder="https://example.com/licitatii-publice.pdf"
                          className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 transition-colors ${
                            isDarkMode 
                              ? 'focus:ring-blue-400 focus:border-blue-400 bg-gray-700 border-gray-600 text-white' 
                              : 'focus:ring-blue-500 focus:border-blue-500 bg-white border-gray-300 text-gray-900'
                          }`}
                        />
                      </div>
                    )}

                    <button
                      onClick={handleImport}
                      disabled={isImporting || (importType === 'file' ? !file : !url.trim())}
                      className={`w-full px-4 py-3 text-white rounded-lg shadow-md hover:shadow-lg transition-all disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2 font-semibold ${
                        isDarkMode 
                          ? 'bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800' 
                          : 'bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700'
                      }`}
                    >
                      {isImporting ? (
                        <>
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                          <span>Se procesează cu GoBid AI...</span>
                        </>
                      ) : (
                        <>
                          <i className="ri-robot-line"></i>
                          <span>Importă cu GoBid AI</span>
                        </>
                      )}
                    </button>

                    <p className={`text-xs text-center font-medium ${
                      isDarkMode ? 'text-blue-400' : 'text-blue-700'
                    }`}>
                      GoBid AI va analiza automat conținutul, va extrage produsele și le va crea automat în sistem.
                    </p>
                  </div>
                )}

                {/* Extracted Products Preview */}
                {extractedProducts.length > 0 && !isCreatingProducts && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className={`text-lg font-semibold ${
                        isDarkMode ? 'text-white' : 'text-gray-900'
                      }`}>
                        Produse Extrase ({extractedProducts.length})
                      </h3>
                      <button
                        onClick={handleCreateSelectedProducts}
                        disabled={selectedProducts.length === 0}
                        className={`px-4 py-2 rounded-lg transition-all flex items-center gap-2 text-white font-semibold ${
                          selectedProducts.length === 0
                            ? isDarkMode 
                              ? 'bg-gray-600 cursor-not-allowed' 
                              : 'bg-gray-400 cursor-not-allowed'
                            : isDarkMode 
                              ? 'bg-blue-700 hover:bg-blue-800 shadow-md hover:shadow-lg' 
                              : 'bg-blue-600 hover:bg-blue-700 shadow-md hover:shadow-lg'
                        }`}
                      >
                        <i className="ri-add-line"></i>
                        <span>Creează Produse ({selectedProducts.length})</span>
                      </button>
                    </div>

                    <div className="space-y-3 max-h-96 overflow-y-auto">
                      {extractedProducts.map((product, index) => (
                        <div
                          key={index}
                          className={`p-4 rounded-lg border-2 transition-all ${
                            selectedProducts.includes(index)
                              ? isDarkMode 
                                ? 'border-blue-400 bg-blue-900/30 shadow-sm' 
                                : 'border-blue-600 bg-blue-50 shadow-sm'
                              : isDarkMode 
                                ? 'border-gray-700 bg-gray-900/50 hover:border-blue-800' 
                                : 'border-gray-200 bg-gray-50 hover:border-blue-200'
                          }`}
                        >
                          <div className="flex items-start gap-3">
                            <input
                              type="checkbox"
                              checked={selectedProducts.includes(index)}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelectedProducts([...selectedProducts, index]);
                                } else {
                                  setSelectedProducts(selectedProducts.filter((i) => i !== index));
                                }
                              }}
                              className={`mt-1 w-4 h-4 rounded focus:ring-2 focus:ring-offset-1 ${
                                isDarkMode 
                                  ? 'text-blue-400 bg-gray-700 border-gray-600 focus:ring-blue-400' 
                                  : 'text-blue-600 bg-white border-gray-300 focus:ring-blue-500'
                              }`}
                            />
                            <div className="flex-1">
                              <h4 className={`font-semibold mb-1 ${
                                isDarkMode ? 'text-white' : 'text-gray-900'
                              }`}>
                                {product.title}
                              </h4>
                              <p className={`text-sm mb-2 ${
                                isDarkMode ? 'text-gray-400' : 'text-gray-600'
                              }`}>
                                {product.description}
                              </p>
                              <div className="flex flex-wrap gap-2 text-xs">
                                <span className={`px-2 py-1 rounded ${
                                  isDarkMode 
                                    ? 'bg-blue-900/30 text-blue-300' 
                                    : 'bg-blue-100 text-blue-800'
                                }`}>
                                  {product.category}
                                </span>
                                <span className={`px-2 py-1 rounded ${
                                  isDarkMode 
                                    ? 'bg-green-900/30 text-green-300' 
                                    : 'bg-green-100 text-green-800'
                                }`}>
                                  {product.startingPrice?.toLocaleString('ro-RO')} {product.currency}
                                </span>
                                {product.auctionDate && (
                                  <span className={`px-2 py-1 rounded ${
                                    isDarkMode 
                                      ? 'bg-yellow-900/30 text-yellow-300' 
                                      : 'bg-yellow-100 text-yellow-800'
                                  }`}>
                                    {new Date(product.auctionDate).toLocaleDateString('ro-RO')}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {isCreatingProducts && (
                  <div className="text-center py-8">
                    <div className={`animate-spin rounded-full h-12 w-12 border-b-2 border-t-transparent mx-auto mb-4 ${
                      isDarkMode ? 'border-blue-400' : 'border-blue-600'
                    }`}></div>
                    <p className={isDarkMode ? 'text-gray-300' : 'text-gray-700'}>Se creează produsele...</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Avatar Edit Modal */}
        {showAvatarModal && (
          <div 
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-2 sm:p-4"
            onClick={(e) => {
              if (e.target === e.currentTarget) {
                setShowAvatarModal(false);
                setAvatarFile(null);
                setAvatarPreview(null);
                setImportMessage(null);
              }
            }}
          >
            <div 
              className={`w-full max-w-md rounded-lg sm:rounded-xl shadow-2xl ${
                isDarkMode ? 'bg-gray-800' : 'bg-white'
              }`}
              onClick={(e) => e.stopPropagation()}
            >
              <div className={`sticky top-0 z-10 flex items-center justify-between p-4 sm:p-4 md:p-6 border-b ${
                isDarkMode 
                  ? 'border-gray-700 bg-gray-800' 
                  : 'border-gray-200 bg-white'
              }`}>
                <h2 className={`text-lg sm:text-xl md:text-2xl font-bold ${
                  isDarkMode ? 'text-white' : 'text-gray-900'
                }`}>
                  Editează Avatar
                </h2>
                <button
                  onClick={() => {
                    setShowAvatarModal(false);
                    setAvatarFile(null);
                    setAvatarPreview(null);
                    setImportMessage(null);
                  }}
                  className={`p-2 rounded-lg ${
                    isDarkMode 
                      ? 'hover:bg-gray-700 text-gray-300' 
                      : 'hover:bg-gray-100 text-gray-600'
                  }`}
                >
                  <i className="ri-close-line text-xl sm:text-2xl"></i>
                </button>
              </div>

              <div className="p-4 sm:p-4 md:p-6">
                {/* Message */}
                {importMessage && (
                  <div
                    className={`mb-4 p-3 sm:p-4 rounded-lg text-sm sm:text-base ${
                      importMessage.type === 'success'
                        ? isDarkMode 
                          ? 'bg-green-900/20 text-green-300' 
                          : 'bg-green-50 text-green-800'
                        : isDarkMode 
                          ? 'bg-red-900/20 text-red-300' 
                          : 'bg-red-50 text-red-800'
                    }`}
                  >
                    {importMessage.text}
                  </div>
                )}

                {/* Current Avatar Preview */}
                <div className="flex flex-col items-center mb-6">
                  <div className={`w-32 h-32 rounded-full shadow-lg overflow-hidden flex items-center justify-center border-4 mb-4 ${
                    isDarkMode 
                      ? 'bg-gradient-to-r from-blue-600 to-blue-700 border-blue-500' 
                      : 'bg-gradient-to-r from-blue-500 to-blue-600 border-blue-400'
                  }`}>
                    {avatarPreview ? (
                      <img src={avatarPreview} alt="Preview" className="w-full h-full object-cover" />
                    ) : (userInfo.avatar || defaultAvatar) ? (
                      <img src={userInfo.avatar || defaultAvatar!} alt="Current Avatar" className="w-full h-full object-cover object-center" />
                    ) : (
                      <span className="text-5xl font-bold text-white">⚖️</span>
                    )}
                  </div>
                  <p className={`text-sm text-center ${
                    isDarkMode ? 'text-gray-400' : 'text-gray-600'
                  }`}>
                    {avatarPreview ? 'Preview nou avatar' : 'Avatar curent'}
                  </p>
                </div>

                {/* File Input */}
                <div className="mb-6">
                  <label className={`block text-sm font-medium mb-2 ${
                    isDarkMode ? 'text-gray-300' : 'text-gray-700'
                  }`}>
                    Selectează imagine nouă
                  </label>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleAvatarFileChange}
                    className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 ${
                      isDarkMode 
                        ? 'focus:ring-blue-400 bg-gray-700 border-gray-600 text-white' 
                        : 'focus:ring-blue-500 bg-white border-gray-300 text-gray-900'
                    }`}
                  />
                  <p className={`text-xs mt-1 ${
                    isDarkMode ? 'text-gray-400' : 'text-gray-500'
                  }`}>
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
                      setImportMessage(null);
                    }}
                    className={`flex-1 px-4 py-2 rounded-lg transition-colors ${
                      isDarkMode 
                        ? 'bg-gray-700 hover:bg-gray-600 text-gray-300' 
                        : 'bg-gray-200 hover:bg-gray-300 text-gray-700'
                    }`}
                  >
                    Anulează
                  </button>
                  <button
                    onClick={handleAvatarUpload}
                    disabled={!avatarFile || isUploadingAvatar}
                    className={`flex-1 px-4 py-2 text-white rounded-lg transition-colors disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2 ${
                      isDarkMode 
                        ? 'bg-blue-700 hover:bg-blue-800' 
                        : 'bg-blue-600 hover:bg-blue-700'
                    }`}
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

        {/* Licitator Contact Data Modal */}
        {showLicitatorModal && (
          <div 
            className="fixed inset-0 z-50 flex items-center md:items-start md:pt-24 lg:pt-32 md:pb-16 lg:pb-20 justify-center bg-black/30 backdrop-blur-sm p-2 sm:p-4 md:p-6"
            onClick={(e) => {
              // Close modal when clicking outside (on backdrop)
              if (e.target === e.currentTarget) {
                setShowLicitatorModal(false);
                setLicitatorMessage(null);
              }
            }}
          >
            <div 
              className={`w-full max-w-md sm:max-w-xl md:max-w-2xl max-h-[90vh] sm:max-h-[95vh] overflow-y-auto overflow-x-visible rounded-lg sm:rounded-xl shadow-2xl ${
                isDarkMode 
                  ? 'bg-gray-800/80 backdrop-blur-md border border-gray-700/50' 
                  : 'bg-white/80 backdrop-blur-md border border-gray-200/60'
              }`}
              onClick={(e) => e.stopPropagation()}
            >
              <div className={`sticky top-0 z-10 flex items-center justify-between p-3 sm:p-4 md:p-6 border-b ${
                isDarkMode ? 'border-gray-700/50 bg-gray-800' : 'border-gray-200 bg-gray-50'
              }`}>
                <div className="flex-1 min-w-0 pr-2">
                  <h2 className={`text-lg sm:text-xl md:text-2xl font-bold ${
                    isDarkMode ? 'text-white' : 'text-gray-900'
                  }`}>
                    {basePath?.includes("lichidator") ? "Detalii Lichidator" : "Detalii Executor"}
                  </h2>
                  <p className={`mt-1 text-xs sm:text-sm md:text-base ${
                    isDarkMode ? 'text-gray-300' : 'text-gray-600'
                  }`}>
                    {basePath?.includes("lichidator") ? "Completează datele de contact ale lichidatorului care vor apărea în toate anunțurile tale de licitații publice. Nu este nevoie să le completezi pentru fiecare produs." : "Completează datele de contact ale executorului care vor apărea în toate anunțurile tale de licitații publice. Nu este nevoie să le completezi pentru fiecare produs."}
                  </p>
                </div>
                <button
                  onClick={() => {
                    setShowLicitatorModal(false);
                    setLicitatorMessage(null);
                  }}
                  className={`p-2 rounded-lg transition-colors flex-shrink-0 ${
                    isDarkMode 
                      ? 'hover:bg-gray-700/50 text-white' 
                      : 'hover:bg-gray-200 text-gray-600'
                  }`}
                >
                  <i className="ri-close-line text-xl sm:text-2xl"></i>
                </button>
              </div>

              <div className="p-3 sm:p-4 md:p-6 overflow-visible">
                {/* Message */}
                {licitatorMessage && (
                  <div
                    className={`mb-6 p-4 rounded-lg ${
                      licitatorMessage.type === 'success'
                        ? isDarkMode
                          ? 'bg-green-900/30 text-green-300 border border-green-800/50'
                          : 'bg-green-50 text-green-800 border border-green-200'
                        : isDarkMode
                          ? 'bg-red-900/30 text-red-300 border border-red-800/50'
                          : 'bg-red-50 text-red-800 border border-red-200'
                    }`}
                  >
                    {licitatorMessage.text}
                  </div>
                )}

                {/* Form */}
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleSaveLicitator();
                  }}
                  className="space-y-4"
                >
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-5 overflow-visible">
                    <div>
                      <label className={`block text-sm font-medium mb-2 ${
                        isDarkMode ? 'text-white' : 'text-gray-700'
                      }`}>
                        {basePath?.includes("lichidator") ? "Lichidator *" : "Executor *"}
                      </label>
                      <input
                        type="text"
                        value={licitatorData.licitatorName}
                        onChange={(e) => setLicitatorData(prev => ({ ...prev, licitatorName: e.target.value }))}
                        className={`w-full px-4 py-3 rounded-lg border transition-all duration-300 ${
                          isDarkMode
                            ? 'bg-gray-700/50 border-gray-600 text-white placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-blue-500'
                            : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500 focus:ring-2 focus:ring-blue-500 focus:border-blue-500'
                        }`}
                        placeholder="Scrie numele complet"
                        required
                      />
                    </div>

                    <div>
                      <label className={`block text-sm font-medium mb-2 ${
                        isDarkMode ? 'text-white' : 'text-gray-700'
                      }`}>
                        {basePath?.includes("lichidator") ? "Instanță / ONRC *" : "Camera Executorilor *"}
                      </label>
                      <input
                        type="text"
                        value={licitatorData.licitatorCompetence}
                        onChange={(e) => setLicitatorData(prev => ({ ...prev, licitatorCompetence: e.target.value }))}
                        className={`w-full px-4 py-3 rounded-lg border transition-all duration-300 ${
                          isDarkMode
                            ? 'bg-gray-700/50 border-gray-600 text-white placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-blue-500'
                            : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500 focus:ring-2 focus:ring-blue-500 focus:border-blue-500'
                        }`}
                        placeholder="Ex: București, Brașov, Cluj"
                        required
                      />
                    </div>

                    <div>
                      <label className={`block text-sm font-medium mb-2 ${
                        isDarkMode ? 'text-white' : 'text-gray-700'
                      }`}>
                        Email *
                      </label>
                      <input
                        type="email"
                        value={licitatorData.licitatorEmail}
                        onChange={(e) => setLicitatorData(prev => ({ ...prev, licitatorEmail: e.target.value }))}
                        className={`w-full px-4 py-3 rounded-lg border transition-all duration-300 ${
                          isDarkMode
                            ? 'bg-gray-700/50 border-gray-600 text-white placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-blue-500'
                            : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500 focus:ring-2 focus:ring-blue-500 focus:border-blue-500'
                        }`}
                        placeholder="email@example.com"
                        required
                      />
                    </div>

                    <div>
                      <label className={`block text-sm font-medium mb-2 ${
                        isDarkMode ? 'text-white' : 'text-gray-700'
                      }`}>
                        Telefon *
                      </label>
                      <input
                        type="tel"
                        value={licitatorData.licitatorPhone}
                        onChange={(e) => setLicitatorData(prev => ({ ...prev, licitatorPhone: e.target.value }))}
                        className={`w-full px-4 py-3 rounded-lg border transition-all duration-300 ${
                          isDarkMode
                            ? 'bg-gray-700/50 border-gray-600 text-white placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-blue-500'
                            : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500 focus:ring-2 focus:ring-blue-500 focus:border-blue-500'
                        }`}
                        placeholder="Ex: 0233230073"
                        required
                      />
                    </div>

                    <div className="md:col-span-2">
                      <label className={`block text-sm font-medium mb-2 ${
                        isDarkMode ? 'text-white' : 'text-gray-700'
                      }`}>
                        {basePath?.includes("lichidator") ? "Sediul biroului de lichidare *" : "Sediul biroului executorului *"}
                      </label>
                      <input
                        type="text"
                        value={licitatorData.licitatorAddress}
                        onChange={(e) => setLicitatorData(prev => ({ ...prev, licitatorAddress: e.target.value }))}
                        className={`w-full px-4 py-3 rounded-lg border transition-all duration-300 ${
                          isDarkMode
                            ? 'bg-gray-700/50 border-gray-600 text-white placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-blue-500'
                            : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500 focus:ring-2 focus:ring-blue-500 focus:border-blue-500'
                        }`}
                        placeholder="Ex: Str. Exemplu nr. 1, București"
                        required
                      />
                    </div>
                  </div>

                  {/* Avatar Upload Section */}
                  <div className="mt-6">
                    <label className={`block text-sm font-medium mb-3 ${
                      isDarkMode ? 'text-white' : 'text-gray-700'
                    }`}>
                      Avatar pentru Cardul de Business
                    </label>
                    <div className="flex flex-col sm:flex-row gap-4 items-start">
                      {/* Preview */}
                      <div className="flex-shrink-0">
                        {(licitatorAvatarPreview || licitatorData.licitatorAvatar || defaultAvatar) ? (
                          <div className="relative w-32 h-32 rounded-full overflow-hidden ring-2 ring-blue-500">
                            <img
                              src={licitatorAvatarPreview || licitatorData.licitatorAvatar || defaultAvatar || ''}
                              alt="Avatar preview"
                              className="w-full h-full object-cover object-center"
                            />
                          </div>
                        ) : (
                          <div className={`w-32 h-32 rounded-full flex items-center justify-center border-2 border-dashed ${
                            isDarkMode ? 'border-gray-600 bg-gray-700/30' : 'border-gray-300 bg-gray-50'
                          }`}>
                            <i className={`ri-image-line text-4xl ${
                              isDarkMode ? 'text-gray-500' : 'text-gray-400'
                            }`}></i>
                          </div>
                        )}
                      </div>

                      {/* Upload Controls */}
                      <div className="flex-1 space-y-3">
                        <div className="flex flex-col sm:flex-row gap-3">
                          <label
                            htmlFor="licitator-avatar-upload"
                            className={`flex-1 px-4 py-2 rounded-lg transition-all duration-300 cursor-pointer text-center ${
                              isUploadingLicitatorAvatar
                                ? isDarkMode
                                  ? 'bg-gray-600 cursor-not-allowed text-white'
                                  : 'bg-gray-400 cursor-not-allowed text-white'
                                : isDarkMode
                                  ? 'bg-blue-600 hover:bg-blue-700 text-white'
                                  : 'bg-blue-500 hover:bg-blue-600 text-white'
                            }`}
                          >
                            <input
                              type="file"
                              id="licitator-avatar-upload"
                              accept="image/*"
                              onChange={handleLicitatorAvatarChange}
                              disabled={isUploadingLicitatorAvatar}
                              className="hidden"
                            />
                            <span className="flex items-center justify-center gap-2">
                              {isUploadingLicitatorAvatar ? (
                                <>
                                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                                  <span>Se încarcă...</span>
                                </>
                              ) : (
                                <>
                                  <i className="ri-upload-cloud-line"></i>
                                  <span>Selectează Imagine</span>
                                </>
                              )}
                            </span>
                          </label>
                        </div>
                        <p className={`text-xs ${
                          isDarkMode ? 'text-gray-400' : 'text-gray-500'
                        }`}>
                          Formate acceptate: JPG, PNG, GIF (max 5MB). Avatarul se salvează automat după selectare și va apărea pe cardul de business de pe paginile produselor.
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className={`flex justify-end gap-3 pt-5 border-t ${
                    isDarkMode ? 'border-gray-700/50' : 'border-gray-200'
                  }`}>
                    <button
                      type="submit"
                      disabled={isSavingLicitator}
                      className={`px-6 py-3 rounded-lg font-semibold transition-all duration-200 flex items-center gap-2 shadow-lg ${
                        isSavingLicitator
                          ? isDarkMode
                            ? 'bg-gray-600 cursor-not-allowed text-white'
                            : 'bg-gray-400 cursor-not-allowed text-white'
                          : isDarkMode
                            ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-blue-500/50'
                            : 'bg-blue-500 hover:bg-blue-600 text-white shadow-blue-500/30'
                      }`}
                    >
                      {isSavingLicitator ? (
                        <>
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                          <span>Se salvează...</span>
                        </>
                      ) : (
                        <>
                          <i className="ri-save-line text-lg"></i>
                          <span>Salvează Datele</span>
                        </>
                      )}
                    </button>
                  </div>
                </form>

                <div className={`mt-6 p-4 rounded-lg border ${
                  isDarkMode
                    ? 'bg-gray-700/30 border-gray-600/50'
                    : 'bg-blue-50/80 border-blue-200'
                }`}>
                  <p className={`text-sm flex items-start gap-2 ${
                    isDarkMode ? 'text-gray-300' : 'text-blue-800'
                  }`}>
                    <i className={`ri-information-line text-base mt-0.5 flex-shrink-0 ${
                      isDarkMode ? 'text-blue-400' : 'text-blue-600'
                    }`}></i>
                    <span>
                      <strong>Notă:</strong> Datele completate aici vor apărea automat în toate anunțurile tale de licitații publice. Nu este nevoie să le completezi pentru fiecare produs.
                    </span>
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Premium Promotion Modal - 4,99 Lei pentru executori */}
        {showPremiumModal && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 dark:bg-black/60"
            onClick={() => {
              setShowPremiumModal(false);
              setSelectedProductForPremium(null);
              setManualFormMessage(null);
            }}
          >
            <div
              className={`w-full max-w-2xl rounded-xl sm:rounded-2xl shadow-2xl max-h-[95vh] sm:max-h-[90vh] overflow-y-auto ${
                isDarkMode ? 'bg-gray-800' : 'bg-white'
              }`}
              onClick={(e) => e.stopPropagation()}
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
                {manualFormMessage && (
                  <div className={`p-4 rounded-lg border ${
                    isDarkMode ? 'bg-gray-800 border-gray-700' : 'bg-gray-50 border-gray-200'
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

                <div>
                  <label className={`block text-xs sm:text-sm font-medium mb-1 sm:mb-2 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                    Selectează produsul <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={selectedProductForPremium || ''}
                    onChange={(e) => {
                      const productId = e.target.value;
                      if (productId) {
                        const product = activeProducts.find((p: Product) => p.id === productId);
                        if (product?.isPremium && product?.premiumUntil && new Date(product.premiumUntil) > new Date()) {
                          setManualFormMessage({
                            type: 'error',
                            text: `Acest produs are deja premium activ până pe ${new Date(product.premiumUntil).toLocaleDateString('ro-RO')}.`,
                          });
                          setSelectedProductForPremium(null);
                          return;
                        }
                      }
                      setSelectedProductForPremium(productId || null);
                      setManualFormMessage(null);
                    }}
                    className={`w-full rounded-lg border px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-500 ${
                      isDarkMode ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300 text-gray-900'
                    }`}
                  >
                    <option value="">Selectează un produs</option>
                    {activeProducts.map((product: Product) => {
                      const hasActivePremium = product.isPremium && product.premiumUntil && new Date(product.premiumUntil) > new Date();
                      const premiumUntilDate = product.premiumUntil ? new Date(product.premiumUntil) : null;
                      return (
                        <option
                          key={product.id}
                          value={product.id}
                          disabled={!!hasActivePremium}
                          style={hasActivePremium ? { backgroundColor: isDarkMode ? '#374151' : '#f3f4f6', color: isDarkMode ? '#9ca3af' : '#6b7280', fontStyle: 'italic' } : {}}
                        >
                          {product.title} {product.status === 'active' ? '(Activ)' : ''}
                          {hasActivePremium && premiumUntilDate && ` - Premium activ până pe ${premiumUntilDate.toLocaleDateString('ro-RO')}`}
                        </option>
                      );
                    })}
                  </select>
                </div>

                <div>
                  <label className={`block text-xs sm:text-sm font-medium mb-1 sm:mb-2 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                    Număr săptămâni <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={premiumWeeks}
                    onChange={(e) => setPremiumWeeks(Number(e.target.value))}
                    className={`w-full rounded-lg border px-2 sm:px-4 py-2 sm:py-3 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-yellow-500 ${
                      isDarkMode ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300 text-gray-900'
                    }`}
                  >
                    {[1, 2, 3, 4, 5, 6, 7, 8, 12, 16, 20, 24, 52].map((weeks) => (
                      <option key={weeks} value={weeks}>
                        {weeks} {weeks === 1 ? 'săptămână' : 'săptămâni'}
                      </option>
                    ))}
                  </select>
                </div>

                <div className={`p-2 sm:p-3 md:p-4 rounded-lg border ${isDarkMode ? 'bg-blue-900/20 border-blue-500/50' : 'bg-blue-50 border-blue-200'}`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1 sm:gap-2">
                      <i className="ri-wallet-3-line text-base sm:text-xl text-blue-600"></i>
                      <span className={`text-xs sm:text-sm font-medium ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>Credit disponibil:</span>
                    </div>
                    {isLoadingCredit ? (
                      <div className="animate-pulse h-5 sm:h-6 w-12 sm:w-16 bg-gray-300 rounded"></div>
                    ) : (
                      <span className={`text-lg sm:text-xl font-bold ${isDarkMode ? 'text-blue-400' : 'text-blue-700'}`}>
                        {userCreditBalance.toFixed(2)} Lei
                      </span>
                    )}
                  </div>
                </div>

                <div className={`p-2 sm:p-3 md:p-4 rounded-lg border ${isDarkMode ? 'bg-yellow-900/20 border-yellow-500/50' : 'bg-yellow-50 border-yellow-200'}`}>
                  <div className="flex items-center justify-between pt-2">
                    <span className={`text-sm sm:text-base font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>Preț de plată:</span>
                    <span className={`text-xl sm:text-2xl font-bold ${isDarkMode ? 'text-yellow-400' : 'text-yellow-700'}`}>
                      {(PREMIUM_PRICE_PER_WEEK * premiumWeeks).toFixed(2)} Lei
                    </span>
                  </div>
                  <p className={`text-xs mt-1 sm:mt-2 ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                    <i className="ri-information-line mr-1"></i>
                    {premiumWeeks === 1 ? (
                      <>4,99 Lei per săptămână</>
                    ) : (
                      <>4,99 Lei × {premiumWeeks} săptămâni = {(PREMIUM_PRICE_PER_WEEK * premiumWeeks).toFixed(2)} Lei</>
                    )}
                  </p>
                  {userCreditBalance >= PREMIUM_PRICE_PER_WEEK * premiumWeeks ? (
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
                          <span className={`text-xs sm:text-sm ${isDarkMode ? 'text-orange-400' : 'text-orange-700'}`}>Credit insuficient. Plata se va face cu Netopia.</span>
                        </div>
                        <a
                          href="/dashboard/tokens"
                          className={`px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg text-xs font-semibold transition-all ${
                            isDarkMode ? 'bg-orange-600 hover:bg-orange-700 text-white' : 'bg-orange-500 hover:bg-orange-600 text-white'
                          }`}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <i className="ri-add-line mr-1"></i>
                          Cumpără Credit
                        </a>
                      </div>
                    </div>
                  )}
                </div>

                <div className={`p-2 sm:p-3 md:p-4 rounded-lg ${isDarkMode ? 'bg-gray-700' : 'bg-gray-100'}`}>
                  <h4 className={`text-xs sm:text-sm font-semibold mb-2 sm:mb-3 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>Beneficii Premium:</h4>
                  <ul className="space-y-1.5 sm:space-y-2 text-xs sm:text-sm">
                    <li className={`flex items-center gap-2 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                      <i className="ri-checkbox-circle-line text-green-500"></i>
                      Poziție prioritară în căutări și pe prima pagină
                    </li>
                    <li className={`flex items-center gap-2 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                      <i className="ri-checkbox-circle-line text-green-500"></i>
                      Badge &quot;Premium&quot; vizibil pe produs
                    </li>
                    <li className={`flex items-center gap-2 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                      <i className="ri-checkbox-circle-line text-green-500"></i>
                      Vizualizări mărite cu până la 300%
                    </li>
                  </ul>
                </div>

                <PremiumPurchaseButton
                  selectedProductForPremium={selectedProductForPremium}
                  isProcessingPremium={isProcessingPremium}
                  disabled={!selectedProductForPremium || isProcessingPremium}
                  userCreditCoversAmount={userCreditBalance >= PREMIUM_PRICE_PER_WEEK * premiumWeeks}
                  totalAmount={PREMIUM_PRICE_PER_WEEK * premiumWeeks}
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

        {/* Manual Add Modal */}
        {showManualAddModal && (
          <div 
            className="fixed inset-0 z-50 flex items-center justify-center backdrop-blur-sm p-2 sm:p-4 bg-black/10 dark:bg-black/15"
            onClick={(e) => {
              if (e.target === e.currentTarget) {
                setShowManualAddModal(false);
              }
            }}
          >
            <div className={`relative w-full max-w-xs sm:max-w-2xl md:max-w-4xl lg:max-w-6xl max-h-[90vh] overflow-hidden rounded-xl sm:rounded-2xl shadow-2xl backdrop-blur-md ${
              isDarkMode ? 'bg-gray-800/80' : 'bg-white/80'
            }`}>
              {/* Header */}
              <div className={`flex items-center justify-between p-4 sm:p-6 border-b ${
                isDarkMode ? 'border-gray-700' : 'border-gray-200'
              }`}>
                <div>
                  <h2 className={`text-xl sm:text-2xl font-bold ${
                    isDarkMode ? 'text-white' : 'text-gray-900'
                  }`}>
                    Adaugă Listare
                  </h2>
                  <p className={`text-sm mt-1 ${
                    isDarkMode ? 'text-gray-400' : 'text-gray-600'
                  }`}>
                    Completează informațiile pentru noua licitație publică
                  </p>
                </div>
                <button
                  onClick={() => setShowManualAddModal(false)}
                  className={`p-2 rounded-lg transition-colors ${
                    isDarkMode 
                      ? 'hover:bg-gray-700 text-gray-400 hover:text-white' 
                      : 'hover:bg-gray-100 text-gray-500 hover:text-gray-700'
                  }`}
                >
                  <i className="ri-close-line text-2xl"></i>
                </button>
              </div>

              {/* Content - iframe cu add-auction */}
              <div className="overflow-hidden" style={{ height: 'calc(90vh - 80px)' }}>
                <iframe
                  src={`${basePath}/add-auction?modal=true`}
                  className="w-full h-full border-0"
                  title="Adaugă Listare"
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Manual Add Modal - Licitații Publice */}
      <ManualAddModalExecutor
        showModal={showManualAddModal}
        setShowModal={(show) => {
          setShowManualAddModal(show);
          if (!show) {
            setEditingProductId(null);
          }
        }}
        isDarkMode={isDarkMode}
        onProductAdded={() => {
          loadProducts();
          setEditingProductId(null);
        }}
        editingProductId={editingProductId}
      />

      {/* Auth Required Modal */}
      <AuthRequiredModal
        isOpen={showAuthModal}
        onClose={() => setShowAuthModal(false)}
        isDarkMode={isDarkMode}
        message="Utilizator neautentificat. Te rog reconectează-te."
      />

      {/* Chat Modal */}
      {showChatModal && chatData && currentUserId && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setShowChatModal(false);
            }
          }}
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
      
      {/* Dashboard Footer */}
      <DashboardFooter isDarkMode={isDarkMode} />
    </div>
  );
}
