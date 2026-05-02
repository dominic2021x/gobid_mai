"use client";

import React, { useState, useEffect, useRef } from 'react';

interface VoiceOutputProps {
  text: string;
  lang?: string;
  autoPlay?: boolean;
  onEnd?: () => void;
}

export default function VoiceOutput({ 
  text, 
  lang = 'ro-RO', 
  autoPlay = false,
  onEnd 
}: VoiceOutputProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isSupported, setIsSupported] = useState(false);
  const synthesisRef = useRef<SpeechSynthesis | null>(null);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  useEffect(() => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      setIsSupported(true);
      synthesisRef.current = window.speechSynthesis;
    }
  }, []);

  useEffect(() => {
    if (autoPlay && text && isSupported) {
      speak(text);
    }
  }, [autoPlay, text, isSupported]);

  const speak = (message: string) => {
    if (!synthesisRef.current || !isSupported) {
      console.warn('Speech synthesis not supported');
      return;
    }

    // Anulează orice vorbire în curs
    synthesisRef.current.cancel();

    const utterance = new SpeechSynthesisUtterance(message);
    utterance.lang = lang;
    utterance.rate = 1.0;
    utterance.pitch = 1.0;
    utterance.volume = 1.0;

    utterance.onstart = () => {
      setIsPlaying(true);
    };

    utterance.onend = () => {
      setIsPlaying(false);
      if (onEnd) {
        onEnd();
      }
    };

    utterance.onerror = (error) => {
      console.error('Speech synthesis error:', error);
      setIsPlaying(false);
    };

    utteranceRef.current = utterance;
    synthesisRef.current.speak(utterance);
  };

  const stop = () => {
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

  if (!isSupported || !text) {
    return null;
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className={`p-2 rounded-full transition-all ${
        isPlaying
          ? 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400'
          : 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 hover:bg-blue-200 dark:hover:bg-blue-900/50'
      }`}
      title={isPlaying ? 'Oprește redarea' : 'Redă mesajul vocal'}
    >
      {isPlaying ? (
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
          <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 7.5A2.25 2.25 0 0 1 7.5 5.25h9a2.25 2.25 0 0 1 2.25 2.25v9a2.25 2.25 0 0 1-2.25 2.25h-9a2.25 2.25 0 0 1-2.25-2.25v-9Z" />
        </svg>
      ) : (
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.114 5.636a9 9 0 0 1 0 12.728M16.463 8.288a5.25 5.25 0 0 1 0 7.424M6.343 6.343l-.707-.707m13.728 0-.707.707M6.343 17.657l-.707.707m13.728-.707-.707-.707M9 9v.01M9 15v.01M12 12v.01M12 12v.01" />
        </svg>
      )}
    </button>
  );
}

















