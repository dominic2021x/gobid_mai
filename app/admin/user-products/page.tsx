"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import WheelPagination from "@/components/ui/wheel-pagination";

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
  customFields: Record<string, any>;
  seo: {
    title: string;
    description: string;
    keywords: string[];
  };
  status: 'draft' | 'active' | 'deleted';
  images: (string | { type: 'zip'; url?: string })[];
  createdAt: string;
  url?: string;
  slug?: string;
  anafPublicationDate?: string;
  userId?: string;
  approvalStatus?: 'pending' | 'approved' | 'rejected';
  rejectionReason?: string;
  approvedAt?: string;
  approvedBy?: string;
  userEmail?: string;
  userFirstName?: string;
  userLastName?: string;
  userPhone?: string;
  userIpAddress?: string;
  riskScore?: number;
  riskAnalysisData?: any;
}

function UserProductsPaginationControls({
  isDarkMode,
  totalCount,
  totalPages,
  page,
  pageSize,
  isLoading,
  onPageChange,
  onPageSizeChange,
  align = "between",
  className = "",
}: {
  isDarkMode: boolean;
  totalCount: number;
  totalPages: number;
  page: number;
  pageSize: number;
  isLoading: boolean;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  align?: "between" | "end";
  className?: string;
}) {
  return (
    <div
      className={`flex flex-wrap items-center gap-2 text-sm ${
        align === "between" ? "justify-between" : "justify-end"
      } ${className}`}
    >
      <div className={`flex items-center gap-2 flex-wrap ${align === "between" ? "" : "ml-auto"}`}>
        <label className={`text-xs ${isDarkMode ? "text-gray-400" : "text-gray-600"}`}>
          Pe pagină
        </label>
        <select
          value={pageSize}
          onChange={(e) => onPageSizeChange(Number(e.target.value))}
          className={`px-2 py-1.5 rounded border text-xs ${
            isDarkMode ? "bg-white/10 border-white/20" : "bg-white border-gray-300"
          }`}
        >
          <option value={25}>25</option>
          <option value={50}>50</option>
          <option value={100}>100</option>
          <option value={200}>200</option>
          <option value={500}>500</option>
        </select>
        {totalCount > 0 ? (
          <div className={isLoading ? "opacity-50 pointer-events-none" : undefined}>
            <WheelPagination
              totalPages={totalPages}
              currentPage={page}
              onPageChange={onPageChange}
              canGoNext={page < totalPages && !isLoading}
              isDarkMode={isDarkMode}
            />
          </div>
        ) : (
          <span className={`text-xs tabular-nums px-1 ${isDarkMode ? "text-gray-300" : "text-gray-700"}`}>—</span>
        )}
      </div>
    </div>
  );
}

