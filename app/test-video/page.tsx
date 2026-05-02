"use client";

import { useState } from 'react';

export default function TestVideoPage() {
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationStatus, setGenerationStatus] = useState('');
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoInfo, setVideoInfo] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const handleGenerateVideo = async () => {
    setIsGenerating(true);
    setError(null);
    setGenerationStatus('Generare script în română...');
    setVideoUrl(null);

    try {
      // Step 1: Generate video
      setGenerationStatus('Generare script cu GPT-4o...');
      const response = await fetch('/api/avatar/test', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        let errorData: any = {};
        try {
          errorData = await response.json();
        } catch (e) {
          const errorText = await response.text();
          errorData = { message: errorText || `HTTP ${response.status}: ${response.statusText}` };
        }
        console.error('API Error:', errorData);
        throw new Error(errorData.error || errorData.message || `Failed to generate video: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || 'Video generation failed');
      }

      setGenerationStatus('✅ Video generat cu succes!');
      setVideoUrl(data.video.url);
      setVideoInfo(data);

      // Auto-play video
      setTimeout(() => {
        const videoElement = document.getElementById('test-video') as HTMLVideoElement;
        if (videoElement) {
          videoElement.play().catch((err) => {
            console.warn('Auto-play prevented:', err);
          });
        }
      }, 500);
    } catch (err: any) {
      console.error('Error generating video:', err);
      const errorMessage = err.message || err.error || 'Eroare la generarea video-ului';
      setError(errorMessage);
      setGenerationStatus('');
      // Log full error for debugging
      if (err.stack) {
        console.error('Full error stack:', err.stack);
      }
    } finally {
      setIsGenerating(false);
    }
  };

  const handleReplay = () => {
    const videoElement = document.getElementById('test-video') as HTMLVideoElement;
    if (videoElement) {
      videoElement.currentTime = 0;
      videoElement.play();
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 text-white">
      <div className="max-w-4xl mx-auto px-4 py-12">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold mb-4 bg-gradient-to-r from-yellow-400 to-orange-500 bg-clip-text text-transparent">
            🎬 Test Video cu Avatar AI
          </h1>
          <p className="text-gray-300 text-lg">
            Generează un clip video de test complet în limba română
          </p>
        </div>

        {/* Generate Button */}
        <div className="text-center mb-8">
          <button
            onClick={handleGenerateVideo}
            disabled={isGenerating}
            className={`px-8 py-4 rounded-xl font-semibold text-lg transition-all ${
              isGenerating
                ? 'bg-gray-600 cursor-not-allowed opacity-50'
                : 'bg-gradient-to-r from-yellow-500 to-orange-500 hover:from-yellow-600 hover:to-orange-600 text-white shadow-lg hover:shadow-xl transform hover:scale-105'
            }`}
          >
            {isGenerating ? (
              <span className="flex items-center gap-3">
                <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                {generationStatus || 'Generare...'}
              </span>
            ) : (
              '🚀 Generează Video de Test'
            )}
          </button>
        </div>

        {/* Status Message */}
        {generationStatus && (
          <div className="bg-blue-900/30 border border-blue-500 rounded-lg p-4 mb-6">
            <p className="text-blue-200">{generationStatus}</p>
          </div>
        )}

        {/* Error Message */}
        {error && (
          <div className="bg-red-900/30 border border-red-500 rounded-lg p-4 mb-6">
            <p className="text-red-200 font-semibold">Eroare:</p>
            <p className="text-red-300">{error}</p>
          </div>
        )}

        {/* Video Player */}
        {videoUrl && (
          <div className="bg-gray-800 rounded-2xl p-6 shadow-2xl mb-8">
            <h2 className="text-2xl font-bold mb-4 text-center">📹 Video Generat</h2>
            
            {/* Video */}
            <div className="relative aspect-[9/16] max-w-md mx-auto mb-6 rounded-xl overflow-hidden bg-black">
              <video
                id="test-video"
                src={videoUrl}
                controls
                className="w-full h-full object-contain"
                playsInline
              >
                Browser-ul tău nu suportă video-ul.
              </video>
            </div>

            {/* Replay Button */}
            <div className="text-center mb-6">
              <button
                onClick={handleReplay}
                className="px-6 py-3 bg-gradient-to-r from-blue-500 to-pink-500 hover:from-blue-600 hover:to-pink-600 text-white rounded-lg font-semibold transition-all shadow-lg hover:shadow-xl"
              >
                🔊 Ascultă din nou
              </button>
            </div>

            {/* Video Info */}
            {videoInfo && (
              <div className="space-y-4">
                {/* Product Info */}
                <div className="bg-gray-700/50 rounded-lg p-4">
                  <h3 className="text-xl font-semibold mb-2">📦 Produs</h3>
                  <p className="text-gray-200 font-medium">{videoInfo.product.title}</p>
                  <p className="text-gray-400 text-sm mt-1">{videoInfo.product.description}</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <span className="px-3 py-1 bg-yellow-500/20 text-yellow-300 rounded-full text-sm">
                      {videoInfo.product.price.toLocaleString('ro-RO')} EUR
                    </span>
                    <span className="px-3 py-1 bg-blue-500/20 text-blue-300 rounded-full text-sm">
                      {videoInfo.product.location}
                    </span>
                    <span className="px-3 py-1 bg-green-500/20 text-green-300 rounded-full text-sm">
                      {videoInfo.product.category}
                    </span>
                  </div>
                </div>

                {/* Script Info */}
                <div className="bg-gray-700/50 rounded-lg p-4">
                  <h3 className="text-xl font-semibold mb-2">📝 Script Generat</h3>
                  <p className="text-gray-300 text-sm leading-relaxed">
                    {videoInfo.script.narration}
                  </p>
                </div>

                {/* Hashtags */}
                {videoInfo.script.hashtags && videoInfo.script.hashtags.length > 0 && (
                  <div className="bg-gray-700/50 rounded-lg p-4">
                    <h3 className="text-xl font-semibold mb-2">🏷️ Hashtag-uri</h3>
                    <div className="flex flex-wrap gap-2">
                      {videoInfo.script.hashtags.map((tag: string, idx: number) => (
                        <span
                          key={idx}
                          className="px-3 py-1 bg-blue-500/20 text-blue-300 rounded-full text-sm"
                        >
                          #{tag}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Video Details */}
                <div className="bg-gray-700/50 rounded-lg p-4">
                  <h3 className="text-xl font-semibold mb-2">📊 Detalii Video</h3>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-gray-400">Durată:</span>
                      <span className="text-white ml-2">{videoInfo.video.duration}s</span>
                    </div>
                    <div>
                      <span className="text-gray-400">Platformă:</span>
                      <span className="text-white ml-2 capitalize">{videoInfo.video.platform}</span>
                    </div>
                    <div className="col-span-2">
                      <span className="text-gray-400">URL:</span>
                      <span className="text-blue-400 ml-2 break-all">{videoInfo.video.url}</span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Instructions */}
        <div className="bg-gray-800/50 rounded-lg p-6 border border-gray-700">
          <h3 className="text-xl font-semibold mb-4">📋 Instrucțiuni</h3>
          <ol className="list-decimal list-inside space-y-2 text-gray-300">
            <li>Apasă butonul "Generează Video de Test" pentru a crea clipul</li>
            <li>Așteaptă generarea (poate dura 2-5 minute)</li>
            <li>Video-ul va fi generat cu:
              <ul className="list-disc list-inside ml-6 mt-2 space-y-1">
                <li>Avatar AI feminin care vorbește românește</li>
                <li>Voce naturală generată de ElevenLabs</li>
                <li>Subtitrări românești sincronizate</li>
                <li>Logo Gobid în colț</li>
              </ul>
            </li>
            <li>Poți asculta video-ul din nou apăsând butonul "Ascultă din nou"</li>
          </ol>
        </div>
      </div>
    </div>
  );
}

