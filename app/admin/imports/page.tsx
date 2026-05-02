"use client";

/**
 * Pagină Admin - Gestionare Importuri
 * Gestionare centralizată pentru toate importurile (ANAF și alte surse)
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

export default function ImportsPage() {
  const router = useRouter();
  const [imports, setImports] = useState<ImportRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isImporting, setIsImporting] = useState(false);
  const [pdfUrl, setPdfUrl] = useState('');
  const [sourceType, setSourceType] = useState('anaf');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterSourceType, setFilterSourceType] = useState<string>('all');
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    loadImports();
  }, [filterStatus, filterSourceType]);

  const loadImports = async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterStatus !== 'all') params.append('status', filterStatus);
      if (filterSourceType !== 'all') params.append('sourceType', filterSourceType);

      const response = await fetch(`/api/anaf/import?${params.toString()}`);
      const result = await response.json();

      if (result.success) {
        setImports(result.data || []);
      } else {
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
      const response = await fetch('/api/anaf/import', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          pdfUrl: pdfUrl.trim(),
          sourceType,
        }),
      });

      const result = await response.json();

      if (result.success) {
        if (result.warning || result.needsManualInput) {
          // Import parțial reușit - PDF salvat dar necesită completare manuală
          setMessage({
            type: 'success',
            text: result.message || 
              `PDF-ul a fost salvat (Licitație ID: ${result.licitatieId}), dar necesită completare manuală a datelor. ` +
              `PDF-ul este disponibil pentru descărcare și poți completa datele manual.`,
          });
        } else {
          // Import complet reușit
          setMessage({
            type: 'success',
            text: `Import reușit! Licitație ID: ${result.licitatieId}${result.productId ? `, Produs ID: ${result.productId}` : ''}`,
          });
        }
        setPdfUrl('');
        await loadImports();
      } else {
        // Mesaj de eroare mai detaliat
        let errorMessage = result.error || 'Import failed';
        
        // Dacă eroarea este despre duplicate, oferă un mesaj mai util
        if (errorMessage.includes('există deja') || errorMessage.includes('duplicate')) {
          errorMessage = `Un import cu acest URL există deja în sistem. ` +
            `Dacă importul anterior a eșuat, poți încerca din nou. ` +
            `Dacă a reușit, nu este necesar să re-importezi. ` +
            `Verifică istoricul importurilor pentru detalii.`;
        }
        // Dacă eroarea este despre PDF scanat, oferă un mesaj mai util
        else if (errorMessage.includes('scanned') || errorMessage.includes('empty text') || errorMessage.includes('image-based')) {
          errorMessage = `PDF-ul pare să fie scanat (imagine, nu text). ` +
            `Sistemul necesită PDF-uri cu text selectabil. ` +
            `Te rugăm să folosești un PDF care conține text (nu doar imagini scanate). ` +
            `Dacă ai doar PDF-uri scanate, va trebui să folosești un serviciu OCR pentru a converti imaginile în text.`;
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

  const getSourceTypeBadge = (type: string) => {
    const styles: Record<string, string> = {
      anaf: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
      insolventa: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300',
      executori: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
    };

    return (
      <span
        className={`px-2 py-1 rounded-full text-xs font-semibold ${
          styles[type] || 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300'
        }`}
      >
        {type.toUpperCase()}
      </span>
    );
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
            Gestionare Importuri
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            Import automat de licitații din multiple surse (ANAF, Insolvență, Executori, etc.)
          </p>
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

        {/* Import Form */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6 mb-6">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
            Import Nou
          </h2>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Sursă
              </label>
              <select
                value={sourceType}
                onChange={(e) => setSourceType(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              >
                <option value="anaf">ANAF</option>
                <option value="insolventa">Insolvență</option>
                <option value="executori">Executori</option>
                <option value="alte">Alte</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                URL PDF
              </label>
              <input
                type="url"
                value={pdfUrl}
                onChange={(e) => setPdfUrl(e.target.value)}
                placeholder="https://static.anaf.ro/static/...pdf"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              />
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                Introdu URL-ul complet către PDF-ul licitației
              </p>
              <p className="text-xs text-yellow-600 dark:text-yellow-400 mt-1">
                ⚠️ PDF-ul trebuie să conțină text selectabil (nu doar imagini scanate). 
                PDF-urile generate automat de ANAF ar trebui să funcționeze.
              </p>
            </div>

            <button
              onClick={handleImport}
              disabled={isImporting || !pdfUrl.trim()}
              className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isImporting ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  <span>Se importă...</span>
                </>
              ) : (
                <>
                  <i className="ri-download-line"></i>
                  <span>Importă Licitație</span>
                </>
              )}
            </button>
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

            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Sursă
              </label>
              <select
                value={filterSourceType}
                onChange={(e) => setFilterSourceType(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              >
                <option value="all">Toate</option>
                <option value="anaf">ANAF</option>
                <option value="insolventa">Insolvență</option>
                <option value="executori">Executori</option>
              </select>
            </div>
          </div>
        </div>

        {/* Imports List */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
          <div className="p-6 border-b border-gray-200 dark:border-gray-700">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
              Istoric Importuri ({imports.length})
            </h2>
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
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Sursă
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
                      Acțiuni
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                  {imports.map((importRecord) => (
                    <tr key={importRecord.id}>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {getSourceTypeBadge(importRecord.source_type)}
                      </td>
                      <td className="px-6 py-4">
                        <a
                          href={importRecord.source_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 text-sm truncate block max-w-md"
                        >
                          {importRecord.source_url}
                        </a>
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
                        {new Date(importRecord.created_at).toLocaleString('ro-RO')}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        <button
                          onClick={() => router.push(`/licitatii?importId=${importRecord.id}`)}
                          className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
                        >
                          Vezi detalii
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

