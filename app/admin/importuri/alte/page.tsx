"use client";

/**
 * Modul Import Alte Surse
 * Placeholder pentru importuri din alte surse
 */

import React from 'react';
import { useRouter } from 'next/navigation';

export default function AlteImportPage() {
  const router = useRouter();

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-6">
      <div className="max-w-4xl mx-auto">
        <button
          onClick={() => router.push('/admin/importuri')}
          className="mb-4 flex items-center gap-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
        >
          <i className="ri-arrow-left-line"></i>
          <span>Înapoi la Importuri</span>
        </button>

        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 p-12 text-center">
          <div className="w-20 h-20 bg-gradient-to-br from-gray-500 to-gray-600 rounded-xl flex items-center justify-center mx-auto mb-6 shadow-lg">
            <i className="ri-folder-add-line text-white text-3xl"></i>
          </div>
          
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-4">
            Import Alte Surse
          </h1>
          
          <p className="text-gray-600 dark:text-gray-400 mb-6">
            Acest modul va fi disponibil în curând. Va permite importul automat de licitații 
            din alte surse de licitații publice.
          </p>

          <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
            <p className="text-yellow-800 dark:text-yellow-200 text-sm">
              <i className="ri-time-line mr-2"></i>
              Modul în dezvoltare
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}








