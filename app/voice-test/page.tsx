"use client";

import { useState, useEffect } from 'react';

interface Voice {
  id: string;
  name: string;
  provider: string;
  description: string;
  gender: string;
  characteristics: string[];
  recommended: boolean;
}

export default function VoiceTestPage() {
  const [voices, setVoices] = useState<Voice[]>([]);
  const [loading, setLoading] = useState(true);
  const [testText, setTestText] = useState('Bună ziua! Căutați un apartament cu două camere în Brașov?');
  const [playingVoice, setPlayingVoice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchVoices();
  }, []);

  const fetchVoices = async () => {
    try {
      const response = await fetch('/api/voice/test');
      const data = await response.json();
      if (data.voices) {
        setVoices(data.voices);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const testVoice = async (voice: Voice) => {
    if (!testText.trim()) {
      alert('Te rog introdu un text pentru testare');
      return;
    }

    setPlayingVoice(voice.id);
    setError(null);

    try {
      const response = await fetch('/api/voice', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text: testText,
          provider: voice.provider,
          voice: voice.provider === 'openai' ? voice.id : undefined,
          voiceId: voice.provider === 'elevenlabs' ? voice.id : undefined,
        }),
      });

      if (!response.ok) {
        throw new Error(`Eroare: ${response.status}`);
      }

      const audioBlob = await response.blob();
      const audioUrl = URL.createObjectURL(audioBlob);
      const audio = new Audio(audioUrl);

      audio.onended = () => {
        URL.revokeObjectURL(audioUrl);
        setPlayingVoice(null);
      };

      audio.onerror = () => {
        URL.revokeObjectURL(audioUrl);
        setPlayingVoice(null);
        setError('Eroare la redarea audio');
      };

      await audio.play();
    } catch (err: any) {
      setError(err.message);
      setPlayingVoice(null);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 flex items-center justify-center">
        <div className="text-white text-xl">Se încarcă vociile...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 p-8">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-4xl font-bold text-white mb-2">🎤 Testare Voci TTS</h1>
        <p className="text-gray-400 mb-8">Ascultă și compară toate vociile disponibile</p>

        {/* Text Input */}
        <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 mb-8 border border-white/20">
          <label className="block text-white font-semibold mb-3">
            Text pentru testare:
          </label>
          <textarea
            value={testText}
            onChange={(e) => setTestText(e.target.value)}
            className="w-full px-4 py-3 rounded-xl bg-white/10 border border-white/20 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            rows={3}
            placeholder="Introdu textul pe care vrei să-l asculți..."
          />
          <p className="text-gray-400 text-sm mt-2">
            💡 Sugestie: "Bună ziua! Căutați un apartament cu două camere în Brașov?"
          </p>
        </div>

        {error && (
          <div className="bg-red-500/20 border border-red-500/50 rounded-xl p-4 mb-6 text-red-200">
            ⚠️ {error}
          </div>
        )}

        {/* Voices List */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {voices.map((voice) => (
            <div
              key={voice.id}
              className={`bg-white/10 backdrop-blur-lg rounded-2xl p-6 border ${
                voice.recommended
                  ? 'border-yellow-500/50 shadow-lg shadow-yellow-500/20'
                  : 'border-white/20'
              } transition-all hover:bg-white/15`}
            >
              <div className="flex items-start justify-between mb-4">
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <h3 className="text-xl font-bold text-white">{voice.name}</h3>
                    {voice.recommended && (
                      <span className="px-2 py-1 bg-yellow-500/20 text-yellow-300 text-xs rounded-full">
                        ⭐ RECOMANDAT
                      </span>
                    )}
                    <span className={`px-2 py-1 text-xs rounded-full ${
                      voice.provider === 'elevenlabs'
                        ? 'bg-blue-500/20 text-blue-300'
                        : 'bg-blue-500/20 text-blue-300'
                    }`}>
                      {voice.provider === 'elevenlabs' ? '🎤 ElevenLabs' : '🤖 OpenAI'}
                    </span>
                  </div>
                  <p className="text-gray-300 text-sm mb-2">{voice.description}</p>
                  <div className="flex flex-wrap gap-2">
                    {voice.characteristics.map((char, idx) => (
                      <span
                        key={idx}
                        className="px-2 py-1 bg-white/10 text-gray-300 text-xs rounded-full"
                      >
                        {char}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              <button
                onClick={() => testVoice(voice)}
                disabled={playingVoice === voice.id}
                className={`w-full py-3 px-4 rounded-xl font-semibold transition-all ${
                  playingVoice === voice.id
                    ? 'bg-blue-500/50 text-white cursor-not-allowed'
                    : 'bg-blue-500 hover:bg-blue-600 text-white'
                }`}
              >
                {playingVoice === voice.id ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Se redă...
                  </span>
                ) : (
                  '▶️ Ascultă vocea'
                )}
              </button>
            </div>
          ))}
        </div>

        {/* Info */}
        <div className="mt-8 bg-blue-500/20 border border-blue-500/50 rounded-xl p-6">
          <h3 className="text-white font-semibold mb-2">ℹ️ Informații</h3>
          <ul className="text-gray-300 text-sm space-y-1">
            <li>• Voci ElevenLabs (🎤) - Foarte naturale, voce umană</li>
            <li>• Voci OpenAI (🤖) - Natural, rapid</li>
            <li>• ⭐ Voci recomandate pentru limba română</li>
            <li>• Poți modifica textul de testare pentru a compara vociile</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

