"use client";

import React, { useState, useEffect, useCallback } from 'react';
import type { AuthChangeEvent, Session } from '@supabase/supabase-js';
import { 
  VideoCameraIcon, 
  SparklesIcon,
  CheckCircleIcon,
  XCircleIcon,
  ClockIcon,
  PlayIcon,
  DocumentTextIcon,
  ArrowPathIcon,
  ClipboardDocumentListIcon,
} from '@heroicons/react/24/outline';
import supabase from '@/lib/supabase';

type SupportedPlatform = 'tiktok' | 'reels' | 'shorts';

interface VideoGenerationStatus {
  status: 'idle' | 'generating' | 'success' | 'error';
  progress?: string;
  video?: {
    url: string;
    publicUrl: string;
    duration?: number;
    id?: string;
  };
  script?: {
    narration: string;
    hashtags: string[];
    callToAction: string;
  };
  ideaId?: string;
  error?: string;
}

interface SavedIdea {
  id: string;
  idea: string;
  platform: SupportedPlatform;
  avatar_name?: string | null;
  product_id?: string | null;
  script: {
    narration?: string;
    hashtags?: string[];
    callToAction?: string;
  };
  video: {
    url?: string;
    publicUrl?: string;
    duration?: number;
    id?: string;
  };
  status: string;
  created_at: string;
}

