"use client";

import React, { useState, useRef, useEffect } from 'react';

interface VoiceTTSProps {
  text: string;
  autoPlay?: boolean;
  voice?: string;
  rate?: string;
  pitch?: string;
  onEnd?: () => void;
  onStart?: () => void;
  addNaturalPauses?: boolean;
}

export default function VoiceTTS({
  text,
  autoPlay = false,
  voice,
  rate,
  pitch,
  onEnd,
  onStart,
  addNaturalPauses = true,
}: VoiceTTSProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string>('');
  const [useFallback, setUseFallback] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const synthesisRef = useRef<SpeechSynthesis | null>(null);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      synthesisRef.current = window.speechSynthesis;
    }
  }, []);

  useEffect(() => {
    if (autoPlay && text) {
      speak(text);
    }
  }, [autoPlay, text]);

  // Verifică disponibilitatea TTS API
  const checkTTSAvailable = async (): Promise<boolean> => {
    try {
      const response = await fetch('/api/tts?text=test', {
        method: 'GET',
      });
      return response.status !== 503;
    } catch {
      return false;
    }
  };

  // TTS folosind Edge TTS (API)
  const speakWithEdgeTTS = async (message: string) => {
    setIsLoading(true);
    setError('');

    try {
      // Generează URL pentru audio streaming
      const params = new URLSearchParams({
        text: message,
        natural: String(addNaturalPauses),
      });
      if (voice) params.set('voice', voice);
      
      const audioUrl = `/api/tts?${params.toString()}`;
      
      const audio = new Audio(audioUrl);
      audioRef.current = audio;

      audio.onloadstart = () => {
        setIsLoading(true);
        if (onStart) onStart();
      };

      audio.oncanplay = () => {
        setIsLoading(false);
        setIsPlaying(true);
      };

      audio.onended = () => {
        setIsPlaying(false);
        if (onEnd) onEnd();
      };

      audio.onerror = (e) => {
        console.error('Audio error:', e);
        setError('Eroare la redarea audio');
        setIsLoading(false);
        setIsPlaying(false);
        // Fallback la Web Speech API
        setUseFallback(true);
        speakWithWebSpeechAPI(message);
      };

      await audio.play();
    } catch (error: any) {
      console.error('Edge TTS error:', error);
      // Fallback la Web Speech API
      setUseFallback(true);
      speakWithWebSpeechAPI(message);
    }
  };

  // Fallback: Web Speech API (browser native)
  const speakWithWebSpeechAPI = (message: string) => {
    if (!synthesisRef.current) {
      setError('Speech synthesis not supported');
      return;
    }

    // Anulează orice vorbire în curs
    synthesisRef.current.cancel();

    const utterance = new SpeechSynthesisUtterance(message);
    utterance.lang = 'ro-RO';
    utterance.rate = 1.0;
    utterance.pitch = 1.0;
    utterance.volume = 1.0;

    // Selectează voce feminină (dacă e disponibilă)
    const voices = synthesisRef.current.getVoices();
    const romanianVoice = voices.find(
      v => v.lang.startsWith('ro') && v.name.toLowerCase().includes('female')
    ) || voices.find(v => v.lang.startsWith('ro')) || null;
    
    if (romanianVoice) {
      utterance.voice = romanianVoice;
    }

    utterance.onstart = () => {
      setIsPlaying(true);
      setIsLoading(false);
      if (onStart) onStart();
    };

    utterance.onend = () => {
      setIsPlaying(false);
      if (onEnd) onEnd();
    };

    utterance.onerror = (error) => {
      console.error('Speech synthesis error:', error);
      setError('Eroare la redarea vocală');
      setIsPlaying(false);
    };

    synthesisRef.current.speak(utterance);
  };

  const speak = async (message: string) => {
    if (!message || message.trim() === '') return;

    // Verifică dacă Edge TTS e disponibil
    const isAvailable = await checkTTSAvailable();
    
    if (isAvailable && !useFallback) {
      await speakWithEdgeTTS(message);
    } else {
      // Fallback la Web Speech API
      speakWithWebSpeechAPI(message);
    }
  };

  const stop = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      setIsPlaying(false);
    }
    if (synthesisRef.current) {
      synthesisRef.current.cancel();
      setIsPlaying(false);
    }
  };

  const handleClick = () => {
    if (isPlaying) {
      stop();
    } else {
      speak(text);
    }
  };

  if (!text) return null;

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={handleClick}
        disabled={isLoading}
        className={`p-2 rounded-full transition-all relative ${
          isPlaying
            ? 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400'
            : 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 hover:bg-blue-200 dark:hover:bg-blue-900/50'
        } ${isLoading ? 'opacity-50 cursor-wait' : 'cursor-pointer'}`}
        title={isPlaying ? 'Oprește redarea' : 'Redă mesajul vocal'}
      >
        {isLoading ? (
          <div className="animate-spin rounded-full h-5 w-5 border-2 border-blue-500 border-t-transparent"></div>
        ) : isPlaying ? (
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 7.5A2.25 2.25 0 0 1 7.5 5.25h9a2.25 2.25 0 0 1 2.25 2.25v9a2.25 2.25 0 0 1-2.25 2.25h-9a2.25 2.25 0 0 1-2.25-2.25v-9Z" />
          </svg>
        ) : (
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.114 5.636a9 9 0 0 1 0 12.728M16.463 8.288a5.25 5.25 0 0 1 0 7.424M6.343 6.343l-.707-.707m13.728 0-.707.707M6.343 17.657l-.707.707m13.728-.707-.707-.707M9 9v.01M9 15v.01M12 12v.01M12 12v.01" />
          </svg>
        )}
      </button>
      
      {error && (
        <span className="text-xs text-red-600 dark:text-red-400">{error}</span>
      )}
      
      {useFallback && (
        <span className="text-xs text-yellow-600 dark:text-yellow-400">
          (Folosind vocea browser-ului)
        </span>
      )}
    </div>
  );
}

