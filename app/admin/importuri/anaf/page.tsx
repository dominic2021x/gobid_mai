"use client";

/**
 * Modul Import ANAF
 * Gestionare importuri ANAF separate de alte surse
 */

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

interface ImportRecord {
  id: string;
  source_type: string;
  source_url: string;
  pdf_url: string | null;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  error_message: string | null;
  created_at: string;
  updated_at: string;
  processed_at: string | null;
}

interface ANAFProduct {
  licitatie_id: string;
  import_id: string;
  product_id: string | null;
  product_created: boolean;
  numar_licitatie: string | null;
  data_licitatie: string | null;
  product: {
    id: string;
    title: string;
    status: 'draft' | 'active' | 'deleted';
    created_at: string;
    updated_at: string;
  } | null;
}

export default function ANAFImportPage() {
  const router = useRouter();
  const [imports, setImports] = useState<ImportRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isImporting, setIsImporting] = useState(false);
  const [pdfUrl, setPdfUrl] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [selectedImports, setSelectedImports] = useState<string[]>([]);
  const [isDeleting, setIsDeleting] = useState(false);
  const [anafProducts, setAnafProducts] = useState<Record<string, ANAFProduct[]>>({});
  const [selectedProducts, setSelectedProducts] = useState<string[]>([]);
  const [isSyncing, setIsSyncing] = useState<string | null>(null);
  const [isDeletingProducts, setIsDeletingProducts] = useState(false);
  
  // Scraping automat
  const [scrapeConfigs, setScrapeConfigs] = useState<any[]>([]);
  const [newScrapeUrl, setNewScrapeUrl] = useState('');
  const [newScrapeMaxPages, setNewScrapeMaxPages] = useState(10000);
  const [isLoadingConfigs, setIsLoadingConfigs] = useState(false);
  const [isScraping, setIsScraping] = useState(false);
  const [scrapeResult, setScrapeResult] = useState<any>(null);
  const [scrapeProgress, setScrapeProgress] = useState<{
    status: string;
    currentPage?: number;
    totalPages?: number;
    pdfsFound?: number;
    pdfsProcessed?: number;
    currentAction?: string;
  } | null>(null);

  useEffect(() => {
    loadImports();
    loadScrapeConfigs();
  }, [filterStatus]);

  useEffect(() => {
    // Încarcă produsele pentru fiecare import
    if (imports.length > 0) {
      loadANAFProducts();
    }
  }, [imports]);

  const loadScrapeConfigs = async () => {
    setIsLoadingConfigs(true);
    try {
      const response = await fetch('/api/anaf/scrape-config');
      const result = await response.json();

      if (result.success) {
        setScrapeConfigs(result.data || []);
      } else {
        throw new Error(result.error || 'Failed to load scrape configs');
      }
    } catch (error: any) {
      console.error('Error loading scrape configs:', error);
      setMessage({
        type: 'error',
        text: `Eroare la încărcarea configurației: ${error.message}`,
      });
    } finally {
      setIsLoadingConfigs(false);
    }
  };

  const handleAddScrapeUrl = async () => {
    if (!newScrapeUrl.trim()) {
      setMessage({
        type: 'error',
        text: 'Te rog introdu un URL valid',
      });
      return;
    }

    try {
      const response = await fetch('/api/anaf/scrape-config', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          url: newScrapeUrl.trim(),
          max_pages: newScrapeMaxPages,
          enabled: true,
        }),
      });

      const result = await response.json();

      if (response.ok && result.success) {
        setMessage({
          type: 'success',
          text: 'URL adăugat cu succes!',
        });
        setNewScrapeUrl('');
        setNewScrapeMaxPages(10);
        await loadScrapeConfigs();
      } else {
        throw new Error(result.error || 'Failed to add URL');
      }
    } catch (error: any) {
      console.error('Error adding scrape URL:', error);
      setMessage({
        type: 'error',
        text: `Eroare la adăugarea URL-ului: ${error.message}`,
      });
    }
  };

  const handleDeleteScrapeUrl = async (id: string) => {
    if (!confirm('Ești sigur că vrei să ștergi acest URL?')) {
      return;
    }

    try {
      const response = await fetch(`/api/anaf/scrape-config?id=${id}`, {
        method: 'DELETE',
      });

      const result = await response.json();

      if (response.ok && result.success) {
        setMessage({
          type: 'success',
          text: 'URL șters cu succes!',
        });
        await loadScrapeConfigs();
      } else {
        throw new Error(result.error || 'Failed to delete URL');
      }
    } catch (error: any) {
      console.error('Error deleting scrape URL:', error);
      setMessage({
        type: 'error',
        text: `Eroare la ștergerea URL-ului: ${error.message}`,
      });
    }
  };

  const handleToggleScrapeUrl = async (id: string, enabled: boolean) => {
    try {
      const response = await fetch('/api/anaf/scrape-config', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          id,
          enabled: !enabled,
        }),
      });

      const result = await response.json();

      if (response.ok && result.success) {
        await loadScrapeConfigs();
      } else {
        throw new Error(result.error || 'Failed to update URL');
      }
    } catch (error: any) {
      console.error('Error toggling scrape URL:', error);
      setMessage({
        type: 'error',
        text: `Eroare la actualizarea URL-ului: ${error.message}`,
      });
    }
  };

  const handleRunScrape = async (configId?: string) => {
    setIsScraping(true);
    setScrapeResult(null);
    setMessage(null);
    setScrapeProgress({
      status: 'Inițializare...',
      currentAction: 'Pornire scanare...',
    });
    
    console.log('[UI] 🚀 Starting scrape...');
    
    try {
      setScrapeProgress({
        status: 'Conectare la server...',
        currentAction: 'Se conectează la API...',
      });
      
      const response = await fetch('/api/anaf/scrape-run', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          configId,
          autoImport: true,
          maxPages: 10000, // Scanează toate paginile
        }),
      });

      console.log('[UI] ✅ Response received, status:', response.status);

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        throw new Error(`HTTP ${response.status}: ${errorText.substring(0, 200)}`);
      }

      setScrapeProgress({
        status: 'Procesare rezultate...',
        currentAction: 'Se procesează rezultatele...',
      });

      const result = await response.json();
      console.log('[UI] ✅ Result received:', result);

      if (result.success) {
        setScrapeProgress({
          status: 'Completat!',
          currentAction: `Găsite ${result.scrapeResult?.totalFound || 0} anunțuri`,
        });
        
        setScrapeResult(result);
        setMessage({
          type: 'success',
          text: `Scanare completă! Găsite: ${result.scrapeResult?.totalFound || 0} anunțuri, ${result.scrapeResult?.newCount || 0} noi`,
        });
        await loadScrapeConfigs();
        await loadImports();
      } else {
        // Afișează eroarea detaliată
        const errorMessage = result.error || result.message || 'Failed to run scrape';
        console.error('Scrape error details:', result);
        setScrapeProgress({
          status: 'Eroare',
          currentAction: errorMessage,
        });
        throw new Error(errorMessage);
      }
    } catch (error: any) {
      console.error('[UI] ❌ Error running scrape:', error);
      console.error('[UI] Error details:', {
        message: error.message,
        stack: error.stack,
        response: error.response,
      });
      
      let errorMessage = error.message || 'Eroare necunoscută';
      
      // Mesaje specifice pentru erori comune
      if (errorMessage.includes('Puppeteer')) {
        errorMessage = 'Puppeteer nu este instalat. Rulează: npm install puppeteer';
      } else if (errorMessage.includes('timeout')) {
        errorMessage = 'Timeout - pagina a durat prea mult să se încarce. Încearcă din nou.';
      } else if (errorMessage.includes('No enabled scrape URLs')) {
        errorMessage = 'Nu există URL-uri configurate. Adaugă un URL mai întâi.';
      } else if (errorMessage.includes('fetch failed') || errorMessage.includes('Failed to fetch')) {
        errorMessage = 'Eroare de conexiune. Verifică că serverul rulează și că endpoint-ul /api/anaf/scrape-run există.';
      }
      
      setScrapeProgress({
        status: 'Eroare',
        currentAction: errorMessage,
      });
      
      setMessage({
        type: 'error',
        text: `Eroare la scanare: ${errorMessage}`,
      });
    } finally {
      setIsScraping(false);
      // Șterge progress-ul după 5 secunde
      setTimeout(() => {
        setScrapeProgress(null);
      }, 5000);
    }
  };

  const loadANAFProducts = async () => {
    try {
      const productsMap: Record<string, ANAFProduct[]> = {};
      
      // Încarcă produsele pentru fiecare import
      for (const importRecord of imports) {
        try {
          const response = await fetch(`/api/anaf/products?import_id=${importRecord.id}`);
          const result = await response.json();
          
          if (result.success && result.data) {
            productsMap[importRecord.id] = result.data;
          }
        } catch (error) {
          console.error(`Error loading products for import ${importRecord.id}:`, error);
        }
      }
      
      setAnafProducts(productsMap);
    } catch (error) {
      console.error('Error loading ANAF products:', error);
    }
  };

  const loadImports = async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      params.append('sourceType', 'anaf');
      if (filterStatus !== 'all') params.append('status', filterStatus);

      let response: Response;
      try {
        // Creează un AbortController pentru timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 secunde
        
        try {
          response = await fetch(`/api/anaf/import?${params.toString()}`, {
            method: 'GET',
            headers: {
              'Content-Type': 'application/json',
            },
            signal: controller.signal,
          });
          clearTimeout(timeoutId);
        } catch (fetchError: any) {
          clearTimeout(timeoutId);
          throw fetchError;
        }
      } catch (fetchError: any) {
        // Eroare de rețea (fetch failed)
        if (fetchError.name === 'AbortError' || fetchError.name === 'TimeoutError') {
          throw new Error('Timeout: Serverul nu răspunde în 30 de secunde. Verifică că serverul rulează.');
        } else if (fetchError.message?.includes('fetch failed') || fetchError.message?.includes('Failed to fetch')) {
          throw new Error('Eroare de conexiune. Verifică că serverul Next.js rulează (npm run dev) și că endpoint-ul /api/anaf/import există.');
        } else if (fetchError.message?.includes('NetworkError') || fetchError.message?.includes('network')) {
          throw new Error('Eroare de rețea. Verifică conexiunea la internet și că serverul este accesibil.');
        }
        throw fetchError;
      }

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        throw new Error(`HTTP ${response.status}: ${errorText.substring(0, 200)}`);
      }

      const result = await response.json();

      if (result.success) {
        setImports(result.data || []);
      } else {
        throw new Error(result.error || 'Failed to load imports');
      }
    } catch (error: any) {
      console.error('Error loading imports:', error);
      console.error('Error details:', {
        message: error.message,
        stack: error.stack,
        name: error.name,
      });
      
      // Mesaje specifice pentru erori comune
      let errorMessage = error.message || 'Eroare necunoscută';
      
      if (errorMessage.includes('fetch failed') || errorMessage.includes('NetworkError')) {
        errorMessage = 'Eroare de conexiune. Verifică că serverul rulează și că endpoint-ul /api/anaf/import există.';
      } else if (errorMessage.includes('404')) {
        errorMessage = 'Endpoint-ul /api/anaf/import nu a fost găsit. Verifică că ruta există.';
      } else if (errorMessage.includes('500')) {
        errorMessage = 'Eroare internă a serverului. Verifică logurile serverului.';
      }
      
      setMessage({
        type: 'error',
        text: `Eroare la încărcarea importurilor: ${errorMessage}`,
      });
      setMessage({
        type: 'error',
        text: `Eroare la încărcarea importurilor: ${error.message}`,
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleImport = async () => {
    if (!pdfUrl.trim()) {
      setMessage({
        type: 'error',
        text: 'Te rog introdu un URL PDF valid',
      });
      return;
    }

    setIsImporting(true);
    setMessage(null);

    try {
      // Timeout pentru request (5 minute)
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5 * 60 * 1000);

      let response;
      try {
        response = await fetch('/api/anaf/import', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            pdfUrl: pdfUrl.trim(),
            sourceType: 'anaf',
          }),
          signal: controller.signal,
        });
      } catch (error: any) {
        clearTimeout(timeoutId);
        if (error.name === 'AbortError') {
          throw new Error('Importul a depășit timpul limită (5 minute). PDF-ul poate fi prea mare sau scanat. Te rugăm să încerci din nou.');
        }
        throw error;
      }

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        const errorMessage = errorData.error || `HTTP ${response.status}: ${response.statusText}`;
        
        // Formatare specială pentru mesajele despre Poppler
        if (errorMessage.includes('Poppler') || errorMessage.includes('scanat')) {
          throw new Error(errorMessage);
        }
        
        throw new Error(errorMessage);
      }

      const result = await response.json();

      if (result.success) {
        if (result.warning || result.needsManualInput) {
          setMessage({
            type: 'success',
            text: result.message || 
              `PDF-ul a fost salvat (Licitație ID: ${result.licitatieId}), dar necesită completare manuală a datelor.`,
          });
        } else {
          setMessage({
            type: 'success',
            text: `Import reușit! Licitație ID: ${result.licitatieId}${result.productId ? `, Produs ID: ${result.productId}` : ''}`,
          });
        }
        setPdfUrl('');
        await loadImports();
      } else {
        let errorMessage = result.error || 'Import failed';
        
        if (errorMessage.includes('există deja') || errorMessage.includes('duplicate')) {
          errorMessage = `Un import cu acest URL există deja. Verifică istoricul importurilor.`;
        } else if (errorMessage.includes('Poppler') || errorMessage.includes('pdftoppm') || errorMessage.includes('scanat')) {
          // Mesaj special pentru erorile despre Poppler
          errorMessage = `❌ ${errorMessage}\n\n` +
            `PDF-ul este scanat și necesită Poppler pentru extragere OCR.\n\n` +
            `Pentru a instala Poppler:\n` +
            `• macOS: brew install poppler\n` +
            `• Linux: sudo apt-get install poppler-utils\n` +
            `• Windows: Descarcă de la https://poppler.freedesktop.org/\n\n` +
            `După instalare, repornește serverul Next.js.`;
        } else if (errorMessage.includes('scanned') || errorMessage.includes('empty text')) {
          errorMessage = `PDF-ul pare să fie scanat. PDF-ul a fost salvat și poate fi completat manual.`;
        }
        
        throw new Error(errorMessage);
      }
    } catch (error: any) {
      console.error('Error importing:', error);
      setMessage({
        type: 'error',
        text: `Eroare la import: ${error.message}`,
      });
    } finally {
      setIsImporting(false);
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
      const response = await fetch('/api/anaf/import/delete', {
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

  const handleSyncProduct = async (licitatieId: string, productId: string | null, pdfUrl: string | null) => {
    if (!pdfUrl) {
      setMessage({
        type: 'error',
        text: 'PDF URL nu este disponibil pentru sincronizare',
      });
      return;
    }

    setIsSyncing(licitatieId);
    setMessage(null);

    try {
      const response = await fetch('/api/anaf/sync', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          licitatie_id: licitatieId,
          product_id: productId,
          pdf_url: pdfUrl,
        }),
      });

      const result = await response.json();

      if (result.success) {
        setMessage({
          type: 'success',
          text: `Sincronizare reușită! ${result.total_products} produs(e) actualizat(e).`,
        });
        await loadANAFProducts();
        await loadImports();
      } else {
        throw new Error(result.error || 'Sync failed');
      }
    } catch (error: any) {
      console.error('Error syncing product:', error);
      setMessage({
        type: 'error',
        text: `Eroare la sincronizare: ${error.message}`,
      });
    } finally {
      setIsSyncing(null);
    }
  };

  const handleDeleteProducts = async (productIds: string[]) => {
    if (productIds.length === 0) {
      setMessage({
        type: 'error',
        text: 'Te rog selectează cel puțin un produs pentru ștergere',
      });
      return;
    }

    if (!confirm(`Ești sigur că vrei să ștergi ${productIds.length} produs(e)?`)) {
      return;
    }

    setIsDeletingProducts(true);
    setMessage(null);

    try {
      const response = await fetch('/api/anaf/products', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ product_ids: productIds }),
      });

      const result = await response.json();

      if (result.success) {
        setMessage({
          type: 'success',
          text: `Șters cu succes ${result.deleted_count} produs(e)`,
        });
        setSelectedProducts([]);
        await loadANAFProducts();
        await loadImports();
      } else {
        throw new Error(result.error || 'Failed to delete products');
      }
    } catch (error: any) {
      console.error('Error deleting products:', error);
      setMessage({
        type: 'error',
        text: `Eroare la ștergere: ${error.message}`,
      });
    } finally {
      setIsDeletingProducts(false);
    }
  };

  const handleSelectProduct = (productId: string, checked: boolean) => {
    if (checked) {
      setSelectedProducts([...selectedProducts, productId]);
    } else {
      setSelectedProducts(selectedProducts.filter((id) => id !== productId));
    }
  };

  const handleSelectAllProducts = (checked: boolean, products: ANAFProduct[]) => {
    if (checked) {
      const allProductIds = products
        .filter((p) => p.product_id)
        .map((p) => p.product_id!);
      setSelectedProducts([...new Set([...selectedProducts, ...allProductIds])]);
    } else {
      const productIdsToRemove = products
        .filter((p) => p.product_id)
        .map((p) => p.product_id!);
      setSelectedProducts(selectedProducts.filter((id) => !productIdsToRemove.includes(id)));
    }
  };

  const allSelected = imports.length > 0 && selectedImports.length === imports.length;
  const someSelected = selectedImports.length > 0 && selectedImports.length < imports.length;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <div>
            <button
              onClick={() => router.push('/admin/importuri')}
              className="mb-4 flex items-center gap-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
            >
              <i className="ri-arrow-left-line"></i>
              <span>Înapoi la Importuri</span>
            </button>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
              Import ANAF
            </h1>
            <p className="text-gray-600 dark:text-gray-400">
              Import automat de licitații ANAF din PDF-uri
            </p>
          </div>
          <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl flex items-center justify-center shadow-lg">
            <i className="ri-file-pdf-line text-white text-2xl"></i>
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
            <div className="whitespace-pre-line">{message.text}</div>
          </div>
        )}

        {/* Scraping Automat Section */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6 mb-6">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
            <i className="ri-global-line"></i>
            Scraping Automat ANAF
          </h2>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
            Configurează URL-urile pentru scraping automat. Sistemul va extrage anunțuri noi de pe paginile ANAF, inclusiv pozele.
          </p>

          {/* Add URL Form */}
          <div className="bg-gray-50 dark:bg-gray-900/50 rounded-lg p-4 mb-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  URL Pagină ANAF
                </label>
                <input
                  type="url"
                  value={newScrapeUrl}
                  onChange={(e) => setNewScrapeUrl(e.target.value)}
                  placeholder="https://static.anaf.ro/static/10/Anaf/Informatii_RLA/..."
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Max Pagini
                </label>
                <input
                  type="number"
                  value={newScrapeMaxPages}
                  onChange={(e) => setNewScrapeMaxPages(parseInt(e.target.value) || 10)}
                  min="1"
                  max="50"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                />
              </div>
            </div>
            <button
              onClick={handleAddScrapeUrl}
              className="mt-4 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
            >
              <i className="ri-add-line mr-2"></i>
              Adaugă URL
            </button>
          </div>

          {/* URL List */}
          {isLoadingConfigs ? (
            <div className="text-center py-8 text-gray-500 dark:text-gray-400">
              Se încarcă...
            </div>
          ) : scrapeConfigs.length === 0 ? (
            <div className="text-center py-8 text-gray-500 dark:text-gray-400">
              Nu există URL-uri configurate. Adaugă unul mai sus.
            </div>
          ) : (
            <div className="space-y-3">
              {scrapeConfigs.map((config) => (
                <div
                  key={config.id}
                  className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-900/50 rounded-lg border border-gray-200 dark:border-gray-700"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <a
                        href={config.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 text-sm font-medium truncate max-w-2xl"
                      >
                        {config.url}
                      </a>
                      <span className={`px-2 py-1 rounded-full text-xs font-semibold ${
                        config.enabled
                          ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
                          : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'
                      }`}>
                        {config.enabled ? 'Activ' : 'Inactiv'}
                      </span>
                    </div>
                    <div className="flex items-center gap-4 text-xs text-gray-500 dark:text-gray-400">
                      <span>Max pagini: {config.max_pages}</span>
                      {config.last_scraped_at && (
                        <span>
                          Ultima scanare: {new Date(config.last_scraped_at).toLocaleString('ro-RO')}
                        </span>
                      )}
                      {config.last_scraped_count > 0 && (
                        <span>
                          Anunțuri găsite: {config.last_scraped_count}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleToggleScrapeUrl(config.id, config.enabled)}
                      className={`px-3 py-1 rounded text-sm ${
                        config.enabled
                          ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300 hover:bg-yellow-200'
                          : 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300 hover:bg-green-200'
                      }`}
                    >
                      {config.enabled ? 'Dezactivează' : 'Activează'}
                    </button>
                    <button
                      onClick={() => handleRunScrape(config.id)}
                      disabled={isScraping || !config.enabled}
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white rounded-lg transition-colors text-sm"
                    >
                      {isScraping ? (
                        <>
                          <i className="ri-loader-4-line animate-spin mr-2"></i>
                          Scanează...
                        </>
                      ) : (
                        <>
                          <i className="ri-search-line mr-2"></i>
                          Scan
                        </>
                      )}
                    </button>
                    <button
                      onClick={() => handleDeleteScrapeUrl(config.id)}
                      className="px-3 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors"
                    >
                      <i className="ri-delete-bin-line"></i>
                    </button>
                  </div>
                </div>
              ))}
              
              {/* Scan All Button */}
              {scrapeConfigs.some(c => c.enabled) && (
                <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
                  <button
                    onClick={() => handleRunScrape()}
                    disabled={isScraping}
                    className="w-full px-4 py-3 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 disabled:from-gray-400 disabled:to-gray-500 disabled:cursor-not-allowed text-white rounded-lg transition-all font-semibold"
                  >
                    {isScraping ? (
                      <>
                        <i className="ri-loader-4-line animate-spin mr-2"></i>
                        Scanează toate URL-urile...
                      </>
                    ) : (
                      <>
                        <i className="ri-search-2-line mr-2"></i>
                        Scanează toate URL-urile active
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Scrape Results */}
          {scrapeResult && (
            <div className="mt-6 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
              <h3 className="font-semibold text-blue-900 dark:text-blue-300 mb-2">
                Rezultate Scanare
              </h3>
              <div className="text-sm text-blue-800 dark:text-blue-400 space-y-1">
                <p>Total găsite: {scrapeResult.scrapeResult.totalFound}</p>
                <p>Noi: {scrapeResult.scrapeResult.newCount}</p>
                <p>Deja procesate: {scrapeResult.scrapeResult.alreadyProcessed}</p>
                {scrapeResult.importResults && (
                  <p className="mt-2">
                    Importate: {scrapeResult.importResults.filter((r: any) => r.success).length} / {scrapeResult.importResults.length}
                  </p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Import Form */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6 mb-6">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
            Import Nou (PDF)
          </h2>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                URL PDF ANAF
              </label>
              <input
                type="url"
                value={pdfUrl}
                onChange={(e) => setPdfUrl(e.target.value)}
                placeholder="https://static.anaf.ro/static/...pdf"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              />
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                Introdu URL-ul complet către PDF-ul licitației ANAF
              </p>
              <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                ✅ Sistemul suportă automat PDF-uri scanate folosind OCR (GPT-4 Vision). 
                Dacă PDF-ul este scanat, va fi procesat automat.
              </p>
            </div>

            <button
              onClick={handleImport}
              disabled={isImporting || !pdfUrl.trim()}
              className="w-full px-4 py-2 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-lg hover:from-blue-600 hover:to-blue-700 transition-colors disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2 font-semibold"
            >
              {isImporting ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  <span>Se importă... (poate dura până la 5 minute)</span>
                </>
              ) : (
                <>
                  <i className="ri-download-line"></i>
                  <span>Importă Licitație ANAF</span>
                </>
              )}
            </button>
            
            {isImporting && (
              <div className="mt-4 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                <p className="text-sm text-blue-800 dark:text-blue-200 mb-2 font-semibold">
                  ⏳ Procesare în curs...
                </p>
                <ul className="text-xs text-blue-700 dark:text-blue-300 space-y-1 list-disc list-inside">
                  <li>Descărcare PDF...</li>
                  <li>Extragere text (sau OCR pentru PDF-uri scanate)...</li>
                  <li>Parsare cu GPT-4o...</li>
                  <li>Salvare în baza de date...</li>
                  <li>Creare produs...</li>
                </ul>
                <p className="text-xs text-blue-600 dark:text-blue-400 mt-3 italic">
                  💡 Pentru PDF-uri scanate, procesarea poate dura 2-5 minute. Te rugăm să aștepți...
                </p>
              </div>
            )}
          </div>
        </div>

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
              Istoric Importuri ANAF ({imports.length})
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
              Nu există importuri ANAF
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
                        className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 dark:focus:ring-blue-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
                      />
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      URL
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Creat
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Produse
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Acțiuni
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                  {imports.map((importRecord) => {
                    const products = anafProducts[importRecord.id] || [];
                    const hasProducts = products.length > 0;
                    
                    return (
                      <React.Fragment key={importRecord.id}>
                        <tr className={selectedImports.includes(importRecord.id) ? 'bg-blue-50 dark:bg-blue-900/20' : ''}>
                          <td className="px-6 py-4" rowSpan={hasProducts ? products.length + 1 : 1}>
                            <input
                              type="checkbox"
                              checked={selectedImports.includes(importRecord.id)}
                              onChange={(e) => handleSelectImport(importRecord.id, e.target.checked)}
                              className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 dark:focus:ring-blue-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
                            />
                          </td>
                          <td className="px-6 py-4" rowSpan={hasProducts ? products.length + 1 : 1}>
                            <a
                              href={importRecord.source_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 text-sm truncate block max-w-md"
                            >
                              {importRecord.source_url}
                            </a>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap" rowSpan={hasProducts ? products.length + 1 : 1}>
                            {getStatusBadge(importRecord.status)}
                            {importRecord.error_message && (
                              <p className="text-xs text-red-600 dark:text-red-400 mt-1">
                                {importRecord.error_message}
                              </p>
                            )}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400" rowSpan={hasProducts ? products.length + 1 : 1}>
                            {new Date(importRecord.created_at).toLocaleString('ro-RO')}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm" rowSpan={hasProducts ? products.length + 1 : 1}>
                            <button
                              onClick={() => router.push(`/licitatii?importId=${importRecord.id}`)}
                              className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
                            >
                              Vezi detalii
                            </button>
                          </td>
                        </tr>
                        {hasProducts && (
                          <>
                            {products.map((product, idx) => (
                              <tr key={product.licitatie_id} className="bg-gray-50 dark:bg-gray-900/50">
                                <td className="px-6 py-3 pl-12">
                                  <div className="flex items-center gap-3">
                                    <input
                                      type="checkbox"
                                      checked={product.product_id ? selectedProducts.includes(product.product_id) : false}
                                      onChange={(e) => product.product_id && handleSelectProduct(product.product_id, e.target.checked)}
                                      disabled={!product.product_id}
                                      className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500"
                                    />
                                    <div className="flex-1">
                                      {product.product ? (
                                        <>
                                          <div className="flex items-center gap-2">
                                            <a
                                              href={`/licitatii-publice/${product.product.id}`}
                                              target="_blank"
                                              className="text-blue-600 hover:text-blue-800 dark:text-blue-400 font-medium"
                                            >
                                              {product.product.title}
                                            </a>
                                            <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                                              product.product.status === 'active'
                                                ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
                                                : product.product.status === 'draft'
                                                ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300'
                                                : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300'
                                            }`}>
                                              {product.product.status === 'active' ? 'Activ' : product.product.status === 'draft' ? 'Draft' : 'Șters'}
                                            </span>
                                          </div>
                                          <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                            Creat: {new Date(product.product.created_at).toLocaleString('ro-RO')}
                                          </div>
                                        </>
                                      ) : (
                                        <span className="text-gray-500 dark:text-gray-400 text-sm">
                                          Produs nu a fost creat
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                </td>
                                <td className="px-6 py-3">
                                  <div className="flex items-center gap-2">
                                    <button
                                      onClick={() => handleSyncProduct(product.licitatie_id, product.product_id, importRecord.pdf_url)}
                                      disabled={isSyncing === product.licitatie_id || !importRecord.pdf_url}
                                      className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white rounded text-xs font-semibold flex items-center gap-1"
                                    >
                                      {isSyncing === product.licitatie_id ? (
                                        <>
                                          <i className="ri-loader-4-line animate-spin"></i>
                                          Sincronizează...
                                        </>
                                      ) : (
                                        <>
                                          <i className="ri-refresh-line"></i>
                                          Sincronizează
                                        </>
                                      )}
                                    </button>
                                    {product.product_id && (
                                      <button
                                        onClick={() => handleDeleteProducts([product.product_id!])}
                                        disabled={isDeletingProducts}
                                        className="px-3 py-1.5 bg-red-600 hover:bg-red-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white rounded text-xs font-semibold"
                                      >
                                        <i className="ri-delete-bin-line"></i>
                                      </button>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

