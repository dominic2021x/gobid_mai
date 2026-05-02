"use client";

/**
 * Modul Import Executori
 * Import licitații de la executorii judecătorești
 */

import React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function ExecutoriImportPage() {
  const router = useRouter();

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-6">
      <div className="max-w-4xl mx-auto">
        <button
          onClick={() => router.push("/admin/importuri")}
          className="mb-4 flex items-center gap-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
        >
          <i className="ri-arrow-left-line" />
          <span>Înapoi la Importuri</span>
        </button>

        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
          <div className="p-6 border-b border-gray-200 dark:border-gray-700">
            <div className="flex flex-wrap items-center gap-4">
              <div className="w-16 h-16 rounded-xl flex items-center justify-center shadow-lg bg-gradient-to-br from-blue-500 to-blue-600">
                <i className="ri-scales-3-line text-white text-3xl" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                  Executori
                </h1>
                <p className="text-gray-600 dark:text-gray-400 text-sm mt-1">
                  Import licitații de la executorii judecătorești
                </p>
              </div>
            </div>
          </div>

          <div className="p-6">
            <p className="text-gray-600 dark:text-gray-400 mb-6">
              Acest modul este dedicat importului de licitații și execuții de la executorii judecătorești.
              Poți sincroniza anunțuri din surse oficiale ale executorilor și le poți publica pe site.
            </p>

            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
              <p className="text-blue-800 dark:text-blue-200 text-sm flex items-center gap-2">
                <i className="ri-information-line text-lg" />
                Pentru execuții publice (REPES) folosește modulul <strong>EXECUTARI-PUBLICE</strong> din pagina de Importuri.
              </p>
              <Link
                href="/admin/importuri/executari-publice"
                className="inline-flex items-center gap-1 mt-2 text-blue-700 dark:text-blue-300 hover:underline text-sm font-medium"
              >
                Deschide EXECUTARI-PUBLICE
                <i className="ri-arrow-right-line" />
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
