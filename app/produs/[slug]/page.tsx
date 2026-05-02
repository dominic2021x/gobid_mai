"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { HeartIcon, NotificationIcon, ClockIcon, LocationIcon, UserIcon, CoinsIcon, LockClosedIcon, LockOpenIcon, ArrowLeftIcon, ArrowRightIcon, CloseIcon, PlusIcon, MinusIcon } from "@/components/HeroIcons";
import UniversalHeader from "@/components/UniversalHeader";
import PropertyMap from "@/components/PropertyMap";
import Image from "next/image";
import { trackProductView } from "@/lib/analytics/tracking";
import { supabase } from "@/lib/supabase";
import ExecutorBusinessCard from "@/components/ExecutorBusinessCard";
import { isPlausibleProductImageSource } from "@/lib/image/isPlausibleProductImageSource";

interface Auction {
  id: string;
  title: string;
  description: string;
  currentBid: number;
  startingBid: number;
  timeLeft: string;
  timeLeftSeconds: number;
  image: string;
  images: string[];
  category: string;
  subcategory: string;
  location: string;
  year: number;
  condition: string;
  seller: string;
  shipping: string;
  paymentMethods: string[];
  returnPolicy: string;
  warranty: string;
  isTest?: boolean;
  isLocked?: boolean;
  bidIncrement: number;
  reservePrice?: number;
  buyNowPrice?: number;
  auctionType: 'standard' | 'reserve' | 'buy-now';
  endTime: string;
  startTime: string;
  viewCount: number;
  bidCount: number;
  watchers: number;
  saleType?: 'vanzare-directa' | 'licitatie-publica'; // Tip de vânzare
  auctionDate?: string; // Data licitației
  address?: string; // Adresă pentru imobiliare
  coordinates?: { lat: number; lng: number }; // Coordonate pentru hartă
  customFields?: Record<string, any>; // Câmpuri dinamice specifice produsului
  documents?: Array<{
    name: string;
    url?: string;
    size?: number;
    type?: string;
  }>;
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

export default function AuctionSinglePage() {
  const params = useParams() || {};
  const router = useRouter();
  const auctionId = (params.id ?? params["id"] ?? "") as string;
  
  const [isDarkMode, setIsDarkMode] = useState(true);
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
  const [auction, setAuction] = useState<Auction | null>(null);
  const [bids, setBids] = useState<Bid[]>([]);
  const [currentBidAmount, setCurrentBidAmount] = useState(0);
  const [bidIncrement, setBidIncrement] = useState(100);
  const [isBidding, setIsBidding] = useState(false);
  const [showBidModal, setShowBidModal] = useState(false);
  const [showImageModal, setShowImageModal] = useState(false);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [isWatching, setIsWatching] = useState(false);
  const [isFavorite, setIsFavorite] = useState(false);
  const [timeLeft, setTimeLeft] = useState({ days: 0, hours: 0, minutes: 0, seconds: 0 });
  const [isAuctionEnded, setIsAuctionEnded] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });
  const [isLoadingAuction, setIsLoadingAuction] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
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

  // Sample auction data - in real app this would come from API
  const sampleAuctions: Auction[] = [
    {
      id: "1",
      title: "BMW X5 2020 - Full Options",
      description: "BMW X5 xDrive30d M Sport, 3.0L diesel, automata, 4x4, 286 CP, 62.000 km, servisat la reprezentanta, garantie 2 ani, dotari complete: navigatie, camera spate, senzori, scaune incalzite, volan incalzit, tetiera, geamuri electrice, oglinzi electrice, climatronic, cruise control, start/stop, ABS, ESP, airbag-uri multiple, imobilizator, alarma, centralizare, radio CD, Bluetooth, USB, aux, 6 airbag-uri, servodirectie, ABS, ESP, ASR, MSR, CBC, DTC, DBC, HDC, PDC, servis la reprezentanta, istoric complet, un singur proprietar, masina de familie, intretinuta exemplar.",
      currentBid: 85000,
      startingBid: 70000,
      timeLeft: "2 zile 15 ore 30 minute",
      timeLeftSeconds: 225000, // 2 days 14 hours 30 minutes in seconds
      image: "https://images.unsplash.com/photo-1555215695-3004980ad54e?w=800&h=600&fit=crop",
      images: [
        "https://images.unsplash.com/photo-1555215695-3004980ad54e?w=800&h=600&fit=crop",
        "https://images.unsplash.com/photo-1544636331-e26879cd4d9b?w=800&h=600&fit=crop",
        "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=800&h=600&fit=crop",
        "https://images.unsplash.com/photo-1563720223185-11003d516935?w=800&h=600&fit=crop",
        "https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=800&h=600&fit=crop"
      ],
      category: "autovehicule",
      subcategory: "autoturisme",
      location: "București",
      year: 2020,
      condition: "Foarte bună",
      seller: "AutoDealer Pro",
      shipping: "Ridicare personală",
      paymentMethods: ["Transfer bancar", "Credit auto"],
      returnPolicy: "Nu se aplică",
      warranty: "2 ani garanție",
      bidIncrement: 500,
      reservePrice: 80000,
      auctionType: 'reserve',
      endTime: "2025-01-20T18:00:00Z",
      startTime: "2025-01-15T10:00:00Z",
      viewCount: 1247,
      bidCount: 23,
      watchers: 45
    },
    {
      id: "auction-2",
      title: "Audi A4 2019 - Quattro",
      description: "Audi A4 2.0 TDI Quattro, 190 CP, automata, 4x4, 45.000 km, servisat la reprezentanta, garantie 1 an, dotari complete: navigatie, camera spate, senzori, scaune incalzite, volan incalzit, geamuri electrice, oglinzi electrice, climatronic, cruise control, start/stop, ABS, ESP, airbag-uri multiple, imobilizator, alarma, centralizare, radio CD, Bluetooth, USB, aux, servis la reprezentanta, istoric complet, un singur proprietar, masina de familie, intretinuta exemplar.",
      currentBid: 45000,
      startingBid: 40000,
      timeLeft: "1 zi 8 ore 15 minute",
      timeLeftSeconds: 115500, // 1 day 8 hours 15 minutes in seconds
      image: "https://images.unsplash.com/photo-1606664515524-ed2f786a0bd6?w=800&h=600&fit=crop",
      images: [
        "https://images.unsplash.com/photo-1606664515524-ed2f786a0bd6?w=800&h=600&fit=crop",
        "https://images.unsplash.com/photo-1544636331-e26879cd4d9b?w=800&h=600&fit=crop",
        "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=800&h=600&fit=crop"
      ],
      category: "autovehicule",
      subcategory: "autoturisme",
      location: "Cluj-Napoca",
      year: 2019,
      condition: "Foarte bună",
      seller: "AutoPremium",
      shipping: "Ridicare personală",
      paymentMethods: ["Transfer bancar", "Credit auto"],
      returnPolicy: "Nu se aplică",
      warranty: "1 an garanție",
      bidIncrement: 250,
      reservePrice: 42000,
      auctionType: 'reserve',
      endTime: "2025-01-19T12:00:00Z",
      startTime: "2025-01-15T10:00:00Z",
      viewCount: 892,
      bidCount: 15,
      watchers: 32
    },
    {
      id: "auction-4",
      title: "Mercedes E-Class 2021 - AMG Line",
      description: "Mercedes E-Class E220d AMG Line, 2.0L diesel, automata, 194 CP, 38.000 km, servisat la reprezentanta, garantie 2 ani, dotari complete: navigatie, camera spate, senzori, scaune incalzite, volan incalzit, tetiera, geamuri electrice, oglinzi electrice, climatronic, cruise control, start/stop, ABS, ESP, airbag-uri multiple, imobilizator, alarma, centralizare, radio CD, Bluetooth, USB, aux, servis la reprezentanta, istoric complet, un singur proprietar, masina de familie, intretinuta exemplar.",
      currentBid: 65000,
      startingBid: 60000,
      timeLeft: "3 zile 2 ore 45 minute",
      timeLeftSeconds: 262500, // 3 days 2 hours 45 minutes in seconds
      image: "https://images.unsplash.com/photo-1618843479313-40f8afb4b4d8?w=800&h=600&fit=crop",
      images: [
        "https://images.unsplash.com/photo-1618843479313-40f8afb4b4d8?w=800&h=600&fit=crop",
        "https://images.unsplash.com/photo-1544636331-e26879cd4d9b?w=800&h=600&fit=crop",
        "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=800&h=600&fit=crop",
        "https://images.unsplash.com/photo-1563720223185-11003d516935?w=800&h=600&fit=crop"
      ],
      category: "autovehicule",
      subcategory: "autoturisme",
      location: "Timișoara",
      year: 2021,
      condition: "Excelentă",
      seller: "Mercedes Dealer",
      shipping: "Ridicare personală",
      paymentMethods: ["Transfer bancar", "Credit auto"],
      returnPolicy: "Nu se aplică",
      warranty: "2 ani garanție",
      bidIncrement: 500,
      reservePrice: 62000,
      auctionType: 'reserve',
      endTime: "2025-01-21T16:00:00Z",
      startTime: "2025-01-15T10:00:00Z",
      viewCount: 1567,
      bidCount: 28,
      watchers: 67
    }
  ];

  const sampleBids: Bid[] = [
    {
      id: "1",
      amount: 85000,
      bidder: "Alexandru M.",
      bidderId: "user1",
      timestamp: "2025-01-18T14:30:00Z",
      isWinning: true,
      isOutbid: false
    },
    {
      id: "2",
      amount: 84500,
      bidder: "Maria P.",
      bidderId: "user2",
      timestamp: "2025-01-18T14:25:00Z",
      isWinning: false,
      isOutbid: true
    },
    {
      id: "3",
      amount: 84000,
      bidder: "Ion D.",
      bidderId: "user3",
      timestamp: "2025-01-18T14:20:00Z",
      isWinning: false,
      isOutbid: true
    }
  ];

  const sampleBids2: Bid[] = [
    {
      id: "4",
      amount: 45000,
      bidder: "Cristina L.",
      bidderId: "user4",
      timestamp: "2025-01-18T16:15:00Z",
      isWinning: true,
      isOutbid: false
    },
    {
      id: "5",
      amount: 44750,
      bidder: "Mihai R.",
      bidderId: "user5",
      timestamp: "2025-01-18T16:10:00Z",
      isWinning: false,
      isOutbid: true
    },
    {
      id: "6",
      amount: 44500,
      bidder: "Ana S.",
      bidderId: "user6",
      timestamp: "2025-01-18T16:05:00Z",
      isWinning: false,
      isOutbid: true
    }
  ];

  const sampleBids4: Bid[] = [
    {
      id: "7",
      amount: 65000,
      bidder: "Radu T.",
      bidderId: "user7",
      timestamp: "2025-01-18T18:45:00Z",
      isWinning: true,
      isOutbid: false
    },
    {
      id: "8",
      amount: 64500,
      bidder: "Elena M.",
      bidderId: "user8",
      timestamp: "2025-01-18T18:40:00Z",
      isWinning: false,
      isOutbid: true
    },
    {
      id: "9",
      amount: 64000,
      bidder: "Andrei P.",
      bidderId: "user9",
      timestamp: "2025-01-18T18:35:00Z",
      isWinning: false,
      isOutbid: true
    }
  ];

  const mapProductRowToAuction = useCallback((row: any): Auction => {
    const placeholderImage = '/no-image-placeholder.svg';
    const images = Array.isArray(row?.images)
      ? (row.images as unknown[]).flatMap((img: unknown) => {
          if (typeof img === "string") return isPlausibleProductImageSource(img) ? [img] : [];
          if (img && typeof img === "object" && "url" in img) {
            const u = (img as { url?: unknown }).url;
            if (typeof u === "string" && isPlausibleProductImageSource(u)) return [u];
          }
          return [];
        })
      : [];
    const mainImage = images[0] || placeholderImage;
    const startingPrice =
      typeof row?.starting_price === 'number'
        ? row.starting_price
        : row?.starting_price_ron ?? 0;

    const endTimeIso = row?.auction_date ?? row?.end_time ?? null;
    const endTimeDate = endTimeIso
      ? new Date(endTimeIso)
      : new Date(Date.now() + 48 * 60 * 60 * 1000);
    const timeLeftSeconds = Math.max(
      0,
      Math.floor((endTimeDate.getTime() - Date.now()) / 1000)
    );

    const formatTimeLeft = (seconds: number) => {
      const days = Math.floor(seconds / (24 * 3600));
      const hours = Math.floor((seconds % (24 * 3600)) / 3600);
      const minutes = Math.floor((seconds % 3600) / 60);
      if (days > 0) return `${days} zile ${hours} ore`;
      if (hours > 0) return `${hours} ore ${minutes} minute`;
      if (minutes > 0) return `${minutes} minute`;
      return seconds > 0 ? `${seconds} secunde` : 'Licitația s-a încheiat';
    };

    const documents = Array.isArray(row?.documents)
      ? row.documents.map((doc: any) => ({
          name: doc?.name || 'Document',
          url: doc?.url || doc?.publicUrl || undefined,
          size: typeof doc?.size === 'number' ? doc.size : undefined,
          type: doc?.type,
        }))
      : [];

    return {
      id: row?.id ?? '',
      title: row?.title ?? 'Produs licitație',
      description: row?.description ?? '',
      currentBid: startingPrice,
      startingBid: startingPrice,
      timeLeft: formatTimeLeft(timeLeftSeconds),
      timeLeftSeconds,
      image: mainImage,
      images: images.length > 0 ? images : [mainImage],
      category: row?.category ?? 'diverse',
      subcategory: row?.subcategory ?? 'diverse',
      location: row?.auction_location ?? row?.address ?? row?.city ?? 'București',
      year: row?.created_at ? new Date(row.created_at).getFullYear() : new Date().getFullYear(),
      condition: row?.condition ?? 'Disponibil',
      seller: row?.seller ?? 'Organizator licitație',
      shipping: row?.shipping ?? 'Conform condițiilor licitației',
      paymentMethods: Array.isArray(row?.payment_methods) ? row.payment_methods : ['Transfer bancar'],
      returnPolicy: row?.return_policy ?? 'Conform regulamentului licitației',
      warranty: row?.warranty ?? 'Nu se aplică',
      bidIncrement:
        row?.bid_increment && Number.isFinite(row.bid_increment)
          ? row.bid_increment
          : Math.max(50, Math.round(startingPrice * 0.05)),
      reservePrice: startingPrice,
      buyNowPrice: row?.buy_now_price_ron ?? row?.buy_now_price_eur ?? undefined,
      auctionType: row?.product_type === 'live-bid' ? 'standard' : 'reserve',
      endTime: endTimeDate.toISOString(),
      startTime: row?.created_at ?? new Date().toISOString(),
      viewCount: row?.view_count ?? 0,
      bidCount: row?.bid_count ?? 0,
      watchers: row?.watchers ?? 0,
      saleType: row?.sale_type ?? 'vanzare-directa',
      auctionDate: row?.auction_date ?? undefined,
      address: row?.address ?? undefined,
      coordinates: row?.coordinates ?? undefined,
      customFields:
        row?.custom_fields && typeof row.custom_fields === 'object'
          ? row.custom_fields
          : {},
      documents,
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const loadUserPrefs = () => {
      if (typeof window === 'undefined') return;
      const savedUserInfo = localStorage.getItem('userInfo');
      const savedUserTokens = localStorage.getItem('userTokens');
      if (savedUserInfo) {
        setUserInfo(JSON.parse(savedUserInfo));
      }
      if (savedUserTokens) {
        setUserTokens(JSON.parse(savedUserTokens));
      }
      const savedFavorites = localStorage.getItem('favoriteAuctions');
      const savedWatching = localStorage.getItem('watchingAuctions');
      if (savedFavorites && JSON.parse(savedFavorites).includes(auctionId)) {
        setIsFavorite(true);
      }
      if (savedWatching && JSON.parse(savedWatching).includes(auctionId)) {
        setIsWatching(true);
      }
    };

    const loadAuction = async () => {
      setIsLoadingAuction(true);
      setLoadError(null);
      loadUserPrefs();

      try {
        let productRow: any = null;

        const { data: slugProduct, error: slugError } = await supabase
          .from('products')
          .select('*')
          .eq('slug', auctionId)
          .eq('product_type', 'buy-now')
          .neq('status', 'deleted')
          .maybeSingle();

        if (slugError && slugError.code && slugError.code !== 'PGRST116') {
          console.error('Error loading product by slug:', slugError);
        }

        if (slugProduct) {
          productRow = slugProduct;
        }

        if (!productRow) {
          const { data: idProduct, error: idError } = await supabase
            .from('products')
            .select('*')
            .eq('id', auctionId)
            .eq('product_type', 'buy-now')
            .neq('status', 'deleted')
            .maybeSingle();

          if (idError && idError.code && idError.code !== 'PGRST116') {
            console.error('Error loading product by id:', idError);
          }

          if (idProduct) {
            productRow = idProduct;
          }
        }

        if (!productRow) {
          const { data: urlProduct, error: urlError } = await supabase
            .from('products')
            .select('*')
            .ilike('url', `%/${auctionId}`)
            .eq('product_type', 'buy-now')
            .neq('status', 'deleted')
            .maybeSingle();

          if (urlError && urlError.code && urlError.code !== 'PGRST116') {
            console.error('Error loading product by URL:', urlError);
          }

          if (urlProduct) {
            productRow = urlProduct;
          }
        }

        let auctionToUse: Auction | undefined;

        if (productRow) {
          auctionToUse = mapProductRowToAuction(productRow);
        } else {
          auctionToUse = sampleAuctions.find(a => a.id === auctionId);
        }

        if (cancelled) return;

        if (!auctionToUse) {
          setAuction(null);
          setLoadError('Anunțul nu a fost găsit sau a fost eliminat.');
          return;
        }

        setAuction(auctionToUse);
        setLoadError(null);
        setCurrentBidAmount(auctionToUse.currentBid + auctionToUse.bidIncrement);
        setBidIncrement(auctionToUse.bidIncrement);

        // Încărcăm datele executorului (licitator) - verificăm mai întâi custom_fields (publice)
        const customFields = productRow?.custom_fields || {};
        
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
        
        // Dacă există date în custom_fields, le folosim direct (publice)
        if (hasCustomFieldsData) {
          console.log('[Produs] Using executor data from custom_fields (public):', executorDataFromCustomFields);
          setExecutorData(executorDataFromCustomFields);
        } else if (productRow?.user_id) {
          // Dacă nu există date în custom_fields, încercăm să le luăm din user_profiles (poate necesita autentificare)
          try {
            const { data: executorProfile, error: executorError } = await supabase
              .from('user_profiles')
              .select('licitator_name, licitator_address, licitator_fiscal_code, licitator_consignment_account, licitator_email, licitator_phone, licitator_fax, licitator_competence, avatar_url')
              .eq('user_id', productRow.user_id)
              .maybeSingle();

            // Construiește datele executorului din profil (prioritate 2 - poate necesita autentificare)
            const executorDataFromProfile = {
              licitatorName: executorProfile?.licitator_name || undefined,
              licitatorAddress: executorProfile?.licitator_address || undefined,
              licitatorFiscalCode: executorProfile?.licitator_fiscal_code || undefined,
              licitatorConsignmentAccount: executorProfile?.licitator_consignment_account || undefined,
              licitatorEmail: executorProfile?.licitator_email || undefined,
              licitatorPhone: executorProfile?.licitator_phone || undefined,
              licitatorFax: executorProfile?.licitator_fax || undefined,
              licitatorCompetence: executorProfile?.licitator_competence || undefined,
              licitatorAvatar: executorProfile?.avatar_url || undefined,
            };
            
            const hasProfileData = Object.values(executorDataFromProfile).some(val => val !== undefined && val !== null && val !== '');
            
            if (hasProfileData) {
              console.log('[Produs] Setting executor data from user_profiles:', executorDataFromProfile);
              setExecutorData(executorDataFromProfile);
            }
          } catch (executorError) {
            console.error('[Produs] Exception loading executor data:', executorError);
          }
        }

        if (productRow) {
          setBids([]);
        } else {
          let bidsToLoad = sampleBids;
          if (auctionId === "auction-2") {
            bidsToLoad = sampleBids2;
          } else if (auctionId === "auction-4") {
            bidsToLoad = sampleBids4;
          }
          setBids(bidsToLoad);
        }

        startCountdown(auctionToUse.timeLeftSeconds);

        trackProductView(auctionToUse.id, {
          title: auctionToUse.title,
          category: auctionToUse.category,
          location: auctionToUse.location,
        });
      } catch (error) {
        console.error('Unexpected error loading auction:', error);
        if (!cancelled) {
          setAuction(null);
          setLoadError('A apărut o eroare la încărcarea anunțului. Încearcă din nou mai târziu.');
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
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auctionId, mapProductRowToAuction]);

  const startCountdown = (seconds: number) => {
    const interval = setInterval(() => {
      setTimeLeft(prev => {
        const newSeconds = prev.seconds - 1;
        
        if (newSeconds < 0) {
          if (prev.minutes > 0) {
            return { ...prev, minutes: prev.minutes - 1, seconds: 59 };
          } else if (prev.hours > 0) {
            return { ...prev, hours: prev.hours - 1, minutes: 59, seconds: 59 };
          } else if (prev.days > 0) {
            return { ...prev, days: prev.days - 1, hours: 23, minutes: 59, seconds: 59 };
          } else {
            setIsAuctionEnded(true);
            clearInterval(interval);
            return { days: 0, hours: 0, minutes: 0, seconds: 0 };
          }
        }
        
        return { ...prev, seconds: newSeconds };
      });
    }, 1000);

    return () => clearInterval(interval);
  };

  const toggleDarkMode = () => {
    setIsDarkMode(!isDarkMode);
  };

  const handleBid = async () => {
    if (!auction || isAuctionEnded) return;
    
    setIsBidding(true);
    
    // Simulate bid submission
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    // Add new bid
    const newBid: Bid = {
      id: Date.now().toString(),
      amount: currentBidAmount,
      bidder: `${userInfo.firstName} ${userInfo.lastName}`,
      bidderId: 'current-user',
      timestamp: new Date().toISOString(),
      isWinning: true,
      isOutbid: false
    };
    
    setBids(prev => [newBid, ...prev.map(bid => ({ ...bid, isWinning: false, isOutbid: true }))]);
    
    if (auction) {
      setAuction(prev => prev ? { ...prev, currentBid: currentBidAmount, bidCount: prev.bidCount + 1 } : null);
      setCurrentBidAmount(prev => prev + bidIncrement);
    }
    
    setIsBidding(false);
    setShowBidModal(false);
    setMessage({ type: 'success', text: 'Licitația a fost plasată cu succes!' });
    setTimeout(() => setMessage({ type: '', text: '' }), 3000);
  };

  const handleQuickBid = (amount: number) => {
    setCurrentBidAmount(amount);
    setShowBidModal(true);
  };

  const toggleFavorite = () => {
    if (typeof window !== 'undefined') {
      const savedFavorites = localStorage.getItem('favoriteAuctions');
      let favorites = savedFavorites ? JSON.parse(savedFavorites) : [];
      
      if (isFavorite) {
        favorites = favorites.filter((id: string) => id !== auctionId);
      } else {
        favorites.push(auctionId);
      }
      
      localStorage.setItem('favoriteAuctions', JSON.stringify(favorites));
      setIsFavorite(!isFavorite);
    }
  };

  const toggleWatching = () => {
    if (typeof window !== 'undefined') {
      const savedWatching = localStorage.getItem('watchingAuctions');
      let watching = savedWatching ? JSON.parse(savedWatching) : [];
      
      if (isWatching) {
        watching = watching.filter((id: string) => id !== auctionId);
      } else {
        watching.push(auctionId);
      }
      
      localStorage.setItem('watchingAuctions', JSON.stringify(watching));
      setIsWatching(!isWatching);
    }
  };

  const nextImage = () => {
    if (auction) {
      setCurrentImageIndex(prev => (prev + 1) % auction.images.length);
    }
  };

  const prevImage = () => {
    if (auction) {
      setCurrentImageIndex(prev => (prev - 1 + auction.images.length) % auction.images.length);
    }
  };

  const shareAuction = () => {
    if (typeof window !== 'undefined') {
      if (navigator.share) {
        navigator.share({
          title: auction?.title,
          text: auction?.description,
          url: window.location.href
        });
      } else {
        navigator.clipboard.writeText(window.location.href);
        setMessage({ type: 'success', text: 'Link-ul a fost copiat în clipboard!' });
        setTimeout(() => setMessage({ type: '', text: '' }), 3000);
      }
    }
  };

  if (isLoadingAuction) {
    return (
      <div className={`min-h-screen transition-colors ${isDarkMode ? 'bg-gray-900' : 'bg-gray-50'}`}>
        <UniversalHeader 
          isDarkMode={isDarkMode}
          onToggleDarkMode={toggleDarkMode}
        />
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className={`text-lg transition-colors ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>
              Se încarcă anunțul...
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (!auction) {
    return (
      <div className={`min-h-screen transition-colors ${isDarkMode ? 'bg-gray-900' : 'bg-gray-50'}`}>
        <UniversalHeader 
          isDarkMode={isDarkMode}
          onToggleDarkMode={toggleDarkMode}
        />
        <div className="flex items-center justify-center min-h-[60vh] px-4">
          <div className="text-center max-w-lg">
            <div className="text-5xl mb-4">🤔</div>
            <h2 className={`text-2xl font-semibold mb-2 ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
              {loadError ?? 'Anunțul nu a fost găsit.'}
            </h2>
            <p className={`${isDarkMode ? 'text-gray-300' : 'text-gray-600'} mb-6`}>
              Verifică dacă linkul este corect sau anunțul ar putea fi dezactivat. Poți reveni la lista de licitații pentru a căuta alte oportunități.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <button
                onClick={() => router.push('/ro')}
                className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition"
              >
                Înapoi la licitații
              </button>
              <button
                onClick={() => router.back()}
                className={`px-6 py-2 rounded-lg border ${
                  isDarkMode
                    ? 'border-gray-600 text-gray-200 hover:bg-gray-800'
                    : 'border-gray-300 text-gray-700 hover:bg-gray-100'
                } transition`}
              >
                Înapoi
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`min-h-screen w-full overflow-x-hidden transition-colors ${isDarkMode ? 'bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900' : 'bg-gradient-to-br from-gray-50 to-white'}`}>
      <UniversalHeader 
        isDarkMode={isDarkMode} 
        onToggleDarkMode={toggleDarkMode}
      />

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

      {/* Main Content Container */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 overflow-x-hidden">
        {/* Back Button */}
        <button
          onClick={() => router.back()}
          className={`mb-6 flex items-center space-x-2 text-sm font-medium transition-colors ${
            isDarkMode 
              ? 'text-gray-300 hover:text-white' 
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          <ArrowLeftIcon size="m" />
          <span>Înapoi la licitații</span>
        </button>

        {/* Main Layout: 2 Columns */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 w-full">
          {/* Left Column: Image Gallery (2/3 width) - 3D Modern & Compact */}
          <div className="lg:col-span-2 w-full min-w-0 order-1">
            <div className="relative" style={{ perspective: '1200px' }}>
              {/* Main 3D Image Gallery - Always visible on mobile */}
              <div className="relative aspect-[4/3] w-full rounded-2xl overflow-hidden bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-800 dark:to-gray-900 shadow-2xl group block mb-4"
                   style={{
                     transformStyle: 'preserve-3d',
                     transition: 'transform 0.6s cubic-bezier(0.4, 0, 0.2, 1)',
                   }}
                   onMouseMove={(e) => {
                     const rect = e.currentTarget.getBoundingClientRect();
                     const x = e.clientX - rect.left;
                     const y = e.clientY - rect.top;
                     const centerX = rect.width / 2;
                     const centerY = rect.height / 2;
                     const rotateX = (y - centerY) / 20;
                     const rotateY = (centerX - x) / 20;
                     e.currentTarget.style.transform = `perspective(1200px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale3d(1.02, 1.02, 1.02)`;
                   }}
                   onMouseLeave={(e) => {
                     e.currentTarget.style.transform = 'perspective(1200px) rotateX(0) rotateY(0) scale3d(1, 1, 1)';
                   }}>
                <div className="absolute inset-0">
                  <Image
                    src={auction.images[currentImageIndex]}
                    alt={auction.title}
                    fill
                    className="object-cover transition-all duration-700 ease-out"
                    priority
                    quality={95}
                    onClick={() => setShowImageModal(true)}
                  />
                  
                  {/* 3D Gradient Overlay */}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/20 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
                  
                  {/* Favorite Button - 3D Style */}
                  <button
                    onClick={(e) => { e.stopPropagation(); toggleFavorite(); }}
                    className={`absolute top-4 left-4 z-10 p-3 rounded-xl backdrop-blur-md transition-all duration-300 transform hover:scale-110 hover:-translate-y-1 ${
                      isFavorite
                        ? 'bg-red-500/90 text-white shadow-lg shadow-red-500/50'
                        : 'bg-white/90 dark:bg-gray-800/90 text-gray-700 dark:text-gray-300 hover:bg-red-500 hover:text-white shadow-lg'
                    }`}
                    style={{ transformStyle: 'preserve-3d' }}
                  >
                    <HeartIcon size="m" />
                  </button>

                  {/* Image Counter - 3D Badge */}
                  {auction.images.length > 1 && (
                    <div className="absolute top-4 right-4 z-10 px-4 py-2 rounded-xl backdrop-blur-md bg-black/70 text-white text-sm font-semibold shadow-2xl transform transition-transform hover:scale-105"
                         style={{ transformStyle: 'preserve-3d' }}>
                      <span className="text-white/90">{currentImageIndex + 1}</span>
                      <span className="text-white/50 mx-1">/</span>
                      <span className="text-white/70">{auction.images.length}</span>
                    </div>
                  )}

                  {/* Navigation Arrows - 3D Style */}
                  {auction.images.length > 1 && (
                    <>
                      <button
                        onClick={(e) => { e.stopPropagation(); prevImage(); }}
                        className="absolute left-4 top-1/2 -translate-y-1/2 z-10 p-3 rounded-full bg-white/90 dark:bg-gray-800/90 backdrop-blur-md text-gray-700 dark:text-gray-300 opacity-0 group-hover:opacity-100 transition-all duration-300 hover:bg-white dark:hover:bg-gray-700 shadow-2xl transform hover:scale-110 hover:-translate-x-1"
                        style={{ transformStyle: 'preserve-3d' }}
                      >
                        <ArrowLeftIcon size="m" />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); nextImage(); }}
                        className="absolute right-4 top-1/2 -translate-y-1/2 z-10 p-3 rounded-full bg-white/90 dark:bg-gray-800/90 backdrop-blur-md text-gray-700 dark:text-gray-300 opacity-0 group-hover:opacity-100 transition-all duration-300 hover:bg-white dark:hover:bg-gray-700 shadow-2xl transform hover:scale-110 hover:translate-x-1"
                        style={{ transformStyle: 'preserve-3d' }}
                      >
                        <ArrowRightIcon size="m" />
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* Compact 3D Thumbnails Strip - Below main image on mobile */}
              {auction.images.length > 1 && (
                <div className="mt-4 flex gap-3 overflow-x-auto pb-2 scrollbar-hide order-2" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
                  {auction.images.map((img, idx) => (
                    <button
                      key={idx}
                      onClick={() => setCurrentImageIndex(idx)}
                      className={`relative flex-shrink-0 w-16 h-16 sm:w-20 sm:h-20 rounded-xl overflow-hidden transition-all duration-300 transform hover:scale-110 ${
                        currentImageIndex === idx
                          ? 'ring-4 ring-blue-500 ring-offset-2 dark:ring-offset-gray-900 shadow-2xl scale-105'
                          : 'opacity-70 hover:opacity-100 shadow-lg'
                      }`}
                      style={{
                        transformStyle: 'preserve-3d',
                        transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                      }}
                      onMouseEnter={(e) => {
                        if (currentImageIndex !== idx) {
                          e.currentTarget.style.transform = 'translateY(-4px) scale(1.1)';
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (currentImageIndex !== idx) {
                          e.currentTarget.style.transform = 'translateY(0) scale(1)';
                        }
                      }}
                    >
                      <Image
                        src={img}
                        alt={`${auction.title} - ${idx + 1}`}
                        fill
                        className="object-cover"
                        quality={70}
                      />
                      {/* Active Indicator */}
                      {currentImageIndex === idx && (
                        <div className="absolute inset-0 bg-blue-500/20 backdrop-blur-[2px]"></div>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Dynamic Fields Section - Modern Table */}
          {auction?.customFields && Object.keys(auction.customFields).length > 0 && (
            <div className="lg:col-span-3 mb-6">
              <div className={`rounded-xl overflow-hidden border transition-colors ${
                isDarkMode
                  ? 'bg-gradient-to-br from-gray-800/80 via-gray-800/60 to-gray-900/80 border-gray-700/50 backdrop-blur-sm shadow-2xl'
                  : 'bg-gradient-to-br from-white via-gray-50 to-white border-gray-200 shadow-xl'
              }`}>
                {/* Header */}
                <div className={`px-6 py-4 border-b transition-colors ${
                  isDarkMode ? 'border-gray-700/50 bg-gray-800/30' : 'border-gray-200 bg-gray-50/50'
                }`}>
                  <h2 className={`text-xl font-bold transition-colors ${
                    isDarkMode ? 'text-white' : 'text-gray-900'
                  }`}>
                    Specificații Detaliate
                  </h2>
                  <p className={`text-sm mt-1 transition-colors ${
                    isDarkMode ? 'text-gray-400' : 'text-gray-600'
                  }`}>
                    Informații complete despre produs
                  </p>
                </div>

                {/* Dynamic Fields Grid */}
                <div className="p-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {Object.entries(auction.customFields).map(([key, value]) => {
                      // Skip empty values
                      if (value === null || value === undefined || value === '') return null;
                      
                      // Format key (convert camelCase to Title Case)
                      const formattedKey = key
                        .replace(/([A-Z])/g, ' $1')
                        .replace(/^./, str => str.toUpperCase())
                        .trim();
                      
                      // Format value based on type
                      let formattedValue: string = '';
                      const keyLower = key.toLowerCase();
                      const isAn = keyLower.includes('an') && (keyLower.includes('fabricatie') || keyLower === 'an' || (!keyLower.includes('constructie') && !keyLower.includes('ani')));
                      const isCapacitate = keyLower.includes('capacitate') && keyLower.includes('cilindric');
                      
                      if (typeof value === 'number') {
                        // Check if it's a surface/area value
                        if (keyLower.includes('hectare') || keyLower.includes('ha')) {
                          formattedValue = `${value} ha`;
                        } else if (keyLower.includes('suprafata') || keyLower.includes('suprafata')) {
                          formattedValue = `${value.toLocaleString('ro-RO')} mp`;
                        } else if (keyLower.includes('kilometri') || keyLower.includes('km')) {
                          formattedValue = `${value.toLocaleString('ro-RO')} km`;
                        } else if (keyLower.includes('ani') || (keyLower.includes('an') && keyLower.includes('constructie'))) {
                          formattedValue = `${value}`;
                        } else if (isAn) {
                          // An fabricație - fără separator de mii
                          formattedValue = `${value}`;
                        } else if (isCapacitate) {
                          // Capacitate cilindrică - fără separator de mii, cu " cm³"
                          formattedValue = `${value} cm³`;
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

                      // Get icon based on field name
                      const getIcon = (fieldKey: string) => {
                        const keyLower = fieldKey.toLowerCase();
                        if (keyLower.includes('camere') || keyLower.includes('camera')) return '🏠';
                        if (keyLower.includes('suprafata')) return '📐';
                        if (keyLower.includes('etaj')) return '🏢';
                        if (keyLower.includes('bai') || keyLower.includes('baie')) return '🚿';
                        if (keyLower.includes('dormitor')) return '🛏️';
                        if (keyLower.includes('an') && keyLower.includes('constructie')) return '📅';
                        if (keyLower.includes('centrala')) return '🔥';
                        if (keyLower.includes('parcare')) return '🅿️';
                        if (keyLower.includes('balcon')) return '🌳';
                        if (keyLower.includes('garaj')) return '🚗';
                        if (keyLower.includes('gradina')) return '🌿';
                        if (keyLower.includes('kilometri') || keyLower.includes('km')) return '🛣️';
                        if (keyLower.includes('marca')) return '🏭';
                        if (keyLower.includes('motor')) return '⚙️';
                        return '📋';
                      };

                      return (
                        <div
                          key={key}
                          className={`p-4 rounded-lg border transition-all duration-300 hover:scale-[1.02] hover:shadow-lg ${
                            isDarkMode
                              ? 'bg-gray-800/40 border-gray-700/50 hover:border-gray-600/70 hover:bg-gray-800/60'
                              : 'bg-white/60 border-gray-200 hover:border-gray-300 hover:bg-white/80'
                          }`}
                        >
                          <div className="flex items-start space-x-3">
                            <div className={`text-2xl flex-shrink-0 p-2 rounded-lg ${
                              isDarkMode ? 'bg-gray-700/50' : 'bg-gray-100'
                            }`}>
                              {getIcon(key)}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className={`text-xs font-medium uppercase tracking-wider mb-1 transition-colors ${
                                isDarkMode ? 'text-gray-400' : 'text-gray-500'
                              }`}>
                                {formattedKey}
                              </div>
                              <div className={`text-lg font-semibold transition-colors ${
                                isDarkMode ? 'text-white' : 'text-gray-900'
                              }`}>
                                {formattedValue}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Right Column: Product Info & Sidebar (1/3 width) */}
          <div className="lg:col-span-1 space-y-6">
            {/* Product Header */}
            <div>
              <h1 className={`text-3xl font-bold mb-3 transition-colors ${
                isDarkMode ? 'text-white' : 'text-gray-900'
              }`}>{auction.title}</h1>
              
              {/* Location & Rating */}
              <div className="flex items-center justify-between mb-4">
                <div className={`flex items-center space-x-2 transition-colors ${
                  isDarkMode ? 'text-gray-400' : 'text-gray-600'
                }`}>
                  <LocationIcon size="m" />
                  <span className="text-sm">{auction.location || 'București'}</span>
                </div>
                <div className="flex items-center space-x-1">
                  <span className="text-yellow-400">★</span>
                  <span className={`text-sm font-medium transition-colors ${
                    isDarkMode ? 'text-white' : 'text-gray-900'
                  }`}>5.0</span>
                </div>
              </div>

              {/* Price */}
              <div className="mb-6">
                <div className={`text-4xl font-bold transition-colors ${
                  isDarkMode ? 'text-white' : 'text-gray-900'
                }`}>
                  {auction.currentBid.toLocaleString()} Lei
                </div>
                {auction.startingBid !== auction.currentBid && (
                  <div className={`text-sm mt-1 transition-colors ${
                    isDarkMode ? 'text-gray-400' : 'text-gray-500'
                  }`}>
                    Preț de pornire: {auction.startingBid.toLocaleString()} Lei
                  </div>
                )}
              </div>

              {/* Countdown Timer */}
              <div className={`rounded-lg p-4 mb-6 transition-colors ${
                isDarkMode 
                  ? 'bg-gray-800/50 border border-gray-700' 
                  : 'bg-gray-50'
              }`}>
                <div className="flex items-center space-x-2 mb-2">
                  <ClockIcon size="m" className={isDarkMode ? 'text-gray-400' : 'text-gray-600'} />
                  <span className={`text-sm font-medium transition-colors ${
                    isDarkMode ? 'text-gray-300' : 'text-gray-700'
                  }`}>Timp rămas:</span>
                </div>
                <div className={`text-2xl font-bold transition-colors ${
                  isDarkMode ? 'text-white' : 'text-gray-900'
                }`}>
                  {timeLeft.days > 0 && `${timeLeft.days}d `}
                  {timeLeft.hours > 0 && `${timeLeft.hours}h `}
                  {timeLeft.minutes > 0 && `${timeLeft.minutes}m `}
                  {timeLeft.seconds}s
                </div>
              </div>

              {/* Quick Bid Buttons */}
              <div className="space-y-3">
                <button
                  onClick={() => handleQuickBid(auction.currentBid + bidIncrement)}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-6 rounded-lg transition-colors"
                >
                  Licitează {auction.currentBid + bidIncrement.toLocaleString()} Lei
                </button>
                <button
                  onClick={() => setShowBidModal(true)}
                  className={`w-full font-semibold py-3 px-6 rounded-lg transition-colors ${
                    isDarkMode
                      ? 'bg-gray-700 hover:bg-gray-600 text-white'
                      : 'bg-gray-100 hover:bg-gray-200 text-gray-900'
                  }`}
                >
                  Licitează altă sumă
                </button>
                <button
                  onClick={toggleWatching}
                  className={`w-full font-semibold py-3 px-6 rounded-lg transition-colors ${
                    isWatching
                      ? 'bg-yellow-500 hover:bg-yellow-600 text-white'
                      : isDarkMode
                        ? 'bg-gray-700 hover:bg-gray-600 text-white'
                        : 'bg-gray-100 hover:bg-gray-200 text-gray-900'
                  }`}
                >
                  {isWatching ? '✓ Urmărit' : 'Urmărește licitația'}
                </button>
              </div>
            </div>

            {/* Date Executor / Licitator Box - Business Card Design */}
            {executorData && (executorData.licitatorName || executorData.licitatorAddress || executorData.licitatorEmail || executorData.licitatorPhone) && (
              <div className={`hidden lg:block mb-6 ${
                isDarkMode 
                  ? 'bg-gray-800' 
                  : 'bg-white'
              }`}>
                <ExecutorBusinessCard executorData={executorData} auctionId={auctionId} isDarkMode={isDarkMode} />
              </div>
            )}

            {/* Seller Contact Card */}
            <div className={`rounded-lg p-6 border transition-colors ${
              isDarkMode
                ? 'bg-gray-800/50 border-gray-700'
                : 'bg-white border-gray-200'
            }`}>
              <div className="flex items-center space-x-4 mb-4">
                <div className={`w-16 h-16 rounded-full flex items-center justify-center transition-colors ${
                  isDarkMode ? 'bg-gray-700' : 'bg-gray-200'
                }`}>
                  <UserIcon size="l" className={isDarkMode ? 'text-gray-400' : 'text-gray-400'} />
                </div>
                <div>
                  <h3 className={`font-semibold transition-colors ${
                    isDarkMode ? 'text-white' : 'text-gray-900'
                  }`}>Vânzător</h3>
                  <p className={`text-sm transition-colors ${
                    isDarkMode ? 'text-gray-400' : 'text-gray-600'
                  }`}>{auction.seller}</p>
                </div>
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className={isDarkMode ? 'text-gray-400' : 'text-gray-600'}>Telefon:</span>
                  <span className={isDarkMode ? 'text-white' : 'text-gray-900'}>+40 123 456 789</span>
                </div>
                <div className="flex justify-between">
                  <span className={isDarkMode ? 'text-gray-400' : 'text-gray-600'}>Email:</span>
                  <span className={isDarkMode ? 'text-white' : 'text-gray-900'}>vanzator@example.com</span>
                </div>
              </div>
              <button className={`w-full mt-4 font-semibold py-2.5 px-4 rounded-lg transition-colors ${
                isDarkMode
                  ? 'bg-gray-700 hover:bg-gray-600 text-white'
                  : 'bg-gray-900 hover:bg-gray-800 text-white'
              }`}>
                Contactează vânzătorul
              </button>
            </div>

            {/* Schedule Tour / Request Info */}
            <div className={`rounded-lg p-6 transition-colors ${
              isDarkMode
                ? 'bg-gray-800/50 border border-gray-700'
                : 'bg-gray-50'
            }`}>
              <h3 className={`font-semibold mb-2 transition-colors ${
                isDarkMode ? 'text-white' : 'text-gray-900'
              }`}>Solicită informații</h3>
              <p className={`text-sm mb-4 transition-colors ${
                isDarkMode ? 'text-gray-400' : 'text-gray-600'
              }`}>
                Completează formularul pentru a primi mai multe detalii despre acest produs.
              </p>
              <div className="space-y-3 text-sm">
                <div>
                  <span className={isDarkMode ? 'text-gray-400' : 'text-gray-600'}>ID Produs:</span>
                  <span className={`ml-2 font-medium transition-colors ${
                    isDarkMode ? 'text-white' : 'text-gray-900'
                  }`}>{auction.id}</span>
                </div>
                <div>
                  <span className={isDarkMode ? 'text-gray-400' : 'text-gray-600'}>Nume Produs:</span>
                  <span className={`ml-2 font-medium transition-colors ${
                    isDarkMode ? 'text-white' : 'text-gray-900'
                  }`}>{auction.title}</span>
                </div>
                <div>
                  <input
                    type="text"
                    placeholder="Nume complet"
                    className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors ${
                      isDarkMode
                        ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400'
                        : 'bg-white border-gray-300 text-gray-900'
                    }`}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Product Details Section */}
        <div className="mt-12 grid grid-cols-1 lg:grid-cols-3 gap-8 w-full">
          {/* Left: Description & Features (2/3) */}
          <div className="lg:col-span-2 space-y-8 w-full min-w-0">
                             {/* Description */}
                 <div>
                   <h2 className={`text-2xl font-bold mb-4 transition-colors ${
                     isDarkMode ? 'text-white' : 'text-gray-900'
                   }`}>Descriere</h2>
                   <p className={`leading-relaxed whitespace-pre-line transition-colors ${
                     isDarkMode ? 'text-gray-300' : 'text-gray-700'
                   }`}>
                     {auction.description || 'Nu există descriere disponibilă pentru acest produs.'}
                   </p>
                 </div>

                             {/* Key Features / Amenities */}
                 <div>
                   <h2 className={`text-2xl font-bold mb-4 transition-colors ${
                     isDarkMode ? 'text-white' : 'text-gray-900'
                   }`}>Caracteristici</h2>
                   <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                     <div className={`flex flex-col items-center p-4 rounded-lg transition-colors ${
                       isDarkMode ? 'bg-gray-800/50 border border-gray-700' : 'bg-gray-50'
                     }`}>
                       <div className={`w-12 h-12 rounded-full flex items-center justify-center mb-2 ${
                         isDarkMode ? 'bg-blue-500/20' : 'bg-blue-100'
                       }`}>
                         <ClockIcon size="m" className="text-blue-600" />
                       </div>
                       <span className={`text-sm font-medium transition-colors ${
                         isDarkMode ? 'text-white' : 'text-gray-900'
                       }`}>Licitație</span>
                       <span className={`text-xs transition-colors ${
                         isDarkMode ? 'text-gray-400' : 'text-gray-600'
                       }`}>{auction.bidCount} oferte</span>
                     </div>
                      <div className={`flex flex-col items-center p-4 rounded-lg transition-colors ${
                        isDarkMode ? 'bg-gray-800/50 border border-gray-700' : 'bg-gray-50'
                      }`}>
                        <div className={`w-12 h-12 rounded-full flex items-center justify-center mb-2 ${
                          isDarkMode ? 'bg-green-500/20' : 'bg-green-100'
                        }`}>
                          <LocationIcon size="m" className="text-green-600" />
                        </div>
                        <span className={`text-sm font-medium transition-colors ${
                          isDarkMode ? 'text-white' : 'text-gray-900'
                        }`}>Locație</span>
                        <span className={`text-xs transition-colors ${
                          isDarkMode ? 'text-gray-400' : 'text-gray-600'
                        }`}>{auction.location}</span>
                      </div>
                      <div className={`flex flex-col items-center p-4 rounded-lg transition-colors ${
                        isDarkMode ? 'bg-gray-800/50 border border-gray-700' : 'bg-gray-50'
                      }`}>
                        <div className={`w-12 h-12 rounded-full flex items-center justify-center mb-2 ${
                          isDarkMode ? 'bg-blue-500/20' : 'bg-blue-100'
                        }`}>
                          <CoinsIcon size="m" className="text-blue-600" />
                        </div>
                        <span className={`text-sm font-medium transition-colors ${
                          isDarkMode ? 'text-white' : 'text-gray-900'
                        }`}>Preț</span>
                        <span className={`text-xs transition-colors ${
                          isDarkMode ? 'text-gray-400' : 'text-gray-600'
                        }`}>{auction.currentBid.toLocaleString()} Lei</span>
                      </div>
                      <div className={`flex flex-col items-center p-4 rounded-lg transition-colors ${
                        isDarkMode ? 'bg-gray-800/50 border border-gray-700' : 'bg-gray-50'
                      }`}>
                        <div className={`w-12 h-12 rounded-full flex items-center justify-center mb-2 ${
                          isDarkMode ? 'bg-orange-500/20' : 'bg-orange-100'
                        }`}>
                          <NotificationIcon size="m" className="text-orange-600" />
                        </div>
                        <span className={`text-sm font-medium transition-colors ${
                          isDarkMode ? 'text-white' : 'text-gray-900'
                        }`}>Urmăritori</span>
                        <span className={`text-xs transition-colors ${
                          isDarkMode ? 'text-gray-400' : 'text-gray-600'
                        }`}>{auction.watchers || 0} persoane</span>
                      </div>
              </div>
            </div>

            {/* Product Details Table */}
            <div>
              <h2 className={`text-2xl font-bold mb-4 transition-colors ${
                isDarkMode ? 'text-white' : 'text-gray-900'
              }`}>Detalii Produs</h2>
              <div className={`border rounded-lg overflow-hidden transition-colors ${
                isDarkMode
                  ? 'bg-gray-800/50 border-gray-700'
                  : 'bg-white border-gray-200'
              }`}>
                <table className="w-full">
                  <tbody className={`divide-y transition-colors ${
                    isDarkMode ? 'divide-gray-700' : 'divide-gray-200'
                  }`}>
                    <tr>
                      <td className={`px-6 py-4 text-sm font-medium w-1/3 transition-colors ${
                        isDarkMode ? 'text-gray-400' : 'text-gray-600'
                      }`}>Status</td>
                      <td className={`px-6 py-4 text-sm transition-colors ${
                        isDarkMode ? 'text-white' : 'text-gray-900'
                      }`}>
                        <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                          isAuctionEnded 
                            ? isDarkMode
                              ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                              : 'bg-red-100 text-red-800'
                            : isDarkMode
                              ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                              : 'bg-green-100 text-green-800'
                        }`}>
                          {isAuctionEnded ? 'Închisă' : 'Activă'}
                        </span>
                      </td>
                    </tr>
                    <tr>
                      <td className={`px-6 py-4 text-sm font-medium transition-colors ${
                        isDarkMode ? 'text-gray-400' : 'text-gray-600'
                      }`}>Categorie</td>
                      <td className={`px-6 py-4 text-sm capitalize transition-colors ${
                        isDarkMode ? 'text-white' : 'text-gray-900'
                      }`}>{auction.category}</td>
                    </tr>
                    <tr>
                      <td className={`px-6 py-4 text-sm font-medium transition-colors ${
                        isDarkMode ? 'text-gray-400' : 'text-gray-600'
                      }`}>Subcategorie</td>
                      <td className={`px-6 py-4 text-sm capitalize transition-colors ${
                        isDarkMode ? 'text-white' : 'text-gray-900'
                      }`}>{auction.subcategory}</td>
                    </tr>
                    <tr>
                      <td className={`px-6 py-4 text-sm font-medium transition-colors ${
                        isDarkMode ? 'text-gray-400' : 'text-gray-600'
                      }`}>Locație</td>
                      <td className={`px-6 py-4 text-sm transition-colors ${
                        isDarkMode ? 'text-white' : 'text-gray-900'
                      }`}>{auction.location}</td>
                    </tr>
                    {auction.year && (
                      <tr>
                        <td className={`px-6 py-4 text-sm font-medium transition-colors ${
                          isDarkMode ? 'text-gray-400' : 'text-gray-600'
                        }`}>An</td>
                        <td className={`px-6 py-4 text-sm transition-colors ${
                          isDarkMode ? 'text-white' : 'text-gray-900'
                        }`}>{auction.year}</td>
                      </tr>
                    )}
                    <tr>
                      <td className={`px-6 py-4 text-sm font-medium transition-colors ${
                        isDarkMode ? 'text-gray-400' : 'text-gray-600'
                      }`}>Condiție</td>
                      <td className={`px-6 py-4 text-sm transition-colors ${
                        isDarkMode ? 'text-white' : 'text-gray-900'
                      }`}>{auction.condition}</td>
                    </tr>
                    <tr>
                      <td className={`px-6 py-4 text-sm font-medium transition-colors ${
                        isDarkMode ? 'text-gray-400' : 'text-gray-600'
                      }`}>Livrare</td>
                      <td className={`px-6 py-4 text-sm transition-colors ${
                        isDarkMode ? 'text-white' : 'text-gray-900'
                      }`}>{auction.shipping}</td>
                    </tr>
                    <tr>
                      <td className={`px-6 py-4 text-sm font-medium transition-colors ${
                        isDarkMode ? 'text-gray-400' : 'text-gray-600'
                      }`}>Garanție</td>
                      <td className={`px-6 py-4 text-sm transition-colors ${
                        isDarkMode ? 'text-white' : 'text-gray-900'
                      }`}>{auction.warranty}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Right: Additional Info (1/3) */}
          <div className="lg:col-span-1 w-full min-w-0">
            {/* Payment Methods */}
            <div className={`border rounded-lg p-6 mb-6 transition-colors ${
              isDarkMode
                ? 'bg-gray-800/50 border-gray-700'
                : 'bg-white border-gray-200'
            }`}>
              <h3 className={`font-semibold mb-4 transition-colors ${
                isDarkMode ? 'text-white' : 'text-gray-900'
              }`}>Metode de plată</h3>
              <div className="space-y-2">
                {auction.paymentMethods.map((method, idx) => (
                  <div key={idx} className={`flex items-center space-x-2 text-sm transition-colors ${
                    isDarkMode ? 'text-gray-300' : 'text-gray-700'
                  }`}>
                    <div className="w-1.5 h-1.5 bg-blue-600 rounded-full"></div>
                    <span>{method}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Return Policy */}
            <div className={`border rounded-lg p-6 transition-colors ${
              isDarkMode
                ? 'bg-gray-800/50 border-gray-700'
                : 'bg-white border-gray-200'
            }`}>
              <h3 className={`font-semibold mb-4 transition-colors ${
                isDarkMode ? 'text-white' : 'text-gray-900'
              }`}>Politica de returnare</h3>
              <p className={`text-sm transition-colors ${
                isDarkMode ? 'text-gray-300' : 'text-gray-700'
              }`}>{auction.returnPolicy}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Bid Modal */}
      {showBidModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className={`rounded-xl p-6 w-full max-w-md ${isDarkMode ? 'bg-gray-800' : 'bg-white'}`}>
            <div className="flex justify-between items-center mb-4">
              <h3 className={`text-lg font-semibold transition-colors ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                Plasează licitația
              </h3>
              <button
                onClick={() => setShowBidModal(false)}
                className={`p-1 rounded-full transition-colors ${isDarkMode ? 'text-gray-400 hover:text-white' : 'text-gray-600 hover:text-gray-900'}`}
              >
                <CloseIcon size="m" />
              </button>
            </div>

            <div className="mb-4">
              <label className={`block text-sm font-medium mb-2 transition-colors ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                Suma licitației (Lei)
              </label>
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => setCurrentBidAmount(prev => Math.max(prev - bidIncrement, auction.currentBid + bidIncrement))}
                  className="p-2 border rounded-lg hover:bg-gray-50 transition-colors"
                >
                  <MinusIcon size="s" />
                </button>
                <input
                  type="number"
                  value={currentBidAmount}
                  onChange={(e) => setCurrentBidAmount(parseInt(e.target.value) || 0)}
                  min={auction.currentBid + auction.bidIncrement}
                  className={`flex-1 p-3 border rounded-lg transition-colors ${
                    isDarkMode 
                      ? 'bg-gray-700 border-gray-600 text-white' 
                      : 'bg-white border-gray-300 text-gray-900'
                  }`}
                />
                <button
                  onClick={() => setCurrentBidAmount(prev => prev + bidIncrement)}
                  className="p-2 border rounded-lg hover:bg-gray-50 transition-colors"
                >
                  <PlusIcon size="s" />
                </button>
              </div>
              <div className={`text-xs mt-1 transition-colors ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                Minimum: {auction.currentBid + auction.bidIncrement} Lei
              </div>
            </div>

            <div className="flex space-x-3">
              <button
                onClick={() => setShowBidModal(false)}
                className="flex-1 border border-gray-300 text-gray-700 py-2 rounded-lg font-semibold hover:bg-gray-50 transition-colors"
              >
                Anulează
              </button>
              <button
                onClick={handleBid}
                disabled={isBidding || currentBidAmount < auction.currentBid + auction.bidIncrement}
                className="flex-1 bg-blue-600 text-white py-2 rounded-lg font-semibold hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
              >
                {isBidding ? 'Se procesează...' : 'Plasează licitația'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Image Modal */}
      {showImageModal && (
        <div className="fixed inset-0 bg-black bg-opacity-90 flex items-center justify-center z-50">
          <div className="relative max-w-4xl max-h-[90vh] p-4">
            <button
              onClick={() => setShowImageModal(false)}
              className="absolute top-4 right-4 text-white p-2 rounded-full hover:bg-white hover:bg-opacity-20 transition-all z-10"
            >
              <CloseIcon size="l" />
            </button>
            
            <img
              src={auction.images[currentImageIndex]}
              alt={auction.title}
              className="max-w-full max-h-full object-contain"
            />
            
            {auction.images.length > 1 && (
              <>
                <button
                  onClick={prevImage}
                  className="absolute left-4 top-1/2 transform -translate-y-1/2 text-white p-2 rounded-full hover:bg-white hover:bg-opacity-20 transition-all"
                >
                  <ArrowLeftIcon size="l" />
                </button>
                <button
                  onClick={nextImage}
                  className="absolute right-4 top-1/2 transform -translate-y-1/2 text-white p-2 rounded-full hover:bg-white hover:bg-opacity-20 transition-all"
                >
                  <ArrowRightIcon size="l" />
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}