export default function IdeeVideoPage() {
  const [idea, setIdea] = useState('');
  const [platform, setPlatform] = useState<SupportedPlatform>('tiktok');
  const [avatarName, setAvatarName] = useState('Ana');
  const [productId, setProductId] = useState('');
  const [generationStatus, setGenerationStatus] = useState<VideoGenerationStatus>({
    status: 'idle',
  });
  const [userId, setUserId] = useState<string | null>(null);
  const [savedIdeas, setSavedIdeas] = useState<SavedIdea[]>([]);
  const [isLoadingSavedIdeas, setIsLoadingSavedIdeas] = useState(false);
  const [isRefreshingSavedIdeas, setIsRefreshingSavedIdeas] = useState(false);

  const mergeSavedIdeas = useCallback((ideas: SavedIdea[]) => {
    setSavedIdeas((prev) => {
      const map = new Map<string, SavedIdea>();
      [...ideas, ...prev].forEach((item) => {
        if (item?.id) {
          map.set(item.id, item);
        }
      });
      return Array.from(map.values()).sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
    });
  }, []);

  const loadSavedIdeas = useCallback(
    async (currentUserId?: string, showSpinner = true) => {
      const targetUserId = currentUserId ?? userId;
      if (!targetUserId) {
        return;
      }

      if (showSpinner) {
        setIsLoadingSavedIdeas(true);
      } else {
        setIsRefreshingSavedIdeas(true);
      }

      try {
        const { data, error } = await supabase
          .from('ai_video_ideas')
          .select('*')
          .eq('user_id', targetUserId)
          .order('created_at', { ascending: false })
          .limit(25);

        if (error) {
          console.error('Error loading saved video ideas:', error);
          return;
        }

        if (Array.isArray(data)) {
          mergeSavedIdeas(
            data.map((row) => ({
              id: row.id,
              idea: row.idea,
              platform: (row.platform || 'tiktok') as SupportedPlatform,
              avatar_name: row.avatar_name ?? null,
              product_id: row.product_id ?? null,
              script: row.script || {},
              video: row.video || {},
              status: row.status || 'success',
              created_at: row.created_at,
            }))
          );
        }
      } catch (error) {
        console.error('Unexpected error loading saved video ideas:', error);
      } finally {
        setIsLoadingSavedIdeas(false);
        setIsRefreshingSavedIdeas(false);
      }
    },
    [mergeSavedIdeas, userId]
  );

  useEffect(() => {
    let isMounted = true;

    const initSession = async () => {
      try {
        const { data: sessionData, error } = await supabase.auth.getSession();
        if (!isMounted) return;

        if (error && error.message !== 'Auth session missing!') {
          console.warn('Nu am putut obține sesiunea curentă Supabase:', error);
        }

        const authUserId = sessionData?.session?.user?.id ?? null;
        setUserId(authUserId);

        if (authUserId) {
          loadSavedIdeas(authUserId);
        }
      } catch (sessionError) {
        console.error('Unexpected error fetching Supabase session:', sessionError);
      }
    };

    initSession();

    const { data: authListener } = supabase.auth.onAuthStateChange(
      (_event: AuthChangeEvent, session: Session | null) => {
        if (!isMounted) return;
        const authUserId = session?.user?.id ?? null;
        setUserId(authUserId);
        if (authUserId) {
          loadSavedIdeas(authUserId);
        } else {
          setSavedIdeas([]);
        }
      },
    );

    return () => {
      isMounted = false;
      authListener.subscription.unsubscribe();
    };
  }, [loadSavedIdeas]);

  const handleGenerate = async () => {
    if (!idea.trim()) {
      alert('Te rog să introduci o idee de clip!');
      return;
    }

    setGenerationStatus({
      status: 'generating',
      progress: 'Se generează scenariul video...',
    });

    try {
      const response = await fetch('/api/video/idea', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          idea: idea.trim(),
          platform,
          avatarName,
          productId: productId.trim() || undefined,
          userId: userId || undefined,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Eroare la generarea clipului');
      }

      setGenerationStatus({
        status: 'success',
        video: data.video,
        script: data.script,
        ideaId: data.ideaId,
      });

      if (data.ideaId && userId) {
        mergeSavedIdeas([
          {
            id: data.ideaId,
            idea: idea.trim(),
            platform,
            avatar_name: avatarName,
            product_id: productId.trim() || null,
            script: data.script || {},
            video: data.video || {},
            status: 'success',
            created_at: new Date().toISOString(),
          },
        ]);
      } else if (userId) {
        loadSavedIdeas(userId, false);
      }

      // Reset form after successful generation
      // setIdea('');
    } catch (error: any) {
      console.error('Error generating video:', error);
      setGenerationStatus({
        status: 'error',
        error: error.message || 'Eroare necunoscută la generarea clipului',
      });
    }
  };

  const handleReset = () => {
    setIdea('');
    setProductId('');
    setGenerationStatus({ status: 'idle' });
  };

  const handleSelectSavedIdea = (savedIdea: SavedIdea) => {
    setIdea(savedIdea.idea);
    setPlatform(savedIdea.platform || 'tiktok');
    setAvatarName(savedIdea.avatar_name || 'Ana');
    setProductId(savedIdea.product_id || '');
    setGenerationStatus({
      status: savedIdea.video?.publicUrl ? 'success' : 'idle',
      video: savedIdea.video?.publicUrl
        ? {
            url: savedIdea.video.url || '',
            publicUrl: savedIdea.video.publicUrl || savedIdea.video.url || '',
            duration: savedIdea.video.duration,
            id: savedIdea.video.id,
          }
        : undefined,
      script: {
        narration: savedIdea.script?.narration || '',
        hashtags: savedIdea.script?.hashtags || [],
        callToAction: savedIdea.script?.callToAction || '',
      },
      ideaId: savedIdea.id,
    });
  };

  const renderSavedIdeas = () => {
    if (isLoadingSavedIdeas) {
      return (
        <div className="flex items-center justify-center py-8 text-gray-500 dark:text-gray-300">
          <ArrowPathIcon className="w-5 h-5 animate-spin mr-2" />
          Se încarcă istoricul clipurilor...
        </div>
      );
    }

    if (!savedIdeas.length) {
      return (
        <div className="text-center py-8 text-gray-500 dark:text-gray-300">
          <ClipboardDocumentListIcon className="w-10 h-10 mx-auto mb-3" />
          <p>Nu există încă idei salvate în Supabase.</p>
        </div>
      );
    }

    return (
      <div className="space-y-4">
        {savedIdeas.map((item) => (
          <div
            key={item.id}
            className="border border-gray-200 dark:border-gray-700 rounded-xl p-4 bg-white/60 dark:bg-gray-800/80 hover:shadow-lg transition cursor-pointer"
            onClick={() => handleSelectSavedIdea(item)}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h4 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">
                  {item.idea.substring(0, 120)}
                </h4>
                <div className="flex flex-wrap gap-2 text-xs text-gray-500 dark:text-gray-400 mb-3">
                  <span className="px-2 py-1 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-300">
                    {item.platform.toUpperCase()}
                  </span>
                  {item.avatar_name && (
                    <span className="px-2 py-1 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-300">
                      Avatar: {item.avatar_name}
                    </span>
                  )}
                  {item.video?.duration && (
                    <span className="px-2 py-1 rounded-full bg-green-100 dark:bg-green-900/40 text-green-600 dark:text-green-300">
                      Durată: {item.video.duration}s
                    </span>
                  )}
                </div>
                <p className="text-sm text-gray-600 dark:text-gray-300 line-clamp-2">
                  {item.script?.narration || 'Fără script salvat'}
                </p>
              </div>
              <div className="text-right">
                <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                  {new Date(item.created_at).toLocaleString('ro-RO', {
                    dateStyle: 'short',
                    timeStyle: 'short',
                  })}
                </p>
                {item.video?.publicUrl && (
                  <a
                    href={item.video.publicUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="inline-flex items-center gap-1 text-sm text-blue-600 dark:text-blue-400 hover:underline mt-2"
                  >
                    <PlayIcon className="w-4 h-4" />
                    Vezi clipul
                  </a>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-100 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900 p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-3 bg-gradient-to-br from-blue-500 to-pink-500 rounded-xl shadow-lg">
              <SparklesIcon className="w-8 h-8 text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
                Generare Clip Video AI din Idee
              </h1>
              <p className="text-gray-600 dark:text-gray-400 mt-1">
                Transformă ideile tale în clipuri video profesionale cu avatar AI
              </p>
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left Column - Form */}
          <div className="space-y-6">
            {/* Idea Input */}
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-6 border border-gray-200 dark:border-gray-700">
              <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
                💡 Ideea de Clip
              </label>
              <textarea
                value={idea}
                onChange={(e) => setIdea(e.target.value)}
                placeholder="Ex: Apartament 3 camere în centrul Clujului, preț excelent, 90.000 EUR, modern și luminos..."
                className="w-full h-32 px-4 py-3 rounded-xl border-2 border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 dark:focus:ring-blue-800 transition-all resize-none"
                disabled={generationStatus.status === 'generating'}
              />
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                Descrie ideea clipului în detaliu. Cu cât mai multe informații, cu atât mai bine!
              </p>
            </div>

            {/* Options */}
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-6 border border-gray-200 dark:border-gray-700">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                ⚙️ Opțiuni
              </h3>

              {/* Platform */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Platformă
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {(['tiktok', 'reels', 'shorts'] as const).map((p) => (
                    <button
                      key={p}
                      onClick={() => setPlatform(p)}
                      disabled={generationStatus.status === 'generating'}
                      className={`px-4 py-2 rounded-lg font-medium transition-all ${
                        platform === p
                          ? 'bg-blue-500 text-white shadow-lg'
                          : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                      }`}
                    >
                      {p.charAt(0).toUpperCase() + p.slice(1)}
                    </button>
                  ))}
                </div>
              </div>

              {/* Avatar Name */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Nume Avatar
                </label>
                <input
                  type="text"
                  value={avatarName}
                  onChange={(e) => setAvatarName(e.target.value)}
                  placeholder="Ana"
                  className="w-full px-4 py-2 rounded-lg border-2 border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white focus:border-blue-500 focus:ring-2 focus:ring-blue-200 dark:focus:ring-blue-800 transition-all"
                  disabled={generationStatus.status === 'generating'}
                />
              </div>

              {/* Product ID (Optional) */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  ID Produs (Opțional)
                </label>
                <input
                  type="text"
                  value={productId}
                  onChange={(e) => setProductId(e.target.value)}
                  placeholder="ID-ul produsului asociat (opțional)"
                  className="w-full px-4 py-2 rounded-lg border-2 border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white focus:border-blue-500 focus:ring-2 focus:ring-blue-200 dark:focus:ring-blue-800 transition-all"
                  disabled={generationStatus.status === 'generating'}
                />
              </div>
            </div>

            {/* Generate Button */}
            <button
              onClick={handleGenerate}
              disabled={!idea.trim() || generationStatus.status === 'generating'}
              className="w-full bg-gradient-to-r from-blue-500 to-pink-500 hover:from-blue-600 hover:to-pink-600 text-white font-bold py-4 px-6 rounded-xl shadow-lg hover:shadow-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {generationStatus.status === 'generating' ? (
                <>
                  <ClockIcon className="w-5 h-5 animate-spin" />
                  <span>Se generează clipul...</span>
                </>
              ) : (
                <>
                  <VideoCameraIcon className="w-5 h-5" />
                  <span>Generează Clip Video</span>
                </>
              )}
            </button>

            {/* Reset Button */}
            {generationStatus.status === 'success' && (
              <button
                onClick={handleReset}
                className="w-full bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 font-medium py-3 px-6 rounded-xl transition-all"
              >
                Generare Nouă
              </button>
            )}
          </div>

          {/* Right Column - Results */}
          <div className="space-y-6">
            {/* Status Card */}
            {generationStatus.status === 'generating' && (
              <div className="bg-gradient-to-br from-blue-50 to-blue-50 dark:from-blue-900/20 dark:to-blue-900/20 rounded-2xl shadow-xl p-6 border border-blue-200 dark:border-blue-800">
                <div className="flex items-center gap-4 mb-4">
                  <div className="p-3 bg-blue-500 rounded-xl">
                    <ClockIcon className="w-6 h-6 text-white animate-spin" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                      Se generează clipul...
                    </h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      {generationStatus.progress || 'Procesare în curs...'}
                    </p>
                  </div>
                </div>
                <div className="space-y-2 text-sm text-gray-700 dark:text-gray-300">
                  <div className="flex items-center gap-2">
                    <CheckCircleIcon className="w-4 h-4 text-green-500" />
                    <span>Generare scenariu video (GPT-4o)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <ClockIcon className="w-4 h-4 text-blue-500 animate-spin" />
                    <span>Generare voce naturală (ElevenLabs)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <ClockIcon className="w-4 h-4 text-blue-500 animate-spin" />
                    <span>Generare avatar video (HeyGen)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <ClockIcon className="w-4 h-4 text-gray-400" />
                    <span>Adăugare subtitrare și logo</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <ClockIcon className="w-4 h-4 text-gray-400" />
                    <span>Salvare în Supabase</span>
                  </div>
                </div>
              </div>
            )}

            {/* Error Card */}
            {generationStatus.status === 'error' && (
              <div className="bg-red-50 dark:bg-red-900/20 rounded-2xl shadow-xl p-6 border border-red-200 dark:border-red-800">
                <div className="flex items-center gap-4 mb-4">
                  <div className="p-3 bg-red-500 rounded-xl">
                    <XCircleIcon className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-red-900 dark:text-red-300">
                      Eroare la generare
                    </h3>
                  </div>
                </div>
                <p className="text-sm text-red-700 dark:text-red-400">
                  {generationStatus.error}
                </p>
              </div>
            )}

            {/* Success Card - Video */}
            {generationStatus.status === 'success' && generationStatus.video && (
              <>
                <div className="bg-green-50 dark:bg-green-900/20 rounded-2xl shadow-xl p-6 border border-green-200 dark:border-green-800">
                  <div className="flex items-center gap-4 mb-4">
                    <div className="p-3 bg-green-500 rounded-xl">
                      <CheckCircleIcon className="w-6 h-6 text-white" />
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                        Clip generat cu succes!
                      </h3>
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        Durată: {generationStatus.video.duration || 'N/A'} secunde
                      </p>
                    </div>
                  </div>

                  {/* Video Player */}
                  <div className="bg-black rounded-xl overflow-hidden mb-4">
                    <video
                      src={generationStatus.video.publicUrl}
                      controls
                      className="w-full h-auto"
                      poster="/logo.png"
                    >
                      Browserul tău nu suportă redarea video.
                    </video>
                  </div>

                  {/* Video Info */}
                  <div className="space-y-2 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-gray-600 dark:text-gray-400">URL:</span>
                      <a
                        href={generationStatus.video.publicUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 dark:text-blue-400 hover:underline break-all"
                      >
                        {generationStatus.video.publicUrl}
                      </a>
                    </div>
                    {generationStatus.video.id && (
                      <div className="flex items-center justify-between">
                        <span className="text-gray-600 dark:text-gray-400">ID Supabase:</span>
                        <span className="text-gray-900 dark:text-white font-mono">
                          {generationStatus.video.id}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Script Card */}
                {generationStatus.script && (
                  <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-6 border border-gray-200 dark:border-gray-700">
                    <div className="flex items-center gap-3 mb-4">
                      <DocumentTextIcon className="w-6 h-6 text-blue-500" />
                      <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                        Scenariul Generat
                      </h3>
                    </div>

                    {/* Narration */}
                    <div className="mb-4">
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Narrație
                      </label>
                      <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4 max-h-48 overflow-y-auto">
                        <p className="text-sm text-gray-900 dark:text-white whitespace-pre-wrap">
                          {generationStatus.script.narration}
                        </p>
                      </div>
                    </div>

                    {/* Hashtags */}
                    {generationStatus.script.hashtags && generationStatus.script.hashtags.length > 0 && (
                      <div className="mb-4">
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                          Hashtag-uri
                        </label>
                        <div className="flex flex-wrap gap-2">
                          {generationStatus.script.hashtags.map((tag, index) => (
                            <span
                              key={index}
                              className="px-3 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-full text-sm font-medium"
                            >
                              #{tag}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Call to Action */}
                    {generationStatus.script.callToAction && (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                          Call to Action
                        </label>
                        <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3">
                          <p className="text-sm text-blue-900 dark:text-blue-300 font-medium">
                            {generationStatus.script.callToAction}
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </>
            )}

            {/* Empty State */}
            {generationStatus.status === 'idle' && (
              <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-12 border border-gray-200 dark:border-gray-700 text-center">
                <VideoCameraIcon className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                  Niciun clip generat încă
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Introdu o idee și apasă "Generează Clip Video" pentru a începe
                </p>
              </div>
            )}

            {/* Saved Ideas History */}
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-6 border border-gray-200 dark:border-gray-700">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <ClipboardDocumentListIcon className="w-6 h-6 text-blue-500" />
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                    Istoric idei generate
                  </h3>
                </div>
                {userId && savedIdeas.length > 0 && (
                  <button
                    onClick={() => loadSavedIdeas(userId, false)}
                    className="inline-flex items-center gap-1 text-sm text-blue-600 dark:text-blue-300 hover:text-blue-500 transition"
                    disabled={isRefreshingSavedIdeas}
                  >
                    <ArrowPathIcon
                      className={`w-4 h-4 ${isRefreshingSavedIdeas ? 'animate-spin' : ''}`}
                    />
                    Reîmprospătează
                  </button>
                )}
              </div>

              {renderSavedIdeas()}

              {!userId && (
                <p className="mt-4 text-sm text-gray-500 dark:text-gray-400">
                  Autentifică-te în cont pentru a salva și vizualiza istoricul clipurilor generate.
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}


