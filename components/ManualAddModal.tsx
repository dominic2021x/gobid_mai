'use client';

import React from 'react';

interface ManualAddModalProps {
  showModal: boolean;
  setShowModal: (show: boolean) => void;
  isDarkMode: boolean;
  manualFormData: any;
  setManualFormData: (data: any) => void;
  manualFormPriceRon: number;
  setManualFormPriceRon: (price: number) => void;
  manualFormPriceEur: number;
  setManualFormPriceEur: (price: number) => void;
  manualFormExchangeRate: number | null;
  manualFormIsFetchingRate: boolean;
  manualFormLastRateUpdate: Date | null;
  manualFormExchangeError: string | null;
  manualFormMessage: { type: 'success' | 'error'; text: string } | null;
  manualFormSkuEditable: boolean;
  setManualFormSkuEditable: (editable: boolean) => void;
  manualFormBuyNowPriceRon: number | null;
  manualFormBuyNowPriceEur: number | null;
  manualFormDiscountPercent: number | null;
  manualFormDiscountValueRon: number | null;
  manualFormDiscountedPriceRon: number | null;
  manualFormDiscountValueEur: number | null;
  manualFormDiscountedPriceEur: number | null;
  manualFormIsSubmitting: boolean;
  manualFormUserTokens: {
    balance: number;
    totalEarned: number;
    totalSpent: number;
    level: string;
    package: string;
  };
  manualFormIsGeneratingSEO: boolean;
  manualFormIsEnhancing: boolean;
  manualFormAutoEnhance: boolean;
  setManualFormAutoEnhance: (enhance: boolean) => void;
  manualFormRewriteTitle: boolean;
  setManualFormRewriteTitle: (rewrite: boolean) => void;
  manualFormRewriteDescription: boolean;
  setManualFormRewriteDescription: (rewrite: boolean) => void;
  manualFormSEO: {
    title: string;
    description: string;
    keywords: string[];
  };
  setManualFormSEO: (seo: any) => void;
  products: any[];
  categories: string[];
  subcategories: Record<string, string[]>;
  counties: string[];
  SKU_TOTAL_LENGTH: number;
  FREE_IMAGES: number;
  MAX_IMAGES: number;
  roundTo: (value: number, decimals?: number) => number;
  generateSku: (subcategory: string, existingSkus: string[]) => string;
  handleManualFormInputChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => void;
  handleManualFormRonInputChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleManualFormEurInputChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleManualFormDiscountPercentChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleManualFormDiscountValueChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleManualFormDiscountFinalPriceChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleManualFormDiscountValueEurChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleManualFormDiscountFinalPriceEurChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleManualFormBuyNowRonChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleManualFormBuyNowEurChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleManualFormFileUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleManualFormRemoveImage: (index: number) => void;
  handleManualFormSubmit: (e: React.FormEvent) => void;
  handleManualFormGenerateSEO: () => void;
  handleManualFormAutoEnhance: () => void;
  handleManualFormDynamicFieldChange: (key: string, value: string | number) => void;
  fetchManualFormExchangeRate: () => void;
  getManualFormEffectiveRate: () => number | null;
  getManualFormRateOrFallback: () => number | null;
  getManualFormDynamicFields: () => any[];
}

