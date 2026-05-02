"use client";

import { dashboardApiFetch } from "@/lib/dashboard-api-fetch";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { BuildingLibraryIcon } from "@heroicons/react/24/outline";
import { HammerIcon } from "@/components/Hammer";
import { 
  CoinsIcon, 
  CreditCardIcon, 
  StarIcon, 
  ArrowUpIcon, 
  ArrowDownIcon,
  PlusIcon,
  MinusIcon
} from "@/components/HeroIcons";
import UniversalHeader from "@/components/UniversalHeader";
import { BackButton } from "@/components/ui/back-button";
import DashboardFooter from "@/components/DashboardFooter";
import supabase from "@/lib/supabase";
import {
  resolveAccountTypeFromJwtOnly,
  looksLikeSupabaseUserId,
} from "@/lib/auth/resolveAccountType";
import {
  getSupabaseSessionRobust,
  getSupabaseAccessTokenRobust,
  refreshSessionSingleFlight,
} from "@/lib/auth/getSupabaseSessionRobust";
import { submitNetopiaCertificateForm } from "@/lib/netopia-submit-certificate-form";
import { useOblioStatus, requestOblioInvoice, buildPayloadForTransaction } from "@/lib/invoice/oblioClient";
import { isNativeCapacitorIos } from "@/lib/platform/isIosApp";
import { StoreKit, verifyAppleReceiptOnServer } from "@/lib/mobile/iap/appleStoreKit";
import { appleTokenProductIdForTokenCount } from "@/lib/payments/apple/product-map";

