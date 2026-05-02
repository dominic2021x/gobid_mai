"use client";

import { dashboardApiFetch } from "@/lib/dashboard-api-fetch";
import { useState, useEffect } from "react";
import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { BuildingLibraryIcon } from "@heroicons/react/24/outline";
import Hammer from "@/components/Hammer";
import { CoinsIcon, CreditCardIcon, StarIcon, ArrowUpIcon, ArrowDownIcon } from "@/components/HeroIcons";
import UniversalHeader from "@/components/UniversalHeader";
import { BackButton } from "@/components/ui/back-button";
import jsPDF from 'jspdf';
import supabase from "@/lib/supabase";
import {
  resolveAccountTypeFromJwtOnly,
  hasDashboardLocalAuthEvidence,
} from "@/lib/auth/resolveAccountType";
import {
  getSupabaseAccessTokenRobust,
  getSupabaseSessionRobust,
  refreshSessionSingleFlight,
} from "@/lib/auth/getSupabaseSessionRobust";
import { useOblioStatus, requestOblioInvoice, buildPayloadForTransaction } from "@/lib/invoice/oblioClient";
import { isNativeCapacitorIos } from "@/lib/platform/isIosApp";
import type { AppleCatalogItem } from "@/lib/payments/apple/catalog";
import type { AppleCreditProductId } from "@/lib/payments/apple/product-map";
import { startAppleCreditPurchase } from "@/lib/payments/apple/startAppleCreditPurchase";
import AppleCreditBundles from "@/components/payments/AppleCreditBundles";
import { warnOnceOnRealtimeFailure } from "@/lib/realtime/logChannelFallback";
import { mapUserPaymentsToTransactionRows } from "@/lib/payments/mapUserPaymentsToTransactionRows";