export default function UserProductsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [products, setProducts] = useState<Product[]>([]);
  const [filterStatus, setFilterStatus] = useState<'all' | 'draft' | 'active'>('all');
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [filterSubcategory, setFilterSubcategory] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [approvalFilter, setApprovalFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all');
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedProductForRisk, setSelectedProductForRisk] = useState<Product | null>(null);
  const [riskAnalysis, setRiskAnalysis] = useState<any>(null);
  const [isLoadingRisk, setIsLoadingRisk] = useState(false);
  const [showRiskModal, setShowRiskModal] = useState(false);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [selectedProductForReject, setSelectedProductForReject] = useState<Product | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [deletingProductId, setDeletingProductId] = useState<string | null>(null);
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([]);
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [pageSize, setPageSize] = useState(50);
  const [stats, setStats] = useState<{ all: number; pending: number; approved: number; rejected: number } | null>(null);
  const [categoriesFromApi, setCategoriesFromApi] = useState<string[]>([]);
  const [subcategoriesFromApi, setSubcategoriesFromApi] = useState<string[]>([]);

  /** Valoare primitivă din URL — folosită în loc de `[searchParams]` în efecte (referința ReadonlyURLSearchParams poate fi nestabilă). */
  const filterFromUrl = searchParams.get('filter');

  // Initialize from URL params
  useEffect(() => {
    if (filterFromUrl === 'pending' || filterFromUrl === 'approved' || filterFromUrl === 'rejected') {
      setApprovalFilter((prev) => (prev === filterFromUrl ? prev : filterFromUrl));
    }
  }, [filterFromUrl]);

  // Helper function to generate URL from title
  const generateProductUrl = (product: Product): string => {
    // Route based on product type:
    // - live-bid (user products) -> /live_bid/
    // - licitatii-publice (executor/admin products) -> /licitatii-publice/
    const routePrefix = product.productType === 'licitatii-publice' 
      ? '/licitatii-publice' 
      : '/live_bid';
    
    if (product.slug) {
      return `${routePrefix}/${product.slug}`;
    }
    // Fallback: generate slug from title
    const slug = product.title
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
    return `${routePrefix}/${slug}`;
  };

  const mapSupabaseProduct = useCallback((row: any, userProfile?: any): Product => {
    return {
      id: row.id,
      title: row.title || 'Fără titlu',
      description: row.description || '',
      category: row.category || 'Necategorizat',
      subcategory: row.subcategory || '',
      sku: row.sku || '',
      startingPrice: row.starting_price_ron || row.starting_price_eur || 0,
      productType: row.product_type || 'live-bid',
      currency: row.currency || 'RON',
      customFields: row.custom_fields || {},
      seo: {
        title: row.seo_title || row.title || '',
        description: row.seo_description || row.description || '',
        keywords: row.seo_keywords || []
      },
      status: row.status || 'draft',
      images: row.images || [],
      createdAt: row.created_at || new Date().toISOString(),
      url: row.url ?? undefined,
      slug: row.slug ?? undefined,
      userId: row.user_id ?? undefined,
      approvalStatus: row.approval_status ?? 'pending',
      rejectionReason: row.rejection_reason ?? undefined,
      approvedAt: row.approved_at ?? undefined,
      approvedBy: row.approved_by ?? undefined,
      userEmail: userProfile?.email ?? undefined,
      userFirstName: userProfile?.first_name ?? undefined,
      userLastName: userProfile?.last_name ?? undefined,
      userPhone: userProfile?.phone ?? undefined,
      riskScore: row.risk_score ?? undefined,
      riskAnalysisData: row.risk_analysis_data ?? undefined,
    };
  }, []);

  const loadProducts = useCallback(async (options?: {
    filterOptions?: boolean;
    resetPage?: boolean;
    /** Fără spinner pe tot ecranul (ex. după analiză risk în fundal). */
    silent?: boolean;
  }) => {
    const currentPage = options?.resetPage ? 1 : page;
    if (options?.resetPage) setPage(1);
    const silent = options?.silent === true;
    if (!silent) setIsLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('page', String(currentPage));
      params.set('pageSize', String(pageSize));
      if (searchTerm) params.set('search', searchTerm);
      if (filterStatus !== 'all') params.set('status', filterStatus);
      if (filterCategory !== 'all') params.set('category', filterCategory);
      if (filterSubcategory !== 'all') params.set('subcategory', filterSubcategory);
      if (approvalFilter !== 'all') params.set('approval', approvalFilter);
      if (options?.filterOptions) params.set('filterOptions', '1');

      const res = await fetch(`/api/admin/user-products?${params.toString()}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Eroare la încărcare');
      }
      const data = await res.json();
      setProducts(data.products ?? []);
      setTotalCount(data.total ?? 0);
      const rawPage = data.page ?? currentPage;
      const nextPage =
        typeof rawPage === 'number' && Number.isFinite(rawPage)
          ? Math.max(1, rawPage)
          : Math.max(1, Number(currentPage) || 1);
      setPage((prev) => (prev === nextPage ? prev : nextPage));
      if (data.stats) setStats(data.stats);
      if (data.categories) setCategoriesFromApi(data.categories);
      if (data.subcategories) setSubcategoriesFromApi(data.subcategories);
    } catch (error: any) {
      console.error('Error loading products:', error);
      setMessage({ type: 'error', text: error?.message || 'Eroare la încărcarea produselor.' });
    } finally {
      if (!silent) setIsLoading(false);
    }
  }, [page, pageSize, searchTerm, filterStatus, filterCategory, filterSubcategory, approvalFilter]);

  useEffect(() => {
    loadProducts({ filterOptions: true });
  }, [loadProducts]);

  // Produsele sunt deja filtrate pe server (o pagină)
  const filteredProducts = products;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  useEffect(() => {
    setSelectedProductIds((prev) => (prev.length === 0 ? prev : []));
  }, [page, pageSize, searchTerm, filterStatus, filterCategory, filterSubcategory, approvalFilter]);

  const toggleProductSelected = useCallback((productId: string) => {
    setSelectedProductIds((prev) =>
      prev.includes(productId) ? prev.filter((id) => id !== productId) : [...prev, productId]
    );
  }, []);

  const toggleSelectAllOnPage = useCallback(() => {
    const pageIds = filteredProducts.map((p) => p.id);
    const allSelected =
      pageIds.length > 0 && pageIds.every((id) => selectedProductIds.includes(id));
    setSelectedProductIds(allSelected ? [] : pageIds);
  }, [filteredProducts, selectedProductIds]);

  const clearProductSelection = useCallback(() => setSelectedProductIds([]), []);

  const allOnPageSelected =
    filteredProducts.length > 0 &&
    filteredProducts.every((p) => selectedProductIds.includes(p.id));
  const someOnPageSelected = filteredProducts.some((p) => selectedProductIds.includes(p.id));

  const categories = categoriesFromApi.length > 0
    ? categoriesFromApi
    : Array.from(new Set(products.map(p => p.category))).filter(Boolean).sort();
  const subcategories = subcategoriesFromApi.length > 0
    ? subcategoriesFromApi
    : (filterCategory === 'all'
      ? Array.from(new Set(products.map(p => p.subcategory))).filter(Boolean).sort()
      : Array.from(new Set(products.filter(p => p.category === filterCategory).map(p => p.subcategory))).filter(Boolean).sort());

  const handlePendingProduct = async (productId: string) => {
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;

      const headers: HeadersInit = {
        'Content-Type': 'application/json',
      };

      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const response = await fetch('/api/admin/products/approve', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          productId,
          action: 'pending',
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to set product to pending');
      }

      setMessage({ type: 'success', text: result.message || 'Produsul a fost pus în așteptare pentru revizuire.' });
      await loadProducts();
      setTimeout(() => setMessage(null), 3000);
    } catch (error: any) {
      console.error('Error setting product to pending:', error);
      setMessage({ type: 'error', text: error.message || 'Nu am putut pune produsul în așteptare.' });
      setTimeout(() => setMessage(null), 3000);
    }
  };

  const handleApproveProduct = async (productId: string) => {
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;

      const headers: HeadersInit = {
        'Content-Type': 'application/json',
      };

      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const response = await fetch('/api/admin/products/approve', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          productId,
          action: 'approve',
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to approve product');
      }

      setMessage({ type: 'success', text: result.message || 'Produsul a fost aprobat cu succes.' });
      await loadProducts();
      setTimeout(() => setMessage(null), 3000);
    } catch (error: any) {
      console.error('Error approving product:', error);
      setMessage({ type: 'error', text: error.message || 'Nu am putut aproba produsul.' });
      setTimeout(() => setMessage(null), 3000);
    }
  };

  const handleRejectProduct = (product: Product) => {
    setSelectedProductForReject(product);
    setRejectionReason('');
    setShowRejectModal(true);
  };

  const confirmRejectProduct = async () => {
    if (!selectedProductForReject) return;

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;

      const headers: HeadersInit = {
        'Content-Type': 'application/json',
      };

      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const response = await fetch('/api/admin/products/approve', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          productId: selectedProductForReject.id,
          action: 'reject',
          rejectionReason: rejectionReason.trim() || undefined,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to reject product');
      }

      setMessage({ type: 'success', text: result.message || 'Produsul a fost respins.' });
      setShowRejectModal(false);
      setSelectedProductForReject(null);
      setRejectionReason('');
      await loadProducts();
      setTimeout(() => setMessage(null), 3000);
    } catch (error: any) {
      console.error('Error rejecting product:', error);
      setMessage({ type: 'error', text: error.message || 'Nu am putut respinge produsul.' });
      setTimeout(() => setMessage(null), 3000);
    }
  };

  const handleRiskAnalysis = async (product: Product, showModal: boolean = true) => {
    setIsLoadingRisk(true);
    if (showModal) {
      setSelectedProductForRisk(product);
      setShowRiskModal(true);
      setRiskAnalysis(null);
    }

    try {
      const response = await fetch('/api/admin/products/risk-analysis', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          productId: product.id,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to analyze risk');
      }

      if (showModal) {
        setRiskAnalysis(result);
      }
      // Reîncarcă lista fără să blochezi tot ecranul cu spinnerul principal
      await loadProducts({ silent: true });
    } catch (error) {
      console.error('Error analyzing risk:', error);
      if (showModal) {
        setMessage({ type: 'error', text: 'Nu am putut analiza riscul produsului.' });
        setTimeout(() => setMessage(null), 3000);
      }
    } finally {
      setIsLoadingRisk(false);
    }
  };

  const handleViewProduct = (product: Product) => {
    const url = generateProductUrl(product);
    window.open(url, '_blank');
  };

  const deleteProduct = async (productId: string) => {
    if (!confirm('Sigur vrei să ștergi acest produs? Produsul va fi mutat la „Produse șterse” și poate fi restaurat ulterior.')) return;
    setDeletingProductId(productId);
    try {
      const response = await fetch('/api/admin/products/delete', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productIds: [productId] }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Nu s-a putut șterge produsul');
      if (result.success && result.deletedCount > 0) {
        setProducts(prev => prev.filter(p => p.id !== productId));
        setSelectedProductIds((prev) => prev.filter((id) => id !== productId));
        setMessage({ type: 'success', text: 'Produsul a fost șters.' });
      } else {
        setMessage({ type: 'error', text: result.message || 'Produsul nu a putut fi șters.' });
      }
      setTimeout(() => setMessage(null), 3000);
    } catch (error: any) {
      setMessage({ type: 'error', text: error.message || 'Eroare la ștergere.' });
      setTimeout(() => setMessage(null), 3000);
    } finally {
      setDeletingProductId(null);
    }
  };

  const deleteBulkProducts = async () => {
    if (selectedProductIds.length === 0) return;
    const n = selectedProductIds.length;
    if (
      !confirm(
        `Sigur vrei să ștergi ${n} produs(e)? Produsele vor fi mutate la „Produse șterse” și pot fi restaurate ulterior.`
      )
    )
      return;
    setIsBulkDeleting(true);
    try {
      const response = await fetch('/api/admin/products/delete', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productIds: selectedProductIds }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Nu s-au putut șterge produsele');
      if (result.success && result.deletedCount > 0) {
        setSelectedProductIds([]);
        setMessage({
          type: 'success',
          text: result.message || `${result.deletedCount} produs(e) au fost șterse.`,
        });
        await loadProducts();
      } else {
        setMessage({
          type: 'error',
          text: result.message || 'Nu s-au putut șterge produsele.',
        });
      }
      setTimeout(() => setMessage(null), 4000);
    } catch (error: any) {
      setMessage({ type: 'error', text: error.message || 'Eroare la ștergere.' });
      setTimeout(() => setMessage(null), 4000);
    } finally {
      setIsBulkDeleting(false);
    }
  };

  const formatPrice = (price: number, currency: 'RON' | 'EUR') => {
    return new Intl.NumberFormat('ro-RO', {
      style: 'currency',
      currency: currency
    }).format(price);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('ro-RO', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  // Dark mode is managed by admin layout - read from localStorage/dom
  const [isDarkMode, setIsDarkMode] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const syncFromStorageOrDom = () => {
      const saved = window.localStorage.getItem('darkMode');
      if (saved !== null) {
        setIsDarkMode(saved === 'true');
      } else {
        setIsDarkMode(document.documentElement.classList.contains('dark'));
      }
    };
    syncFromStorageOrDom();

    const handleStorageChange = () => {
      syncFromStorageOrDom();
    };
    window.addEventListener('storage', handleStorageChange);

    const observer = new MutationObserver(() => {
      const dark = document.documentElement.classList.contains('dark');
      setIsDarkMode((prev) => (prev === dark ? prev : dark));
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    });

    return () => {
      window.removeEventListener('storage', handleStorageChange);
      observer.disconnect();
    };
  }, []);

  return (
    <div className={`min-h-screen transition-all duration-300 ${
      isDarkMode 
        ? 'bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900' 
        : 'bg-gradient-to-br from-gray-50 via-white to-gray-50'
    }`}>
      <div className="max-w-7xl mx-auto px-3 sm:px-4 lg:px-5 py-4">
        {/* Header - compact */}
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="inline-flex items-center justify-center w-10 h-10 rounded-lg bg-gradient-to-r from-blue-600 to-blue-600 shadow">
              <i className="ri-user-line text-white text-xl"></i>
            </div>
            <div>
              <h1 className={`text-xl md:text-2xl font-bold ${
                isDarkMode ? 'text-white' : 'text-gray-900'
              }`}>
                Produse Utilizatori
              </h1>
              <p className={`text-xs ${
                isDarkMode ? 'text-gray-400' : 'text-gray-500'
              }`}>
                {totalCount.toLocaleString()} produse
              </p>
            </div>
          </div>
          <button
            onClick={() => router.push('/admin/products/deleted')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              isDarkMode 
                ? 'bg-gray-700 hover:bg-gray-600 text-gray-300' 
                : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
            }`}
          >
            <i className="ri-delete-bin-7-line text-sm"></i>
            Produse șterse
          </button>
        </div>

        {/* Message */}
        {message && (
          <div className={`mb-3 p-3 rounded-lg text-sm ${
            message.type === 'success' 
              ? (isDarkMode ? 'bg-green-500/20 text-green-300' : 'bg-green-100 text-green-800')
              : (isDarkMode ? 'bg-red-500/20 text-red-300' : 'bg-red-100 text-red-800')
          }`}>
            {message.text}
          </div>
        )}

        {/* Filters - compact */}
        <div className={`rounded-xl border mb-4 p-3 ${
          isDarkMode 
            ? 'bg-white/10 border-white/20' 
            : 'bg-white border-gray-200'
        }`}>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="md:col-span-2">
              <label className={`block text-xs font-medium mb-1 ${
                isDarkMode ? 'text-gray-400' : 'text-gray-600'
              }`}>Căutare</label>
              <div className="relative">
                <input
                  type="text"
                  placeholder="Caută produse..."
                  value={searchTerm}
                  onChange={(e) => {
                    setSearchTerm(e.target.value);
                    setPage(1);
                  }}
                  className={`w-full pl-8 pr-3 py-2 text-sm rounded-lg border focus:outline-none focus:ring-1 focus:ring-blue-500 ${
                    isDarkMode 
                      ? 'bg-white/10 border-white/20 text-white placeholder-gray-400' 
                      : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500'
                  }`}
                />
                <i className="ri-search-line absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-sm"></i>
              </div>
            </div>
            <div>
              <label className={`block text-xs font-medium mb-1 ${
                isDarkMode ? 'text-gray-400' : 'text-gray-600'
              }`}>Status</label>
              <select
                value={filterStatus}
                onChange={(e) => {
                  setFilterStatus(e.target.value as 'all' | 'draft' | 'active');
                  setPage(1);
                }}
                className={`w-full px-3 py-2 text-sm rounded-lg border focus:outline-none focus:ring-1 focus:ring-blue-500 ${
                  isDarkMode 
                    ? 'bg-white/10 border-white/20 text-white' 
                    : 'bg-white border-gray-300 text-gray-900'
                }`}
              >
                <option value="all">Toate</option>
                <option value="active">Active</option>
                <option value="draft">Draft</option>
              </select>
            </div>
            <div>
              <label className={`block text-xs font-medium mb-1 ${
                isDarkMode ? 'text-gray-400' : 'text-gray-600'
              }`}>Categorie</label>
              <select
                value={filterCategory}
                onChange={(e) => {
                  setFilterCategory(e.target.value);
                  setFilterSubcategory('all');
                  setPage(1);
                }}
                className={`w-full px-3 py-2 text-sm rounded-lg border focus:outline-none focus:ring-1 focus:ring-blue-500 ${
                  isDarkMode 
                    ? 'bg-white/10 border-white/20 text-white' 
                    : 'bg-white border-gray-300 text-gray-900'
                }`}
              >
                <option value="all">Toate</option>
                {categories.map(cat => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Stats Cards - compact */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            <div
              onClick={() => { setApprovalFilter('all'); setPage(1); }}
              className={`rounded-lg border overflow-hidden transition-all cursor-pointer ${
                isDarkMode ? 'bg-white/10 border-white/20' : 'bg-white border-gray-200'
              } ${approvalFilter === 'all' ? 'ring-2 ring-blue-500' : ''}`}
            >
              <div className={`p-3 flex items-center justify-between ${
                isDarkMode ? 'from-blue-600/20 to-blue-600/20' : 'bg-blue-50'
              }`}>
                <div>
                  <p className={`text-[10px] font-semibold uppercase tracking-wider ${
                    isDarkMode ? 'text-blue-300' : 'text-blue-600'
                  }`}>Total</p>
                  <p className={`text-lg font-bold ${
                    isDarkMode ? 'text-white' : 'text-gray-900'
                  }`}>{(stats?.all ?? totalCount).toLocaleString()}</p>
                </div>
                <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${
                  isDarkMode ? 'bg-blue-500/30' : 'bg-blue-500'
                }`}>
                  <i className={`text-lg ${isDarkMode ? 'ri-shopping-bag-line text-blue-300' : 'ri-shopping-bag-line text-white'}`}></i>
                </div>
              </div>
            </div>
            <div
              onClick={() => { setApprovalFilter('pending'); setPage(1); }}
              className={`rounded-lg border overflow-hidden transition-all cursor-pointer ${
                isDarkMode ? 'bg-white/10 border-white/20' : 'bg-white border-gray-200'
              } ${approvalFilter === 'pending' ? 'ring-2 ring-yellow-500' : ''}`}
            >
              <div className={`p-3 flex items-center justify-between ${isDarkMode ? '' : 'bg-yellow-50'}`}>
                <div>
                  <p className={`text-[10px] font-semibold uppercase tracking-wider ${isDarkMode ? 'text-yellow-300' : 'text-yellow-600'}`}>În așteptare</p>
                  <p className={`text-lg font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{(stats?.pending ?? 0).toLocaleString()}</p>
                </div>
                <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${isDarkMode ? 'bg-yellow-500/30' : 'bg-yellow-500'}`}>
                  <i className={`text-lg ${isDarkMode ? 'ri-time-line text-yellow-300' : 'ri-time-line text-white'}`}></i>
                </div>
              </div>
            </div>
            <div
              onClick={() => { setApprovalFilter('approved'); setPage(1); }}
              className={`rounded-lg border overflow-hidden transition-all cursor-pointer ${
                isDarkMode ? 'bg-white/10 border-white/20' : 'bg-white border-gray-200'
              } ${approvalFilter === 'approved' ? 'ring-2 ring-green-500' : ''}`}
            >
              <div className={`p-3 flex items-center justify-between ${isDarkMode ? '' : 'bg-green-50'}`}>
                <div>
                  <p className={`text-[10px] font-semibold uppercase tracking-wider ${isDarkMode ? 'text-green-300' : 'text-green-600'}`}>Aprobate</p>
                  <p className={`text-lg font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{(stats?.approved ?? 0).toLocaleString()}</p>
                </div>
                <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${isDarkMode ? 'bg-green-500/30' : 'bg-green-500'}`}>
                  <i className={`text-lg ${isDarkMode ? 'ri-checkbox-circle-line text-green-300' : 'ri-checkbox-circle-line text-white'}`}></i>
                </div>
              </div>
            </div>
            <div
              onClick={() => { setApprovalFilter('rejected'); setPage(1); }}
              className={`rounded-lg border overflow-hidden transition-all cursor-pointer ${
                isDarkMode ? 'bg-white/10 border-white/20' : 'bg-white border-gray-200'
              } ${approvalFilter === 'rejected' ? 'ring-2 ring-red-500' : ''}`}
            >
              <div className={`p-3 flex items-center justify-between ${isDarkMode ? '' : 'bg-red-50'}`}>
                <div>
                  <p className={`text-[10px] font-semibold uppercase tracking-wider ${isDarkMode ? 'text-red-300' : 'text-red-600'}`}>Respinse</p>
                  <p className={`text-lg font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{(stats?.rejected ?? 0).toLocaleString()}</p>
                </div>
                <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${isDarkMode ? 'bg-red-500/30' : 'bg-red-500'}`}>
                  <i className={`text-lg ${isDarkMode ? 'ri-close-circle-line text-red-300' : 'ri-close-circle-line text-white'}`}></i>
                </div>
              </div>
            </div>
          </div>

        {/* Results Count + Pagination - compact */}
        <div className={`mb-4 flex flex-wrap items-center justify-between gap-2 text-sm ${
          isDarkMode ? 'text-gray-400' : 'text-gray-600'
        }`}>
          <div className="flex flex-col gap-2 min-w-0 flex-1">
            <span className="font-medium">
              {totalCount.toLocaleString()} produse
            </span>
            {filteredProducts.length > 0 && (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-xs">
                <label
                  className={`inline-flex items-center gap-2 cursor-pointer select-none ${
                    isDarkMode ? 'text-gray-300' : 'text-gray-700'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={allOnPageSelected}
                    ref={(el) => {
                      if (el) el.indeterminate = someOnPageSelected && !allOnPageSelected;
                    }}
                    onChange={toggleSelectAllOnPage}
                    className="rounded border-gray-400"
                  />
                  Selectează tot pe pagină ({filteredProducts.length})
                </label>
                {selectedProductIds.length > 0 && (
                  <>
                    <span className={isDarkMode ? 'text-gray-500' : 'text-gray-500'}>
                      {selectedProductIds.length} selectat(e)
                    </span>
                    <button
                      type="button"
                      onClick={clearProductSelection}
                      className={isDarkMode ? 'text-blue-400 hover:underline' : 'text-blue-600 hover:underline'}
                    >
                      Anulează selecția
                    </button>
                    <button
                      type="button"
                      disabled={isBulkDeleting || deletingProductId !== null}
                      onClick={deleteBulkProducts}
                      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded font-medium text-white disabled:opacity-50 ${
                        isDarkMode ? 'bg-red-600 hover:bg-red-500' : 'bg-red-600 hover:bg-red-700'
                      }`}
                    >
                      {isBulkDeleting ? (
                        <span className="animate-pulse">Se șterge...</span>
                      ) : (
                        <>
                          <i className="ri-delete-bin-line" />
                          Șterge selectate
                        </>
                      )}
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
          {totalCount > 0 && (
            <UserProductsPaginationControls
              isDarkMode={isDarkMode}
              totalCount={totalCount}
              totalPages={totalPages}
              page={page}
              pageSize={pageSize}
              isLoading={isLoading}
              onPageChange={setPage}
              onPageSizeChange={(s) => {
                setPageSize(s);
                setPage(1);
              }}
            />
          )}
        </div>

        {/* Products Grid - compact */}
        {isLoading ? (
          <div className={`text-center py-12 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mb-2"></div>
            <p className="text-sm">Se încarcă...</p>
          </div>
        ) : filteredProducts.length === 0 ? (
          <div className={`text-center py-10 rounded-xl text-sm ${isDarkMode ? 'bg-white/5 text-gray-400' : 'bg-gray-100 text-gray-600'}`}>
            {totalCount === 0 ? (
              <>Nu există produse.</>
            ) : (
              <>Nu s-au găsit produse. Modifică filtrele.</>
            )}
          </div>
        ) : (
          <>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2 space-y-4">
              {filteredProducts.map((product) => {
                const firstImage = product.images && product.images.length > 0 ? product.images[0] : null;
                const imageSrc = firstImage && typeof firstImage === 'string' ? firstImage : 
                  (firstImage && typeof firstImage === 'object' && 'url' in firstImage ? firstImage.url : null);
                
                return (
                  <div
                    key={product.id}
                    className={`border rounded-lg overflow-hidden transition-all ${
                      isDarkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'
                    }`}
                  >
                    <div className="flex flex-col lg:flex-row">
                      <div className="lg:w-[32%] shrink-0 flex gap-1">
                        <div className="flex items-start pt-2 pl-2 shrink-0">
                          <input
                            type="checkbox"
                            checked={selectedProductIds.includes(product.id)}
                            onChange={() => toggleProductSelected(product.id)}
                            disabled={isBulkDeleting}
                            className="rounded border-gray-400 mt-0.5"
                            aria-label={`Selectează ${product.title}`}
                            onClick={(e) => e.stopPropagation()}
                          />
                        </div>
                        <div className="flex-1 min-w-0">
                        {imageSrc ? (
                          <div
                            className={`relative aspect-square cursor-pointer ${isDarkMode ? 'bg-gray-800' : 'bg-gray-100'}`}
                            onClick={() => handleViewProduct(product)}
                          >
                            <img src={imageSrc} alt={product.title} className="w-full h-full object-cover" />
                          </div>
                        ) : (
                          <div className={`aspect-square flex items-center justify-center ${isDarkMode ? 'bg-gray-800' : 'bg-gray-100'}`}>
                            <i className={`text-4xl ${isDarkMode ? 'ri-image-line text-gray-600' : 'ri-image-line text-gray-400'}`}></i>
                          </div>
                        )}
                        </div>
                      </div>
                      <div className="lg:w-[68%] p-3 flex flex-col justify-between min-w-0">
                        <div>
                          <h3 className={`text-sm font-medium leading-tight mb-2 line-clamp-2 ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                            {product.title}
                          </h3>
                          <div className="flex items-center gap-2 mb-2 flex-wrap">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${isDarkMode ? 'bg-blue-500/30 text-blue-300' : 'bg-blue-500 text-white'}`}>
                              {product.category}
                            </span>
                            <span className={`text-[10px] ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                              {formatDate(product.createdAt)}
                            </span>
                          </div>
                          <div className={`flex items-center gap-2 p-2 rounded mb-2 ${isDarkMode ? 'bg-gray-700/50' : 'bg-gray-50'}`}>
                            <i className="ri-user-line text-blue-500 text-xs"></i>
                            <span className={`text-xs truncate ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                              {product.userEmail || 'N/A'}
                              {product.userFirstName && product.userLastName && ` · ${product.userFirstName} ${product.userLastName}`}
                            </span>
                          </div>
                          <div className={`flex items-center gap-2 p-2 rounded mb-2 ${isDarkMode ? 'bg-yellow-500/10' : 'bg-yellow-50'}`}>
                            <span className={`text-sm font-bold ${isDarkMode ? 'text-yellow-400' : 'text-yellow-600'}`}>
                              {formatPrice(product.startingPrice, product.currency)}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 mb-2 flex-wrap">
                            <span className={`inline-flex px-1.5 py-0.5 text-[10px] font-semibold rounded ${
                              product.status === 'draft' ? 'bg-yellow-100 text-yellow-800' : 'bg-green-100 text-green-800'
                            }`}>{product.status === 'draft' ? 'Draft' : 'Activ'}</span>
                            <span className={`inline-flex px-1.5 py-0.5 text-[10px] font-semibold rounded ${
                              product.approvalStatus === 'pending' ? 'bg-yellow-100 text-yellow-800'
                                : product.approvalStatus === 'approved' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                            }`}>
                              {product.approvalStatus === 'pending' ? 'În așteptare' : product.approvalStatus === 'approved' ? 'Aprobat' : 'Respins'}
                            </span>
                            {typeof product.riskScore === 'number' && (
                              <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-semibold rounded ${
                                product.riskScore > 70 ? 'bg-red-100 text-red-800' : product.riskScore > 50 ? 'bg-orange-100 text-orange-800' : 'bg-green-100 text-green-800'
                              }`}>Risc {product.riskScore}</span>
                            )}
                          </div>
                          {product.approvalStatus === 'rejected' && product.rejectionReason && (
                            <div className={`mb-2 p-1.5 rounded text-[10px] ${isDarkMode ? 'bg-red-500/10 text-red-300' : 'bg-red-50 text-red-700'}`}>
                              {product.rejectionReason}
                            </div>
                          )}
                        </div>
                        <div className="flex gap-1.5 mt-2 flex-wrap">
                          {product.approvalStatus === 'pending' && (
                            <>
                              <button onClick={() => handleViewProduct(product)} className="px-2.5 py-1.5 bg-blue-600 text-white rounded text-xs font-medium hover:bg-blue-700"><i className="ri-eye-line mr-1"></i>Vezi</button>
                              <button onClick={() => handleRiskAnalysis(product)} className="px-2.5 py-1.5 bg-red-600 text-white rounded text-xs font-medium hover:bg-red-700 disabled:opacity-50" disabled={isLoadingRisk && selectedProductForRisk?.id === product.id}>
                                {isLoadingRisk && selectedProductForRisk?.id === product.id ? '...' : <><i className="ri-shield-line mr-1"></i>Risk</>}
                              </button>
                              <button onClick={() => handleApproveProduct(product.id)} className="px-2.5 py-1.5 bg-green-600 text-white rounded text-xs font-medium hover:bg-green-700"><i className="ri-check-line mr-1"></i>Aprobă</button>
                              <button onClick={() => handleRejectProduct(product)} className="px-2.5 py-1.5 bg-red-600 text-white rounded text-xs font-medium hover:bg-red-700"><i className="ri-close-line mr-1"></i>Respinge</button>
                              <button
                                onClick={() => deleteProduct(product.id)}
                                disabled={deletingProductId === product.id}
                                className={`px-2.5 py-1.5 rounded text-xs font-medium ${isDarkMode ? 'bg-gray-700 hover:bg-red-600/80 text-red-300' : 'bg-gray-100 hover:bg-red-100 text-red-600'}`}
                                title="Șterge"
                              >
                                {deletingProductId === product.id ? <span className="animate-pulse">...</span> : <i className="ri-delete-bin-line"></i>}
                              </button>
                            </>
                          )}
                          {product.approvalStatus !== 'pending' && (
                            <>
                              <button onClick={() => handleViewProduct(product)} className="px-2.5 py-1.5 bg-blue-600 text-white rounded text-xs font-medium hover:bg-blue-700"><i className="ri-eye-line mr-1"></i>Vezi</button>
                              <button onClick={() => handleRiskAnalysis(product)} className="px-2.5 py-1.5 bg-red-600 text-white rounded text-xs font-medium hover:bg-red-700 disabled:opacity-50" disabled={isLoadingRisk && selectedProductForRisk?.id === product.id}>
                                {isLoadingRisk && selectedProductForRisk?.id === product.id ? '...' : <><i className="ri-shield-line mr-1"></i>Risk</>}
                              </button>
                              {product.approvalStatus === 'rejected' && (
                                <button onClick={() => handlePendingProduct(product.id)} className="px-2.5 py-1.5 bg-yellow-600 text-white rounded text-xs font-medium hover:bg-yellow-700">
                                  <i className="ri-refresh-line mr-1"></i>Răzgândire
                                </button>
                              )}
                              <button
                                onClick={() => deleteProduct(product.id)}
                                disabled={deletingProductId === product.id}
                                className={`px-2.5 py-1.5 rounded text-xs font-medium ${isDarkMode ? 'bg-gray-700 hover:bg-red-600/80 text-red-300' : 'bg-gray-100 hover:bg-red-100 text-red-600'}`}
                                title="Șterge"
                              >
                                {deletingProductId === product.id ? <span className="animate-pulse">...</span> : <i className="ri-delete-bin-line"></i>}
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Right Column - Stats - compact */}
            <div className="lg:col-span-1">
              <div className={`border rounded-lg p-3 sticky top-20 ${isDarkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
                <h3 className={`text-sm font-semibold mb-3 ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                  Statistici
                </h3>
                <div className="space-y-1.5">
                  <div className={`p-2 rounded flex justify-between items-center ${isDarkMode ? 'bg-gray-700/50' : 'bg-gray-50'}`}>
                    <span className={`text-[10px] ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>Total</span>
                    <span className={`text-sm font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{(stats?.all ?? totalCount).toLocaleString()}</span>
                  </div>
                  <div className={`p-2 rounded flex justify-between items-center ${isDarkMode ? 'bg-yellow-500/10' : 'bg-yellow-50'}`}>
                    <span className={`text-[10px] ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>În așteptare</span>
                    <span className={`text-sm font-bold ${isDarkMode ? 'text-yellow-400' : 'text-yellow-600'}`}>{(stats?.pending ?? 0).toLocaleString()}</span>
                  </div>
                  <div className={`p-2 rounded flex justify-between items-center ${isDarkMode ? 'bg-green-500/10' : 'bg-green-50'}`}>
                    <span className={`text-[10px] ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>Aprobate</span>
                    <span className={`text-sm font-bold ${isDarkMode ? 'text-green-400' : 'text-green-600'}`}>{(stats?.approved ?? 0).toLocaleString()}</span>
                  </div>
                  <div className={`p-2 rounded flex justify-between items-center ${isDarkMode ? 'bg-red-500/10' : 'bg-red-50'}`}>
                    <span className={`text-[10px] ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>Respinse</span>
                    <span className={`text-sm font-bold ${isDarkMode ? 'text-red-400' : 'text-red-600'}`}>{(stats?.rejected ?? 0).toLocaleString()}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
          {totalCount > 0 && (
            <div
              className={`mt-6 pt-4 border-t ${
                isDarkMode ? "border-gray-700" : "border-gray-200"
              }`}
            >
              <UserProductsPaginationControls
                align="end"
                isDarkMode={isDarkMode}
                totalCount={totalCount}
                totalPages={totalPages}
                page={page}
                pageSize={pageSize}
                isLoading={isLoading}
                onPageChange={setPage}
                onPageSizeChange={(s) => {
                  setPageSize(s);
                  setPage(1);
                }}
              />
            </div>
          )}
          </>
        )}

        {/* Risk Analysis Modal */}
        {showRiskModal && selectedProductForRisk && (
          <div className="fixed inset-0 flex items-center justify-center p-4 z-50 pointer-events-none">
            <div 
              className="max-w-4xl w-full max-h-[90vh] overflow-y-auto bg-white rounded-lg shadow-2xl border-2 border-gray-200 pointer-events-auto"
            >
              <div className="p-6">
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-2xl font-bold text-gray-900">
                    Analiză de Risc AI - {selectedProductForRisk.title}
                  </h2>
                  <button
                    onClick={() => {
                      setShowRiskModal(false);
                      setSelectedProductForRisk(null);
                      setRiskAnalysis(null);
                    }}
                    className="text-gray-500 hover:text-gray-700"
                  >
                    <i className="ri-close-line text-2xl"></i>
                  </button>
                </div>

                {isLoadingRisk ? (
                  <div className="text-center py-12">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
                    <p className="text-gray-600">Se analizează riscul...</p>
                  </div>
                ) : riskAnalysis ? (
                  <div className="space-y-6">
                    {/* User Information */}
                    <div className="bg-gray-50 rounded-lg p-4">
                      <h3 className="text-lg font-semibold text-gray-900 mb-4">
                        Informații Utilizator
                      </h3>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <p className="text-sm text-gray-600">Nume</p>
                          <p className="font-medium text-gray-900">
                            {riskAnalysis.userData?.firstName} {riskAnalysis.userData?.lastName}
                          </p>
                        </div>
                        <div>
                          <p className="text-sm text-gray-600">Email</p>
                          <p className="font-medium text-gray-900">
                            {riskAnalysis.userData?.email}
                          </p>
                        </div>
                        <div>
                          <p className="text-sm text-gray-600">Telefon</p>
                          <p className="font-medium text-gray-900">
                            {riskAnalysis.userData?.phone || 'N/A'}
                          </p>
                        </div>
                        <div>
                          <p className="text-sm text-gray-600">IP Address</p>
                          <p className="font-medium text-gray-900">
                            {riskAnalysis.userData?.ipAddress || 'N/A'}
                          </p>
                        </div>
                        <div>
                          <p className="text-sm text-gray-600">Data înregistrării</p>
                          <p className="font-medium text-gray-900">
                            {riskAnalysis.userData?.registrationDate || 'N/A'}
                          </p>
                        </div>
                        <div>
                          <p className="text-sm text-gray-600">Ultima autentificare</p>
                          <p className="font-medium text-gray-900">
                            {riskAnalysis.userData?.lastLogin || 'N/A'}
                          </p>
                        </div>
                        <div>
                          <p className="text-sm text-gray-600">Total produse</p>
                          <p className="font-medium text-gray-900">
                            {riskAnalysis.userData?.totalProducts || 0}
                          </p>
                        </div>
                        <div>
                          <p className="text-sm text-gray-600">Produse aprobate</p>
                          <p className="font-medium text-green-600">
                            {riskAnalysis.userData?.approvedProducts || 0}
                          </p>
                        </div>
                        <div>
                          <p className="text-sm text-gray-600">Produse respinse</p>
                          <p className="font-medium text-red-600">
                            {riskAnalysis.userData?.rejectedProducts || 0}
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Risk Score */}
                    <div className={`rounded-lg p-6 ${
                      riskAnalysis.riskAnalysis?.riskScore >= 70
                        ? 'bg-red-50 border-2 border-red-200'
                        : riskAnalysis.riskAnalysis?.riskScore >= 40
                        ? 'bg-yellow-50 border-2 border-yellow-200'
                        : 'bg-green-50 border-2 border-green-200'
                    }`}>
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="text-lg font-semibold text-gray-900">
                          Scor de Risc
                        </h3>
                        <div className={`text-4xl font-bold ${
                          riskAnalysis.riskAnalysis?.riskScore >= 70
                            ? 'text-red-600'
                            : riskAnalysis.riskAnalysis?.riskScore >= 40
                            ? 'text-yellow-600'
                            : 'text-green-600'
                        }`}>
                          {riskAnalysis.riskAnalysis?.riskScore || 0}/100
                        </div>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-4 mb-4">
                        <div
                          className={`h-4 rounded-full ${
                            riskAnalysis.riskAnalysis?.riskScore >= 70
                              ? 'bg-red-600'
                              : riskAnalysis.riskAnalysis?.riskScore >= 40
                              ? 'bg-yellow-600'
                              : 'bg-green-600'
                          }`}
                          style={{ width: `${riskAnalysis.riskAnalysis?.riskScore || 0}%` }}
                        ></div>
                      </div>
                      <p className={`text-sm font-medium ${
                        riskAnalysis.riskAnalysis?.riskScore >= 70
                          ? 'text-red-800'
                          : riskAnalysis.riskAnalysis?.riskScore >= 40
                          ? 'text-yellow-800'
                          : 'text-green-800'
                      }`}>
                        {riskAnalysis.riskAnalysis?.riskScore >= 70
                          ? '⚠️ RISC RIDICAT - Verificare manuală recomandată'
                          : riskAnalysis.riskAnalysis?.riskScore >= 40
                          ? '⚡ RISC MODERAT - Atenție la detalii'
                          : '✅ RISC SCĂZUT - Pare sigur'}
                      </p>
                    </div>

                    {/* Recommendation */}
                    <div className={`rounded-lg p-4 border-2 ${
                      riskAnalysis.riskAnalysis?.recommendation === 'APROBĂ'
                        ? 'bg-green-50 border-green-200'
                        : riskAnalysis.riskAnalysis?.recommendation === 'RESPINGE'
                        ? 'bg-red-50 border-red-200'
                        : 'bg-yellow-50 border-yellow-200'
                    }`}>
                      <h3 className="text-lg font-semibold text-gray-900 mb-2">
                        Recomandare AI
                      </h3>
                      <p className={`text-xl font-bold mb-2 ${
                        riskAnalysis.riskAnalysis?.recommendation === 'APROBĂ'
                          ? 'text-green-700'
                          : riskAnalysis.riskAnalysis?.recommendation === 'RESPINGE'
                          ? 'text-red-700'
                          : 'text-yellow-700'
                      }`}>
                        {riskAnalysis.riskAnalysis?.recommendation || 'REVIZUIRE MANUALĂ'}
                      </p>
                      <p className="text-sm text-gray-700">
                        {riskAnalysis.riskAnalysis?.details || 'Nu sunt disponibile detalii.'}
                      </p>
                    </div>

                    {/* Risk Factors */}
                    {riskAnalysis.riskAnalysis?.riskFactors && riskAnalysis.riskAnalysis.riskFactors.length > 0 && (
                      <div className="bg-gray-50 rounded-lg p-4">
                        <h3 className="text-lg font-semibold text-gray-900 mb-4">
                          Factori de Risc Identificați
                        </h3>
                        <ul className="space-y-2">
                          {riskAnalysis.riskAnalysis.riskFactors.map((factor: string, index: number) => (
                            <li key={index} className="flex items-start gap-2">
                              <i className="ri-alert-line text-red-500 mt-1"></i>
                              <span className="text-sm text-gray-700">{factor}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Flags */}
                    {riskAnalysis.riskAnalysis?.flags && (
                      <div className="bg-gray-50 rounded-lg p-4">
                        <h3 className="text-lg font-semibold text-gray-900 mb-4">
                          Steaguri de Atenție
                        </h3>
                        <div className="grid grid-cols-2 gap-4">
                          {Object.entries(riskAnalysis.riskAnalysis.flags).map(([key, value]) => (
                            <div key={key} className="flex items-center gap-2">
                              {value ? (
                                <i className="ri-error-warning-fill text-red-500"></i>
                              ) : (
                                <i className="ri-checkbox-circle-fill text-green-500"></i>
                              )}
                              <span className="text-sm text-gray-700">
                                {key === 'suspiciousEmail' && 'Email suspect'}
                                {key === 'suspiciousPrice' && 'Preț suspect'}
                                {key === 'incompleteData' && 'Date incomplete'}
                                {key === 'newUser' && 'Utilizator nou'}
                                {key === 'previousRejections' && 'Respingeri anterioare'}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Actions */}
                    <div className="flex gap-3 pt-4 border-t border-gray-200">
                      <button
                        onClick={() => handleViewProduct(selectedProductForRisk)}
                        className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold transition-colors"
                      >
                        <i className="ri-eye-line mr-2"></i>
                        Vezi Produs
                      </button>
                      <button
                        onClick={() => {
                          handleApproveProduct(selectedProductForRisk.id);
                          setShowRiskModal(false);
                        }}
                        className="flex-1 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-semibold transition-colors"
                      >
                        <i className="ri-check-line mr-2"></i>
                        Aprobă
                      </button>
                      <button
                        onClick={() => {
                          setShowRiskModal(false);
                          handleRejectProduct(selectedProductForRisk);
                        }}
                        className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-semibold transition-colors"
                      >
                        <i className="ri-close-line mr-2"></i>
                        Respinge
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-12">
                    <p className="text-gray-600">
                      Nu s-au putut încărca datele analizei de risc.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Reject Product Modal */}
        {showRejectModal && selectedProductForReject && (
          <div className="fixed inset-0 flex items-center justify-center p-4 z-50 pointer-events-none">
            <div className="max-w-md w-full bg-white rounded-lg shadow-2xl border-2 border-gray-200 pointer-events-auto">
              <div className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-2xl font-bold text-gray-900">
                    Respinge Produs
                  </h2>
                  <button
                    onClick={() => {
                      setShowRejectModal(false);
                      setSelectedProductForReject(null);
                      setRejectionReason('');
                    }}
                    className="text-gray-500 hover:text-gray-700"
                  >
                    <i className="ri-close-line text-2xl"></i>
                  </button>
                </div>

                <div className="mb-4">
                  <p className="text-gray-700 mb-2">
                    Produs: <span className="font-semibold">{selectedProductForReject.title}</span>
                  </p>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Introduceți motivul respingerii (opțional):
                  </label>
                  <textarea
                    value={rejectionReason}
                    onChange={(e) => setRejectionReason(e.target.value)}
                    placeholder="Motivul respingerii..."
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent resize-none"
                    rows={4}
                  />
                </div>

                <div className="flex gap-3 pt-4 border-t border-gray-200">
                  <button
                    onClick={() => {
                      setShowRejectModal(false);
                      setSelectedProductForReject(null);
                      setRejectionReason('');
                    }}
                    className="flex-1 px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-800 rounded-lg font-semibold transition-colors"
                  >
                    Anulează
                  </button>
                  <button
                    onClick={confirmRejectProduct}
                    className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-semibold transition-colors"
                  >
                    Respinge
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}




