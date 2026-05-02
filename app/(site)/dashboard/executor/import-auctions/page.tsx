"use client";

import { dashboardApiFetch } from "@/lib/dashboard-api-fetch";
/**
 * Pagină Import GoBid AI pentru Executori
 * Permite importul automat de licitații din PDF, CSV și alte surse
 * cu procesare AI pentru extragere și creare automată de produse
 */

import React, { useState, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import UniversalHeader from '@/components/UniversalHeader';
import { BackButton } from '@/components/ui/back-button';
import DashboardFooter from '@/components/DashboardFooter';
import Hammer from '@/components/Hammer';

interface ImportRecord {
  id: string;
  source_type: 'pdf' | 'csv' | 'url' | 'other';
  source_url: string | null;
  file_name: string | null;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  error_message: string | null;
  created_at: string;
  updated_at: string;
  processed_at: string | null;
  products_created: number;
  products_data: any[] | null;
}

interface ExtractedProduct {
  title: string;
  description: string;
  category: string;
  subcategory?: string;
  startingPrice: number;
  currency: 'RON' | 'EUR';
  auctionDate?: string;
  location?: string;
  county?: string;
  city?: string;
  address?: string;
  images?: string[];
  documents?: string[];
  [key: string]: any;
}

export default function ExecutorImportAuctionsPage() {
  const router = useRouter();
  const pathname = usePathname();
  const basePath = pathname?.startsWith("/dashboard/lichidator") ? "/dashboard/lichidator" : "/dashboard/executor";
  const bgEmblem = basePath?.includes("lichidator") ? "/images/logo-unpir.png" : "/executori.jpeg";
  const [imports, setImports] = useState<ImportRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isImporting, setIsImporting] = useState(false);
  const [importType, setImportType] = useState<'pdf' | 'csv' | 'url' | 'other'>('pdf');
  const [file, setFile] = useState<File | null>(null);
  const [url, setUrl] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [selectedImports, setSelectedImports] = useState<string[]>([]);
  const [isDeleting, setIsDeleting] = useState(false);
  const [extractedProducts, setExtractedProducts] = useState<ExtractedProduct[]>([]);
  const [selectedProducts, setSelectedProducts] = useState<number[]>([]);
  const [isCreatingProducts, setIsCreatingProducts] = useState(false);
  const [processingProgress, setProcessingProgress] = useState<{
    status: string;
    currentStep?: string;
    progress?: number;
  } | null>(null);
  const [isDarkMode, setIsDarkMode] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('darkMode');
      if (saved !== null) setIsDarkMode(saved === 'true');
    }
  }, []);
  useEffect(() => {
    if (typeof window !== 'undefined') {
      if (isDarkMode) document.documentElement.classList.add('dark');
      else document.documentElement.classList.remove('dark');
    }
  }, [isDarkMode]);
  const toggleDarkMode = () => {
    const newMode = !isDarkMode;
    setIsDarkMode(newMode);
    if (typeof window !== 'undefined') localStorage.setItem('darkMode', String(newMode));
  };

  useEffect(() => {
    loadImports();
  }, [filterStatus]);

  const loadImports = async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterStatus !== 'all') params.append('status', filterStatus);

      const response = await dashboardApiFetch(`/api/executor/imports?${params.toString()}`);
      const result = await response.json();

      if (result.success) {
        setImports(result.data || []);
      } else {
        // Check if table is missing
        if (result.tableMissing) {
          setMessage({
            type: 'error',
            text: 'Tabelul executor_imports nu există. Te rog rulează migrația SQL în Supabase Dashboard. Vezi README_EXECUTOR_IMPORTS.md pentru instrucțiuni.',
          });
          return;
        }
        throw new Error(result.error || 'Failed to load imports');
      }
    } catch (error: any) {
      console.error('Error loading imports:', error);
      setMessage({
        type: 'error',
        text: `Eroare la încărcarea importurilor: ${error.message}`,
      });
    } finally {
      setIsLoading(false);
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

  const handleImport = async () => {
    if (importType === 'pdf' || importType === 'csv') {
      if (!file) {
        setMessage({
          type: 'error',
          text: 'Te rog selectează un fișier',
        });
        return;
      }
    } else if (importType === 'url') {
      if (!url.trim()) {
        setMessage({
          type: 'error',
          text: 'Te rog introdu un URL valid',
        });
        return;
      }
    }

    setIsImporting(true);
    setMessage(null);
    setProcessingProgress({
      status: 'Început procesare...',
      currentStep: 'Se încarcă fișierul...',
      progress: 0,
    });

    try {
      let response: Response;

      if (importType === 'pdf' || importType === 'csv') {
        const formData = new FormData();
        formData.append('file', file!);
        formData.append('sourceType', importType);
        formData.append('autoCreate', 'true'); // Activează crearea automată cu AI

        setProcessingProgress({
          status: 'Procesare cu GoBid AI...',
          currentStep: 'GoBid AI analizează conținutul...',
          progress: 30,
        });

        response = await dashboardApiFetch('/api/executor/import/process', {
          method: 'POST',
          body: formData,
        });
      } else {
        setProcessingProgress({
          status: 'Procesare cu GoBid AI...',
          currentStep: 'GoBid AI analizează URL-ul...',
          progress: 30,
        });

        response = await dashboardApiFetch('/api/executor/import/process', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            url: url.trim(),
            sourceType: importType,
            autoCreate: true,
          }),
        });
      }

      setProcessingProgress({
        status: 'Extragere date...',
        currentStep: 'GoBid AI extrage produsele...',
        progress: 60,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }

      const result = await response.json();

      if (result.success) {
        setProcessingProgress({
          status: 'Completat!',
          currentStep: `Găsite ${result.products?.length || 0} produse`,
          progress: 100,
        });

        if (result.products && result.products.length > 0) {
          setExtractedProducts(result.products);
          setMessage({
            type: 'success',
            text: `Import reușit! Găsite ${result.products.length} produse. ${result.autoCreated ? 'Produsele au fost create automat.' : 'Selectează produsele pe care vrei să le creezi.'}`,
          });
        } else {
          setMessage({
            type: 'success',
            text: 'Import reușit! Verifică rezultatele mai jos.',
          });
        }

        setFile(null);
        setUrl('');
        await loadImports();
      } else {
        throw new Error(result.error || 'Import failed');
      }
    } catch (error: any) {
      console.error('Error importing:', error);
      setMessage({
        type: 'error',
        text: `Eroare la import: ${error.message}`,
      });
    } finally {
      setIsImporting(false);
      setTimeout(() => {
        setProcessingProgress(null);
      }, 5000);
    }
  };

  const handleCreateSelectedProducts = async () => {
    if (selectedProducts.length === 0) {
      setMessage({
        type: 'error',
        text: 'Te rog selectează cel puțin un produs',
      });
      return;
    }

    setIsCreatingProducts(true);
    setMessage(null);

    try {
      const productsToCreate = extractedProducts.filter((_, index) =>
        selectedProducts.includes(index)
      );

      const response = await dashboardApiFetch('/api/executor/import/create-products', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          products: productsToCreate,
        }),
      });

      const result = await response.json();

      if (result.success) {
        setMessage({
          type: 'success',
          text: `Creat cu succes ${result.createdCount} produs(e)!`,
        });
        setExtractedProducts([]);
        setSelectedProducts([]);
        await loadImports();
      } else {
        throw new Error(result.error || 'Failed to create products');
      }
    } catch (error: any) {
      console.error('Error creating products:', error);
      setMessage({
        type: 'error',
        text: `Eroare la crearea produselor: ${error.message}`,
      });
    } finally {
      setIsCreatingProducts(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      pending: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
      processing: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
      completed: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
      failed: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
    };

    const labels: Record<string, string> = {
      pending: 'În așteptare',
      processing: 'În procesare',
      completed: 'Completat',
      failed: 'Eșuat',
    };

    return (
      <span
        className={`px-2 py-1 rounded-full text-xs font-semibold ${
          styles[status] || styles.pending
        }`}
      >
        {labels[status] || status}
      </span>
    );
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedImports(imports.map((imp) => imp.id));
    } else {
      setSelectedImports([]);
    }
  };

  const handleSelectImport = (importId: string, checked: boolean) => {
    if (checked) {
      setSelectedImports([...selectedImports, importId]);
    } else {
      setSelectedImports(selectedImports.filter((id) => id !== importId));
    }
  };

  const handleDeleteSelected = async () => {
    if (selectedImports.length === 0) {
      setMessage({
        type: 'error',
        text: 'Te rog selectează cel puțin o înregistrare pentru ștergere',
      });
      return;
    }

    if (!confirm(`Ești sigur că vrei să ștergi ${selectedImports.length} înregistrări?`)) {
      return;
    }

    setIsDeleting(true);
    setMessage(null);

    try {
      const response = await dashboardApiFetch('/api/executor/imports/delete', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ ids: selectedImports }),
      });

      const result = await response.json();

      if (response.ok && result.success) {
        setMessage({
          type: 'success',
          text: result.message || `Șters cu succes ${result.deletedCount} înregistrări`,
        });
        setSelectedImports([]);
        await loadImports();
      } else {
        throw new Error(result.error || 'Failed to delete imports');
      }
    } catch (error: any) {
      console.error('Error deleting imports:', error);
      setMessage({
        type: 'error',
        text: `Eroare la ștergere: ${error.message}`,
      });
    } finally {
      setIsDeleting(false);
    }
  };

  const allSelected = imports.length > 0 && selectedImports.length === imports.length;
  const someSelected = selectedImports.length > 0 && selectedImports.length < imports.length;

  return (
    <div className="min-h-screen relative bg-gray-50/30 dark:bg-gray-900/30">
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
        <div className="inline-flex items-center gap-1.5 md:gap-2 px-2 py-1 md:px-3 md:py-1.5 rounded-lg bg-blue-50 border border-blue-200 dark:bg-blue-600/20 dark:border-blue-500/30">
          <i className="ri-shield-user-line text-xs md:text-sm text-blue-600 dark:text-blue-300"></i>
          <span className="text-[10px] md:text-xs font-medium text-blue-700 dark:text-blue-200">
            {basePath?.includes("lichidator") ? "Panel privat pentru lichidatori" : "Panel privat de executori"}
          </span>
        </div>
      </div>
      
      <div className="max-w-7xl mx-auto p-6">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <div>
            <div className="mb-4">
              <BackButton fallbackHref={basePath} label="Înapoi" className="shadow-md" />
            </div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
              Import Automat Licitații
            </h1>
            <p className="text-gray-600 dark:text-gray-400">
              Import automat de licitații din PDF, CSV și alte surse cu procesare AI
            </p>
          </div>
          <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-blue-600 dark:from-blue-600 dark:to-blue-700 rounded-xl flex items-center justify-center shadow-lg">
            <i className="ri-robot-line text-white text-2xl"></i>
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

        {/* Processing Progress */}
        {processingProgress && (
          <div className="mb-6 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-semibold text-blue-900 dark:text-blue-300">
                {processingProgress.status}
              </p>
              {processingProgress.progress !== undefined && (
                <span className="text-sm text-blue-700 dark:text-blue-400">
                  {processingProgress.progress}%
                </span>
              )}
            </div>
            {processingProgress.currentStep && (
              <p className="text-xs text-blue-700 dark:text-blue-400">
                {processingProgress.currentStep}
              </p>
            )}
            {processingProgress.progress !== undefined && (
              <div className="mt-2 w-full bg-blue-200 dark:bg-blue-800 rounded-full h-2">
                <div
                  className="bg-blue-600 dark:bg-blue-400 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${processingProgress.progress}%` }}
                ></div>
              </div>
            )}
          </div>
        )}

        {/* Import Form */}
        <div className="backdrop-blur-sm bg-white/30 dark:bg-white/5 rounded-lg shadow-sm border border-gray-200/50 dark:border-white/10 p-6 mb-6">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
            Import Nou GoBid AI
          </h2>

          <div className="space-y-4">
            {/* Import Type Selection */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Tip Sursă
              </label>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                  { value: 'pdf', label: 'PDF', icon: 'ri-file-pdf-line' },
                  { value: 'csv', label: 'CSV', icon: 'ri-file-excel-line' },
                  { value: 'url', label: 'URL', icon: 'ri-link' },
                  { value: 'other', label: 'Altul', icon: 'ri-file-line' },
                ].map((type) => (
                  <button
                    key={type.value}
                    onClick={() => setImportType(type.value as any)}
                    className={`p-3 rounded-lg border-2 transition-all ${
                      importType === type.value
                        ? 'border-blue-600 dark:border-blue-400 bg-blue-50 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300 shadow-sm'
                        : 'border-gray-300/50 dark:border-gray-600/50 bg-white/30 dark:bg-white/5 text-gray-700 dark:text-gray-300 hover:border-blue-400 dark:hover:border-blue-500 hover:bg-blue-50/50 dark:hover:bg-blue-900/10'
                    }`}
                  >
                    <i className={`${type.icon} text-xl mb-1 block`}></i>
                    <span className="text-sm font-medium">{type.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* File Upload or URL Input */}
            {(importType === 'pdf' || importType === 'csv') ? (
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Selectează Fișier {importType.toUpperCase()}
                </label>
                <input
                  key={`file-input-${importType}`}
                  type="file"
                  accept={importType === 'pdf' ? '.pdf' : '.csv'}
                  onChange={handleFileChange}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-blue-500 dark:focus:border-blue-400 bg-white dark:bg-gray-700 text-gray-900 dark:text-white transition-colors"
                />
                {file && (
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    Fișier selectat: {file.name} ({(file.size / 1024 / 1024).toFixed(2)} MB)
                  </p>
                )}
              </div>
            ) : (
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  URL Sursă
                </label>
                <input
                  type="url"
                  value={url || ''}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://example.com/licitatii-publice.pdf"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-blue-500 dark:focus:border-blue-400 bg-white dark:bg-gray-700 text-gray-900 dark:text-white transition-colors"
                />
              </div>
            )}

            <button
              onClick={handleImport}
              disabled={isImporting || ((importType === 'pdf' || importType === 'csv') ? !file : !url.trim())}
              className="w-full px-4 py-3 bg-gradient-to-r from-blue-600 to-blue-700 dark:from-blue-600 dark:to-blue-700 text-white rounded-lg hover:from-blue-700 hover:to-blue-800 dark:hover:from-blue-700 dark:hover:to-blue-800 shadow-md hover:shadow-lg transition-all disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2 font-semibold"
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

            <p className="text-xs text-blue-700 dark:text-blue-400 mt-2 font-medium">
              GoBid AI va analiza automat conținutul, va extrage produsele și le va crea automat în sistem.
            </p>
          </div>
        </div>

        {/* Extracted Products Preview */}
        {extractedProducts.length > 0 && (
          <div className="backdrop-blur-sm bg-white/30 dark:bg-white/5 rounded-lg shadow-sm border border-gray-200/50 dark:border-white/10 p-6 mb-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                Produse Extrase ({extractedProducts.length})
              </h2>
              <button
                onClick={handleCreateSelectedProducts}
                disabled={isCreatingProducts || selectedProducts.length === 0}
                className="px-4 py-2 bg-blue-600 dark:bg-blue-700 hover:bg-blue-700 dark:hover:bg-blue-800 disabled:bg-gray-400 disabled:cursor-not-allowed text-white rounded-lg shadow-md hover:shadow-lg transition-all flex items-center gap-2 font-semibold"
              >
                {isCreatingProducts ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    <span>Se creează...</span>
                  </>
                ) : (
                  <>
                    <i className="ri-add-line"></i>
                    <span>Creează Produse ({selectedProducts.length})</span>
                  </>
                )}
              </button>
            </div>

            <div className="space-y-3">
              {extractedProducts.map((product, index) => (
                <div
                  key={index}
                  className={`p-4 rounded-lg border-2 ${
                    selectedProducts.includes(index)
                      ? 'border-blue-600 dark:border-blue-400 bg-blue-50 dark:bg-blue-900/30 shadow-sm'
                      : 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50'
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
                      className="mt-1 w-4 h-4 text-blue-600 dark:text-blue-400 bg-white/30 dark:bg-white/5 border-gray-300/50 dark:border-gray-600/50 rounded focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:ring-offset-1"
                    />
                    <div className="flex-1">
                      <h3 className="font-semibold text-gray-900 dark:text-white mb-1">
                        {product.title}
                      </h3>
                      <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                        {product.description}
                      </p>
                      <div className="flex flex-wrap gap-2 text-xs">
                        <span className="px-2 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300 rounded">
                          {product.category}
                        </span>
                        <span className="px-2 py-1 bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300 rounded">
                          {product.startingPrice?.toLocaleString('ro-RO')} {product.currency}
                        </span>
                        {product.auctionDate && (
                          <span className="px-2 py-1 bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-300 rounded">
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

        {/* Filters */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-4 mb-6">
          <div className="flex gap-4">
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Status
              </label>
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              >
                <option value="all">Toate</option>
                <option value="pending">În așteptare</option>
                <option value="processing">În procesare</option>
                <option value="completed">Completate</option>
                <option value="failed">Eșuate</option>
              </select>
            </div>
          </div>
        </div>

        {/* Imports List */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
          <div className="p-6 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
              Istoric Importuri ({imports.length})
            </h2>
            {selectedImports.length > 0 && (
              <button
                onClick={handleDeleteSelected}
                disabled={isDeleting}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-60 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {isDeleting ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    <span>Se șterg...</span>
                  </>
                ) : (
                  <>
                    <i className="ri-delete-bin-line"></i>
                    <span>Șterge ({selectedImports.length})</span>
                  </>
                )}
              </button>
            )}
          </div>

          {isLoading ? (
            <div className="p-6 text-center text-gray-500 dark:text-gray-400">
              Se încarcă...
            </div>
          ) : imports.length === 0 ? (
            <div className="p-6 text-center text-gray-500 dark:text-gray-400">
              Nu există importuri
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 dark:bg-gray-900/50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider w-12">
                      <input
                        type="checkbox"
                        checked={allSelected}
                        ref={(input) => {
                          if (input) input.indeterminate = someSelected;
                        }}
                        onChange={(e) => handleSelectAll(e.target.checked)}
                        className="w-4 h-4 text-blue-600 dark:text-blue-400 bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 rounded focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:ring-offset-1"
                      />
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Sursă
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Tip
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Produse
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Creat
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                  {imports.map((importRecord) => (
                    <tr
                      key={importRecord.id}
                      className={selectedImports.includes(importRecord.id) ? 'bg-blue-50 dark:bg-blue-900/20' : ''}
                    >
                      <td className="px-6 py-4">
                        <input
                          type="checkbox"
                          checked={selectedImports.includes(importRecord.id)}
                          onChange={(e) => handleSelectImport(importRecord.id, e.target.checked)}
                          className="w-4 h-4 text-blue-600 dark:text-blue-400 bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 rounded focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:ring-offset-1"
                        />
                      </td>
                      <td className="px-6 py-4">
                        {importRecord.file_name || importRecord.source_url || '-'}
                      </td>
                      <td className="px-6 py-4">
                        <span className="px-2 py-1 bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-300 rounded text-xs">
                          {importRecord.source_type.toUpperCase()}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {getStatusBadge(importRecord.status)}
                        {importRecord.error_message && (
                          <p className="text-xs text-red-600 dark:text-red-400 mt-1">
                            {importRecord.error_message}
                          </p>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                        {importRecord.products_created || 0}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                        {new Date(importRecord.created_at).toLocaleString('ro-RO')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Dashboard Footer */}
      <DashboardFooter isDarkMode={isDarkMode} />
    </div>
  );
}