export default function PaymentsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isPieseAuto = searchParams.get("context") === "piese-auto";
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
    level: 'Basic',
    package: 'Basic' as string
  });
  const [activeTab, setActiveTab] = useState('overview');
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showInvoiceModal, setShowInvoiceModal] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<any>(null);
  const [paymentMethod, setPaymentMethod] = useState<'netopia' | 'bank'>('netopia');
  const [newCard, setNewCard] = useState({
    cardNumber: '',
    expiryDate: '',
    cvv: '',
    cardholderName: '',
    saveCard: false
  });
  const [cardBrand, setCardBrand] = useState<string>('');
  const [message, setMessage] = useState({ type: '', text: '' });
  const [isPageLoading, setIsPageLoading] = useState(true);
  const oblioStatus = useOblioStatus();
  const [isLoadingTokens, setIsLoadingTokens] = useState(true);

  // Detect card brand based on first digits
  const detectCardBrand = (cardNumber: string) => {
    const number = cardNumber.replace(/\s/g, '');
    if (number.startsWith('4')) return 'visa';
    if (number.startsWith('5') || number.startsWith('2')) return 'mastercard';
    if (number.startsWith('3')) return 'amex';
    if (number.startsWith('6')) return 'discover';
    return '';
  };

  // Format card number with spaces
  const formatCardNumber = (value: string) => {
    const number = value.replace(/\s/g, '');
    const brand = detectCardBrand(number);
    
    if (brand === 'amex') {
      // American Express: 4-6-5 format
      return number.replace(/(\d{4})(\d{6})(\d{5})/, '$1 $2 $3');
    } else {
      // Visa, Mastercard, etc.: 4-4-4-4 format
      return number.replace(/(\d{4})(?=\d)/g, '$1 ');
    }
  };

  // Get card brand icon
  const getCardBrandIcon = (brand: string) => {
    switch (brand) {
      case 'visa':
        return (
          <div className="w-8 h-5 flex items-center justify-center">
            <svg viewBox="0 0 48 32" className="w-full h-full">
              <rect width="48" height="32" rx="4" fill="#1A1F71"/>
              <text x="24" y="20" textAnchor="middle" fill="white" fontSize="10" fontWeight="bold" fontFamily="Arial">VISA</text>
            </svg>
          </div>
        );
      case 'mastercard':
        return (
          <div className="w-8 h-5 flex items-center justify-center">
            <svg viewBox="0 0 48 32" className="w-full h-full">
              <rect width="48" height="32" rx="4" fill="white"/>
              <circle cx="18" cy="16" r="8" fill="#EB001B"/>
              <circle cx="30" cy="16" r="8" fill="#F79E1B"/>
              <path d="M24 8c-4.4 0-8 3.6-8 8s3.6 8 8 8 8-3.6 8-8-3.6-8-8-8z" fill="#EB001B"/>
            </svg>
          </div>
        );
      case 'amex':
        return (
          <div className="w-8 h-5 flex items-center justify-center">
            <svg viewBox="0 0 48 32" className="w-full h-full">
              <rect width="48" height="32" rx="4" fill="#006FCF"/>
              <text x="24" y="12" textAnchor="middle" fill="white" fontSize="5" fontWeight="bold" fontFamily="Arial">AMERICAN</text>
              <text x="24" y="20" textAnchor="middle" fill="white" fontSize="5" fontWeight="bold" fontFamily="Arial">EXPRESS</text>
            </svg>
          </div>
        );
      case 'discover':
        return (
          <div className="w-8 h-5 flex items-center justify-center">
            <svg viewBox="0 0 48 32" className="w-full h-full">
              <rect width="48" height="32" rx="4" fill="#FF6000"/>
              <circle cx="24" cy="16" r="6" fill="white"/>
              <circle cx="24" cy="16" r="3" fill="#FF6000"/>
              <text x="24" y="26" textAnchor="middle" fill="white" fontSize="4" fontWeight="bold" fontFamily="Arial">DISCOVER</text>
            </svg>
          </div>
        );
      default:
        return null;
    }
  };
  const [recentActivity, setRecentActivity] = useState<any[]>([]);
  const [userCredits, setUserCredits] = useState<number>(0);
  const [showCreditModal, setShowCreditModal] = useState(false);
  const [creditAmount, setCreditAmount] = useState<number>(50);
  const [isIosNativeApp, setIsIosNativeApp] = useState(false);
  const [appleCatalog, setAppleCatalog] = useState<AppleCatalogItem[]>([]);
  const [isApplePurchaseLoading, setIsApplePurchaseLoading] = useState(false);
  const [appleLoadingProductId, setAppleLoadingProductId] = useState<AppleCreditProductId | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    setIsIosNativeApp(isNativeCapacitorIos());
  }, []);

  useEffect(() => {
    if (!isIosNativeApp) return;
    const loadAppleCatalog = async () => {
      const response = await dashboardApiFetch('/api/payments/apple/catalog', { cache: 'no-store' });
      const payload = (await response.json().catch(() => ({}))) as { products?: AppleCatalogItem[] };
      if (response.ok && Array.isArray(payload.products)) {
        setAppleCatalog(payload.products);
        if (payload.products.length > 0) {
          setCreditAmount(payload.products[0].amount);
        }
      }
    };
    void loadAppleCatalog();
  }, [isIosNativeApp]);

  // Calculate real credit balance from payments (synchronized with admin)
  // Uses the same logic as admin: sum of all payment.amount values
  // This function is now mainly for local calculation, but credits are loaded from Supabase
  const calculateCreditBalance = () => {
    // Use invoices array which contains payments from admin
    // Credit = sum of all payment.amount (same as admin getTotalCredit function)
    // Support both payment.amount and payment.total for compatibility
    const totalCredit = invoices.reduce((total: number, payment: any) => {
      const amount = payment.amount || payment.total || 0;
      return total + (Number(amount) || 0);
    }, 0);
    return Math.max(0, totalCredit); // Ensure non-negative
  };

  // Load credits directly from Supabase via API route (bypasses RLS) - no localStorage
  const loadCreditsFromSupabase = async () => {
    try {
      const session = await getSupabaseSessionRobust(supabase);
      const userId =
        session?.user?.id ||
        (typeof window !== "undefined" ? localStorage.getItem("supabaseUserId") : null);

      if (!userId) {
        console.log('[Payments] No userId available for loading credits');
        setUserCredits(0);
        return;
      }

      // Load credits via API route (uses supabaseAdmin to bypass RLS)
      const accessToken = session?.access_token ?? null;
      const creditsResponse = await dashboardApiFetch('/api/credits', {
        credentials: "include",
        headers: {
          ...(userId && !accessToken ? { 'x-user-id': userId } : {})
        }
      });

      if (!creditsResponse.ok) {
        const errorData = await creditsResponse.json().catch(() => ({}));
        console.error('[Payments] Error loading credits from API:', {
          status: creditsResponse.status,
          error: errorData
        });
        setUserCredits(0);
        setInvoices([]);
        return;
      }

      const creditsData = await creditsResponse.json();
      
      if (creditsData.success && creditsData.credit !== undefined) {
        const creditBalance = Math.max(0, creditsData.credit || 0);
        console.log('[Payments] Loaded credits from API:', creditBalance, 'RON from', creditsData.paymentCount || 0, 'payments');
        setUserCredits(creditBalance);
        
        // Update invoices state with payments for consistency
        if (creditsData.payments && Array.isArray(creditsData.payments)) {
          setInvoices(creditsData.payments);
        } else {
          setInvoices([]);
        }
      } else {
        console.warn('[Payments] Invalid response from credits API:', creditsData);
        setUserCredits(0);
        setInvoices([]);
      }
    } catch (error) {
      console.error('[Payments] Error in loadCreditsFromSupabase:', error);
      setUserCredits(0);
      setInvoices([]);
    }
  };

  // Calculate total spent from transactions
  const calculateTotalSpent = () => {
    const totalSpent = transactions
      .filter((tx: any) => tx.status === 'completed' && (tx.type === 'purchase' || tx.type === 'credit_purchase'))
      .reduce((sum: number, tx: any) => sum + Math.abs(tx.amount || 0), 0);
    return totalSpent;
  };

  // Load recent activity from localStorage
  useEffect(() => {
    const savedActivity = localStorage.getItem('recentActivity');
    if (savedActivity) {
      try {
        const parsedActivity = JSON.parse(savedActivity);
        if (Array.isArray(parsedActivity)) {
          setRecentActivity(parsedActivity);
        }
      } catch (e) {
        console.error('Error parsing recent activity:', e);
      }
    }
  }, []);

  // Page loading effect
  useEffect(() => {
    const timer = setTimeout(() => {
      setIsPageLoading(false);
    }, 1000);
    return () => clearTimeout(timer);
  }, []);

  // Calculate bonus percentage based on amount
  const getBonusPercentage = (amount: number): number => {
    if (amount >= 300) return 20;
    if (amount >= 100) return 8;
    if (amount >= 50) return 3;
    return 0;
  };

  // Calculate total credits with bonus
  const calculateCreditsWithBonus = (amount: number): number => {
    const bonusPercentage = getBonusPercentage(amount);
    const bonusCredits = Math.floor((amount * bonusPercentage) / 100);
    return amount + bonusCredits;
  };

  // Save recent activity to localStorage
  const saveActivityToStorage = (activity: any[]) => {
    localStorage.setItem('recentActivity', JSON.stringify(activity));
  };

  // Add new activity
  const addActivity = (type: string, description: string, amount?: string, status: string = 'info') => {
    const newActivity = {
      id: Date.now().toString(),
      type,
      description,
      amount,
      status,
      time: new Date().toLocaleString('ro-RO', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      }),
      timestamp: Date.now()
    };

    const updatedActivity = [newActivity, ...recentActivity].slice(0, 10); // Keep only last 10
    setRecentActivity(updatedActivity);
    saveActivityToStorage(updatedActivity);
  };

  // Handle credit purchase – cu Netopia (card) sau alte metode
  const handleCreditPurchase = async (e: React.FormEvent) => {
    e.preventDefault();

    if (isIosNativeApp) {
      const selectedBundle = appleCatalog.find((bundle) => bundle.amount === creditAmount);
      if (!selectedBundle) {
        setMessage({ type: 'error', text: 'Selectează un pachet Apple valid.' });
        return;
      }

      const fallbackUserId = typeof window !== 'undefined' ? localStorage.getItem('supabaseUserId') : null;
      const result = await startAppleCreditPurchase(selectedBundle.productId, fallbackUserId);
      if (!result.ok) {
        if (!result.cancelled) {
          setMessage({ type: 'error', text: result.message });
        }
        return;
      }

      setShowCreditModal(false);
      setMessage({
        type: 'success',
        text: result.idempotent
          ? `Achiziția ${selectedBundle.amount} credite a fost deja procesată.`
          : `Ai primit ${result.creditedAmount} credite.`,
      });
      await loadCreditsFromSupabase();
      return;
    }

    const bonusPercentage = getBonusPercentage(creditAmount);
    const totalCredits = calculateCreditsWithBonus(creditAmount);
    
    if (paymentMethod === 'netopia') {
      try {
        /** JWT pentru Authorization; dacă lipsește după timeout, încearcă refresh (Firefox / Private). */
        let accessToken = await getSupabaseAccessTokenRobust(supabase, 5000);
        if (!accessToken) {
          const ref = await refreshSessionSingleFlight(supabase);
          accessToken = ref?.access_token ?? null;
        }
        if (!accessToken) {
          const { data: sess } = await supabase.auth.getSession();
          accessToken = sess.session?.access_token ?? null;
        }
        const res = await dashboardApiFetch('/api/credits/initiate-payment', {
          method: 'POST',
          cache: 'no-store',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
            ...(accessToken ? {} : {}),
          },
          body: JSON.stringify({
            amount: creditAmount,
            credits: totalCredits,
            payment_method: 'netopia',
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (res.status === 401) {
          setMessage({
            type: 'error',
            text:
              data.error ||
              data.message ||
              'Trebuie să fii autentificat pentru a plăti cu cardul. Reîncearcă după autentificare sau reîmprospătează pagina.',
          });
          return;
        }
        if (res.ok) {
          setShowCreditModal(false);
          if (data.use_form_redirect && data.form_url && data.env_key && data.data) {
            const form = document.createElement('form');
            form.method = 'POST';
            form.action = data.form_url;
            const inp1 = document.createElement('input');
            inp1.type = 'hidden';
            inp1.name = 'env_key';
            inp1.value = data.env_key as string;
            const inp2 = document.createElement('input');
            inp2.type = 'hidden';
            inp2.name = 'data';
            inp2.value = data.data as string;
            const inp3 = document.createElement('input');
            inp3.type = 'hidden';
            inp3.name = 'iv';
            inp3.value = (data.iv ?? '') as string;
            const inp4 = document.createElement('input');
            inp4.type = 'hidden';
            inp4.name = 'cipher';
            inp4.value = (data.cipher ?? 'aes-256-cbc') as string;
            form.append(inp1, inp2, inp3, inp4);
            document.body.appendChild(form);
            form.submit();
            return;
          }
          if (data.payment_url) {
            window.location.href = data.payment_url;
            return;
          }
        }
        const errText = [data.error, data.message].filter(Boolean).join('. ') || 'Eroare la redirecționarea către plată. Încearcă din nou.';
        const details = data.details?.httpStatus != null ? ` (HTTP ${data.details.httpStatus})` : (typeof data.details === 'string' ? ` ${data.details}` : '');
        setMessage({ type: 'error', text: errText + details });
      } catch (err) {
        setMessage({ type: 'error', text: 'Eroare la inițierea plății. Încearcă din nou.' });
      }
      return;
    }
    
    // Pentru transfer bancar – mesaj informativ
    const bonusText = bonusPercentage > 0 ? ` (+${bonusPercentage}% bonus)` : '';
    addActivity('credit', `Cerere cumpărare credite${bonusText}`, `${totalCredits} credite`, 'pending');
    setShowCreditModal(false);
    setMessage({ 
      type: 'info', 
      text: `Pentru ${totalCredits} credite (${creditAmount} Lei) prin transfer bancar, contactează-ne la contact@gobid.ro.` 
    });
    setTimeout(() => setMessage({ type: '', text: '' }), 5000);
  };

  const handleAppleBundlePurchase = async (bundle: AppleCatalogItem) => {
    if (isApplePurchaseLoading) return;
    setIsApplePurchaseLoading(true);
    setAppleLoadingProductId(bundle.productId);
    setMessage({ type: '', text: '' });
    try {
      const fallbackUserId = typeof window !== 'undefined' ? localStorage.getItem('supabaseUserId') : null;
      const result = await startAppleCreditPurchase(bundle.productId, fallbackUserId);
      if (!result.ok) {
        if (!result.cancelled) {
          setMessage({ type: 'error', text: result.message });
        }
        return;
      }

      setShowCreditModal(false);
      setMessage({
        type: 'success',
        text: result.idempotent
          ? `Achiziția ${bundle.amount} credite a fost deja procesată.`
          : `Ai primit ${result.creditedAmount} credite.`,
      });
      await loadCreditsFromSupabase();
    } finally {
      setIsApplePurchaseLoading(false);
      setAppleLoadingProductId(null);
    }
  };

  // Simulate admin approval of credit transaction (for testing)
  const approveCreditTransaction = async (transactionId: string) => {
    setTransactions(prev => prev.map(transaction => {
      if (transaction.id === transactionId && transaction.type === 'credit_purchase') {
        // Add credits to user account
        const credits = (transaction as any).credits || 0;
        // Credit balance is managed in user_tokens table, not in local state
        // Reload tokens from Supabase after credit purchase
        (async () => {
          try {
            const { data: { session } } = await supabase.auth.getSession();
            if (session) {
              const accessToken = session.access_token;
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
            }
          } catch (error) {
            console.error('Error reloading tokens:', error);
          }
        })();
        
        // Update activity
        addActivity('credit', `Credite aprobate și adăugate`, `${credits} credite`, 'success');
        
        return { ...transaction, status: 'completed' };
      }
      return transaction;
    }));
  };

  // Real transactions data - loaded from localStorage
  const [transactions, setTransactions] = useState<any[]>([]);

  // Real invoices data - loaded from API (user_payments, for balance/transactions)
  const [invoices, setInvoices] = useState<any[]>([]);

  // Facturi Oblio (din tabelul invoices) – afișate în tab-ul Facturi
  const [oblioInvoicesList, setOblioInvoicesList] = useState<Array<{ id: string; invoice_number: string | null; series: string | null; amount: number; currency: string; status: string; created_at: string }>>([]);

  // Real saved cards data - loaded from localStorage
  const [savedCards, setSavedCards] = useState<any[]>([]);

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

  // Load user info and tokens - same logic as dashboard page
  useEffect(() => {
    const loadUserData = async () => {
      try {
        const { user: jwtUser, accountType } = await resolveAccountTypeFromJwtOnly(supabase);
        const { data: sessionData, error: initialSessionError } = await supabase.auth.getSession();
        let user = sessionData.session?.user ?? jwtUser;
        let userId: string | null = null;

        console.log('[Payments] Initial session check:', {
          hasSession: !!sessionData.session,
          hasUser: !!user,
          userId: user?.id,
          sessionError: initialSessionError?.message,
          accountType,
        });

        if (accountType === 'liquidator') {
          if (typeof window !== "undefined") {
            window.location.replace("/dashboard/lichidator/payments");
          }
          return;
        }
        if (accountType === 'executor') {
          if (typeof window !== "undefined") {
            window.location.replace("/dashboard/executor/payments");
          }
          return;
        }

        // If no Supabase session, try to get userId from localStorage
        if (!user && typeof window !== "undefined") {
          const savedUserInfo = localStorage.getItem('userInfo');
          const savedSupabaseUserId = localStorage.getItem('supabaseUserId');
          
          if (savedUserInfo) {
            try {
              const userInfo = JSON.parse(savedUserInfo);
              const supabaseUserId = savedSupabaseUserId || userInfo.supabaseUserId;
              
              if (supabaseUserId) {
                console.log('[Payments] Found supabaseUserId in localStorage:', supabaseUserId);
                userId = supabaseUserId;
              } else {
                userId = userInfo.email || 'local-user';
                console.log('[Payments] Using localStorage fallback for authentication (no supabaseUserId)');
              }
              
              // Set user info from localStorage
              setUserInfo(prev => ({ ...prev, ...userInfo }));
            } catch (e) {
              console.error('Error parsing userInfo from localStorage:', e);
            }
          }
        } else if (user) {
          userId = user.id;
        }

        // Check if user is admin or manager before redirecting
        if (!userId) {
          // Check if admin info exists in localStorage (admin/manager logged in)
          if (typeof window !== "undefined") {
            const savedAdminInfo = localStorage.getItem('adminInfo');
            if (savedAdminInfo) {
              try {
                const adminInfo = JSON.parse(savedAdminInfo);
                if (adminInfo.isAdmin || adminInfo.role === 'manager') {
                  // Admin/Manager can access, continue without userId
                  console.log('[Payments] Admin/Manager access granted');
                } else {
                  window.location.href = "/auth?mode=login";
                  return;
                }
              } catch (e) {
                console.error('Error parsing adminInfo:', e);
                window.location.href = "/auth?mode=login";
                return;
              }
            } else {
              if (hasDashboardLocalAuthEvidence()) {
                console.log(
                  "[Payments] Fără userId încă, dar dovezi locale ca în layout — nu redirecționăm la /auth"
                );
                return;
              }
              window.location.href = "/auth?mode=login";
              return;
            }
          } else {
            return;
          }
        }

        // Load user info from Supabase if we have userId
        if (userId && user) {
          const { data: profile } = await supabase
            .from("user_profiles")
            .select("first_name,last_name,phone,avatar_url")
            .eq("user_id", userId)
            .maybeSingle();

          if (profile) {
            setUserInfo(prev => ({
              ...prev,
              firstName: profile.first_name || prev.firstName,
              lastName: profile.last_name || prev.lastName,
              phone: profile.phone || prev.phone,
              avatar: profile.avatar_url || prev.avatar,
              email: user.email || prev.email
            }));
          }
        } else if (typeof window !== "undefined") {
          // Fallback to localStorage
          const savedUserInfo = localStorage.getItem('userInfo');
          if (savedUserInfo) {
            try {
              const parsedInfo = JSON.parse(savedUserInfo);
              setUserInfo(prev => ({ ...prev, ...parsedInfo }));
            } catch (e) {
              console.error('Error parsing userInfo:', e);
            }
          }
        }
      } catch (error) {
        console.error('[Payments] Error loading user data:', error);
      }
    };

    loadUserData();
    const retryLoadUserDataTimer = setTimeout(() => {
      void loadUserData();
    }, 1200);

    const savedTokens = localStorage.getItem('userTokens');

    // Load tokens from Supabase first (same logic as tokens page)
    const loadTokensFromSupabase = async () => {
      setIsLoadingTokens(true);
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const userId = session?.user?.id || (typeof window !== "undefined" ? localStorage.getItem('supabaseUserId') : null);
        
        if (!userId) {
          console.log('[Payments] No userId available, using localStorage fallback');
          // Fallback to localStorage
          if (savedTokens) {
            const parsedTokens = JSON.parse(savedTokens);
            setUserTokens(parsedTokens);
          }
          return;
        }

        const accessToken = session?.access_token;

        // Load tokens from Supabase using API (same as tokens page)
        console.log('[Payments] Loading tokens from API with userId:', userId, 'hasAccessToken:', !!accessToken);
        const tokensResponse = await dashboardApiFetch('/api/tokens', {
          headers: {
            ...(userId && !accessToken ? { 'x-user-id': userId } : {})
          }
        });

        if (tokensResponse.ok) {
          const tokensData = await tokensResponse.json();
          
          // Dacă nu există record în Supabase (balance = 0, totalEarned = 0, totalSpent = 0)
          // și există tokeni în localStorage, migrează-i în Supabase
          if (tokensData.balance === 0 && tokensData.totalEarned === 0 && tokensData.totalSpent === 0) {
            if (savedTokens) {
              try {
                const localTokens = JSON.parse(savedTokens);
                // Dacă localStorage are tokeni (balance > 0 sau totalSpent > 0), migrează-i
                if (localTokens.balance > 0 || localTokens.totalSpent > 0) {
                  console.log('[Payments] Migrating tokens from localStorage to Supabase...');
                  const migrateResponse = await dashboardApiFetch('/api/tokens', {
                    method: 'PUT',
                    headers: {
                      ...(userId && !accessToken ? { 'x-user-id': userId } : {}),
                      'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                      balance: localTokens.balance || 0,
                      totalEarned: localTokens.totalEarned || 0,
                      totalSpent: localTokens.totalSpent || 0,
                      level: localTokens.level || 'Basic',
                      package: localTokens.package || 'Basic'
                    })
                  });

                  if (migrateResponse.ok) {
                    const migratedData = await migrateResponse.json();
                    setUserTokens({
                      balance: migratedData.balance ?? 0,
                      totalEarned: migratedData.totalEarned ?? 0,
                      totalSpent: migratedData.totalSpent ?? 0,
                      level: migratedData.level || 'Basic',
                      package: migratedData.package || 'Basic'
                    });
                    console.log('[Payments] Migration successful!');
                    return;
                  }
                }
              } catch (e) {
                console.error('[Payments] Error migrating tokens:', e);
              }
            }
          }
          
          // Folosește valorile din Supabase
          console.log('[Payments] Setting tokens from Supabase:', tokensData);
          const newTokens = {
            balance: tokensData.balance ?? 0,
            totalEarned: tokensData.totalEarned ?? 0,
            totalSpent: tokensData.totalSpent ?? 0,
            level: tokensData.level || 'Basic',
            package: tokensData.package || 'Basic'
          };
          console.log('[Payments] Setting userTokens to:', newTokens);
          setUserTokens(newTokens);
          
          // Update localStorage with Supabase values
          if (typeof window !== 'undefined') {
            localStorage.setItem('userTokens', JSON.stringify({
              balance: tokensData.balance ?? 0,
              totalEarned: tokensData.totalEarned ?? 0,
              totalSpent: tokensData.totalSpent ?? 0,
              level: tokensData.level || 'Basic',
              package: tokensData.package || 'Basic'
            }));
          }
        } else {
          console.error('[Payments] Failed to load tokens from API:', tokensResponse.status);
          // Fallback to localStorage
          if (savedTokens) {
            const parsedTokens = JSON.parse(savedTokens);
            setUserTokens(parsedTokens);
          }
        }
      } catch (error) {
        console.error('[Payments] Error loading tokens from Supabase:', error);
        // Fallback to localStorage
        if (savedTokens) {
          try {
            const tokens = JSON.parse(savedTokens);
            setUserTokens(tokens);
          } catch (e) {
            console.error('[Payments] Error parsing saved tokens:', e);
          }
        } else {
          // NO default tokens - must be 0 if no record exists
          setUserTokens({
            balance: 0,
            totalEarned: 0,
            totalSpent: 0,
            level: 'Basic',
            package: 'Basic'
          });
        }
      } finally {
        setIsLoadingTokens(false);
      }
    };

    loadTokensFromSupabase();

    // Load real transactions from localStorage
    const savedUserInfo = typeof window !== "undefined" ? localStorage.getItem('userInfo') : null;
    const userEmail = savedUserInfo ? JSON.parse(savedUserInfo).email : null;
    if (userEmail) {
      const transactionsKey = `transactions_${userEmail}`;
      const savedTransactions = localStorage.getItem(transactionsKey) || localStorage.getItem('transactions');
      if (savedTransactions) {
        try {
          const parsedTransactions = JSON.parse(savedTransactions);
          if (Array.isArray(parsedTransactions)) {
            setTransactions(parsedTransactions);
          }
        } catch (e) {
          console.error('Error parsing transactions:', e);
        }
      }
    } else {
      // Try general transactions key
      const savedTransactions = localStorage.getItem('transactions');
      if (savedTransactions) {
        try {
          const parsedTransactions = JSON.parse(savedTransactions);
          if (Array.isArray(parsedTransactions)) {
            setTransactions(parsedTransactions);
          }
        } catch (e) {
          console.error('Error parsing transactions:', e);
        }
      }
    }

    // Load payments and credits via API route (bypasses RLS)
    const loadPaymentsFromSupabase = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const userId = session?.user?.id || (typeof window !== "undefined" ? localStorage.getItem('supabaseUserId') : null);
        
        if (!userId) {
          console.log('[Payments] No userId available for loading payments');
          setInvoices([]);
          setTransactions([]);
          setUserCredits(0);
          return;
        }

        console.log('[Payments] Loading payments from API for userId:', userId);
        
        // Load credits via API route (uses supabaseAdmin to bypass RLS)
        const accessToken = session?.access_token;
        const creditsResponse = await dashboardApiFetch('/api/credits', {
          headers: {
            ...(userId && !accessToken ? { 'x-user-id': userId } : {})
          }
        });

        if (!creditsResponse.ok) {
          const errorData = await creditsResponse.json().catch(() => ({}));
          console.error('[Payments] Error loading payments from API:', {
            status: creditsResponse.status,
            error: errorData
          });
          setInvoices([]);
          setTransactions([]);
          setUserCredits(0);
          return;
        }

        const creditsData = await creditsResponse.json();
        
        if (creditsData.success && creditsData.credit !== undefined) {
          const creditBalance = Math.max(0, creditsData.credit || 0);
          console.log('[Payments] Loaded payments from API:', {
            credit: creditBalance,
            paymentCount: creditsData.paymentCount || 0,
            payments: creditsData.payments
          });
          
          // Update invoices state with payments
          if (creditsData.payments && Array.isArray(creditsData.payments)) {
            setInvoices(creditsData.payments);
            setTransactions(mapUserPaymentsToTransactionRows(creditsData.payments));
          } else {
            setInvoices([]);
            setTransactions([]);
          }
          
          // Set credit balance
          setUserCredits(creditBalance);
          console.log('[Payments] Calculated credits from API:', creditBalance);
        } else {
          console.warn('[Payments] Invalid response from credits API:', creditsData);
          setInvoices([]);
          setTransactions([]);
          setUserCredits(0);
        }
      } catch (error) {
        console.error('[Payments] Error loading payments from API:', error);
        setInvoices([]);
        setTransactions([]);
        setUserCredits(0);
      }
    };

    loadPaymentsFromSupabase();

    // Facturi Oblio (tabelul invoices) – pentru tab-ul Facturi
    const loadOblioInvoices = async () => {
      try {
        const accessToken = await getSupabaseAccessTokenRobust(supabase);
        if (!accessToken) return;
        const res = await dashboardApiFetch('/api/user/invoices', {
          credentials: 'include',
        });
        if (res.ok) {
          const data = await res.json();
          setOblioInvoicesList(Array.isArray(data.invoices) ? data.invoices : []);
        } else {
          setOblioInvoicesList([]);
        }
      } catch {
        setOblioInvoicesList([]);
      }
    };
    loadOblioInvoices();

    // Load real saved cards from localStorage
    if (userEmail) {
      const cardsKey = `savedCards_${userEmail}`;
      const savedCardsData = localStorage.getItem(cardsKey) || localStorage.getItem('savedCards');
      if (savedCardsData) {
        try {
          const parsedCards = JSON.parse(savedCardsData);
          if (Array.isArray(parsedCards)) {
            setSavedCards(parsedCards);
          }
        } catch (e) {
          console.error('Error parsing saved cards:', e);
        }
      }
    } else {
      // Try general saved cards key
      const savedCardsData = localStorage.getItem('savedCards');
      if (savedCardsData) {
        try {
          const parsedCards = JSON.parse(savedCardsData);
          if (Array.isArray(parsedCards)) {
            setSavedCards(parsedCards);
          }
        } catch (e) {
          console.error('Error parsing saved cards:', e);
        }
      }
    }

    // Calculate real credit balance from invoices
    setIsPageLoading(false);
    return () => {
      clearTimeout(retryLoadUserDataTimer);
    };
  }, []);

  // Load credits from Supabase on mount and when invoices change
  useEffect(() => {
    // Load credits directly from Supabase instead of localStorage
    loadCreditsFromSupabase();
  }, []);

  // Update credit balance from invoices when they change (fallback calculation)
  useEffect(() => {
    // Only update if we have invoices loaded
    if (invoices.length > 0) {
      const creditBalance = calculateCreditBalance();
      console.log('[Payments] useEffect - invoices changed, calculating credit:', {
        creditBalance,
        invoicesCount: invoices.length
      });
      setUserCredits(creditBalance);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invoices]);

  // Listen for Supabase realtime changes on user_payments table (optional; polling below is fallback)
  useEffect(() => {
    const warnRt = warnOnceOnRealtimeFailure(
      "Payments",
      "user_payments",
      "Migrație: 20260127_enable_user_payments_realtime.sql sau Supabase → Database → Replication."
    );

    const setupRealtime = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const userId = session?.user?.id || (typeof window !== "undefined" ? localStorage.getItem('supabaseUserId') : null);
      
      if (!userId) return;

      const channel = supabase
        .channel('user_payments_changes', {
          config: {
            broadcast: { self: true },
            presence: { key: userId }
          }
        })
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'user_payments',
            filter: `user_id=eq.${userId}`
          },
          (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => {
            if (process.env.NODE_ENV === 'development') {
              console.log('[Payments] Realtime user_payments:', payload.eventType);
            }
            loadCreditsFromSupabase();
          }
        )
        .subscribe((status: string) => {
          if (status === "SUBSCRIBED") {
            if (process.env.NODE_ENV === "development") {
              console.log("[Payments] Realtime: subscribed to user_payments");
            }
          }
          warnRt(status);
        });

      return () => {
        supabase.removeChannel(channel);
      };
    };

    const cleanup = setupRealtime();
    return () => {
      cleanup.then(cleanupFn => cleanupFn && cleanupFn());
    };
  }, []);

  // Refresh tokens and credits from Supabase periodically (realtime updates)
  useEffect(() => {
    const refreshData = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const userId = session?.user?.id || (typeof window !== "undefined" ? localStorage.getItem('supabaseUserId') : null);
        
        if (!userId) {
          return;
        }

        // Refresh tokens from API
        const accessToken = session?.access_token;
        const tokensResponse = await dashboardApiFetch('/api/tokens', {
          headers: {
            ...(userId && !accessToken ? { 'x-user-id': userId } : {})
          }
        });
        
        if (tokensResponse.ok) {
          const tokensData = await tokensResponse.json();
          const newTokens = {
            balance: tokensData.balance ?? 0,
            totalEarned: tokensData.totalEarned ?? 0,
            totalSpent: tokensData.totalSpent ?? 0,
            level: tokensData.level || 'Basic',
            package: tokensData.package || 'Basic'
          };
          setUserTokens(newTokens);
          
          // Update localStorage for tokens (still needed for other parts of app)
          if (typeof window !== 'undefined') {
            localStorage.setItem('userTokens', JSON.stringify(newTokens));
          }
        }

        // Refresh credits directly from Supabase (realtime)
        await loadCreditsFromSupabase();
      } catch (error) {
        console.error('[Payments] Error refreshing data:', error);
      }
    };

    // Refresh immediately on mount
    refreshData();
    
    // Refresh every 3 seconds from Supabase for realtime credit updates
    const interval = setInterval(refreshData, 3000);
    
    return () => clearInterval(interval);
  }, []);

  // Credits are now loaded directly from Supabase, no localStorage needed

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'bg-green-100 text-green-800 border-green-200';
      case 'pending': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'failed': return 'bg-red-100 text-red-800 border-red-200';
      case 'canceled': return 'bg-orange-100 text-orange-800 border-orange-200';
      case 'paid': return 'bg-green-100 text-green-800 border-green-200';
      case 'refunded': return 'bg-blue-100 text-blue-800 border-blue-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'completed': return 'Completată';
      case 'pending': return 'În așteptare';
      case 'failed': return 'Eșuată';
      case 'canceled': return 'Anulată';
      case 'paid': return 'Achitată';
      case 'refunded': return 'Rambursată';
      default: return status;
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'purchase': return <CreditCardIcon size="s" className="text-green-500" />;
      case 'refund': return <ArrowUpIcon size="s" className="text-blue-500" />;
      case 'deposit': return <ArrowUpIcon size="s" className="text-blue-500" />;
      case 'credit_purchase': return <CoinsIcon size="s" className="text-yellow-500" />;
      default: return <ArrowDownIcon size="s" className="text-gray-500" />;
    }
  };

  const handleAddCard = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Simulate card validation
    if (newCard.cardNumber.length < 16) {
      setMessage({ type: 'error', text: 'Numărul cardului trebuie să aibă 16 cifre!' });
      return;
    }
    
    if (newCard.expiryDate.length < 5) {
      setMessage({ type: 'error', text: 'Data expirării trebuie să fie în format MM/YY!' });
      return;
    }
    
    if (newCard.cvv.length < 3) {
      setMessage({ type: 'error', text: 'CVV-ul trebuie să aibă 3 cifre!' });
      return;
    }

    const newCardData = {
      id: `card-${Date.now()}`,
      last4: newCard.cardNumber.replace(/\s/g, '').slice(-4),
      brand: cardBrand === 'visa' ? 'Visa' : 
             cardBrand === 'mastercard' ? 'Mastercard' :
             cardBrand === 'amex' ? 'American Express' :
             cardBrand === 'discover' ? 'Discover' : 'Card',
      expiryMonth: newCard.expiryDate.split('/')[0],
      expiryYear: '20' + newCard.expiryDate.split('/')[1],
      isDefault: savedCards.length === 0
    };

    setSavedCards(prev => [...prev, newCardData]);
    setNewCard({ cardNumber: '', expiryDate: '', cvv: '', cardholderName: '', saveCard: false });
    setCardBrand('');
    setMessage({ type: 'success', text: 'Cardul a fost adăugat cu succes!' });
    
    // Add activity
    addActivity('card', `Card adăugat **** ${newCardData.last4}`, '', 'success');
    
    // If this is a fund addition (has amount), add fund activity
    const amountInput = document.querySelector('input[type="number"]') as HTMLInputElement;
    if (amountInput && amountInput.value) {
      addActivity('funds', `Fonduri adăugate`, `${parseInt(amountInput.value).toLocaleString()} Lei`, 'success');
    }
    
    setTimeout(() => setMessage({ type: '', text: '' }), 3000);
  };

  const handleDeleteCard = (cardId: string) => {
    const cardToDelete = savedCards.find(card => card.id === cardId);
    setSavedCards(prev => prev.filter(card => card.id !== cardId));
    setMessage({ type: 'success', text: 'Cardul a fost șters cu succes!' });
    
    // Add activity
    if (cardToDelete) {
      addActivity('card', `Card șters **** ${cardToDelete.last4}`, '', 'info');
    }
    
    setTimeout(() => setMessage({ type: '', text: '' }), 3000);
  };

  const handleSetDefaultCard = (cardId: string) => {
    const cardToSetDefault = savedCards.find(card => card.id === cardId);
    setSavedCards(prev => prev.map(card => ({
      ...card,
      isDefault: card.id === cardId
    })));
    setMessage({ type: 'success', text: 'Cardul implicit a fost schimbat!' });
    
    // Add activity
    if (cardToSetDefault) {
      addActivity('card', `Card setat ca implicit **** ${cardToSetDefault.last4}`, '', 'info');
    }
    
    setTimeout(() => setMessage({ type: '', text: '' }), 3000);
  };

  const handleTransactionStatusChange = (transactionId: string, newStatus: string) => {
    const transaction = transactions.find(t => t.id === transactionId);
    if (transaction) {
      setTransactions(prev => prev.map(t => 
        t.id === transactionId ? { ...t, status: newStatus } : t
      ));
      
      // Add activity
      const statusText = newStatus === 'completed' ? 'completată' : 
                        newStatus === 'pending' ? 'în așteptare' : 
                        newStatus === 'failed' ? 'eșuată' : newStatus;
      addActivity('transaction', `Tranzacție ${statusText} ${transactionId}`, `${transaction.amount.toLocaleString()} Lei`, 
        newStatus === 'completed' ? 'success' : 
        newStatus === 'pending' ? 'pending' : 'info');
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('userInfo');
    window.location.href = '/';
  };

  const handleDownloadInvoice = async (invoice: any) => {
    const invoiceAmount = invoice.total || invoice.amount || 0;
    const meta = invoice.metadata as Record<string, unknown> | undefined;
    const oblioSeries = meta?.oblio_series as string | undefined;
    const oblioNumber = meta?.oblio_number as string | undefined;

    // Oblio.eu: dacă e activ din Admin → Module
    try {
      if (oblioStatus.enabled) {
        // 1. Dacă avem deja factură Oblio → descărcăm din contul Oblio (fără duplicat)
        if (oblioSeries && oblioNumber) {
          const pdfRes = await dashboardApiFetch(`/api/oblio/invoice-pdf?seriesName=${encodeURIComponent(oblioSeries)}&number=${encodeURIComponent(oblioNumber)}`);
          const pdfData = await pdfRes.json();
          if (pdfData.success && pdfData.link) {
            addActivity('invoice', `Factură Oblio descărcată ${invoice.id}`, `${invoiceAmount.toLocaleString('ro-RO')} Lei`, 'success');
            window.open(pdfData.link, '_blank');
            return;
          }
        }

        // 2. Factură nouă în Oblio (model automat din cont)
        const payment = {
          date: invoice.date || (invoice.created_at ? new Date(invoice.created_at).toISOString().split('T')[0] : undefined),
          dueDate: invoice.dueDate,
          currency: 'RON',
          total: invoice.total ?? invoice.amount,
          amount: invoice.amount ?? invoice.total,
          description: invoice.description || `Factură ${invoice.id}`,
          status: invoice.status ?? 'completed',
          items: (invoice.items || []).map((item: any) => ({
            name: item.name || item.description,
            quantity: item.quantity ?? 1,
            price: item.price ?? item.amount,
            amount: item.amount ?? item.price,
          })),
        };
        const clientInfo = {
          name: invoice.buyer?.name || `${userInfo?.firstName || ''} ${userInfo?.lastName || ''}`.trim() || 'Client',
          email: invoice.buyer?.email || userInfo?.email,
          address: invoice.buyer?.address,
          city: invoice.buyer?.city,
          county: invoice.buyer?.county,
          country: invoice.buyer?.country || 'România',
          phone: invoice.buyer?.phone,
          vatCode: invoice.buyer?.vatCode || invoice.buyer?.cui,
        };
        const res = await dashboardApiFetch('/api/oblio/create-invoice', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ payment, clientInfo, seriesName: 'FCT' }),
        });
        const data = await res.json();
        if (data.success && data.link) {
          addActivity('invoice', `Factură Oblio descărcată ${invoice.id}`, `${invoiceAmount.toLocaleString('ro-RO')} Lei`, 'success');
          window.open(data.link, '_blank');
          // Salvează ref Oblio pentru descărcări viitoare (din cont Oblio, fără duplicat)
          if (invoice.id && data.seriesName && data.number) {
            try {
              const { data: { session } } = await supabase.auth.getSession();
              const accessToken = session?.access_token;
              const userId = session?.user?.id || localStorage.getItem('supabaseUserId');
              await dashboardApiFetch('/api/oblio/save-invoice-ref', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  ...(userId && !accessToken ? { 'x-user-id': userId } : {}),
                },
                body: JSON.stringify({
                  paymentId: invoice.id,
                  oblioSeries: data.seriesName,
                  oblioNumber: data.number,
                }),
              });
              setInvoices((prev) => prev.map((inv: any) =>
                inv.id === invoice.id
                  ? { ...inv, metadata: { ...(inv.metadata || {}), oblio_series: data.seriesName, oblio_number: data.number } }
                  : inv
              ));
            } catch (_) { /* ignore */ }
          }
          return;
        }
      }
    } catch (e) {
      console.warn('Oblio create-invoice failed, using local PDF', e);
    }

    // Fallback: PDF local (template gobid)
    await handleDownloadLocalInvoice(invoice);
  };

  const handleDownloadLocalInvoice = async (invoice: any) => {
    const invoiceAmount = invoice.total || invoice.amount || 0;
    // SmartBill / local template
    const config = localStorage.getItem('smartbill_config');
    if (config) {
      try {
        const smartbillConfig = JSON.parse(config);
        if (smartbillConfig.username && smartbillConfig.token && smartbillConfig.companyVATNumber) {
          console.log('SmartBill configured but full integration requires API route. Using local PDF.');
        }
      } catch (error) {
        // Config parse error - continue with local PDF
      }
    }

    addActivity('invoice', `Factură descărcată ${invoice.id}`, `${invoiceAmount.toLocaleString('ro-RO')} Lei`, 'success');
    
    // Create a new PDF document
    const doc = new jsPDF();
    
    // Template Oblio: verde profesional, layout curat
    const oblioGreen = [0, 166, 81]; // #00a651 Oblio
    const oblioDark = [4, 120, 87]; // emerald-700
    const textColor = [31, 41, 55]; // Dark gray
    const bgGray = [249, 250, 251]; // Background gray
    
    // Header – verde Oblio
    doc.setFillColor(oblioGreen[0], oblioGreen[1], oblioGreen[2]);
    doc.rect(0, 0, 210, 50, 'F');
    
    // Accent band
    doc.setFillColor(oblioDark[0], oblioDark[1], oblioDark[2]);
    doc.rect(0, 0, 210, 8, 'F');
    
    // Header text
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(28);
    doc.setFont('helvetica', 'bold');
    doc.text(`FACTURA ${invoice.id}`, 105, 25, { align: 'center' });
    
    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    doc.text(`Emisă pe ${invoice.date || 'N/A'} | Scadentă: ${invoice.dueDate || 'N/A'}`, 105, 35, { align: 'center' });
    
    // Reset text color
    doc.setTextColor(textColor[0], textColor[1], textColor[2]);
    
    // Company information section with modern cards
    let yPosition = 70;
    
    // From section - Modern card design
    doc.setFillColor(bgGray[0], bgGray[1], bgGray[2]);
    doc.roundedRect(15, yPosition - 5, 85, 45, 8, 8, 'F');
    doc.setDrawColor(oblioGreen[0], oblioGreen[1], oblioGreen[2]);
    doc.setLineWidth(2);
    doc.roundedRect(15, yPosition - 5, 85, 45, 8, 8, 'S');
    
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(oblioGreen[0], oblioGreen[1], oblioGreen[2]);
    doc.text('DE LA', 20, yPosition);
    
    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(textColor[0], textColor[1], textColor[2]);
    yPosition += 8;
    doc.text('gobid.ro SRL', 20, yPosition);
    yPosition += 6;
    doc.text('CUI: 12345678', 20, yPosition);
    yPosition += 6;
    doc.text('București, România', 20, yPosition);
    
    // To section - Modern card design
    yPosition = 70;
    doc.setFillColor(bgGray[0], bgGray[1], bgGray[2]);
    doc.roundedRect(110, yPosition - 5, 85, 45, 8, 8, 'F');
    doc.setDrawColor(oblioDark[0], oblioDark[1], oblioDark[2]);
    doc.setLineWidth(2);
    doc.roundedRect(110, yPosition - 5, 85, 45, 8, 8, 'S');
    
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(oblioDark[0], oblioDark[1], oblioDark[2]);
    doc.text('CĂTRE', 115, yPosition);
    
    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(textColor[0], textColor[1], textColor[2]);
    yPosition += 8;
    const buyerName = invoice.buyer?.name ?? ([userInfo?.firstName, userInfo?.lastName].filter(Boolean).join(' ').trim() || 'Client');
    const buyerEmail = invoice.buyer?.email ?? userInfo?.email ?? 'N/A';
    doc.text(String(buyerName || 'N/A'), 115, yPosition);
    yPosition += 6;
    doc.text(String(buyerEmail || 'N/A'), 115, yPosition);
    yPosition += 6;
    doc.text(String(invoice.buyer?.address ?? 'N/A'), 115, yPosition);
    
    // Invoice details section
    yPosition = 130;
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(oblioGreen[0], oblioGreen[1], oblioGreen[2]);
    doc.text('DETALII FACTURĂ', 20, yPosition);
    
    // Modern table with better styling
    yPosition += 15;
    
    // Table header – Oblio green
    doc.setFillColor(oblioGreen[0], oblioGreen[1], oblioGreen[2]);
    doc.roundedRect(15, yPosition - 8, 180, 12, 6, 6, 'F');
    
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text('Descriere', 20, yPosition);
    doc.text('Cant.', 120, yPosition);
    doc.text('Preț Unit', 140, yPosition);
    doc.text('Total', 170, yPosition);
    
    // Table rows with alternating colors
    yPosition += 12;
    doc.setTextColor(textColor[0], textColor[1], textColor[2]);
    doc.setFont('helvetica', 'normal');
    
    const items = invoice.items?.length ? invoice.items : [{ name: invoice.description || 'Plată servicii', quantity: 1, price: invoice.total ?? invoice.amount ?? 0 }];
    items.forEach((item: any, index: number) => {
      // Alternating row colors
      if (index % 2 === 0) {
        doc.setFillColor(255, 255, 255);
      } else {
        doc.setFillColor(248, 250, 252);
      }
      doc.rect(15, yPosition - 6, 180, 10, 'F');
      
      const itemName = String(item?.name ?? '');
      const itemQty = Number(item?.quantity ?? 0);
      const itemPrice = Number(item?.price ?? 0);
      doc.setFontSize(10);
      doc.text(itemName || '-', 20, yPosition);
      doc.text(String(itemQty), 120, yPosition);
      doc.text(`${itemPrice.toLocaleString()} Lei`, 140, yPosition);
      doc.text(`${(itemPrice * itemQty).toLocaleString()} Lei`, 170, yPosition);
      yPosition += 10;
    });
    
    // Total row – Oblio green
    yPosition += 5;
    doc.setFillColor(oblioGreen[0], oblioGreen[1], oblioGreen[2]);
    doc.roundedRect(15, yPosition - 8, 180, 12, 6, 6, 'F');
    
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('TOTAL GENERAL:', 20, yPosition);
    const invoiceTotalAmount = invoice.total || invoice.amount || 0;
    doc.text(`${invoiceTotalAmount.toLocaleString('ro-RO')} Lei`, 170, yPosition);
    
    // Status section with modern badge
    yPosition += 25;
    doc.setTextColor(textColor[0], textColor[1], textColor[2]);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    doc.text('Status Factură:', 20, yPosition);
    
    // Modern status badge
    const statusText = String(getStatusText(invoice.status) ?? invoice?.status ?? 'N/A');
    const statusColor = invoice.status === 'paid' ? [34, 197, 94] : 
                       invoice.status === 'pending' ? [234, 179, 8] : 
                       [59, 130, 246];
    
    doc.setFillColor(statusColor[0], statusColor[1], statusColor[2]);
    doc.roundedRect(80, yPosition - 6, 50, 10, 5, 5, 'F');
    
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text(statusText, 105, yPosition, { align: 'center' });
    
    // Modern footer with better styling
    yPosition += 25;
    doc.setFillColor(31, 41, 55);
    doc.rect(0, yPosition, 210, 20, 'F');
    
    doc.setTextColor(156, 163, 175);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text('Factură generată de gobid.ro – template Oblio | © 2025', 105, yPosition + 12, { align: 'center' });
    
    // Save the PDF
    doc.save(`factura-${invoice.id}.pdf`);
    
    setMessage({ type: 'success', text: 'Factura PDF a fost descărcată cu succes!' });
    setTimeout(() => setMessage({ type: '', text: '' }), 3000);
  };

  const handlePrintInvoice = async (invoice: any) => {
    // Add activity
    const invoiceAmount = invoice.total || invoice.amount || 0;
    
    // SmartBill integration would require API route - using local template for now
    const config = localStorage.getItem('smartbill_config');
    if (config) {
      try {
        const smartbillConfig = JSON.parse(config);
        if (smartbillConfig.username && smartbillConfig.token && smartbillConfig.companyVATNumber) {
          // SmartBill is configured but integration requires API route
          // For now, fallback to local template
          console.log('SmartBill configured but full integration requires API route. Using local template.');
        }
      } catch (error) {
        // Config parse error - continue with local template
      }
    }
    
    // Fallback to local template if SmartBill is not configured or fails
    addActivity('invoice', `Factură trimisă la imprimantă ${invoice.id}`, `${invoiceAmount.toLocaleString('ro-RO')} Lei`, 'info');
    
    // Create a new window for printing
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    // Use the same amount calculation for print
    const invoiceAmountForPrint = invoice.total || invoice.amount || 0;
    const printContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Factura ${invoice.id}</title>
          <style>
            body { font-family: 'Segoe UI', Arial, sans-serif; margin: 20px; }
            .header { background: #00a651; color: white; padding: 24px; border-radius: 8px; margin-bottom: 24px; border-top: 4px solid #047857; }
            .section { margin-bottom: 20px; }
            .section h3 { color: #047857; border-bottom: 2px solid #00a651; padding-bottom: 6px; }
            table { width: 100%; border-collapse: collapse; margin: 20px 0; }
            th, td { border: 1px solid #e5e7eb; padding: 12px; text-align: left; }
            th { background: #00a651; color: white; font-weight: 600; }
            .total { font-size: 1.2em; font-weight: bold; background: #d1fae5; color: #047857; }
            .status { display: inline-block; padding: 4px 12px; border-radius: 20px; font-size: 0.9em; }
            .status.paid { background-color: #dcfce7; color: #166534; }
            .status.pending { background-color: #fef3c7; color: #92400e; }
            .status.refunded { background-color: #dbeafe; color: #1e40af; }
            @media print { body { margin: 0; } }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>Factura ${invoice.id}</h1>
            <p>Emisă pe ${invoice.date}</p>
          </div>
          
          <div class="section">
            <h3>De la:</h3>
            <p>gobid.ro SRL<br>CUI: 12345678<br>București, România</p>
            </div>
          
          <div class="section">
            <h3>Către:</h3>
            <p>${invoice.buyer?.name || 'N/A'}<br>${invoice.buyer?.email || 'N/A'}<br>${invoice.buyer?.address || 'N/A'}</p>
          </div>
          
          <div class="section">
            <h3>Detalii Factură:</h3>
            <table>
              <thead>
                <tr>
                  <th>Descriere</th>
                  <th>Cantitate</th>
                  <th>Preț</th>
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>
                ${(invoice.items || []).map((item: any) => `
                  <tr>
                    <td>${item.name}</td>
                    <td>${item.quantity}</td>
                    <td>${item.price.toLocaleString()} Lei</td>
                    <td>${(item.price * item.quantity).toLocaleString()} Lei</td>
                  </tr>
                `).join('')}
              </tbody>
              <tfoot>
                <tr class="total">
                  <td colspan="3">Total:</td>
                  <td>${invoiceAmountForPrint.toLocaleString('ro-RO')} Lei</td>
                </tr>
              </tfoot>
            </table>
        </div>
          
          <div class="section">
            <p><strong>Data:</strong> ${invoice.date || 'N/A'}</p>
            <p><strong>Scadentă:</strong> ${invoice.dueDate || 'N/A'}</p>
            <p><strong>Status:</strong> <span class="status ${invoice.status}">${getStatusText(invoice.status)}</span></p>
          </div>
        </body>
      </html>
    `;

    printWindow.document.write(printContent);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
    printWindow.close();
    
    setMessage({ type: 'success', text: 'Factura a fost trimisă la imprimantă!' });
    setTimeout(() => setMessage({ type: '', text: '' }), 3000);
  };

  return (
    <div className={`min-h-screen transition-all duration-300 relative ${
      isPieseAuto
        ? isDarkMode
          ? "bg-[#1a1d21]"
          : "bg-[#f5f6f8]"
        : isDarkMode
          ? "bg-gradient-to-br from-gray-900 via-gray-800 to-gray-700"
          : "bg-gradient-to-br from-gray-50 via-white to-gray-50"
    } max-md:h-dvh max-md:flex max-md:flex-col max-md:overflow-hidden`}>
      {/* Fundal icon card - foarte șters, sub titlu, ca la Favorite */}
      <div className="pointer-events-none fixed inset-0 flex items-start justify-center overflow-hidden z-40 pt-24 md:pt-32" aria-hidden>
        <svg viewBox="0 0 24 24" fill="#22c55e" className="w-[90vmin] h-[90vmin] flex-shrink-0" style={{ opacity: 0.03 }}>
          <path d="M20 4H4c-1.11 0-1.99.89-1.99 2L2 18c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V6c0-1.11-.89-2-2-2zm0 14H4v-6h16v6zm0-10H4V6h16v2z" />
        </svg>
      </div>
      {/* Page Loader */}
      {/* Page Loading - Removed spinner */}

      {/* Universal Header */}
      <UniversalHeader 
        isDarkMode={isDarkMode}
        onToggleDarkMode={toggleDarkMode}
      />

      {/* Main Content - full viewport pe mobil */}
      <div className="max-md:flex-1 max-md:min-h-0 max-md:flex max-md:flex-col max-md:overflow-hidden">
        <div className="max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8 max-md:flex-1 max-md:min-h-0 max-md:overflow-y-auto max-md:overflow-x-hidden">

        <div className="mb-6">
          <BackButton
            fallbackHref={isPieseAuto ? "/dashboard/piese-auto" : "/dashboard"}
            label="Înapoi"
            className="shadow-md"
          />
        </div>

        {/* Page Header */}
        <div className="mb-6 md:mb-8">
          <div className={`backdrop-blur-lg rounded-2xl p-4 md:p-8 shadow-2xl border ${
            isDarkMode 
              ? 'bg-white/10 border-white/20' 
              : 'bg-white border-gray-200'
          }`}>
            <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-0 gap-4 md:gap-0">
              <div className="flex items-center gap-2 md:gap-4 min-w-0 flex-1 max-md:overflow-hidden">
                <div className="inline-flex items-center justify-center w-14 h-14 md:w-20 md:h-20 rounded-full shadow-2xl flex-shrink-0 bg-gradient-to-r from-green-500 to-green-600">
                  <CreditCardIcon size="l" className="text-white scale-90 md:scale-110" />
                </div>
                <div className="min-w-0 flex-1 max-md:min-w-0">
                  <h2 className={`text-3xl font-bold mb-2 max-md:mb-0 max-md:text-lg max-md:truncate ${
                    isDarkMode 
                      ? 'bg-gradient-to-r from-white to-gray-300 bg-clip-text text-transparent' 
                      : 'text-gray-900'
                  }`}>
                    Centrul de Plăți
                  </h2>
                  <p className={`${isDarkMode ? 'text-gray-300' : 'text-gray-600'} max-md:hidden`}>
                    Gestionează-ți plățile, cardurile și facturile
                  </p>
                </div>
              </div>
              
              {/* Credit Balance - pe mobil compact, se încadrează */}
              <div className={`mt-4 md:mt-0 flex-shrink-0 min-w-0 w-full md:w-auto backdrop-blur-sm rounded-xl p-3 md:p-4 border ${
                isDarkMode 
                  ? 'bg-white/5 border-white/10' 
                  : 'bg-gray-50 border-gray-200'
              }`}>
                <div className="flex flex-col max-md:gap-2 md:flex-row md:items-center md:justify-between">
                  <div className="min-w-0 flex-1">
                    <p className={`text-xs md:text-sm font-medium ${
                      isDarkMode ? 'text-gray-300' : 'text-gray-600'
                    }`}>
                      Sold Credit
                    </p>
                    {isLoadingTokens ? (
                      <div className="animate-pulse">
                        <div className="h-6 md:h-8 w-16 md:w-24 bg-gray-300 dark:bg-gray-600 rounded"></div>
                      </div>
                    ) : (
                      <p className={`text-lg md:text-2xl font-bold truncate ${
                        isDarkMode ? 'text-white' : 'text-gray-900'
                      }`}>
                        {userCredits.toFixed(2)} Lei
                      </p>
                    )}
                  </div>
                  {!isIosNativeApp && (
                    <button
                      onClick={() => setShowCreditModal(true)}
                      className="w-full md:w-auto md:ml-4 px-3 md:px-4 py-2 bg-gradient-to-r from-yellow-500 to-yellow-600 text-white rounded-lg hover:from-yellow-600 hover:to-yellow-700 transition-all duration-300 text-xs md:text-sm font-medium shadow-lg hover:shadow-xl flex-shrink-0"
                    >
                      + Cumpără Credit
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {isIosNativeApp && (
          <div className="mb-6">
            <div className={`backdrop-blur-lg rounded-2xl p-4 md:p-6 shadow-2xl border ${
              isDarkMode ? 'bg-white/10 border-white/20' : 'bg-white border-gray-200'
            }`}>
              <AppleCreditBundles
                isDarkMode={isDarkMode}
                bundles={appleCatalog}
                isLoading={isApplePurchaseLoading}
                loadingProductId={appleLoadingProductId}
                onPurchase={handleAppleBundlePurchase}
              />
            </div>
          </div>
        )}

        {/* Message */}
        {message.text && (
          <div className={`mb-6 p-4 rounded-lg backdrop-blur-lg shadow-xl border ${
            message.type === 'success'
              ? isDarkMode
                ? 'bg-green-500/20 text-green-300 border-green-400/30'
                : 'bg-green-50 text-green-800 border-green-200'
              : isDarkMode
                ? 'bg-red-500/20 text-red-300 border-red-400/30'
                : 'bg-red-50 text-red-800 border-red-200'
          }`}>
            {message.text}
          </div>
        )}

        {/* Tabs - pe mobil grid 2x2, pe desktop rând orizontal */}
        <div className="mb-8">
          <div className={`backdrop-blur-lg rounded-2xl p-4 md:p-6 shadow-2xl border ${
            isDarkMode 
              ? 'bg-white/10 border-white/20' 
              : 'bg-white border-gray-200'
          }`}>
            <nav className="grid grid-cols-2 gap-2 md:flex md:flex-nowrap md:justify-start md:gap-0 md:space-x-8">
              {[
                { id: 'overview', name: 'Prezentare Generală', shortName: 'Prezentare', icon: <CoinsIcon size="m" className={isDarkMode ? "text-yellow-400" : "text-yellow-600"} /> },
                { id: 'transactions', name: 'Tranzacții', shortName: 'Tranzacții', icon: <CreditCardIcon size="m" className={isDarkMode ? "text-green-400" : "text-green-600"} /> },
                { id: 'invoices', name: 'Facturi', shortName: 'Facturi', icon: <StarIcon size="m" className={isDarkMode ? "text-blue-400" : "text-blue-600"} /> },
                { id: 'cards', name: 'Carduri', shortName: 'Carduri', icon: <CreditCardIcon size="m" className={isDarkMode ? "text-blue-400" : "text-blue-600"} /> }
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center justify-center md:justify-start gap-2 md:space-x-2 px-3 py-3 md:px-4 rounded-lg transition-all duration-300 flex-shrink-0 ${
                    activeTab === tab.id
                      ? isDarkMode
                        ? 'bg-white/20 text-white shadow-lg'
                        : 'bg-gray-700 text-white shadow-lg'
                      : isDarkMode
                        ? 'text-gray-300 hover:bg-white/10 hover:text-white'
                        : 'text-gray-700 hover:bg-gray-100 hover:text-gray-900'
                  }`}
                >
                  <div className="w-5 h-5 md:w-4 md:h-4 flex items-center justify-center flex-shrink-0">
                    {tab.icon}
                  </div>
                  <span className="text-xs md:text-sm leading-tight text-center truncate">{tab.shortName}</span>
                </button>
              ))}
            </nav>
          </div>
        </div>

        {/* Tab Content */}
        {activeTab === 'overview' && (
          <div className="space-y-6 md:space-y-8">
            {/* Statistics Cards - pe mobil compact, icon în card verde/roșu */}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2 md:gap-6">
            {/* Balance Card - Sold Curent cu icon card pe verde */}
              <div className={`backdrop-blur-lg rounded-xl md:rounded-2xl p-4 md:p-6 shadow-2xl border transition-all duration-300 min-w-0 ${
                isDarkMode 
                  ? 'bg-white/10 border-white/20 hover:bg-white/15' 
                  : 'bg-white border-gray-200 hover:bg-gray-50'
              }`}>
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0 flex-1">
                    <p className={`text-xs md:text-sm font-medium truncate ${
                      isDarkMode ? 'text-gray-300' : 'text-gray-600'
                    }`}>Sold Curent</p>
                    {isLoadingTokens ? (
                      <div className="animate-pulse">
                        <div className="h-6 md:h-8 w-14 md:w-24 bg-gray-300 dark:bg-gray-600 rounded"></div>
                      </div>
                    ) : (
                      <p className={`text-base md:text-2xl font-bold truncate ${
                        isDarkMode ? 'text-white' : 'text-gray-900'
                      }`}>{userCredits.toFixed(2)} Lei</p>
                    )}
                </div>
                  <div className={`p-2 md:p-3 flex-shrink-0 rounded-lg md:rounded-xl border ${
                    isDarkMode 
                      ? 'bg-green-500/20 border-green-400/30' 
                      : 'bg-green-100 border-green-200'
                  }`}>
                    <CreditCardIcon size="m" className={isDarkMode ? "text-green-400" : "text-green-600"} />
                </div>
              </div>
            </div>

            {/* Total Spent - icon card pe roșu */}
              <div className={`backdrop-blur-lg rounded-xl md:rounded-2xl p-4 md:p-6 shadow-2xl border transition-all duration-300 min-w-0 ${
                isDarkMode 
                  ? 'bg-white/10 border-white/20 hover:bg-white/15' 
                  : 'bg-white border-gray-200 hover:bg-gray-50'
              }`}>
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0 flex-1">
                    <p className={`text-xs md:text-sm font-medium truncate ${
                      isDarkMode ? 'text-gray-300' : 'text-gray-600'
                    }`}>Total Cheltuit</p>
                    <p className={`text-base md:text-2xl font-bold truncate ${
                      isDarkMode ? 'text-white' : 'text-gray-900'
                    }`}>{calculateTotalSpent().toLocaleString('ro-RO')} Lei</p>
                </div>
                  <div className={`p-2 md:p-3 flex-shrink-0 rounded-lg md:rounded-xl border ${
                    isDarkMode 
                      ? 'bg-red-500/20 border-red-400/30' 
                      : 'bg-red-100 border-red-200'
                  }`}>
                    <ArrowDownIcon size="m" className={isDarkMode ? "text-red-400" : "text-red-600"} />
                </div>
              </div>
            </div>

            {/* Active Cards - ascuns pe mobil */}
              <div className={`max-md:hidden backdrop-blur-lg rounded-2xl p-6 shadow-2xl border transition-all duration-300 ${
                isDarkMode 
                  ? 'bg-white/10 border-white/20 hover:bg-white/15' 
                  : 'bg-white border-gray-200 hover:bg-gray-50'
              }`}>
              <div className="flex items-center justify-between">
                <div>
                    <p className={`text-sm font-medium ${
                      isDarkMode ? 'text-gray-300' : 'text-gray-600'
                    }`}>Carduri Active</p>
                    <p className={`text-2xl font-bold ${
                      isDarkMode ? 'text-white' : 'text-gray-900'
                    }`}>{savedCards.length}</p>
                </div>
                  <div className={`p-3 backdrop-blur-sm rounded-xl border ${
                    isDarkMode 
                      ? 'bg-blue-500/20 border-blue-400/30' 
                      : 'bg-blue-100 border-blue-200'
                  }`}>
                    <CreditCardIcon size="m" className={isDarkMode ? "text-blue-400" : "text-blue-600"} />
                </div>
              </div>
            </div>
          </div>

            {/* Recent Activity */}
            <div className={`backdrop-blur-lg rounded-2xl p-6 shadow-2xl border ${
              isDarkMode 
                ? 'bg-white/10 border-white/20' 
                : 'bg-white border-gray-200'
            }`}>
              <h3 className={`text-xl font-semibold mb-6 ${
                isDarkMode ? 'text-white' : 'text-gray-900'
              }`}>
                Activitate Recentă
              </h3>
              <div className="space-y-3">
                {recentActivity.length > 0 ? (
                  recentActivity.map((activity) => (
                    <div key={activity.id} className={`flex items-center justify-between p-4 backdrop-blur-sm border rounded-lg transition-all duration-300 ${
                      isDarkMode 
                        ? 'bg-white/5 border-white/10 hover:bg-white/10' 
                        : 'bg-gray-50 border-gray-200 hover:bg-gray-100'
                    }`}>
                      <div className="flex items-center space-x-3">
                        <div className={`w-2 h-2 rounded-full ${
                          activity.status === 'success' ? 'bg-green-500' : 
                          activity.status === 'pending' ? 'bg-yellow-500' : 'bg-blue-500'
                        }`}></div>
                        <div>
                          <p className={`text-sm font-medium ${
                            isDarkMode ? 'text-white' : 'text-gray-900'
                          }`}>
                            {activity.description}
                          </p>
                          <p className={`text-xs ${
                            isDarkMode ? 'text-gray-400' : 'text-gray-500'
                          }`}>
                            {activity.time}
                          </p>
                        </div>
                      </div>
                      {activity.amount && (
                        <span className={`text-sm font-semibold ${
                          isDarkMode ? 'text-white' : 'text-gray-900'
                        }`}>
                          {activity.amount}
                        </span>
                      )}
                    </div>
                  ))
                ) : (
                  <div className={`text-center py-8 ${
                    isDarkMode ? 'text-gray-400' : 'text-gray-500'
                  }`}>
                    <p className="text-sm">Nu există activitate recentă</p>
                    <p className="text-xs mt-1">Activitățile tale vor apărea aici</p>
                  </div>
                )}
              </div>
            </div>

          </div>
        )}

        {activeTab === 'transactions' && (
          <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:justify-between md:items-center space-y-3 md:space-y-0">
              <h3 className={`text-xl font-semibold ${
                isDarkMode ? 'text-white' : 'text-gray-900'
              }`}>
                Istoric Tranzacții
              </h3>
              <button 
                onClick={() => setShowPaymentModal(true)}
                className="px-4 py-2 bg-gradient-to-r from-green-500 to-green-600 text-white rounded-lg hover:from-green-600 hover:to-green-700 transition-all duration-300 text-sm font-medium shadow-lg hover:shadow-xl transform hover:scale-105"
              >
                + Adaugă Fonduri
              </button>
            </div>

            <div className={`backdrop-blur-lg rounded-2xl shadow-2xl border overflow-hidden ${
              isDarkMode 
                ? 'bg-white/10 border-white/20' 
                : 'bg-white border-gray-200'
            }`}>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className={`border-b ${
                      isDarkMode ? 'border-white/10' : 'border-gray-200'
                    }`}>
                      <th className={`text-left py-4 px-6 font-medium text-sm ${
                        isDarkMode ? 'text-gray-300' : 'text-gray-600'
                      }`}>Tranzacție</th>
                      <th className={`text-left py-4 px-6 font-medium text-sm ${
                        isDarkMode ? 'text-gray-300' : 'text-gray-600'
                      }`}>Sumă</th>
                      <th className={`text-left py-4 px-6 font-medium text-sm ${
                        isDarkMode ? 'text-gray-300' : 'text-gray-600'
                      }`}>Status</th>
                      <th className={`text-left py-4 px-6 font-medium text-sm ${
                        isDarkMode ? 'text-gray-300' : 'text-gray-600'
                      }`}>Data</th>
                      <th className={`text-left py-4 px-6 font-medium text-sm ${
                        isDarkMode ? 'text-gray-300' : 'text-gray-600'
                      }`}>Acțiuni</th>
                    </tr>
                  </thead>
                  <tbody>
                    {transactions.length === 0 ? (
                      <tr>
                        <td
                          colSpan={5}
                          className={`py-12 px-6 text-center text-sm ${isDarkMode ? "text-gray-400" : "text-gray-500"}`}
                        >
                          Nu există tranzacții încă. Istoricul (reușite, eșuate, în așteptare) vine din plățile tale
                          (credite, Netopia) și apare aici după ce datele se încarcă din cont.
                        </td>
                      </tr>
                    ) : (
                    transactions.map((transaction) => (
                      <tr key={transaction.id} className={`border-b transition-all duration-300 ${
                        isDarkMode 
                          ? 'border-white/10 hover:bg-white/5' 
                          : 'border-gray-200 hover:bg-gray-50'
                      }`}>
                        <td className="py-4 px-6">
                          <div className="flex items-center space-x-3">
                            <span className="text-lg">{getTypeIcon(transaction.type)}</span>
                            <div className="min-w-0 flex-1">
                              <p className={`font-medium text-sm truncate ${
                                isDarkMode ? 'text-white' : 'text-gray-900'
                              }`} title={transaction.description}>
                                {transaction.type === 'credit_purchase' 
                                  ? `Cumpărare credite (${(transaction as any).credits || 0} credite)`
                                  : (transaction.description || '').length > 25 ? (transaction.description || '').substring(0, 25) + '...' : (transaction.description || '—')
                                }
                              </p>
                              <p className={`text-xs ${
                                isDarkMode ? 'text-gray-400' : 'text-gray-500'
                              }`}>
                                {transaction.type === 'credit_purchase' 
                                  ? `${transaction.paymentMethod} • ${((transaction as any).bonusPercentage || 0) > 0 ? `+${(transaction as any).bonusPercentage}% bonus` : 'fără bonus'}`
                                  : (String(transaction.paymentMethod || '').length > 12 ? String(transaction.paymentMethod).substring(0, 12) + '...' : (transaction.paymentMethod || '—'))
                                }
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="py-4 px-6">
                          <span className={`font-semibold text-sm ${
                            transaction.amount > 0 
                              ? isDarkMode ? 'text-green-400' : 'text-green-600' 
                              : isDarkMode ? 'text-red-400' : 'text-red-600'
                          }`}>
                            {transaction.type === 'credit_purchase' 
                              ? `${transaction.amount.toLocaleString()} Lei → ${(transaction as any).credits || 0} credite`
                              : `${transaction.amount > 0 ? '+' : ''}${transaction.amount.toLocaleString()} ${transaction.currency}`
                            }
                          </span>
                        </td>
                        <td className="py-4 px-6">
                          <span className={`px-3 py-1 rounded-full text-xs font-medium border whitespace-nowrap ${getStatusColor(transaction.status)}`}>
                            {getStatusText(transaction.status)}
                          </span>
                        </td>
                        <td className={`py-4 px-6 text-sm ${
                          isDarkMode ? 'text-gray-400' : 'text-gray-500'
                        }`}>
                          {(transaction.date || '').split('-').reverse().join('-')}
                        </td>
                        <td className="py-4 px-6">
                          {transaction.type === 'credit_purchase' ? (
                            <>
                              {transaction.status === 'pending' ? (
                                <button 
                                  onClick={() => approveCreditTransaction(transaction.id)}
                                  className="text-green-400 hover:text-green-300 text-xs font-medium transition-colors"
                                >
                                  Aprobă
                                </button>
                              ) : (
                                <span className="text-gray-500 text-xs">
                                  Aprobat
                                </span>
                              )}
                              {transaction.status !== 'pending' && oblioStatus.enabled && (
                                <button
                                  type="button"
                                  onClick={async () => {
                                    const { payment, clientInfo } = buildPayloadForTransaction(
                                      { amount: transaction.amount, date: transaction.date, description: transaction.description, status: transaction.status, type: 'credit_purchase', credits: (transaction as any).credits },
                                      { firstName: userInfo.firstName, lastName: userInfo.lastName, email: userInfo.email }
                                    );
                                    const result = await requestOblioInvoice(payment, clientInfo, { openPdf: true });
                                    if (!result.success) setMessage({ type: 'error', text: result.message || 'Eroare factură' });
                                  }}
                                  className="ml-2 text-blue-400 hover:text-blue-300 text-xs font-medium transition-colors"
                                >
                                  Factură
                                </button>
                              )}
                            </>
                          ) : (
                          <button 
                            onClick={() => {
                              const invoice = invoices.find(inv => inv.id === transaction.invoiceId);
                              if (invoice) {
                                setSelectedInvoice(invoice);
                                setShowInvoiceModal(true);
                              }
                            }}
                              className="text-blue-400 hover:text-blue-300 text-xs font-medium transition-colors"
                          >
                              Vezi
                          </button>
                          )}
                        </td>
                      </tr>
                    ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'invoices' && (
          <div className="space-y-6">
            <h3 className={`text-xl font-semibold ${
              isDarkMode ? 'text-white' : 'text-gray-900'
            }`}>
              Facturi
            </h3>
            <p className={`text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
              Facturile emise după confirmarea plății apar aici. Poți descărca PDF-ul direct din card.
            </p>

            {oblioInvoicesList.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {oblioInvoicesList.map((inv) => {
                  const displayNumber = [inv.series, inv.invoice_number].filter(Boolean).join('-') || inv.id.slice(0, 8);
                  const dateStr = inv.created_at ? new Date(inv.created_at).toLocaleDateString('ro-RO', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—';
                  return (
                    <div key={inv.id} className={`backdrop-blur-lg rounded-2xl p-6 shadow-2xl border-l-4 border-[#00a651] transition-all duration-300 ${
                      isDarkMode ? 'bg-white/10 border-white/20 hover:bg-white/15' : 'bg-white border-gray-200 hover:bg-gray-50'
                    }`}>
                      <div className="flex items-center justify-between mb-4">
                        <h4 className={`text-lg font-semibold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                          Factura {displayNumber}
                        </h4>
                        <span className="px-3 py-1 rounded-full text-xs font-medium border bg-emerald-50 text-emerald-800 border-emerald-200">
                          Emisă
                        </span>
                      </div>
                      <div className="space-y-2 mb-4">
                        <p className={`text-2xl font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                          {Number(inv.amount).toLocaleString('ro-RO')} {inv.currency || 'RON'}
                        </p>
                        <p className={`text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                          Data: {dateStr}
                        </p>
                      </div>
                      <div className="flex flex-col sm:flex-row gap-2">
                        <a
                          href={`/api/user/invoices/${inv.id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex-1 bg-[#00a651] text-white py-2 px-3 rounded-lg hover:bg-[#047857] transition-all duration-300 text-sm flex items-center justify-center shadow-lg hover:shadow-xl"
                        >
                          <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                          </svg>
                          Descarcă PDF
                        </a>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className={`rounded-2xl p-8 text-center ${isDarkMode ? 'bg-white/5 border border-white/10' : 'bg-gray-50 border border-gray-200'}`}>
                <p className={`text-base ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>
                  Nu ai facturi încă.
                </p>
                <p className={`mt-2 text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                  După ce o plată este confirmată, factura va apărea aici și o poți descărca în PDF.
                </p>
              </div>
            )}
          </div>
        )}

        {activeTab === 'cards' && (
          <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:justify-between md:items-center space-y-3 md:space-y-0">
              <h3 className={`text-xl font-semibold ${
                isDarkMode ? 'text-white' : 'text-gray-900'
              }`}>
                Carduri Salvate
              </h3>
              <button 
                onClick={() => setShowPaymentModal(true)}
                className="px-4 py-2 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-lg hover:from-blue-600 hover:to-blue-700 transition-all duration-300 text-sm font-medium shadow-lg hover:shadow-xl transform hover:scale-105"
              >
                + Adaugă Card
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {savedCards.map((card) => (
                <div key={card.id} className={`backdrop-blur-lg rounded-xl p-4 shadow-xl border transition-all duration-300 ${
                  isDarkMode 
                    ? 'bg-white/10 border-white/20 hover:bg-white/15' 
                    : 'bg-white border-gray-200 hover:bg-gray-50'
                }`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <div className="text-lg">
                        <CreditCardIcon size="s" className={isDarkMode ? "text-gray-400" : "text-gray-500"} />
                      </div>
                      <div>
                        <p className={`font-semibold text-sm ${
                          isDarkMode ? 'text-white' : 'text-gray-900'
                        }`}>
                          {card.brand} **** {card.last4}
                        </p>
                        <p className={`text-xs ${
                          isDarkMode ? 'text-gray-400' : 'text-gray-500'
                        }`}>
                          Expiră: {card.expiryMonth}/{card.expiryYear}
                        </p>
                      </div>
                    </div>
                    
                    <div className="flex items-center space-x-2">
                      {card.isDefault && (
                        <span className={`px-2 py-1 rounded-full text-xs font-medium border ${
                          isDarkMode 
                            ? 'bg-green-500/20 text-green-300 border-green-400/30' 
                            : 'bg-green-100 text-green-800 border-green-200'
                        }`}>
                          Implicit
                        </span>
                      )}
                      <div className="flex space-x-1">
                        {!card.isDefault && (
                          <button 
                            onClick={() => handleSetDefaultCard(card.id)}
                            className={`px-2 py-1 backdrop-blur-sm border transition-all duration-300 text-xs font-medium rounded-md shadow-lg hover:shadow-xl transform hover:scale-105 ${
                              isDarkMode 
                                ? 'bg-white/10 border-white/20 text-white hover:bg-white/20 hover:border-white/30' 
                                : 'bg-gray-100 border-gray-300 text-gray-700 hover:bg-gray-200 hover:border-gray-400'
                            }`}
                          >
                            Implicit
                          </button>
                        )}
                        <button 
                          onClick={() => handleDeleteCard(card.id)}
                          className="px-2 py-1 bg-gradient-to-r from-red-500 to-red-600 text-white rounded-md hover:from-red-600 hover:to-red-700 transition-all duration-300 text-xs font-medium shadow-lg hover:shadow-xl transform hover:scale-105"
                        >
                          Șterge
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Payment Modal */}
      {showPaymentModal && (
        <div className="fixed inset-0 backdrop-blur-sm flex items-center justify-center z-50 p-2 md:p-4">
          <div className={`backdrop-blur-lg rounded-2xl p-8 shadow-2xl border max-w-md w-full max-h-[95vh] overflow-y-auto ${
            isDarkMode 
              ? 'bg-white/10 border-white/20' 
              : 'bg-white border-gray-200'
          }`}>
            <div className="flex items-center justify-between mb-6">
              <h3 className={`text-xl font-semibold ${
                isDarkMode ? 'text-white' : 'text-gray-900'
              }`}>
                Adaugă Fonduri
              </h3>
              <button
                onClick={() => setShowPaymentModal(false)}
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
            
            <form onSubmit={handleAddCard} className="space-y-4">
              <div>
                <label className={`block text-sm font-medium mb-2 ${
                  isDarkMode ? 'text-gray-300' : 'text-gray-700'
                }`}>
                  Sumă (Lei)
                </label>
                <input
                  type="number"
                  className={`w-full px-4 py-3 rounded-lg border transition-all duration-300 focus:ring-2 focus:ring-yellow-500 focus:border-transparent text-base ${
                    isDarkMode 
                      ? 'bg-white/10 backdrop-blur-sm border-white/20 text-white placeholder-gray-400 focus:bg-white/20' 
                      : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500 focus:border-yellow-500'
                  }`}
                  placeholder="1000"
                  required
                />
              </div>

              <div>
                <label className={`block text-sm font-medium mb-2 ${
                  isDarkMode ? 'text-gray-300' : 'text-gray-700'
                }`}>
                  Numărul Cardului
                </label>
                <div className="relative">
                <input
                  type="text"
                  value={newCard.cardNumber}
                    onChange={(e) => {
                      const formatted = formatCardNumber(e.target.value.replace(/\D/g, ''));
                      const brand = detectCardBrand(e.target.value.replace(/\D/g, ''));
                      setNewCard(prev => ({ ...prev, cardNumber: formatted }));
                      setCardBrand(brand);
                    }}
                    className={`w-full px-4 py-3 pr-12 rounded-lg border transition-all duration-300 focus:ring-2 focus:ring-yellow-500 focus:border-transparent text-base ${
                      isDarkMode 
                        ? 'bg-white/10 backdrop-blur-sm border-white/20 text-white placeholder-gray-400 focus:bg-white/20' 
                        : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500 focus:border-yellow-500'
                    }`}
                  placeholder="1234 5678 9012 3456"
                    maxLength={19}
                  required
                />
                  {cardBrand && (
                    <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                      {getCardBrandIcon(cardBrand)}
                    </div>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={`block text-sm font-medium mb-2 ${
                    isDarkMode ? 'text-gray-300' : 'text-gray-700'
                  }`}>
                    Data Expirării
                  </label>
                  <input
                    type="text"
                    value={newCard.expiryDate}
                    onChange={(e) => {
                      let value = e.target.value.replace(/\D/g, '');
                      if (value.length >= 2) {
                        value = value.slice(0, 2) + '/' + value.slice(2, 4);
                      }
                      setNewCard(prev => ({ ...prev, expiryDate: value }));
                    }}
                    className={`w-full px-4 py-3 rounded-lg border transition-all duration-300 focus:ring-2 focus:ring-yellow-500 focus:border-transparent text-base ${
                      isDarkMode 
                        ? 'bg-white/10 backdrop-blur-sm border-white/20 text-white placeholder-gray-400 focus:bg-white/20' 
                        : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500 focus:border-yellow-500'
                    }`}
                    placeholder="MM/YY"
                    maxLength={5}
                    required
                  />
                </div>
                <div>
                  <label className={`block text-sm font-medium mb-2 ${
                    isDarkMode ? 'text-gray-300' : 'text-gray-700'
                  }`}>
                    CVV
                  </label>
                  <input
                    type="text"
                    value={newCard.cvv}
                    onChange={(e) => setNewCard(prev => ({ ...prev, cvv: e.target.value.replace(/\D/g, '').slice(0, 3) }))}
                    className={`w-full px-4 py-3 rounded-lg border transition-all duration-300 focus:ring-2 focus:ring-yellow-500 focus:border-transparent text-base ${
                      isDarkMode 
                        ? 'bg-white/10 backdrop-blur-sm border-white/20 text-white placeholder-gray-400 focus:bg-white/20' 
                        : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500 focus:border-yellow-500'
                    }`}
                    placeholder="123"
                    maxLength={3}
                    required
                  />
                </div>
              </div>

              <div>
                <label className={`block text-sm font-medium mb-2 ${
                  isDarkMode ? 'text-gray-300' : 'text-gray-700'
                }`}>
                  Numele de pe Card
                </label>
                <input
                  type="text"
                  value={newCard.cardholderName}
                  onChange={(e) => setNewCard(prev => ({ ...prev, cardholderName: e.target.value }))}
                  className={`w-full px-4 py-3 rounded-lg border transition-all duration-300 focus:ring-2 focus:ring-yellow-500 focus:border-transparent text-base ${
                    isDarkMode 
                      ? 'bg-white/10 backdrop-blur-sm border-white/20 text-white placeholder-gray-400 focus:bg-white/20' 
                      : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500 focus:border-yellow-500'
                  }`}
                  placeholder="Ion Popescu"
                  required
                />
              </div>

              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="saveCard"
                  checked={newCard.saveCard}
                  onChange={(e) => setNewCard(prev => ({ ...prev, saveCard: e.target.checked }))}
                  className="h-4 w-4 text-yellow-500 focus:ring-yellow-500 border-gray-300 rounded"
                />
                <label htmlFor="saveCard" className={`ml-2 block text-sm ${
                  isDarkMode ? 'text-gray-300' : 'text-gray-700'
                }`}>
                  Salvează cardul pentru plăți viitoare
                </label>
              </div>

              <div className="flex flex-col md:flex-row space-y-2 md:space-y-0 md:space-x-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowPaymentModal(false)}
                  className={`w-full md:flex-1 py-3 px-4 rounded-lg font-medium transition-all duration-300 text-base shadow-lg hover:shadow-xl transform hover:scale-105 ${
                    isDarkMode 
                      ? 'bg-white/10 backdrop-blur-sm border border-white/20 text-white hover:bg-white/20 hover:border-white/30' 
                      : 'bg-gray-100 border border-gray-300 text-gray-700 hover:bg-gray-200 hover:border-gray-400'
                  }`}
                >
                  Anulează
                </button>
                <button
                  type="submit"
                  className="w-full md:flex-1 bg-gradient-to-r from-yellow-500 to-yellow-600 text-white py-3 px-4 rounded-lg font-medium hover:from-yellow-600 hover:to-yellow-700 transition-all duration-300 text-base shadow-lg hover:shadow-xl transform hover:scale-105"
                >
                  Adaugă Fonduri
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Invoice Modal */}
      {showInvoiceModal && selectedInvoice && (
        <div className="fixed inset-0 backdrop-blur-sm flex items-center justify-center z-50 p-2 md:p-4">
          <div className={`rounded-xl md:rounded-2xl shadow-2xl max-w-4xl w-full transition-all overflow-hidden max-h-[95vh] overflow-y-auto ${isDarkMode ? 'bg-gray-900' : 'bg-white'}`}>
            {/* Header – template Oblio */}
            <div className={`relative p-4 md:p-8 ${isDarkMode ? 'bg-gradient-to-r from-emerald-700 to-emerald-800' : 'bg-[#00a651]'}`}>
              <div className="flex justify-between items-center">
                <div>
                  <h3 className="text-lg md:text-2xl font-bold text-white mb-1 md:mb-2">
                    Factura {selectedInvoice.id}
                  </h3>
                  <p className="text-emerald-100 text-xs md:text-sm">
                    Emisă pe {selectedInvoice.date}
                  </p>
                </div>
              <button 
                onClick={() => setShowInvoiceModal(false)}
                  className="text-white hover:text-gray-200 transition-colors p-1 md:p-2 rounded-full hover:bg-white hover:bg-opacity-20"
              >
                  <svg className="w-5 h-5 md:w-6 md:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
              </button>
              </div>
            </div>

            <div className="p-4 md:p-8 space-y-4 md:space-y-8">
              {/* Invoice Header */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-8">
                <div className={`p-4 md:p-6 rounded-xl border-l-4 border-[#00a651] ${isDarkMode ? 'bg-gray-800' : 'bg-gray-50'}`}>
                  <div className="flex items-center mb-3 md:mb-4">
                    <div className="w-8 h-8 md:w-10 md:h-10 rounded-full flex items-center justify-center mr-2 md:mr-3 bg-[#00a651]">
                      <svg className="w-4 h-4 md:w-5 md:h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                      </svg>
                    </div>
                    <h4 className={`text-base md:text-lg font-semibold transition-colors ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                      De la
                    </h4>
                  </div>
                  <div className={`text-xs md:text-sm transition-colors ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>
                    <p className="font-medium text-sm md:text-base mb-1">gobid.ro SRL</p>
                    <p>CUI: 12345678</p>
                    <p>București, România</p>
                  </div>
                </div>
                <div className={`p-4 md:p-6 rounded-xl border-l-4 border-emerald-600 ${isDarkMode ? 'bg-gray-800' : 'bg-gray-50'}`}>
                  <div className="flex items-center mb-3 md:mb-4">
                    <div className="w-8 h-8 md:w-10 md:h-10 rounded-full flex items-center justify-center mr-2 md:mr-3 bg-emerald-600">
                      <svg className="w-4 h-4 md:w-5 md:h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                      </svg>
                    </div>
                    <h4 className={`text-base md:text-lg font-semibold transition-colors ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                      Către
                  </h4>
                  </div>
                  <div className={`text-xs md:text-sm transition-colors ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>
                    <p className="font-medium text-sm md:text-base mb-1">{selectedInvoice?.buyer?.name ?? ([userInfo?.firstName, userInfo?.lastName].filter(Boolean).join(' ') || 'N/A')}</p>
                    <p>{selectedInvoice?.buyer?.email ?? userInfo?.email ?? 'N/A'}</p>
                    <p>{selectedInvoice?.buyer?.address ?? 'N/A'}</p>
                  </div>
                </div>
              </div>

              {/* Invoice Items */}
              <div>
                <div className="flex items-center mb-4 md:mb-6">
                  <div className="w-8 h-8 md:w-10 md:h-10 rounded-full flex items-center justify-center mr-2 md:mr-3 bg-[#00a651]">
                    <svg className="w-4 h-4 md:w-5 md:h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  </div>
                  <h4 className={`text-lg md:text-xl font-semibold transition-colors ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                    Detalii Factură
                  </h4>
                </div>
                <div className={`rounded-2xl overflow-hidden shadow-lg border ${isDarkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
                  <table className="w-full">
                    <thead className={isDarkMode ? 'bg-emerald-800' : 'bg-[#00a651]'}>
                      <tr>
                        <th className="text-left py-2 md:py-4 px-2 md:px-6 font-semibold text-xs md:text-sm text-white">
                          Descriere
                        </th>
                        <th className="text-center py-2 md:py-4 px-2 md:px-6 font-semibold text-xs md:text-sm text-white">
                          Cantitate
                        </th>
                        <th className="text-right py-2 md:py-4 px-2 md:px-6 font-semibold text-xs md:text-sm text-white">
                          Preț
                        </th>
                        <th className="text-right py-2 md:py-4 px-2 md:px-6 font-semibold text-xs md:text-sm text-white">
                          Total
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {(selectedInvoice.items && selectedInvoice.items.length > 0
                        ? selectedInvoice.items
                        : [{ name: selectedInvoice.description || 'Plată', quantity: 1, price: selectedInvoice.amount ?? selectedInvoice.total ?? 0 }]
                      ).map((item: any, index: number) => (
                        <tr key={index} className={`border-t transition-colors ${isDarkMode ? 'border-gray-700' : 'border-gray-200'}`}>
                          <td className={`py-2 md:py-4 px-2 md:px-6 transition-colors ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                            <div className="font-medium text-xs md:text-sm">{item.name || item.description || '—'}</div>
                          </td>
                          <td className={`text-center py-2 md:py-4 px-2 md:px-6 transition-colors ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>
                            <span className={`px-2 md:px-3 py-1 rounded-full text-xs md:text-sm font-medium ${isDarkMode ? 'bg-gray-700 text-gray-200' : 'bg-gray-100 text-gray-700'}`}>
                            {item.quantity ?? 1}
                            </span>
                          </td>
                          <td className={`text-right py-2 md:py-4 px-2 md:px-6 transition-colors text-xs md:text-sm ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>
                            {(item.price ?? item.amount ?? 0).toLocaleString('ro-RO')} Lei
                          </td>
                          <td className={`text-right py-2 md:py-4 px-2 md:px-6 font-semibold text-xs md:text-sm transition-colors ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                            {((item.price ?? item.amount ?? 0) * (item.quantity ?? 1)).toLocaleString('ro-RO')} Lei
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className={isDarkMode ? 'border-t-2 border-emerald-700 bg-emerald-900/30' : 'border-t-2 border-[#00a651] bg-emerald-50'}>
                      <tr>
                        <td colSpan={3} className={`py-3 md:py-6 px-2 md:px-6 font-bold text-lg md:text-xl transition-colors ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                          Total:
                        </td>
                        <td className={`text-right py-3 md:py-6 px-2 md:px-6 font-bold text-xl md:text-2xl transition-colors ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                          {(selectedInvoice.amount ?? selectedInvoice.total ?? 0).toLocaleString('ro-RO')} Lei
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>

              {/* Invoice Status */}
              <div className={`p-4 md:p-6 rounded-xl md:rounded-2xl ${isDarkMode ? 'bg-gray-800' : 'bg-gray-50'}`}>
                <div className="flex flex-col space-y-4">
                  <div className="space-y-2">
                    <div className="flex items-center">
                      <svg className={`w-4 h-4 md:w-5 md:h-5 mr-2 ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                      <p className={`text-xs md:text-sm transition-colors ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                    Data: {selectedInvoice.date}
                  </p>
                    </div>
                    <div className="flex items-center">
                      <svg className={`w-4 h-4 md:w-5 md:h-5 mr-2 ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <p className={`text-xs md:text-sm transition-colors ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                    Scadentă: {selectedInvoice.dueDate}
                  </p>
                </div>
                  </div>
                  <div className="flex flex-col space-y-3">
                    <div className="flex items-center justify-center">
                      <span className={`px-3 md:px-4 py-2 rounded-full text-xs md:text-sm font-medium border ${getStatusColor(selectedInvoice.status)}`}>
                  {getStatusText(selectedInvoice.status)}
                </span>
              </div>
                    <div className="flex flex-col md:flex-row space-y-2 md:space-y-0 md:space-x-3">
                      <button 
                        onClick={() => handleDownloadInvoice(selectedInvoice)}
                        className="flex-1 bg-[#00a651] text-white py-2 px-4 rounded-lg hover:bg-[#047857] transition-colors font-medium text-sm md:text-base flex items-center justify-center"
                      >
                        <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        PDF
                      </button>
                      <button 
                        onClick={() => handlePrintInvoice(selectedInvoice)}
                        className="flex-1 bg-blue-600 text-white py-2 px-4 rounded-lg hover:bg-blue-700 transition-colors font-medium text-sm md:text-base flex items-center justify-center"
                      >
                        <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                        </svg>
                        Printează
                      </button>
                <button 
                  onClick={() => setShowInvoiceModal(false)}
                        className="flex-1 bg-gray-600 text-white py-2 px-4 rounded-lg hover:bg-gray-700 transition-colors font-medium text-sm md:text-base"
                >
                  Închide
                </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Credit Purchase Modal */}
      {!isIosNativeApp && showCreditModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-2 md:p-4 bg-black/50 backdrop-blur-md">
          <div className={`relative max-w-md w-full max-h-[95vh] overflow-y-auto rounded-2xl md:rounded-3xl shadow-2xl transition-all border-2 border-black
            ${isDarkMode 
              ? 'bg-gray-900 backdrop-blur-xl' 
              : 'bg-white'
            }`}
          >
            <div className="absolute inset-x-0 top-0 h-px rounded-t-2xl bg-black/20" />
            <div className="p-5 md:p-8">
              <div className="flex items-center justify-between mb-5 md:mb-6">
                <h3 className={`text-lg md:text-xl font-semibold tracking-tight transition-colors ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                  Cumpără Credit
                </h3>
                <button
                  onClick={() => setShowCreditModal(false)}
                  className={`p-2 rounded-xl transition-all hover:scale-105 ${
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
            
              <form onSubmit={handleCreditPurchase} className="space-y-5">
                {isIosNativeApp ? (
                  <AppleCreditBundles
                    isDarkMode={isDarkMode}
                    bundles={appleCatalog}
                    isLoading={isApplePurchaseLoading}
                    loadingProductId={appleLoadingProductId}
                    onPurchase={handleAppleBundlePurchase}
                  />
                ) : (
                  <div>
                    <label className={`block text-sm font-medium mb-3 transition-colors ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                      Selectează suma pentru credit
                    </label>
                    <div className="grid grid-cols-2 gap-3">
                      {[50, 100].map((amount) => {
                        const bonusPercentage = getBonusPercentage(amount);
                        const totalCredits = calculateCreditsWithBonus(amount);
                        return (
                          <button
                            key={amount}
                            type="button"
                            onClick={() => setCreditAmount(amount)}
                            className={`p-4 rounded-xl border-2 transition-all text-left ${
                              creditAmount === amount
                                ? 'border-2 border-green-600 dark:border-green-500 shadow-lg bg-white'
                                : isDarkMode 
                                  ? 'border-2 border-gray-600 bg-gray-800 hover:border-gray-500' 
                                  : 'border-2 border-gray-300 bg-white hover:border-black/50'
                            }`}
                          >
                            <div className={`font-semibold text-lg transition-colors ${creditAmount === amount ? 'text-gray-900' : isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                              {amount} Lei
                            </div>
                            <div className={`text-sm transition-colors ${creditAmount === amount ? 'text-gray-600' : isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>
                              {`= ${totalCredits} credite`}
                            </div>
                            {bonusPercentage > 0 && (
                              <div className="text-xs text-emerald-600 font-medium mt-1">
                                +{bonusPercentage}% bonus!
                              </div>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {!isIosNativeApp && (
                  <div>
                    <label className={`block text-sm font-medium mb-2 transition-colors ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                      Sau introdu o sumă personalizată
                    </label>
                    <input
                      type="number"
                      value={creditAmount}
                      onChange={(e) => setCreditAmount(parseInt(e.target.value) || 0)}
                      min="1"
                      className={`w-full px-3 md:px-4 py-2.5 md:py-3 rounded-xl border-2 transition-all focus:ring-2 focus:ring-black/30 focus:border-black text-sm md:text-base ${
                        isDarkMode 
                          ? 'bg-gray-800 border-gray-600 text-white placeholder-gray-500' 
                          : 'bg-white border-gray-300 text-gray-900 placeholder-gray-400'
                      }`}
                      placeholder="Introdu suma în Lei"
                    />
                    {creditAmount > 0 && (
                      <div className={`mt-2 text-sm transition-colors ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>
                        Vei primi: <span className="font-semibold text-black dark:text-white">
                          {calculateCreditsWithBonus(creditAmount)} credite
                        </span>
                        {getBonusPercentage(creditAmount) > 0 && (
                          <span className="text-emerald-500 ml-2">
                            (+{getBonusPercentage(creditAmount)}% bonus)
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {!isIosNativeApp && (
                  <div>
                  <label className={`block text-sm font-medium mb-2 transition-colors ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                    Metoda de plată
                  </label>
                  <div className="space-y-2">
                    <button
                      type="button"
                      onClick={() => setPaymentMethod('netopia')}
                      className={`w-full flex items-center gap-3 px-3 md:px-4 py-2.5 md:py-3 rounded-xl border-2 text-left transition-all ${
                        paymentMethod === 'netopia'
                          ? 'border-2 border-green-600 dark:border-green-500 shadow-lg bg-white'
                          : isDarkMode
                            ? 'border-2 border-gray-600 bg-gray-800 hover:border-gray-500 text-white'
                            : 'border-2 border-gray-300 bg-white hover:border-black/50 text-gray-900'
                      }`}
                    >
                      <span className="flex-shrink-0 w-20 h-7 relative flex items-center justify-center rounded-md bg-white px-2">
                        <Image src="/netopia-logo.svg" alt="Netopia" fill className="object-contain object-center p-0.5" />
                      </span>
                      <span className={`font-medium text-sm md:text-base ${paymentMethod === 'netopia' ? 'text-gray-900' : isDarkMode ? 'text-white' : 'text-gray-900'}`}>Card bancar (Netopia)</span>
                      {paymentMethod === 'netopia' && (
                        <span className="ml-auto text-gray-900">✓</span>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => setPaymentMethod('bank')}
                      className={`w-full flex items-center gap-3 px-3 md:px-4 py-2.5 md:py-3 rounded-xl border-2 text-left transition-all ${
                        paymentMethod === 'bank'
                          ? 'border-2 border-green-600 dark:border-green-500 shadow-lg bg-white'
                          : isDarkMode
                            ? 'border-2 border-gray-600 bg-gray-800 hover:border-gray-500 text-white'
                            : 'border-2 border-gray-300 bg-white hover:border-black/50 text-gray-900'
                      }`}
                    >
                      <BuildingLibraryIcon className={`w-8 h-8 flex-shrink-0 ${paymentMethod === 'bank' ? 'text-gray-600' : 'text-gray-500'}`} />
                      <span className={`font-medium text-sm md:text-base ${paymentMethod === 'bank' ? 'text-gray-900' : isDarkMode ? 'text-white' : 'text-gray-900'}`}>Transfer bancar</span>
                      {paymentMethod === 'bank' && (
                        <span className="ml-auto text-gray-900">✓</span>
                      )}
                    </button>
                  </div>
                </div>
                )}

                {/* Buttons */}
                <div className="flex flex-col md:flex-row gap-3 pt-5">
                  <button
                    type="button"
                    onClick={() => setShowCreditModal(false)}
                    className={`flex-1 py-2.5 md:py-3 px-4 rounded-xl font-medium text-sm md:text-base transition-all border-2 border-green-600 dark:border-green-500 hover:bg-green-50 dark:hover:bg-green-900/20 ${isDarkMode ? 'bg-gray-800 text-white' : 'bg-white text-gray-900'}`}
                  >
                    Anulează
                  </button>
                  {!isIosNativeApp && (
                    <button
                      type="submit"
                      disabled={creditAmount <= 0}
                      className={`flex-1 py-2.5 md:py-3 px-4 rounded-xl font-medium text-sm md:text-base shadow-lg border-2 border-green-600 dark:border-green-500 transition-all disabled:opacity-50 disabled:cursor-not-allowed ${isDarkMode ? 'bg-green-600 text-white hover:bg-green-500' : 'bg-green-600 text-white hover:bg-green-500'}`}
                    >
                      {`Cumpără ${calculateCreditsWithBonus(creditAmount)} credite`}
                    </button>
                  )}
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

        </div>
      </div>
  );
}