export default function TokensPage() {
  const router = useRouter();
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [tokenImageError, setTokenImageError] = useState(false);
  const [userInfo, setUserInfo] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    avatar: ''
  });
  const [activeTab, setActiveTab] = useState('overview');
  const [showPurchaseModal, setShowPurchaseModal] = useState(false);
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [purchaseAmount, setPurchaseAmount] = useState(100);
  const [transferData, setTransferData] = useState({
    recipient: '',
    amount: 0,
    message: ''
  });
  const [message, setMessage] = useState({ type: '', text: '' });
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [selectedPackage, setSelectedPackage] = useState<any>(null);
  // Web: Netopia / credit / transfer. iOS nativ: doar Apple IAP.
  const [paymentMethod, setPaymentMethod] = useState<'netopia' | 'credit' | 'bank' | 'apple'>('netopia');
  const [isNativeIosApp, setIsNativeIosApp] = useState(false);
  const [userCreditBalance, setUserCreditBalance] = useState<number>(0);
  const [isLoadingCredit, setIsLoadingCredit] = useState(false);
  const [newsletterCode, setNewsletterCode] = useState('');
  const [isRedeemingCode, setIsRedeemingCode] = useState(false);
  const [newsletterCodeRedeemed, setNewsletterCodeRedeemed] = useState(false);
  const [showNewsletterErrorModal, setShowNewsletterErrorModal] = useState(false);
  const [newsletterError, setNewsletterError] = useState('');
  const oblioStatus = useOblioStatus();

  // User tokens state - loaded from Supabase
  const [userTokens, setUserTokens] = useState({
    balance: 0,
    totalEarned: 0,
    totalSpent: 0,
    level: 'Basic',
    package: 'Basic'
  });

  // Token transactions - loaded from Supabase
  const [tokenTransactions, setTokenTransactions] = useState<any[]>([]);
  const [isLoadingTokens, setIsLoadingTokens] = useState(true);

  // Token packages - same as homepage plans
  const tokenPackages = [
    {
      id: 'basic',
      name: 'Basic',
      tokens: 10,
      price: 0,
      originalPrice: 0,
      discount: 0,
      bonus: 0,
      popular: false,
      color: 'bg-gray-100 text-gray-800 border-gray-200',
      description: 'Ideal pentru a explora platforma',
      features: ['Chat/email suport', 'Notificări push', 'Dashboard Pro']
    },
    {
      id: 'standard',
      name: 'Standard',
      tokens: 50,
      price: 50,
      originalPrice: 50,
      discount: 0,
      bonus: 0,
      popular: false,
      color: 'bg-blue-100 text-blue-800 border-blue-200',
      description: 'Soluție echilibrată pentru licitații regulate',
      features: ['Chat/email suport', 'Notificări push', 'Suport priorititar', 'Dashboard Pro']
    },
    {
      id: 'pro',
      name: 'Pro',
      tokens: 100,
      price: Math.round(100 * (1 - 30 / 100)), // 70 Lei cu discount 30%
      originalPrice: 100,
      discount: 30,
      bonus: 0,
      popular: true,
      color: 'bg-blue-100 text-blue-800 border-blue-200',
      description: 'Pentru utilizatori dedicați și licitații frecvente',
      features: ['Chat/email suport', 'Notificări push', 'Suport priorititar', 'Dashboard Pro']
    },
    {
      id: 'enterprise',
      name: 'Enterprise',
      tokens: 250,
      price: 150,
      originalPrice: 250,
      discount: 40,
      bonus: 0,
      popular: false,
      color: 'bg-green-100 text-green-800 border-green-200',
      description: 'Maximă putere și acces pentru licitații premium',
      features: ['Chat/email suport', 'Notificări push', 'Suport priorititar', 'Consultant dedicat']
    }
  ];

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

  useEffect(() => {
    if (typeof window === "undefined") return;
    setIsNativeIosApp(isNativeCapacitorIos());
  }, []);

  useEffect(() => {
    if (showPaymentModal && isNativeIosApp && selectedPackage && selectedPackage.price > 0) {
      setPaymentMethod("apple");
    }
  }, [showPaymentModal, isNativeIosApp, selectedPackage]);

  const toggleDarkMode = () => {
    const newMode = !isDarkMode;
    setIsDarkMode(newMode);
    if (typeof window !== 'undefined') {
      localStorage.setItem('darkMode', String(newMode));
    }
  };

  // Load user info and tokens from Supabase
  useEffect(() => {
    const loadUserData = async () => {
      try {
        // Load user info from localStorage (fallback)
        const savedUserInfo = localStorage.getItem('userInfo');
        if (savedUserInfo) {
          const parsedInfo = JSON.parse(savedUserInfo);
          setUserInfo(prev => ({ ...prev, ...parsedInfo }));
        }

        const { user: jwtUser, accountType } = await resolveAccountTypeFromJwtOnly(supabase);
        const { data: { session } } = await supabase.auth.getSession();
        const sessionUser = session?.user ?? jwtUser;
        const savedSupabaseUserId = typeof window !== 'undefined' ? localStorage.getItem('supabaseUserId') : null;
        let userId =
          sessionUser?.id ||
          (savedSupabaseUserId && looksLikeSupabaseUserId(savedSupabaseUserId) ? savedSupabaseUserId : null);
        if (!userId && typeof window !== 'undefined') {
          const raw = localStorage.getItem('userInfo');
          if (raw) {
            try {
              const p = JSON.parse(raw) as Record<string, unknown>;
              userId =
                (looksLikeSupabaseUserId(p.supabaseUserId) ? String(p.supabaseUserId) : null) ||
                (looksLikeSupabaseUserId(p.userId) ? String(p.userId) : null) ||
                (looksLikeSupabaseUserId(p.id) ? String(p.id) : null);
            } catch {
              /* ignore */
            }
          }
        }
        if (sessionUser) {
          setUserInfo((prev) => ({
            ...prev,
            email: prev.email || sessionUser.email || '',
            firstName: prev.firstName || sessionUser.user_metadata?.first_name || '',
            lastName: prev.lastName || sessionUser.user_metadata?.last_name || '',
          }));
        }

        if (accountType === 'liquidator') {
          if (typeof window !== "undefined") {
            window.location.replace("/dashboard/lichidator/tokens");
          }
          return;
        }
        if (accountType === 'executor') {
          if (typeof window !== "undefined") {
            window.location.replace("/dashboard/executor/tokens");
          }
          return;
        }
        
        if (!userId) {
          console.log('[Tokens] No userId available, using localStorage fallback');
          // Fallback to localStorage
          const savedTokens = localStorage.getItem('userTokens');
          if (savedTokens) {
            const parsedTokens = JSON.parse(savedTokens);
            setUserTokens(parsedTokens);
          }
          setIsLoadingTokens(false);
          return;
        }

        let accessToken = await getSupabaseAccessTokenRobust(supabase, 5000);
        if (!accessToken) {
          const ref = await refreshSessionSingleFlight(supabase);
          accessToken = ref?.access_token ?? null;
        }
        if (!accessToken) {
          const { data: sess } = await supabase.auth.getSession();
          accessToken = sess.session?.access_token ?? null;
        }

        // Load tokens from Supabase using API
        console.log('[Tokens] Loading tokens from API with userId:', userId, 'hasAccessToken:', !!accessToken);
        const tokensResponse = await dashboardApiFetch('/api/tokens', {
          credentials: 'include',
          headers: {
            ...(userId && !accessToken ? { 'x-user-id': userId } : {})
          }
        });

        if (tokensResponse.ok) {
          const tokensData = await tokensResponse.json();
          
          // Dacă nu există record în Supabase (balance = 0, totalEarned = 0, totalSpent = 0)
          // și există tokeni în localStorage, migrează-i în Supabase
          if (tokensData.balance === 0 && tokensData.totalEarned === 0 && tokensData.totalSpent === 0) {
            const savedTokens = localStorage.getItem('userTokens');
            if (savedTokens) {
              try {
                const localTokens = JSON.parse(savedTokens);
                // Dacă localStorage are tokeni (balance > 0 sau totalSpent > 0), migrează-i
                if (localTokens.balance > 0 || localTokens.totalSpent > 0) {
                  console.log('[Tokens] Migrating tokens from localStorage to Supabase...');
                  const migrateResponse = await dashboardApiFetch('/api/tokens', {
                    method: 'PUT',
                    headers: {
                      ...(userId && !accessToken ? { 'x-user-id': userId } : {}),
                      'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                      balance: localTokens.balance || 0,
                      totalEarned: localTokens.totalEarned || localTokens.totalEarned || 0,
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
                    console.log('[Tokens] Migration successful!');
                    return;
                  }
                }
              } catch (e) {
                console.error('[Tokens] Error migrating tokens:', e);
              }
            }
          }
          
          // Folosește valorile din Supabase
          console.log('[Tokens] Setting tokens from Supabase:', tokensData);
          setUserTokens({
            balance: tokensData.balance ?? 0,
            totalEarned: tokensData.totalEarned ?? 0,
            totalSpent: tokensData.totalSpent ?? 0,
            level: tokensData.level || 'Basic',
            package: tokensData.package || 'Basic'
          });
          
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
          console.error('[Tokens] Failed to load tokens from API:', tokensResponse.status, await tokensResponse.text().catch(() => ''));
        }

        // Load transactions from Supabase (token_transactions; necesită sesiune validă pentru GET)
        const transactionsResponse = await dashboardApiFetch('/api/tokens/transactions', {
          credentials: 'include',
          headers: {
            ...(userId && !accessToken ? { 'x-user-id': userId } : {})
          }
        });

        if (transactionsResponse.ok) {
          const transactionsData = await transactionsResponse.json();
          setTokenTransactions(transactionsData || []);
        }

        setIsLoadingTokens(false);
      } catch (error) {
        console.error('Error loading user data:', error);
        // NU folosi localStorage ca fallback - tokens-urile trebuie să vină din Supabase
        // Dacă nu există în Supabase, balance va fi 0
        setUserTokens({
          balance: 0,
          totalEarned: 0,
          totalSpent: 0,
          level: 'Basic',
          package: 'Basic'
        });
        setIsLoadingTokens(false);
      }
    };

    loadUserData();
    const retryTokensTimer = setTimeout(() => {
      void loadUserData();
    }, 1200);
    return () => {
      clearTimeout(retryTokensTimer);
    };
  }, []);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'bg-green-100 text-green-800 border-green-200';
      case 'pending': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'failed': return 'bg-red-100 text-red-800 border-red-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'completed': return 'Completată';
      case 'pending': return 'În așteptare';
      case 'failed': return 'Eșuată';
      default: return status;
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'purchase': return <CreditCardIcon size="s" className="text-green-500" />;
      case 'spent': return <MinusIcon size="s" className="text-red-500" />;
      case 'earned': return <StarIcon size="s" className="text-blue-500" />;
      case 'transfer': return <CoinsIcon size="s" className="text-blue-500" />;
      default: return <CoinsIcon size="s" className="text-yellow-500" />;
    }
  };

  const getTypeText = (type: string) => {
    switch (type) {
      case 'purchase': return 'Cumpărare';
      case 'spent': return 'Cheltuit';
      case 'earned': return 'Câștigat';
      case 'transfer': return 'Transfer';
      default: return type;
    }
  };

  const updateLevelBasedOnPackage = (packageType: string) => {
    let newLevel = 'Basic';
    let newPackage = 'Basic';
    
    switch (packageType) {
      case 'Basic':
        newLevel = 'Basic';
        newPackage = 'Basic';
        break;
      case 'Standard':
        newLevel = 'Standard';
        newPackage = 'Standard';
        break;
      case 'Pro':
        newLevel = 'Pro';
        newPackage = 'Pro';
        break;
      case 'Enterprise':
        newLevel = 'Enterprise';
        newPackage = 'Enterprise';
        break;
      default:
        newLevel = 'Basic';
        newPackage = 'Basic';
    }
    
    return { newLevel, newPackage };
  };

  // Funcție pentru încărcarea creditului utilizatorului via API route (bypasses RLS)
  const loadUserCredit = async () => {
    setIsLoadingCredit(true);
    try {
      const session = await getSupabaseSessionRobust(supabase);
      const userId =
        session?.user?.id ||
        (typeof window !== "undefined" ? localStorage.getItem("supabaseUserId") : null);
      if (!userId) {
        setUserCreditBalance(0);
        return;
      }

      const accessToken = session?.access_token ?? null;
      
      // Load credit via API route (uses supabaseAdmin to bypass RLS)
      const creditsResponse = await dashboardApiFetch('/api/credits', {
        headers: {
          ...(userId && !accessToken ? { 'x-user-id': userId } : {})
        }
      });

      if (!creditsResponse.ok) {
        const errorData = await creditsResponse.json().catch(() => ({}));
        console.error('[Tokens] Error loading user credit from API:', {
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
        console.log('[Tokens] Loaded user credit from API:', totalCredit, 'RON');
      } else {
        console.warn('[Tokens] Invalid response from credits API:', creditsData);
        setUserCreditBalance(0);
      }
    } catch (error) {
      console.error('Error loading user credit:', error);
      setUserCreditBalance(0);
    } finally {
      setIsLoadingCredit(false);
    }
  };

  const handlePurchaseTokens = async (packageId: string) => {
    const packageToPurchase = tokenPackages.find(pkg => pkg.id === packageId);
    if (!packageToPurchase) return;

    // Open payment modal instead of directly adding tokens
    setSelectedPackage(packageToPurchase);
    setShowPaymentModal(true);
    // Încarcă creditul utilizatorului când se deschide modalul
    await loadUserCredit();
  };

  const handlePaymentComplete = async () => {
    if (!selectedPackage) return;

    try {
      const session = await getSupabaseSessionRobust(supabase);
      const savedSupabaseUserId = typeof window !== 'undefined' ? localStorage.getItem('supabaseUserId') : null;
      const userId = session?.user?.id || savedSupabaseUserId;
      
      if (!userId) {
        // Check if admin/manager is logged in
        const savedAdminInfo = typeof window !== 'undefined' ? localStorage.getItem('adminInfo') : null;
        if (savedAdminInfo) {
          try {
            const adminInfo = JSON.parse(savedAdminInfo);
            if (adminInfo.isAdmin || adminInfo.role === 'manager') {
              // Admin/Manager can access, continue
              console.log('[Tokens] Admin/Manager access granted');
            } else {
              setMessage({ type: 'error', text: 'Trebuie să fii autentificat!' });
              setTimeout(() => {
                window.location.href = '/auth?mode=login&redirect=' + encodeURIComponent('/dashboard/tokens');
              }, 2000);
              return;
            }
          } catch (e) {
            setMessage({ type: 'error', text: 'Trebuie să fii autentificat!' });
            setTimeout(() => {
              window.location.href = '/auth?mode=login&redirect=' + encodeURIComponent('/dashboard/tokens');
            }, 2000);
            return;
          }
        } else {
          setMessage({ type: 'error', text: 'Trebuie să fii autentificat!' });
          setTimeout(() => {
            window.location.href = '/auth?mode=login&redirect=' + encodeURIComponent('/dashboard/tokens');
          }, 2000);
          return;
        }
      }

      // Verifică dacă pachetul este gratuit
      if (selectedPackage.price === 0) {
        const totalTokens = selectedPackage.tokens === -1 ? 999999 : selectedPackage.tokens + selectedPackage.bonus;
        const { newLevel, newPackage } = updateLevelBasedOnPackage(selectedPackage.name);
        
        const updatedTokens = {
          balance: selectedPackage.tokens === -1 ? 999999 : userTokens.balance + totalTokens,
          totalEarned: selectedPackage.tokens === -1 ? 999999 : userTokens.totalEarned + totalTokens,
          totalSpent: userTokens.totalSpent,
          level: newLevel,
          package: newPackage
        };

        // Update tokens in Supabase
        const tokensResponse = await dashboardApiFetch('/api/tokens', {
          method: 'PUT',
          headers: {
            ...(userId && !session?.access_token ? { 'x-user-id': userId } : {}),
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(updatedTokens)
        });

        if (!tokensResponse.ok) {
          throw new Error('Failed to update tokens');
        }

        setUserTokens(updatedTokens);

        // Add transaction to Supabase
        const transactionData = {
          transactionId: `TKN-${Date.now()}`,
          type: 'purchase',
          amount: 0,
          status: 'completed',
          date: new Date().toISOString().split('T')[0],
          description: `Cumpărare tokens - ${selectedPackage.name} (Gratuit)`,
          paymentMethod: 'Gratuit',
          tokensReceived: totalTokens
        };

        const transactionResponse = await dashboardApiFetch('/api/tokens/transactions', {
          method: 'POST',
          headers: {
            ...(userId && !session?.access_token ? { 'x-user-id': userId } : {}),
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(transactionData)
        });

        if (transactionResponse.ok) {
          const newTransaction = await transactionResponse.json();
          setTokenTransactions(prev => [newTransaction, ...prev]);
        }

        const successMessage = selectedPackage.tokens === -1 
          ? `Ai cumpărat pachetul Enterprise cu succes! Tokens nelimitați!`
          : `Ai cumpărat ${totalTokens} tokens cu succes! Soldul tău: ${updatedTokens.balance} tokens`;
        setMessage({ type: 'success', text: successMessage });
        setTimeout(() => setMessage({ type: '', text: '' }), 3000);

        setShowPaymentModal(false);
        setSelectedPackage(null);
        return;
      }

      // iOS (App Store): tokenii cu plată doar prin In-App Purchase
      if (isNativeIosApp && selectedPackage.price > 0) {
        const tokenCountForIap =
          selectedPackage.tokens === -1 ? 0 : Math.floor(Number(selectedPackage.tokens));
        const appleProductId = appleTokenProductIdForTokenCount(tokenCountForIap);
        if (!appleProductId) {
          setMessage({
            type: "error",
            text: "Pe iPhone/iPad în aplicație, alege pachet Standard (50), Pro (100) sau Enterprise (250) tokeni.",
          });
          setTimeout(() => setMessage({ type: "", text: "" }), 5000);
          return;
        }
        try {
          const { products } = await StoreKit.getProducts({
            productIds: [appleProductId],
          });
          const product = products.find((p) => p.productId === appleProductId);
          if (!product) {
            setMessage({
              type: "error",
              text: "Produsul nu este disponibil în App Store. Verifică configurarea IAP.",
            });
            setTimeout(() => setMessage({ type: "", text: "" }), 4000);
            return;
          }
          const { purchase } = await StoreKit.purchase({ productId: appleProductId });
          if (!purchase || !purchase.receipt) {
            setMessage({ type: "error", text: "Achiziția nu a fost finalizată." });
            setTimeout(() => setMessage({ type: "", text: "" }), 4000);
            return;
          }
          const verifyResult = await verifyAppleReceiptOnServer(purchase.receipt, appleProductId);
          if (!verifyResult.success) {
            setMessage({
              type: "error",
              text: verifyResult.message || "Eroare la verificarea plății cu Apple.",
            });
            setTimeout(() => setMessage({ type: "", text: "" }), 4000);
            return;
          }
          const refreshedAccessToken = await getSupabaseAccessTokenRobust(supabase);
          const tokensResponse = await dashboardApiFetch("/api/tokens", {
            headers: {
              ...(refreshedAccessToken ? {} : {}),
            },
          });
          if (tokensResponse.ok) {
            const tokensData = await tokensResponse.json();
            setUserTokens({
              balance: tokensData.balance ?? 0,
              totalEarned: tokensData.totalEarned ?? 0,
              totalSpent: tokensData.totalSpent ?? 0,
              level: tokensData.level || "Basic",
              package: tokensData.package || "Basic",
            });
          }
          setMessage({
            type: "success",
            text: "Plata prin Apple a fost finalizată. Tokenii au fost actualizați.",
          });
          setShowPaymentModal(false);
          setSelectedPackage(null);
          setTimeout(() => setMessage({ type: "", text: "" }), 4000);
        } catch (error) {
          console.error("[Tokens] Apple IAP error:", error);
          setMessage({
            type: "error",
            text: "Eroare la plata prin Apple. Încearcă din nou.",
          });
          setTimeout(() => setMessage({ type: "", text: "" }), 4000);
        }
        return;
      }

      // Pentru pachete cu plată (web), verifică creditul
      const packagePrice = selectedPackage.price;
      const useCredit = paymentMethod === 'credit' && userCreditBalance >= packagePrice;

      if (useCredit) {
        // Plata cu credit
        console.log('[Tokens] Processing credit payment:', { packagePrice, userCreditBalance });
        
        const totalTokens = selectedPackage.tokens === -1 ? 999999 : selectedPackage.tokens + selectedPackage.bonus;
        const { newLevel, newPackage } = updateLevelBasedOnPackage(selectedPackage.name);
        
        const updatedTokens = {
          balance: selectedPackage.tokens === -1 ? 999999 : userTokens.balance + totalTokens,
          totalEarned: selectedPackage.tokens === -1 ? 999999 : userTokens.totalEarned + totalTokens,
          totalSpent: userTokens.totalSpent,
          level: newLevel,
          package: newPackage
        };

        // Update tokens in Supabase
        const tokensResponse = await dashboardApiFetch('/api/tokens', {
          method: 'PUT',
          headers: {
            ...(userId && !session?.access_token ? { 'x-user-id': userId } : {}),
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(updatedTokens)
        });

        if (!tokensResponse.ok) {
          throw new Error('Failed to update tokens');
        }

        // Deduce credit din user_payments
        const { error: creditError } = await supabase
          .from('user_payments')
          .insert({
            user_id: userId,
            amount: -packagePrice, // Negative amount to deduct credit
            currency: 'RON',
            payment_type: 'tokens_purchase_debit',
            description: `Deducere credit pentru cumpărare tokens - ${selectedPackage.name}${selectedPackage.discount ? ` (${selectedPackage.discount}% discount)` : ''}`,
            metadata: {
              package_id: selectedPackage.id,
              tokens_received: totalTokens,
              debit_for_payment: true,
            },
          });

        if (creditError) {
          console.error('[Tokens] Error deducting credit:', creditError);
          throw new Error('Eroare la deducerea creditului');
        }

        setUserTokens(updatedTokens);
        await loadUserCredit(); // Reîncarcă creditul după deducere

        // Add transaction to Supabase
        const transactionData = {
          transactionId: `TKN-${Date.now()}`,
          type: 'purchase',
          amount: packagePrice,
          status: 'completed',
          date: new Date().toISOString().split('T')[0],
          description: `Cumpărare tokens - ${selectedPackage.name}${selectedPackage.discount ? ` (${selectedPackage.discount}% discount)` : ''} - Plătit cu credit`,
          paymentMethod: 'Credit',
          tokensReceived: totalTokens
        };

        const transactionResponse = await dashboardApiFetch('/api/tokens/transactions', {
          method: 'POST',
          headers: {
            ...(userId && !session?.access_token ? { 'x-user-id': userId } : {}),
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(transactionData)
        });

        if (transactionResponse.ok) {
          const newTransaction = await transactionResponse.json();
          setTokenTransactions(prev => [newTransaction, ...prev]);
        }

        const successMessage = selectedPackage.tokens === -1 
          ? `Ai cumpărat pachetul Enterprise cu succes! Tokens nelimitați!`
          : `Ai cumpărat ${totalTokens} tokens cu succes! Soldul tău: ${updatedTokens.balance} tokens`;
        setMessage({ type: 'success', text: successMessage });
        setTimeout(() => setMessage({ type: '', text: '' }), 3000);

        setShowPaymentModal(false);
        setSelectedPackage(null);
      } else {
        // Plată cu card (Netopia) sau transfer bancar
        if (paymentMethod === 'netopia') {
          const totalTokensToAdd = selectedPackage.tokens === -1 ? 999999 : selectedPackage.tokens + (selectedPackage.bonus || 0);
          let accessToken = await getSupabaseAccessTokenRobust(supabase, 5000);
          if (!accessToken) {
            const ref = await refreshSessionSingleFlight(supabase);
            accessToken = ref?.access_token ?? null;
          }
          if (!accessToken) {
            const { data: sess } = await supabase.auth.getSession();
            accessToken = sess.session?.access_token ?? null;
          }
          const res = await dashboardApiFetch('/api/tokens/initiate-payment', {
            method: 'POST',
            cache: 'no-store',
            credentials: 'include',
            headers: {
              'Content-Type': 'application/json',
              ...(accessToken ? {} : {}),
            },
            body: JSON.stringify({
              package_id: selectedPackage.id,
              package_name: selectedPackage.name,
              amount: selectedPackage.price,
              tokens: totalTokensToAdd,
              payment_method: 'netopia',
            }),
          });
          const data = await res.json().catch(() => ({}));
          if (res.status === 401) {
            setMessage({
              type: 'error',
              text:
                [data.error, data.message].filter(Boolean).join('. ') ||
                'Sesiune expirată sau neautentificat. Reîncearcă după autentificare.',
            });
            setTimeout(() => setMessage({ type: '', text: '' }), 5000);
            return;
          }
          if (res.ok) {
            setShowPaymentModal(false);
            if (
              data.use_form_redirect &&
              data.form_url &&
              data.env_key &&
              data.data &&
              submitNetopiaCertificateForm({
                form_url: data.form_url as string,
                env_key: data.env_key as string,
                data: data.data as string,
                iv: (data.iv ?? '') as string,
                cipher: (data.cipher ?? 'aes-256-cbc') as string,
              })
            ) {
              return;
            }
            if (data.payment_url) {
              window.location.assign(data.payment_url as string);
              return;
            }
            setMessage({
              type: 'error',
              text:
                data.message ||
                'Netopia nu a returnat un link de plată. Verifică configurația (Admin → Module → Netopia) sau încearcă din nou.',
            });
            setTimeout(() => setMessage({ type: '', text: '' }), 6000);
            return;
          }
          setMessage({
            type: 'error',
            text: [data.error, data.message].filter(Boolean).join('. ') || 'Eroare la redirecționarea către plată. Încearcă din nou.',
          });
        } else {
          setMessage({ type: 'info', text: 'Pentru transfer bancar, contactează-ne la contact@gobid.ro.' });
        }
        setTimeout(() => setMessage({ type: '', text: '' }), 5000);
      }
    } catch (error) {
      console.error('Error completing payment:', error);
      setMessage({ type: 'error', text: 'Eroare la procesarea plății. Te rugăm să încerci din nou.' });
      setTimeout(() => setMessage({ type: '', text: '' }), 3000);
    }
  };

  const handleTransferTokens = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      const session = await getSupabaseSessionRobust(supabase);
      const savedSupabaseUserId = typeof window !== 'undefined' ? localStorage.getItem('supabaseUserId') : null;
      const userId = session?.user?.id || savedSupabaseUserId;
      
      if (!userId) {
        // Check if admin/manager is logged in
        const savedAdminInfo = typeof window !== 'undefined' ? localStorage.getItem('adminInfo') : null;
        if (savedAdminInfo) {
          try {
            const adminInfo = JSON.parse(savedAdminInfo);
            if (adminInfo.isAdmin || adminInfo.role === 'manager') {
              // Admin/Manager can access, continue
              console.log('[Tokens] Admin/Manager access granted');
            } else {
              setMessage({ type: 'error', text: 'Trebuie să fii autentificat!' });
              setTimeout(() => {
                window.location.href = '/auth?mode=login&redirect=' + encodeURIComponent('/dashboard/tokens');
              }, 2000);
              return;
            }
          } catch (e) {
            setMessage({ type: 'error', text: 'Trebuie să fii autentificat!' });
            setTimeout(() => {
              window.location.href = '/auth?mode=login&redirect=' + encodeURIComponent('/dashboard/tokens');
            }, 2000);
            return;
          }
        } else {
          setMessage({ type: 'error', text: 'Trebuie să fii autentificat!' });
          setTimeout(() => {
            window.location.href = '/auth?mode=login&redirect=' + encodeURIComponent('/dashboard/tokens');
          }, 2000);
          return;
        }
      }

      // Check if recipient exists in Supabase
      const { data: recipientData, error: recipientError } = await supabase
        .from('user_profiles')
        .select('email, first_name, last_name')
        .eq('email', transferData.recipient.toLowerCase())
        .maybeSingle();

      if (recipientError || !recipientData) {
        setMessage({ type: 'error', text: 'Utilizatorul nu a fost găsit în baza de date!' });
        return;
      }

      const recipientName = `${recipientData.first_name || ''} ${recipientData.last_name || ''}`.trim() || transferData.recipient;
      
      // Check level restrictions
      const maxTransferAmount = userTokens.level === 'Basic' ? 2 : userTokens.balance;
      
      if (transferData.amount > maxTransferAmount) {
        if (userTokens.level === 'Basic') {
          setMessage({ type: 'error', text: 'Utilizatorii cu nivel Basic pot trimite maximum 2 tokeni!' });
        } else {
          setMessage({ type: 'error', text: 'Nu ai suficienți tokens pentru acest transfer!' });
        }
        return;
      }

      if (transferData.amount <= 0) {
        setMessage({ type: 'error', text: 'Suma trebuie să fie mai mare decât 0!' });
        return;
      }

      // Update tokens in Supabase
      const updatedTokens = {
        balance: userTokens.balance - transferData.amount,
        totalEarned: userTokens.totalEarned,
        totalSpent: userTokens.totalSpent + transferData.amount,
        level: userTokens.level,
        package: userTokens.package
      };

      const tokensResponse = await dashboardApiFetch('/api/tokens', {
        method: 'PUT',
        headers: {
          ...(userId && !session?.access_token ? { 'x-user-id': userId } : {}),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(updatedTokens)
      });

      if (!tokensResponse.ok) {
        throw new Error('Failed to update tokens');
      }

      setUserTokens(updatedTokens);

      // Add transaction to Supabase
      const transactionData = {
        transactionId: `TKN-${Date.now()}`,
        type: 'transfer',
        amount: -transferData.amount,
        status: 'completed',
        date: new Date().toISOString().split('T')[0],
        description: `Transfer către ${recipientName}`,
        paymentMethod: 'Transfer',
        tokensTransferred: transferData.amount,
        recipientEmail: transferData.recipient,
        recipientName: recipientName,
        message: transferData.message
      };

      const transactionResponse = await dashboardApiFetch('/api/tokens/transactions', {
        method: 'POST',
        headers: {
          ...(userId && !session?.access_token ? { 'x-user-id': userId } : {}),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(transactionData)
      });

      if (transactionResponse.ok) {
        const newTransaction = await transactionResponse.json();
        setTokenTransactions(prev => [newTransaction, ...prev]);
      }

      setTransferData({ recipient: '', amount: 0, message: '' });
      setShowTransferModal(false);
      setMessage({ type: 'success', text: `Ai transferat ${transferData.amount} tokens către ${recipientName}!` });
      setTimeout(() => setMessage({ type: '', text: '' }), 3000);
    } catch (error) {
      console.error('Error transferring tokens:', error);
      setMessage({ type: 'error', text: 'Eroare la transferul tokens. Te rugăm să încerci din nou.' });
      setTimeout(() => setMessage({ type: '', text: '' }), 3000);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('userInfo');
    window.location.href = '/';
  };

  return (
      <div className={`min-h-screen transition-all duration-300 relative ${
        isDarkMode 
          ? 'bg-gradient-to-br from-gray-900 via-gray-800 to-gray-700' 
          : 'bg-gradient-to-br from-gray-50 via-white to-gray-50'
      } max-md:h-dvh max-md:flex max-md:flex-col max-md:overflow-hidden`}>
      <div className="relative z-[1] max-md:flex max-md:flex-col max-md:flex-1 max-md:min-h-0">
        <UniversalHeader 
          isDarkMode={isDarkMode}
          onToggleDarkMode={toggleDarkMode}
        />

      {/* Main Content - scroll pe mobil ca la Favorites/Plăți */}
      <div className="max-md:flex-1 max-md:min-h-0 max-md:flex max-md:flex-col max-md:overflow-hidden">
      <div className="max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8 max-md:flex-1 max-md:min-h-0 max-md:overflow-y-auto max-md:overflow-x-hidden">
        <div className="mb-6">
          <BackButton fallbackHref="/dashboard" label="Înapoi" className="shadow-md" />
        </div>

        {/* Page Header */}
        <div className="mb-6 md:mb-8">
          <div className={`backdrop-blur-lg rounded-2xl p-4 md:p-8 shadow-2xl border ${
            isDarkMode 
              ? 'bg-white/10 border-white/20' 
              : 'bg-white border-gray-200'
          }`}>
            <div className="flex items-center gap-2 md:gap-4 min-w-0 max-md:overflow-hidden">
              <div className={`inline-flex items-center justify-center w-14 h-14 md:w-20 md:h-20 rounded-full shadow-2xl flex-shrink-0 bg-gradient-to-r from-yellow-500 to-yellow-600`}>
                <i className="ri-coins-line text-white text-2xl md:text-3xl"></i>
              </div>
              <div className="min-w-0 flex-1">
                <h2 className={`text-2xl md:text-4xl font-bold max-md:text-lg max-md:truncate max-md:mb-0 ${
                  isDarkMode 
                    ? 'bg-gradient-to-r from-white via-gray-100 to-gray-200 bg-clip-text text-transparent' 
                    : 'text-gray-900'
                }`}>
                  Centrul de Tokens
                </h2>
                <p className={`text-xl max-w-2xl mt-2 max-md:hidden ${
                  isDarkMode ? 'text-gray-300' : 'text-gray-600'
                }`}>
                  Gestionează-ți tokens-urile pentru deblocarea licitațiilor publice, cumpără pachete și transferă către prieteni
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Message */}
        {message.text && (
          <div className={`mb-6 p-4 rounded-lg ${
            message.type === 'success' 
              ? isDarkMode
                ? 'bg-green-500/20 text-green-300 border border-green-400/30' 
                : 'bg-green-50 text-green-800 border border-green-200'
              : isDarkMode
                ? 'bg-red-500/20 text-red-300 border border-red-400/30'
                : 'bg-red-50 text-red-800 border border-red-200'
          }`}>
            {message.text}
          </div>
        )}

        {/* Tabs - pe mobil grid 2x2, pe desktop rând orizontal */}
        <div className="mb-8">
          <div className={`backdrop-blur-lg rounded-2xl p-2 md:p-2 border ${
            isDarkMode 
              ? 'bg-white/10 border-white/20' 
              : 'bg-white border-gray-200'
          }`}>
            <nav className="grid grid-cols-2 gap-2 md:grid-cols-none md:flex md:justify-start md:space-x-2">
              {[
                { id: 'overview', name: 'Prezentare Generală', shortName: 'Prezentare', icon: <i className={`${isDarkMode ? 'ri-dashboard-line text-gray-500' : 'ri-dashboard-line text-gray-600'}`}></i> },
                { id: 'purchase', name: 'Cumpără Tokens', shortName: 'Cumpără', icon: <i className={`${isDarkMode ? 'ri-shopping-cart-line text-gray-500' : 'ri-shopping-cart-line text-gray-600'}`}></i> },
                { id: 'transactions', name: 'Tranzacții', shortName: 'Tranzacții', icon: <i className={`${isDarkMode ? 'ri-exchange-line text-gray-500' : 'ri-exchange-line text-gray-600'}`}></i> },
                { id: 'transfer', name: 'Transfer', shortName: 'Transfer', icon: <i className={`${isDarkMode ? 'ri-send-plane-line text-gray-500' : 'ri-send-plane-line text-gray-600'}`}></i> }
              ].map((tab) => (
                <div key={tab.id} className="relative">
                  <button
                    onClick={() => setActiveTab(tab.id)}
                    className={`py-3 px-4 rounded-xl font-medium text-sm transition-all duration-300 flex flex-row items-center space-x-2 flex-1 md:flex-none justify-center ${
                      activeTab === tab.id
                        ? isDarkMode
                          ? 'bg-gradient-to-r from-gray-600 to-gray-500 text-white shadow-lg transform scale-105'
                          : 'bg-gradient-to-r from-blue-500 to-blue-600 text-white shadow-lg transform scale-105'
                        : isDarkMode
                          ? 'text-gray-300 hover:text-white hover:bg-gray-700/50'
                          : 'text-gray-700 hover:text-gray-900 hover:bg-gray-100'
                    }`}
                  >
                    <div className="w-5 h-5 md:w-6 md:h-6 flex items-center justify-center">
                      {tab.icon}
                    </div>
                    <span className="text-xs md:text-sm leading-tight text-center">{tab.shortName}</span>
                  </button>
                </div>
              ))}
            </nav>
          </div>
        </div>

        {/* Loading State */}
        {isLoadingTokens && (
          <div className="text-center py-12">
            <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
            <p className={`mt-4 ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>
              Se încarcă datele tokens...
            </p>
          </div>
        )}

        {/* Tab Content */}
        {!isLoadingTokens && activeTab === 'overview' && (
          <div className="space-y-8">
            {/* Token Balance Card */}
            <div className={`rounded-xl p-4 md:p-8 shadow-lg transition-all ${isDarkMode ? 'bg-gray-800' : 'bg-white'}`}>
              <div className="text-center">
                <div className="flex justify-center mb-3 md:mb-4">
                  <div className="relative w-24 h-24 md:w-32 md:h-32">
                    {!tokenImageError ? (
                      <Image
                        src="/images/token.webp"
                        alt="Token gobid.ro"
                        fill
                        className="object-contain drop-shadow-lg"
                        priority
                        sizes="(max-width: 768px) 96px, 128px"
                        onError={() => setTokenImageError(true)}
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <div className="text-4xl md:text-6xl">🪙</div>
                      </div>
                    )}
                  </div>
                </div>
                <h3 className={`text-2xl md:text-3xl font-bold mb-2 transition-colors ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                  {userTokens.balance.toLocaleString()} Tokens
                </h3>
                <p className={`text-sm md:text-lg transition-colors ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>
                  Soldul tău curent
                </p>
                <div className={`inline-flex items-center px-3 md:px-4 py-1 md:py-2 rounded-full text-xs md:text-sm font-medium mt-3 md:mt-4 ${
                  userTokens.level === 'Enterprise' ? 'bg-green-100 text-green-800' :
                  userTokens.level === 'Pro' ? 'bg-blue-100 text-blue-800' :
                  userTokens.level === 'Standard' ? 'bg-blue-100 text-blue-800' :
                  'bg-gray-100 text-gray-800'
                }`}>
                  🏆 Nivel {userTokens.level}
                </div>
              </div>
            </div>

            {/* Stats Cards - Modern Glassmorphism Design */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <button
                type="button"
                onClick={() => setActiveTab('transactions')}
                className={`w-full text-left backdrop-blur-lg rounded-2xl p-6 shadow-2xl border hover:shadow-3xl hover:scale-105 transition-all duration-300 cursor-pointer ${
                isDarkMode 
                  ? 'bg-white/10 border-white/20 text-white' 
                  : 'bg-white border-gray-200 text-gray-900'
              }`}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className={`text-sm font-medium ${
                      isDarkMode ? 'text-gray-200' : 'text-gray-600'
                    }`}>TOTAL CÂȘTIGAT</p>
                    <p className={`text-3xl font-bold ${
                      isDarkMode ? 'text-white' : 'text-gray-900'
                    }`}>{userTokens.totalEarned.toLocaleString()}</p>
                  </div>
                  <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${
                    isDarkMode ? 'bg-white/20' : 'bg-blue-100'
                  }`}>
                    <i className={`ri-arrow-up-line text-2xl ${
                      isDarkMode ? 'text-white' : 'text-blue-600'
                    }`}></i>
                  </div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('transactions')}
                className={`w-full text-left backdrop-blur-lg rounded-2xl p-6 shadow-2xl border hover:shadow-3xl hover:scale-105 transition-all duration-300 cursor-pointer ${
                isDarkMode 
                  ? 'bg-white/10 border-white/20 text-white' 
                  : 'bg-white border-gray-200 text-gray-900'
              }`}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className={`text-sm font-medium ${
                      isDarkMode ? 'text-gray-200' : 'text-gray-600'
                    }`}>TOTAL CHELTUIT</p>
                    <p className={`text-3xl font-bold ${
                      isDarkMode ? 'text-white' : 'text-gray-900'
                    }`}>{userTokens.totalSpent.toLocaleString()}</p>
                  </div>
                  <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${
                    isDarkMode ? 'bg-white/20' : 'bg-red-100'
                  }`}>
                    <i className={`ri-arrow-down-line text-2xl ${
                      isDarkMode ? 'text-white' : 'text-red-600'
                    }`}></i>
                  </div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('transactions')}
                className={`w-full text-left backdrop-blur-lg rounded-2xl p-6 shadow-2xl border hover:shadow-3xl hover:scale-105 transition-all duration-300 cursor-pointer ${
                isDarkMode 
                  ? 'bg-white/10 border-white/20 text-white' 
                  : 'bg-white border-gray-200 text-gray-900'
              }`}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className={`text-sm font-medium ${
                      isDarkMode ? 'text-gray-200' : 'text-gray-600'
                    }`}>TRANZACȚII</p>
                    <p className={`text-3xl font-bold ${
                      isDarkMode ? 'text-white' : 'text-gray-900'
                    }`}>{tokenTransactions.length}</p>
                  </div>
                  <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${
                    isDarkMode ? 'bg-white/20' : 'bg-blue-100'
                  }`}>
                    <i className={`ri-exchange-line text-2xl ${
                      isDarkMode ? 'text-white' : 'text-blue-600'
                    }`}></i>
                  </div>
                </div>
              </button>
            </div>

            {/* Redeem Newsletter Code Card */}
            {!newsletterCodeRedeemed && (
            <div className={`backdrop-blur-lg rounded-2xl p-6 shadow-2xl border ${
              isDarkMode 
                ? 'bg-white/10 border-white/20' 
                : 'bg-white border-gray-200'
            }`}>
              <div className="flex items-center gap-3 mb-4">
                <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${
                  isDarkMode ? 'bg-green-500/20' : 'bg-green-100'
                }`}>
                  <i className={`ri-gift-line text-2xl ${
                    isDarkMode ? 'text-green-400' : 'text-green-600'
                  }`}></i>
                </div>
                <div>
                  <h3 className={`text-lg font-semibold transition-colors ${
                    isDarkMode ? 'text-white' : 'text-gray-900'
                  }`}>
                    Folosește Codul de Newsletter
                  </h3>
                  <p className={`text-sm transition-colors ${
                    isDarkMode ? 'text-gray-400' : 'text-gray-600'
                  }`}>
                    Introdu codul primit la abonarea la newsletter pentru 5 tokeni
                  </p>
                </div>
              </div>

              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (!newsletterCode.trim()) {
                    setMessage({ type: 'error', text: 'Introdu codul de newsletter!' });
                    setTimeout(() => setMessage({ type: '', text: '' }), 3000);
                    return;
                  }

                  setIsRedeemingCode(true);
                  try {
                    const accessToken = await getSupabaseAccessTokenRobust(supabase);
                    if (!accessToken) {
                      setMessage({ type: 'error', text: 'Trebuie să fii autentificat!' });
                      setTimeout(() => setMessage({ type: '', text: '' }), 3000);
                      return;
                    }

                    const response = await dashboardApiFetch('/api/newsletter/redeem-code', {
                      method: 'POST',
                      headers: {
                        'Content-Type': 'application/json',
                      },
                      body: JSON.stringify({
                        tokenCode: newsletterCode.trim().toUpperCase(),
                      }),
                    });

                    const data = await response.json();

                    if (!response.ok || !data.success) {
                      // Show error modal instead of throwing error
                      const errorMessage = data.message || 'Eroare la validarea codului';
                      setNewsletterError(errorMessage);
                      setShowNewsletterErrorModal(true);
                      setIsRedeemingCode(false);
                      return;
                    }

                    // Reload tokens
                    const tokensResponse = await dashboardApiFetch('/api/tokens', {
                      headers: {
                      },
                    });

                    if (tokensResponse.ok) {
                      const tokensData = await tokensResponse.json();
                      setUserTokens({
                        balance: tokensData.balance ?? 0,
                        totalEarned: tokensData.totalEarned ?? 0,
                        totalSpent: tokensData.totalSpent ?? 0,
                        level: tokensData.level || 'Basic',
                        package: tokensData.package || 'Basic',
                      });
                    }

                    setNewsletterCode('');
                    setNewsletterCodeRedeemed(true);
                    setMessage({ type: 'success', text: data.message || `Ai primit ${data.tokensAdded || 5} tokeni cu succes!` });
                    setTimeout(() => setMessage({ type: '', text: '' }), 5000);
                    setIsRedeemingCode(false);
                  } catch (error: any) {
                    console.error('Error redeeming code:', error);
                    const errorMessage = error.message || 'Eroare la folosirea codului. Te rog încearcă din nou.';
                    setNewsletterError(errorMessage);
                    setShowNewsletterErrorModal(true);
                    setIsRedeemingCode(false);
                  }
                }}
                className="space-y-4"
              >
                <div className="flex gap-3">
                  <input
                    type="text"
                    value={newsletterCode}
                    onChange={(e) => setNewsletterCode(e.target.value.toUpperCase())}
                    placeholder="TOKEN5-XXXXXXXX"
                    className={`flex-1 px-4 py-3 rounded-lg border transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-green-500 ${
                      isDarkMode 
                        ? 'bg-white/10 border-white/20 text-white placeholder-gray-400' 
                        : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500'
                    }`}
                    required
                    disabled={isRedeemingCode}
                  />
                  <button
                    type="submit"
                    disabled={isRedeemingCode || !newsletterCode.trim()}
                    className={`px-6 py-3 bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white font-semibold rounded-lg transition-all duration-300 shadow-lg hover:shadow-xl transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none ${
                      isDarkMode ? 'from-green-600 to-green-700' : ''
                    }`}
                  >
                    {isRedeemingCode ? (
                      <span className="flex items-center gap-2">
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                        Se validează...
                      </span>
                    ) : (
                      <span className="flex items-center gap-2">
                        <i className="ri-check-line"></i>
                        Validează
                      </span>
                    )}
                  </button>
                </div>
                <p className={`text-xs transition-colors ${
                  isDarkMode ? 'text-gray-400' : 'text-gray-600'
                }`}>
                  ⚠️ Codul poate fi folosit doar o dată și doar cu contul asociat email-ului de la newsletter.
                </p>
              </form>
            </div>
            )}
          </div>
        )}

        {!isLoadingTokens && activeTab === 'purchase' && (
          <div className="space-y-8">
            <div className="text-center">
              <h3 className={`text-2xl font-bold mb-4 transition-colors ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                Alege Pachetul de Tokens
              </h3>
              <p className={`transition-colors ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>
                Cumpără tokens pentru a participa la licitații
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-8">
              {tokenPackages.map((pkg) => (
                <div key={pkg.id} className={`rounded-2xl p-4 md:p-8 transition-all duration-300 hover:shadow-xl relative ${isDarkMode ? 'bg-gray-800 border border-gray-700' : 'bg-white border border-gray-200'} ${pkg.popular ? 'border-blue-500' : ''}`}>
                  {pkg.popular && (
                    <div className="absolute -top-3 md:-top-4 left-1/2 transform -translate-x-1/2">
                      <span className="bg-blue-600 text-white px-3 md:px-4 py-1 rounded-full text-xs md:text-sm font-semibold">
                        Popular
                      </span>
                    </div>
                  )}
                  
                  <div className="text-center mb-4 md:mb-8">
                    <h3 className={`text-lg md:text-2xl font-bold mb-2 transition-colors ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                      {pkg.name}
                    </h3>
                    <div className="mb-3 md:mb-4">
                      {pkg.price === 0 ? (
                        <div>
                          <span className={`text-2xl md:text-4xl font-bold transition-colors ${isDarkMode ? 'text-gray-200' : 'text-gray-800'}`}>
                            0 Lei
                          </span>
                          <span className={`ml-1 text-sm md:text-lg transition-colors ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>/lună</span>
                        </div>
                      ) : pkg.discount && pkg.discount > 0 ? (
                        <div>
                          <div className="flex items-center justify-center space-x-2 mb-1">
                            <span className={`text-lg md:text-xl font-medium line-through transition-colors ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                              {pkg.originalPrice} Lei
                            </span>
                            <span className={`text-2xl md:text-4xl font-bold transition-colors ${
                              pkg.discount >= 50 ? (isDarkMode ? 'text-green-400' : 'text-green-600') :
                              pkg.discount >= 30 ? (isDarkMode ? 'text-orange-400' : 'text-orange-600') :
                              (isDarkMode ? 'text-red-400' : 'text-red-600')
                            }`}>
                              {pkg.price} Lei
                            </span>
                          </div>
                          <div className={`text-xs md:text-sm transition-colors ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                            /lună
                          </div>
                          {pkg.discount > 0 && (
                            <div className={`mt-1 text-xs font-semibold ${
                              pkg.discount >= 50 ? (isDarkMode ? 'text-green-300' : 'text-green-700') :
                              pkg.discount >= 30 ? (isDarkMode ? 'text-orange-300' : 'text-orange-700') :
                              (isDarkMode ? 'text-red-300' : 'text-red-700')
                            }`}>
                              {pkg.discount}% OFF
                            </div>
                          )}
                        </div>
                      ) : (
                        <div>
                          <span className={`text-2xl md:text-4xl font-bold transition-colors ${isDarkMode ? 'text-blue-400' : 'text-blue-600'}`}>
                            {pkg.price} Lei
                          </span>
                          <span className={`ml-1 text-sm md:text-lg transition-colors ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>/lună</span>
                        </div>
                      )}
                    </div>
                    <div className={`mb-3 md:mb-4 rounded-lg px-3 py-2 ${
                      pkg.id === 'basic' ? (isDarkMode ? 'bg-green-900/30 border border-green-500/30' : 'bg-green-50 border border-green-200') :
                      pkg.id === 'standard' ? (isDarkMode ? 'bg-blue-900/30 border border-blue-500/30' : 'bg-blue-50 border border-blue-200') :
                      pkg.id === 'pro' ? (isDarkMode ? 'bg-blue-900/30 border border-blue-500/30' : 'bg-blue-50 border border-blue-200') :
                      (isDarkMode ? 'bg-teal-900/30 border border-teal-500/30' : 'bg-teal-50 border border-teal-200')
                    }`}>
                      <div className={`text-xl md:text-2xl font-bold transition-colors ${
                        pkg.id === 'basic' ? (isDarkMode ? 'text-green-400' : 'text-green-600') :
                        pkg.id === 'standard' ? (isDarkMode ? 'text-blue-400' : 'text-blue-600') :
                        pkg.id === 'pro' ? (isDarkMode ? 'text-blue-400' : 'text-blue-600') :
                        (isDarkMode ? 'text-teal-400' : 'text-teal-600')
                      }`}>
                        {pkg.tokens === -1 ? 'Nelimitat' : `${pkg.tokens.toLocaleString()} Tokens`}
                      </div>
                      <div className={`text-xs md:text-sm transition-colors ${
                        pkg.id === 'basic' ? (isDarkMode ? 'text-green-300' : 'text-green-700') :
                        pkg.id === 'standard' ? (isDarkMode ? 'text-blue-300' : 'text-blue-700') :
                        pkg.id === 'pro' ? (isDarkMode ? 'text-blue-300' : 'text-blue-700') :
                        (isDarkMode ? 'text-teal-300' : 'text-teal-700')
                      }`}>
                        {pkg.id === 'basic' ? 'Bonus de bine ai venit' : pkg.tokens === -1 ? 'Enterprise' : 'Lunar'}
                      </div>
                    </div>
                    <p className={`text-xs md:text-sm transition-colors ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                      {pkg.description}
                    </p>
                  </div>
                  
                  <ul className="space-y-2 md:space-y-4 mb-4 md:mb-8">
                    {pkg.features.map((feature, index) => (
                      <li key={index} className="flex items-center">
                        <svg className="w-4 h-4 md:w-5 md:h-5 text-green-500 mr-2 md:mr-3 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                        <span className={`text-xs md:text-sm transition-colors ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                          {feature}
                        </span>
                      </li>
                    ))}
                  </ul>
                  
                  <button
                    onClick={() => handlePurchaseTokens(pkg.id)}
                    className={`w-full py-2 md:py-3 px-3 md:px-4 rounded-lg font-semibold transition-colors text-sm md:text-base ${
                      pkg.popular
                        ? 'bg-blue-600 text-white hover:bg-blue-700'
                        : pkg.price === 0
                          ? 'bg-gray-600 text-white hover:bg-gray-700'
                          : isDarkMode
                            ? 'bg-gray-700 text-white hover:bg-gray-600'
                            : 'bg-gray-200 text-gray-900 hover:bg-gray-300'
                    }`}
                  >
                    {pkg.price === 0 ? 'Plan Gratuit' : 'Alege Planul'}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {!isLoadingTokens && activeTab === 'transactions' && (
          <div className="space-y-6">
            <h3 className={`text-xl font-semibold transition-colors ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
              Istoric Tranzacții Tokens
            </h3>

            <div className={`rounded-xl shadow-lg transition-all ${isDarkMode ? 'bg-gray-800' : 'bg-white'}`}>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className={`border-b transition-colors ${isDarkMode ? 'border-gray-700' : 'border-gray-200'}`}>
                      <th className={`text-left py-2 md:py-3 px-2 md:px-4 font-medium text-xs md:text-sm transition-colors ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>Tranzacție</th>
                      <th className={`text-left py-2 md:py-3 px-2 md:px-4 font-medium text-xs md:text-sm transition-colors ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>Tip</th>
                      <th className={`text-left py-2 md:py-3 px-2 md:px-4 font-medium text-xs md:text-sm transition-colors ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>Sumă</th>
                      <th className={`text-left py-2 md:py-3 px-2 md:px-4 font-medium text-xs md:text-sm transition-colors ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>Status</th>
                      <th className={`text-left py-2 md:py-3 px-2 md:px-4 font-medium text-xs md:text-sm transition-colors ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>Data</th>
                      {oblioStatus.enabled && (
                        <th className={`text-left py-2 md:py-3 px-2 md:px-4 font-medium text-xs md:text-sm transition-colors ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>Factură</th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {tokenTransactions.map((transaction) => (
                      <tr key={transaction.id} className={`border-b transition-colors ${isDarkMode ? 'border-gray-700' : 'border-gray-200'}`}>
                        <td className="py-2 md:py-3 px-2 md:px-4">
                          <div className="flex items-center space-x-2 md:space-x-3">
                            <span className="text-sm md:text-xl">{getTypeIcon(transaction.type)}</span>
                            <div className="min-w-0 flex-1">
                              <p className={`font-medium text-xs md:text-sm transition-colors ${isDarkMode ? 'text-white' : 'text-gray-900'} truncate`} title={transaction.description || 'N/A'}>
                                {transaction.description && transaction.description.length > 20 
                                  ? transaction.description.substring(0, 20) + '...' 
                                  : transaction.description || 'N/A'}
                              </p>
                              <p className={`text-xs transition-colors ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                                {transaction.paymentMethod && transaction.paymentMethod.length > 15 
                                  ? transaction.paymentMethod.substring(0, 15) + '...' 
                                  : transaction.paymentMethod || 'N/A'}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className={`py-2 md:py-3 px-2 md:px-4 transition-colors text-xs md:text-sm ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                          {getTypeText(transaction.type)}
                        </td>
                        <td className={`py-2 md:py-3 px-2 md:px-4 transition-colors ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                          <span className={`font-semibold text-xs md:text-sm ${transaction.amount > 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {transaction.amount > 0 ? '+' : ''}{transaction.amount.toLocaleString()}
                          </span>
                        </td>
                        <td className="py-2 md:py-3 px-2 md:px-4">
                          <span className={`px-2 md:px-3 py-1 rounded-full text-xs font-medium border whitespace-nowrap ${getStatusColor(transaction.status)}`}>
                            {getStatusText(transaction.status)}
                          </span>
                        </td>
                        <td className={`py-2 md:py-3 px-2 md:px-4 transition-colors text-xs md:text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                          {transaction.date.split('-').reverse().join('-')}
                        </td>
                        {oblioStatus.enabled && (
                          <td className="py-2 md:py-3 px-2 md:px-4">
                            {transaction.type === 'purchase' && transaction.amount > 0 ? (
                              <button
                                type="button"
                                onClick={async () => {
                                  const { payment, clientInfo } = buildPayloadForTransaction(
                                    { amount: transaction.amount, date: transaction.date, description: transaction.description, status: transaction.status, type: 'purchase', tokensReceived: transaction.tokensReceived },
                                    { firstName: userInfo.firstName, lastName: userInfo.lastName, email: userInfo.email }
                                  );
                                  const result = await requestOblioInvoice(payment, clientInfo, { openPdf: true });
                                  if (!result.success) setMessage({ type: 'error', text: result.message || 'Eroare factură' });
                                }}
                                className={`text-xs font-medium px-2 py-1 rounded border transition-colors ${isDarkMode ? 'border-blue-500 text-blue-400 hover:bg-blue-500/20' : 'border-blue-600 text-blue-600 hover:bg-blue-50'}`}
                              >
                                Descarcă
                              </button>
                            ) : (
                              <span className="text-xs text-gray-400">—</span>
                            )}
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {!isLoadingTokens && activeTab === 'transfer' && (
          <div className="space-y-6">
            <div className="text-center">
              <h3 className={`text-2xl font-bold mb-4 transition-colors ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                Transfer Tokens
              </h3>
              <p className={`transition-colors ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>
                Trimite tokens către alți utilizatori
              </p>
              {userTokens.level === 'Basic' && (
                <div className={`mt-4 p-3 rounded-lg border ${isDarkMode ? 'bg-yellow-900/20 border-yellow-700 text-yellow-300' : 'bg-yellow-50 border-yellow-200 text-yellow-800'}`}>
                  <p className="text-sm font-medium">
                    ⚠️ Nivel Basic: Poți trimite maximum 2 tokeni per transfer
                  </p>
                </div>
              )}
            </div>

            <div className={`rounded-xl p-4 md:p-8 shadow-lg transition-all max-w-md mx-auto ${isDarkMode ? 'bg-gray-800' : 'bg-white'}`}>
              <form onSubmit={handleTransferTokens} className="space-y-4 md:space-y-6">
                <div>
                  <label className={`block text-sm font-medium mb-2 transition-colors ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                    Email destinatar
                  </label>
                  <input
                    type="email"
                    value={transferData.recipient}
                    onChange={(e) => setTransferData(prev => ({ ...prev, recipient: e.target.value }))}
                    className={`w-full px-3 md:px-4 py-2 md:py-3 rounded-lg border transition-colors focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm md:text-base ${
                      isDarkMode 
                        ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400' 
                        : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500'
                    }`}
                    placeholder="utilizator@email.com"
                    required
                  />
                </div>

                <div>
                  <label className={`block text-sm font-medium mb-2 transition-colors ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                    Sumă (Tokens)
                  </label>
                  <input
                    type="number"
                    value={transferData.amount}
                    onChange={(e) => setTransferData(prev => ({ ...prev, amount: parseInt(e.target.value) || 0 }))}
                    className={`w-full px-3 md:px-4 py-2 md:py-3 rounded-lg border transition-colors focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm md:text-base ${
                      isDarkMode 
                        ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400' 
                        : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500'
                    }`}
                    placeholder={userTokens.level === 'Basic' ? "2" : "100"}
                    min="1"
                    max={userTokens.level === 'Basic' ? 2 : userTokens.balance}
                    required
                  />
                  <p className={`text-xs md:text-sm mt-1 transition-colors ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                    {userTokens.level === 'Basic' 
                      ? `Nivel Basic: maximum 2 tokeni per transfer`
                      : `Sold disponibil: ${userTokens.balance.toLocaleString()} tokens`
                    }
                  </p>
                </div>

                <div>
                  <label className={`block text-sm font-medium mb-2 transition-colors ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                    Mesaj (opțional)
                  </label>
                  <textarea
                    value={transferData.message}
                    onChange={(e) => setTransferData(prev => ({ ...prev, message: e.target.value }))}
                    rows={3}
                    className={`w-full px-3 md:px-4 py-2 md:py-3 rounded-lg border transition-colors focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm md:text-base ${
                      isDarkMode 
                        ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400' 
                        : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500'
                    }`}
                    placeholder="Mesaj pentru destinatar..."
                  />
                </div>

                <button
                  type="submit"
                  className="w-full bg-blue-600 text-white py-2 md:py-3 px-3 md:px-4 rounded-lg font-semibold hover:bg-blue-700 transition-colors text-sm md:text-base"
                >
                  Trimite Tokens
                </button>
              </form>
            </div>
          </div>
        )}
      </div>
      </div>
      </div>

      {/* Payment Modal */}
      {showPaymentModal && selectedPackage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-2 md:p-4 bg-black/50 backdrop-blur-md">
          <div className={`relative max-w-md w-full max-h-[95vh] overflow-y-auto rounded-2xl md:rounded-3xl shadow-2xl transition-all border-2 border-black
            ${isDarkMode ? 'bg-gray-900 backdrop-blur-xl' : 'bg-white'}`}
          >
            <div className="absolute inset-x-0 top-0 h-px rounded-t-2xl bg-black/20" />
            <div className="p-5 md:p-8">
              <div className="flex items-center justify-between mb-5 md:mb-6">
                <h3 className={`text-lg md:text-xl font-semibold tracking-tight transition-colors ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                  Finalizează Plata
                </h3>
                <button
                  onClick={() => {
                    setShowPaymentModal(false);
                    setSelectedPackage(null);
                  }}
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
            
              {/* Package Summary */}
              <div className={`mb-6 p-4 rounded-xl border-2 ${isDarkMode ? 'bg-gray-800 border-gray-600' : 'bg-gray-50 border-gray-300'}`}>
              <h4 className={`font-semibold mb-2 transition-colors ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                {selectedPackage.name}
              </h4>
              <div className="flex justify-between items-center mb-2">
                <span className={`text-sm transition-colors ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>
                  {selectedPackage.tokens === -1 ? 'Tokens nelimitați' : `${selectedPackage.tokens.toLocaleString()} tokens`}
                </span>
                <div className="text-right">
                  {selectedPackage.price === 0 ? (
                    <span className={`font-bold text-lg transition-colors ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                      Gratuit
                    </span>
                  ) : selectedPackage.discount && selectedPackage.discount > 0 ? (
                    <div>
                      <div className="flex items-center justify-end space-x-2">
                        <span className={`text-sm line-through transition-colors ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                          {selectedPackage.originalPrice} Lei
                        </span>
                        <span className={`font-bold text-lg transition-colors ${
                          selectedPackage.discount >= 50 ? (isDarkMode ? 'text-green-400' : 'text-green-600') :
                          selectedPackage.discount >= 30 ? (isDarkMode ? 'text-orange-400' : 'text-orange-600') :
                          (isDarkMode ? 'text-red-400' : 'text-red-600')
                        }`}>
                          {selectedPackage.price} Lei
                        </span>
                      </div>
                      <span className={`text-xs font-semibold transition-colors ${
                        selectedPackage.discount >= 50 ? (isDarkMode ? 'text-green-300' : 'text-green-700') :
                        selectedPackage.discount >= 30 ? (isDarkMode ? 'text-orange-300' : 'text-orange-700') :
                        (isDarkMode ? 'text-red-300' : 'text-red-700')
                      }`}>
                        {selectedPackage.discount}% discount
                      </span>
                    </div>
                  ) : (
                    <span className={`font-bold text-lg transition-colors ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                      {selectedPackage.price} Lei
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* User Credit Balance — ascuns pe iOS nativ (doar IAP) */}
            {selectedPackage.price > 0 && !isNativeIosApp && (
              <div className={`mb-4 p-3 rounded-xl border ${
                isDarkMode ? 'bg-blue-500/10 border-blue-400/30' : 'bg-blue-50/80 border-blue-200/80'
              }`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <i className="ri-wallet-3-line text-blue-600"></i>
                    <span className={`text-sm font-medium ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                      Credit disponibil:
                    </span>
                  </div>
                  {isLoadingCredit ? (
                    <div className="animate-pulse">
                      <div className="h-5 w-16 bg-gray-300 rounded"></div>
                    </div>
                  ) : (
                    <span className={`text-lg font-bold ${isDarkMode ? 'text-blue-400' : 'text-blue-700'}`}>
                      {userCreditBalance.toFixed(2)} Lei
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* Metode de plată: pe iOS nativ exclusiv Apple IAP */}
            {selectedPackage.price > 0 && (
              <div className="mb-6">
                <label className={`block text-sm font-medium mb-3 transition-colors ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                  Metoda de plată
                </label>
                {isNativeIosApp ? (
                  <div className="space-y-3">
                    <div
                      className={`w-full flex items-start gap-3 p-3 rounded-xl border-2 text-left ${
                        isDarkMode ? 'border-gray-600 bg-gray-800' : 'border-gray-300 bg-white'
                      }`}
                    >
                      <svg className="w-6 h-6 flex-shrink-0 text-black mt-0.5" viewBox="0 0 24 24" aria-hidden="true">
                        <path
                          fill="currentColor"
                          d="M16.365 1.43c0 1.14-.417 2.09-1.247 2.87-.9.84-1.99 1.33-3.18 1.25-.05-1.09.43-2.12 1.29-2.91.43-.41.98-.76 1.64-1.04.65-.27 1.26-.42 1.83-.46.01.1.02.19.02.29zm4.22 15.24c-.46 1.07-.68 1.54-1.29 2.48-.84 1.28-2.03 2.88-3.51 2.9-1.31.01-1.65-.83-3.43-.83-1.78 0-2.16.82-3.46.84-1.48.03-2.61-1.39-3.45-2.66-1.88-2.86-2.08-6.21-.92-8.01.82-1.26 2.12-2.01 3.35-2.01 1.56 0 2.54.85 3.83.85 1.26 0 2-.85 3.82-.85 1.17 0 2.41.64 3.23 1.73-2.84 1.55-2.37 5.61.81 6.36z"
                        />
                      </svg>
                      <div>
                        <span className={`font-medium block ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                          Plată în aplicație (Apple)
                        </span>
                        <span className={`text-xs mt-1 block ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                          În aplicația pentru iPhone/iPad, tokenii cu plată se cumpără doar prin App Store. Prețul afișat în Lei este orientativ; cel final este în fereastra Apple.
                        </span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {userCreditBalance >= selectedPackage.price && (
                      <button
                        type="button"
                        onClick={() => setPaymentMethod('credit')}
                        className={`w-full p-3 rounded-xl border-2 transition-all text-left ${
                          paymentMethod === 'credit'
                            ? isDarkMode
                              ? 'border-green-500 bg-green-500/20 shadow-lg shadow-green-500/10'
                              : 'border-green-500 bg-green-50 shadow-lg shadow-green-500/5'
                            : isDarkMode 
                              ? 'border-white/10 bg-white/5 hover:border-white/20' 
                              : 'border-gray-200/80 bg-white/60 hover:border-green-200'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center">
                            <i className="ri-wallet-3-line text-xl mr-3 text-green-600"></i>
                            <span className={`font-medium transition-colors ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                              Plătește cu Credit
                            </span>
                          </div>
                          <span className={`text-sm font-semibold ${isDarkMode ? 'text-green-400' : 'text-green-700'}`}>
                            {selectedPackage.price.toFixed(2)} Lei
                          </span>
                        </div>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setPaymentMethod('netopia')}
                      className={`w-full flex items-center gap-3 p-3 rounded-xl border-2 transition-all text-left ${
                        paymentMethod === 'netopia'
                          ? 'border-2 border-green-600 dark:border-green-500 shadow-lg bg-white'
                          : isDarkMode ? 'border-2 border-gray-600 bg-gray-800 hover:border-gray-500 text-white' : 'border-2 border-gray-300 bg-white hover:border-black/50 text-gray-900'
                      }`}
                    >
                      <span className="flex-shrink-0 w-20 h-7 relative flex items-center justify-center rounded-md bg-white px-2">
                        <Image src="/netopia-logo.svg" alt="Netopia" fill className="object-contain object-center p-0.5" />
                      </span>
                      <span className={`font-medium transition-colors ${paymentMethod === 'netopia' ? 'text-gray-900' : isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                        Card bancar (Netopia)
                      </span>
                      {paymentMethod === 'netopia' && <span className="ml-auto text-gray-900">✓</span>}
                    </button>
                    <button
                      type="button"
                      onClick={() => setPaymentMethod('bank')}
                      className={`w-full flex items-center gap-3 p-3 rounded-xl border-2 transition-all text-left ${
                        paymentMethod === 'bank'
                          ? 'border-2 border-green-600 dark:border-green-500 shadow-lg bg-white'
                          : isDarkMode ? 'border-2 border-gray-600 bg-gray-800 hover:border-gray-500 text-white' : 'border-2 border-gray-300 bg-white hover:border-black/50 text-gray-900'
                      }`}
                    >
                      <BuildingLibraryIcon className={`w-8 h-8 flex-shrink-0 ${paymentMethod === 'bank' ? 'text-gray-600' : 'text-gray-500'}`} />
                      <span className={`font-medium transition-colors ${paymentMethod === 'bank' ? 'text-gray-900' : isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                        Transfer bancar
                      </span>
                      {paymentMethod === 'bank' && <span className="ml-auto text-gray-900">✓</span>}
                    </button>
                    {userCreditBalance < selectedPackage.price && (
                      <div className={`mt-3 p-3 rounded-xl ${isDarkMode ? 'bg-orange-500/10 border border-orange-400/30' : 'bg-orange-50/80 border border-orange-200/80'}`}>
                        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <i className="ri-information-line text-orange-600 text-sm"></i>
                            <span className={`text-xs sm:text-sm ${isDarkMode ? 'text-orange-400' : 'text-orange-700'}`}>
                              Credit insuficient. Folosește card bancar (Netopia) sau transfer bancar.
                            </span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Payment Button */}
            <div className="flex flex-col md:flex-row gap-3 pt-2">
              <button
                onClick={() => {
                  setShowPaymentModal(false);
                  setSelectedPackage(null);
                }}
                className={`flex-1 py-2.5 md:py-3 px-4 rounded-xl font-medium text-sm md:text-base transition-all border-2 border-green-600 dark:border-green-500 hover:bg-green-50 dark:hover:bg-green-900/20 ${isDarkMode ? 'bg-gray-800 text-white' : 'bg-white text-gray-900'}`}
              >
                Anulează
              </button>
              <button
                onClick={handlePaymentComplete}
                className={`flex-1 py-2.5 md:py-3 px-4 rounded-xl font-medium text-sm md:text-base shadow-lg border-2 border-green-600 dark:border-green-500 transition-all ${isDarkMode ? 'bg-green-600 text-white hover:bg-green-500' : 'bg-green-600 text-white hover:bg-green-500'}`}
              >
                {selectedPackage.price === 0
                  ? 'Activează Gratuit'
                  : isNativeIosApp
                    ? 'Cumpără cu Apple (App Store)'
                    : paymentMethod === 'credit' && userCreditBalance >= selectedPackage.price
                      ? `Plătește cu Credit (${selectedPackage.price.toFixed(2)} Lei)`
                      : selectedPackage.discount && selectedPackage.discount > 0
                        ? `Plătește ${selectedPackage.price} Lei (din ${selectedPackage.originalPrice} Lei)`
                        : `Plătește ${selectedPackage.price} Lei`}
              </button>
            </div>
            </div>
          </div>
        </div>
      )}

      {/* Newsletter Error Modal */}
      {showNewsletterErrorModal && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          onClick={() => setShowNewsletterErrorModal(false)}
        >
          <div
            className={`bg-gradient-to-br rounded-2xl p-6 max-w-md w-full shadow-2xl border-2 ${
              isDarkMode
                ? 'from-red-900/90 to-red-800/90 border-red-600'
                : 'from-red-50 to-red-100 border-red-300'
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-red-500 flex items-center justify-center">
                  <i className="ri-error-warning-line text-white text-2xl"></i>
                </div>
                <h2 className={`text-2xl font-bold ${isDarkMode ? 'text-red-100' : 'text-red-900'}`}>Eroare</h2>
              </div>
              <button
                onClick={() => setShowNewsletterErrorModal(false)}
                className={`transition-colors ${
                  isDarkMode
                    ? 'text-red-300 hover:text-red-100'
                    : 'text-red-700 hover:text-red-900'
                }`}
              >
                <i className="ri-close-line text-2xl"></i>
              </button>
            </div>

            <div className="mb-6">
              <p className={`text-lg ${isDarkMode ? 'text-red-200' : 'text-red-800'}`}>
                {newsletterError}
              </p>
            </div>

            <div className="flex justify-end">
              <button
                onClick={() => setShowNewsletterErrorModal(false)}
                className="px-6 py-3 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-lg transition-all duration-300 shadow-lg hover:shadow-xl"
              >
                Închide
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="max-md:hidden">
        <DashboardFooter isDarkMode={isDarkMode} />
      </div>

      </div>
  );
}
