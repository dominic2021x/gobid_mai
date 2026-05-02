"use client";

import React, { useState, useEffect } from 'react';
import {
  ChartBarIcon,
  EyeIcon,
  VideoCameraIcon,
  HeartIcon,
  ShareIcon,
  ArrowTrendingUpIcon,
  ArrowTrendingDownIcon,
  SparklesIcon,
} from '@heroicons/react/24/outline';

interface AnalyticsOverview {
  totalViews: number;
  totalConversions: number;
  totalEngagement: number;
  avgEngagement: number;
  totalVideos: number;
  topProducts: Array<{
    id: string;
    titlu: string;
    views: number;
  }>;
  topVideos: Array<{
    id: string;
    url: string;
    views: number;
    likes: number;
  }>;
}

interface AIInsight {
  summary: string;
  recommendations: string[];
  topPerformingContent: {
    type: 'produs' | 'clip';
    items: string[];
  };
  areasToImprove: string[];
  nextSteps: string[];
  predictedTrends: string[];
}

export default function StatisticiPage() {
  const [data, setData] = useState<AnalyticsOverview | null>(null);
  const [insights, setInsights] = useState<AIInsight | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingInsights, setIsLoadingInsights] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setIsLoading(true);
      const response = await fetch('/api/analytics/overview');
      if (!response.ok) throw new Error('Failed to load analytics');
      const result = await response.json();
      setData(result);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const loadAIInsights = async () => {
    try {
      setIsLoadingInsights(true);
      const response = await fetch('/api/analytics/insights');
      if (!response.ok) throw new Error('Failed to load AI insights');
      const result = await response.json();
      setInsights(result);
    } catch (err: any) {
      console.error('Error loading AI insights:', err);
    } finally {
      setIsLoadingInsights(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-gray-600">Se încarcă statisticile...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-500 mb-4">Eroare: {error}</p>
          <button
            onClick={loadData}
            className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
          >
            Reîncearcă
          </button>
        </div>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-gradient-to-br from-blue-500 to-pink-500 rounded-xl shadow-lg">
                <ChartBarIcon className="w-8 h-8 text-white" />
              </div>
              <div>
                <h1 className="text-3xl font-bold text-gray-900">
                  📈 Analiză Performanță Conținut
                </h1>
                <p className="text-gray-600 mt-1">
                  Statistici și insight-uri pentru conținutul tău
                </p>
              </div>
            </div>
            <button
              onClick={loadAIInsights}
              disabled={isLoadingInsights}
              className="px-4 py-2 bg-gradient-to-r from-blue-500 to-pink-500 text-white rounded-lg hover:from-blue-600 hover:to-pink-600 disabled:opacity-50 flex items-center gap-2"
            >
              <SparklesIcon className="w-5 h-5" />
              {isLoadingInsights ? 'Se generează...' : 'Generează Insight-uri AI'}
            </button>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <div className="bg-white rounded-2xl shadow-xl p-6 border border-gray-200">
            <div className="flex items-center justify-between mb-4">
              <EyeIcon className="w-8 h-8 text-blue-500" />
              <ArrowTrendingUpIcon className="w-6 h-6 text-green-500" />
            </div>
            <h2 className="text-sm font-medium text-gray-600 mb-1">
              Vizualizări Totale
            </h2>
            <p className="text-3xl font-bold text-gray-900">
              {data.totalViews.toLocaleString('ro-RO')}
            </p>
          </div>

          <div className="bg-white rounded-2xl shadow-xl p-6 border border-gray-200">
            <div className="flex items-center justify-between mb-4">
              <VideoCameraIcon className="w-8 h-8 text-blue-500" />
              <ArrowTrendingUpIcon className="w-6 h-6 text-green-500" />
            </div>
            <h2 className="text-sm font-medium text-gray-600 mb-1">
              Clipuri Generate
            </h2>
            <p className="text-3xl font-bold text-gray-900">
              {data.totalVideos}
            </p>
          </div>

          <div className="bg-white rounded-2xl shadow-xl p-6 border border-gray-200">
            <div className="flex items-center justify-between mb-4">
              <HeartIcon className="w-8 h-8 text-pink-500" />
              <ArrowTrendingUpIcon className="w-6 h-6 text-green-500" />
            </div>
            <h2 className="text-sm font-medium text-gray-600 mb-1">
              Engagement Mediu
            </h2>
            <p className="text-3xl font-bold text-gray-900">
              {data.avgEngagement.toFixed(1)}%
            </p>
          </div>

          <div className="bg-white rounded-2xl shadow-xl p-6 border border-gray-200">
            <div className="flex items-center justify-between mb-4">
              <ShareIcon className="w-8 h-8 text-green-500" />
              <ArrowTrendingUpIcon className="w-6 h-6 text-green-500" />
            </div>
            <h2 className="text-sm font-medium text-gray-600 mb-1">
              Conversii Totale
            </h2>
            <p className="text-3xl font-bold text-gray-900">
              {data.totalConversions}
            </p>
          </div>
        </div>

        {/* AI Insights */}
        {insights && (
          <div className="bg-gradient-to-br from-blue-50 to-pink-50 rounded-2xl shadow-xl p-6 mb-8 border border-blue-200">
            <div className="flex items-center gap-3 mb-4">
              <SparklesIcon className="w-6 h-6 text-blue-500" />
              <h2 className="text-xl font-bold text-gray-900">
                Insight-uri AI
              </h2>
            </div>

            <div className="space-y-4">
              <div>
                <h3 className="font-semibold text-gray-900 mb-2">Rezumat</h3>
                <p className="text-gray-700">{insights.summary}</p>
              </div>

              {insights.recommendations.length > 0 && (
                <div>
                  <h3 className="font-semibold text-gray-900 mb-2">Recomandări</h3>
                  <ul className="list-disc list-inside space-y-1 text-gray-700">
                    {insights.recommendations.map((rec, i) => (
                      <li key={i}>{rec}</li>
                    ))}
                  </ul>
                </div>
              )}

              {insights.areasToImprove.length > 0 && (
                <div>
                  <h3 className="font-semibold text-gray-900 mb-2">Zone de îmbunătățire</h3>
                  <ul className="list-disc list-inside space-y-1 text-gray-700">
                    {insights.areasToImprove.map((area, i) => (
                      <li key={i}>{area}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Top Products */}
        <div className="bg-white rounded-2xl shadow-xl p-6 mb-8 border border-gray-200">
          <h2 className="text-2xl font-semibold text-gray-900 mb-4">
            Top 5 Produse Populare
          </h2>
          <div className="space-y-3">
            {data.topProducts.length > 0 ? (
              data.topProducts.map((product, i) => (
                <div
                  key={product.id}
                  className="flex items-center justify-between p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-pink-500 rounded-full flex items-center justify-center text-white font-bold">
                      {i + 1}
                    </div>
                    <div>
                      <h3 className="font-medium text-gray-900">
                        {product.titlu}
                      </h3>
                      <p className="text-sm text-gray-500">
                        ID: {product.id}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <EyeIcon className="w-5 h-5 text-gray-400" />
                    <span className="text-lg font-semibold text-gray-900">
                      {product.views.toLocaleString('ro-RO')}
                    </span>
                    <span className="text-sm text-gray-500">vizualizări</span>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-gray-500 text-center py-8">
                Nu există produse încă
              </p>
            )}
          </div>
        </div>

        {/* Top Videos */}
        <div className="bg-white rounded-2xl shadow-xl p-6 border border-gray-200">
          <h2 className="text-2xl font-semibold text-gray-900 mb-4">
            Top 3 Clipuri Video
          </h2>
          <div className="space-y-6">
            {data.topVideos.length > 0 ? (
              data.topVideos.map((video, i) => (
                <div
                  key={video.id}
                  className="bg-gray-50 rounded-lg p-4"
                >
                  <div className="flex items-center gap-4 mb-4">
                    <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-pink-500 rounded-full flex items-center justify-center text-white font-bold">
                      {i + 1}
                    </div>
                    <div className="flex-1">
                      <p className="text-sm text-gray-500 break-all">
                        {video.url}
                      </p>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-2">
                        <EyeIcon className="w-5 h-5 text-gray-400" />
                        <span className="font-semibold text-gray-900">
                          {video.views.toLocaleString('ro-RO')}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <HeartIcon className="w-5 h-5 text-pink-500" />
                        <span className="font-semibold text-gray-900">
                          {video.likes.toLocaleString('ro-RO')}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="bg-black rounded-lg overflow-hidden">
                    <video
                      src={video.url}
                      controls
                      className="w-full h-auto"
                      poster="/logo.png"
                    >
                      Browserul tău nu suportă redarea video.
                    </video>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-gray-500 text-center py-8">
                Nu există clipuri video încă
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}


