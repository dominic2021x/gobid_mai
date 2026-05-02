"use client";

/**
 * Pagină Admin - Importuri
 * Pagină centrală pentru gestionarea tuturor importurilor
 * Fiecare tip de import are propriul buton și modul separat
 */

import React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

interface ImportModule {
  id: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  href: string;
  status: 'active' | 'coming-soon';
  count?: number;
}

export default function ImporturiPage() {
  const router = useRouter();

  const importModules: ImportModule[] = [
    {
      id: 'anaf',
      name: 'ANAF',
      description: 'Import automat de licitații ANAF din PDF-uri',
      icon: 'ri-file-pdf-line',
      color: 'from-blue-500 to-blue-600',
      href: '/admin/importuri/anaf',
      status: 'active',
    },
    {
      id: 'licitatii-publice',
      name: 'Licitatii insolventa',
      description: 'Sincronizare licitații de pe licitatii-insolventa.ro',
      icon: 'ri-auction-line',
      color: 'from-emerald-500 to-teal-600',
      href: '/admin/importuri/licitatii-publice',
      status: 'active',
    },
    {
      id: 'executari-publice',
      name: 'EXECUTARI-PUBLICE',
      description: 'Sincronizare execuții publice de pe prod.executori.ro/repes',
      icon: 'ri-scales-3-line',
      color: 'from-blue-500 to-blue-600',
      href: '/admin/importuri/executari-publice',
      status: 'active',
    },
    {
      id: 'executori',
      name: 'Executori',
      description: 'Import licitații de la executorii judecătorești',
      icon: 'ri-scales-3-line',
      color: 'from-blue-500 to-blue-600',
      href: '/admin/importuri/executori',
      status: 'active',
    },
    {
      id: 'piese-auto',
      name: 'Piese auto (CSV)',
      description: 'Validare support și import CSV în contul dealerului piese auto',
      icon: 'ri-car-line',
      color: 'from-amber-500 to-orange-600',
      href: '/admin/piese-auto',
      status: 'active',
    },
    {
      id: 'alte',
      name: 'Alte Surse',
      description: 'Import din alte surse de licitații publice',
      icon: 'ri-folder-add-line',
      color: 'from-gray-500 to-gray-600',
      href: '/admin/importuri/alte',
      status: 'coming-soon',
    },
  ];

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-2">
            Importuri
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            Gestionare centralizată pentru importul automat de licitații din multiple surse
          </p>
        </div>

        {/* Quick links */}
        <div className="mb-6 flex flex-wrap items-center gap-3">
          <Link
            href="/admin/importuri/licitatii-publice"
            className="inline-flex items-center gap-2 px-5 py-3 bg-gradient-to-r from-emerald-500 to-teal-600 text-white font-semibold rounded-lg shadow hover:shadow-lg transition-all"
          >
            <img src="/images/logo-unpir.png" alt="UNPIR" className="w-6 h-6 object-contain" />
            <span>Licitatii insolventa</span>
            <i className="ri-arrow-right-line" />
          </Link>
          <Link
            href="/admin/importuri/executari-publice"
            className="inline-flex items-center gap-2 px-5 py-3 bg-gradient-to-r from-blue-500 to-blue-600 text-white font-semibold rounded-lg shadow hover:shadow-lg transition-all"
          >
            <i className="ri-scales-3-line text-xl" />
            <span>EXECUTARI-PUBLICE</span>
            <i className="ri-arrow-right-line" />
          </Link>
          <Link
            href="/admin/importuri/licitatii-publice"
            className="text-emerald-600 dark:text-emerald-400 hover:underline font-medium text-sm"
          >
            Licitatii insolventa
          </Link>
          <span className="text-gray-400 dark:text-gray-500 text-sm">·</span>
          <Link
            href="/admin/importuri/executari-publice"
            className="text-blue-600 dark:text-blue-400 hover:underline font-medium text-sm"
          >
            EXECUTARI-PUBLICE
          </Link>
        </div>

        {/* Import Modules Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {importModules.map((module) => (
            <div
              key={module.id}
              onClick={() => {
                if (module.status === 'active') {
                  router.push(module.href);
                }
              }}
              className={`relative bg-white dark:bg-gray-800 rounded-xl shadow-lg border-2 transition-all duration-300 ${
                module.status === 'active'
                  ? 'border-gray-200 dark:border-gray-700 hover:border-blue-500 dark:hover:border-blue-500 hover:shadow-xl cursor-pointer transform hover:scale-105'
                  : 'border-gray-200 dark:border-gray-700 opacity-60 cursor-not-allowed'
              }`}
            >
              {/* Status Badge */}
              {module.status === 'coming-soon' && (
                <div className="absolute top-4 right-4">
                  <span className="px-3 py-1 bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-300 text-xs font-semibold rounded-full">
                    În curând
                  </span>
                </div>
              )}

              <div className="p-6">
                {/* Icon */}
                <div className={`w-16 h-16 rounded-xl flex items-center justify-center mb-4 shadow-lg overflow-hidden ${
                  module.id === 'licitatii-publice'
                    ? 'bg-white border border-gray-200 dark:border-gray-600'
                    : module.id === 'executari-publice'
                    ? `bg-gradient-to-br ${module.color}`
                    : `bg-gradient-to-br ${module.color}`
                }`}>
                  {module.id === 'licitatii-publice' ? (
                    <img src="/images/logo-unpir.png" alt="UNPIR" className="w-full h-full object-contain" />
                  ) : (
                    <i className={`${module.icon} text-white text-2xl`}></i>
                  )}
                </div>

                {/* Title */}
                <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
                  {module.name}
                </h3>

                {/* Description */}
                <p className="text-gray-600 dark:text-gray-400 text-sm mb-4">
                  {module.description}
                </p>

                {/* Action Button */}
                {module.status === 'active' ? (
                  <button
                    type="button"
                    className={`w-full px-4 py-2 bg-gradient-to-r ${module.color} text-white rounded-lg hover:shadow-lg transition-all duration-300 font-semibold flex items-center justify-center gap-2`}
                  >
                    <i className="ri-arrow-right-line"></i>
                    <span>Deschide Modul</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled
                    className="w-full px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400 rounded-lg cursor-not-allowed font-semibold flex items-center justify-center gap-2"
                  >
                    <i className="ri-time-line"></i>
                    <span>Disponibil în curând</span>
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Info Section */}
        <div className="mt-8 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-6">
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 bg-blue-500 rounded-lg flex items-center justify-center flex-shrink-0">
              <i className="ri-information-line text-white text-xl"></i>
            </div>
            <div>
              <h3 className="text-lg font-semibold text-blue-900 dark:text-blue-100 mb-2">
                Despre Importuri
              </h3>
              <p className="text-blue-800 dark:text-blue-200 text-sm">
                Fiecare modul de import este independent și gestionează propriile surse de date. 
                Importurile se procesează automat și creează produse în sistem. 
                Poți accesa istoricul importurilor și gestiona fiecare modul separat.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}








