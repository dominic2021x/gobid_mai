"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

interface Product {
  id: string;
  title: string;
  description: string;
  category: string;
  subcategory: string;
  sku: string;
  startingPrice: number;
  productType?: 'live-bid' | 'details-only';
  currency: 'RON' | 'EUR';
  customFields: Record<string, any>;
  seo: {
    title: string;
    description: string;
    keywords: string[];
  };
  status: 'deleted';
  images: (string | { type: 'zip'; url?: string })[];
  createdAt: string;
  updatedAt: string;
  url?: string;
  slug?: string;
}

export default function DeletedProductsPage() {
  const router = useRouter();
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedProducts, setSelectedProducts] = useState<string[]>([]);
  const selectedRef = useRef<string[]>([]);
  selectedRef.current = selectedProducts;
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [isRestoring, setIsRestoring] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

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
      productType: row.product_type ?? 'live-bid',
      currency: row.currency === 'EUR' ? 'EUR' : 'RON',
      customFields,
      seo,
      status: 'deleted',
      images,
      createdAt: row.created_at ?? new Date().toISOString(),
      updatedAt: row.updated_at ?? row.created_at ?? new Date().toISOString(),
      url: row.url ?? undefined,
      slug: row.slug ?? undefined,
    };
  }, []);

  const loadProducts = useCallback(async () => {
    setIsLoading(true);
    try {
      const BATCH_SIZE = 1000;
      const allRows: any[] = [];
      let from = 0;
      let hasMore = true;

      while (hasMore) {
        const { data, error } = await supabase
          .from('products')
          .select('*')
          .eq('status', 'deleted')
          .order('updated_at', { ascending: false })
          .range(from, from + BATCH_SIZE - 1);

        if (error) {
          throw error;
        }
        const batch = data ?? [];
        allRows.push(...batch);
        hasMore = batch.length === BATCH_SIZE;
        from += BATCH_SIZE;
      }

      const mapped = allRows.map(mapSupabaseProduct);
      setProducts(mapped);
    } catch (error) {
      console.error('❌ Eroare la încărcarea produselor șterse:', error);
      setProducts([]);
      setMessage({
        type: 'error',
        text: 'Nu am putut încărca lista produselor șterse din Supabase.',
      });
      setTimeout(() => setMessage(null), 4000);
    } finally {
      setIsLoading(false);
    }
  }, [mapSupabaseProduct]);

  useEffect(() => {
    loadProducts();
  }, [loadProducts]);

  const handleSelectAll = () => {
    if (selectedProducts.length === products.length) {
      setSelectedProducts([]);
    } else {
      setSelectedProducts(products.map(p => p.id));
    }
  };

  const handleSelectProduct = (productId: string) => {
    setSelectedProducts(prev => 
      prev.includes(productId)
        ? prev.filter(id => id !== productId)
        : [...prev, productId]
    );
  };

  const handleRestore = async (status: 'active' | 'draft' = 'active', idsOverride?: string[]) => {
    const ids =
      idsOverride && idsOverride.length > 0
        ? idsOverride
        : products.filter((p) => selectedRef.current.includes(p.id)).map((p) => p.id);
    if (ids.length === 0) {
      setMessage({
        type: 'error',
        text: 'Te rog selectează cel puțin un produs pentru restaurare',
      });
      setTimeout(() => setMessage(null), 3000);
      return;
    }

    if (!confirm(`Sigur vrei să restaurezi ${ids.length} produs(e) cu status "${status}"?`)) {
      return;
    }

    setIsRestoring(true);
    setMessage(null);

    try {
      const response = await fetch('/api/admin/products/restore', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ productIds: ids, status }),
      });

      const result = await response.json();

      if (response.ok && result.success) {
        setMessage({
          type: 'success',
          text: result.message || `Restaurate cu succes ${result.restoredCount} produs(e)`,
        });
        setSelectedProducts((prev) => prev.filter((id) => !ids.includes(id)));
        await loadProducts();
      } else {
        throw new Error(result.error || 'Failed to restore products');
      }
    } catch (error: any) {
      console.error('Error restoring products:', error);
      setMessage({
        type: 'error',
        text: `Eroare la restaurare: ${error.message}`,
      });
    } finally {
      setIsRestoring(false);
      setTimeout(() => setMessage(null), 5000);
    }
  };

  const handlePermanentDelete = async (idsOverride?: string[]) => {
    const productIds =
      idsOverride && idsOverride.length > 0
        ? idsOverride.map((id) => String(id))
        : products.filter((p) => selectedRef.current.includes(p.id)).map((p) => p.id);
    if (productIds.length === 0) {
      setMessage({
        type: 'error',
        text: 'Te rog selectează cel puțin un produs pentru ștergere permanentă',
      });
      setTimeout(() => setMessage(null), 3000);
      return;
    }

    setIsDeleting(true);
    setMessage(null);

    const CHUNK_SIZE = 100;
    let totalDeleted = 0;

    try {
      for (let i = 0; i < productIds.length; i += CHUNK_SIZE) {
        const chunk = productIds.slice(i, i + CHUNK_SIZE);
        const response = await fetch('/api/admin/products/permanent-delete', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ productIds: chunk }),
        });

        const result = await response.json();

        if (!response.ok || !result.success) {
          throw new Error(result.error || 'Failed to permanently delete products');
        }
        totalDeleted += result.deletedCount ?? chunk.length;
      }

      setMessage({
        type: 'success',
        text: `Șterse permanent ${totalDeleted} produs(e)`,
      });
      setSelectedProducts((prev) => prev.filter((id) => !productIds.includes(id)));
      await loadProducts();
    } catch (error: any) {
      console.error('Error permanently deleting products:', error);
      setMessage({
        type: 'error',
        text: `Eroare la ștergere permanentă: ${error.message}`,
      });
    } finally {
      setIsDeleting(false);
      setTimeout(() => setMessage(null), 5000);
    }
  };

  const generateProductUrl = (product: Product): string => {
    if (product.url) {
      return product.url.replace(/^\/auctions\//, '/licitatii-publice/');
    }
    if (product.slug) {
      const productTypeRoutes: Record<string, string> = {
        'licitatii-publice': 'licitatii-publice',
        'live-bid': 'licitatii-live',
        'buy-now': 'cumpara-acum',
      };
      const productType = product.productType || 'produse';
      const route = productTypeRoutes[productType] || 'produse';
      return `/${route}/${product.slug}`;
    }
    return '#';
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <div>
            <button
              onClick={() => router.push('/admin/products')}
              className="mb-4 flex items-center gap-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
            >
              <i className="ri-arrow-left-line"></i>
              <span>Înapoi la Produse</span>
            </button>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
              Produse Șterse
            </h1>
            <p className="text-gray-600 dark:text-gray-400">
              Gestionează produsele șterse: restaurează sau șterge permanent
            </p>
          </div>
          <div className="w-16 h-16 bg-gradient-to-br from-red-500 to-red-600 rounded-xl flex items-center justify-center shadow-lg">
            <i className="ri-delete-bin-7-line text-white text-2xl"></i>
          </div>
        </div>

        {/* Message */}
        {message && (
          <div
            className={`mb-6 p-4 rounded-lg ${
              message.type === 'success'
                ? 'bg-green-50 dark:bg-green-900/20 text-green-800 dark:text-green-300'
                : 'bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-300'
            }`}
          >
            {message.text}
          </div>
        )}

        {/* Stats */}
        <div className="bg-gradient-to-r from-red-500 to-red-600 rounded-lg p-6 text-white mb-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-red-100 text-sm font-medium">TOTAL PRODUSE ȘTERSE</p>
              <p className="text-3xl font-bold">{products.length}</p>
            </div>
            <div className="w-12 h-12 bg-white/20 rounded-lg flex items-center justify-center">
              <i className="ri-delete-bin-7-line text-2xl"></i>
            </div>
          </div>
        </div>

        {/* Bulk Actions */}
        {selectedProducts.length > 0 && (
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-4 mb-6">
            <div className="flex items-center justify-between">
              <p className="text-sm text-gray-700 dark:text-gray-300">
                {selectedProducts.length} produs(e) selectat(e)
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => handleRestore('active')}
                  disabled={isRestoring || isDeleting}
                  className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-60 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {isRestoring ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                      <span>Se restaurează...</span>
                    </>
                  ) : (
                    <>
                      <i className="ri-arrow-go-back-line"></i>
                      <span>Restaurează ca Active</span>
                    </>
                  )}
                </button>
                <button
                  onClick={() => handleRestore('draft')}
                  disabled={isRestoring || isDeleting}
                  className="px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 transition-colors disabled:opacity-60 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {isRestoring ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                      <span>Se restaurează...</span>
                    </>
                  ) : (
                    <>
                      <i className="ri-arrow-go-back-line"></i>
                      <span>Restaurează ca Draft</span>
                    </>
                  )}
                </button>
                <button
                  onClick={() => handlePermanentDelete()}
                  disabled={isRestoring || isDeleting}
                  className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-60 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {isDeleting ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                      <span>Se șterg...</span>
                    </>
                  ) : (
                    <>
                      <i className="ri-delete-bin-7-line"></i>
                      <span>Șterge Permanent</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Products Table */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
          <div className="w-full overflow-x-auto">
            {isLoading ? (
              <div className="p-6 text-center text-gray-500 dark:text-gray-400">
                Se încarcă...
              </div>
            ) : products.length === 0 ? (
              <div className="p-6 text-center text-gray-500 dark:text-gray-400">
                <i className="ri-inbox-line text-4xl mb-4"></i>
                <p className="text-lg font-semibold mb-2">Nu există produse șterse</p>
                <p className="text-sm">Toate produsele sunt active sau draft.</p>
              </div>
            ) : (
              <table className="w-full min-w-[900px]">
                <thead className="bg-gray-800/50 dark:bg-gray-800/70 text-xs">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider w-10">
                      <input
                        type="checkbox"
                        checked={selectedProducts.length === products.length && products.length > 0}
                        onChange={handleSelectAll}
                        className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600"
                      />
                    </th>
                    <th className="px-4 py-3 text-left font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Produs
                    </th>
                    <th className="px-4 py-3 text-left font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Categorie
                    </th>
                    <th className="px-4 py-3 text-left font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Preț
                    </th>
                    <th className="px-4 py-3 text-left font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Șters la
                    </th>
                    <th className="px-4 py-3 text-left font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Acțiuni
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                  {products.map((product) => (
                    <tr
                      key={product.id}
                      className={selectedProducts.includes(product.id) ? 'bg-blue-50 dark:bg-blue-900/20' : ''}
                    >
                      <td className="px-4 py-4">
                        <input
                          type="checkbox"
                          checked={selectedProducts.includes(product.id)}
                          onChange={() => handleSelectProduct(product.id)}
                          className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600"
                        />
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex items-center">
                          {product.images && product.images.length > 0 && typeof product.images[0] === 'string' && (
                            <img
                              src={product.images[0]}
                              alt={product.title}
                              className="w-12 h-12 object-cover rounded-lg mr-3"
                            />
                          )}
                          <div>
                            <p className="font-medium text-gray-900 dark:text-white">{product.title}</p>
                            <p className="text-sm text-gray-500 dark:text-gray-400 line-clamp-1">
                              {product.description}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-4 text-sm text-gray-500 dark:text-gray-400">
                        {product.category}
                        {product.subcategory && (
                          <span className="text-gray-400 dark:text-gray-500"> / {product.subcategory}</span>
                        )}
                      </td>
                      <td className="px-4 py-4 text-sm font-medium text-gray-900 dark:text-white">
                        {product.startingPrice.toLocaleString('ro-RO')} {product.currency}
                      </td>
                      <td className="px-4 py-4 text-sm text-gray-500 dark:text-gray-400">
                        {new Date(product.updatedAt).toLocaleString('ro-RO')}
                      </td>
                      <td className="px-4 py-4 text-sm">
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleRestore('active', [product.id])}
                            className="text-green-600 hover:text-green-800 dark:text-green-400 dark:hover:text-green-300"
                            title="Restaurează ca Active"
                          >
                            <i className="ri-arrow-go-back-line"></i>
                          </button>
                          <button
                            onClick={() => handleRestore('draft', [product.id])}
                            className="text-yellow-600 hover:text-yellow-800 dark:text-yellow-400 dark:hover:text-yellow-300"
                            title="Restaurează ca Draft"
                          >
                            <i className="ri-draft-line"></i>
                          </button>
                          <button
                            onClick={() => handlePermanentDelete([String(product.id)])}
                            className="text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300"
                            title="Șterge Permanent"
                          >
                            <i className="ri-delete-bin-7-line"></i>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}






