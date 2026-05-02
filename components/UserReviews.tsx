"use client";

import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

interface Review {
  id: string;
  reviewer_user_id: string;
  reviewed_user_id: string;
  product_id: string;
  rating: number;
  review_text: string | null;
  review_type: 'seller' | 'buyer';
  is_verified: boolean;
  created_at: string;
  reviewer?: {
    user_profiles?: {
      first_name: string | null;
      last_name: string | null;
      avatar_url: string | null;
    }[];
  };
}

interface UserReviewsProps {
  userId: string;
  reviewType?: 'seller' | 'buyer';
  isDarkMode?: boolean;
  showAddReview?: boolean;
  productId?: string;
}

export default function UserReviews({
  userId,
  reviewType,
  isDarkMode = false,
  showAddReview = false,
  productId,
}: UserReviewsProps) {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [avgRating, setAvgRating] = useState<number>(0);
  const [reviewCount, setReviewCount] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);
  const [showAddForm, setShowAddForm] = useState<boolean>(false);
  const [newRating, setNewRating] = useState<number>(0);
  const [newReviewText, setNewReviewText] = useState<string>('');
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [criteriaRatings, setCriteriaRatings] = useState<{
    comportament: number;
    deIncredere: number;
    comunicare: number;
    experientaGenerala: number;
  }>({
    comportament: 0,
    deIncredere: 0,
    comunicare: 0,
    experientaGenerala: 0,
  });
  const [showTooltip, setShowTooltip] = useState<string | null>(null);
  const [notification, setNotification] = useState<{
    show: boolean;
    message: string;
    type: 'success' | 'error' | 'info' | 'warning';
  } | null>(null);

  useEffect(() => {
    if (userId) {
      loadReviews();
    }
  }, [userId, reviewType, productId]);

  const loadReviews = async () => {
    if (!userId) {
      console.warn('[UserReviews] No userId provided');
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const params = new URLSearchParams();
      params.append('userId', userId);
      if (reviewType) {
        params.append('reviewType', reviewType);
      }
      if (productId) {
        params.append('productId', productId);
      }

      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;

      console.log('[UserReviews] Loading reviews for userId:', userId, 'reviewType:', reviewType);

      const response = await fetch(`/api/reviews?${params.toString()}`, {
        headers: token ? {
          'Authorization': `Bearer ${token}`,
        } : {},
      });

      console.log('[UserReviews] API response status:', response.status);

      if (response.ok) {
        const result = await response.json();
        console.log('[UserReviews] API result:', result);
        if (result.success) {
          setReviews(result.reviews || []);
          setAvgRating(result.avgRating || 0);
          setReviewCount(result.reviewCount || 0);
        } else {
          console.error('[UserReviews] API returned success=false:', result);
        }
      } else {
        const errorText = await response.text();
        console.error('[UserReviews] API error:', response.status, errorText);
      }
    } catch (error) {
      console.error('[UserReviews] Error loading reviews:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmitReview = async () => {
    // Calculează rating-ul mediu din toate criteriile
    const ratings = [
      criteriaRatings.comportament,
      criteriaRatings.deIncredere,
      criteriaRatings.comunicare,
      criteriaRatings.experientaGenerala,
    ].filter(r => r > 0);
    
    if (ratings.length === 0) {
      setNotification({
        show: true,
        message: 'Te rugăm să evaluezi cel puțin un criteriu (1-5 stele)',
        type: 'warning'
      });
      setTimeout(() => setNotification(null), 4000);
      return;
    }

    const avgRating = Math.round(ratings.reduce((a, b) => a + b, 0) / ratings.length);

    try {
      setSubmitting(true);
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;

      if (!token) {
        setNotification({
          show: true,
          message: 'Trebuie să fii autentificat pentru a lăsa un review',
          type: 'error'
        });
        setTimeout(() => setNotification(null), 4000);
        return;
      }

      // Adaugă detaliile criteriilor în review_text
      const reviewTextWithCriteria = newReviewText 
        ? `${newReviewText}\n\n[Criterii: Comportament ${criteriaRatings.comportament}/5, De încredere ${criteriaRatings.deIncredere}/5, Comunicare ${criteriaRatings.comunicare}/5, Experiență generală ${criteriaRatings.experientaGenerala}/5]`
        : `[Criterii: Comportament ${criteriaRatings.comportament}/5, De încredere ${criteriaRatings.deIncredere}/5, Comunicare ${criteriaRatings.comunicare}/5, Experiență generală ${criteriaRatings.experientaGenerala}/5]`;

      const response = await fetch('/api/reviews', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          reviewed_user_id: userId,
          product_id: productId || null,
          rating: avgRating,
          review_text: reviewTextWithCriteria,
          review_type: reviewType || 'seller',
        }),
      });

      if (response.ok) {
        const result = await response.json();
        if (result.success) {
          setNewRating(0);
          setNewReviewText('');
          setCriteriaRatings({
            comportament: 0,
            deIncredere: 0,
            comunicare: 0,
            experientaGenerala: 0,
          });
          setShowAddForm(false);
          await loadReviews();
          setNotification({
            show: true,
            message: result.message || 'Review adăugat cu succes!',
            type: 'success'
          });
          setTimeout(() => setNotification(null), 4000);
        }
      } else {
        const error = await response.json();
        setNotification({
          show: true,
          message: error.error || 'Eroare la adăugarea review-ului',
          type: 'error'
        });
        setTimeout(() => setNotification(null), 5000);
      }
    } catch (error) {
      console.error('[UserReviews] Error submitting review:', error);
      setNotification({
        show: true,
        message: 'Eroare la adăugarea review-ului',
        type: 'error'
      });
      setTimeout(() => setNotification(null), 5000);
    } finally {
      setSubmitting(false);
    }
  };

  const renderStars = (rating: number, interactive: boolean = false, onStarClick?: (rating: number) => void) => {
    return (
      <div className="flex items-center gap-0.5 sm:gap-1">
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            type={interactive ? 'button' : undefined}
            onClick={interactive && onStarClick ? () => onStarClick(star) : undefined}
            className={interactive ? 'cursor-pointer hover:scale-110 transition-transform' : ''}
            disabled={!interactive}
          >
            <i
              className={`text-base sm:text-lg lg:text-xl ${
                star <= rating
                  ? 'ri-star-fill text-yellow-400'
                  : 'ri-star-line text-gray-400'
              }`}
            ></i>
          </button>
        ))}
      </div>
    );
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('ro-RO', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  const getReviewerName = (review: Review) => {
    if (review.reviewer?.user_profiles && review.reviewer.user_profiles.length > 0) {
      const profile = review.reviewer.user_profiles[0];
      const firstName = profile.first_name || '';
      const lastName = profile.last_name || '';
      const fullName = `${firstName} ${lastName}`.trim();
      if (fullName) return fullName;
    }
    return 'Utilizator anonim';
  };

  const getReviewerAvatar = (review: Review) => {
    if (review.reviewer?.user_profiles && review.reviewer.user_profiles.length > 0) {
      return review.reviewer.user_profiles[0].avatar_url;
    }
    return null;
  };

  if (loading) {
    return (
      <div className={`text-center py-8 ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 mx-auto border-blue-500"></div>
        <p className="mt-2">Se încarcă review-urile...</p>
      </div>
    );
  }

  return (
    <div className={`w-full ${isDarkMode ? 'text-white' : 'text-gray-900'} relative min-h-0`}>
      {/* Modern Toast Notification - Centered */}
      {notification && notification.show && (
        <div
          className={`fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[9999] min-w-[320px] max-w-md rounded-xl shadow-2xl transform transition-all duration-300 ${
            notification.show ? 'scale-100 opacity-100' : 'scale-95 opacity-0'
          } ${
            notification.type === 'success'
              ? isDarkMode
                ? 'bg-gradient-to-r from-green-600 to-green-700 border border-green-500/50'
                : 'bg-gradient-to-r from-green-500 to-green-600 border border-green-400'
              : notification.type === 'error'
              ? isDarkMode
                ? 'bg-gradient-to-r from-red-600 to-red-700 border border-red-500/50'
                : 'bg-gradient-to-r from-red-500 to-red-600 border border-red-400'
              : notification.type === 'warning'
              ? isDarkMode
                ? 'bg-gradient-to-r from-yellow-600 to-yellow-700 border border-yellow-500/50'
                : 'bg-gradient-to-r from-yellow-500 to-yellow-600 border border-yellow-400'
              : isDarkMode
              ? 'bg-gradient-to-r from-blue-600 to-blue-700 border border-blue-500/50'
              : 'bg-gradient-to-r from-blue-500 to-blue-600 border border-blue-400'
          }`}
          style={{
            animation: 'fadeInScale 0.3s ease-out'
          }}
        >
          <div className="p-4 flex items-start gap-3">
            <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
              isDarkMode ? 'bg-white/20' : 'bg-white/30'
            }`}>
              {notification.type === 'success' && (
                <i className="ri-check-line text-white text-lg"></i>
              )}
              {notification.type === 'error' && (
                <i className="ri-error-warning-line text-white text-lg"></i>
              )}
              {notification.type === 'warning' && (
                <i className="ri-alert-line text-white text-lg"></i>
              )}
              {notification.type === 'info' && (
                <i className="ri-information-line text-white text-lg"></i>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className={`text-sm font-semibold text-white break-words`}>
                {notification.message}
              </p>
            </div>
            <button
              onClick={() => setNotification(null)}
              className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center transition-all hover:scale-110 ${
                isDarkMode ? 'bg-white/20 hover:bg-white/30' : 'bg-white/30 hover:bg-white/40'
              }`}
            >
              <i className="ri-close-line text-white text-sm"></i>
            </button>
          </div>
          {/* Progress bar */}
          <div className={`h-1 ${
            isDarkMode ? 'bg-white/20' : 'bg-white/30'
          }`}>
            <div
              className={`h-full bg-white`}
              style={{
                animation: 'shrink 4s linear forwards'
              }}
            ></div>
          </div>
        </div>
      )}
      
      {/* Header cu rating mediu */}
      <div className={`mb-3 sm:mb-4 lg:mb-6 p-3 sm:p-4 rounded-lg sm:rounded-xl ${
        isDarkMode 
          ? 'bg-gray-800 border border-gray-700' 
          : 'bg-gray-50 border border-gray-200'
      }`}>
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex-1">
            <h3 className={`text-sm sm:text-base lg:text-lg font-bold mb-1 sm:mb-2 ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
              {reviewType === 'seller' ? 'Review-uri ca vânzător' : 'Review-uri ca cumpărător'}
            </h3>
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-4">
              <div className="flex items-center gap-2">
                {renderStars(Math.round(avgRating))}
                <span className={`text-base sm:text-lg font-semibold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                  {avgRating.toFixed(1)}
                </span>
              </div>
              <span className={`text-xs sm:text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                ({reviewCount} {reviewCount === 1 ? 'review' : 'review-uri'})
              </span>
            </div>
          </div>
          {showAddReview && (
            <button
              onClick={() => setShowAddForm(!showAddForm)}
              className={`px-3 py-1.5 sm:px-4 sm:py-2 rounded-lg text-xs sm:text-sm font-medium transition-all whitespace-nowrap ${
                isDarkMode
                  ? 'bg-blue-600 hover:bg-blue-700 text-white'
                  : 'bg-blue-500 hover:bg-blue-600 text-white'
              }`}
            >
              {showAddForm ? 'Anulează' : 'Adaugă review'}
            </button>
          )}
        </div>
      </div>

      {/* Formular pentru adăugare review - Complex cu criterii */}
      {showAddForm && showAddReview && (
        <div className={`mb-3 sm:mb-4 lg:mb-6 p-3 sm:p-4 lg:p-6 rounded-lg sm:rounded-xl border-2 ${
          isDarkMode 
            ? 'bg-gradient-to-br from-gray-800 to-gray-900 border-gray-700' 
            : 'bg-gradient-to-br from-white to-gray-50 border-gray-200'
        } shadow-xl`}>
          <h4 className={`text-sm sm:text-base lg:text-lg font-bold mb-2 ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
            Lasă un review
          </h4>
          
          {/* Text explicativ despre rating - Ascuns pe mobil foarte mic */}
          <div className={`mb-3 sm:mb-4 lg:mb-6 p-2 sm:p-3 lg:p-4 rounded-lg hidden sm:block ${
            isDarkMode 
              ? 'bg-blue-900/20 border border-blue-800/30' 
              : 'bg-blue-50 border border-blue-200'
          }`}>
            <p className={`text-xs sm:text-sm leading-relaxed ${isDarkMode ? 'text-blue-200' : 'text-blue-800'}`}>
              <strong>Evaluează utilizatorul cu stele (1–5):</strong><br />
              ⭐ = foarte slab / deloc<br />
              ⭐⭐⭐⭐⭐ = excelent<br />
              Alege stelele pentru fiecare criteriu și lasă un comentariu sincer despre experiența ta.
            </p>
          </div>

          <div className="space-y-3 sm:space-y-4 lg:space-y-6">
            {/* Criteriu 1: Comportament / Atitudine */}
            <div className={`p-2 sm:p-3 lg:p-4 rounded-lg border ${
              isDarkMode 
                ? 'bg-gray-800/50 border-gray-700' 
                : 'bg-white border-gray-200'
            }`}>
              <div className="flex items-center gap-2 mb-2 sm:mb-3">
                <label className={`text-xs sm:text-sm font-semibold ${isDarkMode ? 'text-gray-200' : 'text-gray-800'}`}>
                  <span className="hidden sm:inline">Comportament / Atitudine</span>
                  <span className="sm:hidden">Comportament</span>
                </label>
                <div className="relative">
                  <button
                    type="button"
                    onMouseEnter={() => setShowTooltip('comportament')}
                    onMouseLeave={() => setShowTooltip(null)}
                    className={`w-5 h-5 rounded-full flex items-center justify-center ${
                      isDarkMode ? 'text-gray-400 hover:text-blue-400' : 'text-gray-500 hover:text-blue-600'
                    } transition-colors`}
                  >
                    <i className="ri-information-line text-sm"></i>
                  </button>
                  {showTooltip === 'comportament' && (
                    <div className={`absolute left-0 top-6 z-50 w-64 p-3 rounded-lg shadow-xl border ${
                      isDarkMode 
                        ? 'bg-gray-900 border-gray-700 text-gray-200' 
                        : 'bg-white border-gray-300 text-gray-800'
                    }`}>
                      <p className="text-xs leading-relaxed">
                        Cât de politicos și ok a fost în interacțiune (ton, respect, bun simț).
                      </p>
                    </div>
                  )}
                </div>
              </div>
              {renderStars(criteriaRatings.comportament, true, (rating) => 
                setCriteriaRatings(prev => ({ ...prev, comportament: rating }))
              )}
            </div>

            {/* Criteriu 2: De încredere */}
            <div className={`p-2 sm:p-3 lg:p-4 rounded-lg border ${
              isDarkMode 
                ? 'bg-gray-800/50 border-gray-700' 
                : 'bg-white border-gray-200'
            }`}>
              <div className="flex items-center gap-2 mb-2 sm:mb-3">
                <label className={`text-xs sm:text-sm font-semibold ${isDarkMode ? 'text-gray-200' : 'text-gray-800'}`}>
                  De încredere
                </label>
                <div className="relative">
                  <button
                    type="button"
                    onMouseEnter={() => setShowTooltip('deIncredere')}
                    onMouseLeave={() => setShowTooltip(null)}
                    className={`w-5 h-5 rounded-full flex items-center justify-center ${
                      isDarkMode ? 'text-gray-400 hover:text-blue-400' : 'text-gray-500 hover:text-blue-600'
                    } transition-colors`}
                  >
                    <i className="ri-information-line text-sm"></i>
                  </button>
                  {showTooltip === 'deIncredere' && (
                    <div className={`absolute left-0 top-6 z-50 w-64 p-3 rounded-lg shadow-xl border ${
                      isDarkMode 
                        ? 'bg-gray-900 border-gray-700 text-gray-200' 
                        : 'bg-white border-gray-300 text-gray-800'
                    }`}>
                      <p className="text-xs leading-relaxed">
                        A respectat ce a promis? Te-ai simțit în siguranță să colaborezi cu el?
                      </p>
                    </div>
                  )}
                </div>
              </div>
              {renderStars(criteriaRatings.deIncredere, true, (rating) => 
                setCriteriaRatings(prev => ({ ...prev, deIncredere: rating }))
              )}
            </div>

            {/* Criteriu 3: Comunicare */}
            <div className={`p-2 sm:p-3 lg:p-4 rounded-lg border ${
              isDarkMode 
                ? 'bg-gray-800/50 border-gray-700' 
                : 'bg-white border-gray-200'
            }`}>
              <div className="flex items-center gap-2 mb-2 sm:mb-3">
                <label className={`text-xs sm:text-sm font-semibold ${isDarkMode ? 'text-gray-200' : 'text-gray-800'}`}>
                  Comunicare
                </label>
                <div className="relative">
                  <button
                    type="button"
                    onMouseEnter={() => setShowTooltip('comunicare')}
                    onMouseLeave={() => setShowTooltip(null)}
                    className={`w-5 h-5 rounded-full flex items-center justify-center ${
                      isDarkMode ? 'text-gray-400 hover:text-blue-400' : 'text-gray-500 hover:text-blue-600'
                    } transition-colors`}
                  >
                    <i className="ri-information-line text-sm"></i>
                  </button>
                  {showTooltip === 'comunicare' && (
                    <div className={`absolute left-0 top-6 z-50 w-64 p-3 rounded-lg shadow-xl border ${
                      isDarkMode 
                        ? 'bg-gray-900 border-gray-700 text-gray-200' 
                        : 'bg-white border-gray-300 text-gray-800'
                    }`}>
                      <p className="text-xs leading-relaxed">
                        A răspuns la timp, a fost clar, a oferit detalii utile?
                      </p>
                    </div>
                  )}
                </div>
              </div>
              {renderStars(criteriaRatings.comunicare, true, (rating) => 
                setCriteriaRatings(prev => ({ ...prev, comunicare: rating }))
              )}
            </div>

            {/* Criteriu 4: Experiență generală */}
            <div className={`p-2 sm:p-3 lg:p-4 rounded-lg border ${
              isDarkMode 
                ? 'bg-gray-800/50 border-gray-700' 
                : 'bg-white border-gray-200'
            }`}>
              <div className="flex items-center gap-2 mb-2 sm:mb-3">
                <label className={`text-xs sm:text-sm font-semibold ${isDarkMode ? 'text-gray-200' : 'text-gray-800'}`}>
                  <span className="hidden sm:inline">Experiență generală</span>
                  <span className="sm:hidden">Experiență</span>
                </label>
                <div className="relative">
                  <button
                    type="button"
                    onMouseEnter={() => setShowTooltip('experientaGenerala')}
                    onMouseLeave={() => setShowTooltip(null)}
                    className={`w-5 h-5 rounded-full flex items-center justify-center ${
                      isDarkMode ? 'text-gray-400 hover:text-blue-400' : 'text-gray-500 hover:text-blue-600'
                    } transition-colors`}
                  >
                    <i className="ri-information-line text-sm"></i>
                  </button>
                  {showTooltip === 'experientaGenerala' && (
                    <div className={`absolute left-0 top-6 z-50 w-64 p-3 rounded-lg shadow-xl border ${
                      isDarkMode 
                        ? 'bg-gray-900 border-gray-700 text-gray-200' 
                        : 'bg-white border-gray-300 text-gray-800'
                    }`}>
                      <p className="text-xs leading-relaxed">
                        Per total, cât de mulțumit ai fost?
                      </p>
                    </div>
                  )}
                </div>
              </div>
              {renderStars(criteriaRatings.experientaGenerala, true, (rating) => 
                setCriteriaRatings(prev => ({ ...prev, experientaGenerala: rating }))
              )}
            </div>

            {/* Câmp comentariu */}
            <div>
              <label className={`block text-xs sm:text-sm font-semibold mb-1 sm:mb-2 ${isDarkMode ? 'text-gray-200' : 'text-gray-800'}`}>
                Comentariu (opțional)
              </label>
              <p className={`text-xs mb-2 sm:mb-3 hidden sm:block ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                Spune pe scurt ce a mers bine și ce s-ar putea îmbunătăți. Fără date personale.
              </p>
              <textarea
                value={newReviewText}
                onChange={(e) => setNewReviewText(e.target.value)}
                placeholder="Spune-ne părerea ta despre acest utilizator..."
                rows={3}
                className={`w-full px-3 py-2 sm:px-4 sm:py-3 rounded-lg sm:rounded-xl border text-xs sm:text-sm transition-all ${
                  isDarkMode
                    ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30'
                    : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20'
                } focus:outline-none resize-none`}
              />
            </div>

            {/* Butoane */}
            <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 pt-2">
              <button
                onClick={handleSubmitReview}
                disabled={submitting || (criteriaRatings.comportament === 0 && criteriaRatings.deIncredere === 0 && criteriaRatings.comunicare === 0 && criteriaRatings.experientaGenerala === 0)}
                className={`flex-1 px-4 py-2 sm:px-6 sm:py-3 rounded-lg sm:rounded-xl text-xs sm:text-sm font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg hover:shadow-xl transform hover:scale-105 active:scale-95 ${
                  isDarkMode
                    ? 'bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-500 hover:to-blue-600 text-white'
                    : 'bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white'
                }`}
              >
                {submitting ? (
                  <>
                    <i className="ri-loader-4-line animate-spin mr-1 sm:mr-2"></i>
                    Se trimite...
                  </>
                ) : (
                  <>
                    <i className="ri-send-plane-fill mr-1 sm:mr-2"></i>
                    Trimite review
                  </>
                )}
              </button>
              <button
                onClick={() => {
                  setShowAddForm(false);
                  setNewRating(0);
                  setNewReviewText('');
                  setCriteriaRatings({
                    comportament: 0,
                    deIncredere: 0,
                    comunicare: 0,
                    experientaGenerala: 0,
                  });
                }}
                className={`px-4 py-2 sm:px-6 sm:py-3 rounded-lg sm:rounded-xl text-xs sm:text-sm font-semibold transition-all ${
                  isDarkMode
                    ? 'bg-gray-700 hover:bg-gray-600 text-white'
                    : 'bg-gray-200 hover:bg-gray-300 text-gray-900'
                }`}
              >
                Anulează
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Lista de review-uri */}
      {reviews.length === 0 ? (
        <div className={`text-center py-8 ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
          <i className="ri-star-line text-4xl mb-2"></i>
          <p>Nu există review-uri încă.</p>
        </div>
      ) : (
        <div className="space-y-2 sm:space-y-3 lg:space-y-4">
          {reviews.map((review) => (
            <div
              key={review.id}
              className={`p-2 sm:p-3 lg:p-4 rounded-lg sm:rounded-xl ${
                isDarkMode 
                  ? 'bg-gray-800 border border-gray-700' 
                  : 'bg-white border border-gray-200'
              }`}
            >
              <div className="flex items-start gap-2 sm:gap-3 lg:gap-4">
                {/* Avatar */}
                <div className="flex-shrink-0">
                  {getReviewerAvatar(review) ? (
                    <img
                      src={getReviewerAvatar(review)!}
                      alt={getReviewerName(review)}
                      className="w-10 h-10 sm:w-12 sm:h-12 rounded-full object-cover"
                    />
                  ) : (
                    <div className={`w-10 h-10 sm:w-12 sm:h-12 rounded-full flex items-center justify-center ${
                      isDarkMode ? 'bg-gray-700' : 'bg-gray-200'
                    }`}>
                      <span className={`text-xs sm:text-sm font-bold ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>
                        {getReviewerName(review).charAt(0).toUpperCase()}
                      </span>
                    </div>
                  )}
                </div>
                {/* Conținut */}
                <div className="flex-1 min-w-0">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 sm:gap-2 mb-1 sm:mb-2">
                    <div className="min-w-0">
                      <h4 className={`text-xs sm:text-sm font-semibold truncate ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                        {getReviewerName(review)}
                      </h4>
                      <div className="flex items-center gap-2 mt-0.5 sm:mt-1">
                        {renderStars(review.rating)}
                        {review.is_verified && (
                          <span className={`text-xs px-1.5 py-0.5 sm:px-2 rounded ${
                            isDarkMode 
                              ? 'bg-green-900/30 text-green-400 border border-green-700' 
                              : 'bg-green-100 text-green-700 border border-green-300'
                          }`}>
                            <i className="ri-check-line text-xs"></i>
                            <span className="hidden sm:inline ml-1">Verificat</span>
                          </span>
                        )}
                      </div>
                    </div>
                    <span className={`text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-500'} whitespace-nowrap`}>
                      {formatDate(review.created_at)}
                    </span>
                  </div>
                  {review.review_text && (
                    <p className={`text-xs sm:text-sm mt-1 sm:mt-2 break-words ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                      {review.review_text}
                    </p>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

