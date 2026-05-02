"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";

// Debug system removed

interface VoiceSearchProps {
  onTranscript: (text: string) => void;
  onInterimTranscript?: (text: string) => void;
  onListeningChange?: (listening: boolean) => void;
  disabled?: boolean;
  className?: string;
  useWhisper?: boolean;
}

export default function VoiceSearch({
  onTranscript,
  onInterimTranscript,
  onListeningChange,
  disabled = false,
  className = "",
  useWhisper = true,
}: VoiceSearchProps) {
  const [isListening, setIsListening] = useState(false);
  const [isSupported, setIsSupported] = useState(false);
  const [mounted, setMounted] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<BlobPart[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const silenceTimerRef = useRef<number | null>(null);
  const userStoppedRef = useRef(false);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const rafRef = useRef<number | null>(null);
  const silenceStartRef = useRef<number | null>(null);
  
  // Web Speech API pentru transcriere live
  const recognitionRef = useRef<any>(null);
  const silenceTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const finalTranscriptRef = useRef<string>('');

  // MOUNT CHECK
  useEffect(() => {
    setMounted(true);
  }, []);

  // SUPPORT CHECK
  useEffect(() => {
    if (typeof window === "undefined") return;
    const supported = !!window.MediaRecorder && !!navigator.mediaDevices?.getUserMedia;
    setIsSupported(supported);
    
    // Verifică dacă Web Speech API este disponibil
    if (typeof window !== "undefined") {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRecognition) {
        recognitionRef.current = new SpeechRecognition();
        recognitionRef.current.continuous = true;
        recognitionRef.current.interimResults = true;
        recognitionRef.current.lang = 'ro-RO';
        
        recognitionRef.current.onresult = (event: any) => {
          let interimTranscript = '';
          let finalTranscript = '';
          
          for (let i = event.resultIndex; i < event.results.length; i++) {
            const transcript = event.results[i][0].transcript;
            if (event.results[i].isFinal) {
              finalTranscript += transcript + ' ';
              finalTranscriptRef.current += transcript + ' ';
            } else {
              interimTranscript += transcript;
            }
          }
          
          // Trimite transcrierea live (interim + final acumulat)
          const combinedTranscript = (finalTranscriptRef.current + interimTranscript).trim();
          if (combinedTranscript && onInterimTranscript) {
            onInterimTranscript(combinedTranscript);
          }
          
          // Dacă avem text final, resetăm timer-ul de liniște
          if (finalTranscript.trim()) {
            if (silenceTimeoutRef.current) {
              clearTimeout(silenceTimeoutRef.current);
            }
            // Setează timer pentru 2 secunde de liniște
            silenceTimeoutRef.current = setTimeout(() => {
              if (recognitionRef.current) {
                recognitionRef.current.stop();
              }
            }, 2000);
          }
        };
        
        recognitionRef.current.onend = () => {
          // Trimite transcrierea finală când se oprește
          if (finalTranscriptRef.current.trim()) {
            onTranscript(finalTranscriptRef.current.trim());
            finalTranscriptRef.current = '';
          }
          
          // Oprește complet înregistrarea
          setIsListening(false);
          onListeningChange?.(false);
        };
        
        recognitionRef.current.onerror = (event: any) => {
          if (event.error === 'no-speech') {
            // Dacă nu se detectează vorbire, oprește după 2 secunde
            if (silenceTimeoutRef.current) {
              clearTimeout(silenceTimeoutRef.current);
            }
            silenceTimeoutRef.current = setTimeout(() => {
              if (recognitionRef.current) {
                recognitionRef.current.stop();
              }
            }, 2000);
          }
        };
      }
    }
  }, [onInterimTranscript, onTranscript, onListeningChange]);

  // TRANSCRIBE
  const transcribeWithWhisper = useCallback(
    async (audioBlob: Blob) => {
      try {
        const formData = new FormData();
        formData.append("file", audioBlob, "recording.webm");
        const res = await fetch("/api/transcribe", { method: "POST", body: formData });
        const data = await res.json();
        const text = data?.text?.trim() || "";
        
        if (text) {
          onTranscript(text);
          if (typeof window !== "undefined") {
            window.dispatchEvent(
              new CustomEvent("voice-transcript-ready", { detail: { text } })
            );
            window.dispatchEvent(
              new CustomEvent("voice-search-complete", { detail: { text } })
            );
          }
        }
      } catch (err: any) {
        // Silent error handling
      }
    },
    [onTranscript]
  );

  // PAS 3: Detector tăcere cu AudioContext și analyser
  const startSilenceDetection = (stream: MediaStream) => {
    // Oprește detecția anterioară dacă există
    stopSilenceDetection();

    const audioContext = new AudioContext();
    const source = audioContext.createMediaStreamSource(stream);
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 512;
    source.connect(analyser);

    audioCtxRef.current = audioContext;
    analyserRef.current = analyser;

    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    let silenceTimer: NodeJS.Timeout | null = null;
    let lastVolumeLevel = 0;

    const checkSilence = () => {
      // Verifică dacă AudioContext este încă activ
      if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
        return;
      }

      analyser.getByteFrequencyData(dataArray);
      const avg = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;

      if (avg > 15) {
        // utilizatorul vorbește
        lastVolumeLevel = avg;
        if (silenceTimer) {
          clearTimeout(silenceTimer);
          silenceTimer = null;
        }
      } else {
        // liniște
        if (!silenceTimer) {
          silenceTimer = setTimeout(() => {
            stopWhisperRecording();
          }, 2000);
        }
      }

      rafRef.current = requestAnimationFrame(checkSilence);
    };

    checkSilence();
  };

  const stopSilenceDetection = () => {
    try {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }

      if (audioCtxRef.current) {
        if (audioCtxRef.current.state !== "closed") {
          audioCtxRef.current.close().catch(() => {});
        }
        audioCtxRef.current = null;
      }

      analyserRef.current = null;
      silenceStartRef.current = null;
    } catch (err: any) {
      // Silent error handling
    }
  };

  // START
  const startWhisperRecording = useCallback(async () => {
    try {
      userStoppedRef.current = false;
      audioChunksRef.current = [];
      finalTranscriptRef.current = '';

      // Încearcă să folosească Web Speech API pentru transcriere live
      if (recognitionRef.current) {
        try {
          recognitionRef.current.start();
          setIsListening(true);
          onListeningChange?.(true);
          
          // Pornește și MediaRecorder pentru backup/Whisper final
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          streamRef.current = stream;

          const mimeType =
            ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus"].find((t) =>
              MediaRecorder.isTypeSupported(t)
            ) || "audio/webm";

          const rec = new MediaRecorder(stream, { mimeType });
          mediaRecorderRef.current = rec;

          rec.ondataavailable = (e) => {
            if (e.data.size > 0) audioChunksRef.current.push(e.data);
          };

          rec.onstop = async () => {
            stopSilenceDetection();
            if (audioChunksRef.current.length > 0 && useWhisper) {
              const blob = new Blob(audioChunksRef.current, { type: mimeType });
              await transcribeWithWhisper(blob);
            }
            stream.getTracks().forEach((t) => t.stop());
            setIsListening(false);
            onListeningChange?.(false);
          };

          rec.start(250);
          startSilenceDetection(stream);
          return;
        } catch (err) {
          // Dacă Web Speech API eșuează, continuă cu Whisper
        }
      }

      // Fallback la Whisper dacă Web Speech API nu e disponibil
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const mimeType =
        ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus"].find((t) =>
          MediaRecorder.isTypeSupported(t)
        ) || "audio/webm";

      const rec = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = rec;

      rec.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      rec.onstop = async () => {
        stopSilenceDetection();
        if (audioChunksRef.current.length > 0) {
          const blob = new Blob(audioChunksRef.current, { type: mimeType });
          await transcribeWithWhisper(blob);
        }
        stream.getTracks().forEach((t) => t.stop());
        setIsListening(false);
        onListeningChange?.(false);
      };

      rec.start(250);
      startSilenceDetection(stream);
      setIsListening(true);
      onListeningChange?.(true);
    } catch (err: any) {
      // Silent error handling
    }
  }, [onListeningChange, onInterimTranscript, transcribeWithWhisper, useWhisper]);

  // STOP
  const stopWhisperRecording = useCallback(() => {
    userStoppedRef.current = true;
    stopSilenceDetection();
    
    // Oprește timer-ul de liniște
    if (silenceTimeoutRef.current) {
      clearTimeout(silenceTimeoutRef.current);
      silenceTimeoutRef.current = null;
    }
    
    // Oprește Web Speech API
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch (err) {
        // Silent error handling
      }
    }
    
    // Trimite transcrierea finală dacă există
    if (finalTranscriptRef.current.trim()) {
      onTranscript(finalTranscriptRef.current.trim());
      finalTranscriptRef.current = '';
    }
    
    // Oprește MediaRecorder
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
    
    setIsListening(false);
    onListeningChange?.(false);
  }, [onListeningChange, onTranscript]);

  const startListening = () => startWhisperRecording();
  const stopListening = () => stopWhisperRecording();

  // PAS 1: Expune funcțiile globale pentru UniversalHeader
  useEffect(() => {
    if (typeof window === "undefined" || !isSupported) return;

    (window as any).__voiceSearchTrigger = startListening;
    (window as any).__voiceSearchStop = stopListening;

    return () => {
      if (typeof window !== "undefined") {
        delete (window as any).__voiceSearchTrigger;
        delete (window as any).__voiceSearchStop;
      }
    };
  }, [isSupported]); // Doar isSupported ca dependență pentru a evita re-executări

  // CLEANUP
  useEffect(() => {
    return () => {
      stopSilenceDetection();
      if (silenceTimeoutRef.current) {
        clearTimeout(silenceTimeoutRef.current);
      }
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch {}
      }
      try {
        mediaRecorderRef.current?.state !== "inactive" && mediaRecorderRef.current?.stop();
      } catch {}
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  if (!mounted || !isSupported) return null;

  return (
    <>
      <button
        type="button"
        onClick={isListening ? stopListening : startListening}
        disabled={disabled}
        className={`rounded-full relative flex items-center justify-center transition-all ${
          isListening ? "text-red-400 animate-pulse" : "text-gray-300 hover:text-white"
        } ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"} ${className}`}
        title={isListening ? "Oprește înregistrarea" : "Pornește căutarea vocală"}
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-6 h-6">
          {isListening ? (
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
          ) : (
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 0 0 6-6v-1.5m-6 7.5a6 6 0 0 1-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 0 1-3-3V4.5a3 3 0 1 1 6 0v8.25a3 3 0 0 1-3 3Z" />
          )}
        </svg>
        {isListening && <span className="absolute inset-0 rounded-full bg-red-400 opacity-20 animate-ping"></span>}
      </button>
    </>
  );
}
