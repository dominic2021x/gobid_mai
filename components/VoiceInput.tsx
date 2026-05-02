/**
 * Voice Input Component - Speech-to-Text cu Whisper API
 * Înregistrează audio și transcrie folosind OpenAI Whisper
 */

"use client";

import { useState, useRef, useEffect } from 'react';
import { MicrophoneIcon } from '@heroicons/react/24/solid';

interface VoiceInputProps {
  onTranscription: (text: string) => void;
  onStop: () => void;
}

export default function VoiceInput({ onTranscription, onStop }: VoiceInputProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [error, setError] = useState<string | null>(null);
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Start recording
  const startRecording = async () => {
    try {
      setError(null);
      
      // Request microphone access
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      // Create MediaRecorder
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm;codecs=opus'
      });
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        // Stop all tracks
        streamRef.current?.getTracks().forEach(track => track.stop());

        // Combine audio chunks
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        
        // Transcribe audio
        await transcribeAudio(audioBlob);
      };

      mediaRecorder.start();
      setIsRecording(true);
      setRecordingTime(0);

      // Start timer
      timerRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);
    } catch (err: any) {
      console.error('Error starting recording:', err);
      setError('Nu s-a putut accesa microfonul. Verificați permisiunile.');
      setIsRecording(false);
    }
  };

  // Stop recording
  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
  };

  // Transcribe audio using Whisper API
  const transcribeAudio = async (audioBlob: Blob) => {
    try {
      setError(null);
      
      const formData = new FormData();
      formData.append('audio', audioBlob, 'recording.webm');

      const response = await fetch('/api/voice-search', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error('Transcriere eșuată');
      }

      const data = await response.json();
      
      if (data.text) {
        onTranscription(data.text);
      } else {
        throw new Error('Nu s-a detectat niciun text');
      }
    } catch (err: any) {
      console.error('Transcription error:', err);
      setError('Eroare la transcriere. Încercați din nou.');
    }
  };

  // Auto-stop la 60 secunde
  useEffect(() => {
    if (recordingTime >= 60) {
      stopRecording();
    }
  }, [recordingTime]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (mediaRecorderRef.current && isRecording) {
        mediaRecorderRef.current.stop();
      }
      streamRef.current?.getTracks().forEach(track => track.stop());
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [isRecording]);

  // Auto-start recording on mount
  useEffect(() => {
    startRecording();
  }, []);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="flex flex-col items-center gap-2 p-3 bg-gray-100 rounded-lg">
      <div className="flex items-center gap-3">
        <button
          onClick={isRecording ? stopRecording : startRecording}
          className={`w-12 h-12 rounded-full flex items-center justify-center transition-all ${
            isRecording
              ? 'bg-red-500 hover:bg-red-600 animate-pulse'
              : 'bg-[#25D366] hover:bg-[#20BA5A]'
          } text-white shadow-lg`}
          aria-label={isRecording ? 'Oprește înregistrarea' : 'Începe înregistrarea'}
        >
          <MicrophoneIcon className="w-6 h-6" />
        </button>
        
        <div className="flex flex-col">
          <span className="text-sm font-medium text-gray-700">
            {isRecording ? 'Înregistrare...' : 'Gata'}
          </span>
          {isRecording && (
            <span className="text-xs text-gray-500">{formatTime(recordingTime)}</span>
          )}
        </div>
      </div>

      {error && (
        <p className="text-xs text-red-600 text-center">{error}</p>
      )}

      <button
        onClick={onStop}
        className="text-xs text-gray-500 hover:text-gray-700 underline"
      >
        Anulează
      </button>
    </div>
  );
}