const ManualAddModal: React.FC<ManualAddModalProps> = ({
  showModal,
  setShowModal,
  isDarkMode,
  manualFormData,
  setManualFormData,
  manualFormPriceRon,
  manualFormPriceEur,
  manualFormExchangeRate,
  manualFormIsFetchingRate,
  manualFormLastRateUpdate,
  manualFormExchangeError,
  manualFormMessage,
  manualFormSkuEditable,
  setManualFormSkuEditable,
  manualFormBuyNowPriceRon,
  manualFormBuyNowPriceEur,
  manualFormDiscountPercent,
  manualFormDiscountValueRon,
  manualFormDiscountedPriceRon,
  manualFormDiscountValueEur,
  manualFormDiscountedPriceEur,
  manualFormIsSubmitting,
  manualFormUserTokens,
  manualFormIsGeneratingSEO,
  manualFormIsEnhancing,
  manualFormAutoEnhance,
  setManualFormAutoEnhance,
  manualFormRewriteTitle,
  setManualFormRewriteTitle,
  manualFormRewriteDescription,
  setManualFormRewriteDescription,
  manualFormSEO,
  setManualFormSEO,
  products,
  categories,
  subcategories,
  counties,
  SKU_TOTAL_LENGTH,
  FREE_IMAGES,
  MAX_IMAGES,
  roundTo,
  generateSku,
  handleManualFormInputChange,
  handleManualFormRonInputChange,
  handleManualFormEurInputChange,
  handleManualFormDiscountPercentChange,
  handleManualFormDiscountValueChange,
  handleManualFormDiscountFinalPriceChange,
  handleManualFormDiscountValueEurChange,
  handleManualFormDiscountFinalPriceEurChange,
  handleManualFormBuyNowRonChange,
  handleManualFormBuyNowEurChange,
  handleManualFormFileUpload,
  handleManualFormRemoveImage,
  handleManualFormSubmit,
  handleManualFormGenerateSEO,
  handleManualFormAutoEnhance,
  handleManualFormDynamicFieldChange,
  fetchManualFormExchangeRate,
  getManualFormEffectiveRate,
  getManualFormRateOrFallback,
  getManualFormDynamicFields,
}) => {
  if (!showModal) return null;

  const manualFormDiscountInputsDisabled = manualFormPriceRon <= 0 && manualFormPriceEur <= 0;
  const currentRate = manualFormExchangeRate && manualFormExchangeRate > 0 ? manualFormExchangeRate : null;
  const manualFormDynamicFields = getManualFormDynamicFields();

  return (
            <div 
            className="fixed inset-0 z-50 flex items-center justify-center backdrop-blur-sm p-2 sm:p-4 bg-black/40 dark:bg-black/60"
            onClick={(e) => {
              if (e.target === e.currentTarget) {
                setShowModal(false);
              }
            }}
          >
            <div className={`relative w-full max-w-6xl max-h-[95vh] overflow-hidden rounded-xl shadow-2xl ${
              isDarkMode ? 'bg-gray-800' : 'bg-white'
            }`}>
              {/* Header */}
              <div className={`flex items-center justify-between p-2 border-b ${
                isDarkMode ? 'border-gray-700' : 'border-gray-200'
              }`}>
                <div className="flex-1 min-w-0 pr-2">
                  <h2 className={`text-base font-semibold truncate ${
                    isDarkMode ? 'text-white' : 'text-gray-900'
                  }`}>
                    Adaugă Listare
                  </h2>
                </div>
                <button
                  onClick={() => setShowModal(false)}
                  className={`p-1.5 rounded-lg transition-colors ${
                    isDarkMode 
                      ? 'hover:bg-gray-700 text-gray-400 hover:text-white' 
                      : 'hover:bg-gray-100 text-gray-500 hover:text-gray-700'
                  }`}
                >
                  <i className="ri-close-line text-xl"></i>
                </button>
              </div>

              {/* Content - Formular complet */}
              <div className="overflow-y-auto" style={{ maxHeight: 'calc(95vh - 50px)' }}>
                <div className={`p-4 sm:p-6 ${
                  isDarkMode ? 'bg-gray-800' : 'bg-white'
                }`}>
                  {manualFormMessage && (
                    <div className={`mb-4 p-4 rounded-lg border ${
                      isDarkMode 
                        ? 'bg-gray-800 border-gray-700' 
                        : 'bg-gray-50 border-gray-200'
                    } ${
                      manualFormMessage.type === 'success' 
                        ? 'text-green-600 dark:text-green-400'
                        : 'text-red-600 dark:text-red-400'
                    }`}>
                      <div className="flex items-center gap-2">
                        {manualFormMessage.type === 'success' ? (
                          <i className="ri-checkbox-circle-line text-lg"></i>
                        ) : (
                          <i className="ri-error-warning-line text-lg"></i>
                        )}
                        <span>{manualFormMessage.text}</span>
                      </div>
                    </div>
                  )}

                  <form onSubmit={handleManualFormSubmit} className="space-y-6">
                    {/* Basic Information */}
                    <div className={`rounded-lg border p-4 sm:p-6 ${
                      isDarkMode ? 'border-gray-700 bg-gray-800/50' : 'border-gray-200 bg-gray-50'
                    }`}>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                          <label className={`block text-sm font-medium mb-2 ${
                            isDarkMode ? 'text-gray-300' : 'text-gray-700'
                          }`}>
                            Titlu Produs *
                          </label>
                          <input
                            type="text"
                            name="title"
                            value={manualFormData.title}
                            onChange={handleManualFormInputChange}
                            className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                              isDarkMode 
                                ? 'bg-gray-700 border-gray-600 text-white' 
                                : 'bg-white border-gray-300 text-gray-900'
                            }`}
                            placeholder="Introdu titlul produsului"
                            required
                          />
                          <div className="mt-4">
                            <div className="flex items-center justify-between mb-2">
                              <label className={`block text-sm font-medium ${
                                isDarkMode ? 'text-gray-300' : 'text-gray-700'
                              }`}>
                                SKU *
                              </label>
                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => setManualFormSkuEditable(!manualFormSkuEditable)}
                                  disabled={!manualFormData.sku}
                                  className={`text-xs font-semibold ${
                                    isDarkMode ? 'text-gray-400' : 'text-gray-600'
                                  } hover:underline disabled:opacity-50 disabled:cursor-not-allowed`}
                                >
                                  <i className="ri-edit-2-line mr-1"></i>
                                  {manualFormSkuEditable ? 'Blochează' : 'Editează SKU'}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    const existingSkus = products.map(p => p.sku).filter(Boolean);
                                    const newSku = generateSku(manualFormData.subcategory, existingSkus);
                                    if (newSku) {
                                      setManualFormData((prev: any) => ({ ...prev, sku: newSku }));
                                    }
                                  }}
                                  disabled={!manualFormData.subcategory}
                                  className={`text-xs font-semibold text-blue-600 hover:text-blue-700 disabled:opacity-50 disabled:cursor-not-allowed ${
                                    isDarkMode ? 'text-blue-400' : ''
                                  }`}
                                >
                                  <i className="ri-refresh-line mr-1"></i>
                                  Generează automat
                                </button>
                              </div>
                            </div>
                            <input
                              type="text"
                              name="sku"
                              value={manualFormData.sku}
                              onChange={handleManualFormInputChange}
                              maxLength={SKU_TOTAL_LENGTH}
                              readOnly={!manualFormSkuEditable}
                              className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 uppercase tracking-wider ${
                                manualFormSkuEditable
                                  ? `border-blue-500 focus:ring-blue-500 ${
                                      isDarkMode ? 'bg-gray-700 text-white' : 'bg-white text-gray-900'
                                    }`
                                  : `border-gray-300 focus:ring-blue-200 cursor-not-allowed ${
                                      isDarkMode ? 'bg-gray-800 text-gray-400' : 'bg-gray-50 text-gray-500'
                                    }`
                              }`}
                              placeholder="APAR176DH2"
                              required
                            />
                          </div>
                        </div>

                        <div>
                          <label className={`block text-sm font-medium ${
                            isDarkMode ? 'text-gray-300' : 'text-gray-700'
                          }`}>
                            Preț de Pornire *
                          </label>
                          {manualFormExchangeError && (
                            <p className={`mt-2 text-xs ${
                              isDarkMode ? 'text-red-400' : 'text-red-500'
                            }`}>
                              {manualFormExchangeError}
                            </p>
                          )}
                          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                            <div>
                              <label className={`mb-1 block text-xs font-semibold uppercase tracking-wide ${
                                isDarkMode ? 'text-gray-400' : 'text-gray-600'
                              }`}>
                                Valoare în Lei
                              </label>
                              <input
                                type="number"
                                inputMode="decimal"
                                min="0"
                                step="0.01"
                                value={Number.isNaN(manualFormPriceRon) || manualFormPriceRon === 0 ? '' : manualFormPriceRon}
                                onChange={handleManualFormRonInputChange}
                                className={`w-full rounded-lg border px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                                  isDarkMode
                                    ? 'border-gray-600 bg-gray-700 text-white'
                                    : 'border-gray-300 bg-white text-gray-900'
                                }`}
                                placeholder="0.00"
                              />
                            </div>
                            <div>
                              <label className={`mb-1 block text-xs font-semibold uppercase tracking-wide ${
                                isDarkMode ? 'text-gray-400' : 'text-gray-600'
                              }`}>
                                Valoare în EUR
                              </label>
                              <input
                                type="number"
                                inputMode="decimal"
                                min="0"
                                step="0.01"
                                value={Number.isNaN(manualFormPriceEur) || manualFormPriceEur === 0 ? '' : manualFormPriceEur}
                                onChange={handleManualFormEurInputChange}
                                className={`w-full rounded-lg border px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                                  isDarkMode
                                    ? 'border-gray-600 bg-gray-700 text-white'
                                    : 'border-gray-300 bg-white text-gray-900'
                                }`}
                                placeholder="0.00"
                              />
                            </div>
                          </div>
                          <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
                            <span>
                              1 EUR ≈ {(() => {
                                const rate = manualFormExchangeRate && manualFormExchangeRate > 0 ? manualFormExchangeRate : null;
                                return rate ? rate.toFixed(4) : '—';
                              })()} Lei
                            </span>
                            <span>
                              1 Lei ≈ {(() => {
                                const rate = manualFormExchangeRate && manualFormExchangeRate > 0 ? manualFormExchangeRate : null;
                                return rate ? roundTo(1 / rate, 4).toFixed(4) : '—';
                              })()} EUR
                            </span>
                            <button
                              type="button"
                              onClick={fetchManualFormExchangeRate}
                              disabled={manualFormIsFetchingRate}
                              className={`rounded-full border px-3 py-1 font-semibold transition ${
                                manualFormIsFetchingRate
                                  ? 'cursor-wait border-blue-300 text-blue-400 dark:border-blue-500 dark:text-blue-300'
                                  : 'border-blue-500 text-blue-600 hover:bg-blue-50 dark:border-blue-400 dark:text-blue-300 dark:hover:bg-blue-600/20'
                              }`}
                            >
                              {manualFormIsFetchingRate ? 'Actualizare...' : 'Actualizează cursul'}
                            </button>
                            {manualFormLastRateUpdate && (
                              <span>
                                Ultima actualizare: {manualFormLastRateUpdate.toLocaleString('ro-RO', {
                                  day: '2-digit',
                                  month: '2-digit',
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })}
                              </span>
                            )}
                          </div>

                          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
                            <div>
                              <label className={`mb-1 block text-xs font-semibold uppercase tracking-wide ${
                                isDarkMode ? 'text-gray-400' : 'text-gray-600'
                              }`}>
                                Reducere (%)
                              </label>
                              <input
                                type="number"
                                inputMode="decimal"
                                min="0"
                                max="100"
                                step="0.01"
                                value={manualFormDiscountPercent ?? ''}
                                onChange={handleManualFormDiscountPercentChange}
                                disabled={manualFormPriceRon <= 0 && manualFormPriceEur <= 0}
                                className={`w-full rounded-lg border px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                                  (manualFormPriceRon <= 0 && manualFormPriceEur <= 0)
                                    ? isDarkMode
                                      ? 'cursor-not-allowed border-dashed border-gray-600 bg-gray-800 text-gray-500'
                                      : 'cursor-not-allowed border-dashed border-gray-300 bg-gray-100 text-gray-400'
                                    : isDarkMode
                                      ? 'border-gray-600 bg-gray-700 text-white'
                                      : 'border-gray-300 bg-white text-gray-900'
                                }`}
                                placeholder="Ex: 10"
                              />
                            </div>
                            <div>
                              <label className={`mb-1 block text-xs font-semibold uppercase tracking-wide ${
                                isDarkMode ? 'text-gray-400' : 'text-gray-600'
                              }`}>
                                Reducere (Lei)
                              </label>
                              <input
                                type="number"
                                inputMode="decimal"
                                min="0"
                                step="0.01"
                                value={manualFormDiscountValueRon ?? ''}
                                onChange={handleManualFormDiscountValueChange}
                                disabled={manualFormPriceRon <= 0 && manualFormPriceEur <= 0}
                                className={`w-full rounded-lg border px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                                  (manualFormPriceRon <= 0 && manualFormPriceEur <= 0)
                                    ? isDarkMode
                                      ? 'cursor-not-allowed border-dashed border-gray-600 bg-gray-800 text-gray-500'
                                      : 'cursor-not-allowed border-dashed border-gray-300 bg-gray-100 text-gray-400'
                                    : isDarkMode
                                      ? 'border-gray-600 bg-gray-700 text-white'
                                      : 'border-gray-300 bg-white text-gray-900'
                                }`}
                                placeholder="Ex: 20"
                              />
                            </div>
                            <div>
                              <label className={`mb-1 block text-xs font-semibold uppercase tracking-wide ${
                                isDarkMode ? 'text-gray-400' : 'text-gray-600'
                              }`}>
                                Preț redus (Lei)
                              </label>
                              <input
                                type="number"
                                inputMode="decimal"
                                min="0"
                                step="0.01"
                                value={manualFormDiscountedPriceRon ?? ''}
                                onChange={handleManualFormDiscountFinalPriceChange}
                                disabled={manualFormPriceRon <= 0 && manualFormPriceEur <= 0}
                                className={`w-full rounded-lg border px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                                  (manualFormPriceRon <= 0 && manualFormPriceEur <= 0)
                                    ? isDarkMode
                                      ? 'cursor-not-allowed border-dashed border-gray-600 bg-gray-800 text-gray-500'
                                      : 'cursor-not-allowed border-dashed border-gray-300 bg-gray-100 text-gray-400'
                                    : isDarkMode
                                      ? 'border-gray-600 bg-gray-700 text-white'
                                      : 'border-gray-300 bg-white text-gray-900'
                                }`}
                                placeholder={manualFormPriceRon > 0 ? manualFormPriceRon.toFixed(2) : '0.00'}
                              />
                            </div>
                          </div>

                          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                            <div>
                              <label className={`mb-1 block text-xs font-semibold uppercase tracking-wide ${
                                isDarkMode ? 'text-gray-400' : 'text-gray-600'
                              }`}>
                                Reducere (EUR)
                              </label>
                              <input
                                type="number"
                                inputMode="decimal"
                                min="0"
                                step="0.01"
                                value={manualFormDiscountValueEur ?? ''}
                                onChange={handleManualFormDiscountValueEurChange}
                                disabled={manualFormPriceRon <= 0 && manualFormPriceEur <= 0}
                                className={`w-full rounded-lg border px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                                  (manualFormPriceRon <= 0 && manualFormPriceEur <= 0)
                                    ? isDarkMode
                                      ? 'cursor-not-allowed border-dashed border-gray-600 bg-gray-800 text-gray-500'
                                      : 'cursor-not-allowed border-dashed border-gray-300 bg-gray-100 text-gray-400'
                                    : isDarkMode
                                      ? 'border-gray-600 bg-gray-700 text-white'
                                      : 'border-gray-300 bg-white text-gray-900'
                                }`}
                                placeholder="Ex: 5"
                              />
                            </div>
                            <div>
                              <label className={`mb-1 block text-xs font-semibold uppercase tracking-wide ${
                                isDarkMode ? 'text-gray-400' : 'text-gray-600'
                              }`}>
                                Preț redus (EUR)
                              </label>
                              <input
                                type="number"
                                inputMode="decimal"
                                min="0"
                                step="0.01"
                                value={manualFormDiscountedPriceEur ?? ''}
                                onChange={handleManualFormDiscountFinalPriceEurChange}
                                disabled={manualFormPriceRon <= 0 && manualFormPriceEur <= 0}
                                className={`w-full rounded-lg border px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                                  (manualFormPriceRon <= 0 && manualFormPriceEur <= 0)
                                    ? isDarkMode
                                      ? 'cursor-not-allowed border-dashed border-gray-600 bg-gray-800 text-gray-500'
                                      : 'cursor-not-allowed border-dashed border-gray-300 bg-gray-100 text-gray-400'
                                    : isDarkMode
                                      ? 'border-gray-600 bg-gray-700 text-white'
                                      : 'border-gray-300 bg-white text-gray-900'
                                }`}
                                placeholder={manualFormPriceEur > 0 ? manualFormPriceEur.toFixed(2) : manualFormPriceRon > 0 ? (getManualFormRateOrFallback() ? (manualFormPriceRon / (getManualFormRateOrFallback() ?? 1)).toFixed(2) : '0.00') : '0.00'}
                              />
                            </div>
                          </div>

                          {(manualFormPriceRon <= 0 && manualFormPriceEur <= 0) && (
                            <p className="mt-2 text-xs text-amber-500">
                              Setează prețul de pornire înainte de a aplica reduceri.
                            </p>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Category and Location */}
                    <div className={`rounded-lg border p-4 sm:p-6 ${
                      isDarkMode ? 'border-gray-700 bg-gray-800/50' : 'border-gray-200 bg-gray-50'
                    }`}>
                      {/* Categorie și Subcategorie - pe același rând */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                          <label className={`block text-sm font-medium mb-2 ${
                            isDarkMode ? 'text-gray-300' : 'text-gray-700'
                          }`}>
                            Categorie *
                          </label>
                          <select
                            name="category"
                            value={manualFormData.category}
                            onChange={handleManualFormInputChange}
                            className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                              isDarkMode 
                                ? 'bg-gray-700 border-gray-600 text-white' 
                                : 'bg-white border-gray-300 text-gray-900'
                            }`}
                            required
                          >
                            <option value="">Selectează categoria</option>
                            {categories.map((category) => (
                              <option key={category} value={category}>{category}</option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label className={`block text-sm font-medium mb-2 ${
                            isDarkMode ? 'text-gray-300' : 'text-gray-700'
                          }`}>
                            Subcategorie *
                          </label>
                          <select
                            name="subcategory"
                            value={manualFormData.subcategory}
                            onChange={handleManualFormInputChange}
                            className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                              isDarkMode 
                                ? 'bg-gray-700 border-gray-600 text-white' 
                                : 'bg-white border-gray-300 text-gray-900'
                            }`}
                            required
                            disabled={!manualFormData.category}
                          >
                            <option value="">Selectează subcategoria</option>
                            {manualFormData.category && subcategories[manualFormData.category]?.map((subcategory) => (
                              <option key={subcategory} value={subcategory}>{subcategory}</option>
                            ))}
                          </select>
                        </div>
                      </div>

                      {/* Județ și Oraș */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
                        <div>
                          <label className={`block text-sm font-medium mb-2 ${
                            isDarkMode ? 'text-gray-300' : 'text-gray-700'
                          }`}>
                            Județ
                          </label>
                          <select
                            name="county"
                            value={manualFormData.county || ''}
                            onChange={handleManualFormInputChange}
                            className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                              isDarkMode 
                                ? 'bg-gray-700 border-gray-600 text-white' 
                                : 'bg-white border-gray-300 text-gray-900'
                            }`}
                          >
                            <option value="">Selectează județul</option>
                            {counties.map((county) => (
                              <option key={county} value={county}>{county}</option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label className={`block text-sm font-medium mb-2 ${
                            isDarkMode ? 'text-gray-300' : 'text-gray-700'
                          }`}>
                            Oraș
                          </label>
                          <input
                            type="text"
                            name="city"
                            value={manualFormData.city || ''}
                            onChange={handleManualFormInputChange}
                            className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                              isDarkMode 
                                ? 'bg-gray-700 border-gray-600 text-white' 
                                : 'bg-white border-gray-300 text-gray-900'
                            }`}
                            placeholder="Introdu numele orașului"
                          />
                        </div>
                      </div>

                      {/* Toate câmpurile specifice subcategoriei – în aceeași secțiune cu Categorie/Județ/Oraș */}
                      {manualFormDynamicFields.length > 0 && (
                        <div className="mt-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                          {manualFormDynamicFields.map((field) => (
                            <div key={field.key}>
                              <label className={`block text-sm font-medium mb-2 ${
                                field.required 
                                  ? (isDarkMode ? 'text-gray-300' : 'text-gray-700')
                                  : (isDarkMode ? 'text-gray-400' : 'text-gray-600')
                              }`}>
                                {field.label}
                              </label>
                              {field.type === 'select' ? (
                                <select
                                  value={manualFormData.customFields?.[field.key] || ''}
                                  onChange={(e) => handleManualFormDynamicFieldChange(field.key, e.target.value)}
                                  required={field.required}
                                  className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${isDarkMode ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300 text-gray-900'}`}
                                >
                                  <option value="">Selectează...</option>
                                  {field.options?.map((option: string) => (
                                    <option key={option} value={option}>{option}</option>
                                  ))}
                                </select>
                              ) : field.type === 'number' ? (
                                <input
                                  type="number"
                                  value={manualFormData.customFields?.[field.key] ?? ''}
                                  onChange={(e) => handleManualFormDynamicFieldChange(field.key, parseFloat(e.target.value) || 0)}
                                  placeholder={field.placeholder}
                                  required={field.required}
                                  min={field.min}
                                  max={field.max}
                                  step={field.step || 1}
                                  className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${isDarkMode ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300 text-gray-900'}`}
                                />
                              ) : field.type === 'textarea' ? (
                                <textarea
                                  value={manualFormData.customFields?.[field.key] || ''}
                                  onChange={(e) => handleManualFormDynamicFieldChange(field.key, e.target.value)}
                                  placeholder={field.placeholder}
                                  required={field.required}
                                  rows={3}
                                  className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${isDarkMode ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300 text-gray-900'}`}
                                />
                              ) : (
                                <input
                                  type="text"
                                  value={manualFormData.customFields?.[field.key] || ''}
                                  onChange={(e) => handleManualFormDynamicFieldChange(field.key, e.target.value)}
                                  placeholder={field.placeholder}
                                  required={field.required}
                                  className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${isDarkMode ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300 text-gray-900'}`}
                                />
                              )}
                            </div>
                          ))}
                        </div>
                      )}

                      <div className="mt-6">
                        <label className={`block text-sm font-medium mb-2 ${
                          isDarkMode ? 'text-gray-300' : 'text-gray-700'
                        }`}>
                          Descriere *
                        </label>
                        <textarea
                          name="description"
                          value={manualFormData.description}
                          onChange={handleManualFormInputChange}
                          rows={4}
                          className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                            isDarkMode 
                              ? 'bg-gray-700 border-gray-600 text-white' 
                              : 'bg-white border-gray-300 text-gray-900'
                          }`}
                          placeholder="Descrie produsul în detaliu..."
                          required
                        />
                      </div>
                    </div>

                    {/* Imagini și Fișiere */}
                    <div className={`rounded-lg border p-4 sm:p-6 ${
                      isDarkMode ? 'border-gray-700 bg-gray-800/50' : 'border-gray-200 bg-gray-50'
                    }`}>
                      <h3 className={`text-base font-semibold mb-4 ${
                        isDarkMode ? 'text-white' : 'text-gray-900'
                      }`}>
                        Imagini și Fișiere
                      </h3>
                      
                      <div className={`border-2 border-dashed rounded-lg p-6 text-center transition-all ${
                        manualFormData.images.length >= MAX_IMAGES
                          ? 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 opacity-60'
                          : 'border-gray-300 dark:border-gray-600 hover:border-blue-400 dark:hover:border-blue-500'
                      }`}>
                        <input
                          type="file"
                          id="manual-file-upload"
                          multiple
                          accept="image/*,.zip"
                          onChange={handleManualFormFileUpload}
                          disabled={manualFormData.images.length >= MAX_IMAGES}
                          className="hidden"
                        />
                        <label
                          htmlFor="manual-file-upload"
                          className={`flex flex-col items-center ${
                            manualFormData.images.length >= MAX_IMAGES ? 'cursor-not-allowed' : 'cursor-pointer'
                          }`}
                        >
                          <i className={`ri-upload-cloud-2-line text-4xl mb-2 ${
                            manualFormData.images.length >= MAX_IMAGES ? 'text-gray-300 dark:text-gray-600' : 'text-gray-400 dark:text-gray-500'
                          }`}></i>
                          <p className={`mb-2 ${
                            manualFormData.images.length >= MAX_IMAGES 
                              ? 'text-gray-400 dark:text-gray-600' 
                              : (isDarkMode ? 'text-gray-400' : 'text-gray-600')
                          }`}>
                            {manualFormData.images.length >= MAX_IMAGES 
                              ? 'Limita de 20 imagini atinsă'
                              : 'Trage fișierele aici sau click pentru a selecta'}
                          </p>
                          <p className={`text-sm ${
                            isDarkMode ? 'text-gray-400' : 'text-gray-500'
                          }`}>
                            Suportă imagini (JPG, PNG, GIF) și fișiere .zip (max 10MB per fișier)
                          </p>
                          <div className="mt-2 space-y-1">
                            <p className={`text-xs font-semibold ${
                              manualFormData.images.length >= MAX_IMAGES
                                ? 'text-red-500 dark:text-red-400'
                                : manualFormData.images.length >= FREE_IMAGES
                                ? 'text-yellow-600 dark:text-yellow-400'
                                : (isDarkMode ? 'text-gray-500' : 'text-gray-400')
                            }`}>
                              {manualFormData.images.length}/{MAX_IMAGES} imagini
                            </p>
                            {manualFormData.images.length < FREE_IMAGES ? (
                              <p className={`text-xs ${
                                isDarkMode ? 'text-green-400' : 'text-green-600'
                              }`}>
                                {FREE_IMAGES - manualFormData.images.length === 1 
                                  ? '1 poza gratuită rămasă'
                                  : `${FREE_IMAGES - manualFormData.images.length} poze gratuite rămase`}
                              </p>
                            ) : (
                              <p className={`text-xs ${
                                isDarkMode ? 'text-amber-400' : 'text-amber-600'
                              }`}>
                                {manualFormData.images.length - FREE_IMAGES > 0 ? `${manualFormData.images.length - FREE_IMAGES} ${manualFormData.images.length - FREE_IMAGES > 1 ? 'poze' : 'poză'} cu token${manualFormData.images.length - FREE_IMAGES > 1 ? 'uri' : ''}` : ''} • {manualFormUserTokens.balance} token{manualFormUserTokens.balance !== 1 ? 'uri' : ''} disponibil{manualFormUserTokens.balance !== 1 ? 'e' : ''}
                              </p>
                            )}
                            {manualFormData.images.length >= FREE_IMAGES && (
                              <p className={`text-xs ${
                                isDarkMode ? 'text-blue-400' : 'text-blue-600'
                              }`}>
                                1 token = 1 poza peste cele {FREE_IMAGES} gratuite
                              </p>
                            )}
                          </div>
                        </label>
                      </div>

                      {manualFormData.images.length > 0 && (
                        <div className="mt-4">
                          <h4 className={`text-sm font-medium mb-2 ${
                            isDarkMode ? 'text-gray-300' : 'text-gray-700'
                          }`}>
                            Fișiere încărcate:
                          </h4>
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            {manualFormData.images.map((image: string | { name?: string; size?: number }, index: number) => (
                              <div key={index} className="relative">
                                {typeof image === 'string' ? (
                                  <div className={`aspect-square rounded-lg overflow-hidden ${
                                    isDarkMode ? 'bg-gray-700' : 'bg-gray-100'
                                  }`}>
                                    <img
                                      src={image}
                                      alt={`Preview ${index + 1}`}
                                      className="w-full h-full object-cover"
                                    />
                                  </div>
                                ) : (
                                  <div className={`aspect-square rounded-lg flex items-center justify-center ${
                                    isDarkMode ? 'bg-gray-700' : 'bg-gray-100'
                                  }`}>
                                    <div className="text-center">
                                      <div className="text-2xl mb-1">📦</div>
                                      <div className={`text-xs truncate ${
                                        isDarkMode ? 'text-gray-400' : 'text-gray-600'
                                      }`}>
                                        {image.name}
                                      </div>
                                      <div className={`text-xs ${
                                        isDarkMode ? 'text-gray-400' : 'text-gray-500'
                                      }`}>
                                        {(((image as { size?: number }).size ?? 0) / 1024 / 1024).toFixed(1)} MB
                                      </div>
                                    </div>
                                  </div>
                                )}
                                <button
                                  type="button"
                                  onClick={() => handleManualFormRemoveImage(index)}
                                  className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-sm hover:bg-red-600"
                                >
                                  ×
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* GoBid AI Options - Informații de Bază */}
                    <div className={`rounded-lg border p-4 sm:p-6 ${
                      isDarkMode ? 'border-gray-700 bg-gray-800/50' : 'border-gray-200 bg-gray-50'
                    }`}>
                      <div className="flex items-center justify-between mb-4">
                        <h3 className={`text-base font-semibold ${
                          isDarkMode ? 'text-white' : 'text-gray-900'
                        }`}>
                          Informații de Bază
                        </h3>
                        <button
                          type="button"
                          onClick={handleManualFormAutoEnhance}
                          disabled={manualFormIsEnhancing || !manualFormData.title.trim() || !manualFormData.description.trim()}
                          className={`px-4 py-2 rounded-lg transition-all flex items-center gap-2 text-sm font-medium shadow-lg ${
                            manualFormIsEnhancing || !manualFormData.title.trim() || !manualFormData.description.trim()
                              ? 'bg-gray-400 cursor-not-allowed text-white'
                              : 'bg-gradient-to-r from-blue-600 to-blue-600 hover:from-blue-700 hover:to-blue-700 text-white'
                          }`}
                          title="GoBid AI rescrie instant titlul, descrierea și meta SEO"
                        >
                          {manualFormIsEnhancing ? (
                            <>
                              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                              <span>Procesează...</span>
                            </>
                          ) : (
                            <>
                              <i className="ri-sparkling-2-fill"></i>
                              <span>Optimizează cu GoBid AI</span>
                            </>
                          )}
                        </button>
                      </div>

                      {/* Auto-enhance checkbox cu opțiuni de rescriere */}
                      <div className={`p-4 rounded-lg border ${
                        isDarkMode 
                          ? 'bg-gradient-to-r from-blue-900/20 to-blue-900/20 border-blue-800' 
                          : 'bg-gradient-to-r from-blue-50 to-blue-50 border-blue-200'
                      }`}>
                        {/* Checkbox principal */}
                        <label className="flex items-center gap-2 cursor-pointer mb-3">
                          <input
                            type="checkbox"
                            checked={manualFormAutoEnhance}
                            onChange={(e) => setManualFormAutoEnhance(e.target.checked)}
                            className={`w-5 h-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500 ${
                              isDarkMode ? 'border-gray-600' : ''
                            }`}
                          />
                          <div className="flex-1">
                            <span className={`text-sm font-semibold ${
                              isDarkMode ? 'text-white' : 'text-gray-900'
                            }`}>
                              GoBid AI rescrie titlul, descrierea și meta SEO
                            </span>
                            <p className={`text-xs mt-0.5 ${
                              isDarkMode ? 'text-gray-400' : 'text-gray-600'
                            }`}>
                              Bifează dacă vrei ca la salvare GoBid AI să rescrie titlul, descrierea și meta SEO (altfel rămân textele tale).
                            </p>
                          </div>
                        </label>

                        {/* Opțiuni de rescriere - doar când autoEnhance este activat */}
                        {manualFormAutoEnhance && (
                          <div className={`ml-7 mt-3 space-y-2 border-t pt-3 ${
                            isDarkMode ? 'border-blue-700' : 'border-blue-200'
                          }`}>
                            <label className="flex items-center gap-2 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={manualFormRewriteTitle}
                                onChange={(e) => setManualFormRewriteTitle(e.target.checked)}
                                className={`w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 ${
                                  isDarkMode ? 'border-gray-600' : ''
                                }`}
                              />
                              <span className={`text-sm ${
                                isDarkMode ? 'text-gray-300' : 'text-gray-700'
                              }`}>
                                GoBid AI rescrie titlul
                              </span>
                            </label>
                            <label className="flex items-center gap-2 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={manualFormRewriteDescription}
                                onChange={(e) => setManualFormRewriteDescription(e.target.checked)}
                                className={`w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 ${
                                  isDarkMode ? 'border-gray-600' : ''
                                }`}
                              />
                              <span className={`text-sm ${
                                isDarkMode ? 'text-gray-300' : 'text-gray-700'
                              }`}>
                                GoBid AI rescrie descrierea
                              </span>
                            </label>
                            <p className={`text-xs pl-6 ${
                              isDarkMode ? 'text-gray-400' : 'text-gray-600'
                            }`}>
                              SEO meta (opțional) este completat automat de GoBid AI dacă alegi butonul de generare.
                            </p>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* SEO cu GoBid AI */}
                    <div className={`rounded-lg border p-4 sm:p-6 ${
                      isDarkMode ? 'border-gray-700 bg-gray-800/50' : 'border-gray-200 bg-gray-50'
                    }`}>
                      <div className="flex items-center justify-between mb-2">
                        <h3 className={`text-base font-semibold ${
                          isDarkMode ? 'text-white' : 'text-gray-900'
                        }`}>
                          SEO cu GoBid AI
                        </h3>
                        <button
                          type="button"
                          onClick={handleManualFormGenerateSEO}
                          disabled={manualFormIsGeneratingSEO || !manualFormData.title?.trim() || !manualFormData.description?.trim()}
                          className={`px-4 py-2 rounded-lg transition-all flex items-center gap-2 text-sm font-medium ${
                            manualFormIsGeneratingSEO || !manualFormData.title?.trim() || !manualFormData.description?.trim()
                              ? 'bg-gray-400 cursor-not-allowed text-white'
                              : 'bg-gradient-to-r from-blue-600 to-blue-600 hover:from-blue-700 hover:to-blue-700 text-white'
                          }`}
                          title="GoBid AI generează automat meta titlu, descriere și cuvinte cheie"
                        >
                          {manualFormIsGeneratingSEO ? (
                            <>
                              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                              <span>Generează...</span>
                            </>
                          ) : (
                            <>
                              <i className="ri-magic-line"></i>
                              <span>Regenerează SEO cu GoBid AI</span>
                            </>
                          )}
                        </button>
                      </div>
                      <p className={`text-xs mb-4 ${
                        isDarkMode ? 'text-gray-400' : 'text-gray-600'
                      }`}>
                        GoBid AI completează automat câmpurile SEO la salvare; poți ajusta manual oricând sau folosi butonul pentru o nouă sugestie.
                      </p>
                      
                      <div className="space-y-4">
                        <div>
                          <div className="flex items-center justify-between mb-2">
                            <label className={`block text-sm font-medium ${
                              isDarkMode ? 'text-gray-300' : 'text-gray-700'
                            }`}>
                              Titlu SEO
                            </label>
                            <span className={`text-xs ${
                              ((manualFormSEO.title?.length || 0) > 65) ? 'text-red-500' : 
                              ((manualFormSEO.title?.length || 0) > 60) ? 'text-yellow-500' : 
                              (isDarkMode ? 'text-gray-400' : 'text-gray-500')
                            }`}>
                              {(manualFormSEO.title?.length || 0)}/65
                            </span>
                          </div>
                          <input
                            type="text"
                            value={manualFormSEO.title}
                            onChange={(e) => setManualFormSEO((prev: any) => ({ ...prev, title: e.target.value }))}
                            maxLength={65}
                            className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 ${
                              isDarkMode ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300 text-gray-900'
                            } ${
                              ((manualFormSEO.title?.length || 0) > 65) 
                                ? 'border-red-500 focus:ring-red-500' 
                                : ((manualFormSEO.title?.length || 0) > 60)
                                ? 'border-yellow-500 focus:ring-yellow-500'
                                : 'focus:ring-blue-500'
                            }`}
                            placeholder="Titlu pentru motoarele de căutare (max 65 caractere)"
                          />
                          <p className={`text-xs mt-1 ${
                            isDarkMode ? 'text-gray-400' : 'text-gray-500'
                          }`}>
                            Recomandat: 50-60 caractere pentru rezultate optime
                          </p>
                        </div>

                        <div>
                          <div className="flex items-center justify-between mb-2">
                            <label className={`block text-sm font-medium ${
                              isDarkMode ? 'text-gray-300' : 'text-gray-700'
                            }`}>
                              Descriere SEO
                            </label>
                            <span className={`text-xs ${
                              ((manualFormSEO.description?.length || 0) > 160) ? 'text-red-500' : 
                              ((manualFormSEO.description?.length || 0) > 155) ? 'text-yellow-500' : 
                              (isDarkMode ? 'text-gray-400' : 'text-gray-500')
                            }`}>
                              {(manualFormSEO.description?.length || 0)}/160
                            </span>
                          </div>
                          <textarea
                            value={manualFormSEO.description}
                            onChange={(e) => setManualFormSEO((prev: any) => ({ ...prev, description: e.target.value }))}
                            rows={3}
                            maxLength={160}
                            className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 ${
                              isDarkMode ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300 text-gray-900'
                            } ${
                              ((manualFormSEO.description?.length || 0) > 160) 
                                ? 'border-red-500 focus:ring-red-500' 
                                : ((manualFormSEO.description?.length || 0) > 155)
                                ? 'border-yellow-500 focus:ring-yellow-500'
                                : 'focus:ring-blue-500'
                            }`}
                            placeholder="Descriere pentru motoarele de căutare (max 160 caractere)"
                          />
                          <p className={`text-xs mt-1 ${
                            isDarkMode ? 'text-gray-400' : 'text-gray-500'
                          }`}>
                            Recomandat: 150-160 caractere pentru rezultate optime
                          </p>
                        </div>

                        <div>
                          <label className={`block text-sm font-medium mb-2 ${
                            isDarkMode ? 'text-gray-300' : 'text-gray-700'
                          }`}>
                            Cuvinte Cheie (separate prin virgulă)
                          </label>
                          <input
                            type="text"
                            value={manualFormSEO.keywords.join(', ')}
                            onChange={(e) => setManualFormSEO((prev: any) => ({ 
                              ...prev, 
                              keywords: e.target.value.split(',').map((k: string) => k.trim()).filter((k: string) => k)
                            }))}
                            className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                              isDarkMode 
                                ? 'bg-gray-700 border-gray-600 text-white' 
                                : 'bg-white border-gray-300 text-gray-900'
                            }`}
                            placeholder="cuvant1, cuvant2, cuvant3"
                          />
                          <p className={`text-xs mt-1 ${
                            isDarkMode ? 'text-gray-400' : 'text-gray-500'
                          }`}>
                            GoBid AI propune automat cuvinte cheie relevante; editează lista dacă vrei termeni personalizați.
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Status */}
                    <div className={`rounded-lg border p-4 sm:p-6 ${
                      isDarkMode ? 'border-gray-700 bg-gray-800/50' : 'border-gray-200 bg-gray-50'
                    }`}>
                      <label className={`block text-sm font-medium mb-2 ${
                        isDarkMode ? 'text-gray-300' : 'text-gray-700'
                      }`}>
                        Status
                      </label>
                      <div className="flex gap-4">
                        <label className="flex items-center gap-2">
                          <input
                            type="radio"
                            name="status"
                            value="draft"
                            checked={manualFormData.status === 'draft'}
                            onChange={handleManualFormInputChange}
                            className="h-4 w-4"
                          />
                          <span className={isDarkMode ? 'text-gray-300' : 'text-gray-700'}>Draft</span>
                        </label>
                        <label className="flex items-center gap-2">
                          <input
                            type="radio"
                            name="status"
                            value="active"
                            checked={manualFormData.status === 'active'}
                            onChange={handleManualFormInputChange}
                            className="h-4 w-4"
                          />
                          <span className={isDarkMode ? 'text-gray-300' : 'text-gray-700'}>Activ</span>
                        </label>
                      </div>
                    </div>

                    {/* Submit Button */}
                    <div className="flex justify-end gap-4">
                      <button
                        type="button"
                        onClick={() => setShowModal(false)}
                        className={`px-6 py-2 rounded-lg font-medium transition-colors ${
                          isDarkMode
                            ? 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                            : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                        }`}
                      >
                        Anulează
                      </button>
                      <button
                        type="submit"
                        disabled={manualFormIsSubmitting}
                        className={`px-6 py-2 rounded-lg font-medium transition-colors ${
                          manualFormIsSubmitting
                            ? 'bg-gray-400 cursor-not-allowed'
                            : isDarkMode
                              ? 'bg-blue-600 hover:bg-blue-700 text-white'
                              : 'bg-blue-500 hover:bg-blue-600 text-white'
                        }`}
                      >
                        {manualFormIsSubmitting ? 'Se salvează...' : 'Salvează Produsul'}
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            </div>
          </div>
  );
};

export default ManualAddModal;
