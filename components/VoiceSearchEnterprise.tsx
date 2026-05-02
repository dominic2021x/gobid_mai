"use client";

import React, { useState, useRef, useEffect } from 'react';
import { MicrophoneIcon } from '@heroicons/react/24/solid';

interface VoiceSearchEnterpriseProps {
  onTranscript: (text: string) => void;
  onListeningChange?: (listening: boolean) => void;
  disabled?: boolean;
  className?: string;
}

export default function VoiceSearchEnterprise({
  onTranscript,
  onListeningChange,
  disabled = false,
  className = '',
}: VoiceSearchEnterpriseProps) {
  const [isListening, setIsListening] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    return () => {
      // Cleanup on unmount
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  const startRecording = async () => {
    try {
      setError(null);
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm;codecs=opus',
      });

      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        setIsProcessing(true);
        
        try {
          // Creează fișierul audio
          const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
          
          // Trimite la API pentru transcriere cu Whisper
          const formData = new FormData();
          formData.append('audio', audioBlob, 'recording.webm');

          const response = await fetch('/api/voice-search', {
            method: 'POST',
            body: formData,
          });

          if (!response.ok) {
            throw new Error('Failed to transcribe audio');
          }

          const data = await response.json();
          
          if (data.corrected && data.corrected.trim()) {
            onTranscript(data.corrected);
          } else if (data.transcribed && data.transcribed.trim()) {
            onTranscript(data.transcribed);
          } else {
            setError('Nu s-a detectat vorbire');
          }
        } catch (err: any) {
          console.error('Voice search error:', err);
          setError(err.message || 'Eroare la procesarea vocală');
        } finally {
          setIsProcessing(false);
          setIsListening(false);
          onListeningChange?.(false);
          
          // Stop stream
          if (streamRef.current) {
            streamRef.current.getTracks().forEach(track => track.stop());
            streamRef.current = null;
          }
        }
      };

      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.start();
      setIsListening(true);
      onListeningChange?.(true);
    } catch (err: any) {
      console.error('Error starting recording:', err);
      setError('Nu se poate accesa microfonul');
      setIsListening(false);
      onListeningChange?.(false);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
  };

  const toggleRecording = () => {
    if (isListening) {
      stopRecording();
    } else if (!isProcessing && !disabled) {
      startRecording();
    }
  };

  return (
    <div className={`relative ${className}`}>
      <button
        onClick={toggleRecording}
        disabled={disabled || isProcessing}
        className={`
          relative w-12 h-12 rounded-full flex items-center justify-center
          transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-offset-2
          ${
            isListening
              ? 'bg-red-500 hover:bg-red-600 focus:ring-red-500 animate-pulse'
              : isProcessing
              ? 'bg-gray-400 cursor-not-allowed'
              : 'bg-blue-600 hover:bg-blue-700 focus:ring-blue-500'
          }
          ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
        `}
        title={isListening ? 'Oprește înregistrarea' : 'Începe căutare vocală'}
      >
        <MicrophoneIcon
          className={`w-6 h-6 text-white ${
            isListening ? 'animate-bounce' : ''
          }`}
        />
        
        {/* Animation ring when listening */}
        {isListening && (
          <span className="absolute inset-0 rounded-full border-2 border-red-400 animate-ping opacity-75"></span>
        )}
      </button>

      {/* Error message */}
      {error && (
        <div className="absolute top-full left-0 mt-2 px-3 py-2 bg-red-100 text-red-700 rounded-lg text-sm whitespace-nowrap z-50">
          {error}
        </div>
      )}

      {/* Processing indicator */}
      {isProcessing && (
        <div className="absolute top-full left-0 mt-2 px-3 py-2 bg-blue-100 text-blue-700 rounded-lg text-sm whitespace-nowrap z-50">
          Procesare audio...
        </div>
      )}
    </div>
  );
}

