"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
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
  productType?: 'live-bid' | 'details-only' | 'licitatii-publice' | 'buy-now'; // Tip produs (optional pentru compatibilitate cu produsele existente)
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
  url?: string; // URL-ul produsului (generat automat din titlu pentru SEO)
  slug?: string; // Slug-ul produsului (partea finală a URL-ului)
  anafPublicationDate?: string; // Data publicării ANAF (din anaf_licitatii sau customFields)
  userId?: string; // ID-ul utilizatorului care a creat produsul
  approvalStatus?: 'pending' | 'approved' | 'rejected'; // Statusul de aprobare
  rejectionReason?: string; // Motivul respingerii
  approvedAt?: string; // Data aprobării
  approvedBy?: string; // ID-ul admin-ului care a aprobat
  userEmail?: string; // Email-ul utilizatorului (pentru afișare)
  userFirstName?: string; // Prenumele utilizatorului
  userLastName?: string; // Numele utilizatorului
  userPhone?: string; // Telefonul utilizatorului
  userIpAddress?: string; // IP-ul utilizatorului
}

export default function ProductsPage() {
  const router = useRouter();
  const [products, setProducts] = useState<Product[]>([]);
  const [filterStatus, setFilterStatus] = useState<'all' | 'draft' | 'active'>('all');
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [filterSubcategory, setFilterSubcategory] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [selectedProducts, setSelectedProducts] = useState<string[]>([]);
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [editingUrlProductId, setEditingUrlProductId] = useState<string | null>(null);
  const [editingUrlValue, setEditingUrlValue] = useState<string>('');
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [pageSize, setPageSize] = useState(50);
  const [categoriesFromApi, setCategoriesFromApi] = useState<string[]>([]);
  const [subcategoriesFromApi, setSubcategoriesFromApi] = useState<string[]>([]);

  // Normalizează URL-uri vechi /auctions/ -> /licitatii-publice/
  const normalizeProductUrl = (url: string): string => {
    if (!url || typeof url !== 'string') return url;
    return url.replace(/^\/auctions\//, '/licitatii-publice/').replace(/^\/auctions$/, '/licitatii-publice');
  };

  // Helper function to generate URL from title
  const generateProductUrl = (product: Product): string => {
    if (product.url) {
      return normalizeProductUrl(product.url);
    }
    if (product.slug) {
      // Determină ruta bazat pe product_type
      const productTypeRoutes: Record<string, string> = {
        'licitatii-publice': 'licitatii-publice',
        'live-bid': 'live_bid',
        'buy-now': 'produs',
      };
      
      const productType = product.productType || 'produse';
      const route = productTypeRoutes[productType] || 'produse';
      return `/${route}/${product.slug}`;
    }
    // Generate slug from title if not exists
    const slug = product.title
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .substring(0, 50);
    
    const productTypeRoutes: Record<string, string> = {
      'licitatii-publice': 'licitatii-publice',
      'live-bid': 'licitatii-live',
      'buy-now': 'cumpara-acum',
    };
    
    const productType = product.productType || 'produse';
    const route = productTypeRoutes[productType] || 'produse';
    return `/${route}/${slug}`;
  };

  const mapSupabaseProduct = useCallback((row: any): Product => {
    const seo =
      row?.seo && typeof row.seo === 'object'
        ? {
            title: row.seo.title ?? '',
            description: row.seo.description ?? '',
            keywords: Array.isArray(row.seo.keywords) ? row.seo.keywords : [],
          }
        : { title: '', description: '', keywords: [] };

    const images = Array.isArray(row?.images) ? row.images : [];
    const customFields =
      row?.custom_fields && typeof row.custom_fields === 'object' ? row.custom_fields : {};

    // Extrage data de publicare ANAF
    let anafPublicationDate: string | undefined;
    
    // 1. Verifică dacă există în anaf_licitatii (join)
    if (row.anaf_licitatii && Array.isArray(row.anaf_licitatii) && row.anaf_licitatii.length > 0) {
      const licitatie = row.anaf_licitatii[0];
      anafPublicationDate = licitatie.data_licitatie || licitatie.created_at;
    }
    
    // 2. Verifică în customFields (poate fi salvată acolo)
    if (!anafPublicationDate) {
      anafPublicationDate = customFields.data_publicare || 
                           customFields.data_licitatie || 
                           customFields['Data publicare'] ||
                           customFields['Data licitație'] ||
                           customFields['Data publicată'];
    }
    
    // 3. Pentru produse ANAF, folosește created_at ca fallback (data când a fost importat)
    if (!anafPublicationDate && row.product_type === 'licitatii-publice') {
      anafPublicationDate = row.created_at;
    }

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
      customFields,
      seo,
      status: row.status === 'active' ? 'active' : row.status === 'deleted' ? 'deleted' : 'draft',
      images,
      createdAt: row.created_at ?? new Date().toISOString(),
      anafPublicationDate,
      url: (() => {
        const raw = row.url ?? (row.slug ? (() => {
          const productTypeRoutes: Record<string, string> = {
            'licitatii-publice': 'licitatii-publice',
            'live-bid': 'live_bid',
            'buy-now': 'produs',
          };
          const productType = row.product_type || 'produse';
          const route = productTypeRoutes[productType] || 'produse';
          return `/${route}/${row.slug}`;
        })() : undefined);
        return raw ? raw.replace(/^\/auctions\//, '/licitatii-publice/') : raw;
      })(),
      slug: row.slug ?? undefined,
      userId: row.user_id ?? undefined,
      approvalStatus: row.approval_status ?? 'approved',
      rejectionReason: row.rejection_reason ?? undefined,
      approvedAt: row.approved_at ?? undefined,
      approvedBy: row.approved_by ?? undefined,
      userEmail: row.user_email ?? undefined,
    };
  }, []);

  const loadProducts = useCallback(async (options?: { filterOptions?: boolean; resetPage?: boolean }) => {
    const currentPage = options?.resetPage ? 1 : page;
    if (options?.resetPage) setPage(1);
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('page', String(currentPage));
      params.set('pageSize', String(pageSize));
      if (searchTerm) params.set('search', searchTerm);
      if (filterStatus !== 'all') params.set('status', filterStatus);
      if (filterCategory !== 'all') params.set('category', filterCategory);
      if (filterSubcategory !== 'all') params.set('subcategory', filterSubcategory);
      if (options?.filterOptions) params.set('filterOptions', '1');

      const res = await fetch(`/api/admin/products?${params.toString()}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Eroare la încărcare');
      }
      const data = await res.json();
      setProducts((data.products ?? []) as Product[]);
      setTotalCount(data.total ?? 0);
      setPage(data.page ?? currentPage);
      if (data.categories) setCategoriesFromApi(data.categories);
      if (data.subcategories) setSubcategoriesFromApi(data.subcategories);
    } catch (error: any) {
      console.error('❌ Eroare la încărcarea produselor:', error);
      setProducts([]);
      setMessage({
        type: 'error',
        text: error?.message || 'Nu am putut încărca lista produselor.',
      });
      setTimeout(() => setMessage(null), 4000);
    } finally {
      setIsLoading(false);
    }
  }, [page, pageSize, searchTerm, filterStatus, filterCategory, filterSubcategory, mapSupabaseProduct]);

  const handleAddProduct = () => {
    router.push('/admin/add-product');
  };

  const handleEditProduct = (productId: string) => {
    router.push(`/admin/add-product?id=${productId}`);
  };

  useEffect(() => {
    loadProducts({ filterOptions: true });
  }, [loadProducts]);

  const categories = categoriesFromApi.length > 0 ? categoriesFromApi : Array.from(new Set(products.map(p => p.category))).filter(Boolean).sort();
  const subcategories =
    filterCategory === 'all'
      ? (subcategoriesFromApi.length > 0 ? subcategoriesFromApi : Array.from(new Set(products.map(p => p.subcategory))).filter(Boolean).sort())
      : Array.from(new Set(products.filter(p => p.category === filterCategory).map(p => p.subcategory))).filter(Boolean).sort();
  const filteredProducts = products;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const fromItem = totalCount === 0 ? 0 : (page - 1) * pageSize + 1;
  const toItem = Math.min(page * pageSize, totalCount);

  // Selection handlers
  const handleSelectAll = () => {
    if (selectedProducts.length === filteredProducts.length) {
      setSelectedProducts([]);
    } else {
      setSelectedProducts(filteredProducts.map(p => p.id));
    }
  };

  const handleSelectProduct = (productId: string) => {
    setSelectedProducts(prev => 
      prev.includes(productId)
        ? prev.filter(id => id !== productId)
        : [...prev, productId]
    );
  };

  const isProductSelected = (productId: string) => selectedProducts.includes(productId);

  // Batch actions
  const handleBatchStatusChange = async (newStatus: 'draft' | 'active') => {
    if (selectedProducts.length === 0) {
      alert('Te rog selectează cel puțin un produs!');
      return;
    }
    
    if (confirm(`Sigur vrei să schimbi statusul a ${selectedProducts.length} produse în ${newStatus === 'active' ? 'active' : 'draft'}?`)) {
      try {
        const { error } = await supabase
          .from('products')
          .update({ status: newStatus })
          .in('id', selectedProducts);

        if (error) {
          throw error;
        }

        setMessage({ type: 'success', text: 'Statusul produselor a fost actualizat.' });
        setSelectedProducts([]);
        await loadProducts();
      } catch (error) {
        console.error('Error updating product statuses:', error);
        setMessage({ type: 'error', text: 'Nu am putut actualiza statusul produselor.' });
      } finally {
        setTimeout(() => setMessage(null), 3000);
      }
    }
  };

  const handleBatchDelete = async () => {
    if (selectedProducts.length === 0) {
      alert('Te rog selectează cel puțin un produs!');
      return;
    }
    
    if (confirm(`Sigur vrei să ștergi ${selectedProducts.length} produs(e)? Această acțiune nu poate fi anulată.`)) {
      try {
        console.log('[Products] Attempting to delete products via API:', selectedProducts);
        
        // Folosește API route care folosește supabaseAdmin (bypass RLS)
        const response = await fetch('/api/admin/products/delete', {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ productIds: selectedProducts }),
        });

        const result = await response.json();

        if (!response.ok) {
          throw new Error(result.error || 'Failed to delete products');
        }

        console.log('[Products] Delete API response:', result);

        if (result.success && result.deletedCount > 0) {
          // Elimină produsele șterse din state imediat pentru feedback vizual
          setProducts(prev => prev.filter(p => !result.deletedIds.includes(p.id)));
          setMessage({ 
            type: 'success', 
            text: `${result.deletedCount} produs(e) au fost șterse cu succes.` 
          });
        } else {
          setMessage({ 
            type: 'error', 
            text: 'Nu s-au șters produse. Verifică permisiunile.' 
          });
        }
        
        setSelectedProducts([]);
        
        // Forțează reîncărcarea listei
        await loadProducts();
        
        // Reîncarcă din nou după un mic delay pentru a fi sigur
        setTimeout(async () => {
          await loadProducts();
        }, 500);
      } catch (error: any) {
        console.error('[Products] Error deleting products:', error);
        const errorMessage = error?.message || 'Eroare necunoscută';
        setMessage({ 
          type: 'error', 
          text: `Nu am putut șterge produsele: ${errorMessage}` 
        });
      } finally {
        setTimeout(() => setMessage(null), 5000);
      }
    }
  };

  const handleExportProducts = async () => {
    setIsExporting(true);
    try {
      const { data, error } = await supabase.from('products').select('*');
      if (error) {
        throw error;
      }
      const blob = new Blob([JSON.stringify(data ?? [], null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `produse-backup-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setMessage({ type: 'success', text: '✅ Produsele au fost exportate cu succes!' });
      setTimeout(() => setMessage(null), 3000);
    } catch (error) {
      console.error('Error exporting products:', error);
      setMessage({ type: 'error', text: '❌ Eroare la exportul produselor' });
      setTimeout(() => setMessage(null), 3000);
    } finally {
      setIsExporting(false);
    }
  };

  const handleImportProducts = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsImporting(true);
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);

      if (!Array.isArray(parsed)) {
        throw new Error('Fișierul importat trebuie să conțină un array de produse.');
      }

      const sanitized = parsed.map((item: any) => ({
        ...item,
        created_at: item?.created_at ?? new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }));

      const { error } = await supabase
        .from('products')
        .upsert(sanitized, { onConflict: 'id' });

      if (error) {
        throw error;
      }

      setMessage({ type: 'success', text: '✅ Produsele au fost importate cu succes din Supabase!' });
      await loadProducts();
      setTimeout(() => setMessage(null), 3000);
    } catch (error) {
      console.error('Error importing products:', error);
      setMessage({ type: 'error', text: '❌ Eroare la importul produselor. Verifică formatul fișierului.' });
      setTimeout(() => setMessage(null), 3000);
    } finally {
      setIsImporting(false);
      // Reset input
      event.target.value = '';
    }
  };

  const startEditProductUrl = (product: Product) => {
    setEditingUrlProductId(product.id);
    setEditingUrlValue(generateProductUrl(product));
  };

  const cancelEditProductUrl = () => {
    setEditingUrlProductId(null);
    setEditingUrlValue('');
  };

  const saveProductUrl = async (productId: string) => {
    let newUrl = editingUrlValue.trim().replace(/^\/auctions\//, '/licitatii-publice/');
    if (!newUrl) {
      setMessage({ type: 'error', text: 'URL-ul nu poate fi gol.' });
      setTimeout(() => setMessage(null), 3000);
      return;
    }

    try {
      const { error } = await supabase
        .from('products')
        .update({ url: newUrl })
        .eq('id', productId);

      if (error) {
        console.error('Eroare la actualizarea URL-ului produsului:', error);
        setMessage({ type: 'error', text: 'Nu am putut salva URL-ul produsului.' });
        setTimeout(() => setMessage(null), 3000);
        return;
      }

      // Actualizează URL-ul și în state-ul local
      setProducts(prev =>
        prev.map(p => (p.id === productId ? { ...p, url: newUrl } : p))
      );

      setMessage({ type: 'success', text: 'URL-ul produsului a fost actualizat.' });
      setTimeout(() => setMessage(null), 3000);
    } catch (error) {
      console.error('Unexpected error updating product URL:', error);
      setMessage({ type: 'error', text: 'Eroare neașteptată la salvarea URL-ului.' });
      setTimeout(() => setMessage(null), 3000);
    } finally {
      setEditingUrlProductId(null);
      setEditingUrlValue('');
    }
  };

  const deleteProduct = async (productId: string) => {
    if (confirm('Sigur vrei să ștergi acest produs? Această acțiune nu poate fi anulată.')) {
      try {
        console.log('[Products] Attempting to delete product via API:', productId);
        
        // Folosește API route care folosește supabaseAdmin (bypass RLS)
        const response = await fetch('/api/admin/products/delete', {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ productIds: [productId] }),
        });

        const result = await response.json();

        if (!response.ok) {
          throw new Error(result.error || 'Failed to delete product');
        }

        console.log('[Products] Delete API response:', result);

        if (result.success && result.deletedCount > 0) {
          // Elimină produsul din state imediat pentru feedback vizual
          setProducts(prev => prev.filter(p => p.id !== productId));
          setSelectedProducts(prev => prev.filter(id => id !== productId));
          
          setMessage({ type: 'success', text: 'Produsul a fost șters cu succes.' });
        } else {
          setMessage({ 
            type: 'error', 
            text: 'Produsul nu a fost șters. Verifică permisiunile.' 
          });
        }
        
        // Reîncarcă lista pentru a fi sigur
        await loadProducts();
        
        // Reîncarcă din nou după un mic delay
        setTimeout(async () => {
          await loadProducts();
        }, 500);
      } catch (error: any) {
        console.error('[Products] Error deleting product:', error);
        const errorMessage = error?.message || 'Eroare necunoscută';
        setMessage({ 
          type: 'error', 
          text: `Nu am putut șterge produsul: ${errorMessage}` 
        });
      } finally {
        setTimeout(() => setMessage(null), 5000);
      }
    }
  };

  const toggleProductStatus = async (productId: string) => {
    const product = products.find(p => p.id === productId);
    if (!product) return;

    const nextStatus: 'draft' | 'active' = product.status === 'draft' ? 'active' : 'draft';

    try {
      const { error } = await supabase
        .from('products')
        .update({ status: nextStatus })
        .eq('id', productId);

      if (error) {
        throw error;
      }

      setProducts(prev =>
        prev.map(p =>
          p.id === productId
            ? { ...p, status: nextStatus }
            : p
        )
      );
    } catch (error) {
      console.error('Error toggling status:', error);
      setMessage({ type: 'error', text: 'Nu am putut actualiza statusul produsului.' });
      setTimeout(() => setMessage(null), 3000);
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

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-6 lg:p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Produse</h1>
            <p className="text-gray-600">
              Gestionați produsele disponibile în sistem ({totalCount} produse)
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={handleExportProducts}
              disabled={isExporting || products.length === 0}
              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {isExporting ? '⏳ Export...' : '📥 Export Produse'}
            </button>
            <label className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2">
              {isImporting ? '⏳ Import...' : '📤 Import Produse'}
              <input
                type="file"
                accept=".json"
                onChange={handleImportProducts}
                disabled={isImporting}
                className="hidden"
              />
            </label>
            <button
              onClick={handleAddProduct}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
            >
              + Adaugă Produs
            </button>
          </div>
        </div>

        {/* Success/Error Message */}
        {message && (
          <div className={`mb-4 p-4 rounded-lg ${
            message.type === 'success' 
              ? 'bg-green-50 border border-green-200 text-green-800'
              : 'bg-red-50 border border-red-200 text-red-800'
          }`}>
            {message.text}
          </div>
        )}

        {isLoading && (
          <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg text-blue-700">
            Se încarcă lista produselor din Supabase...
          </div>
        )}

        {/* Warning if no products */}
        {products.length === 0 && !isLoading && (
          <div className="mb-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
            <div className="flex items-start space-x-3">
              <div className="text-yellow-600 text-xl">⚠️</div>
              <div>
                <h3 className="text-yellow-800 font-semibold mb-1">
                  Nu există produse în sistem
                </h3>
                <p className="text-yellow-700 text-sm">
                  Lista este goală în Supabase. Adaugă un produs nou sau importă un backup pentru a popula baza de date.
                </p>
              </div>
            </div>
          </div>
        )}


        {/* Filters and Batch Actions */}
        <div className="mb-6 space-y-4">
            {/* Search and Filters Row */}
            <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
              <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                {/* Search */}
                <div className="md:col-span-2">
                  <input
                    type="text"
                    placeholder="Caută produse..."
                    value={searchTerm}
                    onChange={(e) => { setSearchTerm(e.target.value); setPage(1); }}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-white text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                
                {/* Status Filter */}
                <div>
                  <select
                    value={filterStatus}
                    onChange={(e) => { setFilterStatus(e.target.value as 'all' | 'draft' | 'active'); setPage(1); }}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="all">Toate Statusurile</option>
                    <option value="active">Active</option>
                    <option value="draft">Draft</option>
                  </select>
                </div>
                
                {/* Category Filter */}
                <div>
                  <select
                    value={filterCategory}
                    onChange={(e) => {
                      setFilterCategory(e.target.value);
                      setFilterSubcategory('all');
                      setPage(1);
                    }}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="all">Toate Categoriile</option>
                    {categories.map(cat => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>
                
                {/* Subcategory Filter */}
                <div>
                  <select
                    value={filterSubcategory}
                    onChange={(e) => { setFilterSubcategory(e.target.value); setPage(1); }}
                    disabled={filterCategory === 'all'}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <option value="all">Toate Subcategoriile</option>
                    {subcategories.map(subcat => (
                      <option key={subcat} value={subcat}>{subcat}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Batch Actions Bar */}
            {selectedProducts.length > 0 && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <div className="flex items-center justify-between flex-wrap gap-4">
                  <div className="flex items-center space-x-2">
                    <span className="text-blue-700 font-semibold">
                      {selectedProducts.length} produs(e) selectat(e)
                    </span>
                    <button
                      onClick={() => setSelectedProducts([])}
                      className="text-sm text-blue-600 hover:underline"
                    >
                      Deselectează toate
                    </button>
                  </div>
                  <div className="flex items-center space-x-2 flex-wrap">
                    <button
                      onClick={() => handleBatchStatusChange('active')}
                      className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm font-medium"
                    >
                      Setează Active
                    </button>
                    <button
                      onClick={() => handleBatchStatusChange('draft')}
                      className="px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 transition-colors text-sm font-medium"
                    >
                      Setează Draft
                    </button>
                    <button
                      onClick={handleBatchDelete}
                      className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors text-sm font-medium"
                    >
                      Șterge Selectate
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

      {/* Stats Cards - Only show if products exist */}
      {products.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">
        <button
          onClick={() => setFilterStatus('all')}
          className={`bg-gradient-to-r from-blue-500 to-blue-600 rounded-lg p-6 text-white hover:from-blue-600 hover:to-blue-700 transition-all cursor-pointer ${
            filterStatus === 'all' ? 'ring-4 ring-blue-300' : ''
          }`}
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-blue-100 text-sm font-medium">TOTAL PRODUSE</p>
              <p className="text-3xl font-bold">{totalCount}</p>
            </div>
            <div className="w-12 h-12 bg-white/20 rounded-lg flex items-center justify-center">
              <i className="ri-shopping-bag-line text-2xl"></i>
            </div>
          </div>
        </button>
        
        <button
          onClick={() => setFilterStatus('active')}
          className={`bg-gradient-to-r from-green-500 to-green-600 rounded-lg p-6 text-white hover:from-green-600 hover:to-green-700 transition-all cursor-pointer ${
            filterStatus === 'active' ? 'ring-4 ring-green-300' : ''
          }`}
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-green-100 text-sm font-medium">PRODUSE ACTIVE</p>
              <p className="text-3xl font-bold">{products.filter(p => p.status === 'active').length}</p>
            </div>
            <div className="w-12 h-12 bg-white/20 rounded-lg flex items-center justify-center">
              <i className="ri-check-circle-line text-2xl"></i>
            </div>
          </div>
        </button>
        
        <button
          onClick={() => setFilterStatus('draft')}
          className={`bg-gradient-to-r from-yellow-500 to-yellow-600 rounded-lg p-6 text-white hover:from-yellow-600 hover:to-yellow-700 transition-all cursor-pointer ${
            filterStatus === 'draft' ? 'ring-4 ring-yellow-300' : ''
          }`}
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-yellow-100 text-sm font-medium">PRODUSE DRAFT</p>
              <p className="text-3xl font-bold">{products.filter(p => p.status === 'draft').length}</p>
            </div>
            <div className="w-12 h-12 bg-white/20 rounded-lg flex items-center justify-center">
              <i className="ri-draft-line text-2xl"></i>
            </div>
          </div>
        </button>

        <button
          onClick={() => router.push('/admin/products/deleted')}
          className="bg-gradient-to-r from-red-500 to-red-600 rounded-lg p-6 text-white hover:from-red-600 hover:to-red-700 transition-all cursor-pointer"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-red-100 text-sm font-medium">PRODUSE ȘTERSE</p>
              <p className="text-3xl font-bold">
                <i className="ri-delete-bin-line text-2xl mr-2"></i>
                Vezi
              </p>
            </div>
            <div className="w-12 h-12 bg-white/20 rounded-lg flex items-center justify-center">
              <i className="ri-delete-bin-7-line text-2xl"></i>
            </div>
          </div>
        </button>
        </div>
      )}

      {/* Products Table */}
      <div className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
        <div className="w-full overflow-x-auto">
          <table className="w-full min-w-[900px]">
            <thead className="bg-gray-100 text-xs">
              <tr>
                <th className="px-3 md:px-4 py-2 text-left font-medium text-gray-500 uppercase tracking-wider w-10">
                  <input
                    type="checkbox"
                    checked={selectedProducts.length === filteredProducts.length && filteredProducts.length > 0}
                    onChange={handleSelectAll}
                    className="w-4 h-4 text-blue-600 bg-white border-gray-300 rounded focus:ring-blue-500"
                  />
                </th>
                <th className="px-3 md:px-4 py-2 text-left font-medium text-gray-500 uppercase tracking-wider">
                  Produs
                </th>
                <th className="px-3 md:px-4 py-2 text-left font-medium text-gray-500 uppercase tracking-wider">
                  Categorie
                </th>
                <th className="px-3 md:px-4 py-2 text-left font-medium text-gray-500 uppercase tracking-wider">
                  Tip
                </th>
                <th className="px-3 md:px-4 py-2 text-left font-medium text-gray-500 uppercase tracking-wider">
                  Preț
                </th>
                <th className="px-3 md:px-4 py-2 text-left font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-3 md:px-4 py-2 text-left font-medium text-gray-500 uppercase tracking-wider">
                  Creat
                </th>
                <th className="px-4 md:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Acțiune</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredProducts.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-6 py-12 text-center">
                    <div className="text-4xl mb-4">📦</div>
                    <p className="text-gray-500">
                      {searchTerm ? 'Nu s-au găsit produse care să corespundă căutării.' : 'Nu există produse disponibile. Adaugă primul tău produs!'}
                    </p>
                  </td>
                </tr>
              ) : (
                <>
                  {filteredProducts.map((product) => (
                  <tr key={product.id} className="hover:bg-gray-50 text-sm">
                    <td className="px-3 md:px-4 py-3">
                      <input
                        type="checkbox"
                        checked={isProductSelected(product.id)}
                        onChange={() => handleSelectProduct(product.id)}
                        className="w-4 h-4 text-blue-600 bg-white border-gray-300 rounded focus:ring-blue-500"
                      />
                    </td>
                    <td className="px-3 md:px-4 py-3">
                      <div className="flex items-center min-w-0 gap-3">
                        {/* Product Image */}
                        <div className="w-16 h-16 md:w-20 md:h-20 flex-shrink-0 rounded-lg overflow-hidden bg-gray-200 border border-gray-300 shadow-sm">
                          {(() => {
                            const firstImage = product.images && product.images.length > 0 ? product.images[0] : null;
                            
                            // Check if it's a ZIP file
                            if (firstImage && typeof firstImage === 'object' && firstImage !== null && 'type' in firstImage && firstImage.type === 'zip') {
                              return (
                                <div className="w-full h-full flex items-center justify-center">
                                  <i className="ri-file-zip-line text-gray-400 text-2xl"></i>
                                </div>
                              );
                            }
                            
                            // Get image source
                            const imageSrc = typeof firstImage === 'string' ? firstImage : (firstImage && typeof firstImage === 'object' && 'url' in firstImage ? firstImage.url : null);
                            
                            return imageSrc ? (
                              <img 
                                src={imageSrc}
                                alt={product.title}
                                className="w-full h-full object-cover"
                                loading="lazy"
                                onError={(e) => {
                                  // Fallback to icon if image fails to load
                                  const target = e.target as HTMLImageElement;
                                  const parent = target.parentElement;
                                  if (parent) {
                                    target.style.display = 'none';
                                    if (!parent.querySelector('.ri-shopping-bag-line')) {
                                      const fallback = document.createElement('div');
                                      fallback.className = 'w-full h-full flex items-center justify-center';
                                      fallback.innerHTML = '<i class="ri-shopping-bag-line text-gray-400 text-2xl"></i>';
                                      parent.appendChild(fallback);
                                    }
                                  }
                                }}
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center">
                                <i className="ri-shopping-bag-line text-gray-400 text-2xl"></i>
                              </div>
                            );
                          })()}
                        </div>
                        <div className="min-w-0 flex-1">
                          <a
                            href={generateProductUrl(product)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm font-medium text-gray-900 truncate hover:text-blue-600 transition-colors cursor-pointer"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {product.title}
                          </a>
                          <div className="text-xs text-gray-500 line-clamp-2 max-w-md">
                            {product.description}
                          </div>
                          <div className="mt-1 flex items-center gap-2 flex-wrap">
                            {editingUrlProductId === product.id ? (
                              <>
                                <input
                                  type="text"
                                  value={editingUrlValue}
                                  onChange={(e) => setEditingUrlValue(e.target.value)}
                                  className="w-full md:w-72 px-2 py-1 text-xs border border-blue-300 rounded-md bg-white"
                                  onClick={(e) => e.stopPropagation()}
                                />
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    saveProductUrl(product.id);
                                  }}
                                  className="px-2 py-1 text-xs font-semibold rounded-md bg-green-600 text-white hover:bg-green-700"
                                >
                                  Salvează
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    cancelEditProductUrl();
                                  }}
                                  className="px-2 py-1 text-xs font-semibold rounded-md bg-gray-200 text-gray-700 hover:bg-gray-300"
                                >
                                  Anulează
                                </button>
                              </>
                            ) : (
                              <>
                                <a
                                  href={generateProductUrl(product)}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-xs text-blue-600 hover:underline inline-flex items-center gap-1 font-medium"
                                  onClick={(e) => e.stopPropagation()}
                                  title="Deschide în tab nou"
                                >
                                  <i className="ri-external-link-line"></i>
                                  <span className="break-all">{generateProductUrl(product)}</span>
                                </a>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    startEditProductUrl(product);
                                  }}
                                  className="text-xs font-semibold text-gray-600 hover:text-blue-600"
                                  title="Editează URL-ul produsului"
                                >
                                  Editare URL
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 md:px-4 py-3 text-sm text-gray-900">
                      <div className="max-w-xs truncate leading-tight">
                        <div className="font-medium">{product.category}</div>
                        <div className="text-xs text-gray-500">
                          {product.subcategory}
                        </div>
                      </div>
                    </td>
                    <td className="px-3 md:px-4 py-3 whitespace-nowrap">
                      <span
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-full ${
                          product.productType === 'licitatii-publice'
                            ? 'bg-blue-100 text-blue-800'
                            : product.productType === 'buy-now'
                            ? 'bg-green-100 text-green-800'
                            : 'bg-blue-100 text-blue-800'
                        }`}
                      >
                        <i
                          className={
                            product.productType === 'licitatii-publice'
                              ? 'ri-auction-line'
                              : product.productType === 'buy-now'
                              ? 'ri-shopping-cart-line'
                              : 'ri-hammer-line'
                          }
                        ></i>
                        {product.productType === 'licitatii-publice'
                          ? 'Licitații publice'
                          : product.productType === 'buy-now'
                          ? 'Cumpără acum'
                          : 'Live-bid'}
                      </span>
                    </td>
                    <td className="px-4 md:px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {formatPrice(product.startingPrice, product.currency)}
                    </td>
                    <td className="px-4 md:px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                        product.status === 'draft'
                          ? 'bg-yellow-100 text-yellow-800'
                          : 'bg-green-100 text-green-800'
                      }`}>
                        {product.status === 'draft' ? 'Draft' : 'Activ'}
                    </span>
                    </td>
                    <td className="px-3 md:px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                      {product.anafPublicationDate ? (
                        <span className="text-blue-600 font-medium">
                          {formatDate(product.anafPublicationDate)}
                        </span>
                      ) : (
                        <span className="text-gray-500">
                          {formatDate(product.createdAt)}
                        </span>
                      )}
                    </td>
                    <td className="px-3 md:px-4 py-3 text-sm font-medium">
                      <div className="flex items-center gap-2 flex-wrap">
                        <button
                          onClick={() => handleEditProduct(product.id)}
                          className="px-3 py-1.5 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white rounded-lg transition-all text-xs font-semibold flex items-center gap-1.5"
                          title="Editează produs"
                        >
                          <i className="ri-edit-line"></i>
                          <span className="hidden sm:inline">Editează</span>
                        </button>
                        <button
                          onClick={() => toggleProductStatus(product.id)}
                          className={`px-2 py-1.5 rounded-lg transition-all ${
                            product.status === 'draft'
                              ? 'bg-green-500 hover:bg-green-600 text-white'
                              : 'bg-yellow-500 hover:bg-yellow-600 text-white'
                          }`}
                          title={product.status === 'draft' ? 'Activează produs' : 'Dezactivează produs'}
                        >
                          <i className={product.status === 'draft' ? 'ri-check-line' : 'ri-close-line'}></i>
                        </button>
                        <button
                          onClick={() => deleteProduct(product.id)}
                          className="px-2 py-1.5 bg-red-500 hover:bg-red-600 text-white rounded-lg transition-all"
                          title="Șterge produs"
                        >
                          <i className="ri-delete-bin-line"></i>
                        </button>
                      </div>
                    </td>
                  </tr>
                  ))}
                </>
              )}
            </tbody>
          </table>
          </div>

          {/* Paginare */}
          {totalCount > 0 && (
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3 border-t border-gray-200 bg-gray-50/50">
              <div className="text-sm text-gray-600">
                {fromItem}–{toItem} din {totalCount}
              </div>
              <div className="flex items-center gap-3 flex-wrap">
                <label className="text-sm text-gray-600 flex items-center gap-2">
                  Pe pagină:
                  <select
                    value={pageSize}
                    onChange={(e) => {
                      setPageSize(Number(e.target.value));
                      setPage(1);
                    }}
                    className="px-2 py-1 rounded border border-gray-300 text-sm bg-white text-gray-900"
                  >
                    {[25, 50, 100, 250, 500].map((n) => (
                      <option key={n} value={n}>{n}</option>
                    ))}
                  </select>
                </label>
                <WheelPagination
                  totalPages={totalPages}
                  currentPage={page}
                  onPageChange={(p) => setPage(p)}
                  canGoNext={page < totalPages}
                  isDarkMode={false}
                />
              </div>
            </div>
          )}
      </div>

      {/* Product Detail Modal */}
      {selectedProduct && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="max-w-2xl w-full max-h-[90vh] overflow-y-auto bg-white rounded-lg shadow-xl">
            <div className="p-6">
              <div className="flex justify-between items-start mb-6">
                <h2 className="text-2xl font-bold text-gray-900">
                  {selectedProduct.title}
                </h2>
                <button
                  onClick={() => setSelectedProduct(null)}
                  className="p-2 hover:bg-gray-100 rounded-lg"
                >
                  <i className="ri-close-line text-xl"></i>
                </button>
              </div>

              <div className="space-y-6">
                <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm font-medium text-gray-500">Category</p>
                      <p className="text-gray-900">{selectedProduct.category} - {selectedProduct.subcategory}</p>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-500">Tip Produs</p>
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-full ${
                        (selectedProduct.productType || 'live-bid') === 'live-bid'
                          ? 'bg-blue-100 text-blue-800'
                          : 'bg-blue-100 text-blue-800'
                      }`}>
                        <i className={`${(selectedProduct.productType || 'live-bid') === 'live-bid' ? 'ri-hammer-line' : 'ri-information-line'}`}></i>
                        {(selectedProduct.productType || 'live-bid') === 'live-bid' ? 'Live Bid' : 'Produs Detalii'}
                      </span>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-500">Price</p>
                      <p className="text-xl font-bold text-gray-900">
                        {formatPrice(selectedProduct.startingPrice, selectedProduct.currency)}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-500">Status</p>
                      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                        selectedProduct.status === 'draft'
                          ? 'bg-yellow-100 text-yellow-800'
                          : 'bg-green-100 text-green-800'
                      }`}>
                        {selectedProduct.status === 'draft' ? 'Draft' : 'Active'}
                      </span>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-500">Created</p>
                      <p className="text-gray-900">{formatDate(selectedProduct.createdAt)}</p>
                    </div>
                </div>

                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-3">Description</h3>
                  <p className="text-gray-700">{selectedProduct.description}</p>
                </div>

                {Object.keys(selectedProduct.customFields).length > 0 && (
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-3">Specifications</h3>
                    <div className="grid grid-cols-2 gap-4">
                      {Object.entries(selectedProduct.customFields).map(([key, value]) => (
                        <div key={key}>
                          <p className="text-sm font-medium text-gray-500">
                            {key.replace(/_/g, ' ').replace(/\b\w/g, char => char.toUpperCase())}
                          </p>
                          <p className="text-gray-900">{value}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      </div>
    </div>
  );
}
