"use client";

import { useState, useEffect, useCallback } from 'react';
import type { AuthChangeEvent, Session } from '@supabase/supabase-js';
import { useRouter } from 'next/navigation';
import supabase from '@/lib/supabase';

type CustomVoice = {
  id: string;
  name: string;
  description?: string;
};

type TTSSettingsData = {
  enabled: boolean;
  provider: string;
  elevenLabsVoice: string;
  openAIVoice: string;
  openAIModel: string;
  customVoices: CustomVoice[];
};

const DEFAULT_SETTINGS: TTSSettingsData = {
  enabled: false, // Implicit OFF
  provider: 'auto',
  elevenLabsVoice: '21m00Tcm4TlvDq8ikWAM',
  openAIVoice: 'nova',
  openAIModel: 'tts-1-hd',
  customVoices: [],
};

export default function TTSSettingsPage() {
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [enabled, setEnabled] = useState<boolean>(DEFAULT_SETTINGS.enabled);
  const [provider, setProvider] = useState<string>(DEFAULT_SETTINGS.provider);
  const [elevenLabsVoice, setElevenLabsVoice] = useState<string>(DEFAULT_SETTINGS.elevenLabsVoice);
  const [openAIVoice, setOpenAIVoice] = useState<string>(DEFAULT_SETTINGS.openAIVoice);
  const [openAIModel, setOpenAIModel] = useState<string>(DEFAULT_SETTINGS.openAIModel);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [voices, setVoices] = useState<any[]>([]);
  const [testText, setTestText] = useState('Bună ziua! Căutați un apartament cu două camere în Brașov?');
  const [playingVoice, setPlayingVoice] = useState<string | null>(null);
  const [customVoices, setCustomVoices] = useState<CustomVoice[]>([]);
  const [showAddVoiceModal, setShowAddVoiceModal] = useState(false);
  const [newVoiceId, setNewVoiceId] = useState('');
  const [newVoiceName, setNewVoiceName] = useState('');
  const [newVoiceDescription, setNewVoiceDescription] = useState('');

  const loadVoices = useCallback(async (): Promise<any[]> => {
    try {
      const response = await fetch('/api/voice/test');
      if (!response.ok) {
        throw new Error(`Request failed with status ${response.status}`);
      }
      const data = await response.json();
      if (Array.isArray(data?.voices)) {
        return data.voices;
      }
    } catch (err) {
      console.error('Error loading voices:', err);
    }
    return [];
  }, []);

  useEffect(() => {
    let isMounted = true;
    const initialize = async () => {
      if (!isMounted) {
        return;
      }

      setLoading(true);

      try {
        const [{ data: sessionData, error: sessionError }, { data: userData, error: userError }, voicesData] = await Promise.all([
          supabase.auth.getSession(),
          supabase.auth.getUser(),
          loadVoices(),
        ]);

        if (!isMounted) {
          return;
        }

        if (sessionError && sessionError.message !== 'Auth session missing!') {
          console.warn('Nu am putut obține sesiunea curentă:', sessionError);
        }

        if (userError && userError.message !== 'Auth session missing!') {
          console.warn('Nu am putut obține utilizatorul curent:', userError);
        }

        const authUserId = sessionData?.session?.user?.id ?? userData?.user?.id ?? null;
        setUserId(authUserId);

        if (authUserId) {
          const { data: settingsRow, error: settingsError } = await supabase
            .from('user_settings')
            .select('data')
            .eq('user_id', authUserId)
            .eq('category', 'tts')
            .maybeSingle();

          if (!isMounted) {
            return;
          }

          if (settingsError && settingsError.code !== 'PGRST116') {
            console.error('Eroare la încărcarea setărilor TTS din Supabase:', settingsError);
          }

          const settingsData = settingsRow?.data as TTSSettingsData | undefined;
          const mergedSettings: TTSSettingsData = {
            ...DEFAULT_SETTINGS,
            ...(settingsData || {}),
            enabled: settingsData?.enabled !== undefined ? settingsData.enabled : DEFAULT_SETTINGS.enabled,
            customVoices: Array.isArray(settingsData?.customVoices)
              ? settingsData!.customVoices
              : DEFAULT_SETTINGS.customVoices,
          };

          setEnabled(mergedSettings.enabled);
          setProvider(mergedSettings.provider);
          setElevenLabsVoice(mergedSettings.elevenLabsVoice);
          setOpenAIVoice(mergedSettings.openAIVoice);
          setOpenAIModel(mergedSettings.openAIModel);
          setCustomVoices(mergedSettings.customVoices);
        } else {
          setEnabled(DEFAULT_SETTINGS.enabled);
          setProvider(DEFAULT_SETTINGS.provider);
          setElevenLabsVoice(DEFAULT_SETTINGS.elevenLabsVoice);
          setOpenAIVoice(DEFAULT_SETTINGS.openAIVoice);
          setOpenAIModel(DEFAULT_SETTINGS.openAIModel);
          setCustomVoices(DEFAULT_SETTINGS.customVoices);
        }

        setVoices(voicesData);
      } catch (err) {
        if (isMounted) {
          console.error('Eroare la inițializarea paginii de setări TTS:', err);
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    initialize();

    return () => {
      isMounted = false;
    };
  }, [loadVoices, router]);

  useEffect(() => {
    const { data: authListener } = supabase.auth.onAuthStateChange(
      (_event: AuthChangeEvent, session: Session | null) => {
        setUserId(session?.user?.id ?? null);
      },
    );

    return () => {
      authListener?.subscription.unsubscribe();
    };
  }, []);

  const saveSettings = async () => {
    if (!userId) {
      alert('Nu putem salva în Supabase fără o sesiune activă. Reîmprospătează pagina sau autentifică-te din nou ca admin.');
      return;
    }

    setSaving(true);
    try {
      const payload: TTSSettingsData = {
        enabled,
        provider,
        elevenLabsVoice,
        openAIVoice,
        openAIModel,
        customVoices,
      };

      const { error } = await supabase
        .from('user_settings')
        .upsert(
          {
            user_id: userId,
            category: 'tts',
            data: payload,
          },
          { onConflict: 'user_id,category' }
        );

      if (error) {
        throw error;
      }

      alert('✅ Setările au fost salvate în Supabase!');
    } catch (err: any) {
      console.error('Error saving TTS settings:', err);
      alert('❌ Eroare la salvare: ' + (err?.message || 'Te rugăm încearcă din nou.'));
    } finally {
      setSaving(false);
    }
  };

  const addCustomVoice = () => {
    if (!newVoiceId.trim()) {
      alert('Te rog introdu un Voice ID valid');
      return;
    }

    const newVoice = {
      id: newVoiceId.trim(),
      name: newVoiceName.trim() || `Voice ${newVoiceId.substring(0, 8)}`,
      description: newVoiceDescription.trim() || 'Voce personalizată',
    };

    // Verifică dacă ID-ul nu există deja
    if (customVoices.some(v => v.id === newVoice.id)) {
      alert('Acest Voice ID există deja!');
      return;
    }

    setCustomVoices([...customVoices, newVoice]);
    setNewVoiceId('');
    setNewVoiceName('');
    setNewVoiceDescription('');
    setShowAddVoiceModal(false);
  };

  const deleteCustomVoice = (voiceId: string) => {
    if (confirm('Sigur vrei să ștergi această voce?')) {
      setCustomVoices(customVoices.filter(v => v.id !== voiceId));
    }
  };

  const testVoice = async (voiceId: string, voiceProvider: string) => {
    if (!testText.trim()) {
      alert('Te rog introdu un text pentru testare');
      return;
    }

    setPlayingVoice(voiceId);
    try {
      const response = await fetch('/api/voice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: testText,
          provider: voiceProvider,
          voice: voiceProvider === 'openai' ? voiceId : undefined,
          voiceId: voiceProvider === 'elevenlabs' ? voiceId : undefined,
        }),
      });

      if (!response.ok) throw new Error(`Eroare: ${response.status}`);

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
      };

      await audio.play();
    } catch (err: any) {
      alert('Eroare: ' + err.message);
      setPlayingVoice(null);
    }
  };

  const elevenLabsVoices = voices.filter(v => v.provider === 'elevenlabs');
  const openAIVoices = voices.filter(v => v.provider === 'openai');

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-white text-xl">Se încarcă...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 p-8">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-4xl font-bold text-white mb-2">🎤 Setări TTS</h1>
            <p className="text-gray-400">Configurează provider-ul și vociile pentru text-to-speech</p>
          </div>
          <button
            onClick={() => router.push('/admin')}
            className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition"
          >
            ← Înapoi la Admin
          </button>
        </div>

        {/* Voice Enable/Disable Toggle */}
        <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 mb-6 border border-white/20">
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <h2 className="text-2xl font-bold text-white mb-2">Activare Voce</h2>
              <p className="text-gray-400">
                {enabled 
                  ? 'Vocea este activată. Sistemul va vorbi răspunsurile AI.' 
                  : 'Vocea este dezactivată. Sistemul va afișa doar text, fără vorbire.'}
              </p>
            </div>
            <button
              onClick={() => setEnabled(!enabled)}
              className={`relative inline-flex h-14 w-28 items-center rounded-full transition-colors duration-300 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-900 ${
                enabled 
                  ? 'bg-green-500 focus:ring-green-500' 
                  : 'bg-gray-600 focus:ring-gray-500'
              }`}
            >
              <span
                className={`inline-block h-12 w-12 transform rounded-full bg-white shadow-lg transition-transform duration-300 ${
                  enabled ? 'translate-x-14' : 'translate-x-1'
                }`}
              />
              <span className="absolute inset-0 flex items-center justify-center">
                <span className={`text-xs font-bold ${enabled ? 'text-white left-2' : 'text-gray-300 right-2'}`}>
                  {enabled ? 'ON' : 'OFF'}
                </span>
              </span>
            </button>
          </div>
        </div>

        {/* Provider Selection */}
        <div className={`bg-white/10 backdrop-blur-lg rounded-2xl p-6 mb-6 border border-white/20 ${!enabled ? 'opacity-50 pointer-events-none' : ''}`}>
          <h2 className="text-2xl font-bold text-white mb-4">Provider TTS</h2>
          {!enabled && (
            <div className="mb-4 p-3 bg-yellow-500/20 border border-yellow-500/50 rounded-lg">
              <p className="text-yellow-300 text-sm">
                ⚠️ Vocea este dezactivată. Activează vocea pentru a configura provider-ul.
              </p>
            </div>
          )}
          <div className="space-y-3">
            <label className="flex items-center gap-3 p-4 bg-white/5 rounded-xl cursor-pointer hover:bg-white/10 transition">
              <input
                type="radio"
                name="provider"
                value="auto"
                checked={provider === 'auto'}
                onChange={(e) => setProvider(e.target.value)}
                className="w-5 h-5"
              />
              <div className="flex-1">
                <div className="text-white font-semibold">Auto (Recomandat)</div>
                <div className="text-gray-400 text-sm">
                  Încearcă ElevenLabs, apoi fallback la OpenAI dacă eșuează
                </div>
              </div>
            </label>

            <label className="flex items-center gap-3 p-4 bg-white/5 rounded-xl cursor-pointer hover:bg-white/10 transition">
              <input
                type="radio"
                name="provider"
                value="elevenlabs"
                checked={provider === 'elevenlabs'}
                onChange={(e) => setProvider(e.target.value)}
                className="w-5 h-5"
              />
              <div className="flex-1">
                <div className="text-white font-semibold">🎤 ElevenLabs</div>
                <div className="text-gray-400 text-sm">
                  Voce foarte naturală, umană (necesită ELEVENLABS_API_KEY)
                </div>
              </div>
            </label>

            <label className="flex items-center gap-3 p-4 bg-white/5 rounded-xl cursor-pointer hover:bg-white/10 transition">
              <input
                type="radio"
                name="provider"
                value="openai"
                checked={provider === 'openai'}
                onChange={(e) => setProvider(e.target.value)}
                className="w-5 h-5"
              />
              <div className="flex-1">
                <div className="text-white font-semibold">🤖 OpenAI</div>
                <div className="text-gray-400 text-sm">
                  Natural, rapid, mai ieftin (necesită OPENAI_API_KEY)
                </div>
              </div>
            </label>
          </div>
        </div>

        {/* ElevenLabs Settings */}
        {(provider === 'elevenlabs' || provider === 'auto') && enabled ? (
          <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 mb-6 border border-white/20">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-2xl font-bold text-white">🎤 Voci ElevenLabs</h2>
              <button
                onClick={() => setShowAddVoiceModal(true)}
                className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition flex items-center gap-2"
              >
                <span>+</span> Adaugă Voice ID
              </button>
            </div>

            {/* Voci Predefinite */}
            <div className="mb-6">
              <h3 className="text-lg font-semibold text-gray-300 mb-3">Voci Predefinite</h3>
              <div className="space-y-3">
                {elevenLabsVoices.map((voice) => (
                  <label
                    key={voice.id}
                    className={`flex items-center gap-3 p-4 rounded-xl cursor-pointer transition ${
                      elevenLabsVoice === voice.id
                        ? 'bg-blue-500/20 border-2 border-blue-500'
                        : 'bg-white/5 hover:bg-white/10 border-2 border-transparent'
                    }`}
                  >
                    <input
                      type="radio"
                      name="elevenlabs-voice"
                      value={voice.id}
                      checked={elevenLabsVoice === voice.id}
                      onChange={(e) => setElevenLabsVoice(e.target.value)}
                      className="w-5 h-5"
                    />
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-white font-semibold">{voice.name}</span>
                        {voice.recommended && (
                          <span className="px-2 py-1 bg-yellow-500/20 text-yellow-300 text-xs rounded-full">
                            ⭐ RECOMANDAT
                          </span>
                        )}
                      </div>
                      <div className="text-gray-400 text-sm">{voice.description}</div>
                      <div className="text-gray-500 text-xs mt-1">ID: {voice.id}</div>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        testVoice(voice.id, 'elevenlabs');
                      }}
                      disabled={playingVoice === voice.id}
                      className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition disabled:opacity-50"
                    >
                      {playingVoice === voice.id ? '⏸️' : '▶️'}
                    </button>
                  </label>
                ))}
              </div>
            </div>

            {/* Voci Custom */}
            {customVoices.length > 0 && (
              <div>
                <h3 className="text-lg font-semibold text-gray-300 mb-3">Voci Personalizate</h3>
                <div className="space-y-3">
                  {customVoices.map((voice) => (
                    <label
                      key={voice.id}
                      className={`flex items-center gap-3 p-4 rounded-xl cursor-pointer transition ${
                        elevenLabsVoice === voice.id
                          ? 'bg-blue-500/20 border-2 border-blue-500'
                          : 'bg-white/5 hover:bg-white/10 border-2 border-transparent'
                      }`}
                    >
                      <input
                        type="radio"
                        name="elevenlabs-voice"
                        value={voice.id}
                        checked={elevenLabsVoice === voice.id}
                        onChange={(e) => setElevenLabsVoice(e.target.value)}
                        className="w-5 h-5"
                      />
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-white font-semibold">{voice.name}</span>
                          <span className="px-2 py-1 bg-green-500/20 text-green-300 text-xs rounded-full">
                            CUSTOM
                          </span>
                        </div>
                        <div className="text-gray-400 text-sm">{voice.description}</div>
                        <div className="text-gray-500 text-xs mt-1">ID: {voice.id}</div>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            testVoice(voice.id, 'elevenlabs');
                          }}
                          disabled={playingVoice === voice.id}
                          className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition disabled:opacity-50"
                        >
                          {playingVoice === voice.id ? '⏸️' : '▶️'}
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteCustomVoice(voice.id);
                          }}
                          className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg transition"
                        >
                          🗑️
                        </button>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : null}

        {/* OpenAI Settings */}
        {(provider === 'openai' || provider === 'auto') && enabled ? (
          <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 mb-6 border border-white/20">
            <h2 className="text-2xl font-bold text-white mb-4">🤖 Voci OpenAI</h2>
            
            {/* Model Selection */}
            <div className="mb-6">
              <label className="block text-white font-semibold mb-3">Model:</label>
              <select
                value={openAIModel}
                onChange={(e) => setOpenAIModel(e.target.value)}
                className="w-full px-4 py-3 bg-white/10 border border-white/20 text-white rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="tts-1">TTS-1 (Rapid, calitate bună)</option>
                <option value="tts-1-hd">TTS-1-HD (Calitate superioară, RECOMANDAT)</option>
              </select>
            </div>

            {/* Voice Selection */}
            <div className="space-y-3">
              {openAIVoices.map((voice) => (
                <label
                  key={voice.id}
                  className={`flex items-center gap-3 p-4 rounded-xl cursor-pointer transition ${
                    openAIVoice === voice.id
                      ? 'bg-blue-500/20 border-2 border-blue-500'
                      : 'bg-white/5 hover:bg-white/10 border-2 border-transparent'
                  }`}
                >
                  <input
                    type="radio"
                    name="openai-voice"
                    value={voice.id}
                    checked={openAIVoice === voice.id}
                    onChange={(e) => setOpenAIVoice(e.target.value)}
                    className="w-5 h-5"
                  />
                  <div className="flex-1">
                    <span className="text-white font-semibold">{voice.name}</span>
                    <div className="text-gray-400 text-sm">{voice.description}</div>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      testVoice(voice.id, 'openai');
                    }}
                    disabled={playingVoice === voice.id}
                    className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition disabled:opacity-50"
                  >
                    {playingVoice === voice.id ? '⏸️' : '▶️'}
                  </button>
                </label>
              ))}
            </div>
          </div>
        ) : null}

        {/* Test Section */}
        <div className={`bg-white/10 backdrop-blur-lg rounded-2xl p-6 mb-6 border border-white/20 ${!enabled ? 'opacity-50 pointer-events-none' : ''}`}>
          <h2 className="text-2xl font-bold text-white mb-4">🧪 Testare</h2>
          {!enabled && (
            <div className="mb-4 p-3 bg-yellow-500/20 border border-yellow-500/50 rounded-lg">
              <p className="text-yellow-300 text-sm">
                ⚠️ Vocea este dezactivată. Activează vocea pentru a testa.
              </p>
            </div>
          )}
          <textarea
            value={testText}
            onChange={(e) => setTestText(e.target.value)}
            className="w-full px-4 py-3 rounded-xl bg-white/10 border border-white/20 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none mb-4"
            rows={3}
            placeholder="Introdu textul pentru testare..."
          />
          <p className="text-gray-400 text-sm mb-4">
            💡 Folosește butonul ▶️ de lângă fiecare voce pentru a o testa
          </p>
        </div>

        {/* Save Button */}
        <div className="flex gap-4">
          <button
            onClick={saveSettings}
            disabled={saving}
            className="flex-1 px-6 py-4 bg-green-500 hover:bg-green-600 text-white font-semibold rounded-xl transition disabled:opacity-50"
          >
            {saving ? 'Se salvează...' : '💾 Salvează Setările'}
          </button>
          <button
            onClick={() => router.push('/admin')}
            className="px-6 py-4 bg-gray-700 hover:bg-gray-600 text-white font-semibold rounded-xl transition"
          >
            Anulează
          </button>
        </div>

        {/* Info */}
        <div className="mt-6 bg-blue-500/20 border border-blue-500/50 rounded-xl p-6">
          <h3 className="text-white font-semibold mb-2">ℹ️ Informații</h3>
          <ul className="text-gray-300 text-sm space-y-1">
            <li>• Setările sunt salvate securizat în contul tău Supabase</li>
            <li>• Modifică provider-ul și vocile oricând, din orice dispozitiv</li>
            <li>• Provider "Auto" încearcă ElevenLabs, apoi fallback la OpenAI</li>
            <li>• Poți testa fiecare voce folosind butonul ▶️</li>
            <li>• Poți adăuga Voice ID-uri custom pentru ElevenLabs</li>
          </ul>
        </div>
      </div>

      {/* Modal pentru adăugare Voice ID */}
      {showAddVoiceModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-gray-800 rounded-2xl p-6 max-w-md w-full border border-white/20">
            <h3 className="text-2xl font-bold text-white mb-4">Adaugă Voice ID Custom</h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-white font-semibold mb-2">
                  Voice ID <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={newVoiceId}
                  onChange={(e) => setNewVoiceId(e.target.value)}
                  placeholder="ex: aO1KOom3LeOat9XksRq8"
                  className="w-full px-4 py-3 bg-white/10 border border-white/20 text-white rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <p className="text-gray-400 text-xs mt-1">
                  Obține Voice ID de la ElevenLabs (Voice Library sau Voice Cloning)
                </p>
              </div>

              <div>
                <label className="block text-white font-semibold mb-2">
                  Nume (opțional)
                </label>
                <input
                  type="text"
                  value={newVoiceName}
                  onChange={(e) => setNewVoiceName(e.target.value)}
                  placeholder="ex: Vocea Mea Personalizată"
                  className="w-full px-4 py-3 bg-white/10 border border-white/20 text-white rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-white font-semibold mb-2">
                  Descriere (opțional)
                </label>
                <textarea
                  value={newVoiceDescription}
                  onChange={(e) => setNewVoiceDescription(e.target.value)}
                  placeholder="ex: Voce feminină, naturală, personalizată"
                  rows={2}
                  className="w-full px-4 py-3 bg-white/10 border border-white/20 text-white rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                />
              </div>
            </div>

            <div className="flex gap-4 mt-6">
              <button
                onClick={addCustomVoice}
                className="flex-1 px-4 py-3 bg-blue-500 hover:bg-blue-600 text-white font-semibold rounded-xl transition"
              >
                ✅ Adaugă
              </button>
              <button
                onClick={() => {
                  setShowAddVoiceModal(false);
                  setNewVoiceId('');
                  setNewVoiceName('');
                  setNewVoiceDescription('');
                }}
                className="px-4 py-3 bg-gray-700 hover:bg-gray-600 text-white font-semibold rounded-xl transition"
              >
                Anulează
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

